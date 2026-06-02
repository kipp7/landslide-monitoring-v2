import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { resolveRepoRoot } from "./intake-utils";
import {
  computePolygonCentroid,
  getNumber,
  getString,
  parsePolygonGeometries,
  parseShapefileCoordinates,
  pointInPolygon,
  readDbfRows,
  type PolygonGeometry,
  type SourceRow
} from "./shapefile-utils";

type ParsedArgs = {
  inputShp?: string;
  countyShp?: string;
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

type CountyRecord = {
  englishName: string;
  chineseName: string;
  geometry: PolygonGeometry;
};

type NormalizationReport = {
  generatedAt: string;
  datasetKey: string;
  inputShp: string;
  countyShp: string;
  rowCount: number;
  outputFile: string;
  matchedColumns: Record<string, string>;
  unmatchedCountyCount: number;
  countyCounts: Record<string, number>;
  warnings: string[];
};

const DATASET_KEY = "Beijing-2023";
const PROVINCE = "北京市";
const CITY = "北京市";
const DEFAULT_INPUT_SHP =
  ".tmp/regional-model-library/raw/Beijing-2023/original/event-inventory/Point_RLBJ.shp";
const DEFAULT_COUNTY_SHP =
  ".tmp/regional-model-library/raw/Beijing-2023/unpacked/mpk-package/commondata/行政区_opdata/县级 - 副本.shp";
const DEFAULT_OUT_FILE =
  ".tmp/regional-model-library/raw/Beijing-2023/normalized/phase1-event-inventory.csv";
const COUNTY_NAME_MAP: Record<string, string> = {
  Changping: "昌平区",
  Chaoyang: "朝阳区",
  Daxing: "大兴区",
  Dongcheng: "东城区",
  Fangshan: "房山区",
  Fengtai: "丰台区",
  Haidian: "海淀区",
  Huairou: "怀柔区",
  Mentougou: "门头沟区",
  Miyun: "密云区",
  Pinggu: "平谷区",
  Shijingshan: "石景山区",
  Shunyi: "顺义区",
  Tongzhou: "通州区",
  Xicheng: "西城区",
  Yanqing: "延庆区"
};
const TRIGGER_SUMMARY =
  "rainfall-triggered landslide inventory following the historic Beijing rainstorm from 2023-07-29 to 2023-08-02";

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    eventTs: "2023-08-02T00:00:00+08:00",
    sourceUrl: "https://www.nature.com/articles/s41597-024-03901-0",
    newsTitle: "Beijing July 2023 rainfall-triggered landslide inventory"
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token) continue;

    switch (token) {
      case "--input-shp":
        parsed.inputShp = argv[index + 1];
        index += 1;
        break;
      case "--county-shp":
        parsed.countyShp = argv[index + 1];
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

function buildRegionCode(county: string): string {
  return `cn:${PROVINCE}:${CITY}:${county}`;
}

function sanitizeEventIdPart(value: string): string {
  return value.replace(/[<>:"/\\|?*\s]+/gu, "-").replace(/-+/gu, "-").replace(/^-|-$/gu, "");
}

function buildCountyRecords(countyRows: readonly SourceRow[], countyGeometries: readonly PolygonGeometry[]): {
  counties: CountyRecord[];
  warnings: string[];
} {
  const warnings: string[] = [];
  const counties: CountyRecord[] = [];

  countyRows.forEach((row, index) => {
    const englishName = getString(row.ENG_NAME);
    const chineseName = COUNTY_NAME_MAP[englishName];
    const geometry = countyGeometries[index];

    if (!geometry || !englishName) {
      return;
    }

    if (!chineseName) {
      warnings.push(`No Chinese county mapping defined for ${englishName}.`);
      return;
    }

    counties.push({
      englishName,
      chineseName,
      geometry
    });
  });

  return { counties, warnings };
}

function assignCounty(
  longitude: number | null,
  latitude: number | null,
  counties: readonly CountyRecord[]
): CountyRecord | null {
  if (longitude === null || latitude === null) {
    return null;
  }

  for (const county of counties) {
    if (
      pointInPolygon(
        {
          longitude,
          latitude
        },
        county.geometry
      )
    ) {
      return county;
    }
  }

  return null;
}

async function main(): Promise<void> {
  const repoRoot = resolveRepoRoot(__dirname);
  const parsed = parseArgs(process.argv.slice(2));
  const inputShp = path.resolve(repoRoot, parsed.inputShp ?? DEFAULT_INPUT_SHP);
  const inputDbf = inputShp.replace(/\.shp$/iu, ".dbf");
  const countyShp = path.resolve(repoRoot, parsed.countyShp ?? DEFAULT_COUNTY_SHP);
  const countyDbf = countyShp.replace(/\.shp$/iu, ".dbf");
  const outFile = path.resolve(repoRoot, parsed.outFile ?? DEFAULT_OUT_FILE);

  const source = readDbfRows(inputDbf);
  const countySource = readDbfRows(countyDbf);
  const pointGeometries = parseShapefileCoordinates(inputShp);
  const countyGeometries = parsePolygonGeometries(countyShp);
  const { counties, warnings } = buildCountyRecords(countySource.rows, countyGeometries);

  if (source.rows.length !== pointGeometries.length) {
    warnings.push(
      `DBF row count (${String(source.rows.length)}) does not match SHP record count (${String(
        pointGeometries.length
      )}).`
    );
  }

  const countyCounts = new Map<string, number>();
  let unmatchedCountyCount = 0;

  const normalizedRows: NormalizedEventRow[] = source.rows.map((row, index) => {
    const geometry = pointGeometries[index] ?? {
      longitude: null,
      latitude: null,
      geometryType: "Unknown",
      coordinateSource: "none" as const
    };
    const longitude = getNumber(row.O_Lng) ?? geometry.longitude;
    const latitude = getNumber(row.O_Lat) ?? geometry.latitude;
    const countyMatch = assignCounty(longitude, latitude, counties);
    const county = countyMatch?.chineseName ?? "";

    if (county.length === 0) {
      unmatchedCountyCount += 1;
    } else {
      countyCounts.set(county, (countyCounts.get(county) ?? 0) + 1);
    }

    const rawUid = getString(row.UID);
    const eventId = rawUid.length > 0 ? `${DATASET_KEY}-${sanitizeEventIdPart(rawUid)}` : `${DATASET_KEY}-${String(index + 1)}`;
    const locationText = county.length > 0 ? `${CITY}${county}` : CITY;

    return {
      event_id: eventId,
      event_ts: parsed.eventTs,
      region_code: county.length > 0 ? buildRegionCode(county) : `cn:${PROVINCE}:${CITY}`,
      hazard_type: "landslide",
      province: PROVINCE,
      city: CITY,
      county,
      longitude: toFieldString(longitude),
      latitude: toFieldString(latitude),
      location_text: locationText,
      time_precision: "day",
      space_precision: county.length > 0 ? "district" : "city",
      trigger_summary: TRIGGER_SUMMARY,
      news_title: parsed.newsTitle,
      source_url: parsed.sourceUrl,
      death_count: "",
      injury_count: "",
      economic_loss: "",
      raw_source_file: path.basename(inputShp),
      raw_sheet_name: source.sheetName,
      source_row_index: String(index + 1),
      raw_geometry_type: geometry.geometryType,
      raw_coordinate_source: geometry.coordinateSource
    };
  });

  if (unmatchedCountyCount > 0) {
    warnings.push(`Rows without county assignment after spatial join: ${String(unmatchedCountyCount)}.`);
  }

  await mkdir(path.dirname(outFile), { recursive: true });
  await writeFile(outFile, toCsv(normalizedRows), "utf-8");

  const report: NormalizationReport = {
    generatedAt: new Date().toISOString(),
    datasetKey: DATASET_KEY,
    inputShp,
    countyShp,
    rowCount: normalizedRows.length,
    outputFile: outFile,
    matchedColumns: {
      eventId: "UID",
      longitude: "O_Lng",
      latitude: "O_Lat",
      countyJoinField: "ENG_NAME"
    },
    unmatchedCountyCount,
    countyCounts: Object.fromEntries(
      [...countyCounts.entries()].sort((left, right) => left[0].localeCompare(right[0], "zh-CN"))
    ),
    warnings
  };
  await writeFile(`${outFile}.report.json`, JSON.stringify(report, null, 2), "utf-8");

  console.log(JSON.stringify(report, null, 2));
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
