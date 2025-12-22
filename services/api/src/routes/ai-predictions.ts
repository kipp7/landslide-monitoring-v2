import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AdminAuthConfig } from "../authz";
import { requirePermission } from "../authz";
import type { AppConfig } from "../config";
import { fail, ok } from "../http";
import type { PgPool } from "../postgres";
import { queryOne, withPgClient } from "../postgres";

const predictionIdSchema = z.string().uuid();

const listPredictionsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(20),
  deviceId: z.string().uuid().optional(),
  stationId: z.string().uuid().optional(),
  modelKey: z.string().min(1).optional(),
  startTime: z.string().datetime().optional(),
  endTime: z.string().datetime().optional(),
  order: z.enum(["asc", "desc"]).default("desc")
});

type PredictionRow = {
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

function toOrderBy(order: "asc" | "desc"): "ASC" | "DESC" {
  return order === "asc" ? "ASC" : "DESC";
}

export function registerAiPredictionRoutes(app: FastifyInstance, config: AppConfig, pg: PgPool | null): void {
  const adminCfg: AdminAuthConfig = { adminApiToken: config.adminApiToken, jwtEnabled: Boolean(config.jwtAccessSecret) };

  app.get("/ai/predictions", async (request, reply) => {
    const traceId = request.traceId;
    if (!(await requirePermission(adminCfg, pg, request, reply, "data:analysis"))) return;
    if (!pg) {
      fail(reply, 503, "PostgreSQL 未配置", traceId);
      return;
    }

    const parseQuery = listPredictionsQuerySchema.safeParse(request.query);
    if (!parseQuery.success) {
      fail(reply, 400, "参数错误", traceId, { field: "query", issues: parseQuery.error.issues });
      return;
    }

    const { page, pageSize, deviceId, stationId, modelKey, startTime, endTime, order } = parseQuery.data;
    const start = startTime ? new Date(startTime) : null;
    const end = endTime ? new Date(endTime) : null;
    if (start && end && !(start < end)) {
      fail(reply, 400, "参数错误", traceId, { field: "timeRange" });
      return;
    }

    const where: string[] = [];
    const params: unknown[] = [];
    const add = (sql: string, val: unknown) => {
      params.push(val);
      where.push(sql.replaceAll("$X", "$" + String(params.length)));
    };

    if (deviceId) add("ap.device_id = $X", deviceId);
    if (stationId) add("ap.station_id = $X", stationId);
    if (modelKey) add("ap.model_key = $X", modelKey);
    if (start) add("ap.created_at >= $X", start);
    if (end) add("ap.created_at <= $X", end);

    const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
    const offset = (page - 1) * pageSize;
    const orderSql = toOrderBy(order);

    const data = await withPgClient(pg, async (client) => {
      const totalRow = await queryOne<{ total: string }>(
        client,
        `
          SELECT count(*)::text AS total
          FROM ai_predictions ap
          ${whereSql}
        `,
        params
      );
      const total = Number(totalRow?.total ?? "0");

      const res = await client.query<PredictionRow>(
        `
          SELECT
            ap.prediction_id,
            ap.device_id,
            ap.station_id,
            ap.model_key,
            ap.model_version,
            ap.horizon_seconds,
            to_char(ap.predicted_ts AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS predicted_ts,
            ap.risk_score,
            ap.risk_level,
            ap.explain,
            ap.payload,
            to_char(ap.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at
          FROM ai_predictions ap
          ${whereSql}
          ORDER BY ap.created_at ${orderSql}
          LIMIT $${String(params.length + 1)}
          OFFSET $${String(params.length + 2)}
        `,
        params.concat([pageSize, offset])
      );

      return { total, list: res.rows };
    });

    ok(reply, {
      list: data.list.map((r) => ({
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
        payload: r.payload ?? {},
        createdAt: r.created_at
      })),
      pagination: {
        page,
        pageSize,
        total: data.total,
        totalPages: Math.ceil(data.total / pageSize)
      }
    }, traceId);
  });

  app.get("/ai/predictions/:predictionId", async (request, reply) => {
    const traceId = request.traceId;
    if (!(await requirePermission(adminCfg, pg, request, reply, "data:analysis"))) return;
    if (!pg) {
      fail(reply, 503, "PostgreSQL 未配置", traceId);
      return;
    }

    const parseId = predictionIdSchema.safeParse((request.params as { predictionId?: unknown }).predictionId);
    if (!parseId.success) {
      fail(reply, 400, "参数错误", traceId, { field: "predictionId" });
      return;
    }
    const predictionId = parseId.data;

    const row = await withPgClient(pg, async (client) => {
      return queryOne<PredictionRow>(
        client,
        `
          SELECT
            ap.prediction_id,
            ap.device_id,
            ap.station_id,
            ap.model_key,
            ap.model_version,
            ap.horizon_seconds,
            to_char(ap.predicted_ts AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS predicted_ts,
            ap.risk_score,
            ap.risk_level,
            ap.explain,
            ap.payload,
            to_char(ap.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at
          FROM ai_predictions ap
          WHERE ap.prediction_id = $1
        `,
        [predictionId]
      );
    });

    if (!row) {
      fail(reply, 404, "未找到预测结果", traceId, { field: "predictionId" });
      return;
    }

    ok(reply, {
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
      payload: row.payload ?? {},
      createdAt: row.created_at
    }, traceId);
  });
}
