import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";
import { resolveRepoRoot } from "./intake-utils";

type ParsedArgs = {
  datasetKey: string;
  inputShp?: string;
  outFile?: string;
  eventTs?: string;
  eventTsField?: string;
  eventIdField?: string;
  longitudeField?: string;
  latitudeField?: string;
  province?: string;
  provinceField?: string;
  city?: string;
  cityField?: string;
  county?: string;
  countyField?: string;
  regionCode?: string;
  locationField?: string;
  locationText?: string;
  timePrecision: string;
  spacePrecision: string;
  triggerSummary?: string;
  newsTitle?: string;
  sourceUrl?: string;
  hazardType: string;
  eventIdPrefix?: string;
};

type SourceRow = Record<string, unknown>;

type GeometryCoordinate = {
  longitude: number | null;
  latitude: number | null;
  geometryType: string;
  coordinateSource: "point" | "bbox-center" | "none";
};

type NormalizedEventRow = {
  event_id: string;
  event_ts: string;
  region_code: string;
  hazard_type: string;
  province: string;
  city: string;
  county: string;
  longitude: string;
  latitude: string;
  location_text: string;
  time_precision: string;
  space_precision: string;
  trigger_summary: string;
  news_title: string;
  source_url: string;
  death_count: string;
  injury_count: string;
  economic_loss: string;
  raw_source_file: string;
  raw_sheet_name: string;
  source_row_index: string;
  raw_geometry_type: string;
  raw_coordinate_source: string;
};

type NormalizationReport = {
  generatedAt: string;
  datasetKey: string;
  inputShp: string;
  inputDbf: string;
  rowCount: number;
  outputFile: string;
  matchedColumns: Record<string, string | null>;
  warnings: string[];
};

const POINT_TYPES = new Set([1, 11, 21]);
const BBOX_TYPES = new Set([3, 5, 8, 13, 15, 18, 23, 25, 28, 31]);

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    datasetKey: "event-inventory-shapefile",
    timePrecision: "day",
    spacePrecision: "unknown",
    hazardType: "landslide"
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token) continue;

    switch (token) {
      case "--dataset-key":
        parsed.datasetKey = argv[index + 1] ?? parsed.datasetKey;
        index += 1;
        break;
      case "--input-shp":
        parsed.inputShp = argv[index + 1];
        index += 1;
        break;
      case "--out-file":
        parsed.outFile = argv[index + 1];
        index += 1;
        break;
      case "--event-ts":
        parsed.eventTs = argv[index + 1];
        index += 1;
        break;
      case "--event-ts-field":
        parsed.eventTsField = argv[index + 1];
        index += 1;
        break;
      case "--event-id-field":
        parsed.eventIdField = argv[index + 1];
        index += 1;
        break;
      case "--longitude-field":
        parsed.longitudeField = argv[index + 1];
        index += 1;
        break;
      case "--latitude-field":
        parsed.latitudeField = argv[index + 1];
        index += 1;
        break;
      case "--province":
        parsed.province = argv[index + 1];
        index += 1;
        break;
      case "--province-field":
        parsed.provinceField = argv[index + 1];
        index += 1;
        break;
      case "--city":
        parsed.city = argv[index + 1];
        index += 1;
        break;
      case "--city-field":
        parsed.cityField = argv[index + 1];
        index += 1;
        break;
      case "--county":
        parsed.county = argv[index + 1];
        index += 1;
        break;
      case "--county-field":
        parsed.countyField = argv[index + 1];
        index += 1;
        break;
      case "--region-code":
        parsed.regionCode = argv[index + 1];
        index += 1;
        break;
      case "--location-field":
        parsed.locationField = argv[index + 1];
        index += 1;
        break;
      case "--location-text":
        parsed.locationText = argv[index + 1];
        index += 1;
        break;
      case "--time-precision":
        parsed.timePrecision = argv[index + 1] ?? parsed.timePrecision;
        index += 1;
        break;
      case "--space-precision":
        parsed.spacePrecision = argv[index + 1] ?? parsed.spacePrecision;
        index += 1;
        break;
      case "--trigger-summary":
        parsed.triggerSummary = argv[index + 1];
        index += 1;
        break;
      case "--news-title":
        parsed.newsTitle = argv[index + 1];
        index += 1;
        break;
      case "--source-url":
        parsed.sourceUrl = argv[index + 1];
        index += 1;
        break;
      case "--hazard-type":
        parsed.hazardType = argv[index + 1] ?? parsed.hazardType;
        index += 1;
        break;
      case "--event-id-prefix":
        parsed.eventIdPrefix = argv[index + 1];
        index += 1;
        break;
      default:
        break;
    }
  }

  return parsed;
}

