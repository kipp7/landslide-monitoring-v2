import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Pool } from "pg";
import { createHttpClient } from "../../apps/desk/src/api/httpClient";

const requireFromScript = createRequire(import.meta.url);
const { loadArtifactRegistry } = requireFromScript(
  "../../services/ai-prediction-worker/dist/pipeline/artifacts/artifact-registry.js"
);
const { predictFromTelemetry } = requireFromScript("../../services/ai-prediction-worker/dist/pipeline/predict-pipeline.js");

type ScriptOptions = {
  apiBaseUrl: string;
  username: string;
  password: string;
  outFile: string;
  deviceId: string;
  stationCode: string;
};

type EnvMap = Record<string, string>;

const PROOF_SOURCE = "desk-http-forecast-field-proof-v1";
const DEVICE_ID = "00000000-0000-4000-8000-000000000b01";
const STATION_CODE = "Baijiabao";
const RISK_MODEL_KEY = "baijiabao.window099.no-crack.station.Baijiabao.linear-risk-v1";
const FORECAST_MODEL_KEY =
  "baijiabao.displacement.pointwise-fixed-expert-ensemble-v31-dev-gated-state-protected-v33";
const FORECAST_MODEL_VERSION = "0.33.0";
const FORECAST_DISPLACEMENT_MM = 0.35690731212977783;
const FORECAST_REGISTRY_ROOT = "artifacts/models/regional-experts/phase1-displacement-forecast";

function parseArgs(argv: string[]): ScriptOptions {
  const options: ScriptOptions = {
    apiBaseUrl: "http://127.0.0.1:8080",
    username: "admin",
    password: "123456",
    outFile:
      "artifacts/models/regional-experts/phase1-displacement-forecast/desk-http-forecast-field-proof.report.json",
    deviceId: DEVICE_ID,
    stationCode: STATION_CODE,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const next = argv[index + 1];
    if (!token?.startsWith("--")) continue;
    if (next === undefined) continue;

    switch (token) {
      case "--api-base-url":
        options.apiBaseUrl = next;
        index += 1;
        break;
      case "--username":
        options.username = next;
        index += 1;
        break;
      case "--password":
        options.password = next;
        index += 1;
        break;
      case "--out-file":
        options.outFile = next;
        index += 1;
        break;
      case "--device-id":
        options.deviceId = next;
        index += 1;
        break;
      case "--station-code":
        options.stationCode = next;
        index += 1;
        break;
      default:
        break;
    }
  }

  return options;
}

