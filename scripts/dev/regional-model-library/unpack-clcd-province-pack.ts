import path from "node:path";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import * as XLSX from "xlsx";
import { resolveRepoRoot } from "./intake-utils";

const execFile = promisify(execFileCallback);

type ParsedArgs = {
  zipPath?: string;
  workbookPath?: string;
  outRoot?: string;
  normalizedRoot?: string;
  provinces: string[];
  overwrite: boolean;
};

type ZipEntry = {
  fullName: string;
  length: number;
};

type ClassificationRow = {
  id: number;
  className: string;
  colorRgb: [number, number, number];
};

type ProvinceExtractReportRow = {
  requestedProvince: string;
  resolvedProvince: string;
  entryName: string;
  relativeOutFile: string;
  bytesWritten: number;
  md5: string;
};

type UnpackReport = {
  generatedAt: string;
  zipPath: string;
  workbookPath: string;
  outRoot: string;
  normalizedRoot: string;
  selectedProvinces: string[];
  extracted: ProvinceExtractReportRow[];
  classificationMapPath: string;
  provinceIndexPath: string;
  notes: string[];
};

const DEFAULT_ZIP_PATH =
  ".tmp/regional-model-library/raw/CLCD-1985-2025/source/downloads/CLCD_v01_2025_albert_province.zip";
const DEFAULT_WORKBOOK_PATH =
  ".tmp/regional-model-library/raw/CLCD-1985-2025/source/downloads/CLCD_classificationsystem.xlsx";
const DEFAULT_OUT_ROOT =
  ".tmp/regional-model-library/raw/CLCD-1985-2025/original/land-cover-grid/2025";
const DEFAULT_NORMALIZED_ROOT =
  ".tmp/regional-model-library/raw/CLCD-1985-2025/normalized";
const DEFAULT_FIRST_WAVE_PROVINCES = ["hubei", "chongqing"] as const;

const PROVINCE_ALIASES: Record<string, string> = {
  anhui: "anhui",
  beijing: "beijing",
  chongqing: "chongqing",
  fujian: "fujian",
  gansu: "ganshu",
  ganshu: "ganshu",
  guangdong: "guangzhou",
  guangzhou: "guangzhou",
  guangxi: "guangxi",
  guizhou: "guizhou",
  hainan: "hainan",
  hebei: "hebei",
  heilongjiang: "heilongjiang",
  henan: "henan",
  hongkong: "hongkong",
  hubei: "hubei",
  hunan: "hunan",
  innermongolia: "neimeng",
  jiangsu: "jiangsu",
  jiangxi: "jiangxi",
  jilin: "jining",
  jining: "jining",
  liaoning: "niaoning",
  macao: "macao",
  macau: "macao",
  neimeng: "neimeng",
  niaoning: "niaoning",
  ningxia: "ningxia",
  qinghai: "qinghai",
  shaanxi: "shaanxi",
  shandong: "shandong",
  shanghai: "shanghai",
  shanxi: "shanxi",
  sichuan: "sichuang",
  sichuang: "sichuang",
  taiwan: "taiwan",
  tianjin: "tianjin",
  tibet: "xizang",
  xinjiang: "xinjiang",
  xizang: "xizang",
  yunnan: "yunnan",
  zhejiang: "zhejiang",
  "\u5317\u4eac": "beijing",
  "\u91cd\u5e86": "chongqing",
  "\u7518\u8083": "ganshu",
  "\u6e56\u5317": "hubei",
  "\u56db\u5ddd": "sichuang",
  "\u9655\u897f": "shaanxi"
};

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    provinces: [],
    overwrite: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token) {
      continue;
    }

    switch (token) {
      case "--zip-path":
        parsed.zipPath = argv[index + 1];
        index += 1;
        break;
      case "--workbook-path":
        parsed.workbookPath = argv[index + 1];
        index += 1;
        break;
      case "--out-root":
        parsed.outRoot = argv[index + 1];
        index += 1;
        break;
      case "--normalized-root":
        parsed.normalizedRoot = argv[index + 1];
        index += 1;
        break;
      case "--province":
        if (argv[index + 1]) {
          parsed.provinces.push(argv[index + 1]!);
        }
        index += 1;
        break;
      case "--overwrite":
        parsed.overwrite = true;
        break;
      default:
        break;
    }
  }

  return parsed;
}

