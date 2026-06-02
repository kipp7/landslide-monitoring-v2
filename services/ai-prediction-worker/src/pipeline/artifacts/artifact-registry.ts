import { access, readFile } from "node:fs/promises";
import path from "node:path";
import type {
  LinearRiskModelArtifactV1,
  LinearRiskModelStageV1,
  LinearRiskTrainingSummary,
  PredictionRegressionModelArtifactV1,
  RegionalModelArtifactRegistryFile,
  ScopeType
} from "@lsmv2/regional-model-library";
import { getArtifactRequiredFeatureKeys } from "@lsmv2/regional-model-library";
import type { MatchScopeType, ModelArtifact } from "../types";

export type ArtifactRegistry = {
  list(): ModelArtifact[];
  getCandidates(scopeType: MatchScopeType, scopeKey: string | null): ModelArtifact[];
};

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    : [];
}

function readArtifactScopeAliases(artifact: ModelArtifact): string[] {
  const metadata =
    typeof artifact.metadata === "object" && artifact.metadata !== null
      ? (artifact.metadata as Record<string, unknown>)
      : null;
  const matcher =
    metadata && typeof metadata.matcher === "object" && metadata.matcher !== null
      ? (metadata.matcher as Record<string, unknown>)
      : null;
  const scopeAliases =
    matcher && typeof matcher.scopeAliases === "object" && matcher.scopeAliases !== null
      ? (matcher.scopeAliases as Record<string, unknown>)
      : null;

  if (!scopeAliases) {
    return [];
  }

  switch (artifact.scopeType) {
    case "station":
      return readStringArray(scopeAliases.station);
    case "slope":
      return readStringArray(scopeAliases.slope);
    case "region":
      return readStringArray(scopeAliases.region);
    case "global":
      return [];
    default:
      return [];
  }
}

function normalizeStage(
  value: unknown,
  fallbackStageKey: LinearRiskModelStageV1["stageKey"],
  fallbackOutputKey: string,
  fallbackLabelKey: string
): LinearRiskModelStageV1 | null {
  if (typeof value !== "object" || value === null) return null;

  const record = value as Record<string, unknown>;
  const stageKey = record.stageKey;
  const outputKey = readString(record.outputKey) ?? fallbackOutputKey;
  const labelKey = readString(record.labelKey) ?? fallbackLabelKey;
  const requiredFeatureKeys = readStringArray(record.requiredFeatureKeys);
  const featureNormalization =
    typeof record.featureNormalization === "object" && record.featureNormalization !== null
      ? (record.featureNormalization as LinearRiskModelStageV1["featureNormalization"])
      : {};
  const featureCenters =
    typeof record.featureCenters === "object" && record.featureCenters !== null
      ? (record.featureCenters as LinearRiskModelStageV1["featureCenters"])
      : {};
  const bias = typeof record.bias === "number" ? record.bias : 0;
  const weights =
    typeof record.weights === "object" && record.weights !== null
      ? (record.weights as Record<string, number>)
      : {};
  const trainingSummary =
    typeof record.trainingSummary === "object" && record.trainingSummary !== null
      ? (record.trainingSummary as LinearRiskModelStageV1["trainingSummary"])
      : { sampleCount: 0, positiveCount: 0, negativeCount: 0 };
  const metadata =
    typeof record.metadata === "object" && record.metadata !== null
      ? (record.metadata as Record<string, unknown>)
      : null;

  if (!isStageKey(stageKey)) {
    return null;
  }

  return {
    stageKey,
    outputKey,
    labelKey,
    requiredFeatureKeys,
    featureNormalization,
    featureCenters,
    bias,
    weights,
    trainingSummary,
    ...(metadata ? { metadata } : {})
  };
}

