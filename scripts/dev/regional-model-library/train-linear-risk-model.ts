import path from "node:path";
import { readFile } from "node:fs/promises";
import type {
  CanonicalTrainingSample,
  LinearRiskModelArtifactV1,
  LinearRiskModelStageV1,
  RegionalModelArtifactRegistryFile,
  ScopeType,
  SupportedArtifactType,
  TwoStageLinearRiskModelArtifactV1
} from "../../../libs/regional-model-library/src";
import {
  runLinearRiskStage,
  writeJsonFile
} from "../../../libs/regional-model-library/src";
import { resolveRepoRoot } from "./intake-utils";

type ParsedArgs = {
  samples?: string;
  outDir?: string;
  modelKey?: string;
  modelVersion?: string;
  scopeType?: ScopeType;
  scopeKey?: string;
  labelKey: string;
  minFeatureCoverage: number;
  excludeFeatures: string[];
  featureSchemaVersion: string;
  labelSchemaVersion: string;
  profileVersion: string;
  artifactMetadataFile?: string;
  artifactType: "single-stage" | "two-stage";
  strict: boolean;
};

type StageSummary = {
  stageKey: string;
  outputKey: string;
  featureCount: number;
  featureKeys: string[];
};

type TrainingReport = {
  generatedAt: string;
  samplesPath: string;
  outDir: string;
  artifactPath: string;
  registryPath: string;
  artifactType: SupportedArtifactType;
  modelKey: string;
  modelVersion: string | null;
  scopeType: ScopeType;
  scopeKey: string | null;
  labelKey: string;
  minFeatureCoverage: number;
  excludedFeatures: string[];
  featureCount: number;
  featureKeys: string[];
  artifactMetadataFile: string | null;
  artifactMetadataKeys: string[];
  sampleCount: number;
  positiveCount: number;
  negativeCount: number;
  datasetKeys: string[];
  stageSummaries: StageSummary[];
  warnings: string[];
};

type BinaryLabel = 0 | 1;

type LabeledSampleRow = {
  sample: CanonicalTrainingSample;
  label: BinaryLabel;
};

type TrainingFeatureRow = {
  label: BinaryLabel;
  featureValues: Record<string, number>;
};

type StageTrainingInput = {
  rows: TrainingFeatureRow[];
  stageKey: LinearRiskModelStageV1["stageKey"];
  outputKey: string;
  labelKey: string;
  featureKeys: string[];
  metadata?: Record<string, unknown>;
};

const STAGE1_OUTPUT_KEY = "stage1DisplacementScore";
const STAGE2_OUTPUT_KEY = "stage2WarningScore";

const STAGE1_FEATURE_PATTERNS = [
  /displacement/iu,
  /beidou/iu,
  /crack/iu,
  /settlement/iu,
  /slip/iu,
  /deformation/iu
];

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    labelKey: "warningHitLabel",
    minFeatureCoverage: 0,
    excludeFeatures: [],
    featureSchemaVersion: "runtime-feature-vector.v1",
    labelSchemaVersion: "warning-hit-label.v1",
    profileVersion: "phase1-profile.v1",
    artifactType: "two-stage",
    strict: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token) continue;

    switch (token) {
      case "--samples":
        parsed.samples = argv[index + 1];
        index += 1;
        break;
      case "--out-dir":
        parsed.outDir = argv[index + 1];
        index += 1;
        break;
      case "--model-key":
        parsed.modelKey = argv[index + 1];
        index += 1;
        break;
      case "--model-version":
        parsed.modelVersion = argv[index + 1];
        index += 1;
        break;
      case "--scope-type": {
        const value = argv[index + 1];
        if (value === "station" || value === "slope" || value === "region" || value === "global") {
          parsed.scopeType = value;
        }
        index += 1;
        break;
      }
      case "--scope-key":
        parsed.scopeKey = argv[index + 1];
        index += 1;
        break;
      case "--label-key":
        parsed.labelKey = argv[index + 1] ?? parsed.labelKey;
        index += 1;
        break;
      case "--min-feature-coverage": {
        const value = Number(argv[index + 1]);
        if (Number.isFinite(value) && value >= 0 && value <= 1) {
          parsed.minFeatureCoverage = value;
        }
        index += 1;
        break;
      }
      case "--exclude-features": {
        const value = argv[index + 1];
        if (value) {
          parsed.excludeFeatures = uniqueStrings(
            value
              .split(",")
              .map((item) => item.trim())
              .filter((item) => item.length > 0)
          );
        }
        index += 1;
        break;
      }
      case "--feature-schema-version":
        parsed.featureSchemaVersion = argv[index + 1] ?? parsed.featureSchemaVersion;
        index += 1;
        break;
      case "--label-schema-version":
        parsed.labelSchemaVersion = argv[index + 1] ?? parsed.labelSchemaVersion;
        index += 1;
        break;
      case "--profile-version":
        parsed.profileVersion = argv[index + 1] ?? parsed.profileVersion;
        index += 1;
        break;
      case "--artifact-metadata-file":
        parsed.artifactMetadataFile = argv[index + 1];
        index += 1;
        break;
      case "--artifact-type": {
        const value = argv[index + 1];
        if (value === "single-stage" || value === "two-stage") {
          parsed.artifactType = value;
        }
        index += 1;
        break;
      }
      case "--strict":
        parsed.strict = true;
        break;
      default:
        break;
    }
  }

  return parsed;
}

