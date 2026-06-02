import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
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
const MODEL_KEY =
  process.env.BADONG_FORECAST_MODEL_KEY ??
  "badong-huangtupo.displacement.hgb-point-gated-v5-selector-v7";
const OUT_REPORT = path.join(REGISTRY_ROOT, "check-badong-huangtupo-displacement-runtime-forecast.report.json");

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

  push("displacementSurfaceMm", 72, 28.4);
  push("displacementSurfaceMm", 24, 28.8);
  push("displacementSurfaceMm", 0, 29.1);
  push("beidouDispX", 72, 1.2);
  push("beidouDispX", 24, 1.4);
  push("beidouDispX", 0, 1.5);
  push("beidouDispY", 72, -0.4);
  push("beidouDispY", 24, -0.5);
  push("beidouDispY", 0, -0.55);
  push("beidouDispZ", 72, -0.8);
  push("beidouDispZ", 24, -0.9);
  push("beidouDispZ", 0, -1.0);
  push("beidouDisplacementChangeMm", 72, 1.5);
  push("beidouDisplacementChangeMm", 24, 1.7);
  push("beidouDisplacementChangeMm", 0, 1.85);
  push("rainfallCurrentMm", 72, 12);
  push("rainfallCurrentMm", 24, 8);
  push("rainfallCurrentMm", 0, 1);
  return rows;
}

async function runWorkerPipelineSmoke(registry) {
  const anchorTs = "2025-03-08T00:00:00.000Z";
  const pg = {
    async query() {
      return {
        rows: [
          {
            device_id: "badong-runtime-forecast-smoke",
            station_id: "station-badong-p1-smoke",
            device_metadata: {
              stationCode: "P1",
              slopeCode: "Badong-Huangtupo",
              regionCode: "CN-HB-BADONG-HUANGTUPO",
              identityClass: "smoke_test"
            },
            station_code: "P1",
            station_metadata: {
              stationCode: "P1",
              slopeCode: "Badong-Huangtupo",
              regionCode: "CN-HB-BADONG-HUANGTUPO"
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
      device_id: "badong-runtime-forecast-smoke",
      metrics: {
        displacementSurfaceMm: 29.1,
        beidouDispX: 1.5,
        beidouDispY: -0.55,
        beidouDispZ: -1.0,
        beidouDisplacementChangeMm: 1.85,
        rainfallCurrentMm: 1
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
    primaryFallbackReason: result.payloadExt.fallbackReason ?? null,
    forecastPresent: forecastInference !== null,
    forecastModelKey: forecastInference?.modelKey ?? null,
    forecastModelVersion: forecastInference?.modelVersion ?? null,
    forecastRequiredFeaturesSatisfied: forecastInference?.requiredFeaturesSatisfied ?? null,
    forecastMissingFeatureKeys: forecastInference?.missingFeatureKeys ?? null,
    forecastPredictedDisplacementMm: forecastInference?.predictedDisplacementMm ?? null,
    forecastHorizonSpec: forecastInference?.horizonSpec ?? null,
    fieldAdaptation: forecastInference?.fieldAdaptation ?? null,
    traceRefs: result.payloadExt.traceRefs
  };
}

async function main() {
  const registry = await loadArtifactRegistry(path.resolve(REGISTRY_ROOT));
  const artifact = registry.list().find((candidate) => candidate.modelKey === MODEL_KEY);
  if (!artifact) {
    throw new Error(`No Badong-Huangtupo forecast artifact was loaded for ${MODEL_KEY}.`);
  }

  const directExecution = runPredictionRegressionArtifact(artifact, {
    values: {
      displacementSurfaceMm: 29.1
    },
    pointId: "P1",
    eventTs: "2025-03-08T00:00:00.000Z"
  });
  const pipelineSmoke = await runWorkerPipelineSmoke(registry);
  const pass =
    directExecution !== null &&
    pipelineSmoke.forecastPresent === true &&
    pipelineSmoke.forecastModelKey === MODEL_KEY &&
    pipelineSmoke.forecastRequiredFeaturesSatisfied === true &&
    typeof pipelineSmoke.forecastPredictedDisplacementMm === "number";

  const report = {
    generatedAt: new Date().toISOString(),
    pass,
    registryRoot: REGISTRY_ROOT,
    modelKey: artifact.modelKey,
    modelVersion: artifact.modelVersion,
    scopeType: artifact.scopeType,
    scopeKey: artifact.scopeKey,
    requiredFeatureKeys: artifact.requiredFeatureKeys,
    validationMetrics: artifact.validationMetrics ?? null,
    directExecution,
    pipelineSmoke
  };
  await writeJson(OUT_REPORT, report);
  console.log(`Loaded ${artifact.modelKey}@${artifact.modelVersion}`);
  console.log(`Pass: ${pass}`);
  console.log(`Pipeline smoke: ${JSON.stringify(pipelineSmoke, null, 2)}`);
  console.log(`Report: ${OUT_REPORT}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
