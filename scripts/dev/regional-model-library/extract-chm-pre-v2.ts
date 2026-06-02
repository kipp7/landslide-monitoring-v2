import os from "node:os";
import path from "node:path";
import { execFile as execFileCallback } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import type { RawDatasetIntakeManifest } from "../../../libs/regional-model-library/src";
import { resolveRepoRoot } from "./intake-utils";

const execFile = promisify(execFileCallback);

type ParsedArgs = {
  manifest?: string;
  rawIndex?: string;
  eventJobs?: string;
  regionJobs?: string;
  outRoot?: string;
  mode: "by-event" | "by-region" | "both";
  dryRun: boolean;
  strict: boolean;
  skipExistingOutputs: boolean;
  gdalBinDir?: string;
};

type IndexedFile = {
  relativePath: string;
  format: string;
  family: "daily-netcdf" | "monthly-total" | "annual-total" | "unknown";
  guessedPeriodKey: string | null;
};

type RawIndexReport = {
  generatedAt: string;
  rawRoot: string;
  fileCount: number;
  familyCounts?: Record<string, number>;
  files: IndexedFile[];
};

type EventExtractJob = {
  event_id: string;
  region_code: string;
  event_ts: string;
  longitude: string;
  latitude: string;
  window_days: number;
  window_start: string;
  window_end: string;
  status: "ready" | "missing_coordinates" | "invalid_event_ts";
};

type RegionExtractJob = {
  region_code: string;
  period_type: string;
  period_key: string;
  aggregation: string;
  lon_min: string;
  lat_min: string;
  lon_max: string;
  lat_max: string;
  status: "ready" | "missing_bbox" | "invalid_bbox";
};

type JobStatus =
  | "planned"
  | "extracted"
  | "skipped_invalid_job"
  | "blocked_missing_source_files"
  | "blocked_missing_gdal"
  | "blocked_missing_python_backend"
  | "failed_backend_execution"
  | "failed_output_write";

type GdalTools = {
  gdalInfo: string | null;
  gdalTranslate: string | null;
  gdallocationinfo: string | null;
};

type EventResult = {
  jobKey: string;
  status: JobStatus;
  event_id: string;
  region_code: string;
  window_days: number;
  sourceFiles: string[];
  outputFile: string | null;
  rowCount: number;
  issues: string[];
};

type RegionResult = {
  jobKey: string;
  status: JobStatus;
  region_code: string;
  period_type: string;
  period_key: string;
  sourceFiles: string[];
  outputFile: string | null;
  rowCount: number;
  issues: string[];
};

type ExtractionReport = {
  generatedAt: string;
  datasetKey: string;
  manifestPath: string;
  rawIndexPath: string;
  rawRoot: string;
  outRoot: string;
  mode: ParsedArgs["mode"];
  dryRun: boolean;
  strict: boolean;
  gdal: {
    available: boolean;
    tools: GdalTools;
  };
  inputs: {
    eventJobsPath: string;
    regionJobsPath: string;
  };
  byEvent: {
    jobCount: number;
    extractedCount: number;
    plannedCount: number;
    blockedCount: number;
    skippedCount: number;
    failedCount: number;
    outputDir: string;
  };
  byRegion: {
    jobCount: number;
    extractedCount: number;
    plannedCount: number;
    blockedCount: number;
    skippedCount: number;
    failedCount: number;
    outputDir: string;
  };
  eventResults: EventResult[];
  regionResults: RegionResult[];
  nextActions: string[];
};

type EventOutputRow = {
  event_id: string;
  region_code: string;
  event_ts: string;
  window_days: string;
  window_start: string;
  window_end: string;
  source_day: string;
  longitude: string;
  latitude: string;
  rainfall_mm: string;
  source_version: string;
  source_family: string;
  source_relative_path: string;
};

type RegionOutputRow = {
  region_code: string;
  period_type: string;
  period_key: string;
  aggregation: string;
  grid_id: string;
  longitude: string;
  latitude: string;
  rainfall_mm: string;
  source_version: string;
  source_family: string;
  source_relative_path: string;
};

type NcPointSeriesRow = {
  source_day: string;
  rainfall_mm: string;
  grid_longitude: string;
  grid_latitude: string;
};

type NcBatchPointSeriesJob = {
  jobKey: string;
  longitude: string;
  latitude: string;
  windowStart: string;
  windowEnd: string;
};

type NcBatchPointSeriesOutputRow = NcPointSeriesRow & {
  job_key: string;
};

type EventExecutionContext = {
  job: EventExtractJob;
  sourceFiles: readonly IndexedFile[];
  result: EventResult;
  outputFile: string | null;
  rows: EventOutputRow[];
};

type RasterDatasetInfo = {
  rasterXSize: number;
  rasterYSize: number;
  bandCount: number;
  geoTransform: [number, number, number, number, number, number] | null;
};

type SrcWindow = {
  xOffset: number;
  yOffset: number;
  xSize: number;
  ySize: number;
};

