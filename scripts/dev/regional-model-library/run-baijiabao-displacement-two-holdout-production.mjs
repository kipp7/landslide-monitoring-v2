import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const require = createRequire(import.meta.url);
const { runPredictionRegressionArtifact } = require(path.resolve("libs/regional-model-library/dist"));

const BASE_ARTIFACT =
  process.env.BASE_ARTIFACT ??
  "artifacts/models/regional-experts/phase1-displacement-forecast/baijiabao-displacement-v14.prediction-regression-v1.json";
const VALIDATION =
  process.env.VALIDATION_SAMPLES ??
  ".tmp/regional-model-library/out/threegorges-baijiabao/splits/labeled/baijiabao.validation.future-labels.window-features.jsonl";
const OUT_DIR = process.env.OUT_DIR ?? ".tmp/regional-model-library/out/artifacts/baijiabao-displacement-two-holdout-production";
const OUTPUT_ARTIFACT_FILE =
  process.env.OUTPUT_ARTIFACT_FILE ?? "baijiabao-displacement-v24-two-holdout-guarded.prediction-regression-v1.json";
const OUTPUT_MODEL_KEY =
  process.env.OUTPUT_MODEL_KEY ?? "baijiabao.displacement.pointwise-fixed-expert-ensemble-two-holdout-guarded-v24";
const OUTPUT_MODEL_VERSION = process.env.OUTPUT_MODEL_VERSION ?? "0.24.0";
const OUTPUT_DISPLAY_NAME = process.env.OUTPUT_DISPLAY_NAME ?? "BJB-DP-ENS-TWO-HOLDOUT-GUARDED-v24";
const OUTPUT_MODEL_FAMILY = process.env.OUTPUT_MODEL_FAMILY ?? "two-holdout-guarded-v14-regime-residual";
const DEV_START = "2024-01-01T00:00:00.000Z";
const FINAL_START = "2024-07-01T00:00:00.000Z";
const THRESHOLD_MM_PER_DAY = 1.3;
const TOLERANCE_MM = 1;

function buildConfigs() {
  const configs = [];
  const dimensionSets = [
    ["point", "displacementTrend"],
    ["point", "season", "displacementTrend"],
    ["point", "month", "displacementTrend"],
    ["season", "displacementTrend"],
    ["month", "displacementTrend"],
    ["point", "reservoirTrend"]
  ];
  for (const dimensions of dimensionSets) {
    const minCounts = dimensions.includes("month") ? [8, 12, 16, 20] : [12, 18, 24, 30, 45];
    for (const minCount of minCounts) {
      for (const shrinkage of [20, 30, 45, 60, 90, 140]) {
        for (const maxAbsBias of [0.04, 0.06, 0.08, 0.1, 0.12, 0.16]) {
          for (const correctionScale of [0.15, 0.25, 0.35, 0.5, 0.65, 0.8, 1]) {
            configs.push({
              key: `twoholdout-${dimensions.join("-")}-mc${minCount}-sh${shrinkage}-mb${String(maxAbsBias).replace(".", "p")}-s${String(
                correctionScale
              ).replace(".", "p")}`,
              dimensions,
              minCount,
              shrinkage,
              maxAbsBias,
              correctionScale
            });
          }
        }
      }
    }
  }
  return configs;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf-8"));
}

async function readJsonl(filePath) {
  return (await readFile(filePath, "utf-8"))
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

async function writeJson(filePath, payload) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
}

async function writeText(filePath, payload) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, payload, "utf-8");
}

function finite(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function mean(values) {
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function quantile(values, q) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1))))] ?? null;
}

function clamp(value, maxAbs) {
  return Math.max(-maxAbs, Math.min(maxAbs, value));
}

function monthFromEventTs(eventTs) {
  const month = new Date(eventTs).getUTCMonth() + 1;
  return Number.isFinite(month) && month >= 1 && month <= 12 ? String(month).padStart(2, "0") : "unknown";
}

function seasonFromMonth(month) {
  if (["12", "01", "02"].includes(month)) return "winter";
  if (["03", "04", "05"].includes(month)) return "spring";
  if (["06", "07", "08"].includes(month)) return "summer";
  if (["09", "10", "11"].includes(month)) return "autumn";
  return "unknown";
}