function normalizeArtifact(candidate: unknown): ModelArtifact | null {
  if (typeof candidate !== "object" || candidate === null) return null;

  const record = candidate as Record<string, unknown>;
  const modelKey = readString(record.modelKey) ?? "";
  const scopeType = record.scopeType;
  const artifactType = record.artifactType;
  const trainingDatasetKeys = readStringArray(record.trainingDatasetKeys);
  const metadata =
    typeof record.metadata === "object" && record.metadata !== null
      ? (record.metadata as Record<string, unknown>)
      : null;

  if (modelKey.length === 0 || !isScopeType(scopeType) || !isArtifactType(artifactType)) {
    return null;
  }

  if (artifactType === "calibrated_prediction_regression_v1") {
    const model =
      typeof record.model === "object" && record.model !== null
        ? (record.model as PredictionRegressionModelArtifactV1["model"])
        : null;
    if (!model) return null;

    const modelRecord = record.model as Record<string, unknown>;
    const modelFeatureKeys = readStringArray(modelRecord.featureKeys);
    const requiredFeatureKeys = readStringArray(record.requiredFeatureKeys);
    const trainingSummaryRecord =
      typeof record.trainingSummary === "object" && record.trainingSummary !== null
        ? (record.trainingSummary as Record<string, unknown>)
        : {};
    const sampleCount =
      typeof trainingSummaryRecord.sampleCount === "number" ? trainingSummaryRecord.sampleCount : 0;
    const validationSampleCount =
      typeof trainingSummaryRecord.validationSampleCount === "number"
        ? trainingSummaryRecord.validationSampleCount
        : null;
    const fallbackCount =
      typeof trainingSummaryRecord.fallbackCount === "number" ? trainingSummaryRecord.fallbackCount : null;
    const validationMetrics =
      typeof record.validationMetrics === "object" && record.validationMetrics !== null
        ? (record.validationMetrics as Record<string, unknown>)
        : null;

    return {
      schemaVersion: "prediction-regression-model.v1",
      modelKey,
      modelVersion: readString(record.modelVersion),
      scopeType,
      scopeKey: readString(record.scopeKey),
      artifactType,
      featureSchemaVersion: readString(record.featureSchemaVersion) ?? "runtime-feature-vector.v1",
      labelSchemaVersion: readString(record.labelSchemaVersion) ?? "displacement-regression-label.v1",
      profileVersion: readString(record.profileVersion) ?? "phase1-profile.v1",
      trainingDatasetKeys,
      createdAt: readString(record.createdAt) ?? new Date(0).toISOString(),
      entrypoint: "prediction-regression-v1",
      labelKey: readString(record.labelKey) ?? "displacementLabel",
      requiredFeatureKeys: requiredFeatureKeys.length > 0 ? requiredFeatureKeys : modelFeatureKeys,
      targetUnit: readString(record.targetUnit) ?? "mm",
      horizonSpec: readString(record.horizonSpec) ?? "24h",
      trainingSummary: {
        sampleCount,
        ...(validationSampleCount !== null ? { validationSampleCount } : {}),
        ...(fallbackCount !== null ? { fallbackCount } : {})
      },
      model,
      ...(validationMetrics ? { validationMetrics } : {}),
      ...(metadata ? { metadata } : {})
    };
  }

  const commonFields = {
    schemaVersion: "linear-risk-model.v1" as const,
    modelKey,
    modelVersion: readString(record.modelVersion),
    scopeType,
    scopeKey: readString(record.scopeKey),
    featureSchemaVersion: readString(record.featureSchemaVersion) ?? "runtime-feature-vector.v1",
    labelSchemaVersion: readString(record.labelSchemaVersion) ?? "warning-hit-label.v1",
    profileVersion: readString(record.profileVersion) ?? "phase1-profile.v1",
    trainingDatasetKeys,
    createdAt: readString(record.createdAt) ?? new Date(0).toISOString(),
    entrypoint: "linear-risk-v1" as const,
    labelKey: readString(record.labelKey) ?? "warningHitLabel",
    ...(metadata ? { metadata } : {})
  };

  if (artifactType === "linear_risk_v1") {
    const requiredFeatureKeys = readStringArray(record.requiredFeatureKeys);
    const featureNormalization =
      typeof record.featureNormalization === "object" && record.featureNormalization !== null
        ? (record.featureNormalization as LinearRiskModelArtifactV1["featureNormalization"])
        : {};
    const featureCenters =
      typeof record.featureCenters === "object" && record.featureCenters !== null
        ? (record.featureCenters as Record<string, number>)
        : {};
    const trainingSummary =
      typeof record.trainingSummary === "object" && record.trainingSummary !== null
        ? (record.trainingSummary as LinearRiskTrainingSummary)
        : { sampleCount: 0, positiveCount: 0, negativeCount: 0 };
    const bias =
      typeof record.bias === "number"
        ? record.bias
        : typeof record.intercept === "number"
          ? record.intercept
          : 0;
    const weights =
      typeof record.weights === "object" && record.weights !== null
        ? (record.weights as Record<string, number>)
        : {};

    return {
      ...commonFields,
      artifactType,
      requiredFeatureKeys,
      featureNormalization,
      featureCenters,
      bias,
      weights,
      trainingSummary
    };
  }

  const stage1 = normalizeStage(
    record.stage1,
    "stage1_displacement",
    "stage1DisplacementScore",
    commonFields.labelKey
  );
  const stage2 = normalizeStage(
    record.stage2,
    "stage2_warning",
    "stage2WarningScore",
    commonFields.labelKey
  );
  if (!stage1 || !stage2) {
    return null;
  }

  const trainingSummary =
    typeof record.trainingSummary === "object" && record.trainingSummary !== null
      ? (record.trainingSummary as LinearRiskTrainingSummary)
      : stage2.trainingSummary;

  const artifact: ModelArtifact = {
    ...commonFields,
    artifactType,
    requiredFeatureKeys: [],
    trainingSummary,
    stage1,
    stage2
  };

  return {
    ...artifact,
    requiredFeatureKeys: getArtifactRequiredFeatureKeys(artifact)
  };
}

