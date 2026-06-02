import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const REGISTRY_ROOT = "artifacts/models/regional-experts/phase1-displacement-forecast";
const SOURCE_ARTIFACT =
  ".tmp/regional-model-library/out/artifacts/badong-huangtupo-hgb-displacement-challenger/badong-huangtupo-displacement-v2.hgb-windowed-multisensor.prediction-regression-v1.json";
const SOURCE_REPORT =
  ".tmp/regional-model-library/out/artifacts/badong-huangtupo-hgb-displacement-challenger/badong-huangtupo-hgb-displacement-challenger.report.json";
const ARTIFACT_FILE = "badong-huangtupo-displacement-v2.hgb-windowed-multisensor.prediction-regression-v1.json";
const MODEL_KEY = "badong-huangtupo.displacement.hgb-windowed-multisensor-v2";

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf-8"));
}

async function writeJson(filePath, payload) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
}

function buildRegistryEntry(artifact, generatedAt) {
  return {
    modelKey: artifact.modelKey,
    modelVersion: artifact.modelVersion,
    scopeType: artifact.scopeType,
    scopeKey: artifact.scopeKey,
    artifactType: artifact.artifactType,
    artifactUri: `./${ARTIFACT_FILE}`,
    metadata: {
      ...(artifact.metadata ?? {}),
      operationalRole: "forecast",
      registryRole: "data-side-challenger",
      activeProduction: false,
      promotedAt: generatedAt
    }
  };
}

async function main() {
  const generatedAt = new Date().toISOString();
  const artifact = await readJson(SOURCE_ARTIFACT);
  if (artifact.modelKey !== MODEL_KEY) {
    throw new Error(`Unexpected artifact modelKey: ${String(artifact.modelKey)}`);
  }
  const report = await readJson(SOURCE_REPORT);

  const targetArtifactPath = path.join(REGISTRY_ROOT, ARTIFACT_FILE);
  await mkdir(path.dirname(targetArtifactPath), { recursive: true });
  await copyFile(SOURCE_ARTIFACT, targetArtifactPath);

  const registryPath = path.join(REGISTRY_ROOT, "registry.json");
  const registry = await readJson(registryPath);
  const entry = buildRegistryEntry(artifact, generatedAt);
  const previousEntries = Array.isArray(registry.artifacts)
    ? registry.artifacts.filter((candidate) => candidate.modelKey !== MODEL_KEY)
    : [];
  const firstBadongIndex = previousEntries.findIndex((candidate) =>
    typeof candidate.modelKey === "string" && candidate.modelKey.startsWith("badong-huangtupo.")
  );
  if (firstBadongIndex >= 0) {
    previousEntries.splice(firstBadongIndex, 0, entry);
  } else {
    previousEntries.push(entry);
  }

  registry.generatedAt = generatedAt;
  registry.artifacts = previousEntries;
  await writeJson(registryPath, registry);

  const registerReport = {
    generatedAt,
    modelKey: artifact.modelKey,
    modelVersion: artifact.modelVersion,
    artifactPath: targetArtifactPath,
    registryPath,
    sourceArtifact: SOURCE_ARTIFACT,
    sourceReport: SOURCE_REPORT,
    activeProductionModelUnchanged: registry.activeModelKey,
    selectedTrainingModel: report.selectedModelKey,
    validationMetrics: artifact.validationMetrics,
    deltaVsZero: artifact.metadata?.deltaVsZero ?? null,
    caveat:
      "Badong v2 is the preferred Badong regional challenger, not the global production-main. Baijiabao v33 remains active production-main."
  };
  const registerReportPath = path.join(REGISTRY_ROOT, "register-badong-huangtupo-displacement-v2-challenger.report.json");
  await writeJson(registerReportPath, registerReport);

  console.log(`Registered ${artifact.modelKey}@${artifact.modelVersion}`);
  console.log(`Artifact: ${targetArtifactPath}`);
  console.log(`Report: ${registerReportPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
