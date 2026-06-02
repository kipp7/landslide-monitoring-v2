import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const require = createRequire(import.meta.url);
const { loadArtifactRegistry } = require(
  path.resolve("services/ai-prediction-worker/dist/pipeline/artifacts/artifact-registry.js")
);
const { runPredictionRegressionArtifact } = require(path.resolve("libs/regional-model-library/dist"));

const REGISTRY_ROOT = "artifacts/models/regional-experts/phase1-displacement-forecast";
const MODEL_KEY = "badong-huangtupo.displacement.hgb-windowed-multisensor-v2";
const VALIDATION_SAMPLES =
  ".tmp/regional-model-library/out/artifacts/badong-huangtupo-hgb-displacement-challenger/badong-huangtupo-core.validation.runtime-window-features.jsonl";
const OUT_REPORT = path.join(REGISTRY_ROOT, "check-badong-huangtupo-v2-runtime-validation.report.json");

async function readJsonl(filePath) {
  const text = await readFile(filePath, "utf-8");
  return text
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

async function writeJson(filePath, payload) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
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
    directionAccuracy: rows.filter((row) => Math.sign(row.label) === Math.sign(row.prediction)).length / rows.length,
    within1mm: absErrors.filter((value) => value <= 1).length / rows.length,
    p90AbsError: quantile(absErrors, 0.9),
    predictionMean: mean(predictions),
    labelMean
  };
}

async function main() {
  const registry = await loadArtifactRegistry(path.resolve(REGISTRY_ROOT));
  const artifact = registry.list().find((candidate) => candidate.modelKey === MODEL_KEY);
  if (!artifact) {
    throw new Error(`No artifact loaded for ${MODEL_KEY}`);
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
      pointId:
        sample.rawRef?.originalFields?.point_id ??
        sample.rawRef?.originalFields?.sensor_code ??
        sample.identity?.stationCode ??
        null,
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
    pass: evaluated.length > 0 && skipped.length === 0,
    registryRoot: REGISTRY_ROOT,
    validationSamples: VALIDATION_SAMPLES,
    modelKey: artifact.modelKey,
    modelVersion: artifact.modelVersion,
    requiredFeatureKeys: artifact.requiredFeatureKeys,
    evaluatedCount: evaluated.length,
    skippedCount: skipped.length,
    metrics: metrics(evaluated),
    firstSkipped: skipped.slice(0, 10)
  };
  await writeJson(OUT_REPORT, report);
  console.log(`Loaded ${artifact.modelKey}@${artifact.modelVersion}`);
  console.log(`Pass: ${report.pass}`);
  console.log(JSON.stringify(report.metrics, null, 2));
  console.log(`Report: ${OUT_REPORT}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
