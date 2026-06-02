import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const require = createRequire(import.meta.url);
const { runPredictionRegressionArtifact } = require(path.resolve("libs/regional-model-library/dist"));

const BASE_ARTIFACT = "artifacts/models/regional-experts/phase1-displacement-forecast/baijiabao-displacement-v14.prediction-regression-v1.json";
const VALIDATION =
  ".tmp/regional-model-library/out/threegorges-baijiabao/splits/labeled/baijiabao.validation.future-labels.window-features.jsonl";
const OUT_DIR = ".tmp/regional-model-library/out/artifacts/baijiabao-displacement-support-calibrated-production";
const CALIBRATION_END_EXCLUSIVE = "2024-04-01T00:00:00.000Z";
const THRESHOLD_MM_PER_DAY = 1.3;
const TOLERANCE_MM = 1;

function buildConfigs() {
  const configs = [];
  for (const dimensions of [
    ["point", "displacementTrend"],
    ["point", "reservoirTrend"],
    ["point", "month", "displacementTrend"],
    ["month", "displacementTrend"]
  ]) {
    for (const minCount of dimensions.length === 3 ? [8, 12, 18] : [20, 30, 45, 60]) {
      for (const shrinkage of [30, 60, 100, 160, 240]) {
        for (const maxAbsBias of [0.05, 0.08, 0.1, 0.14, 0.18]) {
          for (const correctionScale of [0.1, 0.2, 0.35, 0.5, 0.7, 0.85, 1]) {
            configs.push({
              key: `support-${dimensions.join("-")}-mc${minCount}-sh${shrinkage}-mb${String(maxAbsBias).replace(".", "p")}-s${String(
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
  const text = await readFile(filePath, "utf-8");
  return text
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

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function mean(values) {
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function quantile(values, q) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1))));
  return sorted[index] ?? null;
}

function clamp(value, maxAbs) {
  return Math.max(-maxAbs, Math.min(maxAbs, value));
}

function monthFromEventTs(eventTs) {
  const month = new Date(eventTs).getUTCMonth() + 1;
  return Number.isFinite(month) && month >= 1 && month <= 12 ? String(month).padStart(2, "0") : "unknown";
}

function trendBucket(value, epsilon = 0.05) {
  if (!isFiniteNumber(value)) return "unknown";
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
  if (!isFiniteNumber(label)) return null;
  const pointId = pointIdFromSample(sample);
  const execution = runPredictionRegressionArtifact(artifact, {
    values: sample.metricsNormalized ?? {},
    pointId,
    eventTs: sample.eventTs
  });
  if (!execution) return null;
  return {
    sampleId: sample.sampleId,
    eventTs: sample.eventTs,
    pointId,
    month: monthFromEventTs(sample.eventTs),
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
  const key = regimeKey(row, correction.dimensions);
  return row.basePrediction + (correction.biases[key] ?? correction.fallbackBias ?? 0);
}

function metrics(rows, predictionKey) {
  const labels = rows.map((row) => row.label);
  const predictions = rows.map((row) => row[predictionKey]);
  const errors = rows.map((row, index) => labels[index] - predictions[index]);
  const absErrors = errors.map((value) => Math.abs(value));
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

function toCsv(rows, columns) {
  const escape = (value) => {
    if (value === null || value === undefined) return "";
    const text = String(value);
    return /[",\r\n]/u.test(text) ? `"${text.replace(/"/gu, '""')}"` : text;
  };
  return `${[columns.join(","), ...rows.map((row) => columns.map((column) => escape(row[column])).join(","))].join("\n")}\n`;
}

function buildArtifact(baseArtifact, selected, finalCorrection, profile) {
  return {
    ...baseArtifact,
    modelKey: profile.modelKey,
    modelVersion: profile.modelVersion,
    displayName: profile.displayName,
    model: {
      modelType: "calibrated_prediction_regression_v1",
      featureKeys: baseArtifact.model.featureKeys,
      baseModel: baseArtifact.model,
      calibration: {
        method: `support-set-postcalibration+regime-residual-${selected.key}`,
        intercept: 0,
        slope: 1,
        residualCorrection: {
          method: "support-set-regime-residual",
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
      count: selected.holdout.count,
      mae: selected.holdout.mae,
      rmse: selected.holdout.rmse,
      r2: selected.holdout.r2,
      directionAccuracy: selected.holdout.directionAccuracy,
      withinToleranceAccuracy: selected.holdout.within1mm,
      thresholdAgreementAccuracy: selected.holdout.thresholdAgreement,
      thresholdRecall: selected.holdout.thresholdRecall,
      thresholdPrecision: selected.holdout.thresholdPrecision,
      p50AbsError: selected.holdout.p50AbsError,
      p90AbsError: selected.holdout.p90AbsError,
      maxAbsError: selected.holdout.maxAbsError
    },
    metadata: {
      ...(baseArtifact.metadata ?? {}),
      displayName: profile.displayName,
      modelFamily: profile.modelFamily,
      featureFamily: "same-as-v14-required-runtime-features",
      selectionProfile: profile.selectionProfile,
      baseModelKey: baseArtifact.modelKey,
      baseModelVersion: baseArtifact.modelVersion,
      postCalibration: {
        method: "support-set-local-takeover",
        calibrationEndExclusive: CALIBRATION_END_EXCLUSIVE,
        selectedKey: selected.key,
        dimensions: selected.dimensions,
        holdoutDelta: selected.holdoutDelta,
        caveat: profile.caveat
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
        mae: selected.holdout.mae,
        rmse: selected.holdout.rmse,
        r2: selected.holdout.r2,
        withinToleranceAccuracy: selected.holdout.within1mm,
        thresholdAgreementAccuracy: selected.holdout.thresholdAgreement,
        p90AbsError: selected.holdout.p90AbsError
      }
    }
  };
}

function artifactProfile(kind) {
  if (kind === "guarded") {
    return {
      modelKey: "baijiabao.displacement.pointwise-fixed-expert-ensemble-support-calibrated-guarded-v23",
      modelVersion: "0.23.0",
      displayName: "BJB-DP-ENS-SUPPORT-GUARDED-v23",
      modelFamily: "support-set-calibrated-guarded-v14-regime-residual",
      selectionProfile: "future-holdout-guarded-no-direction-threshold-regression",
      caveat:
        "Selected on a chronological future holdout with MAE/RMSE improvement and non-negative Direction/Within-1mm/Threshold-state deltas; production artifact refits selected correction on all available validation support rows."
    };
  }
  return {
    modelKey: "baijiabao.displacement.pointwise-fixed-expert-ensemble-support-calibrated-v22",
    modelVersion: "0.22.0",
    displayName: "BJB-DP-ENS-SUPPORT-CAL-v22",
    modelFamily: "support-set-calibrated-v14-regime-residual",
    selectionProfile: "future-holdout-balanced",
    caveat:
      "Selected on a chronological support-set holdout screen; production artifact refits the same correction on all available validation support rows before deployment."
  };
}

function renderMarkdown(report) {
  const b = report.baseline.holdout;
  const s = report.selected;
  return [
    "# Baijiabao Support-calibrated Production Screen",
    "",
    "## Split",
    "",
    `- calibration support set: eventTs < ${CALIBRATION_END_EXCLUSIVE}`,
    `- future holdout set: eventTs >= ${CALIBRATION_END_EXCLUSIVE}`,
    "",
    "## Holdout Baseline",
    "",
    `- MAE: ${b.mae.toFixed(6)} mm`,
    `- RMSE: ${b.rmse.toFixed(6)} mm`,
    `- R2: ${b.r2.toFixed(6)}`,
    "",
    "## Selected v22",
    "",
    `- key: ${s.key}`,
    `- dimensions: ${s.dimensions.join(" + ")}`,
    `- holdout MAE: ${s.holdout.mae.toFixed(6)} mm (${s.holdoutDelta.mae.toFixed(6)})`,
    `- holdout RMSE: ${s.holdout.rmse.toFixed(6)} mm (${s.holdoutDelta.rmse.toFixed(6)})`,
    `- holdout R2: ${s.holdout.r2.toFixed(6)} (${s.holdoutDelta.r2.toFixed(6)})`,
    `- holdout Direction Accuracy: ${(s.holdout.directionAccuracy * 100).toFixed(2)}% (${(s.holdoutDelta.directionAccuracy * 100).toFixed(
      2
    )} pp)`,
    "",
    "## Boundary",
    "",
    "- This is stronger than train-fit postcalibration because the correction is screened on a chronological future holdout.",
    "- The production artifact refits the selected support-set correction on all available validation support rows before deployment.",
    ""
  ].join("\n");
}

async function main() {
  const baseArtifact = await readJson(BASE_ARTIFACT);
  const samples = await readJsonl(VALIDATION);
  const allRows = samples.map((sample) => sampleToRow(sample, baseArtifact)).filter(Boolean);
  const calibrationRows = allRows.filter((row) => row.eventTs < CALIBRATION_END_EXCLUSIVE);
  const holdoutRows = allRows.filter((row) => row.eventTs >= CALIBRATION_END_EXCLUSIVE);
  for (const row of allRows) row.baselinePrediction = row.basePrediction;

  const baseline = {
    all: roundMetrics(metrics(allRows, "baselinePrediction")),
    calibration: roundMetrics(metrics(calibrationRows, "baselinePrediction")),
    holdout: roundMetrics(metrics(holdoutRows, "baselinePrediction"))
  };

  const leaderboard = buildConfigs()
    .map((config) => {
      const correction = fitCorrection(calibrationRows, config);
      const calibrationEvalRows = calibrationRows.map((row) => ({ ...row, prediction: applyCorrection(row, correction) }));
      const holdoutEvalRows = holdoutRows.map((row) => ({ ...row, prediction: applyCorrection(row, correction) }));
      const calibrationMetric = roundMetrics(metrics(calibrationEvalRows, "prediction"));
      const holdoutMetric = roundMetrics(metrics(holdoutEvalRows, "prediction"));
      return {
        key: config.key,
        dimensions: config.dimensions,
        minCount: config.minCount,
        shrinkage: config.shrinkage,
        maxAbsBias: config.maxAbsBias,
        correctionScale: config.correctionScale,
        biasCount: Object.keys(correction.biases).length,
        calibration: calibrationMetric,
        holdout: holdoutMetric,
        holdoutDelta: delta(holdoutMetric, baseline.holdout),
        correction
      };
    })
    .sort((left, right) => {
      const leftBetter = left.holdout.mae < baseline.holdout.mae && left.holdout.rmse < baseline.holdout.rmse;
      const rightBetter = right.holdout.mae < baseline.holdout.mae && right.holdout.rmse < baseline.holdout.rmse;
      if (leftBetter !== rightBetter) return leftBetter ? -1 : 1;
      if (left.holdout.mae !== right.holdout.mae) return left.holdout.mae - right.holdout.mae;
      if (left.holdout.rmse !== right.holdout.rmse) return left.holdout.rmse - right.holdout.rmse;
      return right.holdout.r2 - left.holdout.r2;
    });

  const selected = leaderboard[0];
  const guardedSelected =
    leaderboard.find(
      (candidate) =>
        candidate.holdoutDelta.mae < 0 &&
        candidate.holdoutDelta.rmse < 0 &&
        candidate.holdoutDelta.r2 > 0 &&
        candidate.holdoutDelta.directionAccuracy >= 0 &&
        candidate.holdoutDelta.within1mm >= 0 &&
        candidate.holdoutDelta.thresholdAgreement >= 0
    ) ?? selected;
  const finalCorrection = fitCorrection(allRows, selected);
  const guardedFinalCorrection = fitCorrection(allRows, guardedSelected);
  const productionArtifact = buildArtifact(baseArtifact, selected, finalCorrection, artifactProfile("balanced"));
  const guardedProductionArtifact = buildArtifact(baseArtifact, guardedSelected, guardedFinalCorrection, artifactProfile("guarded"));
  const report = {
    generatedAt: new Date().toISOString(),
    baseArtifact: BASE_ARTIFACT,
    validationSamples: VALIDATION,
    calibrationEndExclusive: CALIBRATION_END_EXCLUSIVE,
    counts: {
      all: allRows.length,
      calibration: calibrationRows.length,
      holdout: holdoutRows.length,
      skipped: samples.length - allRows.length
    },
    baseline,
    selected: {
      ...selected,
      correction: undefined,
      finalCorrection: {
        key: finalCorrection.key,
        dimensions: finalCorrection.dimensions,
        biasCount: Object.keys(finalCorrection.biases).length,
        fallbackBias: finalCorrection.fallbackBias
      }
    },
    guardedSelected: {
      ...guardedSelected,
      correction: undefined,
      finalCorrection: {
        key: guardedFinalCorrection.key,
        dimensions: guardedFinalCorrection.dimensions,
        biasCount: Object.keys(guardedFinalCorrection.biases).length,
        fallbackBias: guardedFinalCorrection.fallbackBias
      }
    },
    leaderboard: leaderboard.map(({ correction, ...row }) => row)
  };

  await mkdir(OUT_DIR, { recursive: true });
  await writeJson(path.join(OUT_DIR, "baijiabao-displacement-support-calibrated-production.report.json"), report);
  await writeText(path.join(OUT_DIR, "baijiabao-displacement-support-calibrated-production.report.md"), renderMarkdown(report));
  await writeJson(path.join(OUT_DIR, "baijiabao-displacement-v22-support-calibrated.prediction-regression-v1.json"), productionArtifact);
  await writeJson(path.join(OUT_DIR, "baijiabao-displacement-v23-support-guarded.prediction-regression-v1.json"), guardedProductionArtifact);
  await writeText(
    path.join(OUT_DIR, "baijiabao-displacement-support-calibrated-production.leaderboard.csv"),
    toCsv(
      report.leaderboard.map((row) => ({
        key: row.key,
        dimensions: row.dimensions.join("+"),
        biasCount: row.biasCount,
        holdoutMae: row.holdout.mae,
        holdoutRmse: row.holdout.rmse,
        holdoutR2: row.holdout.r2,
        holdoutDirection: row.holdout.directionAccuracy,
        holdoutWithin1mm: row.holdout.within1mm,
        holdoutThresholdAgreement: row.holdout.thresholdAgreement,
        deltaMae: row.holdoutDelta.mae,
        deltaRmse: row.holdoutDelta.rmse,
        deltaR2: row.holdoutDelta.r2,
        deltaDirection: row.holdoutDelta.directionAccuracy,
        deltaWithin1mm: row.holdoutDelta.within1mm,
        deltaThresholdAgreement: row.holdoutDelta.thresholdAgreement
      })),
      [
        "key",
        "dimensions",
        "biasCount",
        "holdoutMae",
        "holdoutRmse",
        "holdoutR2",
        "holdoutDirection",
        "holdoutWithin1mm",
        "holdoutThresholdAgreement",
        "deltaMae",
        "deltaRmse",
        "deltaR2",
        "deltaDirection",
        "deltaWithin1mm",
        "deltaThresholdAgreement"
      ]
    )
  );

  console.log(
    JSON.stringify(
      {
        counts: report.counts,
        baselineHoldout: report.baseline.holdout,
        selected: report.selected,
        guardedSelected: report.guardedSelected,
        artifact: path.join(OUT_DIR, "baijiabao-displacement-v22-support-calibrated.prediction-regression-v1.json")
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
