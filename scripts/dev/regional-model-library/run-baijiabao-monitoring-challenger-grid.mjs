import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const STAGE1_OUTPUT_KEY = "stage1DisplacementScore";
const STAGE2_OUTPUT_KEY = "stage2WarningScore";
const STAGE1_FEATURE_PATTERNS = [/displacement/i, /beidou/i, /crack/i, /settlement/i, /slip/i, /deformation/i];
const DEFAULT_TRAIN_SAMPLES =
  ".tmp/regional-model-library/out/threegorges-baijiabao/splits/labeled/baijiabao.train.future-labels.window-features.jsonl";
const DEFAULT_VALIDATION_SAMPLES =
  ".tmp/regional-model-library/out/threegorges-baijiabao/splits/labeled/baijiabao.validation.future-labels.window-features.jsonl";
const DEFAULT_OUT_DIR = ".tmp/regional-model-library/out/artifacts/baijiabao-monitoring-challenger-grid";

const FEATURE_FAMILIES = [
  {
    key: "current-all-no-crack",
    minFeatureCoverage: 0.99,
    include: [/^(displacementSurfaceMm|rainfallCurrentMm|reservoirLevelM)(_|$)/],
    exclude: [/^crackDisplacementMm(_|$)/],
    promotionEligible: true
  },
  {
    key: "compact-raw-only",
    minFeatureCoverage: 0.99,
    includeExact: ["displacementSurfaceMm", "rainfallCurrentMm", "reservoirLevelM"],
    exclude: [/^crackDisplacementMm(_|$)/],
    promotionEligible: true
  },
  {
    key: "compact-process",
    minFeatureCoverage: 0.99,
    includeExact: [
      "displacementSurfaceMm",
      "displacementSurfaceMm_delta_72h",
      "rainfallCurrentMm",
      "rainfallCurrentMm_sum_24h",
      "rainfallCurrentMm_sum_72h",
      "reservoirLevelM",
      "reservoirLevelM_delta_72h"
    ],
    exclude: [/^crackDisplacementMm(_|$)/],
    promotionEligible: true
  },
  {
    key: "rainfall-reservoir-displacement-delta",
    minFeatureCoverage: 0.98,
    include: [/^(rainfallCurrentMm|reservoirLevelM)(_|$)/, /^displacementSurfaceMm_delta_(24h|72h)$/],
    exclude: [/^crackDisplacementMm(_|$)/],
    promotionEligible: false
  },
  {
    key: "no-last-duplicates",
    minFeatureCoverage: 0.99,
    include: [/^(displacementSurfaceMm|rainfallCurrentMm|reservoirLevelM)(_|$)/],
    exclude: [/_last_(6h|24h|72h)$/, /^crackDisplacementMm(_|$)/],
    promotionEligible: true
  },
  {
    key: "window-24h-72h-no-6h",
    minFeatureCoverage: 0.99,
    include: [/^(displacementSurfaceMm|rainfallCurrentMm|reservoirLevelM)($|_.*_(24h|72h)$|_delta_72h$)/],
    exclude: [/_last_(6h|24h|72h)$/, /_6h$/, /^crackDisplacementMm(_|$)/],
    promotionEligible: true
  },
  {
    key: "displacement-only",
    minFeatureCoverage: 0.99,
    include: [/^displacementSurfaceMm(_|$)/],
    exclude: [],
    promotionEligible: true
  },
  {
    key: "displacement-rainfall",
    minFeatureCoverage: 0.99,
    include: [/^(displacementSurfaceMm|rainfallCurrentMm)(_|$)/],
    exclude: [/^crackDisplacementMm(_|$)/],
    promotionEligible: true
  },
  {
    key: "displacement-reservoir",
    minFeatureCoverage: 0.99,
    include: [/^(displacementSurfaceMm|reservoirLevelM)(_|$)/],
    exclude: [/^crackDisplacementMm(_|$)/],
    promotionEligible: true
  },
  {
    key: "rainfall-reservoir",
    minFeatureCoverage: 0.99,
    include: [/^(rainfallCurrentMm|reservoirLevelM)(_|$)/],
    exclude: [/^crackDisplacementMm(_|$)/],
    promotionEligible: true
  },
  {
    key: "rainfall-only",
    minFeatureCoverage: 0.99,
    include: [/^rainfallCurrentMm(_|$)/],
    exclude: [],
    promotionEligible: true
  },
  {
    key: "reservoir-only",
    minFeatureCoverage: 0.99,
    include: [/^reservoirLevelM(_|$)/],
    exclude: [],
    promotionEligible: true
  },
  {
    key: "crack-auxiliary-low-coverage",
    minFeatureCoverage: 0.35,
    include: [/^(displacementSurfaceMm|rainfallCurrentMm|reservoirLevelM|crackDisplacementMm)(_|$)/],
    exclude: [],
    promotionEligible: false
  }
];

