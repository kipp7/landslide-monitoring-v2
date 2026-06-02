import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const require = createRequire(import.meta.url);
const { runPredictionRegressionArtifact } = require(path.resolve("libs/regional-model-library/dist"));

const ARTIFACT =
  "artifacts/models/regional-experts/phase1-displacement-forecast/baijiabao-displacement-v14.prediction-regression-v1.json";
const TRAIN =
  ".tmp/regional-model-library/out/threegorges-baijiabao/splits/labeled/baijiabao.train.future-labels.window-features.jsonl";
const VALIDATION =
  ".tmp/regional-model-library/out/threegorges-baijiabao/splits/labeled/baijiabao.validation.future-labels.window-features.jsonl";
const OUT_DIR = ".tmp/regional-model-library/out/artifacts/baijiabao-displacement-postcalibration-challengers";
const THRESHOLD_MM_PER_DAY = 1.3;
const TOLERANCE_MM = 1;

const CHALLENGER_CONFIGS = [
  { key: "global-bias-s025", dimensions: [], minCount: 1, shrinkage: 2000, maxAbsBias: 0.1, correctionScale: 0.25 },
  { key: "global-bias-s050", dimensions: [], minCount: 1, shrinkage: 2000, maxAbsBias: 0.1, correctionScale: 0.5 },
  { key: "point-s025", dimensions: ["point"], minCount: 200, shrinkage: 500, maxAbsBias: 0.12, correctionScale: 0.25 },
  { key: "point-s050", dimensions: ["point"], minCount: 200, shrinkage: 500, maxAbsBias: 0.12, correctionScale: 0.5 },
  { key: "month-s025", dimensions: ["month"], minCount: 100, shrinkage: 300, maxAbsBias: 0.12, correctionScale: 0.25 },
  { key: "month-s050", dimensions: ["month"], minCount: 100, shrinkage: 300, maxAbsBias: 0.12, correctionScale: 0.5 },
  { key: "point-month-s020", dimensions: ["point", "month"], minCount: 35, shrinkage: 160, maxAbsBias: 0.1, correctionScale: 0.2 },
  { key: "point-month-s035", dimensions: ["point", "month"], minCount: 35, shrinkage: 160, maxAbsBias: 0.1, correctionScale: 0.35 },
  { key: "point-reservoir-trend-s025", dimensions: ["point", "reservoirTrend"], minCount: 100, shrinkage: 260, maxAbsBias: 0.1, correctionScale: 0.25 },
  { key: "point-reservoir-trend-s040", dimensions: ["point", "reservoirTrend"], minCount: 100, shrinkage: 260, maxAbsBias: 0.1, correctionScale: 0.4 },
  { key: "point-displacement-trend-s025", dimensions: ["point", "displacementTrend"], minCount: 100, shrinkage: 260, maxAbsBias: 0.1, correctionScale: 0.25 },
  { key: "point-displacement-trend-s040", dimensions: ["point", "displacementTrend"], minCount: 100, shrinkage: 260, maxAbsBias: 0.1, correctionScale: 0.4 },
  { key: "month-reservoir-trend-s025", dimensions: ["month", "reservoirTrend"], minCount: 50, shrinkage: 220, maxAbsBias: 0.1, correctionScale: 0.25 },
  { key: "month-reservoir-trend-s040", dimensions: ["month", "reservoirTrend"], minCount: 50, shrinkage: 220, maxAbsBias: 0.1, correctionScale: 0.4 },
  { key: "month-displacement-trend-s025", dimensions: ["month", "displacementTrend"], minCount: 50, shrinkage: 220, maxAbsBias: 0.1, correctionScale: 0.25 },
  { key: "month-displacement-trend-s040", dimensions: ["month", "displacementTrend"], minCount: 50, shrinkage: 220, maxAbsBias: 0.1, correctionScale: 0.4 },
  { key: "point-month-reservoir-trend-s015", dimensions: ["point", "month", "reservoirTrend"], minCount: 24, shrinkage: 180, maxAbsBias: 0.08, correctionScale: 0.15 },
  { key: "point-month-reservoir-trend-s025", dimensions: ["point", "month", "reservoirTrend"], minCount: 24, shrinkage: 180, maxAbsBias: 0.08, correctionScale: 0.25 },
  { key: "point-month-displacement-trend-s015", dimensions: ["point", "month", "displacementTrend"], minCount: 24, shrinkage: 180, maxAbsBias: 0.08, correctionScale: 0.15 },
  { key: "point-month-displacement-trend-s025", dimensions: ["point", "month", "displacementTrend"], minCount: 24, shrinkage: 180, maxAbsBias: 0.08, correctionScale: 0.25 }
];

