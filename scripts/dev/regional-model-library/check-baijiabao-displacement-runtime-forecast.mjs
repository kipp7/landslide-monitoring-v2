import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const require = createRequire(import.meta.url);
const { runPredictionRegressionArtifact } = require(path.resolve("libs/regional-model-library/dist"));
const { loadArtifactRegistry } = require(
  path.resolve("services/ai-prediction-worker/dist/pipeline/artifacts/artifact-registry.js")
);
const { predictFromTelemetry } = require(
  path.resolve("services/ai-prediction-worker/dist/pipeline/predict-pipeline.js")
);

const REGISTRY_ROOT = "artifacts/models/regional-experts/phase1-displacement-forecast";
const VALIDATION_SAMPLES = ".tmp/regional-model-library/out/threegorges-baijiabao/splits/labeled/baijiabao.validation.future-labels.window-features.jsonl";
const OUT_REPORT = path.join(REGISTRY_ROOT, "check-baijiabao-displacement-runtime-forecast.report.json");

async function readJsonl(filePath) {
  const text = await readFile(filePath, "utf-8");
  return text
    .split(/\r?\n/u)
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line));
}

function numberOrNull(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function mean(values) {
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function quantile(values, q) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1))));
  return sorted[index] ?? null;
}

function metrics(rows) {
  const labels = rows.map((row) => row.label);
  const predictions = rows.map((row) => row.prediction);
  const labelMean = mean(labels);
  const absErrors = rows.map((row) => Math.abs(row.label - row.prediction));
  const squaredErrors = rows.map((row) => (row.label - row.prediction) ** 2);
  const totalSumSquares = labels.reduce((sum, value) => sum + (value - labelMean) ** 2, 0);
  const residualSumSquares = squaredErrors.reduce((sum, value) => sum + value, 0);
  return {
    count: rows.length,
    mae: mean(absErrors),
    rmse: Math.sqrt(mean(squaredErrors)),
    r2: totalSumSquares > 0 ? 1 - residualSumSquares / totalSumSquares : 0,
    directionAccuracy: rows.filter((row) => (row.label >= 0) === (row.prediction >= 0)).length / rows.length,
    within1mm: absErrors.filter((value) => value <= 1).length / rows.length,
    p90AbsError: quantile(absErrors, 0.9),
    predictionMean: mean(predictions),
    labelMean
  };
}

async function writeJson(filePath, payload) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
}

