import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import type {
  RegionalModelArtifact,
  RegionalModelArtifactRegistryFile,
} from "../../../libs/regional-model-library/src";
import { resolveRepoRoot } from "./intake-utils";

type ParsedArgs = {
  outRoot?: string;
  sourceArtifacts: string[];
};

type RegistryArtifactSummary = {
  modelKey: string;
  artifactType: RegionalModelArtifact["artifactType"];
  scopeType: RegionalModelArtifact["scopeType"];
  scopeKey: string | null;
  scopeAliases: string[];
  trainingDatasetKeys: string[];
  sampleCount: number;
  requiredFeatureCount: number;
  sourceArtifactPath: string;
};

type RegistryBuildReport = {
  generatedAt: string;
  outRoot: string;
  registryPath: string;
  artifactCount: number;
  sourceArtifactCount: number;
  duplicateModelKeys: string[];
  duplicateScopeKeys: Array<{
    scopeType: RegionalModelArtifact["scopeType"];
    scopeKey: string | null;
    modelKeys: string[];
  }>;
  artifacts: RegistryArtifactSummary[];
};

const DEFAULT_SOURCE_ARTIFACTS = [
  ".tmp/regional-model-library/out/artifacts/fuling-2019-formal-replay/fuling-2019-formal-replay.json",
  ".tmp/regional-model-library/out/artifacts/zixing-2024-full-single-stage-replay/zixing-2024-full-single-stage-replay.json",
  ".tmp/regional-model-library/out/artifacts/beijing-2023-by-region-single-stage/cn-北京市-北京市-门头沟区/beijing-2023-mentougou-single-stage-replay.json",
  ".tmp/regional-model-library/out/artifacts/beijing-2023-by-region-single-stage/cn-北京市-北京市-房山区/beijing-2023-fangshan-single-stage-replay.json",
  ".tmp/regional-model-library/out/artifacts/beijing-2023-by-region-single-stage/cn-北京市-北京市-昌平区/beijing-2023-changping-single-stage-replay.json",
  ".tmp/regional-model-library/out/artifacts/beijing-2023-by-region-single-stage/cn-北京市-北京市-海淀区/beijing-2023-haidian-single-stage-replay.json",
];

const REGION_SCOPE_ALIAS_MAP: Record<string, string[]> = {
  "cn:Chongqing:Chongqing:Fuling": ["CN-500102"],
  "cn:湖南省:郴州市:资兴市": ["CN-431081"],
  "cn:北京市:北京市:门头沟区": ["CN-110109"],
  "cn:北京市:北京市:房山区": ["CN-110111"],
  "cn:北京市:北京市:昌平区": ["CN-110114"],
  "cn:北京市:北京市:海淀区": ["CN-110108"],
};

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    sourceArtifacts: [],
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token) continue;

    switch (token) {
      case "--out-root":
        parsed.outRoot = argv[index + 1];
        index += 1;
        break;
      case "--source-artifact":
        if (argv[index + 1]) {
          parsed.sourceArtifacts.push(argv[index + 1]!);
        }
        index += 1;
        break;
      default:
        break;
    }
  }

  return parsed;
}

async function readJsonFile<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf-8")) as T;
}

function uniqueStrings(values: Iterable<string>): string[] {
  return Array.from(
    new Set(
      Array.from(values)
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
    )
  ).sort((left, right) => left.localeCompare(right));
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    : [];
}

function withRegionScopeAliases(artifact: RegionalModelArtifact): RegionalModelArtifact {
  if (artifact.scopeType !== "region" || !artifact.scopeKey) {
    return artifact;
  }

  const inferredAliases = REGION_SCOPE_ALIAS_MAP[artifact.scopeKey] ?? [];
  if (inferredAliases.length === 0) {
    return artifact;
  }

  const metadata =
    typeof artifact.metadata === "object" && artifact.metadata !== null
      ? { ...artifact.metadata }
      : {};
  const matcher =
    typeof metadata.matcher === "object" && metadata.matcher !== null
      ? { ...(metadata.matcher as Record<string, unknown>) }
      : {};
  const scopeAliases =
    typeof matcher.scopeAliases === "object" && matcher.scopeAliases !== null
      ? { ...(matcher.scopeAliases as Record<string, unknown>) }
      : {};
  const currentRegionAliases = readStringArray(scopeAliases.region);

  scopeAliases.region = uniqueStrings([...currentRegionAliases, ...inferredAliases]);
  matcher.scopeAliases = scopeAliases;
  metadata.matcher = matcher;

  return {
    ...artifact,
    metadata,
  };
}