function resolveDefaultPaths(repoRoot: string, parsed: ParsedArgs) {
  const samplesPath = path.resolve(
    repoRoot,
    parsed.samples ??
      ".tmp/regional-model-library/out/samples/threegorges/threegorges-canonical-training-samples.jsonl"
  );
  const outDir = path.resolve(
    repoRoot,
    parsed.outDir ?? ".tmp/regional-model-library/out/artifacts/threegorges"
  );

  return { samplesPath, outDir };
}

async function readSamples(filePath: string): Promise<CanonicalTrainingSample[]> {
  const content = await readFile(filePath, "utf-8");
  if (filePath.toLowerCase().endsWith(".json")) {
    const parsed = JSON.parse(content) as unknown;
    return Array.isArray(parsed) ? (parsed as CanonicalTrainingSample[]) : [];
  }

  return content
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as CanonicalTrainingSample);
}

async function readArtifactMetadataFile(filePath?: string): Promise<Record<string, unknown> | undefined> {
  if (!filePath) {
    return undefined;
  }

  const content = await readFile(filePath, "utf-8");
  const parsed = JSON.parse(content) as unknown;
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`Artifact metadata file must contain a JSON object: ${filePath}`);
  }

  return parsed as Record<string, unknown>;
}

function toBinaryLabel(value: unknown): BinaryLabel | null {
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value === 0) return 0;
    if (value === 1) return 1;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "1" || normalized === "true" || normalized === "yes") return 1;
    if (normalized === "0" || normalized === "false" || normalized === "no") return 0;
  }
  return null;
}

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function uniqueStrings(values: Iterable<string>): string[] {
  return Array.from(new Set(values)).sort((left, right) => left.localeCompare(right));
}

function deriveScopeType(samples: readonly CanonicalTrainingSample[]): ScopeType {
  const scopeTypes = uniqueStrings(samples.map((sample) => sample.identity.scopeType));
  const single = scopeTypes[0];
  if (
    scopeTypes.length === 1 &&
    (single === "station" || single === "slope" || single === "region" || single === "global")
  ) {
    return single;
  }
  return "global";
}

function deriveScopeKey(samples: readonly CanonicalTrainingSample[], scopeType: ScopeType): string | null {
  if (scopeType === "global") return null;
  const scopeKeys = uniqueStrings(samples.map((sample) => sample.identity.scopeKey));
  return scopeKeys.length === 1 ? scopeKeys[0] ?? null : null;
}

function deriveModelKey(
  samplesPath: string,
  parsed: ParsedArgs,
  scopeType: ScopeType,
  scopeKey: string | null
): string {
  if (parsed.modelKey && parsed.modelKey.trim().length > 0) return parsed.modelKey.trim();
  const base = path.basename(samplesPath).replace(/\.[^.]+$/u, "");
  return `${base}.${scopeType}.${scopeKey ?? "global"}.linear-risk-v1`;
}

