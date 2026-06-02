import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const TRAIN =
  ".tmp/regional-model-library/out/threegorges-baijiabao/splits/labeled/baijiabao.train.future-labels.window-features.jsonl";
const VALIDATION =
  ".tmp/regional-model-library/out/threegorges-baijiabao/splits/labeled/baijiabao.validation.future-labels.window-features.jsonl";
const OUT_DIR = ".tmp/regional-model-library/out/artifacts/baijiabao-displacement-meta-ensemble-challengers";
const LABEL_KEY = "displacementLabel";
const THRESHOLD_MM = 1.3;
const TOLERANCE_MM = 1;
const OOF_FOLDS = 5;
const POINTWISE_MIN_TRAIN_ROWS = 100;
const K_VALUES = [15, 20];
const BLEND_WEIGHTS = [0.3, 0.35, 0.4, 0.45];
const BASELINE_TO_BEAT = {
  displayName: "BJB-DP-ENS-OOF-REFINED-SOFT-REGIME-v14",
  mae: 0.633075,
  rmse: 0.893631,
  r2: 0.123579,
  directionAccuracy: 0.5828,
  within1mm: 0.8077,
  thresholdAgreement: 0.8632,
  p90AbsError: 1.392424
};

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

const FEATURE_FAMILIES = {
  "analog-small": ["displacementSurfaceMm_delta_24h", "displacementSurfaceMm_delta_72h"],
  "delta-family": [
    "displacementSurfaceMm_delta_24h",
    "displacementSurfaceMm_delta_72h",
    "rainfallCurrentMm_sum_24h",
    "rainfallCurrentMm_sum_72h",
    "reservoirLevelM_delta_24h",
    "reservoirLevelM_delta_72h"
  ],
  "decomp-family": [
    "displacementSurfaceMm_delta_24h",
    "displacementSurfaceMm_delta_72h",
    "rainfallCurrentMm_sum_24h",
    "rainfallCurrentMm_sum_72h",
    "reservoirLevelM_delta_24h",
    "reservoirLevelM_delta_72h",
    ...DECOMPOSITION_FEATURE_KEYS
  ]
};

const SEED_SPECS = [
  {
    key: "v14-balanced-seed",
    displayName: "v14 analog+delta balanced seed",
    familyKeys: ["analog-small", "delta-family"],
    weights: { "analog-small": 1, "delta-family": 1.85 },
    calibration: {
      tuningConstant: 0.6,
      residualKey: "point-month-s055",
      dimensions: ["point", "month"],
      minCount: 35,
      shrinkage: 90,
      maxAbsBias: 0.16,
      correctionScale: 0.55
    }
  },
  {
    key: "v17-decomp-balanced-seed",
    displayName: "v17 decomp OOF balanced seed",
    familyKeys: ["analog-small", "delta-family", "decomp-family"],
    weights: { "analog-small": 1, "delta-family": 3, "decomp-family": 1 },
    calibration: {
      tuningConstant: 0.6,
      residualKey: "point-month-s045",
      dimensions: ["point", "month"],
      minCount: 35,
      shrinkage: 90,
      maxAbsBias: 0.16,
      correctionScale: 0.45
    }
  },
  {
    key: "v17-decomp-mae-seed",
    displayName: "v17 decomp MAE-min seed",
    familyKeys: ["analog-small", "delta-family", "decomp-family"],
    weights: { "analog-small": 1, "delta-family": 3, "decomp-family": 1 },
    calibration: {
      tuningConstant: 0.7,
      residualKey: "point-month-s060",
      dimensions: ["point", "month"],
      minCount: 35,
      shrinkage: 90,
      maxAbsBias: 0.16,
      correctionScale: 0.6
    }
  }
];

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

