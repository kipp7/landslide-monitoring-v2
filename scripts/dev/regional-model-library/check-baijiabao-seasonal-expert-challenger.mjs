import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const DEFAULT_TRAIN_SAMPLES =
  ".tmp/regional-model-library/out/artifacts/baijiabao-episode-grey-zone-label-policy/baijiabao.train.episode-grey-zone-labels.jsonl";
const DEFAULT_VALIDATION_SAMPLES =
  ".tmp/regional-model-library/out/artifacts/baijiabao-episode-grey-zone-label-policy/baijiabao.validation.episode-grey-zone-labels.jsonl";
const DEFAULT_PRIMARY_REGISTRY =
  ".tmp/regional-model-library/out/artifacts/baijiabao-monitoring-challenger-grid/best-balanced-accuracy.registry.json";
const DEFAULT_OUT_DIR = ".tmp/regional-model-library/out/artifacts/baijiabao-seasonal-expert-challenger";

const DAY_MS = 24 * 3600 * 1000;
const EPISODE_GAP_DAYS = 1.5;
const LEAD_WINDOW_DAYS = 7;
const TARGET_SEASONS = ["autumn", "winter"];
const BOOSTER_FEATURE_KEYS = [
  "displacementSurfaceMm_delta_24h",
  "displacementSurfaceMm_delta_72h",
  "reservoirLevelM_delta_24h",
  "reservoirLevelM_delta_72h",
  "reservoirLevelM",
  "reservoirLevelM_mean_72h",
  "rainfallCurrentMm",
  "rainfallCurrentMm_sum_24h",
  "rainfallCurrentMm_sum_72h"
];

const PROMOTION_THRESHOLDS = {
  balancedAccuracyMin: 0.62,
  precisionMin: 0.2,
  recallMin: 0.35,
  leadHitRateMin: 0.5,
  worstSeasonRecallMin: 0.2,
  worstPointRecallMin: 0.2,
  immediateFalsePositiveMax: 250,
  immediateFalsePositiveGrowthFromGreyZoneMax: 2.5,
  immediatePrecisionRetentionMin: 0.5,
  baDropMax: 0.04
};

function parseArgs(argv) {
  const parsed = {
    trainSamples: DEFAULT_TRAIN_SAMPLES,
    validationSamples: DEFAULT_VALIDATION_SAMPLES,
    primaryRegistry: DEFAULT_PRIMARY_REGISTRY,
    outDir: DEFAULT_OUT_DIR,
    trainingLabelKey: "warningHitLabelEpisodeGreyZoneExcluded",
    greyZoneEvalLabelKey: "warningHitLabelEpisodeGreyZoneExcluded",
    immediateEvalLabelKey: "warningHitLabelImmediate",
    minFeatureCoverage: 0.8,
    logisticIterations: 900,
    logisticLearningRate: 0.35,
    logisticL2: 0.02
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--train-samples") parsed.trainSamples = argv[++index] ?? parsed.trainSamples;
    if (token === "--validation-samples") parsed.validationSamples = argv[++index] ?? parsed.validationSamples;
    if (token === "--primary-registry") parsed.primaryRegistry = argv[++index] ?? parsed.primaryRegistry;
    if (token === "--out-dir") parsed.outDir = argv[++index] ?? parsed.outDir;
    if (token === "--training-label-key") parsed.trainingLabelKey = argv[++index] ?? parsed.trainingLabelKey;
    if (token === "--grey-zone-eval-label-key") parsed.greyZoneEvalLabelKey = argv[++index] ?? parsed.greyZoneEvalLabelKey;
    if (token === "--immediate-eval-label-key") parsed.immediateEvalLabelKey = argv[++index] ?? parsed.immediateEvalLabelKey;
    if (token === "--min-feature-coverage") {
      const value = Number(argv[++index]);
      if (Number.isFinite(value) && value >= 0 && value <= 1) parsed.minFeatureCoverage = value;
    }
    if (token === "--logistic-iterations") {
      const value = Number(argv[++index]);
      if (Number.isInteger(value) && value > 0) parsed.logisticIterations = value;
    }
    if (token === "--logistic-learning-rate") {
      const value = Number(argv[++index]);
      if (Number.isFinite(value) && value > 0) parsed.logisticLearningRate = value;
    }
    if (token === "--logistic-l2") {
      const value = Number(argv[++index]);
      if (Number.isFinite(value) && value >= 0) parsed.logisticL2 = value;
    }
  }
  return parsed;
}

