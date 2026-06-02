import { createClient } from "@clickhouse/client";
import { createRequire } from "node:module";
import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { Pool } from "pg";

const requireFromScript = createRequire(import.meta.url);
const { loadArtifactRegistry } = requireFromScript(
  "../../../services/ai-prediction-worker/dist/pipeline/artifacts/artifact-registry.js"
);
const { predictFromTelemetry } = requireFromScript(
  "../../../services/ai-prediction-worker/dist/pipeline/predict-pipeline.js"
);

const DEFAULT_DEVICE_ID = "00000000-0000-4000-8000-000000000b01";
const DEFAULT_STATION_CODE = "Baijiabao";
const DEFAULT_EXPECTED_MODEL_KEY = "baijiabao.window099.no-crack.station.Baijiabao.linear-risk-v1";
const DEFAULT_EXPECTED_CALIBRATION_THRESHOLD = 0.090203;

function parseArgs(argv) {
  const parsed = {
    outFile:
      "artifacts/models/regional-experts/phase1-monitoring-candidates/e2e-smoke.report.json",
    artifactRootDir: "artifacts/models/regional-experts/phase1-monitoring-candidates",
    deviceId: DEFAULT_DEVICE_ID,
    stationCode: DEFAULT_STATION_CODE,
    scenario: "normal",
    expectedModelKey: DEFAULT_EXPECTED_MODEL_KEY,
    expectedRiskLevel: null,
    expectedCalibrationThreshold: DEFAULT_EXPECTED_CALIBRATION_THRESHOLD,
    expectedConfirmationModelKey: null,
    apply: true
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token) continue;
    switch (token) {
      case "--out-file":
        parsed.outFile = argv[++index] ?? parsed.outFile;
        break;
      case "--artifact-root-dir":
        parsed.artifactRootDir = argv[++index] ?? parsed.artifactRootDir;
        break;
      case "--device-id":
        parsed.deviceId = argv[++index] ?? parsed.deviceId;
        break;
      case "--station-code":
        parsed.stationCode = argv[++index] ?? parsed.stationCode;
        break;
      case "--scenario": {
        const value = argv[++index] ?? parsed.scenario;
        if (value === "normal" || value === "warning") parsed.scenario = value;
        break;
      }
      case "--expected-model-key":
        parsed.expectedModelKey = argv[++index] ?? parsed.expectedModelKey;
        break;
      case "--expected-risk-level": {
        const value = argv[++index] ?? parsed.expectedRiskLevel;
        if (value === "low" || value === "medium" || value === "high") {
          parsed.expectedRiskLevel = value;
        }
        break;
      }
      case "--expected-calibration-threshold": {
        const value = Number(argv[++index]);
        if (Number.isFinite(value)) parsed.expectedCalibrationThreshold = value;
        break;
      }
      case "--expected-confirmation-model-key":
        parsed.expectedConfirmationModelKey = argv[++index] ?? parsed.expectedConfirmationModelKey;
        break;
      case "--dry-run":
        parsed.apply = false;
        break;
      default:
        break;
    }
  }

  return parsed;
}

function parseDotEnv(content) {
  const result = {};
  for (const rawLine of content.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const equalIndex = line.indexOf("=");
    if (equalIndex < 0) continue;
    const key = line.slice(0, equalIndex).trim();
    const value = line.slice(equalIndex + 1).trim();
    result[key] = value;
  }
  return result;
}

async function loadComposeEnv(repoRoot) {
  try {
    return parseDotEnv(await readFile(path.join(repoRoot, "infra/compose/.env"), "utf-8"));
  } catch {
    return {};
  }
}