function collectLabeledRows(
  samples: readonly CanonicalTrainingSample[],
  labelKey: string
): { rows: LabeledSampleRow[]; warnings: string[] } {
  const warnings: string[] = [];
  const rows = samples
    .map((sample) => ({
      sample,
      label: toBinaryLabel(sample.labels[labelKey])
    }))
    .filter((entry) => {
      if (entry.label === null) {
        warnings.push(`Ignored ${sampleIdForWarning(entry.sample)} because ${labelKey} is not binary.`);
        return false;
      }
      return true;
    })
    .map((entry) => ({
      sample: entry.sample,
      label: entry.label as BinaryLabel
    }));

  if (rows.length === 0) {
    throw new Error(`No training rows contained a binary label for ${labelKey}.`);
  }

  const positiveCount = rows.filter((entry) => entry.label === 1).length;
  const negativeCount = rows.filter((entry) => entry.label === 0).length;
  if (positiveCount === 0 || negativeCount === 0) {
    throw new Error("Binary training requires at least one positive row and one negative row.");
  }

  return { rows, warnings };
}

function sampleIdForWarning(sample: CanonicalTrainingSample): string {
  return sample.sampleId || sample.sourceRecordKey || "unknown-sample";
}

function collectFeatureKeys(
  rows: readonly LabeledSampleRow[],
  minFeatureCoverage: number
): string[] {
  const coverage = new Map<string, number>();
  for (const entry of rows) {
    for (const [featureKey, value] of Object.entries(entry.sample.metricsNormalized)) {
      if (typeof value === "number" && Number.isFinite(value)) {
        coverage.set(featureKey, (coverage.get(featureKey) ?? 0) + 1);
      }
    }
  }

  const minimumCount = Math.max(1, Math.ceil(rows.length * minFeatureCoverage));
  return uniqueStrings(
    Array.from(coverage.entries())
      .filter(([, count]) => count >= minimumCount)
      .map(([featureKey]) => featureKey)
  );
}

function excludeFeatureKeys(
  featureKeys: readonly string[],
  excludedFeatureKeys: readonly string[]
): string[] {
  if (excludedFeatureKeys.length === 0) {
    return [...featureKeys];
  }

  const denied = new Set(excludedFeatureKeys);
  return featureKeys.filter((featureKey) => !denied.has(featureKey));
}

function buildFeatureValues(sample: CanonicalTrainingSample): Record<string, number> {
  return Object.entries(sample.metricsNormalized).reduce<Record<string, number>>((accumulator, [featureKey, value]) => {
    if (typeof value === "number" && Number.isFinite(value)) {
      accumulator[featureKey] = value;
    }
    return accumulator;
  }, {});
}

function toTrainingRows(rows: readonly LabeledSampleRow[]): TrainingFeatureRow[] {
  return rows.map((entry) => ({
    label: entry.label,
    featureValues: buildFeatureValues(entry.sample)
  }));
}

function deriveStage1FeatureKeys(featureKeys: readonly string[]): { featureKeys: string[]; usedFallback: boolean } {
  const matched = featureKeys.filter((featureKey) =>
    STAGE1_FEATURE_PATTERNS.some((pattern) => pattern.test(featureKey))
  );
  if (matched.length > 0) {
    return { featureKeys: matched, usedFallback: false };
  }

  const fallbackFeatureKeys = featureKeys.slice(
    0,
    Math.max(1, Math.min(featureKeys.length, Math.ceil(featureKeys.length / 2)))
  );
  return { featureKeys: fallbackFeatureKeys, usedFallback: true };
}

function trainLinearStageModel(input: StageTrainingInput): LinearRiskModelStageV1 {
  if (input.rows.length === 0) {
    throw new Error(`Stage ${input.stageKey} received no rows.`);
  }
  if (input.featureKeys.length === 0) {
    throw new Error(`Stage ${input.stageKey} received no feature keys.`);
  }

  const positiveRows = input.rows.filter((entry) => entry.label === 1);
  const negativeRows = input.rows.filter((entry) => entry.label === 0);
  if (positiveRows.length === 0 || negativeRows.length === 0) {
    throw new Error(`Stage ${input.stageKey} requires at least one positive and one negative row.`);
  }

  const featureNormalization: LinearRiskModelStageV1["featureNormalization"] = {};
  const featureCenters: LinearRiskModelStageV1["featureCenters"] = {};
  const weights: LinearRiskModelStageV1["weights"] = {};

  for (const featureKey of input.featureKeys) {
    const rawValues = input.rows.map((entry) => entry.featureValues[featureKey] ?? 0);
    const min = Math.min(...rawValues);
    const max = Math.max(...rawValues);
    featureNormalization[featureKey] = { min, max };

    const normalize = (value: number) => {
      const span = max - min;
      if (!Number.isFinite(span) || span <= 0) return 0.5;
      const normalized = (value - min) / span;
      if (!Number.isFinite(normalized)) return 0.5;
      if (normalized < 0) return 0;
      if (normalized > 1) return 1;
      return normalized;
    };

    const positiveMean = mean(
      positiveRows.map((entry) => normalize(entry.featureValues[featureKey] ?? 0))
    );
    const negativeMean = mean(
      negativeRows.map((entry) => normalize(entry.featureValues[featureKey] ?? 0))
    );

    featureCenters[featureKey] = (positiveMean + negativeMean) / 2;
    weights[featureKey] = positiveMean - negativeMean;
  }

  const positiveRate = positiveRows.length / input.rows.length;
  const boundedPositiveRate = Math.min(0.99, Math.max(0.01, positiveRate));

  return {
    stageKey: input.stageKey,
    outputKey: input.outputKey,
    labelKey: input.labelKey,
    requiredFeatureKeys: input.featureKeys,
    featureNormalization,
    featureCenters,
    bias: Math.log(boundedPositiveRate / (1 - boundedPositiveRate)),
    weights,
    trainingSummary: {
      sampleCount: input.rows.length,
      positiveCount: positiveRows.length,
      negativeCount: negativeRows.length
    },
    ...(input.metadata ? { metadata: input.metadata } : {})
  };
}

