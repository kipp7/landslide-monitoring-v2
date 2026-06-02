import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const DEFAULT_TRAIN =
  ".tmp/regional-model-library/out/threegorges-baijiabao/splits/labeled/baijiabao.train.future-labels.window-features.jsonl";
const DEFAULT_VALIDATION =
  ".tmp/regional-model-library/out/threegorges-baijiabao/splits/labeled/baijiabao.validation.future-labels.window-features.jsonl";
const DEFAULT_OUT_DIR = ".tmp/regional-model-library/out/artifacts/baijiabao-displacement-prediction-card";
const DECOMPOSITION_FEATURE_KEYS = [
  "decompHistoryCount",
  "decompCurrentDisplacement",
  ...[3, 5, 10, 20].flatMap((window) => [
    `decompMean${window}`,
    `decompResidualMean${window}`,
    `decompSlope${window}`,
    `decompVolatility${window}`,
    `decompRange${window}`
  ]),
  ...[3, 5, 10, 20].map((window) => `decompRainfallMean${window}`),
  ...[3, 5, 10, 20].map((window) => `decompReservoirSlope${window}`)
];

const FEATURE_FAMILIES = [
  {
    key: "analog-small",
    description: "Minimal displacement-delta feature set for nearest-history analog matching.",
    features: ["displacementSurfaceMm_delta_24h", "displacementSurfaceMm_delta_72h"]
  },
  {
    key: "delta-family",
    description: "Surface displacement deltas plus rainfall/reservoir process deltas.",
    features: [
      "displacementSurfaceMm_delta_24h",
      "displacementSurfaceMm_delta_72h",
      "rainfallCurrentMm_sum_24h",
      "rainfallCurrentMm_sum_72h",
      "reservoirLevelM_delta_24h",
      "reservoirLevelM_delta_72h"
    ]
  },
  {
    key: "decomp-family",
    description: "Surface displacement deltas plus leakage-safe rolling decomposition trend/residual features.",
    features: [
      "displacementSurfaceMm_delta_24h",
      "displacementSurfaceMm_delta_72h",
      "rainfallCurrentMm_sum_24h",
      "rainfallCurrentMm_sum_72h",
      "reservoirLevelM_delta_24h",
      "reservoirLevelM_delta_72h",
      ...DECOMPOSITION_FEATURE_KEYS
    ]
  },
  {
    key: "sequence-lag",
    description: "Runtime-reconstructable previous displacement-delta state plus compact process deltas.",
    features: [
      "labelLag1",
      "labelLag2",
      "labelLag3",
      "labelMean3",
      "labelMean5",
      "labelEma3",
      "labelTrendLag1Lag3",
      "labelAbsLag1",
      "displacementSurfaceMm_delta_24h",
      "displacementSurfaceMm_delta_72h",
      "rainfallCurrentMm_sum_24h",
      "rainfallCurrentMm_sum_72h",
      "reservoirLevelM_delta_24h",
      "reservoirLevelM_delta_72h"
    ]
  },
  {
    key: "delta-point-seasonal",
    description: "Surface displacement deltas plus point identity and monthly seasonality.",
    include: [
      /^displacementSurfaceMm_delta_(24h|72h)$/,
      /^rainfallCurrentMm_sum_(24h|72h)$/,
      /^reservoirLevelM_delta_(24h|72h)$/,
      /^pointId:/,
      /^month:/
    ]
  },
  {
    key: "process-compact",
    description: "Compact displacement, rainfall, and reservoir process features.",
    features: [
      "displacementSurfaceMm_delta_24h",
      "displacementSurfaceMm_delta_72h",
      "rainfallCurrentMm",
      "rainfallCurrentMm_sum_24h",
      "rainfallCurrentMm_sum_72h",
      "reservoirLevelM",
      "reservoirLevelM_delta_24h",
      "reservoirLevelM_delta_72h"
    ]
  },
  {
    key: "displacement-window",
    description: "Surface displacement history window statistics without absolute last-value leakage.",
    include: [/^displacementSurfaceMm_(delta|mean|min|max)_(24h|72h)$/],
    exclude: [/^displacementSurfaceMm_last_/]
  },
  {
    key: "rainfall-reservoir",
    description: "Hydroclimate-only baseline for comparison.",
    include: [/^(rainfallCurrentMm|reservoirLevelM)(_|$)/]
  },
  {
    key: "all-no-crack",
    description: "All high-coverage non-crack numerical features.",
    include: [/^(displacementSurfaceMm|rainfallCurrentMm|reservoirLevelM)(_|$)/],
    exclude: [/^crackDisplacementMm(_|$)/]
  }
];

const RIDGE_LAMBDAS = [0, 0.001, 0.01, 0.1, 1, 10, 100, 1000];
const TARGET_CLIPS = [null, 3, 2, 1.5, 1.3, 1];
const ANALOG_K_VALUES = [15, 25, 50, 100];
const ENSEMBLE_BLEND_WEIGHTS = [0.2, 0.4, 0.45, 0.6];
const POINTWISE_ANALOG_K_VALUES = [5, 7, 10, 12, 15, 20, 25, 35];
const POINTWISE_ENSEMBLE_BLEND_WEIGHTS = [0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6];
const POINTWISE_MIN_TRAIN_ROWS = 100;
const POINTWISE_FIXED_ENSEMBLE_FAMILY_KEYS = ["analog-small", "delta-family"];
const POINTWISE_DECOMP_FIXED_ENSEMBLE_FAMILY_KEYS = ["analog-small", "delta-family", "decomp-family"];
const POINTWISE_FIXED_ENSEMBLE_K_VALUES = [15, 20];
const POINTWISE_FIXED_ENSEMBLE_BLEND_WEIGHTS = [0.3, 0.35, 0.4, 0.45];
const POINTWISE_FIXED_ENSEMBLE_AGGREGATIONS = ["mean", "median"];
const SEQUENCE_LAG_K_VALUES = [5, 10, 15, 20];
const SEQUENCE_LAG_BLEND_WEIGHTS = [0.2, 0.35, 0.5, 0.65];
const POINTWISE_FIXED_ENSEMBLE_WEIGHT_PROFILES = [
  { key: "equal", weights: { "analog-small": 1, "delta-family": 1 } },
  { key: "delta-heavy-1p25x", weights: { "analog-small": 1, "delta-family": 1.25 } },
  { key: "delta-heavy-1p35x", weights: { "analog-small": 1, "delta-family": 1.35 } },
  { key: "delta-heavy-1p4x", weights: { "analog-small": 1, "delta-family": 1.4 } },
  { key: "delta-heavy-1p45x", weights: { "analog-small": 1, "delta-family": 1.45 } },
  { key: "delta-heavy-1p5x", weights: { "analog-small": 1, "delta-family": 1.5 } },
  { key: "delta-heavy-1p52x", weights: { "analog-small": 1, "delta-family": 1.52 } },
  { key: "delta-heavy-1p55x", weights: { "analog-small": 1, "delta-family": 1.55 } },
  { key: "delta-heavy-1p58x", weights: { "analog-small": 1, "delta-family": 1.58 } },
  { key: "delta-heavy-1p6x", weights: { "analog-small": 1, "delta-family": 1.6 } },
  { key: "delta-heavy-1p62x", weights: { "analog-small": 1, "delta-family": 1.62 } },
  { key: "delta-heavy-1p65x", weights: { "analog-small": 1, "delta-family": 1.65 } },
  { key: "delta-heavy-1p68x", weights: { "analog-small": 1, "delta-family": 1.68 } },
  { key: "delta-heavy-1p75x", weights: { "analog-small": 1, "delta-family": 1.75 } },
  { key: "delta-heavy-1p8x", weights: { "analog-small": 1, "delta-family": 1.8 } },
  { key: "delta-heavy-1p85x", weights: { "analog-small": 1, "delta-family": 1.85 } },
  { key: "delta-heavy-1p9x", weights: { "analog-small": 1, "delta-family": 1.9 } },
  { key: "delta-heavy-1p95x", weights: { "analog-small": 1, "delta-family": 1.95 } },
  { key: "delta-heavy-2x", weights: { "analog-small": 1, "delta-family": 2 } },
  { key: "delta-heavy-2p25x", weights: { "analog-small": 1, "delta-family": 2.25 } },
  { key: "delta-heavy-2p5x", weights: { "analog-small": 1, "delta-family": 2.5 } },
  { key: "delta-heavy-2p75x", weights: { "analog-small": 1, "delta-family": 2.75 } },
  { key: "delta-heavy-3x", weights: { "analog-small": 1, "delta-family": 3 } },
  { key: "delta-only", weights: { "analog-small": 0, "delta-family": 1 } }
];
const VALIDATION_RANKED_POINTWISE_ENSEMBLE_SIZES = [4, 6, 8, 12, 16, 24];
const OOF_CALIBRATION_FOLDS = 5;
const OOF_CALIBRATION_CANDIDATE_LIMIT = 8;
const ENSEMBLE_OOF_CALIBRATION_CANDIDATE_LIMIT = 18;
const HUBER_OOF_TUNING_CONSTANTS = [0.6, 0.7, 0.8, 0.85, 0.9, 0.95, 1, 1.05, 1.1, 1.2, 1.35, 1.5, 1.75, 2];
const PRACTICAL_RMSE_TIE_EPSILON = 0.00005;
const SELECTION_PROFILE = `global-practical-rmse-band-${PRACTICAL_RMSE_TIE_EPSILON}-then-mae-within-p90`;
const REGIME_RESIDUAL_CORRECTION_CONFIGS = [
  { key: "point", dimensions: ["point"], minCount: 120, shrinkage: 120, maxAbsBias: 0.18, correctionScale: 1 },
  { key: "point-month-s025", dimensions: ["point", "month"], minCount: 35, shrinkage: 90, maxAbsBias: 0.16, correctionScale: 0.25 },
  { key: "point-month-s035", dimensions: ["point", "month"], minCount: 35, shrinkage: 90, maxAbsBias: 0.16, correctionScale: 0.35 },
  { key: "point-month-s040", dimensions: ["point", "month"], minCount: 35, shrinkage: 90, maxAbsBias: 0.16, correctionScale: 0.4 },
  { key: "point-month-s045", dimensions: ["point", "month"], minCount: 35, shrinkage: 90, maxAbsBias: 0.16, correctionScale: 0.45 },
  { key: "point-month-s050", dimensions: ["point", "month"], minCount: 35, shrinkage: 90, maxAbsBias: 0.16, correctionScale: 0.5 },
  { key: "point-month-s055", dimensions: ["point", "month"], minCount: 35, shrinkage: 90, maxAbsBias: 0.16, correctionScale: 0.55 },
  { key: "point-month-s060", dimensions: ["point", "month"], minCount: 35, shrinkage: 90, maxAbsBias: 0.16, correctionScale: 0.6 },
  { key: "point-month-s065", dimensions: ["point", "month"], minCount: 35, shrinkage: 90, maxAbsBias: 0.16, correctionScale: 0.65 },
  { key: "point-month-s075", dimensions: ["point", "month"], minCount: 35, shrinkage: 90, maxAbsBias: 0.16, correctionScale: 0.75 },
  { key: "point-month", dimensions: ["point", "month"], minCount: 35, shrinkage: 90, maxAbsBias: 0.16, correctionScale: 1 },
  { key: "point-month-stable-s050", dimensions: ["point", "month"], minCount: 45, shrinkage: 120, maxAbsBias: 0.14, correctionScale: 0.5 },
  { key: "point-month-stable-s060", dimensions: ["point", "month"], minCount: 45, shrinkage: 120, maxAbsBias: 0.14, correctionScale: 0.6 }
];

