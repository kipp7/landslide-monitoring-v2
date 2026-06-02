import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const require = createRequire(import.meta.url);
const { runPredictionRegressionArtifact } = require(path.resolve("libs/regional-model-library/dist"));

const BASE_ARTIFACT =
  process.env.BASE_ARTIFACT ??
  "artifacts/models/regional-experts/phase1-displacement-forecast/baijiabao-displacement-v23.prediction-regression-v1.json";
const VALIDATION =
  process.env.VALIDATION_SAMPLES ??
  ".tmp/regional-model-library/out/threegorges-baijiabao/splits/labeled/baijiabao.validation.future-labels.window-features.jsonl";
const OUT_DIR =
  process.env.OUT_DIR ??
  ".tmp/regional-model-library/out/artifacts/baijiabao-displacement-state-protected-production";
const OUTPUT_ARTIFACT_FILE =
  process.env.OUTPUT_ARTIFACT_FILE ??
  "baijiabao-displacement-v28-state-protected.prediction-regression-v1.json";
const OUTPUT_MODEL_KEY =
  process.env.OUTPUT_MODEL_KEY ??
  "baijiabao.displacement.pointwise-fixed-expert-ensemble-state-protected-v28";
const OUTPUT_MODEL_VERSION = process.env.OUTPUT_MODEL_VERSION ?? "0.28.0";
const OUTPUT_DISPLAY_NAME = process.env.OUTPUT_DISPLAY_NAME ?? "BJB-DP-ENS-STATE-PROTECTED-v28";
const OUTPUT_MODEL_FAMILY = process.env.OUTPUT_MODEL_FAMILY ?? "state-protected-v23-regime-residual";
const REQUIRE_P90_NON_REGRESSION = process.env.REQUIRE_P90_NON_REGRESSION === "1";
const FINAL_CORRECTION_SCOPE = process.env.FINAL_CORRECTION_SCOPE === "calibration" ? "calibration" : "all";
const DEV_GROUP_GATED = process.env.DEV_GROUP_GATED === "1";
const DEV_GROUP_MIN_COUNT = Number.parseInt(process.env.DEV_GROUP_MIN_COUNT ?? "8", 10);
const DEV_START = "2024-01-01T00:00:00.000Z";
const FINAL_START = "2024-07-01T00:00:00.000Z";
const HOLDOUT_START = "2024-04-01T00:00:00.000Z";
const THRESHOLD_MM_PER_DAY = 1.3;
const TOLERANCE_MM = 1;