function buildSingleStageArtifact(input: {
  rows: readonly LabeledSampleRow[];
  labelKey: string;
  minFeatureCoverage: number;
  excludeFeatures: string[];
  modelKey: string;
  modelVersion: string | null;
  scopeType: ScopeType;
  scopeKey: string | null;
  featureSchemaVersion: string;
  labelSchemaVersion: string;
  profileVersion: string;
  artifactMetadata?: Record<string, unknown>;
}): LinearRiskModelArtifactV1 {
  const featureKeys = excludeFeatureKeys(
    collectFeatureKeys(input.rows, input.minFeatureCoverage),
    input.excludeFeatures
  );
  if (featureKeys.length === 0) {
    throw new Error("No numeric metricsNormalized features were found in the training samples.");
  }

  const stage2 = trainLinearStageModel({
    rows: toTrainingRows(input.rows),
    stageKey: "stage2_warning",
    outputKey: STAGE2_OUTPUT_KEY,
    labelKey: input.labelKey,
    featureKeys,
    metadata: {
      trainingMode: "difference-of-means-logit-baseline",
      stageMode: "single-stage-warning"
    }
  });

  return {
    schemaVersion: "linear-risk-model.v1",
    modelKey: input.modelKey,
    modelVersion: input.modelVersion,
    scopeType: input.scopeType,
    scopeKey: input.scopeKey,
    artifactType: "linear_risk_v1",
    featureSchemaVersion: input.featureSchemaVersion,
    labelSchemaVersion: input.labelSchemaVersion,
    profileVersion: input.profileVersion,
    trainingDatasetKeys: uniqueStrings(input.rows.map((entry) => entry.sample.sourceDataset)),
    createdAt: new Date().toISOString(),
    entrypoint: "linear-risk-v1",
    labelKey: input.labelKey,
    requiredFeatureKeys: stage2.requiredFeatureKeys,
    featureNormalization: stage2.featureNormalization,
    featureCenters: stage2.featureCenters,
    bias: stage2.bias,
    weights: stage2.weights,
    trainingSummary: stage2.trainingSummary,
    metadata: {
      trainingMode: "difference-of-means-logit-baseline",
      sourceSamplePath: input.rows[0]?.sample.sourceDataset ?? null,
      ...(input.artifactMetadata ?? {})
    }
  };
}