function parseArgs(argv) {
  const parsed = {
    trainSamples: DEFAULT_TRAIN,
    validationSamples: DEFAULT_VALIDATION,
    outDir: DEFAULT_OUT_DIR,
    labelKey: "displacementLabel",
    modelKey: "baijiabao.displacement.pointwise-delta-analog-ridge-knn-median-v6",
    modelVersion: "0.6.0",
    thresholdMmPerDay: 1.3,
    toleranceMm: 1
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--train-samples") parsed.trainSamples = argv[++index] ?? parsed.trainSamples;
    if (token === "--validation-samples") parsed.validationSamples = argv[++index] ?? parsed.validationSamples;
    if (token === "--out-dir") parsed.outDir = argv[++index] ?? parsed.outDir;
    if (token === "--label-key") parsed.labelKey = argv[++index] ?? parsed.labelKey;
    if (token === "--model-key") parsed.modelKey = argv[++index] ?? parsed.modelKey;
    if (token === "--model-version") parsed.modelVersion = argv[++index] ?? parsed.modelVersion;
    if (token === "--threshold-mm-per-day") {
      const value = Number(argv[++index]);
      if (Number.isFinite(value) && value > 0) parsed.thresholdMmPerDay = value;
    }
    if (token === "--tolerance-mm") {
      const value = Number(argv[++index]);
      if (Number.isFinite(value) && value > 0) parsed.toleranceMm = value;
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

async function writeText(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, value, "utf-8");
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function collectRows(samples, labelKey) {
  const rows = [];
  let ignoredCount = 0;
  for (const sample of samples) {
    const label = sample.labels?.[labelKey];
    if (!isFiniteNumber(label)) {
      ignoredCount += 1;
      continue;
    }
    const values = {};
    for (const [featureKey, value] of Object.entries(sample.metricsNormalized ?? {})) {
      if (isFiniteNumber(value)) values[featureKey] = value;
    }
    rows.push({
      sampleId: sample.sampleId,
      eventTs: sample.eventTs,
      label,
      pointId: sample.rawRef?.originalFields?.point_id ?? sample.rawRef?.originalFields?.sensor_id ?? "unknown",
      values
    });
  }
  return { rows, ignoredCount };
}

function monthFromEventTs(eventTs) {
  if (typeof eventTs !== "string" || eventTs.length < 7) return "unknown";
  const month = Number(eventTs.slice(5, 7));
  if (!Number.isInteger(month) || month < 1 || month > 12) return "unknown";
  return String(month).padStart(2, "0");
}

function addCategoricalFeatures(trainRows, validationRows) {
  const allRows = [...trainRows, ...validationRows];
  const pointIds = Array.from(new Set(allRows.map((row) => String(row.pointId ?? "unknown")))).sort();
  const months = Array.from(new Set(allRows.map((row) => monthFromEventTs(row.eventTs)))).sort();

  for (const row of allRows) {
    const pointId = String(row.pointId ?? "unknown");
    const month = monthFromEventTs(row.eventTs);
    for (const candidate of pointIds) row.values[`pointId:${candidate}`] = pointId === candidate ? 1 : 0;
    for (const candidate of months) row.values[`month:${candidate}`] = month === candidate ? 1 : 0;
  }

  return { pointIds, months };
}

function sortRowsByTime(rows) {
  return [...rows].sort((left, right) => {
    const timeComparison = String(left.eventTs ?? "").localeCompare(String(right.eventTs ?? ""));
    if (timeComparison !== 0) return timeComparison;
    return String(left.sampleId ?? "").localeCompare(String(right.sampleId ?? ""));
  });
}

function assignLagFeaturesFromHistory(row, history) {
  if (history.length < 3) return false;
  const lag1 = history.at(-1);
  const lag2 = history.at(-2);
  const lag3 = history.at(-3);
  const last3 = history.slice(-3);
  const last5 = history.slice(-5);
  const ema3 = last3.reduce((sum, value, index) => sum + value * [0.2, 0.3, 0.5][index], 0);
  row.values.labelLag1 = lag1;
  row.values.labelLag2 = lag2;
  row.values.labelLag3 = lag3;
  row.values.labelMean3 = mean(last3);
  row.values.labelMean5 = mean(last5);
  row.values.labelEma3 = ema3;
  row.values.labelTrendLag1Lag3 = lag1 - lag3;
  row.values.labelAbsLag1 = Math.abs(lag1);
  return true;
}

function addSequentialLabelLagFeatures(trainRows, validationRows) {
  const trainByPoint = new Map();
  let trainAugmented = 0;
  for (const row of sortRowsByTime(trainRows)) {
    const pointId = String(row.pointId ?? "unknown");
    const history = trainByPoint.get(pointId) ?? [];
    if (assignLagFeaturesFromHistory(row, history)) trainAugmented += 1;
    history.push(row.label);
    trainByPoint.set(pointId, history);
  }

  let validationAugmented = 0;
  const validationHistoryByPoint = new Map(
    Array.from(trainByPoint.entries()).map(([pointId, history]) => [pointId, [...history]])
  );
  for (const row of sortRowsByTime(validationRows)) {
    const pointId = String(row.pointId ?? "unknown");
    const history = validationHistoryByPoint.get(pointId) ?? [];
    if (assignLagFeaturesFromHistory(row, history)) validationAugmented += 1;
    history.push(row.label);
    validationHistoryByPoint.set(pointId, history);
  }

  return {
    trainAugmented,
    validationAugmented,
    minHistory: 3,
    mode: "pointwise-chronological-previous-labels"
  };
}

function linearSlope(values) {
  const numericValues = values.filter((value) => Number.isFinite(value));
  if (numericValues.length < 2) return 0;
  const xMean = (numericValues.length - 1) / 2;
  const yMean = mean(numericValues);
  let numerator = 0;
  let denominator = 0;
  for (let index = 0; index < numericValues.length; index += 1) {
    const xDelta = index - xMean;
    numerator += xDelta * (numericValues[index] - yMean);
    denominator += xDelta * xDelta;
  }
  return denominator > 0 ? numerator / denominator : 0;
}

function fillDecompositionWindow(row, window, values) {
  if (values.length === 0) {
    row.values[`decompMean${window}`] = 0;
    row.values[`decompResidualMean${window}`] = 0;
    row.values[`decompSlope${window}`] = 0;
    row.values[`decompVolatility${window}`] = 0;
    row.values[`decompRange${window}`] = 0;
    return;
  }
  const current = values.at(-1);
  const windowMean = mean(values);
  const deltas = values.length >= 2 ? values.slice(1).map((value, index) => value - values[index]) : [0];
  const deltaMean = mean(deltas);
  row.values[`decompMean${window}`] = windowMean;
  row.values[`decompResidualMean${window}`] = current - windowMean;
  row.values[`decompSlope${window}`] = linearSlope(values);
  row.values[`decompVolatility${window}`] = Math.sqrt(mean(deltas.map((value) => (value - deltaMean) ** 2)));
  row.values[`decompRange${window}`] = Math.max(...values) - Math.min(...values);
}

function updateDecompositionHistory(history, row) {
  const displacement = row.values.displacementSurfaceMm;
  if (!Number.isFinite(displacement)) return;
  history.push({
    displacement,
    rainfall: Number.isFinite(row.values.rainfallCurrentMm) ? row.values.rainfallCurrentMm : null,
    reservoir: Number.isFinite(row.values.reservoirLevelM) ? row.values.reservoirLevelM : null
  });
}

function assignDecompositionFeatures(row, previousHistory) {
  const history = [...previousHistory];
  if (Number.isFinite(row.values.displacementSurfaceMm)) {
    history.push({
      displacement: row.values.displacementSurfaceMm,
      rainfall: Number.isFinite(row.values.rainfallCurrentMm) ? row.values.rainfallCurrentMm : null,
      reservoir: Number.isFinite(row.values.reservoirLevelM) ? row.values.reservoirLevelM : null
    });
  }

  const displacementValues = history.map((item) => item.displacement).filter((value) => Number.isFinite(value));
  row.values.decompHistoryCount = displacementValues.length;
  row.values.decompCurrentDisplacement = displacementValues.at(-1) ?? 0;
  for (const window of [3, 5, 10, 20]) {
    fillDecompositionWindow(row, window, displacementValues.slice(-window));
    const rainfallValues = history.map((item) => item.rainfall).filter((value) => Number.isFinite(value)).slice(-window);
    const reservoirValues = history.map((item) => item.reservoir).filter((value) => Number.isFinite(value)).slice(-window);
    row.values[`decompRainfallMean${window}`] = rainfallValues.length > 0 ? mean(rainfallValues) : 0;
    row.values[`decompReservoirSlope${window}`] = linearSlope(reservoirValues);
  }
}

function addDecompositionFeatures(trainRows, validationRows) {
  const trainByPoint = new Map();
  for (const row of sortRowsByTime(trainRows)) {
    const pointId = String(row.pointId ?? "unknown");
    const history = trainByPoint.get(pointId) ?? [];
    assignDecompositionFeatures(row, history);
    updateDecompositionHistory(history, row);
    trainByPoint.set(pointId, history);
  }

  const validationHistoryByPoint = new Map(
    Array.from(trainByPoint.entries()).map(([pointId, history]) => [pointId, [...history]])
  );
  for (const row of sortRowsByTime(validationRows)) {
    const pointId = String(row.pointId ?? "unknown");
    const history = validationHistoryByPoint.get(pointId) ?? [];
    assignDecompositionFeatures(row, history);
    updateDecompositionHistory(history, row);
    validationHistoryByPoint.set(pointId, history);
  }

  return {
    trainRows: trainRows.length,
    validationRows: validationRows.length,
    featureKeys: DECOMPOSITION_FEATURE_KEYS,
    mode: "pointwise-chronological-current-and-past-decomposition"
  };
}

function coverage(rows) {
  const counts = new Map();
  for (const row of rows) {
    for (const featureKey of Object.keys(row.values)) {
      counts.set(featureKey, (counts.get(featureKey) ?? 0) + 1);
    }
  }
  return counts;
}

function resolveFeatureKeys(family, trainRows, validationRows) {
  if (family.features) return family.features;

  const trainCoverage = coverage(trainRows);
  const validationCoverage = coverage(validationRows);
  return Array.from(trainCoverage.keys())
    .filter((featureKey) => {
      const trainRatio = (trainCoverage.get(featureKey) ?? 0) / trainRows.length;
      const validationRatio = (validationCoverage.get(featureKey) ?? 0) / validationRows.length;
      if (trainRatio < 0.98 || validationRatio < 0.9) return false;
      if (family.include && !family.include.some((pattern) => pattern.test(featureKey))) return false;
      if (family.exclude?.some((pattern) => pattern.test(featureKey))) return false;
      return true;
    })
    .sort();
}

function rowsWithFeatures(rows, featureKeys) {
  return rows.filter((row) => featureKeys.every((featureKey) => isFiniteNumber(row.values[featureKey])));
}

function buildNormalizer(rows, featureKeys) {
  const normalization = {};
  for (const featureKey of featureKeys) {
    const values = rows.map((row) => row.values[featureKey]);
    const min = Math.min(...values);
    const max = Math.max(...values);
    normalization[featureKey] = { min, max, span: max > min ? max - min : 1 };
  }
  return normalization;
}

function normalizeRow(row, featureKeys, normalization) {
  return featureKeys.map((featureKey) => {
    const rule = normalization[featureKey];
    return (row.values[featureKey] - rule.min) / rule.span;
  });
}

function solveLinearSystem(matrix, vector) {
  const n = matrix.length;
  const augmented = matrix.map((row, rowIndex) => [...row, vector[rowIndex]]);

  for (let column = 0; column < n; column += 1) {
    let pivotRow = column;
    for (let row = column + 1; row < n; row += 1) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivotRow][column])) pivotRow = row;
    }
    if (Math.abs(augmented[pivotRow][column]) < 1e-12) {
      augmented[pivotRow][column] = 1e-12;
    }
    if (pivotRow !== column) {
      const temp = augmented[column];
      augmented[column] = augmented[pivotRow];
      augmented[pivotRow] = temp;
    }

    const pivot = augmented[column][column];
    for (let col = column; col <= n; col += 1) augmented[column][col] /= pivot;
    for (let row = 0; row < n; row += 1) {
      if (row === column) continue;
      const factor = augmented[row][column];
      for (let col = column; col <= n; col += 1) {
        augmented[row][col] -= factor * augmented[column][col];
      }
    }
  }

  return augmented.map((row) => row[n]);
}

function trainRidge(rows, featureKeys, lambda, targetClip) {
  const normalization = buildNormalizer(rows, featureKeys);
  const dimension = featureKeys.length + 1;
  const xtx = Array.from({ length: dimension }, () => Array.from({ length: dimension }, () => 0));
  const xty = Array.from({ length: dimension }, () => 0);

  for (const row of rows) {
    const x = [1, ...normalizeRow(row, featureKeys, normalization)];
    const target = isFiniteNumber(targetClip) ? Math.max(-targetClip, Math.min(targetClip, row.label)) : row.label;
    for (let i = 0; i < dimension; i += 1) {
      xty[i] += x[i] * target;
      for (let j = 0; j < dimension; j += 1) xtx[i][j] += x[i] * x[j];
    }
  }

  for (let i = 1; i < dimension; i += 1) xtx[i][i] += lambda;
  const coefficients = solveLinearSystem(xtx, xty);
  return {
    modelType: isFiniteNumber(targetClip) ? "robust_clipped_target_ridge_regression_v1" : "ridge_linear_regression_v1",
    featureKeys,
    normalization,
    intercept: coefficients[0],
    weights: Object.fromEntries(featureKeys.map((featureKey, index) => [featureKey, coefficients[index + 1]])),
    lambda,
    targetClip: targetClip ?? null
  };
}

function trainAnalogKnnMedian(rows, featureKeys, k) {
  const normalization = buildNormalizer(rows, featureKeys);
  const trainingVectors = rows.map((row) => ({
    sampleId: row.sampleId,
    vector: normalizeRow(row, featureKeys, normalization),
    label: row.label
  }));

  return {
    modelType: "analog_knn_median_regression_v1",
    featureKeys,
    normalization,
    k,
    neighborMode: "median",
    trainingVectors
  };
}

function trainRidgeKnnMedianBlend(rows, featureKeys, ridgeLambda, targetClip, k, ridgeBlendWeight) {
  return {
    modelType: "ridge_knn_median_blend_regression_v1",
    featureKeys,
    ridgeModel: trainRidge(rows, featureKeys, ridgeLambda, targetClip),
    analogModel: trainAnalogKnnMedian(rows, featureKeys, k),
    ridgeBlendWeight,
    analogBlendWeight: 1 - ridgeBlendWeight
  };
}

function trainCalibratedRidgeKnnMedianBlend(rows, featureKeys, ridgeLambda, targetClip, k, ridgeBlendWeight, calibration) {
  return {
    modelType: "calibrated_ridge_knn_median_blend_regression_v1",
    featureKeys,
    baseModel: trainRidgeKnnMedianBlend(rows, featureKeys, ridgeLambda, targetClip, k, ridgeBlendWeight),
    calibration
  };
}

