import type { ArtifactRegistry } from "./artifacts/artifact-registry";
import type {
  FeatureVector,
  MatchCandidateTrace,
  MatchTrace,
  MatchScopeType,
  ModelArtifact,
  RegionContext
} from "./types";

type MatchResult = {
  artifact: ModelArtifact | null;
  trace: MatchTrace;
};

type ScopeCandidateRequest = {
  scopeType: MatchScopeType;
  scopeKey: string | null;
  baseScopeScore: number;
};

type JsonRecord = Record<string, unknown>;

type LandCoverDistributionEntry = {
  className: string;
  coverageRatio: number;
};

type RegionLandCoverPrior = {
  dominantClass: string | null;
  distribution: LandCoverDistributionEntry[];
  sourcePath: string;
};

type ArtifactLandCoverAffinity = {
  preferredClasses: string[];
  classWeights: Record<string, number>;
  sourcePath: string;
};

type StaticPriorEvaluation = {
  score: number | null;
  adjustment: number;
  reason: string | null;
};

const MAX_TRACE_CANDIDATES = 8;

function createMissTrace(candidateSet: MatchCandidateTrace[], rerankMode: MatchTrace["rerankMode"]): MatchTrace {
  return {
    matchedModelKey: null,
    matchedModelVersion: null,
    matchedScopeType: null,
    matchedScopeKey: null,
    matchScore: 0,
    candidateCount: candidateSet.length,
    requiredSensorsSatisfied: false,
    rerankMode,
    selectedReason: null,
    replayScore: null,
    candidateSet
  };
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function asRecord(value: unknown): JsonRecord | null {
  return typeof value === "object" && value !== null ? (value as JsonRecord) : null;
}

function readNestedValue(record: JsonRecord, path: string[]): unknown {
  let current: unknown = record;
  for (const segment of path) {
    if (typeof current !== "object" || current === null) return null;
    current = (current as JsonRecord)[segment];
  }
  return current;
}

function readNestedRecord(record: JsonRecord, path: string[]): JsonRecord | null {
  const value = readNestedValue(record, path);
  return asRecord(value);
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .map((entry) => readString(entry))
        .filter((entry): entry is string => entry !== null)
    : [];
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
  const matcherRole = readString(matcher?.operationalRole ?? null);
  return matcherRole;
}

function isConfirmationCandidate(candidate: Pick<MatchCandidateTrace, "operationalRole">): boolean {
  return candidate.operationalRole === "confirmation" || candidate.operationalRole === "confirmation-challenger";
}

function isForecastArtifact(artifact: ModelArtifact): boolean {
  return artifact.artifactType === "calibrated_prediction_regression_v1" || readArtifactOperationalRole(artifact) === "forecast";
}

function normalizeClassToken(value: string | null): string | null {
  if (!value) return null;
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/gu, " ");
  return normalized.length > 0 ? normalized : null;
}

function titleCaseClassToken(value: string): string {
  return value.replace(/\b[a-z]/gu, (character) => character.toUpperCase());
}

function buildScopeRequests(regionContext: RegionContext): ScopeCandidateRequest[] {
  return [
    { scopeType: "station", scopeKey: regionContext.stationCode, baseScopeScore: 1 },
    { scopeType: "slope", scopeKey: regionContext.slopeCode, baseScopeScore: 0.9 },
    { scopeType: "region", scopeKey: regionContext.regionCode, baseScopeScore: 0.8 },
    { scopeType: "global", scopeKey: null, baseScopeScore: 0.5 }
  ];
}

function readNestedNumber(record: Record<string, unknown>, path: string[]): number | null {
  let current: unknown = record;
  for (const segment of path) {
    if (typeof current !== "object" || current === null) return null;
    current = (current as Record<string, unknown>)[segment];
  }
  return typeof current === "number" && Number.isFinite(current) ? current : null;
}

function readReplayScore(artifact: ModelArtifact): number | null {
  const metadata = artifact.metadata;
  if (typeof metadata !== "object") return null;

  const record = metadata as Record<string, unknown>;
  const directCandidates = [
    "replayScore",
    "rerankScore",
    "leaderboardScore",
    "validationScore"
  ];
  for (const key of directCandidates) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return clamp01(value);
    }
  }

  const nestedCandidates = [
    ["replay", "score"],
    ["replay", "primaryScore"],
    ["replaySummary", "score"],
    ["replaySummary", "primaryScore"],
    ["rerank", "score"],
    ["leaderboard", "score"]
  ];
  for (const path of nestedCandidates) {
    const value = readNestedNumber(record, path);
    if (value !== null) {
      return clamp01(value);
    }
  }

  return null;
}

function readFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function resolveRegionLandCoverPrior(regionContext: RegionContext): RegionLandCoverPrior | null {
  const sources: { label: string; record: JsonRecord }[] = [
    { label: "stationMetadata", record: regionContext.stationMetadata },
    { label: "metadata", record: regionContext.metadata }
  ];
  const candidatePaths = [
    ["staticFactors", "landCover"],
    ["properties", "staticFactors", "landCover"],
    ["regionProfile", "properties", "staticFactors", "landCover"],
    ["landCover"],
    ["land_cover"]
  ];

  for (const source of sources) {
    for (const candidatePath of candidatePaths) {
      const priorRecord = readNestedRecord(source.record, candidatePath);
      if (!priorRecord) continue;

      const dominantRecord = asRecord(priorRecord.dominantClass);
      const dominantClass =
        normalizeClassToken(readString(dominantRecord?.className ?? null)) ??
        normalizeClassToken(readString(priorRecord.dominantClassName ?? null)) ??
        normalizeClassToken(readString(priorRecord.dominantClass ?? null));

      const distributionSource = Array.isArray(priorRecord.classDistribution)
        ? priorRecord.classDistribution
        : Array.isArray(priorRecord.distribution)
          ? priorRecord.distribution
          : [];
      const distribution = distributionSource
        .map((entry) => {
          const record = asRecord(entry);
          const className = normalizeClassToken(readString(record?.className ?? null));
          const coverageRatio = readFiniteNumber(record?.coverageRatio ?? null);
          if (!className || coverageRatio === null) return null;
          return {
            className,
            coverageRatio: clamp01(coverageRatio)
          };
        })
        .filter((entry): entry is LandCoverDistributionEntry => entry !== null)
        .sort((left, right) => right.coverageRatio - left.coverageRatio);

      if (!dominantClass && distribution.length === 0) {
        continue;
      }

      return {
        dominantClass: dominantClass ?? distribution[0]?.className ?? null,
        distribution,
        sourcePath: `${source.label}.${candidatePath.join(".")}`
      };
    }
  }

  return null;
}

function resolveArtifactLandCoverAffinity(artifact: ModelArtifact): ArtifactLandCoverAffinity | null {
  const metadata = asRecord(artifact.metadata);
  if (!metadata) return null;

  const candidatePaths = [
    ["landCoverAffinity"],
    ["staticPrior", "landCoverAffinity"],
    ["routing", "landCoverAffinity"],
    ["matcher", "landCoverAffinity"]
  ];

  for (const candidatePath of candidatePaths) {
    const affinityRecord = readNestedRecord(metadata, candidatePath);
    if (!affinityRecord) continue;

    const directDominant = normalizeClassToken(readString(affinityRecord.dominantClass ?? null));
    const dominantClasses = readStringArray(affinityRecord.dominantClasses).map(normalizeClassToken);
    const preferredClasses = readStringArray(affinityRecord.preferredClasses).map(normalizeClassToken);
    const classWeightsRecord = asRecord(affinityRecord.classWeights);
    const classWeights: Record<string, number> = {};
    for (const [key, value] of Object.entries(classWeightsRecord ?? {})) {
      const normalizedKey = normalizeClassToken(key);
      const numericValue = readFiniteNumber(value);
      if (!normalizedKey || numericValue === null || numericValue <= 0) continue;
      classWeights[normalizedKey] = numericValue;
    }

    const resolvedClasses = new Set<string>();
    if (directDominant) resolvedClasses.add(directDominant);
    for (const value of dominantClasses) {
      if (value) resolvedClasses.add(value);
    }
    for (const value of preferredClasses) {
      if (value) resolvedClasses.add(value);
    }
    for (const key of Object.keys(classWeights)) {
      resolvedClasses.add(key);
    }

    if (resolvedClasses.size === 0) {
      continue;
    }

    return {
      preferredClasses: Array.from(resolvedClasses),
      classWeights,
      sourcePath: `metadata.${candidatePath.join(".")}`
    };
  }

  return null;
}