function ensureInputShp(parsed: ParsedArgs): string {
  if (!parsed.inputShp || parsed.inputShp.trim().length === 0) {
    throw new Error("--input-shp is required.");
  }

  return parsed.inputShp.trim();
}

function normalizeHeader(header: string): string {
  return header
    .replace(/^\uFEFF/u, "")
    .trim()
    .toLowerCase()
    .replace(/[（）()【】\[\]{}]/gu, "")
    .replace(/[\s_\-/:：，,.;"'`]/gu, "");
}

function buildHeaderMap(headers: string[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const header of headers) {
    map.set(normalizeHeader(header), header);
  }
  return map;
}

function resolveColumn(
  headerMap: Map<string, string>,
  explicitField: string | undefined,
  exactCandidates: readonly string[],
  tokenGroups: readonly string[][] = []
): string | null {
  if (explicitField && explicitField.trim().length > 0) {
    return explicitField.trim();
  }

  for (const candidate of exactCandidates) {
    const matched = headerMap.get(normalizeHeader(candidate));
    if (matched) {
      return matched;
    }
  }

  for (const [normalized, original] of headerMap.entries()) {
    if (
      tokenGroups.some((group) => group.every((token) => normalized.includes(normalizeHeader(token))))
    ) {
      return original;
    }
  }

  return null;
}

function selectStableIdField(
  rows: readonly SourceRow[],
  headerMap: Map<string, string>,
  explicitField: string | undefined
): string | null {
  const candidates = [
    explicitField?.trim() || null,
    headerMap.get(normalizeHeader("event_id")) ?? null,
    headerMap.get(normalizeHeader("eventid")) ?? null,
    headerMap.get(normalizeHeader("orig_fid")) ?? null,
    headerMap.get(normalizeHeader("origfid")) ?? null,
    headerMap.get(normalizeHeader("origid")) ?? null,
    headerMap.get(normalizeHeader("objectid")) ?? null,
    headerMap.get(normalizeHeader("oid")) ?? null,
    headerMap.get(normalizeHeader("fid")) ?? null,
    headerMap.get(normalizeHeader("id")) ?? null,
    headerMap.get(normalizeHeader("编号")) ?? null
  ].filter((value, index, list): value is string => Boolean(value) && list.indexOf(value) === index);

  let bestField: string | null = null;
  let bestUniqueCount = -1;

  for (const field of candidates) {
    const values = rows.map((row) => getString(row, field)).filter((value) => value.length > 0);
    if (values.length === 0) {
      continue;
    }

    const uniqueCount = new Set(values).size;
    if (uniqueCount === values.length) {
      return field;
    }

    if (uniqueCount > bestUniqueCount) {
      bestUniqueCount = uniqueCount;
      bestField = field;
    }
  }

  return bestField;
}

function getString(row: SourceRow, field: string | null | undefined): string {
  if (!field) {
    return "";
  }

  const value = row[field];
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

function getNumber(row: SourceRow, field: string | null | undefined): number | null {
  const value = getString(row, field);
  if (value.length === 0) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function sanitizeRegionPart(value: string): string {
  return value.replace(/[\\/|]/gu, "-").replace(/\s+/gu, "").trim();
}

function buildRegionCode(province: string, city: string, county: string): string {
  const parts = [province, city, county].map(sanitizeRegionPart).filter((part) => part.length > 0);
  return parts.length > 0 ? `cn:${parts.join(":")}` : "unknown-region";
}

function sanitizeEventIdPart(value: string): string {
  return value.replace(/[<>:"/\\|?*\s]+/gu, "-").replace(/-+/gu, "-").replace(/^-|-$/gu, "");
}

function normalizeDateTime(rawValue: string): string {
  const normalized = rawValue
    .replace(/[年月]/gu, "-")
    .replace(/[日]/gu, "")
    .replace(/\//gu, "-")
    .trim();

  if (/^\d{4}-\d{1,2}-\d{1,2}$/u.test(normalized)) {
    return `${normalized}T00:00:00+08:00`;
  }

  if (/^\d{4}-\d{1,2}-\d{1,2}\s+\d{1,2}:\d{1,2}(:\d{1,2})?$/u.test(normalized)) {
    return `${normalized.replace(/\s+/gu, "T")}+08:00`;
  }

  const parsed = Date.parse(normalized);
  if (!Number.isNaN(parsed)) {
    return new Date(parsed).toISOString();
  }

  return rawValue;
}

function toFieldString(value: number | string | null): string {
  if (value === null) {
    return "";
  }

  return typeof value === "number" ? String(value) : value;
}

function escapeCsvValue(value: string): string {
  if (/[",\r\n]/u.test(value)) {
    return `"${value.replace(/"/gu, "\"\"")}"`;
  }

  return value;
}

function toCsv(rows: readonly NormalizedEventRow[]): string {
  if (rows.length === 0) {
    return "";
  }

  const headers = Object.keys(rows[0]) as (keyof NormalizedEventRow)[];
  return [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => escapeCsvValue(row[header])).join(","))
  ].join("\n");
}

function shapeTypeName(shapeType: number): string {
  switch (shapeType) {
    case 0:
      return "NullShape";
    case 1:
      return "Point";
    case 3:
      return "PolyLine";
    case 5:
      return "Polygon";
    case 8:
      return "MultiPoint";
    case 11:
      return "PointZ";
    case 13:
      return "PolyLineZ";
    case 15:
      return "PolygonZ";
    case 18:
      return "MultiPointZ";
    case 21:
      return "PointM";
    case 23:
      return "PolyLineM";
    case 25:
      return "PolygonM";
    case 28:
      return "MultiPointM";
    case 31:
      return "MultiPatch";
    default:
      return `ShapeType-${String(shapeType)}`;
  }
}

function parseShapefileCoordinates(shpPath: string): GeometryCoordinate[] {
  const buffer = readFileSync(shpPath);
  const coordinates: GeometryCoordinate[] = [];
  let offset = 100;

  while (offset + 8 <= buffer.length) {
    const contentLengthBytes = buffer.readInt32BE(offset + 4) * 2;
    const contentOffset = offset + 8;
    const recordEnd = contentOffset + contentLengthBytes;

    if (recordEnd > buffer.length || contentLengthBytes < 4) {
      break;
    }

    const shapeType = buffer.readInt32LE(contentOffset);
    const geometryType = shapeTypeName(shapeType);

    if (POINT_TYPES.has(shapeType) && recordEnd >= contentOffset + 20) {
      coordinates.push({
        longitude: buffer.readDoubleLE(contentOffset + 4),
        latitude: buffer.readDoubleLE(contentOffset + 12),
        geometryType,
        coordinateSource: "point"
      });
    } else if (BBOX_TYPES.has(shapeType) && recordEnd >= contentOffset + 36) {
      const xMin = buffer.readDoubleLE(contentOffset + 4);
      const yMin = buffer.readDoubleLE(contentOffset + 12);
      const xMax = buffer.readDoubleLE(contentOffset + 20);
      const yMax = buffer.readDoubleLE(contentOffset + 28);
      coordinates.push({
        longitude: (xMin + xMax) / 2,
        latitude: (yMin + yMax) / 2,
        geometryType,
        coordinateSource: "bbox-center"
      });
    } else {
      coordinates.push({
        longitude: null,
        latitude: null,
        geometryType,
        coordinateSource: "none"
      });
    }

    offset = recordEnd;
  }

  return coordinates;
}

async function main(): Promise<void> {
  const repoRoot = resolveRepoRoot(__dirname);
  const parsed = parseArgs(process.argv.slice(2));
  const inputShp = path.resolve(repoRoot, ensureInputShp(parsed));
  const inputDbf = inputShp.replace(/\.shp$/iu, ".dbf");
  const outFile = path.resolve(
    repoRoot,
    parsed.outFile ??
      path.join(path.dirname(path.dirname(inputShp)), "normalized", "phase1-event-inventory.csv")
  );

  const workbook = XLSX.readFile(inputDbf, {
    cellDates: false,
    dense: false
  });
  const worksheet = workbook.Sheets[workbook.SheetNames[0] ?? "Sheet1"];
  if (!worksheet) {
    throw new Error(`Unable to read DBF worksheet for ${inputDbf}.`);
  }

  const rows = XLSX.utils.sheet_to_json<SourceRow>(worksheet, {
    defval: "",
    raw: false
  });
  const headers = Object.keys(rows[0] ?? {});
  const headerMap = buildHeaderMap(headers);

  const matchedColumns = {
    eventId: selectStableIdField(rows, headerMap, parsed.eventIdField),
    eventTs: resolveColumn(
      headerMap,
      parsed.eventTsField,
      ["event_ts", "event_time", "date", "发生时间", "发生日期"],
      [["event", "time"], ["发生", "时间"]]
    ),
    longitude: resolveColumn(
      headerMap,
      parsed.longitudeField,
      ["longitude", "lon", "x", "经度"],
      [["longitude"], ["lon"], ["经度"]]
    ),
    latitude: resolveColumn(
      headerMap,
      parsed.latitudeField,
      ["latitude", "lat", "y", "纬度"],
      [["latitude"], ["lat"], ["纬度"]]
    ),
    province: resolveColumn(headerMap, parsed.provinceField, ["province", "省", "省份"], [["省"]]),
    city: resolveColumn(headerMap, parsed.cityField, ["city", "市"], [["市"]]),
    county: resolveColumn(headerMap, parsed.countyField, ["county", "区县", "县", "区"], [["县"], ["区"]]),
    locationText: resolveColumn(
      headerMap,
      parsed.locationField,
      ["location", "地点", "位置", "location_text"],
      [["位置"], ["地点"], ["location"]]
    )
  };

  const geometryCoordinates = parseShapefileCoordinates(inputShp);
  const warnings: string[] = [];

  if (!parsed.eventTs && !matchedColumns.eventTs) {
    warnings.push("No event timestamp field matched; using constant event timestamp is required.");
  }

  if (rows.length !== geometryCoordinates.length) {
    warnings.push(
      `DBF row count (${String(rows.length)}) does not match SHP record count (${String(geometryCoordinates.length)}).`
    );
  }

  const normalizedRows: NormalizedEventRow[] = rows.map((row, index) => {
    const geometry = geometryCoordinates[index] ?? {
      longitude: null,
      latitude: null,
      geometryType: "Unknown",
      coordinateSource: "none" as const
    };
    const rawEventId = getString(row, matchedColumns.eventId);
    const eventId =
      rawEventId.length > 0
        ? parsed.eventIdPrefix
          ? `${sanitizeEventIdPart(parsed.eventIdPrefix)}-${sanitizeEventIdPart(rawEventId)}`
          : sanitizeEventIdPart(rawEventId)
        : parsed.eventIdPrefix
          ? `${sanitizeEventIdPart(parsed.eventIdPrefix)}-${String(index + 1)}`
          : `${sanitizeEventIdPart(parsed.datasetKey)}-${String(index + 1)}`;
    const rowEventTs = parsed.eventTs?.trim() || getString(row, matchedColumns.eventTs);
    const province = parsed.province?.trim() || getString(row, matchedColumns.province);
    const city = parsed.city?.trim() || getString(row, matchedColumns.city);
    const county = parsed.county?.trim() || getString(row, matchedColumns.county);
    const longitude = getNumber(row, matchedColumns.longitude) ?? geometry.longitude;
    const latitude = getNumber(row, matchedColumns.latitude) ?? geometry.latitude;
    const regionCode = parsed.regionCode?.trim() || buildRegionCode(province, city, county);
    const locationText =
      getString(row, matchedColumns.locationText) ||
      parsed.locationText?.trim() ||
      [county, city, province].filter((value) => value.length > 0).join(", ");

    return {
      event_id: eventId,
      event_ts: normalizeDateTime(rowEventTs),
      region_code: regionCode,
      hazard_type: parsed.hazardType,
      province,
      city,
      county,
      longitude: toFieldString(longitude),
      latitude: toFieldString(latitude),
      location_text: locationText,
      time_precision: parsed.timePrecision,
      space_precision: parsed.spacePrecision,
      trigger_summary: parsed.triggerSummary?.trim() ?? "",
      news_title: parsed.newsTitle?.trim() ?? "",
      source_url: parsed.sourceUrl?.trim() ?? "",
      death_count: "",
      injury_count: "",
      economic_loss: "",
      raw_source_file: path.basename(inputShp),
      raw_sheet_name: workbook.SheetNames[0] ?? "Sheet1",
      source_row_index: String(index + 1),
      raw_geometry_type: geometry.geometryType,
      raw_coordinate_source: geometry.coordinateSource
    };
  });

  const incompleteCoordinateCount = normalizedRows.filter(
    (row) => row.longitude.length === 0 || row.latitude.length === 0
  ).length;
  if (incompleteCoordinateCount > 0) {
    warnings.push(`Rows missing coordinates after normalization: ${String(incompleteCoordinateCount)}.`);
  }

  await mkdir(path.dirname(outFile), { recursive: true });
  await writeFile(outFile, toCsv(normalizedRows), "utf-8");

  const report: NormalizationReport = {
    generatedAt: new Date().toISOString(),
    datasetKey: parsed.datasetKey,
    inputShp,
    inputDbf,
    rowCount: normalizedRows.length,
    outputFile: outFile,
    matchedColumns,
    warnings
  };
  await writeFile(`${outFile}.report.json`, JSON.stringify(report, null, 2), "utf-8");

  console.log(JSON.stringify(report, null, 2));
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
