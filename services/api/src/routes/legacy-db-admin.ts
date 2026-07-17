import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import type { AdminAuthConfig } from "../authz";
import { requirePermission } from "../authz";
import type { AppConfig } from "../config";
import type { PgPool } from "../postgres";
import { queryOne, withPgClient } from "../postgres";

function disabled(reply: FastifyReply): void {
  void reply.code(403).send({
    success: false,
    error: "disabled",
    message: "endpoint disabled in v2: /db-admin",
    timestamp: new Date().toISOString()
  });
}

function legacyOk(reply: FastifyReply, data: unknown, message = "ok"): void {
  void reply.code(200).send({ success: true, data, message, timestamp: new Date().toISOString() });
}

function legacyFail(reply: FastifyReply, statusCode: number, message: string, details?: unknown): void {
  void reply.code(statusCode).send({ success: false, message, error: details, timestamp: new Date().toISOString() });
}

type DbAdminAction = "query" | "analyze" | "backup" | "insert" | "update" | "delete";

const dbAdminBodySchema = z
  .object({
    action: z.enum(["query", "analyze", "backup", "insert", "update", "delete"]),
    table: z.string().optional(),
    query: z.string().optional(),
    data: z.unknown().optional()
  })
  .strict();

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, " ").trim().toLowerCase();
}

function stripTrailingSemicolon(sql: string): string {
  const trimmed = sql.trim();
  return trimmed.endsWith(";") ? trimmed.slice(0, -1).trim() : trimmed;
}

function isReadOnlyQuery(sql: string): boolean {
  const normalized = normalizeSql(stripTrailingSemicolon(sql));
  if (!(normalized.startsWith("select ") || normalized.startsWith("with "))) return false;

  if (sql.includes("\u0000")) return false;

  const semicolonIdx = sql.indexOf(";");
  if (semicolonIdx >= 0 && semicolonIdx < sql.length - 1) return false;

  const banned = [
    "insert",
    "update",
    "delete",
    "drop",
    "alter",
    "create",
    "grant",
    "revoke",
    "truncate",
    "copy",
    "call",
    "do",
    "execute",
    "refresh",
    "vacuum",
    "analyze"
  ] as const;
  for (const kw of banned) {
    if (new RegExp(`\\b${kw}\\b`, "i").test(normalized)) return false;
  }

  return true;
}

function safeTableName(name: string): string | null {
  if (!/^[a-zA-Z0-9_]+$/.test(name)) return null;
  return `"${name}"`;
}

function safeSchemaName(name: string): string | null {
  if (!/^[a-zA-Z0-9_]+$/.test(name)) return null;
  return `"${name}"`;
}

async function logDbAdminOperation(
  pg: PgPool,
  request: { user?: { userId: string; username?: string | null } | null; ip: string; headers: Record<string, unknown> },
  action: DbAdminAction,
  requestData: Record<string, unknown>,
  responseData: Record<string, unknown>,
  status: "success" | "failed"
): Promise<void> {
  await withPgClient(pg, async (client) => {
    await client.query(
      `
        INSERT INTO operation_logs (user_id, username, module, action, description, request_data, response_data, ip_address, user_agent, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `,
      [
        request.user?.userId ?? null,
        request.user?.username ?? "admin",
        "db_admin",
        action,
        "db admin operation",
        requestData,
        responseData,
        request.ip,
        typeof request.headers["user-agent"] === "string" ? request.headers["user-agent"] : null,
        status
      ]
    );
  });
}

