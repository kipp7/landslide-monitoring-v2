import type { ClickHouseClient } from "@clickhouse/client";
import { runPredictionRegressionArtifact } from "@lsmv2/regional-model-library";
import type { Pool } from "pg";
import type { AppConfig } from "../config";
import type { ArtifactRegistry } from "./artifacts/artifact-registry";
import { buildFeatureVector } from "./feature-builder";
import { FEATURE_DEFINITIONS } from "./feature-definitions";
import { loadHistoricalFeatureSource } from "./history-loader";
import { runInference } from "./inference-runner";
import { pickMatchedArtifact } from "./model-matcher";
import { resolveRegionContext } from "./region-profile-resolver";
import type { FeatureVector, ModelArtifact, PredictionPipelineResult, TelemetryRawV1 } from "./types";

type RuntimeFieldAdaptation = {
  supported: boolean;
  modelKey: string | null;
  modelVersion: string | null;
  requiredFeatureCount: number;
  presentRequiredFeatureCount: number;
  missingFeatureKeys: string[];
  canonicalInputs: string[];
  acceptedSensorKeys: string[];
  historicalWindowRequired: boolean;
  fields: {
    modelRequiredFeatureKey: string;
    canonicalFeatureKey: string;
    aggregate: string | null;
    window: string | null;
    runtimeSource: "current-telemetry-or-latest-history" | "historical-window";
    acceptedSensorKeys: string[];
    present: boolean;
    evidencePath: string[];
  }[];
};

function parseRequiredFeatureKey(featureKey: string): {
  canonicalKey: string;
  aggregate: string | null;
  window: string | null;
  runtimeSource: RuntimeFieldAdaptation["fields"][number]["runtimeSource"];
} {
  const match = /^(.+)_(last|delta|mean|min|max|sum)_(6h|24h|72h)$/u.exec(featureKey);
  if (!match) {
    return {
      canonicalKey: featureKey,
      aggregate: null,
      window: null,
      runtimeSource: "current-telemetry-or-latest-history"
    };
  }
  return {
    canonicalKey: match[1] ?? featureKey,
    aggregate: match[2] ?? null,
    window: match[3] ?? null,
    runtimeSource: "historical-window"
  };
}

