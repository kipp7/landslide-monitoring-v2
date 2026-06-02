import path from "node:path";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import * as XLSX from "xlsx";
import { resolveRepoRoot } from "./intake-utils";

type ParsedArgs = {
  unpackedRoot?: string;
  outRoot?: string;
};

type WorksheetMatrixInput = {
  filePath: string;
  sheetName: string;
  rows: string[][];
};

type FamilyOutputRow = Record<string, string>;

type ScalarTableLayout = {
  dataStartIndex: number;
  timeColumnIndex: number;
  valueColumnIndex: number;
  valueHeader: string;
};

type LongTableLayout = {
  dataStartIndex: number;
  timeColumnIndex: number;
  metricColumns: Array<{
    columnIndex: number;
    identity: string;
  }>;
};

const DEFAULT_RAW_ROOT = ".tmp/regional-model-library/raw/ThreeGorges/Baijiabao-2017-2024";
const DEFAULT_STATION_CODE = "Baijiabao";
const DEFAULT_SLOPE_CODE = "Baijiabao";
const TIME_FIELD_CANDIDATES = ["观测时间", "obs_time", "日期", "时间"] as const;
const GENERIC_ID_HEADER_CANDIDATES = ["监测点编号", "point_id", "crack_id", "编号"] as const;

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token) continue;

    switch (token) {
      case "--unpacked-root":
        parsed.unpackedRoot = argv[index + 1];
        index += 1;
        break;
      case "--out-root":
        parsed.outRoot = argv[index + 1];
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

function headerMatchesCandidate(header: string, candidate: string): boolean {
  const normalizedHeader = normalizeHeader(header);
  const normalizedCandidate = normalizeHeader(candidate);
  if (!normalizedHeader || !normalizedCandidate) {
    return false;
  }

  return (
    normalizedHeader === normalizedCandidate ||
    normalizedHeader.includes(normalizedCandidate) ||
    normalizedCandidate.includes(normalizedHeader)
  );
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

function parseCsvContent(content: string): string[][] {
  return content
    .replace(/^\uFEFF/u, "")
    .split(/\r?\n/u)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0)
    .map((line) => parseCsvLine(line));
}

function getString(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

function isNonEmptyRow(row: readonly string[]): boolean {
  return row.some((value) => value.trim().length > 0);
}

function normalizeObsTime(rawValue: string): string {
  const trimmed = rawValue.trim().replace(/\u00A0/gu, " ");
  if (trimmed.length === 0) {
    return "";
  }

  const chineseMatch = trimmed.match(
    /^(\d{4})年(\d{1,2})月(\d{1,2})日(?:\s+(\d{1,2})[:：时](\d{1,2})(?:[:：分](\d{1,2}))?)?$/u
  );
  if (chineseMatch) {
    const [, year, month, day, hour = "00", minute = "00", second = "00"] = chineseMatch;
    const paddedDate = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    if (hour === "00" && minute === "00" && second === "00") {
      return paddedDate;
    }

    return `${paddedDate} ${hour.padStart(2, "0")}:${minute.padStart(2, "0")}:${second.padStart(2, "0")}`;
  }

  const isoMatch = trimmed.match(
    /^(\d{4})-(\d{1,2})-(\d{1,2})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/u
  );
  if (isoMatch) {
    const [, year, month, day, hour, minute, second] = isoMatch;
    const paddedDate = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    if (!hour || !minute) {
      return paddedDate;
    }

    return `${paddedDate} ${hour.padStart(2, "0")}:${minute.padStart(2, "0")}:${(second ?? "00").padStart(2, "0")}`;
  }

  return trimmed;
}

function resolveRootPath(
  repoRoot: string,
  rawRoot: string,
  provided: string | undefined,
  fallbackRelativeToRawRoot: string
): string {
  if (!provided || provided.trim().length === 0) {
    return path.resolve(rawRoot, fallbackRelativeToRawRoot);
  }

  if (path.isAbsolute(provided)) {
    return provided;
  }

  if (provided.startsWith(".")) {
    return path.resolve(repoRoot, provided);
  }

  return path.resolve(rawRoot, provided);
}

async function loadWorksheetMatrix(filePath: string): Promise<WorksheetMatrixInput> {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".csv") {
    const content = await readFile(filePath, "utf-8");
    return {
      filePath,
      sheetName: path.basename(filePath),
      rows: parseCsvContent(content)
    };
  }

  const workbook = XLSX.readFile(filePath, {
    cellDates: false,
    dense: false
  });
  const sheetName = workbook.SheetNames[0] ?? "Sheet1";
  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) {
    return {
      filePath,
      sheetName,
      rows: []
    };
  }

  const rows = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(worksheet, {
    header: 1,
    raw: false,
    blankrows: false,
    defval: ""
  });

  return {
    filePath,
    sheetName,
    rows: rows.map((row) => row.map((cell) => getString(cell)))
  };
}