function trainCalibratedPredictionRegression(baseModel, calibration) {
  return {
    modelType: "calibrated_prediction_regression_v1",
    featureKeys: baseModel.featureKeys,
    baseModel,
    calibration
  };
}

function monthFromRow(row) {
  const month = new Date(row.eventTs).getUTCMonth() + 1;
  return Number.isFinite(month) && month >= 1 && month <= 12 ? String(month).padStart(2, "0") : "unknown";
}

function seasonFromMonth(month) {
  if (["03", "04", "05"].includes(month)) return "spring";
  if (["06", "07", "08"].includes(month)) return "summer";
  if (["09", "10", "11"].includes(month)) return "autumn";
  if (["12", "01", "02"].includes(month)) return "winter";
  return "unknown";
}

function trendBucket(value, epsilon = 0.05) {
  if (!isFiniteNumber(value)) return "unknown";
  if (value > epsilon) return "rising";
  if (value < -epsilon) return "falling";
  return "stable";
}

function regimeValue(row, dimension) {
  const month = monthFromRow(row);
  if (dimension === "point") return String(row.pointId ?? "unknown");
  if (dimension === "month") return month;
  if (dimension === "season") return seasonFromMonth(month);
  if (dimension === "reservoirTrend") return trendBucket(row.values.reservoirLevelM_delta_72h, 0.05);
  if (dimension === "displacementTrend") return trendBucket(row.values.displacementSurfaceMm_delta_72h, 0.05);
  return "unknown";
}

function regimeKey(row, dimensions) {
  return dimensions.map((dimension) => `${dimension}:${regimeValue(row, dimension)}`).join("|");
}

function clamp(value, maxAbs) {
  return Math.max(-maxAbs, Math.min(maxAbs, value));
}

function trainPointwiseRidgeKnnMedianBlend(rows, featureKeys, ridgeLambda, targetClip, k, ridgeBlendWeight, minTrainRows) {
  const pointIds = Array.from(new Set(rows.map((row) => String(row.pointId ?? "unknown")))).sort();
  const pointModels = {};
  const pointSummaries = {};

  for (const pointId of pointIds) {
    const pointRows = rows.filter((row) => String(row.pointId ?? "unknown") === pointId);
    pointSummaries[pointId] = { trainRows: pointRows.length, enabled: pointRows.length >= minTrainRows };
    if (pointRows.length >= minTrainRows) {
      pointModels[pointId] = trainRidgeKnnMedianBlend(pointRows, featureKeys, ridgeLambda, targetClip, k, ridgeBlendWeight);
    }
  }

  return {
    modelType: "pointwise_ridge_knn_median_blend_regression_v1",
    featureKeys,
    fallbackModel: trainRidgeKnnMedianBlend(rows, featureKeys, ridgeLambda, targetClip, k, ridgeBlendWeight),
    pointModels,
    pointSummaries,
    minTrainRows,
    ridgeLambda,
    targetClip,
    k,
    ridgeBlendWeight
  };
}

function trainPredictionEnsemble(members, aggregation) {
  const featureKeys = Array.from(new Set(members.flatMap((member) => member.model.featureKeys))).sort();
  return {
    modelType: "prediction_ensemble_regression_v1",
    featureKeys,
    aggregation,
    members
  };
}

function trainPredictionEnsembleFromSpecs(rows, memberSpecs, aggregation) {
  const members = [];
  for (const spec of memberSpecs) {
    const trainRows = rowsWithFeatures(rows, spec.featureKeys);
    if (trainRows.length < 100) continue;
    members.push({
      ...spec,
      model: trainPointwiseRidgeKnnMedianBlend(
        trainRows,
        spec.featureKeys,
        0.1,
        3,
        spec.k,
        spec.ridgeBlendWeight,
        POINTWISE_MIN_TRAIN_ROWS
      )
    });
  }
  return members.length > 0 ? trainPredictionEnsemble(members, aggregation) : null;
}

function predictRidge(model, row) {
  let prediction = model.intercept;
  for (const featureKey of model.featureKeys) {
    const rule = model.normalization[featureKey];
    const normalized = (row.values[featureKey] - rule.min) / rule.span;
    prediction += (model.weights[featureKey] ?? 0) * normalized;
  }
  return prediction;
}

function squaredDistance(left, right) {
  let sum = 0;
  for (let index = 0; index < left.length; index += 1) {
    const delta = left[index] - right[index];
    sum += delta * delta;
  }
  return sum;
}

function predictAnalogKnnMedian(model, row) {
  const vector = normalizeRow(row, model.featureKeys, model.normalization);
  const topNeighbors = [];
  let worstIndex = -1;
  let worstDistance = Number.POSITIVE_INFINITY;

  function refreshWorstNeighbor() {
    worstIndex = 0;
    worstDistance = topNeighbors[0]?.distance ?? Number.POSITIVE_INFINITY;
    for (let index = 1; index < topNeighbors.length; index += 1) {
      if (topNeighbors[index].distance > worstDistance) {
        worstIndex = index;
        worstDistance = topNeighbors[index].distance;
      }
    }
  }

  for (const trainingVector of model.trainingVectors) {
    const candidate = {
      distance: squaredDistance(vector, trainingVector.vector),
      label: trainingVector.label
    };
    if (topNeighbors.length < model.k) {
      topNeighbors.push(candidate);
      if (topNeighbors.length === model.k) refreshWorstNeighbor();
      continue;
    }
    if (candidate.distance >= worstDistance) continue;
    topNeighbors[worstIndex] = candidate;
    refreshWorstNeighbor();
  }
  return median(topNeighbors.map((neighbor) => neighbor.label));
}

function predictModel(model, row) {
  if (model.modelType === "analog_knn_median_regression_v1") return predictAnalogKnnMedian(model, row);
  if (model.modelType === "ridge_knn_median_blend_regression_v1") {
    return (
      model.ridgeBlendWeight * predictRidge(model.ridgeModel, row) +
      model.analogBlendWeight * predictAnalogKnnMedian(model.analogModel, row)
    );
  }
  if (model.modelType === "calibrated_ridge_knn_median_blend_regression_v1") {
    const rawPrediction = predictModel(model.baseModel, row);
    return applyOutputCalibration(model.calibration, rawPrediction, row);
  }
  if (model.modelType === "calibrated_prediction_regression_v1") {
    const rawPrediction = predictModel(model.baseModel, row);
    return applyOutputCalibration(model.calibration, rawPrediction, row);
  }
  if (model.modelType === "pointwise_ridge_knn_median_blend_regression_v1") {
    const pointId = String(row.pointId ?? "unknown");
    return predictModel(model.pointModels[pointId] ?? model.fallbackModel, row);
  }
  if (model.modelType === "prediction_ensemble_regression_v1") {
    const predictions = model.members.map((member) => ({
      value: predictModel(member.model, row),
      weight: member.weight ?? 1
    }));
    if (model.aggregation === "weighted-mean") {
      const weightSum = predictions.reduce((sum, prediction) => sum + prediction.weight, 0);
      return weightSum > 0
        ? predictions.reduce((sum, prediction) => sum + prediction.value * prediction.weight, 0) / weightSum
        : mean(predictions.map((prediction) => prediction.value));
    }
    const values = predictions.map((prediction) => prediction.value);
    return model.aggregation === "median" ? median(values) : mean(values);
  }
  return predictRidge(model, row);
}

function mean(values) {
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function median(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function quantile(values, q) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1))));
  return sorted[index];
}

function regressionMetrics(rows, predictions, thresholdMmPerDay, toleranceMm) {
  const labels = rows.map((row) => row.label);
  const labelMean = mean(labels);
  const residuals = rows.map((row, index) => row.label - predictions[index]);
  const absErrors = residuals.map((value) => Math.abs(value));
  const squaredErrors = residuals.map((value) => value * value);
  const totalSumSquares = labels.reduce((sum, value) => sum + (value - labelMean) ** 2, 0);
  const residualSumSquares = squaredErrors.reduce((sum, value) => sum + value, 0);
  const thresholdHits = rows.filter((row) => Math.abs(row.label) >= thresholdMmPerDay).length;
  const predictedThresholdHits = predictions.filter((value) => Math.abs(value) >= thresholdMmPerDay).length;
  const trueThresholdAgreement = rows.filter(
    (row, index) => Math.abs(row.label) >= thresholdMmPerDay && Math.abs(predictions[index]) >= thresholdMmPerDay
  ).length;

  return {
    count: rows.length,
    labelMean,
    predictionMean: mean(predictions),
    mae: mean(absErrors),
    rmse: Math.sqrt(mean(squaredErrors)),
    r2: totalSumSquares > 0 ? 1 - residualSumSquares / totalSumSquares : 0,
    directionAccuracy: rows.filter((row, index) => (row.label >= 0) === (predictions[index] >= 0)).length / rows.length,
    withinToleranceAccuracy: absErrors.filter((value) => value <= toleranceMm).length / rows.length,
    thresholdAgreementAccuracy:
      rows.filter((row, index) => (Math.abs(row.label) >= thresholdMmPerDay) === (Math.abs(predictions[index]) >= thresholdMmPerDay))
        .length / rows.length,
    thresholdRecall: thresholdHits > 0 ? trueThresholdAgreement / thresholdHits : 0,
    thresholdPrecision: predictedThresholdHits > 0 ? trueThresholdAgreement / predictedThresholdHits : 0,
    p50AbsError: quantile(absErrors, 0.5),
    p90AbsError: quantile(absErrors, 0.9),
    maxAbsError: Math.max(...absErrors)
  };
}

function fitLinearCalibration(rows, predictions) {
  const labels = rows.map((row) => row.label);
  const predictionMean = mean(predictions);
  const labelMean = mean(labels);
  let covariance = 0;
  let predictionVariance = 0;
  for (let index = 0; index < predictions.length; index += 1) {
    covariance += (predictions[index] - predictionMean) * (labels[index] - labelMean);
    predictionVariance += (predictions[index] - predictionMean) ** 2;
  }
  const slope = predictionVariance > 0 ? covariance / predictionVariance : 1;
  return {
    method: "linear-oof",
    intercept: labelMean - slope * predictionMean,
    slope
  };
}

function fitWeightedLinearCalibration(rows, predictions, weights) {
  const labels = rows.map((row) => row.label);
  const weightSum = weights.reduce((sum, value) => sum + value, 0);
  if (weightSum <= 0) return fitLinearCalibration(rows, predictions);

  const predictionMean = predictions.reduce((sum, value, index) => sum + value * weights[index], 0) / weightSum;
  const labelMean = labels.reduce((sum, value, index) => sum + value * weights[index], 0) / weightSum;
  let covariance = 0;
  let predictionVariance = 0;
  for (let index = 0; index < predictions.length; index += 1) {
    covariance += weights[index] * (predictions[index] - predictionMean) * (labels[index] - labelMean);
    predictionVariance += weights[index] * (predictions[index] - predictionMean) ** 2;
  }
  const slope = predictionVariance > 0 ? covariance / predictionVariance : 1;
  return {
    intercept: labelMean - slope * predictionMean,
    slope
  };
}

function formatProfileNumber(value) {
  return String(value).replace(/\./gu, "p");
}

function fitHuberLinearCalibration(rows, predictions, tuningConstant = 1.35) {
  let calibration = fitLinearCalibration(rows, predictions);

  for (let iteration = 0; iteration < 25; iteration += 1) {
    const residuals = rows.map((row, index) => row.label - (calibration.intercept + calibration.slope * predictions[index]));
    const absResiduals = residuals.map((value) => Math.abs(value));
    const scale = Math.max(1e-6, 1.4826 * (median(absResiduals) || mean(absResiduals) || 1e-6));
    const cutoff = tuningConstant * scale;
    const weights = absResiduals.map((value) => (value <= cutoff ? 1 : cutoff / value));
    const next = fitWeightedLinearCalibration(rows, predictions, weights);
    const delta = Math.abs(next.intercept - calibration.intercept) + Math.abs(next.slope - calibration.slope);
    calibration = { ...next, scale, cutoff };
    if (delta < 1e-8) break;
  }

  return {
    method: tuningConstant === 1.35 ? "huber-linear-oof" : `huber-linear-oof-c${formatProfileNumber(tuningConstant)}`,
    intercept: calibration.intercept,
    slope: calibration.slope,
    scale: calibration.scale,
    cutoff: calibration.cutoff,
    tuningConstant
  };
}

function fitBiasOnlyCalibration(rows, predictions) {
  const residualMean = mean(rows.map((row, index) => row.label - predictions[index]));
  return {
    method: "bias-only-oof",
    intercept: residualMean,
    slope: 1
  };
}

function applyOutputCalibration(calibration, rawPrediction, row) {
  const linearPrediction = calibration.intercept + calibration.slope * rawPrediction;
  const correction = calibration.residualCorrection;
  if (!correction) return linearPrediction;
  const key = regimeKey(row, correction.dimensions);
  return linearPrediction + (correction.biases[key] ?? correction.fallbackBias ?? 0);
}

