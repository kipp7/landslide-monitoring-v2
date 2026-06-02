import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const DEFAULT_BALANCED_REGISTRY =
  ".tmp/regional-model-library/out/artifacts/baijiabao-monitoring-challenger-grid/best-balanced-accuracy.registry.json";
const DEFAULT_CONFIRMATION_REGISTRY =
  ".tmp/regional-model-library/out/artifacts/baijiabao-monitoring-challenger-grid/best-eligible.registry.json";
const DEFAULT_OUT_DIR = ".tmp/regional-model-library/out/artifacts/baijiabao-dual-runtime-registry";

function parseArgs(argv) {
  const parsed = {
    balancedRegistry: DEFAULT_BALANCED_REGISTRY,
    confirmationRegistry: DEFAULT_CONFIRMATION_REGISTRY,
    outDir: DEFAULT_OUT_DIR
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--balanced-registry") parsed.balancedRegistry = argv[++index] ?? parsed.balancedRegistry;
    if (token === "--confirmation-registry") parsed.confirmationRegistry = argv[++index] ?? parsed.confirmationRegistry;
    if (token === "--out-dir") parsed.outDir = argv[++index] ?? parsed.outDir;
  }
  return parsed;
}

async function readFirstArtifact(filePath) {
  const parsed = JSON.parse(await readFile(filePath, "utf-8"));
  const artifact = Array.isArray(parsed.artifacts) ? parsed.artifacts[0] : null;
  if (!artifact) throw new Error(`No artifact found in ${filePath}`);
  return artifact;
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

function annotateArtifact(artifact, operationalRole, decisionUse) {
  return {
    ...artifact,
    metadata: {
      ...(artifact.metadata ?? {}),
      operationalRole,
      routing: {
        ...((artifact.metadata && typeof artifact.metadata.routing === "object" && artifact.metadata.routing) || {}),
        operationalRole,
        decisionUse
      }
    }
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = process.cwd();
  const outDir = path.resolve(repoRoot, args.outDir);
  const balanced = annotateArtifact(
    await readFirstArtifact(path.resolve(repoRoot, args.balancedRegistry)),
    "primary-warning",
    "main warning score"
  );
  const confirmation = annotateArtifact(
    await readFirstArtifact(path.resolve(repoRoot, args.confirmationRegistry)),
    "confirmation",
    "low false-positive confirmation score"
  );
  const registry = { artifacts: [balanced, confirmation] };
  const report = {
    generatedAt: new Date().toISOString(),
    outDir,
    registryPath: path.join(outDir, "registry.json"),
    artifacts: registry.artifacts.map((artifact) => ({
      modelKey: artifact.modelKey,
      modelVersion: artifact.modelVersion,
      operationalRole: artifact.metadata?.operationalRole ?? null,
      decisionUse: artifact.metadata?.routing?.decisionUse ?? null,
      requiredFeatureCount: artifact.requiredFeatureKeys?.length ?? null,
      replaySummary: artifact.metadata?.replaySummary ?? null
    }))
  };

  await writeJson(path.join(outDir, "registry.json"), registry);
  await writeJson(path.join(outDir, "build-baijiabao-dual-runtime-registry.report.json"), report);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
