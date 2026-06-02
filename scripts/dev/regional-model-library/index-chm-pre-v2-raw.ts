import path from "node:path";
import { mkdir, readdir, stat, writeFile } from "node:fs/promises";
import { resolveRepoRoot } from "./intake-utils";

type ParsedArgs = {
  rawRoot?: string;
  outFile?: string;
};

type IndexedFile = {
  relativePath: string;
  format: string;
  family: "daily-netcdf" | "monthly-total" | "annual-total" | "unknown";
  guessedPeriodKey: string | null;
};

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token) continue;

    switch (token) {
      case "--raw-root":
        parsed.rawRoot = argv[index + 1];
        index += 1;
        break;
      case "--out-file":
        parsed.outFile = argv[index + 1];
        index += 1;
        break;
      default:
        break;
    }
  }

  return parsed;
}

async function collectFiles(rootPath: string): Promise<string[]> {
  const entries = await readdir(rootPath, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(rootPath, entry.name);
      if (entry.isDirectory()) {
        return collectFiles(entryPath);
      }

      return [entryPath];
    })
  );

  return nested.flat().sort((left, right) => left.localeCompare(right));
}

function resolveFamily(relativePath: string): IndexedFile["family"] {
  const normalized = relativePath.replace(/\\/gu, "/").toLowerCase();
  if (
    normalized === "daily-netcdf" ||
    normalized.startsWith("daily-netcdf/") ||
    normalized.includes("/daily-netcdf/")
  ) {
    return "daily-netcdf";
  }
  if (
    normalized === "monthly-total" ||
    normalized.startsWith("monthly-total/") ||
    normalized.includes("/monthly-total/")
  ) {
    return "monthly-total";
  }
  if (
    normalized === "annual-total" ||
    normalized.startsWith("annual-total/") ||
    normalized.includes("/annual-total/")
  ) {
    return "annual-total";
  }
  return "unknown";
}

function guessPeriodKey(fileName: string): string | null {
  const dayMatch = fileName.match(/(19|20)\d{2}[01]\d[0-3]\d/u);
  if (dayMatch) {
    return dayMatch[0];
  }

  const monthMatch = fileName.match(/(19|20)\d{2}[01]\d/u);
  if (monthMatch) {
    return monthMatch[0];
  }

  const yearMatch = fileName.match(/(19|20)\d{2}/u);
  return yearMatch ? yearMatch[0] : null;
}

async function main(): Promise<void> {
  const repoRoot = resolveRepoRoot(__dirname);
  const parsed = parseArgs(process.argv.slice(2));
  const rawRoot = path.resolve(
    repoRoot,
    parsed.rawRoot ?? ".tmp/regional-model-library/raw/CHM_PRE-V2/original"
  );
  const outFile = path.resolve(
    repoRoot,
    parsed.outFile ?? ".tmp/regional-model-library/raw/CHM_PRE-V2/raw-index.json"
  );

  try {
    await stat(rawRoot);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      const emptyReport = {
        generatedAt: new Date().toISOString(),
        rawRoot,
        fileCount: 0,
        files: [],
      };
      await mkdir(path.dirname(outFile), { recursive: true });
      await writeFile(outFile, JSON.stringify(emptyReport, null, 2), "utf-8");
      console.log(JSON.stringify(emptyReport, null, 2));
      return;
    }

    throw error;
  }

  const files = await collectFiles(rawRoot);
  const indexedFiles: IndexedFile[] = files
    .filter((filePath) => /\.(nc|tif|tiff|hdf)$/iu.test(filePath))
    .map((filePath) => {
      const relativePath = path.relative(rawRoot, filePath).replace(/\\/gu, "/");
      return {
        relativePath,
        format: path.extname(filePath).slice(1).toLowerCase(),
        family: resolveFamily(relativePath),
        guessedPeriodKey: guessPeriodKey(path.basename(filePath)),
      };
    });

  const report = {
    generatedAt: new Date().toISOString(),
    rawRoot,
    fileCount: indexedFiles.length,
    familyCounts: {
      dailyNetcdf: indexedFiles.filter((entry) => entry.family === "daily-netcdf").length,
      monthlyTotal: indexedFiles.filter((entry) => entry.family === "monthly-total").length,
      annualTotal: indexedFiles.filter((entry) => entry.family === "annual-total").length,
      unknown: indexedFiles.filter((entry) => entry.family === "unknown").length,
    },
    files: indexedFiles,
  };

  await mkdir(path.dirname(outFile), { recursive: true });
  await writeFile(outFile, JSON.stringify(report, null, 2), "utf-8");
  console.log(JSON.stringify(report, null, 2));
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exitCode = 1;
});