const CHINA_TIME_ZONE = "Asia/Shanghai";
const NC_POINT_EXTRACTOR_SCRIPT = path.resolve(
  __dirname,
  "extract-chm-pre-v2-nc-point-series.py"
);
const NC_POINT_BATCH_JOB_LIMIT = 2000;

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    mode: "both",
    dryRun: false,
    strict: false,
    skipExistingOutputs: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token) continue;

    switch (token) {
      case "--manifest":
        parsed.manifest = argv[index + 1];
        index += 1;
        break;
      case "--raw-index":
        parsed.rawIndex = argv[index + 1];
        index += 1;
        break;
      case "--event-jobs":
        parsed.eventJobs = argv[index + 1];
        index += 1;
        break;
      case "--region-jobs":
        parsed.regionJobs = argv[index + 1];
        index += 1;
        break;
      case "--out-root":
        parsed.outRoot = argv[index + 1];
        index += 1;
        break;
      case "--mode": {
        const value = argv[index + 1];
        if (value === "by-event" || value === "by-region" || value === "both") {
          parsed.mode = value;
        }
        index += 1;
        break;
      }
      case "--gdal-bin-dir":
        parsed.gdalBinDir = argv[index + 1];
        index += 1;
        break;
      case "--dry-run":
        parsed.dryRun = true;
        break;
      case "--strict":
        parsed.strict = true;
        break;
      case "--skip-existing-outputs":
        parsed.skipExistingOutputs = true;
        break;
      default:
        break;
    }
  }

  return parsed;
}

async function readJsonFile<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf-8")) as T;
}

function normalizeCandidateToken(value: string): string {
  return value
    .toLowerCase()
    .replace(/[_\-\s/\\():.,;|[\]{}]/gu, "")
    .trim();
}

function normalizePeriodKey(value: string): string {
  return value.replace(/[^\d]/gu, "");
}

function formatDayKey(date: Date): string {
  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${date.getUTCDate()}`.padStart(2, "0");
  return `${year}${month}${day}`;
}

function formatDayKeyInTimeZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const day = parts.find((part) => part.type === "day")?.value ?? "";
  return `${year}${month}${day}`;
}

function enumerateDayKeys(startIso: string, endIso: string): string[] {
  const start = Date.parse(startIso);
  const end = Date.parse(endIso);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) {
    return [];
  }

  const cursor = new Date(start);
  const endDate = new Date(end);
  const keys: string[] = [];

  while (cursor.getTime() <= endDate.getTime()) {
    keys.push(formatDayKey(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return keys;
}

function enumerateChinaDayKeys(startIso: string, endIso: string): string[] {
  const start = Date.parse(startIso);
  const end = Date.parse(endIso);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) {
    return [];
  }

  const cursor = new Date(start);
  const endDate = new Date(end);
  const keys: string[] = [];

  while (cursor.getTime() <= endDate.getTime()) {
    keys.push(formatDayKeyInTimeZone(cursor, CHINA_TIME_ZONE));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return dedupePreservingOrder(keys);
}

function sanitizeFileSegment(value: string): string {
  return value
    .replace(/[<>:"/\\|?*\s]+/gu, "-")
    .replace(/-+/gu, "-")
    .replace(/^-|-$/gu, "");
}

function buildGridId(longitude: string, latitude: string): string {
  return `grid_${longitude}_${latitude}`.replace(/[^\w.-]/gu, "_");
}

function escapeCsvValue(value: string): string {
  if (/[",\r\n]/u.test(value)) {
    return `"${value.replace(/"/gu, '""')}"`;
  }
  return value;
}

function toCsv(rows: readonly Record<string, string>[]): string {
  if (rows.length === 0) {
    return "";
  }
  const headers = Object.keys(rows[0]);
  return [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => escapeCsvValue(row[header] ?? "")).join(",")),
  ].join("\n");
}

function statusBuckets<T extends { status: JobStatus }>(rows: readonly T[]) {
  const extracted = rows.filter((row) => row.status === "extracted").length;
  const planned = rows.filter((row) => row.status === "planned").length;
  const blocked = rows.filter(
    (row) =>
      row.status === "blocked_missing_gdal" ||
      row.status === "blocked_missing_python_backend" ||
      row.status === "blocked_missing_source_files"
  ).length;
  const skipped = rows.filter((row) => row.status === "skipped_invalid_job").length;
  const failed = rows.filter(
    (row) => row.status === "failed_backend_execution" || row.status === "failed_output_write"
  ).length;

  return { extracted, planned, blocked, skipped, failed };
}

function resolveDefaultPaths(repoRoot: string, parsed: ParsedArgs) {
  return {
    manifestPath: path.resolve(
      repoRoot,
      parsed.manifest ??
        ".tmp/regional-model-library/intake-manifests/CHM_PRE-V2.intake-manifest.json"
    ),
    rawIndexPath: path.resolve(
      repoRoot,
      parsed.rawIndex ?? ".tmp/regional-model-library/raw/CHM_PRE-V2/raw-index.json"
    ),
    eventJobsPath: path.resolve(
      repoRoot,
      parsed.eventJobs ?? ".tmp/regional-model-library/raw/CHM_PRE-V2/plans/by-event.jobs.json"
    ),
    regionJobsPath: path.resolve(
      repoRoot,
      parsed.regionJobs ?? ".tmp/regional-model-library/raw/CHM_PRE-V2/plans/by-region.jobs.json"
    ),
    outRoot: path.resolve(
      repoRoot,
      parsed.outRoot ?? ".tmp/regional-model-library/raw/CHM_PRE-V2/extracts"
    ),
  };
}