function focusedGridConfigs() {
  const configs = [];
  const pushGrid = ({ prefix, dimensions, minCounts, shrinkages, maxAbsBiases, correctionScales }) => {
    for (const minCount of minCounts) {
      for (const shrinkage of shrinkages) {
        for (const maxAbsBias of maxAbsBiases) {
          for (const correctionScale of correctionScales) {
            configs.push({
              key: `${prefix}-mc${minCount}-sh${shrinkage}-mb${String(maxAbsBias).replace(".", "p")}-s${String(correctionScale).replace(".", "p")}`,
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
  };

  pushGrid({
    prefix: "grid-point-displacement-trend",
    dimensions: ["point", "displacementTrend"],
    minCounts: [60, 80, 100, 140],
    shrinkages: [80, 140, 220, 320, 500],
    maxAbsBiases: [0.08, 0.1, 0.12, 0.16],
    correctionScales: [0.1, 0.2, 0.3, 0.4, 0.55, 0.7, 0.85, 1]
  });
  pushGrid({
    prefix: "grid-point-reservoir-trend",
    dimensions: ["point", "reservoirTrend"],
    minCounts: [60, 80, 100, 140],
    shrinkages: [80, 140, 220, 320, 500],
    maxAbsBiases: [0.08, 0.1, 0.12, 0.16],
    correctionScales: [0.1, 0.2, 0.3, 0.4, 0.55, 0.7, 0.85, 1]
  });
  pushGrid({
    prefix: "grid-point-month",
    dimensions: ["point", "month"],
    minCounts: [24, 35, 50, 70],
    shrinkages: [80, 140, 220, 320],
    maxAbsBiases: [0.08, 0.1, 0.12],
    correctionScales: [0.1, 0.2, 0.3, 0.4, 0.55]
  });
  pushGrid({
    prefix: "grid-point-month-displacement-trend",
    dimensions: ["point", "month", "displacementTrend"],
    minCounts: [18, 24, 35],
    shrinkages: [120, 180, 260, 380],
    maxAbsBiases: [0.06, 0.08, 0.1],
    correctionScales: [0.1, 0.15, 0.2, 0.3]
  });
  return configs;
}

const ALL_CHALLENGER_CONFIGS = [
  ...new Map([...CHALLENGER_CONFIGS, ...focusedGridConfigs()].map((config) => [config.key, config])).values()
];

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

function regimeValue(row, dimension) {
  if (dimension === "point") return row.pointId;
  if (dimension === "month") return row.month;
  if (dimension === "reservoirTrend") return row.reservoirTrend;
  if (dimension === "displacementTrend") return row.displacementTrend;
  return "unknown";
}

function regimeKey(row, dimensions) {
  if (dimensions.length === 0) return "global";
  return dimensions.map((dimension) => `${dimension}:${regimeValue(row, dimension)}`).join("|");
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

function rowsFromSamples(samples, artifact) {
  const rows = [];
  let skipped = 0;
  for (const sample of samples) {
    const row = sampleToRow(sample, artifact);
    if (row) rows.push(row);
    else skipped += 1;
  }
  return { rows, skipped };
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

function fitCorrection(rows, config) {
  const groups = new Map();
  for (const row of rows) {
    const key = regimeKey(row, config.dimensions);
    const group = groups.get(key) ?? { count: 0, residualSum: 0 };
    group.count += 1;
    group.residualSum += row.baseResidual;
    groups.set(key, group);
  }
  const globalResidual = mean(rows.map((row) => row.baseResidual));
  const fallbackBias = clamp(globalResidual, config.maxAbsBias) * config.correctionScale;
  const biases = {};
  const summaries = {};
  for (const [key, group] of groups.entries()) {
    if (group.count < config.minCount) continue;
    const rawBias = group.residualSum / group.count;
    const shrinkWeight = group.count / (group.count + config.shrinkage);
    const bias = clamp(rawBias * shrinkWeight, config.maxAbsBias) * config.correctionScale;
    biases[key] = bias;
    summaries[key] = {
      count: group.count,
      rawBias,
      shrinkWeight,
      bias
    };
  }
  return {
    ...config,
    fallbackBias,
    biases,
    summaries
  };
}

function applyCorrection(row, correction) {
  const key = regimeKey(row, correction.dimensions);
  return row.basePrediction + (correction.biases[key] ?? correction.fallbackBias ?? 0);
}

function toCsv(rows, columns) {
  const escape = (value) => {
    if (value === null || value === undefined) return "";
    const text = String(value);
    return /[",\r\n]/u.test(text) ? `"${text.replace(/"/gu, '""')}"` : text;
  };
  return `${[columns.join(","), ...rows.map((row) => columns.map((column) => escape(row[column])).join(","))].join("\n")}\n`;
}

function renderMarkdown(report) {
  const best = report.selectedChallengers.bestMae;
  const balanced = report.selectedChallengers.balanced;
  const thresholdSafe = report.selectedChallengers.thresholdSafe;
  const baseline = report.baseline.validation;
  const delta = best.validationDelta;
  return [
    "# Baijiabao Displacement Post-calibration Challengers",
    "",
    "## Purpose",
    "",
    "This is a fast challenger screen for low-dimensional residual post-calibration on top of the current v14 runtime artifact.",
    "It is not promoted as the official model unless the winning correction is later converted to the full OOF training path.",
    "",
    "## Baseline",
    "",
    `- MAE: ${baseline.mae.toFixed(6)} mm`,
    `- RMSE: ${baseline.rmse.toFixed(6)} mm`,
    `- R2: ${baseline.r2.toFixed(6)}`,
    `- Within 1mm: ${(baseline.within1mm * 100).toFixed(2)}%`,
    "",
    "## Best Challenger",
    "",
    `- key: \`${best.key}\``,
    `- dimensions: \`${best.dimensions.join(" + ") || "global"}\``,
    `- MAE: ${best.validation.mae.toFixed(6)} mm (${delta.mae.toFixed(6)})`,
    `- RMSE: ${best.validation.rmse.toFixed(6)} mm (${delta.rmse.toFixed(6)})`,
    `- R2: ${best.validation.r2.toFixed(6)} (${delta.r2.toFixed(6)})`,
    `- Within 1mm: ${(best.validation.within1mm * 100).toFixed(2)}% (${(delta.within1mm * 100).toFixed(2)} pp)`,
    "",
    "## Balanced Candidate",
    "",
    `- key: \`${balanced.key}\``,
    `- MAE: ${balanced.validation.mae.toFixed(6)} mm (${balanced.validationDelta.mae.toFixed(6)})`,
    `- RMSE: ${balanced.validation.rmse.toFixed(6)} mm (${balanced.validationDelta.rmse.toFixed(6)})`,
    `- R2: ${balanced.validation.r2.toFixed(6)} (${balanced.validationDelta.r2.toFixed(6)})`,
    `- Within 1mm: ${(balanced.validation.within1mm * 100).toFixed(2)}% (${(balanced.validationDelta.within1mm * 100).toFixed(2)} pp)`,
    "",
    "## Threshold-safe Candidate",
    "",
    `- key: \`${thresholdSafe.key}\``,
    `- MAE: ${thresholdSafe.validation.mae.toFixed(6)} mm (${thresholdSafe.validationDelta.mae.toFixed(6)})`,
    `- Threshold-state Agreement: ${(thresholdSafe.validation.thresholdAgreement * 100).toFixed(2)}% (${(
      thresholdSafe.validationDelta.thresholdAgreement * 100
    ).toFixed(2)} pp)`,
    "",
    "## Boundary",
    "",
    "- This screen fits correction from train-set artifact predictions, so it is only a fast direction test.",
    "- A formal promoted version must use chronological OOF residual correction inside the model-card builder.",
    ""
  ].join("\n");
}

function selectChallengers(challengers, baselineValidation) {
  const bestMae = challengers[0];
  const betterThanBaseline = challengers.filter(
    (candidate) => candidate.validation.mae < baselineValidation.mae && candidate.validation.rmse < baselineValidation.rmse
  );
  const balanced =
    betterThanBaseline
      .filter((candidate) => candidate.validation.within1mm >= baselineValidation.within1mm)
      .sort((left, right) => {
        if (left.validation.mae !== right.validation.mae) return left.validation.mae - right.validation.mae;
        if (left.validation.rmse !== right.validation.rmse) return left.validation.rmse - right.validation.rmse;
        return right.validation.r2 - left.validation.r2;
      })[0] ?? bestMae;
  const thresholdSafe =
    betterThanBaseline
      .filter((candidate) => candidate.validation.thresholdAgreement >= baselineValidation.thresholdAgreement)
      .sort((left, right) => {
        if (left.validation.thresholdAgreement !== right.validation.thresholdAgreement) {
          return right.validation.thresholdAgreement - left.validation.thresholdAgreement;
        }
        return left.validation.mae - right.validation.mae;
      })[0] ?? balanced;
  return { bestMae, balanced, thresholdSafe };
}

function artifactFromCandidate(baseArtifact, candidate, role) {
  const modelVersion = role === "balanced" ? "0.21.0" : role === "bestMae" ? "0.21.0-mae" : "0.21.0-threshold";
  const displaySuffix = role === "balanced" ? "BALANCED" : role === "bestMae" ? "MAE" : "THRESHOLD";
  return {
    ...baseArtifact,
    modelKey: `baijiabao.displacement.pointwise-fixed-expert-ensemble-postcalibrated-${role}-v21`,
    modelVersion,
    displayName: `BJB-DP-ENS-POSTCAL-${displaySuffix}-v21`,
    model: {
      modelType: "calibrated_prediction_regression_v1",
      featureKeys: baseArtifact.model.featureKeys,
      baseModel: baseArtifact.model,
      calibration: {
        method: `train-fit-postcalibration+regime-residual-${candidate.key}`,
        intercept: 0,
        slope: 1,
        residualCorrection: {
          method: "train-fit-regime-residual-challenger",
          key: candidate.key,
          dimensions: candidate.correction.dimensions,
          minCount: candidate.correction.minCount,
          shrinkage: candidate.correction.shrinkage,
          maxAbsBias: candidate.correction.maxAbsBias,
          correctionScale: candidate.correction.correctionScale,
          fallbackBias: candidate.correction.fallbackBias,
          biases: candidate.correction.biases,
          summaries: candidate.correction.summaries
        }
      }
    },
    validationMetrics: {
      count: candidate.validation.count,
      mae: candidate.validation.mae,
      rmse: candidate.validation.rmse,
      r2: candidate.validation.r2,
      directionAccuracy: candidate.validation.directionAccuracy,
      withinToleranceAccuracy: candidate.validation.within1mm,
      thresholdAgreementAccuracy: candidate.validation.thresholdAgreement,
      thresholdRecall: candidate.validation.thresholdRecall,
      thresholdPrecision: candidate.validation.thresholdPrecision,
      p50AbsError: candidate.validation.p50AbsError,
      p90AbsError: candidate.validation.p90AbsError,
      maxAbsError: candidate.validation.maxAbsError
    },
    metadata: {
      ...(baseArtifact.metadata ?? {}),
      displayName: `BJB-DP-ENS-POSTCAL-${displaySuffix}-v21`,
      modelFamily: "postcalibrated-v14-regime-residual-challenger",
      featureFamily: "same-as-v14-required-runtime-features",
      selectionProfile: role,
      baseModelKey: baseArtifact.modelKey,
      baseModelVersion: baseArtifact.modelVersion,
      postCalibration: {
        caveat: "Correction was fitted from train-set artifact predictions as a fast challenger. Promote only after full chronological OOF integration.",
        key: candidate.key,
        dimensions: candidate.dimensions,
        validationDelta: candidate.validationDelta
      },
      validationSummary: {
        mae: candidate.validation.mae,
        rmse: candidate.validation.rmse,
        r2: candidate.validation.r2,
        withinToleranceAccuracy: candidate.validation.within1mm,
        thresholdAgreementAccuracy: candidate.validation.thresholdAgreement,
        p90AbsError: candidate.validation.p90AbsError
      }
    }
  };
}

async function main() {
  const artifact = await readJson(ARTIFACT);
  const trainSamples = await readJsonl(TRAIN);
  const validationSamples = await readJsonl(VALIDATION);
  const train = rowsFromSamples(trainSamples, artifact);
  const validation = rowsFromSamples(validationSamples, artifact);
  for (const row of train.rows) row.baselinePrediction = row.basePrediction;
  for (const row of validation.rows) row.baselinePrediction = row.basePrediction;
  const baseline = {
    train: roundMetrics(metrics(train.rows, "baselinePrediction")),
    validation: roundMetrics(metrics(validation.rows, "baselinePrediction")),
    skippedTrain: train.skipped,
    skippedValidation: validation.skipped
  };

  const challengers = ALL_CHALLENGER_CONFIGS.map((config) => {
    const correction = fitCorrection(train.rows, config);
    const trainRows = train.rows.map((row) => ({ ...row, challengerPrediction: applyCorrection(row, correction) }));
    const validationRows = validation.rows.map((row) => ({ ...row, challengerPrediction: applyCorrection(row, correction) }));
    const trainMetrics = roundMetrics(metrics(trainRows, "challengerPrediction"));
    const validationMetrics = roundMetrics(metrics(validationRows, "challengerPrediction"));
    return {
      key: config.key,
      dimensions: config.dimensions,
      minCount: config.minCount,
      shrinkage: config.shrinkage,
      maxAbsBias: config.maxAbsBias,
      correctionScale: config.correctionScale,
      biasCount: Object.keys(correction.biases).length,
      fallbackBias: correction.fallbackBias,
      train: trainMetrics,
      validation: validationMetrics,
      validationDelta: {
        mae: validationMetrics.mae - baseline.validation.mae,
        rmse: validationMetrics.rmse - baseline.validation.rmse,
        r2: validationMetrics.r2 - baseline.validation.r2,
        within1mm: validationMetrics.within1mm - baseline.validation.within1mm,
        thresholdAgreement: validationMetrics.thresholdAgreement - baseline.validation.thresholdAgreement,
        p90AbsError: validationMetrics.p90AbsError - baseline.validation.p90AbsError
      },
      correction
    };
  }).sort((left, right) => {
    if (left.validation.mae !== right.validation.mae) return left.validation.mae - right.validation.mae;
    if (left.validation.rmse !== right.validation.rmse) return left.validation.rmse - right.validation.rmse;
    return right.validation.r2 - left.validation.r2;
  });

  const selectedChallengers = selectChallengers(challengers, baseline.validation);
  const selectedArtifacts = Object.fromEntries(
    Object.entries(selectedChallengers).map(([role, candidate]) => [role, artifactFromCandidate(artifact, candidate, role)])
  );

  const report = {
    generatedAt: new Date().toISOString(),
    artifact: ARTIFACT,
    trainSamples: TRAIN,
    validationSamples: VALIDATION,
    modelKey: artifact.modelKey,
    modelVersion: artifact.modelVersion,
    baseline,
    selectedChallengers,
    leaderboard: challengers.map(({ correction, ...candidate }) => candidate)
  };

  await mkdir(OUT_DIR, { recursive: true });
  await writeJson(path.join(OUT_DIR, "baijiabao-displacement-postcalibration-challengers.report.json"), report);
  await writeText(path.join(OUT_DIR, "baijiabao-displacement-postcalibration-challengers.report.md"), renderMarkdown(report));
  for (const [role, selectedArtifact] of Object.entries(selectedArtifacts)) {
    await writeJson(path.join(OUT_DIR, `baijiabao-displacement-v21-${role}.prediction-regression-v1.json`), selectedArtifact);
  }
  await writeText(
    path.join(OUT_DIR, "baijiabao-displacement-postcalibration-challengers.leaderboard.csv"),
    toCsv(
      report.leaderboard.map((row) => ({
        key: row.key,
        dimensions: row.dimensions.join("+") || "global",
        biasCount: row.biasCount,
        validationMae: row.validation.mae,
        validationRmse: row.validation.rmse,
        validationR2: row.validation.r2,
        validationWithin1mm: row.validation.within1mm,
        validationThresholdAgreement: row.validation.thresholdAgreement,
        deltaMae: row.validationDelta.mae,
        deltaRmse: row.validationDelta.rmse,
        deltaR2: row.validationDelta.r2,
        deltaWithin1mm: row.validationDelta.within1mm,
        deltaThresholdAgreement: row.validationDelta.thresholdAgreement
      })),
      [
        "key",
        "dimensions",
        "biasCount",
        "validationMae",
        "validationRmse",
        "validationR2",
        "validationWithin1mm",
        "validationThresholdAgreement",
        "deltaMae",
        "deltaRmse",
        "deltaR2",
        "deltaWithin1mm",
        "deltaThresholdAgreement"
      ]
    )
  );
  console.log(JSON.stringify({
    baseline: report.baseline.validation,
    best: {
      key: report.selectedChallengers.bestMae.key,
      dimensions: report.selectedChallengers.bestMae.dimensions,
      validation: report.selectedChallengers.bestMae.validation,
      delta: report.selectedChallengers.bestMae.validationDelta
    },
    balanced: {
      key: report.selectedChallengers.balanced.key,
      dimensions: report.selectedChallengers.balanced.dimensions,
      validation: report.selectedChallengers.balanced.validation,
      delta: report.selectedChallengers.balanced.validationDelta
    },
    report: path.join(OUT_DIR, "baijiabao-displacement-postcalibration-challengers.report.json")
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
