import type { ClickHouseClient } from "@clickhouse/client";
import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config";
import { requireAdmin, type AdminAuthConfig } from "../authz";
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

export function registerSystemRoutes(
  app: FastifyInstance,
  config: AppConfig,
  ch: ClickHouseClient,
  pg: PgPool | null
): void {
  const adminCfg: AdminAuthConfig = { adminApiToken: config.adminApiToken };

  app.get("/system/status", async (request, reply) => {
    const traceId = request.traceId;
    if (!requireAdmin(adminCfg, request, reply)) return;

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
    if (!requireAdmin(adminCfg, request, reply)) return;
    if (!pg) {
      fail(reply, 503, "PostgreSQL 未配置", traceId);
      return;
    }

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