function selectEventSourceFiles(
  files: readonly IndexedFile[],
  job: EventExtractJob
): IndexedFile[] {
  const validDayKeys = new Set(enumerateChinaDayKeys(job.window_start, job.window_end));
  const validMonthKeys = new Set([...validDayKeys].map((value) => value.slice(0, 6)));
  const validYearKeys = new Set([...validDayKeys].map((value) => value.slice(0, 4)));

  return files.filter(
    (file) =>
      file.family === "daily-netcdf" &&
      file.guessedPeriodKey &&
      (validDayKeys.has(file.guessedPeriodKey) ||
        validMonthKeys.has(file.guessedPeriodKey) ||
        validYearKeys.has(file.guessedPeriodKey))
  );
}

function isLatestPeriodKey(value: string): boolean {
  return value.trim().toLowerCase() === "latest";
}

function selectLatestSourceFile(candidates: readonly IndexedFile[]): IndexedFile[] {
  if (candidates.length === 0) {
    return [];
  }

  const datedCandidates = candidates
    .filter((file) => file.guessedPeriodKey)
    .sort((left, right) =>
      (right.guessedPeriodKey ?? "").localeCompare(left.guessedPeriodKey ?? "")
    );

  if (datedCandidates.length > 0) {
    return datedCandidates.slice(0, 1);
  }

  return [...candidates].sort((left, right) => left.relativePath.localeCompare(right.relativePath)).slice(0, 1);
}

function selectRegionSourceFiles(
  files: readonly IndexedFile[],
  job: RegionExtractJob
): IndexedFile[] {
  const periodType = job.period_type.toLowerCase();
  const normalizedPeriodKey = normalizePeriodKey(job.period_key);
  const wantsLatest = isLatestPeriodKey(job.period_key);

  if (periodType === "year" || periodType === "annual") {
    const candidates = files.filter((file) => file.family === "annual-total");
    if (wantsLatest) {
      return selectLatestSourceFile(candidates);
    }

    return candidates.filter((file) => file.guessedPeriodKey === normalizedPeriodKey);
  }

  if (periodType === "day" || periodType === "daily") {
    return files.filter(
      (file) => file.family === "daily-netcdf" && file.guessedPeriodKey === normalizedPeriodKey
    );
  }

  const candidates = files.filter((file) => file.family === "monthly-total");
  if (wantsLatest) {
    return selectLatestSourceFile(candidates);
  }

  return candidates.filter((file) => file.guessedPeriodKey === normalizedPeriodKey);
}

function resolveToolPath(commandName: string, gdalBinDir?: string): string {
  return gdalBinDir ? path.join(gdalBinDir, `${commandName}.exe`) : commandName;
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function dedupePreservingOrder(values: Array<string | undefined | null>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = value?.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }

  return result;
}

function chunkArray<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function deriveCondaPrefixes(): string[] {
  const homeDirectory = os.homedir();
  const condaExe = process.env.CONDA_EXE?.trim();
  const condaPrefix = process.env.CONDA_PREFIX?.trim();

  return dedupePreservingOrder([
    condaPrefix,
    condaExe ? path.resolve(path.dirname(condaExe), "..") : undefined,
    path.join(homeDirectory, "anaconda3"),
    path.join(homeDirectory, "miniconda3"),
    path.join(homeDirectory, "miniforge3"),
    "C:\\ProgramData\\anaconda3",
    "C:\\ProgramData\\miniconda3",
  ]);
}

async function listCondaGdalBinDirs(): Promise<string[]> {
  const results: string[] = [];

  for (const prefix of deriveCondaPrefixes()) {
    const envsDirectory = path.join(prefix, "envs");
    try {
      const entries = await readdir(envsDirectory, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory() || !/gdal/iu.test(entry.name)) continue;
        results.push(path.join(envsDirectory, entry.name, "Library", "bin"));
      }
    } catch {
      continue;
    }
  }

  return dedupePreservingOrder(results);
}

async function collectGdalBinDirCandidates(gdalBinDir?: string): Promise<string[]> {
  const condaPrefixes = deriveCondaPrefixes();
  const condaGdalBinDirs = await listCondaGdalBinDirs();

  return dedupePreservingOrder([
    gdalBinDir,
    process.env.GDAL_BIN_DIR,
    ...condaPrefixes.map((prefix) => path.join(prefix, "Library", "bin")),
    ...condaGdalBinDirs,
  ]);
}

async function probeGdalAtBinDir(gdalBinDir?: string): Promise<GdalTools> {
  const candidates = {
    gdalInfo: resolveToolPath("gdalinfo", gdalBinDir),
    gdalTranslate: resolveToolPath("gdal_translate", gdalBinDir),
    gdallocationinfo: resolveToolPath("gdallocationinfo", gdalBinDir),
  };

  const result: GdalTools = {
    gdalInfo: null,
    gdalTranslate: null,
    gdallocationinfo: null,
  };

  for (const [key, command] of Object.entries(candidates) as [keyof GdalTools, string][]) {
    try {
      await execFile(command, ["--version"], { windowsHide: true });
      result[key] = command;
    } catch {
      result[key] = null;
    }
  }

  return result;
}

function countAvailableGdalTools(tools: GdalTools): number {
  return Number(Boolean(tools.gdalInfo)) +
    Number(Boolean(tools.gdalTranslate)) +
    Number(Boolean(tools.gdallocationinfo));
}

