import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const STAGE1_OUTPUT_KEY = "stage1DisplacementScore";
const STAGE2_OUTPUT_KEY = "stage2WarningScore";
const STAGE1_FEATURE_PATTERNS = [/displacement/i, /beidou/i, /crack/i, /settlement/i, /slip/i, /deformation/i];

function parseArgs(argv) {
  const parsed = {
    trainSamples: ".tmp/regional-model-library/out/threegorges-baijiabao/splits/labeled/baijiabao.train.future-labels.window-features.jsonl",
    validationSamples: ".tmp/regional-model-library/out/threegorges-baijiabao/splits/labeled/baijiabao.validation.future-labels.window-features.jsonl",
    outDir: ".tmp/regional-model-library/out/artifacts/threegorges-baijiabao-window-candidate",
    modelKey: "baijiabao.window-features.station.Baijiabao.linear-risk-v1",
    modelVersion: "0.2.0",
    scopeType: "station",
    scopeKey: "Baijiabao",
    labelKey: "warningHitLabel",
    minFeatureCoverage: 0.9,
    excludeFeatures: ["crackDisplacementMm"],
    thresholdMode: "maximize-balanced-accuracy",
    artifactMetadataFile: ".tmp/regional-model-library/out/artifact-metadata/CN-420528.land-cover-affinity.json"
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token) continue;
    switch (token) {
      case "--train-samples":
        parsed.trainSamples = argv[++index] ?? parsed.trainSamples;
        break;
      case "--validation-samples":
        parsed.validationSamples = argv[++index] ?? parsed.validationSamples;
        break;
      case "--out-dir":
        parsed.outDir = argv[++index] ?? parsed.outDir;
        break;
      case "--model-key":
        parsed.modelKey = argv[++index] ?? parsed.modelKey;
        break;
      case "--model-version":
        parsed.modelVersion = argv[++index] ?? parsed.modelVersion;
        break;
      case "--scope-type":
        parsed.scopeType = argv[++index] ?? parsed.scopeType;
        break;
      case "--scope-key":
        parsed.scopeKey = argv[++index] ?? parsed.scopeKey;
        break;
      case "--label-key":
        parsed.labelKey = argv[++index] ?? parsed.labelKey;
        break;
      case "--min-feature-coverage": {
        const value = Number(argv[++index]);
        if (Number.isFinite(value) && value >= 0 && value <= 1) parsed.minFeatureCoverage = value;
        break;
      }
      case "--exclude-features":
        parsed.excludeFeatures = (argv[++index] ?? "")
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean);
        break;
      case "--threshold-mode":
        parsed.thresholdMode = argv[++index] ?? parsed.thresholdMode;
        break;
      case "--artifact-metadata-file":
        parsed.artifactMetadataFile = argv[++index] ?? parsed.artifactMetadataFile;
        break;
      default:
        break;
    }
  }

  return parsed;
}