function fitRegimeResidualCorrectedCalibration(rows, predictions, baseCalibration, config) {
  const groups = new Map();
  const residuals = rows.map((row, index) => row.label - applyOutputCalibration(baseCalibration, predictions[index], row));
  const correctionScale = config.correctionScale ?? 1;
  const fallbackBias = clamp(mean(residuals), config.maxAbsBias) * correctionScale;

  for (let index = 0; index < rows.length; index += 1) {
    const key = regimeKey(rows[index], config.dimensions);
    const group = groups.get(key) ?? { count: 0, residualSum: 0 };
    group.count += 1;
    group.residualSum += residuals[index];
    groups.set(key, group);
  }

  const biases = {};
  const summaries = {};
  for (const [key, group] of groups.entries()) {
    if (group.count < config.minCount) continue;
    const rawBias = group.residualSum / group.count;
    const shrinkWeight = group.count / (group.count + config.shrinkage);
    const bias = clamp(rawBias * shrinkWeight, config.maxAbsBias) * correctionScale;
    biases[key] = bias;
    summaries[key] = {
      count: group.count,
      rawBias,
      correctionScale,
      bias
    };
  }

  return {
    ...baseCalibration,
    method: `${baseCalibration.method}+regime-residual-${config.key}`,
    residualCorrection: {
      method: "regime-residual-oof",
      key: config.key,
      dimensions: config.dimensions,
      minCount: config.minCount,
      shrinkage: config.shrinkage,
      maxAbsBias: config.maxAbsBias,
      correctionScale,
      fallbackBias,
      biases,
      summaries
    }
  };
}

function sortRowsChronologically(rows) {
  return [...rows].sort((left, right) => {
    const tsComparison = String(left.eventTs ?? "").localeCompare(String(right.eventTs ?? ""));
    if (tsComparison !== 0) return tsComparison;
    return String(left.sampleId ?? "").localeCompare(String(right.sampleId ?? ""));
  });
}

function makeBlockedFolds(rows, foldCount) {
  const sortedRows = sortRowsChronologically(rows);
  const folds = [];
  const foldSize = Math.ceil(sortedRows.length / foldCount);
  for (let index = 0; index < foldCount; index += 1) {
    const start = index * foldSize;
    const end = Math.min(sortedRows.length, start + foldSize);
    const foldRows = sortedRows.slice(start, end);
    if (foldRows.length > 0) folds.push(foldRows);
  }
  return folds;
}

function estimateOofCalibration(rows, featureKeys, config, thresholdMmPerDay, toleranceMm) {
  const folds = makeBlockedFolds(rows, OOF_CALIBRATION_FOLDS);
  const foldPredictions = [];
  const foldRows = [];

  for (const validationFold of folds) {
    const validationIds = new Set(validationFold.map((row) => row.sampleId));
    const fitRows = rows.filter((row) => !validationIds.has(row.sampleId));
    const foldModel = trainRidgeKnnMedianBlend(fitRows, featureKeys, config.lambda, config.targetClip, config.k, config.ridgeBlendWeight);
    for (const row of validationFold) {
      foldRows.push(row);
      foldPredictions.push(predictModel(foldModel, row));
    }
  }

  const biasOnly = fitBiasOnlyCalibration(foldRows, foldPredictions);
  const linear = fitLinearCalibration(foldRows, foldPredictions);
  const huberLinearCandidates = HUBER_OOF_TUNING_CONSTANTS.map((tuningConstant) =>
    fitHuberLinearCalibration(foldRows, foldPredictions, tuningConstant)
  );
  const identityMetrics = regressionMetrics(foldRows, foldPredictions, thresholdMmPerDay, toleranceMm);
  const biasOnlyPredictions = foldPredictions.map((prediction) => biasOnly.intercept + biasOnly.slope * prediction);
  const linearPredictions = foldPredictions.map((prediction) => linear.intercept + linear.slope * prediction);
  const biasOnlyMetrics = regressionMetrics(foldRows, biasOnlyPredictions, thresholdMmPerDay, toleranceMm);
  const linearMetrics = regressionMetrics(foldRows, linearPredictions, thresholdMmPerDay, toleranceMm);
  const huberLinearCandidatesWithMetrics = huberLinearCandidates.map((calibration) => ({
    calibration,
    metrics: regressionMetrics(
      foldRows,
      foldPredictions.map((prediction, index) => applyOutputCalibration(calibration, prediction, foldRows[index])),
      thresholdMmPerDay,
      toleranceMm
    )
  }));
  const regimeBaseCalibrations = [
    linear,
    ...[...huberLinearCandidatesWithMetrics]
      .sort((left, right) => {
        if (left.metrics.rmse !== right.metrics.rmse) return left.metrics.rmse - right.metrics.rmse;
        return left.metrics.mae - right.metrics.mae;
      })
      .slice(0, 3)
      .map((candidate) => candidate.calibration)
  ];
  const regimeResidualCandidatesWithMetrics = regimeBaseCalibrations.flatMap((baseCalibration) =>
    REGIME_RESIDUAL_CORRECTION_CONFIGS.map((config) => {
      const calibration = fitRegimeResidualCorrectedCalibration(foldRows, foldPredictions, baseCalibration, config);
      return {
        calibration,
        metrics: regressionMetrics(
          foldRows,
          foldPredictions.map((prediction, index) => applyOutputCalibration(calibration, prediction, foldRows[index])),
          thresholdMmPerDay,
          toleranceMm
        )
      };
    })
  );

  const selected = [
    { calibration: biasOnly, metrics: biasOnlyMetrics },
    { calibration: linear, metrics: linearMetrics },
    ...huberLinearCandidatesWithMetrics,
    ...regimeResidualCandidatesWithMetrics
  ].sort((left, right) => {
    if (left.metrics.rmse !== right.metrics.rmse) return left.metrics.rmse - right.metrics.rmse;
    return left.metrics.mae - right.metrics.mae;
  })[0];

  return {
    folds: folds.length,
    foldMode: "chronological-blocked",
    rowCount: foldRows.length,
    identityMetrics,
    biasOnly: {
      calibration: biasOnly,
      metrics: biasOnlyMetrics
    },
    linear: {
      calibration: linear,
      metrics: linearMetrics
    },
    huberLinear: huberLinearCandidatesWithMetrics.find((candidate) => candidate.calibration.method === "huber-linear-oof"),
    huberLinearCandidates: huberLinearCandidatesWithMetrics,
    regimeResidualCandidates: regimeResidualCandidatesWithMetrics,
    selectedCalibration: {
      ...selected.calibration,
      source: "training-oof-chronological-blocked",
      folds: folds.length
    },
    selectedMetrics: selected.metrics
  };
}

function estimateOofModelCalibration(rows, trainModelForRows, thresholdMmPerDay, toleranceMm) {
  const folds = makeBlockedFolds(rows, OOF_CALIBRATION_FOLDS);
  const foldPredictions = [];
  const foldRows = [];

  for (const validationFold of folds) {
    const validationIds = new Set(validationFold.map((row) => row.sampleId));
    const fitRows = rows.filter((row) => !validationIds.has(row.sampleId));
    const foldModel = trainModelForRows(fitRows);
    if (!foldModel) continue;
    const usableFoldRows = rowsWithFeatures(validationFold, foldModel.featureKeys);
    for (const row of usableFoldRows) {
      foldRows.push(row);
      foldPredictions.push(predictModel(foldModel, row));
    }
  }

  const biasOnly = fitBiasOnlyCalibration(foldRows, foldPredictions);
  const linear = fitLinearCalibration(foldRows, foldPredictions);
  const huberLinearCandidates = HUBER_OOF_TUNING_CONSTANTS.map((tuningConstant) =>
    fitHuberLinearCalibration(foldRows, foldPredictions, tuningConstant)
  );
  const identityMetrics = regressionMetrics(foldRows, foldPredictions, thresholdMmPerDay, toleranceMm);
  const biasOnlyPredictions = foldPredictions.map((prediction) => biasOnly.intercept + biasOnly.slope * prediction);
  const linearPredictions = foldPredictions.map((prediction) => linear.intercept + linear.slope * prediction);
  const biasOnlyMetrics = regressionMetrics(foldRows, biasOnlyPredictions, thresholdMmPerDay, toleranceMm);
  const linearMetrics = regressionMetrics(foldRows, linearPredictions, thresholdMmPerDay, toleranceMm);
  const huberLinearCandidatesWithMetrics = huberLinearCandidates.map((calibration) => ({
    calibration,
    metrics: regressionMetrics(
      foldRows,
      foldPredictions.map((prediction, index) => applyOutputCalibration(calibration, prediction, foldRows[index])),
      thresholdMmPerDay,
      toleranceMm
    )
  }));
  const regimeBaseCalibrations = [
    linear,
    ...[...huberLinearCandidatesWithMetrics]
      .sort((left, right) => {
        if (left.metrics.rmse !== right.metrics.rmse) return left.metrics.rmse - right.metrics.rmse;
        return left.metrics.mae - right.metrics.mae;
      })
      .slice(0, 3)
      .map((candidate) => candidate.calibration)
  ];
  const regimeResidualCandidatesWithMetrics = regimeBaseCalibrations.flatMap((baseCalibration) =>
    REGIME_RESIDUAL_CORRECTION_CONFIGS.map((config) => {
      const calibration = fitRegimeResidualCorrectedCalibration(foldRows, foldPredictions, baseCalibration, config);
      return {
        calibration,
        metrics: regressionMetrics(
          foldRows,
          foldPredictions.map((prediction, index) => applyOutputCalibration(calibration, prediction, foldRows[index])),
          thresholdMmPerDay,
          toleranceMm
        )
      };
    })
  );

  const selected = [
    { calibration: biasOnly, metrics: biasOnlyMetrics },
    { calibration: linear, metrics: linearMetrics },
    ...huberLinearCandidatesWithMetrics,
    ...regimeResidualCandidatesWithMetrics
  ].sort((left, right) => {
    if (left.metrics.rmse !== right.metrics.rmse) return left.metrics.rmse - right.metrics.rmse;
    return left.metrics.mae - right.metrics.mae;
  })[0];

  return {
    folds: folds.length,
    foldMode: "chronological-blocked",
    rowCount: foldRows.length,
    identityMetrics,
    biasOnly: {
      calibration: biasOnly,
      metrics: biasOnlyMetrics
    },
    linear: {
      calibration: linear,
      metrics: linearMetrics
    },
    huberLinear: huberLinearCandidatesWithMetrics.find((candidate) => candidate.calibration.method === "huber-linear-oof"),
    huberLinearCandidates: huberLinearCandidatesWithMetrics,
    regimeResidualCandidates: regimeResidualCandidatesWithMetrics,
    selectedCalibration: {
      ...selected.calibration,
      source: "training-oof-chronological-blocked",
      folds: folds.length
    },
    selectedMetrics: selected.metrics
  };
}

function oofCalibrationCandidates(oof) {
  return [
    { calibration: oof.biasOnly.calibration, oofSelectedMetrics: oof.biasOnly.metrics },
    { calibration: oof.linear.calibration, oofSelectedMetrics: oof.linear.metrics },
    ...(oof.huberLinearCandidates ?? [oof.huberLinear]).filter(Boolean).map((candidate) => ({
      calibration: candidate.calibration,
      oofSelectedMetrics: candidate.metrics
    })),
    ...(oof.regimeResidualCandidates ?? []).filter(Boolean).map((candidate) => ({
      calibration: candidate.calibration,
      oofSelectedMetrics: candidate.metrics
    }))
  ].map((candidate) => ({
    calibration: {
      ...candidate.calibration,
      source: "training-oof-chronological-blocked",
      folds: oof.folds
    },
    oofSelectedMetrics: candidate.oofSelectedMetrics
  }));
}

function evaluateModel(model, rows, thresholdMmPerDay, toleranceMm) {
  const usableRows = rowsWithFeatures(rows, model.featureKeys);
  const predictions = usableRows.map((row) => predictModel(model, row));
  return {
    evaluatedCount: usableRows.length,
    fallbackCount: rows.length - usableRows.length,
    metrics: regressionMetrics(usableRows, predictions, thresholdMmPerDay, toleranceMm)
  };
}

function summarizeEvaluationRows(model, rows, reason) {
  const usableRows = rowsWithFeatures(rows, model.featureKeys);
  return {
    evaluatedCount: usableRows.length,
    fallbackCount: rows.length - usableRows.length,
    metrics: null,
    evaluationSkipped: reason
  };
}

function compareCandidateMetrics(left, right) {
  const leftMetrics = left.validation.metrics;
  const rightMetrics = right.validation.metrics;
  if (leftMetrics.mae !== rightMetrics.mae) return leftMetrics.mae - rightMetrics.mae;
  if (leftMetrics.withinToleranceAccuracy !== rightMetrics.withinToleranceAccuracy) {
    return rightMetrics.withinToleranceAccuracy - leftMetrics.withinToleranceAccuracy;
  }
  if (leftMetrics.p90AbsError !== rightMetrics.p90AbsError) return leftMetrics.p90AbsError - rightMetrics.p90AbsError;
  if (leftMetrics.rmse !== rightMetrics.rmse) return leftMetrics.rmse - rightMetrics.rmse;
  return rightMetrics.r2 - leftMetrics.r2;
}

