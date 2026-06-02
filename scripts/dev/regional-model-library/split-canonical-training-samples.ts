import path from "node:path";
import { readFile } from "node:fs/promises";
import type { CanonicalTrainingSample } from "../../../libs/regional-model-library/src";
import { writeJsonFile, writeJsonLines } from "../../../libs/regional-model-library/src";
import { resolveRepoRoot } from "./intake-utils";

type ParsedArgs = {
  samples?: string;
  outDir?: string;
  trainFraction: number;
  labelKey: string;
  groupFieldCandidates: string[];
  strict: boolean;
};

type ResolvedPaths = {
  samplesPath: string;
  outDir: string;
  trainPath: string;
  validationPath: string;
  reportPath: string;
};

type TimestampedSample = {
  sample: CanonicalTrainingSample;
  eventTsMs: number | null;
};

type LabelSummary = {
  labeledCount: number;
  positiveCount: number;
  negativeCount: number;
};

type GroupSplitSummary = {
  groupKey: string;
  sampleCount: number;
  trainCount: number;
  validationCount: number;
  invalidEventTsCount: number;
  trainRange: {
    start: string | null;
    end: string | null;
  };
  validationRange: {
    start: string | null;
    end: string | null;
  };
};

type SplitReport = {
  generatedAt: string;
  samplesPath: string;
  outDir: string;
  trainPath: string;
  validationPath: string;
  reportPath: string;
  trainFraction: number;
  labelKey: string;
  groupFieldCandidates: string[];
  sampleCount: number;
  groupCount: number;
  trainCount: number;
  validationCount: number;
  invalidEventTsCount: number;
  trainLabelSummary: LabelSummary;
  validationLabelSummary: LabelSummary;
  groupSummaries: GroupSplitSummary[];
  warnings: string[];
};

const DEFAULT_GROUP_FIELD_CANDIDATES = ["point_id", "pointId", "sensor_id", "sensorId", "crack_id"];

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    trainFraction: 0.8,
    labelKey: "warningHitLabel",
    groupFieldCandidates: [...DEFAULT_GROUP_FIELD_CANDIDATES],
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
      case "--train-fraction": {
        const value = Number(argv[index + 1]);
        if (Number.isFinite(value) && value > 0 && value < 1) {
          parsed.trainFraction = value;
        }
        index += 1;
        break;
      }
      case "--label-key":
        parsed.labelKey = argv[index + 1] ?? parsed.labelKey;
        index += 1;
        break;
      case "--group-field-candidates":
        parsed.groupFieldCandidates = (argv[index + 1] ?? "")
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean);
        index += 1;
        break;
      case "--strict":
        parsed.strict = true;
        break;
      default:
        break;
    }
  }

  return parsed;
}

function replaceSampleSuffix(fileName: string, nextSuffix: string): string {
  return fileName.replace(/(\.jsonl|\.json)$/iu, nextSuffix);
}