function normalizeProvinceToken(value: string): string {
  return value.toLowerCase().replace(/[\s_\-]/gu, "");
}

function resolvePathValue(
  repoRoot: string,
  provided: string | undefined,
  fallbackRelative: string
): string {
  const value = provided && provided.trim().length > 0 ? provided.trim() : fallbackRelative;
  return path.isAbsolute(value) ? value : path.resolve(repoRoot, value);
}

function resolveRequestedProvinces(parsed: ParsedArgs): string[] {
  return parsed.provinces.length > 0
    ? parsed.provinces.map((province) => province.trim()).filter((province) => province.length > 0)
    : [...DEFAULT_FIRST_WAVE_PROVINCES];
}

function toPowerShellLiteral(value: string): string {
  return `'${value.replace(/'/gu, "''")}'`;
}

async function readZipEntries(zipPath: string): Promise<ZipEntry[]> {
  const zipLiteral = toPowerShellLiteral(zipPath);
  const script = `
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zipPath=${zipLiteral}
$archive=[System.IO.Compression.ZipFile]::OpenRead($zipPath)
$items=$archive.Entries | ForEach-Object {
  [PSCustomObject]@{
    fullName=$_.FullName
    length=[int64]$_.Length
  }
}
$archive.Dispose()
$items | ConvertTo-Json -Depth 4 -Compress
`;
  const { stdout } = await execFile(
    "powershell",
    ["-NoProfile", "-Command", script],
    { maxBuffer: 1024 * 1024 * 8 }
  );

  const parsed = JSON.parse(stdout.trim()) as ZipEntry | ZipEntry[];
  return Array.isArray(parsed) ? parsed : [parsed];
}

function buildProvinceEntryMap(entries: readonly ZipEntry[]): Map<string, ZipEntry> {
  const mapping = new Map<string, ZipEntry>();

  for (const entry of entries) {
    const match = entry.fullName.match(/^CLCD_v01_2025_albert_(.+)\.tif$/iu);
    if (!match) {
      continue;
    }

    const provinceKey = normalizeProvinceToken(match[1] ?? "");
    if (provinceKey.length > 0) {
      mapping.set(provinceKey, entry);
    }
  }

  return mapping;
}

function resolveProvinceEntry(
  requestedProvince: string,
  provinceEntries: ReadonlyMap<string, ZipEntry>
): { requestedProvince: string; resolvedProvince: string; entry: ZipEntry } {
  const normalized = normalizeProvinceToken(requestedProvince);
  const aliasResolved = PROVINCE_ALIASES[normalized] ?? normalized;
  const entry = provinceEntries.get(aliasResolved);

  if (!entry) {
    throw new Error(
      `No CLCD province entry matched '${requestedProvince}'. Available keys: ${[...provinceEntries.keys()]
        .sort((left, right) => left.localeCompare(right))
        .join(", ")}`
    );
  }

  return {
    requestedProvince,
    resolvedProvince: aliasResolved,
    entry
  };
}

async function extractZipEntry(
  zipPath: string,
  entryName: string,
  outFile: string,
  overwrite: boolean
): Promise<void> {
  const zipLiteral = toPowerShellLiteral(zipPath);
  const entryLiteral = toPowerShellLiteral(entryName);
  const outLiteral = toPowerShellLiteral(outFile);
  const script = `
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zipPath=${zipLiteral}
$entryName=${entryLiteral}
$outFile=${outLiteral}
$overwrite=${overwrite ? "$true" : "$false"}
$archive=[System.IO.Compression.ZipFile]::OpenRead($zipPath)
$entry=$archive.Entries | Where-Object { $_.FullName -eq $entryName } | Select-Object -First 1
if ($null -eq $entry) {
  $archive.Dispose()
  throw "Missing zip entry: $entryName"
}
New-Item -ItemType Directory -Force -Path ([System.IO.Path]::GetDirectoryName($outFile)) | Out-Null
[System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $outFile, $overwrite)
$archive.Dispose()
`;

  await execFile(
    "powershell",
    ["-NoProfile", "-Command", script],
    { maxBuffer: 1024 * 1024 * 8 }
  );
}

async function computeMd5(filePath: string): Promise<string> {
  const hash = createHash("md5");
  const stream = createReadStream(filePath);

  return new Promise<string>((resolve, reject) => {
    stream.on("data", (chunk) => {
      hash.update(chunk);
    });
    stream.on("error", reject);
    stream.on("end", () => {
      resolve(hash.digest("hex"));
    });
  });
}

