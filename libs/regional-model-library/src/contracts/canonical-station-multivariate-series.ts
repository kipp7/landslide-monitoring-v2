import type {
  CanonicalBusinessIdentity,
  QualityFlag,
  RawReference,
  SourceFieldMap
} from "./common";

export type CanonicalStationPoint = {
  eventTs: string;
  metricsNormalized: Record<string, number>;
  hydroclimateContext?: Record<string, number>;
  rawRef?: RawReference;
  qualityFlags?: QualityFlag[];
};

export type CanonicalStationMultivariateSeries = {
  seriesId: string;
  identity: CanonicalBusinessIdentity;
  sourceDataset: string;
  sourceFieldMap: SourceFieldMap;
  points: CanonicalStationPoint[];
  qualityFlags: QualityFlag[];
};
