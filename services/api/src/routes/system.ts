import type { ClickHouseClient } from "@clickhouse/client";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppConfig } from "../config";
import { requirePermission, type AdminAuthConfig } from "../authz";
import { fail, ok } from "../http";
import type { PgPool } from "../postgres";
import { queryOne, withPgClient } from "../postgres";

async function checkClickhouse(ch: ClickHouseClient): Promise<{ status: string; error?: string }> {
  try {
    const res = await ch.query({ query: "SELECT 1 AS ok", format: "JSONEachRow" });
    await res.json();
    return { status: "healthy" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { status: "unhealthy", error: msg };
  }
}

async function checkPostgres(pg: PgPool | null): Promise<{ status: string; error?: string }> {
  if (!pg) return { status: "not_configured" };
  try {
    const okRow = await withPgClient(pg, async (client) => queryOne<{ ok: number }>(client, "SELECT 1 AS ok", []));
    return okRow ? { status: "healthy" } : { status: "unhealthy", error: "no row returned" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { status: "unhealthy", error: msg };
  }
}

function utcStartOfDay(d: Date): Date {
  const x = new Date(d.getTime());
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

function toClickhouseDateTime64Utc(d: Date): string {
  return d.toISOString().replace("T", " ").replace("Z", "");
}

const updateConfigsSchema = z
  .object({
    configs: z.array(z.object({ key: z.string().min(1), value: z.string() }).strict()).min(1)
  })
  .strict();

const operationLogsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(20),
  userId: z.string().uuid().optional(),
  module: z.string().optional(),
  action: z.string().optional(),
  startTime: z.string().datetime().optional(),
  endTime: z.string().datetime().optional()
});

export function registerSystemRoutes(
  app: FastifyInstance,
  config: AppConfig,
  ch: ClickHouseClient,
  pg: PgPool | null
): void {
  const adminCfg: AdminAuthConfig = { adminApiToken: config.adminApiToken, jwtEnabled: Boolean(config.jwtAccessSecret) };
  const pgMissingWarnings = [{ kind: "pg_missing", message: "PostgreSQL 未配置" }] as const;

  app.get("/system/configs", async (request, reply) => {
    const traceId = request.traceId;
    if (!pg) {
      ok(reply, { list: [], unavailable: true, warnings: pgMissingWarnings }, traceId);
      return;
    }

    const rows = await withPgClient(pg, async (client) => {
      const res = await client.query<{
        config_key: string;
        config_value: string | null;
        config_type: string;
        description: string | null;
        updated_at: string;
      }>(
        `
          SELECT
            config_key,
            config_value,
            config_type,
            description,
            to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at
          FROM system_configs
          WHERE is_public = TRUE
          ORDER BY config_key
        `
      );
      return res.rows;
    });

    ok(
      reply,
      {
        list: rows.map((r) => ({
          key: r.config_key,
          value: r.config_value ?? "",
          type: r.config_type,
          description: r.description ?? "",
          updatedAt: r.updated_at
        }))
      },
      traceId
    );
  });

  app.put("/system/configs", async (request, reply) => {
    const traceId = request.traceId;
    if (!(await requirePermission(adminCfg, pg, request, reply, "system:config"))) return;
    if (!pg) {
      fail(reply, 503, "PostgreSQL 未配置", traceId);
      return;
    }

    const parseBody = updateConfigsSchema.safeParse(request.body);
    if (!parseBody.success) {
      fail(reply, 400, "参数错误", traceId, { field: "body", issues: parseBody.error.issues });
      return;
    }

    const unique = new Map<string, string>();
    for (const c of parseBody.data.configs) unique.set(c.key, c.value);
    const configs = Array.from(unique.entries()).map(([key, value]) => ({ key, value }));

    const updated = await withPgClient(pg, async (client) => {
      await client.query("BEGIN");
      try {
        const keys = configs.map((c) => c.key);
        const existing = await client.query<{ config_key: string }>(
          "SELECT config_key FROM system_configs WHERE config_key = ANY($1::text[])",
          [keys]
        );
        const exists = new Set(existing.rows.map((r) => r.config_key));
        const missing = keys.filter((k) => !exists.has(k));
        if (missing.length > 0) {
          await client.query("ROLLBACK");
          return { ok: false as const, missing };
        }

        for (const c of configs) {
          await client.query("UPDATE system_configs SET config_value=$1, updated_at=NOW() WHERE config_key=$2", [
            c.value,
            c.key
          ]);
        }

        await client.query("COMMIT");
        return { ok: true as const, updated: configs.length };
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    });

    if (!updated.ok) {
      fail(reply, 404, "资源不存在", traceId, { missingKeys: updated.missing });
      return;
    }

    void withPgClient(pg, async (client) => {
      await client.query(
        `
          INSERT INTO operation_logs (user_id, username, module, action, description, request_data, response_data, ip_address, user_agent, status)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `,
        [
          request.user?.userId ?? null,
          request.user?.username ?? "admin",
          "system",
          "update_configs",
          "update system configs",
          parseBody.data,
          { updated: updated.updated },
          request.ip,
          typeof request.headers["user-agent"] === "string" ? request.headers["user-agent"] : null,
          "success"
        ]
      );
    }).catch(() => undefined);

    ok(reply, { updated: updated.updated }, traceId);
  });

  app.get("/system/logs/operation", async (request, reply) => {
    const traceId = request.traceId;
    if (!(await requirePermission(adminCfg, pg, request, reply, "system:log"))) return;

    const parseQuery = operationLogsQuerySchema.safeParse(request.query);
    if (!parseQuery.success) {
      fail(reply, 400, "参数错误", traceId, { field: "query", issues: parseQuery.error.issues });
      return;
    }

    const { page, pageSize, userId, module, action, startTime, endTime } = parseQuery.data;
    const offset = (page - 1) * pageSize;

    if (!pg) {
      ok(
        reply,
        { page, pageSize, total: 0, list: [], unavailable: true, warnings: pgMissingWarnings },
        traceId
      );
      return;
    }

    const where: string[] = [];
    const params: unknown[] = [];
    const add = (sql: string, val: unknown) => {
      params.push(val);
      where.push(sql.replace("$X", "$" + String(params.length)));
    };

    if (userId) add("user_id = $X", userId);
    if (module) add("module = $X", module);
    if (action) add("action = $X", action);
    if (startTime) add("created_at >= $X", new Date(startTime));
    if (endTime) add("created_at <= $X", new Date(endTime));

    const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

    const data = await withPgClient(pg, async (client) => {
      const totalRow = await queryOne<{ total: string }>(
        client,
        `SELECT count(*)::text AS total FROM operation_logs ${whereSql}`,
        params
      );
      const total = Number(totalRow?.total ?? "0");

      const res = await client.query<{
        id: string;
        user_id: string | null;
        username: string | null;
        module: string;
        action: string;
        target_type: string | null;
        target_id: string | null;
        description: string | null;
        request_data: unknown;
        response_data: unknown;
        ip_address: string | null;
        user_agent: string | null;
        status: string;
        error_message: string | null;
        created_at: string;
      }>(
        `
          SELECT
            id::text AS id,
            user_id,
            username,
            module,
            action,
            target_type,
            target_id,
            description,
            request_data,
            response_data,
            ip_address,
            user_agent,
            status,
            error_message,
            to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at
          FROM operation_logs
          ${whereSql}
          ORDER BY created_at DESC, id DESC
          LIMIT $${String(params.length + 1)} OFFSET $${String(params.length + 2)}
        `,
        [...params, pageSize, offset]
      );

      return { total, rows: res.rows };
    });

    ok(
      reply,
      {
        page,
        pageSize,
        total: data.total,
        list: data.rows.map((r) => ({
          id: r.id,
          userId: r.user_id,
          username: r.username ?? "",
          module: r.module,
          action: r.action,
          targetType: r.target_type ?? "",
          targetId: r.target_id ?? "",
          description: r.description ?? "",
          requestData: r.request_data ?? null,
          responseData: r.response_data ?? null,
          ipAddress: r.ip_address ?? "",
          userAgent: r.user_agent ?? "",
          status: r.status,
          errorMessage: r.error_message ?? "",
          createdAt: r.created_at
        }))
      },
      traceId
    );
  });

  app.get("/system/logs/api-stats", async (request, reply) => {
    const traceId = request.traceId;
    if (!(await requirePermission(adminCfg, pg, request, reply, "system:log"))) return;
    if (!pg) {
      const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      ok(
        reply,
        {
          since,
          total: 0,
          byStatus: { "2xx": 0, "3xx": 0, "4xx": 0, "5xx": 0 },
          avgResponseTimeMs: null,
          topPaths: [],
          unavailable: true,
          warnings: pgMissingWarnings
        },
        traceId
      );
      return;
    }

    const since = new Date(Date.now() - 24 * 3600 * 1000);

    const result = await withPgClient(pg, async (client) => {
      const totals = await queryOne<{
        total: string;
        s2xx: string;
        s3xx: string;
        s4xx: string;
        s5xx: string;
        avg_ms: string | null;
      }>(
        client,
        `
          SELECT
            count(*)::text AS total,
            count(*) FILTER (WHERE status_code >= 200 AND status_code < 300)::text AS s2xx,
            count(*) FILTER (WHERE status_code >= 300 AND status_code < 400)::text AS s3xx,
            count(*) FILTER (WHERE status_code >= 400 AND status_code < 500)::text AS s4xx,
            count(*) FILTER (WHERE status_code >= 500)::text AS s5xx,
            avg(response_time_ms)::text AS avg_ms
          FROM api_logs
          WHERE created_at >= $1
        `,
        [since]
      );

      const topPaths = await client.query<{
        method: string | null;
        path: string | null;
        c: string;
        p95_ms: string | null;
      }>(
        `
          SELECT
            method,
            path,
            count(*)::text AS c,
            percentile_cont(0.95) WITHIN GROUP (ORDER BY response_time_ms)::text AS p95_ms
          FROM api_logs
          WHERE created_at >= $1
          GROUP BY method, path
          ORDER BY count(*) DESC
          LIMIT 20
        `,
        [since]
      );

      return { totals, topPaths: topPaths.rows };
    });

    ok(
      reply,
      {
        since: since.toISOString(),
        total: Number(result.totals?.total ?? "0"),
        byStatus: {
          "2xx": Number(result.totals?.s2xx ?? "0"),
          "3xx": Number(result.totals?.s3xx ?? "0"),
          "4xx": Number(result.totals?.s4xx ?? "0"),
          "5xx": Number(result.totals?.s5xx ?? "0")
        },
        avgResponseTimeMs: result.totals?.avg_ms ? Number(result.totals.avg_ms) : null,
        topPaths: result.topPaths.map((r) => ({
          method: r.method ?? "",
          path: r.path ?? "",
          count: Number(r.c),
          p95ResponseTimeMs: r.p95_ms ? Number(r.p95_ms) : null
        }))
      },
      traceId
    );
  });

  app.get("/system/status", async (request, reply) => {
    const traceId = request.traceId;
    if (!(await requirePermission(adminCfg, pg, request, reply, "system:log"))) return;

    const postgres = await checkPostgres(pg);
    const clickhouse = await checkClickhouse(ch);

    ok(
      reply,
      {
        uptimeS: Math.floor(process.uptime()),
        postgres,
        clickhouse,
        kafka: { status: config.kafkaBrokers && config.kafkaBrokers.length > 0 ? "configured" : "not_configured" },
        emqx: { status: "unknown" }
      },
      traceId
    );
  });

  app.get("/dashboard", async (request, reply) => {
    const traceId = request.traceId;
    if (!(await requirePermission(adminCfg, pg, request, reply, "data:view"))) return;

    const now = new Date();
    const start = utcStartOfDay(now);

    const todayDataCount = await (async () => {
      try {
        const res = await ch.query({
          query: `
            SELECT count()::UInt64 AS c
            FROM ${config.clickhouseDatabase}.${config.clickhouseTable}
            WHERE received_ts >= {start:DateTime64(3, 'UTC')}
          `,
          query_params: { start: toClickhouseDateTime64Utc(start) },
          format: "JSONEachRow"
        });
        const rows: { c: number | string }[] = await res.json();
        const v = rows[0]?.c;
        return typeof v === "string" ? Number(v) : v ?? 0;
      } catch {
        return 0;
      }
    })();

    if (!pg) {
      ok(
        reply,
        {
          todayDataCount,
          onlineDevices: 0,
          offlineDevices: 0,
          pendingAlerts: 0,
          alertsBySeverity: { low: 0, medium: 0, high: 0, critical: 0 },
          stations: 0,
          lastUpdatedAt: now.toISOString(),
          unavailable: true,
          warnings: pgMissingWarnings
        },
        traceId
      );
      return;
    }

    const data = await withPgClient(pg, async (client) => {
      const devices = await client.query<{ status: string; count: string }>(
        `
          SELECT status, count(*)::text AS count
          FROM devices
          GROUP BY status
        `
      );
      const stations = await queryOne<{ count: string }>(client, "SELECT count(*)::text AS count FROM stations", []);

      const alerts = await client.query<{ status: string; severity: string; count: string }>(
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
              severity
            FROM latest
          )
          SELECT status, severity, count(*)::text AS count
          FROM a
          GROUP BY status, severity
        `
      );

      return { devices: devices.rows, stations: Number(stations?.count ?? "0"), alerts: alerts.rows };
    });

    const deviceCounts: Record<string, number> = {};
    for (const r of data.devices) deviceCounts[r.status] = Number(r.count);
    const onlineDevices = deviceCounts.active ?? 0;
    const offlineDevices = deviceCounts.inactive ?? 0;

    const alertsBySeverity: Record<string, number> = { low: 0, medium: 0, high: 0, critical: 0 };
    let pendingAlerts = 0;
    for (const r of data.alerts) {
      const c = Number(r.count);
      if (r.status === "active" || r.status === "acked") pendingAlerts += c;
      if (r.status === "active" || r.status === "acked") {
        alertsBySeverity[r.severity] = (alertsBySeverity[r.severity] ?? 0) + c;
      }
    }

    ok(
      reply,
      {
        todayDataCount,
        onlineDevices,
        offlineDevices,
        pendingAlerts,
        alertsBySeverity,
        stations: data.stations,
        lastUpdatedAt: now.toISOString()
      },
      traceId
    );
  });
}