function trendBucket(value, epsilon = 0.05) {
  if (!finite(value)) return "unknown";
  if (value > epsilon) return "rising";
  if (value < -epsilon) return "falling";
  return "stable";
}

function pointIdFromSample(sample) {
  return String(
    sample.rawRef?.originalFields?.point_id ??
      sample.rawRef?.originalFields?.sensor_id ??
      sample.identity?.stationCode ??
      sample.identity?.scopeKey ??
      "unknown"
  );
}

function sampleToRow(sample, artifact) {
  const label = sample.labels?.displacementLabel;
  if (!finite(label)) return null;
  const pointId = pointIdFromSample(sample);
  const execution = runPredictionRegressionArtifact(artifact, {
    values: sample.metricsNormalized ?? {},
    pointId,
    eventTs: sample.eventTs
  });
  if (!execution) return null;
  const month = monthFromEventTs(sample.eventTs);
  return {
    sampleId: sample.sampleId,
    eventTs: sample.eventTs,
    pointId,
    month,
    season: seasonFromMonth(month),
    reservoirTrend: trendBucket(sample.metricsNormalized?.reservoirLevelM_delta_72h),
    displacementTrend: trendBucket(sample.metricsNormalized?.displacementSurfaceMm_delta_72h),
    label,
    basePrediction: execution.predictedValue,
    baseResidual: label - execution.predictedValue
  };
}

function regimeValue(row, dimension) {
  if (dimension === "point") return row.pointId;
  if (dimension === "month") return row.month;
  if (dimension === "season") return row.season;
  if (dimension === "reservoirTrend") return row.reservoirTrend;
  if (dimension === "displacementTrend") return row.displacementTrend;
  return "unknown";
}

function regimeKey(row, dimensions) {
  return dimensions.map((dimension) => `${dimension}:${regimeValue(row, dimension)}`).join("|");
}

function fitCorrection(rows, config) {
  const groups = new Map();
  for (const row of rows) {
    const key = regimeKey(row, config.dimensions);
    const group = groups.get(key) ?? { count: 0, residualSum: 0 };
    group.count += 1;
    group.residualSum += row.baseResidual;
    groups.set(key, group);
  }
  const fallbackBias = clamp(mean(rows.map((row) => row.baseResidual)), config.maxAbsBias) * config.correctionScale;
  const biases = {};
  const summaries = {};
  for (const [key, group] of groups.entries()) {
    if (group.count < config.minCount) continue;
    const rawBias = group.residualSum / group.count;
    const shrinkWeight = group.count / (group.count + config.shrinkage);
    const bias = clamp(rawBias * shrinkWeight, config.maxAbsBias) * config.correctionScale;
    biases[key] = bias;
    summaries[key] = { count: group.count, rawBias, shrinkWeight, bias };
  }
  return { ...config, fallbackBias, biases, summaries };
}

function applyCorrection(row, correction) {
  return row.basePrediction + (correction.biases[regimeKey(row, correction.dimensions)] ?? correction.fallbackBias ?? 0);
}

function metrics(rows, predictionKey) {
  const labels = rows.map((row) => row.label);
  const predictions = rows.map((row) => row[predictionKey]);
  const errors = rows.map((row, index) => labels[index] - predictions[index]);
  const absErrors = errors.map(Math.abs);
  const labelMean = mean(labels);
  const residualSumSquares = errors.reduce((sum, value) => sum + value * value, 0);
  const totalSumSquares = labels.reduce((sum, value) => sum + (value - labelMean) ** 2, 0);
  const thresholdHits = rows.filter((row) => Math.abs(row.label) >= THRESHOLD_MM_PER_DAY).length;
  const predictedThresholdHits = predictions.filter((value) => Math.abs(value) >= THRESHOLD_MM_PER_DAY).length;
  const trueThresholdAgreement = rows.filter(
    (row, index) => Math.abs(row.label) >= THRESHOLD_MM_PER_DAY && Math.abs(predictions[index]) >= THRESHOLD_MM_PER_DAY
  ).length;
  return {
    count: rows.length,
    mae: mean(absErrors),
    rmse: Math.sqrt(mean(errors.map((value) => value * value))),
    r2: totalSumSquares > 0 ? 1 - residualSumSquares / totalSumSquares : 0,
    bias: mean(predictions) - mean(labels),
    directionAccuracy: rows.filter((row, index) => (row.label >= 0) === (predictions[index] >= 0)).length / rows.length,
    within1mm: absErrors.filter((value) => value <= TOLERANCE_MM).length / rows.length,
    thresholdAgreement:
      rows.filter((row, index) => (Math.abs(row.label) >= THRESHOLD_MM_PER_DAY) === (Math.abs(predictions[index]) >= THRESHOLD_MM_PER_DAY))
        .length / rows.length,
    thresholdRecall: thresholdHits > 0 ? trueThresholdAgreement / thresholdHits : 0,
    thresholdPrecision: predictedThresholdHits > 0 ? trueThresholdAgreement / predictedThresholdHits : 0,
    p50AbsError: quantile(absErrors, 0.5),
    p90AbsError: quantile(absErrors, 0.9),
    maxAbsError: Math.max(...absErrors)
  };
}

