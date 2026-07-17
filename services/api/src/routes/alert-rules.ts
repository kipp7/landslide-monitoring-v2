import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppConfig } from "../config";
import { requirePermission, type AdminAuthConfig } from "../authz";
import { fail, ok } from "../http";
import type { PgPool } from "../postgres";
import { queryOne, withPgClient } from "../postgres";
import path from "node:path";
import { loadAndCompileSchema } from "@lsmv2/validation";
import { enqueueOperationLog } from "../operation-log";

const ruleIdSchema = z.string().uuid();

const queryBoolSchema = z.preprocess((v) => {
  if (typeof v === "string") {
    const t = v.trim().toLowerCase();
    if (t === "1" || t === "true") return true;
    if (t === "0" || t === "false") return false;
  }
  return v;
}, z.boolean());

const listRulesQuerySchema = z.object({
  isActive: queryBoolSchema.optional(),
  scope: z.enum(["device", "station", "global"]).optional(),
  deviceId: z.string().uuid().optional(),
  stationId: z.string().uuid().optional()
});

const createRuleRequestSchema = z
  .object({
    rule: z.object({
      ruleName: z.string().min(1),
      description: z.string().optional(),
      scope: z.object({
        type: z.enum(["device", "station", "global"]),
        deviceId: z.string().uuid().optional(),
        stationId: z.string().uuid().optional()
      }),
      isActive: z.boolean()
    }),
    dsl: z.record(z.unknown())
  })
  .strict();

const updateRuleRequestSchema = z
  .object({
    isActive: z.boolean().optional()
  })
  .strict();

const publishVersionRequestSchema = z
  .object({
    dsl: z.record(z.unknown())
  })
  .strict();

function repoRootFromHere(): string {
  // Note: compiled output is under services/api/dist/routes, so we need 4 levels to reach repo root.
  return path.resolve(__dirname, "..", "..", "..", "..");
}

function readScopeFromUnknown(scope: unknown):
  | { type: "device"; deviceId: string }
  | { type: "station"; stationId: string }
  | { type: "global" }
  | null {
  if (!scope || typeof scope !== "object") return null;
  const t = (scope as { type?: unknown }).type;
  if (t === "global") return { type: "global" };
  if (t === "device") {
    const deviceId = (scope as { deviceId?: unknown }).deviceId;
    if (typeof deviceId !== "string") return null;
    return { type: "device", deviceId };
  }
  if (t === "station") {
    const stationId = (scope as { stationId?: unknown }).stationId;
    if (typeof stationId !== "string") return null;
    return { type: "station", stationId };
  }
  return null;
}

function normalizeSeverity(v: unknown): "low" | "medium" | "high" | "critical" {
  if (v === "low" || v === "medium" || v === "high" || v === "critical") return v;
  return "medium";
}

