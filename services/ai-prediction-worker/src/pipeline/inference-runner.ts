import type {
  LinearRiskModelArtifactV1,
  LinearRiskStageExecution,
  TwoStageLinearRiskModelArtifactV1
} from "@lsmv2/regional-model-library";
import { runLinearRiskStage } from "@lsmv2/regional-model-library";
import { runFallbackHeuristic, toRiskLevel } from "./fallback-heuristic";
import type { FeatureVector, ModelArtifact, RegionContext } from "./types";

type RiskLevel = "low" | "medium" | "high";

type StagePayload = {
  stageKey: string;
  outputKey: string;
  score: number;
  rawScore: number;
  explain: string;
  missingFeatureKeys: string[];
  topContributions: {
    featureKey: string;
    rawValue: number;
    normalizedValue: number;
    weight: number;
    contribution: number;
  }[];
};

type InferenceResult = {
  modelKey: string;
  modelVersion: string | null;
  riskScore: number;
  riskLevel: RiskLevel;
  explain: string;
  fallbackReason: string | null;
  requiredFeaturesSatisfied: boolean;
  missingFeatureKeys: string[];
  warningFactors: string[];
  riskCalibration: {
    threshold: number | null;
    scoreOverThreshold: number | null;
    calibratedRiskLevel: RiskLevel;
    source: string | null;
  };
  stageOutputs: {
    stage1: StagePayload | null;
    stage2: StagePayload | null;
  } | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function readFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readArtifactCalibrationThreshold(artifact: ModelArtifact): { threshold: number | null; source: string | null } {
  const metadata = asRecord(artifact.metadata);
  if (!metadata) return { threshold: null, source: null };

  const replaySummary = asRecord(metadata.replaySummary);
  const replaySummaryThreshold = replaySummary ? readFiniteNumber(replaySummary.threshold) : null;
  if (replaySummaryThreshold !== null && replaySummaryThreshold > 0 && replaySummaryThreshold < 1) {
    return { threshold: replaySummaryThreshold, source: "metadata.replaySummary.threshold" };
  }

  const calibration = asRecord(metadata.calibration);
  const calibrationThreshold = calibration ? readFiniteNumber(calibration.threshold) : null;
  if (calibrationThreshold !== null && calibrationThreshold > 0 && calibrationThreshold < 1) {
    return { threshold: calibrationThreshold, source: "metadata.calibration.threshold" };
  }

  return { threshold: null, source: null };
}

function buildRiskCalibration(artifact: ModelArtifact, score: number): InferenceResult["riskCalibration"] {
  const { threshold, source } = readArtifactCalibrationThreshold(artifact);
  if (threshold === null) {
    const genericRiskLevel = toRiskLevel(score);
    return {
      threshold: null,
      scoreOverThreshold: null,
      calibratedRiskLevel: genericRiskLevel,
      source: null
    };
  }

  const scoreOverThreshold = score / threshold;
  const calibratedRiskLevel = score >= 0.8 ? "high" : score >= threshold ? "medium" : "low";
  return {
    threshold,
    scoreOverThreshold,
    calibratedRiskLevel,
    source
  };
}

function emptyRiskCalibration(riskLevel: RiskLevel): InferenceResult["riskCalibration"] {
  return {
    threshold: null,
    scoreOverThreshold: null,
    calibratedRiskLevel: riskLevel,
    source: null
  };
}

function toStagePayload(stage: LinearRiskStageExecution): StagePayload {
  return {
    stageKey: stage.stageKey,
    outputKey: stage.outputKey,
    score: stage.score,
    rawScore: stage.rawScore,
    explain: stage.explain,
    missingFeatureKeys: stage.missingFeatureKeys,
    topContributions: stage.contributions.slice(0, 5).map((contribution) => ({
      featureKey: contribution.featureKey,
      rawValue: contribution.rawValue,
      normalizedValue: contribution.normalizedValue,
      weight: contribution.weight,
      contribution: contribution.contribution
    }))
  };
}

function toWarningFactors(stage: LinearRiskStageExecution, limit = 5): string[] {
  return stage.contributions.slice(0, limit).map(
    (contribution) =>
      `${contribution.featureKey}=${String(contribution.rawValue)} normalized=${String(
        contribution.normalizedValue
      )} contribution=${String(contribution.contribution)} weight=${String(contribution.weight)}`
  );
}

function runSingleStageArtifact(
  artifact: LinearRiskModelArtifactV1,
  featureValues: Record<string, number>
): {
  score: number | null;
  missingFeatureKeys: string[];
  warningFactors: string[];
  stageOutputs: InferenceResult["stageOutputs"];
  explain: string | null;
} {
  const stage2 = runLinearRiskStage({
    stageKey: "stage2_warning",
    outputKey: "stage2WarningScore",
    labelKey: artifact.labelKey,
    requiredFeatureKeys: artifact.requiredFeatureKeys,
    featureNormalization: artifact.featureNormalization,
    featureCenters: artifact.featureCenters,
    bias: artifact.bias,
    weights: artifact.weights,
    trainingSummary: artifact.trainingSummary,
    ...(artifact.metadata ? { metadata: artifact.metadata } : {})
  }, featureValues);

  if (!stage2) {
    return {
      score: null,
      missingFeatureKeys: artifact.requiredFeatureKeys.filter(
        (featureKey) => typeof featureValues[featureKey] !== "number"
      ),
      warningFactors: [],
      stageOutputs: null,
      explain: null
    };
  }

  return {
    score: stage2.score,
    missingFeatureKeys: [],
    warningFactors: toWarningFactors(stage2),
    stageOutputs: {
      stage1: null,
      stage2: toStagePayload(stage2)
    },
    explain: stage2.explain
  };
}

function runTwoStageArtifact(
  artifact: TwoStageLinearRiskModelArtifactV1,
  featureValues: Record<string, number>
): {
  score: number | null;
  missingFeatureKeys: string[];
  warningFactors: string[];
  stageOutputs: InferenceResult["stageOutputs"];
  explain: string | null;
} {
  const stage1 = runLinearRiskStage(artifact.stage1, featureValues);
  if (!stage1) {
    return {
      score: null,
      missingFeatureKeys: artifact.stage1.requiredFeatureKeys.filter(
        (featureKey) => typeof featureValues[featureKey] !== "number"
      ),
      warningFactors: [],
      stageOutputs: null,
      explain: null
    };
  }

  const stage2FeatureValues = {
    ...featureValues,
    [artifact.stage1.outputKey]: stage1.score
  };
  const stage2 = runLinearRiskStage(artifact.stage2, stage2FeatureValues);
  if (!stage2) {
    return {
      score: null,
      missingFeatureKeys: artifact.stage2.requiredFeatureKeys.filter(
        (featureKey) => typeof stage2FeatureValues[featureKey] !== "number"
      ),
      warningFactors: toWarningFactors(stage1),
      stageOutputs: {
        stage1: toStagePayload(stage1),
        stage2: null
      },
      explain: stage1.explain
    };
  }

  return {
    score: stage2.score,
    missingFeatureKeys: [],
    warningFactors: [
      `${artifact.stage1.outputKey}=${String(stage1.score)}`,
      ...toWarningFactors(stage2)
    ],
    stageOutputs: {
      stage1: toStagePayload(stage1),
      stage2: toStagePayload(stage2)
    },
    explain: `${stage1.explain}; ${stage2.explain}`
  };
}

export function runInference(input: {
  artifact: ModelArtifact | null;
  features: FeatureVector;
  regionContext: RegionContext;
}): InferenceResult {
  const { artifact, features, regionContext } = input;
  const featureValues = features.values;

  if (!artifact) {
    const fallback = runFallbackHeuristic(features, regionContext);
    return {
      modelKey: "heuristic.v1",
      modelVersion: "1",
      riskScore: fallback.riskScore,
      riskLevel: fallback.riskLevel,
      explain: fallback.explain,
      fallbackReason: "no-matching-artifact",
      requiredFeaturesSatisfied: false,
      missingFeatureKeys: [],
      warningFactors: fallback.warningFactors,
      riskCalibration: emptyRiskCalibration(fallback.riskLevel),
      stageOutputs: null
    };
  }

  if (artifact.artifactType === "calibrated_prediction_regression_v1") {
    const fallback = runFallbackHeuristic(features, regionContext);
    return {
      modelKey: "heuristic.v1",
      modelVersion: "1",
      riskScore: fallback.riskScore,
      riskLevel: fallback.riskLevel,
      explain: `${fallback.explain}; forecastArtifact=${artifact.modelKey} is not a risk artifact`,
      fallbackReason: "forecast-artifact-not-risk-artifact",
      requiredFeaturesSatisfied: false,
      missingFeatureKeys: [],
      warningFactors: fallback.warningFactors,
      riskCalibration: emptyRiskCalibration(fallback.riskLevel),
      stageOutputs: null
    };
  }

  const executed =
    artifact.artifactType === "two_stage_linear_risk_v1"
      ? runTwoStageArtifact(artifact, featureValues)
      : runSingleStageArtifact(artifact, featureValues);

  if (executed.score === null) {
    const fallback = runFallbackHeuristic(features, regionContext);
    return {
      modelKey: "heuristic.v1",
      modelVersion: "1",
      riskScore: fallback.riskScore,
      riskLevel: fallback.riskLevel,
      explain: `${fallback.explain}; missingRequiredFeatures=${executed.missingFeatureKeys.join(",")}`,
      fallbackReason: "missing-required-features",
      requiredFeaturesSatisfied: false,
      missingFeatureKeys: executed.missingFeatureKeys,
      warningFactors: executed.warningFactors.length > 0 ? executed.warningFactors : fallback.warningFactors,
      riskCalibration: emptyRiskCalibration(fallback.riskLevel),
      stageOutputs: executed.stageOutputs
    };
  }

  const riskCalibration = buildRiskCalibration(artifact, executed.score);
  const riskLevel = riskCalibration.calibratedRiskLevel;
  const calibrationExplain =
    riskCalibration.threshold !== null
      ? `calibrationThreshold=${String(riskCalibration.threshold)} scoreOverThreshold=${String(
          riskCalibration.scoreOverThreshold
        )}`
      : "calibrationThreshold=n/a";

  return {
    modelKey: artifact.modelKey,
    modelVersion: artifact.modelVersion,
    riskScore: executed.score,
    riskLevel,
    explain: `artifact=${artifact.modelKey}@${artifact.modelVersion ?? "n/a"} ${calibrationExplain} ${
      executed.explain ?? ""
    }`.trim(),
    fallbackReason: null,
    requiredFeaturesSatisfied: true,
    missingFeatureKeys: [],
    warningFactors: executed.warningFactors,
    riskCalibration,
    stageOutputs: executed.stageOutputs
  };
}