async function findMatchingFile(rootPath: string, patterns: readonly string[]): Promise<string> {
  const entries = await readdir(rootPath, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(rootPath, entry.name));

  for (const pattern of patterns) {
    const regExp = new RegExp(
      `^${pattern.replace(/[|\\{}()[\]^$+?.]/gu, "\\$&").replace(/\*/gu, ".*")}$`,
      "iu"
    );
    const matched = files.find((filePath) => regExp.test(path.basename(filePath)));
    if (matched) {
      return matched;
    }
  }

  throw new Error(`No file matched patterns: ${patterns.join(", ")}`);
}

function resolveHeaderRowIndex(rows: readonly string[][]): number {
  const matchedIndex = rows.findIndex((row) =>
    row.some((cell) =>
      TIME_FIELD_CANDIDATES.some((candidate) => headerMatchesCandidate(cell, candidate))
    )
  );
  if (matchedIndex >= 0) {
    return matchedIndex;
  }

  return rows.findIndex((row) => isNonEmptyRow(row));
}

function resolveTimeColumnIndex(headerRow: readonly string[]): number {
  const matchedIndex = headerRow.findIndex((cell) =>
    TIME_FIELD_CANDIDATES.some((candidate) => headerMatchesCandidate(cell, candidate))
  );
  if (matchedIndex >= 0) {
    return matchedIndex;
  }

  throw new Error(`Could not resolve time field from headers: ${headerRow.join(", ")}`);
}

function resolveScalarTableLayout(
  input: WorksheetMatrixInput,
  valueFieldCandidates: readonly string[]
): ScalarTableLayout {
  const headerIndex = resolveHeaderRowIndex(input.rows);
  if (headerIndex < 0) {
    throw new Error(`Could not resolve scalar header row for ${path.basename(input.filePath)}.`);
  }

  const headerRow = input.rows[headerIndex] ?? [];
  const timeColumnIndex = resolveTimeColumnIndex(headerRow);
  const valueColumnIndex = headerRow.findIndex(
    (cell, columnIndex) =>
      columnIndex !== timeColumnIndex &&
      valueFieldCandidates.some((candidate) => headerMatchesCandidate(cell, candidate))
  );

  if (valueColumnIndex < 0) {
    throw new Error(
      `Could not resolve scalar value field from headers: ${headerRow.join(", ")}`
    );
  }

  return {
    dataStartIndex: headerIndex + 1,
    timeColumnIndex,
    valueColumnIndex,
    valueHeader: headerRow[valueColumnIndex] ?? ""
  };
}

