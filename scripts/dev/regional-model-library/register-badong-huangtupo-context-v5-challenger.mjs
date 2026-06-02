import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

const REGISTRY_ROOT = "artifacts/models/regional-experts/phase1-displacement-forecast";
const SOURCE_ROOT = ".tmp/regional-model-library/out/artifacts/badong-huangtupo-context-enriched-v5";
const SOURCE_ARTIFACT = path.join(SOURCE_ROOT, "badong-huangtupo-displacement-v5.context-enriched.prediction-regression-v1.json");
const SOURCE_REPORT = path.join(SOURCE_ROOT, "badong-huangtupo-context-enriched-v5.report.json");
const ARTIFACT_FILE = "badong-huangtupo-displacement-v5.context-enriched.prediction-regression-v1.json";
const MODEL_KEY = "badong-huangtupo.displacement.hgb-context-enriched-support-guarded-v5";
const BADONG_V4_MODEL_KEY = "badong-huangtupo.displacement.hgb-windowed-multisensor-support-guarded-v4";

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf-8"));
}

async function writeJson(filePath, payload) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
}

async function sha256(filePath) {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

function registryEntry(artifact, report, generatedAt) {
  return {
    modelKey: artifact.modelKey,
    modelVersion: artifact.modelVersion,
    scopeType: artifact.scopeType,
    scopeKey: artifact.scopeKey,
    artifactType: artifact.artifactType,
    artifactUri: `./${ARTIFACT_FILE}`,
    metadata: {
      ...(artifact.metadata ?? {}),
      registryRole: "badong-context-enriched-challenger",
      activeProduction: false,
      registeredAt: generatedAt,
      promotionDecision: report.decision,
      promotionBlockedBy: {
        passesV4Guard: report.best?.passesV4Guard ?? null,
        passesZeroGuard: report.best?.passesZeroGuard ?? null,
        deltaVsV4: report.best?.deltaVsV4 ?? null
      }
    }
  };
}

async function main() {
  const generatedAt = new Date().toISOString();
  const artifact = await readJson(SOURCE_ARTIFACT);
  const report = await readJson(SOURCE_REPORT);
  if (artifact.modelKey !== MODEL_KEY) {
    throw new Error(`Unexpected v5 artifact modelKey: ${String(artifact.modelKey)}`);
  }
  if (report.promoteAllowed === true) {
    throw new Error("This script registers v5 only as a challenger; use a promotion script if it passes production guards.");
  }

  const registryPath = path.join(REGISTRY_ROOT, "registry.json");
  const registry = await readJson(registryPath);
  const backupRoot = path.join(REGISTRY_ROOT, "backups", `pre-badong-v5-challenger-${generatedAt.replace(/[:.]/gu, "-")}`);
  await mkdir(backupRoot, { recursive: true });
  await copyFile(registryPath, path.join(backupRoot, "registry.pre-v5-challenger.json"));
  await copyFile(SOURCE_ARTIFACT, path.join(REGISTRY_ROOT, ARTIFACT_FILE));
  await copyFile(SOURCE_REPORT, path.join(REGISTRY_ROOT, "badong-huangtupo-context-enriched-v5.report.json"));

  const entries = Array.isArray(registry.artifacts)
    ? registry.artifacts.filter((entry) => entry.modelKey !== MODEL_KEY)
    : [];
  const v4Index = entries.findIndex((entry) => entry.modelKey === BADONG_V4_MODEL_KEY);
  const entry = registryEntry(artifact, report, generatedAt);
  if (v4Index >= 0) {
    entries.splice(v4Index + 1, 0, entry);
  } else {
    entries.push(entry);
  }
  registry.generatedAt = generatedAt;
  registry.artifacts = entries;
  await writeJson(registryPath, registry);

  const registrationReport = {
    generatedAt,
    modelKey: artifact.modelKey,
    modelVersion: artifact.modelVersion,
    artifactPath: path.join(REGISTRY_ROOT, ARTIFACT_FILE),
    sourceArtifact: SOURCE_ARTIFACT,
    sourceReport: SOURCE_REPORT,
    registryPath,
    backupRoot,
    activeProductionModelUnchanged: registry.activeModelKey,
    badongProductionMainUnchanged: BADONG_V4_MODEL_KEY,
    decision: report.decision,
    best: report.best,
    artifactSha256: await sha256(path.join(REGISTRY_ROOT, ARTIFACT_FILE)),
    registrySha256: await sha256(registryPath),
    conclusion:
      "Badong v5 context-enriched model improves MAE/RMSE/R2/Direction over v4 but fails full v4 non-regression due Within-1mm and P90 tail regression, so it is registered only as challenger."
  };
  const registrationReportPath = path.join(REGISTRY_ROOT, "register-badong-huangtupo-context-v5-challenger.report.json");
  await writeJson(registrationReportPath, registrationReport);

  console.log(`Registered ${artifact.modelKey}@${artifact.modelVersion} as challenger`);
  console.log(`Decision: ${report.decision}`);
  console.log(`Registry: ${registryPath}`);
  console.log(`Report: ${registrationReportPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
