import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const SOURCE_ARTIFACT =
  ".tmp/regional-model-library/out/artifacts/baijiabao-displacement-postcalibration-challengers/baijiabao-displacement-v21-balanced.prediction-regression-v1.json";
const SOURCE_REPORT =
  ".tmp/regional-model-library/out/artifacts/baijiabao-displacement-postcalibration-challengers/baijiabao-displacement-postcalibration-challengers.report.json";
const OUT_ROOT = "artifacts/models/regional-experts/phase1-displacement-forecast";
const V14_FILE = "baijiabao-displacement-v14.prediction-regression-v1.json";
const V21_FILE = "baijiabao-displacement-v21.prediction-regression-v1.json";

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

function assertV21Artifact(artifact) {
  if (artifact.artifactType !== "calibrated_prediction_regression_v1") {
    throw new Error(`Unexpected artifact type: ${artifact.artifactType}`);
  }
  if (artifact.displayName !== "BJB-DP-ENS-POSTCAL-BALANCED-v21") {
    throw new Error(`Unexpected displayName: ${artifact.displayName}`);
  }
  const required = artifact.requiredFeatureKeys;
  if (!Array.isArray(required) || required.length !== 6) {
    throw new Error(`Unexpected required feature key count: ${required?.length}`);
  }
  const correction = artifact.model?.calibration?.residualCorrection;
  if (!correction || !Array.isArray(correction.dimensions)) {
    throw new Error("v21 artifact does not contain residual correction metadata.");
  }
  if (correction.dimensions.join("+") !== "point+displacementTrend") {
    throw new Error(`Unexpected correction dimensions: ${correction.dimensions.join("+")}`);
  }
}

async function main() {
  const generatedAt = new Date();
  const stamp = timestampForPath(generatedAt);
  const outArtifactPath = path.join(OUT_ROOT, V21_FILE);
  const registryPath = path.join(OUT_ROOT, "registry.json");
  const v14Path = path.join(OUT_ROOT, V14_FILE);
  const backupRoot = path.join(OUT_ROOT, "backups", `pre-v21-${stamp}`);
  const sourceArtifact = await readJson(SOURCE_ARTIFACT);
  const sourceReport = await readJson(SOURCE_REPORT);
  assertV21Artifact(sourceArtifact);

  await mkdir(OUT_ROOT, { recursive: true });
  await mkdir(backupRoot, { recursive: true });

  await copyFile(SOURCE_ARTIFACT, outArtifactPath);
  await copyFile(SOURCE_REPORT, path.join(backupRoot, "baijiabao-displacement-postcalibration-challengers.report.json"));
  await copyFile(SOURCE_ARTIFACT, path.join(backupRoot, V21_FILE));
  try {
    await copyFile(v14Path, path.join(backupRoot, V14_FILE));
    await copyFile(registryPath, path.join(backupRoot, "registry.pre-v21.json"));
  } catch {
    // First promotion on a clean workspace may not have previous runtime files.
  }

  const v14Artifact = await readJson(v14Path);
  const v21Artifact = await readJson(outArtifactPath);
  const registry = {
    generatedAt: generatedAt.toISOString(),
    activeModelKey: v21Artifact.modelKey,
    activeModelVersion: v21Artifact.modelVersion,
    backupModelKey: v14Artifact.modelKey,
    backupModelVersion: v14Artifact.modelVersion,
    artifacts: [
      registryEntry(v21Artifact, `./${V21_FILE}`, "production-main", true),
      registryEntry(v14Artifact, `./${V14_FILE}`, "backup-previous-main", false)
    ]
  };
  await writeJson(registryPath, registry);

  const reportPath = path.join(OUT_ROOT, "promote-baijiabao-displacement-v21-production.report.json");
  const report = {
    generatedAt: generatedAt.toISOString(),
    sourceArtifact: SOURCE_ARTIFACT,
    sourceReport: SOURCE_REPORT,
    outRoot: OUT_ROOT,
    activeArtifactPath: outArtifactPath,
    registryPath,
    backupRoot,
    active: {
      modelKey: v21Artifact.modelKey,
      modelVersion: v21Artifact.modelVersion,
      displayName: v21Artifact.displayName,
      validationMetrics: v21Artifact.validationMetrics,
      postCalibration: v21Artifact.metadata?.postCalibration ?? null
    },
    backup: {
      modelKey: v14Artifact.modelKey,
      modelVersion: v14Artifact.modelVersion,
      displayName: v14Artifact.displayName,
      validationMetrics: v14Artifact.validationMetrics
    },
    challengerSummary: {
      baseline: sourceReport.baseline?.validation ?? null,
      balanced: sourceReport.selectedChallengers?.balanced?.validation ?? null,
      balancedDelta: sourceReport.selectedChallengers?.balanced?.validationDelta ?? null
    },
    rollback: {
      restoreRegistryFrom: path.join(backupRoot, "registry.pre-v21.json"),
      restoreArtifactFrom: path.join(backupRoot, V14_FILE),
      restoreCommand: `Copy-Item -LiteralPath '${path.join(backupRoot, "registry.pre-v21.json")}' -Destination '${registryPath}' -Force`
    }
  };
  await writeJson(reportPath, report);

  console.log(`Promoted ${v21Artifact.displayName} as production-main`);
  console.log(`Registry: ${registryPath}`);
  console.log(`Artifact: ${outArtifactPath}`);
  console.log(`Backup: ${backupRoot}`);
  console.log(`Report: ${reportPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