function parseColor(value: string): [number, number, number] {
  const parts = value
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item));

  if (parts.length !== 3) {
    throw new Error(`Invalid CLCD color row: ${value}`);
  }

  return [parts[0]!, parts[1]!, parts[2]!];
}

function parseClassificationWorkbook(workbookPath: string): ClassificationRow[] {
  const workbook = XLSX.readFile(workbookPath, {
    cellDates: false,
    dense: false
  });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error(`CLCD workbook has no sheets: ${workbookPath}`);
  }

  const rows = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(
    workbook.Sheets[sheetName],
    {
      header: 1,
      raw: false,
      blankrows: false,
      defval: ""
    }
  );

  return rows
    .slice(1)
    .map((row) => {
      const id = Number(String(row[0] ?? "").trim());
      const className = String(row[1] ?? "").trim();
      const color = String(row[2] ?? "").trim();
      if (!Number.isFinite(id) || className.length === 0 || color.length === 0) {
        return null;
      }

      return {
        id,
        className,
        colorRgb: parseColor(color)
      };
    })
    .filter((row): row is ClassificationRow => row !== null);
}

async function main(): Promise<void> {
  const repoRoot = resolveRepoRoot(__dirname);
  const parsed = parseArgs(process.argv.slice(2));
  const zipPath = resolvePathValue(repoRoot, parsed.zipPath, DEFAULT_ZIP_PATH);
  const workbookPath = resolvePathValue(repoRoot, parsed.workbookPath, DEFAULT_WORKBOOK_PATH);
  const outRoot = resolvePathValue(repoRoot, parsed.outRoot, DEFAULT_OUT_ROOT);
  const normalizedRoot = resolvePathValue(repoRoot, parsed.normalizedRoot, DEFAULT_NORMALIZED_ROOT);
  const requestedProvinces = resolveRequestedProvinces(parsed);

  await mkdir(outRoot, { recursive: true });
  await mkdir(normalizedRoot, { recursive: true });

  const zipEntries = await readZipEntries(zipPath);
  const provinceEntries = buildProvinceEntryMap(zipEntries);
  const extracted: ProvinceExtractReportRow[] = [];

  for (const requestedProvince of requestedProvinces) {
    const resolved = resolveProvinceEntry(requestedProvince, provinceEntries);
    const relativeOutFile = path.posix.join("2025", path.posix.basename(resolved.entry.fullName));
    const absoluteOutFile = path.join(outRoot, path.basename(resolved.entry.fullName));

    const fileStats = await stat(absoluteOutFile).catch(() => null);
    if (!fileStats || parsed.overwrite) {
      await extractZipEntry(
        zipPath,
        resolved.entry.fullName,
        absoluteOutFile,
        parsed.overwrite
      );
    }

    const extractedStats = await stat(absoluteOutFile);
    const md5 = await computeMd5(absoluteOutFile);
    extracted.push({
      requestedProvince: resolved.requestedProvince,
      resolvedProvince: resolved.resolvedProvince,
      entryName: resolved.entry.fullName,
      relativeOutFile,
      bytesWritten: extractedStats.size,
      md5
    });
  }

  const classificationMap = parseClassificationWorkbook(workbookPath);
  const classificationMapPath = path.join(normalizedRoot, "clcd-classification-map.json");
  const provinceIndexPath = path.join(normalizedRoot, "clcd-2025-province-index.json");

  await writeFile(classificationMapPath, JSON.stringify(classificationMap, null, 2), "utf-8");
  await writeFile(provinceIndexPath, JSON.stringify(extracted, null, 2), "utf-8");

  const report: UnpackReport = {
    generatedAt: new Date().toISOString(),
    zipPath,
    workbookPath,
    outRoot,
    normalizedRoot,
    selectedProvinces: requestedProvinces,
    extracted,
    classificationMapPath,
    provinceIndexPath,
    notes: [
      "This script only stages first-wave province rasters and the class legend.",
      "It does not compute zonal statistics, pixel summaries, or RegionProfile features.",
      "Province matching uses archive entry names, including known CLCD romanization quirks such as ganshu and sichuang."
    ]
  };

  await writeFile(
    path.join(normalizedRoot, "clcd-2025-unpack-report.json"),
    JSON.stringify(report, null, 2),
    "utf-8"
  );

  console.log(JSON.stringify(report, null, 2));
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
