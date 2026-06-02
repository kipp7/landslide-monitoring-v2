import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const DEFAULT_TRAIN_SAMPLES =
  ".tmp/regional-model-library/out/threegorges-baijiabao/splits/labeled/baijiabao.train.future-labels.window-features.jsonl";
const DEFAULT_VALIDATION_SAMPLES =
  ".tmp/regional-model-library/out/threegorges-baijiabao/splits/labeled/baijiabao.validation.future-labels.window-features.jsonl";
const DEFAULT_REGISTRY =
  ".tmp/regional-model-library/out/artifacts/baijiabao-monitoring-challenger-grid/best-balanced-accuracy.registry.json";
const DEFAULT_OUT_DIR = ".tmp/regional-model-library/out/artifacts/baijiabao-seasonal-threshold-policy";
const DAY_MS = 24 * 3600 * 1000;
const EPISODE_GAP_DAYS = 1.5;
const LEAD_WINDOW_DAYS = 7;
const SEASONS = ["spring", "summer", "autumn", "winter"];

function parseArgs(argv) {
  const parsed = {
    trainSamples: DEFAULT_TRAIN_SAMPLES,
    validationSamples: DEFAULT_VALIDATION_SAMPLES,
    registryPath: DEFAULT_REGISTRY,
    outDir: DEFAULT_OUT_DIR,
    labelKey: "warningHitLabel"
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--train-samples") parsed.trainSamples = argv[++index] ?? parsed.trainSamples;
    if (token === "--validation-samples") parsed.validationSamples = argv[++index] ?? parsed.validationSamples;
    if (token === "--registry") parsed.registryPath = argv[++index] ?? parsed.registryPath;
    if (token === "--out-dir") parsed.outDir = argv[++index] ?? parsed.outDir;
    if (token === "--label-key") parsed.labelKey = argv[++index] ?? parsed.labelKey;
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

function readThreshold(artifact) {
  const value = artifact.metadata?.replaySummary?.threshold;
  return typeof value === "number" && Number.isFinite(value) ? value : 0.5;
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
  const missingFeatureKeys = stage.requiredFeatureKeys.filter(
    (featureKey) => typeof values[featureKey] !== "number" || !Number.isFinite(values[featureKey])
  );
  if (missingFeatureKeys.length > 0) return { score: null, missingFeatureKeys };
  let rawScore = typeof stage.bias === "number" ? stage.bias : 0;
  for (const [featureKey, weight] of Object.entries(stage.weights ?? {})) {
    const rawValue = values[featureKey] ?? 0;
    const normalizedValue = normalizeValue(stage, featureKey, rawValue);
    rawScore += weight * (normalizedValue - (stage.featureCenters?.[featureKey] ?? 0));
  }
  return { score: sigmoid(rawScore), missingFeatureKeys: [] };
}

function runArtifact(artifact, values) {
  if (artifact.artifactType !== "two_stage_linear_risk_v1") {
    const stage = {
      requiredFeatureKeys: artifact.requiredFeatureKeys ?? [],
      featureNormalization: artifact.featureNormalization ?? {},
      featureCenters: artifact.featureCenters ?? {},
      bias: artifact.bias ?? 0,
      weights: artifact.weights ?? {}
    };
    return runStage(stage, values);
  }
  const stage1 = runStage(artifact.stage1, values);
  if (stage1.score === null) return stage1;
  return runStage(artifact.stage2, { ...values, [artifact.stage1.outputKey]: stage1.score });
}

function buildRows(samples, labelKey, artifact) {
  return samples
    .map((sample) => {
      const label = toBinaryLabel(sample.labels?.[labelKey]);
      const tsMs = Date.parse(sample.eventTs);
      if (label === null || !Number.isFinite(tsMs)) return null;
      const values = featureValues(sample);
      const execution = runArtifact(artifact, values);
      if (execution.score === null) {
        return {
          sampleId: sample.sampleId ?? null,
          eventTs: sample.eventTs,
          tsMs,
          label,
          pointId: pointId(sample),
          season: season(sample.eventTs),
          score: null,
          missingFeatureKeys: execution.missingFeatureKeys
        };
      }
      return {
        sampleId: sample.sampleId ?? null,
        eventTs: sample.eventTs,
        tsMs,
        label,
        pointId: pointId(sample),
        season: season(sample.eventTs),
        score: execution.score,
        missingFeatureKeys: []
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.tsMs - right.tsMs || left.pointId.localeCompare(right.pointId));
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
  const accuracy = rows.length > 0 ? (tp + tn) / rows.length : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  const f2 = precision + recall > 0 ? (5 * precision * recall) / (4 * precision + recall) : 0;
  return {
    tp,
    fp,
    tn,
    fn,
    precision,
    recall,
    specificity,
    accuracy,
    f1,
    f2,
    balancedAccuracy: (recall + specificity) / 2,
    youdenJ: recall + specificity - 1
  };
}

function candidateThresholds(rows) {
  const scores = rows
    .map((row) => row.score)
    .filter((score) => typeof score === "number" && Number.isFinite(score));
  return Array.from(new Set(scores.map((score) => Number(score.toFixed(6))))).sort((left, right) => left - right);
}

function applyThreshold(rows, threshold) {
  return rows
    .filter((row) => typeof row.score === "number")
    .map((row) => ({ ...row, threshold, predicted: row.score >= threshold ? 1 : 0 }));
}

function selectThreshold(rows, mode) {
  const evaluatedRows = rows.filter((row) => typeof row.score === "number");
  const thresholds = candidateThresholds(evaluatedRows);
  if (thresholds.length === 0) return { threshold: 0.5, metrics: confusion([]), score: 0 };
  let best = { threshold: thresholds[0], metrics: confusion(applyThreshold(evaluatedRows, thresholds[0])), score: -Infinity };
  for (const threshold of thresholds) {
    const metrics = confusion(applyThreshold(evaluatedRows, threshold));
    const score =
      mode === "maximize-f2"
        ? metrics.f2
        : mode === "recall-floor-050"
          ? metrics.recall >= 0.5
            ? metrics.precision + metrics.specificity * 0.1
            : -1
          : metrics.balancedAccuracy;
    if (score > best.score || (score === best.score && threshold > best.threshold)) {
      best = { threshold, metrics, score };
    }
  }
  if (mode === "recall-floor-050" && best.score < 0) {
    return selectThreshold(rows, "maximize-f2");
  }
  return best;
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

function buildEpisodes(rows) {
  const episodes = [];
  const byPoint = groupBy(
    rows
      .filter((row) => row.label === 1)
      .slice()
      .sort((left, right) => left.tsMs - right.tsMs),
    (row) => row.pointId
  );
  for (const [key, pointRows] of byPoint.entries()) {
    let current = null;
    for (const row of pointRows) {
      if (!current || row.tsMs - current.endTsMs > EPISODE_GAP_DAYS * DAY_MS) {
        current = {
          episodeId: `${key}:${episodes.length + 1}`,
          pointId: key,
          startTs: row.eventTs,
          startTsMs: row.tsMs,
          endTs: row.eventTs,
          endTsMs: row.tsMs
        };
        episodes.push(current);
      } else {
        current.endTs = row.eventTs;
        current.endTsMs = row.tsMs;
      }
    }
  }
  return episodes;
}

function summarize(values) {
  const sorted = values.filter((value) => typeof value === "number").sort((a, b) => a - b);
  const q = (ratio) => {
    if (sorted.length === 0) return null;
    const position = (sorted.length - 1) * ratio;
    const lower = Math.floor(position);
    const upper = Math.ceil(position);
    if (lower === upper) return sorted[lower];
    return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
  };
  return {
    count: sorted.length,
    min: sorted[0] ?? null,
    p25: q(0.25),
    p50: q(0.5),
    p75: q(0.75),
    max: sorted[sorted.length - 1] ?? null
  };
}

function episodeLeadMetrics(evaluatedRows, episodes) {
  const rowsByPoint = groupBy(evaluatedRows, (row) => row.pointId);
  const episodeRows = episodes.map((episode) => {
    const rows = (rowsByPoint.get(episode.pointId) ?? []).filter(
      (row) => row.tsMs >= episode.startTsMs - LEAD_WINDOW_DAYS * DAY_MS && row.tsMs <= episode.endTsMs
    );
    const alertRows = rows.filter((row) => row.predicted === 1).sort((left, right) => left.tsMs - right.tsMs);
    const preAlertRows = alertRows.filter((row) => row.tsMs < episode.startTsMs);
    const earliest = alertRows[0] ?? null;
    const earliestPre = preAlertRows[0] ?? null;
    return {
      episodeId: episode.episodeId,
      pointId: episode.pointId,
      startTs: episode.startTs,
      endTs: episode.endTs,
      hitInLeadWindow: alertRows.length > 0,
      preAlert: preAlertRows.length > 0,
      leadDays: earliest ? Number(((episode.startTsMs - earliest.tsMs) / DAY_MS).toFixed(3)) : null,
      preLeadDays: earliestPre ? Number(((episode.startTsMs - earliestPre.tsMs) / DAY_MS).toFixed(3)) : null
    };
  });
  return {
    episodeCount: episodeRows.length,
    hitEpisodeCount: episodeRows.filter((row) => row.hitInLeadWindow).length,
    preAlertEpisodeCount: episodeRows.filter((row) => row.preAlert).length,
    hitRate: episodeRows.length > 0 ? episodeRows.filter((row) => row.hitInLeadWindow).length / episodeRows.length : 0,
    preAlertRate: episodeRows.length > 0 ? episodeRows.filter((row) => row.preAlert).length / episodeRows.length : 0,
    leadDays: summarize(episodeRows.map((row) => row.leadDays).filter((value) => value !== null)),
    preLeadDays: summarize(episodeRows.map((row) => row.preLeadDays).filter((value) => value !== null))
  };
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

function scoreDistribution(rows) {
  const evaluatedRows = rows.filter((row) => typeof row.score === "number");
  const result = {};
  for (const seasonKey of SEASONS) {
    const seasonRows = evaluatedRows.filter((row) => row.season === seasonKey);
    result[seasonKey] = {
      positives: summarize(seasonRows.filter((row) => row.label === 1).map((row) => row.score)),
      negatives: summarize(seasonRows.filter((row) => row.label === 0).map((row) => row.score))
    };
  }
  return result;
}

function buildPolicies(input) {
  const trainEvaluated = input.trainRows.filter((row) => typeof row.score === "number");
  const globalBalanced = selectThreshold(trainEvaluated, "maximize-balanced-accuracy");
  const policies = [
    {
      key: "artifact-global-threshold",
      description: "Current artifact threshold from replay metadata.",
      thresholdMode: "fixed-global",
      thresholds: { global: input.artifactThreshold }
    },
    {
      key: "train-global-balanced",
      description: "Single global threshold selected on train split by balanced accuracy.",
      thresholdMode: "train-global-balanced",
      thresholds: { global: globalBalanced.threshold },
      trainSelection: { global: globalBalanced }
    }
  ];
  for (const mode of ["maximize-balanced-accuracy", "maximize-f2", "recall-floor-050"]) {
    const thresholds = {};
    const trainSelection = {};
    for (const seasonKey of SEASONS) {
      const seasonRows = trainEvaluated.filter((row) => row.season === seasonKey);
      const selected = selectThreshold(seasonRows.length > 0 ? seasonRows : trainEvaluated, mode);
      thresholds[seasonKey] = selected.threshold;
      trainSelection[seasonKey] = selected;
    }
    policies.push({
      key: `train-season-${mode}`,
      description: `Season-specific thresholds selected on train split by ${mode}.`,
      thresholdMode: mode,
      thresholds,
      trainSelection
    });
  }
  return policies;
}

function evaluatePolicy(policy, validationRows, episodes) {
  const evaluatedRows = validationRows
    .filter((row) => typeof row.score === "number")
    .map((row) => {
      const threshold = policy.thresholds[row.season] ?? policy.thresholds.global ?? 0.5;
      return {
        ...row,
        threshold,
        predicted: row.score >= threshold ? 1 : 0
      };
    });
  const bySeason = groupMetrics(evaluatedRows, (row) => row.season);
  const byPoint = groupMetrics(evaluatedRows, (row) => row.pointId);
  const seasonRowsWithPositives = bySeason.filter((row) => row.positiveCount >= 5);
  const pointRowsWithPositives = byPoint.filter((row) => row.positiveCount >= 5);
  const leadTime = episodeLeadMetrics(evaluatedRows, episodes);
  return {
    key: policy.key,
    description: policy.description,
    thresholdMode: policy.thresholdMode,
    thresholds: policy.thresholds,
    trainSelection: policy.trainSelection ?? null,
    overall: confusion(evaluatedRows),
    bySeason,
    byPoint,
    leadTime,
    gate: {
      worstSeasonRecall:
        seasonRowsWithPositives.length > 0 ? Math.min(...seasonRowsWithPositives.map((row) => row.recall)) : 0,
      worstPointRecall:
        pointRowsWithPositives.length > 0 ? Math.min(...pointRowsWithPositives.map((row) => row.recall)) : 0,
      leadHitRate: leadTime.hitRate
    }
  };
}

function renderMarkdown(report) {
  const lines = [];
  lines.push("# Baijiabao Seasonal Threshold Policy Check");
  lines.push("");
  lines.push(`Generated at: ${report.generatedAt}`);
  lines.push("");
  lines.push(`Model: ${report.model.modelKey}`);
  lines.push("");
  lines.push("## Validation Policy Results");
  lines.push("");
  lines.push("| policy | BA | precision | recall | FP | FN | worst season recall | lead hit rate |");
  lines.push("|---|---:|---:|---:|---:|---:|---:|---:|");
  for (const policy of report.policies) {
    lines.push(
      `| ${policy.key} | ${policy.overall.balancedAccuracy.toFixed(4)} | ${policy.overall.precision.toFixed(
        4
      )} | ${policy.overall.recall.toFixed(4)} | ${policy.overall.fp} | ${policy.overall.fn} | ${policy.gate.worstSeasonRecall.toFixed(
        4
      )} | ${policy.leadTime.hitRate.toFixed(4)} |`
    );
  }
  lines.push("");
  lines.push("## Recommendation");
  lines.push("");
  lines.push(report.recommendation);
  lines.push("");
  lines.push("Full JSON report contains train-selected thresholds and score distributions.");
  lines.push("");
  return `${lines.join("\n")}\n`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = process.cwd();
  const trainPath = path.resolve(repoRoot, args.trainSamples);
  const validationPath = path.resolve(repoRoot, args.validationSamples);
  const registryPath = path.resolve(repoRoot, args.registryPath);
  const outDir = path.resolve(repoRoot, args.outDir);
  const artifact = await readFirstArtifact(registryPath);
  const trainRows = buildRows(await readJsonLines(trainPath), args.labelKey, artifact);
  const validationRows = buildRows(await readJsonLines(validationPath), args.labelKey, artifact);
  const validationEpisodes = buildEpisodes(validationRows);
  const artifactThreshold = readThreshold(artifact);
  const policies = buildPolicies({ trainRows, artifactThreshold }).map((policy) =>
    evaluatePolicy(policy, validationRows, validationEpisodes)
  );
  const baseline = policies.find((policy) => policy.key === "artifact-global-threshold");
  const bestLead = policies.slice().sort((left, right) => right.leadTime.hitRate - left.leadTime.hitRate)[0];
  const bestWorstSeason = policies.slice().sort((left, right) => right.gate.worstSeasonRecall - left.gate.worstSeasonRecall)[0];
  const bestBalanced = policies.slice().sort((left, right) => right.overall.balancedAccuracy - left.overall.balancedAccuracy)[0];
  const deployableSeasonalPolicies = policies.filter((policy) => {
    if (policy.key === baseline.key) return false;
    return (
      policy.gate.worstSeasonRecall > baseline.gate.worstSeasonRecall &&
      policy.leadTime.hitRate > baseline.leadTime.hitRate &&
      policy.overall.fp <= baseline.overall.fp * 2 &&
      policy.overall.balancedAccuracy >= baseline.overall.balancedAccuracy - 0.03 &&
      policy.overall.precision >= 0.15
    );
  });
  const bestDeployableSeasonalPolicy =
    deployableSeasonalPolicies
      .slice()
      .sort(
        (left, right) =>
          right.leadTime.hitRate - left.leadTime.hitRate ||
          right.gate.worstSeasonRecall - left.gate.worstSeasonRecall ||
          right.overall.balancedAccuracy - left.overall.balancedAccuracy
      )[0] ?? null;
  const recommendation = bestDeployableSeasonalPolicy
    ? "A season-specific threshold policy meets the current deployability guardrails and can move to controlled policy rehearsal."
    : "Season-specific thresholding alone is not deployable. It can buy recall/lead-time only by exploding false positives or degrading balanced accuracy, so the next step should investigate missing trigger features, seasonal labels, or episode semantics before runtime policy changes.";
  const report = {
    generatedAt: new Date().toISOString(),
    trainSamplesPath: trainPath,
    validationSamplesPath: validationPath,
    registryPath,
    labelKey: args.labelKey,
    model: {
      modelKey: artifact.modelKey,
      modelVersion: artifact.modelVersion ?? null,
      featureCount: artifact.requiredFeatureKeys?.length ?? null,
      artifactThreshold
    },
    sampleSummary: {
      train: {
        rows: trainRows.length,
        evaluatedRows: trainRows.filter((row) => typeof row.score === "number").length,
        positives: trainRows.filter((row) => row.label === 1).length
      },
      validation: {
        rows: validationRows.length,
        evaluatedRows: validationRows.filter((row) => typeof row.score === "number").length,
        positives: validationRows.filter((row) => row.label === 1).length,
        episodes: validationEpisodes.length
      }
    },
    scoreDistribution: {
      train: scoreDistribution(trainRows),
      validation: scoreDistribution(validationRows)
    },
    policies,
    highlights: {
      baseline: baseline?.key ?? null,
      bestLeadPolicy: bestLead?.key ?? null,
      bestWorstSeasonRecallPolicy: bestWorstSeason?.key ?? null,
      bestBalancedAccuracyPolicy: bestBalanced?.key ?? null,
      bestDeployableSeasonalPolicy: bestDeployableSeasonalPolicy?.key ?? null
    },
    recommendation
  };

  const jsonPath = path.join(outDir, "baijiabao-seasonal-threshold-policy.report.json");
  const mdPath = path.join(outDir, "baijiabao-seasonal-threshold-policy.report.md");
  await writeJson(jsonPath, report);
  await writeText(mdPath, renderMarkdown(report));
  console.log(
    JSON.stringify(
      {
        reportPath: jsonPath,
        markdownPath: mdPath,
        model: report.model,
        sampleSummary: report.sampleSummary,
        policies: report.policies.map((policy) => ({
          key: policy.key,
          thresholds: policy.thresholds,
          overall: policy.overall,
          gate: policy.gate,
          leadTime: {
            hitRate: policy.leadTime.hitRate,
            preAlertRate: policy.leadTime.preAlertRate,
            leadDays: policy.leadTime.leadDays
          }
        })),
        highlights: report.highlights,
        recommendation
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
