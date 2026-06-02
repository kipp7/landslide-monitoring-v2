import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const require = createRequire(import.meta.url);
const { runPredictionRegressionArtifact, listMissingPredictionRegressionFeatures } = require(path.resolve(
  "libs/regional-model-library/dist"
));

const DEFAULT_ARTIFACT =
  "artifacts/models/regional-experts/phase1-displacement-forecast/baijiabao-displacement-v14.prediction-regression-v1.json";
const DEFAULT_VALIDATION =
  ".tmp/regional-model-library/out/threegorges-baijiabao/splits/labeled/baijiabao.validation.future-labels.window-features.jsonl";
const DEFAULT_OUT_DIR =
  "E:/学校/02 项目/04 各种比赛/03 计算机大赛/02_山体滑坡/测试与证明材料/04_AI模型测试证明/quantified-model-materials/error-decomposition";
const THRESHOLD_MM_PER_DAY = 1.3;
const TOLERANCE_MM = 1;

function parseArgs(argv) {
  const parsed = {
    artifact: DEFAULT_ARTIFACT,
    validationSamples: DEFAULT_VALIDATION,
    outDir: DEFAULT_OUT_DIR
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--artifact") parsed.artifact = argv[++index] ?? parsed.artifact;
    if (token === "--validation-samples") parsed.validationSamples = argv[++index] ?? parsed.validationSamples;
    if (token === "--out-dir") parsed.outDir = argv[++index] ?? parsed.outDir;
  }
  return parsed;
}

async function readJsonl(filePath) {
  const text = await readFile(filePath, "utf-8");
  return text
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf-8"));
}

async function writeJson(filePath, payload) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
}

async function writeText(filePath, payload) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, payload, "utf-8");
}

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
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

function pct(value) {
  return value === null || value === undefined ? "" : `${(value * 100).toFixed(2)}%`;
}

function rounded(value, digits = 6) {
  return value === null || value === undefined || !Number.isFinite(value) ? null : Number(value.toFixed(digits));
}

function monthFromTs(eventTs) {
  const month = new Date(eventTs).getUTCMonth() + 1;
  return Number.isFinite(month) && month >= 1 && month <= 12 ? String(month).padStart(2, "0") : "unknown";
}

function seasonFromMonth(month) {
  if (["03", "04", "05"].includes(month)) return "spring";
  if (["06", "07", "08"].includes(month)) return "summer";
  if (["09", "10", "11"].includes(month)) return "autumn";
  if (["12", "01", "02"].includes(month)) return "winter";
  return "unknown";
}

function signBucket(value, epsilon = 0.05) {
  const number = finiteNumber(value);
  if (number === null) return "unknown";
  if (number > epsilon) return "rising";
  if (number < -epsilon) return "falling";
  return "stable";
}

function binRainfall24h(value) {
  const number = finiteNumber(value);
  if (number === null) return "unknown";
  if (number === 0) return "00_zero";
  if (number <= 10) return "01_0-10mm";
  if (number <= 25) return "02_10-25mm";
  if (number <= 50) return "03_25-50mm";
  return "04_gt50mm";
}

function binRainfall72h(value) {
  const number = finiteNumber(value);
  if (number === null) return "unknown";
  if (number === 0) return "00_zero";
  if (number <= 20) return "01_0-20mm";
  if (number <= 50) return "02_20-50mm";
  if (number <= 100) return "03_50-100mm";
  return "04_gt100mm";
}

function binAbsLabel(value) {
  const number = finiteNumber(value);
  if (number === null) return "unknown";
  const abs = Math.abs(number);
  if (abs === 0) return "00_zero";
  if (abs <= 0.5) return "01_0-0.5mm";
  if (abs < THRESHOLD_MM_PER_DAY) return "02_0.5-1.3mm";
  if (abs <= 3) return "03_1.3-3mm";
  return "04_gt3mm";
}

function binAbsDelta(value) {
  const number = finiteNumber(value);
  if (number === null) return "unknown";
  const abs = Math.abs(number);
  if (abs === 0) return "00_zero";
  if (abs <= 0.5) return "01_0-0.5mm";
  if (abs <= 1.3) return "02_0.5-1.3mm";
  if (abs <= 3) return "03_1.3-3mm";
  return "04_gt3mm";
}