function resolveLongTableLayout(input: WorksheetMatrixInput): LongTableLayout {
  const headerIndex = resolveHeaderRowIndex(input.rows);
  if (headerIndex < 0) {
    throw new Error(`Could not resolve long-table header row for ${path.basename(input.filePath)}.`);
  }

  const headerRow = input.rows[headerIndex] ?? [];
  const timeColumnIndex = resolveTimeColumnIndex(headerRow);
  const identityRow = input.rows[headerIndex + 1] ?? [];
  const useIdentityRow =
    identityRow.length > 0 &&
    identityRow.some((cell) => cell.trim().length > 0) &&
    headerRow.some((cell) =>
      GENERIC_ID_HEADER_CANDIDATES.some((candidate) => headerMatchesCandidate(cell, candidate))
    );

  const columnCount = Math.max(headerRow.length, identityRow.length);
  const metricColumns: LongTableLayout["metricColumns"] = [];

  for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
    if (columnIndex === timeColumnIndex) {
      continue;
    }

    const topValue = getString(headerRow[columnIndex] ?? "");
    const nextValue = getString(identityRow[columnIndex] ?? "");
    const identity =
      nextValue.length > 0
        ? nextValue
        : GENERIC_ID_HEADER_CANDIDATES.some((candidate) => headerMatchesCandidate(topValue, candidate))
          ? ""
          : topValue;

    if (identity.length === 0) {
      continue;
    }

    metricColumns.push({
      columnIndex,
      identity
    });
  }

  if (metricColumns.length === 0) {
    throw new Error(`Could not resolve metric columns from headers: ${headerRow.join(", ")}`);
  }

  return {
    dataStartIndex: headerIndex + (useIdentityRow ? 2 : 1),
    timeColumnIndex,
    metricColumns
  };
}

function escapeCsvValue(value: string): string {
  if (/[",\r\n]/u.test(value)) {
    return `"${value.replace(/"/gu, "\"\"")}"`;
  }

  return value;
}

function writeCsvContent(rows: readonly FamilyOutputRow[]): string {
  if (rows.length === 0) {
    return "";
  }

  const headers = Object.keys(rows[0]) as string[];
  return [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => escapeCsvValue(row[header] ?? "")).join(","))
  ].join("\n");
}

function buildLongRows(
  input: WorksheetMatrixInput,
  valueKey: string,
  identityKey: "point_id" | "crack_id",
  rawMetricName: string,
  rawUnit: string
): FamilyOutputRow[] {
  const layout = resolveLongTableLayout(input);

  return input.rows.slice(layout.dataStartIndex).flatMap((row) => {
    const obsTime = normalizeObsTime(getString(row[layout.timeColumnIndex] ?? ""));
    if (obsTime.length === 0) {
      return [];
    }

    return layout.metricColumns.flatMap((metricColumn) => {
      const rawValue = getString(row[metricColumn.columnIndex] ?? "");
      if (rawValue.length === 0) {
        return [];
      }

      return [
        {
          obs_time: obsTime,
          station_code: DEFAULT_STATION_CODE,
          slope_code: DEFAULT_SLOPE_CODE,
          [identityKey]: metricColumn.identity,
          [valueKey]: rawValue,
          raw_metric_name: rawMetricName,
          raw_unit: rawUnit,
          raw_value_field: metricColumn.identity,
          workbook_title: path.basename(input.filePath, path.extname(input.filePath)),
          source_file: path.basename(input.filePath),
          source_sheet_name: input.sheetName
        }
      ];
    });
  });
}

function buildScalarRows(
  input: WorksheetMatrixInput,
  valueFieldCandidates: readonly string[],
  valueKey: string,
  rawMetricName: string,
  rawUnit: string
): FamilyOutputRow[] {
  const layout = resolveScalarTableLayout(input, valueFieldCandidates);

  return input.rows.slice(layout.dataStartIndex).flatMap((row) => {
    const obsTime = normalizeObsTime(getString(row[layout.timeColumnIndex] ?? ""));
    const rawValue = getString(row[layout.valueColumnIndex] ?? "");
    if (obsTime.length === 0 || rawValue.length === 0) {
      return [];
    }

    return [
      {
        obs_time: obsTime,
        station_code: DEFAULT_STATION_CODE,
        slope_code: DEFAULT_SLOPE_CODE,
        [valueKey]: rawValue,
        raw_metric_name: rawMetricName,
        raw_unit: rawUnit,
        raw_value_field: layout.valueHeader,
        workbook_title: path.basename(input.filePath, path.extname(input.filePath)),
        source_file: path.basename(input.filePath),
        source_sheet_name: input.sheetName
      }
    ];
  });
}

async function writeFamilyCsv(
  outRoot: string,
  familyKey: string,
  rows: readonly FamilyOutputRow[]
): Promise<string> {
  const outFile = path.join(outRoot, `${familyKey}.csv`);
  await mkdir(path.dirname(outFile), { recursive: true });
  await writeFile(outFile, writeCsvContent(rows), "utf-8");
  return outFile;
}