function buildTwoStageArtifact(input: {
  rows: readonly LabeledSampleRow[];
  labelKey: string;
  minFeatureCoverage: number;
  excludeFeatures: string[];
  modelKey: string;
  modelVersion: string | null;
  scopeType: ScopeType;
  scopeKey: string | null;
  featureSchemaVersion: string;
  labelSchemaVersion: string;
  profileVersion: string;
  artifactMetadata?: Record<string, unknown>;
}): { artifact: TwoStageLinearRiskModelArtifactV1; warnings: string[] } {
  const warnings: string[] = [];
  const baseFeatureKeys = excludeFeatureKeys(
    collectFeatureKeys(input.rows, input.minFeatureCoverage),
    input.excludeFeatures
  );
  if (baseFeatureKeys.length === 0) {
    throw new Error("No numeric metricsNormalized features were found in the training samples.");
  }

  const stage1Selection = deriveStage1FeatureKeys(baseFeatureKeys);
  if (stage1Selection.usedFallback) {
    warnings.push(
      "Stage-1 displacement feature selection fell back to the first half of numeric features because no displacement-like keys were matched."
    );
  }

  const stage1 = trainLinearStageModel({
    rows: toTrainingRows(input.rows),
    stageKey: "stage1_displacement",
    outputKey: STAGE1_OUTPUT_KEY,
    labelKey: input.labelKey,
    featureKeys: stage1Selection.featureKeys,
    metadata: {
      trainingMode: "difference-of-means-logit-baseline",
      stageMode: "displacement-evidence",
      targetMode: "warning-label-surrogate"
    }
  });

  const stage2Rows: TrainingFeatureRow[] = input.rows.map((entry) => {
    const baseFeatureValues = buildFeatureValues(entry.sample);
    const stage1Execution = runLinearRiskStage(stage1, baseFeatureValues);
    if (!stage1Execution) {
      throw new Error(`Stage-1 training pass failed for ${sampleIdForWarning(entry.sample)}.`);
    }
    return {
      label: entry.label,
      featureValues: {
        ...baseFeatureValues,
        [stage1.outputKey]: stage1Execution.score
      }
    };
  });

  const stage2FeatureKeys = uniqueStrings([...baseFeatureKeys, stage1.outputKey]);
  const stage2 = trainLinearStageModel({
    rows: stage2Rows,
    stageKey: "stage2_warning",
    outputKey: STAGE2_OUTPUT_KEY,
    labelKey: input.labelKey,
    featureKeys: stage2FeatureKeys,
    metadata: {
      trainingMode: "difference-of-means-logit-baseline",
      stageMode: "warning-fusion",
      upstreamStageKey: stage1.stageKey,
      upstreamOutputKey: stage1.outputKey
    }
  });

  const requiredFeatureKeys = uniqueStrings([
    ...stage1.requiredFeatureKeys,
    ...stage2.requiredFeatureKeys.filter((featureKey) => featureKey !== stage1.outputKey)
  ]);

  return {
    artifact: {
      schemaVersion: "linear-risk-model.v1",
      modelKey: input.modelKey,
      modelVersion: input.modelVersion,
      scopeType: input.scopeType,
      scopeKey: input.scopeKey,
      artifactType: "two_stage_linear_risk_v1",
      featureSchemaVersion: input.featureSchemaVersion,
      labelSchemaVersion: input.labelSchemaVersion,
      profileVersion: input.profileVersion,
      trainingDatasetKeys: uniqueStrings(input.rows.map((entry) => entry.sample.sourceDataset)),
      createdAt: new Date().toISOString(),
      entrypoint: "linear-risk-v1",
      labelKey: input.labelKey,
      requiredFeatureKeys,
      trainingSummary: stage2.trainingSummary,
      stage1,
      stage2,
      metadata: {
        trainingMode: "difference-of-means-logit-baseline",
        sourceSamplePath: input.rows[0]?.sample.sourceDataset ?? null,
        ...(input.artifactMetadata ?? {})
      }
    },
    warnings
  };
}

function buildStageSummaries(
  artifact: LinearRiskModelArtifactV1 | TwoStageLinearRiskModelArtifactV1
): StageSummary[] {
  if (artifact.artifactType === "linear_risk_v1") {
    return [
      {
        stageKey: "stage2_warning",
        outputKey: STAGE2_OUTPUT_KEY,
        featureCount: artifact.requiredFeatureKeys.length,
        featureKeys: artifact.requiredFeatureKeys
      }
    ];
  }

  return [
    {
      stageKey: artifact.stage1.stageKey,
      outputKey: artifact.stage1.outputKey,
      featureCount: artifact.stage1.requiredFeatureKeys.length,
      featureKeys: artifact.stage1.requiredFeatureKeys
    },
    {
      stageKey: artifact.stage2.stageKey,
      outputKey: artifact.stage2.outputKey,
      featureCount: artifact.stage2.requiredFeatureKeys.length,
      featureKeys: artifact.stage2.requiredFeatureKeys
    }
  ];
}

