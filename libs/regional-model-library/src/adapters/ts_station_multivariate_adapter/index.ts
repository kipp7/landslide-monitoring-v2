import type {
  CanonicalBusinessIdentity,
  CanonicalStationMultivariateSeries,
  RawFamilyReference,
  JsonObject,
  QualityFlag,
  RegionalDatasetPack,
  SourceFieldMap
} from "../../contracts";
import { INTERNAL_RAW_FAMILY_REFS_KEY } from "../../contracts";

export type TimeConfig = {
  timestampField: string;
  timezone?: string;
  format?: string;
};

export type TsStationMultivariateAdapterInput = {
  datasetKey: string;
  identity: CanonicalBusinessIdentity;
  rawRows: JsonObject[];
  fieldMap: SourceFieldMap;
  timeConfig: TimeConfig;
  rawSourcePath?: string;
};

export type StationFieldCandidates = Record<string, string[]>;

export type ResolvedStationMultivariateMapping = {
  timestampField: string;
  fieldMap: SourceFieldMap;
  matchedFieldMap: Record<string, string>;
  unmatchedCanonicalFields: string[];
  availableFields: string[];
};

export type CandidateMappedStationSeriesInput = {
  datasetKey: string;
  identity: CanonicalBusinessIdentity;
  rawRows: JsonObject[];
  timestampFieldCandidates: string[];
  fieldMapCandidates: StationFieldCandidates;
  timezone?: string;
  rawSourcePath?: string;
};

export type CandidateMappedStationSeriesOutput = {
  series: CanonicalStationMultivariateSeries;
  resolution: ResolvedStationMultivariateMapping;
};

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function hasNonEmptyValue(value: unknown): boolean {
  if (typeof value === "string") return value.trim().length > 0;
  return value !== null && value !== undefined;
}

function collectAvailableFields(rawRows: readonly JsonObject[]): string[] {
  const fields = new Set<string>();

  for (const row of rawRows) {
    for (const key of Object.keys(row)) {
      if (key.startsWith("__lsmv2_")) {
        continue;
      }

      fields.add(key);
    }
  }

  return [...fields].sort((left, right) => left.localeCompare(right));
}

function findFirstPresentField(rawRows: readonly JsonObject[], candidates: readonly string[]): string | null {
  for (const candidate of candidates) {
    if (rawRows.some((row) => hasNonEmptyValue(row[candidate]))) {
      return candidate;
    }
  }

  return null;
}

function timezoneOffset(timezone: string | undefined): string | null {
  switch (timezone) {
    case "Asia/Shanghai":
      return "+08:00";
    case "UTC":
    case "Etc/UTC":
      return "Z";
    default:
      return null;
  }
}

function hasExplicitTimezone(value: string): boolean {
  return /(?:Z|[+-]\d{2}:\d{2})$/i.test(value);
}

function normalizeTimestampString(value: string, timezone: string | undefined): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;

  let candidate = trimmed.replaceAll("/", "-");
  if (candidate.includes(" ") && !candidate.includes("T")) {
    candidate = candidate.replace(" ", "T");
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(candidate)) {
    candidate = `${candidate}T00:00:00`;
  }

  if (!hasExplicitTimezone(candidate)) {
    const offset = timezoneOffset(timezone);
    if (offset) {
      candidate = `${candidate}${offset}`;
    }
  }

  const timestampMs = Date.parse(candidate);
  if (!Number.isFinite(timestampMs)) {
    return null;
  }

  return new Date(timestampMs).toISOString();
}

function normalizeTimestampValue(value: unknown, timeConfig: TimeConfig): string | null {
  if (typeof value === "string") {
    return normalizeTimestampString(value, timeConfig.timezone);
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const timestampMs = value >= 1_000_000_000_000 ? value : value * 1000;
    return new Date(timestampMs).toISOString();
  }

  return null;
}

function buildMetrics(row: JsonObject, fieldMap: SourceFieldMap, timestampField: string) {
  const metrics: Record<string, number> = {};

  for (const [sourceField, canonicalField] of Object.entries(fieldMap)) {
    if (sourceField === timestampField) continue;
    const normalized = toNumber(row[sourceField]);
    if (normalized !== null) metrics[canonicalField] = normalized;
  }

  return metrics;
}

function isRawFamilyReference(value: unknown): value is RawFamilyReference {
  return typeof value === "object" && value !== null && typeof (value as RawFamilyReference).familyKey === "string";
}

