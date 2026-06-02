import path from "node:path";
import { execFile as execFileCallback } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { resolveRepoRoot } from "./intake-utils";

const execFile = promisify(execFileCallback);

type ParsedArgs = {
  packKey?: string;
  datasetKey: string;
  eventCsv?: string;
  collisionEventCsv?: string;
  outDir?: string;
  positivePlanRoot?: string;
  positiveExtractRoot?: string;
  negativePlanDir?: string;
  negativePlanRoot?: string;
  negativeExtractRoot?: string;
  trainOutDir?: string;
  modelKey?: string;
  artifactType: "single-stage" | "two-stage";
  skipTrain: boolean;
  extractBatchSize?: number;
  extractBatchOffset: number;
  extractMaxBatches?: number;
  skipExistingOutputs: boolean;
};

type CsvRow = Record<string, string>;

type EventExtractJob = {
  event_id: string;
  status: "ready" | "missing_coordinates" | "invalid_event_ts";
};

type CommandRun = {
  label: string;
  scriptPath: string;
  args: string[];
  stdout: string;
};

type PipelineReport = {
  generatedAt: string;
  packKey: string;
  datasetKey: string;
  sourceEventCsv: string;
  collisionEventCsv: string;
  filteredPositiveEventCsv: string;
  positivePlanRoot: string;
  positiveExtractRoot: string;
  negativePlanDir: string;
  negativePlanRoot: string;
  negativeExtractRoot: string;
  packOutputDir: string;
  trainOutDir: string | null;
  artifactType: ParsedArgs["artifactType"];
  positiveEventCount: number;
  readyPositiveEventCount: number;
  excludedPositiveEventCount: number;
  commandRuns: CommandRun[];
};

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    datasetKey: "CHM_PRE-V2-replay",
    artifactType: "two-stage",
    skipTrain: false,
    extractBatchOffset: 0,
    skipExistingOutputs: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token) continue;

    switch (token) {
      case "--pack-key":
        parsed.packKey = argv[index + 1];
        index += 1;
        break;
      case "--dataset-key":
        parsed.datasetKey = argv[index + 1] ?? parsed.datasetKey;
        index += 1;
        break;
      case "--event-csv":
        parsed.eventCsv = argv[index + 1];
        index += 1;
        break;
      case "--collision-event-csv":
        parsed.collisionEventCsv = argv[index + 1];
        index += 1;
        break;
      case "--out-dir":
        parsed.outDir = argv[index + 1];
        index += 1;
        break;
      case "--positive-plan-root":
        parsed.positivePlanRoot = argv[index + 1];
        index += 1;
        break;
      case "--positive-extract-root":
        parsed.positiveExtractRoot = argv[index + 1];
        index += 1;
        break;
      case "--negative-plan-dir":
        parsed.negativePlanDir = argv[index + 1];
        index += 1;
        break;
      case "--negative-plan-root":
        parsed.negativePlanRoot = argv[index + 1];
        index += 1;
        break;
      case "--negative-extract-root":
        parsed.negativeExtractRoot = argv[index + 1];
        index += 1;
        break;
      case "--train-out-dir":
        parsed.trainOutDir = argv[index + 1];
        index += 1;
        break;
      case "--model-key":
        parsed.modelKey = argv[index + 1];
        index += 1;
        break;
      case "--artifact-type": {
        const value = argv[index + 1];
        if (value === "single-stage" || value === "two-stage") {
          parsed.artifactType = value;
        }
        index += 1;
        break;
      }
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
      case "--skip-existing-outputs":
        parsed.skipExistingOutputs = true;
        break;
      case "--skip-train":
        parsed.skipTrain = true;
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
    if (character === '"') {
      const nextCharacter = line[index + 1];
      if (inQuotes && nextCharacter === '"') {
        current += '"';
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

async function readCsvRows(filePath: string): Promise<CsvRow[]> {
  const content = await readFile(filePath, "utf-8");
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
    const row: CsvRow = {};
    headers.forEach((header, index) => {
      row[header] = values[index] ?? "";
    });
    return row;
  });
}

function escapeCsvValue(value: string): string {
  if (/[",\r\n]/u.test(value)) {
    return `"${value.replace(/"/gu, '""')}"`;
  }
  return value;
}

function toCsv(rows: readonly CsvRow[]): string {
  if (rows.length === 0) {
    return "";
  }

  const headers = Object.keys(rows[0]!);
  return [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => escapeCsvValue(row[header] ?? "")).join(","))
  ].join("\n");
}

async function readJsonFile<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf-8")) as T;
}

