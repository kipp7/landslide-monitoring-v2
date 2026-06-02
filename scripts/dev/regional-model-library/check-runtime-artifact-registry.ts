import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { loadArtifactRegistry } from "../../../services/ai-prediction-worker/src/pipeline/artifacts/artifact-registry";
import { pickMatchedArtifact } from "../../../services/ai-prediction-worker/src/pipeline/model-matcher";
import type {
  FeatureVector,
  RegionContext,
} from "../../../services/ai-prediction-worker/src/pipeline/types";
import { resolveRepoRoot } from "./intake-utils";

type ParsedArgs = {
  registryRoot?: string;
  outFile?: string;
};

type MatchExpectation = {
  regionCodes: string[];
  expectedModelKey: string;
};

type MatchCheckResult = {
  regionCode: string;
  expectedModelKey: string;
  matchedModelKey: string | null;
  candidateCount: number;
  ok: boolean;
};

type MatchCheckReport = {
  generatedAt: string;
  registryRoot: string;
  registryArtifactCount: number;
  checks: MatchCheckResult[];
  unknownRegionCheck: {
    regionCode: string;
    matchedModelKey: string | null;
    candidateCount: number;
    ok: boolean;
  };
};

const DEFAULT_EXPECTATIONS: MatchExpectation[] = [
  {
    regionCodes: ["cn:Chongqing:Chongqing:Fuling", "CN-500102"],
    expectedModelKey: "fuling-2019-formal-replay",
  },
  {
    regionCodes: ["cn:湖南省:郴州市:资兴市", "CN-431081"],
    expectedModelKey: "zixing-2024-full-single-stage-replay",
  },
  {
    regionCodes: ["cn:北京市:北京市:门头沟区", "CN-110109"],
    expectedModelKey: "beijing-2023-mentougou-single-stage-replay",
  },
  {
    regionCodes: ["cn:北京市:北京市:房山区", "CN-110111"],
    expectedModelKey: "beijing-2023-fangshan-single-stage-replay",
  },
  {
    regionCodes: ["cn:北京市:北京市:昌平区", "CN-110114"],
    expectedModelKey: "beijing-2023-changping-single-stage-replay",
  },
  {
    regionCodes: ["cn:北京市:北京市:海淀区", "CN-110108"],
    expectedModelKey: "beijing-2023-haidian-single-stage-replay",
  },
];

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token) continue;

    switch (token) {
      case "--registry-root":
        parsed.registryRoot = argv[index + 1];
        index += 1;
        break;
      case "--out-file":
        parsed.outFile = argv[index + 1];
        index += 1;
        break;
      default:
        break;
    }
  }

  return parsed;
}

function createFeatureVector(requiredFeatureKeys: readonly string[]): FeatureVector {
  const values = Object.fromEntries(requiredFeatureKeys.map((featureKey) => [featureKey, 1]));
  return {
    horizonSeconds: 3600,
    receivedTs: new Date().toISOString(),
    values,
    presentFeatureKeys: [...requiredFeatureKeys],
    availableMetrics: [...requiredFeatureKeys],
    windowSummary: {},
    featureSummary: {},
  };
}

function createRegionContext(regionCode: string): RegionContext {
  return {
    deviceId: "dev-registry-check",
    stationId: null,
    stationCode: null,
    slopeCode: null,
    regionCode,
    nodeCode: null,
    gatewayCode: null,
    installLabel: null,
    identityClass: null,
    metadata: {},
    stationMetadata: {},
  };
}

async function main(): Promise<void> {
  const repoRoot = resolveRepoRoot(__dirname);
  const parsed = parseArgs(process.argv.slice(2));
  const registryRoot = path.resolve(
    repoRoot,
    parsed.registryRoot ?? "artifacts/models/regional-experts/phase1-rainfall-replay"
  );
  const outFile = path.resolve(
    repoRoot,
    parsed.outFile ??
      "artifacts/models/regional-experts/phase1-rainfall-replay/check-runtime-artifact-registry.report.json"
  );

  const registry = await loadArtifactRegistry(registryRoot);
  const artifacts = registry.list();

  const checks = DEFAULT_EXPECTATIONS.flatMap((expectation) => {
    const artifact = artifacts.find(
      (candidate) => candidate.modelKey === expectation.expectedModelKey
    );
    if (!artifact) {
      return expectation.regionCodes.map((regionCode) => ({
        regionCode,
        expectedModelKey: expectation.expectedModelKey,
        matchedModelKey: null,
        candidateCount: 0,
        ok: false,
      }));
    }

    return expectation.regionCodes.map((regionCode) => {
      const match = pickMatchedArtifact(
        registry,
        createRegionContext(regionCode),
        createFeatureVector(artifact.requiredFeatureKeys)
      );

      return {
        regionCode,
        expectedModelKey: expectation.expectedModelKey,
        matchedModelKey: match.artifact?.modelKey ?? null,
        candidateCount: match.trace.candidateCount,
        ok: match.artifact?.modelKey === expectation.expectedModelKey,
      };
    });
  });

  const unknownRegionMatch = pickMatchedArtifact(
    registry,
    createRegionContext("cn:未知省:未知市:未知区"),
    createFeatureVector(
      artifacts[0]?.requiredFeatureKeys ?? [
        "rainfallAccum1dMm",
        "rainfallAccum3dMm",
        "rainfallAccum7dMm",
      ]
    )
  );

  const report: MatchCheckReport = {
    generatedAt: new Date().toISOString(),
    registryRoot,
    registryArtifactCount: artifacts.length,
    checks,
    unknownRegionCheck: {
      regionCode: "cn:未知省:未知市:未知区",
      matchedModelKey: unknownRegionMatch.artifact?.modelKey ?? null,
      candidateCount: unknownRegionMatch.trace.candidateCount,
      ok: unknownRegionMatch.artifact === null,
    },
  };

  await mkdir(path.dirname(outFile), { recursive: true });
  await writeFile(outFile, JSON.stringify(report, null, 2), "utf-8");

  console.log(JSON.stringify(report, null, 2));

  if (!checks.every((item) => item.ok) || !report.unknownRegionCheck.ok) {
    process.exitCode = 1;
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