function collectRows(samples) {
  const rows = [];
  for (const sample of samples) {
    const label = sample.labels?.[LABEL_KEY];
    if (!isFiniteNumber(label)) continue;
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
  return rows;
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

function sortRowsByTime(rows) {
  return [...rows].sort((left, right) => {
    const timeComparison = String(left.eventTs ?? "").localeCompare(String(right.eventTs ?? ""));
    if (timeComparison !== 0) return timeComparison;
    return String(left.sampleId ?? "").localeCompare(String(right.sampleId ?? ""));
  });
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
    const rainfallValues = history
      .map((item) => item.rainfall)
      .filter((value) => Number.isFinite(value))
      .slice(-window);
    const reservoirValues = history
      .map((item) => item.reservoir)
      .filter((value) => Number.isFinite(value))
      .slice(-window);
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

  const validationHistoryByPoint = new Map(Array.from(trainByPoint.entries()).map(([pointId, history]) => [pointId, [...history]]));
  for (const row of sortRowsByTime(validationRows)) {
    const pointId = String(row.pointId ?? "unknown");
    const history = validationHistoryByPoint.get(pointId) ?? [];
    assignDecompositionFeatures(row, history);
    updateDecompositionHistory(history, row);
    validationHistoryByPoint.set(pointId, history);
  }
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
    if (Math.abs(augmented[pivotRow][column]) < 1e-12) augmented[pivotRow][column] = 1e-12;
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
      for (let col = column; col <= n; col += 1) augmented[row][col] -= factor * augmented[column][col];
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
    modelType: "robust_clipped_target_ridge_regression_v1",
    featureKeys,
    normalization,
    intercept: coefficients[0],
    weights: Object.fromEntries(featureKeys.map((featureKey, index) => [featureKey, coefficients[index + 1]]))
  };
}

function trainAnalogKnnMedian(rows, featureKeys, k) {
  const normalization = buildNormalizer(rows, featureKeys);
  return {
    modelType: "analog_knn_median_regression_v1",
    featureKeys,
    normalization,
    k,
    trainingVectors: rows.map((row) => ({
      vector: normalizeRow(row, featureKeys, normalization),
      label: row.label
    }))
  };
}

function trainRidgeKnnMedianBlend(rows, featureKeys, k, ridgeBlendWeight) {
  return {
    modelType: "ridge_knn_median_blend_regression_v1",
    featureKeys,
    ridgeModel: trainRidge(rows, featureKeys, 0.1, 3),
    analogModel: trainAnalogKnnMedian(rows, featureKeys, k),
    ridgeBlendWeight,
    analogBlendWeight: 1 - ridgeBlendWeight
  };
}

function trainPointwiseRidgeKnnMedianBlend(rows, featureKeys, k, ridgeBlendWeight) {
  const pointIds = Array.from(new Set(rows.map((row) => String(row.pointId ?? "unknown")))).sort();
  const pointModels = {};
  for (const pointId of pointIds) {
    const pointRows = rows.filter((row) => String(row.pointId ?? "unknown") === pointId);
    if (pointRows.length >= POINTWISE_MIN_TRAIN_ROWS) {
      pointModels[pointId] = trainRidgeKnnMedianBlend(pointRows, featureKeys, k, ridgeBlendWeight);
    }
  }
  return {
    modelType: "pointwise_ridge_knn_median_blend_regression_v1",
    featureKeys,
    fallbackModel: trainRidgeKnnMedianBlend(rows, featureKeys, k, ridgeBlendWeight),
    pointModels
  };
}

function trainPredictionEnsemble(members) {
  return {
    modelType: "prediction_ensemble_regression_v1",
    featureKeys: Array.from(new Set(members.flatMap((member) => member.model.featureKeys))).sort(),
    aggregation: "weighted-mean",
    members
  };
}

function memberSpecsForSeed(seed) {
  return seed.familyKeys.flatMap((familyKey) => {
    const featureKeys = FEATURE_FAMILIES[familyKey];
    return K_VALUES.flatMap((k) =>
      BLEND_WEIGHTS.map((ridgeBlendWeight) => ({
        familyKey,
        featureKeys,
        k,
        ridgeBlendWeight,
        weight: seed.weights[familyKey] ?? 1
      }))
    );
  });
}

function trainSeedBaseModel(rows, seed) {
  const members = [];
  for (const spec of memberSpecsForSeed(seed)) {
    const trainRows = rowsWithFeatures(rows, spec.featureKeys);
    if (trainRows.length < 100) continue;
    members.push({
      ...spec,
      model: trainPointwiseRidgeKnnMedianBlend(trainRows, spec.featureKeys, spec.k, spec.ridgeBlendWeight)
    });
  }
  return trainPredictionEnsemble(members.filter((member) => member.weight > 0));
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
  const refreshWorstNeighbor = () => {
    worstIndex = 0;
    worstDistance = topNeighbors[0]?.distance ?? Number.POSITIVE_INFINITY;
    for (let index = 1; index < topNeighbors.length; index += 1) {
      if (topNeighbors[index].distance > worstDistance) {
        worstIndex = index;
        worstDistance = topNeighbors[index].distance;
      }
    }
  };
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
    return model.ridgeBlendWeight * predictRidge(model.ridgeModel, row) + model.analogBlendWeight * predictAnalogKnnMedian(model.analogModel, row);
  }
  if (model.modelType === "pointwise_ridge_knn_median_blend_regression_v1") {
    return predictModel(model.pointModels[String(row.pointId ?? "unknown")] ?? model.fallbackModel, row);
  }
  if (model.modelType === "prediction_ensemble_regression_v1") {
    const predictions = model.members.map((member) => ({
      value: predictModel(member.model, row),
      weight: member.weight ?? 1
    }));
    const weightSum = predictions.reduce((sum, prediction) => sum + prediction.weight, 0);
    return predictions.reduce((sum, prediction) => sum + prediction.value * prediction.weight, 0) / weightSum;
  }
  if (model.modelType === "calibrated_prediction_regression_v1") {
    return applyOutputCalibration(model.calibration, predictModel(model.baseModel, row), row);
  }
  return predictRidge(model, row);
}

