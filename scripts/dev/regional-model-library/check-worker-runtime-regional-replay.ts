import { readFile } from "node:fs/promises";
import path from "node:path";
import { loadArtifactRegistry } from "../../../services/ai-prediction-worker/src/pipeline/artifacts/artifact-registry";
import { runInference } from "../../../services/ai-prediction-worker/src/pipeline/inference-runner";
import { pickMatchedArtifact } from "../../../services/ai-prediction-worker/src/pipeline/model-matcher";
import type { FeatureVector, RegionContext } from "../../../services/ai-prediction-worker/src/pipeline/types";

type ReplaySample = {
  identity?: {
    scopeKey?: string;
    regionCode?: string;
  };
  metricsNormalized?: Record<string, unknown>;
  sampleId?: string;
};

type CaseDefinition = {
  expectedModelKey: string;
  expectedRegionCode: string;
  runtimeRegionCode: string;
  samplePath: string;
  sampleIndex: number;
};

const PROJECT_ROOT = process.cwd();

const CASES: CaseDefinition[] = [
  {
    expectedModelKey: "fuling-2019-formal-replay",
    expectedRegionCode: "cn:Chongqing:Chongqing:Fuling",
    runtimeRegionCode: "CN-500102",
    samplePath: ".tmp/regional-model-library/out/replay-packs/fuling-2019-formal/event-replay-pack.samples.jsonl",
    sampleIndex: 0
  },
  {
    expectedModelKey: "zixing-2024-full-single-stage-replay",
    expectedRegionCode: "cn:湖南省:郴州市:资兴市",
    runtimeRegionCode: "CN-431081",
    samplePath: ".tmp/regional-model-library/out/replay-packs/zixing-2024-full-batched-skiptrain/event-replay-pack.samples.jsonl",
    sampleIndex: 0
  },
  {
    expectedModelKey: "beijing-2023-mentougou-single-stage-replay",
    expectedRegionCode: "cn:北京市:北京市:门头沟区",
    runtimeRegionCode: "CN-110109",
    samplePath:
      ".tmp/regional-model-library/out/replay-packs/beijing-2023-by-region-full-batched-skiptrain/cn-北京市-北京市-门头沟区/event-replay-pack.samples.jsonl",
    sampleIndex: 0
  },
  {
    expectedModelKey: "beijing-2023-fangshan-single-stage-replay",
    expectedRegionCode: "cn:北京市:北京市:房山区",
    runtimeRegionCode: "CN-110111",
    samplePath:
      ".tmp/regional-model-library/out/replay-packs/beijing-2023-by-region-full-batched-skiptrain/cn-北京市-北京市-房山区/event-replay-pack.samples.jsonl",
    sampleIndex: 0
  },
  {
    expectedModelKey: "beijing-2023-changping-single-stage-replay",
    expectedRegionCode: "cn:北京市:北京市:昌平区",
    runtimeRegionCode: "CN-110114",
    samplePath:
      ".tmp/regional-model-library/out/replay-packs/beijing-2023-by-region-full-batched-skiptrain/cn-北京市-北京市-昌平区/event-replay-pack.samples.jsonl",
    sampleIndex: 0
  },
  {
    expectedModelKey: "beijing-2023-haidian-single-stage-replay",
    expectedRegionCode: "cn:北京市:北京市:海淀区",
    runtimeRegionCode: "CN-110108",
    samplePath:
      ".tmp/regional-model-library/out/replay-packs/beijing-2023-by-region-full-batched-skiptrain/cn-北京市-北京市-海淀区/event-replay-pack.samples.jsonl",
    sampleIndex: 0
  }
];

function parseArgs(argv: string[]): { json: boolean } {
  return {
    json: argv.includes("--json")
  };
}

function toNumericFeatureValues(metricsNormalized: Record<string, unknown>): Record<string, number> {
  return Object.entries(metricsNormalized).reduce<Record<string, number>>((accumulator, [key, value]) => {
    if (typeof value === "number" && Number.isFinite(value)) {
      accumulator[key] = value;
    }
    return accumulator;
  }, {});
}

async function loadReplaySample(samplePath: string, sampleIndex: number): Promise<ReplaySample> {
  const raw = await readFile(path.resolve(PROJECT_ROOT, samplePath), "utf-8");
  const lines = raw
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const line = lines[sampleIndex];
  if (!line) {
    throw new Error(`sample index ${String(sampleIndex)} is out of range for ${samplePath}`);
  }

  return JSON.parse(line) as ReplaySample;
}

function buildFeatureVectorFromSample(sample: ReplaySample): FeatureVector {
  const values = toNumericFeatureValues(sample.metricsNormalized ?? {});
  const presentFeatureKeys = Object.keys(values);
  return {
    horizonSeconds: 3600,
    receivedTs: new Date().toISOString(),
    values,
    presentFeatureKeys,
    availableMetrics: presentFeatureKeys,
    windowSummary: {
      sourceMode: "replay-sample",
      sampleId: sample.sampleId ?? null
    },
    featureSummary: {
      sourceMode: "replay-sample",
      sampleId: sample.sampleId ?? null,
      presentFeatureKeys
    }
  };
}

function buildRegionContext(regionCode: string): RegionContext {
  return {
    deviceId: "replay-smoke-device",
    stationId: null,
    stationCode: null,
    slopeCode: null,
    regionCode,
    nodeCode: null,
    gatewayCode: null,
    installLabel: null,
    identityClass: null,
    metadata: {},
    stationMetadata: {}
  };
}

async function run(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const registry = await loadArtifactRegistry(
    path.resolve(PROJECT_ROOT, "artifacts/models/regional-experts/phase1-rainfall-replay")
  );
  const results = [];

  for (const caseDefinition of CASES) {
    const sample = await loadReplaySample(caseDefinition.samplePath, caseDefinition.sampleIndex);
    const regionCode = caseDefinition.runtimeRegionCode;
    const sourceScopeKey =
      sample.identity?.regionCode ?? sample.identity?.scopeKey ?? caseDefinition.expectedRegionCode;
    const regionContext = buildRegionContext(regionCode);
    const features = buildFeatureVectorFromSample(sample);
    const matched = pickMatchedArtifact(registry, regionContext, features);
    const inference = runInference({
      artifact: matched.artifact,
      features,
      regionContext
    });

    const result = {
      expectedModelKey: caseDefinition.expectedModelKey,
      matchedModelKey: matched.trace.matchedModelKey,
      regionCode,
      sourceScopeKey,
      candidateCount: matched.trace.candidateCount,
      fallbackReason: inference.fallbackReason,
      requiredFeaturesSatisfied: inference.requiredFeaturesSatisfied,
      missingFeatureKeys: inference.missingFeatureKeys,
      riskLevel: inference.riskLevel,
      pass:
        matched.trace.matchedModelKey === caseDefinition.expectedModelKey &&
        matched.trace.candidateCount === 1 &&
        inference.fallbackReason === null &&
        inference.requiredFeaturesSatisfied
    };
    results.push(result);
  }

  const failed = results.filter((result) => !result.pass);
  const report = {
    checkedAt: new Date().toISOString(),
    caseCount: results.length,
    passed: failed.length === 0,
    results
  };

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    for (const result of results) {
      console.log(
        [
          result.pass ? "PASS" : "FAIL",
          result.expectedModelKey,
          `matched=${result.matchedModelKey ?? "null"}`,
          `fallback=${result.fallbackReason ?? "none"}`,
          `requiredFeaturesSatisfied=${String(result.requiredFeaturesSatisfied)}`
        ].join(" ")
      );
    }
  }

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

void run();