function parseDotEnv(content: string): EnvMap {
  const result: EnvMap = {};
  for (const rawLine of content.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const equalIndex = line.indexOf("=");
    if (equalIndex <= 0) continue;
    const key = line.slice(0, equalIndex).trim();
    let value = line.slice(equalIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

async function readEnvFile(filePath: string): Promise<EnvMap> {
  try {
    return parseDotEnv(await readFile(filePath, "utf-8"));
  } catch {
    return {};
  }
}

function firstEnv(env: EnvMap, keys: readonly string[], fallback?: string): string | undefined {
  for (const key of keys) {
    const value = env[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return fallback;
}

function numberEnv(env: EnvMap, keys: readonly string[], fallback: number): number {
  const value = Number(firstEnv(env, keys));
  return Number.isFinite(value) ? value : fallback;
}

async function loadEnv(repoRoot: string): Promise<EnvMap> {
  return {
    ...(await readEnvFile(path.join(repoRoot, "infra/compose/.env"))),
    ...(await readEnvFile(path.join(repoRoot, "services/api/.env"))),
    ...Object.fromEntries(
      Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === "string")
    ),
  };
}

function createPool(env: EnvMap): Pool {
  const password = firstEnv(env, ["POSTGRES_PASSWORD", "PG_PASSWORD"]);
  if (!password) {
    throw new Error("Missing POSTGRES_PASSWORD or PG_PASSWORD for forecast HTTP proof");
  }

  return new Pool({
    host: firstEnv(env, ["POSTGRES_HOST", "PG_HOST"], "127.0.0.1"),
    port: numberEnv(env, ["POSTGRES_PORT", "PG_PORT"], 5432),
    user: firstEnv(env, ["POSTGRES_USER", "PG_USER"], "landslide"),
    password,
    database: firstEnv(env, ["POSTGRES_DATABASE", "PG_DATABASE"], "landslide_monitor"),
    max: 3,
  });
}

function buildPipelineSmokeRows(anchorTs: string) {
  const rows: Array<Record<string, unknown>> = [];
  const push = (sensorKey: string, hoursBeforeAnchor: number, value: number) => {
    rows.push({
      sensor_key: sensorKey,
      received_ts_text: new Date(Date.parse(anchorTs) - hoursBeforeAnchor * 3600 * 1000).toISOString(),
      value_f64: value,
      value_i64: null,
      value_str: null,
      value_bool: null,
    });
  };

  push("displacementSurfaceMm", 72, 100);
  push("displacementSurfaceMm", 24, 101.2);
  push("displacementSurfaceMm", 0, 102);
  push("rainfallCurrentMm", 72, 3);
  push("rainfallCurrentMm", 24, 5);
  push("rainfallCurrentMm", 0, 2);
  push("reservoirLevelM", 72, 165.1);
  push("reservoirLevelM", 24, 165.4);
  push("reservoirLevelM", 0, 165.6);
  return rows;
}

async function buildWorkerForecastPayload(pg: Pool, deviceId: string) {
  const anchorTs = "2024-07-04T00:00:00.000Z";
  const clickhouse = {
    async query() {
      return {
        async json() {
          return buildPipelineSmokeRows(anchorTs);
        },
      };
    },
  };
  const artifactRegistry = await loadArtifactRegistry(path.resolve(FORECAST_REGISTRY_ROOT));
  const result = await predictFromTelemetry({
    clickhouse,
    pg,
    artifactRegistry,
    config: {
      clickhouseDatabase: "landslide",
      clickhouseTable: "telemetry_raw",
      featureHistoryLookbackHours: 192,
      predictHorizonSeconds: 86400,
    },
    telemetry: {
      schema_version: 1,
      received_ts: anchorTs,
      device_id: deviceId,
      metrics: {
        displacementSurfaceMm: 102,
        rainfallCurrentMm: 2,
        reservoirLevelM: 165.6,
      },
    },
  });

  const forecast = result.payloadExt.forecastInference;
  if (typeof forecast !== "object" || forecast === null) {
    throw new Error("worker predictFromTelemetry did not return forecastInference");
  }
  const forecastRecord = forecast as Record<string, unknown>;
  if (forecastRecord.modelKey !== FORECAST_MODEL_KEY) {
    throw new Error(`worker forecast model key mismatch: ${String(forecastRecord.modelKey)}`);
  }
  if (forecastRecord.modelVersion !== FORECAST_MODEL_VERSION) {
    throw new Error(`worker forecast model version mismatch: ${String(forecastRecord.modelVersion)}`);
  }
  if (forecastRecord.requiredFeaturesSatisfied !== true) {
    throw new Error("worker forecast required features were not satisfied");
  }
  if (forecastRecord.predictedDisplacementMm !== FORECAST_DISPLACEMENT_MM) {
    throw new Error(
      `worker forecast displacement changed: expected ${FORECAST_DISPLACEMENT_MM}, got ${String(
        forecastRecord.predictedDisplacementMm
      )}`
    );
  }
  return forecastRecord;
}

async function seedStationDevice(pg: Pool, options: ScriptOptions): Promise<string> {
  const stationResult = await pg.query<{ station_id: string }>(
    `
      INSERT INTO stations (
        station_code,
        station_name,
        province,
        city,
        district,
        latitude,
        longitude,
        status,
        metadata
      )
      VALUES (
        $1,
        'Baijiabao forecast HTTP proof station',
        'Hubei',
        'Yichang',
        'Zigui',
        30.98,
        110.75,
        'active',
        $2::jsonb
      )
      ON CONFLICT (station_code) DO UPDATE
      SET station_name = EXCLUDED.station_name,
          status = 'active',
          metadata = stations.metadata || EXCLUDED.metadata,
          updated_at = NOW()
      RETURNING station_id
    `,
    [
      options.stationCode,
      JSON.stringify({
        stationCode: options.stationCode,
        slopeCode: "Baijiabao",
        regionCode: "CN-HB-THREEGORGES",
        identityClass: "rehearsal",
        forecastHttpProof: true,
      }),
    ]
  );
  const stationId = stationResult.rows[0]?.station_id;
  if (!stationId) throw new Error("Failed to upsert Baijiabao proof station");

  await pg.query(
    `
      INSERT INTO devices (
        device_id,
        device_name,
        device_type,
        station_id,
        status,
        device_secret_hash,
        last_seen_at,
        metadata
      )
      VALUES (
        $1,
        'Baijiabao forecast HTTP proof device',
        'regional-model-smoke',
        $2,
        'active',
        'forecast-http-proof-not-a-real-secret',
        NOW(),
        $3::jsonb
      )
      ON CONFLICT (device_id) DO UPDATE
      SET device_name = EXCLUDED.device_name,
          station_id = EXCLUDED.station_id,
          status = 'active',
          last_seen_at = NOW(),
          metadata = devices.metadata || EXCLUDED.metadata,
          updated_at = NOW()
    `,
    [
      options.deviceId,
      stationId,
      JSON.stringify({
        stationCode: options.stationCode,
        slopeCode: "Baijiabao",
        regionCode: "CN-HB-THREEGORGES",
        identityClass: "rehearsal",
        forecastHttpProof: true,
      }),
    ]
  );

  return stationId;
}

async function seedForecastPrediction(pg: Pool, options: ScriptOptions, stationId: string) {
  const forecastInference = await buildWorkerForecastPayload(pg, options.deviceId);
  const payload = {
    source: PROOF_SOURCE,
    received_ts: new Date().toISOString(),
    metrics: {
      displacementSurfaceMm: 216.4,
      rainfallCurrentMm: 4.6,
      reservoirLevelM: 169.3,
    },
    calibrationThreshold: 0.090203,
    scoreOverThreshold: 1.4316612487859488,
    calibratedRiskLevel: "medium",
    riskCalibration: {
      threshold: 0.090203,
      scoreOverThreshold: 1.4316612487859488,
      calibratedRiskLevel: "medium",
      source: "metadata.replaySummary.threshold",
    },
    matchedModelKey: RISK_MODEL_KEY,
    requiredFeaturesSatisfied: true,
    fallbackReason: null,
    forecastInference,
    secondaryInferences: [forecastInference],
  };

  await pg.query("DELETE FROM ai_predictions WHERE payload->>'source' = $1", [PROOF_SOURCE]);

  const result = await pg.query<{
    prediction_id: string;
    created_at: string;
    has_forecast: boolean;
  }>(
    `
      INSERT INTO ai_predictions (
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
      )
      VALUES (
        $1,
        $2,
        $3,
        '0.2.0',
        86400,
        NOW() + INTERVAL '24 hours',
        0.12914013962423895,
        'medium',
        '区域专家风险模型与 Baijiabao v33 位移 forecast 已分离落库。',
        $4::jsonb
      )
      RETURNING
        prediction_id,
        created_at,
        payload ? 'forecastInference' AS has_forecast
    `,
    [options.deviceId, stationId, RISK_MODEL_KEY, JSON.stringify(payload)]
  );

  const row = result.rows[0];
  if (!row?.prediction_id || row.has_forecast !== true) {
    throw new Error("Failed to insert forecast proof prediction");
  }
  return row;
}

async function verifyHttpMapping(options: ScriptOptions) {
  const session = { token: null as string | null, refreshToken: null as string | null };
  const client = createHttpClient({
    baseUrl: options.apiBaseUrl,
    getToken: () => session.token,
    getRefreshToken: () => session.refreshToken,
    onAuthTokens: ({ token, refreshToken }) => {
      session.token = token;
      if (refreshToken !== undefined) session.refreshToken = refreshToken;
    },
    onAuthFailure: () => {
      session.token = null;
      session.refreshToken = null;
    },
  });

  const login = await client.auth.login({ username: options.username, password: options.password });
  session.token = login.token;
  session.refreshToken = login.refreshToken ?? null;

  const response = await client.aiPredictions.list({
    page: 1,
    pageSize: 1,
    deviceId: options.deviceId,
  });
  const prediction = response.list[0];
  if (!prediction) throw new Error("HTTP ai prediction list is empty after seed");

  const forecast = prediction.forecastInference;
  if (!forecast) throw new Error("forecastInference was not mapped from HTTP payload");
  if (forecast.modelKey !== FORECAST_MODEL_KEY) {
    throw new Error(`unexpected forecast model key: ${String(forecast.modelKey)}`);
  }
  if (forecast.horizonSpec !== "24h") {
    throw new Error(`unexpected forecast horizon: ${String(forecast.horizonSpec)}`);
  }
  if (forecast.requiredFeaturesSatisfied !== true) {
    throw new Error("forecast required features should be satisfied");
  }
  if (forecast.predictedDisplacementMm === null || !Number.isFinite(forecast.predictedDisplacementMm)) {
    throw new Error("forecast predictedDisplacementMm should be a finite number");
  }
  if (prediction.modelKey === forecast.modelKey) {
    throw new Error("forecast model was incorrectly used as primary risk model");
  }

  return {
    total: response.total,
    predictionId: prediction.predictionId,
    riskModelKey: prediction.modelKey,
    riskLevel: prediction.riskLevel,
    riskScore: prediction.riskScore,
    forecastModelKey: forecast.modelKey,
    forecastModelVersion: forecast.modelVersion,
    horizonSpec: forecast.horizonSpec,
    predictedDisplacementMm: forecast.predictedDisplacementMm,
    targetUnit: forecast.targetUnit,
    requiredFeaturesSatisfied: forecast.requiredFeaturesSatisfied,
    missingFeatureKeys: forecast.missingFeatureKeys,
    rawPayloadSource: prediction.payload.source,
    rawPayloadHasForecast: typeof prediction.payload.forecastInference === "object",
    secondaryInferenceCount: Array.isArray(prediction.payload.secondaryInferences)
      ? prediction.payload.secondaryInferences.length
      : 0,
  };
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const repoRoot = process.cwd();
  const env = await loadEnv(repoRoot);
  const pg = createPool(env);
  const report = {
    generatedAt: new Date().toISOString(),
    proofSource: PROOF_SOURCE,
    apiBaseUrl: options.apiBaseUrl,
    deviceId: options.deviceId,
    stationCode: options.stationCode,
    expected: {
      riskModelKey: RISK_MODEL_KEY,
      forecastModelKey: FORECAST_MODEL_KEY,
      forecastModelVersion: FORECAST_MODEL_VERSION,
      horizonSpec: "24h",
      forecastSource: "worker.predictFromTelemetry",
    },
    seeded: null as null | Record<string, unknown>,
    httpProof: null as null | Record<string, unknown>,
    pass: false,
  };

  try {
    const stationId = await seedStationDevice(pg, options);
    const inserted = await seedForecastPrediction(pg, options, stationId);
    const httpProof = await verifyHttpMapping(options);
    report.seeded = {
      stationId,
      predictionId: inserted.prediction_id,
      createdAt: inserted.created_at,
      hasForecast: inserted.has_forecast,
    };
    report.httpProof = httpProof;
    report.pass =
      inserted.has_forecast === true &&
      httpProof.riskModelKey === RISK_MODEL_KEY &&
      httpProof.forecastModelKey === FORECAST_MODEL_KEY &&
      httpProof.horizonSpec === "24h" &&
      httpProof.requiredFeaturesSatisfied === true &&
      httpProof.rawPayloadHasForecast === true &&
      Number(httpProof.secondaryInferenceCount) >= 1;
  } finally {
    await pg.end();
  }

  await writeJson(path.resolve(repoRoot, options.outFile), report);
  console.log(JSON.stringify(report, null, 2));

  if (!report.pass) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
