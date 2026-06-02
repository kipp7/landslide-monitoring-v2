import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import proj4 from "proj4";
import { resolveRepoRoot } from "./intake-utils";
import {
  computePolygonCentroid,
  parsePolygonGeometries,
  readDbfRows
} from "./shapefile-utils";

type ParsedArgs = {
  inputShp?: string;
  outFile?: string;
  eventTs: string;
  sourceUrl: string;
  newsTitle: string;
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
  rowCount: number;
  outputFile: string;
  matchedColumns: Record<string, string>;
  centroidFallbackCount: number;
  warnings: string[];
};

const DATASET_KEY = "Zixing-2024";
const PROVINCE = "湖南省";
const CITY = "郴州市";
const COUNTY = "资兴市";
const REGION_CODE = `cn:${PROVINCE}:${CITY}:${COUNTY}`;
const DEFAULT_INPUT_SHP =
  ".tmp/regional-model-library/raw/Zixing-2024/original/event-inventory/RLZX-LIM.shp";
const DEFAULT_OUT_FILE =
  ".tmp/regional-model-library/raw/Zixing-2024/normalized/phase1-event-inventory.csv";
const TRIGGER_SUMMARY =
  "rainfall-triggered landslide inventory following the extreme rainfall event from 2024-07-26 to 2024-07-28 in Zixing";
const ZIXING_SOURCE_PROJ = "+proj=utm +zone=49 +datum=WGS84 +units=m +no_defs";

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    eventTs: "2024-07-28T00:00:00+08:00",
    sourceUrl: "https://www.nature.com/articles/s41597-025-05670-w",
    newsTitle: "Zixing July 2024 rainfall-triggered landslide inventory"
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token) continue;

    switch (token) {
      case "--input-shp":
        parsed.inputShp = argv[index + 1];
        index += 1;
        break;
      case "--out-file":
        parsed.outFile = argv[index + 1];
        index += 1;
        break;
      case "--event-ts":
        parsed.eventTs = argv[index + 1] ?? parsed.eventTs;
        index += 1;
        break;
      case "--source-url":
        parsed.sourceUrl = argv[index + 1] ?? parsed.sourceUrl;
        index += 1;
        break;
      case "--news-title":
        parsed.newsTitle = argv[index + 1] ?? parsed.newsTitle;
        index += 1;
        break;
      default:
        break;
    }
  }

  return parsed;
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

async function main(): Promise<void> {
  const repoRoot = resolveRepoRoot(__dirname);
  const parsed = parseArgs(process.argv.slice(2));
  const inputShp = path.resolve(repoRoot, parsed.inputShp ?? DEFAULT_INPUT_SHP);
  const inputDbf = inputShp.replace(/\.shp$/iu, ".dbf");
  const outFile = path.resolve(repoRoot, parsed.outFile ?? DEFAULT_OUT_FILE);

  const source = readDbfRows(inputDbf);
  const polygons = parsePolygonGeometries(inputShp);
  const warnings: string[] = [];

  if (source.rows.length !== polygons.length) {
    warnings.push(
      `DBF row count (${String(source.rows.length)}) does not match SHP record count (${String(
        polygons.length
      )}).`
    );
  }

  let centroidFallbackCount = 0;
  const normalizedRows: NormalizedEventRow[] = source.rows.map((_, index) => {
    const polygon = polygons[index];
    const centroid = polygon ? computePolygonCentroid(polygon) : { longitude: null, latitude: null, coordinateSource: "none" as const };
    const transformed =
      centroid.longitude !== null && centroid.latitude !== null
        ? proj4(ZIXING_SOURCE_PROJ, proj4.WGS84, [centroid.longitude, centroid.latitude] as [number, number])
        : null;
    if (centroid.coordinateSource === "bbox-center") {
      centroidFallbackCount += 1;
    }

    return {
      event_id: `${DATASET_KEY}-${String(index + 1)}`,
      event_ts: parsed.eventTs,
      region_code: REGION_CODE,
      hazard_type: "landslide",
      province: PROVINCE,
      city: CITY,
      county: COUNTY,
      longitude: transformed ? String(transformed[0]) : "",
      latitude: transformed ? String(transformed[1]) : "",
      location_text: `${PROVINCE}${CITY}${COUNTY}`,
      time_precision: "day",
      space_precision: "county",
      trigger_summary: TRIGGER_SUMMARY,
      news_title: parsed.newsTitle,
      source_url: parsed.sourceUrl,
      death_count: "",
      injury_count: "",
      economic_loss: "",
      raw_source_file: path.basename(inputShp),
      raw_sheet_name: source.sheetName,
      source_row_index: String(index + 1),
      raw_geometry_type: polygon?.geometryType ?? "Unknown",
      raw_coordinate_source: centroid.coordinateSource
    };
  });

  const missingCoordinateCount = normalizedRows.filter(
    (row) => row.longitude.length === 0 || row.latitude.length === 0
  ).length;
  if (missingCoordinateCount > 0) {
    warnings.push(`Rows missing centroid coordinates after normalization: ${String(missingCoordinateCount)}.`);
  }

  await mkdir(path.dirname(outFile), { recursive: true });
  await writeFile(outFile, toCsv(normalizedRows), "utf-8");

  const report: NormalizationReport = {
    generatedAt: new Date().toISOString(),
    datasetKey: DATASET_KEY,
    inputShp,
    rowCount: normalizedRows.length,
    outputFile: outFile,
    matchedColumns: {
      geometry: "polygon-centroid",
      regionCode: REGION_CODE
    },
    centroidFallbackCount,
    warnings
  };
  await writeFile(`${outFile}.report.json`, JSON.stringify(report, null, 2), "utf-8");

  console.log(JSON.stringify(report, null, 2));
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