function rawPointId(sample) {
  return (
    sample.rawRef?.originalFields?.point_id ??
    sample.rawRef?.originalFields?.sensor_id ??
    sample.identity?.stationCode ??
    sample.identity?.scopeKey ??
    "unknown"
  );
}

function metrics(rows) {
  if (rows.length === 0) {
    return {
      count: 0,
      mae: null,
      rmse: null,
      r2: null,
      meanError: null,
      bias: null,
      directionAccuracy: null,
      within1mm: null,
      thresholdAgreement: null,
      thresholdRecall: null,
      thresholdPrecision: null,
      p50AbsError: null,
      p90AbsError: null,
      maxAbsError: null
    };
  }

  const labels = rows.map((row) => row.y_true);
  const predictions = rows.map((row) => row.y_pred);
  const errors = rows.map((row) => row.error);
  const absErrors = rows.map((row) => row.abs_error);
  const squaredErrors = errors.map((value) => value * value);
  const labelMean = mean(labels);
  const totalSumSquares = labels.reduce((sum, value) => sum + (value - labelMean) ** 2, 0);
  const residualSumSquares = squaredErrors.reduce((sum, value) => sum + value, 0);
  const thresholdHits = rows.filter((row) => Math.abs(row.y_true) >= THRESHOLD_MM_PER_DAY).length;
  const predictedThresholdHits = rows.filter((row) => Math.abs(row.y_pred) >= THRESHOLD_MM_PER_DAY).length;
  const trueThresholdAgreement = rows.filter(
    (row) => Math.abs(row.y_true) >= THRESHOLD_MM_PER_DAY && Math.abs(row.y_pred) >= THRESHOLD_MM_PER_DAY
  ).length;

  return {
    count: rows.length,
    mae: mean(absErrors),
    rmse: Math.sqrt(mean(squaredErrors)),
    r2: totalSumSquares > 0 ? 1 - residualSumSquares / totalSumSquares : null,
    meanError: mean(errors),
    bias: mean(predictions) - mean(labels),
    directionAccuracy: rows.filter((row) => row.direction_hit).length / rows.length,
    within1mm: rows.filter((row) => row.within_1mm).length / rows.length,
    thresholdAgreement: rows.filter((row) => row.threshold_state_hit).length / rows.length,
    thresholdRecall: thresholdHits > 0 ? trueThresholdAgreement / thresholdHits : null,
    thresholdPrecision: predictedThresholdHits > 0 ? trueThresholdAgreement / predictedThresholdHits : null,
    p50AbsError: quantile(absErrors, 0.5),
    p90AbsError: quantile(absErrors, 0.9),
    maxAbsError: Math.max(...absErrors)
  };
}

function roundedMetrics(rows) {
  const raw = metrics(rows);
  return Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, typeof value === "number" ? rounded(value) : value]));
}

function groupBy(rows, keys) {
  const grouped = new Map();
  for (const row of rows) {
    const groupKey = keys.map((key) => row[key] ?? "unknown").join(" | ");
    const bucket = grouped.get(groupKey) ?? [];
    bucket.push(row);
    grouped.set(groupKey, bucket);
  }
  return Array.from(grouped.entries())
    .map(([groupKey, groupRows]) => {
      const dimensions = Object.fromEntries(keys.map((key) => [key, groupRows[0]?.[key] ?? "unknown"]));
      return {
        groupKey,
        ...dimensions,
        ...roundedMetrics(groupRows)
      };
    })
    .sort((left, right) => {
      if ((right.count ?? 0) !== (left.count ?? 0)) return (right.count ?? 0) - (left.count ?? 0);
      return String(left.groupKey).localeCompare(String(right.groupKey));
    });
}

function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\r\n]/u.test(text) ? `"${text.replace(/"/gu, '""')}"` : text;
}

function toCsv(rows, columns) {
  const lines = [columns.join(",")];
  for (const row of rows) {
    lines.push(columns.map((column) => csvEscape(row[column])).join(","));
  }
  return `${lines.join("\n")}\n`;
}

