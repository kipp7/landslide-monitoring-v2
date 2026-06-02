import path from "node:path";
import { access, mkdir, readFile, readdir } from "node:fs/promises";
import type {
  CanonicalTrainingSample,
  EventReplayPack,
  EventReplayPackSample,
  EventReplayPackWindowMetrics,
  QualityFlag,
  RawFamilyReference,
  RawReference,
  TimePrecision,
  TrainingLabelMetadata
} from "../../../libs/regional-model-library/src";
import { writeJsonFile, writeJsonLines } from "../../../libs/regional-model-library/src";
import { resolveRepoRoot } from "./intake-utils";

type ParsedArgs = {
  packKey?: string;
  datasetKey: string;
  eventCsv?: string;
  positiveExtractRoot?: string;
  negativeEventCsv?: string;
  negativeExtractRoot?: string;
  outDir?: string;
};

type CsvRow = Record<string, string>;

type ExtractAggregation = {
  eventId: string;
  windowDays: number;
  rainfallValues: number[];
  rowCount: number;
  lastSourceDay: string | null;
  lastDayRainfallMm: number | null;
  sourceFiles: Set<string>;
  sourceRelativePaths: Set<string>;
};

type SampleBuildContext = {
  label: 0 | 1;
  partition: "positive" | "negative";
  datasetKey: string;
  eventCsvPath: string;
  extractMap: Map<string, Map<number, ExtractAggregation>>;
};

type BuildReport = {
  generatedAt: string;
  packKey: string;
  datasetKey: string;
  sourceEventCsv: string;
  negativeEventCsv: string | null;
  positiveExtractRoot: string;
  negativeExtractRoot: string | null;
  outDir: string;
  packOutputPath: string;
  sampleOutputPath: string;
  sampleCount: number;
  positiveCount: number;
  negativeCount: number;
  missingExtractSampleCount: number;
  windowDays: number[];
  metricsCatalog: string[];
  warnings: string[];
};

const LABEL_KEY = "warningHitLabel";
const DERIVATION_MODE: TrainingLabelMetadata["derivationMode"] =
  "derived-replay-pack-membership";

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    datasetKey: "event-replay-pack"
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token) continue;

    switch (token) {
      case "--pack-key":
        parsed.packKey = argv[index + 1];
        index += 1;
        break;
      case "--dataset-key":
        parsed.datasetKey = argv[index + 1] ?? parsed.datasetKey;
        index += 1;
        break;
      case "--event-csv":
        parsed.eventCsv = argv[index + 1];
        index += 1;
        break;
      case "--positive-extract-root":
        parsed.positiveExtractRoot = argv[index + 1];
        index += 1;
        break;
      case "--negative-event-csv":
        parsed.negativeEventCsv = argv[index + 1];
        index += 1;
        break;
      case "--negative-extract-root":
        parsed.negativeExtractRoot = argv[index + 1];
        index += 1;
        break;
      case "--out-dir":
        parsed.outDir = argv[index + 1];
        index += 1;
        break;
      default:
        break;
    }
  }

  return parsed;
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      const nextCharacter = line[index + 1];
      if (inQuotes && nextCharacter === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (character === "," && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }

    current += character;
  }

  values.push(current);
  return values.map((value) => value.trim());
}

async function readCsvRows(filePath: string): Promise<CsvRow[]> {
  const content = await readFile(filePath, "utf-8");
  const lines = content
    .replace(/^\uFEFF/u, "")
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return [];
  }

  const headers = parseCsvLine(lines[0]!);
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const row: CsvRow = {};
    headers.forEach((header, index) => {
      row[header] = values[index] ?? "";
    });
    return row;
  });
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function collectCsvFiles(rootDir: string): Promise<string[]> {
  const entries = await readdir(rootDir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const nextPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectCsvFiles(nextPath)));
      continue;
    }

    if (entry.isFile() && nextPath.toLowerCase().endsWith(".csv")) {
      files.push(nextPath);
    }
  }

  return files.sort((left, right) => left.localeCompare(right));
}

