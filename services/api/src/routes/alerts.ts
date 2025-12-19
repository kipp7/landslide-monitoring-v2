import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AppConfig } from "../config";
import { requireAdmin, type AdminAuthConfig } from "../authz";
import { fail, ok } from "../http";
import type { PgPool } from "../postgres";
import { queryOne, withPgClient } from "../postgres";

const alertIdSchema = z.string().uuid();

const listAlertsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(20),
  deviceId: z.string().uuid().optional(),
  stationId: z.string().uuid().optional(),
  severity: z.enum(["low", "medium", "high", "critical"]).optional(),
  status: z.enum(["active", "acked", "resolved"]).optional(),
  startTime: z.string().datetime().optional(),
  endTime: z.string().datetime().optional()
});

const alertActionRequestSchema = z
  .object({
    notes: z.string().max(2000).optional()
  })
  .strict();

type AlertAggRow = {
  alert_id: string;
  status: "active" | "acked" | "resolved";
  severity: "low" | "medium" | "high" | "critical";
  title: string | null;
  device_id: string | null;
  station_id: string | null;
  rule_id: string | null;
  rule_version: number | null;
  last_event_at: string;
};

type AlertEventRow = {
  event_id: string;
  alert_id: string;
  event_type: "ALERT_TRIGGER" | "ALERT_UPDATE" | "ALERT_RESOLVE" | "ALERT_ACK";
  severity: "low" | "medium" | "high" | "critical";
  rule_id: string | null;
  rule_version: number | null;
  device_id: string | null;
  station_id: string | null;
  evidence: unknown;
  created_at: string;
};