function sampleToPredictionRow(sample, artifact, execution) {
  const values = sample.metricsNormalized ?? {};
  const eventTs = sample.eventTs;
  const month = monthFromTs(eventTs);
  const yTrue = sample.labels.displacementLabel;
  const yPred = execution.predictedValue;
  const error = yPred - yTrue;
  const absError = Math.abs(error);
  const reservoirDelta72h = finiteNumber(values.reservoirLevelM_delta_72h);
  const displacementDelta72h = finiteNumber(values.displacementSurfaceMm_delta_72h);
  const rainfall24h = finiteNumber(values.rainfallCurrentMm_sum_24h);
  const rainfall72h = finiteNumber(values.rainfallCurrentMm_sum_72h);
  const pointId = String(rawPointId(sample));

  return {
    sampleId: sample.sampleId,
    sourceRecordKey: sample.sourceRecordKey ?? sample.rawRef?.sourceRecordKey ?? "",
    eventTs,
    date: eventTs.slice(0, 10),
    year: eventTs.slice(0, 4),
    month,
    season: seasonFromMonth(month),
    pointId,
    stationCode: sample.identity?.stationCode ?? "",
    slopeCode: sample.identity?.slopeCode ?? "",
    modelKey: artifact.modelKey,
    modelVersion: artifact.modelVersion ?? "",
    y_true: rounded(yTrue),
    y_pred: rounded(yPred),
    error: rounded(error),
    abs_error: rounded(absError),
    direction_hit: (yTrue >= 0) === (yPred >= 0),
    within_1mm: absError <= TOLERANCE_MM,
    threshold_state_hit: (Math.abs(yTrue) >= THRESHOLD_MM_PER_DAY) === (Math.abs(yPred) >= THRESHOLD_MM_PER_DAY),
    y_true_threshold_state: Math.abs(yTrue) >= THRESHOLD_MM_PER_DAY,
    y_pred_threshold_state: Math.abs(yPred) >= THRESHOLD_MM_PER_DAY,
    label_abs_bucket: binAbsLabel(yTrue),
    rainfall_24h_mm: rainfall24h,
    rainfall_72h_mm: rainfall72h,
    rainfall_24h_bucket: binRainfall24h(rainfall24h),
    rainfall_72h_bucket: binRainfall72h(rainfall72h),
    reservoir_delta_24h_m: finiteNumber(values.reservoirLevelM_delta_24h),
    reservoir_delta_72h_m: reservoirDelta72h,
    reservoir_trend_72h: signBucket(reservoirDelta72h),
    displacement_delta_24h_mm: finiteNumber(values.displacementSurfaceMm_delta_24h),
    displacement_delta_72h_mm: displacementDelta72h,
    displacement_trend_72h: signBucket(displacementDelta72h),
    displacement_delta_72h_bucket: binAbsDelta(displacementDelta72h),
    current_displacement_mm: finiteNumber(values.displacementSurfaceMm),
    current_reservoir_level_m: finiteNumber(values.reservoirLevelM),
    requiredFeatureCount: artifact.requiredFeatureKeys.length,
    requiredFeatureMissingCount: 0
  };
}