const TRAINING_MODES = [
  {
    key: "mean-diff",
    description: "Current difference-of-means logit baseline."
  },
  {
    key: "logistic-balanced-l2",
    description: "Batch logistic regression over runtime-compatible min-max centered features with class-balanced loss."
  }
];

const THRESHOLD_MODES = ["maximize-balanced-accuracy", "maximize-f1", "maximize-youden-j"];

function parseArgs(argv) {
  const parsed = {
    trainSamples: DEFAULT_TRAIN_SAMPLES,
    validationSamples: DEFAULT_VALIDATION_SAMPLES,
    outDir: DEFAULT_OUT_DIR,
    labelKey: "warningHitLabel",
    modelVersion: "0.3.0",
    scopeType: "station",
    scopeKey: "Baijiabao",
    artifactMetadataFile: ".tmp/regional-model-library/out/artifact-metadata/CN-420528.land-cover-affinity.json",
    logisticIterations: 700,
    logisticLearningRate: 0.35,
    logisticL2: 0.015
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
      case "--label-key":
        parsed.labelKey = argv[++index] ?? parsed.labelKey;
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
      case "--artifact-metadata-file":
        parsed.artifactMetadataFile = argv[++index] ?? parsed.artifactMetadataFile;
        break;
      case "--logistic-iterations": {
        const value = Number(argv[++index]);
        if (Number.isInteger(value) && value > 0) parsed.logisticIterations = value;
        break;
      }
      case "--logistic-learning-rate": {
        const value = Number(argv[++index]);
        if (Number.isFinite(value) && value > 0) parsed.logisticLearningRate = value;
        break;
      }
      case "--logistic-l2": {
        const value = Number(argv[++index]);
        if (Number.isFinite(value) && value >= 0) parsed.logisticL2 = value;
        break;
      }
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
    rows.push({ sample, label, values: featureValues(sample) });
  }
  if (!rows.some((row) => row.label === 1) || !rows.some((row) => row.label === 0)) {
    throw new Error("Binary training/evaluation requires both positive and negative rows.");
  }
  return { rows, warnings };
}

function featureValues(sample) {
  return Object.entries(sample.metricsNormalized ?? {}).reduce((accumulator, [featureKey, value]) => {
    if (typeof value === "number" && Number.isFinite(value)) accumulator[featureKey] = value;
    return accumulator;
  }, {});
}