function extractFamilyRefs(row: JsonObject): RawFamilyReference[] | undefined {
  const value = row[INTERNAL_RAW_FAMILY_REFS_KEY];
  if (!Array.isArray(value)) {
    return undefined;
  }

  const familyRefs = value.filter(isRawFamilyReference);
  return familyRefs.length > 0 ? familyRefs : undefined;
}

function sanitizeOriginalFields(row: JsonObject): JsonObject {
  const sanitized: JsonObject = {};

  for (const [key, value] of Object.entries(row)) {
    if (key.startsWith("__lsmv2_")) {
      continue;
    }

    sanitized[key] = value;
  }

  return sanitized;
}

function buildPointQualityFlags(
  row: JsonObject,
  timestampField: string,
  eventTs: string | null,
  metrics: Record<string, number>
): QualityFlag[] {
  const timestamp = row[timestampField];
  if (eventTs) {
    const rainfallEntries = Object.entries(metrics).filter(([key]) =>
      key.toLowerCase().includes("rainfall")
    );
    const negativeRainfall = rainfallEntries.find(([, value]) => value < 0);
    const flags: QualityFlag[] = [];

    if (negativeRainfall) {
      flags.push({
        code: "negative_rainfall_value",
        severity: "error",
        message: "Rainfall metric contains a negative value.",
        field: negativeRainfall[0]
      });
    }

    if (Object.keys(metrics).length === 0) {
      flags.push({
        code: "empty_metrics_row",
        severity: "warning",
        message: "Row did not produce any mapped canonical metrics."
      });
    }

    return flags;
  }

  if (hasNonEmptyValue(timestamp)) {
    return [
      {
        code: "invalid_timestamp",
        severity: "warning",
        message: "Row timestamp could not be normalized.",
        field: timestampField
      }
    ];
  }

  return [
    {
      code: "missing_timestamp",
      severity: "warning",
      message: "Row is missing the configured timestamp field.",
      field: timestampField
    }
  ];
}

function buildSeriesQualityFlags(
  rawRows: readonly JsonObject[],
  points: CanonicalStationMultivariateSeries["points"],
  fieldMap: SourceFieldMap
): QualityFlag[] {
  const flags: QualityFlag[] = [];
  const timestampsInInputOrder = points.map((point) => point.eventTs);

  for (let index = 1; index < timestampsInInputOrder.length; index += 1) {
    const currentTimestamp = timestampsInInputOrder[index];
    const previousTimestamp = timestampsInInputOrder[index - 1];
    if (currentTimestamp && previousTimestamp && currentTimestamp < previousTimestamp) {
      flags.push({
        code: "non_monotonic_input_timestamp_order",
        severity: "warning",
        message: "Input rows are not sorted by timestamp and were normalized during ingestion."
      });
      break;
    }
  }

  const seenTimestamps = new Set<string>();
  for (const point of points) {
    if (seenTimestamps.has(point.eventTs)) {
      flags.push({
        code: "duplicate_point_timestamp_rows",
        severity: "error",
        message: "Canonical series contains duplicate point timestamps."
      });
      break;
    }
    seenTimestamps.add(point.eventTs);
  }

  const rainfallField = Object.entries(fieldMap).find(([, canonicalField]) =>
    canonicalField.toLowerCase().includes("rainfall")
  );
  if (rainfallField) {
    const hasNegativeRainfall = points.some((point) =>
      Object.entries(point.metricsNormalized).some(
        ([metricKey, value]) => metricKey.toLowerCase().includes("rainfall") && value < 0
      )
    );
    if (hasNegativeRainfall) {
      flags.push({
        code: "non_negative_rainfall",
        severity: "error",
        message: "Rainfall values must be non-negative after normalization.",
        field: rainfallField[0]
      });
    }
  }

  const reservoirField = Object.entries(fieldMap).find(([, canonicalField]) => canonicalField === "reservoirLevelM");
  if (reservoirField) {
    const availableFields = collectAvailableFields(rawRows);
    const hasGaugeIdentity = availableFields.some((field) =>
      /(gauge|station).*?(id|code)?/i.test(field)
    );
    if (!hasGaugeIdentity) {
      flags.push({
        code: "missing_reservoir_gauge_identity",
        severity: "warning",
        message: "Reservoir level was mapped without an explicit gauge identity field."
      });
    }
  }

  const groundwaterField = Object.entries(fieldMap).find(([, canonicalField]) => canonicalField === "groundwaterLevelM");
  if (groundwaterField && !/(level|depth)/i.test(groundwaterField[0])) {
    flags.push({
      code: "ambiguous_groundwater_semantics",
      severity: "warning",
      message: "Groundwater mapping should make level/depth semantics explicit.",
      field: groundwaterField[0]
    });
  }

  return flags;
}

