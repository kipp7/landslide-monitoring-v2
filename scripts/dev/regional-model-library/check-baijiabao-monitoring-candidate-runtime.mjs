import { createRequire } from "node:module";
import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const requireFromScript = createRequire(import.meta.url);
const { loadArtifactRegistry } = requireFromScript(
  "../../../services/ai-prediction-worker/dist/pipeline/artifacts/artifact-registry.js"
);
const { pickMatchedArtifact } = requireFromScript(
  "../../../services/ai-prediction-worker/dist/pipeline/model-matcher.js"
);
const { runInference } = requireFromScript(
  "../../../services/ai-prediction-worker/dist/pipeline/inference-runner.js"
);

function parseArgs(argv) {
  const parsed = {
    registryRoot: ".tmp/regional-model-library/out/artifacts/threegorges-baijiabao-window-099-no-crack",
    samples: ".tmp/regional-model-library/out/threegorges-baijiabao/splits/labeled/baijiabao.validation.future-labels.window-features.jsonl",
    outFile: ".tmp/regional-model-library/out/artifacts/threegorges-baijiabao-window-099-no-crack/runtime-smoke.report.json",
    expectedModelKey: "baijiabao.window099.no-crack.station.Baijiabao.linear-risk-v1",
    stationCode: "Baijiabao",
    regionCode: "CN-HB-THREEGORGES",
    sampleIndex: null
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token) continue;
    switch (token) {
      case "--registry-root":
        parsed.registryRoot = argv[++index] ?? parsed.registryRoot;
        break;
      case "--samples":
        parsed.samples = argv[++index] ?? parsed.samples;
        break;
      case "--out-file":
        parsed.outFile = argv[++index] ?? parsed.outFile;
        break;
      case "--expected-model-key":
        parsed.expectedModelKey = argv[++index] ?? parsed.expectedModelKey;
        break;
      case "--station-code":
        parsed.stationCode = argv[++index] ?? parsed.stationCode;
        break;
      case "--region-code":
        parsed.regionCode = argv[++index] ?? parsed.regionCode;
        break;
      case "--sample-index": {
        const value = Number(argv[++index]);
        if (Number.isInteger(value) && value >= 0) parsed.sampleIndex = value;
        break;
      }
      default:
        break;
    }
  }

  return parsed;
}

