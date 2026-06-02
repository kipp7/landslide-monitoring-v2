import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const require = createRequire(import.meta.url);
const { runPredictionRegressionArtifact } = require(path.resolve("libs/regional-model-library/dist"));

const VALIDATION =
  ".tmp/regional-model-library/out/threegorges-baijiabao/splits/labeled/baijiabao.validation.future-labels.window-features.jsonl";
const OUT_DIR = ".tmp/regional-model-library/out/artifacts/baijiabao-displacement-ensemble-production-challengers";
const DEV_START = "2024-01-01T00:00:00.000Z";
const FINAL_START = "2024-07-01T00:00:00.000Z";
const THRESHOLD_MM_PER_DAY = 1.3;
const TOLERANCE_MM = 1;

const ARTIFACTS = [
  {
    id: "v14",
    file: "artifacts/models/regional-experts/phase1-displacement-forecast/baijiabao-displacement-v14.prediction-regression-v1.json"
  },
  {
    id: "v21",
    file: "artifacts/models/regional-experts/phase1-displacement-forecast/baijiabao-displacement-v21.prediction-regression-v1.json"
  },
  {
    id: "v22",
    file: "artifacts/models/regional-experts/phase1-displacement-forecast/baijiabao-displacement-v22.prediction-regression-v1.json"
  },
  {
    id: "v23",
    file: "artifacts/models/regional-experts/phase1-displacement-forecast/baijiabao-displacement-v23.prediction-regression-v1.json"
  },
  {
    id: "v24",
    file: ".tmp/regional-model-library/out/artifacts/baijiabao-displacement-two-holdout-production/baijiabao-displacement-v24-two-holdout-guarded.prediction-regression-v1.json"
  }
];

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

