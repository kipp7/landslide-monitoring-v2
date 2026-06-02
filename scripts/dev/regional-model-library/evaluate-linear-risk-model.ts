import path from "node:path";
import { readFile } from "node:fs/promises";
import type {
  CanonicalTrainingSample,
  LinearRiskModelArtifactV1,
  LinearRiskStageExecution,
  RegionalModelArtifact,
  RegionalModelArtifactRegistryFile,
  ScopeType,
  TwoStageLinearRiskModelArtifactV1
} from "../../../libs/regional-model-library/src";
import { runLinearRiskStage, writeJsonFile } from "../../../libs/regional-model-library/src";
import { resolveRepoRoot } from "./intake-utils";

type ParsedArgs = {
  samples?: string;
  artifact?: string;
  registry?: string;
  outFile?: string;
  labelKey: string;
  threshold: number;
  thresholdMode: "fixed" | "maximize-f1" | "maximize-balanced-accuracy" | "maximize-youden-j";
  strict: boolean;
  writebackReplayMetadata: boolean;
};

type ReplayPredictionRow = {
  sampleId: string;
  scopeType: ScopeType;
  scopeKey: string;
  artifactKey: string | null;
  artifactType: RegionalModelArtifact["artifactType"] | null;
  score: number;
  label: number;
  predictedLabel: number;
  fallbackReason: string | null;
  missingFeatureKeys: string[];
  stage1Score: number | null;
  stage2Score: number | null;
};

type ReplayMetricSummary = {
  sampleCount: number;
  threshold: number;
  accuracy: number;
  precision: number;
  recall: number;
  f1: number;
  brier: number;
  auc: number | null;
  specificity: number;
  balancedAccuracy: number;
  youdenJ: number;
  primaryScore: number;
};

type ReplayEvaluationReport = {
  generatedAt: string;
  samplesPath: string;
  artifactSourcePath: string;
  outputPath: string;
  labelKey: string;
  thresholdMode: ParsedArgs["thresholdMode"];
  requestedThreshold: number;
  threshold: number;
  sampleCount: number;
  evaluatedCount: number;
  matchedArtifactCount: number;
  fallbackCount: number;
  accuracy: number;
  precision: number;
  recall: number;
  f1: number;
  brier: number;
  auc: number | null;
  confusion: {
    tp: number;
    fp: number;
    tn: number;
    fn: number;
  };
  artifactUsage: Array<{
    artifactKey: string;
    sampleCount: number;
  }>;
  replaySummariesByArtifact: Record<string, ReplayMetricSummary>;
  thresholdSelection: {
    metric: "f1" | "balanced-accuracy" | "youden-j" | null;
    candidateCount: number;
    topCandidates: Array<{
      threshold: number;
      f1: number;
      precision: number;
      recall: number;
      accuracy: number;
      balancedAccuracy: number;
      youdenJ: number;
    }>;
  } | null;
  warnings: string[];
  predictions: ReplayPredictionRow[];
};

type ArtifactExecution = {
  artifactKey: string;
  artifactType: RegionalModelArtifact["artifactType"];
  score: number | null;
  fallbackReason: string | null;
  missingFeatureKeys: string[];
  stage1: LinearRiskStageExecution | null;
  stage2: LinearRiskStageExecution | null;
};

