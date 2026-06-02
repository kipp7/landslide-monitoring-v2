import { createHash } from "node:crypto";
import { copyFile, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const SOURCE_ARTIFACT =
  ".tmp/regional-model-library/out/artifacts/baijiabao-displacement-support-calibrated-production/baijiabao-displacement-v23-support-guarded.prediction-regression-v1.json";
const SOURCE_REPORT =
  ".tmp/regional-model-library/out/artifacts/baijiabao-displacement-support-calibrated-production/baijiabao-displacement-support-calibrated-production.report.json";
const OUT_ROOT = "artifacts/models/regional-experts/phase1-displacement-forecast";
const V23_FILE = "baijiabao-displacement-v23.prediction-regression-v1.json";
const V22_FILE = "baijiabao-displacement-v22.prediction-regression-v1.json";
const V21_FILE = "baijiabao-displacement-v21.prediction-regression-v1.json";
const V14_FILE = "baijiabao-displacement-v14.prediction-regression-v1.json";

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf-8"));
}

async function writeJson(filePath, payload) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
}

function timestampForPath(date = new Date()) {
  return date.toISOString().replace(/[:.]/gu, "-");
}

function registryEntry(artifact, artifactUri, role, active, promotedAt) {
  return {
    modelKey: artifact.modelKey,
    modelVersion: artifact.modelVersion,
    scopeType: artifact.scopeType,
    scopeKey: artifact.scopeKey,
    artifactType: artifact.artifactType,
    artifactUri,
    metadata: {
      ...(artifact.metadata ?? {}),
      registryRole: role,
      activeProduction: active,
      promotedAt
    }
  };
}

function assertV23Artifact(artifact) {
  if (artifact.artifactType !== "calibrated_prediction_regression_v1") {
    throw new Error(`Unexpected artifact type: ${artifact.artifactType}`);
  }
  if (artifact.displayName !== "BJB-DP-ENS-SUPPORT-GUARDED-v23") {
    throw new Error(`Unexpected displayName: ${artifact.displayName}`);
  }
  if (artifact.modelKey !== "baijiabao.displacement.pointwise-fixed-expert-ensemble-support-calibrated-guarded-v23") {
    throw new Error(`Unexpected modelKey: ${artifact.modelKey}`);
  }
  const correction = artifact.model?.calibration?.residualCorrection;
  if (!correction || correction.dimensions?.join("+") !== "point+month+displacementTrend") {
    throw new Error(`Unexpected correction dimensions: ${correction?.dimensions?.join("+")}`);
  }
  const holdoutDelta = artifact.metadata?.postCalibration?.holdoutDelta ?? {};
  for (const key of ["mae", "rmse"]) {
    if (!(holdoutDelta[key] < 0)) {
      throw new Error(`Guarded v23 must improve holdout ${key}; got ${holdoutDelta[key]}`);
    }
  }
  for (const key of ["r2", "directionAccuracy", "within1mm", "thresholdAgreement"]) {
    if (!(holdoutDelta[key] >= 0)) {
      throw new Error(`Guarded v23 must not regress holdout ${key}; got ${holdoutDelta[key]}`);
    }
  }
}

async function copyIfExists(source, dest) {
  try {
    await copyFile(source, dest);
  } catch {
    // Older workspaces may not have every historical artifact.
  }
}

async function sha256File(filePath) {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

async function listFilesRecursive(root, base = root) {
  const entries = await readdir(root, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFilesRecursive(fullPath, base)));
    } else if (entry.isFile()) {
      const fileStat = await stat(fullPath);
      files.push({
        path: path.relative(base, fullPath).replace(/\\/gu, "/"),
        sizeBytes: fileStat.size,
        sha256: await sha256File(fullPath)
      });
    }
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