function monthFromRow(row) {
  const month = new Date(row.eventTs).getUTCMonth() + 1;
  return Number.isFinite(month) && month >= 1 && month <= 12 ? String(month).padStart(2, "0") : "unknown";
}

function regimeKey(row, dimensions) {
  return dimensions
    .map((dimension) => {
      if (dimension === "point") return `point:${String(row.pointId ?? "unknown")}`;
      if (dimension === "month") return `month:${monthFromRow(row)}`;
      return `${dimension}:unknown`;
    })
    .join("|");
}

function clamp(value, maxAbs) {
  return Math.max(-maxAbs, Math.min(maxAbs, value));
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
  return { intercept: labelMean - slope * predictionMean, slope };
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
  return { intercept: labelMean - slope * predictionMean, slope };
}

function fitHuberLinearCalibration(rows, predictions, tuningConstant) {
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
    method: `huber-linear-oof-c${String(tuningConstant).replace(".", "p")}`,
    intercept: calibration.intercept,
    slope: calibration.slope,
    scale: calibration.scale,
    cutoff: calibration.cutoff,
    tuningConstant
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
  const fallbackBias = clamp(mean(residuals), config.maxAbsBias) * config.correctionScale;
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
    const bias = clamp(rawBias * shrinkWeight, config.maxAbsBias) * config.correctionScale;
    biases[key] = bias;
    summaries[key] = { count: group.count, rawBias, bias };
  }
  return {
    ...baseCalibration,
    method: `${baseCalibration.method}+regime-residual-${config.residualKey}`,
    residualCorrection: {
      method: "regime-residual-oof",
      key: config.residualKey,
      dimensions: config.dimensions,
      minCount: config.minCount,
      shrinkage: config.shrinkage,
      maxAbsBias: config.maxAbsBias,
      correctionScale: config.correctionScale,
      fallbackBias,
      biases,
      summaries
    }
  };
}

function makeBlockedFolds(rows, foldCount) {
  const sortedRows = sortRowsByTime(rows);
  const folds = [];
  const foldSize = Math.ceil(sortedRows.length / foldCount);
  for (let index = 0; index < foldCount; index += 1) {
    const foldRows = sortedRows.slice(index * foldSize, Math.min(sortedRows.length, (index + 1) * foldSize));
    if (foldRows.length > 0) folds.push(foldRows);
  }
  return folds;
}

function fitSpecifiedSeedCalibration(rows, seed) {
  const foldPredictions = [];
  const foldRows = [];
  for (const validationFold of makeBlockedFolds(rows, OOF_FOLDS)) {
    const validationIds = new Set(validationFold.map((row) => row.sampleId));
    const fitRows = rows.filter((row) => !validationIds.has(row.sampleId));
    const model = trainSeedBaseModel(fitRows, seed);
    for (const row of rowsWithFeatures(validationFold, model.featureKeys)) {
      foldRows.push(row);
      foldPredictions.push(predictModel(model, row));
    }
  }
  const huber = fitHuberLinearCalibration(foldRows, foldPredictions, seed.calibration.tuningConstant);
  const calibration = fitRegimeResidualCorrectedCalibration(foldRows, foldPredictions, huber, seed.calibration);
  return { calibration, oofRows: foldRows, oofPredictions: foldPredictions };
}

function trainCalibratedSeed(rows, seed) {
  const baseModel = trainSeedBaseModel(rows, seed);
  const { calibration } = fitSpecifiedSeedCalibration(rowsWithFeatures(rows, baseModel.featureKeys), seed);
  return { modelType: "calibrated_prediction_regression_v1", featureKeys: baseModel.featureKeys, baseModel, calibration };
}

function oofSeedPredictions(rows, seed) {
  const outputs = [];
  for (const validationFold of makeBlockedFolds(rows, OOF_FOLDS)) {
    const validationIds = new Set(validationFold.map((row) => row.sampleId));
    const fitRows = rows.filter((row) => !validationIds.has(row.sampleId));
    const model = trainCalibratedSeed(fitRows, seed);
    for (const row of rowsWithFeatures(validationFold, model.featureKeys)) {
      outputs.push({ sampleId: row.sampleId, row, prediction: predictModel(model, row) });
    }
  }
  return outputs;
}

