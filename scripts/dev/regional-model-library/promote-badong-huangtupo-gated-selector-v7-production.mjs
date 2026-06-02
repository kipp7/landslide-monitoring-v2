import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const REGISTRY_ROOT = "artifacts/models/regional-experts/phase1-displacement-forecast";
const SOURCE_ROOT = ".tmp/regional-model-library/out/artifacts/badong-huangtupo-gated-selector-v7";
const SOURCE_ARTIFACT = path.join(SOURCE_ROOT, "badong-huangtupo-displacement-v7.gated-selector.prediction-regression-v1.json");
const SOURCE_REPORT = path.join(SOURCE_ROOT, "badong-huangtupo-gated-selector-v7.report.json");
const SOURCE_PREDICTIONS = path.join(SOURCE_ROOT, "badong-huangtupo-gated-selector-v7.validation-predictions.csv");
const ARTIFACT_FILE = "badong-huangtupo-displacement-v7.gated-selector.prediction-regression-v1.json";
const TRAINING_REPORT_FILE = "badong-huangtupo-gated-selector-v7.report.json";
const VALIDATION_PREDICTIONS_FILE = "badong-huangtupo-gated-selector-v7.validation-predictions.csv";
const MODEL_KEY = "badong-huangtupo.displacement.hgb-point-gated-v5-selector-v7";

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

async function copyIfExists(source, target) {
  try {
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(source, target);
    return {
      source,
      target,
      sha256: await sha256(target)
    };
  } catch {
    return null;
  }
}

function isBadongArtifact(entry) {
  return typeof entry?.modelKey === "string" && entry.modelKey.startsWith("badong-huangtupo.");
}

function normalizeBadongBackupEntry(entry) {
  if (!isBadongArtifact(entry)) return entry;
  return {
    ...entry,
    metadata: {
      ...(entry.metadata ?? {}),
      activeProduction: false,
      registryRole:
        entry.modelKey === "badong-huangtupo.displacement.hgb-context-enriched-support-guarded-v5"
          ? "badong-context-enriched-challenger"
          : "backup-previous-badong-main"
    }
  };
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
      registryRole: "badong-production-main",
      activeProduction: true,
      promotedAt: generatedAt
    }
  };
}

async function main() {
  const generatedAt = new Date().toISOString();
  const artifact = await readJson(SOURCE_ARTIFACT);
  const trainReport = await readJson(SOURCE_REPORT);
  if (artifact.modelKey !== MODEL_KEY) {
    throw new Error(`Unexpected source artifact modelKey: ${String(artifact.modelKey)}`);
  }
  if (trainReport.promoteAllowed !== true) {
    throw new Error("Badong v7 training report does not allow promotion.");
  }

  const registryPath = path.join(REGISTRY_ROOT, "registry.json");
  const registry = await readJson(registryPath);
  const backupRoot = path.join(REGISTRY_ROOT, "backups", `pre-badong-v7-${generatedAt.replace(/[:.]/gu, "-")}`);
  const backupFiles = [];
  const registryBackup = await copyIfExists(registryPath, path.join(backupRoot, "registry.json"));
  if (registryBackup) backupFiles.push(registryBackup);

  for (const entry of registry.artifacts ?? []) {
    if (!isBadongArtifact(entry)) continue;
    const artifactUri = typeof entry.artifactUri === "string" ? entry.artifactUri.replace(/^\.\//u, "") : null;
    if (!artifactUri) continue;
    const backup = await copyIfExists(path.join(REGISTRY_ROOT, artifactUri), path.join(backupRoot, path.basename(artifactUri)));
    if (backup) backupFiles.push(backup);
  }

  const targetArtifactPath = path.join(REGISTRY_ROOT, ARTIFACT_FILE);
  await copyIfExists(SOURCE_ARTIFACT, targetArtifactPath);
  await copyIfExists(SOURCE_REPORT, path.join(REGISTRY_ROOT, TRAINING_REPORT_FILE));
  await copyIfExists(SOURCE_PREDICTIONS, path.join(REGISTRY_ROOT, VALIDATION_PREDICTIONS_FILE));

  const entry = buildRegistryEntry(artifact, generatedAt);
  const previousEntries = Array.isArray(registry.artifacts)
    ? registry.artifacts
        .filter((candidate) => candidate.modelKey !== MODEL_KEY)
        .map(normalizeBadongBackupEntry)
    : [];
  const firstBadongIndex = previousEntries.findIndex(isBadongArtifact);
  if (firstBadongIndex >= 0) {
    previousEntries.splice(firstBadongIndex, 0, entry);
  } else {
    previousEntries.push(entry);
  }
  registry.generatedAt = generatedAt;
  registry.artifacts = previousEntries;
  await writeJson(registryPath, registry);

  const manifestPath = path.join(REGISTRY_ROOT, "badong-huangtupo-displacement-v7-production-backup-manifest.json");
  const manifest = {
    generatedAt,
    modelKey: artifact.modelKey,
    modelVersion: artifact.modelVersion,
    backupRoot,
    backupFiles,
    promotedArtifact: {
      path: targetArtifactPath,
      sha256: await sha256(targetArtifactPath)
    },
    trainingReport: {
      path: path.join(REGISTRY_ROOT, TRAINING_REPORT_FILE),
      sha256: await sha256(path.join(REGISTRY_ROOT, TRAINING_REPORT_FILE))
    },
    registry: {
      path: registryPath,
      sha256: await sha256(registryPath)
    },
    activeProductionModelUnchanged: registry.activeModelKey,
    badongRegistryRole: "badong-production-main"
  };
  await writeJson(manifestPath, manifest);

  const promotionReportPath = path.join(REGISTRY_ROOT, "promote-badong-huangtupo-gated-selector-v7-production.report.json");
  const promotionReport = {
    generatedAt,
    modelKey: artifact.modelKey,
    modelVersion: artifact.modelVersion,
    artifactPath: targetArtifactPath,
    registryPath,
    sourceArtifact: SOURCE_ARTIFACT,
    sourceReport: SOURCE_REPORT,
    activeProductionModelUnchanged: registry.activeModelKey,
    validationMetrics: artifact.validationMetrics,
    deltaVsV4: artifact.metadata?.deltaVsV4 ?? null,
    selectedKeys: artifact.metadata?.supportGuard?.selectedKeys ?? null,
    backupManifest: manifestPath,
    conclusion:
      "Badong-Huangtupo v7 is promoted as regional production-main because dev-gated v4/v5 selection improves MAE, RMSE, R2, and direction accuracy while preserving Within-1mm and P90 tail metrics."
  };
  await writeJson(promotionReportPath, promotionReport);

  console.log(`Promoted ${artifact.modelKey}@${artifact.modelVersion}`);
  console.log(`Artifact: ${targetArtifactPath}`);
  console.log(`Backup manifest: ${manifestPath}`);
  console.log(`Report: ${promotionReportPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