async function main() {
  const generatedAt = new Date();
  const promotedAt = generatedAt.toISOString();
  const stamp = timestampForPath(generatedAt);
  const outArtifactPath = path.join(OUT_ROOT, V23_FILE);
  const registryPath = path.join(OUT_ROOT, "registry.json");
  const backupRoot = path.join(OUT_ROOT, "backups", `pre-v23-${stamp}`);
  const sourceArtifact = await readJson(SOURCE_ARTIFACT);
  const sourceReport = await readJson(SOURCE_REPORT);
  assertV23Artifact(sourceArtifact);

  await mkdir(OUT_ROOT, { recursive: true });
  await mkdir(backupRoot, { recursive: true });

  await copyFile(SOURCE_ARTIFACT, outArtifactPath);
  await copyFile(SOURCE_REPORT, path.join(backupRoot, "baijiabao-displacement-support-calibrated-production.report.json"));
  await copyFile(SOURCE_ARTIFACT, path.join(backupRoot, V23_FILE));
  for (const fileName of [
    "registry.json",
    V22_FILE,
    V21_FILE,
    V14_FILE,
    "promote-baijiabao-displacement-v22-production.report.json",
    "promote-baijiabao-displacement-v21-production.report.json"
  ]) {
    const source = path.join(OUT_ROOT, fileName);
    const dest = fileName === "registry.json" ? path.join(backupRoot, "registry.pre-v23.json") : path.join(backupRoot, fileName);
    await copyIfExists(source, dest);
  }

  const v23Artifact = await readJson(outArtifactPath);
  const v22Artifact = await readJson(path.join(OUT_ROOT, V22_FILE));
  const v21Artifact = await readJson(path.join(OUT_ROOT, V21_FILE));
  const v14Artifact = await readJson(path.join(OUT_ROOT, V14_FILE));
  const registry = {
    generatedAt: promotedAt,
    activeModelKey: v23Artifact.modelKey,
    activeModelVersion: v23Artifact.modelVersion,
    backupModelKey: v22Artifact.modelKey,
    backupModelVersion: v22Artifact.modelVersion,
    artifacts: [
      registryEntry(v23Artifact, `./${V23_FILE}`, "production-main", true, promotedAt),
      registryEntry(v22Artifact, `./${V22_FILE}`, "backup-previous-main", false, promotedAt),
      registryEntry(v21Artifact, `./${V21_FILE}`, "backup-v21-postcalibrated-main", false, promotedAt),
      registryEntry(v14Artifact, `./${V14_FILE}`, "backup-v14-oof-main", false, promotedAt)
    ]
  };
  await writeJson(registryPath, registry);

  const reportPath = path.join(OUT_ROOT, "promote-baijiabao-displacement-v23-production.report.json");
  const report = {
    generatedAt: promotedAt,
    sourceArtifact: SOURCE_ARTIFACT,
    sourceReport: SOURCE_REPORT,
    outRoot: OUT_ROOT,
    activeArtifactPath: outArtifactPath,
    registryPath,
    backupRoot,
    active: {
      modelKey: v23Artifact.modelKey,
      modelVersion: v23Artifact.modelVersion,
      displayName: v23Artifact.displayName,
      validationMetrics: v23Artifact.validationMetrics,
      postCalibration: v23Artifact.metadata?.postCalibration ?? null
    },
    previousMain: {
      modelKey: v22Artifact.modelKey,
      modelVersion: v22Artifact.modelVersion,
      displayName: v22Artifact.displayName,
      validationMetrics: v22Artifact.validationMetrics
    },
    backupChain: [
      {
        role: "backup-previous-main",
        modelKey: v22Artifact.modelKey,
        modelVersion: v22Artifact.modelVersion,
        displayName: v22Artifact.displayName
      },
      {
        role: "backup-v21-postcalibrated-main",
        modelKey: v21Artifact.modelKey,
        modelVersion: v21Artifact.modelVersion,
        displayName: v21Artifact.displayName
      },
      {
        role: "backup-v14-oof-main",
        modelKey: v14Artifact.modelKey,
        modelVersion: v14Artifact.modelVersion,
        displayName: v14Artifact.displayName
      }
    ],
    supportSetReport: {
      counts: sourceReport.counts,
      baselineHoldout: sourceReport.baseline?.holdout ?? null,
      selectedV22Holdout: sourceReport.selected?.holdout ?? null,
      selectedV22HoldoutDelta: sourceReport.selected?.holdoutDelta ?? null,
      guardedV23Holdout: v23Artifact.validationMetrics,
      guardedV23HoldoutDelta: v23Artifact.metadata?.postCalibration?.holdoutDelta ?? null
    },
    rollback: {
      restoreRegistryFrom: path.join(backupRoot, "registry.pre-v23.json"),
      restoreCommand: `Copy-Item -LiteralPath '${path.join(backupRoot, "registry.pre-v23.json")}' -Destination '${registryPath}' -Force`
    }
  };
  await writeJson(reportPath, report);

  const manifestPath = path.join(OUT_ROOT, "baijiabao-displacement-v23-production-backup-manifest.json");
  const backupFiles = await listFilesRecursive(backupRoot);
  const manifest = {
    generatedAt: promotedAt,
    activeModelKey: v23Artifact.modelKey,
    activeModelVersion: v23Artifact.modelVersion,
    backupRoot,
    restoreRegistryFrom: path.join(backupRoot, "registry.pre-v23.json"),
    files: backupFiles
  };
  await writeJson(manifestPath, manifest);

  console.log(`Promoted ${v23Artifact.displayName} as production-main`);
  console.log(`Registry: ${registryPath}`);
  console.log(`Artifact: ${outArtifactPath}`);
  console.log(`Backup: ${backupRoot}`);
  console.log(`Report: ${reportPath}`);
  console.log(`Backup manifest: ${manifestPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