export function registerAlertRoutes(app: FastifyInstance, config: AppConfig, pg: PgPool | null): void {
  const adminCfg: AdminAuthConfig = { adminApiToken: config.adminApiToken };

  app.get("/alerts", async (request, reply) => {
    const traceId = request.traceId;
    if (!requireAdmin(adminCfg, request, reply)) return;
    if (!pg) {
      fail(reply, 503, "PostgreSQL 未配置", traceId);
      return;
    }

    const parseQuery = listAlertsQuerySchema.safeParse(request.query);
    if (!parseQuery.success) {
      fail(reply, 400, "参数错误", traceId, { field: "query", issues: parseQuery.error.issues });
      return;
    }
    const { page, pageSize, deviceId, stationId, severity, status, startTime, endTime } = parseQuery.data;

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

    const where: string[] = [];
    const params: unknown[] = [];

    if (deviceId) {
      params.push(deviceId);
      where.push("a.device_id = $" + String(params.length));
    }
    if (stationId) {
      params.push(stationId);
      where.push("a.station_id = $" + String(params.length));
    }
    if (severity) {
      params.push(severity);
      where.push("a.severity = $" + String(params.length));
    }
    if (status) {
      params.push(status);
      where.push("a.status = $" + String(params.length));
    }
    if (start && end) {
      params.push(start);
      where.push("a.last_event_at >= $" + String(params.length) + "::timestamptz");
      params.push(end);
      where.push("a.last_event_at <= $" + String(params.length) + "::timestamptz");
    }

    const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
    const offset = (page - 1) * pageSize;

    const data = await withPgClient(pg, async (client) => {
      const totalRow = await queryOne<{ total: string }>(
        client,
        `
          WITH latest AS (
            SELECT DISTINCT ON (alert_id)
              alert_id,
              event_type,
              severity,
              title,
              device_id,
              station_id,
              rule_id,
              rule_version,
              created_at AS last_event_at
            FROM alert_events
            ORDER BY alert_id, created_at DESC
          ),
          a AS (
            SELECT
              alert_id,
              CASE
                WHEN event_type IN ('ALERT_TRIGGER','ALERT_UPDATE') THEN 'active'
                WHEN event_type = 'ALERT_ACK' THEN 'acked'
                ELSE 'resolved'
              END AS status,
              severity,
              title,
              device_id,
              station_id,
              rule_id,
              rule_version,
              last_event_at
            FROM latest
          )
          SELECT count(*)::text AS total FROM a
          ${whereSql}
        `,
        params
      );
      const total = Number(totalRow?.total ?? "0");

      const rows = await client.query<AlertAggRow>(
        `
          WITH latest AS (
            SELECT DISTINCT ON (alert_id)
              alert_id,
              event_type,
              severity,
              title,
              device_id,
              station_id,
              rule_id,
              rule_version,
              created_at AS last_event_at
            FROM alert_events
            ORDER BY alert_id, created_at DESC
          ),
          a AS (
            SELECT
              alert_id,
              CASE
                WHEN event_type IN ('ALERT_TRIGGER','ALERT_UPDATE') THEN 'active'
                WHEN event_type = 'ALERT_ACK' THEN 'acked'
                ELSE 'resolved'
              END AS status,
              severity,
              title,
              device_id,
              station_id,
              rule_id,
              rule_version,
              to_char(last_event_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS last_event_at
            FROM latest
          )
          SELECT * FROM a
          ${whereSql}
          ORDER BY last_event_at DESC
          LIMIT $${String(params.length + 1)}
          OFFSET $${String(params.length + 2)}
        `,
        params.concat([pageSize, offset])
      );

      const summary = await client.query<{
        status: string;
        severity: string;
        count: string;
      }>(
        `
          WITH latest AS (
            SELECT DISTINCT ON (alert_id)
              alert_id,
              event_type,
              severity,
              created_at AS last_event_at
            FROM alert_events
            ORDER BY alert_id, created_at DESC
          ),
          a AS (
            SELECT
              alert_id,
              CASE
                WHEN event_type IN ('ALERT_TRIGGER','ALERT_UPDATE') THEN 'active'
                WHEN event_type = 'ALERT_ACK' THEN 'acked'
                ELSE 'resolved'
              END AS status,
              severity,
              last_event_at
            FROM latest
          )
          SELECT status, severity, count(*)::text AS count
          FROM a
          ${whereSql}
          GROUP BY status, severity
        `,
        params
      );

      const s = {
        active: 0,
        acked: 0,
        resolved: 0,
        high: 0,
        critical: 0
      };
      for (const r of summary.rows) {
        const c = Number(r.count);
        if (r.status === "active") s.active += c;
        if (r.status === "acked") s.acked += c;
        if (r.status === "resolved") s.resolved += c;
        if (r.severity === "high") s.high += c;
        if (r.severity === "critical") s.critical += c;
      }

      return { total, list: rows.rows, summary: s };
    });

    ok(
      reply,
      {
        list: data.list.map((a) => ({
          alertId: a.alert_id,
          status: a.status,
          severity: a.severity,
          title: a.title ?? "",
          deviceId: a.device_id,
          stationId: a.station_id,
          ruleId: a.rule_id ?? "",
          ruleVersion: a.rule_version ?? 0,
          lastEventAt: a.last_event_at
        })),
        pagination: {
          page,
          pageSize,
          total: data.total,
          totalPages: Math.max(1, Math.ceil(data.total / pageSize))
        },
        summary: data.summary
      },
      traceId
    );
  });

  app.get("/alerts/:alertId/events", async (request, reply) => {
    const traceId = request.traceId;
    if (!requireAdmin(adminCfg, request, reply)) return;
    if (!pg) {
      fail(reply, 503, "PostgreSQL 未配置", traceId);
      return;
    }

    const parseId = alertIdSchema.safeParse((request.params as { alertId?: unknown }).alertId);
    if (!parseId.success) {
      fail(reply, 400, "参数错误", traceId, { field: "alertId" });
      return;
    }
    const alertId = parseId.data;

    const data = await withPgClient(pg, async (client) => {
      const exists = await queryOne<{ ok: boolean }>(
        client,
        "SELECT TRUE AS ok FROM alert_events WHERE alert_id=$1 LIMIT 1",
        [alertId]
      );
      if (!exists) return null;

      const res = await client.query<AlertEventRow>(
        `
          SELECT
            event_id,
            alert_id,
            event_type,
            severity,
            rule_id,
            rule_version,
            device_id,
            station_id,
            evidence,
            to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at
          FROM alert_events
          WHERE alert_id = $1
          ORDER BY created_at ASC
        `,
        [alertId]
      );

      return res.rows;
    });

    if (!data) {
      fail(reply, 404, "资源不存在", traceId, { alertId });
      return;
    }

    ok(
      reply,
      {
        alertId,
        events: data.map((e) => ({
          eventId: e.event_id,
          eventType: e.event_type,
          severity: e.severity,
          createdAt: e.created_at,
          ruleId: e.rule_id ?? "",
          ruleVersion: e.rule_version ?? 0,
          deviceId: e.device_id,
          stationId: e.station_id,
          evidence: e.evidence ?? {}
        }))
      },
      traceId
    );
  });

  const actionHandler = (eventType: "ALERT_ACK" | "ALERT_RESOLVE") => {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      const traceId = request.traceId;
      if (!requireAdmin(adminCfg, request, reply)) return;
      if (!pg) {
        fail(reply, 503, "PostgreSQL 未配置", traceId);
        return;
      }

      const parseId = alertIdSchema.safeParse((request.params as { alertId?: unknown }).alertId);
      if (!parseId.success) {
        fail(reply, 400, "参数错误", traceId, { field: "alertId" });
        return;
      }
      const alertId = parseId.data;

      const parseBody = request.body
        ? alertActionRequestSchema.safeParse(request.body)
        : { success: true as const, data: {} };
      if (!parseBody.success) {
        fail(reply, 400, "参数错误", traceId, { field: "body", issues: parseBody.error.issues });
        return;
      }
      const notes = (parseBody.data as { notes?: string }).notes ?? "";

      const data = await withPgClient(pg, async (client) => {
        const latest = await queryOne<{
          rule_id: string | null;
          rule_version: number | null;
          device_id: string | null;
          station_id: string | null;
          severity: "low" | "medium" | "high" | "critical";
          title: string | null;
          message: string | null;
        }>(
          client,
          `
            SELECT rule_id, rule_version, device_id, station_id, severity, title, message
            FROM alert_events
            WHERE alert_id = $1
            ORDER BY created_at DESC
            LIMIT 1
          `,
          [alertId]
        );
        if (!latest) return null;

        const inserted = await queryOne<{ event_id: string; created_at: string }>(
          client,
          `
            INSERT INTO alert_events(
              alert_id, event_type, rule_id, rule_version, device_id, station_id,
              severity, title, message, evidence, explain, created_at
            )
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,NOW())
            RETURNING
              event_id,
              to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at
          `,
          [
            alertId,
            eventType,
            latest.rule_id,
            latest.rule_version,
            latest.device_id,
            latest.station_id,
            latest.severity,
            latest.title ?? "",
            latest.message ?? "",
            JSON.stringify(notes ? { notes } : {}),
            notes ? `manual ${eventType.toLowerCase()} (${notes})` : `manual ${eventType.toLowerCase()}`
          ]
        );
        if (!inserted) {
          throw new Error("insert alert action event failed (no row returned)");
        }

        return { inserted };
      });

      if (!data) {
        fail(reply, 404, "资源不存在", traceId, { alertId });
        return;
      }

      ok(
        reply,
        {
          alertId,
          eventId: data.inserted.event_id,
          eventType,
          createdAt: data.inserted.created_at
        },
        traceId
      );
    };
  };

  app.post("/alerts/:alertId/ack", actionHandler("ALERT_ACK"));
  app.post("/alerts/:alertId/resolve", actionHandler("ALERT_RESOLVE"));
}
