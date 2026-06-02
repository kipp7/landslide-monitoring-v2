import path from "node:path";
import { readFile } from "node:fs/promises";
import type { CanonicalTrainingSample, QualityFlag } from "../../../libs/regional-model-library/src";
import { writeJsonFile, writeJsonLines } from "../../../libs/regional-model-library/src";
import { resolveRepoRoot } from "./intake-utils";

type ParsedArgs = {
  samples?: string;
  outFile?: string;
  reportFile?: string;
  displacementMetricKey: string;
  displacementLabelKey: string;
  warningLabelKey: string;
  groupFieldCandidates: string[];
  thresholdMode: "percentile" | "fixed";
  thresholdValue?: number;
  thresholdPercentile: number;
  strict: boolean;
};

type PointEnvelope = {
  index: number;
  sample: CanonicalTrainingSample;
  eventTsMs: number;
  groupKey: string;
  displacementValue: number;
};

type GroupSummary = {
  groupKey: string;
  sampleCount: number;
  labeledCount: number;
  terminalCount: number;
};

type DeriveLabelsReport = {
  generatedAt: string;
  samplesPath: string;
  outFile: string;
  reportFile: string;
  displacementMetricKey: string;
  displacementLabelKey: string;
  warningLabelKey: string;
  thresholdMode: "percentile" | "fixed";
  thresholdValue: number;
  thresholdPercentile: number | null;
  groupFieldCandidates: string[];
  sampleCount: number;
  labeledCount: number;
  unlabeledCount: number;
  positiveCount: number;
  negativeCount: number;
  groupCount: number;
  leadHours: {
    min: number | null;
    max: number | null;
    mean: number | null;
  };
  futureDisplacementDeltaMm: {
    min: number | null;
    max: number | null;
    mean: number | null;
    median: number | null;
    p80: number | null;
    p90: number | null;
    p95: number | null;
  };
  groupSummaries: GroupSummary[];
  warnings: string[];
};