function pointIdFromSample(sample) {
  return String(
    sample.rawRef?.originalFields?.point_id ??
      sample.rawRef?.originalFields?.sensor_id ??
      sample.identity?.stationCode ??
      sample.identity?.scopeKey ??
      "unknown"
  );
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

function weightKey(weights) {
  return Object.entries(weights)
    .filter(([, value]) => value > 0)
    .map(([key, value]) => `${key}${String(value).replace(".", "p")}`)
    .join("-");
}

function buildWeightGrid() {
  const ids = ARTIFACTS.map((artifact) => artifact.id);
  const configs = [{ v23: 1 }];
  for (const id of ids.filter((value) => value !== "v23")) {
    for (const w of [0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5]) {
      configs.push({ v23: Number((1 - w).toFixed(4)), [id]: w });
    }
  }
  for (const a of ids) {
    for (const b of ids) {
      if (a >= b) continue;
      for (const wa of [0.1, 0.2, 0.3, 0.4, 0.5]) {
        const wb = Number((1 - wa).toFixed(4));
        configs.push({ [a]: wa, [b]: wb });
      }
    }
  }
  for (const a of ["v22", "v24", "v21", "v14"]) {
    for (const b of ["v22", "v24", "v21", "v14"]) {
      if (a >= b) continue;
      for (const wa of [0.05, 0.1, 0.15, 0.2]) {
        for (const wb of [0.05, 0.1, 0.15, 0.2]) {
          const v23 = Number((1 - wa - wb).toFixed(4));
          if (v23 <= 0) continue;
          configs.push({ v23, [a]: wa, [b]: wb });
        }
      }
    }
  }
  const deduped = new Map();
  for (const weights of configs) {
    const normalized = Object.fromEntries(Object.entries(weights).filter(([, value]) => value > 0));
    deduped.set(weightKey(normalized), normalized);
  }
  return [...deduped.values()];
}

function applyWeights(row, weights) {
  let sum = 0;
  let weightSum = 0;
  for (const [id, weight] of Object.entries(weights)) {
    sum += (row.predictions[id] ?? 0) * weight;
    weightSum += weight;
  }
  return weightSum > 0 ? sum / weightSum : row.predictions.v23;
}

function withPrediction(rows, weights) {
  return rows.map((row) => ({ ...row, candidatePrediction: applyWeights(row, weights) }));
}

function buildArtifact(baseArtifacts, selected, baselineArtifact) {
  return {
    ...baselineArtifact,
    modelKey: "baijiabao.displacement.weighted-version-ensemble-guarded-v26",
    modelVersion: "0.26.0",
    displayName: "BJB-DP-ENS-WEIGHTED-VERSION-GUARDED-v26",
    model: {
      modelType: "prediction_ensemble_regression_v1",
      featureKeys: baselineArtifact.model.featureKeys,
      aggregation: "weighted-mean",
      members: Object.entries(selected.weights).map(([id, weight]) => ({
        weight,
        model: baseArtifacts[id].model
      }))
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
      ...(baselineArtifact.metadata ?? {}),
      displayName: "BJB-DP-ENS-WEIGHTED-VERSION-GUARDED-v26",
      modelFamily: "weighted-version-ensemble-production-guard",
      selectionProfile: "ensemble-must-beat-v23-on-dev-final-and-full-runtime",
      baseModelKey: baselineArtifact.modelKey,
      baseModelVersion: baselineArtifact.modelVersion,
      ensemble: {
        weights: selected.weights,
        members: Object.fromEntries(Object.entries(baseArtifacts).map(([id, artifact]) => [id, `${artifact.modelKey}@${artifact.modelVersion}`])),
        devDelta: selected.devDelta,
        finalDelta: selected.finalDelta,
        allDelta: selected.allDelta,
        caveat: "Selected only if weighted artifact ensemble beats v23 on development holdout, final holdout, and full runtime guard."
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
      }
    }
  };
}

function toCsv(rows, columns) {
  const escape = (value) => {
    if (value === null || value === undefined) return "";
    const text = typeof value === "object" ? JSON.stringify(value) : String(value);
    return /[",\r\n]/u.test(text) ? `"${text.replace(/"/gu, '""')}"` : text;
  };
  return `${[columns.join(","), ...rows.map((row) => columns.map((column) => escape(row[column])).join(","))].join("\n")}\n`;
}

async function main() {
  const samples = await readJsonl(VALIDATION);
  const artifactList = await Promise.all(ARTIFACTS.map(async (entry) => ({ ...entry, artifact: await readJson(entry.file) })));
  const artifacts = Object.fromEntries(artifactList.map((entry) => [entry.id, entry.artifact]));
  const baselineArtifact = artifacts.v23;
  const rows = [];
  for (const sample of samples) {
    const label = sample.labels?.displacementLabel;
    if (!finite(label)) continue;
    const rowInput = {
      values: sample.metricsNormalized ?? {},
      pointId: pointIdFromSample(sample),
      eventTs: sample.eventTs
    };
    const predictions = {};
    let complete = true;
    for (const entry of artifactList) {
      const execution = runPredictionRegressionArtifact(entry.artifact, rowInput);
      if (!execution) {
        complete = false;
        break;
      }
      predictions[entry.id] = execution.predictedValue;
    }
    if (!complete) continue;
    rows.push({
      sampleId: sample.sampleId,
      eventTs: sample.eventTs,
      label,
      predictions,
      v23Prediction: predictions.v23
    });
  }

  const calibrationRows = rows.filter((row) => row.eventTs < DEV_START);
  const devRows = rows.filter((row) => row.eventTs >= DEV_START && row.eventTs < FINAL_START);
  const finalRows = rows.filter((row) => row.eventTs >= FINAL_START);
  const holdoutRows = rows.filter((row) => row.eventTs >= "2024-04-01T00:00:00.000Z");

  const baseline = {
    all: roundMetrics(metrics(rows, "v23Prediction")),
    calibration: roundMetrics(metrics(calibrationRows, "v23Prediction")),
    dev: roundMetrics(metrics(devRows, "v23Prediction")),
    final: roundMetrics(metrics(finalRows, "v23Prediction")),
    holdout: roundMetrics(metrics(holdoutRows, "v23Prediction"))
  };

  const leaderboard = buildWeightGrid()
    .map((weights) => {
      const candidateRows = withPrediction(rows, weights);
      const candidateDevRows = candidateRows.filter((row) => row.eventTs >= DEV_START && row.eventTs < FINAL_START);
      const candidateFinalRows = candidateRows.filter((row) => row.eventTs >= FINAL_START);
      const candidateHoldoutRows = candidateRows.filter((row) => row.eventTs >= "2024-04-01T00:00:00.000Z");
      const all = roundMetrics(metrics(candidateRows, "candidatePrediction"));
      const dev = roundMetrics(metrics(candidateDevRows, "candidatePrediction"));
      const final = roundMetrics(metrics(candidateFinalRows, "candidatePrediction"));
      const holdout = roundMetrics(metrics(candidateHoldoutRows, "candidatePrediction"));
      const row = {
        key: `ensemble-${weightKey(weights)}`,
        weights,
        all,
        dev,
        final,
        holdout,
        allDelta: delta(all, baseline.all),
        devDelta: delta(dev, baseline.dev),
        finalDelta: delta(final, baseline.final),
        holdoutDelta: delta(holdout, baseline.holdout)
      };
      row.passAllGuard = passStrict(row.allDelta);
      row.passDevGuard = passStrict(row.devDelta);
      row.passFinalGuard = passStrict(row.finalDelta);
      row.passHoldoutGuard = passStrict(row.holdoutDelta);
      row.passProductionGuard = row.passAllGuard && row.passDevGuard && row.passFinalGuard && row.passHoldoutGuard;
      return row;
    })
    .sort((left, right) => {
      if (left.passProductionGuard !== right.passProductionGuard) return left.passProductionGuard ? -1 : 1;
      if (left.all.mae !== right.all.mae) return left.all.mae - right.all.mae;
      if (left.all.rmse !== right.all.rmse) return left.all.rmse - right.all.rmse;
      return right.all.r2 - left.all.r2;
    });

  const selected = leaderboard.find((row) => row.passProductionGuard) ?? null;
  const artifact = selected ? buildArtifact(artifacts, selected, baselineArtifact) : null;
  const report = {
    generatedAt: new Date().toISOString(),
    validationSamples: VALIDATION,
    artifacts: Object.fromEntries(artifactList.map((entry) => [entry.id, { file: entry.file, modelKey: entry.artifact.modelKey, modelVersion: entry.artifact.modelVersion, displayName: entry.artifact.displayName }])),
    counts: {
      all: rows.length,
      calibration: calibrationRows.length,
      dev: devRows.length,
      final: finalRows.length,
      holdout: holdoutRows.length,
      skipped: samples.length - rows.length
    },
    baseline,
    selected,
    promoteAllowed: Boolean(selected),
    decision: selected ? "ensemble-candidate-passed-production-guard" : "no-ensemble-candidate-beat-v23-production-guard",
    leaderboard
  };

  await mkdir(OUT_DIR, { recursive: true });
  await writeJson(path.join(OUT_DIR, "baijiabao-displacement-ensemble-production-challengers.report.json"), report);
  await writeText(
    path.join(OUT_DIR, "baijiabao-displacement-ensemble-production-challengers.leaderboard.csv"),
    toCsv(
      leaderboard.map((row) => ({
        key: row.key,
        weights: row.weights,
        passProductionGuard: row.passProductionGuard,
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
        "weights",
        "passProductionGuard",
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
    await writeJson(path.join(OUT_DIR, "baijiabao-displacement-v26-weighted-version-ensemble.prediction-regression-v1.json"), artifact);
  }

  console.log(
    JSON.stringify(
      {
        counts: report.counts,
        baseline: report.baseline,
        selected: report.selected,
        promoteAllowed: report.promoteAllowed,
        decision: report.decision,
        artifact: artifact ? path.join(OUT_DIR, "baijiabao-displacement-v26-weighted-version-ensemble.prediction-regression-v1.json") : null,
        top: leaderboard.slice(0, 10).map((row) => ({
          key: row.key,
          weights: row.weights,
          passProductionGuard: row.passProductionGuard,
          all: row.all,
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
