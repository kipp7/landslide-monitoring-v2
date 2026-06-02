import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const MODEL_PATH = ".tmp/regional-model-library/out/artifacts/baijiabao-displacement-prediction-card/baijiabao-displacement-prediction-model.json";
const REPORT_PATH = ".tmp/regional-model-library/out/artifacts/baijiabao-displacement-prediction-card/baijiabao-displacement-prediction-card.report.json";
const OUT_ROOT = "artifacts/models/regional-experts/phase1-displacement-forecast";
const ARTIFACT_FILE = "baijiabao-displacement-v14.prediction-regression-v1.json";

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf-8"));
}

async function writeJson(filePath, payload) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
}

function requireBestV14(model) {
  if (model.artifactType !== "calibrated_prediction_regression_v1") {
    throw new Error(`Unexpected displacement artifact type: ${model.artifactType}`);
  }
  if (model.displayName !== "BJB-DP-ENS-OOF-REFINED-SOFT-REGIME-v14") {
    throw new Error(`Unexpected displacement model displayName: ${model.displayName}`);
  }
}

function buildRuntimeArtifact(model, report) {
  requireBestV14(model);
  const requiredFeatureKeys = Array.isArray(model.model?.featureKeys) ? model.model.featureKeys : [];
  if (requiredFeatureKeys.length === 0) {
    throw new Error("The v14 displacement model does not declare runtime feature keys.");
  }

  return {
    schemaVersion: "prediction-regression-model.v1",
    modelKey: model.modelKey,
    modelVersion: model.modelVersion,
    displayName: model.displayName,
    scopeType: model.scopeType,
    scopeKey: model.scopeKey,
    artifactType: "calibrated_prediction_regression_v1",
    featureSchemaVersion: "runtime-feature-vector.v1",
    labelSchemaVersion: "displacement-regression-label.v1",
    profileVersion: "phase1-profile.v1",
    trainingDatasetKeys: [model.sourceDataset],
    createdAt: report.generatedAt,
    entrypoint: "prediction-regression-v1",
    labelKey: model.targetLabelKey,
    requiredFeatureKeys,
    targetUnit: "mm",
    horizonSpec: model.horizonSpec,
    trainingSummary: {
      sampleCount: model.trainingSummary?.trainSamples ?? 0,
      validationSampleCount: model.trainingSummary?.validationSamples ?? 0,
      fallbackCount: report.best?.validation?.fallbackCount ?? 0
    },
    model: model.model,
    validationMetrics: model.validationMetrics,
    metadata: {
      operationalRole: "forecast",
      displayName: model.displayName,
      targetDescription: model.targetDescription,
      sourceDataset: model.sourceDataset,
      modelFamily: model.modelFamily,
      featureFamily: model.featureFamily,
      selectionProfile: model.selectionProfile,
      routing: {
        operationalRole: "forecast",
        outputType: "displacement-forecast",
        primaryWarningArtifact: false
      },
      matcher: {
        operationalRole: "forecast",
        scopeAliases: {
          station: ["Baijiabao", "BJB", "白家包", "白家堡"]
        }
      },
      validationSummary: {
        mae: model.validationMetrics?.mae,
        rmse: model.validationMetrics?.rmse,
        r2: model.validationMetrics?.r2,
        withinToleranceAccuracy: model.validationMetrics?.withinToleranceAccuracy,
        thresholdAgreementAccuracy: model.validationMetrics?.thresholdAgreementAccuracy,
        p90AbsError: model.validationMetrics?.p90AbsError
      }
    }
  };
}

async function main() {
  const model = await readJson(MODEL_PATH);
  const report = await readJson(REPORT_PATH);
  const runtimeArtifact = buildRuntimeArtifact(model, report);
  const artifactPath = path.join(OUT_ROOT, ARTIFACT_FILE);
  const registryPath = path.join(OUT_ROOT, "registry.json");
  const reportPath = path.join(OUT_ROOT, "register-baijiabao-displacement-runtime-artifact.report.json");

  await writeJson(artifactPath, runtimeArtifact);
  await writeJson(registryPath, {
    artifacts: [
      {
        modelKey: runtimeArtifact.modelKey,
        modelVersion: runtimeArtifact.modelVersion,
        scopeType: runtimeArtifact.scopeType,
        scopeKey: runtimeArtifact.scopeKey,
        artifactType: runtimeArtifact.artifactType,
        artifactUri: `./${ARTIFACT_FILE}`,
        metadata: runtimeArtifact.metadata
      }
    ]
  });
  await writeJson(reportPath, {
    generatedAt: new Date().toISOString(),
    outRoot: OUT_ROOT,
    artifactPath,
    registryPath,
    modelKey: runtimeArtifact.modelKey,
    modelVersion: runtimeArtifact.modelVersion,
    requiredFeatureKeys: runtimeArtifact.requiredFeatureKeys,
    validationMetrics: runtimeArtifact.validationMetrics
  });

  console.log(`Registered ${runtimeArtifact.modelKey}@${runtimeArtifact.modelVersion}`);
  console.log(`Registry: ${registryPath}`);
  console.log(`Artifact: ${artifactPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