async function main(): Promise<void> {
  const repoRoot = resolveRepoRoot(__dirname);
  const parsed = parseArgs(process.argv.slice(2));
  const rawRoot = path.resolve(repoRoot, DEFAULT_RAW_ROOT);
  const unpackedRoot = resolveRootPath(repoRoot, rawRoot, parsed.unpackedRoot, "unpacked");
  const outRoot = resolveRootPath(
    repoRoot,
    rawRoot,
    parsed.outRoot,
    path.join("normalized", "phase1-families")
  );

  const deformationFile = await findMatchingFile(unpackedRoot, [
    "*GNSS*.xls*",
    "*地表位移*.xls*",
    "*deformation*.xls*",
    "*GNSS*.csv"
  ]);
  const crackFile = await findMatchingFile(unpackedRoot, [
    "*裂缝*.xls*",
    "*crack*.xls*",
    "*裂缝*.csv"
  ]);
  const rainfallFile = await findMatchingFile(unpackedRoot, [
    "*雨量*.xls*",
    "*降雨*.xls*",
    "*rain*.xls*",
    "*雨量*.csv"
  ]);
  const reservoirFile = await findMatchingFile(unpackedRoot, [
    "*库水位*.xls*",
    "*水位*.xls*",
    "*reservoir*.xls*",
    "*水位*.csv"
  ]);

  const deformationInput = await loadWorksheetMatrix(deformationFile);
  const crackInput = await loadWorksheetMatrix(crackFile);
  const rainfallInput = await loadWorksheetMatrix(rainfallFile);
  const reservoirInput = await loadWorksheetMatrix(reservoirFile);

  const deformationRows = buildLongRows(
    deformationInput,
    "cumulative_displacement_mm",
    "point_id",
    "累计位移",
    "mm"
  );
  const crackRows = buildLongRows(
    crackInput,
    "crack_displacement_mm",
    "crack_id",
    "裂缝相对位移",
    "mm"
  );
  const rainfallRows = buildScalarRows(
    rainfallInput,
    ["日降雨量（mm）", "日降雨量", "rainfall_mm"],
    "daily_rainfall_mm",
    "日降雨量",
    "mm"
  );
  const reservoirRows = buildScalarRows(
    reservoirInput,
    ["三峡库水位（m）", "库水位", "water_level_m"],
    "water_level_m",
    "三峡库水位",
    "m"
  );

  const outputs = {
    deformation: await writeFamilyCsv(outRoot, "deformation", deformationRows),
    crack: await writeFamilyCsv(outRoot, "crack", crackRows),
    rainfall: await writeFamilyCsv(outRoot, "rainfall", rainfallRows),
    reservoir: await writeFamilyCsv(outRoot, "reservoir", reservoirRows)
  };

  const report = {
    generatedAt: new Date().toISOString(),
    unpackedRoot,
    outRoot,
    sourceFiles: {
      deformation: path.basename(deformationFile),
      crack: path.basename(crackFile),
      rainfall: path.basename(rainfallFile),
      reservoir: path.basename(reservoirFile)
    },
    headerStrategies: {
      deformation: "time-header row plus identity row (ZD1/ZD2/ZD3)",
      crack: "time-header row plus identity row (LF1/LF2/LF3/LF4)",
      rainfall: "title row plus scalar header row",
      reservoir: "title row plus scalar header row"
    },
    outputFiles: outputs,
    rowCountByFamily: {
      deformation: deformationRows.length,
      crack: crackRows.length,
      rainfall: rainfallRows.length,
      reservoir: reservoirRows.length
    },
    notes: [
      "This normalization preserves raw semantic hints such as raw_metric_name, raw_unit, raw_value_field, workbook_title, and source file metadata.",
      "Baijiabao crack data is normalized as relative displacement, not crack width.",
      "Reservoir values preserve the workbook header alias so later adapters can distinguish observed level from any metadata-side rise-fall-rate description."
    ]
  };

  await writeFile(
    path.join(outRoot, "normalization-report.json"),
    JSON.stringify(report, null, 2),
    "utf-8"
  );

  console.log(JSON.stringify(report, null, 2));
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