async function readSamples(filePath) {
  const content = await readFile(filePath, "utf-8");
  if (filePath.toLowerCase().endsWith(".json")) {
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? parsed : [];
  }
  return content
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

async function readOptionalJson(filePath) {
  if (!filePath) return undefined;
  try {
    return JSON.parse(await readFile(filePath, "utf-8"));
  } catch {
    return undefined;
  }
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

function toBinaryLabel(value) {
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "number") {
    if (value === 0) return 0;
    if (value === 1) return 1;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes"].includes(normalized)) return 1;
    if (["0", "false", "no"].includes(normalized)) return 0;
  }
  return null;
}

function collectLabeledRows(samples, labelKey) {
  const warnings = [];
  const rows = [];
  for (const sample of samples) {
    const label = toBinaryLabel(sample.labels?.[labelKey]);
    if (label === null) {
      warnings.push(`Ignored ${sample.sampleId ?? "unknown-sample"} because ${labelKey} is not binary.`);
      continue;
    }
    rows.push({ sample, label });
  }
  if (!rows.some((row) => row.label === 1) || !rows.some((row) => row.label === 0)) {
    throw new Error("Binary training/evaluation requires both positive and negative rows.");
  }
  return { rows, warnings };
}

function collectFeatureKeys(rows, minFeatureCoverage, excludeFeatures) {
  const coverage = new Map();
  for (const row of rows) {
    for (const [featureKey, value] of Object.entries(row.sample.metricsNormalized ?? {})) {
      if (typeof value === "number" && Number.isFinite(value)) {
        coverage.set(featureKey, (coverage.get(featureKey) ?? 0) + 1);
      }
    }
  }
  const minimumCount = Math.max(1, Math.ceil(rows.length * minFeatureCoverage));
  const denied = new Set(excludeFeatures);
  return Array.from(coverage.entries())
    .filter(([, count]) => count >= minimumCount)
    .map(([featureKey]) => featureKey)
    .filter((featureKey) => !denied.has(featureKey))
    .sort();
}

function featureValues(sample) {
  return Object.entries(sample.metricsNormalized ?? {}).reduce((accumulator, [featureKey, value]) => {
    if (typeof value === "number" && Number.isFinite(value)) accumulator[featureKey] = value;
    return accumulator;
  }, {});
}

function mean(values) {
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function sigmoid(value) {
  if (value >= 0) {
    const z = Math.exp(-value);
    return 1 / (1 + z);
  }
  const z = Math.exp(value);
  return z / (1 + z);
}

function clamp01(value) {
  if (!Number.isFinite(value)) return 0.5;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function trainStage(rows, featureKeys, stageKey, outputKey, labelKey, metadata) {
  const positiveRows = rows.filter((row) => row.label === 1);
  const negativeRows = rows.filter((row) => row.label === 0);
  const featureNormalization = {};
  const featureCenters = {};
  const weights = {};

  for (const featureKey of featureKeys) {
    const rawValues = rows.map((row) => row.featureValues[featureKey] ?? 0);
    const min = Math.min(...rawValues);
    const max = Math.max(...rawValues);
    const normalize = (value) => {
      const span = max - min;
      if (!Number.isFinite(span) || span <= 0) return 0.5;
      return clamp01((value - min) / span);
    };
    const positiveMean = mean(positiveRows.map((row) => normalize(row.featureValues[featureKey] ?? 0)));
    const negativeMean = mean(negativeRows.map((row) => normalize(row.featureValues[featureKey] ?? 0)));
    featureNormalization[featureKey] = { min, max };
    featureCenters[featureKey] = (positiveMean + negativeMean) / 2;
    weights[featureKey] = positiveMean - negativeMean;
  }

  const positiveRate = positiveRows.length / rows.length;
  const boundedPositiveRate = Math.min(0.99, Math.max(0.01, positiveRate));
  return {
    stageKey,
    outputKey,
    labelKey,
    requiredFeatureKeys: featureKeys,
    featureNormalization,
    featureCenters,
    bias: Math.log(boundedPositiveRate / (1 - boundedPositiveRate)),
    weights,
    trainingSummary: {
      sampleCount: rows.length,
      positiveCount: positiveRows.length,
      negativeCount: negativeRows.length
    },
    metadata
  };
}

function runStage(stage, values) {
  for (const featureKey of stage.requiredFeatureKeys) {
    if (typeof values[featureKey] !== "number" || !Number.isFinite(values[featureKey])) {
      return null;
    }
  }
  let logit = stage.bias;
  for (const featureKey of stage.requiredFeatureKeys) {
    const rule = stage.featureNormalization[featureKey];
    const center = stage.featureCenters[featureKey] ?? 0.5;
    const weight = stage.weights[featureKey] ?? 0;
    const span = rule.max - rule.min;
    const normalized = span > 0 ? clamp01((values[featureKey] - rule.min) / span) : 0.5;
    logit += (normalized - center) * weight;
  }
  return {
    score: sigmoid(logit)
  };
}

function runArtifact(artifact, values) {
  const stage1 = runStage(artifact.stage1, values);
  if (!stage1) {
    return { score: null, fallbackReason: "missing-required-features", stage1: null, stage2: null };
  }
  const stage2 = runStage(artifact.stage2, { ...values, [artifact.stage1.outputKey]: stage1.score });
  if (!stage2) {
    return { score: null, fallbackReason: "missing-required-features", stage1, stage2: null };
  }
  return { score: stage2.score, fallbackReason: null, stage1, stage2 };
}

function confusion(rows, threshold) {
  let tp = 0;
  let fp = 0;
  let tn = 0;
  let fn = 0;
  for (const row of rows) {
    const predicted = row.score >= threshold ? 1 : 0;
    if (row.label === 1 && predicted === 1) tp += 1;
    if (row.label === 0 && predicted === 1) fp += 1;
    if (row.label === 0 && predicted === 0) tn += 1;
    if (row.label === 1 && predicted === 0) fn += 1;
  }
  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const specificity = tn + fp > 0 ? tn / (tn + fp) : 0;
  const accuracy = rows.length > 0 ? (tp + tn) / rows.length : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  const balancedAccuracy = (recall + specificity) / 2;
  return { tp, fp, tn, fn, precision, recall, specificity, accuracy, f1, balancedAccuracy, youdenJ: recall + specificity - 1 };
}

function auc(rows) {
  const sorted = [...rows].sort((left, right) => left.score - right.score);
  const positiveCount = sorted.filter((row) => row.label === 1).length;
  const negativeCount = sorted.length - positiveCount;
  if (positiveCount === 0 || negativeCount === 0) return null;

  let rankSum = 0;
  for (let index = 0; index < sorted.length; index += 1) {
    if (sorted[index].label === 1) rankSum += index + 1;
  }
  return (rankSum - (positiveCount * (positiveCount + 1)) / 2) / (positiveCount * negativeCount);
}

function selectThreshold(rows, mode) {
  if (!mode || mode === "fixed") return 0.5;
  const candidates = Array.from(new Set(rows.map((row) => Number(row.score.toFixed(6))))).sort((a, b) => a - b);
  let best = { threshold: 0.5, metrics: confusion(rows, 0.5), score: -Infinity };
  for (const threshold of candidates) {
    const metrics = confusion(rows, threshold);
    const score =
      mode === "maximize-f1"
        ? metrics.f1
        : mode === "maximize-youden-j"
          ? metrics.youdenJ
          : metrics.balancedAccuracy;
    if (score > best.score) best = { threshold, metrics, score };
  }
  return best.threshold;
}

function buildArtifact(input) {
  const trainingRows = input.rows.map((row) => ({ label: row.label, featureValues: featureValues(row.sample) }));
  const stage1FeatureKeys = input.featureKeys.filter((featureKey) =>
    STAGE1_FEATURE_PATTERNS.some((pattern) => pattern.test(featureKey))
  );
  const safeStage1FeatureKeys = stage1FeatureKeys.length > 0 ? stage1FeatureKeys : input.featureKeys.slice(0, 1);
  const stage1 = trainStage(trainingRows, safeStage1FeatureKeys, "stage1_displacement", STAGE1_OUTPUT_KEY, input.labelKey, {
    trainingMode: "difference-of-means-logit-baseline",
    stageMode: "displacement-evidence",
    targetMode: "warning-label-surrogate"
  });

  const withStage1 = trainingRows.map((row) => ({
    label: row.label,
    featureValues: {
      ...row.featureValues,
      [STAGE1_OUTPUT_KEY]: runStage(stage1, row.featureValues)?.score ?? 0
    }
  }));
  const stage2 = trainStage(
    withStage1,
    [...input.featureKeys, STAGE1_OUTPUT_KEY],
    "stage2_warning",
    STAGE2_OUTPUT_KEY,
    input.labelKey,
    {
      trainingMode: "difference-of-means-logit-baseline",
      stageMode: "warning-fusion",
      upstreamStageKey: "stage1_displacement",
      upstreamOutputKey: STAGE1_OUTPUT_KEY
    }
  );

  return {
    schemaVersion: "linear-risk-model.v1",
    modelKey: input.modelKey,
    modelVersion: input.modelVersion,
    scopeType: input.scopeType,
    scopeKey: input.scopeKey,
    artifactType: "two_stage_linear_risk_v1",
    featureSchemaVersion: "runtime-feature-vector.v1",
    labelSchemaVersion: "warning-hit-label.v1",
    profileVersion: "phase1-profile.v1",
    trainingDatasetKeys: ["Baijiabao-2017-2024"],
    createdAt: new Date().toISOString(),
    entrypoint: "linear-risk-v1",
    labelKey: input.labelKey,
    requiredFeatureKeys: input.featureKeys,
    trainingSummary: {
      sampleCount: input.rows.length,
      positiveCount: input.rows.filter((row) => row.label === 1).length,
      negativeCount: input.rows.filter((row) => row.label === 0).length
    },
    stage1,
    stage2,
    metadata: {
      trainingMode: "difference-of-means-logit-baseline",
      sourceSamplePath: "Baijiabao-2017-2024",
      ...(input.artifactMetadata ?? {})
    }
  };
}

function evaluate(artifact, rows, thresholdMode) {
  const predictions = [];
  for (const row of rows) {
    const execution = runArtifact(artifact, featureValues(row.sample));
    if (execution.score === null) continue;
    predictions.push({
      sampleId: row.sample.sampleId,
      score: execution.score,
      label: row.label,
      stage1Score: execution.stage1?.score ?? null,
      stage2Score: execution.stage2?.score ?? null
    });
  }
  const threshold = selectThreshold(predictions, thresholdMode);
  const metrics = confusion(predictions, threshold);
  const brier =
    predictions.length > 0
      ? predictions.reduce((sum, row) => sum + (row.score - row.label) ** 2, 0) / predictions.length
      : 0;
  return {
    threshold,
    sampleCount: rows.length,
    evaluatedCount: predictions.length,
    fallbackCount: rows.length - predictions.length,
    accuracy: metrics.accuracy,
    precision: metrics.precision,
    recall: metrics.recall,
    f1: metrics.f1,
    brier,
    auc: auc(predictions),
    specificity: metrics.specificity,
    balancedAccuracy: metrics.balancedAccuracy,
    youdenJ: metrics.youdenJ,
    confusion: {
      tp: metrics.tp,
      fp: metrics.fp,
      tn: metrics.tn,
      fn: metrics.fn
    },
    predictions
  };
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  const repoRoot = process.cwd();
  const trainPath = path.resolve(repoRoot, parsed.trainSamples);
  const validationPath = path.resolve(repoRoot, parsed.validationSamples);
  const outDir = path.resolve(repoRoot, parsed.outDir);
  const artifactPath = path.join(outDir, `${parsed.modelKey}.json`);
  const registryPath = path.join(outDir, "registry.json");
  const trainingReportPath = path.join(outDir, "training-report.json");
  const evaluationReportPath = path.join(outDir, "evaluation-report.max-balanced-accuracy.writeback.json");

  const train = collectLabeledRows(await readSamples(trainPath), parsed.labelKey);
  const validation = collectLabeledRows(await readSamples(validationPath), parsed.labelKey);
  const featureKeys = collectFeatureKeys(train.rows, parsed.minFeatureCoverage, parsed.excludeFeatures);
  const artifactMetadata = await readOptionalJson(path.resolve(repoRoot, parsed.artifactMetadataFile));
  const artifact = buildArtifact({
    rows: train.rows,
    featureKeys,
    labelKey: parsed.labelKey,
    modelKey: parsed.modelKey,
    modelVersion: parsed.modelVersion,
    scopeType: parsed.scopeType,
    scopeKey: parsed.scopeKey,
    artifactMetadata
  });
  const evaluation = evaluate(artifact, validation.rows, parsed.thresholdMode);
  artifact.metadata.replaySummary = {
    updatedAt: new Date().toISOString(),
    sampleCount: evaluation.evaluatedCount,
    threshold: evaluation.threshold,
    accuracy: evaluation.accuracy,
    precision: evaluation.precision,
    recall: evaluation.recall,
    f1: evaluation.f1,
    brier: evaluation.brier,
    auc: evaluation.auc,
    specificity: evaluation.specificity,
    balancedAccuracy: evaluation.balancedAccuracy,
    youdenJ: evaluation.youdenJ,
    primaryScore: (evaluation.balancedAccuracy + evaluation.f1 + (evaluation.auc ?? 0)) / 3
  };

  const registry = { artifacts: [artifact] };
  const trainingReport = {
    generatedAt: artifact.createdAt,
    trainSamplesPath: trainPath,
    validationSamplesPath: validationPath,
    outDir,
    artifactPath,
    registryPath,
    artifactType: artifact.artifactType,
    modelKey: parsed.modelKey,
    modelVersion: parsed.modelVersion,
    scopeType: parsed.scopeType,
    scopeKey: parsed.scopeKey,
    labelKey: parsed.labelKey,
    minFeatureCoverage: parsed.minFeatureCoverage,
    excludedFeatures: parsed.excludeFeatures,
    featureCount: featureKeys.length,
    featureKeys,
    sampleCount: train.rows.length,
    positiveCount: train.rows.filter((row) => row.label === 1).length,
    negativeCount: train.rows.filter((row) => row.label === 0).length,
    warnings: [...train.warnings, ...validation.warnings]
  };
  const evaluationReport = {
    generatedAt: new Date().toISOString(),
    samplesPath: validationPath,
    artifactSourcePath: registryPath,
    outputPath: evaluationReportPath,
    labelKey: parsed.labelKey,
    thresholdMode: parsed.thresholdMode,
    threshold: evaluation.threshold,
    sampleCount: evaluation.sampleCount,
    evaluatedCount: evaluation.evaluatedCount,
    fallbackCount: evaluation.fallbackCount,
    accuracy: evaluation.accuracy,
    precision: evaluation.precision,
    recall: evaluation.recall,
    f1: evaluation.f1,
    brier: evaluation.brier,
    auc: evaluation.auc,
    specificity: evaluation.specificity,
    balancedAccuracy: evaluation.balancedAccuracy,
    youdenJ: evaluation.youdenJ,
    confusion: evaluation.confusion,
    replaySummariesByArtifact: {
      [parsed.modelKey]: artifact.metadata.replaySummary
    },
    predictions: evaluation.predictions
  };

  await writeJson(artifactPath, artifact);
  await writeJson(registryPath, registry);
  await writeJson(trainingReportPath, trainingReport);
  await writeJson(evaluationReportPath, evaluationReport);
  console.log(JSON.stringify({ trainingReport, replaySummary: artifact.metadata.replaySummary }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
