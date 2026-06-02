import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const DEFAULT_TRAIN_SAMPLES =
  ".tmp/regional-model-library/out/threegorges-baijiabao/splits/labeled/baijiabao.train.future-labels.window-features.jsonl";
const DEFAULT_VALIDATION_SAMPLES =
  ".tmp/regional-model-library/out/threegorges-baijiabao/splits/labeled/baijiabao.validation.future-labels.window-features.jsonl";
const DEFAULT_GRID_REGISTRY =
  ".tmp/regional-model-library/out/artifacts/baijiabao-monitoring-challenger-grid/registry.json";
const DEFAULT_OUT_DIR = ".tmp/regional-model-library/out/artifacts/baijiabao-hybrid-seasonal-policy";
const PRIMARY_MODEL_KEY = "baijiabao.challenger.rainfall-reservoir.mean-diff.linear-risk-v1";
const BOOSTER_MODEL_KEYS = [
  "baijiabao.challenger.displacement-reservoir.mean-diff.linear-risk-v1",
  "baijiabao.challenger.compact-process.mean-diff.linear-risk-v1",
  "baijiabao.challenger.current-all-no-crack.mean-diff.linear-risk-v1"
];
const DAY_MS = 24 * 3600 * 1000;
const EPISODE_GAP_DAYS = 1.5;
const LEAD_WINDOW_DAYS = 7;

