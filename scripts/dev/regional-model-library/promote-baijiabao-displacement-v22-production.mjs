import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const SOURCE_ARTIFACT =
  ".tmp/regional-model-library/out/artifacts/baijiabao-displacement-support-calibrated-production/baijiabao-displacement-v22-support-calibrated.prediction-regression-v1.json";
const SOURCE_REPORT =
  ".tmp/regional-model-library/out/artifacts/baijiabao-displacement-support-calibrated-production/baijiabao-displacement-support-calibrated-production.report.json";
const OUT_ROOT = "artifacts/models/regional-experts/phase1-displacement-forecast";
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

function registryEntry(artifact, artifactUri, role, active) {
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
      promotedAt: new Date().toISOString()
    }
  };
}

function assertV22Artifact(artifact) {
  if (artifact.artifactType !== "calibrated_prediction_regression_v1") {
    throw new Error(`Unexpected artifact type: ${artifact.artifactType}`);
  }
  if (artifact.displayName !== "BJB-DP-ENS-SUPPORT-CAL-v22") {
    throw new Error(`Unexpected displayName: ${artifact.displayName}`);
  }
  const correction = artifact.model?.calibration?.residualCorrection;
  if (!correction || correction.dimensions?.join("+") !== "point+month+displacementTrend") {
    throw new Error(`Unexpected correction dimensions: ${correction?.dimensions?.join("+")}`);
  }
}

async function main() {
  const generatedAt = new Date();
  const stamp = timestampForPath(generatedAt);
  const outArtifactPath = path.join(OUT_ROOT, V22_FILE);
  const registryPath = path.join(OUT_ROOT, "registry.json");
  const backupRoot = path.join(OUT_ROOT, "backups", `pre-v22-${stamp}`);
  const sourceArtifact = await readJson(SOURCE_ARTIFACT);
  const sourceReport = await readJson(SOURCE_REPORT);
  assertV22Artifact(sourceArtifact);

  await mkdir(OUT_ROOT, { recursive: true });
  await mkdir(backupRoot, { recursive: true });

  await copyFile(SOURCE_ARTIFACT, outArtifactPath);
  await copyFile(SOURCE_REPORT, path.join(backupRoot, "baijiabao-displacement-support-calibrated-production.report.json"));
  await copyFile(SOURCE_ARTIFACT, path.join(backupRoot, V22_FILE));
  for (const fileName of ["registry.json", V21_FILE, V14_FILE, "promote-baijiabao-displacement-v21-production.report.json"]) {
    try {
      const source = path.join(OUT_ROOT, fileName);
      const dest = fileName === "registry.json" ? path.join(backupRoot, "registry.pre-v22.json") : path.join(backupRoot, fileName);
      await copyFile(source, dest);
    } catch {
      // Older workspaces may not have every historical artifact.
    }
  }

  const v22Artifact = await readJson(outArtifactPath);
  const v21Artifact = await readJson(path.join(OUT_ROOT, V21_FILE));
  const v14Artifact = await readJson(path.join(OUT_ROOT, V14_FILE));
  const registry = {
    generatedAt: generatedAt.toISOString(),
    activeModelKey: v22Artifact.modelKey,
    activeModelVersion: v22Artifact.modelVersion,
    backupModelKey: v21Artifact.modelKey,
    backupModelVersion: v21Artifact.modelVersion,
    artifacts: [
      registryEntry(v22Artifact, `./${V22_FILE}`, "production-main", true),
      registryEntry(v21Artifact, `./${V21_FILE}`, "backup-previous-main", false),
      registryEntry(v14Artifact, `./${V14_FILE}`, "backup-v14-oof-main", false)
    ]
  };
  await writeJson(registryPath, registry);

  const reportPath = path.join(OUT_ROOT, "promote-baijiabao-displacement-v22-production.report.json");
  const report = {
    generatedAt: generatedAt.toISOString(),
    sourceArtifact: SOURCE_ARTIFACT,
    sourceReport: SOURCE_REPORT,
    outRoot: OUT_ROOT,
    activeArtifactPath: outArtifactPath,
    registryPath,
    backupRoot,
    active: {
      modelKey: v22Artifact.modelKey,
      modelVersion: v22Artifact.modelVersion,
      displayName: v22Artifact.displayName,
      validationMetrics: v22Artifact.validationMetrics,
      postCalibration: v22Artifact.metadata?.postCalibration ?? null
    },
    previousMain: {
      modelKey: v21Artifact.modelKey,
      modelVersion: v21Artifact.modelVersion,
      displayName: v21Artifact.displayName,
      validationMetrics: v21Artifact.validationMetrics
    },
    v14Backup: {
      modelKey: v14Artifact.modelKey,
      modelVersion: v14Artifact.modelVersion,
      displayName: v14Artifact.displayName,
      validationMetrics: v14Artifact.validationMetrics
    },
    supportSetReport: {
      counts: sourceReport.counts,
      baselineHoldout: sourceReport.baseline?.holdout ?? null,
      selectedHoldout: sourceReport.selected?.holdout ?? null,
      selectedHoldoutDelta: sourceReport.selected?.holdoutDelta ?? null
    },
    rollback: {
      restoreRegistryFrom: path.join(backupRoot, "registry.pre-v22.json"),
      restoreCommand: `Copy-Item -LiteralPath '${path.join(backupRoot, "registry.pre-v22.json")}' -Destination '${registryPath}' -Force`
    }
  };
  await writeJson(reportPath, report);

  console.log(`Promoted ${v22Artifact.displayName} as production-main`);
  console.log(`Registry: ${registryPath}`);
  console.log(`Artifact: ${outArtifactPath}`);
  console.log(`Backup: ${backupRoot}`);
  console.log(`Report: ${reportPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