async function runTsxScript(
  repoRoot: string,
  scriptRelativePath: string,
  args: string[],
  label: string
): Promise<CommandRun> {
  const scriptPath = path.join(repoRoot, scriptRelativePath);
  const commandArgs =
    process.platform === "win32"
      ? ["tsx", scriptPath, ...args]
      : ["tsx", scriptPath, ...args];
  const execution =
    process.platform === "win32"
      ? await execFile("cmd.exe", ["/d", "/s", "/c", "npx", ...commandArgs], {
          cwd: repoRoot,
          maxBuffer: 32 * 1024 * 1024
        })
      : await execFile("npx", commandArgs, {
          cwd: repoRoot,
          maxBuffer: 32 * 1024 * 1024
        });
  const { stdout, stderr } = execution;

  if (stderr && stderr.trim().length > 0) {
    process.stderr.write(stderr);
  }

  process.stdout.write(`[${label}]\n${stdout}`);
  return {
    label,
    scriptPath,
    args,
    stdout
  };
}

async function runExtractStep(
  repoRoot: string,
  parsed: ParsedArgs,
  jobsPath: string,
  outRoot: string,
  label: string
): Promise<CommandRun> {
  if (!parsed.extractBatchSize || parsed.extractBatchSize <= 0) {
    const args = [
      "--mode",
      "by-event",
      "--event-jobs",
      jobsPath,
      "--out-root",
      outRoot
    ];
    if (parsed.skipExistingOutputs) {
      args.push("--skip-existing-outputs");
    }
    return runTsxScript(
      repoRoot,
      "scripts/dev/regional-model-library/extract-chm-pre-v2.ts",
      args,
      label
    );
  }

  const args = [
    "--mode",
    "by-event",
    "--event-jobs",
    jobsPath,
    "--out-root",
    outRoot,
    "--batch-size",
    String(parsed.extractBatchSize),
    "--batch-offset",
    String(parsed.extractBatchOffset)
  ];
  if (parsed.extractMaxBatches) {
    args.push("--max-batches", String(parsed.extractMaxBatches));
  }
  if (parsed.skipExistingOutputs) {
    args.push("--skip-existing-outputs");
  }
  return runTsxScript(
    repoRoot,
    "scripts/dev/regional-model-library/extract-chm-pre-v2-batched.ts",
    args,
    label
  );
}

async function filterPositiveEventCsv(
  sourceEventCsv: string,
  positivePlanRoot: string,
  filteredOutFile: string
): Promise<{
  totalCount: number;
  readyCount: number;
  excludedCount: number;
}> {
  const sourceRows = await readCsvRows(sourceEventCsv);
  const jobs = await readJsonFile<EventExtractJob[]>(path.join(positivePlanRoot, "by-event.jobs.json"));
  const readyIds = new Set(
    jobs.filter((job) => job.status === "ready").map((job) => job.event_id).filter(Boolean)
  );
  const filteredRows = sourceRows.filter((row) => readyIds.has(row.event_id ?? ""));
  await writeFile(filteredOutFile, toCsv(filteredRows), "utf-8");
  return {
    totalCount: sourceRows.length,
    readyCount: filteredRows.length,
    excludedCount: sourceRows.length - filteredRows.length
  };
}

