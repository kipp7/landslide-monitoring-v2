import type { CanonicalBusinessIdentity, JsonObject } from "./common";

export type RegionExpertArtifactType =
  | "linear"
  | "logistic"
  | "tree"
  | "unknown";

export type RegionExpertPackage = {
  modelKey: string;
  version: string;
  scope: CanonicalBusinessIdentity;
  artifactType: RegionExpertArtifactType;
  featureSchemaVersion: string;
  labelSchemaVersion: string;
  profileVersion: string;
  trainingDatasetKeys: string[];
  createdAt: string;
  entrypoint: string;
  metadata?: JsonObject;
};