function regressionMetrics(rows, predictions) {
  const labels = rows.map((row) => row.label);
  const labelMean = mean(labels);
  const residuals = rows.map((row, index) => row.label - predictions[index]);
  const absErrors = residuals.map((value) => Math.abs(value));
  const squaredErrors = residuals.map((value) => value * value);
  const totalSumSquares = labels.reduce((sum, value) => sum + (value - labelMean) ** 2, 0);
  const residualSumSquares = squaredErrors.reduce((sum, value) => sum + value, 0);
  return {
    count: rows.length,
    labelMean,
    predictionMean: mean(predictions),
    mae: mean(absErrors),
    rmse: Math.sqrt(mean(squaredErrors)),
    r2: totalSumSquares > 0 ? 1 - residualSumSquares / totalSumSquares : 0,
    directionAccuracy: rows.filter((row, index) => (row.label >= 0) === (predictions[index] >= 0)).length / rows.length,
    within1mm: absErrors.filter((value) => value <= TOLERANCE_MM).length / rows.length,
    thresholdAgreement: rows.filter((row, index) => (Math.abs(row.label) >= THRESHOLD_MM) === (Math.abs(predictions[index]) >= THRESHOLD_MM)).length / rows.length,
    p50AbsError: quantile(absErrors, 0.5),
    p90AbsError: quantile(absErrors, 0.9),
    maxAbsError: Math.max(...absErrors)
  };
}

function fitConvexWeights(rows, predictionMatrix) {
  const candidates = [];
  const steps = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];
  for (const w0 of steps) {
    for (const w1 of steps) {
      const w2 = Number((1 - w0 - w1).toFixed(10));
      if (w2 < -1e-9) continue;
      const weights = predictionMatrix[0].length === 2 ? [w0, 1 - w0] : [w0, w1, Math.max(0, w2)];
      if (weights.some((value) => value < -1e-9)) continue;
      const predictions = predictionMatrix.map((values) => values.reduce((sum, value, index) => sum + value * weights[index], 0));
      candidates.push({ mode: "oof-grid-convex", weights, metrics: regressionMetrics(rows, predictions) });
    }
  }
  return candidates.sort((left, right) => {
    if (left.metrics.rmse !== right.metrics.rmse) return left.metrics.rmse - right.metrics.rmse;
    return left.metrics.mae - right.metrics.mae;
  })[0];
}

function renderMarkdown(report) {
  const lines = [
    "# Baijiabao Displacement Meta-Ensemble Challengers",
    "",
    fLine("generatedAt", report.generatedAt),
    fLine("trainRows", report.trainRows),
    fLine("validationRows", report.validationRows),
    "- target: `labels.displacementLabel` future 24h displacement delta in mm",
    "- method: nested chronological OOF seed calibration plus OOF-selected convex meta ensemble",
    "",
    "## Baseline To Beat",
    "",
    "| Model | MAE | RMSE | R2 | Direction | Within 1mm | Threshold | P90 AE |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    "| `BJB-DP-ENS-OOF-REFINED-SOFT-REGIME-v14` | `0.633` | `0.894` | `0.1236` | `58.28%` | `80.77%` | `86.32%` | `1.392` |",
    "",
    "## Validation Leaderboard",
    "",
    "| Rank | Candidate | MAE | RMSE | R2 | Direction | Within 1mm | Threshold | P90 AE |",
    "| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |"
  ];
  report.validationLeaderboard.forEach((item, index) => {
    const metrics = item.validationMetrics;
    lines.push(
      `| ${index + 1} | \`${item.key}\` | \`${metrics.mae.toFixed(6)}\` | \`${metrics.rmse.toFixed(6)}\` | \`${metrics.r2.toFixed(6)}\` | ` +
        `\`${(metrics.directionAccuracy * 100).toFixed(2)}%\` | \`${(metrics.within1mm * 100).toFixed(2)}%\` | ` +
        `\`${(metrics.thresholdAgreement * 100).toFixed(2)}%\` | \`${metrics.p90AbsError.toFixed(6)}\` |`
    );
  });
  lines.push("", "## OOF Meta Selection", "", "```json", JSON.stringify(report.metaSelection, null, 2), "```");
  return `${lines.join("\n")}\n`;
}

function fLine(key, value) {
  return `- ${key}: \`${value}\``;
}