async function expandArtifactReference(candidate: unknown, rootDir: string): Promise<unknown> {
  if (typeof candidate !== "object" || candidate === null) return candidate;
  const record = candidate as Record<string, unknown>;
  const artifactUri = readString(record.artifactUri);
  if (!artifactUri) return candidate;

  const artifactPath = path.isAbsolute(artifactUri) ? artifactUri : path.resolve(rootDir, artifactUri);
  const raw = await readFile(artifactPath, "utf-8");
  const artifact = JSON.parse(raw) as Record<string, unknown>;
  return {
    ...artifact,
    registryRef: {
      artifactUri,
      resolvedPath: artifactPath
    }
  };
}

export async function loadArtifactRegistry(rootDir: string): Promise<ArtifactRegistry> {
  const registryPath = path.join(rootDir, "registry.json");
  try {
    await access(registryPath);
  } catch {
    return createArtifactRegistry([]);
  }

  const raw = await readFile(registryPath, "utf-8");
  const parsed = JSON.parse(raw) as Partial<RegionalModelArtifactRegistryFile>;
  const artifacts: ModelArtifact[] = [];
  if (Array.isArray(parsed.artifacts)) {
    for (const candidate of parsed.artifacts) {
      const expanded = await expandArtifactReference(candidate, rootDir);
      const normalized = normalizeArtifact(expanded);
      if (normalized) {
        artifacts.push(normalized);
      }
    }
  }

  return createArtifactRegistry(artifacts);
}

function createArtifactRegistry(artifacts: ModelArtifact[]): ArtifactRegistry {
  const normalized = artifacts.map((artifact) => {
    const normalizedScopeKey = artifact.scopeKey?.toUpperCase() ?? null;
    const normalizedScopeKeys = new Set<string>();
    if (normalizedScopeKey) {
      normalizedScopeKeys.add(normalizedScopeKey);
    }
    for (const alias of readArtifactScopeAliases(artifact)) {
      const normalizedAlias = alias.toUpperCase();
      if (normalizedAlias.length > 0) {
        normalizedScopeKeys.add(normalizedAlias);
      }
    }

    return {
      artifact: {
        ...artifact,
        scopeKey: normalizedScopeKey,
        requiredFeatureKeys: artifact.requiredFeatureKeys.map((featureKey) => featureKey.trim())
      },
      normalizedScopeKeys,
    };
  });

  return {
    list(): ModelArtifact[] {
      return normalized.map((entry) => entry.artifact);
    },
    getCandidates(scopeType: MatchScopeType, scopeKey: string | null): ModelArtifact[] {
      const normalizedScopeKey = scopeKey?.toUpperCase() ?? null;
      return normalized
        .filter((entry) => {
        if (entry.artifact.scopeType !== scopeType) return false;
        if (scopeType === "global") return true;
        return normalizedScopeKey !== null && entry.normalizedScopeKeys.has(normalizedScopeKey);
      })
        .map((entry) => entry.artifact);
    }
  };
}

function isArtifactType(value: unknown): value is ModelArtifact["artifactType"] {
  return (
    value === "linear_risk_v1" ||
    value === "two_stage_linear_risk_v1" ||
    value === "calibrated_prediction_regression_v1"
  );
}

function isScopeType(value: unknown): value is ScopeType {
  return value === "station" || value === "slope" || value === "region" || value === "global";
}

function isStageKey(value: unknown): value is LinearRiskModelStageV1["stageKey"] {
  return value === "stage1_displacement" || value === "stage2_warning";
}