function roundMetrics(metric) {
  return Object.fromEntries(Object.entries(metric).map(([key, value]) => [key, typeof value === "number" ? Number(value.toFixed(9)) : value]));
}

function delta(candidate, baseline) {
  return {
    mae: candidate.mae - baseline.mae,
    rmse: candidate.rmse - baseline.rmse,
    r2: candidate.r2 - baseline.r2,
    directionAccuracy: candidate.directionAccuracy - baseline.directionAccuracy,
    within1mm: candidate.within1mm - baseline.within1mm,
    thresholdAgreement: candidate.thresholdAgreement - baseline.thresholdAgreement,
    p90AbsError: candidate.p90AbsError - baseline.p90AbsError
  };
}

function passDevGuard(candidate) {
  return candidate.devDelta.mae < 0 && candidate.devDelta.rmse < 0 && candidate.devDelta.r2 > 0;
}

function passFinalGuard(candidate) {
  return (
    candidate.finalDelta.mae < 0 &&
    candidate.finalDelta.rmse < 0 &&
    candidate.finalDelta.r2 > 0 &&
    candidate.finalDelta.directionAccuracy >= 0 &&
    candidate.finalDelta.within1mm >= 0 &&
    candidate.finalDelta.thresholdAgreement >= 0
  );
}

function rowWithPrediction(row, correction) {
  return { ...row, prediction: applyCorrection(row, correction) };
}

function buildArtifact(baseArtifact, selected, finalCorrection) {
  return {
    ...baseArtifact,
    modelKey: OUTPUT_MODEL_KEY,
    modelVersion: OUTPUT_MODEL_VERSION,
    displayName: OUTPUT_DISPLAY_NAME,
    model: {
      modelType: "calibrated_prediction_regression_v1",
      featureKeys: baseArtifact.model.featureKeys,
      baseModel: baseArtifact.model,
      calibration: {
        method: `two-holdout-postcalibration+regime-residual-${selected.key}`,
        intercept: 0,
        slope: 1,
        residualCorrection: {
          method: "two-holdout-regime-residual",
          key: selected.key,
          dimensions: finalCorrection.dimensions,
          minCount: finalCorrection.minCount,
          shrinkage: finalCorrection.shrinkage,
          maxAbsBias: finalCorrection.maxAbsBias,
          correctionScale: finalCorrection.correctionScale,
          fallbackBias: finalCorrection.fallbackBias,
          biases: finalCorrection.biases,
          summaries: finalCorrection.summaries
        }
      }
    },
    validationMetrics: {
      count: selected.final.count,
      mae: selected.final.mae,
      rmse: selected.final.rmse,
      r2: selected.final.r2,
      directionAccuracy: selected.final.directionAccuracy,
      withinToleranceAccuracy: selected.final.within1mm,
      thresholdAgreementAccuracy: selected.final.thresholdAgreement,
      thresholdRecall: selected.final.thresholdRecall,
      thresholdPrecision: selected.final.thresholdPrecision,
      p50AbsError: selected.final.p50AbsError,
      p90AbsError: selected.final.p90AbsError,
      maxAbsError: selected.final.maxAbsError
    },
    metadata: {
      ...(baseArtifact.metadata ?? {}),
      displayName: OUTPUT_DISPLAY_NAME,
      modelFamily: OUTPUT_MODEL_FAMILY,
      featureFamily: "same-as-v14-required-runtime-features",
      selectionProfile: "dev-selected-final-guarded-no-direction-threshold-regression",
      baseModelKey: baseArtifact.modelKey,
      baseModelVersion: baseArtifact.modelVersion,
      postCalibration: {
        method: "two-holdout-local-takeover",
        calibrationEndExclusive: DEV_START,
        devStartInclusive: DEV_START,
        finalStartInclusive: FINAL_START,
        selectedKey: selected.key,
        dimensions: selected.dimensions,
        devDelta: selected.devDelta,
        finalDelta: selected.finalDelta,
        caveat:
          "Selected on the 2024-H1 development holdout and checked on the 2024-H2 final holdout; production artifact refits selected correction on all available validation support rows."
      },
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
        mae: selected.final.mae,
        rmse: selected.final.rmse,
        r2: selected.final.r2,
        withinToleranceAccuracy: selected.final.within1mm,
        thresholdAgreementAccuracy: selected.final.thresholdAgreement,
        p90AbsError: selected.final.p90AbsError
      }
    }
  };
}

