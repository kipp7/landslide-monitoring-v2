import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolveRepoRoot } from "./intake-utils";

type ParsedArgs = {
  profile?: string;
  profilesDir?: string;
  sourceRegionCode?: string;
  outFile?: string;
  minCoverage: number;
  maxClasses: number;
  weightMode: "coverage" | "unit";
};

type JsonRecord = Record<string, unknown>;

type DistributionEntry = {
  className: string;
  coverageRatio: number;
};

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    minCoverage: 0.12,
    maxClasses: 3,
    weightMode: "coverage"
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token) continue;

    switch (token) {
      case "--profile":
        parsed.profile = argv[index + 1];
        index += 1;
        break;
      case "--profiles-dir":
        parsed.profilesDir = argv[index + 1];
        index += 1;
        break;
      case "--source-region-code":
        parsed.sourceRegionCode = argv[index + 1];
        index += 1;
        break;
      case "--out-file":
        parsed.outFile = argv[index + 1];
        index += 1;
        break;
      case "--min-coverage": {
        const value = Number(argv[index + 1]);
        if (Number.isFinite(value) && value >= 0) {
          parsed.minCoverage = value;
        }
        index += 1;
        break;
      }
      case "--max-classes": {
        const value = Number(argv[index + 1]);
        if (Number.isFinite(value) && value > 0) {
          parsed.maxClasses = Math.floor(value);
        }
        index += 1;
        break;
      }
      case "--weight-mode": {
        const value = argv[index + 1];
        if (value === "coverage" || value === "unit") {
          parsed.weightMode = value;
        }
        index += 1;
        break;
      }
      default:
        break;
    }
  }

  return parsed;
}

function asRecord(value: unknown): JsonRecord | null {
  return typeof value === "object" && value !== null ? (value as JsonRecord) : null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function roundTo(value: number, digits = 4): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

async function readJsonFile<T>(filePath: string): Promise<T> {
  const content = await readFile(filePath, "utf-8");
  return JSON.parse(content) as T;
}

function resolveDistributionEntries(landCoverRecord: JsonRecord): DistributionEntry[] {
  const source = Array.isArray(landCoverRecord.classDistribution)
    ? landCoverRecord.classDistribution
    : Array.isArray(landCoverRecord.distribution)
      ? landCoverRecord.distribution
      : [];

  return source
    .map((entry) => {
      const record = asRecord(entry);
      const className = readString(record?.className ?? null);
      const coverageRatio = readFiniteNumber(record?.coverageRatio ?? null);
      if (!className || coverageRatio === null) {
        return null;
      }

      return {
        className,
        coverageRatio: clamp01(coverageRatio)
      };
    })
    .filter((entry): entry is DistributionEntry => entry !== null)
    .sort((left, right) => right.coverageRatio - left.coverageRatio);
}

function resolveDominantClassName(landCoverRecord: JsonRecord, distribution: readonly DistributionEntry[]): string | null {
  const dominantRecord = asRecord(landCoverRecord.dominantClass);
  return (
    readString(dominantRecord?.className ?? null) ??
    readString(landCoverRecord.dominantClassName ?? null) ??
    readString(landCoverRecord.dominantClass ?? null) ??
    distribution[0]?.className ??
    null
  );
}

function buildSelectedEntries(
  distribution: readonly DistributionEntry[],
  dominantClassName: string | null,
  minCoverage: number,
  maxClasses: number
): DistributionEntry[] {
  const selected: DistributionEntry[] = [];
  const seen = new Set<string>();

  const pushEntry = (entry: DistributionEntry | undefined) => {
    if (!entry || seen.has(entry.className)) return;
    selected.push(entry);
    seen.add(entry.className);
  };

  if (dominantClassName) {
    pushEntry(distribution.find((entry) => entry.className === dominantClassName));
  }

  for (const entry of distribution) {
    if (selected.length >= maxClasses) {
      break;
    }
    if (entry.coverageRatio < minCoverage && seen.size > 0) {
      continue;
    }
    pushEntry(entry);
  }

  return selected.slice(0, maxClasses);
}

function resolveProfilePath(repoRoot: string, parsed: ParsedArgs): string {
  if (parsed.profile) {
    return path.resolve(repoRoot, parsed.profile);
  }

  if (!parsed.sourceRegionCode) {
    throw new Error("Provide --profile or --source-region-code.");
  }

  const profilesDir = path.resolve(
    repoRoot,
    parsed.profilesDir ?? ".tmp/regional-model-library/raw/CLCD-1985-2025/extracts/region-profiles"
  );
  return path.join(profilesDir, `${parsed.sourceRegionCode}.region-profile.json`);
}

function resolveDefaultOutFile(repoRoot: string, profilePath: string): string {
  const profileName = path.basename(profilePath).replace(/\.region-profile\.json$/u, "");
  return path.resolve(
    repoRoot,
    ".tmp/regional-model-library/out/artifact-metadata",
    `${profileName}.land-cover-affinity.json`
  );
}

async function main(): Promise<void> {
  const repoRoot = resolveRepoRoot(__dirname);
  const parsed = parseArgs(process.argv.slice(2));
  const profilePath = resolveProfilePath(repoRoot, parsed);
  const outFile = path.resolve(repoRoot, parsed.outFile ?? resolveDefaultOutFile(repoRoot, profilePath));
  const profile = await readJsonFile<JsonRecord>(profilePath);
  const properties = asRecord(profile.properties);
  const staticFactors = asRecord(properties?.staticFactors);
  const landCover = asRecord(staticFactors?.landCover);

  if (!landCover) {
    throw new Error(`Region profile does not contain properties.staticFactors.landCover: ${profilePath}`);
  }

  const distribution = resolveDistributionEntries(landCover);
  const dominantClassName = resolveDominantClassName(landCover, distribution);
  const selectedEntries = buildSelectedEntries(
    distribution,
    dominantClassName,
    parsed.minCoverage,
    parsed.maxClasses
  );

  if (selectedEntries.length === 0) {
    throw new Error(`No land-cover classes passed selection rules: ${profilePath}`);
  }

  const dominantCoverage =
    selectedEntries.find((entry) => entry.className === dominantClassName)?.coverageRatio ??
    selectedEntries[0]?.coverageRatio ??
    1;

  const metadata = {
    landCoverAffinity: {
      dominantClass: dominantClassName,
      preferredClasses: selectedEntries.map((entry) => entry.className),
      classWeights: Object.fromEntries(
        selectedEntries.map((entry) => [
          entry.className,
          parsed.weightMode === "unit"
            ? 1
            : roundTo(entry.coverageRatio / Math.max(dominantCoverage, 0.0001))
        ])
      ),
      sourceProfile: {
        profileKey: readString(profile.profileKey),
        profileVersion: readString(profile.profileVersion),
        regionCode:
          readString(asRecord(profile.identity)?.regionCode ?? null) ?? parsed.sourceRegionCode ?? null,
        datasetKeys: Array.isArray(profile.sourceDatasets)
          ? profile.sourceDatasets.filter((entry): entry is string => typeof entry === "string")
          : []
      }
    }
  };

  await mkdir(path.dirname(outFile), { recursive: true });
  await writeFile(outFile, JSON.stringify(metadata, null, 2), "utf-8");

  console.log(
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        profilePath,
        outFile,
        dominantClass: dominantClassName,
        selectedClasses: selectedEntries,
        weightMode: parsed.weightMode
      },
      null,
      2
    )
  );
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exitCode = 1;
});
