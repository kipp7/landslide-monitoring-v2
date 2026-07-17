export type ScopeType = "station" | "slope" | "region" | "global";

export type TimePrecision = "second" | "minute" | "hour" | "day" | "unknown";

export type JsonObject = Record<string, unknown>;

export type SourceFieldMap = Record<string, string>;

export const INTERNAL_RAW_FAMILY_REFS_KEY = "__lsmv2_family_refs";

export type QualityFlagSeverity = "info" | "warning" | "error";

export type QualityFlag = {
  code: string;
  severity: QualityFlagSeverity;
  message: string;
  field?: string;
};

export type RawFamilyRole = "base" | "overlay" | "metadata" | "deferred" | "passthrough";

export type RawFamilyReference = {
  familyKey: string;
  role?: RawFamilyRole;
  sourcePath?: string;
  sourceRecordKey?: string;
  joinKey?: string;
  matchedBy?: string;
};

export type RawReference = {
  datasetKey: string;
  sourcePath?: string;
  sourceRecordKey?: string;
  timePrecision?: TimePrecision;
  familyRefs?: RawFamilyReference[];
  originalFields?: JsonObject;
};

export type CanonicalBusinessIdentity = {
  scopeType: ScopeType;
  scopeKey: string;
  regionCode?: string;
  slopeCode?: string;
  stationCode?: string;
  nodeCode?: string;
  gatewayCode?: string;
};

export type RegionalDatasetPack = {
  packKey: string;
  displayName: string;
  regionCode: string;
  scopeType: ScopeType;
  supportedAdapters: string[];
  defaultWindowSpecs: string[];
  requiredSensors: string[];
  phase1Template?: {
    fileFamilies: string[];
    timestampFieldCandidates: string[];
    fieldMapCandidates: Record<string, string[]>;
    requiredJoinFamilies: string[];
    qualityGateCodes: string[];
  };
};
