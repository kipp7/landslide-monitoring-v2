import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppConfig } from "../config";
import { requirePermission, type AdminAuthConfig } from "../authz";
import { fail, ok } from "../http";
import type { PgPool } from "../postgres";
import { queryOne, withPgClient } from "../postgres";
import { enqueueOperationLog } from "../operation-log";

const predictionIdSchema = z.string().uuid();

const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(20),
  deviceId: z.string().uuid().optional(),
  stationId: z.string().uuid().optional(),
  modelKey: z.string().min(1).optional(),
  riskLevel: z.enum(["low", "medium", "high"]).optional(),
  startTime: z.string().datetime().optional(),
  endTime: z.string().datetime().optional()
});

const legacyAiPredictionSchema = z
  .object({
    sensorData: z.array(z.record(z.unknown())).optional()
  })
  .strict();

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

function riskLevel(score: number): "low" | "medium" | "high" {
  if (score >= 0.8) return "high";
  if (score >= 0.4) return "medium";
  return "low";
}

function nowLocalTimestamp(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  return `${String(y)}-${m}-${d} ${hh}:${mm}`;
}

function numberOrNull(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function buildLegacyPrediction(sensorData: Record<string, unknown>[]): {
  score: number;
  level: "low" | "medium" | "high";
  analysis: string;
  recommendation: string;
} {
  const latest = sensorData[0] ?? {};
  const ax = numberOrNull(latest.acceleration_x) ?? 0;
  const ay = numberOrNull(latest.acceleration_y) ?? 0;
  const az = numberOrNull(latest.acceleration_z) ?? 0;
  const humidity = numberOrNull(latest.humidity) ?? 0;

  const accelMag = Math.sqrt(ax * ax + ay * ay + az * az);
  const accelScore = clamp01(accelMag / 2);
  const humidityScore = clamp01(humidity / 100);

  const score = clamp01(accelScore * 0.7 + humidityScore * 0.3);
  const level = riskLevel(score);

  const analysis = `heuristic_legacy_v1: accel_mag=${accelMag.toFixed(4)}, humidity=${String(humidity)}`;
  const recommendation =
    level === "high"
      ? "建议立即组织现场排查，提升监测频率，并检查传感器/供电/通信状态。"
      : level === "medium"
        ? "建议提升监测频率，关注降雨/湿度变化，并持续观察趋势。"
        : "建议保持常规监测，定期巡检设备与站点环境。";

  return { score, level, analysis, recommendation };
}

type AiPredictionRow = {
  prediction_id: string;
  device_id: string;
  station_id: string | null;
  model_key: string;
  model_version: string | null;
  horizon_seconds: number;
  predicted_ts: string;
  risk_score: number;
  risk_level: "low" | "medium" | "high" | null;
  explain: string | null;
  payload: unknown;
  created_at: string;
};

async function resolveStationId(pg: PgPool, deviceId: string): Promise<string | null> {
  const row = await withPgClient(pg, async (client) =>
    queryOne<{ station_id: string | null }>(client, `SELECT station_id FROM devices WHERE device_id=$1`, [deviceId])
  );
  return row?.station_id ?? null;
}

export function registerAiPredictionRoutes(
  app: FastifyInstance,
  _config: AppConfig,
  pg: PgPool | null
): void {
  const adminCfg: AdminAuthConfig = { adminApiToken: _config.adminApiToken, jwtEnabled: Boolean(_config.jwtAccessSecret) };

  app.get("/ai/predictions", async (request, reply) => {
    const traceId = request.traceId;
    if (!(await requirePermission(adminCfg, pg, request, reply, "data:view"))) return;
    if (!pg) {
      fail(reply, 503, "PostgreSQL not configured", traceId);
      return;
    }

    const parsed = listQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) {
      fail(reply, 400, "invalid query", traceId, { field: "query", issues: parsed.error.issues });
      return;
    }

    const { page, pageSize, deviceId, stationId, modelKey, riskLevel: rl, startTime, endTime } = parsed.data;
    const offset = (page - 1) * pageSize;

    const where: string[] = [];
    const params: unknown[] = [];

    const add = (sql: string, value: unknown) => {
      params.push(value);
      where.push(sql.replace("$?", `$${String(params.length)}`));
    };

    if (deviceId) add("device_id=$?", deviceId);
    if (stationId) add("station_id=$?", stationId);
    if (modelKey) add("model_key=$?", modelKey);
    if (rl) add("risk_level=$?", rl);
    if (startTime) add("created_at >= $?", startTime);
    if (endTime) add("created_at <= $?", endTime);

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const rows = await withPgClient(pg, async (client) => {
      const res = await client.query<AiPredictionRow>(
        `
          SELECT
            prediction_id,
            device_id,
            station_id,
            model_key,
            model_version,
            horizon_seconds,
            to_char(predicted_ts AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS predicted_ts,
            risk_score,
            risk_level,
            explain,
            payload,
            to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at
          FROM ai_predictions
          ${whereSql}
          ORDER BY created_at DESC
          LIMIT $${String(params.length + 1)}
          OFFSET $${String(params.length + 2)}
        `,
        [...params, pageSize, offset]
      );
      return res.rows;
    });

    const total = await withPgClient(pg, async (client) => {
      const res = await client.query<{ total: string }>(`SELECT COUNT(1)::text AS total FROM ai_predictions ${whereSql}`, params);
      return Number(res.rows[0]?.total ?? 0);
    });

    ok(
      reply,
      {
        page,
        pageSize,
        total,
        list: rows.map((r) => ({
          predictionId: r.prediction_id,
          deviceId: r.device_id,
          stationId: r.station_id,
          modelKey: r.model_key,
          modelVersion: r.model_version,
          horizonSeconds: r.horizon_seconds,
          predictedTs: r.predicted_ts,
          riskScore: r.risk_score,
          riskLevel: r.risk_level,
          explain: r.explain,
          payload: r.payload,
          createdAt: r.created_at
        }))
      },
      traceId
    );
  });

  app.get("/ai/predictions/:predictionId", async (request, reply) => {
    const traceId = request.traceId;
    if (!(await requirePermission(adminCfg, pg, request, reply, "data:view"))) return;
    if (!pg) {
      fail(reply, 503, "PostgreSQL not configured", traceId);
      return;
    }

    const parsed = predictionIdSchema.safeParse((request.params as { predictionId?: unknown }).predictionId);
    if (!parsed.success) {
      fail(reply, 400, "invalid predictionId", traceId, { field: "predictionId" });
      return;
    }

    const predictionId = parsed.data;
    const row = await withPgClient(pg, async (client) =>
      queryOne<AiPredictionRow>(
        client,
        `
          SELECT
            prediction_id,
            device_id,
            station_id,
            model_key,
            model_version,
            horizon_seconds,
            to_char(predicted_ts AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS predicted_ts,
            risk_score,
            risk_level,
            explain,
            payload,
            to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at
          FROM ai_predictions
          WHERE prediction_id=$1
        `,
        [predictionId]
      )
    );

    if (!row) {
      fail(reply, 404, "prediction not found", traceId);
      return;
    }

    ok(
      reply,
      {
        predictionId: row.prediction_id,
        deviceId: row.device_id,
        stationId: row.station_id,
        modelKey: row.model_key,
        modelVersion: row.model_version,
        horizonSeconds: row.horizon_seconds,
        predictedTs: row.predicted_ts,
        riskScore: row.risk_score,
        riskLevel: row.risk_level,
        explain: row.explain,
        payload: row.payload,
        createdAt: row.created_at
      },
      traceId
    );
  });
}