function resolvePaths(repoRoot: string, parsed: ParsedArgs): ResolvedPaths {
  const samplesPath = path.resolve(
    repoRoot,
    parsed.samples ??
      ".tmp/regional-model-library/out/samples/threegorges/threegorges-canonical-training-samples.jsonl"
  );
  const fileName = path.basename(samplesPath);
  const outDir = path.resolve(repoRoot, parsed.outDir ?? path.dirname(samplesPath));
  const trainPath = path.join(outDir, replaceSampleSuffix(fileName, ".train$1"));
  const validationPath = path.join(outDir, replaceSampleSuffix(fileName, ".validation$1"));
  const reportPath = path.join(outDir, replaceSampleSuffix(fileName, ".temporal-split.report.json"));
  return { samplesPath, outDir, trainPath, validationPath, reportPath };
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

function writeSamples(filePath: string, samples: readonly CanonicalTrainingSample[]): Promise<void> {
  if (filePath.toLowerCase().endsWith(".json")) {
    return writeJsonFile(filePath, samples);
  }
  return writeJsonLines(filePath, samples);
}

function readGroupKey(sample: CanonicalTrainingSample, candidates: readonly string[]): string | null {
  const originalFields =
    typeof sample.rawRef === "object" &&
    sample.rawRef !== null &&
    typeof sample.rawRef.originalFields === "object" &&
    sample.rawRef.originalFields !== null
      ? (sample.rawRef.originalFields as Record<string, unknown>)
      : null;

  if (originalFields) {
    for (const candidate of candidates) {
      const rawValue = originalFields[candidate];
      if (typeof rawValue === "string" && rawValue.trim().length > 0) {
        return rawValue.trim();
      }
    }
  }

  return (
    sample.identity.stationCode ??
    sample.identity.slopeCode ??
    sample.identity.scopeKey ??
    sample.sourceRecordKey ??
    null
  );
}

function readEventTsMs(sample: CanonicalTrainingSample): number | null {
  const value = Date.parse(sample.eventTs);
  return Number.isFinite(value) ? value : null;
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

function summarizeLabels(samples: readonly CanonicalTrainingSample[], labelKey: string): LabelSummary {
  let labeledCount = 0;
  let positiveCount = 0;
  let negativeCount = 0;

  for (const sample of samples) {
    const label = toBinaryLabel(sample.labels[labelKey]);
    if (label === null) continue;
    labeledCount += 1;
    if (label === 1) positiveCount += 1;
    else negativeCount += 1;
  }

  return { labeledCount, positiveCount, negativeCount };
}

function toRange(samples: readonly TimestampedSample[]): { start: string | null; end: string | null } {
  const valid = samples
    .map((entry) => entry.eventTsMs)
    .filter((value): value is number => value !== null)
    .sort((left, right) => left - right);

  if (valid.length === 0) {
    return { start: null, end: null };
  }

  return {
    start: new Date(valid[0]).toISOString(),
    end: new Date(valid[valid.length - 1]).toISOString()
  };
}

function splitSamples(
  samples: readonly CanonicalTrainingSample[],
  parsed: ParsedArgs
): {
  train: CanonicalTrainingSample[];
  validation: CanonicalTrainingSample[];
  groupSummaries: GroupSplitSummary[];
  warnings: string[];
  invalidEventTsCount: number;
} {
  const warnings: string[] = [];
  const buckets = new Map<string, TimestampedSample[]>();

  for (const sample of samples) {
    const groupKey = readGroupKey(sample, parsed.groupFieldCandidates);
    if (!groupKey) {
      warnings.push(`Fell back to sourceRecordKey grouping for ${sample.sampleId}.`);
    }
    const effectiveGroupKey = groupKey ?? sample.sourceRecordKey ?? sample.sampleId;
    const bucket = buckets.get(effectiveGroupKey) ?? [];
    bucket.push({
      sample,
      eventTsMs: readEventTsMs(sample)
    });
    buckets.set(effectiveGroupKey, bucket);
  }

  const train: CanonicalTrainingSample[] = [];
  const validation: CanonicalTrainingSample[] = [];
  const groupSummaries: GroupSplitSummary[] = [];
  let invalidEventTsCount = 0;

  for (const [groupKey, entries] of Array.from(buckets.entries()).sort(([left], [right]) =>
    left.localeCompare(right)
  )) {
    const invalid = entries.filter((entry) => entry.eventTsMs === null);
    const valid = entries
      .filter((entry): entry is TimestampedSample & { eventTsMs: number } => entry.eventTsMs !== null)
      .sort((left, right) => {
        if (left.eventTsMs !== right.eventTsMs) {
          return left.eventTsMs - right.eventTsMs;
        }
        return left.sample.sampleId.localeCompare(right.sample.sampleId);
      });

    invalidEventTsCount += invalid.length;

    if (valid.length < 2) {
      train.push(...entries.map((entry) => entry.sample));
      warnings.push(`Group ${groupKey} has fewer than 2 valid timestamps, so it stayed in train only.`);
      groupSummaries.push({
        groupKey,
        sampleCount: entries.length,
        trainCount: entries.length,
        validationCount: 0,
        invalidEventTsCount: invalid.length,
        trainRange: toRange(entries),
        validationRange: { start: null, end: null }
      });
      continue;
    }

    let trainCount = Math.floor(valid.length * parsed.trainFraction);
    trainCount = Math.max(1, Math.min(valid.length - 1, trainCount));

    const trainEntries = [...valid.slice(0, trainCount), ...invalid];
    const validationEntries = valid.slice(trainCount);
    train.push(...trainEntries.map((entry) => entry.sample));
    validation.push(...validationEntries.map((entry) => entry.sample));

    groupSummaries.push({
      groupKey,
      sampleCount: entries.length,
      trainCount: trainEntries.length,
      validationCount: validationEntries.length,
      invalidEventTsCount: invalid.length,
      trainRange: toRange(trainEntries),
      validationRange: toRange(validationEntries)
    });
  }

  return { train, validation, groupSummaries, warnings, invalidEventTsCount };
}

async function main(): Promise<void> {
  const repoRoot = resolveRepoRoot(__dirname);
  const parsed = parseArgs(process.argv.slice(2));
  const resolved = resolvePaths(repoRoot, parsed);
  const samples = await readSamples(resolved.samplesPath);

  if (samples.length === 0) {
    throw new Error(`No samples were loaded from ${resolved.samplesPath}.`);
  }

  const split = splitSamples(samples, parsed);
  const report: SplitReport = {
    generatedAt: new Date().toISOString(),
    samplesPath: resolved.samplesPath,
    outDir: resolved.outDir,
    trainPath: resolved.trainPath,
    validationPath: resolved.validationPath,
    reportPath: resolved.reportPath,
    trainFraction: parsed.trainFraction,
    labelKey: parsed.labelKey,
    groupFieldCandidates: parsed.groupFieldCandidates,
    sampleCount: samples.length,
    groupCount: split.groupSummaries.length,
    trainCount: split.train.length,
    validationCount: split.validation.length,
    invalidEventTsCount: split.invalidEventTsCount,
    trainLabelSummary: summarizeLabels(split.train, parsed.labelKey),
    validationLabelSummary: summarizeLabels(split.validation, parsed.labelKey),
    groupSummaries: split.groupSummaries,
    warnings: split.warnings
  };

  await writeSamples(resolved.trainPath, split.train);
  await writeSamples(resolved.validationPath, split.validation);
  await writeJsonFile(resolved.reportPath, report);
  console.log(JSON.stringify(report, null, 2));

  if (parsed.strict && split.validation.length === 0) {
    process.exitCode = 1;
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exitCode = 1;
});
