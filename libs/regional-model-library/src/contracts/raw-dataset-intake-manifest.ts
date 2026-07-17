export type DatasetSourceKind =
  | "station-timeseries"
  | "event-catalogue"
  | "rainfall-grid"
  | "inventory-static"
  | "remote-sensing";

export type DatasetAccessMode =
  | "direct-download"
  | "browser-doi"
  | "browser-login"
  | "browser-request"
  | "ftp"
  | "mixed";

export type RawDatasetDownloadTarget = {
  targetKey: string;
  displayName: string;
  url: string;
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  relativeOutFile: string;
  required?: boolean;
  notes?: string[];
};

export type IntakeFamilyStage =
  | "authoritative"
  | "challenger"
  | "metadata"
  | "deferred"
  | "static-prior"
  | "rainfall-backbone"
  | "event-library";

export type RawDatasetIntakeFieldSpec = {
  rawField: string;
  canonicalTarget: string;
  required: boolean;
  notes?: string;
};

export type RawDatasetIntakeSelectionHints = {
  preferredFileNames?: string[];
  preferredFilePatterns?: string[];
  preferredSheetNames?: string[];
  archiveSubpaths?: string[];
};

export type RawDatasetIntakeSchemaHints = {
  timeFieldCandidates?: string[];
  identityFieldCandidates?: string[];
  valueFieldCandidates?: string[];
  passthroughFieldCandidates?: string[];
};

export type RawDatasetIdentitySlot =
  | "event"
  | "region"
  | "slope"
  | "station"
  | "point"
  | "gauge"
  | "well"
  | "tunnel"
  | "crack"
  | "borehole"
  | "grid";

export type RawDatasetJoinRole = "base" | "overlay" | "metadata" | "deferred";

export type RawDatasetIdentityHints = {
  joinRole?: RawDatasetJoinRole;
  joinBasePriority?: number;
  canonicalIdentitySlots?: RawDatasetIdentitySlot[];
  joinKeyFieldCandidates?: string[];
};

export type RawDatasetTimeSemantics = {
  timezone?: string;
  precision?: string;
  granularity?: string;
  intervalAnchor?: "start" | "end";
};

export type RawDatasetValueSemantics = {
  valueType?: "number" | "string" | "boolean" | "geometry";
  unit?: string;
  semanticVariant?: string;
  aggregationMode?: string;
  signConvention?: string;
};

export type RawDatasetIntakeFamilySpec = {
  familyKey: string;
  displayName: string;
  stage: IntakeFamilyStage;
  rawLandingRelative: string;
  expectedFormats: string[];
  selectionHints?: RawDatasetIntakeSelectionHints;
  schemaHints?: RawDatasetIntakeSchemaHints;
  identityHints?: RawDatasetIdentityHints;
  timeSemantics?: RawDatasetTimeSemantics;
  valueSemantics?: RawDatasetValueSemantics;
  packBinding?: string;
  adapterBinding?: string;
  requiredFieldMappings: RawDatasetIntakeFieldSpec[];
  optionalFieldMappings?: RawDatasetIntakeFieldSpec[];
  notes?: string[];
};

export type RawDatasetAccessPlan = {
  mode: DatasetAccessMode;
  primarySource: string;
  backupSources?: string[];
  immediateActions: string[];
  constraints?: string[];
  downloadTargets?: RawDatasetDownloadTarget[];
};

export type RawDatasetIntakeManifest = {
  datasetKey: string;
  displayName: string;
  sourceKind: DatasetSourceKind;
  rawLandingRoot: string;
  repoRoles: string[];
  accessPlan: RawDatasetAccessPlan;
  families: RawDatasetIntakeFamilySpec[];
  notes?: string[];
};
