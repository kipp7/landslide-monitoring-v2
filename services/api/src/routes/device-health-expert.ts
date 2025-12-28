import type { ClickHouseClient } from "@clickhouse/client";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppConfig } from "../config";
import { requirePermission, type AdminAuthConfig } from "../authz";
import { fail, ok } from "../http";
import type { PgPool } from "../postgres";
import { queryOne, withPgClient } from "../postgres";
import { enqueueOperationLog } from "../operation-log";

const deviceIdSchema = z.string().uuid();

const querySchema = z.object({
  metric: z.enum(["all", "battery", "health", "signal"]).default("all"),
  forceRefresh: z.preprocess((v) => {
    if (v === "" || v === null || v === undefined) return undefined;
    if (v === "true") return true;
    if (v === "false") return false;
    return v;
  }, z.boolean().default(false))
});

const legacyQuerySchema = z.object({
  device_id: z.string().min(1),
  metric: z.enum(["all", "battery", "health", "signal"]).default("all"),
  force_refresh: z.string().optional()
});

const postSchema = z
  .object({
    action: z.enum(["recalibrate", "reset_baseline", "update_config"]),
    parameters: z.record(z.unknown()).optional()
  })
  .strict();

type MetricMap = Record<string, unknown>;

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function getFirstMetric(metrics: MetricMap, keys: string[]): number | null {
  for (const k of keys) {
    if (Object.prototype.hasOwnProperty.call(metrics, k)) {
      const v = num((metrics as Record<string, unknown>)[k]);
      if (v !== null) return v;
    }
  }
  return null;
}