async function resolveByEventDir(extractRoot: string): Promise<string> {
  const candidate = path.join(extractRoot, "by-event");
  if (await pathExists(candidate)) {
    return candidate;
  }
  return extractRoot;
}

function getOrCreateAggregation(
  store: Map<string, Map<number, ExtractAggregation>>,
  eventId: string,
  windowDays: number
): ExtractAggregation {
  const perEvent = store.get(eventId) ?? new Map<number, ExtractAggregation>();
  if (!store.has(eventId)) {
    store.set(eventId, perEvent);
  }

  const existing = perEvent.get(windowDays);
  if (existing) {
    return existing;
  }

  const created: ExtractAggregation = {
    eventId,
    windowDays,
    rainfallValues: [],
    rowCount: 0,
    lastSourceDay: null,
    lastDayRainfallMm: null,
    sourceFiles: new Set<string>(),
    sourceRelativePaths: new Set<string>()
  };
  perEvent.set(windowDays, created);
  return created;
}

async function loadExtractAggregations(extractRoot: string): Promise<Map<string, Map<number, ExtractAggregation>>> {
  const byEventDir = await resolveByEventDir(extractRoot);
  const csvFiles = (await pathExists(byEventDir)) ? await collectCsvFiles(byEventDir) : [];
  const aggregations = new Map<string, Map<number, ExtractAggregation>>();

  for (const csvFile of csvFiles) {
    const rows = await readCsvRows(csvFile);
    for (const row of rows) {
      const eventId = (row.event_id ?? "").trim();
      const windowDays = Number(row.window_days);
      if (!eventId || !Number.isFinite(windowDays) || windowDays <= 0) {
        continue;
      }

      const aggregation = getOrCreateAggregation(aggregations, eventId, windowDays);
      aggregation.rowCount += 1;
      aggregation.sourceFiles.add(csvFile);

      const sourceRelativePath = (row.source_relative_path ?? "").trim();
      if (sourceRelativePath) {
        aggregation.sourceRelativePaths.add(sourceRelativePath);
      }

      const rainfallMm = Number(row.rainfall_mm);
      if (Number.isFinite(rainfallMm)) {
        aggregation.rainfallValues.push(rainfallMm);
      }

      const sourceDay = (row.source_day ?? "").trim();
      if (
        sourceDay &&
        (aggregation.lastSourceDay === null || sourceDay.localeCompare(aggregation.lastSourceDay) >= 0)
      ) {
        aggregation.lastSourceDay = sourceDay;
        aggregation.lastDayRainfallMm = Number.isFinite(rainfallMm) ? rainfallMm : null;
      }
    }
  }

  return aggregations;
}

function uniqueNumbers(values: Iterable<number>): number[] {
  return Array.from(new Set(values)).sort((left, right) => left - right);
}

function uniqueStrings(values: Iterable<string>): string[] {
  return Array.from(new Set(values)).sort((left, right) => left.localeCompare(right));
}

function toNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeTimePrecision(value: string | undefined): TimePrecision | undefined {
  if (
    value === "second" ||
    value === "minute" ||
    value === "hour" ||
    value === "day" ||
    value === "unknown"
  ) {
    return value;
  }
  return undefined;
}

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function buildWindowMetrics(
  perEvent: Map<number, ExtractAggregation> | undefined
): {
  metricsNormalized: Record<string, number>;
  windowMetrics: EventReplayPackWindowMetrics[];
  qualityFlags: QualityFlag[];
  familyRefs: RawFamilyReference[];
} {
  if (!perEvent || perEvent.size === 0) {
    return {
      metricsNormalized: {},
      windowMetrics: [],
      qualityFlags: [
        {
          code: "missing_rainfall_extract",
          severity: "warning",
          message: "No rainfall extract rows were found for this replay sample."
        }
      ],
      familyRefs: []
    };
  }

  const metricsNormalized: Record<string, number> = {};
  const windowMetrics: EventReplayPackWindowMetrics[] = [];
  const qualityFlags: QualityFlag[] = [];
  const familyRefs: RawFamilyReference[] = [];

  for (const windowDays of uniqueNumbers(perEvent.keys())) {
    const aggregation = perEvent.get(windowDays);
    if (!aggregation) continue;

    if (aggregation.rainfallValues.length === 0) {
      qualityFlags.push({
        code: "empty_rainfall_window",
        severity: "warning",
        message: `Rainfall extract exists for ${String(windowDays)}d but contains no numeric rainfall rows.`,
        field: `${String(windowDays)}d`
      });
      continue;
    }

    const rainfallTotalMm = sum(aggregation.rainfallValues);
    const rainfallMeanMm = mean(aggregation.rainfallValues);
    const rainfallMaxMm = Math.max(...aggregation.rainfallValues);
    const rainfallMinMm = Math.min(...aggregation.rainfallValues);
    const rainfallNonZeroDayCount = aggregation.rainfallValues.filter((value) => value > 0).length;
    const rainfallDayCount = aggregation.rainfallValues.length;
    const suffix = `${String(windowDays)}d`;

    metricsNormalized[`rainfallAccum${suffix}Mm`] = rainfallTotalMm;
    metricsNormalized[`rainfallMean${suffix}Mm`] = rainfallMeanMm;
    metricsNormalized[`rainfallMax${suffix}Mm`] = rainfallMaxMm;
    metricsNormalized[`rainfallMin${suffix}Mm`] = rainfallMinMm;
    metricsNormalized[`rainfallWetDayCount${suffix}`] = rainfallNonZeroDayCount;
    metricsNormalized[`rainfallDayCount${suffix}`] = rainfallDayCount;

    windowMetrics.push({
      windowDays,
      rainfallTotalMm,
      rainfallMeanMm,
      rainfallMaxMm,
      rainfallMinMm,
      rainfallNonZeroDayCount,
      rainfallDayCount,
      rainfallLastDayMm: aggregation.lastDayRainfallMm
    });

    for (const sourceFile of uniqueStrings(aggregation.sourceFiles)) {
      familyRefs.push({
        familyKey: `rainfall-window-${suffix}`,
        sourcePath: sourceFile,
        sourceRecordKey: aggregation.eventId,
        matchedBy: `window_days=${suffix}`
      });
    }
  }

  return { metricsNormalized, windowMetrics, qualityFlags, familyRefs };
}

function buildSourceFieldMap(): Record<string, string> {
  return {
    event_id: "sourceRecordKey",
    event_ts: "eventTs",
    region_code: "identity.regionCode",
    longitude: "rawRef.originalFields.longitude",
    latitude: "rawRef.originalFields.latitude",
    hazard_type: "rawRef.originalFields.hazard_type"
  };
}

function buildRawReference(
  row: CsvRow,
  context: SampleBuildContext,
  familyRefs: RawFamilyReference[],
  timePrecision: TimePrecision | undefined
): RawReference {
  return {
    datasetKey: context.datasetKey,
    sourcePath: context.eventCsvPath,
    sourceRecordKey: row.event_id ?? "",
    ...(timePrecision ? { timePrecision } : {}),
    ...(familyRefs.length > 0 ? { familyRefs } : {}),
    originalFields: row
  };
}

function buildProperties(row: CsvRow, partition: "positive" | "negative"): Record<string, unknown> {
  const properties: Record<string, unknown> = {
    partition
  };

  for (const field of [
    "province",
    "city",
    "county",
    "location_text",
    "trigger_summary",
    "negative_source_event_id",
    "negative_offset_days",
    "negative_rule",
    "positive_event_ts"
  ]) {
    const value = row[field];
    if (value && value.trim().length > 0) {
      properties[field] = value;
    }
  }

  return properties;
}