function buildRuntimeFieldAdaptation(input: {
  artifact: ModelArtifact | null;
  features: FeatureVector;
}): RuntimeFieldAdaptation {
  const { artifact, features } = input;
  if (!artifact) {
    return {
      supported: false,
      modelKey: null,
      modelVersion: null,
      requiredFeatureCount: 0,
      presentRequiredFeatureCount: 0,
      missingFeatureKeys: [],
      canonicalInputs: [],
      acceptedSensorKeys: [],
      historicalWindowRequired: false,
      fields: []
    };
  }

  const present = new Set(features.presentFeatureKeys);
  const fields = artifact.requiredFeatureKeys.map((featureKey) => {
    const parsed = parseRequiredFeatureKey(featureKey);
    const definition = FEATURE_DEFINITIONS.find((entry) => entry.canonicalKey === parsed.canonicalKey);
    const evidencePath =
      parsed.runtimeSource === "historical-window" && parsed.window
        ? [
            "payload.featureSummary.presentFeatureKeys",
            `payload.windowSummary.coverage.${parsed.window}.${parsed.canonicalKey}`,
            "payload.missingFeatureKeys",
            "payload.matchTrace.candidateSet[].missingFeatureKeys"
          ]
        : [
            "payload.featureSummary.presentFeatureKeys",
            "payload.missingFeatureKeys",
            "payload.matchTrace.candidateSet[].missingFeatureKeys"
          ];
    return {
      modelRequiredFeatureKey: featureKey,
      canonicalFeatureKey: parsed.canonicalKey,
      aggregate: parsed.aggregate,
      window: parsed.window,
      runtimeSource: parsed.runtimeSource,
      acceptedSensorKeys: definition?.sourceMetricKeys ?? [],
      present: present.has(featureKey),
      evidencePath
    };
  });
  const missingFeatureKeys = fields
    .filter((field) => !field.present)
    .map((field) => field.modelRequiredFeatureKey);
  const canonicalInputs = Array.from(new Set(fields.map((field) => field.canonicalFeatureKey))).sort();
  const acceptedSensorKeys = Array.from(new Set(fields.flatMap((field) => field.acceptedSensorKeys))).sort();

  return {
    supported: missingFeatureKeys.length === 0,
    modelKey: artifact.modelKey,
    modelVersion: artifact.modelVersion,
    requiredFeatureCount: fields.length,
    presentRequiredFeatureCount: fields.length - missingFeatureKeys.length,
    missingFeatureKeys,
    canonicalInputs,
    acceptedSensorKeys,
    historicalWindowRequired: fields.some((field) => field.runtimeSource === "historical-window"),
    fields
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readArtifactOperationalRole(artifact: ModelArtifact): string | null {
  const metadata = asRecord(artifact.metadata);
  if (!metadata) return null;
  const directRole = readString(metadata.operationalRole);
  if (directRole) return directRole;
  const routing = asRecord(metadata.routing);
  const routingRole = readString(routing?.operationalRole ?? null);
  if (routingRole) return routingRole;
  const matcher = asRecord(metadata.matcher);
  return readString(matcher?.operationalRole ?? null);
}

function collectRoleArtifacts(input: {
  artifactRegistry: ArtifactRegistry;
  regionContext: Awaited<ReturnType<typeof resolveRegionContext>>;
  role: string;
  excludeModelKey: string | null;
}): ModelArtifact[] {
  const scopes = [
    { scopeType: "station" as const, scopeKey: input.regionContext.stationCode },
    { scopeType: "slope" as const, scopeKey: input.regionContext.slopeCode },
    { scopeType: "region" as const, scopeKey: input.regionContext.regionCode },
    { scopeType: "global" as const, scopeKey: null }
  ];
  const artifacts = scopes.flatMap((scope) =>
    input.artifactRegistry.getCandidates(scope.scopeType, scope.scopeKey)
  );
  const seen = new Set<string>();
  return artifacts.filter((artifact) => {
    if (artifact.modelKey === input.excludeModelKey) return false;
    if (readArtifactOperationalRole(artifact) !== input.role) return false;
    if (seen.has(artifact.modelKey)) return false;
    seen.add(artifact.modelKey);
    return true;
  });
}

function resolveForecastPointId(input: {
  features: FeatureVector;
  regionContext: Awaited<ReturnType<typeof resolveRegionContext>>;
}): string | null {
  const featurePointId =
    typeof input.features.featureSummary.pointId === "string"
      ? input.features.featureSummary.pointId
      : null;
  return featurePointId ?? input.regionContext.stationCode ?? input.regionContext.nodeCode;
}

function buildForecastInferencePayload(input: {
  artifact: ModelArtifact;
  features: FeatureVector;
  regionContext: Awaited<ReturnType<typeof resolveRegionContext>>;
}): Record<string, unknown> | null {
  if (input.artifact.artifactType !== "calibrated_prediction_regression_v1") {
    return null;
  }

  const pointId = resolveForecastPointId({
    features: input.features,
    regionContext: input.regionContext
  });
  const execution = runPredictionRegressionArtifact(input.artifact, {
    values: input.features.values,
    pointId,
    eventTs: input.features.receivedTs
  });
  const missingFeatureKeys = execution
    ? []
    : input.artifact.requiredFeatureKeys.filter((featureKey) => !input.features.presentFeatureKeys.includes(featureKey));

  return {
    operationalRole: readArtifactOperationalRole(input.artifact) ?? "forecast",
    modelKey: input.artifact.modelKey,
    modelVersion: input.artifact.modelVersion,
    artifactType: input.artifact.artifactType,
    labelKey: input.artifact.labelKey,
    horizonSpec: input.artifact.horizonSpec,
    targetUnit: input.artifact.targetUnit,
    predictedValue: execution?.predictedValue ?? null,
    predictedDisplacementMm: input.artifact.targetUnit === "mm" ? execution?.predictedValue ?? null : null,
    explain: execution?.explain ?? "missing required features for displacement forecast",
    fallbackReason: execution ? null : "missing-required-features",
    requiredFeaturesSatisfied: execution !== null,
    missingFeatureKeys,
    pointId,
    fieldAdaptation: buildRuntimeFieldAdaptation({
      artifact: input.artifact,
      features: input.features
    }),
    validationMetrics: input.artifact.validationMetrics ?? null
  };
}

function buildSecondaryInferencePayload(input: {
  artifact: ModelArtifact;
  features: FeatureVector;
  regionContext: Awaited<ReturnType<typeof resolveRegionContext>>;
}): Record<string, unknown> {
  const inference = runInference({
    artifact: input.artifact,
    features: input.features,
    regionContext: input.regionContext
  });
  return {
    operationalRole: readArtifactOperationalRole(input.artifact),
    modelKey: inference.modelKey,
    modelVersion: inference.modelVersion,
    riskScore: inference.riskScore,
    riskLevel: inference.riskLevel,
    explain: inference.explain,
    fallbackReason: inference.fallbackReason,
    requiredFeaturesSatisfied: inference.requiredFeaturesSatisfied,
    missingFeatureKeys: inference.missingFeatureKeys,
    calibrationThreshold: inference.riskCalibration.threshold,
    scoreOverThreshold: inference.riskCalibration.scoreOverThreshold,
    calibratedRiskLevel: inference.riskCalibration.calibratedRiskLevel,
    riskCalibration: inference.riskCalibration,
    fieldAdaptation: buildRuntimeFieldAdaptation({
      artifact: input.artifact,
      features: input.features
    }),
    stageOutputs: inference.stageOutputs,
    warningFactors: inference.warningFactors
  };
}

export async function predictFromTelemetry(input: {
  clickhouse: ClickHouseClient | null;
  telemetry: TelemetryRawV1;
  pg: Pool;
  config: AppConfig;
  artifactRegistry: ArtifactRegistry;
}): Promise<PredictionPipelineResult> {
  const regionContext = await resolveRegionContext(input.pg, input.telemetry.device_id);
  const historicalSource = await loadHistoricalFeatureSource({
    clickhouse: input.clickhouse,
    config: input.config,
    telemetry: input.telemetry
  });
  const features = buildFeatureVector({
    historicalSource,
    telemetry: input.telemetry,
    regionContext,
    horizonSeconds: input.config.predictHorizonSeconds
  });
  const matched = pickMatchedArtifact(input.artifactRegistry, regionContext, features);
  const inference = runInference({
    artifact: matched.artifact,
    features,
    regionContext
  });
  const fieldAdaptation = buildRuntimeFieldAdaptation({
    artifact: matched.artifact,
    features
  });
  const confirmationArtifacts = collectRoleArtifacts({
    artifactRegistry: input.artifactRegistry,
    regionContext,
    role: "confirmation",
    excludeModelKey: matched.artifact?.modelKey ?? null
  });
  const confirmationInference = confirmationArtifacts[0]
    ? buildSecondaryInferencePayload({
        artifact: confirmationArtifacts[0],
        features,
        regionContext
      })
    : null;
  const forecastArtifacts = collectRoleArtifacts({
    artifactRegistry: input.artifactRegistry,
    regionContext,
    role: "forecast",
    excludeModelKey: matched.artifact?.modelKey ?? null
  });
  const forecastInference = forecastArtifacts[0]
    ? buildForecastInferencePayload({
        artifact: forecastArtifacts[0],
        features,
        regionContext
      })
    : null;
  const secondaryInferences = [confirmationInference, forecastInference].filter(
    (entry): entry is Record<string, unknown> => entry !== null
  );

  return {
    stationId: regionContext.stationId,
    modelKey: inference.modelKey,
    modelVersion: inference.modelVersion,
    riskScore: inference.riskScore,
    riskLevel: inference.riskLevel,
    explain: inference.explain,
    payloadExt: {
      windowSummary: features.windowSummary,
      featureSummary: features.featureSummary,
      matchedModelKey: matched.trace.matchedModelKey,
      matchedModelVersion: matched.trace.matchedModelVersion,
      matchedScopeType: matched.trace.matchedScopeType,
      matchedScopeKey: matched.trace.matchedScopeKey,
      matchedArtifactType: matched.artifact?.artifactType ?? null,
      matchScore: matched.trace.matchScore,
      candidateCount: matched.trace.candidateCount,
      requiredSensorsSatisfied: inference.requiredFeaturesSatisfied,
      requiredFeaturesSatisfied: inference.requiredFeaturesSatisfied,
      missingFeatureKeys: inference.missingFeatureKeys,
      fieldAdaptation,
      confirmationInference,
      forecastInference,
      secondaryInferences,
      matchTrace: {
        rerankMode: matched.trace.rerankMode,
        selectedReason: matched.trace.selectedReason,
        replayScore: matched.trace.replayScore,
        candidateSet: matched.trace.candidateSet
      },
      calibrationThreshold: inference.riskCalibration.threshold,
      scoreOverThreshold: inference.riskCalibration.scoreOverThreshold,
      calibratedRiskLevel: inference.riskCalibration.calibratedRiskLevel,
      riskCalibration: inference.riskCalibration,
      fallbackReason: inference.fallbackReason,
      stageOutputs: inference.stageOutputs,
      warningFactors: inference.warningFactors,
      traceRefs: {
        historySource: historicalSource.historySource,
        historyMode: historicalSource.sourceMode,
        historyError: historicalSource.historyError,
        regionCode: regionContext.regionCode,
        slopeCode: regionContext.slopeCode,
        stationCode: regionContext.stationCode,
        nodeCode: regionContext.nodeCode,
        gatewayCode: regionContext.gatewayCode
      }
    }
  };
}
