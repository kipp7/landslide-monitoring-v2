import path from "node:path";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type {
  RawDatasetDownloadTarget,
  RawDatasetIntakeManifest
} from "../../../libs/regional-model-library/src";
import { writeJsonFile } from "../../../libs/regional-model-library/src";
import { findIntakeManifestOrThrow, resolveRepoRoot } from "./intake-utils";

type ParsedArgs = {
  datasetKey?: string;
  rawRoot?: string;
  download: boolean;
  includeOptional: boolean;
  overwrite: boolean;
  targetKeys: string[];
};

type DownloadResult = {
  targetKey: string;
  displayName: string;
  url: string;
  method: "GET" | "POST";
  outFile: string;
  status: "planned" | "downloaded" | "skipped-existing" | "failed";
  bytesWritten: number | null;
  finalUrl: string | null;
  notes: string[];
  error: string | null;
};

type LandingPlanReport = {
  generatedAt: string;
  datasetKey: string;
  displayName: string;
  rawRoot: string;
  accessMode: RawDatasetIntakeManifest["accessPlan"]["mode"];
  repoRoles: string[];
  primarySource: string;
  backupSources: string[];
  immediateActions: string[];
  constraints: string[];
  familyRoots: Array<{
    familyKey: string;
    rawLandingRelative: string;
    expectedFormats: string[];
  }>;
  selectedDownloadTargets: Array<{
    targetKey: string;
    displayName: string;
    method: "GET" | "POST";
    required: boolean;
    relativeOutFile: string;
  }>;
  downloadResults: DownloadResult[];
  wroteOperatorBrief: string;
  wrotePlanFile: string;
};

const STANDARD_LAYOUT_DIRS = [
  "source",
  "original",
  "unpacked",
  "normalized",
  "extracts"
] as const;

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    download: false,
    includeOptional: false,
    overwrite: false,
    targetKeys: []
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token) continue;

    switch (token) {
      case "--dataset-key":
        parsed.datasetKey = argv[index + 1];
        index += 1;
        break;
      case "--raw-root":
        parsed.rawRoot = argv[index + 1];
        index += 1;
        break;
      case "--download":
        parsed.download = true;
        break;
      case "--include-optional":
        parsed.includeOptional = true;
        break;
      case "--overwrite":
        parsed.overwrite = true;
        break;
      case "--target-key":
        if (argv[index + 1]) {
          parsed.targetKeys.push(argv[index + 1]!);
        }
        index += 1;
        break;
      default:
        break;
    }
  }

  return parsed;
}

function ensureDatasetKey(parsed: ParsedArgs): string {
  if (!parsed.datasetKey || parsed.datasetKey.trim().length === 0) {
    throw new Error("--dataset-key is required.");
  }

  return parsed.datasetKey.trim();
}

async function ensureLayout(rawRoot: string, manifest: RawDatasetIntakeManifest): Promise<void> {
  await mkdir(rawRoot, { recursive: true });

  for (const relativeDir of STANDARD_LAYOUT_DIRS) {
    await mkdir(path.join(rawRoot, relativeDir), { recursive: true });
  }

  for (const family of manifest.families) {
    await mkdir(path.join(rawRoot, family.rawLandingRelative), { recursive: true });
  }
}

function selectDownloadTargets(
  manifest: RawDatasetIntakeManifest,
  parsed: ParsedArgs
): RawDatasetDownloadTarget[] {
  const targets = manifest.accessPlan.downloadTargets ?? [];
  if (targets.length === 0) {
    return [];
  }

  if (parsed.targetKeys.length > 0) {
    return targets.filter((target) => parsed.targetKeys.includes(target.targetKey));
  }

  if (parsed.includeOptional) {
    return targets;
  }

  return targets.filter((target) => target.required);
}

function renderOperatorBrief(
  manifest: RawDatasetIntakeManifest,
  rawRoot: string,
  selectedTargets: readonly RawDatasetDownloadTarget[]
): string {
  const lines: string[] = [
    `# Intake Operator Brief: ${manifest.displayName}`,
    "",
    `- datasetKey: \`${manifest.datasetKey}\``,
    `- rawRoot: \`${rawRoot}\``,
    `- accessMode: \`${manifest.accessPlan.mode}\``,
    `- primarySource: ${manifest.accessPlan.primarySource}`,
    ""
  ];

  if (manifest.accessPlan.backupSources?.length) {
    lines.push("## Backup Sources", "");
    for (const source of manifest.accessPlan.backupSources) {
      lines.push(`- ${source}`);
    }
    lines.push("");
  }

  lines.push("## Immediate Actions", "");
  for (const action of manifest.accessPlan.immediateActions) {
    lines.push(`- ${action}`);
  }
  lines.push("");

  if (manifest.accessPlan.constraints?.length) {
    lines.push("## Constraints", "");
    for (const constraint of manifest.accessPlan.constraints) {
      lines.push(`- ${constraint}`);
    }
    lines.push("");
  }

  lines.push("## Family Roots", "");
  for (const family of manifest.families) {
    lines.push(`- \`${family.familyKey}\` -> \`${path.join(rawRoot, family.rawLandingRelative)}\``);
  }
  lines.push("");

  if (selectedTargets.length > 0) {
    lines.push("## Selected Download Targets", "");
    for (const target of selectedTargets) {
      lines.push(`- \`${target.targetKey}\` -> \`${path.join(rawRoot, target.relativeOutFile)}\``);
      lines.push(`  - method: ${target.method ?? "GET"}`);
      lines.push(`  - source: ${target.url}`);
      if (target.headers && Object.keys(target.headers).length > 0) {
        lines.push(`  - headers: ${JSON.stringify(target.headers)}`);
      }
      if (target.notes?.length) {
        for (const note of target.notes) {
          lines.push(`  - note: ${note}`);
        }
      }
    }
    lines.push("");
  }

  return lines.join("\n");
}

