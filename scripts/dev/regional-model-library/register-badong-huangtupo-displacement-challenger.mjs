import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const REGISTRY_ROOT = "artifacts/models/regional-experts/phase1-displacement-forecast";
const BASELINE_REPORT =
  ".tmp/regional-model-library/out/artifacts/badong-huangtupo-core-displacement-baseline/badong-huangtupo-core-displacement-baseline.report.json";
const ARTIFACT_FILE = "badong-huangtupo-displacement-v1.region-baseline.prediction-regression-v1.json";
const MODEL_KEY = "badong-huangtupo.displacement.zero-delta-region-baseline-v1";
const MODEL_VERSION = "0.1.0";

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf-8"));
}

async function writeJson(filePath, payload) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
}

function readBestMetrics(report) {
  const best = Array.isArray(report.leaderboard)
    ? report.leaderboard.find((entry) => entry.modelKey === report.bestModelKey) ?? report.leaderboard[0]
    : null;
  if (!best?.metrics) {
    throw new Error("Badong baseline report does not contain best metrics.");
  }
  return best.metrics;
}

function buildArtifact(report, generatedAt) {
  const metrics = readBestMetrics(report);
  return {
    schemaVersion: "prediction-regression-model.v1",
    modelKey: MODEL_KEY,
    modelVersion: MODEL_VERSION,
    scopeType: "region",
    scopeKey: "CN-HB-BADONG-HUANGTUPO",
    artifactType: "calibrated_prediction_regression_v1",
    featureSchemaVersion: "runtime-feature-vector.v1",
    labelSchemaVersion: "displacement-regression-label.v1",
    profileVersion: "phase1-profile.v1",
    trainingDatasetKeys: ["Badong-Huangtupo-official-open-core"],
    createdAt: generatedAt,
    entrypoint: "prediction-regression-v1",
    labelKey: "displacementLabel",
    requiredFeatureKeys: ["displacementSurfaceMm"],
    targetUnit: "mm",
    horizonSpec: "24h",
    trainingSummary: {
      sampleCount: Number(report.data?.trainCount ?? 0),
      validationSampleCount: Number(report.data?.validationCount ?? 0)
    },
    model: {
      modelType: "calibrated_prediction_regression_v1",
      featureKeys: ["displacementSurfaceMm"],
      baseModel: {
        modelType: "ridge_linear_regression_v1",
        featureKeys: ["displacementSurfaceMm"],
        normalization: {
          displacementSurfaceMm: {
            min: 0,
            span: 1
          }
        },
        intercept: 0,
        weights: {
          displacementSurfaceMm: 0
        }
      },
      calibration: {
        intercept: 0,
        slope: 1,
        residualCorrection: null
      }
    },
    validationMetrics: {
      mae: metrics.mae,
      rmse: metrics.rmse,
      r2: metrics.r2,
      directionAccuracy: metrics.directionAccuracy,
      within1mm: metrics.within1mm,
      p90AbsError: metrics.p90AbsoluteError,
      predictionMean: metrics.predictionMean,
      targetMean: metrics.targetMean
    },
    metadata: {
      operationalRole: "forecast",
      displayName: "BD-HTP-DP-ZERO-DELTA-BASELINE-v1",
      targetDescription: "Future displacement delta in millimeters for the Badong-Huangtupo regional open core pack.",
      sourceDataset: "Badong-Huangtupo official open core monitoring pack",
      modelFamily: "zero-delta-persistence-region-baseline",
      featureFamily: "runtime-displacement-surface-minimal",
      selectionProfile: "best-validation-baseline-from-open-core-sample-factory",
      registryRole: "data-side-challenger",
      activeProduction: false,
      promotedAt: generatedAt,
      routing: {
        operationalRole: "forecast",
        outputType: "displacement-forecast",
        primaryWarningArtifact: false
      },
      matcher: {
        operationalRole: "forecast",
        scopeAliases: {
          region: [
            "CN-HB-BADONG-HUANGTUPO",
            "CN-HB-BADONG",
            "CN-420823",
            "Badong-Huangtupo",
            "Huangtupo",
            "巴东黄土坡",
            "黄土坡"
          ]
        }
      },
      sourceFieldAlignment: {
        sourceMetric: "metricsNormalized.displacementObservedMm",
        runtimeMetric: "displacementSurfaceMm",
        note: "The offline Badong open-core sample factory uses displacementObservedMm; runtime forecast uses the existing software canonical displacementSurfaceMm field."
      },
      scopeBoundary: report.scopeBoundary ?? null,
      baselineCaveat:
        "This is a second-region product-routing baseline, not a precision breakthrough model. It is registered to prove multi-region forecast artifact selection while more monitoring data are added."
    }
  };
}

function buildRegistryEntry(generatedAt) {
  return {
    modelKey: MODEL_KEY,
    modelVersion: MODEL_VERSION,
    scopeType: "region",
    scopeKey: "CN-HB-BADONG-HUANGTUPO",
    artifactType: "calibrated_prediction_regression_v1",
    artifactUri: `./${ARTIFACT_FILE}`,
    metadata: {
      operationalRole: "forecast",
      registryRole: "data-side-challenger",
      activeProduction: false,
      promotedAt: generatedAt,
      matcher: {
        operationalRole: "forecast",
        scopeAliases: {
          region: [
            "CN-HB-BADONG-HUANGTUPO",
            "CN-HB-BADONG",
            "CN-420823",
            "Badong-Huangtupo",
            "Huangtupo",
            "巴东黄土坡",
            "黄土坡"
          ]
        }
      },
      routing: {
        operationalRole: "forecast",
        outputType: "displacement-forecast",
        primaryWarningArtifact: false
      }
    }
  };
}

async function main() {
  const generatedAt = new Date().toISOString();
  const report = await readJson(BASELINE_REPORT);
  const artifact = buildArtifact(report, generatedAt);
  const artifactPath = path.join(REGISTRY_ROOT, ARTIFACT_FILE);
  await writeJson(artifactPath, artifact);

  const registryPath = path.join(REGISTRY_ROOT, "registry.json");
  const registry = await readJson(registryPath);
  const entry = buildRegistryEntry(generatedAt);
  registry.generatedAt = generatedAt;
  registry.artifacts = Array.isArray(registry.artifacts)
    ? [...registry.artifacts.filter((candidate) => candidate.modelKey !== MODEL_KEY), entry]
    : [entry];
  await writeJson(registryPath, registry);

  const promotionReport = {
    generatedAt,
    modelKey: MODEL_KEY,
    modelVersion: MODEL_VERSION,
    artifactPath,
    registryPath,
    sourceReport: BASELINE_REPORT,
    activeProductionModelUnchanged: registry.activeModelKey,
    validationMetrics: artifact.validationMetrics,
    scopeBoundary: artifact.metadata.scopeBoundary,
    caveat: artifact.metadata.baselineCaveat
  };
  const promotionReportPath = path.join(REGISTRY_ROOT, "register-badong-huangtupo-displacement-challenger.report.json");
  await writeJson(promotionReportPath, promotionReport);

  console.log(`Registered ${MODEL_KEY}@${MODEL_VERSION}`);
  console.log(`Artifact: ${artifactPath}`);
  console.log(`Report: ${promotionReportPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