function sortCandidates(candidates) {
  const minRmse = Math.min(...candidates.map((candidate) => candidate.validation.metrics.rmse));
  return [...candidates].sort((left, right) => {
    const leftInPracticalBand = left.validation.metrics.rmse <= minRmse + PRACTICAL_RMSE_TIE_EPSILON;
    const rightInPracticalBand = right.validation.metrics.rmse <= minRmse + PRACTICAL_RMSE_TIE_EPSILON;
    if (leftInPracticalBand !== rightInPracticalBand) return leftInPracticalBand ? -1 : 1;
    if (leftInPracticalBand && rightInPracticalBand) return compareCandidateMetrics(left, right);
    if (left.validation.metrics.rmse !== right.validation.metrics.rmse) {
      return left.validation.metrics.rmse - right.validation.metrics.rmse;
    }
    return compareCandidateMetrics(left, right);
  });
}

function summarizeCalibrationForReport(calibration) {
  if (!calibration) return null;
  const { residualCorrection, ...baseCalibration } = calibration;
  if (!residualCorrection) return baseCalibration;
  const biases = Object.values(residualCorrection.biases ?? {});
  return {
    ...baseCalibration,
    residualCorrection: {
      method: residualCorrection.method,
      key: residualCorrection.key,
      dimensions: residualCorrection.dimensions,
      minCount: residualCorrection.minCount,
      shrinkage: residualCorrection.shrinkage,
      maxAbsBias: residualCorrection.maxAbsBias,
      correctionScale: residualCorrection.correctionScale ?? 1,
      fallbackBias: residualCorrection.fallbackBias,
      biasCount: biases.length,
      maxAbsBiasObserved: biases.length > 0 ? Math.max(...biases.map((value) => Math.abs(value))) : 0,
      meanAbsBiasObserved: biases.length > 0 ? mean(biases.map((value) => Math.abs(value))) : 0
    }
  };
}

function summarizeOofForReport(oof) {
  if (!oof) return null;
  return {
    folds: oof.folds,
    foldMode: oof.foldMode,
    rowCount: oof.rowCount,
    identityMetrics: oof.identityMetrics,
    biasOnly: {
      calibration: summarizeCalibrationForReport(oof.biasOnly.calibration),
      metrics: oof.biasOnly.metrics
    },
    linear: {
      calibration: summarizeCalibrationForReport(oof.linear.calibration),
      metrics: oof.linear.metrics
    },
    huberLinear: oof.huberLinear
      ? {
          calibration: summarizeCalibrationForReport(oof.huberLinear.calibration),
          metrics: oof.huberLinear.metrics
        }
      : null,
    huberLinearCandidates: (oof.huberLinearCandidates ?? []).map((candidate) => ({
      calibration: summarizeCalibrationForReport(candidate.calibration),
      metrics: candidate.metrics
    })),
    regimeResidualCandidates: (oof.regimeResidualCandidates ?? []).map((candidate) => ({
      calibration: summarizeCalibrationForReport(candidate.calibration),
      metrics: candidate.metrics
    })),
    selectedCalibration: summarizeCalibrationForReport(oof.selectedCalibration),
    selectedMetrics: oof.selectedMetrics
  };
}

function fmt(value, digits = 4) {
  return Number.isFinite(value) ? value.toFixed(digits) : "n/a";
}

function pct(value) {
  return Number.isFinite(value) ? `${(value * 100).toFixed(2)}%` : "n/a";
}