export function registerAlertRuleRoutes(app: FastifyInstance, config: AppConfig, pg: PgPool | null): void {
  const adminCfg: AdminAuthConfig = { adminApiToken: config.adminApiToken, jwtEnabled: Boolean(config.jwtAccessSecret) };

  const repoRoot = repoRootFromHere();
  const dslSchemaPath = path.join(repoRoot, "docs", "integrations", "rules", "rule-dsl.schema.json");
  const validateDslPromise = loadAndCompileSchema<Record<string, unknown>>(dslSchemaPath);

  const validateDsl = async (dsl: unknown) => {
    const v = await validateDslPromise;
    if (!v.validate(dsl)) {
      return { ok: false as const, errors: v.errors };
    }
    return { ok: true as const };
  };

  app.get("/alert-rules", async (request, reply) => {
    const traceId = request.traceId;
    if (!(await requirePermission(adminCfg, pg, request, reply, "alert:config"))) return;
    if (!pg) {
      fail(reply, 503, "PostgreSQL 未配置", traceId);
      return;
    }

    const parseQuery = listRulesQuerySchema.safeParse(request.query);
    if (!parseQuery.success) {
      fail(reply, 400, "参数错误", traceId, { field: "query", issues: parseQuery.error.issues });
      return;
    }
    const { isActive, scope, deviceId, stationId } = parseQuery.data;

    const where: string[] = [];
    const params: unknown[] = [];
    if (isActive !== undefined) {
      params.push(isActive);
      where.push("r.is_active = $" + String(params.length));
    }
    if (scope) {
      params.push(scope);
      where.push("r.scope = $" + String(params.length));
    }
    if (deviceId) {
      params.push(deviceId);
      where.push("r.device_id = $" + String(params.length));
    }
    if (stationId) {
      params.push(stationId);
      where.push("r.station_id = $" + String(params.length));
    }

    const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

    const rows = await withPgClient(pg, async (client) => {
      const res = await client.query<{
        rule_id: string;
        rule_name: string;
        scope: "device" | "station" | "global";
        device_id: string | null;
        station_id: string | null;
        is_active: boolean;
        updated_at: string;
        current_version: string;
      }>(
        `
          SELECT
            r.rule_id,
            r.rule_name,
            r.scope,
            r.device_id,
            r.station_id,
            r.is_active,
            to_char(r.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at,
            coalesce(v.max_version, 0)::text AS current_version
          FROM alert_rules r
          LEFT JOIN (
            SELECT rule_id, max(rule_version) AS max_version
            FROM alert_rule_versions
            GROUP BY rule_id
          ) v ON v.rule_id = r.rule_id
          ${whereSql}
          ORDER BY r.updated_at DESC
        `,
        params
      );
      return res.rows;
    });

    ok(
      reply,
      {
        list: rows.map((r) => ({
          ruleId: r.rule_id,
          ruleName: r.rule_name,
          scope: r.scope,
          deviceId: r.device_id,
          stationId: r.station_id,
          isActive: r.is_active,
          currentVersion: Number(r.current_version),
          updatedAt: r.updated_at
        }))
      },
      traceId
    );
  });

  app.get("/alert-rules/:ruleId", async (request, reply) => {
    const traceId = request.traceId;
    if (!(await requirePermission(adminCfg, pg, request, reply, "alert:config"))) return;
    if (!pg) {
      fail(reply, 503, "PostgreSQL 未配置", traceId);
      return;
    }

    const parseId = ruleIdSchema.safeParse((request.params as { ruleId?: unknown }).ruleId);
    if (!parseId.success) {
      fail(reply, 400, "参数错误", traceId, { field: "ruleId" });
      return;
    }
    const ruleId = parseId.data;

    const data = await withPgClient(pg, async (client) => {
      const rule = await queryOne<{
        rule_id: string;
        rule_name: string;
        description: string | null;
        scope: "device" | "station" | "global";
        device_id: string | null;
        station_id: string | null;
        is_active: boolean;
        updated_at: string;
      }>(
        client,
        `
          SELECT
            rule_id,
            rule_name,
            description,
            scope,
            device_id,
            station_id,
            is_active,
            to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at
          FROM alert_rules
          WHERE rule_id = $1
        `,
        [ruleId]
      );
      if (!rule) return null;

      const current = await queryOne<{
        rule_version: number;
        created_at: string;
        dsl_json: unknown;
      }>(
        client,
        `
          SELECT
            rule_version,
            to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
            dsl_json
          FROM alert_rule_versions
          WHERE rule_id = $1
          ORDER BY rule_version DESC
          LIMIT 1
        `,
        [ruleId]
      );

      return { rule, current };
    });

    if (!data) {
      fail(reply, 404, "资源不存在", traceId, { ruleId });
      return;
    }

    ok(
      reply,
      {
        rule: {
          ruleId: data.rule.rule_id,
          ruleName: data.rule.rule_name,
          description: data.rule.description ?? "",
          scope:
            data.rule.scope === "device"
              ? { type: "device", deviceId: data.rule.device_id ?? "" }
              : data.rule.scope === "station"
                ? { type: "station", stationId: data.rule.station_id ?? "" }
                : { type: "global" },
          isActive: data.rule.is_active,
          currentVersion: data.current?.rule_version ?? 0,
          updatedAt: data.rule.updated_at
        },
        currentVersion: data.current
          ? { version: data.current.rule_version, createdAt: data.current.created_at, dsl: data.current.dsl_json }
          : null
      },
      traceId
    );
  });

  app.post("/alert-rules", async (request, reply) => {
    const traceId = request.traceId;
    if (!(await requirePermission(adminCfg, pg, request, reply, "alert:config"))) return;
    if (!pg) {
      fail(reply, 503, "PostgreSQL 未配置", traceId);
      return;
    }

    const parseBody = createRuleRequestSchema.safeParse(request.body);
    if (!parseBody.success) {
      fail(reply, 400, "参数错误", traceId, { field: "body", issues: parseBody.error.issues });
      return;
    }

    const { rule, dsl } = parseBody.data;
    const dslCheck = await validateDsl(dsl);
    if (!dslCheck.ok) {
      fail(reply, 400, "规则 DSL 校验失败", traceId, { field: "dsl", errors: dslCheck.errors });
      return;
    }

    const dslScope = readScopeFromUnknown((dsl as { scope?: unknown }).scope);
    const bodyScope = readScopeFromUnknown(rule.scope);
    if (!dslScope || !bodyScope || dslScope.type !== bodyScope.type) {
      fail(reply, 400, "参数错误", traceId, { field: "scope", reason: "dsl.scope mismatch rule.scope" });
      return;
    }
    if (dslScope.type === "device" && bodyScope.type === "device" && dslScope.deviceId !== bodyScope.deviceId) {
      fail(reply, 400, "参数错误", traceId, { field: "scope.deviceId", reason: "dsl.scope.deviceId mismatch" });
      return;
    }
    if (dslScope.type === "station" && bodyScope.type === "station" && dslScope.stationId !== bodyScope.stationId) {
      fail(reply, 400, "参数错误", traceId, { field: "scope.stationId", reason: "dsl.scope.stationId mismatch" });
      return;
    }

    const inserted = await withPgClient(pg, async (client) => {
      const insRule = await client.query<{ rule_id: string }>(
        `
          INSERT INTO alert_rules(rule_name, description, scope, device_id, station_id, is_active)
          VALUES ($1,$2,$3,$4,$5,$6)
          RETURNING rule_id
        `,
        [
          rule.ruleName,
          rule.description ?? null,
          rule.scope.type,
          rule.scope.type === "device" ? rule.scope.deviceId ?? null : null,
          rule.scope.type === "station" ? rule.scope.stationId ?? null : null,
          rule.isActive
        ]
      );
      const r = insRule.rows[0];
      if (!r) throw new Error("insert alert_rules failed (no row returned)");

      const dslJson = dsl;
      const dslVersion = typeof dslJson.dslVersion === "number" ? dslJson.dslVersion : 1;
      const severity = normalizeSeverity(dslJson.severity);
      const enabled = typeof dslJson.enabled === "boolean" ? dslJson.enabled : true;

      await client.query(
        `
          INSERT INTO alert_rule_versions(
            rule_id, rule_version, dsl_version, dsl_json, conditions, window_json, hysteresis, severity, enabled
          )
          VALUES ($1,1,$2,$3::jsonb,$4::jsonb,$5::jsonb,$6::jsonb,$7,$8)
        `,
        [
          r.rule_id,
          dslVersion,
          JSON.stringify(dslJson),
          JSON.stringify(dslJson.when ?? {}),
          JSON.stringify(dslJson.window ?? {}),
          JSON.stringify(dslJson.hysteresis ?? {}),
          severity,
          enabled
        ]
      );

      return r.rule_id;
    });

    // Align with docs/integrations/api/06-alerts.md: create returns ruleVersion=1
    enqueueOperationLog(pg, request, {
      module: "alert",
      action: "create_rule",
      description: "create alert rule",
      status: "success",
      requestData: { ruleName: rule.ruleName, scope: rule.scope, isActive: rule.isActive },
      responseData: { ruleId: inserted, ruleVersion: 1 }
    });

    ok(reply, { ruleId: inserted, ruleVersion: 1 }, traceId);
  });

  app.put("/alert-rules/:ruleId", async (request, reply) => {
    const traceId = request.traceId;
    if (!(await requirePermission(adminCfg, pg, request, reply, "alert:config"))) return;
    if (!pg) {
      fail(reply, 503, "PostgreSQL 未配置", traceId);
      return;
    }

    const parseId = ruleIdSchema.safeParse((request.params as { ruleId?: unknown }).ruleId);
    if (!parseId.success) {
      fail(reply, 400, "参数错误", traceId, { field: "ruleId" });
      return;
    }
    const ruleId = parseId.data;

    const parseBody = updateRuleRequestSchema.safeParse(request.body);
    if (!parseBody.success) {
      fail(reply, 400, "参数错误", traceId, { field: "body", issues: parseBody.error.issues });
      return;
    }
    const { isActive } = parseBody.data;
    if (isActive === undefined) {
      fail(reply, 400, "参数错误", traceId, { field: "isActive" });
      return;
    }

    const updated = await withPgClient(pg, async (client) => {
      const res = await client.query<{ updated_at: string }>(
        `
          UPDATE alert_rules
          SET is_active = $2, updated_at = NOW()
          WHERE rule_id = $1
          RETURNING to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at
        `,
        [ruleId, isActive]
      );
      const row = res.rows[0];
      if (!row) return null;
      return { updatedAt: row.updated_at };
    });

    if (!updated) {
      fail(reply, 404, "资源不存在", traceId, { ruleId });
      return;
    }

    enqueueOperationLog(pg, request, {
      module: "alert",
      action: "update_rule",
      description: "update alert rule",
      status: "success",
      requestData: { ruleId, isActive },
      responseData: { updatedAt: updated.updatedAt }
    });

    ok(reply, { ruleId, isActive, updatedAt: updated.updatedAt }, traceId);
  });

  app.get("/alert-rules/:ruleId/versions", async (request, reply) => {
    const traceId = request.traceId;
    if (!(await requirePermission(adminCfg, pg, request, reply, "alert:config"))) return;
    if (!pg) {
      fail(reply, 503, "PostgreSQL 未配置", traceId);
      return;
    }

    const parseId = ruleIdSchema.safeParse((request.params as { ruleId?: unknown }).ruleId);
    if (!parseId.success) {
      fail(reply, 400, "参数错误", traceId, { field: "ruleId" });
      return;
    }
    const ruleId = parseId.data;

    const rows = await withPgClient(pg, async (client) => {
      const exists = await queryOne<{ ok: boolean }>(
        client,
        "SELECT TRUE AS ok FROM alert_rules WHERE rule_id=$1",
        [ruleId]
      );
      if (!exists) return null;

      const res = await client.query<{
        rule_version: number;
        dsl_version: number;
        enabled: boolean;
        severity: string;
        created_at: string;
      }>(
        `
          SELECT
            rule_version,
            dsl_version,
            enabled,
            severity,
            to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at
          FROM alert_rule_versions
          WHERE rule_id = $1
          ORDER BY rule_version DESC
        `,
        [ruleId]
      );
      return res.rows;
    });

    if (!rows) {
      fail(reply, 404, "资源不存在", traceId, { ruleId });
      return;
    }

    ok(
      reply,
      {
        ruleId,
        list: rows.map((v) => ({
          version: v.rule_version,
          dslVersion: v.dsl_version,
          enabled: v.enabled,
          severity: v.severity,
          createdAt: v.created_at,
          createdBy: ""
        }))
      },
      traceId
    );
  });

  app.get("/alert-rules/:ruleId/versions/:version", async (request, reply) => {
    const traceId = request.traceId;
    if (!(await requirePermission(adminCfg, pg, request, reply, "alert:config"))) return;
    if (!pg) {
      fail(reply, 503, "PostgreSQL 未配置", traceId);
      return;
    }

    const parseId = ruleIdSchema.safeParse((request.params as { ruleId?: unknown }).ruleId);
    if (!parseId.success) {
      fail(reply, 400, "参数错误", traceId, { field: "ruleId" });
      return;
    }
    const ruleId = parseId.data;

    const versionRaw = (request.params as { version?: unknown }).version;
    const parseVersion = z.coerce.number().int().positive().safeParse(versionRaw);
    if (!parseVersion.success) {
      fail(reply, 400, "参数错误", traceId, { field: "version" });
      return;
    }
    const version = parseVersion.data;

    const row = await withPgClient(pg, async (client) =>
      queryOne<{ rule_version: number; created_at: string; dsl_json: unknown }>(
        client,
        `
          SELECT
            rule_version,
            to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
            dsl_json
          FROM alert_rule_versions
          WHERE rule_id = $1 AND rule_version = $2
        `,
        [ruleId, version]
      )
    );

    if (!row) {
      fail(reply, 404, "资源不存在", traceId, { ruleId, version });
      return;
    }

    ok(reply, { ruleId, version: row.rule_version, createdAt: row.created_at, dsl: row.dsl_json }, traceId);
  });

  app.post("/alert-rules/:ruleId/versions", async (request, reply) => {
    const traceId = request.traceId;
    if (!(await requirePermission(adminCfg, pg, request, reply, "alert:config"))) return;
    if (!pg) {
      fail(reply, 503, "PostgreSQL 未配置", traceId);
      return;
    }

    const parseId = ruleIdSchema.safeParse((request.params as { ruleId?: unknown }).ruleId);
    if (!parseId.success) {
      fail(reply, 400, "参数错误", traceId, { field: "ruleId" });
      return;
    }
    const ruleId = parseId.data;

    const parseBody = publishVersionRequestSchema.safeParse(request.body);
    if (!parseBody.success) {
      fail(reply, 400, "参数错误", traceId, { field: "body", issues: parseBody.error.issues });
      return;
    }
    const dsl = parseBody.data.dsl;

    const dslCheck = await validateDsl(dsl);
    if (!dslCheck.ok) {
      fail(reply, 400, "规则 DSL 校验失败", traceId, { field: "dsl", errors: dslCheck.errors });
      return;
    }

    const inserted = await withPgClient(pg, async (client) => {
      const exists = await queryOne<{ ok: boolean }>(
        client,
        "SELECT TRUE AS ok FROM alert_rules WHERE rule_id=$1",
        [ruleId]
      );
      if (!exists) return null;

      const currentRow = await queryOne<{ max_version: number }>(
        client,
        "SELECT coalesce(max(rule_version), 0) AS max_version FROM alert_rule_versions WHERE rule_id=$1",
        [ruleId]
      );
      const nextVersion = (currentRow?.max_version ?? 0) + 1;

      const dslJson = dsl;
      const dslVersion = typeof dslJson.dslVersion === "number" ? dslJson.dslVersion : 1;
      const severity = normalizeSeverity(dslJson.severity);
      const enabled = typeof dslJson.enabled === "boolean" ? dslJson.enabled : true;

      await client.query(
        `
          INSERT INTO alert_rule_versions(
            rule_id, rule_version, dsl_version, dsl_json, conditions, window_json, hysteresis, severity, enabled
          )
          VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6::jsonb,$7::jsonb,$8,$9)
        `,
        [
          ruleId,
          nextVersion,
          dslVersion,
          JSON.stringify(dslJson),
          JSON.stringify(dslJson.when ?? {}),
          JSON.stringify(dslJson.window ?? {}),
          JSON.stringify(dslJson.hysteresis ?? {}),
          severity,
          enabled
        ]
      );

      await client.query("UPDATE alert_rules SET updated_at = NOW() WHERE rule_id=$1", [ruleId]);

      return nextVersion;
    });

    if (!inserted) {
      fail(reply, 404, "资源不存在", traceId, { ruleId });
      return;
    }

    // Align with docs/integrations/api/06-alerts.md: publish returns ruleVersion=N
    enqueueOperationLog(pg, request, {
      module: "alert",
      action: "publish_rule_version",
      description: "publish alert rule version",
      status: "success",
      requestData: { ruleId },
      responseData: { ruleVersion: inserted }
    });

    ok(reply, { ruleId, ruleVersion: inserted }, traceId);
  });
}