function evaluateStaticLandCoverPrior(
  artifact: ModelArtifact,
  regionContext: RegionContext
): StaticPriorEvaluation {
  const regionPrior = resolveRegionLandCoverPrior(regionContext);
  const artifactAffinity = resolveArtifactLandCoverAffinity(artifact);

  if (!regionPrior || !artifactAffinity) {
    return { score: null, adjustment: 0, reason: null };
  }

  const regionDominant = regionPrior.dominantClass;
  const preferredClasses = new Set(artifactAffinity.preferredClasses);
  const dominantMatch = regionDominant ? preferredClasses.has(regionDominant) : false;

  let weightedOverlap = 0;
  let totalWeight = 0;
  for (const entry of regionPrior.distribution) {
    const weight = artifactAffinity.classWeights[entry.className] ?? 0;
    if (weight <= 0) continue;
    weightedOverlap += weight * entry.coverageRatio;
    totalWeight += weight;
  }
  const overlapScore = totalWeight > 0 ? clamp01(weightedOverlap / totalWeight) : 0;

  const preferredCoverage = regionPrior.distribution.reduce((sum, entry) => {
    return preferredClasses.has(entry.className) ? sum + entry.coverageRatio : sum;
  }, 0);
  const preferredCoverageScore = clamp01(preferredCoverage);
  const score = clamp01(
    Math.max(dominantMatch ? 1 : 0, overlapScore, preferredCoverageScore)
  );

  let adjustment = 0;
  if (dominantMatch) {
    adjustment = 0.05;
  } else if (score >= 0.6) {
    adjustment = 0.03;
  } else if (regionDominant && preferredClasses.size > 0 && score <= 0.1) {
    adjustment = -0.03;
  }

  const reasonParts = [
    `region=${regionPrior.sourcePath}`,
    `artifact=${artifactAffinity.sourcePath}`,
    regionDominant ? `dominant=${titleCaseClassToken(regionDominant)}` : null,
    preferredClasses.size > 0
      ? `preferred=${Array.from(preferredClasses).map(titleCaseClassToken).join("|")}`
      : null,
    `score=${score.toFixed(3)}`,
    `adjustment=${adjustment.toFixed(3)}`
  ].filter((entry): entry is string => entry !== null);

  return {
    score,
    adjustment,
    reason: reasonParts.join(" ")
  };
}

function countPresentRequiredFeatures(
  artifact: ModelArtifact,
  features: FeatureVector
): { presentRequiredFeatureCount: number; missingFeatureKeys: string[] } {
  const present = new Set(features.presentFeatureKeys);
  const missingFeatureKeys = artifact.requiredFeatureKeys.filter((featureKey) => !present.has(featureKey));
  return {
    presentRequiredFeatureCount: artifact.requiredFeatureKeys.length - missingFeatureKeys.length,
    missingFeatureKeys
  };
}

function computeHeuristicScore(input: {
  artifact: ModelArtifact;
  baseScopeScore: number;
  featureCoverage: number;
}): number {
  const sampleVolumeScore = clamp01(Math.log10(input.artifact.trainingSummary.sampleCount + 1) / 3);
  const datasetBreadthScore = clamp01(input.artifact.trainingDatasetKeys.length / 3);
  const artifactTypeBonus = input.artifact.artifactType === "two_stage_linear_risk_v1" ? 0.02 : 0;

  return clamp01(
    input.baseScopeScore * 0.6 +
      input.featureCoverage * 0.25 +
      sampleVolumeScore * 0.1 +
      datasetBreadthScore * 0.05 +
      artifactTypeBonus
  );
}

function buildCandidateTrace(input: {
  artifact: ModelArtifact;
  scope: ScopeCandidateRequest;
  features: FeatureVector;
  regionContext: RegionContext;
}): MatchCandidateTrace {
  const { artifact, scope, features, regionContext } = input;
  const readiness = countPresentRequiredFeatures(artifact, features);
  const requiredFeatureCount = artifact.requiredFeatureKeys.length;
  const featureCoverage =
    requiredFeatureCount <= 0
      ? 1
      : clamp01(readiness.presentRequiredFeatureCount / requiredFeatureCount);
  const replayScore = readReplayScore(artifact);
  const staticPrior = evaluateStaticLandCoverPrior(artifact, regionContext);
  const heuristicScore = computeHeuristicScore({
    artifact,
    baseScopeScore: scope.baseScopeScore,
    featureCoverage
  });
  const rerankScore = clamp01(heuristicScore + staticPrior.adjustment);
  const totalScore =
    replayScore !== null
      ? clamp01(rerankScore * 0.7 + replayScore * 0.3)
      : rerankScore;

  return {
    modelKey: artifact.modelKey,
    modelVersion: artifact.modelVersion,
    operationalRole: readArtifactOperationalRole(artifact),
    artifactType: artifact.artifactType,
    scopeType: artifact.scopeType,
    scopeKey: artifact.scopeKey,
    baseScopeScore: scope.baseScopeScore,
    featureCoverage,
    trainingSampleCount: artifact.trainingSummary.sampleCount,
    trainingDatasetCount: artifact.trainingDatasetKeys.length,
    replayScore,
    staticPriorScore: staticPrior.score,
    staticPriorAdjustment: staticPrior.adjustment,
    staticPriorReason: staticPrior.reason,
    rerankScore,
    totalScore,
    requiredFeatureCount,
    presentRequiredFeatureCount: readiness.presentRequiredFeatureCount,
    missingFeatureKeys: readiness.missingFeatureKeys,
    selected: false
  };
}

