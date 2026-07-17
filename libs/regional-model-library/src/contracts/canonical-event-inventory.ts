import type {
  JsonObject,
  QualityFlag,
  RawReference,
  SourceFieldMap,
  TimePrecision
} from "./common";

export type CanonicalEventInventoryRecord = {
  eventId: string;
  regionCode: string;
  hazardType: string;
  slopeCode?: string;
  stationCode?: string;
  eventTs?: string;
  eventStartTs?: string;
  eventEndTs?: string;
  longitude?: number;
  latitude?: number;
  province?: string;
  city?: string;
  county?: string;
  locationText?: string;
  timePrecision?: TimePrecision;
  spacePrecision?: string;
  triggerSummary?: string;
  rawRef: RawReference;
  qualityFlags: QualityFlag[];
  properties?: JsonObject;
};

export type CanonicalEventInventory = {
  datasetKey: string;
  sourceFieldMap: SourceFieldMap;
  records: CanonicalEventInventoryRecord[];
};