async function main(): Promise<void> {
  const repoRoot = resolveRepoRoot(__dirname);
  const parsed = parseArgs(process.argv.slice(2));
  const packKey =
    parsed.packKey?.trim() ||
    path.basename(parsed.eventCsv ?? "event-replay-pack").replace(/\.[^.]+$/u, "") ||
    "event-replay-pack";
  const sourceEventCsv = path.resolve(
    repoRoot,
    parsed.eventCsv ?? ".tmp/regional-model-library/raw/China-2008-2024-catalogue/normalized/phase1-event-inventory.csv"
  );
  const collisionEventCsv = path.resolve(repoRoot, parsed.collisionEventCsv ?? sourceEventCsv);
  const outDir = path.resolve(repoRoot, parsed.outDir ?? `.tmp/regional-model-library/out/replay-packs/${packKey}`);
  const positivePlanRoot = path.resolve(
    repoRoot,
    parsed.positivePlanRoot ?? `.tmp/regional-model-library/raw/CHM_PRE-V2/plans/${packKey}`
  );
  const positiveExtractRoot = path.resolve(
    repoRoot,
    parsed.positiveExtractRoot ?? `.tmp/regional-model-library/raw/CHM_PRE-V2/extracts/${packKey}`
  );
  const negativePlanDir = path.resolve(repoRoot, parsed.negativePlanDir ?? path.join(outDir, "negative-plan"));
  const negativePlanRoot = path.resolve(
    repoRoot,
    parsed.negativePlanRoot ?? `.tmp/regional-model-library/raw/CHM_PRE-V2/plans/${packKey}-negatives`
  );
  const negativeExtractRoot = path.resolve(
    repoRoot,
    parsed.negativeExtractRoot ?? `.tmp/regional-model-library/raw/CHM_PRE-V2/extracts/${packKey}-negatives`
  );
  const trainOutDir = parsed.skipTrain
    ? null
    : path.resolve(
        repoRoot,
        parsed.trainOutDir ?? `.tmp/regional-model-library/out/artifacts/${packKey}-replay`
      );
  const filteredPositiveEventCsv = path.join(outDir, "positive-events.ready.csv");
  const negativeEventCsv = path.join(negativePlanDir, "negative-events.csv");
  const sampleOutputPath = path.join(outDir, "event-replay-pack.samples.jsonl");
  const reportOutputPath = path.join(outDir, "run-event-replay-pack-pipeline.report.json");

  await mkdir(outDir, { recursive: true });

  const commandRuns: CommandRun[] = [];

  commandRuns.push(
    await runTsxScript(
      repoRoot,
      "scripts/dev/regional-model-library/plan-chm-pre-v2-extracts.ts",
      ["--mode", "by-event", "--event-csv", sourceEventCsv, "--out-root", positivePlanRoot],
      "plan-positive"
    )
  );

  const filterSummary = await filterPositiveEventCsv(
    sourceEventCsv,
    positivePlanRoot,
    filteredPositiveEventCsv
  );

  commandRuns.push(
    await runExtractStep(
      repoRoot,
      parsed,
      path.join(positivePlanRoot, "by-event.jobs.json"),
      positiveExtractRoot,
      "extract-positive"
    )
  );

  commandRuns.push(
    await runTsxScript(
      repoRoot,
      "scripts/dev/regional-model-library/plan-negative-windows.ts",
      [
        "--event-csv",
        filteredPositiveEventCsv,
        "--collision-event-csv",
        collisionEventCsv,
        "--out-dir",
        negativePlanDir
      ],
      "plan-negative"
    )
  );

  commandRuns.push(
    await runTsxScript(
      repoRoot,
      "scripts/dev/regional-model-library/plan-chm-pre-v2-extracts.ts",
      ["--mode", "by-event", "--event-csv", negativeEventCsv, "--out-root", negativePlanRoot],
      "plan-negative-chm-pre"
    )
  );

  commandRuns.push(
    await runExtractStep(
      repoRoot,
      parsed,
      path.join(negativePlanRoot, "by-event.jobs.json"),
      negativeExtractRoot,
      "extract-negative"
    )
  );

  commandRuns.push(
    await runTsxScript(
      repoRoot,
      "scripts/dev/regional-model-library/build-event-replay-pack.ts",
      [
        "--pack-key",
        packKey,
        "--dataset-key",
        parsed.datasetKey,
        "--event-csv",
        filteredPositiveEventCsv,
        "--positive-extract-root",
        positiveExtractRoot,
        "--negative-event-csv",
        negativeEventCsv,
        "--negative-extract-root",
        negativeExtractRoot,
        "--out-dir",
        outDir
      ],
      "build-replay-pack"
    )
  );

  if (!parsed.skipTrain && trainOutDir) {
    commandRuns.push(
      await runTsxScript(
        repoRoot,
        "scripts/dev/regional-model-library/train-linear-risk-model.ts",
        [
          "--samples",
          sampleOutputPath,
          "--out-dir",
          trainOutDir,
          "--model-key",
          parsed.modelKey ?? `${packKey}-replay`,
          "--artifact-type",
          parsed.artifactType
        ],
        "train-replay-artifact"
      )
    );
  }

  const report: PipelineReport = {
    generatedAt: new Date().toISOString(),
    packKey,
    datasetKey: parsed.datasetKey,
    sourceEventCsv,
    collisionEventCsv,
    filteredPositiveEventCsv,
    positivePlanRoot,
    positiveExtractRoot,
    negativePlanDir,
    negativePlanRoot,
    negativeExtractRoot,
    packOutputDir: outDir,
    trainOutDir,
    artifactType: parsed.artifactType,
    positiveEventCount: filterSummary.totalCount,
    readyPositiveEventCount: filterSummary.readyCount,
    excludedPositiveEventCount: filterSummary.excludedCount,
    commandRuns
  };

  await writeFile(reportOutputPath, JSON.stringify(report, null, 2), "utf-8");
  process.stdout.write(
    `${JSON.stringify(
      {
        reportOutputPath,
        packOutputDir: outDir,
        trainOutDir,
        positiveEventCount: report.positiveEventCount,
        readyPositiveEventCount: report.readyPositiveEventCount,
        excludedPositiveEventCount: report.excludedPositiveEventCount
      },
      null,
      2
    )}\n`
  );
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
