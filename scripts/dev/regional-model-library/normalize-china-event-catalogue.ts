import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import * as XLSX from "xlsx";
import {
  collectLandingEntries,
  findIntakeManifestOrThrow,
  resolveRepoRoot
} from "./intake-utils";

type ParsedArgs = {
  rawRoot?: string;
  input?: string;
  outFile?: string;
  language?: "zh" | "en" | "auto";
  sheetName?: string;
};

type TabularLoad = {
  filePath: string;
  sheetName?: string;
  rows: Record<string, unknown>[];
};

type NormalizedEventRow = {
  event_id: string;
  event_ts: string;
  region_code: string;
  hazard_type: "landslide";
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
};

type NormalizationReport = {
  generatedAt: string;
  inputFile: string;
  inputSheetName: string;
  rowCount: number;
  outputFile: string;
  matchedColumns: Record<string, string | null>;
  warnings: string[];
};

const DEFAULT_DATASET_KEY = "China-2008-2024-catalogue";

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    language: "auto"
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token) continue;

    switch (token) {
      case "--raw-root":
        parsed.rawRoot = argv[index + 1];
        index += 1;
        break;
      case "--input":
        parsed.input = argv[index + 1];
        index += 1;
        break;
      case "--out-file":
        parsed.outFile = argv[index + 1];
        index += 1;
        break;
      case "--language": {
        const value = argv[index + 1];
        if (value === "zh" || value === "en" || value === "auto") {
          parsed.language = value;
        }
        index += 1;
        break;
      }
      case "--sheet-name":
        parsed.sheetName = argv[index + 1];
        index += 1;
        break;
      default:
        break;
    }
  }

  return parsed;
}

function normalizeHeader(header: string): string {
  return header
    .replace(/^\uFEFF/u, "")
    .trim()
    .toLowerCase()
    .replace(/[（）()【】\[\]{}]/gu, "")
    .replace(/[\s_\-/:：，,.;；"'`]/gu, "");
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === "\"") {
      const nextCharacter = line[index + 1];
      if (inQuotes && nextCharacter === "\"") {
        current += "\"";
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

function parseCsvContent(content: string): Record<string, unknown>[] {
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
    const row: Record<string, unknown> = {};
    headers.forEach((header, index) => {
      row[header] = values[index] ?? "";
    });
    return row;
  });
}

async function loadTabularInput(filePath: string, sheetName?: string): Promise<TabularLoad> {
  const extension = path.extname(filePath).toLowerCase();

  if (extension === ".csv") {
    const content = await readFile(filePath, "utf-8");
    return {
      filePath,
      rows: parseCsvContent(content)
    };
  }

  const workbook = XLSX.readFile(filePath, {
    cellDates: false,
    dense: false
  });
  const targetSheetName = sheetName ?? workbook.SheetNames[0];
  if (!targetSheetName) {
    return {
      filePath,
      rows: []
    };
  }

  const worksheet = workbook.Sheets[targetSheetName];
  if (!worksheet) {
    throw new Error(`Sheet not found: ${targetSheetName}`);
  }

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
    defval: "",
    raw: false,
    dateNF: "yyyy-mm-dd hh:mm:ss"
  });

  return {
    filePath,
    sheetName: targetSheetName,
    rows
  };
}