export function resolveStationMultivariateMapping(
  rawRows: readonly JsonObject[],
  timestampFieldCandidates: readonly string[],
  fieldMapCandidates: StationFieldCandidates
): ResolvedStationMultivariateMapping {
  const availableFields = collectAvailableFields(rawRows);
  const timestampField =
    findFirstPresentField(rawRows, timestampFieldCandidates) ??
    timestampFieldCandidates[0] ??
    "event_ts";
  const fieldMap: SourceFieldMap = {};
  const matchedFieldMap: Record<string, string> = {};
  const unmatchedCanonicalFields: string[] = [];

  for (const [canonicalField, candidates] of Object.entries(fieldMapCandidates)) {
    const matchedSourceField = findFirstPresentField(rawRows, candidates);
    if (!matchedSourceField) {
      unmatchedCanonicalFields.push(canonicalField);
      continue;
    }

    fieldMap[matchedSourceField] = canonicalField;
    matchedFieldMap[canonicalField] = matchedSourceField;
  }

  return {
    timestampField,
    fieldMap,
    matchedFieldMap,
    unmatchedCanonicalFields,
    availableFields
  };
}

export function buildCandidateMappedStationSeries(
  input: CandidateMappedStationSeriesInput
): CandidateMappedStationSeriesOutput {
  const resolution = resolveStationMultivariateMapping(
    input.rawRows,
    input.timestampFieldCandidates,
    input.fieldMapCandidates
  );

  return {
    series: buildCanonicalStationMultivariateSeries({
      datasetKey: input.datasetKey,
      identity: input.identity,
      rawRows: input.rawRows,
      fieldMap: resolution.fieldMap,
      timeConfig: {
        timestampField: resolution.timestampField,
        ...(input.timezone ? { timezone: input.timezone } : {})
      },
      ...(input.rawSourcePath ? { rawSourcePath: input.rawSourcePath } : {})
    }),
    resolution
  };
}

export function buildPackCandidateMappedStationSeries(
  input: Omit<CandidateMappedStationSeriesInput, "timestampFieldCandidates" | "fieldMapCandidates"> & {
    pack: RegionalDatasetPack;
  }
): CandidateMappedStationSeriesOutput {
  const phase1Template = input.pack.phase1Template;
  if (!phase1Template) {
    throw new Error(`Pack '${input.pack.packKey}' does not declare a phase1Template.`);
  }

  return buildCandidateMappedStationSeries({
    datasetKey: input.datasetKey,
    identity: input.identity,
    rawRows: input.rawRows,
    timestampFieldCandidates: phase1Template.timestampFieldCandidates,
    fieldMapCandidates: phase1Template.fieldMapCandidates,
    ...(input.timezone ? { timezone: input.timezone } : {}),
    ...(input.rawSourcePath ? { rawSourcePath: input.rawSourcePath } : {})
  });
}

export function buildCanonicalStationMultivariateSeries(
  input: TsStationMultivariateAdapterInput
): CanonicalStationMultivariateSeries {
  const points = input.rawRows.map((row, index) => {
    const timestamp = row[input.timeConfig.timestampField];
    const metrics = buildMetrics(row, input.fieldMap, input.timeConfig.timestampField);
    const normalizedEventTs = normalizeTimestampValue(timestamp, input.timeConfig);
    const familyRefs = extractFamilyRefs(row);
    const rawRef = {
      datasetKey: input.datasetKey,
      sourceRecordKey: `${input.identity.scopeKey}:${String(index)}`,
      ...(input.rawSourcePath ? { sourcePath: input.rawSourcePath } : {}),
      ...(familyRefs ? { familyRefs } : {}),
      originalFields: sanitizeOriginalFields(row)
    };
    const qualityFlags = buildPointQualityFlags(
      row,
      input.timeConfig.timestampField,
      normalizedEventTs,
      metrics
    );

    return {
      eventTs: normalizedEventTs ?? new Date(0).toISOString(),
      metricsNormalized: metrics,
      rawRef,
      ...(qualityFlags.length > 0 ? { qualityFlags } : {})
    };
  });
  const sortedPoints = [...points].sort((left, right) => left.eventTs.localeCompare(right.eventTs));

  return {
    seriesId: `${input.datasetKey}:${input.identity.scopeKey}`,
    identity: input.identity,
    sourceDataset: input.datasetKey,
    sourceFieldMap: input.fieldMap,
    points: sortedPoints,
    qualityFlags: buildSeriesQualityFlags(input.rawRows, points, input.fieldMap)
  };
}
