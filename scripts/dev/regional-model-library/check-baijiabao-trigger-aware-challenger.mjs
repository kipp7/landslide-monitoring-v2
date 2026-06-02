import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const DEFAULT_TRAIN_SAMPLES =
  ".tmp/regional-model-library/out/threegorges-baijiabao/splits/labeled/baijiabao.train.future-labels.window-features.jsonl";
const DEFAULT_VALIDATION_SAMPLES =
  ".tmp/regional-model-library/out/threegorges-baijiabao/splits/labeled/baijiabao.validation.future-labels.window-features.jsonl";
const DEFAULT_PRIMARY_REGISTRY =
  ".tmp/regional-model-library/out/artifacts/baijiabao-monitoring-challenger-grid/best-balanced-accuracy.registry.json";
const DEFAULT_OUT_DIR = ".tmp/regional-model-library/out/artifacts/baijiabao-trigger-aware-challenger";
const DAY_MS = 24 * 3600 * 1000;
const EPISODE_GAP_DAYS = 1.5;
const LEAD_WINDOW_DAYS = 7;

const TARGET_SEASON_SETS = [["winter"], ["autumn"], ["autumn", "winter"]];
const TRIGGER_FEATURES = [
  "displacementSurfaceMm_delta_24h",
  "displacementSurfaceMm_delta_72h",
  "reservoirLevelM_delta_24h",
  "reservoirLevelM_delta_72h",
  "reservoirLevelM",
  "rainfallCurrentMm",
  "rainfallCurrentMm_sum_24h",
  "rainfallCurrentMm_sum_72h"
];