function renderMarkdown(payload) {
  const overall = payload.overallMetrics;
  const worstPoints = payload.groupTables.byPoint
    .filter((row) => row.count >= 30)
    .sort((left, right) => (right.mae ?? 0) - (left.mae ?? 0))
    .slice(0, 5);
  const worstMonths = payload.groupTables.byMonth
    .filter((row) => row.count >= 30)
    .sort((left, right) => (right.mae ?? 0) - (left.mae ?? 0))
    .slice(0, 5);

  return [
    "# Baijiabao Displacement Forecast Error Decomposition",
    "",
    "## Scope",
    "",
    `- Model: \`${payload.model.displayName}\``,
    `- Model key: \`${payload.model.modelKey}\``,
    `- Validation samples: \`${payload.input.validationSamples}\``,
    `- Evaluated samples: \`${payload.evaluatedCount}\``,
    `- Skipped samples: \`${payload.skippedCount}\``,
    `- Target: 24h future surface displacement delta, unit \`${payload.model.targetUnit}\``,
    "",
    "## Overall Metrics",
    "",
    "| Metric | Value |",
    "| --- | ---: |",
    `| MAE | ${overall.mae?.toFixed(3)} mm |`,
    `| RMSE | ${overall.rmse?.toFixed(3)} mm |`,
    `| R2 | ${overall.r2?.toFixed(4)} |`,
    `| Direction Accuracy | ${pct(overall.directionAccuracy)} |`,
    `| Within 1mm | ${pct(overall.within1mm)} |`,
    `| Threshold-state Agreement | ${pct(overall.thresholdAgreement)} |`,
    `| P50 Absolute Error | ${overall.p50AbsError?.toFixed(3)} mm |`,
    `| P90 Absolute Error | ${overall.p90AbsError?.toFixed(3)} mm |`,
    "",
    "## Highest-Error Point Segments",
    "",
    "| Point | Count | MAE | RMSE | P90 AE | Direction | Within 1mm |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...worstPoints.map(
      (row) =>
        `| ${row.pointId} | ${row.count} | ${row.mae?.toFixed(3)} | ${row.rmse?.toFixed(3)} | ${row.p90AbsError?.toFixed(
          3
        )} | ${pct(row.directionAccuracy)} | ${pct(row.within1mm)} |`
    ),
    "",
    "## Highest-Error Month Segments",
    "",
    "| Month | Count | MAE | RMSE | P90 AE | Direction | Within 1mm |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...worstMonths.map(
      (row) =>
        `| ${row.month} | ${row.count} | ${row.mae?.toFixed(3)} | ${row.rmse?.toFixed(3)} | ${row.p90AbsError?.toFixed(
          3
        )} | ${pct(row.directionAccuracy)} | ${pct(row.within1mm)} |`
    ),
    "",
    "## Writing Notes",
    "",
    "- This is an error-decomposition package for the displacement forecast model, not a new warning classifier result.",
    "- Use `per-sample-predictions.csv` as the source table for scatter plots, residual plots, and custom statistical tests.",
    "- Use grouped CSV files for paper tables; charts are presentation aids and must not override CSV/JSON metrics.",
    "- Skipped rows are retained in `skipped-samples.csv` to show the runtime-required feature boundary.",
    ""
  ].join("\n");
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  const artifact = await readJson(parsed.artifact);
  const samples = await readJsonl(parsed.validationSamples);
  const evaluatedRows = [];
  const skippedRows = [];

  for (const sample of samples) {
    const label = finiteNumber(sample.labels?.displacementLabel);
    const pointId = String(rawPointId(sample));
    const missingFeatureKeys = listMissingPredictionRegressionFeatures(artifact, sample.metricsNormalized ?? {});
    if (label === null) {
      skippedRows.push({
        sampleId: sample.sampleId,
        eventTs: sample.eventTs ?? "",
        pointId,
        reason: "missing-label",
        missingFeatureKeys: ""
      });
      continue;
    }
    if (missingFeatureKeys.length > 0) {
      skippedRows.push({
        sampleId: sample.sampleId,
        eventTs: sample.eventTs ?? "",
        pointId,
        reason: "missing-required-features",
        missingFeatureKeys: missingFeatureKeys.join(";")
      });
      continue;
    }
    const execution = runPredictionRegressionArtifact(artifact, {
      values: sample.metricsNormalized ?? {},
      pointId,
      eventTs: sample.eventTs
    });
    if (!execution) {
      skippedRows.push({
        sampleId: sample.sampleId,
        eventTs: sample.eventTs ?? "",
        pointId,
        reason: "runtime-null-prediction",
        missingFeatureKeys: missingFeatureKeys.join(";")
      });
      continue;
    }
    evaluatedRows.push(sampleToPredictionRow(sample, artifact, execution));
  }

  const groupTables = {
    byPoint: groupBy(evaluatedRows, ["pointId"]),
    byMonth: groupBy(evaluatedRows, ["month"]),
    bySeason: groupBy(evaluatedRows, ["season"]),
    byPointMonth: groupBy(evaluatedRows, ["pointId", "month"]),
    byRainfall24h: groupBy(evaluatedRows, ["rainfall_24h_bucket"]),
    byRainfall72h: groupBy(evaluatedRows, ["rainfall_72h_bucket"]),
    byReservoirTrend72h: groupBy(evaluatedRows, ["reservoir_trend_72h"]),
    byDisplacementTrend72h: groupBy(evaluatedRows, ["displacement_trend_72h"]),
    byDisplacementDelta72h: groupBy(evaluatedRows, ["displacement_delta_72h_bucket"]),
    byLabelMagnitude: groupBy(evaluatedRows, ["label_abs_bucket"])
  };

  const payload = {
    generatedAt: new Date().toISOString(),
    input: {
      artifact: parsed.artifact,
      validationSamples: parsed.validationSamples
    },
    model: {
      displayName: artifact.displayName ?? artifact.metadata?.displayName ?? artifact.modelKey,
      modelKey: artifact.modelKey,
      modelVersion: artifact.modelVersion,
      horizonSpec: artifact.horizonSpec,
      targetUnit: artifact.targetUnit,
      requiredFeatureKeys: artifact.requiredFeatureKeys
    },
    thresholdMmPerDay: THRESHOLD_MM_PER_DAY,
    toleranceMm: TOLERANCE_MM,
    validationSampleCount: samples.length,
    evaluatedCount: evaluatedRows.length,
    skippedCount: skippedRows.length,
    overallMetrics: roundedMetrics(evaluatedRows),
    groupTables
  };

  const outDir = parsed.outDir;
  await mkdir(outDir, { recursive: true });

  const sampleColumns = [
    "sampleId",
    "sourceRecordKey",
    "eventTs",
    "date",
    "year",
    "month",
    "season",
    "pointId",
    "stationCode",
    "slopeCode",
    "modelKey",
    "modelVersion",
    "y_true",
    "y_pred",
    "error",
    "abs_error",
    "direction_hit",
    "within_1mm",
    "threshold_state_hit",
    "y_true_threshold_state",
    "y_pred_threshold_state",
    "label_abs_bucket",
    "rainfall_24h_mm",
    "rainfall_72h_mm",
    "rainfall_24h_bucket",
    "rainfall_72h_bucket",
    "reservoir_delta_24h_m",
    "reservoir_delta_72h_m",
    "reservoir_trend_72h",
    "displacement_delta_24h_mm",
    "displacement_delta_72h_mm",
    "displacement_trend_72h",
    "displacement_delta_72h_bucket",
    "current_displacement_mm",
    "current_reservoir_level_m",
    "requiredFeatureCount",
    "requiredFeatureMissingCount"
  ];
  const metricColumns = [
    "groupKey",
    "pointId",
    "month",
    "season",
    "rainfall_24h_bucket",
    "rainfall_72h_bucket",
    "reservoir_trend_72h",
    "displacement_trend_72h",
    "displacement_delta_72h_bucket",
    "label_abs_bucket",
    "count",
    "mae",
    "rmse",
    "r2",
    "meanError",
    "bias",
    "directionAccuracy",
    "within1mm",
    "thresholdAgreement",
    "thresholdRecall",
    "thresholdPrecision",
    "p50AbsError",
    "p90AbsError",
    "maxAbsError"
  ];

  await writeText(path.join(outDir, "per-sample-predictions.csv"), toCsv(evaluatedRows, sampleColumns));
  await writeText(path.join(outDir, "skipped-samples.csv"), toCsv(skippedRows, ["sampleId", "eventTs", "pointId", "reason", "missingFeatureKeys"]));
  await writeJson(path.join(outDir, "error-decomposition-summary.json"), payload);
  await writeText(path.join(outDir, "README-error-decomposition.md"), renderMarkdown(payload));

  for (const [name, rows] of Object.entries(groupTables)) {
    await writeText(path.join(outDir, `${name}.csv`), toCsv(rows, metricColumns));
    await writeJson(path.join(outDir, `${name}.json`), rows);
  }

  const manifestRows = [
    { file: "per-sample-predictions.csv", description: "逐样本预测、残差和分组字段主表", rows: evaluatedRows.length },
    { file: "skipped-samples.csv", description: "因缺少标签或运行时必需特征跳过的样本", rows: skippedRows.length },
    { file: "error-decomposition-summary.json", description: "总指标和所有分组指标 JSON 汇总", rows: 1 },
    { file: "README-error-decomposition.md", description: "误差分解说明和论文写作边界", rows: 1 },
    ...Object.entries(groupTables).map(([name, rows]) => ({
      file: `${name}.csv/json`,
      description: `误差分解分组表：${name}`,
      rows: rows.length
    }))
  ];
  await writeText(path.join(outDir, "manifest.csv"), toCsv(manifestRows, ["file", "description", "rows"]));
  await writeJson(path.join(outDir, "manifest.json"), manifestRows);

  console.log(`Wrote Baijiabao displacement error decomposition to ${outDir}`);
  console.log(
    JSON.stringify(
      {
        model: payload.model.displayName,
        evaluatedCount: payload.evaluatedCount,
        skippedCount: payload.skippedCount,
        overallMetrics: payload.overallMetrics
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