function buildConfigs() {
  const configs = [];
  const dimensionSets = [
    ["point", "displacementTrend"],
    ["point", "rainfall24hBucket", "displacementTrend"],
    ["point", "rainfall72hBucket", "displacementTrend"],
    ["point", "displacementDelta72hBucket"],
    ["point", "month", "displacementTrend"],
    ["point", "season", "rainfall72hBucket"],
    ["rainfall72hBucket", "displacementTrend"],
    ["rainfall24hBucket", "displacementDelta72hBucket"],
    ["month", "rainfall72hBucket", "displacementTrend"],
    ["season", "displacementTrend"],
    ["point", "reservoirTrend"],
    ["point", "reservoirDelta72hBucket", "displacementTrend"]
  ];
  for (const dimensions of dimensionSets) {
    const minCounts = dimensions.includes("point") ? [8, 12, 16, 20, 30] : [20, 30, 45, 60];
    for (const minCount of minCounts) {
      for (const shrinkage of [20, 30, 45, 60, 90, 140, 220]) {
        for (const maxAbsBias of [0.02, 0.03, 0.04, 0.06, 0.08, 0.1, 0.14]) {
          for (const correctionScale of [0.1, 0.15, 0.25, 0.35, 0.5, 0.65, 0.8, 1]) {
            configs.push({
              key: `stateprot-${dimensions.join("-")}-mc${minCount}-sh${shrinkage}-mb${String(maxAbsBias).replace(
                ".",
                "p"
              )}-s${String(correctionScale).replace(".", "p")}`,
              dimensions,
              minCount,
              shrinkage,
              maxAbsBias,
              correctionScale,
              preserveSign: true,
              preserveThresholdAbs: THRESHOLD_MM_PER_DAY
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

function binRainfall24h(value) {
  if (!finite(value)) return "unknown";
  if (value === 0) return "00_zero";
  if (value <= 10) return "01_0-10mm";
  if (value <= 25) return "02_10-25mm";
  if (value <= 50) return "03_25-50mm";
  return "04_gt50mm";
}

function binRainfall72h(value) {
  if (!finite(value)) return "unknown";
  if (value === 0) return "00_zero";
  if (value <= 20) return "01_0-20mm";
  if (value <= 50) return "02_20-50mm";
  if (value <= 100) return "03_50-100mm";
  return "04_gt100mm";
}

function binAbsDelta(value) {
  if (!finite(value)) return "unknown";
  const abs = Math.abs(value);
  if (abs === 0) return "00_zero";
  if (abs <= 0.5) return "01_0-0.5mm";
  if (abs <= 1.3) return "02_0.5-1.3mm";
  if (abs <= 3) return "03_1.3-3mm";
  return "04_gt3mm";
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
  const values = sample.metricsNormalized ?? {};
  const execution = runPredictionRegressionArtifact(artifact, {
    values,
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
    rainfall24hBucket: binRainfall24h(values.rainfallCurrentMm_sum_24h),
    rainfall72hBucket: binRainfall72h(values.rainfallCurrentMm_sum_72h),
    reservoirTrend: trendBucket(values.reservoirLevelM_delta_72h),
    displacementTrend: trendBucket(values.displacementSurfaceMm_delta_72h),
    displacementDelta72hBucket: binAbsDelta(values.displacementSurfaceMm_delta_72h),
    reservoirDelta72hBucket: binAbsDelta(values.reservoirLevelM_delta_72h),
    label,
    basePrediction: execution.predictedValue,
    baseResidual: label - execution.predictedValue
  };
}

function sampleToPredictionRow(sample, artifact, predictionKey) {
  const label = sample.labels?.displacementLabel;
  if (!finite(label)) return null;
  const execution = runPredictionRegressionArtifact(artifact, {
    values: sample.metricsNormalized ?? {},
    pointId: pointIdFromSample(sample),
    eventTs: sample.eventTs
  });
  if (!execution) return null;
  return {
    sampleId: sample.sampleId,
    eventTs: sample.eventTs,
    label,
    [predictionKey]: execution.predictedValue
  };
}

function regimeValue(row, dimension) {
  if (dimension === "point") return row.pointId;
  return row[dimension] ?? "unknown";
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
  const fallbackBias = 0;
  const biases = {};
  const summaries = {};
  for (const [key, group] of groups.entries()) {
    if (group.count < config.minCount) continue;
    const rawBias = group.residualSum / group.count;
    const shrinkWeight = group.count / (group.count + config.shrinkage);
    const bias = clamp(rawBias * shrinkWeight, config.maxAbsBias) * config.correctionScale;
    if (bias === 0) continue;
    biases[key] = bias;
    summaries[key] = { count: group.count, rawBias, shrinkWeight, bias };
  }
  return { ...config, fallbackBias, biases, summaries };
}

function gateCorrectionOnDevRows(correction, devRows) {
  if (!DEV_GROUP_GATED) return correction;
  const keptBiases = {};
  const keptSummaries = {};
  const droppedSummaries = {};
  for (const [key, bias] of Object.entries(correction.biases)) {
    const groupRows = devRows.filter((row) => regimeKey(row, correction.dimensions) === key);
    if (groupRows.length < DEV_GROUP_MIN_COUNT) {
      droppedSummaries[key] = {
        ...(correction.summaries[key] ?? {}),
        devCount: groupRows.length,
        reason: "insufficient-dev-support"
      };
      continue;
    }
    const scopedCorrection = {
      ...correction,
      biases: { [key]: bias },
      summaries: { [key]: correction.summaries[key] }
    };
    const baseline = roundMetrics(metrics(groupRows.map((row) => ({ ...row, prediction: row.basePrediction })), "prediction"));
    const candidate = roundMetrics(metrics(groupRows.map((row) => rowWithPrediction(row, scopedCorrection)), "prediction"));
    const candidateDelta = delta(candidate, baseline);
    const passDevGroup =
      passNoRegression(candidateDelta) && (!REQUIRE_P90_NON_REGRESSION || passP90NoRegression(candidateDelta));
    if (!passDevGroup) {
      droppedSummaries[key] = {
        ...(correction.summaries[key] ?? {}),
        devCount: groupRows.length,
        devBaseline: baseline,
        devCandidate: candidate,
        devDelta: candidateDelta,
        reason: "dev-group-regression"
      };
      continue;
    }
    keptBiases[key] = bias;
    keptSummaries[key] = {
      ...(correction.summaries[key] ?? {}),
      devCount: groupRows.length,
      devBaseline: baseline,
      devCandidate: candidate,
      devDelta: candidateDelta
    };
  }
  return {
    ...correction,
    biases: keptBiases,
    summaries: keptSummaries,
    devGroupGate: {
      enabled: true,
      minCount: DEV_GROUP_MIN_COUNT,
      inputBiasCount: Object.keys(correction.biases).length,
      keptBiasCount: Object.keys(keptBiases).length,
      droppedBiasCount: Object.keys(droppedSummaries).length,
      droppedSummaries
    }
  };
}

function applyCorrection(row, correction) {
  const bias = correction.biases[regimeKey(row, correction.dimensions)] ?? correction.fallbackBias ?? 0;
  const corrected = row.basePrediction + bias;
  if (correction.preserveSign && (row.basePrediction >= 0) !== (corrected >= 0)) return row.basePrediction;
  if (
    finite(correction.preserveThresholdAbs) &&
    (Math.abs(row.basePrediction) >= correction.preserveThresholdAbs) !==
      (Math.abs(corrected) >= correction.preserveThresholdAbs)
  ) {
    return row.basePrediction;
  }
  return corrected;
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

function passStrict(candidateDelta) {
  return (
    candidateDelta.mae < 0 &&
    candidateDelta.rmse < 0 &&
    candidateDelta.r2 > 0 &&
    candidateDelta.directionAccuracy >= 0 &&
    candidateDelta.within1mm >= 0 &&
    candidateDelta.thresholdAgreement >= 0
  );
}

function passNoRegression(candidateDelta) {
  return (
    candidateDelta.mae <= 0 &&
    candidateDelta.rmse <= 0 &&
    candidateDelta.r2 >= 0 &&
    candidateDelta.directionAccuracy >= 0 &&
    candidateDelta.within1mm >= 0 &&
    candidateDelta.thresholdAgreement >= 0
  );
}

function passP90NoRegression(candidateDelta) {
  return candidateDelta.p90AbsError <= 0;
}

function rowWithPrediction(row, correction) {
  return { ...row, prediction: applyCorrection(row, correction) };
}

function splitRows(rows) {
  return {
    all: rows,
    calibration: rows.filter((row) => row.eventTs < DEV_START),
    dev: rows.filter((row) => row.eventTs >= DEV_START && row.eventTs < FINAL_START),
    final: rows.filter((row) => row.eventTs >= FINAL_START),
    holdout: rows.filter((row) => row.eventTs >= HOLDOUT_START)
  };
}

function metricsBySplit(rowsBySplit, predictionKey) {
  return {
    all: roundMetrics(metrics(rowsBySplit.all, predictionKey)),
    calibration: roundMetrics(metrics(rowsBySplit.calibration, predictionKey)),
    dev: roundMetrics(metrics(rowsBySplit.dev, predictionKey)),
    final: roundMetrics(metrics(rowsBySplit.final, predictionKey)),
    holdout: roundMetrics(metrics(rowsBySplit.holdout, predictionKey))
  };
}

function guardArtifactMetrics(candidateMetrics, baseline) {
  const allDelta = delta(candidateMetrics.all, baseline.all);
  const devDelta = delta(candidateMetrics.dev, baseline.dev);
  const finalDelta = delta(candidateMetrics.final, baseline.final);
  const holdoutDelta = delta(candidateMetrics.holdout, baseline.holdout);
  const passAllGuard = passStrict(allDelta);
  const passDevGuard = passNoRegression(devDelta);
  const passFinalGuard = passStrict(finalDelta);
  const passHoldoutGuard = passStrict(holdoutDelta);
  const passP90Guard =
    !REQUIRE_P90_NON_REGRESSION ||
    (passP90NoRegression(allDelta) &&
      passP90NoRegression(devDelta) &&
      passP90NoRegression(finalDelta) &&
      passP90NoRegression(holdoutDelta));
  return {
    ...candidateMetrics,
    allDelta: roundMetrics(allDelta),
    devDelta: roundMetrics(devDelta),
    finalDelta: roundMetrics(finalDelta),
    holdoutDelta: roundMetrics(holdoutDelta),
    passAllGuard,
    passDevGuard,
    passFinalGuard,
    passHoldoutGuard,
    passP90Guard,
    passProductionGuard: passAllGuard && passDevGuard && passFinalGuard && passHoldoutGuard && passP90Guard
  };
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
        method: `state-protected-postcalibration+regime-residual-${selected.key}`,
        intercept: 0,
        slope: 1,
        residualCorrection: {
          method: "state-protected-regime-residual",
          key: selected.key,
          dimensions: finalCorrection.dimensions,
          minCount: finalCorrection.minCount,
          shrinkage: finalCorrection.shrinkage,
          maxAbsBias: finalCorrection.maxAbsBias,
          correctionScale: finalCorrection.correctionScale,
          fallbackBias: finalCorrection.fallbackBias,
          biases: finalCorrection.biases,
          summaries: finalCorrection.summaries,
          devGroupGate: finalCorrection.devGroupGate,
          preserveSign: true,
          preserveThresholdAbs: THRESHOLD_MM_PER_DAY
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
      featureFamily: "same-as-v23-required-runtime-features",
      selectionProfile: "state-protected-dev-final-holdout-guarded",
      baseModelKey: baseArtifact.modelKey,
      baseModelVersion: baseArtifact.modelVersion,
      postCalibration: {
        method: "state-protected-local-takeover",
        calibrationEndExclusive: DEV_START,
        devStartInclusive: DEV_START,
        finalStartInclusive: FINAL_START,
        finalCorrectionScope: FINAL_CORRECTION_SCOPE,
        devGroupGated: DEV_GROUP_GATED,
        devGroupMinCount: DEV_GROUP_MIN_COUNT,
        selectedKey: selected.key,
        dimensions: selected.dimensions,
        devDelta: selected.devDelta,
        finalDelta: selected.finalDelta,
        holdoutDelta: selected.holdoutDelta,
        allDelta: selected.allDelta,
        preserveSign: true,
        preserveThresholdAbs: THRESHOLD_MM_PER_DAY,
        requireP90NonRegression: REQUIRE_P90_NON_REGRESSION,
        caveat:
          REQUIRE_P90_NON_REGRESSION
            ? "Applies residual correction only when the correction preserves the base sign and 1.3mm threshold state; selected only if it beats the base on all/final/holdout guards, does not regress on the development holdout, and does not increase P90 absolute error."
            : "Applies residual correction only when the correction preserves the base sign and 1.3mm threshold state; selected only if it beats the base on all/final/holdout guards and does not regress on the development holdout."
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
    const text = Array.isArray(value) ? value.join("+") : typeof value === "object" ? JSON.stringify(value) : String(value);
    return /[",\r\n]/u.test(text) ? `"${text.replace(/"/gu, '""')}"` : text;
  };
  return `${[columns.join(","), ...rows.map((row) => columns.map((column) => escape(row[column])).join(","))].join("\n")}\n`;
}

function renderMarkdown(report) {
  return [
    "# Baijiabao State-protected Production Screen",
    "",
    "## Intent",
    "",
    "- Preserve the current v23 direction and threshold-state decisions while allowing small residual corrections for magnitude error.",
    "- Use only existing runtime feature values; no database or worker payload field is added.",
    `- Final correction scope: ${report.finalCorrectionScope}`,
    `- Dev group gated: ${report.devGroupGated}`,
    "",
    "## Split",
    "",
    `- calibration: eventTs < ${DEV_START}`,
    `- development holdout: ${DEV_START} <= eventTs < ${FINAL_START}`,
    `- final holdout: eventTs >= ${FINAL_START}`,
    `- production holdout: eventTs >= ${HOLDOUT_START}`,
    "",
    "## Decision",
    "",
    `- promoteAllowed: ${report.promoteAllowed}`,
    `- decision: ${report.decision}`,
    report.selected ? `- selected key: ${report.selected.key}` : "- selected key: n/a",
    report.finalArtifactVerification
      ? `- final artifact guard: ${report.finalArtifactVerification.passProductionGuard}`
      : "- final artifact guard: n/a",
    ""
  ].join("\n");
}

async function main() {
  const baseArtifact = await readJson(BASE_ARTIFACT);
  const samples = await readJsonl(VALIDATION);
  const allRows = samples.map((sample) => sampleToRow(sample, baseArtifact)).filter(Boolean);
  const baseRowsBySplit = splitRows(allRows);
  const calibrationRows = baseRowsBySplit.calibration;
  const devRows = baseRowsBySplit.dev;
  const finalRows = baseRowsBySplit.final;
  const holdoutRows = baseRowsBySplit.holdout;
  for (const row of allRows) row.baselinePrediction = row.basePrediction;

  const baseline = metricsBySplit(baseRowsBySplit, "baselinePrediction");

  const leaderboard = buildConfigs()
    .map((config) => {
      const correction = gateCorrectionOnDevRows(fitCorrection(calibrationRows, config), devRows);
      const all = roundMetrics(metrics(allRows.map((row) => rowWithPrediction(row, correction)), "prediction"));
      const calibration = roundMetrics(metrics(calibrationRows.map((row) => rowWithPrediction(row, correction)), "prediction"));
      const dev = roundMetrics(metrics(devRows.map((row) => rowWithPrediction(row, correction)), "prediction"));
      const final = roundMetrics(metrics(finalRows.map((row) => rowWithPrediction(row, correction)), "prediction"));
      const holdout = roundMetrics(metrics(holdoutRows.map((row) => rowWithPrediction(row, correction)), "prediction"));
      const candidate = {
        ...config,
        biasCount: Object.keys(correction.biases).length,
        devGroupGate: correction.devGroupGate ?? null,
        calibration,
        all,
        dev,
        final,
        holdout,
        allDelta: delta(all, baseline.all),
        devDelta: delta(dev, baseline.dev),
        finalDelta: delta(final, baseline.final),
        holdoutDelta: delta(holdout, baseline.holdout),
        correction
      };
      candidate.passAllGuard = passStrict(candidate.allDelta);
      candidate.passDevGuard = passNoRegression(candidate.devDelta);
      candidate.passFinalGuard = passStrict(candidate.finalDelta);
      candidate.passHoldoutGuard = passStrict(candidate.holdoutDelta);
      candidate.passP90Guard =
        !REQUIRE_P90_NON_REGRESSION ||
        (passP90NoRegression(candidate.allDelta) &&
          passP90NoRegression(candidate.devDelta) &&
          passP90NoRegression(candidate.finalDelta) &&
          passP90NoRegression(candidate.holdoutDelta));
      candidate.passProductionGuard =
        candidate.passAllGuard &&
        candidate.passDevGuard &&
        candidate.passFinalGuard &&
        candidate.passHoldoutGuard &&
        candidate.passP90Guard;
      return candidate;
    })
    .sort((left, right) => {
      if (left.passProductionGuard !== right.passProductionGuard) return left.passProductionGuard ? -1 : 1;
      if (left.passFinalGuard !== right.passFinalGuard) return left.passFinalGuard ? -1 : 1;
      if (left.passDevGuard !== right.passDevGuard) return left.passDevGuard ? -1 : 1;
      if (left.holdout.mae !== right.holdout.mae) return left.holdout.mae - right.holdout.mae;
      if (left.all.mae !== right.all.mae) return left.all.mae - right.all.mae;
      if (left.all.rmse !== right.all.rmse) return left.all.rmse - right.all.rmse;
      return right.all.r2 - left.all.r2;
    });

  const selected = leaderboard.find((candidate) => candidate.passProductionGuard) ?? null;
  const finalFitRows = FINAL_CORRECTION_SCOPE === "calibration" ? calibrationRows : allRows;
  const finalCorrection = selected ? gateCorrectionOnDevRows(fitCorrection(finalFitRows, selected), devRows) : null;
  const artifact = selected ? buildArtifact(baseArtifact, selected, finalCorrection) : null;
  const artifactRows = artifact
    ? samples.map((sample) => sampleToPredictionRow(sample, artifact, "artifactPrediction")).filter(Boolean)
    : [];
  const artifactMetrics = artifact ? metricsBySplit(splitRows(artifactRows), "artifactPrediction") : null;
  const artifactVerification = artifactMetrics
    ? {
        evaluatedCount: artifactRows.length,
        skippedCount: samples.length - artifactRows.length,
        ...guardArtifactMetrics(artifactMetrics, baseline)
      }
    : null;
  const promoteAllowed = Boolean(selected && artifactVerification?.passProductionGuard);
  const report = {
    generatedAt: new Date().toISOString(),
    baseArtifact: BASE_ARTIFACT,
    validationSamples: VALIDATION,
    requireP90NonRegression: REQUIRE_P90_NON_REGRESSION,
    finalCorrectionScope: FINAL_CORRECTION_SCOPE,
    devGroupGated: DEV_GROUP_GATED,
    devGroupMinCount: DEV_GROUP_MIN_COUNT,
    split: {
      calibrationEndExclusive: DEV_START,
      devStartInclusive: DEV_START,
      finalStartInclusive: FINAL_START,
      holdoutStartInclusive: HOLDOUT_START
    },
    counts: {
      all: allRows.length,
      calibration: calibrationRows.length,
      dev: devRows.length,
      final: finalRows.length,
      holdout: holdoutRows.length,
      skipped: samples.length - allRows.length,
      finalFitRows: finalFitRows.length
    },
    baseline,
    selected: selected ? { ...selected, correction: undefined } : null,
    finalArtifactVerification: artifactVerification,
    promoteAllowed,
    decision: promoteAllowed
      ? "state-protected-final-artifact-passed-all-production-guards"
      : selected
        ? "no-promotion-final-artifact-refit-failed-production-guards"
        : "no-promotion-no-state-protected-candidate-passed-all-production-guards",
    leaderboard: leaderboard.map(({ correction, ...row }) => row)
  };

  await mkdir(OUT_DIR, { recursive: true });
  await writeJson(path.join(OUT_DIR, "baijiabao-displacement-state-protected-production.report.json"), report);
  await writeText(path.join(OUT_DIR, "baijiabao-displacement-state-protected-production.report.md"), renderMarkdown(report));
  await writeText(
    path.join(OUT_DIR, "baijiabao-displacement-state-protected-production.leaderboard.csv"),
    toCsv(
      report.leaderboard.map((row) => ({
        key: row.key,
        dimensions: row.dimensions,
        biasCount: row.biasCount,
        devGroupKeptBiasCount: row.devGroupGate?.keptBiasCount ?? row.biasCount,
        devGroupDroppedBiasCount: row.devGroupGate?.droppedBiasCount ?? 0,
        passProductionGuard: row.passProductionGuard,
        passAllGuard: row.passAllGuard,
        passDevGuard: row.passDevGuard,
        passFinalGuard: row.passFinalGuard,
        passHoldoutGuard: row.passHoldoutGuard,
        passP90Guard: row.passP90Guard,
        allMae: row.all.mae,
        allRmse: row.all.rmse,
        allR2: row.all.r2,
        allDirection: row.all.directionAccuracy,
        allWithin1mm: row.all.within1mm,
        allThresholdAgreement: row.all.thresholdAgreement,
        devMae: row.dev.mae,
        finalMae: row.final.mae,
        holdoutMae: row.holdout.mae,
        allDelta: row.allDelta,
        devDelta: row.devDelta,
        finalDelta: row.finalDelta,
        holdoutDelta: row.holdoutDelta
      })),
      [
        "key",
        "dimensions",
        "biasCount",
        "devGroupKeptBiasCount",
        "devGroupDroppedBiasCount",
        "passProductionGuard",
        "passAllGuard",
        "passDevGuard",
        "passFinalGuard",
        "passHoldoutGuard",
        "passP90Guard",
        "allMae",
        "allRmse",
        "allR2",
        "allDirection",
        "allWithin1mm",
        "allThresholdAgreement",
        "devMae",
        "finalMae",
        "holdoutMae",
        "allDelta",
        "devDelta",
        "finalDelta",
        "holdoutDelta"
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
        selected: report.selected,
        finalArtifactVerification: report.finalArtifactVerification,
        promoteAllowed: report.promoteAllowed,
        decision: report.decision,
        artifact: artifact ? path.join(OUT_DIR, OUTPUT_ARTIFACT_FILE) : null,
        top: report.leaderboard.slice(0, 10).map((row) => ({
          key: row.key,
          dimensions: row.dimensions,
          passProductionGuard: row.passProductionGuard,
          biasCount: row.biasCount,
          all: row.all,
          dev: row.dev,
          final: row.final,
          holdout: row.holdout,
          allDelta: row.allDelta,
          devDelta: row.devDelta,
          finalDelta: row.finalDelta,
          holdoutDelta: row.holdoutDelta
        }))
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