function parseArgs(argv) {
  const parsed = {
    trainSamples: DEFAULT_TRAIN_SAMPLES,
    validationSamples: DEFAULT_VALIDATION_SAMPLES,
    gridRegistry: DEFAULT_GRID_REGISTRY,
    outDir: DEFAULT_OUT_DIR,
    labelKey: "warningHitLabel"
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--train-samples") parsed.trainSamples = argv[++index] ?? parsed.trainSamples;
    if (token === "--validation-samples") parsed.validationSamples = argv[++index] ?? parsed.validationSamples;
    if (token === "--grid-registry") parsed.gridRegistry = argv[++index] ?? parsed.gridRegistry;
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

async function readRegistry(filePath) {
  const parsed = JSON.parse(await readFile(filePath, "utf-8"));
  return Array.isArray(parsed.artifacts) ? parsed.artifacts : [];
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

function readArtifactThreshold(artifact) {
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
  const stage1 = runStage(artifact.stage1, values);
  if (stage1.score === null) return stage1;
  return runStage(artifact.stage2, { ...values, [artifact.stage1.outputKey]: stage1.score });
}

function buildRows(samples, labelKey, models) {
  return samples
    .map((sample) => {
      const label = toBinaryLabel(sample.labels?.[labelKey]);
      const tsMs = Date.parse(sample.eventTs);
      if (label === null || !Number.isFinite(tsMs)) return null;
      const values = featureValues(sample);
      const scores = {};
      const missing = {};
      for (const model of models) {
        const result = runArtifact(model.artifact, values);
        scores[model.key] = result.score;
        missing[model.key] = result.missingFeatureKeys ?? [];
      }
      return {
        sampleId: sample.sampleId ?? null,
        eventTs: sample.eventTs,
        tsMs,
        season: season(sample.eventTs),
        pointId: pointId(sample),
        label,
        scores,
        missing
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
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  return {
    tp,
    fp,
    tn,
    fn,
    precision,
    recall,
    specificity,
    f1,
    balancedAccuracy: (recall + specificity) / 2
  };
}

function candidateThresholds(rows, modelKey) {
  return Array.from(
    new Set(
      rows
        .map((row) => row.scores[modelKey])
        .filter((score) => typeof score === "number" && Number.isFinite(score))
        .map((score) => Number(score.toFixed(6)))
    )
  ).sort((left, right) => left - right);
}

function applySingle(rows, modelKey, threshold) {
  return rows
    .filter((row) => typeof row.scores[modelKey] === "number")
    .map((row) => ({ ...row, predicted: row.scores[modelKey] >= threshold ? 1 : 0 }));
}

function selectThreshold(rows, modelKey, mode) {
  const thresholds = candidateThresholds(rows, modelKey);
  let best = { threshold: thresholds[0] ?? 0.5, metrics: confusion([]), score: -Infinity };
  for (const threshold of thresholds) {
    const metrics = confusion(applySingle(rows, modelKey, threshold));
    const score = mode === "maximize-f1" ? metrics.f1 : metrics.balancedAccuracy;
    if (score > best.score || (score === best.score && threshold > best.threshold)) {
      best = { threshold, metrics, score };
    }
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

function evaluatePolicy(policy, validationRows, episodes) {
  const rows = validationRows
    .filter((row) => typeof row.scores[policy.primaryModelKey] === "number")
    .map((row) => {
      const primaryHit = row.scores[policy.primaryModelKey] >= policy.primaryThreshold;
      const boosterEnabled = policy.boosterSeasons.includes(row.season);
      const boosterHit =
        boosterEnabled &&
        typeof row.scores[policy.boosterModelKey] === "number" &&
        row.scores[policy.boosterModelKey] >= policy.boosterThreshold;
      return {
        ...row,
        predicted: primaryHit || boosterHit ? 1 : 0,
        primaryHit,
        boosterHit
      };
    });
  const bySeason = groupMetrics(rows, (row) => row.season);
  const byPoint = groupMetrics(rows, (row) => row.pointId);
  const seasonRowsWithPositives = bySeason.filter((row) => row.positiveCount >= 5);
  const leadTime = episodeLeadMetrics(rows, episodes);
  return {
    ...policy,
    overall: confusion(rows),
    bySeason,
    byPoint,
    leadTime,
    gate: {
      worstSeasonRecall:
        seasonRowsWithPositives.length > 0 ? Math.min(...seasonRowsWithPositives.map((row) => row.recall)) : 0,
      leadHitRate: leadTime.hitRate
    }
  };
}

function renderMarkdown(report) {
  const lines = [];
  lines.push("# Baijiabao Hybrid Seasonal Policy Check");
  lines.push("");
  lines.push(`Generated at: ${report.generatedAt}`);
  lines.push("");
  lines.push("| policy | booster | seasons | BA | precision | recall | FP | FN | worst season recall | lead hit rate |");
  lines.push("|---|---|---|---:|---:|---:|---:|---:|---:|---:|");
  for (const policy of report.policies) {
    lines.push(
      `| ${policy.key} | ${policy.boosterModelKey} | ${policy.boosterSeasons.join(",")} | ${policy.overall.balancedAccuracy.toFixed(
        4
      )} | ${policy.overall.precision.toFixed(4)} | ${policy.overall.recall.toFixed(4)} | ${policy.overall.fp} | ${
        policy.overall.fn
      } | ${policy.gate.worstSeasonRecall.toFixed(4)} | ${policy.leadTime.hitRate.toFixed(4)} |`
    );
  }
  lines.push("");
  lines.push("## Recommendation");
  lines.push("");
  lines.push(report.recommendation);
  lines.push("");
  return `${lines.join("\n")}\n`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = process.cwd();
  const artifacts = await readRegistry(path.resolve(repoRoot, args.gridRegistry));
  const primaryArtifact = artifacts.find((artifact) => artifact.modelKey === PRIMARY_MODEL_KEY);
  if (!primaryArtifact) throw new Error(`Missing primary artifact: ${PRIMARY_MODEL_KEY}`);
  const boosterArtifacts = BOOSTER_MODEL_KEYS.map((modelKey) => {
    const artifact = artifacts.find((candidate) => candidate.modelKey === modelKey);
    if (!artifact) throw new Error(`Missing booster artifact: ${modelKey}`);
    return artifact;
  });
  const models = [
    { key: "primary", artifact: primaryArtifact },
    ...boosterArtifacts.map((artifact, index) => ({ key: `booster${index + 1}`, artifact }))
  ];
  const trainRows = buildRows(await readJsonLines(path.resolve(repoRoot, args.trainSamples)), args.labelKey, models);
  const validationRows = buildRows(
    await readJsonLines(path.resolve(repoRoot, args.validationSamples)),
    args.labelKey,
    models
  );
  const episodes = buildEpisodes(validationRows);
  const primaryThreshold = readArtifactThreshold(primaryArtifact);
  const policies = [
    {
      key: "primary-only",
      primaryModelKey: "primary",
      primaryThreshold,
      boosterModelKey: null,
      boosterThreshold: Infinity,
      boosterSeasons: []
    }
  ];
  const boosterSeasonSets = [["winter"], ["autumn"], ["autumn", "winter"]];
  for (let index = 0; index < boosterArtifacts.length; index += 1) {
    const boosterKey = `booster${index + 1}`;
    const boosterArtifact = boosterArtifacts[index];
    for (const mode of ["maximize-f1", "maximize-balanced-accuracy"]) {
      const selected = selectThreshold(trainRows, boosterKey, mode);
      for (const boosterSeasons of boosterSeasonSets) {
        policies.push({
          key: `${boosterArtifact.metadata?.featureFamilyKey ?? boosterKey}-${mode}-${boosterSeasons.join("-")}`,
          primaryModelKey: "primary",
          primaryThreshold,
          boosterModelKey: boosterKey,
          boosterModelArtifactKey: boosterArtifact.modelKey,
          boosterThreshold: selected.threshold,
          boosterThresholdMode: mode,
          boosterTrainMetrics: selected.metrics,
          boosterSeasons
        });
      }
    }
  }
  const evaluatedPolicies = policies.map((policy) => evaluatePolicy(policy, validationRows, episodes));
  const baseline = evaluatedPolicies[0];
  const deployable = evaluatedPolicies
    .filter((policy) => policy.key !== "primary-only")
    .filter(
      (policy) =>
        policy.gate.worstSeasonRecall > baseline.gate.worstSeasonRecall &&
        policy.leadTime.hitRate > baseline.leadTime.hitRate &&
        policy.overall.fp <= baseline.overall.fp * 1.75 &&
        policy.overall.balancedAccuracy >= baseline.overall.balancedAccuracy - 0.03 &&
        policy.overall.precision >= 0.16
    )
    .sort(
      (left, right) =>
        right.leadTime.hitRate - left.leadTime.hitRate ||
        right.gate.worstSeasonRecall - left.gate.worstSeasonRecall ||
        right.overall.balancedAccuracy - left.overall.balancedAccuracy
    );
  const report = {
    generatedAt: new Date().toISOString(),
    trainSamplesPath: path.resolve(repoRoot, args.trainSamples),
    validationSamplesPath: path.resolve(repoRoot, args.validationSamples),
    gridRegistryPath: path.resolve(repoRoot, args.gridRegistry),
    primary: {
      modelKey: primaryArtifact.modelKey,
      threshold: primaryThreshold
    },
    boosters: boosterArtifacts.map((artifact, index) => ({
      key: `booster${index + 1}`,
      modelKey: artifact.modelKey,
      featureFamilyKey: artifact.metadata?.featureFamilyKey ?? null
    })),
    policies: evaluatedPolicies,
    bestDeployablePolicy: deployable[0]?.key ?? null,
    recommendation:
      deployable.length > 0
        ? "A conservative hybrid seasonal booster passed the screening guardrails and can be investigated further before runtime integration."
        : "Hybrid seasonal booster policies did not pass screening guardrails. Keep runtime unchanged and investigate better trigger features or labels."
  };
  const outDir = path.resolve(repoRoot, args.outDir);
  const jsonPath = path.join(outDir, "baijiabao-hybrid-seasonal-policy.report.json");
  const mdPath = path.join(outDir, "baijiabao-hybrid-seasonal-policy.report.md");
  await writeJson(jsonPath, report);
  await writeText(mdPath, renderMarkdown(report));
  console.log(
    JSON.stringify(
      {
        reportPath: jsonPath,
        markdownPath: mdPath,
        primary: report.primary,
        boosters: report.boosters,
        policies: report.policies.map((policy) => ({
          key: policy.key,
          boosterModelArtifactKey: policy.boosterModelArtifactKey ?? null,
          boosterThreshold: policy.boosterThreshold,
          boosterSeasons: policy.boosterSeasons,
          overall: policy.overall,
          gate: policy.gate,
          leadTime: policy.leadTime
        })),
        bestDeployablePolicy: report.bestDeployablePolicy,
        recommendation: report.recommendation
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