function clamp01(x: number): number {
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

function mapVoltageToSocPercent(voltage: number): number {
  // Very rough Li-ion mapping: 3.0V -> 0%, 4.2V -> 100%
  const p = clamp01((voltage - 3.0) / (4.2 - 3.0));
  return Math.round(p * 100);
}

function mapRssiToStrengthPercent(rssi: number): number {
  // Rough mapping: -110 -> 0, -50 -> 100
  const p = clamp01((rssi - -110) / (-50 - -110));
  return Math.round(p * 100);
}

function levelFromScore(score: number): "good" | "warn" | "bad" {
  if (score >= 80) return "good";
  if (score >= 50) return "warn";
  return "bad";
}

type ExpertBattery = {
  soc: number;
  voltage: number | null;
  temperatureC: number | null;
  confidence: number;
  warnings: string[];
};

type ExpertSignal = {
  rssi: number | null;
  strength: number;
  confidence: number;
  warnings: string[];
};

type ExpertHealth = {
  score: number;
  level: "good" | "warn" | "bad";
  components: { batteryScore: number; signalScore: number; dataFreshnessScore: number };
  warnings: string[];
};

type ExpertResult = {
  deviceId: string;
  timestamp: string;
  analysisType: string;
  battery?: ExpertBattery | undefined;
  signal?: ExpertSignal | undefined;
  health?: ExpertHealth | undefined;
  metadata: {
    apiVersion: string;
    analysisMethod: string;
    calculationTime: string;
    cacheUsed: boolean;
  };
};

type DeviceStateRow = {
  state: unknown;
  updated_at: string;
};

async function loadLatestState(
  config: AppConfig,
  ch: ClickHouseClient,
  pg: PgPool,
  deviceId: string
): Promise<{ updatedAt: string; metrics: MetricMap }> {
  const row = await withPgClient(pg, async (client) =>
    queryOne<DeviceStateRow>(
      client,
      `
        SELECT
          state,
          to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at
        FROM device_state
        WHERE device_id = $1
      `,
      [deviceId]
    )
  );

  if (row?.state && typeof row.state === "object") {
    const s = row.state as { metrics?: unknown };
    const metrics = s.metrics && typeof s.metrics === "object" ? (s.metrics as MetricMap) : {};
    return { updatedAt: row.updated_at, metrics };
  }

  // Fallback to ClickHouse latest aggregation (same as /data/state)
  const sql = `
    SELECT
      sensor_key,
      toString(max(received_ts)) AS latest_ts,
      argMax(value_f64, received_ts) AS value_f64,
      argMax(value_i64, received_ts) AS value_i64,
      argMax(value_str, received_ts) AS value_str,
      argMax(value_bool, received_ts) AS value_bool
    FROM ${config.clickhouseDatabase}.${config.clickhouseTable}
    WHERE device_id = {deviceId:String}
    GROUP BY sensor_key
  `;

  const result = await ch.query({ query: sql, query_params: { deviceId }, format: "JSONEachRow" });
  const rows: {
    sensor_key: string;
    latest_ts: string;
    value_f64: number | null;
    value_i64: number | null;
    value_str: string | null;
    value_bool: number | null;
  }[] = await result.json();

  if (rows.length === 0) {
    const err = new Error("device state not found");
    (err as { statusCode?: number }).statusCode = 404;
    throw err;
  }

  const metrics: MetricMap = {};
  let updatedAt: string | null = null;
  for (const r of rows) {
    const v =
      r.value_f64 ?? r.value_i64 ?? (r.value_bool != null ? r.value_bool === 1 : null) ?? r.value_str ?? null;
    metrics[r.sensor_key] = v;
    if (!updatedAt || r.latest_ts > updatedAt) updatedAt = r.latest_ts;
  }

  return { updatedAt: updatedAt ?? new Date().toISOString(), metrics };
}

function computeBattery(metrics: MetricMap): ExpertBattery {
  const warnings: string[] = [];

  const voltage = getFirstMetric(metrics, ["battery_voltage", "vbat", "voltage", "bat_voltage"]);
  const temp = getFirstMetric(metrics, ["battery_temp", "temperature", "temp_c"]);
  const socRaw = getFirstMetric(metrics, ["battery_soc", "soc", "battery_level", "battery_percent"]);

  let soc = socRaw != null ? Math.round(socRaw) : null;
  if (soc === null && voltage != null) soc = mapVoltageToSocPercent(voltage);
  soc ??= 0;
  if (soc < 0) soc = 0;
  if (soc > 100) soc = 100;

  if (voltage != null && (voltage < 3.0 || voltage > 4.35)) warnings.push("battery voltage out of typical range");
  if (temp != null && (temp < -20 || temp > 60)) warnings.push("battery temperature out of range");
  if (soc <= 15) warnings.push("battery low");

  const confidence =
    (socRaw != null ? 0.5 : 0) + (voltage != null ? 0.3 : 0) + (temp != null ? 0.2 : 0);

  return {
    soc,
    voltage,
    temperatureC: temp,
    confidence: Math.round(confidence * 100) / 100,
    warnings
  };
}

function computeSignal(metrics: MetricMap): ExpertSignal {
  const warnings: string[] = [];
  const rssi = getFirstMetric(metrics, ["wifi_rssi", "rssi", "signal_rssi", "cell_rssi"]);

  const strength = rssi != null ? mapRssiToStrengthPercent(rssi) : 0;
  if (rssi != null && rssi < -95) warnings.push("signal weak");
  if (rssi == null) warnings.push("signal metrics missing");

  const confidence = rssi != null ? 0.8 : 0.2;
  return { rssi, strength, confidence, warnings };
}

function computeHealth(updatedAtIso: string, battery: ExpertBattery, signal: ExpertSignal): ExpertHealth {
  const warnings: string[] = [];

  const now = Date.now();
  const updatedMs = Date.parse(updatedAtIso);
  const ageMs = Number.isFinite(updatedMs) ? Math.max(0, now - updatedMs) : 0;
  const ageMin = ageMs / 60000;

  let dataFreshnessScore = 100;
  if (ageMin > 60) dataFreshnessScore = 0;
  else if (ageMin > 15) dataFreshnessScore = 40;
  else if (ageMin > 5) dataFreshnessScore = 70;

  if (ageMin > 15) warnings.push("data stale");

  const batteryScore = battery.soc; // 0..100
  const signalScore = signal.strength; // 0..100

  const score = Math.round(0.4 * batteryScore + 0.3 * signalScore + 0.3 * dataFreshnessScore);
  const level = levelFromScore(score);
  warnings.push(...battery.warnings, ...signal.warnings);

  return { score, level, components: { batteryScore, signalScore, dataFreshnessScore }, warnings };
}

function analysisType(metric: "all" | "battery" | "health" | "signal"): string {
  if (metric === "battery") return "expert_battery_soc";
  if (metric === "signal") return "expert_signal_quality";
  if (metric === "health") return "expert_device_health";
  return "expert_comprehensive_health";
}

type StoredRunRow = {
  run_id: string;
  metric: string;
  result: unknown;
  created_at: string;
};

async function maybeGetCachedRun(
  pg: PgPool,
  deviceId: string,
  metric: string,
  ttlMs: number
): Promise<StoredRunRow | null> {
  return withPgClient(pg, async (client) => {
    const row = await queryOne<StoredRunRow>(
      client,
      `
        SELECT
          run_id,
          metric,
          result,
          to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at
        FROM device_health_expert_runs
        WHERE device_id=$1 AND metric=$2
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [deviceId, metric]
    );
    if (!row) return null;
    const createdMs = Date.parse(row.created_at);
    if (!Number.isFinite(createdMs)) return null;
    if (Date.now() - createdMs > ttlMs) return null;
    return row;
  });
}

async function saveRun(pg: PgPool, deviceId: string, metric: string, result: unknown, traceId: string): Promise<string> {
  return withPgClient(pg, async (client) => {
    const row = await queryOne<{ run_id: string }>(
      client,
      `
        INSERT INTO device_health_expert_runs (device_id, metric, result, trace_id)
        VALUES ($1, $2, $3::jsonb, $4)
        RETURNING run_id
      `,
      [deviceId, metric, JSON.stringify(result), traceId]
    );
    return row?.run_id ?? "";
  });
}

async function ensureDeviceExists(pg: PgPool, deviceId: string): Promise<boolean> {
  const row = await withPgClient(pg, async (client) =>
    queryOne<{ device_id: string }>(
      client,
      `SELECT device_id FROM devices WHERE device_id = $1 AND status != 'revoked'`,
      [deviceId]
    )
  );
  return Boolean(row?.device_id);
}

function withCacheUsed(result: unknown): unknown {
  if (!result || typeof result !== "object") return result;
  const obj = result as Record<string, unknown>;
  const metadata = obj.metadata;
  if (!metadata || typeof metadata !== "object") return result;
  return { ...obj, metadata: { ...(metadata as Record<string, unknown>), cacheUsed: true } };
}

async function resolveLegacyDeviceId(pg: PgPool, input: string): Promise<string | null> {
  const asUuid = deviceIdSchema.safeParse(input);
  if (asUuid.success) return asUuid.data;

  return withPgClient(pg, async (client) => {
    const row = await queryOne<{ device_id: string }>(
      client,
      `
        SELECT device_id
        FROM devices
        WHERE status != 'revoked'
          AND (
            metadata->>'legacy_device_id' = $1
            OR metadata#>>'{externalIds,legacy}' = $1
            OR device_name = $1
          )
        LIMIT 1
      `,
      [input]
    );
    return row?.device_id ?? null;
  });
}

export function registerDeviceHealthExpertRoutes(
  app: FastifyInstance,
  config: AppConfig,
  ch: ClickHouseClient,
  pg: PgPool | null
): void {
  const adminCfg: AdminAuthConfig = { adminApiToken: config.adminApiToken, jwtEnabled: Boolean(config.jwtAccessSecret) };

  app.get("/devices/:deviceId/health/expert", async (request, reply) => {
    const traceId = request.traceId;
    if (!(await requirePermission(adminCfg, pg, request, reply, "data:view"))) return;
    if (!pg) {
      fail(reply, 503, "PostgreSQL not configured", traceId);
      return;
    }

    const parseId = deviceIdSchema.safeParse((request.params as { deviceId?: unknown }).deviceId);
    if (!parseId.success) {
      fail(reply, 400, "invalid deviceId", traceId, { field: "deviceId" });
      return;
    }
    const deviceId = parseId.data;

    const parseQuery = querySchema.safeParse(request.query ?? {});
    if (!parseQuery.success) {
      fail(reply, 400, "invalid query", traceId, { field: "query", issues: parseQuery.error.issues });
      return;
    }

    if (!(await ensureDeviceExists(pg, deviceId))) {
      fail(reply, 404, "device not found", traceId, { deviceId });
      return;
    }

    const metric = parseQuery.data.metric;
    const forceRefresh = parseQuery.data.forceRefresh;

    const ttlMs = metric === "battery" ? 2 * 60_000 : metric === "signal" ? 60_000 : 5 * 60_000;

    if (!forceRefresh) {
      const cached = await maybeGetCachedRun(pg, deviceId, metric, ttlMs);
      if (cached) {
        ok(
          reply,
          { deviceId, metric, runId: cached.run_id, result: withCacheUsed(cached.result), cachedAt: cached.created_at },
          traceId
        );
        return;
      }
    }

    try {
      const latest = await loadLatestState(config, ch, pg, deviceId);
      const battery = computeBattery(latest.metrics);
      const signal = computeSignal(latest.metrics);
      const health = computeHealth(latest.updatedAt, battery, signal);

      const out: ExpertResult = {
        deviceId,
        timestamp: new Date().toISOString(),
        analysisType: analysisType(metric),
        ...(metric === "battery" ? { battery } : {}),
        ...(metric === "signal" ? { signal } : {}),
        ...(metric === "health" ? { health } : {}),
        ...(metric === "all" ? { battery, signal, health } : {}),
        metadata: {
          apiVersion: "2.0.0",
          analysisMethod: "heuristic_expert_v1",
          calculationTime: new Date().toISOString(),
          cacheUsed: false
        }
      };

      const runId = await saveRun(pg, deviceId, metric, out, traceId);

      enqueueOperationLog(pg, request, {
        module: "device",
        action: "device_health_expert_run",
        description: "device health expert assessment",
        status: "success",
        requestData: { deviceId, metric, forceRefresh },
        responseData: { runId, analysisType: out.analysisType }
      });

      ok(reply, { deviceId, metric, runId, result: out }, traceId);
    } catch (err) {
      const pgCode = typeof (err as { code?: unknown }).code === "string" ? (err as { code: string }).code : "";
      if (pgCode === "23503") {
        fail(reply, 404, "device not found", traceId, { deviceId });
        return;
      }
      const statusCode =
        typeof (err as { statusCode?: unknown }).statusCode === "number"
          ? (err as { statusCode: number }).statusCode
          : 500;
      fail(reply, statusCode, "expert analysis failed", traceId, { message: err instanceof Error ? err.message : String(err) });
    }
  });

  app.get("/devices/:deviceId/health/expert/history", async (request, reply) => {
    const traceId = request.traceId;
    if (!(await requirePermission(adminCfg, pg, request, reply, "data:view"))) return;
    if (!pg) {
      fail(reply, 503, "PostgreSQL not configured", traceId);
      return;
    }

    const parseId = deviceIdSchema.safeParse((request.params as { deviceId?: unknown }).deviceId);
    if (!parseId.success) {
      fail(reply, 400, "invalid deviceId", traceId, { field: "deviceId" });
      return;
    }
    const deviceId = parseId.data;

    if (!(await ensureDeviceExists(pg, deviceId))) {
      fail(reply, 404, "device not found", traceId, { deviceId });
      return;
    }

    const query = (request.query ?? {}) as { limit?: unknown; metric?: unknown };
    const limit = z.coerce.number().int().min(1).max(200).default(50).safeParse(query.limit);
    const metric = z.enum(["all", "battery", "health", "signal"]).optional().safeParse(query.metric);

    const rows = await withPgClient(pg, async (client) => {
      const appliedLimit = limit.success ? limit.data : 50;

      if (metric.success && metric.data) {
        const res = await client.query(
          `
            SELECT
              run_id,
              metric,
              result,
              to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at
            FROM device_health_expert_runs
            WHERE device_id=$1 AND metric=$2
            ORDER BY created_at DESC
            LIMIT $3
          `,
          [deviceId, metric.data, appliedLimit]
        );
        return res.rows as { run_id: string; metric: string; result: unknown; created_at: string }[];
      }

      const res = await client.query(
        `
          SELECT
            run_id,
            metric,
            result,
            to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at
          FROM device_health_expert_runs
          WHERE device_id=$1
          ORDER BY created_at DESC
          LIMIT $2
        `,
        [deviceId, appliedLimit]
      );
      return res.rows as { run_id: string; metric: string; result: unknown; created_at: string }[];
    });

    ok(reply, { deviceId, list: rows.map((r) => ({ runId: r.run_id, metric: r.metric, createdAt: r.created_at, result: r.result })) }, traceId);
  });

  app.post("/devices/:deviceId/health/expert", async (request, reply) => {
    const traceId = request.traceId;
    if (!(await requirePermission(adminCfg, pg, request, reply, "system:config"))) return;
    if (!pg) {
      fail(reply, 503, "PostgreSQL not configured", traceId);
      return;
    }

    const parseId = deviceIdSchema.safeParse((request.params as { deviceId?: unknown }).deviceId);
    if (!parseId.success) {
      fail(reply, 400, "invalid deviceId", traceId, { field: "deviceId" });
      return;
    }
    const deviceId = parseId.data;

    if (!(await ensureDeviceExists(pg, deviceId))) {
      fail(reply, 404, "device not found", traceId, { deviceId });
      return;
    }

    const parseBody = postSchema.safeParse(request.body);
    if (!parseBody.success) {
      fail(reply, 400, "invalid body", traceId, { field: "body", issues: parseBody.error.issues });
      return;
    }

    const { action, parameters } = parseBody.data;

    try {
      const actionId = await withPgClient(pg, async (client) => {
        const row = await queryOne<{ action_id: string }>(
          client,
          `
            INSERT INTO device_health_expert_actions (device_id, action, parameters, trace_id)
            VALUES ($1, $2, $3::jsonb, $4)
            RETURNING action_id
          `,
          [deviceId, action, JSON.stringify(parameters ?? {}), traceId]
        );

        if (action === "recalibrate") {
          await client.query(`DELETE FROM device_health_expert_runs WHERE device_id=$1`, [deviceId]);
        }

        if (action === "update_config") {
          await client.query(
            `
              UPDATE devices
              SET metadata = jsonb_set(metadata, '{health_expert_config}', $2::jsonb, true),
                  updated_at = NOW()
              WHERE device_id = $1
            `,
            [deviceId, JSON.stringify(parameters ?? {})]
          );
        }

        return row?.action_id ?? "";
      });

      enqueueOperationLog(pg, request, {
        module: "device",
        action: "device_health_expert_action",
        description: "device health expert action",
        status: "success",
        requestData: { deviceId, action, parameters },
        responseData: { actionId }
      });

      ok(reply, { deviceId, action, actionId, parameters: parameters ?? {}, message: "ok" }, traceId);
    } catch (err) {
      const pgCode = typeof (err as { code?: unknown }).code === "string" ? (err as { code: string }).code : "";
      if (pgCode === "23503") {
        fail(reply, 404, "device not found", traceId);
        return;
      }
      fail(reply, 500, "expert action failed", traceId, { message: err instanceof Error ? err.message : String(err) });
    }
  });
}

export function registerDeviceHealthExpertLegacyCompatRoutes(
  app: FastifyInstance,
  config: AppConfig,
  ch: ClickHouseClient,
  pg: PgPool | null
): void {
  const adminCfg: AdminAuthConfig = { adminApiToken: config.adminApiToken, jwtEnabled: Boolean(config.jwtAccessSecret) };

  app.get("/device-health-expert", async (request, reply) => {
    if (!pg) {
      const parsed = legacyQuerySchema.safeParse(request.query ?? {});
      if (!parsed.success) {
        void reply.code(400).send({ success: false, error: "invalid query" });
        return;
      }

      const nowIso = new Date().toISOString();
      const metric = parsed.data.metric;
      const battery = computeBattery({});
      const signal = computeSignal({});
      const health = computeHealth(nowIso, battery, signal);
      const out: ExpertResult = {
        deviceId: parsed.data.device_id,
        timestamp: nowIso,
        analysisType: analysisType(metric),
        ...(metric === "battery" ? { battery } : {}),
        ...(metric === "signal" ? { signal } : {}),
        ...(metric === "health" ? { health } : {}),
        ...(metric === "all" ? { battery, signal, health } : {}),
        metadata: {
          apiVersion: "2.0.0",
          analysisMethod: "fallback_no_pg",
          calculationTime: nowIso,
          cacheUsed: false
        }
      };

      void reply.code(200).send({ success: true, data: out, timestamp: nowIso, is_fallback: true });
      return;
    }

    if (!(await requirePermission(adminCfg, pg, request, reply, "data:view"))) return;

    const parsed = legacyQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) {
      void reply.code(400).send({ success: false, error: "invalid query" });
      return;
    }

    const resolved = await resolveLegacyDeviceId(pg, parsed.data.device_id);
    if (!resolved) {
      void reply.code(404).send({ success: false, error: "device not mapped", hint: "use UUID or map legacy id in devices.metadata" });
      return;
    }

    try {
      const metric = parsed.data.metric;
      const forceRefresh = parsed.data.force_refresh === "true";
      const ttlMs = metric === "battery" ? 2 * 60_000 : metric === "signal" ? 60_000 : 5 * 60_000;

      if (!forceRefresh) {
        const cached = await maybeGetCachedRun(pg, resolved, metric, ttlMs);
        if (cached?.result && typeof cached.result === "object") {
          const r = cached.result as ExpertResult;
          const out: ExpertResult = {
            ...r,
            metadata: { ...r.metadata, cacheUsed: true }
          };
          void reply.code(200).send({ success: true, data: out, timestamp: new Date().toISOString() });
          return;
        }
      }

      const latest = await loadLatestState(config, ch, pg, resolved);
      const battery = computeBattery(latest.metrics);
      const signal = computeSignal(latest.metrics);
      const health = computeHealth(latest.updatedAt, battery, signal);
      const out: ExpertResult = {
        deviceId: resolved,
        timestamp: new Date().toISOString(),
        analysisType: analysisType(metric),
        ...(metric === "battery" ? { battery } : {}),
        ...(metric === "signal" ? { signal } : {}),
        ...(metric === "health" ? { health } : {}),
        ...(metric === "all" ? { battery, signal, health } : {}),
        metadata: {
          apiVersion: "2.0.0",
          analysisMethod: "heuristic_expert_v1",
          calculationTime: new Date().toISOString(),
          cacheUsed: false
        }
      };

      await saveRun(pg, resolved, metric, out, request.traceId);

      void reply.code(200).send({ success: true, data: out, timestamp: new Date().toISOString() });
    } catch (err) {
      void reply
        .code(500)
        .send({ success: false, error: "expert analysis failed", details: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post("/device-health-expert", async (request, reply) => {
    if (!pg) {
      const parsed = z
        .object({
          deviceId: z.string().min(1),
          action: postSchema.shape.action,
          parameters: postSchema.shape.parameters.optional()
        })
        .strict()
        .safeParse(request.body);
      if (!parsed.success) {
        void reply.code(400).send({ success: false, error: "invalid body" });
        return;
      }

      const nowIso = new Date().toISOString();
      const actionId = `fallback-${parsed.data.action}-${String(Date.now())}`;
      void reply.code(200).send({
        success: true,
        data: {
          deviceId: parsed.data.deviceId,
          action: parsed.data.action,
          parameters: parsed.data.parameters ?? {},
          actionId
        },
        timestamp: nowIso,
        is_fallback: true
      });
      return;
    }

    if (!(await requirePermission(adminCfg, pg, request, reply, "system:config"))) return;

    const parsed = z
      .object({
        deviceId: z.string().min(1),
        action: postSchema.shape.action,
        parameters: postSchema.shape.parameters.optional()
      })
      .strict()
      .safeParse(request.body);
    if (!parsed.success) {
      void reply.code(400).send({ success: false, error: "invalid body" });
      return;
    }

    const resolved = await resolveLegacyDeviceId(pg, parsed.data.deviceId);
    if (!resolved) {
      void reply.code(404).send({ success: false, error: "device not mapped" });
      return;
    }

    try {
      const actionId = await withPgClient(pg, async (client) => {
        const row = await queryOne<{ action_id: string }>(
          client,
          `
            INSERT INTO device_health_expert_actions (device_id, action, parameters, trace_id)
            VALUES ($1, $2, $3::jsonb, $4)
            RETURNING action_id
          `,
          [resolved, parsed.data.action, JSON.stringify(parsed.data.parameters ?? {}), request.traceId]
        );

        if (parsed.data.action === "recalibrate") {
          await client.query(`DELETE FROM device_health_expert_runs WHERE device_id=$1`, [resolved]);
        }

        if (parsed.data.action === "update_config") {
          await client.query(
            `
              UPDATE devices
              SET metadata = jsonb_set(metadata, '{health_expert_config}', $2::jsonb, true),
                  updated_at = NOW()
              WHERE device_id = $1
            `,
            [resolved, JSON.stringify(parsed.data.parameters ?? {})]
          );
        }

        return row?.action_id ?? "";
      });

      void reply.code(200).send({
        success: true,
        data: { deviceId: resolved, action: parsed.data.action, parameters: parsed.data.parameters ?? {}, actionId },
        timestamp: new Date().toISOString()
      });
    } catch (err) {
      void reply
        .code(500)
        .send({ success: false, error: "expert action failed", details: err instanceof Error ? err.message : String(err) });
    }
  });
}