function buildPipelineSmokeRows(anchorTs) {
  const rows = [];
  const push = (sensorKey, hoursBeforeAnchor, value) => {
    rows.push({
      sensor_key: sensorKey,
      received_ts_text: new Date(Date.parse(anchorTs) - hoursBeforeAnchor * 3600 * 1000).toISOString(),
      value_f64: value,
      value_i64: null,
      value_str: null,
      value_bool: null
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

async function runWorkerPipelineSmoke(registry) {
  const anchorTs = "2024-07-04T00:00:00.000Z";
  const pg = {
    async query() {
      return {
        rows: [
          {
            device_id: "bjb-runtime-forecast-smoke",
            station_id: "station-baijiabao-smoke",
            device_metadata: {
              stationCode: "Baijiabao",
              slopeCode: "ThreeGorges-Baijiabao",
              regionCode: "CN-420527",
              identityClass: "smoke_test"
            },
            station_code: "Baijiabao",
            station_metadata: {
              stationCode: "Baijiabao",
              slopeCode: "ThreeGorges-Baijiabao",
              regionCode: "CN-420527"
            }
          }
        ]
      };
    }
  };
  const clickhouse = {
    async query() {
      return {
        async json() {
          return buildPipelineSmokeRows(anchorTs);
        }
      };
    }
  };
  const result = await predictFromTelemetry({
    clickhouse,
    pg,
    artifactRegistry: registry,
    config: {
      clickhouseDatabase: "landslide",
      clickhouseTable: "telemetry_raw",
      featureHistoryLookbackHours: 192,
      predictHorizonSeconds: 86400
    },
    telemetry: {
      schema_version: 1,
      received_ts: anchorTs,
      device_id: "bjb-runtime-forecast-smoke",
      metrics: {
        displacementSurfaceMm: 102,
        rainfallCurrentMm: 2,
        reservoirLevelM: 165.6
      }
    }
  });

  const forecastInference =
    typeof result.payloadExt.forecastInference === "object" && result.payloadExt.forecastInference !== null
      ? result.payloadExt.forecastInference
      : null;

  return {
    stationId: result.stationId,
    primaryModelKey: result.modelKey,
    primaryRiskLevel: result.riskLevel,
    matchedModelKey: result.payloadExt.matchedModelKey ?? null,
    primaryFallbackReason: result.payloadExt.fallbackReason ?? null,
    forecastPresent: forecastInference !== null,
    forecastModelKey: forecastInference?.modelKey ?? null,
    forecastRequiredFeaturesSatisfied: forecastInference?.requiredFeaturesSatisfied ?? null,
    forecastMissingFeatureKeys: forecastInference?.missingFeatureKeys ?? null,
    forecastPredictedDisplacementMm: forecastInference?.predictedDisplacementMm ?? null,
    secondaryInferenceCount: Array.isArray(result.payloadExt.secondaryInferences)
      ? result.payloadExt.secondaryInferences.length
      : 0
  };
}

async function main() {
  const registry = await loadArtifactRegistry(path.resolve(REGISTRY_ROOT));
  const registryFile = JSON.parse(await readFile(path.join(REGISTRY_ROOT, "registry.json"), "utf-8"));
  const activeModelKey = registryFile.activeModelKey ?? null;
  const artifact = registry
    .list()
    .find(
      (candidate) =>
        candidate.artifactType === "calibrated_prediction_regression_v1" &&
        candidate.modelKey === activeModelKey
    );
  if (!artifact) {
    throw new Error(`No active calibrated_prediction_regression_v1 artifact was loaded for ${String(activeModelKey)}.`);
  }

  const samples = await readJsonl(VALIDATION_SAMPLES);
  const evaluated = [];
  const skipped = [];
  for (const sample of samples) {
    const label = numberOrNull(sample.labels?.displacementLabel);
    if (label === null) {
      skipped.push({ sampleId: sample.sampleId, reason: "missing-label" });
      continue;
    }
    const execution = runPredictionRegressionArtifact(artifact, {
      values: sample.metricsNormalized ?? {},
      pointId: sample.rawRef?.originalFields?.point_id ?? sample.rawRef?.originalFields?.sensor_id ?? null,
      eventTs: sample.eventTs
    });
    if (!execution) {
      skipped.push({ sampleId: sample.sampleId, reason: "missing-required-features" });
      continue;
    }
    evaluated.push({
      sampleId: sample.sampleId,
      label,
      prediction: execution.predictedValue
    });
  }

  const report = {
    generatedAt: new Date().toISOString(),
    registryRoot: REGISTRY_ROOT,
    validationSamples: VALIDATION_SAMPLES,
    modelKey: artifact.modelKey,
    modelVersion: artifact.modelVersion,
    requiredFeatureKeys: artifact.requiredFeatureKeys,
    evaluatedCount: evaluated.length,
    skippedCount: skipped.length,
    metrics: metrics(evaluated),
    pipelineSmoke: await runWorkerPipelineSmoke(registry),
    firstSkipped: skipped.slice(0, 10)
  };
  await writeJson(OUT_REPORT, report);
  console.log(`Loaded ${artifact.modelKey}@${artifact.modelVersion}`);
  console.log(JSON.stringify(report.metrics, null, 2));
  console.log(`Pipeline smoke: ${JSON.stringify(report.pipelineSmoke, null, 2)}`);
  console.log(`Report: ${OUT_REPORT}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
