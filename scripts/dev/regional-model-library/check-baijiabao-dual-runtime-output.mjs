import { createRequire } from "node:module";
import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const requireFromScript = createRequire(import.meta.url);
const { loadArtifactRegistry } = requireFromScript(
  "../../../services/ai-prediction-worker/dist/pipeline/artifacts/artifact-registry.js"
);
const { predictFromTelemetry } = requireFromScript(
  "../../../services/ai-prediction-worker/dist/pipeline/predict-pipeline.js"
);

const DEFAULT_REGISTRY_ROOT = ".tmp/regional-model-library/out/artifacts/baijiabao-dual-runtime-registry";
const DEFAULT_SAMPLES =
  ".tmp/regional-model-library/out/threegorges-baijiabao/splits/labeled/baijiabao.validation.future-labels.window-features.jsonl";
const DEFAULT_OUT_FILE =
  ".tmp/regional-model-library/out/artifacts/baijiabao-dual-runtime-registry/dual-output-smoke.report.json";
const EXPECTED_PRIMARY = "baijiabao.challenger.rainfall-reservoir.mean-diff.linear-risk-v1";
const EXPECTED_CONFIRMATION = "baijiabao.challenger.reservoir-only.logistic-balanced-l2.linear-risk-v1";

function parseArgs(argv) {
  const parsed = {
    registryRoot: DEFAULT_REGISTRY_ROOT,
    samples: DEFAULT_SAMPLES,
    outFile: DEFAULT_OUT_FILE,
    sampleIndex: 1
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--registry-root") parsed.registryRoot = argv[++index] ?? parsed.registryRoot;
    if (token === "--samples") parsed.samples = argv[++index] ?? parsed.samples;
    if (token === "--out-file") parsed.outFile = argv[++index] ?? parsed.outFile;
    if (token === "--sample-index") {
      const value = Number(argv[++index]);
      if (Number.isInteger(value) && value >= 0) parsed.sampleIndex = value;
    }
  }
  return parsed;
}

