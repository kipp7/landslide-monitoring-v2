import { createHash } from "node:crypto";
import { copyFile, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const SOURCE_ARTIFACT =
  ".tmp/regional-model-library/out/artifacts/baijiabao-displacement-v28-layer-tail-guarded-calibration-production/baijiabao-displacement-v30-v28-layer-tail-guarded-calibration.prediction-regression-v1.json";
const SOURCE_REPORT =
  ".tmp/regional-model-library/out/artifacts/baijiabao-displacement-v28-layer-tail-guarded-calibration-production/baijiabao-displacement-state-protected-production.report.json";
const OUT_ROOT = "artifacts/models/regional-experts/phase1-displacement-forecast";
const V30_FILE = "baijiabao-displacement-v30.prediction-regression-v1.json";
const V28_FILE = "baijiabao-displacement-v28.prediction-regression-v1.json";
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

function assertV30Artifact(artifact, sourceReport) {
  if (artifact.artifactType !== "calibrated_prediction_regression_v1") {
    throw new Error(`Unexpected artifact type: ${artifact.artifactType}`);
  }
  if (artifact.displayName !== "BJB-DP-ENS-V28-LAYER-TAIL-GUARDED-CAL-v30") {
    throw new Error(`Unexpected displayName: ${artifact.displayName}`);
  }
  if (
    artifact.modelKey !==
    "baijiabao.displacement.pointwise-fixed-expert-ensemble-v28-layer-tail-guarded-calibration-v30"
  ) {
    throw new Error(`Unexpected modelKey: ${artifact.modelKey}`);
  }
  const correction = artifact.model?.calibration?.residualCorrection;
  if (!correction?.preserveSign || correction.preserveThresholdAbs !== 1.3) {
    throw new Error("v30 artifact must preserve sign and 1.3mm threshold state.");
  }
  if (sourceReport.finalCorrectionScope !== "calibration") {
    throw new Error(`v30 must be promoted from calibration-scope correction; got ${sourceReport.finalCorrectionScope}`);
  }
  if (!sourceReport.finalArtifactVerification?.passProductionGuard) {
    throw new Error("v30 final artifact verification does not allow production promotion.");
  }
}

async function copyIfExists(source, dest) {
  try {
    await copyFile(source, dest);
  } catch {
    // Historical files may not exist in older workspaces.
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
  const outArtifactPath = path.join(OUT_ROOT, V30_FILE);
  const registryPath = path.join(OUT_ROOT, "registry.json");
  const backupRoot = path.join(OUT_ROOT, "backups", `pre-v30-${stamp}`);
  const sourceArtifact = await readJson(SOURCE_ARTIFACT);
  const sourceReport = await readJson(SOURCE_REPORT);
  assertV30Artifact(sourceArtifact, sourceReport);

  await mkdir(OUT_ROOT, { recursive: true });
  await mkdir(backupRoot, { recursive: true });

  await copyFile(SOURCE_ARTIFACT, outArtifactPath);
  await copyFile(SOURCE_REPORT, path.join(backupRoot, "baijiabao-displacement-v30-training.report.json"));
  await copyFile(SOURCE_ARTIFACT, path.join(backupRoot, V30_FILE));
  for (const fileName of [
    "registry.json",
    V28_FILE,
    V23_FILE,
    V22_FILE,
    V21_FILE,
    V14_FILE,
    "promote-baijiabao-displacement-v28-production.report.json",
    "baijiabao-displacement-v28-production-backup-manifest.json",
    "promote-baijiabao-displacement-v23-production.report.json",
    "promote-baijiabao-displacement-v22-production.report.json",
    "promote-baijiabao-displacement-v21-production.report.json"
  ]) {
    const source = path.join(OUT_ROOT, fileName);
    const dest = fileName === "registry.json" ? path.join(backupRoot, "registry.pre-v30.json") : path.join(backupRoot, fileName);
    await copyIfExists(source, dest);
  }

  const v30Artifact = await readJson(outArtifactPath);
  const v28Artifact = await readJson(path.join(OUT_ROOT, V28_FILE));
  const v23Artifact = await readJson(path.join(OUT_ROOT, V23_FILE));
  const v22Artifact = await readJson(path.join(OUT_ROOT, V22_FILE));
  const v21Artifact = await readJson(path.join(OUT_ROOT, V21_FILE));
  const v14Artifact = await readJson(path.join(OUT_ROOT, V14_FILE));
  const registry = {
    generatedAt: promotedAt,
    activeModelKey: v30Artifact.modelKey,
    activeModelVersion: v30Artifact.modelVersion,
    backupModelKey: v28Artifact.modelKey,
    backupModelVersion: v28Artifact.modelVersion,
    artifacts: [
      registryEntry(v30Artifact, `./${V30_FILE}`, "production-main", true, promotedAt),
      registryEntry(v28Artifact, `./${V28_FILE}`, "backup-previous-main", false, promotedAt),
      registryEntry(v23Artifact, `./${V23_FILE}`, "backup-v23-support-guarded-main", false, promotedAt),
      registryEntry(v22Artifact, `./${V22_FILE}`, "backup-v22-support-calibrated-main", false, promotedAt),
      registryEntry(v21Artifact, `./${V21_FILE}`, "backup-v21-postcalibrated-main", false, promotedAt),
      registryEntry(v14Artifact, `./${V14_FILE}`, "backup-v14-oof-main", false, promotedAt)
    ]
  };
  await writeJson(registryPath, registry);

  const reportPath = path.join(OUT_ROOT, "promote-baijiabao-displacement-v30-production.report.json");
  const report = {
    generatedAt: promotedAt,
    sourceArtifact: SOURCE_ARTIFACT,
    sourceReport: SOURCE_REPORT,
    outRoot: OUT_ROOT,
    activeArtifactPath: outArtifactPath,
    registryPath,
    backupRoot,
    active: {
      modelKey: v30Artifact.modelKey,
      modelVersion: v30Artifact.modelVersion,
      displayName: v30Artifact.displayName,
      validationMetrics: v30Artifact.validationMetrics,
      postCalibration: v30Artifact.metadata?.postCalibration ?? null
    },
    previousMain: {
      modelKey: v28Artifact.modelKey,
      modelVersion: v28Artifact.modelVersion,
      displayName: v28Artifact.displayName,
      validationMetrics: v28Artifact.validationMetrics
    },
    backupChain: [
      {
        role: "backup-previous-main",
        modelKey: v28Artifact.modelKey,
        modelVersion: v28Artifact.modelVersion,
        displayName: v28Artifact.displayName
      },
      {
        role: "backup-v23-support-guarded-main",
        modelKey: v23Artifact.modelKey,
        modelVersion: v23Artifact.modelVersion,
        displayName: v23Artifact.displayName
      },
      {
        role: "backup-v22-support-calibrated-main",
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
    trainingReport: {
      counts: sourceReport.counts,
      baseline: sourceReport.baseline,
      selected: sourceReport.selected,
      finalArtifactVerification: sourceReport.finalArtifactVerification,
      finalCorrectionScope: sourceReport.finalCorrectionScope,
      caveat:
        "v30 is a cautious second-layer state-protected calibration on top of v28. The final correction is fixed from the calibration split, not refit on all validation rows, so dev/final/holdout remain production guards. The improvement is small and should be written as an incremental tail-guarded production hardening, not a new model-family breakthrough."
    },
    rollback: {
      restoreRegistryFrom: path.join(backupRoot, "registry.pre-v30.json"),
      restoreCommand: `Copy-Item -LiteralPath '${path.join(backupRoot, "registry.pre-v30.json")}' -Destination '${registryPath}' -Force`
    }
  };
  await writeJson(reportPath, report);

  const manifestPath = path.join(OUT_ROOT, "baijiabao-displacement-v30-production-backup-manifest.json");
  const backupFiles = await listFilesRecursive(backupRoot);
  const manifest = {
    generatedAt: promotedAt,
    activeModelKey: v30Artifact.modelKey,
    activeModelVersion: v30Artifact.modelVersion,
    backupRoot,
    restoreRegistryFrom: path.join(backupRoot, "registry.pre-v30.json"),
    files: backupFiles
  };
  await writeJson(manifestPath, manifest);

  console.log(`Promoted ${v30Artifact.displayName} as production-main`);
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