async function readJsonLines(filePath) {
  const content = await readFile(filePath, "utf-8");
  return content
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function toNumericValues(metrics) {
  return Object.entries(metrics ?? {}).reduce((accumulator, [key, value]) => {
    if (typeof value === "number" && Number.isFinite(value)) {
      accumulator[key] = value;
    }
    return accumulator;
  }, {});
}

function buildRegionContext(input) {
  return {
    deviceId: "baijiabao-runtime-smoke-device",
    stationId: "baijiabao-runtime-smoke-station",
    stationCode: input.stationCode,
    slopeCode: "Baijiabao",
    regionCode: input.regionCode,
    nodeCode: null,
    gatewayCode: null,
    installLabel: null,
    identityClass: "rehearsal",
    metadata: {},
    stationMetadata: {}
  };
}

function buildFeatureVector(sample) {
  const values = toNumericValues(sample.metricsNormalized ?? {});
  const presentFeatureKeys = Object.keys(values);
  return {
    horizonSeconds: 3600,
    receivedTs: sample.eventTs ?? new Date().toISOString(),
    values,
    presentFeatureKeys,
    availableMetrics: presentFeatureKeys,
    windowSummary: {
      sourceMode: "baijiabao-validation-window-sample",
      sampleId: sample.sampleId ?? null
    },
    featureSummary: {
      sourceMode: "baijiabao-validation-window-sample",
      sampleId: sample.sampleId ?? null,
      presentFeatureKeys
    }
  };
}

function chooseSample(samples, artifact, explicitIndex) {
  if (explicitIndex !== null) {
    const sample = samples[explicitIndex];
    if (!sample) throw new Error(`sample index ${String(explicitIndex)} is out of range`);
    return { sample, sampleIndex: explicitIndex };
  }

  const required = artifact.requiredFeatureKeys ?? [];
  for (let index = 0; index < samples.length; index += 1) {
    const values = toNumericValues(samples[index]?.metricsNormalized ?? {});
    if (required.every((featureKey) => typeof values[featureKey] === "number")) {
      return { sample: samples[index], sampleIndex: index };
    }
  }

  throw new Error("No validation sample contains all required feature keys for the candidate artifact.");
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  const repoRoot = process.cwd();
  const registryRoot = path.resolve(repoRoot, parsed.registryRoot);
  const samplesPath = path.resolve(repoRoot, parsed.samples);
  const outFile = path.resolve(repoRoot, parsed.outFile);

  const registry = await loadArtifactRegistry(registryRoot);
  const artifacts = registry.list();
  const expectedArtifact = artifacts.find((artifact) => artifact.modelKey === parsed.expectedModelKey);
  if (!expectedArtifact) {
    throw new Error(`Expected artifact was not loaded: ${parsed.expectedModelKey}`);
  }

  const samples = await readJsonLines(samplesPath);
  const selectedSample = chooseSample(samples, expectedArtifact, parsed.sampleIndex);
  const features = buildFeatureVector(selectedSample.sample);
  const regionContext = buildRegionContext(parsed);
  const matched = pickMatchedArtifact(registry, regionContext, features);
  const inference = runInference({
    artifact: matched.artifact,
    features,
    regionContext
  });

  const unknownStationContext = {
    ...regionContext,
    stationCode: "Unknown-Baijiabao-Smoke"
  };
  const unknownStationMatched = pickMatchedArtifact(registry, unknownStationContext, features);

  const report = {
    checkedAt: new Date().toISOString(),
    registryRoot,
    samplesPath,
    artifactCount: artifacts.length,
    expectedModelKey: parsed.expectedModelKey,
    selectedSample: {
      sampleIndex: selectedSample.sampleIndex,
      sampleId: selectedSample.sample.sampleId ?? null,
      eventTs: selectedSample.sample.eventTs ?? null
    },
    requiredFeatureCount: expectedArtifact.requiredFeatureKeys.length,
    presentRequiredFeatureCount: expectedArtifact.requiredFeatureKeys.filter(
      (featureKey) => typeof features.values[featureKey] === "number"
    ).length,
    matched: {
      modelKey: matched.trace.matchedModelKey,
      modelVersion: matched.trace.matchedModelVersion,
      scopeType: matched.trace.matchedScopeType,
      scopeKey: matched.trace.matchedScopeKey,
      candidateCount: matched.trace.candidateCount,
      requiredSensorsSatisfied: matched.trace.requiredSensorsSatisfied,
      missingFeatureKeys: matched.trace.candidateSet[0]?.missingFeatureKeys ?? []
    },
    inference: {
      modelKey: inference.modelKey,
      modelVersion: inference.modelVersion,
      riskScore: inference.riskScore,
      riskLevel: inference.riskLevel,
      calibrationThreshold: inference.riskCalibration?.threshold ?? null,
      scoreOverThreshold: inference.riskCalibration?.scoreOverThreshold ?? null,
      calibratedRiskLevel: inference.riskCalibration?.calibratedRiskLevel ?? null,
      riskCalibrationSource: inference.riskCalibration?.source ?? null,
      fallbackReason: inference.fallbackReason,
      requiredFeaturesSatisfied: inference.requiredFeaturesSatisfied,
      missingFeatureKeys: inference.missingFeatureKeys,
      stageOutputsPresent: Boolean(inference.stageOutputs?.stage1 && inference.stageOutputs?.stage2)
    },
    unknownStationCheck: {
      stationCode: unknownStationContext.stationCode,
      matchedModelKey: unknownStationMatched.trace.matchedModelKey,
      candidateCount: unknownStationMatched.trace.candidateCount,
      ok: unknownStationMatched.artifact === null
    }
  };

  report.pass =
    report.matched.modelKey === parsed.expectedModelKey &&
    report.matched.candidateCount === 1 &&
    report.matched.requiredSensorsSatisfied === true &&
    report.inference.modelKey === parsed.expectedModelKey &&
    report.inference.fallbackReason === null &&
    report.inference.requiredFeaturesSatisfied === true &&
    report.inference.calibrationThreshold === 0.090203 &&
    report.inference.riskCalibrationSource === "metadata.replaySummary.threshold" &&
    report.inference.stageOutputsPresent === true &&
    report.unknownStationCheck.ok === true;

  await writeJson(outFile, report);
  console.log(JSON.stringify(report, null, 2));
  if (!report.pass) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