function createSamplesForRows(
  rows: readonly CsvRow[],
  context: SampleBuildContext
): {
  packSamples: EventReplayPackSample[];
  canonicalSamples: CanonicalTrainingSample[];
  warnings: string[];
} {
  const packSamples: EventReplayPackSample[] = [];
  const canonicalSamples: CanonicalTrainingSample[] = [];
  const warnings: string[] = [];

  for (const row of rows) {
    const eventId = (row.event_id ?? "").trim();
    const eventTs = (row.event_ts ?? "").trim();
    if (!eventId || !Number.isFinite(Date.parse(eventTs))) {
      warnings.push(`Skipped replay row because event_id or event_ts is invalid: ${JSON.stringify(row)}`);
      continue;
    }

    const regionCode = (row.region_code ?? "").trim() || "unknown-region";
    const hazardType = (row.hazard_type ?? "").trim() || "landslide";
    const timePrecision = normalizeTimePrecision(row.time_precision?.trim());
    const perEvent = context.extractMap.get(eventId);
    const { metricsNormalized, windowMetrics, qualityFlags, familyRefs } = buildWindowMetrics(perEvent);
    const rawRef = buildRawReference(row, context, familyRefs, timePrecision);
    const sampleId = `${context.datasetKey}:${context.partition}:${eventId}`;
    const sourceFieldMap = buildSourceFieldMap();
    const properties = buildProperties(row, context.partition);

    const packSample: EventReplayPackSample = {
      sampleId,
      eventId,
      ...(row.negative_source_event_id ? { sourceEventId: row.negative_source_event_id } : {}),
      label: context.label,
      regionCode,
      hazardType,
      eventTs,
      ...(toNumber(row.longitude) !== undefined ? { longitude: toNumber(row.longitude) } : {}),
      ...(toNumber(row.latitude) !== undefined ? { latitude: toNumber(row.latitude) } : {}),
      ...(timePrecision ? { timePrecision } : {}),
      ...(row.trigger_summary ? { triggerSummary: row.trigger_summary } : {}),
      metricsNormalized,
      windowMetrics,
      rawRef,
      qualityFlags,
      properties
    };
    packSamples.push(packSample);

    const labelMetadata: Record<string, TrainingLabelMetadata> = {
      [LABEL_KEY]: {
        valueType: "boolean",
        derivationMode: DERIVATION_MODE
      }
    };

    const canonicalSample: CanonicalTrainingSample = {
      sampleId,
      identity: {
        scopeType: "region",
        scopeKey: regionCode,
        regionCode
      },
      eventTs,
      windowSpec:
        windowMetrics.length > 0
          ? uniqueNumbers(windowMetrics.map((item) => item.windowDays))
              .map((windowDays) => `${String(windowDays)}d`)
              .join(",")
          : "unknown",
      metricsNormalized,
      labels: {
        [LABEL_KEY]: context.label === 1
      },
      labelMetadata,
      sourceDataset: context.datasetKey,
      sourceRecordKey: eventId,
      sourceFieldMap,
      rawRef,
      qualityFlags
    };
    canonicalSamples.push(canonicalSample);
  }

  return { packSamples, canonicalSamples, warnings };
}

