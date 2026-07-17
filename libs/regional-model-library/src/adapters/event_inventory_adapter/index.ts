import type {
  CanonicalEventInventory,
  CanonicalEventInventoryRecord,
  JsonObject,
  SourceFieldMap
} from "../../contracts";

export type EventInventoryAdapterInput = {
  datasetKey: string;
  rawRows: JsonObject[];
  fieldMap: SourceFieldMap;
  rawSourcePath?: string;
  eventIdField?: string;
  regionCodeField?: string;
  hazardTypeField?: string;
  eventTsField?: string;
};

function getString(row: JsonObject, field: string | undefined): string | null {
  if (!field) return null;
  const value = row[field];
  if (typeof value === "string" && value.length > 0) return value;
  return null;
}

function getNumber(row: JsonObject, field: string | undefined): number | null {
  if (!field) return null;
  const value = row[field];
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function buildRecord(
  input: EventInventoryAdapterInput,
  row: JsonObject,
  index: number
): CanonicalEventInventoryRecord {
  const eventId =
    getString(row, input.eventIdField) ??
    getString(row, "event_id") ??
    `${input.datasetKey}:${String(index)}`;
  const regionCode =
    getString(row, input.regionCodeField) ??
    getString(row, "region_code") ??
    "unknown-region";
  const hazardType =
    getString(row, input.hazardTypeField) ??
    getString(row, "hazard_type") ??
    "landslide";
  const eventTs = getString(row, input.eventTsField) ?? getString(row, "event_ts");
  const longitude = getNumber(row, "longitude");
  const latitude = getNumber(row, "latitude");
  const province = getString(row, "province");
  const city = getString(row, "city");
  const county = getString(row, "county");
  const locationText = getString(row, "location_text");
  const timePrecision = getString(row, "time_precision");
  const spacePrecision = getString(row, "space_precision");
  const triggerSummary = getString(row, "trigger_summary");

  return {
    eventId,
    regionCode,
    hazardType,
    ...(eventTs ? { eventTs } : {}),
    ...(longitude !== null ? { longitude } : {}),
    ...(latitude !== null ? { latitude } : {}),
    ...(province ? { province } : {}),
    ...(city ? { city } : {}),
    ...(county ? { county } : {}),
    ...(locationText ? { locationText } : {}),
    ...(timePrecision &&
    (timePrecision === "second" ||
      timePrecision === "minute" ||
      timePrecision === "hour" ||
      timePrecision === "day" ||
      timePrecision === "unknown")
      ? { timePrecision }
      : {}),
    ...(spacePrecision ? { spacePrecision } : {}),
    ...(triggerSummary ? { triggerSummary } : {}),
    rawRef: {
      datasetKey: input.datasetKey,
      sourceRecordKey: eventId,
      ...(input.rawSourcePath ? { sourcePath: input.rawSourcePath } : {}),
      originalFields: row
    },
    qualityFlags: []
  };
}

export function buildCanonicalEventInventory(
  input: EventInventoryAdapterInput
): CanonicalEventInventory {
  return {
    datasetKey: input.datasetKey,
    sourceFieldMap: input.fieldMap,
    records: input.rawRows.map((row, index) => buildRecord(input, row, index))
  };
}
