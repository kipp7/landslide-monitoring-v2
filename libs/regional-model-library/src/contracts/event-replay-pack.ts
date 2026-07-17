import type {
  JsonObject,
  QualityFlag,
  RawReference,
  ScopeType,
  TimePrecision
} from "./common";

export type EventReplayPackWindowMetrics = {
  windowDays: number;
  rainfallTotalMm: number;
  rainfallMeanMm: number;
  rainfallMaxMm: number;
  rainfallMinMm: number;
  rainfallNonZeroDayCount: number;
  rainfallDayCount: number;
  rainfallLastDayMm: number | null;
};

export type EventReplayPackSample = {
  sampleId: string;
  eventId: string;
  sourceEventId?: string;
  label: 0 | 1;
  regionCode: string;
  hazardType: string;
  eventTs: string;
  longitude?: number;
  latitude?: number;
  timePrecision?: TimePrecision;
  triggerSummary?: string;
  metricsNormalized: Record<string, number>;
  windowMetrics: EventReplayPackWindowMetrics[];
  rawRef?: RawReference;
  qualityFlags: QualityFlag[];
  properties?: JsonObject;
};

export type EventReplayPack = {
  schemaVersion: "event-replay-pack.v1";
  packKey: string;
  datasetKey: string;
  generatedAt: string;
  scopeType: Extract<ScopeType, "region" | "global">;
  scopeKey: string | null;
  sourceEventCsv: string;
  negativeEventCsv?: string | null;
  positiveExtractRoot: string;
  negativeExtractRoot?: string | null;
  metricsCatalog: string[];
  samples: EventReplayPackSample[];
  summary: {
    sampleCount: number;
    positiveCount: number;
    negativeCount: number;
    missingExtractSampleCount: number;
    windowDays: number[];
  };
  metadata?: JsonObject;
};