function clamp01(value) {
  if (!Number.isFinite(value)) return 0.5;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function sigmoid(value) {
  if (!Number.isFinite(value)) return 0.5;
  if (value >= 20) return 1;
  if (value <= -20) return 0;
  if (value >= 0) {
    const z = Math.exp(-value);
    return 1 / (1 + z);
  }
  const z = Math.exp(value);
  return z / (1 + z);
}

function logit(value) {
  const bounded = Math.min(0.99, Math.max(0.01, value));
  return Math.log(bounded / (1 - bounded));
}

function mean(values) {
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function collectCandidateFeatureKeys(rows) {
  const coverage = new Map();
  for (const row of rows) {
    for (const [featureKey, value] of Object.entries(row.values)) {
      if (typeof value === "number" && Number.isFinite(value)) {
        coverage.set(featureKey, (coverage.get(featureKey) ?? 0) + 1);
      }
    }
  }
  return Array.from(coverage.keys()).sort();
}

function hasCoverage(rows, featureKey, minFeatureCoverage) {
  const minimumCount = Math.max(1, Math.ceil(rows.length * minFeatureCoverage));
  let count = 0;
  for (const row of rows) {
    if (typeof row.values[featureKey] === "number" && Number.isFinite(row.values[featureKey])) count += 1;
  }
  return count >= minimumCount;
}

function matchesFeatureFamily(featureKey, family) {
  if (family.includeExact?.includes(featureKey)) return true;
  const hasIncludePattern = family.include?.some((pattern) => pattern.test(featureKey)) ?? false;
  if (!hasIncludePattern) return false;
  return !(family.exclude?.some((pattern) => pattern.test(featureKey)) ?? false);
}

function selectFamilyFeatureKeys(rows, allFeatureKeys, family) {
  return allFeatureKeys
    .filter((featureKey) => hasCoverage(rows, featureKey, family.minFeatureCoverage))
    .filter((featureKey) => matchesFeatureFamily(featureKey, family))
    .sort();
}

function buildNormalization(rows, featureKeys) {
  const featureNormalization = {};
  const featureCenters = {};
  for (const featureKey of featureKeys) {
    const rawValues = rows
      .map((row) => row.featureValues?.[featureKey] ?? row.values?.[featureKey])
      .filter((value) => typeof value === "number" && Number.isFinite(value));
    const min = rawValues.length > 0 ? Math.min(...rawValues) : 0;
    const max = rawValues.length > 0 ? Math.max(...rawValues) : 0;
    featureNormalization[featureKey] = { min, max };
    const span = max - min;
    const normalizedValues = rawValues.map((value) => (span > 0 ? clamp01((value - min) / span) : 0.5));
    featureCenters[featureKey] = mean(normalizedValues);
  }
  return { featureNormalization, featureCenters };
}

function normalizeValue(featureNormalization, featureKey, value) {
  const rule = featureNormalization[featureKey];
  if (!rule) return value;
  const span = rule.max - rule.min;
  if (!Number.isFinite(span) || span <= 0) return 0.5;
  return clamp01((value - rule.min) / span);
}

function toMatrixRows(rows, featureKeys, featureNormalization, featureCenters) {
  return rows.map((row) => ({
    label: row.label,
    x: featureKeys.map((featureKey) => {
      const value = row.featureValues?.[featureKey] ?? row.values?.[featureKey] ?? 0;
      return normalizeValue(featureNormalization, featureKey, value) - (featureCenters[featureKey] ?? 0);
    })
  }));
}

function trainMeanDiffStage(rows, featureKeys, stageKey, outputKey, labelKey, metadata) {
  const { featureNormalization, featureCenters } = buildNormalization(rows, featureKeys);
  const positiveRows = rows.filter((row) => row.label === 1);
  const negativeRows = rows.filter((row) => row.label === 0);
  const weights = {};

  for (const featureKey of featureKeys) {
    const positiveMean = mean(
      positiveRows.map((row) =>
        normalizeValue(featureNormalization, featureKey, row.featureValues?.[featureKey] ?? row.values?.[featureKey] ?? 0)
      )
    );
    const negativeMean = mean(
      negativeRows.map((row) =>
        normalizeValue(featureNormalization, featureKey, row.featureValues?.[featureKey] ?? row.values?.[featureKey] ?? 0)
      )
    );
    weights[featureKey] = positiveMean - negativeMean;
  }

  const positiveRate = positiveRows.length / rows.length;
  return {
    stageKey,
    outputKey,
    labelKey,
    requiredFeatureKeys: featureKeys,
    featureNormalization,
    featureCenters,
    bias: logit(positiveRate),
    weights,
    trainingSummary: {
      sampleCount: rows.length,
      positiveCount: positiveRows.length,
      negativeCount: negativeRows.length
    },
    metadata
  };
}

function trainLogisticStage(rows, featureKeys, stageKey, outputKey, labelKey, metadata, options) {
  const { featureNormalization, featureCenters } = buildNormalization(rows, featureKeys);
  const matrixRows = toMatrixRows(rows, featureKeys, featureNormalization, featureCenters);
  const positiveCount = matrixRows.filter((row) => row.label === 1).length;
  const negativeCount = matrixRows.length - positiveCount;
  const positiveWeight = matrixRows.length / Math.max(1, 2 * positiveCount);
  const negativeWeight = matrixRows.length / Math.max(1, 2 * negativeCount);
  const weightsArray = new Array(featureKeys.length).fill(0);
  let bias = 0;

  for (let iteration = 0; iteration < options.iterations; iteration += 1) {
    let gradBias = 0;
    const gradWeights = new Array(featureKeys.length).fill(0);
    let totalWeight = 0;

    for (const row of matrixRows) {
      let raw = bias;
      for (let index = 0; index < featureKeys.length; index += 1) {
        raw += weightsArray[index] * row.x[index];
      }
      const predicted = sigmoid(raw);
      const rowWeight = row.label === 1 ? positiveWeight : negativeWeight;
      const error = (predicted - row.label) * rowWeight;
      totalWeight += rowWeight;
      gradBias += error;
      for (let index = 0; index < featureKeys.length; index += 1) {
        gradWeights[index] += error * row.x[index];
      }
    }

    const scale = 1 / Math.max(1, totalWeight);
    bias -= options.learningRate * gradBias * scale;
    for (let index = 0; index < featureKeys.length; index += 1) {
      const l2Gradient = options.l2 * weightsArray[index];
      weightsArray[index] -= options.learningRate * (gradWeights[index] * scale + l2Gradient);
    }
  }

  const weights = {};
  for (let index = 0; index < featureKeys.length; index += 1) {
    weights[featureKeys[index]] = weightsArray[index];
  }

  return {
    stageKey,
    outputKey,
    labelKey,
    requiredFeatureKeys: featureKeys,
    featureNormalization,
    featureCenters,
    bias,
    weights,
    trainingSummary: {
      sampleCount: rows.length,
      positiveCount,
      negativeCount
    },
    metadata
  };
}

function trainStage(rows, featureKeys, stageKey, outputKey, labelKey, mode, options, metadata) {
  if (mode === "logistic-balanced-l2") {
    return trainLogisticStage(rows, featureKeys, stageKey, outputKey, labelKey, metadata, options);
  }
  return trainMeanDiffStage(rows, featureKeys, stageKey, outputKey, labelKey, metadata);
}

function runStage(stage, values) {
  for (const featureKey of stage.requiredFeatureKeys) {
    if (typeof values[featureKey] !== "number" || !Number.isFinite(values[featureKey])) {
      return null;
    }
  }
  let rawScore = stage.bias;
  for (const [featureKey, weight] of Object.entries(stage.weights)) {
    const normalized = normalizeValue(stage.featureNormalization, featureKey, values[featureKey] ?? 0);
    rawScore += weight * (normalized - (stage.featureCenters[featureKey] ?? 0));
  }
  return { score: sigmoid(rawScore), rawScore };
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
  let index = 0;
  while (index < sorted.length) {
    let nextIndex = index + 1;
    while (nextIndex < sorted.length && sorted[nextIndex].score === sorted[index].score) nextIndex += 1;
    const averageRank = (index + 1 + nextIndex) / 2;
    for (let tieIndex = index; tieIndex < nextIndex; tieIndex += 1) {
      if (sorted[tieIndex].label === 1) rankSum += averageRank;
    }
    index = nextIndex;
  }
  return (rankSum - (positiveCount * (positiveCount + 1)) / 2) / (positiveCount * negativeCount);
}

function selectThreshold(rows, mode) {
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
  return best;
}

function buildScoreDistribution(predictions) {
  const scores = predictions.map((row) => row.score).sort((left, right) => left - right);
  const quantile = (q) => {
    if (scores.length === 0) return null;
    const position = (scores.length - 1) * q;
    const lower = Math.floor(position);
    const upper = Math.ceil(position);
    if (lower === upper) return scores[lower];
    return scores[lower] + (scores[upper] - scores[lower]) * (position - lower);
  };
  return {
    min: scores[0] ?? null,
    p10: quantile(0.1),
    p25: quantile(0.25),
    p50: quantile(0.5),
    p75: quantile(0.75),
    p90: quantile(0.9),
    max: scores[scores.length - 1] ?? null
  };
}

function buildFalsePositiveDiagnostics(predictions, threshold, limit = 25) {
  return predictions
    .filter((row) => row.label === 0 && row.score >= threshold)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map((row) => ({
      sampleId: row.sampleId,
      score: row.score,
      stage1Score: row.stage1Score,
      stage2Score: row.stage2Score
    }));
}

function evaluateArtifact(artifact, validationRows) {
  const predictions = [];
  for (const row of validationRows) {
    const execution = runArtifact(artifact, row.values);
    if (execution.score === null) continue;
    predictions.push({
      sampleId: row.sample.sampleId,
      score: execution.score,
      label: row.label,
      stage1Score: execution.stage1?.score ?? null,
      stage2Score: execution.stage2?.score ?? null
    });
  }
  const aucValue = auc(predictions);
  const thresholdEvaluations = {};
  for (const thresholdMode of THRESHOLD_MODES) {
    const selected = selectThreshold(predictions, thresholdMode);
    const brier =
      predictions.length > 0
        ? predictions.reduce((sum, row) => sum + (row.score - row.label) ** 2, 0) / predictions.length
        : 0;
    thresholdEvaluations[thresholdMode] = {
      threshold: selected.threshold,
      ...selected.metrics,
      brier,
      auc: aucValue,
      primaryScore: (selected.metrics.balancedAccuracy + selected.metrics.f1 + (aucValue ?? 0)) / 3
    };
  }
  return {
    sampleCount: validationRows.length,
    evaluatedCount: predictions.length,
    fallbackCount: validationRows.length - predictions.length,
    auc: aucValue,
    scoreDistribution: buildScoreDistribution(predictions),
    thresholdEvaluations,
    predictions
  };
}

function buildArtifact(input) {
  const stage1FeatureKeys = input.featureKeys.filter((featureKey) =>
    STAGE1_FEATURE_PATTERNS.some((pattern) => pattern.test(featureKey))
  );
  const safeStage1FeatureKeys = stage1FeatureKeys.length > 0 ? stage1FeatureKeys : input.featureKeys.slice(0, 1);
  const commonTrainingOptions = {
    iterations: input.logisticIterations,
    learningRate: input.logisticLearningRate,
    l2: input.logisticL2
  };
  const stage1 = trainStage(
    input.rows,
    safeStage1FeatureKeys,
    "stage1_displacement",
    STAGE1_OUTPUT_KEY,
    input.labelKey,
    input.trainingMode,
    commonTrainingOptions,
    {
      trainingMode: input.trainingMode,
      stageMode: "displacement-evidence",
      targetMode: "warning-label-surrogate"
    }
  );

  const withStage1 = input.rows.map((row) => ({
    label: row.label,
    featureValues: {
      ...row.values,
      [STAGE1_OUTPUT_KEY]: runStage(stage1, row.values)?.score ?? 0
    }
  }));
  const stage2 = trainStage(
    withStage1,
    [...input.featureKeys, STAGE1_OUTPUT_KEY],
    "stage2_warning",
    STAGE2_OUTPUT_KEY,
    input.labelKey,
    input.trainingMode,
    commonTrainingOptions,
    {
      trainingMode: input.trainingMode,
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
      trainingMode: input.trainingMode,
      featureFamilyKey: input.featureFamily.key,
      promotionEligible: input.featureFamily.promotionEligible,
      sourceSamplePath: "Baijiabao-2017-2024",
      ...(input.artifactMetadata ?? {})
    }
  };
}

function toReplaySummary(evaluation, thresholdMode) {
  const metrics = evaluation.thresholdEvaluations[thresholdMode];
  return {
    updatedAt: new Date().toISOString(),
    sampleCount: evaluation.evaluatedCount,
    thresholdMode,
    threshold: metrics.threshold,
    accuracy: metrics.accuracy,
    precision: metrics.precision,
    recall: metrics.recall,
    f1: metrics.f1,
    brier: metrics.brier,
    auc: metrics.auc,
    specificity: metrics.specificity,
    balancedAccuracy: metrics.balancedAccuracy,
    youdenJ: metrics.youdenJ,
    primaryScore: metrics.primaryScore
  };
}

function toReplaySummaryFromLeaderboardEntry(entry) {
  return {
    updatedAt: new Date().toISOString(),
    sampleCount: entry.evaluatedCount,
    thresholdMode: entry.thresholdMode,
    threshold: entry.threshold,
    accuracy: entry.accuracy,
    precision: entry.precision,
    recall: entry.recall,
    f1: entry.f1,
    brier: entry.brier,
    auc: entry.auc,
    specificity: entry.specificity,
    balancedAccuracy: entry.balancedAccuracy,
    youdenJ: entry.youdenJ,
    primaryScore: entry.primaryScore
  };
}

function shortArtifactFileName(modelKey) {
  return `${modelKey.replaceAll(/[^a-zA-Z0-9_.-]/g, "_")}.json`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = process.cwd();
  const trainPath = path.resolve(repoRoot, args.trainSamples);
  const validationPath = path.resolve(repoRoot, args.validationSamples);
  const outDir = path.resolve(repoRoot, args.outDir);
  await mkdir(outDir, { recursive: true });

  const train = collectLabeledRows(await readSamples(trainPath), args.labelKey);
  const validation = collectLabeledRows(await readSamples(validationPath), args.labelKey);
  const allFeatureKeys = collectCandidateFeatureKeys(train.rows);
  const artifactMetadata = await readOptionalJson(path.resolve(repoRoot, args.artifactMetadataFile));
  const leaderboard = [];
  const artifacts = [];
  const detailedReports = [];

  for (const featureFamily of FEATURE_FAMILIES) {
    const featureKeys = selectFamilyFeatureKeys(train.rows, allFeatureKeys, featureFamily);
    if (featureKeys.length === 0) {
      detailedReports.push({
        featureFamilyKey: featureFamily.key,
        skipped: true,
        reason: "no-feature-key-selected"
      });
      continue;
    }

    for (const trainingMode of TRAINING_MODES) {
      const modelKey = `baijiabao.challenger.${featureFamily.key}.${trainingMode.key}.linear-risk-v1`;
      const artifact = buildArtifact({
        rows: train.rows,
        featureKeys,
        featureFamily,
        trainingMode: trainingMode.key,
        logisticIterations: args.logisticIterations,
        logisticLearningRate: args.logisticLearningRate,
        logisticL2: args.logisticL2,
        labelKey: args.labelKey,
        modelKey,
        modelVersion: args.modelVersion,
        scopeType: args.scopeType,
        scopeKey: args.scopeKey,
        artifactMetadata
      });
      const evaluation = evaluateArtifact(artifact, validation.rows);

      for (const thresholdMode of THRESHOLD_MODES) {
        const replaySummary = toReplaySummary(evaluation, thresholdMode);
        const entry = {
          rank: null,
          modelKey,
          modelVersion: artifact.modelVersion,
          featureFamilyKey: featureFamily.key,
          trainingMode: trainingMode.key,
          thresholdMode,
          promotionEligible: featureFamily.promotionEligible,
          featureCount: featureKeys.length,
          requiredFeatureKeys: featureKeys,
          sampleCount: evaluation.sampleCount,
          evaluatedCount: evaluation.evaluatedCount,
          fallbackCount: evaluation.fallbackCount,
          ...replaySummary,
          confusion: {
            tp: evaluation.thresholdEvaluations[thresholdMode].tp,
            fp: evaluation.thresholdEvaluations[thresholdMode].fp,
            tn: evaluation.thresholdEvaluations[thresholdMode].tn,
            fn: evaluation.thresholdEvaluations[thresholdMode].fn
          }
        };
        leaderboard.push(entry);
      }

      const primaryThresholdMode = "maximize-balanced-accuracy";
      artifact.metadata.replaySummary = toReplaySummary(evaluation, primaryThresholdMode);
      artifact.metadata.replaySummariesByThresholdMode = evaluation.thresholdEvaluations;
      artifact.metadata.scoreDistribution = evaluation.scoreDistribution;
      artifacts.push(artifact);
      detailedReports.push({
        modelKey,
        featureFamilyKey: featureFamily.key,
        trainingMode: trainingMode.key,
        trainingModeDescription: trainingMode.description,
        promotionEligible: featureFamily.promotionEligible,
        featureCount: featureKeys.length,
        featureKeys,
        evaluation: {
          sampleCount: evaluation.sampleCount,
          evaluatedCount: evaluation.evaluatedCount,
          fallbackCount: evaluation.fallbackCount,
          auc: evaluation.auc,
          scoreDistribution: evaluation.scoreDistribution,
          thresholdEvaluations: evaluation.thresholdEvaluations,
          falsePositiveExamplesAtBalancedAccuracy: buildFalsePositiveDiagnostics(
            evaluation.predictions,
            evaluation.thresholdEvaluations[primaryThresholdMode].threshold
          )
        }
      });
    }
  }

  leaderboard.sort((left, right) => {
    const leftEligible = left.promotionEligible ? 1 : 0;
    const rightEligible = right.promotionEligible ? 1 : 0;
    if (rightEligible !== leftEligible) return rightEligible - leftEligible;
    return right.primaryScore - left.primaryScore;
  });
  leaderboard.forEach((entry, index) => {
    entry.rank = index + 1;
  });

  const bestEligible = leaderboard.find((entry) => entry.promotionEligible) ?? null;
  const bestOverall = leaderboard[0] ?? null;
  const eligibleRows = leaderboard.filter((entry) => entry.promotionEligible);
  const bestEligibleByBalancedAccuracy =
    eligibleRows.slice().sort((left, right) => right.balancedAccuracy - left.balancedAccuracy)[0] ?? null;
  const bestEligibleByPrecisionAtF1 =
    eligibleRows
      .filter((entry) => entry.thresholdMode === "maximize-f1")
      .slice()
      .sort((left, right) => right.f1 - left.f1 || right.precision - left.precision)[0] ?? null;
  const bestArtifact = bestEligible
    ? artifacts.find((artifact) => artifact.modelKey === bestEligible.modelKey) ?? null
    : null;
  const bestBalancedArtifact = bestEligibleByBalancedAccuracy
    ? artifacts.find((artifact) => artifact.modelKey === bestEligibleByBalancedAccuracy.modelKey) ?? null
    : null;

  const report = {
    generatedAt: new Date().toISOString(),
    trainSamplesPath: trainPath,
    validationSamplesPath: validationPath,
    labelKey: args.labelKey,
    trainSummary: {
      sampleCount: train.rows.length,
      positiveCount: train.rows.filter((row) => row.label === 1).length,
      negativeCount: train.rows.filter((row) => row.label === 0).length
    },
    validationSummary: {
      sampleCount: validation.rows.length,
      positiveCount: validation.rows.filter((row) => row.label === 1).length,
      negativeCount: validation.rows.filter((row) => row.label === 0).length
    },
    grid: {
      featureFamilies: FEATURE_FAMILIES.map((family) => ({
        key: family.key,
        minFeatureCoverage: family.minFeatureCoverage,
        promotionEligible: family.promotionEligible
      })),
      trainingModes: TRAINING_MODES,
      thresholdModes: THRESHOLD_MODES,
      logisticOptions: {
        iterations: args.logisticIterations,
        learningRate: args.logisticLearningRate,
        l2: args.logisticL2
      }
    },
    bestEligible,
    bestOverall,
    bestEligibleByBalancedAccuracy,
    bestEligibleByPrecisionAtF1,
    leaderboard,
    warnings: [...train.warnings, ...validation.warnings]
  };

  const reportPath = path.join(outDir, "challenger-grid.report.json");
  const leaderboardPath = path.join(outDir, "leaderboard.json");
  const detailsPath = path.join(outDir, "challenger-grid.details.json");
  const registryPath = path.join(outDir, "registry.json");
  await writeJson(reportPath, report);
  await writeJson(leaderboardPath, leaderboard);
  await writeJson(detailsPath, detailedReports);
  await writeJson(registryPath, { artifacts });
  if (bestArtifact) {
    const bestArtifactWithThreshold = structuredClone(bestArtifact);
    bestArtifactWithThreshold.metadata.replaySummary = toReplaySummaryFromLeaderboardEntry(bestEligible);
    await writeJson(path.join(outDir, "best-eligible.registry.json"), { artifacts: [bestArtifactWithThreshold] });
    await writeJson(path.join(outDir, shortArtifactFileName(bestArtifactWithThreshold.modelKey)), bestArtifactWithThreshold);
  }
  if (bestBalancedArtifact) {
    const bestBalancedArtifactWithThreshold = structuredClone(bestBalancedArtifact);
    bestBalancedArtifactWithThreshold.metadata.replaySummary =
      toReplaySummaryFromLeaderboardEntry(bestEligibleByBalancedAccuracy);
    await writeJson(path.join(outDir, "best-balanced-accuracy.registry.json"), {
      artifacts: [bestBalancedArtifactWithThreshold]
    });
  }

  console.log(
    JSON.stringify(
      {
        reportPath,
        leaderboardPath,
        detailsPath,
        registryPath,
        candidateCount: artifacts.length,
        leaderboardRows: leaderboard.length,
        bestEligible: bestEligible
          ? {
              modelKey: bestEligible.modelKey,
              featureFamilyKey: bestEligible.featureFamilyKey,
              trainingMode: bestEligible.trainingMode,
              thresholdMode: bestEligible.thresholdMode,
              primaryScore: bestEligible.primaryScore,
              balancedAccuracy: bestEligible.balancedAccuracy,
              auc: bestEligible.auc,
              f1: bestEligible.f1,
              precision: bestEligible.precision,
              recall: bestEligible.recall,
              specificity: bestEligible.specificity,
              confusion: bestEligible.confusion,
              threshold: bestEligible.threshold
            }
          : null,
        bestOverall: bestOverall
          ? {
              modelKey: bestOverall.modelKey,
              featureFamilyKey: bestOverall.featureFamilyKey,
              trainingMode: bestOverall.trainingMode,
              thresholdMode: bestOverall.thresholdMode,
              promotionEligible: bestOverall.promotionEligible,
              primaryScore: bestOverall.primaryScore,
              balancedAccuracy: bestOverall.balancedAccuracy,
              auc: bestOverall.auc,
              f1: bestOverall.f1,
              precision: bestOverall.precision,
              recall: bestOverall.recall,
              specificity: bestOverall.specificity,
              confusion: bestOverall.confusion,
              threshold: bestOverall.threshold
            }
          : null,
        bestEligibleByBalancedAccuracy: bestEligibleByBalancedAccuracy
          ? {
              modelKey: bestEligibleByBalancedAccuracy.modelKey,
              featureFamilyKey: bestEligibleByBalancedAccuracy.featureFamilyKey,
              trainingMode: bestEligibleByBalancedAccuracy.trainingMode,
              thresholdMode: bestEligibleByBalancedAccuracy.thresholdMode,
              primaryScore: bestEligibleByBalancedAccuracy.primaryScore,
              balancedAccuracy: bestEligibleByBalancedAccuracy.balancedAccuracy,
              auc: bestEligibleByBalancedAccuracy.auc,
              f1: bestEligibleByBalancedAccuracy.f1,
              precision: bestEligibleByBalancedAccuracy.precision,
              recall: bestEligibleByBalancedAccuracy.recall,
              specificity: bestEligibleByBalancedAccuracy.specificity,
              confusion: bestEligibleByBalancedAccuracy.confusion,
              threshold: bestEligibleByBalancedAccuracy.threshold
            }
          : null
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