async function main(): Promise<void> {
  const repoRoot = resolveRepoRoot(__dirname);
  const parsed = parseArgs(process.argv.slice(2));

  const eventCsv = path.resolve(
    repoRoot,
    parsed.eventCsv ?? ".tmp/regional-model-library/smoke/china-catalogue/phase1-event-inventory.csv"
  );
  const positiveExtractRoot = path.resolve(
    repoRoot,
    parsed.positiveExtractRoot ?? ".tmp/regional-model-library/raw/CHM_PRE-V2/extracts/event-smoke-2024"
  );
  const negativeEventCsv = parsed.negativeEventCsv
    ? path.resolve(repoRoot, parsed.negativeEventCsv)
    : null;
  const negativeExtractRoot = parsed.negativeExtractRoot
    ? path.resolve(repoRoot, parsed.negativeExtractRoot)
    : null;
  const packKey =
    parsed.packKey?.trim() || path.basename(eventCsv).replace(/\.[^.]+$/u, "") || "event-replay-pack";
  const outDir = path.resolve(
    repoRoot,
    parsed.outDir ?? `.tmp/regional-model-library/out/replay-packs/${packKey}`
  );

  const positiveRows = await readCsvRows(eventCsv);
  const negativeRows = negativeEventCsv ? await readCsvRows(negativeEventCsv) : [];
  const positiveExtractMap = await loadExtractAggregations(positiveExtractRoot);
  const negativeExtractMap = negativeExtractRoot
    ? await loadExtractAggregations(negativeExtractRoot)
    : new Map<string, Map<number, ExtractAggregation>>();

  const positiveSamples = createSamplesForRows(positiveRows, {
    label: 1,
    partition: "positive",
    datasetKey: parsed.datasetKey,
    eventCsvPath: eventCsv,
    extractMap: positiveExtractMap
  });
  const negativeSamples = createSamplesForRows(negativeRows, {
    label: 0,
    partition: "negative",
    datasetKey: parsed.datasetKey,
    eventCsvPath: negativeEventCsv ?? eventCsv,
    extractMap: negativeExtractMap
  });

  const samples = [...positiveSamples.packSamples, ...negativeSamples.packSamples];
  const canonicalSamples = [...positiveSamples.canonicalSamples, ...negativeSamples.canonicalSamples];
  const regionCodes = uniqueStrings(samples.map((sample) => sample.regionCode));
  const scopeType = regionCodes.length === 1 ? "region" : "global";
  const scopeKey = regionCodes.length === 1 ? regionCodes[0] ?? null : null;
  const metricsCatalog = uniqueStrings(
    canonicalSamples.flatMap((sample) => Object.keys(sample.metricsNormalized))
  );
  const missingExtractSampleCount = samples.filter((sample) =>
    sample.qualityFlags.some((flag) => flag.code === "missing_rainfall_extract")
  ).length;
  const pack: EventReplayPack = {
    schemaVersion: "event-replay-pack.v1",
    packKey,
    datasetKey: parsed.datasetKey,
    generatedAt: new Date().toISOString(),
    scopeType,
    scopeKey,
    sourceEventCsv: eventCsv,
    ...(negativeEventCsv ? { negativeEventCsv } : {}),
    positiveExtractRoot,
    ...(negativeExtractRoot ? { negativeExtractRoot } : {}),
    metricsCatalog,
    samples,
    summary: {
      sampleCount: samples.length,
      positiveCount: positiveSamples.packSamples.length,
      negativeCount: negativeSamples.packSamples.length,
      missingExtractSampleCount,
      windowDays: uniqueNumbers(
        samples.flatMap((sample) => sample.windowMetrics.map((windowMetric) => windowMetric.windowDays))
      )
    }
  };

  await mkdir(outDir, { recursive: true });
  const packOutputPath = path.join(outDir, "event-replay-pack.json");
  const sampleOutputPath = path.join(outDir, "event-replay-pack.samples.jsonl");
  const reportOutputPath = path.join(outDir, "event-replay-pack.report.json");

  await writeJsonFile(packOutputPath, pack);
  await writeJsonLines(sampleOutputPath, canonicalSamples);

  const report: BuildReport = {
    generatedAt: pack.generatedAt,
    packKey,
    datasetKey: parsed.datasetKey,
    sourceEventCsv: eventCsv,
    negativeEventCsv,
    positiveExtractRoot,
    negativeExtractRoot,
    outDir,
    packOutputPath,
    sampleOutputPath,
    sampleCount: pack.summary.sampleCount,
    positiveCount: pack.summary.positiveCount,
    negativeCount: pack.summary.negativeCount,
    missingExtractSampleCount,
    windowDays: pack.summary.windowDays,
    metricsCatalog,
    warnings: [...positiveSamples.warnings, ...negativeSamples.warnings]
  };
  await writeJsonFile(reportOutputPath, report);

  process.stdout.write(
    `${JSON.stringify(
      {
        packOutputPath,
        sampleOutputPath,
        reportOutputPath,
        sampleCount: report.sampleCount,
        positiveCount: report.positiveCount,
        negativeCount: report.negativeCount,
        missingExtractSampleCount: report.missingExtractSampleCount
      },
      null,
      2
    )}\n`
  );
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
