import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";

type WindowAggregateKind = "delta" | "last" | "max" | "mean" | "min" | "sum";

const FEATURE_WINDOW_HOURS = [6, 24, 72] as const;

const FEATURE_DEFINITIONS: Array<{
  canonicalKey: string;
  windowAggregates: WindowAggregateKind[];
}> = [
  {
    canonicalKey: "displacementSurfaceMm",
    windowAggregates: ["last", "delta", "mean", "min", "max"]
  },
  {
    canonicalKey: "crackDisplacementMm",
    windowAggregates: ["last", "delta", "mean", "min", "max"]
  },
  {
    canonicalKey: "rainfallCurrentMm",
    windowAggregates: ["last", "sum", "mean", "max"]
  },
  {
    canonicalKey: "reservoirLevelM",
    windowAggregates: ["last", "delta", "mean", "min", "max"]
  }
];

function windowAggregateFeatureKey(
  canonicalKey: string,
  aggregate: WindowAggregateKind,
  hours: number
): string {
  return `${canonicalKey}_${aggregate}_${String(hours)}h`;
}

type QualityFlag = {
  code: string;
  message: string;
  field?: string;
};

type CanonicalTrainingSample = {
  sampleId: string;
  identity: {
    regionCode?: string;
    slopeCode?: string | null;
    stationCode?: string | null;
  };
  eventTs: string;
  metricsNormalized: Record<string, number>;
  labels: Record<string, unknown>;
  sourceDataset: string;
  rawRef?: {
    originalFields?: Record<string, unknown>;
  };
  qualityFlags?: QualityFlag[];
};

type ParsedArgs = {
  samples?: string;
  outFile?: string;
  reportFile?: string;
  groupFieldCandidates: string[];
  strict: boolean;
};

type TimePoint = {
  eventTsMs: number;
  sample: CanonicalTrainingSample;
};

type CoverageSummary = {
  presentCount: number;
  coverage: number;
};

type AugmentReport = {
  generatedAt: string;
  samplesPath: string;
  outFile: string;
  reportFile: string;
  sampleCount: number;
  groupCount: number;
  groupFieldCandidates: string[];
  requestedWindows: string[];
  augmentedFeatureCount: number;
  augmentedFeatureCoverage: Record<string, CoverageSummary>;
  warnings: string[];
};

const DEFAULT_GROUP_FIELD_CANDIDATES = ["point_id", "pointId", "sensor_id", "sensorId", "crack_id"];

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
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
      case "--out-file":
        parsed.outFile = argv[index + 1];
        index += 1;
        break;
      case "--report-file":
        parsed.reportFile = argv[index + 1];
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