function firstEnv(env, keys, fallback = undefined) {
  for (const key of keys) {
    const value = env[key];
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  return fallback;
}

function numberEnv(env, keys, fallback) {
  const raw = firstEnv(env, keys);
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function buildConfig(env, parsed) {
  const clickhouseUrl =
    firstEnv(process.env, ["CLICKHOUSE_URL"], undefined) ??
    `http://${firstEnv(env, ["CH_HOST"], "localhost")}:${firstEnv(env, ["CH_HTTP_PORT"], "8123")}`;

  return {
    serviceName: "ai-prediction-worker-e2e-smoke",
    kafkaBrokers: ["localhost:9094"],
    kafkaClientId: "ai-prediction-worker-e2e-smoke",
    kafkaGroupId: "ai-prediction-worker-e2e-smoke",
    kafkaTopicTelemetryRaw: "telemetry.raw.v1",
    kafkaTopicAiPredictions: "ai.predictions.v1",
    postgresHost: firstEnv(env, ["POSTGRES_HOST", "PG_HOST"], "localhost"),
    postgresPort: numberEnv(env, ["POSTGRES_PORT", "PG_PORT"], 5432),
    postgresUser: firstEnv(env, ["POSTGRES_USER", "PG_USER"], "landslide"),
    postgresPassword: firstEnv(env, ["POSTGRES_PASSWORD", "PG_PASSWORD"], undefined),
    postgresDatabase: firstEnv(env, ["POSTGRES_DATABASE", "PG_DATABASE"], "landslide_monitor"),
    postgresPoolMax: 5,
    clickhouseUrl,
    clickhouseUsername: firstEnv(env, ["CLICKHOUSE_USERNAME", "CH_USER"], "landslide"),
    clickhousePassword: firstEnv(env, ["CLICKHOUSE_PASSWORD", "CH_PASSWORD"], undefined),
    clickhouseDatabase: firstEnv(env, ["CLICKHOUSE_DATABASE", "CH_DATABASE"], "landslide"),
    clickhouseTable: firstEnv(env, ["CLICKHOUSE_TABLE"], "telemetry_raw"),
    modelKey: "heuristic.v1",
    modelVersion: "1",
    predictHorizonSeconds: 3600,
    artifactRootDir: parsed.artifactRootDir,
    featureHistoryLookbackHours: 192
  };
}

function buildScenarioMetricValues(scenario, hourOffset, t) {
  if (scenario === "warning") {
    return {
      displacement: 369.5,
      rainfall: 0,
      reservoir: hourOffset >= 24 ? 152.32 : 152.02
    };
  }

  return {
    displacement: 180 + t * 0.42 + Math.sin(t / 5) * 1.7,
    rainfall: t % 9 === 0 ? 8.5 : t % 5 === 0 ? 3.2 : 0.4,
    reservoir: 168 + Math.sin(t / 12) * 1.2 + t * 0.01
  };
}

function buildScenarioTelemetryMetrics(scenario) {
  if (scenario === "warning") {
    return {
      displacementSurfaceMm: 369.5,
      rainfallCurrentMm: 0,
      reservoirLevelM: 152.02
    };
  }

  return {
    displacementSurfaceMm: 216.4,
    rainfallCurrentMm: 4.6,
    reservoirLevelM: 169.3
  };
}

function expectedRiskLevelForScenario(scenario) {
  return scenario === "warning" ? "medium" : "low";
}

function createPgPool(config) {
  if (!config.postgresPassword) {
    throw new Error("Missing PostgreSQL password. Set POSTGRES_PASSWORD or PG_PASSWORD.");
  }
  return new Pool({
    host: config.postgresHost,
    port: config.postgresPort,
    user: config.postgresUser,
    password: config.postgresPassword,
    database: config.postgresDatabase,
    max: config.postgresPoolMax
  });
}

function createChClient(config) {
  return createClient({
    url: config.clickhouseUrl,
    username: config.clickhouseUsername,
    password: config.clickhousePassword ?? "",
    database: config.clickhouseDatabase,
    clickhouse_settings: {
      date_time_input_format: "best_effort"
    }
  });
}

function toClickHouseDateTime64(date) {
  return date.toISOString().replace("T", " ").replace("Z", "");
}

function buildHistoryRows(deviceId, anchorDate, scenario) {
  const rows = [];
  for (let hourOffset = 80; hourOffset >= 0; hourOffset -= 1) {
    const ts = new Date(anchorDate.getTime() - hourOffset * 3600 * 1000);
    const t = 80 - hourOffset;
    const { displacement, rainfall, reservoir } = buildScenarioMetricValues(scenario, hourOffset, t);
    const metrics = [
      ["displacementSurfaceMm", displacement],
      ["rainfallCurrentMm", rainfall],
      ["reservoirLevelM", reservoir]
    ];

    for (const [sensorKey, value] of metrics) {
      rows.push({
        received_ts: toClickHouseDateTime64(ts),
        event_ts: toClickHouseDateTime64(ts),
        device_id: deviceId,
        sensor_key: sensorKey,
        seq: t,
        value_f64: Number(value.toFixed(6)),
        value_i64: null,
        value_str: null,
        value_bool: null,
        quality: 1,
        schema_version: 1
      });
    }
  }
  return rows;
}

async function seedPostgres(pg, input) {
  await pg.query("SELECT 1");
  const sensorRows = [
    ["displacementSurfaceMm", "Surface displacement", "mm"],
    ["rainfallCurrentMm", "Rainfall current", "mm"],
    ["reservoirLevelM", "Reservoir level", "m"]
  ];

  for (const [sensorKey, displayName, unit] of sensorRows) {
    await pg.query(
      `
        INSERT INTO sensors (sensor_key, display_name, unit, data_type, tags)
        VALUES ($1, $2, $3, 'float', '["baijiabao-smoke"]'::jsonb)
        ON CONFLICT (sensor_key) DO UPDATE
        SET display_name = EXCLUDED.display_name,
            unit = EXCLUDED.unit,
            is_enabled = TRUE,
            updated_at = NOW()
      `,
      [sensorKey, displayName, unit]
    );
  }

  const stationRes = await pg.query(
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
        'Baijiabao monitoring candidate smoke station',
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
      input.stationCode,
      JSON.stringify({
        stationCode: input.stationCode,
        slopeCode: "Baijiabao",
        regionCode: "CN-HB-THREEGORGES",
        identityClass: "rehearsal",
        regionalModelSmoke: true
      })
    ]
  );
  const stationId = stationRes.rows[0]?.station_id;
  if (!stationId) throw new Error("Failed to upsert Baijiabao smoke station.");

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
        'Baijiabao monitoring candidate smoke device',
        'regional-model-smoke',
        $2,
        'active',
        'regional-model-smoke-not-a-real-secret',
        NOW(),
        $3::jsonb
      )
      ON CONFLICT (device_id) DO UPDATE
      SET station_id = EXCLUDED.station_id,
          status = 'active',
          last_seen_at = NOW(),
          metadata = devices.metadata || EXCLUDED.metadata,
          updated_at = NOW()
    `,
    [
      input.deviceId,
      stationId,
      JSON.stringify({
        stationCode: input.stationCode,
        slopeCode: "Baijiabao",
        regionCode: "CN-HB-THREEGORGES",
        identityClass: "rehearsal",
        regionalModelSmoke: true
      })
    ]
  );

  for (const [sensorKey] of sensorRows) {
    await pg.query(
      `
        INSERT INTO device_sensors (device_id, sensor_key, status, metadata)
        VALUES ($1, $2, 'enabled', '{"regionalModelSmoke":true}'::jsonb)
        ON CONFLICT (device_id, sensor_key) DO UPDATE
        SET status = 'enabled',
            metadata = device_sensors.metadata || EXCLUDED.metadata,
            updated_at = NOW()
      `,
      [input.deviceId, sensorKey]
    );
  }

  return { stationId };
}

async function seedClickHouse(ch, config, rows) {
  await ch.ping();
  await ch.command({ query: `CREATE DATABASE IF NOT EXISTS ${config.clickhouseDatabase}` });
  await ch.command({
    query: `
      CREATE TABLE IF NOT EXISTS ${config.clickhouseDatabase}.${config.clickhouseTable}
      (
        received_ts   DateTime64(3, 'UTC'),
        event_ts      Nullable(DateTime64(3, 'UTC')),
        device_id     String,
        sensor_key    LowCardinality(String),
        seq           Nullable(UInt64),
        value_f64     Nullable(Float64),
        value_i64     Nullable(Int64),
        value_str     Nullable(String),
        value_bool    Nullable(UInt8),
        quality       Nullable(UInt8),
        schema_version UInt16
      )
      ENGINE = MergeTree
      PARTITION BY toYYYYMM(received_ts)
      ORDER BY (device_id, sensor_key, received_ts)
      SETTINGS index_granularity = 8192
    `
  });
  await ch.insert({
    table: `${config.clickhouseDatabase}.${config.clickhouseTable}`,
    values: rows,
    format: "JSONEachRow"
  });
}

async function cleanupSmokeRows(pg, ch, config, deviceId) {
  await pg.query("DELETE FROM ai_predictions WHERE device_id = $1", [deviceId]);
  await ch.command({
    query: `
      ALTER TABLE ${config.clickhouseDatabase}.${config.clickhouseTable}
      DELETE WHERE device_id = '${deviceId.replaceAll("'", "''")}'
    `,
    clickhouse_settings: {
      mutations_sync: 2
    }
  });
}

async function insertPrediction(pg, input) {
  const res = await pg.query(
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
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)
      RETURNING
        prediction_id,
        created_at,
        risk_score,
        risk_level,
        payload->>'calibrationThreshold' AS calibration_threshold,
        payload->>'scoreOverThreshold' AS score_over_threshold,
        payload->>'calibratedRiskLevel' AS calibrated_risk_level,
        payload->'riskCalibration'->>'source' AS risk_calibration_source,
        payload->'confirmationInference'->>'modelKey' AS confirmation_model_key,
        payload->'confirmationInference'->>'operationalRole' AS confirmation_operational_role,
        payload->'confirmationInference'->'fieldAdaptation'->>'supported' AS confirmation_field_adaptation_supported,
        jsonb_array_length(COALESCE(payload->'secondaryInferences', '[]'::jsonb)) AS secondary_inference_count
    `,
    [
      input.deviceId,
      input.prediction.stationId,
      input.prediction.modelKey,
      input.prediction.modelVersion,
      input.config.predictHorizonSeconds,
      new Date(Date.now() + input.config.predictHorizonSeconds * 1000).toISOString(),
      input.prediction.riskScore,
      input.prediction.riskLevel,
      input.prediction.explain,
      JSON.stringify({
        source: "regional-model-baijiabao-e2e-smoke",
        received_ts: input.telemetry.received_ts,
        seq: input.telemetry.seq ?? null,
        metrics: input.telemetry.metrics,
        ...input.prediction.payloadExt
      })
    ]
  );
  return res.rows[0] ?? null;
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  const repoRoot = process.cwd();
  const env = {
    ...(await loadComposeEnv(repoRoot)),
    ...process.env
  };
  const config = buildConfig(env, parsed);
  const anchorDate = new Date();
  const expectedRiskLevel = parsed.expectedRiskLevel ?? expectedRiskLevelForScenario(parsed.scenario);
  const historyRows = buildHistoryRows(parsed.deviceId, anchorDate, parsed.scenario);
  const telemetry = {
    schema_version: 1,
    received_ts: anchorDate.toISOString(),
    device_id: parsed.deviceId,
    seq: 100001,
    metrics: buildScenarioTelemetryMetrics(parsed.scenario),
    meta: {
      regionalModelSmoke: true,
      scenario: parsed.scenario
    }
  };

  const report = {
    checkedAt: new Date().toISOString(),
    apply: parsed.apply,
    scenario: parsed.scenario,
    expectedModelKey: parsed.expectedModelKey,
    expectedRiskLevel,
    expectedCalibrationThreshold: parsed.expectedCalibrationThreshold,
    expectedConfirmationModelKey: parsed.expectedConfirmationModelKey,
    deviceId: parsed.deviceId,
    stationCode: parsed.stationCode,
    artifactRootDir: path.resolve(repoRoot, parsed.artifactRootDir),
    postgres: {
      host: config.postgresHost,
      port: config.postgresPort,
      database: config.postgresDatabase,
      user: config.postgresUser
    },
    clickhouse: {
      url: config.clickhouseUrl,
      database: config.clickhouseDatabase,
      table: config.clickhouseTable,
      username: config.clickhouseUsername
    },
    seeded: null,
    prediction: null,
    insertedPrediction: null,
    pass: false,
    error: null
  };

  if (!parsed.apply) {
    report.seeded = {
      postgres: "dry-run",
      clickhouseRows: historyRows.length
    };
    await writeJson(path.resolve(repoRoot, parsed.outFile), report);
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const pg = createPgPool(config);
  const ch = createChClient(config);
  try {
    const pgSeed = await seedPostgres(pg, {
      deviceId: parsed.deviceId,
      stationCode: parsed.stationCode
    });
    await cleanupSmokeRows(pg, ch, config, parsed.deviceId);
    await seedClickHouse(ch, config, historyRows);
    const artifactRegistry = await loadArtifactRegistry(path.resolve(repoRoot, parsed.artifactRootDir));
    const prediction = await predictFromTelemetry({
      clickhouse: ch,
      telemetry,
      pg,
      config,
      artifactRegistry
    });
    const insertedPrediction = await insertPrediction(pg, {
      deviceId: parsed.deviceId,
      telemetry,
      prediction,
      config
    });

    report.seeded = {
      stationId: pgSeed.stationId,
      clickhouseRows: historyRows.length
    };
    report.prediction = {
      stationId: prediction.stationId,
      modelKey: prediction.modelKey,
      modelVersion: prediction.modelVersion,
      riskScore: prediction.riskScore,
      riskLevel: prediction.riskLevel,
      calibrationThreshold: prediction.payloadExt?.calibrationThreshold ?? null,
      scoreOverThreshold: prediction.payloadExt?.scoreOverThreshold ?? null,
      calibratedRiskLevel: prediction.payloadExt?.calibratedRiskLevel ?? null,
      riskCalibrationSource: prediction.payloadExt?.riskCalibration?.source ?? null,
      fallbackReason: prediction.payloadExt?.fallbackReason ?? null,
      matchedModelKey: prediction.payloadExt?.matchedModelKey ?? null,
      matchedScopeType: prediction.payloadExt?.matchedScopeType ?? null,
      matchedScopeKey: prediction.payloadExt?.matchedScopeKey ?? null,
      requiredFeaturesSatisfied: prediction.payloadExt?.requiredFeaturesSatisfied ?? null,
      missingFeatureKeys: prediction.payloadExt?.missingFeatureKeys ?? null,
      historyMode: prediction.payloadExt?.traceRefs?.historyMode ?? null,
      historySource: prediction.payloadExt?.traceRefs?.historySource ?? null,
      queryPointCount: prediction.payloadExt?.windowSummary?.queryPointCount ?? null,
      stageOutputsPresent: Boolean(prediction.payloadExt?.stageOutputs?.stage1 && prediction.payloadExt?.stageOutputs?.stage2),
      confirmationInference: prediction.payloadExt?.confirmationInference
        ? {
            modelKey: prediction.payloadExt.confirmationInference.modelKey ?? null,
            operationalRole: prediction.payloadExt.confirmationInference.operationalRole ?? null,
            riskScore: prediction.payloadExt.confirmationInference.riskScore ?? null,
            riskLevel: prediction.payloadExt.confirmationInference.riskLevel ?? null,
            fieldAdaptationSupported:
              prediction.payloadExt.confirmationInference.fieldAdaptation?.supported ?? null
          }
        : null,
      secondaryInferenceCount: Array.isArray(prediction.payloadExt?.secondaryInferences)
        ? prediction.payloadExt.secondaryInferences.length
        : 0
    };
    report.insertedPrediction = insertedPrediction;
    report.pass =
      report.prediction.modelKey === parsed.expectedModelKey &&
      report.prediction.riskLevel === report.expectedRiskLevel &&
      report.prediction.calibratedRiskLevel === report.expectedRiskLevel &&
      report.prediction.fallbackReason === null &&
      report.prediction.requiredFeaturesSatisfied === true &&
      report.prediction.calibrationThreshold === parsed.expectedCalibrationThreshold &&
      report.prediction.riskCalibrationSource === "metadata.replaySummary.threshold" &&
      report.prediction.historyMode === "clickhouse+telemetry-v1" &&
      report.prediction.stageOutputsPresent === true &&
      Boolean(report.insertedPrediction?.prediction_id) &&
      report.insertedPrediction?.risk_level === report.expectedRiskLevel &&
      Number(report.insertedPrediction?.calibration_threshold) === parsed.expectedCalibrationThreshold &&
      report.insertedPrediction?.risk_calibration_source === "metadata.replaySummary.threshold" &&
      (parsed.expectedConfirmationModelKey === null ||
        (report.prediction.confirmationInference?.modelKey === parsed.expectedConfirmationModelKey &&
          report.prediction.confirmationInference?.operationalRole === "confirmation" &&
          report.prediction.confirmationInference?.fieldAdaptationSupported === true &&
          report.prediction.secondaryInferenceCount === 1 &&
          report.insertedPrediction?.confirmation_model_key === parsed.expectedConfirmationModelKey &&
          report.insertedPrediction?.confirmation_operational_role === "confirmation" &&
          report.insertedPrediction?.confirmation_field_adaptation_supported === "true" &&
          Number(report.insertedPrediction?.secondary_inference_count) === 1));
  } catch (error) {
    report.error = error instanceof Error ? error.stack ?? error.message : String(error);
    process.exitCode = 1;
  } finally {
    await ch.close();
    await pg.end();
  }

  await writeJson(path.resolve(repoRoot, parsed.outFile), report);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