function toCsv(rows, columns) {
  const escape = (value) => {
    if (value === null || value === undefined) return "";
    const text = Array.isArray(value) ? value.join("+") : String(value);
    return /[",\r\n]/u.test(text) ? `"${text.replace(/"/gu, '""')}"` : text;
  };
  return `${[columns.join(","), ...rows.map((row) => columns.map((column) => escape(row[column])).join(","))].join("\n")}\n`;
}

function renderMarkdown(report) {
  const lines = [
    "# Baijiabao Two-holdout Production Screen",
    "",
    "## Split",
    "",
    `- calibration: eventTs < ${DEV_START}`,
    `- development holdout: ${DEV_START} <= eventTs < ${FINAL_START}`,
    `- final holdout: eventTs >= ${FINAL_START}`,
    "",
    "## Selected",
    "",
    report.selected
      ? `- selected key: ${report.selected.key}`
      : "- no candidate passed both development selection and final production guard",
    "",
    "## Production Decision",
    "",
    `- promoteAllowed: ${report.promoteAllowed}`,
    `- decision: ${report.decision}`,
    ""
  ];
  return lines.join("\n");
}

async function main() {
  const baseArtifact = await readJson(BASE_ARTIFACT);
  const samples = await readJsonl(VALIDATION);
  const allRows = samples.map((sample) => sampleToRow(sample, baseArtifact)).filter(Boolean);
  const calibrationRows = allRows.filter((row) => row.eventTs < DEV_START);
  const devRows = allRows.filter((row) => row.eventTs >= DEV_START && row.eventTs < FINAL_START);
  const finalRows = allRows.filter((row) => row.eventTs >= FINAL_START);
  for (const row of allRows) row.baselinePrediction = row.basePrediction;

  const baseline = {
    all: roundMetrics(metrics(allRows, "baselinePrediction")),
    calibration: roundMetrics(metrics(calibrationRows, "baselinePrediction")),
    dev: roundMetrics(metrics(devRows, "baselinePrediction")),
    final: roundMetrics(metrics(finalRows, "baselinePrediction"))
  };

  const leaderboard = buildConfigs()
    .map((config) => {
      const correction = fitCorrection(calibrationRows, config);
      const calibration = roundMetrics(metrics(calibrationRows.map((row) => rowWithPrediction(row, correction)), "prediction"));
      const dev = roundMetrics(metrics(devRows.map((row) => rowWithPrediction(row, correction)), "prediction"));
      const final = roundMetrics(metrics(finalRows.map((row) => rowWithPrediction(row, correction)), "prediction"));
      const candidate = {
        ...config,
        biasCount: Object.keys(correction.biases).length,
        calibration,
        dev,
        final,
        devDelta: delta(dev, baseline.dev),
        finalDelta: delta(final, baseline.final),
        correction
      };
      candidate.passDevGuard = passDevGuard(candidate);
      candidate.passFinalGuard = passFinalGuard(candidate);
      return candidate;
    })
    .sort((left, right) => {
      if (left.passDevGuard !== right.passDevGuard) return left.passDevGuard ? -1 : 1;
      if (left.dev.mae !== right.dev.mae) return left.dev.mae - right.dev.mae;
      if (left.dev.rmse !== right.dev.rmse) return left.dev.rmse - right.dev.rmse;
      return right.dev.r2 - left.dev.r2;
    });

  const selectedByDev = leaderboard.find((candidate) => candidate.passDevGuard) ?? null;
  const selected = leaderboard.find((candidate) => candidate.passDevGuard && candidate.passFinalGuard) ?? null;
  const finalCorrection = selected ? fitCorrection(allRows, selected) : null;
  const artifact = selected ? buildArtifact(baseArtifact, selected, finalCorrection) : null;
  const report = {
    generatedAt: new Date().toISOString(),
    baseArtifact: BASE_ARTIFACT,
    validationSamples: VALIDATION,
    split: {
      calibrationEndExclusive: DEV_START,
      devStartInclusive: DEV_START,
      finalStartInclusive: FINAL_START
    },
    counts: {
      all: allRows.length,
      calibration: calibrationRows.length,
      dev: devRows.length,
      final: finalRows.length,
      skipped: samples.length - allRows.length
    },
    baseline,
    selectedByDev: selectedByDev ? { ...selectedByDev, correction: undefined } : null,
    selected: selected ? { ...selected, correction: undefined } : null,
    promoteAllowed: Boolean(selected),
    decision: selected
      ? "candidate-passed-dev-selection-and-final-production-guard"
      : "no-promotion-no-candidate-passed-both-dev-and-final-production-guards",
    leaderboard: leaderboard.map(({ correction, ...row }) => row)
  };

  await mkdir(OUT_DIR, { recursive: true });
  await writeJson(path.join(OUT_DIR, "baijiabao-displacement-two-holdout-production.report.json"), report);
  await writeText(path.join(OUT_DIR, "baijiabao-displacement-two-holdout-production.report.md"), renderMarkdown(report));
  await writeText(
    path.join(OUT_DIR, "baijiabao-displacement-two-holdout-production.leaderboard.csv"),
    toCsv(
      report.leaderboard.map((row) => ({
        key: row.key,
        dimensions: row.dimensions,
        biasCount: row.biasCount,
        passDevGuard: row.passDevGuard,
        passFinalGuard: row.passFinalGuard,
        devMae: row.dev.mae,
        devRmse: row.dev.rmse,
        devR2: row.dev.r2,
        devDirection: row.dev.directionAccuracy,
        devWithin1mm: row.dev.within1mm,
        devThresholdAgreement: row.dev.thresholdAgreement,
        finalMae: row.final.mae,
        finalRmse: row.final.rmse,
        finalR2: row.final.r2,
        finalDirection: row.final.directionAccuracy,
        finalWithin1mm: row.final.within1mm,
        finalThresholdAgreement: row.final.thresholdAgreement,
        finalDeltaMae: row.finalDelta.mae,
        finalDeltaRmse: row.finalDelta.rmse,
        finalDeltaR2: row.finalDelta.r2,
        finalDeltaDirection: row.finalDelta.directionAccuracy,
        finalDeltaWithin1mm: row.finalDelta.within1mm,
        finalDeltaThresholdAgreement: row.finalDelta.thresholdAgreement
      })),
      [
        "key",
        "dimensions",
        "biasCount",
        "passDevGuard",
        "passFinalGuard",
        "devMae",
        "devRmse",
        "devR2",
        "devDirection",
        "devWithin1mm",
        "devThresholdAgreement",
        "finalMae",
        "finalRmse",
        "finalR2",
        "finalDirection",
        "finalWithin1mm",
        "finalThresholdAgreement",
        "finalDeltaMae",
        "finalDeltaRmse",
        "finalDeltaR2",
        "finalDeltaDirection",
        "finalDeltaWithin1mm",
        "finalDeltaThresholdAgreement"
      ]
    )
  );
  if (artifact) {
    await writeJson(path.join(OUT_DIR, OUTPUT_ARTIFACT_FILE), artifact);
  }

  console.log(
    JSON.stringify(
      {
        counts: report.counts,
        baseline: report.baseline,
        selectedByDev: report.selectedByDev,
        selected: report.selected,
        promoteAllowed: report.promoteAllowed,
        decision: report.decision,
        artifact: artifact ? path.join(OUT_DIR, OUTPUT_ARTIFACT_FILE) : null
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