function resolvePaths(repoRoot: string, parsed: ParsedArgs) {
  const samplesPath = path.resolve(
    repoRoot,
    parsed.samples ?? ".tmp/regional-model-library/out/samples/threegorges/threegorges-canonical-training-samples.jsonl"
  );
  const outFile = path.resolve(
    repoRoot,
    parsed.outFile ?? samplesPath.replace(/(\.jsonl|\.json)$/iu, ".window-features$1")
  );
  const reportFile = path.resolve(
    repoRoot,
    parsed.reportFile ?? outFile.replace(/(\.jsonl|\.json)$/iu, ".report.json")
  );
  return { samplesPath, outFile, reportFile };
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

async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

async function writeJsonLines(filePath: string, values: readonly unknown[]): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${values.map((value) => JSON.stringify(value)).join("\n")}\n`, "utf-8");
}

function roundMetric(value: number): number {
  return Number(value.toFixed(6));
}

function readEventTsMs(sample: CanonicalTrainingSample): number | null {
  const value = Date.parse(sample.eventTs);
  return Number.isFinite(value) ? value : null;
}

function readOriginalFields(sample: CanonicalTrainingSample): Record<string, unknown> | null {
  const fields = sample.rawRef?.originalFields;
  return fields && typeof fields === "object" ? fields : null;
}

function readGroupKey(sample: CanonicalTrainingSample, candidates: readonly string[]): string {
  const originalFields = readOriginalFields(sample);
  if (originalFields) {
    for (const candidate of candidates) {
      const value = originalFields[candidate];
      if (typeof value === "string" && value.trim().length > 0) {
        return value.trim();
      }
      if (typeof value === "number" && Number.isFinite(value)) {
        return String(value);
      }
    }
  }

  return sample.identity.stationCode ?? sample.identity.slopeCode ?? sample.identity.regionCode ?? "unknown";
}

function hasFiniteMetric(sample: CanonicalTrainingSample, metricKey: string): boolean {
  const value = sample.metricsNormalized[metricKey];
  return typeof value === "number" && Number.isFinite(value);
}

function summarizeWindowPoints(
  groupPoints: readonly TimePoint[],
  anchorMs: number,
  metricKey: string,
  hours: number
): number[] {
  const windowStartMs = anchorMs - hours * 3600 * 1000;
  return groupPoints
    .filter((point) => point.eventTsMs >= windowStartMs && point.eventTsMs <= anchorMs)
    .map((point) => point.sample.metricsNormalized[metricKey])
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
}

function computeAggregate(values: readonly number[], aggregate: string): number | null {
  if (values.length === 0) return null;
  if (aggregate === "last") return values[values.length - 1] ?? null;
  if (aggregate === "sum") return values.reduce((sum, value) => sum + value, 0);
  if (aggregate === "mean") return values.reduce((sum, value) => sum + value, 0) / values.length;
  if (aggregate === "min") return Math.min(...values);
  if (aggregate === "max") return Math.max(...values);
  if (aggregate === "delta") {
    if (values.length < 2) return null;
    const first = values[0];
    const last = values[values.length - 1];
    return typeof first === "number" && typeof last === "number" ? last - first : null;
  }
  return null;
}

function appendQualityFlag(sample: CanonicalTrainingSample, flag: QualityFlag): QualityFlag[] {
  const existing = sample.qualityFlags ?? [];
  if (existing.some((item) => item.code === flag.code && item.field === flag.field)) {
    return existing;
  }
  return [...existing, flag];
}

function augmentSamples(
  samples: readonly CanonicalTrainingSample[],
  groupFieldCandidates: readonly string[]
): { samples: CanonicalTrainingSample[]; reportFields: Pick<AugmentReport, "groupCount" | "augmentedFeatureCount" | "augmentedFeatureCoverage" | "warnings"> } {
  const warnings: string[] = [];
  const groups = new Map<string, TimePoint[]>();
  const sampleTimes = new Map<string, number>();

  for (const sample of samples) {
    const eventTsMs = readEventTsMs(sample);
    if (eventTsMs === null) {
      warnings.push(`Skipped window feature generation for ${sample.sampleId} because eventTs is invalid.`);
      continue;
    }

    const groupKey = readGroupKey(sample, groupFieldCandidates);
    const point = { eventTsMs, sample };
    groups.set(groupKey, [...(groups.get(groupKey) ?? []), point]);
    sampleTimes.set(sample.sampleId, eventTsMs);
  }

  for (const points of groups.values()) {
    points.sort((left, right) => left.eventTsMs - right.eventTsMs);
  }

  const coverage = new Map<string, number>();
  const augmented = samples.map((sample) => {
    const eventTsMs = sampleTimes.get(sample.sampleId);
    if (typeof eventTsMs !== "number") {
      return sample;
    }

    const groupKey = readGroupKey(sample, groupFieldCandidates);
    const groupPoints = groups.get(groupKey) ?? [];
    const metricsNormalized = { ...sample.metricsNormalized };
    const generatedKeys: string[] = [];

    for (const definition of FEATURE_DEFINITIONS) {
      if (!hasFiniteMetric(sample, definition.canonicalKey)) {
        continue;
      }

      for (const hours of FEATURE_WINDOW_HOURS) {
        const values = summarizeWindowPoints(groupPoints, eventTsMs, definition.canonicalKey, hours);

        for (const aggregate of definition.windowAggregates) {
          const value = computeAggregate(values, aggregate);
          if (value === null || !Number.isFinite(value)) {
            continue;
          }

          const featureKey = windowAggregateFeatureKey(definition.canonicalKey, aggregate, hours);
          metricsNormalized[featureKey] = roundMetric(value);
          generatedKeys.push(featureKey);
          coverage.set(featureKey, (coverage.get(featureKey) ?? 0) + 1);
        }
      }
    }

    return {
      ...sample,
      metricsNormalized,
      qualityFlags:
        generatedKeys.length > 0
          ? appendQualityFlag(sample, {
              code: "offline_window_features_generated",
              message: "Runtime-aligned historical window features were generated from same-group canonical samples.",
              field: generatedKeys.join(",")
            })
          : sample.qualityFlags
    };
  });

  const augmentedFeatureCoverage = Array.from(coverage.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .reduce<Record<string, CoverageSummary>>((accumulator, [featureKey, presentCount]) => {
      accumulator[featureKey] = {
        presentCount,
        coverage: samples.length > 0 ? presentCount / samples.length : 0
      };
      return accumulator;
    }, {});

  return {
    samples: augmented,
    reportFields: {
      groupCount: groups.size,
      augmentedFeatureCount: coverage.size,
      augmentedFeatureCoverage,
      warnings
    }
  };
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  const repoRoot = process.cwd();
  const paths = resolvePaths(repoRoot, parsed);
  const samples = await readSamples(paths.samplesPath);
  const augmented = augmentSamples(samples, parsed.groupFieldCandidates);

  if (parsed.strict && augmented.reportFields.warnings.length > 0) {
    throw new Error(augmented.reportFields.warnings.join("\n"));
  }

  await writeSamples(paths.outFile, augmented.samples);
  const report: AugmentReport = {
    generatedAt: new Date().toISOString(),
    samplesPath: paths.samplesPath,
    outFile: paths.outFile,
    reportFile: paths.reportFile,
    sampleCount: samples.length,
    groupCount: augmented.reportFields.groupCount,
    groupFieldCandidates: parsed.groupFieldCandidates,
    requestedWindows: FEATURE_WINDOW_HOURS.map((hours) => `${String(hours)}h`),
    augmentedFeatureCount: augmented.reportFields.augmentedFeatureCount,
    augmentedFeatureCoverage: augmented.reportFields.augmentedFeatureCoverage,
    warnings: augmented.reportFields.warnings
  };
  await writeJsonFile(paths.reportFile, report);
  console.log(JSON.stringify(report, null, 2));
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