async function runReadOnlyQuery(pg: PgPool, sql: string): Promise<{ rows: unknown[]; limited: boolean }> {
  const querySql = stripTrailingSemicolon(sql);
  const normalized = normalizeSql(querySql);
  const hasLimit = /\blimit\b/i.test(normalized);

  const finalSql = hasLimit ? querySql : `SELECT * FROM (${querySql}) AS q LIMIT 200`;
  const limited = !hasLimit;

  return withPgClient(pg, async (client) => {
    await client.query("BEGIN READ ONLY");
    try {
      await client.query("SET LOCAL statement_timeout = '5000ms'");
      const res = await client.query<Record<string, unknown>>(finalSql);
      await client.query("ROLLBACK");
      return { rows: res.rows as unknown[], limited };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }
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

export function registerLegacyDbAdminRoutes(
  app: FastifyInstance,
  config: AppConfig,
  pg: PgPool | null
): void {
  const adminCfg: AdminAuthConfig = { adminApiToken: config.adminApiToken, jwtEnabled: Boolean(config.jwtAccessSecret) };
  const authConfigured = Boolean(config.adminApiToken) || Boolean(config.jwtAccessSecret);

  app.post("/db-admin", async (request, reply) => {
    if (!config.dbAdminEnabled || !authConfigured) {
      disabled(reply);
      return;
    }
    if (!(await requirePermission(adminCfg, pg, request, reply, "system:config"))) return;
    if (!pg) {
      legacyFail(reply, 503, "PostgreSQL not configured");
      return;
    }

    const parsed = dbAdminBodySchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      legacyFail(reply, 400, "invalid body");
      return;
    }

    const action = parsed.data.action as DbAdminAction;

    const userContext = {
      user: request.user,
      ip: request.ip,
      headers: request.headers as unknown as Record<string, unknown>
    };

    try {
      switch (action) {
        case "insert":
        case "update":
        case "delete": {
          legacyFail(reply, 403, "write actions are disabled");
          return;
        }

        case "query": {
          const query = parsed.data.query;
          if (typeof query !== "string" || query.trim().length === 0) {
            legacyFail(reply, 400, "missing query");
            return;
          }
          if (!isReadOnlyQuery(query)) {
            legacyFail(reply, 400, "only read-only SELECT queries are allowed");
            return;
          }

          const out = await runReadOnlyQuery(pg, query);
          void logDbAdminOperation(
            pg,
            userContext,
            action,
            { action, query: query.slice(0, 500) },
            { rowCount: out.rows.length, limited: out.limited },
            "success"
          ).catch(() => undefined);

          legacyOk(reply, { rows: out.rows, limited: out.limited });
          return;
        }

        case "backup":
        case "analyze": {
          const table = parsed.data.table;
          if (typeof table !== "string" || table.trim().length === 0) {
            legacyFail(reply, 400, "missing table");
            return;
          }
          const safeSchema = safeSchemaName("public");
          const safeTable = safeTableName(table.trim());
          if (!safeSchema || !safeTable) {
            legacyFail(reply, 400, "invalid table name");
            return;
          }

          if (action === "backup") {
            const res = await withPgClient(pg, async (client) => {
              await client.query("BEGIN READ ONLY");
              try {
                await client.query("SET LOCAL statement_timeout = '5000ms'");
                const rowsRes = await client.query<Record<string, unknown>>(
                  `SELECT * FROM ${safeSchema}.${safeTable} LIMIT 1000`
                );
                await client.query("ROLLBACK");
                return rowsRes.rows as unknown[];
              } catch (err) {
                await client.query("ROLLBACK");
                throw err;
              }
            });

            void logDbAdminOperation(
              pg,
              userContext,
              action,
              { action, table },
              { rowCount: res.length, limited: true },
              "success"
            ).catch(() => undefined);

            legacyOk(reply, {
              table,
              backup_time: new Date().toISOString(),
              record_count: res.length,
              data: res
            });
            return;
          }

          const approxRows = await pgApproxRowCount(pg, "public", table.trim());
          const sample = await withPgClient(pg, async (client) => {
            await client.query("BEGIN READ ONLY");
            try {
              await client.query("SET LOCAL statement_timeout = '5000ms'");
              const rowsRes = await client.query<Record<string, unknown>>(`SELECT * FROM ${safeSchema}.${safeTable} LIMIT 10`);
              await client.query("ROLLBACK");
              return rowsRes.rows as unknown[];
            } catch (err) {
              await client.query("ROLLBACK");
              throw err;
            }
          });

          const columns =
            Array.isArray(sample) && sample.length > 0 && sample[0] && typeof sample[0] === "object"
              ? Object.keys(sample[0] as Record<string, unknown>)
              : [];

          void logDbAdminOperation(
            pg,
            userContext,
            action,
            { action, table },
            { approxRows, sampleRows: sample.length },
            "success"
          ).catch(() => undefined);

          legacyOk(reply, {
            table_name: table,
            approx_rows: approxRows,
            columns,
            sample_data: sample
          });
          return;
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      void logDbAdminOperation(
        pg,
        userContext,
        action,
        { action, table: parsed.data.table ?? null },
        { error: msg },
        "failed"
      ).catch(() => undefined);

      legacyFail(reply, 500, "db-admin failed", msg);
    }
  });
}