async function readJsonLines(filePath) {
  const content = await readFile(filePath, "utf-8");
  return content
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

function buildTelemetry(sample) {
  return {
    schema_version: 1,
    received_ts: sample.eventTs ?? new Date().toISOString(),
    device_id: "baijiabao-dual-runtime-smoke-device",
    metrics: sample.metricsNormalized ?? {},
    meta: {
      smoke: "baijiabao-dual-runtime-output",
      sampleId: sample.sampleId ?? null
    }
  };
}

function readFiniteNumber(value, fallback = null) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function hoursBefore(anchorTs, hours) {
  return new Date(Date.parse(anchorTs) - hours * 3600 * 1000).toISOString();
}

function buildHistoryRows(sample) {
  const anchorTs = sample.eventTs ?? new Date().toISOString();
  const metrics = sample.metricsNormalized ?? {};
  const rainfall = readFiniteNumber(metrics.rainfallCurrentMm, 0);
  const reservoir = readFiniteNumber(metrics.reservoirLevelM, 175);
  const reservoirDelta72h = readFiniteNumber(metrics.reservoirLevelM_delta_72h, 0.6);
  const reservoirStart72h = readFiniteNumber(
    metrics.reservoirLevelM_last_72h,
    reservoir - reservoirDelta72h
  );
  const rainfallStart72h = Math.max(0, readFiniteNumber(metrics.rainfallCurrentMm_last_72h, rainfall));

  return [
    {
      sensor_key: "rainfall_mm",
      received_ts_text: hoursBefore(anchorTs, 72),
      value_f64: rainfallStart72h,
      value_i64: null,
      value_str: null,
      value_bool: null
    },
    {
      sensor_key: "reservoir_level_m",
      received_ts_text: hoursBefore(anchorTs, 72),
      value_f64: reservoirStart72h,
      value_i64: null,
      value_str: null,
      value_bool: null
    },
    {
      sensor_key: "rainfall_mm",
      received_ts_text: anchorTs,
      value_f64: rainfall,
      value_i64: null,
      value_str: null,
      value_bool: null
    },
    {
      sensor_key: "reservoir_level_m",
      received_ts_text: anchorTs,
      value_f64: reservoir,
      value_i64: null,
      value_str: null,
      value_bool: null
    }
  ];
}

function buildClickhouseStub(sample) {
  const rows = buildHistoryRows(sample);
  return {
    async query() {
      return {
        async json() {
          return rows;
        }
      };
    }
  };
}

function buildConfig(registryRoot) {
  return {
    serviceName: "baijiabao-dual-runtime-output-smoke",
    kafkaBrokers: ["localhost:9094"],
    kafkaClientId: "baijiabao-dual-runtime-output-smoke",
    kafkaGroupId: "baijiabao-dual-runtime-output-smoke",
    kafkaTopicTelemetryRaw: "telemetry.raw.v1",
    kafkaTopicAiPredictions: "ai.predictions.v1",
    postgresHost: "localhost",
    postgresPort: 5432,
    postgresUser: "landslide",
    postgresPassword: "unused",
    postgresDatabase: "landslide_monitor",
    postgresPoolMax: 1,
    clickhouseUrl: undefined,
    clickhouseUsername: "landslide",
    clickhousePassword: undefined,
    clickhouseDatabase: "landslide",
    clickhouseTable: "telemetry_raw",
    modelKey: "heuristic.v1",
    modelVersion: "1",
    predictHorizonSeconds: 3600,
    artifactRootDir: registryRoot,
    featureHistoryLookbackHours: 192
  };
}

function buildPgStub() {
  const rows = [
    {
      device_id: "baijiabao-dual-runtime-smoke-device",
      station_id: "baijiabao-dual-runtime-smoke-station",
      device_metadata: {
        identityClass: "smoke",
        slopeCode: "Baijiabao",
        regionCode: "CN-HB-THREEGORGES"
      },
      station_code: "Baijiabao",
      station_metadata: {
        slopeCode: "Baijiabao",
        regionCode: "CN-HB-THREEGORGES"
      }
    }
  ];
  return {
    async query() {
      return { rows };
    },
    async connect() {
      return {
        async query() {
          return { rows };
        },
        release() {}
      };
    }
  };
}

function sampleHasCurrentInputs(sample) {
  const metrics = sample?.metricsNormalized ?? {};
  return (
    typeof metrics.rainfallCurrentMm === "number" &&
    Number.isFinite(metrics.rainfallCurrentMm) &&
    typeof metrics.reservoirLevelM === "number" &&
    Number.isFinite(metrics.reservoirLevelM)
  );
}

function chooseSample(samples, explicitIndex) {
  if (explicitIndex !== null) {
    const sample = samples[explicitIndex];
    if (!sample) throw new Error(`sample index ${String(explicitIndex)} is out of range`);
    return { sample, sampleIndex: explicitIndex };
  }

  for (let index = 0; index < samples.length; index += 1) {
    if (sampleHasCurrentInputs(samples[index])) {
      return { sample: samples[index], sampleIndex: index };
    }
  }

  throw new Error("No validation sample contains current rainfallCurrentMm and reservoirLevelM inputs.");
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  const repoRoot = process.cwd();
  const registryRoot = path.resolve(repoRoot, parsed.registryRoot);
  const samplesPath = path.resolve(repoRoot, parsed.samples);
  const outFile = path.resolve(repoRoot, parsed.outFile);
  const samples = await readJsonLines(samplesPath);
  const selectedSample = chooseSample(samples, parsed.sampleIndex);
  const sample = selectedSample.sample;

  const artifactRegistry = await loadArtifactRegistry(registryRoot);
  const result = await predictFromTelemetry({
    clickhouse: buildClickhouseStub(sample),
    telemetry: buildTelemetry(sample),
    pg: buildPgStub(),
    config: buildConfig(registryRoot),
    artifactRegistry
  });
  const confirmation = result.payloadExt.confirmationInference;

  const report = {
    checkedAt: new Date().toISOString(),
    registryRoot,
    samplesPath,
    sample: {
      sampleIndex: selectedSample.sampleIndex,
      sampleId: sample.sampleId ?? null,
      eventTs: sample.eventTs ?? null
    },
    primary: {
      modelKey: result.modelKey,
      riskScore: result.riskScore,
      riskLevel: result.riskLevel,
      fieldAdaptationSupported: result.payloadExt.fieldAdaptation?.supported ?? null,
      requiredFeatureCount: result.payloadExt.fieldAdaptation?.requiredFeatureCount ?? null,
      presentRequiredFeatureCount: result.payloadExt.fieldAdaptation?.presentRequiredFeatureCount ?? null
    },
    confirmation: confirmation
      ? {
          modelKey: confirmation.modelKey,
          operationalRole: confirmation.operationalRole,
          riskScore: confirmation.riskScore,
          riskLevel: confirmation.riskLevel,
          fieldAdaptationSupported: confirmation.fieldAdaptation?.supported ?? null,
          requiredFeatureCount: confirmation.fieldAdaptation?.requiredFeatureCount ?? null,
          presentRequiredFeatureCount: confirmation.fieldAdaptation?.presentRequiredFeatureCount ?? null,
          missingFeatureKeys: confirmation.fieldAdaptation?.missingFeatureKeys ?? null
        }
      : null,
    secondaryInferenceCount: Array.isArray(result.payloadExt.secondaryInferences)
      ? result.payloadExt.secondaryInferences.length
      : 0
  };
  report.pass =
    report.primary.modelKey === EXPECTED_PRIMARY &&
    report.primary.fieldAdaptationSupported === true &&
    report.confirmation?.modelKey === EXPECTED_CONFIRMATION &&
    report.confirmation?.operationalRole === "confirmation" &&
    report.confirmation?.fieldAdaptationSupported === true &&
    report.secondaryInferenceCount === 1;

  await writeJson(outFile, report);
  console.log(JSON.stringify(report, null, 2));
  if (!report.pass) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
