import path from "node:path";
import { execFile as execFileCallback } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { resolveRepoRoot } from "./intake-utils";

const execFile = promisify(execFileCallback);

type ParsedArgs = {
  manifest?: string;
  rawIndex?: string;
  eventJobs?: string;
  regionJobs?: string;
  outRoot?: string;
  mode: "by-event" | "by-region" | "both";
  batchSize: number;
  batchOffset: number;
  maxBatches?: number;
  dryRun: boolean;
  strict: boolean;
  skipExistingOutputs: boolean;
  gdalBinDir?: string;
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

type ExtractionResult = {
  status: JobStatus;
};

type ExtractionReport = {
  generatedAt: string;
  outRoot: string;
  mode: ParsedArgs["mode"];
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
  eventResults: ExtractionResult[];
  regionResults: ExtractionResult[];
};

type BatchSummary = {
  batchIndex: number;
  jobCount: number;
  reportPath: string;
  stdoutSummary: string;
};

type BatchedReport = {
  generatedAt: string;
  outRoot: string;
  mode: ParsedArgs["mode"];
  manifestPath: string | null;
  rawIndexPath: string | null;
  inputs: {
    eventJobsPath: string | null;
    regionJobsPath: string | null;
  };
  batchSize: number;
  batchOffset: number;
  maxBatches: number | null;
  dryRun: boolean;
  strict: boolean;
  skipExistingOutputs: boolean;
  batchesRun: number;
  totalJobCount: number;
  eventJobCount: number;
  regionJobCount: number;
  batchReports: BatchSummary[];
  aggregate: {
    byEvent: ExtractionReport["byEvent"];
    byRegion: ExtractionReport["byRegion"];
  };
};

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    mode: "both",
    batchSize: 500,
    batchOffset: 0,
    dryRun: false,
    strict: false,
    skipExistingOutputs: false
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
      case "--batch-size": {
        const value = Number(argv[index + 1]);
        if (Number.isFinite(value) && value > 0) {
          parsed.batchSize = Math.floor(value);
        }
        index += 1;
        break;
      }
      case "--batch-offset": {
        const value = Number(argv[index + 1]);
        if (Number.isFinite(value) && value >= 0) {
          parsed.batchOffset = Math.floor(value);
        }
        index += 1;
        break;
      }
      case "--max-batches": {
        const value = Number(argv[index + 1]);
        if (Number.isFinite(value) && value > 0) {
          parsed.maxBatches = Math.floor(value);
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

function chunkArray<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function summarizeStdout(stdout: string): string {
  const trimmed = stdout.trim();
  if (!trimmed) {
    return "";
  }

  const lastLine = trimmed.split(/\r?\n/u).at(-1) ?? "";
  return lastLine.length <= 400 ? lastLine : `${lastLine.slice(0, 397)}...`;
}

function countStatuses(results: readonly ExtractionResult[]): ExtractionReport["byEvent"] {
  const extractedCount = results.filter((result) => result.status === "extracted").length;
  const plannedCount = results.filter((result) => result.status === "planned").length;
  const blockedCount = results.filter((result) => result.status.startsWith("blocked_")).length;
  const skippedCount = results.filter((result) => result.status === "skipped_invalid_job").length;
  const failedCount = results.filter((result) => result.status.startsWith("failed_")).length;

  return {
    jobCount: results.length,
    extractedCount,
    plannedCount,
    blockedCount,
    skippedCount,
    failedCount,
    outputDir: ""
  };
}

async function runBatch(
  repoRoot: string,
  parsed: ParsedArgs,
  mode: "by-event" | "by-region",
  batchIndex: number,
  jobs: unknown[],
  jobsDir: string,
  reportsDir: string,
  outRoot: string,
  manifestPath: string | null,
  rawIndexPath: string | null
): Promise<BatchSummary> {
  const batchTag = String(batchIndex + 1).padStart(4, "0");
  const batchJobsPath = path.join(jobsDir, `${mode}.${batchTag}.jobs.json`);
  await writeFile(batchJobsPath, JSON.stringify(jobs, null, 2), "utf-8");

  const commandArgs = [
    "tsx",
    path.join(repoRoot, "scripts/dev/regional-model-library/extract-chm-pre-v2.ts"),
    "--mode",
    mode,
    "--out-root",
    outRoot
  ];
  if (manifestPath) {
    commandArgs.push("--manifest", manifestPath);
  }
  if (rawIndexPath) {
    commandArgs.push("--raw-index", rawIndexPath);
  }
  if (mode === "by-event") {
    commandArgs.push("--event-jobs", batchJobsPath);
  } else {
    commandArgs.push("--region-jobs", batchJobsPath);
  }
  if (parsed.gdalBinDir?.trim()) {
    commandArgs.push("--gdal-bin-dir", parsed.gdalBinDir.trim());
  }
  if (parsed.skipExistingOutputs) {
    commandArgs.push("--skip-existing-outputs");
  }
  if (parsed.strict) {
    commandArgs.push("--strict");
  }
  if (parsed.dryRun) {
    commandArgs.push("--dry-run");
  }

  const { stdout, stderr } =
    process.platform === "win32"
      ? await execFile("cmd.exe", ["/d", "/s", "/c", "npx", ...commandArgs], {
          cwd: repoRoot,
          windowsHide: true,
          maxBuffer: 32 * 1024 * 1024
        })
      : await execFile("npx", commandArgs, {
          cwd: repoRoot,
          windowsHide: true,
          maxBuffer: 32 * 1024 * 1024
        });

  if (stderr && stderr.trim().length > 0) {
    process.stderr.write(stderr);
  }

  const currentReportPath = path.join(outRoot, "extraction-report.json");
  const batchReportPath = path.join(reportsDir, `${mode}.${batchTag}.report.json`);
  const reportContent = await readFile(currentReportPath, "utf-8");
  await writeFile(batchReportPath, reportContent, "utf-8");

  return {
    batchIndex,
    jobCount: jobs.length,
    reportPath: batchReportPath,
    stdoutSummary: summarizeStdout(stdout)
  };
}

async function main(): Promise<void> {
  const repoRoot = resolveRepoRoot(__dirname);
  const parsed = parseArgs(process.argv.slice(2));
  const outRoot = path.resolve(repoRoot, parsed.outRoot ?? ".tmp/regional-model-library/raw/CHM_PRE-V2/extracts");
  const manifestPath = parsed.manifest ? path.resolve(repoRoot, parsed.manifest) : null;
  const rawIndexPath = parsed.rawIndex
    ? path.resolve(repoRoot, parsed.rawIndex)
    : path.resolve(repoRoot, ".tmp/regional-model-library/raw/CHM_PRE-V2/raw-index.json");
  const eventJobsPath = parsed.eventJobs ? path.resolve(repoRoot, parsed.eventJobs) : null;
  const regionJobsPath = parsed.regionJobs ? path.resolve(repoRoot, parsed.regionJobs) : null;

  const eventJobs =
    parsed.mode === "by-region" || !eventJobsPath ? [] : await readJsonFile<unknown[]>(eventJobsPath);
  const regionJobs =
    parsed.mode === "by-event" || !regionJobsPath ? [] : await readJsonFile<unknown[]>(regionJobsPath);

  const jobStagingDir = path.join(outRoot, ".batch-jobs");
  const reportsDir = path.join(outRoot, "batch-reports");
  await mkdir(jobStagingDir, { recursive: true });
  await mkdir(reportsDir, { recursive: true });

  const batchReports: BatchSummary[] = [];
  const selectedEventBatches = chunkArray(eventJobs, parsed.batchSize).slice(
    parsed.batchOffset,
    parsed.maxBatches ? parsed.batchOffset + parsed.maxBatches : undefined
  );
  const selectedRegionBatches = chunkArray(regionJobs, parsed.batchSize).slice(
    parsed.batchOffset,
    parsed.maxBatches ? parsed.batchOffset + parsed.maxBatches : undefined
  );

  for (const [index, jobs] of selectedEventBatches.entries()) {
    batchReports.push(
      await runBatch(
        repoRoot,
        parsed,
        "by-event",
        parsed.batchOffset + index,
        jobs,
        jobStagingDir,
        reportsDir,
        outRoot,
        manifestPath,
        rawIndexPath
      )
    );
  }

  for (const [index, jobs] of selectedRegionBatches.entries()) {
    batchReports.push(
      await runBatch(
        repoRoot,
        parsed,
        "by-region",
        parsed.batchOffset + index,
        jobs,
        jobStagingDir,
        reportsDir,
        outRoot,
        manifestPath,
        rawIndexPath
      )
    );
  }

  const batchReportPayloads = await Promise.all(
    batchReports.map((item) => readJsonFile<ExtractionReport>(item.reportPath))
  );
  const allEventResults = batchReportPayloads.flatMap((item) => item.eventResults ?? []);
  const allRegionResults = batchReportPayloads.flatMap((item) => item.regionResults ?? []);
  const byEvent = countStatuses(allEventResults);
  const byRegion = countStatuses(allRegionResults);

  byEvent.outputDir = path.join(outRoot, "by-event");
  byRegion.outputDir = path.join(outRoot, "by-region");

  const report: BatchedReport = {
    generatedAt: new Date().toISOString(),
    outRoot,
    mode: parsed.mode,
    manifestPath,
    rawIndexPath,
    inputs: {
      eventJobsPath,
      regionJobsPath
    },
    batchSize: parsed.batchSize,
    batchOffset: parsed.batchOffset,
    maxBatches: parsed.maxBatches ?? null,
    dryRun: parsed.dryRun,
    strict: parsed.strict,
    skipExistingOutputs: parsed.skipExistingOutputs,
    batchesRun: batchReports.length,
    totalJobCount: allEventResults.length + allRegionResults.length,
    eventJobCount: allEventResults.length,
    regionJobCount: allRegionResults.length,
    batchReports,
    aggregate: {
      byEvent,
      byRegion
    }
  };

  await mkdir(outRoot, { recursive: true });
  await writeFile(
    path.join(outRoot, "extraction-batched-report.json"),
    JSON.stringify(report, null, 2),
    "utf-8"
  );

  console.log(JSON.stringify(report, null, 2));

  if (
    parsed.strict &&
    (byEvent.blockedCount > 0 ||
      byEvent.skippedCount > 0 ||
      byEvent.failedCount > 0 ||
      byRegion.blockedCount > 0 ||
      byRegion.skippedCount > 0 ||
      byRegion.failedCount > 0)
  ) {
    process.exitCode = 1;
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
