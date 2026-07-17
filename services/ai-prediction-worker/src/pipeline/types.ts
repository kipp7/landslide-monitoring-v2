import type {
  RegionalModelArtifact,
  ScopeType
} from "@lsmv2/regional-model-library";

export type TelemetryRawV1 = {
  schema_version: 1;
  received_ts: string;
  device_id: string;
  seq?: number;
  metrics: Record<string, unknown>;
  meta?: Record<string, unknown>;
};

export type MatchScopeType = ScopeType;

export type RegionContext = {
  deviceId: string;
  stationId: string | null;
  stationCode: string | null;
  slopeCode: string | null;
  regionCode: string | null;
  nodeCode: string | null;
  gatewayCode: string | null;
  installLabel: string | null;
  identityClass: string | null;
  metadata: Record<string, unknown>;
  stationMetadata: Record<string, unknown>;
};

export type FeatureVector = {
  horizonSeconds: number;
  receivedTs: string;
  values: Record<string, number>;
  presentFeatureKeys: string[];
  availableMetrics: string[];
  windowSummary: Record<string, unknown>;
  featureSummary: Record<string, unknown>;
};

export type ModelArtifact = RegionalModelArtifact;

export type MatchCandidateTrace = {
  modelKey: string;
  modelVersion: string | null;
  operationalRole: string | null;
  artifactType: ModelArtifact["artifactType"];
  scopeType: MatchScopeType;
  scopeKey: string | null;
  baseScopeScore: number;
  featureCoverage: number;
  trainingSampleCount: number;
  trainingDatasetCount: number;
  replayScore: number | null;
  staticPriorScore: number | null;
  staticPriorAdjustment: number;
  staticPriorReason: string | null;
  rerankScore: number;
  totalScore: number;
  requiredFeatureCount: number;
  presentRequiredFeatureCount: number;
  missingFeatureKeys: string[];
  selected: boolean;
};

export type MatchTrace = {
  matchedModelKey: string | null;
  matchedModelVersion: string | null;
  matchedScopeType: MatchScopeType | null;
  matchedScopeKey: string | null;
  matchScore: number;
  candidateCount: number;
  requiredSensorsSatisfied: boolean;
  rerankMode: "base-only" | "static-prior" | "metadata-replay" | "metadata-replay+static-prior";
  selectedReason: string | null;
  replayScore: number | null;
  candidateSet: MatchCandidateTrace[];
};

export type PredictionPipelineResult = {
  stationId: string | null;
  modelKey: string;
  modelVersion: string | null;
  riskScore: number;
  riskLevel: "low" | "medium" | "high";
  explain: string;
  payloadExt: Record<string, unknown>;
};
