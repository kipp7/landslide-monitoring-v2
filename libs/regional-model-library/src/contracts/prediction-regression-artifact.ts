import type { JsonObject, ScopeType } from "./common";

export type PredictionRegressionNormalizationRule = {
  min: number;
  max?: number;
  span?: number;
};

export type PredictionRegressionRow = {
  values: Record<string, number>;
  pointId?: string | null;
  eventTs?: string | null;
};

export type PredictionRegressionTrainingSummary = {
  sampleCount: number;
  validationSampleCount?: number;
  fallbackCount?: number;
};

export type PredictionRegressionModelArtifactV1 = {
  schemaVersion: "prediction-regression-model.v1";
  modelKey: string;
  modelVersion: string | null;
  scopeType: ScopeType;
  scopeKey: string | null;
  artifactType: "calibrated_prediction_regression_v1";
  featureSchemaVersion: string;
  labelSchemaVersion: string;
  profileVersion: string;
  trainingDatasetKeys: string[];
  createdAt: string;
  entrypoint: "prediction-regression-v1";
  labelKey: string;
  requiredFeatureKeys: string[];
  targetUnit: string;
  horizonSpec: string;
  trainingSummary: PredictionRegressionTrainingSummary;
  model: PredictionRegressionModel;
  validationMetrics?: JsonObject;
  metadata?: JsonObject;
};

export type PredictionRegressionExecution = {
  modelKey: string;
  modelVersion: string | null;
  labelKey: string;
  predictedValue: number;
  targetUnit: string;
  horizonSpec: string;
  missingFeatureKeys: string[];
  explain: string;
};

type RidgeRegressionModel = {
  modelType: "ridge_linear_regression_v1" | "robust_clipped_target_ridge_regression_v1";
  featureKeys: string[];
  normalization: Record<string, PredictionRegressionNormalizationRule>;
  intercept: number;
  weights: Record<string, number>;
};

type AnalogKnnMedianRegressionModel = {
  modelType: "analog_knn_median_regression_v1";
  featureKeys: string[];
  normalization: Record<string, PredictionRegressionNormalizationRule>;
  k: number;
  trainingVectors: {
    sampleId?: string;
    vector: number[];
    label: number;
  }[];
};

type RidgeKnnMedianBlendRegressionModel = {
  modelType: "ridge_knn_median_blend_regression_v1";
  featureKeys: string[];
  ridgeModel: RidgeRegressionModel;
  analogModel: AnalogKnnMedianRegressionModel;
  ridgeBlendWeight: number;
  analogBlendWeight: number;
};

type PointwiseRidgeKnnMedianBlendRegressionModel = {
  modelType: "pointwise_ridge_knn_median_blend_regression_v1";
  featureKeys: string[];
  fallbackModel: RidgeKnnMedianBlendRegressionModel;
  pointModels: Record<string, RidgeKnnMedianBlendRegressionModel>;
};

type PredictionEnsembleRegressionModel = {
  modelType: "prediction_ensemble_regression_v1";
  featureKeys: string[];
  aggregation: "weighted-mean" | "median" | "mean";
  members: {
    weight?: number;
    model: PredictionRegressionModel;
  }[];
};

type GatedModelSelectionRegressionModel = {
  modelType: "gated_model_selection_regression_v1";
  featureKeys: string[];
  dimensions: string[];
  fallbackModel: PredictionRegressionModel;
  candidateModel: PredictionRegressionModel;
  selectedKeys: string[];
};

type SklearnHistGradientBoostingTreeNode = {
  featureIndex: number;
  threshold: number;
  left: number;
  right: number;
  value: number;
  isLeaf: boolean;
  missingGoToLeft?: boolean;
};

type SklearnHistGradientBoostingRegressionModel = {
  modelType: "sklearn_hist_gradient_boosting_regression_v1";
  featureKeys: string[];
  baseline: number;
  trees: SklearnHistGradientBoostingTreeNode[][];
  outputScale?: number;
  outputOffset?: number;
};

type PredictionOutputCalibration = {
  intercept: number;
  slope: number;
  residualCorrection?: {
    dimensions: string[];
    fallbackBias?: number;
    biases?: Record<string, number>;
    preserveSign?: boolean;
    preserveThresholdAbs?: number;
  } | null;
};

type CalibratedPredictionRegressionModel = {
  modelType: "calibrated_prediction_regression_v1";
  featureKeys: string[];
  baseModel: PredictionRegressionModel;
  calibration: PredictionOutputCalibration;
};

type CalibratedRidgeKnnMedianBlendRegressionModel = {
  modelType: "calibrated_ridge_knn_median_blend_regression_v1";
  featureKeys: string[];
  baseModel: RidgeKnnMedianBlendRegressionModel;
  calibration: PredictionOutputCalibration;
};