async function probeGdal(gdalBinDir?: string): Promise<GdalTools> {
  let bestMatch: GdalTools = {
    gdalInfo: null,
    gdalTranslate: null,
    gdallocationinfo: null,
  };

  for (const candidateDir of await collectGdalBinDirCandidates(gdalBinDir)) {
    if (!(await pathExists(candidateDir))) continue;
    const tools = await probeGdalAtBinDir(candidateDir);
    if (countAvailableGdalTools(tools) > countAvailableGdalTools(bestMatch)) {
      bestMatch = tools;
    }
    if (isGdalAvailable(tools)) {
      return tools;
    }
  }

  const pathTools = await probeGdalAtBinDir();
  return countAvailableGdalTools(pathTools) >= countAvailableGdalTools(bestMatch)
    ? pathTools
    : bestMatch;
}

function isGdalAvailable(tools: GdalTools): boolean {
  return !!tools.gdalInfo && !!tools.gdalTranslate && !!tools.gdallocationinfo;
}

async function resolveRasterDatasetTarget(
  sourceAbsolutePath: string,
  tools: GdalTools,
  manifest: RawDatasetIntakeManifest
): Promise<string> {
  const extension = path.extname(sourceAbsolutePath).toLowerCase();
  if (extension === ".tif" || extension === ".tiff") {
    return sourceAbsolutePath;
  }

  if (!tools.gdalInfo) {
    return sourceAbsolutePath;
  }

  try {
    const { stdout } = await execFile(tools.gdalInfo, ["-json", sourceAbsolutePath], {
      windowsHide: true,
      maxBuffer: 8 * 1024 * 1024,
    });
    const payload = JSON.parse(stdout) as {
      metadata?: Record<string, Record<string, string>>;
    };
    const subdatasets = payload.metadata?.SUBDATASETS ?? {};
    const valueCandidates =
      manifest.families.find((family) => family.familyKey === "daily-grid")?.schemaHints
        ?.valueFieldCandidates ?? [];

    const subdatasetNames = Object.entries(subdatasets)
      .filter(([key]) => key.endsWith("_NAME"))
      .map(([, value]) => value);

    for (const candidate of valueCandidates) {
      const normalizedCandidate = normalizeCandidateToken(candidate);
      const matched = subdatasetNames.find((name) =>
        normalizeCandidateToken(name).includes(normalizedCandidate)
      );
      if (matched) {
        return matched;
      }
    }

    return subdatasetNames[0] ?? sourceAbsolutePath;
  } catch {
    return sourceAbsolutePath;
  }
}

