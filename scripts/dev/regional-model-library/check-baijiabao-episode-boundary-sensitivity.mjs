import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const DEFAULT_VALIDATION_SAMPLES =
  ".tmp/regional-model-library/out/threegorges-baijiabao/splits/labeled/baijiabao.validation.future-labels.window-features.jsonl";
const DEFAULT_PRIMARY_REGISTRY =
  ".tmp/regional-model-library/out/artifacts/baijiabao-monitoring-challenger-grid/best-balanced-accuracy.registry.json";
const DEFAULT_OUT_DIR = ".tmp/regional-model-library/out/artifacts/baijiabao-episode-boundary-sensitivity";
const DAY_MS = 24 * 3600 * 1000;
const EPISODE_GAP_DAYS = 1.5;
const LEAD_WINDOW_DAYS = 7;

function parseArgs(argv) {
  const parsed = {
    validationSamples: DEFAULT_VALIDATION_SAMPLES,
    primaryRegistry: DEFAULT_PRIMARY_REGISTRY,
    outDir: DEFAULT_OUT_DIR,
    labelKey: "warningHitLabel"
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
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

function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return /[",\r\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function toCsv(rows) {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  return `${[headers.join(","), ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(","))].join(
    "\n"
  )}\n`;
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

function featureValues(sample) {
  return Object.entries(sample.metricsNormalized ?? {}).reduce((accumulator, [featureKey, value]) => {
    if (typeof value === "number" && Number.isFinite(value)) accumulator[featureKey] = value;
    return accumulator;
  }, {});
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
  for (const [point, pointRows] of groupBy(rows.filter((row) => row.immediateLabel === 1), (row) => row.pointId).entries()) {
    let current = null;
    for (const row of pointRows.slice().sort((left, right) => left.tsMs - right.tsMs)) {
      if (!current || row.tsMs - current.endTsMs > EPISODE_GAP_DAYS * DAY_MS) {
        current = {
          episodeId: `${point}:${episodes.length + 1}`,
          pointId: point,
          startTsMs: row.tsMs,
          endTsMs: row.tsMs,
          startTs: row.eventTs,
          endTs: row.eventTs
        };
        episodes.push(current);
      } else {
        current.endTsMs = row.tsMs;
        current.endTs = row.eventTs;
      }
    }
  }
  return episodes;
}

function nearestFutureEpisode(row, episodes) {
  return episodes
    .filter((episode) => episode.pointId === row.pointId && episode.startTsMs > row.tsMs)
    .sort((left, right) => left.startTsMs - right.startTsMs)[0] ?? null;
}

function buildRows(samples, labelKey, artifact, threshold) {
  return samples
    .map((sample) => {
      const immediateLabel = toBinaryLabel(sample.labels?.[labelKey]);
      const tsMs = Date.parse(sample.eventTs);
      if (immediateLabel === null || !Number.isFinite(tsMs)) return null;
      const values = featureValues(sample);
      const primary = runArtifact(artifact, values);
      if (primary.score === null) return null;
      return {
        sampleId: sample.sampleId ?? null,
        eventTs: sample.eventTs,
        tsMs,
        pointId: pointId(sample),
        season: season(sample.eventTs),
        month: monthKey(sample.eventTs),
        immediateLabel,
        displacementLabel:
          typeof sample.labels?.displacementLabel === "number" && Number.isFinite(sample.labels.displacementLabel)
            ? sample.labels.displacementLabel
            : null,
        values,
        primaryScore: primary.score,
        primaryHit: primary.score >= threshold,
        qualityFlagCodes: (sample.qualityFlags ?? []).map((flag) => flag.code).filter(Boolean).join("|")
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.tsMs - right.tsMs || left.pointId.localeCompare(right.pointId));
}

function annotateFutureProximity(rows, episodes) {
  return rows.map((row) => {
    const next = nearestFutureEpisode(row, episodes);
    const daysToNextPositiveEpisode = next ? (next.startTsMs - row.tsMs) / DAY_MS : null;
    return {
      ...row,
      nextPositiveEpisodeId: next?.episodeId ?? null,
      daysToNextPositiveEpisode
    };
  });
}

function labelForVariant(row, variant) {
  if (variant.mode === "immediate") return row.immediateLabel;
  if (variant.mode === "preSignalAsPositive") {
    if (row.immediateLabel === 1) return 1;
    return row.daysToNextPositiveEpisode !== null &&
      row.daysToNextPositiveEpisode >= 0 &&
      row.daysToNextPositiveEpisode <= variant.days
      ? 1
      : 0;
  }
  if (variant.mode === "excludePreSignalNegatives") {
    if (
      row.immediateLabel === 0 &&
      row.daysToNextPositiveEpisode !== null &&
      row.daysToNextPositiveEpisode >= 0 &&
      row.daysToNextPositiveEpisode <= variant.days
    ) {
      return null;
    }
    return row.immediateLabel;
  }
  return row.immediateLabel;
}

function policyPredicted(row, policy) {
  if (policy.key === "primary-only") return row.primaryHit ? 1 : 0;
  const inSeason = policy.targetSeasons.includes(row.season);
  const value = row.values[policy.trigger.featureKey];
  const triggerHit =
    typeof value === "number" &&
    Number.isFinite(value) &&
    (policy.trigger.direction === "low" ? value <= policy.trigger.threshold : value >= policy.trigger.threshold);
  return row.primaryHit || (inSeason && triggerHit) ? 1 : 0;
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

function episodeLeadMetrics(evaluatedRows, episodes) {
  const rowsByPoint = groupBy(evaluatedRows, (row) => row.pointId);
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

function evaluatePolicyVariant(rows, episodes, policy, variant) {
  const evaluatedRows = rows
    .map((row) => {
      const label = labelForVariant(row, variant);
      if (label === null) return null;
      return {
        ...row,
        label,
        predicted: policyPredicted(row, policy)
      };
    })
    .filter(Boolean);
  const bySeason = groupMetrics(evaluatedRows, (row) => row.season);
  return {
    policyKey: policy.key,
    variantKey: variant.key,
    evaluatedCount: evaluatedRows.length,
    positiveCount: evaluatedRows.filter((row) => row.label === 1).length,
    addedPositiveCount: evaluatedRows.filter((row) => row.immediateLabel === 0 && row.label === 1).length,
    excludedCount: rows.length - evaluatedRows.length,
    overall: confusion(evaluatedRows),
    bySeason,
    byPoint: groupMetrics(evaluatedRows, (row) => row.pointId),
    leadTimeOnOriginalEpisodes: episodeLeadMetrics(evaluatedRows, episodes),
    autumnRecall: bySeason.find((row) => row.key === "autumn")?.recall ?? 0,
    winterRecall: bySeason.find((row) => row.key === "winter")?.recall ?? 0
  };
}

function buildPolicies(primaryThreshold) {
  return [
    {
      key: "primary-only",
      primaryThreshold,
      targetSeasons: [],
      trigger: null
    },
    {
      key: "seasonal-gate.strict-24h-delta.review",
      primaryThreshold,
      targetSeasons: ["autumn", "winter"],
      trigger: { featureKey: "displacementSurfaceMm_delta_24h", direction: "low", threshold: -1.2 }
    },
    {
      key: "seasonal-gate.lead-24h-delta.exploratory",
      primaryThreshold,
      targetSeasons: ["autumn", "winter"],
      trigger: { featureKey: "displacementSurfaceMm_delta_24h", direction: "low", threshold: -0.8 }
    },
    {
      key: "seasonal-gate.winter-recall-72h.exploratory",
      primaryThreshold,
      targetSeasons: ["autumn", "winter"],
      trigger: { featureKey: "displacementSurfaceMm_delta_72h", direction: "low", threshold: -0.8 }
    }
  ];
}

function renderMarkdown(report) {
  const lines = [];
  lines.push("# Baijiabao Episode Boundary Sensitivity");
  lines.push("");
  lines.push(`Generated at: ${report.generatedAt}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- evaluated rows: \`${report.sampleSummary.evaluatedCount}\``);
  lines.push(`- original positive episodes: \`${report.sampleSummary.originalEpisodeCount}\``);
  lines.push(`- best immediate policy: \`${report.read.bestImmediatePolicy}\``);
  lines.push(`- best 14d episode-aware policy: \`${report.read.bestPreSignal14Policy}\``);
  lines.push(`- best 14d grey-zone-excluded policy: \`${report.read.bestExcludePreSignal14Policy}\``);
  lines.push("");
  lines.push("## Metrics");
  lines.push("");
  lines.push("| label variant | policy | BA | precision | recall | FP | FN | autumn recall | winter recall | added positives | excluded |");
  lines.push("|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
  for (const row of report.results) {
    lines.push(
      `| ${row.variantKey} | ${row.policyKey} | ${row.overall.balancedAccuracy.toFixed(4)} | ${row.overall.precision.toFixed(
        4
      )} | ${row.overall.recall.toFixed(4)} | ${row.overall.fp} | ${row.overall.fn} | ${row.autumnRecall.toFixed(
        4
      )} | ${row.winterRecall.toFixed(4)} | ${row.addedPositiveCount} | ${row.excludedCount} |`
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
  const artifact = await readFirstArtifact(primaryRegistryPath);
  const threshold = readThreshold(artifact);
  const samples = await readJsonLines(validationPath);
  const rows = buildRows(samples, args.labelKey, artifact, threshold);
  const episodes = buildEpisodes(rows);
  const annotatedRows = annotateFutureProximity(rows, episodes);
  const variants = [
    { key: "immediate-derived-label", mode: "immediate" },
    { key: "preSignal7d-as-positive", mode: "preSignalAsPositive", days: 7 },
    { key: "preSignal14d-as-positive", mode: "preSignalAsPositive", days: 14 },
    { key: "preSignal30d-as-positive", mode: "preSignalAsPositive", days: 30 },
    { key: "exclude-preSignal14d-negatives", mode: "excludePreSignalNegatives", days: 14 }
  ];
  const policies = buildPolicies(threshold);
  const results = variants.flatMap((variant) =>
    policies.map((policy) => evaluatePolicyVariant(annotatedRows, episodes, policy, variant))
  );
  const immediateResults = results.filter((row) => row.variantKey === "immediate-derived-label");
  const preSignal14Results = results.filter((row) => row.variantKey === "preSignal14d-as-positive");
  const excludePreSignal14Results = results.filter((row) => row.variantKey === "exclude-preSignal14d-negatives");
  const bestImmediate = immediateResults.slice().sort((a, b) => b.overall.balancedAccuracy - a.overall.balancedAccuracy)[0];
  const bestPreSignal14 = preSignal14Results
    .slice()
    .sort((a, b) => b.overall.balancedAccuracy - a.overall.balancedAccuracy)[0];
  const bestExcludePreSignal14 = excludePreSignal14Results
    .slice()
    .sort((a, b) => b.overall.balancedAccuracy - a.overall.balancedAccuracy)[0];
  const report = {
    generatedAt: new Date().toISOString(),
    validationSamplesPath: validationPath,
    primaryRegistryPath,
    primary: {
      modelKey: artifact.modelKey,
      threshold
    },
    sampleSummary: {
      rawSampleCount: samples.length,
      evaluatedCount: rows.length,
      immediatePositiveCount: rows.filter((row) => row.immediateLabel === 1).length,
      immediateNegativeCount: rows.filter((row) => row.immediateLabel === 0).length,
      originalEpisodeCount: episodes.length,
      negativesWithin7dFuturePositive: annotatedRows.filter(
        (row) => row.immediateLabel === 0 && row.daysToNextPositiveEpisode !== null && row.daysToNextPositiveEpisode <= 7
      ).length,
      negativesWithin14dFuturePositive: annotatedRows.filter(
        (row) => row.immediateLabel === 0 && row.daysToNextPositiveEpisode !== null && row.daysToNextPositiveEpisode <= 14
      ).length,
      negativesWithin30dFuturePositive: annotatedRows.filter(
        (row) => row.immediateLabel === 0 && row.daysToNextPositiveEpisode !== null && row.daysToNextPositiveEpisode <= 30
      ).length
    },
    variants,
    policies,
    results,
    read: {
      bestImmediatePolicy: bestImmediate?.policyKey ?? null,
      bestPreSignal14Policy: bestPreSignal14?.policyKey ?? null,
      bestExcludePreSignal14Policy: bestExcludePreSignal14?.policyKey ?? null,
      bestImmediateBalancedAccuracy: bestImmediate?.overall.balancedAccuracy ?? null,
      bestPreSignal14BalancedAccuracy: bestPreSignal14?.overall.balancedAccuracy ?? null
      ,
      bestExcludePreSignal14BalancedAccuracy: bestExcludePreSignal14?.overall.balancedAccuracy ?? null
    },
    decision:
      bestExcludePreSignal14?.policyKey === "seasonal-gate.strict-24h-delta.review"
        ? "The strict 24h seasonal gate is strongest when <=14d pre-positive negatives are treated as a grey zone rather than hard false positives. Do not relabel all pre-signals as positives; define an episode-boundary grey zone before promotion."
        : "Episode-aware labels change the metric surface, but do not yet make the strict gate clearly dominant. Continue raw label review before model promotion."
  };
  const outDir = path.resolve(repoRoot, args.outDir);
  const jsonPath = path.join(outDir, "baijiabao-episode-boundary-sensitivity.report.json");
  const mdPath = path.join(outDir, "baijiabao-episode-boundary-sensitivity.report.md");
  const csvPath = path.join(outDir, "baijiabao-episode-boundary-sensitivity.results.csv");
  await writeJson(jsonPath, report);
  await writeText(mdPath, renderMarkdown(report));
  await writeText(csvPath, toCsv(results.map((row) => ({
    variantKey: row.variantKey,
    policyKey: row.policyKey,
    evaluatedCount: row.evaluatedCount,
    positiveCount: row.positiveCount,
    addedPositiveCount: row.addedPositiveCount,
    excludedCount: row.excludedCount,
    balancedAccuracy: row.overall.balancedAccuracy,
    precision: row.overall.precision,
    recall: row.overall.recall,
    fp: row.overall.fp,
    fn: row.overall.fn,
    autumnRecall: row.autumnRecall,
    winterRecall: row.winterRecall,
    leadHitRateOnOriginalEpisodes: row.leadTimeOnOriginalEpisodes.hitRate
  }))));
  console.log(
    JSON.stringify(
      {
        reportPath: jsonPath,
        markdownPath: mdPath,
        csvPath,
        sampleSummary: report.sampleSummary,
        read: report.read,
        topResults: results
          .slice()
          .sort((left, right) => right.overall.balancedAccuracy - left.overall.balancedAccuracy)
          .slice(0, 8)
          .map((row) => ({
            variantKey: row.variantKey,
            policyKey: row.policyKey,
            overall: row.overall,
            autumnRecall: row.autumnRecall,
            winterRecall: row.winterRecall,
            addedPositiveCount: row.addedPositiveCount,
            excludedCount: row.excludedCount
          })),
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
