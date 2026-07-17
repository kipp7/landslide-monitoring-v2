import type {
  CanonicalBusinessIdentity,
  JsonObject,
  QualityFlag
} from "./common";

export type RegionProfile = {
  profileKey: string;
  identity: CanonicalBusinessIdentity;
  hazardType: string;
  sensorSchema: string[];
  requiredSensors: string[];
  profileVersion: string;
  sourceDatasets: string[];
  sourceRegionKeys: string[];
  qualityFlags: QualityFlag[];
  properties?: JsonObject;
};
