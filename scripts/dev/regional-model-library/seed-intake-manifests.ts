import path from "node:path";
import { mkdir } from "node:fs/promises";
import { writeJsonFile } from "../../../libs/regional-model-library/src";
import { FIRST_WAVE_INTAKE_MANIFESTS } from "./intake-manifest-templates";

const DEFAULT_OUT_ROOT = ".tmp/regional-model-library/intake-manifests";

type ParsedArgs = {
  outRoot?: string;
};

function resolveRepoRoot(startDir: string): string {
  let current = path.resolve(startDir);

  while (true) {
    if (require("node:fs").existsSync(path.join(current, "package.json"))) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      throw new Error("Cannot resolve repo root for seed-intake-manifests.");
    }
    current = parent;
  }
}

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token) {
      continue;
    }

    if (token === "--out-root") {
      parsed.outRoot = argv[index + 1];
      index += 1;
    }
  }

  return parsed;
}

async function main(): Promise<void> {
  const repoRoot = resolveRepoRoot(__dirname);
  const parsed = parseArgs(process.argv.slice(2));
  const outRoot = path.resolve(repoRoot, parsed.outRoot ?? DEFAULT_OUT_ROOT);
  await mkdir(outRoot, { recursive: true });

  const outputFiles: string[] = [];
  for (const manifest of FIRST_WAVE_INTAKE_MANIFESTS) {
    const fileName = `${manifest.datasetKey}.intake-manifest.json`;
    const filePath = path.join(outRoot, fileName);
    await writeJsonFile(filePath, manifest);
    outputFiles.push(filePath);
  }

  console.log(
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        outRoot,
        manifestCount: FIRST_WAVE_INTAKE_MANIFESTS.length,
        datasetKeys: FIRST_WAVE_INTAKE_MANIFESTS.map((manifest) => manifest.datasetKey),
        outputFiles
      },
      null,
      2
    )
  );
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