export type PredictionRegressionModel =
  | RidgeRegressionModel
  | AnalogKnnMedianRegressionModel
  | RidgeKnnMedianBlendRegressionModel
  | PointwiseRidgeKnnMedianBlendRegressionModel
  | PredictionEnsembleRegressionModel
  | GatedModelSelectionRegressionModel
  | SklearnHistGradientBoostingRegressionModel
  | CalibratedPredictionRegressionModel
  | CalibratedRidgeKnnMedianBlendRegressionModel;

function readFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const left = sorted[middle - 1] ?? 0;
  const right = sorted[middle] ?? 0;
  return sorted.length % 2 === 0 ? (left + right) / 2 : right;
}

function mean(values: number[]): number {
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function resolveNormalizationSpan(rule: PredictionRegressionNormalizationRule): number {
  const explicitSpan = readFiniteNumber(rule.span);
  if (explicitSpan !== null && explicitSpan !== 0) return explicitSpan;
  const max = readFiniteNumber(rule.max);
  return max !== null && max !== rule.min ? max - rule.min : 1;
}

function normalizeRow(
  row: PredictionRegressionRow,
  featureKeys: readonly string[],
  normalization: Record<string, PredictionRegressionNormalizationRule>
): number[] {
  return featureKeys.map((featureKey) => {
    const rule = normalization[featureKey];
    const value = row.values[featureKey] ?? 0;
    if (!rule) return value;
    return (value - rule.min) / resolveNormalizationSpan(rule);
  });
}

function squaredDistance(left: readonly number[], right: readonly number[]): number {
  const length = Math.min(left.length, right.length);
  let sum = 0;
  for (let index = 0; index < length; index += 1) {
    const delta = (left[index] ?? 0) - (right[index] ?? 0);
    sum += delta * delta;
  }
  return sum;
}

function predictRidge(model: RidgeRegressionModel, row: PredictionRegressionRow): number {
  let prediction = model.intercept;
  for (const featureKey of model.featureKeys) {
    const rule = model.normalization[featureKey];
    const rawValue = row.values[featureKey] ?? 0;
    const normalized = rule ? (rawValue - rule.min) / resolveNormalizationSpan(rule) : rawValue;
    prediction += (model.weights[featureKey] ?? 0) * normalized;
  }
  return prediction;
}

function predictAnalogKnnMedian(model: AnalogKnnMedianRegressionModel, row: PredictionRegressionRow): number {
  const vector = normalizeRow(row, model.featureKeys, model.normalization);
  const neighbors = model.trainingVectors
    .map((trainingVector) => ({
      distance: squaredDistance(vector, trainingVector.vector),
      label: trainingVector.label
    }))
    .sort((left, right) => left.distance - right.distance)
    .slice(0, Math.max(1, model.k));
  return median(neighbors.map((neighbor) => neighbor.label));
}

function predictSklearnHistGradientBoostingTree(
  tree: readonly SklearnHistGradientBoostingTreeNode[],
  row: PredictionRegressionRow,
  featureKeys: readonly string[]
): number {
  let nodeIndex = 0;
  for (let guard = 0; guard < tree.length; guard += 1) {
    const node = tree[nodeIndex];
    if (!node) return 0;
    if (node.isLeaf) return node.value;

    const featureKey = featureKeys[node.featureIndex] ?? "";
    const featureValue = row.values[featureKey];
    if (typeof featureValue !== "number" || !Number.isFinite(featureValue)) {
      nodeIndex = node.missingGoToLeft ? node.left : node.right;
      continue;
    }

    nodeIndex = featureValue <= node.threshold ? node.left : node.right;
  }
  return 0;
}

function predictSklearnHistGradientBoosting(
  model: SklearnHistGradientBoostingRegressionModel,
  row: PredictionRegressionRow
): number {
  const rawPrediction = model.trees.reduce(
    (sum, tree) => sum + predictSklearnHistGradientBoostingTree(tree, row, model.featureKeys),
    model.baseline
  );
  return (model.outputOffset ?? 0) + (model.outputScale ?? 1) * rawPrediction;
}

function monthFromRow(row: PredictionRegressionRow): string {
  if (!row.eventTs) return "unknown";
  const month = new Date(row.eventTs).getUTCMonth() + 1;
  return Number.isFinite(month) && month >= 1 && month <= 12 ? String(month).padStart(2, "0") : "unknown";
}

function seasonFromMonth(month: string): string {
  if (["03", "04", "05"].includes(month)) return "spring";
  if (["06", "07", "08"].includes(month)) return "summer";
  if (["09", "10", "11"].includes(month)) return "autumn";
  if (["12", "01", "02"].includes(month)) return "winter";
  return "unknown";
}

function trendBucket(value: unknown, epsilon = 0.05): string {
  const number = readFiniteNumber(value);
  if (number === null) return "unknown";
  if (number > epsilon) return "rising";
  if (number < -epsilon) return "falling";
  return "stable";
}

function binRainfall24h(value: unknown): string {
  const number = readFiniteNumber(value);
  if (number === null) return "unknown";
  if (number === 0) return "00_zero";
  if (number <= 10) return "01_0-10mm";
  if (number <= 25) return "02_10-25mm";
  if (number <= 50) return "03_25-50mm";
  return "04_gt50mm";
}

function binRainfall72h(value: unknown): string {
  const number = readFiniteNumber(value);
  if (number === null) return "unknown";
  if (number === 0) return "00_zero";
  if (number <= 20) return "01_0-20mm";
  if (number <= 50) return "02_20-50mm";
  if (number <= 100) return "03_50-100mm";
  return "04_gt100mm";
}

function binAbsDelta(value: unknown): string {
  const number = readFiniteNumber(value);
  if (number === null) return "unknown";
  const abs = Math.abs(number);
  if (abs === 0) return "00_zero";
  if (abs <= 0.5) return "01_0-0.5mm";
  if (abs <= 1.3) return "02_0.5-1.3mm";
  if (abs <= 3) return "03_1.3-3mm";
  return "04_gt3mm";
}

function binSignedContext(value: unknown, cuts: readonly number[], unit: string): string {
  const number = readFiniteNumber(value);
  if (number === null) return "unknown";
  for (let index = 0; index < cuts.length; index += 1) {
    const cut = cuts[index] ?? 0;
    if (number <= cut) {
      return `${String(index).padStart(2, "0")}_lte_${String(cut)}${unit}`;
    }
  }
  return `${String(cuts.length).padStart(2, "0")}_gt_${String(cuts[cuts.length - 1] ?? 0)}${unit}`;
}

function binContextPresence(value: unknown): string {
  return readFiniteNumber(value) === null ? "missing" : "present";
}

function regimeValue(row: PredictionRegressionRow, dimension: string): string {
  const month = monthFromRow(row);
  if (dimension === "point") return String(row.pointId ?? "unknown");
  if (dimension === "month") return month;
  if (dimension === "season") return seasonFromMonth(month);
  if (dimension === "reservoirTrend") return trendBucket(row.values.reservoirLevelM_delta_72h);
  if (dimension === "displacementTrend") return trendBucket(row.values.displacementSurfaceMm_delta_72h);
  if (dimension === "rainfall24hBucket") return binRainfall24h(row.values.rainfallCurrentMm_sum_24h);
  if (dimension === "rainfall72hBucket") return binRainfall72h(row.values.rainfallCurrentMm_sum_72h);
  if (dimension === "displacementDelta72hBucket") return binAbsDelta(row.values.displacementSurfaceMm_delta_72h);
  if (dimension === "reservoirDelta72hBucket") return binAbsDelta(row.values.reservoirLevelM_delta_72h);
  if (dimension === "porePressure168hBucket") {
    return binSignedContext(row.values.porePressureKpa_mean_168h, [150, 180, 210, 240, 280], "kpa");
  }
  if (dimension === "groundwaterDepth168hBucket") {
    return binSignedContext(row.values.groundwaterDepthM_mean_168h, [5, 10, 20, 35, 50], "m");
  }
  if (dimension === "groundwaterTemperature168hBucket") {
    return binSignedContext(row.values.groundwaterTemperatureC_mean_168h, [12, 16, 20, 24, 28], "c");
  }
  if (dimension === "tunnelFlow168hBucket") {
    return binSignedContext(row.values.tunnelFlowRate_mean_168h, [20, 35, 50, 75, 100], "flow");
  }
  if (dimension === "tunnelSettlement168hBucket") {
    return binSignedContext(row.values.tunnelSettlementMm_mean_168h, [30, 50, 70, 90, 120], "mm");
  }
  if (dimension === "slipBeltWaterContent168hBucket") {
    return binSignedContext(row.values.slipBeltWaterContent_mean_168h, [0.1, 5, 10, 20, 40], "wc");
  }
  if (dimension === "caveWaterTemperature168hBucket") {
    return binSignedContext(row.values.caveWaterTemperatureC_mean_168h, [10, 14, 18, 22, 26], "c");
  }
  if (dimension === "contextPresence") {
    return [
      binContextPresence(row.values.porePressureKpa_mean_168h),
      binContextPresence(row.values.groundwaterDepthM_mean_168h),
      binContextPresence(row.values.tunnelFlowRate_mean_168h),
      binContextPresence(row.values.tunnelSettlementMm_mean_168h)
    ].join("-");
  }
  return "unknown";
}

function regimeKey(row: PredictionRegressionRow, dimensions: readonly string[]): string {
  return dimensions.map((dimension) => `${dimension}:${regimeValue(row, dimension)}`).join("|");
}

function applyOutputCalibration(
  calibration: PredictionOutputCalibration,
  rawPrediction: number,
  row: PredictionRegressionRow
): number {
  const linearPrediction = calibration.intercept + calibration.slope * rawPrediction;
  const correction = calibration.residualCorrection;
  if (!correction) return linearPrediction;
  const key = regimeKey(row, correction.dimensions);
  const correctedPrediction = linearPrediction + (correction.biases?.[key] ?? correction.fallbackBias ?? 0);
  if (correction.preserveSign && (linearPrediction >= 0) !== (correctedPrediction >= 0)) {
    return linearPrediction;
  }
  const thresholdAbs = readFiniteNumber(correction.preserveThresholdAbs);
  if (
    thresholdAbs !== null &&
    (Math.abs(linearPrediction) >= thresholdAbs) !== (Math.abs(correctedPrediction) >= thresholdAbs)
  ) {
    return linearPrediction;
  }
  return correctedPrediction;
}

export function predictPredictionRegressionModel(
  model: PredictionRegressionModel,
  row: PredictionRegressionRow
): number {
  if (
    model.modelType === "ridge_linear_regression_v1" ||
    model.modelType === "robust_clipped_target_ridge_regression_v1"
  ) {
    return predictRidge(model, row);
  }

  if (model.modelType === "analog_knn_median_regression_v1") {
    return predictAnalogKnnMedian(model, row);
  }

  if (model.modelType === "ridge_knn_median_blend_regression_v1") {
    return (
      model.ridgeBlendWeight * predictRidge(model.ridgeModel, row) +
      model.analogBlendWeight * predictAnalogKnnMedian(model.analogModel, row)
    );
  }

  if (model.modelType === "calibrated_ridge_knn_median_blend_regression_v1") {
    return applyOutputCalibration(model.calibration, predictPredictionRegressionModel(model.baseModel, row), row);
  }

  if (model.modelType === "pointwise_ridge_knn_median_blend_regression_v1") {
    const pointId = String(row.pointId ?? "unknown");
    return predictPredictionRegressionModel(model.pointModels[pointId] ?? model.fallbackModel, row);
  }

  if (model.modelType === "prediction_ensemble_regression_v1") {
    const predictions = model.members.map((member) => ({
      value: predictPredictionRegressionModel(member.model, row),
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

  if (model.modelType === "gated_model_selection_regression_v1") {
    const key = regimeKey(row, model.dimensions);
    const selected = model.selectedKeys.includes(key) ? model.candidateModel : model.fallbackModel;
    return predictPredictionRegressionModel(selected, row);
  }

  if (model.modelType === "sklearn_hist_gradient_boosting_regression_v1") {
    return predictSklearnHistGradientBoosting(model, row);
  }

  if (model.modelType === "calibrated_prediction_regression_v1") {
    return applyOutputCalibration(model.calibration, predictPredictionRegressionModel(model.baseModel, row), row);
  }

  return 0;
}

export function listMissingPredictionRegressionFeatures(
  artifact: PredictionRegressionModelArtifactV1,
  featureValues: Record<string, number>
): string[] {
  return artifact.requiredFeatureKeys.filter((featureKey) => {
    const value = featureValues[featureKey];
    return typeof value !== "number" || !Number.isFinite(value);
  });
}

export function runPredictionRegressionArtifact(
  artifact: PredictionRegressionModelArtifactV1,
  row: PredictionRegressionRow
): PredictionRegressionExecution | null {
  const missingFeatureKeys = listMissingPredictionRegressionFeatures(artifact, row.values);
  if (missingFeatureKeys.length > 0) {
    return null;
  }

  const predictedValue = predictPredictionRegressionModel(artifact.model, row);
  return {
    modelKey: artifact.modelKey,
    modelVersion: artifact.modelVersion,
    labelKey: artifact.labelKey,
    predictedValue,
    targetUnit: artifact.targetUnit,
    horizonSpec: artifact.horizonSpec,
    missingFeatureKeys,
    explain: `artifact=${artifact.modelKey}@${artifact.modelVersion ?? "n/a"} predicted ${artifact.labelKey}=${String(
      predictedValue
    )}${artifact.targetUnit} horizon=${artifact.horizonSpec}`
  };
}
