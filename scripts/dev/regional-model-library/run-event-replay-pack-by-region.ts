import path from "node:path";
import { execFile as execFileCallback } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { resolveRepoRoot } from "./intake-utils";

const execFile = promisify(execFileCallback);

type ParsedArgs = {
  datasetKey: string;
  splitRoot?: string;
  collisionEventCsv?: string;
  outRoot?: string;
  packKeyPrefix?: string;
  extractBatchSize?: number;
  extractBatchOffset: number;
  extractMaxBatches?: number;
  includeRegions: string[];
  maxRegions?: number;
  skipTrain: boolean;
  skipExistingOutputs: boolean;
  artifactType: "single-stage" | "two-stage";
};

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

type RegionRunSummary = {
  regionCode: string;
  rowCount: number;
  outputFile: string;
  outDir: string;
  reportOutputPath: string;
  stdoutSummary: string;
};

type RegionRunReport = {
  generatedAt: string;
  datasetKey: string;
  splitRoot: string;
  collisionEventCsv: string;
  outRoot: string;
  packKeyPrefix: string;
  extractBatchSize: number | null;
  skipTrain: boolean;
  skipExistingOutputs: boolean;
  artifactType: ParsedArgs["artifactType"];
  regionCount: number;
  totalRowCount: number;
  executedRegions: RegionRunSummary[];
};

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    datasetKey: "Beijing-2023",
    extractBatchOffset: 0,
    includeRegions: [],
    skipTrain: false,
    skipExistingOutputs: false,
    artifactType: "two-stage"
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token) continue;

    switch (token) {
      case "--dataset-key":
        parsed.datasetKey = argv[index + 1] ?? parsed.datasetKey;
        index += 1;
        break;
      case "--split-root":
        parsed.splitRoot = argv[index + 1];
        index += 1;
        break;
      case "--collision-event-csv":
        parsed.collisionEventCsv = argv[index + 1];
        index += 1;
        break;
      case "--out-root":
        parsed.outRoot = argv[index + 1];
        index += 1;
        break;
      case "--pack-key-prefix":
        parsed.packKeyPrefix = argv[index + 1];
        index += 1;
        break;
      case "--extract-batch-size": {
        const value = Number(argv[index + 1]);
        if (Number.isFinite(value) && value > 0) {
          parsed.extractBatchSize = Math.floor(value);
        }
        index += 1;
        break;
      }
      case "--extract-batch-offset": {
        const value = Number(argv[index + 1]);
        if (Number.isFinite(value) && value >= 0) {
          parsed.extractBatchOffset = Math.floor(value);
        }
        index += 1;
        break;
      }
      case "--extract-max-batches": {
        const value = Number(argv[index + 1]);
        if (Number.isFinite(value) && value > 0) {
          parsed.extractMaxBatches = Math.floor(value);
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
      case "--max-regions": {
        const value = Number(argv[index + 1]);
        if (Number.isFinite(value) && value > 0) {
          parsed.maxRegions = Math.floor(value);
        }
        index += 1;
        break;
      }
      case "--artifact-type": {
        const value = argv[index + 1];
        if (value === "single-stage" || value === "two-stage") {
          parsed.artifactType = value;
        }
        index += 1;
        break;
      }
      case "--skip-train":
        parsed.skipTrain = true;
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

function sanitizeFileSegment(value: string): string {
  return value
    .replace(/[<>:"/\\|?*\s]+/gu, "-")
    .replace(/-+/gu, "-")
    .replace(/^-|-$/gu, "");
}

function summarizeStdout(stdout: string): string {
  const trimmed = stdout.trim();
  if (!trimmed) {
    return "";
  }

  const lastLine = trimmed.split(/\r?\n/u).at(-1) ?? "";
  return lastLine.length <= 400 ? lastLine : `${lastLine.slice(0, 397)}...`;
}

async function readJsonFile<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf-8")) as T;
}

async function runTsxScript(
  repoRoot: string,
  scriptRelativePath: string,
  args: string[]
): Promise<{ stdout: string; stderr: string }> {
  const scriptPath = path.join(repoRoot, scriptRelativePath);
  const commandArgs = ["tsx", scriptPath, ...args];
  return process.platform === "win32"
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
}

async function main(): Promise<void> {
  const repoRoot = resolveRepoRoot(__dirname);
  const parsed = parseArgs(process.argv.slice(2));
  const splitRoot = path.resolve(
    repoRoot,
    parsed.splitRoot ?? ".tmp/regional-model-library/raw/Beijing-2023/splits/by-region"
  );
  const collisionEventCsv = path.resolve(
    repoRoot,
    parsed.collisionEventCsv ??
      ".tmp/regional-model-library/raw/China-2008-2024-catalogue/normalized/phase1-event-inventory.csv"
  );
  const outRoot = path.resolve(
    repoRoot,
    parsed.outRoot ?? `.tmp/regional-model-library/out/replay-packs/${parsed.datasetKey}-by-region`
  );
  const packKeyPrefix =
    parsed.packKeyPrefix?.trim() || `${parsed.datasetKey.replace(/[^\w.-]+/gu, "-")}-by-region`;

  const splitIndex = await readJsonFile<SplitIndex>(path.join(splitRoot, "split-index.json"));
  const selectedSplits = splitIndex.splits
    .filter((item) =>
      parsed.includeRegions.length > 0 ? parsed.includeRegions.includes(item.regionCode) : true
    )
    .slice(0, parsed.maxRegions ?? splitIndex.splits.length);

  await mkdir(outRoot, { recursive: true });

  const executedRegions: RegionRunSummary[] = [];
  for (const split of selectedSplits) {
    const regionTag = sanitizeFileSegment(split.regionCode) || "unknown-region";
    const regionOutDir = path.join(outRoot, regionTag);
    const args = [
      "--pack-key",
      `${packKeyPrefix}-${regionTag}`,
      "--dataset-key",
      parsed.datasetKey,
      "--event-csv",
      split.outputFile,
      "--collision-event-csv",
      collisionEventCsv,
      "--out-dir",
      regionOutDir,
      "--positive-plan-root",
      path.join(regionOutDir, "positive-plan"),
      "--positive-extract-root",
      path.join(regionOutDir, "positive-extracts"),
      "--negative-plan-dir",
      path.join(regionOutDir, "negative-plan"),
      "--negative-plan-root",
      path.join(regionOutDir, "negative-plan-chm-pre"),
      "--negative-extract-root",
      path.join(regionOutDir, "negative-extracts"),
      "--artifact-type",
      parsed.artifactType
    ];
    if (parsed.extractBatchSize) {
      args.push("--extract-batch-size", String(parsed.extractBatchSize));
      args.push("--extract-batch-offset", String(parsed.extractBatchOffset));
    }
    if (parsed.extractMaxBatches) {
      args.push("--extract-max-batches", String(parsed.extractMaxBatches));
    }
    if (parsed.skipTrain) {
      args.push("--skip-train");
    }
    if (parsed.skipExistingOutputs) {
      args.push("--skip-existing-outputs");
    }

    const { stdout, stderr } = await runTsxScript(
      repoRoot,
      "scripts/dev/regional-model-library/run-event-replay-pack-pipeline.ts",
      args
    );
    if (stderr && stderr.trim().length > 0) {
      process.stderr.write(stderr);
    }

    executedRegions.push({
      regionCode: split.regionCode,
      rowCount: split.rowCount,
      outputFile: split.outputFile,
      outDir: regionOutDir,
      reportOutputPath: path.join(regionOutDir, "run-event-replay-pack-pipeline.report.json"),
      stdoutSummary: summarizeStdout(stdout)
    });
  }

  const report: RegionRunReport = {
    generatedAt: new Date().toISOString(),
    datasetKey: parsed.datasetKey,
    splitRoot,
    collisionEventCsv,
    outRoot,
    packKeyPrefix,
    extractBatchSize: parsed.extractBatchSize ?? null,
    skipTrain: parsed.skipTrain,
    skipExistingOutputs: parsed.skipExistingOutputs,
    artifactType: parsed.artifactType,
    regionCount: executedRegions.length,
    totalRowCount: executedRegions.reduce((sum, item) => sum + item.rowCount, 0),
    executedRegions
  };

  await writeFile(
    path.join(outRoot, "run-by-region.report.json"),
    JSON.stringify(report, null, 2),
    "utf-8"
  );
  console.log(JSON.stringify(report, null, 2));
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