export function registerAiPredictionLegacyCompatRoutes(app: FastifyInstance, config: AppConfig, pg: PgPool | null): void {
  const adminCfg: AdminAuthConfig = { adminApiToken: config.adminApiToken, jwtEnabled: Boolean(config.jwtAccessSecret) };

  app.post("/ai-prediction", async (request, reply) => {
    if (!(await requirePermission(adminCfg, pg, request, reply, "data:view"))) return;
    if (!pg) {
      void reply.code(503).send({ success: false, error: "PostgreSQL not configured" });
      return;
    }

    const parsed = legacyAiPredictionSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      void reply.code(400).send({ success: false, error: "invalid body" });
      return;
    }

    const sensorData = parsed.data.sensorData ?? [];
    const { score, level, analysis, recommendation } = buildLegacyPrediction(sensorData);

    const latest = sensorData[0] ?? {};
    const deviceId = typeof latest.device_id === "string" && latest.device_id.trim() ? latest.device_id.trim() : null;
    const stationId = deviceId ? await resolveStationId(pg, deviceId) : null;

    if (deviceId) {
      await withPgClient(pg, async (client) => {
        await client.query(
          `
            INSERT INTO ai_predictions (
              prediction_id,
              device_id,
              station_id,
              model_key,
              model_version,
              horizon_seconds,
              predicted_ts,
              risk_score,
              risk_level,
              explain,
              payload
            ) VALUES (
              gen_random_uuid(),
              $1,$2,'legacy_ai_prediction',NULL,0,NOW(),$3,$4,$5,$6::jsonb
            )
          `,
          [deviceId, stationId, score, level, analysis, JSON.stringify({ sensorData })]
        );
      }).catch(() => undefined);
    }

    enqueueOperationLog(pg, request, {
      module: "ai",
      action: "ai_prediction_legacy",
      description: "legacy ai prediction analysis",
      status: "success",
      requestData: { deviceId, count: sensorData.length },
      responseData: { riskScore: score, riskLevel: level }
    });

    void reply.code(200).send({
      analysis,
      result: level === "high" ? "高风险" : level === "medium" ? "中等风险" : "低风险",
      probability: `${String(Math.round(score * 100))}%`,
      timestamp: nowLocalTimestamp(),
      recommendation
    });
  });
}
