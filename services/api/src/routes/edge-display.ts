import type { FastifyInstance } from "fastify";
import { promises as fs } from "node:fs";
import type { AppConfig } from "../config";
import { fail, ok } from "../http";
import type { PgPool } from "../postgres";
import { withPgClient } from "../postgres";

type JsonObject = Record<string, unknown>;

type StationRow = {
  station_id: string;
  station_code: string;
  station_name: string;
  status: string;
  device_count: number | string;
  online_device_count: number | string;
  latest_device_seen_at: string | null;
};

type ModelOverviewRow = {
  persisted_version_count: number | string;
  predictions_24h: number | string;
  latest_prediction_at: string | null;
};

type PredictionRow = {
  device_id: string;
  model_version: string | null;
  horizon_seconds: number | string;
  risk_score: number | string;
  risk_level: string | null;
  payload: unknown;
  created_at: string;
};

type TrendRow = {
  bucket_at: string;
  risk_score: number | string;
  hard_rule_triggered: boolean;
};

type VersionRow = {
  model_version: string;
  first_prediction_at: string;
  last_prediction_at: string;
  prediction_count: number | string;
};

type FeatureSummary = {
  key: string;
  label: string;
  unit: string | null;
  value: number | null;
  score: number | null;
  weight: number | null;
  contribution: number | null;
  available: boolean;
};

