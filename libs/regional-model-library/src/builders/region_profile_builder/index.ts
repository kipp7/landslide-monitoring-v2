import type {
  CanonicalBusinessIdentity,
  JsonObject,
  QualityFlag,
  RegionProfile
} from "../../contracts";

export type RegionProfileBuilderInput = {
  identity: CanonicalBusinessIdentity;
  hazardType: string;
  profileVersion: string;
  requiredSensors: string[];
  sourceDatasets: string[];
  sourceRegionKeys?: string[];
  sensorSchema?: string[];
  qualityFlags?: QualityFlag[];
  properties?: JsonObject;
};

export function buildRegionProfile(input: RegionProfileBuilderInput): RegionProfile {
  return {
    profileKey: `${input.identity.scopeType}:${input.identity.scopeKey}`,
    identity: input.identity,
    hazardType: input.hazardType,
    sensorSchema: input.sensorSchema ?? [...input.requiredSensors],
    requiredSensors: [...input.requiredSensors],
    profileVersion: input.profileVersion,
    sourceDatasets: [...input.sourceDatasets],
    sourceRegionKeys: input.sourceRegionKeys ?? [input.identity.scopeKey],
    qualityFlags: input.qualityFlags ?? [],
    ...(input.properties ? { properties: input.properties } : {})
  };
}
