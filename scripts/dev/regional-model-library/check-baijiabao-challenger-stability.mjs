import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const DEFAULT_VALIDATION_SAMPLES =
  ".tmp/regional-model-library/out/threegorges-baijiabao/splits/labeled/baijiabao.validation.future-labels.window-features.jsonl";
const DEFAULT_OUT_DIR = ".tmp/regional-model-library/out/artifacts/baijiabao-challenger-stability";
const DAY_MS = 24 * 3600 * 1000;
const EPISODE_GAP_DAYS = 1.5;
const LEAD_WINDOW_DAYS = 7;

const MODELS = [
  {
    key: "published",
    role: "current-runtime-candidate",
    registryPath: "artifacts/models/regional-experts/phase1-monitoring-candidates/registry.json"
  },
  {
    key: "primaryWarningChallenger",
    role: "primary-warning-candidate",
    registryPath:
      ".tmp/regional-model-library/out/artifacts/baijiabao-monitoring-challenger-grid/best-balanced-accuracy.registry.json"
  },
  {
    key: "confirmationChallenger",
    role: "confirmation-candidate",
    registryPath:
      ".tmp/regional-model-library/out/artifacts/baijiabao-monitoring-challenger-grid/best-eligible.registry.json"
  }
];

function parseArgs(argv) {
  const parsed = {
    validationSamples: DEFAULT_VALIDATION_SAMPLES,
    outDir: DEFAULT_OUT_DIR,
    labelKey: "warningHitLabel",
    extraModels: []
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--validation-samples") parsed.validationSamples = argv[++index] ?? parsed.validationSamples;
    if (token === "--out-dir") parsed.outDir = argv[++index] ?? parsed.outDir;
    if (token === "--label-key") parsed.labelKey = argv[++index] ?? parsed.labelKey;
    if (token === "--model") {
      const value = argv[++index] ?? "";
      const [key, role, registryPath] = value.split("=");
      if (key && role && registryPath) parsed.extraModels.push({ key, role, registryPath });
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

function monthKey(ts) {
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return "unknown";
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function readThreshold(artifact) {
  const replaySummary = artifact.metadata?.replaySummary;
  if (typeof replaySummary?.threshold === "number") {
    return {
      threshold: replaySummary.threshold,
      source: "metadata.replaySummary.threshold",
      thresholdMode: replaySummary.thresholdMode ?? null
    };
  }
  const calibration = artifact.metadata?.calibration;
  if (typeof calibration?.threshold === "number") {
    return {
      threshold: calibration.threshold,
      source: "metadata.calibration.threshold",
      thresholdMode: calibration.thresholdMode ?? null
    };
  }
  return { threshold: 0.5, source: "fallback", thresholdMode: "fixed-0.5" };
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
    const centeredValue = normalizedValue - (stage.featureCenters?.[featureKey] ?? 0);
    rawScore += weight * centeredValue;
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
  const stage2 = runStage(artifact.stage2, { ...values, [artifact.stage1.outputKey]: stage1.score });
  return stage2;
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
    .map(([key, groupRows]) => ({ key, count: groupRows.length, positiveCount: groupRows.filter((row) => row.label === 1).length, ...confusion(groupRows) }))
    .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key));
}

function quantile(values, q) {
  const sorted = values.filter((value) => typeof value === "number" && Number.isFinite(value)).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const position = (sorted.length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

function summarize(values) {
  return {
    count: values.length,
    min: values.length > 0 ? Math.min(...values) : null,
    p25: quantile(values, 0.25),
    p50: quantile(values, 0.5),
    p75: quantile(values, 0.75),
    max: values.length > 0 ? Math.max(...values) : null
  };
}

function buildEpisodes(baseRows) {
  const episodes = [];
  const byPoint = groupBy(
    baseRows
      .filter((row) => row.label === 1)
      .slice()
      .sort((left, right) => left.tsMs - right.tsMs),
    (row) => row.pointId
  );

  for (const [key, rows] of byPoint.entries()) {
    let current = null;
    for (const row of rows) {
      if (!current || row.tsMs - current.endTsMs > EPISODE_GAP_DAYS * DAY_MS) {
        current = {
          episodeId: `${key}:${episodes.length + 1}`,
          pointId: key,
          startTs: row.eventTs,
          startTsMs: row.tsMs,
          endTs: row.eventTs,
          endTsMs: row.tsMs,
          positiveSampleIds: [row.sampleId]
        };
        episodes.push(current);
      } else {
        current.endTs = row.eventTs;
        current.endTsMs = row.tsMs;
        current.positiveSampleIds.push(row.sampleId);
      }
    }
  }

  return episodes;
}

function episodeLeadMetrics(evaluatedRows, episodes) {
  const rowsByPoint = groupBy(evaluatedRows, (row) => row.pointId);
  const episodeRows = episodes.map((episode) => {
    const pointRows = (rowsByPoint.get(episode.pointId) ?? []).filter(
      (row) =>
        row.tsMs >= episode.startTsMs - LEAD_WINDOW_DAYS * DAY_MS &&
        row.tsMs <= episode.endTsMs
    );
    const preWindowRows = pointRows.filter((row) => row.tsMs < episode.startTsMs);
    const inEpisodeRows = pointRows.filter((row) => row.tsMs >= episode.startTsMs && row.tsMs <= episode.endTsMs);
    const alertRows = pointRows.filter((row) => row.predicted === 1);
    const preAlertRows = preWindowRows.filter((row) => row.predicted === 1);
    const inEpisodeAlertRows = inEpisodeRows.filter((row) => row.predicted === 1);
    const earliestAlert = alertRows.slice().sort((left, right) => left.tsMs - right.tsMs)[0] ?? null;
    const earliestPreAlert = preAlertRows.slice().sort((left, right) => left.tsMs - right.tsMs)[0] ?? null;
    const firstHit = inEpisodeAlertRows.slice().sort((left, right) => left.tsMs - right.tsMs)[0] ?? null;
    return {
      episodeId: episode.episodeId,
      pointId: episode.pointId,
      startTs: episode.startTs,
      endTs: episode.endTs,
      positiveSampleCount: episode.positiveSampleIds.length,
      contextRowCount: pointRows.length,
      hitInLeadWindow: alertRows.length > 0,
      preAlert: preAlertRows.length > 0,
      hitDuringEpisode: inEpisodeAlertRows.length > 0,
      earliestAlertTs: earliestAlert?.eventTs ?? null,
      earliestPreAlertTs: earliestPreAlert?.eventTs ?? null,
      firstHitTs: firstHit?.eventTs ?? null,
      leadDays:
        earliestAlert !== null
          ? Number(((episode.startTsMs - earliestAlert.tsMs) / DAY_MS).toFixed(3))
          : null,
      preLeadDays:
        earliestPreAlert !== null
          ? Number(((episode.startTsMs - earliestPreAlert.tsMs) / DAY_MS).toFixed(3))
          : null,
      maxScore: pointRows.length > 0 ? Math.max(...pointRows.map((row) => row.score)) : null
    };
  });
  const leadDays = episodeRows.map((row) => row.leadDays).filter((value) => value !== null);
  const preLeadDays = episodeRows.map((row) => row.preLeadDays).filter((value) => value !== null);
  return {
    episodeCount: episodeRows.length,
    hitEpisodeCount: episodeRows.filter((row) => row.hitInLeadWindow).length,
    preAlertEpisodeCount: episodeRows.filter((row) => row.preAlert).length,
    inEpisodeHitCount: episodeRows.filter((row) => row.hitDuringEpisode).length,
    hitRate: episodeRows.length > 0 ? episodeRows.filter((row) => row.hitInLeadWindow).length / episodeRows.length : 0,
    preAlertRate: episodeRows.length > 0 ? episodeRows.filter((row) => row.preAlert).length / episodeRows.length : 0,
    inEpisodeHitRate:
      episodeRows.length > 0 ? episodeRows.filter((row) => row.hitDuringEpisode).length / episodeRows.length : 0,
    leadDays: summarize(leadDays),
    preLeadDays: summarize(preLeadDays),
    episodes: episodeRows
  };
}

function stabilityGate(modelReport) {
  const c = modelReport.overall;
  const seasonRowsWithPositives = modelReport.bySeason.filter((row) => row.positiveCount >= 5);
  const worstSeasonRecall =
    seasonRowsWithPositives.length > 0 ? Math.min(...seasonRowsWithPositives.map((row) => row.recall)) : 0;
  const pointRowsWithPositives = modelReport.byPoint.filter((row) => row.positiveCount >= 5);
  const worstPointRecall =
    pointRowsWithPositives.length > 0 ? Math.min(...pointRowsWithPositives.map((row) => row.recall)) : 0;
  const pass =
    c.balancedAccuracy >= 0.62 &&
    c.precision >= 0.2 &&
    c.recall >= 0.35 &&
    worstSeasonRecall >= 0.2 &&
    worstPointRecall >= 0.2 &&
    modelReport.leadTime.hitRate >= 0.5;
  const blockers = [];
  if (c.balancedAccuracy < 0.62) blockers.push("balancedAccuracy below 0.62 promotion floor");
  if (c.precision < 0.2) blockers.push("precision below 0.20 operating floor");
  if (c.recall < 0.35) blockers.push("recall below 0.35 operating floor");
  if (worstSeasonRecall < 0.2) blockers.push("seasonal recall below 0.20 in a season with >=5 positives");
  if (worstPointRecall < 0.2) blockers.push("point-level recall below 0.20 at a point with >=5 positives");
  if (modelReport.leadTime.hitRate < 0.5) blockers.push("episode hit rate inside 7-day lead window below 0.50");
  return {
    pass,
    blockers,
    promotionRecommendation: pass
      ? "eligible-for-controlled-challenger-promotion"
      : "keep-as-candidate-and-do-not-overwrite-published-registry",
    worstSeasonRecall,
    worstPointRecall
  };
}

function buildModelReport(model, baseRows, episodes) {
  const threshold = readThreshold(model.artifact);
  const evaluatedRows = [];
  const missingRows = [];
  for (const row of baseRows) {
    const execution = runArtifact(model.artifact, row.values);
    if (execution.score === null) {
      missingRows.push({ sampleId: row.sampleId, missingFeatureKeys: execution.missingFeatureKeys });
      continue;
    }
    evaluatedRows.push({
      ...row,
      score: execution.score,
      threshold: threshold.threshold,
      predicted: execution.score >= threshold.threshold ? 1 : 0
    });
  }
  const report = {
    key: model.key,
    role: model.role,
    modelKey: model.artifact.modelKey,
    modelVersion: model.artifact.modelVersion ?? null,
    featureCount: model.artifact.requiredFeatureKeys?.length ?? null,
    threshold: threshold.threshold,
    thresholdMode: threshold.thresholdMode,
    thresholdSource: threshold.source,
    evaluatedCount: evaluatedRows.length,
    fallbackCount: missingRows.length,
    overall: confusion(evaluatedRows),
    bySeason: groupMetrics(evaluatedRows, (row) => row.season),
    byPoint: groupMetrics(evaluatedRows, (row) => row.pointId),
    byMonth: groupMetrics(evaluatedRows, (row) => row.monthKey),
    leadTime: episodeLeadMetrics(evaluatedRows, episodes),
    missingExamples: missingRows.slice(0, 20)
  };
  return {
    ...report,
    gate: stabilityGate(report)
  };
}

function renderMarkdown(report) {
  const lines = [];
  lines.push("# Baijiabao Challenger Stability Check");
  lines.push("");
  lines.push(`Generated at: ${report.generatedAt}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- Validation samples: ${report.sampleSummary.binaryLabelSampleCount}`);
  lines.push(`- Positive samples: ${report.sampleSummary.positiveCount}`);
  lines.push(`- Positive episodes: ${report.episodeSummary.episodeCount}`);
  lines.push("");
  lines.push("## Model Stability");
  lines.push("");
  lines.push("| model | role | BA | precision | recall | FP | FN | lead hit rate | pre-alert rate | gate |");
  lines.push("|---|---|---:|---:|---:|---:|---:|---:|---:|---|");
  for (const model of report.models) {
    lines.push(
      `| ${model.key} | ${model.role} | ${model.overall.balancedAccuracy.toFixed(4)} | ${model.overall.precision.toFixed(
        4
      )} | ${model.overall.recall.toFixed(4)} | ${model.overall.fp} | ${model.overall.fn} | ${model.leadTime.hitRate.toFixed(
        4
      )} | ${model.leadTime.preAlertRate.toFixed(4)} | ${model.gate.pass ? "pass" : "block"} |`
    );
  }
  lines.push("");
  lines.push("## Gate Decisions");
  for (const model of report.models) {
    lines.push("");
    lines.push(`### ${model.key}`);
    lines.push(`- recommendation: ${model.gate.promotionRecommendation}`);
    lines.push(`- worstSeasonRecall: ${model.gate.worstSeasonRecall.toFixed(4)}`);
    lines.push(`- worstPointRecall: ${model.gate.worstPointRecall.toFixed(4)}`);
    if (model.gate.blockers.length === 0) {
      lines.push("- blockers: none");
    } else {
      for (const blocker of model.gate.blockers) lines.push(`- blocker: ${blocker}`);
    }
  }
  lines.push("");
  lines.push("## Primary Warning Read");
  lines.push("");
  lines.push(report.operationalRead.primaryWarning);
  lines.push("");
  lines.push("## Confirmation Read");
  lines.push("");
  lines.push(report.operationalRead.confirmation);
  lines.push("");
  lines.push("Full JSON report contains month, season, point, and episode details.");
  lines.push("");
  return `${lines.join("\n")}\n`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = process.cwd();
  const validationPath = path.resolve(repoRoot, args.validationSamples);
  const outDir = path.resolve(repoRoot, args.outDir);
  const samples = await readJsonLines(validationPath);
  const baseRows = samples
    .map((sample) => {
      const label = toBinaryLabel(sample.labels?.[args.labelKey]);
      const tsMs = Date.parse(sample.eventTs);
      if (label === null || !Number.isFinite(tsMs)) return null;
      return {
        sampleId: sample.sampleId ?? null,
        eventTs: sample.eventTs,
        tsMs,
        label,
        pointId: pointId(sample),
        season: season(sample.eventTs),
        monthKey: monthKey(sample.eventTs),
        displacementLabel:
          typeof sample.labels?.displacementLabel === "number" ? sample.labels.displacementLabel : null,
        values: featureValues(sample)
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.tsMs - right.tsMs || left.pointId.localeCompare(right.pointId));

  const episodes = buildEpisodes(baseRows);
  const models = [];
  for (const modelConfig of [...MODELS, ...args.extraModels]) {
    const registryPath = path.resolve(repoRoot, modelConfig.registryPath);
    const artifact = await readFirstArtifact(registryPath);
    models.push({ ...modelConfig, registryPath, artifact });
  }
  const modelReports = models.map((model) => buildModelReport(model, baseRows, episodes));
  const primary = modelReports.find((model) => model.key === "primaryWarningChallenger");
  const confirmation = modelReports.find((model) => model.key === "confirmationChallenger");
  const report = {
    generatedAt: new Date().toISOString(),
    validationSamplesPath: validationPath,
    labelKey: args.labelKey,
    sampleSummary: {
      rawSampleCount: samples.length,
      binaryLabelSampleCount: baseRows.length,
      positiveCount: baseRows.filter((row) => row.label === 1).length,
      negativeCount: baseRows.filter((row) => row.label === 0).length,
      pointIds: Array.from(new Set(baseRows.map((row) => row.pointId))).sort()
    },
    episodeSummary: {
      episodeGapDays: EPISODE_GAP_DAYS,
      leadWindowDays: LEAD_WINDOW_DAYS,
      episodeCount: episodes.length,
      byPoint: Array.from(groupBy(episodes, (episode) => episode.pointId).entries()).map(([key, rows]) => ({
        key,
        count: rows.length
      }))
    },
    models: modelReports,
    operationalRead: {
      primaryWarning:
        primary?.gate.pass === true
          ? "Primary warning challenger passes the current stability gate and can move to controlled promotion rehearsal."
          : "Primary warning challenger should remain a candidate. It improves FP pressure, but stability blockers still exist before replacing the published registry.",
      confirmation:
        confirmation?.overall.precision >= 0.7 && confirmation?.overall.fp <= 10
          ? "Confirmation challenger is suitable as low-false-positive confirmation / patrol-priority evidence, not as the top-level warning model."
          : "Confirmation challenger does not meet the current low-false-positive confirmation target."
    }
  };

  const jsonPath = path.join(outDir, "baijiabao-challenger-stability.report.json");
  const mdPath = path.join(outDir, "baijiabao-challenger-stability.report.md");
  await writeJson(jsonPath, report);
  await writeText(mdPath, renderMarkdown(report));

  console.log(
    JSON.stringify(
      {
        reportPath: jsonPath,
        markdownPath: mdPath,
        sampleSummary: report.sampleSummary,
        episodeSummary: report.episodeSummary,
        models: report.models.map((model) => ({
          key: model.key,
          modelKey: model.modelKey,
          threshold: model.threshold,
          overall: model.overall,
          leadTime: {
            episodeCount: model.leadTime.episodeCount,
            hitRate: model.leadTime.hitRate,
            preAlertRate: model.leadTime.preAlertRate,
            leadDays: model.leadTime.leadDays
          },
          gate: model.gate
        })),
        operationalRead: report.operationalRead
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
