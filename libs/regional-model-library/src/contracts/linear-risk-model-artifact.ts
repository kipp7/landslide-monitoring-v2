import type { JsonObject, ScopeType } from "./common";
import type { PredictionRegressionModelArtifactV1 } from "./prediction-regression-artifact";

export type SupportedArtifactType =
  | "linear_risk_v1"
  | "two_stage_linear_risk_v1"
  | "calibrated_prediction_regression_v1";

export type LinearRiskStageKey = "stage1_displacement" | "stage2_warning";

export type LinearRiskFeatureNormalization = {
  min: number;
  max: number;
};

export type LinearRiskTrainingSummary = {
  sampleCount: number;
  positiveCount: number;
  negativeCount: number;
};

export type LinearRiskModelStageV1 = {
  stageKey: LinearRiskStageKey;
  outputKey: string;
  labelKey: string;
  requiredFeatureKeys: string[];
  featureNormalization: Record<string, LinearRiskFeatureNormalization>;
  featureCenters: Record<string, number>;
  bias: number;
  weights: Record<string, number>;
  trainingSummary: LinearRiskTrainingSummary;
  metadata?: JsonObject;
};

export type LinearRiskModelArtifactV1 = {
  schemaVersion: "linear-risk-model.v1";
  modelKey: string;
  modelVersion: string | null;
  scopeType: ScopeType;
  scopeKey: string | null;
  artifactType: "linear_risk_v1";
  featureSchemaVersion: string;
  labelSchemaVersion: string;
  profileVersion: string;
  trainingDatasetKeys: string[];
  createdAt: string;
  entrypoint: "linear-risk-v1";
  labelKey: string;
  requiredFeatureKeys: string[];
  featureNormalization: Record<string, LinearRiskFeatureNormalization>;
  featureCenters: Record<string, number>;
  bias: number;
  weights: Record<string, number>;
  trainingSummary: LinearRiskTrainingSummary;
  metadata?: JsonObject;
};

export type TwoStageLinearRiskModelArtifactV1 = {
  schemaVersion: "linear-risk-model.v1";
  modelKey: string;
  modelVersion: string | null;
  scopeType: ScopeType;
  scopeKey: string | null;
  artifactType: "two_stage_linear_risk_v1";
  featureSchemaVersion: string;
  labelSchemaVersion: string;
  profileVersion: string;
  trainingDatasetKeys: string[];
  createdAt: string;
  entrypoint: "linear-risk-v1";
  labelKey: string;
  requiredFeatureKeys: string[];
  trainingSummary: LinearRiskTrainingSummary;
  stage1: LinearRiskModelStageV1;
  stage2: LinearRiskModelStageV1;
  metadata?: JsonObject;
};

export type RegionalModelArtifact =
  | LinearRiskModelArtifactV1
  | TwoStageLinearRiskModelArtifactV1
  | PredictionRegressionModelArtifactV1;

export type LinearRiskFeatureContribution = {
  featureKey: string;
  rawValue: number;
  normalizedValue: number;
  centeredValue: number;
  weight: number;
  contribution: number;
};

export type LinearRiskStageExecution = {
  stageKey: LinearRiskStageKey;
  outputKey: string;
  score: number;
  rawScore: number;
  explain: string;
  missingFeatureKeys: string[];
  contributions: LinearRiskFeatureContribution[];
};

export type RegionalModelArtifactRegistryFile = {
  artifacts: RegionalModelArtifact[];
};

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function sigmoid(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  if (value >= 20) return 1;
  if (value <= -20) return 0;
  return 1 / (1 + Math.exp(-value));
}

export function normalizeLinearRiskFeatureValue(
  stage: LinearRiskModelStageV1,
  featureKey: string,
  rawValue: number
): number {
  const rule = stage.featureNormalization[featureKey];
  if (!rule) return rawValue;
  const span = rule.max - rule.min;
  if (!Number.isFinite(span) || span <= 0) return 0.5;
  return clamp01((rawValue - rule.min) / span);
}

export function listMissingLinearRiskStageFeatures(
  stage: LinearRiskModelStageV1,
  featureValues: Record<string, number>
): string[] {
  return stage.requiredFeatureKeys.filter((featureKey) => {
    const value = featureValues[featureKey];
    return typeof value !== "number" || !Number.isFinite(value);
  });
}

export function getArtifactRequiredFeatureKeys(artifact: RegionalModelArtifact): string[] {
  if (artifact.artifactType === "linear_risk_v1") {
    return artifact.requiredFeatureKeys;
  }
  if (artifact.artifactType === "calibrated_prediction_regression_v1") {
    return artifact.requiredFeatureKeys;
  }

  const featureKeys = new Set<string>();
  for (const featureKey of artifact.requiredFeatureKeys) {
    if (featureKey !== artifact.stage1.outputKey) {
      featureKeys.add(featureKey);
    }
  }
  for (const featureKey of artifact.stage1.requiredFeatureKeys) {
    featureKeys.add(featureKey);
  }
  for (const featureKey of artifact.stage2.requiredFeatureKeys) {
    if (featureKey !== artifact.stage1.outputKey) {
      featureKeys.add(featureKey);
    }
  }
  return Array.from(featureKeys).sort((left, right) => left.localeCompare(right));
}

export function runLinearRiskStage(
  stage: LinearRiskModelStageV1,
  featureValues: Record<string, number>
): LinearRiskStageExecution | null {
  const missingFeatureKeys = listMissingLinearRiskStageFeatures(stage, featureValues);
  if (missingFeatureKeys.length > 0) {
    return null;
  }

  let rawScore = stage.bias;
  const contributions: LinearRiskFeatureContribution[] = [];

  for (const [featureKey, weight] of Object.entries(stage.weights)) {
    const rawValue = featureValues[featureKey] ?? 0;
    const normalizedValue = normalizeLinearRiskFeatureValue(stage, featureKey, rawValue);
    const centeredValue = normalizedValue - (stage.featureCenters[featureKey] ?? 0);
    const contribution = weight * centeredValue;
    rawScore += contribution;
    contributions.push({
      featureKey,
      rawValue,
      normalizedValue,
      centeredValue,
      weight,
      contribution
    });
  }

  contributions.sort(
    (left, right) => Math.abs(right.contribution) - Math.abs(left.contribution)
  );

  const score = sigmoid(rawScore);
  return {
    stageKey: stage.stageKey,
    outputKey: stage.outputKey,
    score,
    rawScore,
    explain: `stage=${stage.stageKey} output=${stage.outputKey} score=${String(score)}`,
    missingFeatureKeys,
    contributions
  };
}
