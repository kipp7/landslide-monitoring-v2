import { createHash } from "node:crypto";
import { copyFile, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const SOURCE_ARTIFACT =
  ".tmp/regional-model-library/out/artifacts/baijiabao-displacement-state-protected-production/baijiabao-displacement-v28-state-protected.prediction-regression-v1.json";
const SOURCE_REPORT =
  ".tmp/regional-model-library/out/artifacts/baijiabao-displacement-state-protected-production/baijiabao-displacement-state-protected-production.report.json";
const OUT_ROOT = "artifacts/models/regional-experts/phase1-displacement-forecast";
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

function assertV28Artifact(artifact, sourceReport) {
  if (artifact.artifactType !== "calibrated_prediction_regression_v1") {
    throw new Error(`Unexpected artifact type: ${artifact.artifactType}`);
  }
  if (artifact.displayName !== "BJB-DP-ENS-STATE-PROTECTED-v28") {
    throw new Error(`Unexpected displayName: ${artifact.displayName}`);
  }
  if (artifact.modelKey !== "baijiabao.displacement.pointwise-fixed-expert-ensemble-state-protected-v28") {
    throw new Error(`Unexpected modelKey: ${artifact.modelKey}`);
  }
  const correction = artifact.model?.calibration?.residualCorrection;
  if (!correction?.preserveSign || correction.preserveThresholdAbs !== 1.3) {
    throw new Error("v28 artifact must preserve sign and 1.3mm threshold state.");
  }
  const selected = sourceReport.selected;
  if (!selected?.passProductionGuard) {
    throw new Error("v28 source report does not allow production promotion.");
  }
  for (const split of ["allDelta", "finalDelta", "holdoutDelta"]) {
    const delta = selected[split] ?? {};
    for (const key of ["mae", "rmse"]) {
      if (!(delta[key] < 0)) throw new Error(`v28 must improve ${split}.${key}; got ${delta[key]}`);
    }
    for (const key of ["r2", "directionAccuracy", "within1mm", "thresholdAgreement"]) {
      if (!(delta[key] >= 0)) throw new Error(`v28 must not regress ${split}.${key}; got ${delta[key]}`);
    }
  }
  const devDelta = selected.devDelta ?? {};
  for (const key of ["mae", "rmse"]) {
    if (!(devDelta[key] <= 0)) throw new Error(`v28 must not regress devDelta.${key}; got ${devDelta[key]}`);
  }
  for (const key of ["r2", "directionAccuracy", "within1mm", "thresholdAgreement"]) {
    if (!(devDelta[key] >= 0)) throw new Error(`v28 must not regress devDelta.${key}; got ${devDelta[key]}`);
  }
}

async function copyIfExists(source, dest) {
  try {
    await copyFile(source, dest);
  } catch {
    // Older workspaces may not have every historical artifact/report.
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
  const outArtifactPath = path.join(OUT_ROOT, V28_FILE);
  const registryPath = path.join(OUT_ROOT, "registry.json");
  const backupRoot = path.join(OUT_ROOT, "backups", `pre-v28-${stamp}`);
  const sourceArtifact = await readJson(SOURCE_ARTIFACT);
  const sourceReport = await readJson(SOURCE_REPORT);
  assertV28Artifact(sourceArtifact, sourceReport);

  await mkdir(OUT_ROOT, { recursive: true });
  await mkdir(backupRoot, { recursive: true });

  await copyFile(SOURCE_ARTIFACT, outArtifactPath);
  await copyFile(SOURCE_REPORT, path.join(backupRoot, "baijiabao-displacement-state-protected-production.report.json"));
  await copyFile(SOURCE_ARTIFACT, path.join(backupRoot, V28_FILE));
  for (const fileName of [
    "registry.json",
    V23_FILE,
    V22_FILE,
    V21_FILE,
    V14_FILE,
    "promote-baijiabao-displacement-v23-production.report.json",
    "promote-baijiabao-displacement-v22-production.report.json",
    "promote-baijiabao-displacement-v21-production.report.json"
  ]) {
    const source = path.join(OUT_ROOT, fileName);
    const dest = fileName === "registry.json" ? path.join(backupRoot, "registry.pre-v28.json") : path.join(backupRoot, fileName);
    await copyIfExists(source, dest);
  }

  const v28Artifact = await readJson(outArtifactPath);
  const v23Artifact = await readJson(path.join(OUT_ROOT, V23_FILE));
  const v22Artifact = await readJson(path.join(OUT_ROOT, V22_FILE));
  const v21Artifact = await readJson(path.join(OUT_ROOT, V21_FILE));
  const v14Artifact = await readJson(path.join(OUT_ROOT, V14_FILE));
  const registry = {
    generatedAt: promotedAt,
    activeModelKey: v28Artifact.modelKey,
    activeModelVersion: v28Artifact.modelVersion,
    backupModelKey: v23Artifact.modelKey,
    backupModelVersion: v23Artifact.modelVersion,
    artifacts: [
      registryEntry(v28Artifact, `./${V28_FILE}`, "production-main", true, promotedAt),
      registryEntry(v23Artifact, `./${V23_FILE}`, "backup-previous-main", false, promotedAt),
      registryEntry(v22Artifact, `./${V22_FILE}`, "backup-v22-support-calibrated-main", false, promotedAt),
      registryEntry(v21Artifact, `./${V21_FILE}`, "backup-v21-postcalibrated-main", false, promotedAt),
      registryEntry(v14Artifact, `./${V14_FILE}`, "backup-v14-oof-main", false, promotedAt)
    ]
  };
  await writeJson(registryPath, registry);

  const reportPath = path.join(OUT_ROOT, "promote-baijiabao-displacement-v28-production.report.json");
  const report = {
    generatedAt: promotedAt,
    sourceArtifact: SOURCE_ARTIFACT,
    sourceReport: SOURCE_REPORT,
    outRoot: OUT_ROOT,
    activeArtifactPath: outArtifactPath,
    registryPath,
    backupRoot,
    active: {
      modelKey: v28Artifact.modelKey,
      modelVersion: v28Artifact.modelVersion,
      displayName: v28Artifact.displayName,
      validationMetrics: v28Artifact.validationMetrics,
      postCalibration: v28Artifact.metadata?.postCalibration ?? null
    },
    previousMain: {
      modelKey: v23Artifact.modelKey,
      modelVersion: v23Artifact.modelVersion,
      displayName: v23Artifact.displayName,
      validationMetrics: v23Artifact.validationMetrics
    },
    backupChain: [
      {
        role: "backup-previous-main",
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
    stateProtectedReport: {
      counts: sourceReport.counts,
      baseline: sourceReport.baseline,
      selected: sourceReport.selected,
      caveat:
        "v28 improves MAE/RMSE/R2 and preserves Direction/Threshold on all/final/holdout guards while keeping the development holdout non-regressed; P90 absolute error is slightly higher on final and is recorded as a tail-risk caveat."
    },
    rollback: {
      restoreRegistryFrom: path.join(backupRoot, "registry.pre-v28.json"),
      restoreCommand: `Copy-Item -LiteralPath '${path.join(backupRoot, "registry.pre-v28.json")}' -Destination '${registryPath}' -Force`
    }
  };
  await writeJson(reportPath, report);

  const manifestPath = path.join(OUT_ROOT, "baijiabao-displacement-v28-production-backup-manifest.json");
  const backupFiles = await listFilesRecursive(backupRoot);
  const manifest = {
    generatedAt: promotedAt,
    activeModelKey: v28Artifact.modelKey,
    activeModelVersion: v28Artifact.modelVersion,
    backupRoot,
    restoreRegistryFrom: path.join(backupRoot, "registry.pre-v28.json"),
    files: backupFiles
  };
  await writeJson(manifestPath, manifest);

  console.log(`Promoted ${v28Artifact.displayName} as production-main`);
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
