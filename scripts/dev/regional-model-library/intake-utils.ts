import path from "node:path";
import { readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import * as XLSX from "xlsx";
import type { RawDatasetIntakeManifest } from "../../../libs/regional-model-library/src";
import { FIRST_WAVE_INTAKE_MANIFESTS } from "./intake-manifest-templates";

export type LandingEntry = {
  absolutePath: string;
  relativePath: string;
  kind: "file" | "directory";
  extension: string;
};

const workbookSheetCache = new Map<string, string[]>();

export function resolveRepoRoot(startDir: string): string {
  let current = path.resolve(startDir);

  while (true) {
    if (existsSync(path.join(current, "package.json"))) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      throw new Error("Cannot resolve repo root.");
    }
    current = parent;
  }
}

function normalizeExtension(entryPath: string, kind: "file" | "directory"): string {
  const extension = path.extname(entryPath).toLowerCase();
  if (extension.length > 1) {
    return extension.slice(1);
  }

  if (kind === "directory") {
    return path.basename(entryPath).toLowerCase();
  }

  return "";
}

async function collectLandingEntriesRecursive(
  currentPath: string,
  rootPath: string
): Promise<LandingEntry[]> {
  const entries = await readdir(currentPath, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const absolutePath = path.join(currentPath, entry.name);
      const kind = entry.isDirectory() ? "directory" : "file";
      const landingEntry: LandingEntry = {
        absolutePath,
        relativePath: path.relative(rootPath, absolutePath).replace(/\\/gu, "/"),
        kind,
        extension: normalizeExtension(absolutePath, kind)
      };

      if (!entry.isDirectory()) {
        return [landingEntry];
      }

      const childEntries = await collectLandingEntriesRecursive(absolutePath, rootPath);
      return [landingEntry, ...childEntries];
    })
  );

  return nested.flat();
}

export async function collectLandingEntries(rootPath: string): Promise<LandingEntry[]> {
  return (await collectLandingEntriesRecursive(rootPath, rootPath)).sort((left, right) =>
    left.relativePath.localeCompare(right.relativePath)
  );
}

export function wildcardPatternToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[|\\{}()[\]^$+?.]/gu, "\\$&").replace(/\*/gu, ".*");
  return new RegExp(`^${escaped}$`, "iu");
}

export function matchesAnyPattern(value: string, patterns: readonly string[] | undefined): boolean {
  if (!patterns || patterns.length === 0) {
    return true;
  }

  return patterns.some((pattern) => wildcardPatternToRegExp(pattern).test(value));
}

export function matchesExpectedFormat(entry: LandingEntry, expectedFormats: readonly string[]): boolean {
  if (expectedFormats.length === 0) {
    return true;
  }

  return expectedFormats.some((format) => format.toLowerCase() === entry.extension.toLowerCase());
}

export function isBlockingFamilyStage(stage: string): boolean {
  return !["metadata", "deferred"].includes(stage);
}

export function findIntakeManifestOrThrow(datasetKey: string): RawDatasetIntakeManifest {
  const manifest = FIRST_WAVE_INTAKE_MANIFESTS.find((candidate) => candidate.datasetKey === datasetKey);
  if (!manifest) {
    throw new Error(`Unknown intake datasetKey: ${datasetKey}`);
  }

  return manifest;
}

export function listFirstWaveManifestKeys(): string[] {
  return FIRST_WAVE_INTAKE_MANIFESTS.map((manifest) => manifest.datasetKey);
}

export function readWorkbookSheetNames(filePath: string): string[] {
  const cached = workbookSheetCache.get(filePath);
  if (cached) {
    return cached;
  }

  const workbook = XLSX.readFile(filePath, {
    cellDates: false,
    dense: false
  });
  workbookSheetCache.set(filePath, workbook.SheetNames);
  return workbook.SheetNames;
}

export function isWorkbookPath(filePath: string): boolean {
  const extension = path.extname(filePath).toLowerCase();
  return extension === ".xlsx" || extension === ".xls";
}