async function main(): Promise<void> {
  const repoRoot = resolveRepoRoot(__dirname);
  const parsed = parseArgs(process.argv.slice(2));
  const defaults = resolveDefaultPaths(repoRoot, parsed);
  const samples = await readSamples(defaults.samplesPath);
  const artifactMetadata = await readArtifactMetadataFile(parsed.artifactMetadataFile);

  if (samples.length === 0) {
    throw new Error(`No samples were loaded from ${defaults.samplesPath}.`);
  }

  const scopeType = parsed.scopeType ?? deriveScopeType(samples);
  const scopeKey = parsed.scopeKey ?? deriveScopeKey(samples, scopeType);
  const modelKey = deriveModelKey(defaults.samplesPath, parsed, scopeType, scopeKey);
  const modelVersion = parsed.modelVersion?.trim() || "0.1.0";

  const labeled = collectLabeledRows(samples, parsed.labelKey);
  if (labeled.rows.length !== samples.length) {
    labeled.warnings.push(
      `Ignored ${String(samples.length - labeled.rows.length)} rows without a binary ${parsed.labelKey} label.`
    );
  }

  const artifactResult =
    parsed.artifactType === "single-stage"
      ? {
          artifact: buildSingleStageArtifact({
            rows: labeled.rows,
            labelKey: parsed.labelKey,
            minFeatureCoverage: parsed.minFeatureCoverage,
            excludeFeatures: parsed.excludeFeatures,
            modelKey,
            modelVersion,
            scopeType,
            scopeKey,
            featureSchemaVersion: parsed.featureSchemaVersion,
            labelSchemaVersion: parsed.labelSchemaVersion,
            profileVersion: parsed.profileVersion,
            artifactMetadata
          }),
          warnings: labeled.warnings
        }
      : (() => {
          const twoStage = buildTwoStageArtifact({
            rows: labeled.rows,
            labelKey: parsed.labelKey,
            minFeatureCoverage: parsed.minFeatureCoverage,
            excludeFeatures: parsed.excludeFeatures,
            modelKey,
            modelVersion,
            scopeType,
            scopeKey,
            featureSchemaVersion: parsed.featureSchemaVersion,
            labelSchemaVersion: parsed.labelSchemaVersion,
            profileVersion: parsed.profileVersion,
            artifactMetadata
          });
          return {
            artifact: twoStage.artifact,
            warnings: [...labeled.warnings, ...twoStage.warnings]
          };
        })();

  const artifactPath = path.join(defaults.outDir, `${modelKey}.json`);
  const registryPath = path.join(defaults.outDir, "registry.json");
  const reportPath = path.join(defaults.outDir, "training-report.json");
  const registry: RegionalModelArtifactRegistryFile = { artifacts: [artifactResult.artifact] };

  await writeJsonFile(artifactPath, artifactResult.artifact);
  await writeJsonFile(registryPath, registry);

  const stageSummaries = buildStageSummaries(artifactResult.artifact);
  const report: TrainingReport = {
    generatedAt: new Date().toISOString(),
    samplesPath: defaults.samplesPath,
    outDir: defaults.outDir,
    artifactPath,
    registryPath,
    artifactType: artifactResult.artifact.artifactType,
    modelKey: artifactResult.artifact.modelKey,
    modelVersion: artifactResult.artifact.modelVersion,
    scopeType: artifactResult.artifact.scopeType,
    scopeKey: artifactResult.artifact.scopeKey,
    labelKey: artifactResult.artifact.labelKey,
    minFeatureCoverage: parsed.minFeatureCoverage,
    excludedFeatures: parsed.excludeFeatures,
    featureCount: artifactResult.artifact.requiredFeatureKeys.length,
    featureKeys: artifactResult.artifact.requiredFeatureKeys,
    artifactMetadataFile: parsed.artifactMetadataFile ?? null,
    artifactMetadataKeys: Object.keys(artifactMetadata ?? {}).sort((left, right) =>
      left.localeCompare(right)
    ),
    sampleCount: artifactResult.artifact.trainingSummary.sampleCount,
    positiveCount: artifactResult.artifact.trainingSummary.positiveCount,
    negativeCount: artifactResult.artifact.trainingSummary.negativeCount,
    datasetKeys: artifactResult.artifact.trainingDatasetKeys,
    stageSummaries,
    warnings: artifactResult.warnings
  };

  await writeJsonFile(reportPath, report);
  console.log(JSON.stringify(report, null, 2));

  if (parsed.strict && artifactResult.warnings.length > 0) {
    process.exitCode = 1;
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exitCode = 1;
});
