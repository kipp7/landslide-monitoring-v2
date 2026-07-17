import type {
  CanonicalBusinessIdentity,
  QualityFlag,
  RawReference,
  SourceFieldMap
} from "./common";

export type TrainingLabelValue = boolean | number | string | null;

export type TrainingLabelValueType = "boolean" | "number" | "string" | "null";

export type TrainingLabelDerivationMode =
  | "raw-field"
  | "default-value"
  | "derived-future-delta"
  | "derived-threshold"
  | "derived-replay-pack-membership";

export type TrainingLabelMetadata = {
  valueType: TrainingLabelValueType;
  derivationMode: TrainingLabelDerivationMode;
  sourceField?: string;
  horizonSpec?: string;
};

export type CanonicalTrainingSample = {
  sampleId: string;
  identity: CanonicalBusinessIdentity;
  eventTs: string;
  windowSpec: string;
  horizonSpec?: string;
  metricsNormalized: Record<string, number>;
  labels: Record<string, TrainingLabelValue>;
  labelMetadata?: Record<string, TrainingLabelMetadata>;
  sourceDataset: string;
  sourceRecordKey?: string;
  sourceFieldMap: SourceFieldMap;
  rawRef?: RawReference;
  qualityFlags: QualityFlag[];
};