function parseArgs(argv) {
  const parsed = {
    trainSamples: DEFAULT_TRAIN_SAMPLES,
    validationSamples: DEFAULT_VALIDATION_SAMPLES,
    primaryRegistry: DEFAULT_PRIMARY_REGISTRY,
    outDir: DEFAULT_OUT_DIR,
    labelKey: "warningHitLabel"
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--train-samples") parsed.trainSamples = argv[++index] ?? parsed.trainSamples;
    if (token === "--validation-samples") parsed.validationSamples = argv[++index] ?? parsed.validationSamples;
    if (token === "--primary-registry") parsed.primaryRegistry = argv[++index] ?? parsed.primaryRegistry;
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

function season(ts) {
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return "unknown";
  const month = date.getUTCMonth() + 1;
  if ([3, 4, 5].includes(month)) return "spring";
  if ([6, 7, 8].includes(month)) return "summer";
  if ([9, 10, 11].includes(month)) return "autumn";
  return "winter";
}

function pointId(sample) {
  return sample.rawRef?.originalFields?.point_id ?? sample.identity?.stationCode ?? "unknown";
}

function featureValues(sample) {
  return Object.entries(sample.metricsNormalized ?? {}).reduce((accumulator, [featureKey, value]) => {
    if (typeof value === "number" && Number.isFinite(value)) accumulator[featureKey] = value;
    return accumulator;
  }, {});
}

function artifactThreshold(artifact) {
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

function buildRows(samples, labelKey, artifact) {
  return samples
    .map((sample) => {
      const label = toBinaryLabel(sample.labels?.[labelKey]);
      const tsMs = Date.parse(sample.eventTs);
      if (label === null || !Number.isFinite(tsMs)) return null;
      const values = featureValues(sample);
      const execution = runArtifact(artifact, values);
      if (execution.score === null) return null;
      return {
        sampleId: sample.sampleId ?? null,
        eventTs: sample.eventTs,
        tsMs,
        season: season(sample.eventTs),
        pointId: pointId(sample),
        label,
        values,
        primaryScore: execution.score
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
        current = { episodeId: `${point}:${episodes.length + 1}`, pointId: point, startTsMs: row.tsMs, endTsMs: row.tsMs };
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

function conditionHit(row, trigger) {
  const value = row.values[trigger.featureKey];
  if (typeof value !== "number" || !Number.isFinite(value)) return false;
  return trigger.direction === "high" ? value >= trigger.threshold : value <= trigger.threshold;
}

function applyPolicy(rows, policy) {
  return rows.map((row) => {
    const primaryHit = row.primaryScore >= policy.primaryThreshold;
    const triggerHit =
      policy.targetSeasons.includes(row.season) &&
      policy.triggers.some((trigger) => conditionHit(row, trigger));
    return {
      ...row,
      primaryHit,
      triggerHit,
      predicted: primaryHit || triggerHit ? 1 : 0
    };
  });
}

function evaluatePolicy(rows, episodes, policy) {
  const evaluatedRows = applyPolicy(rows, policy);
  const bySeason = groupMetrics(evaluatedRows, (row) => row.season);
  const byPoint = groupMetrics(evaluatedRows, (row) => row.pointId);
  const seasonRowsWithPositives = bySeason.filter((row) => row.positiveCount >= 5);
  const pointRowsWithPositives = byPoint.filter((row) => row.positiveCount >= 5);
  const leadTime = episodeLeadMetrics(evaluatedRows, episodes);
  return {
    ...policy,
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

function candidateThresholds(rows, featureKey, targetSeasons) {
  return Array.from(
    new Set(
      rows
        .filter((row) => targetSeasons.includes(row.season))
        .map((row) => row.values[featureKey])
        .filter((value) => typeof value === "number" && Number.isFinite(value))
        .map((value) => Number(value.toFixed(6)))
    )
  ).sort((left, right) => left - right);
}

function policyScore(report, baseline) {
  const fpGrowth = report.overall.fp / Math.max(1, baseline.overall.fp);
  const precisionPenalty = Math.max(0, 0.16 - report.overall.precision) * 4;
  const baPenalty = Math.max(0, baseline.overall.balancedAccuracy - report.overall.balancedAccuracy) * 2;
  return (
    (report.leadTime.hitRate - baseline.leadTime.hitRate) * 2 +
    (report.gate.worstSeasonRecall - baseline.gate.worstSeasonRecall) * 1.5 +
    (report.overall.recall - baseline.overall.recall) -
    Math.max(0, fpGrowth - 1) * 0.2 -
    precisionPenalty -
    baPenalty
  );
}

function buildCandidatePolicies(trainRows, trainEpisodes, primaryThreshold) {
  const baselinePolicy = {
    key: "primary-only",
    primaryThreshold,
    targetSeasons: [],
    triggers: []
  };
  const baseline = evaluatePolicy(trainRows, trainEpisodes, baselinePolicy);
  const policies = [baselinePolicy];
  for (const targetSeasons of TARGET_SEASON_SETS) {
    for (const featureKey of TRIGGER_FEATURES) {
      for (const direction of ["high", "low"]) {
        for (const threshold of candidateThresholds(trainRows, featureKey, targetSeasons)) {
          const policy = {
            key: `trigger-${targetSeasons.join("-")}-${featureKey}-${direction}-${threshold}`,
            primaryThreshold,
            targetSeasons,
            triggers: [{ featureKey, direction, threshold }]
          };
          const report = evaluatePolicy(trainRows, trainEpisodes, policy);
          if (report.overall.tp === baseline.overall.tp && report.overall.fp === baseline.overall.fp) continue;
          if (report.overall.fp > baseline.overall.fp * 2.5) continue;
          if (report.overall.precision < 0.08) continue;
          policies.push({ ...policy, trainScore: policyScore(report, baseline), trainMetrics: compactReport(report) });
        }
      }
    }
  }
  const rankedPolicies = policies
    .filter((policy) => policy.key !== baselinePolicy.key)
    .sort((left, right) => (right.trainScore ?? 0) - (left.trainScore ?? 0))
    .slice(0, 250);
  return [baselinePolicy, ...rankedPolicies];
}

function compactReport(report) {
  return {
    overall: report.overall,
    leadTime: report.leadTime,
    gate: report.gate
  };
}

function renderMarkdown(report) {
  const lines = [];
  lines.push("# Baijiabao Trigger-Aware Challenger Check");
  lines.push("");
  lines.push(`Generated at: ${report.generatedAt}`);
  lines.push("");
  lines.push("## Validation Results");
  lines.push("");
  lines.push("| policy | trigger | seasons | BA | precision | recall | FP | FN | worst season recall | lead hit rate |");
  lines.push("|---|---|---|---:|---:|---:|---:|---:|---:|---:|");
  for (const policy of report.validationTopPolicies.slice(0, 20)) {
    const trigger = policy.triggers[0]
      ? `${policy.triggers[0].featureKey} ${policy.triggers[0].direction} ${policy.triggers[0].threshold}`
      : "none";
    lines.push(
      `| ${policy.key} | ${trigger} | ${policy.targetSeasons.join(",")} | ${policy.overall.balancedAccuracy.toFixed(
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
  const primaryArtifact = await readFirstArtifact(path.resolve(repoRoot, args.primaryRegistry));
  const primaryThreshold = artifactThreshold(primaryArtifact);
  const trainRows = buildRows(await readJsonLines(path.resolve(repoRoot, args.trainSamples)), args.labelKey, primaryArtifact);
  const validationRows = buildRows(
    await readJsonLines(path.resolve(repoRoot, args.validationSamples)),
    args.labelKey,
    primaryArtifact
  );
  const trainEpisodes = buildEpisodes(trainRows);
  const validationEpisodes = buildEpisodes(validationRows);
  const candidatePolicies = buildCandidatePolicies(trainRows, trainEpisodes, primaryThreshold);
  const validationReports = candidatePolicies.map((policy) =>
    evaluatePolicy(validationRows, validationEpisodes, policy)
  );
  const baseline = validationReports.find((policy) => policy.key === "primary-only");
  const validationTopPolicies = validationReports
    .slice()
    .sort(
      (left, right) =>
        policyScore(right, baseline) - policyScore(left, baseline) ||
        right.leadTime.hitRate - left.leadTime.hitRate ||
        right.gate.worstSeasonRecall - left.gate.worstSeasonRecall
    );
  const deployable = validationTopPolicies.filter(
    (policy) =>
      policy.key !== "primary-only" &&
      policy.leadTime.hitRate > baseline.leadTime.hitRate &&
      policy.gate.worstSeasonRecall > baseline.gate.worstSeasonRecall &&
      policy.overall.fp <= baseline.overall.fp * 1.75 &&
      policy.overall.balancedAccuracy >= baseline.overall.balancedAccuracy - 0.03 &&
      policy.overall.precision >= 0.16
  );
  const report = {
    generatedAt: new Date().toISOString(),
    trainSamplesPath: path.resolve(repoRoot, args.trainSamples),
    validationSamplesPath: path.resolve(repoRoot, args.validationSamples),
    primaryRegistryPath: path.resolve(repoRoot, args.primaryRegistry),
    primary: {
      modelKey: primaryArtifact.modelKey,
      threshold: primaryThreshold
    },
    sampleSummary: {
      trainRows: trainRows.length,
      trainEpisodes: trainEpisodes.length,
      validationRows: validationRows.length,
      validationEpisodes: validationEpisodes.length
    },
    candidateCount: candidatePolicies.length,
    baseline: validationReports.find((policy) => policy.key === "primary-only"),
    bestDeployablePolicy: deployable[0] ?? null,
    validationTopPolicies: validationTopPolicies.slice(0, 50),
    recommendation:
      deployable.length > 0
        ? "A train-selected trigger-aware policy passes the validation guardrails. It should be promoted only as an offline challenger artifact/policy, not as an immediate runtime change."
        : "No train-selected trigger-aware policy passes validation guardrails. The current data suggests the next step is label/episode review or new covariates, not more threshold or rule hacking."
  };
  const outDir = path.resolve(repoRoot, args.outDir);
  const jsonPath = path.join(outDir, "baijiabao-trigger-aware-challenger.report.json");
  const mdPath = path.join(outDir, "baijiabao-trigger-aware-challenger.report.md");
  await writeJson(jsonPath, report);
  await writeText(mdPath, renderMarkdown(report));
  console.log(
    JSON.stringify(
      {
        reportPath: jsonPath,
        markdownPath: mdPath,
        primary: report.primary,
        sampleSummary: report.sampleSummary,
        candidateCount: report.candidateCount,
        baseline: compactReport(report.baseline),
        bestDeployablePolicy: report.bestDeployablePolicy
          ? {
              key: report.bestDeployablePolicy.key,
              triggers: report.bestDeployablePolicy.triggers,
              targetSeasons: report.bestDeployablePolicy.targetSeasons,
              overall: report.bestDeployablePolicy.overall,
              gate: report.bestDeployablePolicy.gate,
              leadTime: report.bestDeployablePolicy.leadTime
            }
          : null,
        validationTopPolicies: report.validationTopPolicies.slice(0, 8).map((policy) => ({
          key: policy.key,
          triggers: policy.triggers,
          targetSeasons: policy.targetSeasons,
          overall: policy.overall,
          gate: policy.gate,
          leadTime: policy.leadTime
        })),
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
