import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

const REGISTRY_ROOT = "artifacts/models/regional-experts/phase1-displacement-forecast";
const SOURCE_ARTIFACT =
  ".tmp/regional-model-library/out/artifacts/badong-huangtupo-hgb-support-guarded-production-v4/badong-huangtupo-displacement-v4.hgb-support-guarded.prediction-regression-v1.json";
const SOURCE_REPORT =
  ".tmp/regional-model-library/out/artifacts/badong-huangtupo-hgb-support-guarded-production-v4/badong-huangtupo-hgb-support-guarded-production-v4.report.json";
const ARTIFACT_FILE = "badong-huangtupo-displacement-v4.hgb-support-guarded.prediction-regression-v1.json";
const MODEL_KEY = "badong-huangtupo.displacement.hgb-windowed-multisensor-support-guarded-v4";

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf-8"));
}

async function writeJson(filePath, payload) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
}

async function sha256(filePath) {
  const data = await readFile(filePath);
  return createHash("sha256").update(data).digest("hex");
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
  const metadata = {
    ...(entry.metadata ?? {}),
    activeProduction: false
  };
  if (entry.modelKey === "badong-huangtupo.displacement.hgb-windowed-multisensor-v2") {
    metadata.registryRole = "backup-previous-badong-main";
  } else if (entry.modelKey === "badong-huangtupo.displacement.zero-delta-region-baseline-v1") {
    metadata.registryRole = "backup-badong-zero-baseline";
  } else {
    metadata.registryRole = metadata.registryRole ?? "backup-badong-artifact";
  }
  return {
    ...entry,
    metadata
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
  if (artifact.modelKey !== MODEL_KEY) {
    throw new Error(`Unexpected source artifact modelKey: ${String(artifact.modelKey)}`);
  }
  const trainReport = await readJson(SOURCE_REPORT);
  if (trainReport.promoteAllowed !== true) {
    throw new Error("Badong v4 training report does not allow promotion.");
  }

  const backupRoot = path.join(REGISTRY_ROOT, "backups", `pre-badong-v4-${generatedAt.replace(/[:.]/gu, "-")}`);
  const registryPath = path.join(REGISTRY_ROOT, "registry.json");
  const registry = await readJson(registryPath);
  const backupFiles = [];
  const registryBackup = await copyIfExists(registryPath, path.join(backupRoot, "registry.json"));
  if (registryBackup) backupFiles.push(registryBackup);

  for (const entry of registry.artifacts ?? []) {
    if (!isBadongArtifact(entry)) continue;
    const artifactUri = typeof entry.artifactUri === "string" ? entry.artifactUri.replace(/^\.\//u, "") : null;
    if (!artifactUri) continue;
    const source = path.join(REGISTRY_ROOT, artifactUri);
    const backup = await copyIfExists(source, path.join(backupRoot, path.basename(artifactUri)));
    if (backup) backupFiles.push(backup);
  }

  const targetArtifactPath = path.join(REGISTRY_ROOT, ARTIFACT_FILE);
  await mkdir(path.dirname(targetArtifactPath), { recursive: true });
  await copyFile(SOURCE_ARTIFACT, targetArtifactPath);

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
    registry: {
      path: registryPath,
      sha256: await sha256(registryPath)
    },
    activeProductionModelUnchanged: registry.activeModelKey,
    badongRegistryRole: "badong-production-main"
  };
  const manifestPath = path.join(REGISTRY_ROOT, "badong-huangtupo-displacement-v4-production-backup-manifest.json");
  await writeJson(manifestPath, manifest);

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
    deltaVsZero: artifact.metadata?.deltaVsZero ?? null,
    backupManifest: manifestPath,
    conclusion:
      "Badong-Huangtupo v4 is promoted as regional production-main. Baijiabao v33 remains the global active production-main in registry.activeModelKey."
  };
  const promotionReportPath = path.join(REGISTRY_ROOT, "promote-badong-huangtupo-displacement-v4-production.report.json");
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
