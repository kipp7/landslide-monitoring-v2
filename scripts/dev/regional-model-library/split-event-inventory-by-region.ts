import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolveRepoRoot } from "./intake-utils";

type ParsedArgs = {
  eventCsv?: string;
  outDir?: string;
  minCount: number;
  includeRegions: string[];
};

type CsvRow = Record<string, string>;

type SplitIndex = {
  generatedAt: string;
  sourceEventCsv: string;
  outDir: string;
  regionCount: number;
  totalRowCount: number;
  splits: Array<{
    regionCode: string;
    rowCount: number;
    outputFile: string;
  }>;
};

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    minCount: 1,
    includeRegions: []
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token) continue;

    switch (token) {
      case "--event-csv":
        parsed.eventCsv = argv[index + 1];
        index += 1;
        break;
      case "--out-dir":
        parsed.outDir = argv[index + 1];
        index += 1;
        break;
      case "--min-count": {
        const value = Number(argv[index + 1]);
        if (Number.isFinite(value) && value > 0) {
          parsed.minCount = Math.floor(value);
        }
        index += 1;
        break;
      }
      case "--include-regions":
        parsed.includeRegions = (argv[index + 1] ?? "")
          .split(",")
          .map((value) => value.trim())
          .filter((value) => value.length > 0);
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

async function readCsvRows(filePath: string): Promise<{ headers: string[]; rows: CsvRow[] }> {
  const content = await readFile(filePath, "utf-8");
  const lines = content
    .replace(/^\uFEFF/u, "")
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = parseCsvLine(lines[0]!);
  const rows = lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const row: CsvRow = {};
    headers.forEach((header, index) => {
      row[header] = values[index] ?? "";
    });
    return row;
  });

  return { headers, rows };
}

function escapeCsvValue(value: string): string {
  if (/[",\r\n]/u.test(value)) {
    return `"${value.replace(/"/gu, '""')}"`;
  }
  return value;
}

function toCsv(headers: readonly string[], rows: readonly CsvRow[]): string {
  return [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => escapeCsvValue(row[header] ?? "")).join(","))
  ].join("\n");
}

function sanitizeFileSegment(value: string): string {
  return value
    .replace(/[<>:"/\\|?*\s]+/gu, "-")
    .replace(/-+/gu, "-")
    .replace(/^-|-$/gu, "");
}

async function main(): Promise<void> {
  const repoRoot = resolveRepoRoot(__dirname);
  const parsed = parseArgs(process.argv.slice(2));
  const sourceEventCsv = path.resolve(
    repoRoot,
    parsed.eventCsv ?? ".tmp/regional-model-library/raw/Beijing-2023/normalized/phase1-event-inventory.csv"
  );
  const outDir = path.resolve(
    repoRoot,
    parsed.outDir ?? ".tmp/regional-model-library/out/replay-region-splits"
  );

  const { headers, rows } = await readCsvRows(sourceEventCsv);
  const grouped = new Map<string, CsvRow[]>();

  for (const row of rows) {
    const regionCode = (row.region_code ?? "").trim() || "unknown-region";
    if (parsed.includeRegions.length > 0 && !parsed.includeRegions.includes(regionCode)) {
      continue;
    }

    const bucket = grouped.get(regionCode) ?? [];
    bucket.push(row);
    if (!grouped.has(regionCode)) {
      grouped.set(regionCode, bucket);
    }
  }

  const splits = [...grouped.entries()]
    .filter(([, regionRows]) => regionRows.length >= parsed.minCount)
    .sort((left, right) => right[1].length - left[1].length || left[0].localeCompare(right[0]));

  await mkdir(outDir, { recursive: true });

  const indexPayload: SplitIndex = {
    generatedAt: new Date().toISOString(),
    sourceEventCsv,
    outDir,
    regionCount: splits.length,
    totalRowCount: splits.reduce((sum, [, regionRows]) => sum + regionRows.length, 0),
    splits: []
  };

  for (const [regionCode, regionRows] of splits) {
    const regionDir = path.join(outDir, sanitizeFileSegment(regionCode) || "unknown-region");
    await mkdir(regionDir, { recursive: true });
    const outputFile = path.join(regionDir, "phase1-event-inventory.csv");
    await writeFile(outputFile, toCsv(headers, regionRows), "utf-8");
    indexPayload.splits.push({
      regionCode,
      rowCount: regionRows.length,
      outputFile
    });
  }

  await writeFile(path.join(outDir, "split-index.json"), JSON.stringify(indexPayload, null, 2), "utf-8");
  console.log(JSON.stringify(indexPayload, null, 2));
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
