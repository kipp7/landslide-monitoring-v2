import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const DEFAULT_VALIDATION_SAMPLES =
  ".tmp/regional-model-library/out/threegorges-baijiabao/splits/labeled/baijiabao.validation.future-labels.window-features.jsonl";
const DEFAULT_PRIMARY_REGISTRY =
  ".tmp/regional-model-library/out/artifacts/baijiabao-monitoring-challenger-grid/best-balanced-accuracy.registry.json";
const DEFAULT_DELTA_REGISTRY =
  ".tmp/regional-model-library/out/artifacts/baijiabao-monitoring-challenger-grid-delta-family/best-delta-balanced.registry.json";
const DEFAULT_OUT_DIR = ".tmp/regional-model-library/out/artifacts/baijiabao-seasonal-moe-policy";
const DAY_MS = 24 * 3600 * 1000;
const EPISODE_GAP_DAYS = 1.5;
const LEAD_WINDOW_DAYS = 7;
const FUTURE_PROXIMITY_DAYS = [7, 14, 30];

function parseArgs(argv) {
  const parsed = {
    validationSamples: DEFAULT_VALIDATION_SAMPLES,
    primaryRegistry: DEFAULT_PRIMARY_REGISTRY,
    deltaRegistry: DEFAULT_DELTA_REGISTRY,
    outDir: DEFAULT_OUT_DIR,
    labelKey: "warningHitLabel"
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--validation-samples") parsed.validationSamples = argv[++index] ?? parsed.validationSamples;
    if (token === "--primary-registry") parsed.primaryRegistry = argv[++index] ?? parsed.primaryRegistry;
    if (token === "--delta-registry") parsed.deltaRegistry = argv[++index] ?? parsed.deltaRegistry;
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

function monthKey(ts) {
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return "unknown";
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
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
    const normalizedValue = normalizeValue(stage, featureKey, values[featureKey] ?? 0);
    rawScore += weight * (normalizedValue - (stage.featureCenters?.[featureKey] ?? 0));
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

function buildRows(samples, labelKey, primaryArtifact, deltaArtifact) {
  return samples
    .map((sample) => {
      const label = toBinaryLabel(sample.labels?.[labelKey]);
      const tsMs = Date.parse(sample.eventTs);
      if (label === null || !Number.isFinite(tsMs)) return null;
      const values = featureValues(sample);
      const primary = runArtifact(primaryArtifact, values);
      if (primary.score === null) return null;
      const delta = runArtifact(deltaArtifact, values);
      return {
        sampleId: sample.sampleId ?? null,
        eventTs: sample.eventTs,
        tsMs,
        label,
        pointId: pointId(sample),
        season: season(sample.eventTs),
        month: monthKey(sample.eventTs),
        values,
        primaryScore: primary.score,
        deltaScore: delta.score,
        deltaMissingFeatureKeys: delta.missingFeatureKeys ?? []
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.tsMs - right.tsMs || left.pointId.localeCompare(right.pointId));
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

function nearestNextPositiveEpisode(row, episodes) {
  return episodes
    .filter((episode) => episode.pointId === row.pointId && episode.startTsMs > row.tsMs)
    .sort((left, right) => left.startTsMs - right.startTsMs)[0];
}

function falsePositiveProximity(rows, episodes) {
  const fpRows = rows.filter((row) => row.label === 0 && row.predicted === 1);
  const counts = Object.fromEntries(FUTURE_PROXIMITY_DAYS.map((days) => [`within${days}d`, 0]));
  for (const row of fpRows) {
    const next = nearestNextPositiveEpisode(row, episodes);
    const daysToNext = next ? (next.startTsMs - row.tsMs) / DAY_MS : null;
    for (const days of FUTURE_PROXIMITY_DAYS) {
      if (daysToNext !== null && daysToNext >= 0 && daysToNext <= days) counts[`within${days}d`] += 1;
    }
  }
  return {
    fpCount: fpRows.length,
    ...counts,
    withoutPositiveWithin30d: fpRows.length - counts.within30d
  };
}

function triggerHit(row, trigger) {
  if (!trigger) return false;
  const value = row.values[trigger.featureKey];
  if (typeof value !== "number" || !Number.isFinite(value)) return false;
  return trigger.direction === "high" ? value >= trigger.threshold : value <= trigger.threshold;
}

function applyPolicy(rows, policy) {
  return rows.map((row) => {
    const primaryHit = row.primaryScore >= policy.primaryThreshold;
    const seasonAllowed = policy.targetSeasons.includes(row.season);
    const deltaExpertHit =
      policy.requiresDeltaExpert !== true ||
      (typeof row.deltaScore === "number" && row.deltaScore >= policy.deltaThreshold);
    const seasonalHit = seasonAllowed && triggerHit(row, policy.trigger) && deltaExpertHit;
    return {
      ...row,
      primaryHit,
      seasonalHit,
      deltaExpertHit,
      predicted: primaryHit || seasonalHit ? 1 : 0
    };
  });
}

function guardrail(policyReport, baseline) {
  const c = policyReport.overall;
  const fpGrowth = c.fp / Math.max(1, baseline.overall.fp);
  const autumn = policyReport.bySeason.find((row) => row.key === "autumn");
  const winter = policyReport.bySeason.find((row) => row.key === "winter");
  const baselineWinter = baseline.bySeason.find((row) => row.key === "winter");
  const reviewBlockers = [];
  if (c.precision < 0.18) reviewBlockers.push("precision below 0.18 review floor");
  if (c.balancedAccuracy < 0.62) reviewBlockers.push("balancedAccuracy below 0.62 review floor");
  if (c.fp > 182) reviewBlockers.push("FP above strict policy ceiling 182");
  if (fpGrowth > 1.3) reviewBlockers.push("FP growth above 1.30x primary baseline");
  if (policyReport.leadTime.hitRate < 0.48) reviewBlockers.push("lead hit rate below strict review floor 0.48");
  if ((autumn?.recall ?? 0) < 0.2) reviewBlockers.push("autumn recall below 0.20");
  if ((winter?.recall ?? 0) <= (baselineWinter?.recall ?? 0)) {
    reviewBlockers.push("winter recall does not improve over baseline");
  }
  const promotionBlockers = [...reviewBlockers];
  if (policyReport.leadTime.hitRate < 0.5) promotionBlockers.push("lead hit rate below 0.50 promotion rehearsal floor");
  if ((winter?.recall ?? 0) < 0.2) promotionBlockers.push("winter recall below 0.20 promotion floor");
  if (policyReport.promotionEligible !== true) promotionBlockers.push("policy promotionEligible is false");
  return {
    passReview: reviewBlockers.length === 0,
    passPromotionRehearsal: promotionBlockers.length === 0,
    fpGrowth,
    autumnRecall: autumn?.recall ?? 0,
    winterRecall: winter?.recall ?? 0,
    reviewBlockers,
    promotionBlockers,
    promotionStatus: reviewBlockers.length === 0 ? "bounded-review-candidate" : "offline-review-only"
  };
}

function compact(policyReport) {
  return {
    key: policyReport.key,
    seasonalHitCount: policyReport.seasonalHitCount,
    deltaScoreAvailableCount: policyReport.deltaScoreAvailableCount,
    overall: policyReport.overall,
    leadTime: policyReport.leadTime,
    falsePositiveProximity: policyReport.falsePositiveProximity,
    guardrail: policyReport.guardrail
  };
}

function evaluatePolicy(rows, episodes, policy, baseline = null) {
  const evaluatedRows = applyPolicy(rows, policy);
  const bySeason = groupMetrics(evaluatedRows, (row) => row.season);
  const byPoint = groupMetrics(evaluatedRows, (row) => row.pointId);
  const report = {
    ...policy,
    evaluatedCount: evaluatedRows.length,
    deltaScoreAvailableCount: evaluatedRows.filter((row) => typeof row.deltaScore === "number").length,
    seasonalHitCount: evaluatedRows.filter((row) => row.seasonalHit).length,
    overall: confusion(evaluatedRows),
    bySeason,
    byPoint,
    byMonth: groupMetrics(evaluatedRows, (row) => row.month),
    leadTime: episodeLeadMetrics(evaluatedRows, episodes),
    falsePositiveProximity: falsePositiveProximity(evaluatedRows, episodes)
  };
  return {
    ...report,
    guardrail: baseline ? guardrail(report, baseline) : null
  };
}

function buildPolicies(primaryThreshold, deltaThreshold) {
  return [
    {
      key: "primary-only",
      description: "Primary rainfall-reservoir challenger only.",
      primaryThreshold,
      targetSeasons: [],
      trigger: null,
      requiresDeltaExpert: false,
      deltaThreshold,
      promotionEligible: false
    },
    {
      key: "seasonal-gate.strict-24h-delta.review",
      description: "Autumn/winter strict 24h displacement-delta gate.",
      primaryThreshold,
      targetSeasons: ["autumn", "winter"],
      trigger: { featureKey: "displacementSurfaceMm_delta_24h", direction: "low", threshold: -1.2 },
      requiresDeltaExpert: false,
      deltaThreshold,
      promotionEligible: false
    },
    {
      key: "seasonal-gate.lead-24h-delta.exploratory",
      description: "Autumn/winter loose 24h displacement-delta upper-bound gate.",
      primaryThreshold,
      targetSeasons: ["autumn", "winter"],
      trigger: { featureKey: "displacementSurfaceMm_delta_24h", direction: "low", threshold: -0.8 },
      requiresDeltaExpert: false,
      deltaThreshold,
      promotionEligible: false
    },
    {
      key: "seasonal-gate.winter-recall-72h.exploratory",
      description: "Autumn/winter 72h displacement-delta recall ceiling test.",
      primaryThreshold,
      targetSeasons: ["autumn", "winter"],
      trigger: { featureKey: "displacementSurfaceMm_delta_72h", direction: "low", threshold: -0.8 },
      requiresDeltaExpert: false,
      deltaThreshold,
      promotionEligible: false
    },
    {
      key: "moe.delta-confirmed-strict-24h.offline",
      description: "Strict 24h seasonal gate confirmed by the delta-family expert score.",
      primaryThreshold,
      targetSeasons: ["autumn", "winter"],
      trigger: { featureKey: "displacementSurfaceMm_delta_24h", direction: "low", threshold: -1.2 },
      requiresDeltaExpert: true,
      deltaThreshold,
      promotionEligible: false
    }
  ];
}

function renderMarkdown(report) {
  const lines = [];
  lines.push("# Baijiabao Seasonal / MoE Policy Check");
  lines.push("");
  lines.push(`Generated at: ${report.generatedAt}`);
  lines.push("");
  lines.push("## Policy Results");
  lines.push("");
  lines.push("| policy | BA | precision | recall | FP | FN | lead hit | autumn recall | winter recall | status |");
  lines.push("|---|---:|---:|---:|---:|---:|---:|---:|---:|---|");
  for (const policy of report.policies) {
    lines.push(
      `| ${policy.key} | ${policy.overall.balancedAccuracy.toFixed(4)} | ${policy.overall.precision.toFixed(
        4
      )} | ${policy.overall.recall.toFixed(4)} | ${policy.overall.fp} | ${
        policy.overall.fn
      } | ${policy.leadTime.hitRate.toFixed(4)} | ${(policy.guardrail?.autumnRecall ?? 0).toFixed(4)} | ${(
        policy.guardrail?.winterRecall ?? 0
      ).toFixed(4)} | ${policy.guardrail?.promotionStatus ?? "baseline"} |`
    );
  }
  lines.push("");
  lines.push("## Decision");
  lines.push("");
  lines.push(report.decision);
  lines.push("");
  return `${lines.join("\n")}\n`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = process.cwd();
  const validationPath = path.resolve(repoRoot, args.validationSamples);
  const primaryRegistryPath = path.resolve(repoRoot, args.primaryRegistry);
  const deltaRegistryPath = path.resolve(repoRoot, args.deltaRegistry);
  const primaryArtifact = await readFirstArtifact(primaryRegistryPath);
  const deltaArtifact = await readFirstArtifact(deltaRegistryPath);
  const samples = await readJsonLines(validationPath);
  const primaryThreshold = readThreshold(primaryArtifact);
  const deltaThreshold = readThreshold(deltaArtifact);
  const rows = buildRows(samples, args.labelKey, primaryArtifact, deltaArtifact);
  const episodes = buildEpisodes(rows);
  const policySpecs = buildPolicies(primaryThreshold, deltaThreshold);
  const baseline = evaluatePolicy(rows, episodes, policySpecs[0], null);
  const policies = [baseline, ...policySpecs.slice(1).map((policy) => evaluatePolicy(rows, episodes, policy, baseline))];
  const bestReviewCandidate =
    policies
      .filter((policy) => policy.key !== "primary-only")
      .filter((policy) => policy.guardrail?.passReview)
      .sort(
        (left, right) =>
          right.leadTime.hitRate - left.leadTime.hitRate ||
          right.overall.balancedAccuracy - left.overall.balancedAccuracy
      )[0] ?? null;
  const report = {
    generatedAt: new Date().toISOString(),
    validationSamplesPath: validationPath,
    primaryRegistryPath,
    deltaRegistryPath,
    labelKey: args.labelKey,
    primary: {
      modelKey: primaryArtifact.modelKey,
      threshold: primaryThreshold
    },
    deltaExpert: {
      modelKey: deltaArtifact.modelKey,
      threshold: deltaThreshold,
      promotionEligible: deltaArtifact.metadata?.promotionEligible === true
    },
    sampleSummary: {
      rawSampleCount: samples.length,
      evaluatedCount: rows.length,
      positiveCount: rows.filter((row) => row.label === 1).length,
      negativeCount: rows.filter((row) => row.label === 0).length,
      deltaScoreAvailableCount: rows.filter((row) => typeof row.deltaScore === "number").length,
      episodeCount: episodes.length
    },
    guardrails: {
      precisionMin: 0.18,
      balancedAccuracyMin: 0.62,
      fpMax: 182,
      fpGrowthMax: 1.3,
      leadHitReviewMin: 0.48,
      autumnRecallMin: 0.2,
      winterRecallPromotionMin: 0.2
    },
    baseline: compact(baseline),
    policies,
    bestReviewCandidate: bestReviewCandidate ? compact(bestReviewCandidate) : null,
    decision: bestReviewCandidate
      ? "A bounded offline seasonal/MoE policy passes review guardrails, but every policy remains promotionEligible=false until label semantics and raw FP review are resolved."
      : "No bounded offline seasonal/MoE policy passes the review guardrails. Keep runtime unchanged and continue label/episode review before adding model complexity."
  };
  const outDir = path.resolve(repoRoot, args.outDir);
  const jsonPath = path.join(outDir, "baijiabao-seasonal-moe-policy.report.json");
  const mdPath = path.join(outDir, "baijiabao-seasonal-moe-policy.report.md");
  await writeJson(jsonPath, report);
  await writeText(mdPath, renderMarkdown(report));
  console.log(
    JSON.stringify(
      {
        reportPath: jsonPath,
        markdownPath: mdPath,
        primary: report.primary,
        deltaExpert: report.deltaExpert,
        sampleSummary: report.sampleSummary,
        policies: report.policies.map(compact),
        bestReviewCandidate: report.bestReviewCandidate,
        decision: report.decision
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
