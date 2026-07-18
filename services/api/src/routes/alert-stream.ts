import type { ServerResponse } from "node:http";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppConfig } from "../config";
import { requirePermission, type AdminAuthConfig } from "../authz";
import { fail } from "../http";
import type { PgPool } from "../postgres";
import { queryOne, withPgClient } from "../postgres";

const eventIdSchema = z.string().uuid();
const ZERO_UUID = "00000000-0000-0000-0000-000000000000";
const ALERT_POLL_MS = 2_000;
const HEARTBEAT_MS = 20_000;

type AlertCursor = {
  created_at: Date;
  event_id: string;
};

type AlertStreamRow = {
  event_id: string;
  alert_id: string;
  event_type: "ALERT_TRIGGER" | "ALERT_UPDATE" | "ALERT_RESOLVE" | "ALERT_ACK";
  severity: "low" | "medium" | "high" | "critical";
  title: string | null;
  message: string | null;
  device_id: string | null;
  station_id: string | null;
  evidence: unknown;
  created_at: Date;
};

function writeSse(
  stream: ServerResponse,
  event: string,
  data: Record<string, unknown>,
  id?: string
): void {
  if (id) stream.write(`id: ${id}\n`);
  stream.write(`event: ${event}\n`);
  stream.write(`data: ${JSON.stringify(data)}\n\n`);
}

async function initialCursor(pg: PgPool, lastEventId: string | undefined): Promise<AlertCursor> {
  return withPgClient(pg, async (client) => {
    if (lastEventId && eventIdSchema.safeParse(lastEventId).success) {
      const existing = await queryOne<AlertCursor>(
        client,
        "SELECT created_at, event_id FROM alert_events WHERE event_id = $1::uuid",
        [lastEventId]
      );
      if (existing) return existing;
    }

    const now = await queryOne<{ created_at: Date }>(client, "SELECT NOW() AS created_at");
    return { created_at: now?.created_at ?? new Date(), event_id: ZERO_UUID };
  });
}

async function eventsAfter(pg: PgPool, cursor: AlertCursor): Promise<AlertStreamRow[]> {
  return withPgClient(pg, async (client) => {
    const result = await client.query<AlertStreamRow>(
      `
        SELECT
          event_id,
          alert_id,
          event_type,
          severity,
          title,
          message,
          device_id,
          station_id,
          evidence,
          created_at
        FROM alert_events
        WHERE (created_at, event_id) > ($1::timestamptz, $2::uuid)
        ORDER BY created_at ASC, event_id ASC
        LIMIT 100
      `,
      [cursor.created_at, cursor.event_id]
    );
    return result.rows;
  });
}

export function registerAlertStreamRoutes(app: FastifyInstance, config: AppConfig, pg: PgPool | null): void {
  const adminCfg: AdminAuthConfig = {
    adminApiToken: config.adminApiToken,
    jwtEnabled: Boolean(config.jwtAccessSecret)
  };

  app.get("/alerts/stream", async (request, reply) => {
    const traceId = request.traceId;
    if (!(await requirePermission(adminCfg, pg, request, reply, "alert:view"))) return;
    if (!pg) {
      fail(reply, 503, "PostgreSQL 未配置", traceId);
      return;
    }

    const header = request.headers["last-event-id"];
    const lastEventId = typeof header === "string" ? header.trim() : undefined;
    let cursor = await initialCursor(pg, lastEventId);

    reply.header("Content-Type", "text/event-stream; charset=utf-8");
    reply.header("Cache-Control", "no-cache, no-transform");
    reply.header("Connection", "keep-alive");
    reply.header("X-Accel-Buffering", "no");
    reply.hijack();
    request.raw.setTimeout(0);

    const stream = reply.raw;
    stream.write("retry: 3000\n\n");
    writeSse(stream, "connection", {
      type: "connection",
      timestamp: new Date().toISOString(),
      traceId
    });

    let closed = false;
    let polling = false;
    const cleanup = () => {
      closed = true;
      clearInterval(poller);
      clearInterval(heartbeat);
    };

    const poll = async () => {
      if (closed || polling) return;
      polling = true;
      try {
        const rows = await eventsAfter(pg, cursor);
        for (const row of rows) {
          if (stream.destroyed) return;
          writeSse(
            stream,
            "alert",
            {
              type: "alert",
              eventId: row.event_id,
              alertId: row.alert_id,
              eventType: row.event_type,
              severity: row.severity,
              title: row.title ?? "",
              message: row.message ?? "",
              deviceId: row.device_id,
              stationId: row.station_id,
              evidence: row.evidence ?? {},
              createdAt: row.created_at.toISOString()
            },
            row.event_id
          );
          cursor = { created_at: row.created_at, event_id: row.event_id };
        }
      } catch (error) {
        request.log.warn({ err: error, traceId }, "alert SSE poll failed");
      } finally {
        polling = false;
      }
    };

    const poller = setInterval(() => void poll(), ALERT_POLL_MS);
    const heartbeat = setInterval(() => {
      if (closed) return;
      writeSse(stream, "heartbeat", {
        type: "heartbeat",
        timestamp: new Date().toISOString()
      });
    }, HEARTBEAT_MS);

    stream.on("close", cleanup);
    stream.on("error", cleanup);
    request.raw.on("close", cleanup);
  });
}