function renderReport(report) {
  const best = report.best;
  const lines = [
    "# Baijiabao Displacement Prediction Model Card",
    "",
    `- modelKey: \`${best.modelKey}\``,
    `- displayName: \`${best.displayName}\``,
    `- labelKey: \`${report.labelKey}\``,
    `- target: future displacement delta, mm / ${report.horizonSpec}`,
    `- modelFamily: \`${best.modelFamily}\``,
    `- featureFamily: \`${best.featureFamily}\``,
    `- ridgeLambda: \`${best.lambda ?? "n/a"}\``,
    `- targetClip: \`${best.targetClip ?? "none"}\``,
    `- kNearestNeighbors: \`${best.k ?? "n/a"}\``,
    `- ridgeBlendWeight: \`${best.ridgeBlendWeight ?? "n/a"}\``,
    `- pointwiseMinTrainRows: \`${best.pointwiseMinTrainRows ?? "n/a"}\``,
    `- ensembleAggregation: \`${best.ensembleAggregation ?? "n/a"}\``,
    `- ensembleWeightProfile: \`${best.ensembleWeightProfile ?? "n/a"}\``,
    `- ensembleMembers: \`${best.ensembleMembers?.length ?? "n/a"}\``,
    `- calibration: \`${best.calibration?.method ?? "none"}\``,
    `- trainCount: \`${best.train.evaluatedCount}\``,
    `- validationCount: \`${best.validation.evaluatedCount}\``,
    "",
    "## Validation Metrics",
    "",
    "| Metric | Value |",
    "| --- | ---: |",
    `| MAE | \`${fmt(best.validation.metrics.mae, 3)} mm\` |`,
    `| RMSE | \`${fmt(best.validation.metrics.rmse, 3)} mm\` |`,
    `| R2 | \`${fmt(best.validation.metrics.r2, 4)}\` |`,
    `| Direction accuracy | \`${pct(best.validation.metrics.directionAccuracy)}\` |`,
    `| Within ${report.toleranceMm} mm | \`${pct(best.validation.metrics.withinToleranceAccuracy)}\` |`,
    `| Threshold-state agreement | \`${pct(best.validation.metrics.thresholdAgreementAccuracy)}\` |`,
    `| P50 absolute error | \`${fmt(best.validation.metrics.p50AbsError, 3)} mm\` |`,
    `| P90 absolute error | \`${fmt(best.validation.metrics.p90AbsError, 3)} mm\` |`,
    "",
    "## Candidate Leaderboard",
    "",
    "| Rank | Model family | Feature family | Aggregation | Weight profile | Target clip | Lambda | k | Ridge blend | Calibration | Count | MAE | RMSE | R2 | Direction | Within tolerance |",
    "| ---: | --- | --- | --- | --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |"
  ];

  report.leaderboard.slice(0, 12).forEach((item, index) => {
    lines.push(
      `| ${index + 1} | \`${item.modelFamily}\` | \`${item.featureFamily}\` | \`${item.ensembleAggregation ?? "n/a"}\` | \`${
        item.ensembleWeightProfile ?? "n/a"
      }\` | \`${item.targetClip ?? "none"}\` | \`${
        item.lambda ?? "n/a"
      }\` | \`${item.k ?? "n/a"}\` | \`${item.ridgeBlendWeight ?? "n/a"}\` | \`${
        item.calibration?.method ?? "none"
      }\` | \`${item.validation.evaluatedCount}\` | \`${fmt(
        item.validation.metrics.mae,
      3
      )}\` | \`${fmt(item.validation.metrics.rmse, 3)}\` | \`${fmt(item.validation.metrics.r2, 4)}\` | \`${pct(
        item.validation.metrics.directionAccuracy
      )}\` | \`${pct(item.validation.metrics.withinToleranceAccuracy)}\` |`
    );
  });

  lines.push(
    "",
    "## Reference MAE-Optimized Candidate",
    "",
    "| Model family | Feature family | Target clip | Lambda | k | Ridge blend | Calibration | MAE | RMSE | R2 | Within tolerance |",
    "| --- | --- | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: |",
    `| \`${report.referenceBestMae.modelFamily}\` | \`${report.referenceBestMae.featureFamily}\` | \`${
      report.referenceBestMae.targetClip ?? "none"
    }\` | \`${report.referenceBestMae.lambda ?? "n/a"}\` | \`${report.referenceBestMae.k ?? "n/a"}\` | \`${
      report.referenceBestMae.ridgeBlendWeight ?? "n/a"
    }\` | \`${report.referenceBestMae.calibration?.method ?? "none"}\` | \`${fmt(report.referenceBestMae.validation.metrics.mae, 3)}\` | \`${fmt(
      report.referenceBestMae.validation.metrics.rmse,
    3
    )}\` | \`${fmt(report.referenceBestMae.validation.metrics.r2, 4)}\` | \`${pct(
      report.referenceBestMae.validation.metrics.withinToleranceAccuracy
    )}\` |`,
    "",
    "## Writing Guidance",
    "",
    "- Use this card for the displacement prediction stage only.",
    "- Do not describe the warning-model metrics `93.72% / 80.00% / 99.62%` as displacement prediction accuracy.",
    "- The current regression target is derived from future displacement delta, not an independently hand-labeled disaster event.",
    "- Position this as a site-specific short-horizon displacement trend model that feeds the downstream warning confirmation model.",
    "- The analog ensemble improves validation RMSE and R2 by retrieving similar historical displacement-change states; keep the warning model responsible for risk confirmation.",
    "- Any selected calibration must come from chronological blocked out-of-fold training predictions, not validation-set bias matching.",
    ""
  );
  return `${lines.join("\n")}\n`;
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  const trainPath = path.resolve(process.cwd(), parsed.trainSamples);
  const validationPath = path.resolve(process.cwd(), parsed.validationSamples);
  const outDir = path.resolve(process.cwd(), parsed.outDir);

  const trainSamples = await readJsonLines(trainPath);
  const validationSamples = await readJsonLines(validationPath);
  const train = collectRows(trainSamples, parsed.labelKey);
  const validation = collectRows(validationSamples, parsed.labelKey);
  const categoricalSummary = addCategoricalFeatures(train.rows, validation.rows);
  const sequenceLagSummary = addSequentialLabelLagFeatures(train.rows, validation.rows);
  const decompositionSummary = addDecompositionFeatures(train.rows, validation.rows);

  const candidates = [];
  for (const family of FEATURE_FAMILIES) {
    const featureKeys = resolveFeatureKeys(family, train.rows, validation.rows);
    if (featureKeys.length === 0) continue;
    const trainRows = rowsWithFeatures(train.rows, featureKeys);
    if (trainRows.length < 100) continue;
    for (const targetClip of TARGET_CLIPS) {
      for (const lambda of RIDGE_LAMBDAS) {
        if (targetClip === null && lambda === 1000) continue;
        const model = trainRidge(trainRows, featureKeys, lambda, targetClip);
        const trainEvaluation = evaluateModel(model, train.rows, parsed.thresholdMmPerDay, parsed.toleranceMm);
        const validationEvaluation = evaluateModel(model, validation.rows, parsed.thresholdMmPerDay, parsed.toleranceMm);
        if (validationEvaluation.evaluatedCount < 100) continue;
        candidates.push({
          modelFamily: "ridge",
          featureFamily: family.key,
          description: family.description,
          lambda,
          targetClip,
          k: null,
          ridgeBlendWeight: null,
          featureKeys,
          model,
          train: trainEvaluation,
          validation: validationEvaluation
        });
      }
    }
  }

  const analogFamilies = FEATURE_FAMILIES.filter((family) => ["analog-small", "delta-family"].includes(family.key));
  for (const family of analogFamilies) {
    const featureKeys = resolveFeatureKeys(family, train.rows, validation.rows);
    if (featureKeys.length === 0) continue;
    const trainRows = rowsWithFeatures(train.rows, featureKeys);
    if (trainRows.length < 100) continue;

    for (const k of ANALOG_K_VALUES) {
      const model = trainAnalogKnnMedian(trainRows, featureKeys, k);
      const trainEvaluation = summarizeEvaluationRows(model, train.rows, "Skipped for analog candidates to avoid optimistic self-neighbor scoring.");
      const validationEvaluation = evaluateModel(model, validation.rows, parsed.thresholdMmPerDay, parsed.toleranceMm);
      if (validationEvaluation.evaluatedCount < 100) continue;
      candidates.push({
        modelFamily: "analog-knn-median",
        featureFamily: family.key,
        description: family.description,
        lambda: null,
        targetClip: null,
        k,
        ridgeBlendWeight: null,
        featureKeys,
        model,
        train: trainEvaluation,
        validation: validationEvaluation
      });
    }

    for (const k of ANALOG_K_VALUES) {
      for (const ridgeBlendWeight of ENSEMBLE_BLEND_WEIGHTS) {
        const model = trainRidgeKnnMedianBlend(trainRows, featureKeys, 0.1, 3, k, ridgeBlendWeight);
        const trainEvaluation = summarizeEvaluationRows(model, train.rows, "Skipped for analog candidates to avoid optimistic self-neighbor scoring.");
        const validationEvaluation = evaluateModel(model, validation.rows, parsed.thresholdMmPerDay, parsed.toleranceMm);
        if (validationEvaluation.evaluatedCount < 100) continue;
        candidates.push({
          modelFamily: "ridge-knn-median-blend",
          featureFamily: family.key,
          description: `${family.description} Ridge clipped-target baseline blended with kNN median analog retrieval.`,
          lambda: 0.1,
          targetClip: 3,
          k,
          ridgeBlendWeight,
          featureKeys,
          model,
          train: trainEvaluation,
          validation: validationEvaluation
        });
      }
    }
  }

  const pointwiseFamilies = FEATURE_FAMILIES.filter((family) => ["analog-small", "delta-family", "decomp-family"].includes(family.key));
  for (const family of pointwiseFamilies) {
    const featureKeys = resolveFeatureKeys(family, train.rows, validation.rows);
    if (featureKeys.length === 0) continue;
    const trainRows = rowsWithFeatures(train.rows, featureKeys);
    if (trainRows.length < 100) continue;

    for (const k of POINTWISE_ANALOG_K_VALUES) {
      for (const ridgeBlendWeight of POINTWISE_ENSEMBLE_BLEND_WEIGHTS) {
        const model = trainPointwiseRidgeKnnMedianBlend(
          trainRows,
          featureKeys,
          0.1,
          3,
          k,
          ridgeBlendWeight,
          POINTWISE_MIN_TRAIN_ROWS
        );
        const trainEvaluation = summarizeEvaluationRows(model, train.rows, "Skipped for pointwise analog candidates to avoid optimistic self-neighbor scoring.");
        const validationEvaluation = evaluateModel(model, validation.rows, parsed.thresholdMmPerDay, parsed.toleranceMm);
        if (validationEvaluation.evaluatedCount < 100) continue;
        candidates.push({
          modelFamily: "pointwise-ridge-knn-median-blend",
          featureFamily: family.key,
          description: `${family.description} Point-specific analog ensemble with global fallback.`,
          lambda: 0.1,
          targetClip: 3,
          k,
          ridgeBlendWeight,
          pointwiseMinTrainRows: POINTWISE_MIN_TRAIN_ROWS,
          pointSummaries: model.pointSummaries,
          featureKeys,
          model,
          train: trainEvaluation,
          validation: validationEvaluation
        });
      }
    }
  }

  const sequenceLagFamily = FEATURE_FAMILIES.find((family) => family.key === "sequence-lag");
  if (sequenceLagFamily) {
    const featureKeys = resolveFeatureKeys(sequenceLagFamily, train.rows, validation.rows);
    const trainRows = rowsWithFeatures(train.rows, featureKeys);
    if (featureKeys.length > 0 && trainRows.length >= 100) {
      for (const k of SEQUENCE_LAG_K_VALUES) {
        for (const ridgeBlendWeight of SEQUENCE_LAG_BLEND_WEIGHTS) {
          const model = trainRidgeKnnMedianBlend(trainRows, featureKeys, 0.1, 3, k, ridgeBlendWeight);
          const trainEvaluation = summarizeEvaluationRows(
            model,
            train.rows,
            "Skipped for sequence-lag analog candidates to avoid optimistic self-neighbor scoring."
          );
          const validationEvaluation = evaluateModel(model, validation.rows, parsed.thresholdMmPerDay, parsed.toleranceMm);
          if (validationEvaluation.evaluatedCount < 100) continue;
          candidates.push({
            modelFamily: "sequence-lag-ridge-knn-median-blend",
            featureFamily: sequenceLagFamily.key,
            description: `${sequenceLagFamily.description} Ridge clipped-target baseline blended with sequence-state kNN median analog retrieval.`,
            lambda: 0.1,
            targetClip: 3,
            k,
            ridgeBlendWeight,
            sequenceLagSummary,
            featureKeys,
            model,
            train: trainEvaluation,
            validation: validationEvaluation
          });
        }
      }

      for (const k of SEQUENCE_LAG_K_VALUES) {
        for (const ridgeBlendWeight of SEQUENCE_LAG_BLEND_WEIGHTS) {
          const model = trainPointwiseRidgeKnnMedianBlend(
            trainRows,
            featureKeys,
            0.1,
            3,
            k,
            ridgeBlendWeight,
            POINTWISE_MIN_TRAIN_ROWS
          );
          const trainEvaluation = summarizeEvaluationRows(
            model,
            train.rows,
            "Skipped for pointwise sequence-lag candidates to avoid optimistic self-neighbor scoring."
          );
          const validationEvaluation = evaluateModel(model, validation.rows, parsed.thresholdMmPerDay, parsed.toleranceMm);
          if (validationEvaluation.evaluatedCount < 100) continue;
          candidates.push({
            modelFamily: "pointwise-sequence-lag-ridge-knn-median-blend",
            featureFamily: sequenceLagFamily.key,
            description: `${sequenceLagFamily.description} Point-specific sequence-state analog ensemble with global fallback.`,
            lambda: 0.1,
            targetClip: 3,
            k,
            ridgeBlendWeight,
            pointwiseMinTrainRows: POINTWISE_MIN_TRAIN_ROWS,
            pointSummaries: model.pointSummaries,
            sequenceLagSummary,
            featureKeys,
            model,
            train: trainEvaluation,
            validation: validationEvaluation
          });
        }
      }
    }
  }

  const fixedEnsembleMembers = [];
  for (const familyKey of POINTWISE_FIXED_ENSEMBLE_FAMILY_KEYS) {
    const family = FEATURE_FAMILIES.find((candidateFamily) => candidateFamily.key === familyKey);
    if (!family) continue;
    const featureKeys = resolveFeatureKeys(family, train.rows, validation.rows);
    if (featureKeys.length === 0) continue;
    const trainRows = rowsWithFeatures(train.rows, featureKeys);
    if (trainRows.length < 100) continue;
    for (const k of POINTWISE_FIXED_ENSEMBLE_K_VALUES) {
      for (const ridgeBlendWeight of POINTWISE_FIXED_ENSEMBLE_BLEND_WEIGHTS) {
        fixedEnsembleMembers.push({
          familyKey,
          featureKeys,
          k,
          ridgeBlendWeight,
          model: trainPointwiseRidgeKnnMedianBlend(trainRows, featureKeys, 0.1, 3, k, ridgeBlendWeight, POINTWISE_MIN_TRAIN_ROWS)
        });
      }
    }
  }

  if (fixedEnsembleMembers.length > 0) {
    const fixedEnsembleFeatureFamily = POINTWISE_FIXED_ENSEMBLE_FAMILY_KEYS.join("+");
    for (const aggregation of POINTWISE_FIXED_ENSEMBLE_AGGREGATIONS) {
      const model = trainPredictionEnsemble(fixedEnsembleMembers, aggregation);
      const trainEvaluation = summarizeEvaluationRows(model, train.rows, "Skipped for fixed pointwise ensemble to avoid optimistic self-neighbor scoring.");
      const validationEvaluation = evaluateModel(model, validation.rows, parsed.thresholdMmPerDay, parsed.toleranceMm);
      if (validationEvaluation.evaluatedCount < 100) continue;
      candidates.push({
        modelFamily: "pointwise-fixed-expert-ensemble",
        featureFamily: fixedEnsembleFeatureFamily,
        description:
          "Fixed ensemble of point-specific analog experts across displacement-only, rainfall/reservoir delta, and decomposition feature families.",
        lambda: 0.1,
        targetClip: 3,
        k: null,
        ridgeBlendWeight: null,
        pointwiseMinTrainRows: POINTWISE_MIN_TRAIN_ROWS,
        ensembleAggregation: aggregation,
        ensembleMembers: fixedEnsembleMembers.map((member) => ({
          familyKey: member.familyKey,
          k: member.k,
          ridgeBlendWeight: member.ridgeBlendWeight,
          featureKeys: member.featureKeys
        })),
        pointSummaries: fixedEnsembleMembers[0]?.model.pointSummaries ?? null,
        featureKeys: model.featureKeys,
        model,
        train: trainEvaluation,
        validation: validationEvaluation
      });
    }
    for (const weightProfile of POINTWISE_FIXED_ENSEMBLE_WEIGHT_PROFILES) {
      if (weightProfile.key === "equal") continue;
      const weightedMembers = fixedEnsembleMembers
        .map((member) => ({
          ...member,
          weight: weightProfile.weights[member.familyKey] ?? 1
        }))
        .filter((member) => member.weight > 0);
      if (weightedMembers.length === 0) continue;
      const model = trainPredictionEnsemble(weightedMembers, "weighted-mean");
      const trainEvaluation = summarizeEvaluationRows(
        model,
        train.rows,
        "Skipped for weighted fixed pointwise ensemble to avoid optimistic self-neighbor scoring."
      );
      const validationEvaluation = evaluateModel(model, validation.rows, parsed.thresholdMmPerDay, parsed.toleranceMm);
      if (validationEvaluation.evaluatedCount < 100) continue;
      candidates.push({
        modelFamily: "pointwise-weighted-fixed-expert-ensemble",
        featureFamily: fixedEnsembleFeatureFamily,
        description:
          "Weighted fixed ensemble of point-specific analog experts across displacement-only, rainfall/reservoir delta, and decomposition feature families.",
        lambda: 0.1,
        targetClip: 3,
        k: null,
        ridgeBlendWeight: null,
        pointwiseMinTrainRows: POINTWISE_MIN_TRAIN_ROWS,
        ensembleAggregation: "weighted-mean",
        ensembleWeightProfile: weightProfile.key,
        ensembleMembers: weightedMembers.map((member) => ({
          familyKey: member.familyKey,
          k: member.k,
          ridgeBlendWeight: member.ridgeBlendWeight,
          weight: member.weight,
          featureKeys: member.featureKeys
        })),
        pointSummaries: weightedMembers[0]?.model.pointSummaries ?? null,
        featureKeys: model.featureKeys,
        model,
        train: trainEvaluation,
        validation: validationEvaluation
      });
    }
  }

  const decompFixedEnsembleMembers = [];
  for (const familyKey of POINTWISE_DECOMP_FIXED_ENSEMBLE_FAMILY_KEYS) {
    const family = FEATURE_FAMILIES.find((candidateFamily) => candidateFamily.key === familyKey);
    if (!family) continue;
    const featureKeys = resolveFeatureKeys(family, train.rows, validation.rows);
    if (featureKeys.length === 0) continue;
    const trainRows = rowsWithFeatures(train.rows, featureKeys);
    if (trainRows.length < 100) continue;
    for (const k of POINTWISE_FIXED_ENSEMBLE_K_VALUES) {
      for (const ridgeBlendWeight of POINTWISE_FIXED_ENSEMBLE_BLEND_WEIGHTS) {
        decompFixedEnsembleMembers.push({
          familyKey,
          featureKeys,
          k,
          ridgeBlendWeight,
          model: trainPointwiseRidgeKnnMedianBlend(trainRows, featureKeys, 0.1, 3, k, ridgeBlendWeight, POINTWISE_MIN_TRAIN_ROWS)
        });
      }
    }
  }

  if (decompFixedEnsembleMembers.length > fixedEnsembleMembers.length) {
    const decompFixedEnsembleFeatureFamily = POINTWISE_DECOMP_FIXED_ENSEMBLE_FAMILY_KEYS.join("+");
    for (const aggregation of POINTWISE_FIXED_ENSEMBLE_AGGREGATIONS) {
      const model = trainPredictionEnsemble(decompFixedEnsembleMembers, aggregation);
      const trainEvaluation = summarizeEvaluationRows(
        model,
        train.rows,
        "Skipped for decomposition fixed pointwise ensemble to avoid optimistic self-neighbor scoring."
      );
      const validationEvaluation = evaluateModel(model, validation.rows, parsed.thresholdMmPerDay, parsed.toleranceMm);
      if (validationEvaluation.evaluatedCount < 100) continue;
      candidates.push({
        modelFamily: "pointwise-decomp-fixed-expert-ensemble",
        featureFamily: decompFixedEnsembleFeatureFamily,
        description:
          "Fixed ensemble of point-specific analog experts across displacement-only, rainfall/reservoir delta, and leakage-safe decomposition feature families.",
        lambda: 0.1,
        targetClip: 3,
        k: null,
        ridgeBlendWeight: null,
        pointwiseMinTrainRows: POINTWISE_MIN_TRAIN_ROWS,
        ensembleAggregation: aggregation,
        ensembleMembers: decompFixedEnsembleMembers.map((member) => ({
          familyKey: member.familyKey,
          k: member.k,
          ridgeBlendWeight: member.ridgeBlendWeight,
          featureKeys: member.featureKeys
        })),
        pointSummaries: decompFixedEnsembleMembers[0]?.model.pointSummaries ?? null,
        decompositionSummary,
        featureKeys: model.featureKeys,
        model,
        train: trainEvaluation,
        validation: validationEvaluation
      });
    }
    for (const weightProfile of POINTWISE_FIXED_ENSEMBLE_WEIGHT_PROFILES) {
      if (weightProfile.key === "equal") continue;
      const weightedMembers = decompFixedEnsembleMembers
        .map((member) => ({
          ...member,
          weight: weightProfile.weights[member.familyKey] ?? 1
        }))
        .filter((member) => member.weight > 0);
      if (weightedMembers.length === 0) continue;
      const model = trainPredictionEnsemble(weightedMembers, "weighted-mean");
      const trainEvaluation = summarizeEvaluationRows(
        model,
        train.rows,
        "Skipped for weighted decomposition fixed pointwise ensemble to avoid optimistic self-neighbor scoring."
      );
      const validationEvaluation = evaluateModel(model, validation.rows, parsed.thresholdMmPerDay, parsed.toleranceMm);
      if (validationEvaluation.evaluatedCount < 100) continue;
      candidates.push({
        modelFamily: "pointwise-decomp-weighted-fixed-expert-ensemble",
        featureFamily: decompFixedEnsembleFeatureFamily,
        description:
          "Weighted fixed ensemble of point-specific analog experts across displacement-only, rainfall/reservoir delta, and leakage-safe decomposition feature families.",
        lambda: 0.1,
        targetClip: 3,
        k: null,
        ridgeBlendWeight: null,
        pointwiseMinTrainRows: POINTWISE_MIN_TRAIN_ROWS,
        ensembleAggregation: "weighted-mean",
        ensembleWeightProfile: weightProfile.key,
        ensembleMembers: weightedMembers.map((member) => ({
          familyKey: member.familyKey,
          k: member.k,
          ridgeBlendWeight: member.ridgeBlendWeight,
          weight: member.weight,
          featureKeys: member.featureKeys
        })),
        pointSummaries: weightedMembers[0]?.model.pointSummaries ?? null,
        decompositionSummary,
        featureKeys: model.featureKeys,
        model,
        train: trainEvaluation,
        validation: validationEvaluation
      });
    }
  }

  const rankedPointwiseCandidates = [...candidates]
    .filter((candidate) => candidate.modelFamily === "pointwise-ridge-knn-median-blend")
    .sort((left, right) => {
      if (left.validation.metrics.rmse !== right.validation.metrics.rmse) {
        return left.validation.metrics.rmse - right.validation.metrics.rmse;
      }
      return left.validation.metrics.mae - right.validation.metrics.mae;
    });

  for (const size of VALIDATION_RANKED_POINTWISE_ENSEMBLE_SIZES) {
    const seeds = rankedPointwiseCandidates.slice(0, size);
    if (seeds.length < size) continue;
    for (const aggregation of POINTWISE_FIXED_ENSEMBLE_AGGREGATIONS) {
      const members = seeds.map((seed, index) => ({
        rank: index + 1,
        familyKey: seed.featureFamily,
        k: seed.k,
        ridgeBlendWeight: seed.ridgeBlendWeight,
        model: seed.model
      }));
      const model = trainPredictionEnsemble(members, aggregation);
      const trainEvaluation = summarizeEvaluationRows(
        model,
        train.rows,
        "Skipped for validation-ranked pointwise ensemble to avoid optimistic self-neighbor scoring."
      );
      const validationEvaluation = evaluateModel(model, validation.rows, parsed.thresholdMmPerDay, parsed.toleranceMm);
      if (validationEvaluation.evaluatedCount < 100) continue;
      candidates.push({
        modelFamily: "validation-ranked-pointwise-ensemble",
        featureFamily: "top-pointwise-validation-rank",
        description:
          "Mean/median ensemble of top validation-ranked pointwise analog experts. Keep as model-selection candidate, not independent holdout proof.",
        lambda: 0.1,
        targetClip: 3,
        k: null,
        ridgeBlendWeight: null,
        pointwiseMinTrainRows: POINTWISE_MIN_TRAIN_ROWS,
        ensembleAggregation: aggregation,
        ensembleSelection: {
          mode: "validation-ranked",
          size,
          sort: "rmse-then-mae"
        },
        ensembleMembers: members.map((member) => ({
          rank: member.rank,
          familyKey: member.familyKey,
          k: member.k,
          ridgeBlendWeight: member.ridgeBlendWeight
        })),
        pointSummaries: seeds[0]?.pointSummaries ?? null,
        featureKeys: model.featureKeys,
        model,
        train: trainEvaluation,
        validation: validationEvaluation
      });
    }
  }

  const ensembleCalibrationExperiments = [];
  const ensembleCalibrationSeedPool = [...candidates]
    .filter((candidate) =>
      [
        "pointwise-fixed-expert-ensemble",
        "pointwise-weighted-fixed-expert-ensemble",
        "pointwise-decomp-fixed-expert-ensemble",
        "pointwise-decomp-weighted-fixed-expert-ensemble"
      ].includes(candidate.modelFamily)
    )
    .sort((left, right) => {
      if (left.validation.metrics.rmse !== right.validation.metrics.rmse) {
        return left.validation.metrics.rmse - right.validation.metrics.rmse;
      }
      return left.validation.metrics.mae - right.validation.metrics.mae;
    });
  const topEnsembleCalibrationSeeds = ensembleCalibrationSeedPool.slice(0, ENSEMBLE_OOF_CALIBRATION_CANDIDATE_LIMIT);
  const topDecompEnsembleCalibrationSeeds = ensembleCalibrationSeedPool
    .filter((candidate) => candidate.featureFamily.includes("decomp") || (candidate.ensembleMembers ?? []).some((member) => member.familyKey === "decomp-family"))
    .slice(0, 6);
  const ensembleCalibrationSeeds = Array.from(
    new Map(
      [...topEnsembleCalibrationSeeds, ...topDecompEnsembleCalibrationSeeds].map((candidate) => [
        [
          candidate.modelFamily,
          candidate.featureFamily,
          candidate.ensembleAggregation ?? "",
          candidate.ensembleWeightProfile ?? "",
          candidate.validation.metrics.rmse.toFixed(9),
          candidate.validation.metrics.mae.toFixed(9)
        ].join("|"),
        candidate
      ])
    ).values()
  );

  for (const seed of ensembleCalibrationSeeds) {
    const trainModelForRows = (rows) => trainPredictionEnsembleFromSpecs(rows, seed.ensembleMembers, seed.ensembleAggregation);
    const baseModel = trainModelForRows(train.rows);
    if (!baseModel) continue;
    const oof = estimateOofModelCalibration(train.rows, trainModelForRows, parsed.thresholdMmPerDay, parsed.toleranceMm);
    const calibrationCandidates = oofCalibrationCandidates(oof);
    ensembleCalibrationExperiments.push({
      seed: {
        modelFamily: seed.modelFamily,
        featureFamily: seed.featureFamily,
        ensembleAggregation: seed.ensembleAggregation ?? null,
        ensembleWeightProfile: seed.ensembleWeightProfile ?? null,
        validation: seed.validation
      },
      calibrated: calibrationCandidates.map((candidate) => ({
        calibration: summarizeCalibrationForReport(candidate.calibration),
        oofSelectedMetrics: candidate.oofSelectedMetrics
      })),
      fullOof: summarizeOofForReport(oof)
    });
    for (const calibrationCandidate of calibrationCandidates) {
      const model = trainCalibratedPredictionRegression(baseModel, calibrationCandidate.calibration);
      const trainEvaluation = summarizeEvaluationRows(
        model,
        train.rows,
        "Skipped for OOF-calibrated pointwise ensemble to avoid optimistic self-neighbor scoring."
      );
      const validationEvaluation = evaluateModel(model, validation.rows, parsed.thresholdMmPerDay, parsed.toleranceMm);
      if (validationEvaluation.evaluatedCount < 100) continue;
      candidates.push({
        modelFamily: `oof-calibrated-${seed.modelFamily}`,
        featureFamily: seed.featureFamily,
        description: `${seed.description} Final ensemble output calibration estimated from chronological blocked out-of-fold training predictions.`,
        lambda: seed.lambda,
        targetClip: seed.targetClip,
        k: seed.k,
        ridgeBlendWeight: seed.ridgeBlendWeight,
        pointwiseMinTrainRows: seed.pointwiseMinTrainRows ?? null,
        ensembleAggregation: seed.ensembleAggregation ?? null,
        ensembleWeightProfile: seed.ensembleWeightProfile ?? null,
        ensembleSelection: seed.ensembleSelection ?? null,
        ensembleMembers: seed.ensembleMembers ?? null,
        pointSummaries: seed.pointSummaries ?? null,
        calibration: calibrationCandidate.calibration,
        oofCalibration: oof,
        featureKeys: model.featureKeys,
        model,
        train: trainEvaluation,
        validation: validationEvaluation
      });
    }
  }

  const calibrationExperiments = [];
  const calibrationSeeds = [...candidates]
    .filter((candidate) => candidate.modelFamily === "ridge-knn-median-blend")
    .sort((left, right) => {
      if (left.validation.metrics.rmse !== right.validation.metrics.rmse) {
        return left.validation.metrics.rmse - right.validation.metrics.rmse;
      }
      return left.validation.metrics.mae - right.validation.metrics.mae;
    })
    .slice(0, OOF_CALIBRATION_CANDIDATE_LIMIT);

  for (const seed of calibrationSeeds) {
    const trainRows = rowsWithFeatures(train.rows, seed.featureKeys);
    const oof = estimateOofCalibration(
      trainRows,
      seed.featureKeys,
      {
        lambda: seed.lambda,
        targetClip: seed.targetClip,
        k: seed.k,
        ridgeBlendWeight: seed.ridgeBlendWeight
      },
      parsed.thresholdMmPerDay,
      parsed.toleranceMm
    );
    const model = trainCalibratedRidgeKnnMedianBlend(
      trainRows,
      seed.featureKeys,
      seed.lambda,
      seed.targetClip,
      seed.k,
      seed.ridgeBlendWeight,
      oof.selectedCalibration
    );
    const trainEvaluation = summarizeEvaluationRows(model, train.rows, "Skipped for calibrated analog candidates to avoid optimistic self-neighbor scoring.");
    const validationEvaluation = evaluateModel(model, validation.rows, parsed.thresholdMmPerDay, parsed.toleranceMm);
    const candidate = {
      modelFamily: "oof-calibrated-ridge-knn-median-blend",
      featureFamily: seed.featureFamily,
      description: `${seed.description} Output calibration estimated from chronological blocked out-of-fold training predictions.`,
      lambda: seed.lambda,
      targetClip: seed.targetClip,
      k: seed.k,
      ridgeBlendWeight: seed.ridgeBlendWeight,
      calibration: oof.selectedCalibration,
      oofCalibration: oof,
      featureKeys: seed.featureKeys,
      model,
      train: trainEvaluation,
      validation: validationEvaluation
    };
    calibrationExperiments.push({
      seed: {
        modelFamily: seed.modelFamily,
        featureFamily: seed.featureFamily,
        lambda: seed.lambda,
        targetClip: seed.targetClip,
        k: seed.k,
        ridgeBlendWeight: seed.ridgeBlendWeight,
        validation: seed.validation
      },
      calibrated: {
        calibration: summarizeCalibrationForReport(oof.selectedCalibration),
        oofSelectedMetrics: oof.selectedMetrics,
        validation: validationEvaluation
      },
      fullOof: summarizeOofForReport(oof)
    });
    candidates.push(candidate);
  }

  const sortedCandidates = sortCandidates(candidates);
  candidates.splice(0, candidates.length, ...sortedCandidates);

  const bestCandidate = candidates[0];
  if (!bestCandidate) throw new Error("No displacement prediction candidate could be trained.");
  const bestMaeCandidate = [...candidates].sort((left, right) => {
    if (left.validation.metrics.mae !== right.validation.metrics.mae) {
      return left.validation.metrics.mae - right.validation.metrics.mae;
    }
    if (left.validation.metrics.withinToleranceAccuracy !== right.validation.metrics.withinToleranceAccuracy) {
      return right.validation.metrics.withinToleranceAccuracy - left.validation.metrics.withinToleranceAccuracy;
    }
    return left.validation.metrics.rmse - right.validation.metrics.rmse;
  })[0];
  const bestIsOofCalibrated = bestCandidate.modelFamily === "oof-calibrated-ridge-knn-median-blend";
  const bestIsOofCalibratedEnsemble = [
    "oof-calibrated-pointwise-fixed-expert-ensemble",
    "oof-calibrated-pointwise-weighted-fixed-expert-ensemble",
    "oof-calibrated-pointwise-decomp-fixed-expert-ensemble",
    "oof-calibrated-pointwise-decomp-weighted-fixed-expert-ensemble"
  ].includes(bestCandidate.modelFamily);
  const bestUsesDecomposition =
    bestCandidate.featureFamily.includes("decomp") ||
    (bestCandidate.ensembleMembers ?? []).some((member) => member.familyKey === "decomp-family");
  const bestIsHuberCalibratedEnsemble =
    bestIsOofCalibratedEnsemble && bestCandidate.calibration?.method?.startsWith("huber-linear-oof");
  const bestIsProfileTunedHuberCalibratedEnsemble =
    bestIsHuberCalibratedEnsemble && bestCandidate.calibration?.method !== "huber-linear-oof";
  const bestIsRefinedHuberProfileCalibratedEnsemble =
    bestIsProfileTunedHuberCalibratedEnsemble && bestCandidate.calibration?.tuningConstant < 0.9;
  const bestIsRegimeCorrectedCalibratedEnsemble =
    bestIsOofCalibratedEnsemble && Boolean(bestCandidate.calibration?.residualCorrection);
  const bestIsSoftRegimeCorrectedCalibratedEnsemble =
    bestIsRegimeCorrectedCalibratedEnsemble && (bestCandidate.calibration?.residualCorrection?.correctionScale ?? 1) < 1;
  const bestIsRefinedSoftRegimeCorrectedCalibratedEnsemble =
    bestIsSoftRegimeCorrectedCalibratedEnsemble &&
    (bestCandidate.calibration?.residualCorrection?.key !== "point-month-s050" ||
      !["delta-heavy-1p75x"].includes(bestCandidate.ensembleWeightProfile ?? ""));
  const bestIsValidationRankedEnsemble = bestCandidate.modelFamily === "validation-ranked-pointwise-ensemble";
  const bestIsWeightedFixedEnsemble = bestCandidate.modelFamily === "pointwise-weighted-fixed-expert-ensemble";
  const bestIsFixedEnsemble = bestCandidate.modelFamily === "pointwise-fixed-expert-ensemble";
  const bestIsDecompWeightedFixedEnsemble = bestCandidate.modelFamily === "pointwise-decomp-weighted-fixed-expert-ensemble";
  const bestIsDecompFixedEnsemble = bestCandidate.modelFamily === "pointwise-decomp-fixed-expert-ensemble";
  const bestIsSequenceLag = [
    "sequence-lag-ridge-knn-median-blend",
    "pointwise-sequence-lag-ridge-knn-median-blend"
  ].includes(bestCandidate.modelFamily);
  const bestIsPointwise = bestCandidate.modelFamily === "pointwise-ridge-knn-median-blend";

  const artifact = {
    artifactType: bestCandidate.model.modelType,
    modelKey: bestUsesDecomposition && bestIsOofCalibratedEnsemble
      ? "baijiabao.displacement.pointwise-fixed-expert-ensemble-oof-decomposition-residual-calibrated-v17"
      : bestIsSequenceLag
      ? "baijiabao.displacement.sequence-lag-ridge-knn-median-v15"
      : bestIsRefinedSoftRegimeCorrectedCalibratedEnsemble
      ? "baijiabao.displacement.pointwise-fixed-expert-ensemble-oof-refined-soft-regime-residual-calibrated-v14"
      : bestIsSoftRegimeCorrectedCalibratedEnsemble
      ? "baijiabao.displacement.pointwise-fixed-expert-ensemble-oof-soft-regime-residual-calibrated-v13"
      : bestIsRegimeCorrectedCalibratedEnsemble
      ? "baijiabao.displacement.pointwise-fixed-expert-ensemble-oof-regime-residual-calibrated-v12"
      : bestIsRefinedHuberProfileCalibratedEnsemble
      ? "baijiabao.displacement.pointwise-fixed-expert-ensemble-oof-huber-refined-profile-calibrated-v11"
      : bestIsProfileTunedHuberCalibratedEnsemble
      ? "baijiabao.displacement.pointwise-fixed-expert-ensemble-oof-huber-profile-calibrated-v10"
      : bestIsHuberCalibratedEnsemble
      ? "baijiabao.displacement.pointwise-fixed-expert-ensemble-oof-huber-calibrated-v9"
      : bestIsOofCalibratedEnsemble
      ? "baijiabao.displacement.pointwise-fixed-expert-ensemble-oof-calibrated-v8"
      : bestIsOofCalibrated
      ? "baijiabao.displacement.analog-ridge-knn-oof-calibrated-v5"
      : bestIsValidationRankedEnsemble
        ? "baijiabao.displacement.validation-ranked-pointwise-ensemble-v8"
      : bestIsDecompWeightedFixedEnsemble || bestIsDecompFixedEnsemble
        ? "baijiabao.displacement.pointwise-decomposition-fixed-expert-ensemble-v17"
      : bestIsWeightedFixedEnsemble || bestIsFixedEnsemble
        ? "baijiabao.displacement.pointwise-fixed-expert-ensemble-v7"
      : bestIsPointwise
        ? parsed.modelKey
        : "baijiabao.displacement.analog-ridge-knn-median-v4",
    modelVersion: bestUsesDecomposition && bestIsOofCalibratedEnsemble
      ? "0.17.0"
      : bestIsOofCalibrated
      ? "0.5.0"
      : bestIsSequenceLag
        ? "0.15.0"
      : bestIsRefinedSoftRegimeCorrectedCalibratedEnsemble
        ? "0.14.0"
      : bestIsSoftRegimeCorrectedCalibratedEnsemble
        ? "0.13.0"
      : bestIsRegimeCorrectedCalibratedEnsemble
        ? "0.12.0"
      : bestIsRefinedHuberProfileCalibratedEnsemble
        ? "0.11.0"
      : bestIsProfileTunedHuberCalibratedEnsemble
        ? "0.10.0"
      : bestIsHuberCalibratedEnsemble
        ? "0.9.0"
      : bestIsOofCalibratedEnsemble
        ? "0.8.0"
      : bestIsValidationRankedEnsemble
        ? "0.8.0"
      : bestIsDecompWeightedFixedEnsemble || bestIsDecompFixedEnsemble
        ? "0.17.0"
      : bestIsWeightedFixedEnsemble || bestIsFixedEnsemble
        ? "0.7.0"
      : bestIsPointwise
        ? parsed.modelVersion
        : "0.4.1",
    displayName: bestUsesDecomposition && bestIsOofCalibratedEnsemble
      ? "BJB-DP-ENS-OOF-DECOMP-v17"
      : bestIsOofCalibrated
      ? "BJB-DP-OOF-CAL-v5"
      : bestIsSequenceLag
        ? "BJB-DP-SEQUENCE-LAG-v15"
      : bestIsRefinedSoftRegimeCorrectedCalibratedEnsemble
        ? "BJB-DP-ENS-OOF-REFINED-SOFT-REGIME-v14"
      : bestIsSoftRegimeCorrectedCalibratedEnsemble
        ? "BJB-DP-ENS-OOF-SOFT-REGIME-v13"
      : bestIsRegimeCorrectedCalibratedEnsemble
        ? "BJB-DP-ENS-OOF-REGIME-v12"
      : bestIsRefinedHuberProfileCalibratedEnsemble
        ? "BJB-DP-ENS-OOF-HUBER-v11"
      : bestIsProfileTunedHuberCalibratedEnsemble
        ? "BJB-DP-ENS-OOF-HUBER-v10"
      : bestIsHuberCalibratedEnsemble
        ? "BJB-DP-ENS-OOF-HUBER-v9"
      : bestIsOofCalibratedEnsemble
        ? "BJB-DP-ENS-OOF-CAL-v8"
      : bestIsValidationRankedEnsemble
        ? "BJB-DP-RANKED-ENS-v8"
      : bestIsDecompWeightedFixedEnsemble || bestIsDecompFixedEnsemble
        ? "BJB-DP-DECOMP-ENSEMBLE-v17"
      : bestIsWeightedFixedEnsemble || bestIsFixedEnsemble
        ? "BJB-DP-ENSEMBLE-v7"
      : bestIsPointwise
        ? "BJB-DP-POINT-v6"
        : "BJB-DP-ANALOG-v4",
    targetLabelKey: parsed.labelKey,
    targetDescription: "Future surface displacement delta in millimeters.",
    horizonSpec: "24h",
    scopeType: "station",
    scopeKey: "Baijiabao",
    sourceDataset: "Baijiabao-2017-2024",
    modelFamily: bestCandidate.modelFamily,
    featureFamily: bestCandidate.featureFamily,
    ridgeLambda: bestCandidate.lambda,
    targetClip: bestCandidate.targetClip,
    kNearestNeighbors: bestCandidate.k,
    ridgeBlendWeight: bestCandidate.ridgeBlendWeight,
    pointwiseMinTrainRows: bestCandidate.pointwiseMinTrainRows ?? null,
    pointSummaries: bestCandidate.pointSummaries ?? null,
    ensembleAggregation: bestCandidate.ensembleAggregation ?? null,
    ensembleWeightProfile: bestCandidate.ensembleWeightProfile ?? null,
    ensembleSelection: bestCandidate.ensembleSelection ?? null,
    ensembleMembers: bestCandidate.ensembleMembers ?? null,
    sequenceLagSummary: bestCandidate.sequenceLagSummary ?? null,
    decompositionSummary,
    calibration: bestCandidate.calibration ?? null,
    model: bestCandidate.model,
    validationMetrics: bestCandidate.validation.metrics,
    selectionProfile: SELECTION_PROFILE,
    referenceBestMae: {
      modelFamily: bestMaeCandidate.modelFamily,
      featureFamily: bestMaeCandidate.featureFamily,
      ridgeLambda: bestMaeCandidate.lambda,
      targetClip: bestMaeCandidate.targetClip,
      kNearestNeighbors: bestMaeCandidate.k,
      ridgeBlendWeight: bestMaeCandidate.ridgeBlendWeight,
      pointwiseMinTrainRows: bestMaeCandidate.pointwiseMinTrainRows ?? null,
      pointSummaries: bestMaeCandidate.pointSummaries ?? null,
      ensembleAggregation: bestMaeCandidate.ensembleAggregation ?? null,
      ensembleWeightProfile: bestMaeCandidate.ensembleWeightProfile ?? null,
      ensembleSelection: bestMaeCandidate.ensembleSelection ?? null,
      ensembleMembers: bestMaeCandidate.ensembleMembers ?? null,
      sequenceLagSummary: bestMaeCandidate.sequenceLagSummary ?? null,
      decompositionSummary,
      calibration: bestMaeCandidate.calibration ?? null,
      validationMetrics: bestMaeCandidate.validation.metrics
    },
    trainingSummary: {
      trainSamples: train.rows.length,
      validationSamples: validation.rows.length,
      ignoredTrainSamples: train.ignoredCount,
      ignoredValidationSamples: validation.ignoredCount,
      categoricalSummary,
      decompositionSummary
    },
    caveats: [
      "The target is derived from future displacement delta.",
      "This artifact is a short-horizon displacement trend model, not the final warning classifier.",
      "The selected analog ensemble improves validation RMSE and R2, but remains a site-specific Baijiabao model.",
      "Output calibration, when selected, is estimated from chronological blocked out-of-fold training predictions rather than validation-set mean matching."
    ]
  };

  const report = {
    generatedAt: new Date().toISOString(),
    trainSamples: parsed.trainSamples,
    validationSamples: parsed.validationSamples,
    labelKey: parsed.labelKey,
    horizonSpec: "24h",
    thresholdMmPerDay: parsed.thresholdMmPerDay,
    toleranceMm: parsed.toleranceMm,
    best: {
      modelKey: artifact.modelKey,
      modelVersion: artifact.modelVersion,
      displayName: artifact.displayName,
      selectionProfile: artifact.selectionProfile,
      modelFamily: bestCandidate.modelFamily,
      featureFamily: bestCandidate.featureFamily,
      lambda: bestCandidate.lambda,
      targetClip: bestCandidate.targetClip,
      k: bestCandidate.k,
      ridgeBlendWeight: bestCandidate.ridgeBlendWeight,
      pointwiseMinTrainRows: bestCandidate.pointwiseMinTrainRows ?? null,
      pointSummaries: bestCandidate.pointSummaries ?? null,
      ensembleAggregation: bestCandidate.ensembleAggregation ?? null,
      ensembleWeightProfile: bestCandidate.ensembleWeightProfile ?? null,
      ensembleSelection: bestCandidate.ensembleSelection ?? null,
      ensembleMembers: bestCandidate.ensembleMembers ?? null,
      decompositionSummary,
      calibration: summarizeCalibrationForReport(bestCandidate.calibration ?? null),
      featureKeys: bestCandidate.featureKeys,
      train: bestCandidate.train,
      validation: bestCandidate.validation
    },
    referenceBestMae: {
      modelFamily: bestMaeCandidate.modelFamily,
      featureFamily: bestMaeCandidate.featureFamily,
      lambda: bestMaeCandidate.lambda,
      targetClip: bestMaeCandidate.targetClip,
      k: bestMaeCandidate.k,
      ridgeBlendWeight: bestMaeCandidate.ridgeBlendWeight,
      pointwiseMinTrainRows: bestMaeCandidate.pointwiseMinTrainRows ?? null,
      pointSummaries: bestMaeCandidate.pointSummaries ?? null,
      ensembleAggregation: bestMaeCandidate.ensembleAggregation ?? null,
      ensembleWeightProfile: bestMaeCandidate.ensembleWeightProfile ?? null,
      ensembleSelection: bestMaeCandidate.ensembleSelection ?? null,
      ensembleMembers: bestMaeCandidate.ensembleMembers ?? null,
      decompositionSummary,
      calibration: summarizeCalibrationForReport(bestMaeCandidate.calibration ?? null),
      featureKeys: bestMaeCandidate.featureKeys,
      train: bestMaeCandidate.train,
      validation: bestMaeCandidate.validation
    },
    leaderboard: candidates.map((candidate) => ({
      modelFamily: candidate.modelFamily,
      featureFamily: candidate.featureFamily,
      description: candidate.description,
      lambda: candidate.lambda,
      targetClip: candidate.targetClip,
      k: candidate.k,
      ridgeBlendWeight: candidate.ridgeBlendWeight,
      pointwiseMinTrainRows: candidate.pointwiseMinTrainRows ?? null,
      pointSummaries: candidate.pointSummaries ?? null,
      ensembleAggregation: candidate.ensembleAggregation ?? null,
      ensembleWeightProfile: candidate.ensembleWeightProfile ?? null,
      ensembleSelection: candidate.ensembleSelection ?? null,
      ensembleMembers: candidate.ensembleMembers ?? null,
      sequenceLagSummary: candidate.sequenceLagSummary ?? null,
      decompositionSummary,
      calibration: summarizeCalibrationForReport(candidate.calibration ?? null),
      oofCalibration: summarizeOofForReport(candidate.oofCalibration ?? null),
      featureKeys: candidate.featureKeys,
      train: candidate.train,
      validation: candidate.validation
    })),
    ensembleCalibrationExperiments,
    calibrationExperiments
  };

  await writeJson(path.join(outDir, "baijiabao-displacement-prediction-model.json"), artifact);
  await writeJson(path.join(outDir, "baijiabao-displacement-prediction-card.report.json"), report);
  await writeText(path.join(outDir, "baijiabao-displacement-prediction-card.report.md"), renderReport(report));
  const safeTimestamp = report.generatedAt.replace(/[:.]/gu, "-");
  await writeJson(path.join(outDir, "history", `baijiabao-displacement-prediction-card.${safeTimestamp}.report.json`), report);
  await writeText(path.join(outDir, "history", `baijiabao-displacement-prediction-card.${safeTimestamp}.report.md`), renderReport(report));
  console.log(`Wrote displacement prediction card to ${outDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
