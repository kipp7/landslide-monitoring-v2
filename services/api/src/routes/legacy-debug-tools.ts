import type { ClickHouseClient } from "@clickhouse/client";
import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import type { AdminAuthConfig } from "../authz";
import { requirePermission } from "../authz";
import type { AppConfig } from "../config";
import type { PgPool } from "../postgres";
import { queryOne, withPgClient } from "../postgres";

type InjectResponse = Awaited<ReturnType<FastifyInstance["inject"]>>;

function disabled(reply: FastifyReply, path: string): void {
  void reply.code(403).send({
    success: false,
    error: "disabled",
    message: `endpoint disabled in v2: ${path}`,
    timestamp: new Date().toISOString()
  });
}

function legacyOk(reply: FastifyReply, data: unknown, message = "ok"): void {
  void reply.code(200).send({ success: true, data, message, timestamp: new Date().toISOString() });
}

function legacyFail(reply: FastifyReply, statusCode: number, message: string, details?: unknown): void {
  void reply.code(statusCode).send({ success: false, message, error: details, timestamp: new Date().toISOString() });
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

async function checkClickhouse(ch: ClickHouseClient | null): Promise<{ status: string; error?: string }> {
  if (!ch) return { status: "not_configured" };
  try {
    const res = await ch.query({ query: "SELECT 1 AS ok", format: "JSONEachRow" });
    await res.json();
    return { status: "healthy" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { status: "unhealthy", error: msg };
  }
}

async function pgTableExists(pg: PgPool, schema: string, tableName: string): Promise<boolean> {
  return withPgClient(pg, async (client) => {
    const row = await queryOne<{ ok: boolean }>(
      client,
      `
        SELECT EXISTS (
          SELECT 1
          FROM information_schema.tables
          WHERE table_schema = $1 AND table_name = $2
        ) AS ok
      `,
      [schema, tableName]
    );
    return Boolean(row?.ok);
  });
}

async function pgApproxRowCount(pg: PgPool, schema: string, tableName: string): Promise<number | null> {
  return withPgClient(pg, async (client) => {
    const row = await queryOne<{ approx_rows: number | null }>(
      client,
      `
        SELECT c.reltuples::bigint AS approx_rows
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = $1 AND c.relname = $2
      `,
      [schema, tableName]
    );
    const val = row?.approx_rows ?? null;
    return typeof val === "number" ? val : null;
  });
}

function safePgIdent(id: string): string | null {
  if (!/^[a-zA-Z0-9_]+$/.test(id)) return null;
  return `"${id}"`;
}

async function pgSampleRows(pg: PgPool, schema: string, tableName: string, limit: number): Promise<unknown[] | null> {
  const safeSchema = safePgIdent(schema);
  const safeTable = safePgIdent(tableName);
  if (!safeSchema || !safeTable) return null;
  const capped = Math.max(0, Math.min(50, limit));

  return withPgClient(pg, async (client) => {
    const res = await client.query<Record<string, unknown>>(
      `SELECT * FROM ${safeSchema}.${safeTable} LIMIT ${String(capped)}`
    );
    return res.rows as unknown[];
  });
}

const inspectTablesQuerySchema = z
  .object({
    schema: z.string().min(1).default("public"),
    sampleRows: z.coerce.number().int().min(0).max(50).default(3)
  })
  .strict();

const inspectAllTablesQuerySchema = z
  .object({
    schema: z.string().min(1).default("public"),
    limitTables: z.coerce.number().int().min(1).max(200).default(50),
    sampleRows: z.coerce.number().int().min(0).max(10).default(1)
  })
  .strict();

export function registerLegacyDebugToolRoutes(
  app: FastifyInstance,
  config: AppConfig,
  ch: ClickHouseClient,
  pg: PgPool | null,
  opts?: { injector?: FastifyInstance }
): void {
  const adminCfg: AdminAuthConfig = { adminApiToken: config.adminApiToken, jwtEnabled: Boolean(config.jwtAccessSecret) };
  const authConfigured = Boolean(config.adminApiToken) || Boolean(config.jwtAccessSecret);
  if (!authConfigured) {
    const disabledPaths = ["/inspect-db", "/inspect-tables", "/inspect-all-tables", "/test-db", "/test-expert-health"] as const;
    for (const path of disabledPaths) {
      app.get(path, async (_request, reply) => {
        disabled(reply, path);
      });
      app.post(path, async (_request, reply) => {
        disabled(reply, path);
      });
    }
    return;
  }

  app.get("/test-db", async (request, reply) => {
    if (!(await requirePermission(adminCfg, pg, request, reply, "system:log"))) return;

    const tableNames = ["iot_devices", "iot_device_locations"] as const;
    const pgTables: Record<string, unknown> = {};

    if (pg) {
      for (const tableName of tableNames) {
        try {
          const exists = await pgTableExists(pg, "public", tableName);
          if (!exists) {
            pgTables[tableName] = { success: false, count: 0, data: null, error: "table not found" };
            continue;
          }

          const sample = await pgSampleRows(pg, "public", tableName, 3);
          pgTables[tableName] = {
            success: true,
            count: Array.isArray(sample) ? sample.length : 0,
            data: sample,
            error: null
          };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          pgTables[tableName] = { success: false, count: 0, data: null, error: msg };
        }
      }
    } else {
      for (const tableName of tableNames) {
        pgTables[tableName] = { success: false, count: 0, data: null, error: "PostgreSQL not configured" };
      }
    }

    let chIotData: { success: boolean; count: number; error?: string } = { success: false, count: 0 };
    try {
      const res = await ch.query({
        query: "SELECT device_id, event_time FROM iot_data LIMIT 5",
        format: "JSONEachRow"
      });
      const rows = await res.json();
      chIotData = { success: true, count: Array.isArray(rows) ? rows.length : 0 };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      chIotData = { success: false, count: 0, error: msg };
    }

    legacyOk(reply, {
      postgres: await checkPostgres(pg),
      clickhouse: await checkClickhouse(ch),
      data: {
        ...pgTables,
        iot_data: chIotData
      }
    });
  });

  app.get("/inspect-db", async (request, reply) => {
    if (!(await requirePermission(adminCfg, pg, request, reply, "system:log"))) return;

    const pgInfo: Record<string, unknown> = { status: "not_configured" };
    if (pg) {
      try {
        const row = await withPgClient(pg, async (client) =>
          queryOne<{
            database: string;
            user: string;
            version: string;
            now_utc: string;
          }>(
            client,
            `
              SELECT
                current_database() AS database,
                current_user AS "user",
                version() AS version,
                to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS now_utc
            `,
            []
          )
        );
        pgInfo.status = "healthy";
        pgInfo.info = row;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        pgInfo.status = "unhealthy";
        pgInfo.error = msg;
      }
    }

    const chInfo: Record<string, unknown> = { status: "unknown" };
    try {
      const res = await ch.query({ query: "SELECT version() AS version", format: "JSONEachRow" });
      const row = await res.json();
      chInfo.status = "healthy";
      chInfo.info = Array.isArray(row) ? (row[0] ?? null) : null;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      chInfo.status = "unhealthy";
      chInfo.error = msg;
    }

    legacyOk(reply, { postgres: pgInfo, clickhouse: chInfo });
  });

  app.get("/inspect-tables", async (request, reply) => {
    if (!(await requirePermission(adminCfg, pg, request, reply, "system:log"))) return;
    if (!pg) {
      legacyFail(reply, 503, "PostgreSQL not configured");
      return;
    }

    const parsed = inspectTablesQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) {
      legacyFail(reply, 400, "invalid query");
      return;
    }

    const tableNames = [
      "iot_data",
      "iot_devices",
      "iot_device_locations",
      "device_mapping",
      "device_mapping_view",
      "gps_baselines",
      "iot_anomalies",
      "iot_anomaly_trends",
      "huawei_iot_data",
      "iot_command_templates"
    ] as const;

    const results: Record<string, unknown> = {};
    for (const tableName of tableNames) {
      try {
        const exists = await pgTableExists(pg, parsed.data.schema, tableName);
        if (!exists) {
          results[tableName] = { exists: false, count: 0, sample_data: null, columns: null, error: "table not found" };
          continue;
        }

        const approxRows = await pgApproxRowCount(pg, parsed.data.schema, tableName);
        const sample = await pgSampleRows(pg, parsed.data.schema, tableName, parsed.data.sampleRows);
        const columns =
          Array.isArray(sample) && sample.length > 0 && sample[0] && typeof sample[0] === "object"
            ? Object.keys(sample[0] as Record<string, unknown>)
            : [];

        results[tableName] = {
          exists: true,
          approx_rows: approxRows,
          sample_data: sample,
          columns
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        results[tableName] = { exists: false, count: 0, sample_data: null, columns: null, error: msg };
      }
    }

    const existingTables = Object.keys(results).filter((k) => {
      const v = results[k] as { exists?: boolean };
      return Boolean(v.exists);
    });

    legacyOk(reply, {
      summary: {
        total_tables_checked: tableNames.length,
        existing_tables: existingTables,
        existing_count: existingTables.length
      },
      table_details: results
    });
  });

  app.get("/inspect-all-tables", async (request, reply) => {
    if (!(await requirePermission(adminCfg, pg, request, reply, "system:log"))) return;
    if (!pg) {
      legacyFail(reply, 503, "PostgreSQL not configured");
      return;
    }

    const parsed = inspectAllTablesQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) {
      legacyFail(reply, 400, "invalid query");
      return;
    }

    const tables = await withPgClient(pg, async (client) => {
      const res = await client.query<{ table_name: string }>(
        `
          SELECT table_name
          FROM information_schema.tables
          WHERE table_schema = $1
          ORDER BY table_name
          LIMIT $2
        `,
        [parsed.data.schema, parsed.data.limitTables]
      );
      return res.rows.map((r) => r.table_name);
    });

    const results: Record<string, unknown> = {};
    for (const tableName of tables) {
      try {
        const approxRows = await pgApproxRowCount(pg, parsed.data.schema, tableName);
        const sample = await pgSampleRows(pg, parsed.data.schema, tableName, parsed.data.sampleRows);
        const columns =
          Array.isArray(sample) && sample.length > 0 && sample[0] && typeof sample[0] === "object"
            ? Object.keys(sample[0] as Record<string, unknown>)
            : [];

        results[tableName] = {
          exists: true,
          approx_rows: approxRows,
          hasData: typeof approxRows === "number" ? approxRows > 0 : undefined,
          columns,
          sampleData: Array.isArray(sample) && sample.length > 0 ? sample[0] : null
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        results[tableName] = { exists: false, error: msg };
      }
    }

    legacyOk(reply, {
      summary: {
        schema: parsed.data.schema,
        total_tables_checked: tables.length,
        existing_tables: Object.keys(results).filter((k) => Boolean((results[k] as { exists?: boolean }).exists))
      },
      tableInfo: results
    });
  });

  app.get("/test-expert-health", async (request, reply) => {
    if (!(await requirePermission(adminCfg, pg, request, reply, "data:view"))) return;
    const injector = opts?.injector;
    if (!injector) {
      legacyFail(reply, 500, "injector not configured");
      return;
    }
    const injectApp = injector;

    const deviceId =
      typeof (request.query as Record<string, unknown> | undefined)?.device_id === "string"
        ? String((request.query as Record<string, unknown>).device_id)
        : "device_1";

    const fullPath = request.raw.url ?? request.url;
    const prefix = fullPath.startsWith("/iot/api/") ? "/iot/api" : "/api";
    const authHeader = request.headers.authorization;

    const tests: Record<string, unknown> = {};

    async function runGet(path: string): Promise<{ ok: boolean; statusCode: number; body: unknown; durationMs: number }> {
      const start = Date.now();
      const injectOpts: { method: "GET"; url: string; headers?: Record<string, string> } = { method: "GET", url: path };
      if (authHeader) injectOpts.headers = { authorization: authHeader };
      const res: InjectResponse = await injectApp.inject(injectOpts);
      const durationMs = Math.max(0, Date.now() - start);
      const payload = res.payload;
      let body: unknown = payload;
      try {
        body = JSON.parse(payload) as unknown;
      } catch {
        body = payload;
      }
      return { ok: res.statusCode >= 200 && res.statusCode < 300, statusCode: res.statusCode, body, durationMs };
    }

    const calls = [
      { key: "battery", url: `${prefix}/device-health-expert?device_id=${encodeURIComponent(deviceId)}&metric=battery` },
      { key: "signal", url: `${prefix}/device-health-expert?device_id=${encodeURIComponent(deviceId)}&metric=signal` },
      { key: "comprehensive", url: `${prefix}/device-health-expert?device_id=${encodeURIComponent(deviceId)}&metric=all` },
      { key: "deviceManagement", url: `${prefix}/device-management?device_id=${encodeURIComponent(deviceId)}` }
    ] as const;

    for (const call of calls) {
      try {
        const out = await runGet(call.url);
        tests[call.key] = out.ok
          ? { status: "success", statusCode: out.statusCode, durationMs: out.durationMs }
          : { status: "failed", statusCode: out.statusCode, durationMs: out.durationMs, body: out.body };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        tests[call.key] = { status: "failed", error: msg };
      }
    }

    const testKeys = Object.keys(tests);
    const successful = testKeys.filter((k) => (tests[k] as { status?: string }).status === "success").length;
    const total = testKeys.length;
    const successRate = total > 0 ? Math.round(((successful / total) * 100) * 10) / 10 : 0;

    legacyOk(reply, {
      deviceId,
      timestamp: new Date().toISOString(),
      tests,
      summary: {
        totalTests: total,
        successfulTests: successful,
        failedTests: total - successful,
        successRate
      }
    });
  });
}