async function readJsonLines(filePath) {
  const content = await readFile(filePath, "utf-8");
  return content
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

async function readFirstArtifact(filePath) {
  const parsed = JSON.parse(await readFile(filePath, "utf-8"));
  const artifact = Array.isArray(parsed.artifacts) ? parsed.artifacts[0] : null;
  if (!artifact) throw new Error(`No artifact found in ${filePath}`);
  return artifact;
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

async function writeText(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, value, "utf-8");
}

function toBinaryLabel(value) {
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "number") {
    if (value === 0) return 0;
    if (value === 1) return 1;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes"].includes(normalized)) return 1;
    if (["0", "false", "no"].includes(normalized)) return 0;
  }
  return null;
}

function featureValues(sample) {
  return Object.entries(sample.metricsNormalized ?? {}).reduce((accumulator, [featureKey, value]) => {
    if (typeof value === "number" && Number.isFinite(value)) accumulator[featureKey] = value;
    return accumulator;
  }, {});
}

function pointId(sample) {
  return sample.rawRef?.originalFields?.point_id ?? sample.identity?.stationCode ?? "unknown";
}

function season(ts) {
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return "unknown";
  const month = date.getUTCMonth() + 1;
  if ([3, 4, 5].includes(month)) return "spring";
  if ([6, 7, 8].includes(month)) return "summer";
  if ([9, 10, 11].includes(month)) return "autumn";
  return "winter";
}