async function main() {
  const trainRows = collectRows(await readJsonLines(TRAIN));
  const validationRows = collectRows(await readJsonLines(VALIDATION));
  addDecompositionFeatures(trainRows, validationRows);

  const oofBySeed = new Map();
  let usableTrainIds = null;
  for (const seed of SEED_SPECS) {
    const outputs = oofSeedPredictions(trainRows, seed);
    oofBySeed.set(seed.key, outputs);
    const seedIds = new Set(outputs.map((item) => item.sampleId));
    usableTrainIds =
      usableTrainIds == null ? seedIds : new Set(Array.from(usableTrainIds).filter((sampleId) => seedIds.has(sampleId)));
  }

  const alignedTrainRows = sortRowsByTime(trainRows.filter((row) => usableTrainIds?.has(row.sampleId)));
  const alignedTrainIds = alignedTrainRows.map((row) => row.sampleId);
  const predictionMatrix = alignedTrainRows.map((row) =>
    SEED_SPECS.map((seed) => oofBySeed.get(seed.key).find((item) => item.sampleId === row.sampleId)?.prediction ?? 0)
  );
  const metaSelection = fitConvexWeights(alignedTrainRows, predictionMatrix);

  const seedValidations = [];
  const validationPredictionsBySeed = new Map();
  for (const seed of SEED_SPECS) {
    const model = trainCalibratedSeed(trainRows, seed);
    const usableValidationRows = rowsWithFeatures(validationRows, model.featureKeys);
    const predictions = usableValidationRows.map((row) => predictModel(model, row));
    validationPredictionsBySeed.set(
      seed.key,
      new Map(usableValidationRows.map((row, index) => [row.sampleId, { row, prediction: predictions[index] }]))
    );
    seedValidations.push({
      key: seed.key,
      displayName: seed.displayName,
      seedConfig: seed,
      validationMetrics: regressionMetrics(usableValidationRows, predictions)
    });
  }

  const usableValidationIds = validationRows
    .map((row) => row.sampleId)
    .filter((sampleId) => SEED_SPECS.every((seed) => validationPredictionsBySeed.get(seed.key)?.has(sampleId)));
  const metaValidationRows = sortRowsByTime(validationRows.filter((row) => usableValidationIds.includes(row.sampleId)));
  const validationPredictionMatrix = metaValidationRows.map((row) =>
    SEED_SPECS.map((seed) => validationPredictionsBySeed.get(seed.key).get(row.sampleId).prediction)
  );
  const metaPredictions = validationPredictionMatrix.map((values) =>
    values.reduce((sum, value, index) => sum + value * metaSelection.weights[index], 0)
  );
  const metaCandidate = {
    key: "v20-oof-convex-meta-ensemble",
    displayName: "OOF-selected convex meta ensemble of v14/decomp seeds",
    weights: Object.fromEntries(SEED_SPECS.map((seed, index) => [seed.key, metaSelection.weights[index]])),
    oofSelectedMetrics: metaSelection.metrics,
    validationEvaluatedCount: metaValidationRows.length,
    validationMetrics: regressionMetrics(metaValidationRows, metaPredictions)
  };
  const validationLeaderboard = [...seedValidations, metaCandidate].sort((left, right) => {
    if (left.validationMetrics.rmse !== right.validationMetrics.rmse) return left.validationMetrics.rmse - right.validationMetrics.rmse;
    return left.validationMetrics.mae - right.validationMetrics.mae;
  });
  const report = {
    generatedAt: new Date().toISOString(),
    trainRows: trainRows.length,
    validationRows: validationRows.length,
    alignedOofTrainRows: alignedTrainRows.length,
    alignedTrainIds,
    baselineToBeat: BASELINE_TO_BEAT,
    seeds: SEED_SPECS,
    metaSelection,
    validationLeaderboard
  };
  await writeJson(path.join(OUT_DIR, "baijiabao-displacement-meta-ensemble-challengers.report.json"), report);
  await writeText(path.join(OUT_DIR, "baijiabao-displacement-meta-ensemble-challengers.report.md"), renderMarkdown(report));
  const best = validationLeaderboard[0];
  console.log(`Wrote meta-ensemble challenger report to ${OUT_DIR}`);
  console.log(
    `Best v20 candidate: ${best.key} MAE=${best.validationMetrics.mae.toFixed(6)} RMSE=${best.validationMetrics.rmse.toFixed(6)} ` +
      `R2=${best.validationMetrics.r2.toFixed(6)} Direction=${(best.validationMetrics.directionAccuracy * 100).toFixed(2)}% ` +
      `Within=${(best.validationMetrics.within1mm * 100).toFixed(2)}% P90=${best.validationMetrics.p90AbsError.toFixed(6)}`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