function listRegionScopeAliases(artifact: RegionalModelArtifact): string[] {
  const metadata =
    typeof artifact.metadata === "object" && artifact.metadata !== null
      ? (artifact.metadata as Record<string, unknown>)
      : null;
  const matcher =
    metadata && typeof metadata.matcher === "object" && metadata.matcher !== null
      ? (metadata.matcher as Record<string, unknown>)
      : null;
  const scopeAliases =
    matcher && typeof matcher.scopeAliases === "object" && matcher.scopeAliases !== null
      ? (matcher.scopeAliases as Record<string, unknown>)
      : null;

  return uniqueStrings(readStringArray(scopeAliases?.region));
}

function requiredFeatureCount(artifact: RegionalModelArtifact): number {
  if (artifact.artifactType === "linear_risk_v1") {
    return artifact.requiredFeatureKeys.length;
  }

  return artifact.requiredFeatureKeys.length;
}

function sampleCount(artifact: RegionalModelArtifact): number {
  if (artifact.artifactType === "linear_risk_v1") {
    return artifact.trainingSummary.sampleCount;
  }

  return artifact.trainingSummary.sampleCount;
}

async function main(): Promise<void> {
  const repoRoot = resolveRepoRoot(__dirname);
  const parsed = parseArgs(process.argv.slice(2));
  const outRoot = path.resolve(
    repoRoot,
    parsed.outRoot ?? "artifacts/models/regional-experts/phase1-rainfall-replay"
  );
  const sourceArtifacts = (parsed.sourceArtifacts.length > 0
    ? parsed.sourceArtifacts
    : DEFAULT_SOURCE_ARTIFACTS
  ).map((artifactPath) => path.resolve(repoRoot, artifactPath));

  const artifactsWithSource = await Promise.all(
    sourceArtifacts.map(async (artifactPath) => ({
      sourceArtifactPath: artifactPath,
      artifact: withRegionScopeAliases(await readJsonFile<RegionalModelArtifact>(artifactPath)),
    }))
  );

  const registry: RegionalModelArtifactRegistryFile = {
    artifacts: artifactsWithSource.map((entry) => entry.artifact),
  };

  const modelKeyCounts = new Map<string, number>();
  const scopeKeyToModels = new Map<string, string[]>();

  for (const { artifact } of artifactsWithSource) {
    modelKeyCounts.set(artifact.modelKey, (modelKeyCounts.get(artifact.modelKey) ?? 0) + 1);
    const scopeKey = `${artifact.scopeType}::${artifact.scopeKey ?? "null"}`;
    const currentModels = scopeKeyToModels.get(scopeKey) ?? [];
    currentModels.push(artifact.modelKey);
    scopeKeyToModels.set(scopeKey, currentModels);
  }

  const duplicateModelKeys = Array.from(modelKeyCounts.entries())
    .filter(([, count]) => count > 1)
    .map(([modelKey]) => modelKey)
    .sort((left, right) => left.localeCompare(right));

  const duplicateScopeKeys = Array.from(scopeKeyToModels.entries())
    .filter(([, modelKeys]) => modelKeys.length > 1)
    .map(([scopeRef, modelKeys]) => {
      const [scopeType, scopeKey] = scopeRef.split("::");
      return {
        scopeType: scopeType as RegionalModelArtifact["scopeType"],
        scopeKey: scopeKey === "null" ? null : scopeKey,
        modelKeys: [...modelKeys].sort((left, right) => left.localeCompare(right)),
      };
    })
    .sort((left, right) => {
      const leftKey = `${left.scopeType}:${left.scopeKey ?? ""}`;
      const rightKey = `${right.scopeType}:${right.scopeKey ?? ""}`;
      return leftKey.localeCompare(rightKey);
    });

  const report: RegistryBuildReport = {
    generatedAt: new Date().toISOString(),
    outRoot,
    registryPath: path.join(outRoot, "registry.json"),
    artifactCount: registry.artifacts.length,
    sourceArtifactCount: artifactsWithSource.length,
    duplicateModelKeys,
    duplicateScopeKeys,
    artifacts: artifactsWithSource
      .map(({ sourceArtifactPath, artifact }) => ({
        modelKey: artifact.modelKey,
        artifactType: artifact.artifactType,
        scopeType: artifact.scopeType,
        scopeKey: artifact.scopeKey,
        scopeAliases: listRegionScopeAliases(artifact),
        trainingDatasetKeys: artifact.trainingDatasetKeys,
        sampleCount: sampleCount(artifact),
        requiredFeatureCount: requiredFeatureCount(artifact),
        sourceArtifactPath,
      }))
      .sort((left, right) => left.modelKey.localeCompare(right.modelKey)),
  };

  await mkdir(outRoot, { recursive: true });
  await writeFile(path.join(outRoot, "registry.json"), JSON.stringify(registry, null, 2), "utf-8");
  await writeFile(
    path.join(outRoot, "build-runtime-artifact-registry.report.json"),
    JSON.stringify(report, null, 2),
    "utf-8"
  );

  console.log(JSON.stringify(report, null, 2));
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