async function extractNcPointSeriesBatch(
  sourceAbsolutePath: string,
  jobs: readonly NcBatchPointSeriesJob[]
): Promise<Map<string, NcPointSeriesRow[]>> {
  if (jobs.length === 0) {
    return new Map<string, NcPointSeriesRow[]>();
  }

  const pythonCommand = process.env.PYTHON_EXE?.trim() || "python";
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "lsmv2-chm-pre-nc-"));
  const jobsFilePath = path.join(tempRoot, "jobs.json");

  try {
    await writeFile(jobsFilePath, JSON.stringify(jobs, null, 2), "utf-8");

    const { stdout } = await execFile(
      pythonCommand,
      [
        NC_POINT_EXTRACTOR_SCRIPT,
        "--source-file",
        sourceAbsolutePath,
        "--jobs-file",
        jobsFilePath,
      ],
      {
        windowsHide: true,
        maxBuffer: 128 * 1024 * 1024,
      }
    );

    const payload = JSON.parse(stdout) as NcBatchPointSeriesOutputRow[];
    const result = new Map<string, NcPointSeriesRow[]>();

    for (const row of payload) {
      const currentRows = result.get(row.job_key) ?? [];
      currentRows.push({
        source_day: row.source_day,
        rainfall_mm: row.rainfall_mm,
        grid_longitude: row.grid_longitude,
        grid_latitude: row.grid_latitude,
      });
      result.set(row.job_key, currentRows);
    }

    return result;
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

async function probeNcPythonBackend(): Promise<string | null> {
  const pythonCommand = process.env.PYTHON_EXE?.trim() || "python";

  try {
    await execFile(pythonCommand, ["-c", "import h5py"], {
      windowsHide: true,
    });
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

async function readRasterDatasetInfo(
  datasetTarget: string,
  tools: GdalTools
): Promise<RasterDatasetInfo> {
  const { stdout } = await execFile(tools.gdalInfo!, ["-json", datasetTarget], {
    windowsHide: true,
    maxBuffer: 8 * 1024 * 1024,
  });

  const payload = JSON.parse(stdout) as {
    size?: [number, number];
    bands?: Array<Record<string, unknown>>;
    geoTransform?: [number, number, number, number, number, number];
  };

  return {
    rasterXSize: payload.size?.[0] ?? 0,
    rasterYSize: payload.size?.[1] ?? 0,
    bandCount: payload.bands?.length ?? 0,
    geoTransform: payload.geoTransform ?? null,
  };
}

function buildSrcWindow(job: RegionExtractJob, rasterInfo: RasterDatasetInfo): SrcWindow | null {
  const geoTransform = rasterInfo.geoTransform;
  if (!geoTransform) {
    return null;
  }

  const [originX, pixelWidth, rotationX, originY, rotationY, pixelHeight] = geoTransform;
  if (!Number.isFinite(pixelWidth) || !Number.isFinite(pixelHeight) || pixelWidth === 0 || pixelHeight === 0) {
    return null;
  }
  if (rotationX !== 0 || rotationY !== 0) {
    return null;
  }

  const lonMin = Number(job.lon_min);
  const lonMax = Number(job.lon_max);
  const latMin = Number(job.lat_min);
  const latMax = Number(job.lat_max);
  if (![lonMin, lonMax, latMin, latMax].every((value) => Number.isFinite(value))) {
    return null;
  }

  const xPixels = [(lonMin - originX) / pixelWidth, (lonMax - originX) / pixelWidth];
  const yPixels = [(latMin - originY) / pixelHeight, (latMax - originY) / pixelHeight];

  const xOffset = Math.max(0, Math.floor(Math.min(...xPixels)));
  const yOffset = Math.max(0, Math.floor(Math.min(...yPixels)));
  const xLimit = Math.min(rasterInfo.rasterXSize, Math.ceil(Math.max(...xPixels)));
  const yLimit = Math.min(rasterInfo.rasterYSize, Math.ceil(Math.max(...yPixels)));
  const xSize = xLimit - xOffset;
  const ySize = yLimit - yOffset;

  if (xSize <= 0 || ySize <= 0) {
    return null;
  }

  return { xOffset, yOffset, xSize, ySize };
}

function resolveRegionBandNumber(job: RegionExtractJob, sourceFile: IndexedFile, rasterInfo: RasterDatasetInfo): number | null {
  if (sourceFile.guessedPeriodKey || rasterInfo.bandCount <= 1) {
    return null;
  }

  if (isLatestPeriodKey(job.period_key)) {
    return rasterInfo.bandCount;
  }

  return null;
}

async function parseXyzFile(
  filePath: string
): Promise<Array<{ longitude: string; latitude: string; rainfall: string }>> {
  const content = await readFile(filePath, "utf-8");
  return content
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const [longitude = "", latitude = "", rainfall = ""] = line.split(/\s+/u);
      return { longitude, latitude, rainfall };
    });
}

function eventResultKey(job: EventExtractJob): string {
  return `${job.event_id}.${job.window_days}d`;
}

function regionResultKey(job: RegionExtractJob): string {
  return `${job.region_code}.${job.period_type}.${job.period_key}`;
}

function getEventOutputFilePath(outDir: string, job: EventExtractJob): string {
  return path.join(outDir, `${sanitizeFileSegment(job.event_id)}.${job.window_days}d.csv`);
}

function getRegionOutputFilePath(outDir: string, job: RegionExtractJob): string {
  return path.join(
    outDir,
    `${sanitizeFileSegment(job.region_code)}.${sanitizeFileSegment(job.period_type)}.${sanitizeFileSegment(job.period_key)}.csv`
  );
}

function buildEventResult(job: EventExtractJob, sourceFiles: readonly IndexedFile[]): EventResult {
  return {
    jobKey: eventResultKey(job),
    status: "planned",
    event_id: job.event_id,
    region_code: job.region_code,
    window_days: job.window_days,
    sourceFiles: sourceFiles.map((file) => file.relativePath),
    outputFile: null,
    rowCount: 0,
    issues: [],
  };
}

async function executeEventJobs(
  jobs: readonly EventExtractJob[],
  rawIndexFiles: readonly IndexedFile[],
  rawRoot: string,
  outDir: string,
  manifest: RawDatasetIntakeManifest,
  tools: GdalTools,
  dryRun: boolean,
  skipExistingOutputs: boolean
): Promise<EventResult[]> {
  const contexts: EventExecutionContext[] = [];
  const pythonBackendIssue = jobs.length > 0 ? await probeNcPythonBackend() : null;

  for (const job of jobs) {
    const sourceFiles = selectEventSourceFiles(rawIndexFiles, job);
    const result = buildEventResult(job, sourceFiles);

    if (job.status !== "ready") {
      result.status = "skipped_invalid_job";
      result.sourceFiles = [];
      result.issues.push(`Job is not executable because planner status is ${job.status}.`);
      contexts.push({ job, sourceFiles, result, outputFile: null, rows: [] });
      continue;
    }

    if (sourceFiles.length === 0) {
      result.status = "blocked_missing_source_files";
      result.issues.push("No daily-netcdf source files matched the event window.");
      contexts.push({ job, sourceFiles, result, outputFile: null, rows: [] });
      continue;
    }

    if (dryRun) {
      result.status = "planned";
      result.issues.push("Dry-run mode: source files matched but extraction was not executed.");
      contexts.push({ job, sourceFiles, result, outputFile: null, rows: [] });
      continue;
    }

    const outputFile = getEventOutputFilePath(outDir, job);
    result.outputFile = outputFile;

    if (skipExistingOutputs && (await pathExists(outputFile))) {
      result.status = "extracted";
      result.issues.push(
        "Skipped backend extraction because existing output was reused via --skip-existing-outputs."
      );
      contexts.push({ job, sourceFiles, result, outputFile, rows: [] });
      continue;
    }

    const needsGdal = sourceFiles.some((file) => file.format !== "nc");
    if (needsGdal && !isGdalAvailable(tools)) {
      result.status = "blocked_missing_gdal";
      result.issues.push("GDAL tools gdalinfo/gdal_translate/gdallocationinfo are not available.");
      contexts.push({ job, sourceFiles, result, outputFile, rows: [] });
      continue;
    }

    if (sourceFiles.some((file) => file.format === "nc") && pythonBackendIssue) {
      result.status = "blocked_missing_python_backend";
      result.issues.push(
        `Python plus h5py are required for CHM_PRE yearly NetCDF extraction: ${pythonBackendIssue}`
      );
      contexts.push({ job, sourceFiles, result, outputFile, rows: [] });
      continue;
    }

    contexts.push({ job, sourceFiles, result, outputFile, rows: [] });
  }

  const activeContexts = new Map(
    contexts
      .filter((context) => context.result.status === "planned")
      .map((context) => [context.result.jobKey, context] as const)
  );

  const ncGroups = new Map<
    string,
    { sourceFile: IndexedFile; jobs: NcBatchPointSeriesJob[] }
  >();

  for (const context of activeContexts.values()) {
    for (const sourceFile of context.sourceFiles) {
      if (sourceFile.format !== "nc") {
        continue;
      }

      const sourceAbsolutePath = path.join(rawRoot, sourceFile.relativePath);
      const currentGroup = ncGroups.get(sourceAbsolutePath) ?? {
        sourceFile,
        jobs: [],
      };

      currentGroup.jobs.push({
        jobKey: context.result.jobKey,
        longitude: context.job.longitude,
        latitude: context.job.latitude,
        windowStart: context.job.window_start,
        windowEnd: context.job.window_end,
      });
      ncGroups.set(sourceAbsolutePath, currentGroup);
    }
  }

  for (const [sourceAbsolutePath, group] of ncGroups.entries()) {
    const jobChunks = chunkArray(group.jobs, NC_POINT_BATCH_JOB_LIMIT);

    for (const jobChunk of jobChunks) {
      try {
        const rowsByJobKey = await extractNcPointSeriesBatch(sourceAbsolutePath, jobChunk);

        for (const jobSpec of jobChunk) {
          const context = activeContexts.get(jobSpec.jobKey);
          if (!context || context.result.status !== "planned") {
            continue;
          }

          const ncRows = rowsByJobKey.get(jobSpec.jobKey) ?? [];
          if (ncRows.length === 0) {
            context.result.issues.push(
              `No daily point rows were found in ${group.sourceFile.relativePath} for the requested event window.`
            );
            continue;
          }

          context.rows.push(
            ...ncRows.map((row) => ({
              event_id: context.job.event_id,
              region_code: context.job.region_code,
              event_ts: context.job.event_ts,
              window_days: String(context.job.window_days),
              window_start: context.job.window_start,
              window_end: context.job.window_end,
              source_day: row.source_day,
              longitude: context.job.longitude,
              latitude: context.job.latitude,
              rainfall_mm: row.rainfall_mm,
              source_version: manifest.datasetKey,
              source_family: group.sourceFile.family,
              source_relative_path: group.sourceFile.relativePath,
            }))
          );
        }
      } catch (error) {
        for (const jobSpec of jobChunk) {
          const context = activeContexts.get(jobSpec.jobKey);
          if (!context || context.result.status !== "planned") {
            continue;
          }

          context.result.status = "failed_backend_execution";
          context.result.issues.push(
            `Failed to extract point rainfall from ${group.sourceFile.relativePath}: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        }
      }
    }
  }

  for (const context of activeContexts.values()) {
    if (context.result.status !== "planned") {
      continue;
    }

    for (const sourceFile of context.sourceFiles) {
      if (sourceFile.format === "nc") {
        continue;
      }

      const sourceAbsolutePath = path.join(rawRoot, sourceFile.relativePath);
      try {
        const datasetTarget = await resolveRasterDatasetTarget(sourceAbsolutePath, tools, manifest);
        const { stdout } = await execFile(
          tools.gdallocationinfo!,
          ["-valonly", "-wgs84", datasetTarget, context.job.longitude, context.job.latitude],
          {
            windowsHide: true,
            maxBuffer: 4 * 1024 * 1024,
          }
        );
        const rainfallValue = stdout.trim().split(/\r?\n/u)[0] ?? "";
        context.rows.push({
          event_id: context.job.event_id,
          region_code: context.job.region_code,
          event_ts: context.job.event_ts,
          window_days: String(context.job.window_days),
          window_start: context.job.window_start,
          window_end: context.job.window_end,
          source_day: sourceFile.guessedPeriodKey ?? "",
          longitude: context.job.longitude,
          latitude: context.job.latitude,
          rainfall_mm: rainfallValue,
          source_version: manifest.datasetKey,
          source_family: sourceFile.family,
          source_relative_path: sourceFile.relativePath,
        });
      } catch (error) {
        context.result.status = "failed_backend_execution";
        context.result.issues.push(
          `Failed to extract point rainfall from ${sourceFile.relativePath}: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        break;
      }
    }
  }

  await mkdir(outDir, { recursive: true });

  for (const context of contexts) {
    if (context.result.status !== "planned") {
      continue;
    }

    if (context.rows.length === 0) {
      context.result.status = "blocked_missing_python_backend";
      context.result.issues.push(
        "Daily NetCDF source files matched, but no point time-series rows could be extracted."
      );
      continue;
    }

    try {
      await writeFile(context.outputFile!, toCsv(context.rows), "utf-8");
      context.result.rowCount = context.rows.length;
      context.result.status = "extracted";
    } catch (error) {
      context.result.status = "failed_output_write";
      context.result.issues.push(error instanceof Error ? error.message : String(error));
    }
  }

  return contexts.map((context) => context.result);
}

async function executeRegionJob(
  job: RegionExtractJob,
  sourceFiles: readonly IndexedFile[],
  rawRoot: string,
  outDir: string,
  manifest: RawDatasetIntakeManifest,
  tools: GdalTools,
  dryRun: boolean,
  skipExistingOutputs: boolean
): Promise<RegionResult> {
  const result: RegionResult = {
    jobKey: regionResultKey(job),
    status: "planned",
    region_code: job.region_code,
    period_type: job.period_type,
    period_key: job.period_key,
    sourceFiles: sourceFiles.map((file) => file.relativePath),
    outputFile: null,
    rowCount: 0,
    issues: [],
  };

  if (job.status !== "ready") {
    result.status = "skipped_invalid_job";
    result.sourceFiles = [];
    result.issues.push(`Job is not executable because planner status is ${job.status}.`);
    return result;
  }

  if (sourceFiles.length === 0) {
    result.status = "blocked_missing_source_files";
    result.issues.push("No source files matched the requested region period.");
    return result;
  }

  if (dryRun) {
    result.status = "planned";
    result.issues.push("Dry-run mode: source files matched but extraction was not executed.");
    return result;
  }

  const outputFile = getRegionOutputFilePath(outDir, job);
  result.outputFile = outputFile;

  if (skipExistingOutputs && (await pathExists(outputFile))) {
    result.status = "extracted";
    result.issues.push(
      "Skipped backend extraction because existing output was reused via --skip-existing-outputs."
    );
    return result;
  }

  if (!isGdalAvailable(tools)) {
    result.status = "blocked_missing_gdal";
    result.issues.push("GDAL tools gdalinfo/gdal_translate/gdallocationinfo are not available.");
    return result;
  }

  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "lsmv2-chm-pre-"));
  const rows: RegionOutputRow[] = [];

  try {
    for (const [sourceIndex, sourceFile] of sourceFiles.entries()) {
      const sourceAbsolutePath = path.join(rawRoot, sourceFile.relativePath);
      const datasetTarget = await resolveRasterDatasetTarget(sourceAbsolutePath, tools, manifest);
      const rasterInfo = await readRasterDatasetInfo(datasetTarget, tools);
      const srcWindow = buildSrcWindow(job, rasterInfo);
      if (!srcWindow) {
        result.status = "failed_backend_execution";
        result.issues.push(
          `Unable to derive a valid source window from raster georeferencing for ${sourceFile.relativePath}.`
        );
        await rm(tempRoot, { recursive: true, force: true });
        return result;
      }

      const bandNumber = resolveRegionBandNumber(job, sourceFile, rasterInfo);
      if (!sourceFile.guessedPeriodKey && rasterInfo.bandCount > 1 && bandNumber === null) {
        result.status = "failed_backend_execution";
        result.issues.push(
          `A concrete band could not be resolved for ${sourceFile.relativePath} and period_key=${job.period_key}.`
        );
        await rm(tempRoot, { recursive: true, force: true });
        return result;
      }

      const xyzPath = path.join(
        tempRoot,
        `${sanitizeFileSegment(job.region_code)}.${normalizePeriodKey(job.period_key) || "latest"}.${sourceIndex}.xyz`
      );

      const gdalTranslateArgs = [
        "-of",
        "XYZ",
        "-srcwin",
        String(srcWindow.xOffset),
        String(srcWindow.yOffset),
        String(srcWindow.xSize),
        String(srcWindow.ySize),
      ];
      if (bandNumber !== null) {
        gdalTranslateArgs.push("-b", String(bandNumber));
      }
      gdalTranslateArgs.push(datasetTarget, xyzPath);

      await execFile(
        tools.gdalTranslate!,
        gdalTranslateArgs,
        {
          windowsHide: true,
          maxBuffer: 8 * 1024 * 1024,
        }
      );

      const xyzRows = await parseXyzFile(xyzPath);
      rows.push(
        ...xyzRows.map((xyzRow) => ({
          region_code: job.region_code,
          period_type: job.period_type,
          period_key: job.period_key,
          aggregation: job.aggregation,
          grid_id: buildGridId(xyzRow.longitude, xyzRow.latitude),
          longitude: xyzRow.longitude,
          latitude: xyzRow.latitude,
          rainfall_mm: xyzRow.rainfall,
          source_version: manifest.datasetKey,
          source_family: sourceFile.family,
          source_relative_path: sourceFile.relativePath,
        }))
      );
    }
  } catch (error) {
    result.status = "failed_backend_execution";
    result.issues.push(error instanceof Error ? error.message : String(error));
    await rm(tempRoot, { recursive: true, force: true });
    return result;
  }

  try {
    await mkdir(outDir, { recursive: true });
    await writeFile(outputFile, toCsv(rows), "utf-8");
    result.rowCount = rows.length;
    result.status = "extracted";
    await rm(tempRoot, { recursive: true, force: true });
    return result;
  } catch (error) {
    result.status = "failed_output_write";
    result.issues.push(error instanceof Error ? error.message : String(error));
    await rm(tempRoot, { recursive: true, force: true });
    return result;
  }
}

function buildNextActions(report: ExtractionReport): string[] {
  const actions = new Set<string>();

  if (!report.gdal.available) {
    actions.add(
      "Install GDAL or pass --gdal-bin-dir before running extract-chm-pre-v2.ts without --dry-run."
    );
  }

  if (report.eventResults.some((result) => result.status === "blocked_missing_source_files")) {
    actions.add("Land missing CHM_PRE daily-netcdf raw files for event-window extraction.");
  }

  if (
    report.eventResults.some((result) => result.status === "blocked_missing_python_backend")
  ) {
    actions.add(
      "Ensure Python plus h5py are available so CHM_PRE yearly NetCDF files can be read by time/lat/lon."
    );
  }

  if (report.regionResults.some((result) => result.status === "blocked_missing_source_files")) {
    actions.add("Land matching CHM_PRE monthly/annual raw files or adjust period_type/period_key.");
  }

  if (report.eventResults.some((result) => result.status === "skipped_invalid_job")) {
    actions.add(
      "Fix invalid CHM_PRE by-event jobs before extraction; planner status must be ready."
    );
  }

  if (report.regionResults.some((result) => result.status === "skipped_invalid_job")) {
    actions.add(
      "Fix invalid CHM_PRE by-region jobs before extraction; planner status must be ready."
    );
  }

  if (
    [...report.eventResults, ...report.regionResults].some(
      (result) =>
        result.status === "failed_backend_execution" &&
        result.issues.some((issue) =>
          issue.includes("not recognized as being in a supported file format")
        )
    )
  ) {
    actions.add(
      "Replace placeholder or corrupt CHM_PRE raw files with GDAL-readable GeoTIFF/NetCDF/HDF inputs before non-dry-run extraction."
    );
  }

  if (report.dryRun) {
    actions.add("Rerun without --dry-run after GDAL is ready and raw files are landed.");
  }

  return Array.from(actions);
}

async function main(): Promise<void> {
  const repoRoot = resolveRepoRoot(__dirname);
  const parsed = parseArgs(process.argv.slice(2));
  const defaults = resolveDefaultPaths(repoRoot, parsed);

  const manifest = await readJsonFile<RawDatasetIntakeManifest>(defaults.manifestPath);
  const rawIndex = await readJsonFile<RawIndexReport>(defaults.rawIndexPath);
  const eventJobs =
    parsed.mode === "by-region"
      ? []
      : await readJsonFile<EventExtractJob[]>(defaults.eventJobsPath);
  const regionJobs =
    parsed.mode === "by-event"
      ? []
      : await readJsonFile<RegionExtractJob[]>(defaults.regionJobsPath);
  const gdalTools = await probeGdal(parsed.gdalBinDir);

  const byEventOutDir = path.join(defaults.outRoot, "by-event");
  const byRegionOutDir = path.join(defaults.outRoot, "by-region");

  const eventResults = await executeEventJobs(
    eventJobs,
    rawIndex.files,
    rawIndex.rawRoot,
    byEventOutDir,
    manifest,
    gdalTools,
    parsed.dryRun,
    parsed.skipExistingOutputs
  );

  const regionResults: RegionResult[] = [];
  for (const job of regionJobs) {
    const sourceFiles = selectRegionSourceFiles(rawIndex.files, job);
    regionResults.push(
      await executeRegionJob(
        job,
        sourceFiles,
        rawIndex.rawRoot,
        byRegionOutDir,
        manifest,
        gdalTools,
        parsed.dryRun,
        parsed.skipExistingOutputs
      )
    );
  }

  const eventBuckets = statusBuckets(eventResults);
  const regionBuckets = statusBuckets(regionResults);

  const report: ExtractionReport = {
    generatedAt: new Date().toISOString(),
    datasetKey: manifest.datasetKey,
    manifestPath: defaults.manifestPath,
    rawIndexPath: defaults.rawIndexPath,
    rawRoot: rawIndex.rawRoot,
    outRoot: defaults.outRoot,
    mode: parsed.mode,
    dryRun: parsed.dryRun,
    strict: parsed.strict,
    gdal: {
      available: isGdalAvailable(gdalTools),
      tools: gdalTools,
    },
    inputs: {
      eventJobsPath: defaults.eventJobsPath,
      regionJobsPath: defaults.regionJobsPath,
    },
    byEvent: {
      jobCount: eventResults.length,
      extractedCount: eventBuckets.extracted,
      plannedCount: eventBuckets.planned,
      blockedCount: eventBuckets.blocked,
      skippedCount: eventBuckets.skipped,
      failedCount: eventBuckets.failed,
      outputDir: byEventOutDir,
    },
    byRegion: {
      jobCount: regionResults.length,
      extractedCount: regionBuckets.extracted,
      plannedCount: regionBuckets.planned,
      blockedCount: regionBuckets.blocked,
      skippedCount: regionBuckets.skipped,
      failedCount: regionBuckets.failed,
      outputDir: byRegionOutDir,
    },
    eventResults,
    regionResults,
    nextActions: [],
  };
  report.nextActions = buildNextActions(report);

  await mkdir(defaults.outRoot, { recursive: true });
  await writeFile(
    path.join(defaults.outRoot, "extraction-report.json"),
    JSON.stringify(report, null, 2),
    "utf-8"
  );

  console.log(JSON.stringify(report, null, 2));

  if (
    parsed.strict &&
    (eventBuckets.blocked > 0 ||
      eventBuckets.failed > 0 ||
      eventBuckets.skipped > 0 ||
      regionBuckets.blocked > 0 ||
      regionBuckets.failed > 0 ||
      regionBuckets.skipped > 0)
  ) {
    process.exitCode = 1;
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exitCode = 1;
});