type ScoredReplayRow = Omit<ReplayPredictionRow, "predictedLabel">;

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    labelKey: "warningHitLabel",
    threshold: 0.5,
    thresholdMode: "fixed",
    strict: false,
    writebackReplayMetadata: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token) continue;

    switch (token) {
      case "--samples":
        parsed.samples = argv[index + 1];
        index += 1;
        break;
      case "--artifact":
        parsed.artifact = argv[index + 1];
        index += 1;
        break;
      case "--registry":
        parsed.registry = argv[index + 1];
        index += 1;
        break;
      case "--out-file":
        parsed.outFile = argv[index + 1];
        index += 1;
        break;
      case "--label-key":
        parsed.labelKey = argv[index + 1] ?? parsed.labelKey;
        index += 1;
        break;
      case "--threshold": {
        const value = Number(argv[index + 1]);
        if (Number.isFinite(value)) parsed.threshold = value;
        index += 1;
        break;
      }
      case "--threshold-mode": {
        const value = argv[index + 1];
        if (
          value === "fixed" ||
          value === "maximize-f1" ||
          value === "maximize-balanced-accuracy" ||
          value === "maximize-youden-j"
        ) {
          parsed.thresholdMode = value;
        }
        index += 1;
        break;
      }
      case "--strict":
        parsed.strict = true;
        break;
      case "--writeback-replay-metadata":
        parsed.writebackReplayMetadata = true;
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
  const artifactSourcePath = path.resolve(
    repoRoot,
    parsed.registry ??
      parsed.artifact ??
      ".tmp/regional-model-library/out/artifacts-smoke/threegorges/registry.json"
  );
  const outputPath = path.resolve(
    repoRoot,
    parsed.outFile ?? ".tmp/regional-model-library/out/replay/linear-risk-eval.report.json"
  );

  return { samplesPath, artifactSourcePath, outputPath };
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

async function readArtifactSource(
  filePath: string
): Promise<
  | { mode: "registry"; source: RegionalModelArtifactRegistryFile; artifacts: RegionalModelArtifact[] }
  | { mode: "artifact"; source: RegionalModelArtifact; artifacts: RegionalModelArtifact[] }
> {
  const content = await readFile(filePath, "utf-8");
  const parsed = JSON.parse(content) as unknown;

  if (
    typeof parsed === "object" &&
    parsed !== null &&
    Array.isArray((parsed as RegionalModelArtifactRegistryFile).artifacts)
  ) {
    const source = parsed as RegionalModelArtifactRegistryFile;
    return {
      mode: "registry",
      source,
      artifacts: source.artifacts
    };
  }

  const source = parsed as RegionalModelArtifact;
  return {
    mode: "artifact",
    source,
    artifacts: [source]
  };
}

function toBinaryLabel(value: unknown): number | null {
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

function buildFeatureValues(sample: CanonicalTrainingSample): Record<string, number> {
  return Object.entries(sample.metricsNormalized).reduce<Record<string, number>>((accumulator, [featureKey, value]) => {
    if (typeof value === "number" && Number.isFinite(value)) {
      accumulator[featureKey] = value;
    }
    return accumulator;
  }, {});
}

function matchArtifact(
  artifacts: readonly RegionalModelArtifact[],
  sample: CanonicalTrainingSample
): RegionalModelArtifact | null {
  const scopes: Array<{ scopeType: ScopeType; scopeKey: string | null }> = [
    { scopeType: "station", scopeKey: sample.identity.stationCode ?? null },
    { scopeType: "slope", scopeKey: sample.identity.slopeCode ?? null },
    { scopeType: "region", scopeKey: sample.identity.regionCode ?? null },
    { scopeType: "global", scopeKey: null }
  ];

  for (const scope of scopes) {
    const matched = artifacts.find((artifact) => {
      if (artifact.scopeType !== scope.scopeType) return false;
      if (artifact.scopeType === "global") return true;
      return (artifact.scopeKey ?? null) === scope.scopeKey;
    });
    if (matched) return matched;
  }

  return null;
}

function runSingleStageArtifact(
  artifact: LinearRiskModelArtifactV1,
  featureValues: Record<string, number>
): ArtifactExecution {
  const stage2 = runLinearRiskStage(
    {
      stageKey: "stage2_warning",
      outputKey: "stage2WarningScore",
      labelKey: artifact.labelKey,
      requiredFeatureKeys: artifact.requiredFeatureKeys,
      featureNormalization: artifact.featureNormalization,
      featureCenters: artifact.featureCenters,
      bias: artifact.bias,
      weights: artifact.weights,
      trainingSummary: artifact.trainingSummary,
      ...(artifact.metadata ? { metadata: artifact.metadata } : {})
    },
    featureValues
  );

  if (!stage2) {
    return {
      artifactKey: artifact.modelKey,
      artifactType: artifact.artifactType,
      score: null,
      fallbackReason: "missing-required-features",
      missingFeatureKeys: artifact.requiredFeatureKeys.filter(
        (featureKey) => typeof featureValues[featureKey] !== "number"
      ),
      stage1: null,
      stage2: null
    };
  }

  return {
    artifactKey: artifact.modelKey,
    artifactType: artifact.artifactType,
    score: stage2.score,
    fallbackReason: null,
    missingFeatureKeys: [],
    stage1: null,
    stage2
  };
}

function runTwoStageArtifact(
  artifact: TwoStageLinearRiskModelArtifactV1,
  featureValues: Record<string, number>
): ArtifactExecution {
  const stage1 = runLinearRiskStage(artifact.stage1, featureValues);
  if (!stage1) {
    return {
      artifactKey: artifact.modelKey,
      artifactType: artifact.artifactType,
      score: null,
      fallbackReason: "missing-required-features",
      missingFeatureKeys: artifact.stage1.requiredFeatureKeys.filter(
        (featureKey) => typeof featureValues[featureKey] !== "number"
      ),
      stage1: null,
      stage2: null
    };
  }

  const stage2FeatureValues = {
    ...featureValues,
    [artifact.stage1.outputKey]: stage1.score
  };
  const stage2 = runLinearRiskStage(artifact.stage2, stage2FeatureValues);
  if (!stage2) {
    return {
      artifactKey: artifact.modelKey,
      artifactType: artifact.artifactType,
      score: null,
      fallbackReason: "missing-required-features",
      missingFeatureKeys: artifact.stage2.requiredFeatureKeys.filter(
        (featureKey) => typeof stage2FeatureValues[featureKey] !== "number"
      ),
      stage1,
      stage2: null
    };
  }

  return {
    artifactKey: artifact.modelKey,
    artifactType: artifact.artifactType,
    score: stage2.score,
    fallbackReason: null,
    missingFeatureKeys: [],
    stage1,
    stage2
  };
}

function executeArtifact(
  artifact: RegionalModelArtifact,
  sample: CanonicalTrainingSample
): ArtifactExecution {
  const featureValues = buildFeatureValues(sample);
  if (artifact.artifactType === "two_stage_linear_risk_v1") {
    return runTwoStageArtifact(artifact, featureValues);
  }
  return runSingleStageArtifact(artifact, featureValues);
}

function divide(numerator: number, denominator: number): number {
  if (!Number.isFinite(denominator) || denominator <= 0) return 0;
  return numerator / denominator;
}

function computeAuc(rows: readonly ReplayPredictionRow[]): number | null {
  const positives = rows.filter((row) => row.label === 1);
  const negatives = rows.filter((row) => row.label === 0);
  if (positives.length === 0 || negatives.length === 0) return null;

  let wins = 0;
  let ties = 0;
  for (const positive of positives) {
    for (const negative of negatives) {
      if (positive.score > negative.score) wins += 1;
      else if (positive.score === negative.score) ties += 1;
    }
  }

  return (wins + ties * 0.5) / (positives.length * negatives.length);
}

function summarizeReplayMetrics(
  rows: readonly ReplayPredictionRow[],
  threshold: number
): ReplayMetricSummary {
  const tp = rows.filter((row) => row.label === 1 && row.predictedLabel === 1).length;
  const fp = rows.filter((row) => row.label === 0 && row.predictedLabel === 1).length;
  const tn = rows.filter((row) => row.label === 0 && row.predictedLabel === 0).length;
  const fn = rows.filter((row) => row.label === 1 && row.predictedLabel === 0).length;
  const accuracy = divide(tp + tn, rows.length);
  const precision = divide(tp, tp + fp);
  const recall = divide(tp, tp + fn);
  const f1 = divide(2 * precision * recall, precision + recall);
  const specificity = divide(tn, tn + fp);
  const balancedAccuracy = (recall + specificity) / 2;
  const youdenJ = recall + specificity - 1;
  const brier =
    rows.length === 0
      ? 0
      : rows.reduce((sum, row) => sum + (row.score - row.label) ** 2, 0) / rows.length;
  const auc = computeAuc(rows);
  const primaryScore = divide(f1 + (auc ?? accuracy), 2);

  return {
    sampleCount: rows.length,
    threshold,
    accuracy,
    precision,
    recall,
    f1,
    brier,
    auc,
    specificity,
    balancedAccuracy,
    youdenJ,
    primaryScore
  };
}

function materializePredictions(
  rows: readonly ScoredReplayRow[],
  threshold: number
): ReplayPredictionRow[] {
  return rows.map((row) => ({
    ...row,
    predictedLabel: row.score >= threshold ? 1 : 0
  }));
}

function roundThreshold(value: number): number {
  return Number(value.toFixed(6));
}

function pickMetricValue(
  summary: ReplayMetricSummary,
  thresholdMode: ParsedArgs["thresholdMode"]
): number {
  switch (thresholdMode) {
    case "maximize-f1":
      return summary.f1;
    case "maximize-balanced-accuracy":
      return summary.balancedAccuracy;
    case "maximize-youden-j":
      return summary.youdenJ;
    default:
      return summary.f1;
  }
}

function selectThreshold(
  rows: readonly ScoredReplayRow[],
  parsed: ParsedArgs
): {
  threshold: number;
  predictions: ReplayPredictionRow[];
  thresholdSelection: ReplayEvaluationReport["thresholdSelection"];
} {
  if (parsed.thresholdMode === "fixed") {
    return {
      threshold: parsed.threshold,
      predictions: materializePredictions(rows, parsed.threshold),
      thresholdSelection: null
    };
  }

  const uniqueScores = Array.from(
    new Set(
      rows
        .map((row) => roundThreshold(row.score))
        .filter((value) => Number.isFinite(value))
    )
  ).sort((left, right) => right - left);
  const candidateThresholds = Array.from(
    new Set([1, ...uniqueScores, 0].map((value) => roundThreshold(value)))
  ).sort((left, right) => right - left);

  const candidates = candidateThresholds.map((threshold) => {
    const predictions = materializePredictions(rows, threshold);
    const summary = summarizeReplayMetrics(predictions, threshold);
    return { threshold, predictions, summary };
  });

  let best = candidates[0] ?? {
    threshold: parsed.threshold,
    predictions: materializePredictions(rows, parsed.threshold),
    summary: summarizeReplayMetrics(materializePredictions(rows, parsed.threshold), parsed.threshold)
  };

  for (const candidate of candidates) {
    const candidateMetric = pickMetricValue(candidate.summary, parsed.thresholdMode);
    const bestMetric = pickMetricValue(best.summary, parsed.thresholdMode);
    if (candidateMetric > bestMetric) {
      best = candidate;
      continue;
    }
    if (candidateMetric === bestMetric) {
      if (candidate.summary.accuracy > best.summary.accuracy) {
        best = candidate;
        continue;
      }
      if (
        candidate.summary.accuracy === best.summary.accuracy &&
        candidate.summary.precision > best.summary.precision
      ) {
        best = candidate;
        continue;
      }
      if (
        candidate.summary.accuracy === best.summary.accuracy &&
        candidate.summary.precision === best.summary.precision &&
        candidate.summary.recall > best.summary.recall
      ) {
        best = candidate;
      }
    }
  }

  const metric =
    parsed.thresholdMode === "maximize-f1"
      ? "f1"
      : parsed.thresholdMode === "maximize-balanced-accuracy"
        ? "balanced-accuracy"
        : "youden-j";

  return {
    threshold: best.threshold,
    predictions: best.predictions,
    thresholdSelection: {
      metric,
      candidateCount: candidateThresholds.length,
      topCandidates: candidates
        .sort((left, right) => {
          const delta =
            pickMetricValue(right.summary, parsed.thresholdMode) -
            pickMetricValue(left.summary, parsed.thresholdMode);
          if (delta !== 0) return delta;
          const accuracyDelta = right.summary.accuracy - left.summary.accuracy;
          if (accuracyDelta !== 0) return accuracyDelta;
          const precisionDelta = right.summary.precision - left.summary.precision;
          if (precisionDelta !== 0) return precisionDelta;
          const recallDelta = right.summary.recall - left.summary.recall;
          if (recallDelta !== 0) return recallDelta;
          return right.threshold - left.threshold;
        })
        .slice(0, 10)
        .map((candidate) => ({
          threshold: candidate.threshold,
          f1: candidate.summary.f1,
          precision: candidate.summary.precision,
          recall: candidate.summary.recall,
          accuracy: candidate.summary.accuracy,
          balancedAccuracy: candidate.summary.balancedAccuracy,
          youdenJ: candidate.summary.youdenJ
        }))
    }
  };
}

function attachReplaySummaryToArtifact(
  artifact: RegionalModelArtifact,
  replaySummary: ReplayMetricSummary
): RegionalModelArtifact {
  return {
    ...artifact,
    metadata: {
      ...(artifact.metadata ?? {}),
      replaySummary: {
        updatedAt: new Date().toISOString(),
        ...replaySummary
      }
    }
  };
}

async function main(): Promise<void> {
  const repoRoot = resolveRepoRoot(__dirname);
  const parsed = parseArgs(process.argv.slice(2));
  const defaults = resolveDefaultPaths(repoRoot, parsed);
  const samples = await readSamples(defaults.samplesPath);
  const artifactSource = await readArtifactSource(defaults.artifactSourcePath);
  const artifacts = artifactSource.artifacts;

  if (samples.length === 0) {
    throw new Error(`No samples were loaded from ${defaults.samplesPath}.`);
  }
  if (artifacts.length === 0) {
    throw new Error(`No artifacts were loaded from ${defaults.artifactSourcePath}.`);
  }

  const warnings: string[] = [];
  const scoredRows: ScoredReplayRow[] = [];
  const artifactUsage = new Map<string, number>();

  for (const sample of samples) {
    const label = toBinaryLabel(sample.labels[parsed.labelKey]);
    if (label === null) {
      warnings.push(`Skipped ${sample.sampleId} because ${parsed.labelKey} is not binary.`);
      continue;
    }

    const artifact = matchArtifact(artifacts, sample);
    const executed = artifact ? executeArtifact(artifact, sample) : null;
    if (executed?.fallbackReason === "missing-required-features") {
      warnings.push(
        `Fell back on ${sample.sampleId} because required features were missing for ${executed.artifactKey}.`
      );
    }

    const finalScore = executed?.score ?? 0.5;
    const artifactKey = executed?.artifactKey ?? null;
    if (artifactKey) {
      artifactUsage.set(artifactKey, (artifactUsage.get(artifactKey) ?? 0) + 1);
    }

    scoredRows.push({
      sampleId: sample.sampleId,
      scopeType: sample.identity.scopeType,
      scopeKey: sample.identity.scopeKey,
      artifactKey,
      artifactType: executed?.artifactType ?? null,
      score: finalScore,
      label,
      fallbackReason: executed ? executed.fallbackReason : "no-matching-artifact",
      missingFeatureKeys: executed?.missingFeatureKeys ?? [],
      stage1Score: executed?.stage1?.score ?? null,
      stage2Score: executed?.stage2?.score ?? null
    });
  }

  const thresholdResult = selectThreshold(scoredRows, parsed);
  const predictions = thresholdResult.predictions;
  const overallSummary = summarizeReplayMetrics(predictions, thresholdResult.threshold);
  const tp = predictions.filter((row) => row.label === 1 && row.predictedLabel === 1).length;
  const fp = predictions.filter((row) => row.label === 0 && row.predictedLabel === 1).length;
  const tn = predictions.filter((row) => row.label === 0 && row.predictedLabel === 0).length;
  const fn = predictions.filter((row) => row.label === 1 && row.predictedLabel === 0).length;
  const replaySummariesByArtifact = Object.fromEntries(
    Array.from(artifactUsage.keys())
      .sort((left, right) => left.localeCompare(right))
      .map((artifactKey) => [
        artifactKey,
        summarizeReplayMetrics(
          predictions.filter((row) => row.artifactKey === artifactKey),
          thresholdResult.threshold
        )
      ])
  );

  const report: ReplayEvaluationReport = {
    generatedAt: new Date().toISOString(),
    samplesPath: defaults.samplesPath,
    artifactSourcePath: defaults.artifactSourcePath,
    outputPath: defaults.outputPath,
    labelKey: parsed.labelKey,
    thresholdMode: parsed.thresholdMode,
    requestedThreshold: parsed.threshold,
    threshold: thresholdResult.threshold,
    sampleCount: samples.length,
    evaluatedCount: predictions.length,
    matchedArtifactCount: predictions.filter((row) => row.artifactKey !== null).length,
    fallbackCount: predictions.filter((row) => row.fallbackReason !== null).length,
    accuracy: overallSummary.accuracy,
    precision: overallSummary.precision,
    recall: overallSummary.recall,
    f1: overallSummary.f1,
    brier: overallSummary.brier,
    auc: overallSummary.auc,
    confusion: { tp, fp, tn, fn },
    artifactUsage: Array.from(artifactUsage.entries())
      .map(([artifactKey, sampleCount]) => ({ artifactKey, sampleCount }))
      .sort((left, right) => right.sampleCount - left.sampleCount),
    replaySummariesByArtifact,
    thresholdSelection: thresholdResult.thresholdSelection,
    warnings,
    predictions
  };

  await writeJsonFile(defaults.outputPath, report);

  if (parsed.writebackReplayMetadata) {
    if (artifactSource.mode === "registry") {
      const updatedRegistry: RegionalModelArtifactRegistryFile = {
        artifacts: artifactSource.source.artifacts.map((artifact) => {
          const replaySummary = replaySummariesByArtifact[artifact.modelKey];
          return replaySummary ? attachReplaySummaryToArtifact(artifact, replaySummary) : artifact;
        })
      };
      await writeJsonFile(defaults.artifactSourcePath, updatedRegistry);
    } else {
      const replaySummary = replaySummariesByArtifact[artifactSource.source.modelKey];
      if (replaySummary) {
        await writeJsonFile(
          defaults.artifactSourcePath,
          attachReplaySummaryToArtifact(artifactSource.source, replaySummary)
        );
      }
    }
  }

  console.log(JSON.stringify(report, null, 2));

  if (parsed.strict && warnings.length > 0) {
    process.exitCode = 1;
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exitCode = 1;
});