async function downloadTarget(
  rawRoot: string,
  target: RawDatasetDownloadTarget,
  overwrite: boolean
): Promise<DownloadResult> {
  const outFile = path.join(rawRoot, target.relativeOutFile);
  await mkdir(path.dirname(outFile), { recursive: true });

  try {
    const existing = await stat(outFile).catch(() => null);
    if (existing && !overwrite) {
      return {
        targetKey: target.targetKey,
        displayName: target.displayName,
        url: target.url,
        method: target.method ?? "GET",
        outFile,
        status: "skipped-existing",
        bytesWritten: existing.size,
        finalUrl: null,
        notes: [...(target.notes ?? [])],
        error: null
      };
    }

    const response = await fetch(target.url, {
      method: target.method ?? "GET",
      headers: target.headers,
      redirect: "follow"
    });
    if (!response.ok || !response.body) {
      throw new Error(`HTTP ${String(response.status)} while downloading ${target.url}`);
    }

    await pipeline(
      Readable.fromWeb(response.body as globalThis.ReadableStream<Uint8Array>),
      createWriteStream(outFile)
    );

    const downloaded = await stat(outFile);
    return {
      targetKey: target.targetKey,
      displayName: target.displayName,
      url: target.url,
      method: target.method ?? "GET",
      outFile,
      status: "downloaded",
      bytesWritten: downloaded.size,
      finalUrl: response.url,
      notes: [...(target.notes ?? [])],
      error: null
    };
  } catch (error) {
    return {
      targetKey: target.targetKey,
      displayName: target.displayName,
      url: target.url,
      method: target.method ?? "GET",
      outFile,
      status: "failed",
      bytesWritten: null,
      finalUrl: null,
      notes: [...(target.notes ?? [])],
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function main(): Promise<void> {
  const repoRoot = resolveRepoRoot(__dirname);
  const parsed = parseArgs(process.argv.slice(2));
  const datasetKey = ensureDatasetKey(parsed);
  const manifest = findIntakeManifestOrThrow(datasetKey);
  const rawRoot = path.resolve(repoRoot, parsed.rawRoot ?? manifest.rawLandingRoot);

  await ensureLayout(rawRoot, manifest);

  const selectedTargets = selectDownloadTargets(manifest, parsed);
  const operatorBriefPath = path.join(rawRoot, "README.intake.md");
  const planPath = path.join(rawRoot, "landing-plan.json");

  await writeFile(
    operatorBriefPath,
    renderOperatorBrief(manifest, rawRoot, selectedTargets),
    "utf-8"
  );

  const downloadResults =
    parsed.download && selectedTargets.length > 0
      ? await Promise.all(
          selectedTargets.map((target) => downloadTarget(rawRoot, target, parsed.overwrite))
        )
      : selectedTargets.map((target) => ({
          targetKey: target.targetKey,
          displayName: target.displayName,
          url: target.url,
          method: target.method ?? "GET",
          outFile: path.join(rawRoot, target.relativeOutFile),
          status: "planned" as const,
          bytesWritten: null,
          finalUrl: null,
          notes: [...(target.notes ?? [])],
          error: null
        }));

  const report: LandingPlanReport = {
    generatedAt: new Date().toISOString(),
    datasetKey: manifest.datasetKey,
    displayName: manifest.displayName,
    rawRoot,
    accessMode: manifest.accessPlan.mode,
    repoRoles: [...manifest.repoRoles],
    primarySource: manifest.accessPlan.primarySource,
    backupSources: [...(manifest.accessPlan.backupSources ?? [])],
    immediateActions: [...manifest.accessPlan.immediateActions],
    constraints: [...(manifest.accessPlan.constraints ?? [])],
    familyRoots: manifest.families.map((family) => ({
      familyKey: family.familyKey,
      rawLandingRelative: family.rawLandingRelative,
      expectedFormats: [...family.expectedFormats]
    })),
    selectedDownloadTargets: selectedTargets.map((target) => ({
      targetKey: target.targetKey,
      displayName: target.displayName,
      method: target.method ?? "GET",
      required: target.required ?? false,
      relativeOutFile: target.relativeOutFile
    })),
    downloadResults,
    wroteOperatorBrief: operatorBriefPath,
    wrotePlanFile: planPath
  };

  await writeJsonFile(planPath, report);
  console.log(JSON.stringify(report, null, 2));
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
