import { promises as fs } from "node:fs";
import path from "node:path";
import type { RegionalModelArtifact, ScopeType } from "@lsmv2/regional-model-library";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isArtifact(value: unknown): value is RegionalModelArtifact {
  if (!isObject(value)) return false;
  if (typeof value.modelKey !== "string" || typeof value.artifactType !== "string") return false;
  return ["linear_risk_v1", "two_stage_linear_risk_v1", "calibrated_prediction_regression_v1"].includes(value.artifactType);
}

async function registryFiles(rootDir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(rootDir, { withFileTypes: true });
    const nested = await Promise.all(entries.map(async (entry): Promise<string[]> => {
      const fullPath = path.join(rootDir, entry.name);
      if (entry.isDirectory()) return registryFiles(fullPath);
      return entry.isFile() && entry.name === "registry.json" ? [fullPath] : [];
    }));
    return nested.flat();
  } catch {
    return [];
  }
}

export class ArtifactRegistry {
  constructor(private readonly artifacts: RegionalModelArtifact[]) {}

  getCandidates(scopeType: ScopeType, scopeKey: string | null): RegionalModelArtifact[] {
    return this.artifacts.filter((artifact) => {
      if (artifact.scopeType !== scopeType) return false;
      if (scopeType === "global") return true;
      return artifact.scopeKey === scopeKey;
    });
  }
}

export async function loadArtifactRegistry(rootDir: string): Promise<ArtifactRegistry> {
  const files = await registryFiles(rootDir);
  const artifacts: RegionalModelArtifact[] = [];
  for (const file of files) {
    try {
      const parsed: unknown = JSON.parse(await fs.readFile(file, "utf8"));
      if (!isObject(parsed) || !Array.isArray(parsed.artifacts)) continue;
      for (const candidate of parsed.artifacts) {
        if (isArtifact(candidate)) artifacts.push(candidate);
      }
    } catch {
      // Invalid optional artifacts are ignored; the runtime falls back to the edge model.
    }
  }
  return new ArtifactRegistry(artifacts);
}
