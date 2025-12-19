import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppConfig } from "../config";
import { requireAdmin, type AdminAuthConfig } from "../authz";
import { fail, ok } from "../http";
import type { PgPool } from "../postgres";
import { queryOne, withPgClient } from "../postgres";

const deviceIdSchema = z.string().uuid();
const eventIdSchema = z.string().uuid();

const listEventsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(20),
  startTime: z.string().datetime().optional(),
  endTime: z.string().datetime().optional(),
  commandId: z.string().uuid().optional(),
  eventType: z
    .enum(["COMMAND_SENT", "COMMAND_ACKED", "COMMAND_FAILED", "COMMAND_TIMEOUT"])
    .optional()
});

const eventStatsQuerySchema = z.object({
  startTime: z.string().datetime().optional(),
  endTime: z.string().datetime().optional(),
  eventType: z.enum(["COMMAND_SENT", "COMMAND_ACKED", "COMMAND_FAILED", "COMMAND_TIMEOUT"]).optional(),
  bucket: z.enum(["1h", "1d"]).optional()
});

type CommandEventRow = {
  event_id: string;
  event_type: string;
  command_id: string;
  device_id: string;
  status: string;
  detail: string | null;
  result: unknown;
  created_at: string;
  ingested_at: string;
};

export function registerCommandEventRoutes(
  app: FastifyInstance,
  config: AppConfig,
  pg: PgPool | null
): void {
  const adminCfg: AdminAuthConfig = { adminApiToken: config.adminApiToken };
  // NOTE: We keep command events under /devices/{deviceId}/... to align with device ops workflows.

  app.get("/devices/:deviceId/command-events", async (request, reply) => {
    const traceId = request.traceId;
    if (!requireAdmin(adminCfg, request, reply)) return;
    if (!pg) {
      fail(reply, 503, "PostgreSQL 未配置", traceId);
      return;
    }

    const parseId = deviceIdSchema.safeParse((request.params as { deviceId?: unknown }).deviceId);
    if (!parseId.success) {
      fail(reply, 400, "参数错误", traceId, { field: "deviceId" });
      return;
    }
    const deviceId = parseId.data;

    const parseQuery = listEventsQuerySchema.safeParse(request.query);
    if (!parseQuery.success) {
      fail(reply, 400, "参数错误", traceId, { field: "query", issues: parseQuery.error.issues });
      return;
    }
    const { page, pageSize, startTime, endTime, commandId, eventType } = parseQuery.data;

    if ((startTime && !endTime) || (!startTime && endTime)) {
      fail(reply, 400, "参数错误", traceId, { field: "timeRange" });
      return;
    }
    const start = startTime ? new Date(startTime) : null;
    const end = endTime ? new Date(endTime) : null;
    if (start && end && !(start < end)) {
      fail(reply, 400, "参数错误", traceId, { field: "timeRange" });
      return;
    }

    const where: string[] = ["device_id = $1"];
    const params: unknown[] = [deviceId];
    if (start && end) {
      params.push(start);
      where.push("created_at >= $" + String(params.length) + "::timestamptz");
      params.push(end);
      where.push("created_at <= $" + String(params.length) + "::timestamptz");
    }
    if (commandId) {
      params.push(commandId);
      where.push("command_id = $" + String(params.length));
    }
    if (eventType) {
      params.push(eventType);
      where.push("event_type = $" + String(params.length));
    }

    const whereSql = `WHERE ${where.join(" AND ")}`;
    const offset = (page - 1) * pageSize;

    const data = await withPgClient(pg, async (client) => {
      const exists = await queryOne<{ ok: boolean }>(
        client,
        "SELECT TRUE AS ok FROM devices WHERE device_id=$1",
        [deviceId]
      );
      if (!exists) return null;

      const totalRow = await queryOne<{ total: string }>(
        client,
        `SELECT count(*)::text AS total FROM device_command_events ${whereSql}`,
        params
      );
      const total = Number(totalRow?.total ?? "0");

      const res = await client.query<CommandEventRow>(
        `
          SELECT
            event_id,
            event_type,
            command_id,
            device_id,
            status,
            detail,
            result,
            to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
            to_char(ingested_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS ingested_at
          FROM device_command_events
          ${whereSql}
          ORDER BY created_at DESC
          LIMIT $${String(params.length + 1)}
          OFFSET $${String(params.length + 2)}
        `,
        params.concat([pageSize, offset])
      );

      return { total, list: res.rows };
    });

    if (!data) {
      fail(reply, 404, "资源不存在", traceId, { deviceId });
      return;
    }

    ok(
      reply,
      {
        list: data.list.map((e) => ({
          eventId: e.event_id,
          eventType: e.event_type,
          commandId: e.command_id,
          deviceId: e.device_id,
          status: e.status,
          detail: e.detail ?? "",
          result: e.result ?? {},
          createdAt: e.created_at,
          ingestedAt: e.ingested_at
        })),
        pagination: {
          page,
          pageSize,
          total: data.total,
          totalPages: Math.max(1, Math.ceil(data.total / pageSize))
        }
      },
      traceId
    );
  });

  app.get("/devices/:deviceId/command-events/stats", async (request, reply) => {
    const traceId = request.traceId;
    if (!requireAdmin(adminCfg, request, reply)) return;
    if (!pg) {
      fail(reply, 503, "PostgreSQL 未配置", traceId);
      return;
    }

    const parseId = deviceIdSchema.safeParse((request.params as { deviceId?: unknown }).deviceId);
    if (!parseId.success) {
      fail(reply, 400, "参数错误", traceId, { field: "deviceId" });
      return;
    }
    const deviceId = parseId.data;

    const parseQuery = eventStatsQuerySchema.safeParse(request.query);
    if (!parseQuery.success) {
      fail(reply, 400, "参数错误", traceId, { field: "query", issues: parseQuery.error.issues });
      return;
    }

    const { startTime, endTime, eventType, bucket } = parseQuery.data;
    if ((startTime && !endTime) || (!startTime && endTime)) {
      fail(reply, 400, "参数错误", traceId, { field: "timeRange" });
      return;
    }
    if (bucket && !(startTime && endTime)) {
      fail(reply, 400, "参数错误", traceId, { field: "bucket", reason: "bucket requires startTime + endTime" });
      return;
    }

    const start = startTime ? new Date(startTime) : null;
    const end = endTime ? new Date(endTime) : null;
    if (start && end && !(start < end)) {
      fail(reply, 400, "参数错误", traceId, { field: "timeRange" });
      return;
    }

    if (bucket && start && end) {
      const bucketMs = bucket === "1h" ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
      const maxBuckets = 1000;
      const buckets = Math.ceil((end.getTime() - start.getTime()) / bucketMs);
      if (buckets > maxBuckets) {
        fail(reply, 400, "参数错误", traceId, { field: "bucket", reason: "time range too large" });
        return;
      }
    }

    const where: string[] = ["device_id = $1"];
    const params: unknown[] = [deviceId];
    if (start && end) {
      params.push(start);
      where.push("created_at >= $" + String(params.length) + "::timestamptz");
      params.push(end);
      where.push("created_at <= $" + String(params.length) + "::timestamptz");
    }
    if (eventType) {
      params.push(eventType);
      where.push("event_type = $" + String(params.length));
    }

    const whereSql = `WHERE ${where.join(" AND ")}`;

    const data = await withPgClient(pg, async (client) => {
      const exists = await queryOne<{ ok: boolean }>(
        client,
        "SELECT TRUE AS ok FROM devices WHERE device_id=$1",
        [deviceId]
      );
      if (!exists) return null;

      const totalRow = await queryOne<{ total: string }>(
        client,
        `SELECT count(*)::text AS total FROM device_command_events ${whereSql}`,
        params
      );
      const total = Number(totalRow?.total ?? "0");

      const eventTypeRows = await client.query<{ event_type: string; count: string }>(
        `
          SELECT event_type, count(*)::text AS count
          FROM device_command_events
          ${whereSql}
          GROUP BY event_type
          ORDER BY event_type
        `,
        params
      );

      const bucketRows =
        bucket && start && end
          ? await client.query<{ bucket_start: string; total: string }>(
              `
                SELECT
                  to_char(date_trunc('${bucket === "1h" ? "hour" : "day"}', created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS bucket_start,
                  count(*)::text AS total
                FROM device_command_events
                ${whereSql}
                GROUP BY 1
                ORDER BY 1
              `,
              params
            )
          : null;

      return {
        total,
        byEventType: eventTypeRows.rows.map((r) => ({ eventType: r.event_type, count: Number(r.count) })),
        byBucket:
          bucketRows?.rows.map((r) => ({ bucketStartTime: r.bucket_start, total: Number(r.total) })) ?? []
      };
    });

    if (!data) {
      fail(reply, 404, "资源不存在", traceId, { deviceId });
      return;
    }

    ok(
      reply,
      {
        deviceId,
        window: startTime && endTime ? { startTime, endTime } : null,
        eventType: eventType ?? "",
        bucket: bucket ?? "",
        totals: { total: data.total },
        byEventType: data.byEventType,
        byBucket: data.byBucket
      },
      traceId
    );
  });

  app.get("/devices/:deviceId/command-events/:eventId", async (request, reply) => {
    const traceId = request.traceId;
    if (!requireAdmin(adminCfg, request, reply)) return;
    if (!pg) {
      fail(reply, 503, "PostgreSQL 未配置", traceId);
      return;
    }

    const parseId = deviceIdSchema.safeParse((request.params as { deviceId?: unknown }).deviceId);
    if (!parseId.success) {
      fail(reply, 400, "参数错误", traceId, { field: "deviceId" });
      return;
    }
    const deviceId = parseId.data;

    const parseEventId = eventIdSchema.safeParse((request.params as { eventId?: unknown }).eventId);
    if (!parseEventId.success) {
      fail(reply, 400, "参数错误", traceId, { field: "eventId" });
      return;
    }
    const eventId = parseEventId.data;

    const row = await withPgClient(pg, async (client) =>
      queryOne<CommandEventRow>(
        client,
        `
          SELECT
            event_id,
            event_type,
            command_id,
            device_id,
            status,
            detail,
            result,
            to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
            to_char(ingested_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS ingested_at
          FROM device_command_events
          WHERE device_id = $1 AND event_id = $2
        `,
        [deviceId, eventId]
      )
    );

    if (!row) {
      fail(reply, 404, "资源不存在", traceId, { deviceId, eventId });
      return;
    }

    ok(
      reply,
      {
        eventId: row.event_id,
        eventType: row.event_type,
        commandId: row.command_id,
        deviceId: row.device_id,
        status: row.status,
        detail: row.detail ?? "",
        result: row.result ?? {},
        createdAt: row.created_at,
        ingestedAt: row.ingested_at
      },
      traceId
    );
  });
}