function clamp01(value) {
  if (!Number.isFinite(value)) return 0.5;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function sigmoid(value) {
  if (!Number.isFinite(value)) return 0.5;
  if (value >= 20) return 1;
  if (value <= -20) return 0;
  if (value >= 0) {
    const z = Math.exp(-value);
    return 1 / (1 + z);
  }
  const z = Math.exp(value);
  return z / (1 + z);
}

function normalizeValue(stage, featureKey, value) {
  const rule = stage.featureNormalization?.[featureKey];
  if (!rule) return value;
  const span = rule.max - rule.min;
  if (!Number.isFinite(span) || span <= 0) return 0.5;
  return clamp01((value - rule.min) / span);
}

function runStage(stage, values) {
  const missingFeatureKeys = (stage.requiredFeatureKeys ?? []).filter(
    (featureKey) => typeof values[featureKey] !== "number" || !Number.isFinite(values[featureKey])
  );
  if (missingFeatureKeys.length > 0) return { score: null, missingFeatureKeys };
  let rawScore = typeof stage.bias === "number" ? stage.bias : 0;
  for (const [featureKey, weight] of Object.entries(stage.weights ?? {})) {
    const normalized = normalizeValue(stage, featureKey, values[featureKey] ?? 0);
    rawScore += weight * (normalized - (stage.featureCenters?.[featureKey] ?? 0));
  }
  return { score: sigmoid(rawScore), missingFeatureKeys: [] };
}

function runArtifact(artifact, values) {
  if (artifact.artifactType === "two_stage_linear_risk_v1") {
    const stage1 = runStage(artifact.stage1, values);
    if (stage1.score === null) return stage1;
    return runStage(artifact.stage2, { ...values, [artifact.stage1.outputKey]: stage1.score });
  }
  return runStage(
    {
      requiredFeatureKeys: artifact.requiredFeatureKeys ?? [],
      featureNormalization: artifact.featureNormalization ?? {},
      featureCenters: artifact.featureCenters ?? {},
      bias: artifact.bias ?? 0,
      weights: artifact.weights ?? {}
    },
    values
  );
}

function readThreshold(artifact) {
  const replay = artifact.metadata?.replaySummary;
  if (typeof replay?.threshold === "number") return replay.threshold;
  const calibration = artifact.metadata?.calibration;
  if (typeof calibration?.threshold === "number") return calibration.threshold;
  return 0.5;
}

function buildRows(samples, labelKeys, primaryArtifact) {
  return samples
    .map((sample) => {
      const tsMs = Date.parse(sample.eventTs);
      if (!Number.isFinite(tsMs)) return null;
      const values = featureValues(sample);
      const primary = runArtifact(primaryArtifact, values);
      return {
        sampleId: sample.sampleId ?? null,
        eventTs: sample.eventTs,
        tsMs,
        pointId: pointId(sample),
        season: season(sample.eventTs),
        values,
        labels: Object.fromEntries(labelKeys.map((labelKey) => [labelKey, toBinaryLabel(sample.labels?.[labelKey])])),
        primaryScore: primary.score,
        primaryMissingFeatureKeys: primary.missingFeatureKeys ?? []
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.tsMs - right.tsMs || left.pointId.localeCompare(right.pointId));
}

function selectFeatureKeys(rows, minFeatureCoverage) {
  const targetRows = rows.filter((row) => TARGET_SEASONS.includes(row.season));
  return BOOSTER_FEATURE_KEYS.filter((featureKey) => {
    const count = targetRows.filter((row) => typeof row.values[featureKey] === "number").length;
    return targetRows.length > 0 && count / targetRows.length >= minFeatureCoverage;
  });
}

function buildNormalization(rows, featureKeys) {
  const featureNormalization = {};
  const featureCenters = {};
  for (const featureKey of featureKeys) {
    const values = rows.map((row) => row.values[featureKey]).filter((value) => typeof value === "number");
    const min = values.length > 0 ? Math.min(...values) : 0;
    const max = values.length > 0 ? Math.max(...values) : 0;
    featureNormalization[featureKey] = { min, max };
    const span = max - min;
    const normalized = values.map((value) => (span > 0 ? clamp01((value - min) / span) : 0.5));
    featureCenters[featureKey] =
      normalized.length > 0 ? normalized.reduce((sum, value) => sum + value, 0) / normalized.length : 0.5;
  }
  return { featureNormalization, featureCenters };
}

function trainBooster(rows, featureKeys, options) {
  const usableRows = rows.filter(
    (row) =>
      TARGET_SEASONS.includes(row.season) &&
      row.labels[options.labelKey] !== null &&
      featureKeys.every((featureKey) => typeof row.values[featureKey] === "number")
  );
  if (!usableRows.some((row) => row.labels[options.labelKey] === 1) || !usableRows.some((row) => row.labels[options.labelKey] === 0)) {
    throw new Error("Seasonal booster needs both positive and negative target-season training rows.");
  }

  const { featureNormalization, featureCenters } = buildNormalization(usableRows, featureKeys);
  const matrixRows = usableRows.map((row) => ({
    label: row.labels[options.labelKey],
    x: featureKeys.map((featureKey) => {
      const value = row.values[featureKey] ?? 0;
      return normalizeValue({ featureNormalization }, featureKey, value) - (featureCenters[featureKey] ?? 0);
    })
  }));
  const positiveCount = matrixRows.filter((row) => row.label === 1).length;
  const negativeCount = matrixRows.length - positiveCount;
  const positiveWeight = matrixRows.length / Math.max(1, 2 * positiveCount);
  const negativeWeight = matrixRows.length / Math.max(1, 2 * negativeCount);
  const weightsArray = new Array(featureKeys.length).fill(0);
  let bias = 0;

  for (let iteration = 0; iteration < options.iterations; iteration += 1) {
    let gradBias = 0;
    const gradWeights = new Array(featureKeys.length).fill(0);
    let totalWeight = 0;
    for (const row of matrixRows) {
      let raw = bias;
      for (let index = 0; index < featureKeys.length; index += 1) raw += weightsArray[index] * row.x[index];
      const predicted = sigmoid(raw);
      const rowWeight = row.label === 1 ? positiveWeight : negativeWeight;
      const error = (predicted - row.label) * rowWeight;
      gradBias += error;
      totalWeight += rowWeight;
      for (let index = 0; index < featureKeys.length; index += 1) gradWeights[index] += error * row.x[index];
    }
    const scale = 1 / Math.max(1, totalWeight);
    bias -= options.learningRate * gradBias * scale;
    for (let index = 0; index < featureKeys.length; index += 1) {
      weightsArray[index] -= options.learningRate * (gradWeights[index] * scale + options.l2 * weightsArray[index]);
    }
  }

  const weights = {};
  for (let index = 0; index < featureKeys.length; index += 1) weights[featureKeys[index]] = weightsArray[index];
  return {
    key: "baijiabao.offline.seasonal-autumn-winter.logistic-balanced-l2.booster-v1",
    targetSeasons: TARGET_SEASONS,
    labelKey: options.labelKey,
    requiredFeatureKeys: featureKeys,
    featureNormalization,
    featureCenters,
    bias,
    weights,
    trainingSummary: {
      sampleCount: usableRows.length,
      positiveCount,
      negativeCount
    }
  };
}

function runBooster(booster, row) {
  if (!booster.targetSeasons.includes(row.season)) return { score: null, missingFeatureKeys: [] };
  return runStage(booster, row.values);
}

function confusion(rows) {
  let tp = 0;
  let fp = 0;
  let tn = 0;
  let fn = 0;
  for (const row of rows) {
    if (row.label === 1 && row.predicted === 1) tp += 1;
    if (row.label === 0 && row.predicted === 1) fp += 1;
    if (row.label === 0 && row.predicted === 0) tn += 1;
    if (row.label === 1 && row.predicted === 0) fn += 1;
  }
  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const specificity = tn + fp > 0 ? tn / (tn + fp) : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  return {
    tp,
    fp,
    tn,
    fn,
    precision,
    recall,
    specificity,
    accuracy: rows.length > 0 ? (tp + tn) / rows.length : 0,
    f1,
    balancedAccuracy: (recall + specificity) / 2
  };
}

function groupBy(rows, keyFn) {
  const map = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return map;
}

function groupMetrics(rows, keyFn) {
  return Array.from(groupBy(rows, keyFn).entries())
    .map(([key, groupRows]) => ({
      key,
      count: groupRows.length,
      positiveCount: groupRows.filter((row) => row.label === 1).length,
      ...confusion(groupRows)
    }))
    .sort((left, right) => left.key.localeCompare(right.key));
}

function buildEpisodes(rows) {
  const episodes = [];
  for (const [point, pointRows] of groupBy(rows.filter((row) => row.label === 1), (row) => row.pointId).entries()) {
    let current = null;
    for (const row of pointRows.slice().sort((left, right) => left.tsMs - right.tsMs)) {
      if (!current || row.tsMs - current.endTsMs > EPISODE_GAP_DAYS * DAY_MS) {
        current = {
          episodeId: `${point}:${episodes.length + 1}`,
          pointId: point,
          startTsMs: row.tsMs,
          endTsMs: row.tsMs
        };
        episodes.push(current);
      } else {
        current.endTsMs = row.tsMs;
      }
    }
  }
  return episodes;
}

function episodeLeadMetrics(rows, episodes) {
  const rowsByPoint = groupBy(rows, (row) => row.pointId);
  let hit = 0;
  let pre = 0;
  for (const episode of episodes) {
    const context = (rowsByPoint.get(episode.pointId) ?? []).filter(
      (row) => row.tsMs >= episode.startTsMs - LEAD_WINDOW_DAYS * DAY_MS && row.tsMs <= episode.endTsMs
    );
    const alerts = context.filter((row) => row.predicted === 1);
    if (alerts.length > 0) hit += 1;
    if (alerts.some((row) => row.tsMs < episode.startTsMs)) pre += 1;
  }
  return {
    episodeCount: episodes.length,
    hitRate: episodes.length > 0 ? hit / episodes.length : 0,
    preAlertRate: episodes.length > 0 ? pre / episodes.length : 0
  };
}

function scorePolicy(rows, labelKey, primaryThreshold, booster, boosterThreshold) {
  return rows
    .map((row) => {
      const label = row.labels[labelKey];
      if (label === null) return null;
      const boosterResult = runBooster(booster, row);
      const primaryHit = typeof row.primaryScore === "number" && row.primaryScore >= primaryThreshold;
      const boosterHit = typeof boosterResult.score === "number" && boosterResult.score >= boosterThreshold;
      return {
        ...row,
        label,
        boosterScore: boosterResult.score,
        primaryHit,
        boosterHit,
        predicted: primaryHit || boosterHit ? 1 : 0
      };
    })
    .filter(Boolean);
}

function selectThreshold(rows, labelKey, primaryThreshold, booster, mode) {
  const scoredRows = rows
    .map((row) => {
      const label = row.labels[labelKey];
      const boosterResult = runBooster(booster, row);
      if (label === null || typeof boosterResult.score !== "number") return null;
      return { ...row, label, boosterScore: boosterResult.score };
    })
    .filter(Boolean);
  const candidates = Array.from(new Set(scoredRows.map((row) => Number(row.boosterScore.toFixed(6))))).sort((a, b) => a - b);
  let best = { threshold: 0.5, score: -Infinity, metrics: null };
  for (const threshold of candidates) {
    const policyRows = scorePolicy(rows, labelKey, primaryThreshold, booster, threshold);
    const metrics = confusion(policyRows);
    const score =
      mode === "maximize-f1"
        ? metrics.f1
        : mode === "guarded-recall"
          ? (metrics.precision >= 0.18 && metrics.fp <= 260 ? metrics.recall : -1)
          : metrics.balancedAccuracy;
    if (score > best.score) best = { threshold, score, metrics };
  }
  return best;
}

function evaluatePolicy(rows, labelKey, primaryThreshold, booster, boosterThreshold) {
  const policyRows = scorePolicy(rows, labelKey, primaryThreshold, booster, boosterThreshold);
  const episodes = buildEpisodes(policyRows);
  const bySeason = groupMetrics(policyRows, (row) => row.season);
  const byPoint = groupMetrics(policyRows, (row) => row.pointId);
  const targetSeasonHitCount = policyRows.filter((row) => row.boosterHit).length;
  const incrementalAlertCount = policyRows.filter((row) => row.boosterHit && !row.primaryHit).length;
  return {
    labelKey,
    sampleCount: policyRows.length,
    targetSeasonHitCount,
    incrementalAlertCount,
    overall: confusion(policyRows),
    bySeason,
    byPoint,
    leadTime: episodeLeadMetrics(policyRows, episodes)
  };
}

function worstRecall(groupRows) {
  const rows = groupRows.filter((row) => row.positiveCount >= 5);
  return rows.length > 0 ? Math.min(...rows.map((row) => row.recall)) : 0;
}

function gatePair(grey, immediate) {
  const blockers = [];
  const addFloor = (label, value, floor) => {
    if (typeof value !== "number" || !Number.isFinite(value)) blockers.push(`${label} missing`);
    else if (value < floor) blockers.push(`${label} ${value.toFixed(4)} below ${floor.toFixed(4)}`);
  };
  const addCeiling = (label, value, ceiling) => {
    if (typeof value !== "number" || !Number.isFinite(value)) blockers.push(`${label} missing`);
    else if (value > ceiling) blockers.push(`${label} ${value.toFixed(4)} above ${ceiling.toFixed(4)}`);
  };
  addFloor("grey-zone BA", grey.overall.balancedAccuracy, PROMOTION_THRESHOLDS.balancedAccuracyMin);
  addFloor("grey-zone precision", grey.overall.precision, PROMOTION_THRESHOLDS.precisionMin);
  addFloor("grey-zone recall", grey.overall.recall, PROMOTION_THRESHOLDS.recallMin);
  addFloor("grey-zone lead hit", grey.leadTime.hitRate, PROMOTION_THRESHOLDS.leadHitRateMin);
  addFloor("grey-zone worst season recall", worstRecall(grey.bySeason), PROMOTION_THRESHOLDS.worstSeasonRecallMin);
  addFloor("grey-zone worst point recall", worstRecall(grey.byPoint), PROMOTION_THRESHOLDS.worstPointRecallMin);
  addFloor("immediate BA", immediate.overall.balancedAccuracy, PROMOTION_THRESHOLDS.balancedAccuracyMin);
  addFloor("immediate precision", immediate.overall.precision, PROMOTION_THRESHOLDS.precisionMin);
  addFloor("immediate recall", immediate.overall.recall, PROMOTION_THRESHOLDS.recallMin);
  addFloor("immediate lead hit", immediate.leadTime.hitRate, PROMOTION_THRESHOLDS.leadHitRateMin);
  addFloor("immediate worst season recall", worstRecall(immediate.bySeason), PROMOTION_THRESHOLDS.worstSeasonRecallMin);
  addFloor("immediate worst point recall", worstRecall(immediate.byPoint), PROMOTION_THRESHOLDS.worstPointRecallMin);
  addCeiling("immediate FP", immediate.overall.fp, PROMOTION_THRESHOLDS.immediateFalsePositiveMax);

  const fpGrowth = grey.overall.fp > 0 ? immediate.overall.fp / grey.overall.fp : null;
  const precisionRetention = grey.overall.precision > 0 ? immediate.overall.precision / grey.overall.precision : null;
  const baDrop = grey.overall.balancedAccuracy - immediate.overall.balancedAccuracy;
  if (fpGrowth === null || fpGrowth > PROMOTION_THRESHOLDS.immediateFalsePositiveGrowthFromGreyZoneMax) {
    blockers.push(
      `immediate FP growth ${fpGrowth === null ? "missing" : fpGrowth.toFixed(4)} above ${PROMOTION_THRESHOLDS.immediateFalsePositiveGrowthFromGreyZoneMax.toFixed(4)}`
    );
  }
  if (precisionRetention === null || precisionRetention < PROMOTION_THRESHOLDS.immediatePrecisionRetentionMin) {
    blockers.push(
      `immediate precision retention ${precisionRetention === null ? "missing" : precisionRetention.toFixed(4)} below ${PROMOTION_THRESHOLDS.immediatePrecisionRetentionMin.toFixed(4)}`
    );
  }
  if (baDrop > PROMOTION_THRESHOLDS.baDropMax) {
    blockers.push(`BA drop ${baDrop.toFixed(4)} above ${PROMOTION_THRESHOLDS.baDropMax.toFixed(4)}`);
  }
  return {
    pass: blockers.length === 0,
    blockers,
    deltas: {
      fpGrowth,
      precisionRetention,
      baDrop,
      immediateMinusGreyZone: {
        balancedAccuracy: immediate.overall.balancedAccuracy - grey.overall.balancedAccuracy,
        precision: immediate.overall.precision - grey.overall.precision,
        recall: immediate.overall.recall - grey.overall.recall,
        falsePositives: immediate.overall.fp - grey.overall.fp,
        leadHitRate: immediate.leadTime.hitRate - grey.leadTime.hitRate
      }
    }
  };
}

function compactEval(evaluation) {
  return {
    sampleCount: evaluation.sampleCount,
    targetSeasonHitCount: evaluation.targetSeasonHitCount,
    incrementalAlertCount: evaluation.incrementalAlertCount,
    overall: evaluation.overall,
    leadTime: evaluation.leadTime,
    worstSeasonRecall: worstRecall(evaluation.bySeason),
    worstPointRecall: worstRecall(evaluation.byPoint),
    bySeason: evaluation.bySeason
  };
}

function renderMarkdown(report) {
  const lines = [];
  lines.push("# Baijiabao Seasonal Expert Challenger");
  lines.push("");
  lines.push(`Generated at: ${report.generatedAt}`);
  lines.push("");
  lines.push("## Decision");
  lines.push("");
  lines.push(`- status: \`${report.decision.status}\``);
  lines.push(`- recommendation: ${report.decision.recommendation}`);
  lines.push("");
  lines.push("## Booster");
  lines.push("");
  lines.push(`- key: \`${report.booster.key}\``);
  lines.push(`- train rows: \`${report.booster.trainingSummary.sampleCount}\``);
  lines.push(`- positives / negatives: \`${report.booster.trainingSummary.positiveCount} / ${report.booster.trainingSummary.negativeCount}\``);
  lines.push(`- selected features: \`${report.booster.requiredFeatureKeys.join(", ")}\``);
  lines.push("");
  lines.push("## Primary Baseline");
  lines.push("");
  lines.push("| label read | BA | precision | recall | FP | lead hit | worst season recall |");
  lines.push("|---|---:|---:|---:|---:|---:|---:|");
  lines.push(
    `| grey-zone-excluded | ${report.baseline.greyZone.overall.balancedAccuracy.toFixed(4)} | ${report.baseline.greyZone.overall.precision.toFixed(4)} | ${report.baseline.greyZone.overall.recall.toFixed(4)} | ${report.baseline.greyZone.overall.fp} | ${report.baseline.greyZone.leadTime.hitRate.toFixed(4)} | ${report.baseline.greyZone.worstSeasonRecall.toFixed(4)} |`
  );
  lines.push(
    `| immediate-derived | ${report.baseline.immediate.overall.balancedAccuracy.toFixed(4)} | ${report.baseline.immediate.overall.precision.toFixed(4)} | ${report.baseline.immediate.overall.recall.toFixed(4)} | ${report.baseline.immediate.overall.fp} | ${report.baseline.immediate.leadTime.hitRate.toFixed(4)} | ${report.baseline.immediate.worstSeasonRecall.toFixed(4)} |`
  );
  lines.push("");
  lines.push("## Threshold Results");
  lines.push("");
  lines.push("| threshold mode | threshold | grey BA | grey P | grey R | grey FP | grey lead | imm BA | imm P | imm R | imm FP | imm lead | gate |");
  lines.push("|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|");
  for (const result of report.thresholdResults) {
    const grey = result.greyZone;
    const immediate = result.immediate;
    lines.push(
      `| ${result.thresholdMode} | ${result.threshold.toFixed(6)} | ${grey.overall.balancedAccuracy.toFixed(4)} | ${grey.overall.precision.toFixed(4)} | ${grey.overall.recall.toFixed(4)} | ${grey.overall.fp} | ${grey.leadTime.hitRate.toFixed(4)} | ${immediate.overall.balancedAccuracy.toFixed(4)} | ${immediate.overall.precision.toFixed(4)} | ${immediate.overall.recall.toFixed(4)} | ${immediate.overall.fp} | ${immediate.leadTime.hitRate.toFixed(4)} | ${result.gate.pass ? "pass" : "block"} |`
    );
  }
  lines.push("");
  lines.push("## Blockers");
  for (const result of report.thresholdResults) {
    lines.push("");
    lines.push(`### ${result.thresholdMode}`);
    if (result.gate.blockers.length === 0) lines.push("- blocker: none");
    else for (const blocker of result.gate.blockers) lines.push(`- blocker: ${blocker}`);
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = process.cwd();
  const trainPath = path.resolve(repoRoot, args.trainSamples);
  const validationPath = path.resolve(repoRoot, args.validationSamples);
  const primaryRegistryPath = path.resolve(repoRoot, args.primaryRegistry);
  const primaryArtifact = await readFirstArtifact(primaryRegistryPath);
  const primaryThreshold = readThreshold(primaryArtifact);
  const labelKeys = [args.trainingLabelKey, args.greyZoneEvalLabelKey, args.immediateEvalLabelKey];
  const trainRows = buildRows(await readJsonLines(trainPath), labelKeys, primaryArtifact);
  const validationRows = buildRows(await readJsonLines(validationPath), labelKeys, primaryArtifact);
  const selectedFeatureKeys = selectFeatureKeys(trainRows, args.minFeatureCoverage);
  const booster = trainBooster(trainRows, selectedFeatureKeys, {
    labelKey: args.trainingLabelKey,
    iterations: args.logisticIterations,
    learningRate: args.logisticLearningRate,
    l2: args.logisticL2
  });
  const thresholdModes = ["maximize-balanced-accuracy", "maximize-f1", "guarded-recall"];
  const baseline = {
    greyZone: compactEval(
      evaluatePolicy(validationRows, args.greyZoneEvalLabelKey, primaryThreshold, booster, Number.POSITIVE_INFINITY)
    ),
    immediate: compactEval(
      evaluatePolicy(validationRows, args.immediateEvalLabelKey, primaryThreshold, booster, Number.POSITIVE_INFINITY)
    )
  };
  const thresholdResults = thresholdModes.map((thresholdMode) => {
    const selection = selectThreshold(trainRows, args.trainingLabelKey, primaryThreshold, booster, thresholdMode);
    const greyZone = evaluatePolicy(validationRows, args.greyZoneEvalLabelKey, primaryThreshold, booster, selection.threshold);
    const immediate = evaluatePolicy(validationRows, args.immediateEvalLabelKey, primaryThreshold, booster, selection.threshold);
    return {
      thresholdMode,
      threshold: selection.threshold,
      trainSelection: selection.metrics,
      greyZone: compactEval(greyZone),
      immediate: compactEval(immediate),
      gate: gatePair(greyZone, immediate)
    };
  });
  const passed = thresholdResults.filter((result) => result.gate.pass);
  const bestByReview =
    thresholdResults
      .slice()
      .sort(
        (left, right) =>
          Number(right.gate.pass) - Number(left.gate.pass) ||
          right.greyZone.leadTime.hitRate - left.greyZone.leadTime.hitRate ||
          right.greyZone.overall.balancedAccuracy - left.greyZone.overall.balancedAccuracy
      )[0] ?? null;
  const report = {
    generatedAt: new Date().toISOString(),
    sourcePaths: {
      trainSamples: trainPath,
      validationSamples: validationPath,
      primaryRegistry: primaryRegistryPath
    },
    labelKeys: {
      training: args.trainingLabelKey,
      greyZoneEval: args.greyZoneEvalLabelKey,
      immediateEval: args.immediateEvalLabelKey
    },
    primary: {
      modelKey: primaryArtifact.modelKey,
      threshold: primaryThreshold
    },
    targetSeasons: TARGET_SEASONS,
    minFeatureCoverage: args.minFeatureCoverage,
    booster,
    baseline,
    thresholdResults,
    bestByReview,
    decision: {
      status: passed.length > 0 ? "promotion-rehearsal-eligible" : "blocked",
      passedThresholdModes: passed.map((result) => result.thresholdMode),
      recommendation:
        passed.length > 0
          ? "A seasonal expert threshold passed the offline cross-label gate; run controlled promotion rehearsal before runtime changes."
          : "No seasonal expert threshold passed the offline cross-label gate. Keep runtime unchanged and use this report to guide the next feature/label revision."
    }
  };

  const outDir = path.resolve(repoRoot, args.outDir);
  const jsonPath = path.join(outDir, "baijiabao-seasonal-expert-challenger.report.json");
  const mdPath = path.join(outDir, "baijiabao-seasonal-expert-challenger.report.md");
  await writeJson(jsonPath, report);
  await writeText(mdPath, renderMarkdown(report));
  console.log(
    JSON.stringify(
      {
        reportPath: jsonPath,
        markdownPath: mdPath,
        decision: report.decision,
        primary: report.primary,
        booster: {
          key: report.booster.key,
          requiredFeatureKeys: report.booster.requiredFeatureKeys,
          trainingSummary: report.booster.trainingSummary
        },
        baseline: report.baseline,
        thresholdResults: report.thresholdResults.map((result) => ({
          thresholdMode: result.thresholdMode,
          threshold: result.threshold,
          greyZone: {
            overall: result.greyZone.overall,
            leadTime: result.greyZone.leadTime,
            worstSeasonRecall: result.greyZone.worstSeasonRecall
          },
          immediate: {
            overall: result.immediate.overall,
            leadTime: result.immediate.leadTime,
            worstSeasonRecall: result.immediate.worstSeasonRecall
          },
          gate: result.gate
        }))
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