function getString(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
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
  exactCandidates: readonly string[],
  tokenGroups: readonly string[][] = []
): string | null {
  for (const candidate of exactCandidates) {
    const normalized = normalizeHeader(candidate);
    const matched = headerMap.get(normalized);
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

function sanitizeRegionPart(value: string): string {
  return value.replace(/[\\/|]/gu, "-").replace(/\s+/gu, "").trim();
}

function buildRegionCode(province: string, city: string, county: string): string {
  const parts = [province, city, county].map(sanitizeRegionPart).filter((part) => part.length > 0);
  return parts.length > 0 ? `cn:${parts.join(":")}` : "unknown-region";
}

function normalizeDateTime(rawValue: string): string {
  const normalized = rawValue.replace(/[年月]/gu, "-").replace(/[日]/gu, "").replace(/\//gu, "-").trim();

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

async function findInputFile(
  rawRoot: string,
  rawLandingRelative: string,
  preferredNames: readonly string[],
  language: "zh" | "en" | "auto"
): Promise<string> {
  const landingEntries = await collectLandingEntries(rawRoot);
  const candidates = landingEntries
    .filter(
      (entry) =>
        entry.kind === "file" &&
        /\.(xlsx|xls|csv)$/iu.test(entry.absolutePath) &&
        preferredNames.includes(path.basename(entry.absolutePath))
    )
    .filter((entry) => {
      if (rawLandingRelative.trim().length === 0) {
        return true;
      }

      const normalizedPath = entry.relativePath.replace(/\\/gu, "/").toLowerCase();
      const normalizedTarget = rawLandingRelative.replace(/\\/gu, "/").toLowerCase();
      return (
        normalizedPath.startsWith(`${normalizedTarget}/`) ||
        normalizedPath.includes(`/${normalizedTarget}/`) ||
        normalizedPath.startsWith("source/") ||
        normalizedPath.startsWith("original/") ||
        normalizedPath.startsWith("unpacked/")
      );
    })
    .map((entry) => entry.absolutePath);

  const order =
    language === "zh"
      ? candidates
      : language === "en"
        ? [...candidates].reverse()
        : candidates;

  for (const candidate of order) {
    try {
      await readFile(candidate);
      return candidate;
    } catch {
      continue;
    }
  }

  throw new Error(`No input file found under ${rawRoot}`);
}

async function main(): Promise<void> {
  const repoRoot = resolveRepoRoot(__dirname);
  const parsed = parseArgs(process.argv.slice(2));
  const manifest = findIntakeManifestOrThrow(DEFAULT_DATASET_KEY);
  const eventFamily = manifest.families.find((family) => family.familyKey === "event-catalogue");
  if (!eventFamily) {
    throw new Error("event-catalogue family not found in intake manifest.");
  }

  const rawRoot = path.resolve(repoRoot, parsed.rawRoot ?? manifest.rawLandingRoot);
  const inputFile =
    parsed.input ??
    (await findInputFile(
      rawRoot,
      eventFamily.rawLandingRelative,
      eventFamily.selectionHints?.preferredFileNames ?? [],
      parsed.language ?? "auto"
    ));
  const outFile =
    parsed.outFile ??
    path.join(rawRoot, "normalized", "phase1-event-inventory.csv");

  const input = await loadTabularInput(inputFile, parsed.sheetName);
  const headers = Object.keys(input.rows[0] ?? {});
  const headerMap = buildHeaderMap(headers);

  const matchedColumns = {
    eventId: resolveColumn(headerMap, ["event_id", "唯一滑坡事件ID", "滑坡事件ID", "事件ID", "编号"], [["event", "id"]]),
    eventTs: resolveColumn(headerMap, ["event_ts", "event_time", "发生时间", "发生日期", "时间"], [["发生", "时间"], ["event", "time"]]),
    province: resolveColumn(headerMap, ["province", "省", "省份"], [["province"], ["省"]]),
    city: resolveColumn(headerMap, ["city", "市", "地级市"], [["city"], ["市"]]),
    county: resolveColumn(headerMap, ["county", "区县", "县区", "县", "区"], [["county"], ["区县"], ["县"]]),
    longitude: resolveColumn(headerMap, ["longitude", "lon", "经度"], [["经度"], ["longitude"]]),
    latitude: resolveColumn(headerMap, ["latitude", "lat", "纬度"], [["纬度"], ["latitude"]]),
    location: resolveColumn(headerMap, ["location", "详细位置", "位置", "地点"], [["位置"], ["location"]]),
    timePrecision: resolveColumn(headerMap, ["time_precision", "时间精度"], [["时间", "精度"]]),
    spacePrecision: resolveColumn(headerMap, ["space_precision", "空间精度"], [["空间", "精度"]]),
    triggerSummary: resolveColumn(headerMap, ["trigger_type", "诱发因素", "触发因素", "trigger_summary"], [["trigger"], ["诱发"], ["触发"]]),
    newsTitle: resolveColumn(headerMap, ["news_title", "新闻标题", "标题"], [["新闻", "标题"], ["title"]]),
    sourceUrl: resolveColumn(headerMap, ["source_url", "新闻链接", "链接", "url"], [["source", "url"], ["新闻", "链接"], ["url"]]),
    deathCount: resolveColumn(headerMap, ["death_count", "死亡人数"], [["死亡", "人数"]]),
    injuryCount: resolveColumn(headerMap, ["injury_count", "受伤人数"], [["受伤", "人数"]]),
    economicLoss: resolveColumn(headerMap, ["economic_loss", "经济损失"], [["经济", "损失"]])
  };

  const warnings = Object.entries(matchedColumns)
    .filter(([, value]) => value === null)
    .map(([key]) => `Unresolved input column: ${key}`);

  const normalizedRows: NormalizedEventRow[] = input.rows
    .map((row, index) => {
      const province = getString(matchedColumns.province ? row[matchedColumns.province] : "");
      const city = getString(matchedColumns.city ? row[matchedColumns.city] : "");
      const county = getString(matchedColumns.county ? row[matchedColumns.county] : "");
      const rawEventTs = getString(matchedColumns.eventTs ? row[matchedColumns.eventTs] : "");
      const locationText = getString(matchedColumns.location ? row[matchedColumns.location] : "");
      const eventId =
        getString(matchedColumns.eventId ? row[matchedColumns.eventId] : "") ||
        `${DEFAULT_DATASET_KEY}:${index + 1}`;

      if (rawEventTs.length === 0) {
        return null;
      }

      return {
        event_id: eventId,
        event_ts: normalizeDateTime(rawEventTs),
        region_code: buildRegionCode(province, city, county),
        hazard_type: "landslide",
        province,
        city,
        county,
        longitude: getString(matchedColumns.longitude ? row[matchedColumns.longitude] : ""),
        latitude: getString(matchedColumns.latitude ? row[matchedColumns.latitude] : ""),
        location_text: locationText,
        time_precision: getString(matchedColumns.timePrecision ? row[matchedColumns.timePrecision] : ""),
        space_precision: getString(matchedColumns.spacePrecision ? row[matchedColumns.spacePrecision] : ""),
        trigger_summary: getString(matchedColumns.triggerSummary ? row[matchedColumns.triggerSummary] : ""),
        news_title: getString(matchedColumns.newsTitle ? row[matchedColumns.newsTitle] : ""),
        source_url: getString(matchedColumns.sourceUrl ? row[matchedColumns.sourceUrl] : ""),
        death_count: getString(matchedColumns.deathCount ? row[matchedColumns.deathCount] : ""),
        injury_count: getString(matchedColumns.injuryCount ? row[matchedColumns.injuryCount] : ""),
        economic_loss: getString(matchedColumns.economicLoss ? row[matchedColumns.economicLoss] : ""),
        raw_source_file: path.basename(input.filePath),
        raw_sheet_name: input.sheetName ?? "",
        source_row_index: String(index + 2)
      };
    })
    .filter((row): row is NormalizedEventRow => row !== null);

  await mkdir(path.dirname(outFile), { recursive: true });
  await writeFile(outFile, toCsv(normalizedRows), "utf-8");

  const report: NormalizationReport = {
    generatedAt: new Date().toISOString(),
    inputFile: input.filePath,
    inputSheetName: input.sheetName ?? "",
    rowCount: normalizedRows.length,
    outputFile: outFile,
    matchedColumns,
    warnings
  };

  await writeFile(
    `${outFile}.report.json`,
    JSON.stringify(report, null, 2),
    "utf-8"
  );

  console.log(JSON.stringify(report, null, 2));
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