const DEFAULT_GROUP_FIELD_CANDIDATES = ["point_id", "pointId", "sensor_id", "sensorId", "crack_id"];

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    displacementMetricKey: "displacementSurfaceMm",
    displacementLabelKey: "displacementLabel",
    warningLabelKey: "warningHitLabel",
    groupFieldCandidates: [...DEFAULT_GROUP_FIELD_CANDIDATES],
    thresholdMode: "percentile",
    thresholdPercentile: 0.9,
    strict: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token) {
      continue;
    }

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
      case "--displacement-metric-key":
        parsed.displacementMetricKey = argv[index + 1] ?? parsed.displacementMetricKey;
        index += 1;
        break;
      case "--displacement-label-key":
        parsed.displacementLabelKey = argv[index + 1] ?? parsed.displacementLabelKey;
        index += 1;
        break;
      case "--warning-label-key":
        parsed.warningLabelKey = argv[index + 1] ?? parsed.warningLabelKey;
        index += 1;
        break;
      case "--group-field-candidates": {
        const value = argv[index + 1];
        if (value) {
          parsed.groupFieldCandidates = value
            .split(",")
            .map((item) => item.trim())
            .filter((item) => item.length > 0);
        }
        index += 1;
        break;
      }
      case "--threshold-mode": {
        const value = argv[index + 1];
        if (value === "percentile" || value === "fixed") {
          parsed.thresholdMode = value;
        }
        index += 1;
        break;
      }
      case "--threshold-value": {
        const value = Number(argv[index + 1]);
        if (Number.isFinite(value)) {
          parsed.thresholdValue = value;
        }
        index += 1;
        break;
      }
      case "--threshold-percentile": {
        const value = Number(argv[index + 1]);
        if (Number.isFinite(value) && value > 0 && value < 1) {
          parsed.thresholdPercentile = value;
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

function withDefaultPaths(repoRoot: string, parsed: ParsedArgs): {
  samplesPath: string;
  outFile: string;
  reportFile: string;
} {
  const samplesPath = path.resolve(
    repoRoot,
    parsed.samples ??
      ".tmp/regional-model-library/out/threegorges-baijiabao/samples/threegorges/threegorges-canonical-training-samples.jsonl"
  );

  const defaultOutFile = samplesPath.replace(/(\.jsonl|\.json)$/iu, ".future-labels$1");
  const outFile = path.resolve(repoRoot, parsed.outFile ?? defaultOutFile);
  const reportFile = path.resolve(
    repoRoot,
    parsed.reportFile ?? outFile.replace(/(\.jsonl|\.json)$/iu, ".report.json")
  );

  return { samplesPath, outFile, reportFile };
}

function readGroupKey(sample: CanonicalTrainingSample, candidates: readonly string[]): string | null {
  const originalFields = sample.rawRef?.originalFields;
  if (!originalFields) {
    return null;
  }

  for (const candidate of candidates) {
    const value = originalFields[candidate];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return null;
}

function readEventTsMs(sample: CanonicalTrainingSample): number | null {
  const value = Date.parse(sample.eventTs);
  return Number.isFinite(value) ? value : null;
}

function readDisplacementValue(sample: CanonicalTrainingSample, metricKey: string): number | null {
  const value = sample.metricsNormalized[metricKey];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function quantile(values: readonly number[], percentile: number): number | null {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const position = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * percentile)));
  return sorted[position] ?? null;
}

function mean(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: readonly number[]): number | null {
  return quantile(values, 0.5);
}

function buildPointEnvelopes(
  samples: readonly CanonicalTrainingSample[],
  parsed: ParsedArgs
): { envelopesByGroup: Map<string, PointEnvelope[]>; warnings: string[] } {
  const warnings: string[] = [];
  const envelopesByGroup = new Map<string, PointEnvelope[]>();

  samples.forEach((sample, index) => {
    const groupKey = readGroupKey(sample, parsed.groupFieldCandidates);
    const eventTsMs = readEventTsMs(sample);
    const displacementValue = readDisplacementValue(sample, parsed.displacementMetricKey);

    if (!groupKey || eventTsMs === null || displacementValue === null) {
      const reason = !groupKey
        ? "missing group key"
        : eventTsMs === null
          ? "invalid eventTs"
          : `missing numeric ${parsed.displacementMetricKey}`;
      warnings.push(`Skipped ${sample.sampleId} because it has ${reason}.`);
      return;
    }

    const bucket = envelopesByGroup.get(groupKey) ?? [];
    bucket.push({
      index,
      sample,
      eventTsMs,
      groupKey,
      displacementValue
    });
    envelopesByGroup.set(groupKey, bucket);
  });

  for (const envelopes of envelopesByGroup.values()) {
    envelopes.sort((left, right) => {
      if (left.eventTsMs !== right.eventTsMs) {
        return left.eventTsMs - right.eventTsMs;
      }
      return left.index - right.index;
    });
  }

  return { envelopesByGroup, warnings };
}

function deriveThreshold(
  parsed: ParsedArgs,
  futureRatesMmPerDay: readonly number[]
): number {
  if (parsed.thresholdMode === "fixed") {
    if (parsed.thresholdValue === undefined || !Number.isFinite(parsed.thresholdValue)) {
      throw new Error("Fixed threshold mode requires --threshold-value <number>.");
    }
    return parsed.thresholdValue;
  }

  const derived = quantile(futureRatesMmPerDay, parsed.thresholdPercentile);
  if (derived === null) {
    throw new Error("Cannot derive percentile threshold because no future displacement rates were computed.");
  }
  return derived;
}

function enrichSamples(
  samples: readonly CanonicalTrainingSample[],
  parsed: ParsedArgs
): { enrichedSamples: CanonicalTrainingSample[]; report: Omit<DeriveLabelsReport, "generatedAt" | "samplesPath" | "outFile" | "reportFile"> } {
  const { envelopesByGroup, warnings } = buildPointEnvelopes(samples, parsed);
  const futureRatesMmPerDay: number[] = [];
  const futureDeltaMm: number[] = [];
  const leadHours: number[] = [];
  const derivedBySampleIndex = new Map<
    number,
    {
      deltaMm: number;
      leadHours: number;
      rateMmPerDay: number;
    }
  >();
  const groupSummaries: GroupSummary[] = [];

  for (const [groupKey, envelopes] of envelopesByGroup) {
    let labeledCount = 0;
    let terminalCount = 0;

    for (let index = 0; index < envelopes.length; index += 1) {
      const current = envelopes[index];
      const next = envelopes[index + 1];
      if (!current || !next) {
        terminalCount += 1;
        continue;
      }

      const deltaMs = next.eventTsMs - current.eventTsMs;
      if (!Number.isFinite(deltaMs) || deltaMs <= 0) {
        warnings.push(
          `Skipped derived label for ${current.sample.sampleId} because the next row in group ${groupKey} is not later in time.`
        );
        continue;
      }

      const deltaMm = next.displacementValue - current.displacementValue;
      const leadHoursValue = deltaMs / (1000 * 60 * 60);
      const leadDays = leadHoursValue / 24;
      const rateMmPerDay = leadDays > 0 ? deltaMm / leadDays : deltaMm;

      derivedBySampleIndex.set(current.index, {
        deltaMm,
        leadHours: leadHoursValue,
        rateMmPerDay
      });
      futureDeltaMm.push(deltaMm);
      futureRatesMmPerDay.push(rateMmPerDay);
      leadHours.push(leadHoursValue);
      labeledCount += 1;
    }

    groupSummaries.push({
      groupKey,
      sampleCount: envelopes.length,
      labeledCount,
      terminalCount
    });
  }

  const thresholdValue = deriveThreshold(parsed, futureRatesMmPerDay);
  let positiveCount = 0;
  let negativeCount = 0;
  let labeledCount = 0;

  const enrichedSamples = samples.map((sample, index) => {
    const derived = derivedBySampleIndex.get(index);
    if (!derived) {
      const terminalFlag: QualityFlag = {
        code: "future_displacement_label_unavailable",
        severity: "info",
        message: "No future sample exists inside the same displacement group, so derived future labels were not written."
      };
      return {
        ...sample,
        qualityFlags: [...sample.qualityFlags, terminalFlag]
      };
    }

    const warningHit = derived.rateMmPerDay >= thresholdValue;
    labeledCount += 1;
    if (warningHit) {
      positiveCount += 1;
    } else {
      negativeCount += 1;
    }

    return {
      ...sample,
      labels: {
        ...sample.labels,
        [parsed.displacementLabelKey]: Number(derived.deltaMm.toFixed(6)),
        [parsed.warningLabelKey]: warningHit
      },
      labelMetadata: {
        ...(sample.labelMetadata ?? {}),
        [parsed.displacementLabelKey]: {
          valueType: "number",
          derivationMode: "derived-future-delta",
          sourceField: `metricsNormalized.${parsed.displacementMetricKey}`,
          horizonSpec: `${Number(derived.leadHours.toFixed(3))}h`
        },
        [parsed.warningLabelKey]: {
          valueType: "boolean",
          derivationMode: "derived-threshold",
          sourceField: `metricsNormalized.${parsed.displacementMetricKey}`,
          horizonSpec: `${Number(derived.leadHours.toFixed(3))}h`
        }
      },
      qualityFlags: [
        ...sample.qualityFlags,
        {
          code: "derived_future_displacement_label",
          severity: "info",
          message: `Derived ${parsed.displacementLabelKey} and ${parsed.warningLabelKey} from the next grouped displacement observation using a ${thresholdValue.toFixed(6)} mm/day threshold.`
        }
      ]
    };
  });

  return {
    enrichedSamples,
    report: {
      displacementMetricKey: parsed.displacementMetricKey,
      displacementLabelKey: parsed.displacementLabelKey,
      warningLabelKey: parsed.warningLabelKey,
      thresholdMode: parsed.thresholdMode,
      thresholdValue,
      thresholdPercentile: parsed.thresholdMode === "percentile" ? parsed.thresholdPercentile : null,
      groupFieldCandidates: parsed.groupFieldCandidates,
      sampleCount: samples.length,
      labeledCount,
      unlabeledCount: samples.length - labeledCount,
      positiveCount,
      negativeCount,
      groupCount: envelopesByGroup.size,
      leadHours: {
        min: leadHours.length > 0 ? Math.min(...leadHours) : null,
        max: leadHours.length > 0 ? Math.max(...leadHours) : null,
        mean: mean(leadHours)
      },
      futureDisplacementDeltaMm: {
        min: futureDeltaMm.length > 0 ? Math.min(...futureDeltaMm) : null,
        max: futureDeltaMm.length > 0 ? Math.max(...futureDeltaMm) : null,
        mean: mean(futureDeltaMm),
        median: median(futureDeltaMm),
        p80: quantile(futureDeltaMm, 0.8),
        p90: quantile(futureDeltaMm, 0.9),
        p95: quantile(futureDeltaMm, 0.95)
      },
      groupSummaries: groupSummaries.sort((left, right) => left.groupKey.localeCompare(right.groupKey)),
      warnings
    }
  };
}

async function main(): Promise<void> {
  const repoRoot = resolveRepoRoot(__dirname);
  const parsed = parseArgs(process.argv.slice(2));
  const resolved = withDefaultPaths(repoRoot, parsed);
  const samples = await readSamples(resolved.samplesPath);
  if (samples.length === 0) {
    throw new Error(`No samples were loaded from ${resolved.samplesPath}.`);
  }

  const enriched = enrichSamples(samples, parsed);
  if (resolved.outFile.toLowerCase().endsWith(".json")) {
    await writeJsonFile(resolved.outFile, enriched.enrichedSamples);
  } else {
    await writeJsonLines(resolved.outFile, enriched.enrichedSamples);
  }

  const report: DeriveLabelsReport = {
    generatedAt: new Date().toISOString(),
    samplesPath: resolved.samplesPath,
    outFile: resolved.outFile,
    reportFile: resolved.reportFile,
    ...enriched.report
  };
  await writeJsonFile(resolved.reportFile, report);
  console.log(JSON.stringify(report, null, 2));

  if (parsed.strict && (report.positiveCount === 0 || report.negativeCount === 0 || report.warnings.length > 0)) {
    process.exitCode = 1;
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exitCode = 1;
});