function compareCandidates(left: MatchCandidateTrace, right: MatchCandidateTrace): number {
  const leftConfirmation = isConfirmationCandidate(left);
  const rightConfirmation = isConfirmationCandidate(right);
  if (leftConfirmation !== rightConfirmation) return leftConfirmation ? 1 : -1;
  if (right.totalScore !== left.totalScore) return right.totalScore - left.totalScore;
  if (right.featureCoverage !== left.featureCoverage) return right.featureCoverage - left.featureCoverage;
  if (right.trainingSampleCount !== left.trainingSampleCount) {
    return right.trainingSampleCount - left.trainingSampleCount;
  }
  return left.modelKey.localeCompare(right.modelKey);
}

function deriveRerankMode(candidateSet: MatchCandidateTrace[]): MatchTrace["rerankMode"] {
  const hasReplay = candidateSet.some((candidate) => candidate.replayScore !== null);
  const hasStaticPrior = candidateSet.some((candidate) => candidate.staticPriorScore !== null);

  if (hasReplay && hasStaticPrior) return "metadata-replay+static-prior";
  if (hasReplay) return "metadata-replay";
  if (hasStaticPrior) return "static-prior";
  return "base-only";
}

export function pickMatchedArtifact(
  registry: ArtifactRegistry,
  regionContext: RegionContext,
  features: FeatureVector
): MatchResult {
  const scopeRequests = buildScopeRequests(regionContext);
  const candidateSet = scopeRequests.flatMap((scope) =>
    registry
      .getCandidates(scope.scopeType, scope.scopeKey)
      .filter((artifact) => !isForecastArtifact(artifact))
      .map((artifact) =>
        buildCandidateTrace({ artifact, scope, features, regionContext })
      )
  );

  const rerankMode = deriveRerankMode(candidateSet);

  if (candidateSet.length === 0) {
    return { artifact: null, trace: createMissTrace([], rerankMode) };
  }

  const sortedCandidates = [...candidateSet].sort(compareCandidates);
  const selected = sortedCandidates[0] ?? null;

  const candidateTrace = sortedCandidates.slice(0, MAX_TRACE_CANDIDATES).map((candidate) => ({
    ...candidate,
    selected: candidate.modelKey === selected?.modelKey
  }));

  if (!selected) {
    return { artifact: null, trace: createMissTrace(candidateTrace, rerankMode) };
  }

  const selectedArtifact =
    scopeRequests
      .flatMap((scope) => registry.getCandidates(scope.scopeType, scope.scopeKey))
      .find((artifact) => artifact.modelKey === selected.modelKey) ?? null;

  const selectedReason =
    rerankMode === "metadata-replay" && selected.replayScore !== null
      ? `selected by totalScore with metadata replay score ${String(selected.replayScore)}`
      : rerankMode === "metadata-replay+static-prior" &&
          selected.replayScore !== null &&
          selected.staticPriorScore !== null
        ? `selected by totalScore with metadata replay score ${String(selected.replayScore)} and static prior score ${selected.staticPriorScore.toFixed(3)}`
        : rerankMode === "static-prior" && selected.staticPriorScore !== null
          ? `selected by scope priority, feature coverage, training strength, and static prior score ${selected.staticPriorScore.toFixed(3)}`
          : "selected by scope priority, feature coverage, and training strength";

  return {
    artifact: selectedArtifact,
    trace: {
      matchedModelKey: selected.modelKey,
      matchedModelVersion: selected.modelVersion,
      matchedScopeType: selected.scopeType,
      matchedScopeKey: selected.scopeKey,
      matchScore: selected.totalScore,
      candidateCount: candidateSet.length,
      requiredSensorsSatisfied: selected.missingFeatureKeys.length === 0,
      rerankMode,
      selectedReason,
      replayScore: selected.replayScore,
      candidateSet: candidateTrace
    }
  };
}