export type EdgeDisplayModelSummary = {
  generatedAt: string;
  station: {
    code: string;
    name: string;
    status: string;
    deviceCount: number;
    onlineDeviceCount: number;
    latestDeviceSeenAt: string | null;
  };
  model: {
    key: string;
    version: string | null;
    type: string | null;
    trainedAt: string | null;
    trainingWindowHours: number | null;
    trainingSource: string | null;
    sampleCount: number | null;
    deviceCount: number | null;
    persistedVersionCount: number;
    predictions24h: number;
    latestPredictionAt: string | null;
    versionHistory: Array<{
      version: string;
      firstPredictionAt: string;
      lastPredictionAt: string;
      predictionCount: number;
    }>;
  };
  currentAssessment: {
    riskScore: number | null;
    riskLevel: string | null;
    confidence: number | null;
    dataStatus: string | null;
    dataUpdatedAt: string | null;
    assessedAt: string | null;
    horizonSeconds: number | null;
    hardRuleTriggered: boolean | null;
    executionPolicy: string | null;
    availableFeatureCount: number;
    totalFeatureCount: number;
    sourceDeviceCount: number;
    factors: string[];
    features: FeatureSummary[];
  };
  riskTrend24h: Array<{ at: string; riskScore: number; hardRuleTriggered: boolean }>;
  evaluation: {
    currentStation: {
      status: "not_evaluated";
      label: "未评估";
      reason: string;
    };
    regionalReference: JsonObject | null;
  };
  displacementForecast: {
    status: "unavailable";
    label: "不可用";
    reason: string;
    missingInputs: string[];
  };
  provenance: {
    predictionStore: string;
    modelArtifact: string;
    regionalEvaluation: string;
  };
};

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function numberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function count(value: unknown): number {
  return Math.max(0, Math.round(numberOrNull(value) ?? 0));
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function booleanOrNull(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function parseFeatures(value: unknown): FeatureSummary[] {
  if (!Array.isArray(value)) return [];
  const features = value.flatMap((item) => {
    if (!isObject(item)) return [];
    const key = stringOrNull(item.key);
    const label = stringOrNull(item.label);
    if (!key || !label) return [];
    const score = numberOrNull(item.score);
    const weight = numberOrNull(item.weight);
    return [{
      key,
      label,
      unit: stringOrNull(item.unit),
      value: numberOrNull(item.value),
      score,
      weight,
      contribution: null,
      available: item.available === true,
    }];
  });
  const availableWeight = features.reduce(
    (sum, feature) => feature.available ? sum + (feature.weight ?? 0) : sum,
    0
  );
  return features.map((feature) => ({
    ...feature,
    contribution:
      feature.available &&
      feature.score !== null &&
      feature.weight !== null &&
      availableWeight > 0
        ? (feature.score * feature.weight) / availableWeight
        : null,
  }));
}

async function readJsonObject(path: string): Promise<JsonObject | null> {
  try {
    const parsed: unknown = JSON.parse(await fs.readFile(path, "utf8"));
    return isObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function normalizedRegionalReference(value: JsonObject | null): JsonObject | null {
  if (!value || !isObject(value.metrics)) return null;
  const evaluatedSamples = numberOrNull(value.evaluatedSamples);
  const metrics = value.metrics;
  const normalizedMetrics = {
    maeMm: numberOrNull(metrics.maeMm),
    rmseMm: numberOrNull(metrics.rmseMm),
    r2: numberOrNull(metrics.r2),
    directionAccuracy: numberOrNull(metrics.directionAccuracy),
    withinOneMm: numberOrNull(metrics.withinOneMm),
    p90AbsoluteErrorMm: numberOrNull(metrics.p90AbsoluteErrorMm),
  };
  if (!stringOrNull(value.modelKey) || !stringOrNull(value.modelVersion) || evaluatedSamples === null) return null;
  return {
    displayName: stringOrNull(value.displayName),
    modelKey: stringOrNull(value.modelKey),
    modelVersion: stringOrNull(value.modelVersion),
    role: stringOrNull(value.role),
    evaluationScope: stringOrNull(value.evaluationScope),
    evaluatedSamples: Math.round(evaluatedSamples),
    metrics: normalizedMetrics,
    provenance: isObject(value.provenance) ? value.provenance : {},
  };
}

function latestAssessment(rows: PredictionRow[]) {
  const selected = rows.reduce<PredictionRow | null>((worst, row) => {
    if (!worst) return row;
    return (numberOrNull(row.risk_score) ?? -1) > (numberOrNull(worst.risk_score) ?? -1) ? row : worst;
  }, null);
  const payload = isObject(selected?.payload) ? selected.payload : {};
  const features = parseFeatures(payload.features);
  const missingInputs = features.filter((feature) => !feature.available).map((feature) => feature.label);
  return {
    selected,
    payload,
    features,
    missingInputs,
  };
}

export function isEdgeDisplayReadRequest(
  config: Pick<AppConfig, "edgeDisplayReadToken">,
  url: string,
  authorization: string | undefined
): boolean {
  if (!url.startsWith("/api/v1/edge-display/")) return false;
  const expected = config.edgeDisplayReadToken;
  if (!expected || !authorization?.startsWith("Bearer ")) return false;
  return authorization.slice("Bearer ".length).trim() === expected;
}

export async function buildEdgeDisplayModelSummary(input: {
  config: AppConfig;
  pg: PgPool;
  now?: Date;
}): Promise<EdgeDisplayModelSummary> {
  const { config, pg } = input;
  const now = input.now ?? new Date();
  const database = await withPgClient(pg, async (client) => {
    const stationResult = await client.query<StationRow>(
      `
        SELECT
          s.station_id::text,
          s.station_code,
          s.station_name,
          s.status,
          COUNT(d.device_id)::text AS device_count,
          COUNT(d.device_id) FILTER (WHERE d.last_seen_at >= NOW() - INTERVAL '5 minutes')::text AS online_device_count,
          CASE WHEN MAX(d.last_seen_at) IS NULL THEN NULL
            ELSE to_char(MAX(d.last_seen_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
          END AS latest_device_seen_at
        FROM stations s
        LEFT JOIN devices d ON d.station_id = s.station_id
        WHERE s.station_code = $1
        GROUP BY s.station_id, s.station_code, s.station_name, s.status
      `,
      [config.edgeDisplayStationCode]
    );
    const station = stationResult.rows[0];
    if (!station) throw new Error(`edge display station not found: ${config.edgeDisplayStationCode}`);

    const overviewResult = await client.query<ModelOverviewRow>(
      `
        SELECT
          COUNT(DISTINCT model_version) FILTER (WHERE model_version IS NOT NULL)::text AS persisted_version_count,
          COUNT(*) FILTER (
            WHERE station_id = $2::uuid AND created_at >= NOW() - INTERVAL '24 hours'
          )::text AS predictions_24h,
          CASE WHEN MAX(created_at) FILTER (WHERE station_id = $2::uuid) IS NULL THEN NULL
            ELSE to_char(
              MAX(created_at) FILTER (WHERE station_id = $2::uuid) AT TIME ZONE 'UTC',
              'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
            )
          END AS latest_prediction_at
        FROM ai_predictions
        WHERE model_key = $1
      `,
      [config.edgeDisplayModelKey, station.station_id]
    );

    const predictionsResult = await client.query<PredictionRow>(
      `
        SELECT DISTINCT ON (p.device_id)
          p.device_id::text,
          p.model_version,
          p.horizon_seconds,
          p.risk_score,
          p.risk_level,
          p.payload,
          to_char(p.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at
        FROM ai_predictions p
        WHERE p.station_id = $1::uuid AND p.model_key = $2
        ORDER BY p.device_id, p.created_at DESC
      `,
      [station.station_id, config.edgeDisplayModelKey]
    );

    const trendResult = await client.query<TrendRow>(
      `
        SELECT
          to_char(date_trunc('hour', created_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS bucket_at,
          MAX(risk_score) AS risk_score,
          BOOL_OR(payload->'hardRuleTriggered' = 'true'::jsonb) AS hard_rule_triggered
        FROM ai_predictions
        WHERE station_id = $1::uuid
          AND model_key = $2
          AND created_at >= NOW() - INTERVAL '24 hours'
        GROUP BY date_trunc('hour', created_at)
        ORDER BY date_trunc('hour', created_at)
      `,
      [station.station_id, config.edgeDisplayModelKey]
    );

    const versionsResult = await client.query<VersionRow>(
      `
        SELECT
          model_version,
          to_char(MIN(created_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS first_prediction_at,
          to_char(MAX(created_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS last_prediction_at,
          COUNT(*)::text AS prediction_count
        FROM ai_predictions
        WHERE model_key = $1 AND model_version IS NOT NULL
        GROUP BY model_version
        ORDER BY MAX(created_at) DESC
        LIMIT 8
      `,
      [config.edgeDisplayModelKey]
    );

    return {
      station,
      overview: overviewResult.rows[0] ?? null,
      predictions: predictionsResult.rows,
      trend: trendResult.rows,
      versions: versionsResult.rows,
    };
  });

  const [artifact, regionalRaw] = await Promise.all([
    readJsonObject(config.edgeModelArtifactPath),
    readJsonObject(config.regionalModelEvaluationPath),
  ]);
  const regionalReference = normalizedRegionalReference(regionalRaw);
  const assessment = latestAssessment(database.predictions);
  const payload = assessment.payload;
  const selected = assessment.selected;
  const artifactVersion = stringOrNull(artifact?.modelVersion);
  const selectedVersion = stringOrNull(selected?.model_version);
  const availableFeatureCount = assessment.features.filter((feature) => feature.available).length;
  const overview = database.overview;

  return {
    generatedAt: now.toISOString(),
    station: {
      code: database.station.station_code,
      name: database.station.station_name,
      status: database.station.status,
      deviceCount: count(database.station.device_count),
      onlineDeviceCount: count(database.station.online_device_count),
      latestDeviceSeenAt: database.station.latest_device_seen_at,
    },
    model: {
      key: stringOrNull(artifact?.modelKey) ?? config.edgeDisplayModelKey,
      version: artifactVersion ?? selectedVersion,
      type: stringOrNull(artifact?.modelType),
      trainedAt: stringOrNull(artifact?.trainedAt),
      trainingWindowHours: numberOrNull(artifact?.trainingWindowHours),
      trainingSource: stringOrNull(artifact?.trainingSource),
      sampleCount: numberOrNull(artifact?.sampleCount),
      deviceCount: numberOrNull(artifact?.deviceCount),
      persistedVersionCount: count(overview?.persisted_version_count),
      predictions24h: count(overview?.predictions_24h),
      latestPredictionAt: overview?.latest_prediction_at ?? null,
      versionHistory: database.versions.map((row) => ({
        version: row.model_version,
        firstPredictionAt: row.first_prediction_at,
        lastPredictionAt: row.last_prediction_at,
        predictionCount: count(row.prediction_count),
      })),
    },
    currentAssessment: {
      riskScore: numberOrNull(selected?.risk_score),
      riskLevel: stringOrNull(payload.riskLevel) ?? stringOrNull(selected?.risk_level),
      confidence: numberOrNull(payload.confidence),
      dataStatus: stringOrNull(payload.dataStatus),
      dataUpdatedAt: stringOrNull(payload.dataUpdatedAt),
      assessedAt: selected?.created_at ?? null,
      horizonSeconds: numberOrNull(selected?.horizon_seconds),
      hardRuleTriggered: booleanOrNull(payload.hardRuleTriggered),
      executionPolicy: stringOrNull(payload.executionPolicy),
      availableFeatureCount,
      totalFeatureCount: assessment.features.length,
      sourceDeviceCount: database.predictions.length,
      factors: stringList(payload.factors),
      features: assessment.features,
    },
    riskTrend24h: database.trend.flatMap((row) => {
      const riskScore = numberOrNull(row.risk_score);
      return riskScore === null
        ? []
        : [{ at: row.bucket_at, riskScore, hardRuleTriggered: row.hard_rule_triggered === true }];
    }),
    evaluation: {
      currentStation: {
        status: "not_evaluated",
        label: "未评估",
        reason: "当前边缘模型采用无监督稳健基线校准，尚无当前站点带标签验证集。",
      },
      regionalReference,
    },
    displacementForecast: {
      status: "unavailable",
      label: "不可用",
      reason: "当前站点缺少可用于迁移验证的可信位移序列，不能生成真实未来位移曲线。",
      missingInputs: assessment.missingInputs,
    },
    provenance: {
      predictionStore: "PostgreSQL ai_predictions",
      modelArtifact: config.edgeModelArtifactPath,
      regionalEvaluation: config.regionalModelEvaluationPath,
    },
  };
}

export function registerEdgeDisplayRoutes(
  app: FastifyInstance,
  config: AppConfig,
  pg: PgPool | null
): void {
  let cached: { expiresAt: number; summary: EdgeDisplayModelSummary } | null = null;
  let inFlight: Promise<EdgeDisplayModelSummary> | null = null;

  app.get("/edge-display/model-summary", async (request, reply) => {
    const traceId = request.traceId;
    if (!pg) {
      fail(reply, 503, "PostgreSQL not configured", traceId);
      return;
    }
    const now = Date.now();
    if (cached && cached.expiresAt > now) {
      reply.header("Cache-Control", "private, max-age=0, must-revalidate");
      reply.header("X-Edge-Display-Cache", "hit");
      ok(reply, cached.summary, traceId);
      return;
    }
    inFlight ??= buildEdgeDisplayModelSummary({ config, pg }).finally(() => {
      inFlight = null;
    });
    const summary = await inFlight;
    cached = { expiresAt: Date.now() + config.edgeDisplayCacheTtlMs, summary };
    reply.header("Cache-Control", "private, max-age=0, must-revalidate");
    reply.header("X-Edge-Display-Cache", "miss");
    ok(reply, summary, traceId);
  });
}
