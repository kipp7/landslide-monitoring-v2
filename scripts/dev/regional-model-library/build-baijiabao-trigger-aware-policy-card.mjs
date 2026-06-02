import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const DEFAULT_TRIGGER_REPORT =
  ".tmp/regional-model-library/out/artifacts/baijiabao-trigger-aware-challenger/baijiabao-trigger-aware-challenger.report.json";
const DEFAULT_VALIDATION_SAMPLES =
  ".tmp/regional-model-library/out/threegorges-baijiabao/splits/labeled/baijiabao.validation.future-labels.window-features.jsonl";
const DEFAULT_PRIMARY_REGISTRY =
  ".tmp/regional-model-library/out/artifacts/baijiabao-monitoring-challenger-grid/best-balanced-accuracy.registry.json";
const DEFAULT_OUT_DIR = ".tmp/regional-model-library/out/artifacts/baijiabao-trigger-aware-policy-card";
const DAY_MS = 24 * 3600 * 1000;
const EPISODE_GAP_DAYS = 1.5;
const LEAD_WINDOW_DAYS = 7;

function parseArgs(argv) {
  const parsed = {
    triggerReport: DEFAULT_TRIGGER_REPORT,
    validationSamples: DEFAULT_VALIDATION_SAMPLES,
    primaryRegistry: DEFAULT_PRIMARY_REGISTRY,
    outDir: DEFAULT_OUT_DIR,
    labelKey: "warningHitLabel",
    policyKey: null
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--trigger-report") parsed.triggerReport = argv[++index] ?? parsed.triggerReport;
    if (token === "--validation-samples") parsed.validationSamples = argv[++index] ?? parsed.validationSamples;
    if (token === "--primary-registry") parsed.primaryRegistry = argv[++index] ?? parsed.primaryRegistry;
    if (token === "--out-dir") parsed.outDir = argv[++index] ?? parsed.outDir;
    if (token === "--label-key") parsed.labelKey = argv[++index] ?? parsed.labelKey;
    if (token === "--policy-key") parsed.policyKey = argv[++index] ?? parsed.policyKey;
  }
  return parsed;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf-8"));
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
  const parsed = await readJson(filePath);
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
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((header) => csvEscape(row[header])).join(","));
  }
  return `${lines.join("\n")}\n`;
}

function toBinaryLabel(value) {
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "number") return value === 1 ? 1 : value === 0 ? 0 : null;
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
        obsTime: sample.rawRef?.originalFields?.obs_time ?? null,
        tsMs,
        season: season(sample.eventTs),
        pointId: pointId(sample),
        label,
        displacementLabel: sample.labels?.displacementLabel ?? null,
        labelMetadata: sample.labelMetadata ?? {},
        qualityFlags: sample.qualityFlags ?? [],
        qualityFlagCodes: (sample.qualityFlags ?? []).map((flag) => flag.code).filter(Boolean),
        sourceRecordKey: sample.sourceRecordKey ?? null,
        sourceDataset: sample.sourceDataset ?? null,
        identity: sample.identity ?? {},
        rawRef: sample.rawRef ?? {},
        values,
        primaryScore: execution.score
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.tsMs - right.tsMs || left.pointId.localeCompare(right.pointId));
}

function confusion(rows, predictionKey) {
  let tp = 0;
  let fp = 0;
  let tn = 0;
  let fn = 0;
  for (const row of rows) {
    const predicted = row[predictionKey] ? 1 : 0;
    if (row.label === 1 && predicted === 1) tp += 1;
    if (row.label === 0 && predicted === 1) fp += 1;
    if (row.label === 0 && predicted === 0) tn += 1;
    if (row.label === 1 && predicted === 0) fn += 1;
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

function summarizeGroup(rows, predictionKey, keyFn) {
  return Array.from(groupBy(rows, keyFn).entries())
    .map(([key, groupRows]) => ({
      key,
      count: groupRows.length,
      positiveCount: groupRows.filter((row) => row.label === 1).length,
      ...confusion(groupRows, predictionKey)
    }))
    .sort((left, right) => left.key.localeCompare(right.key));
}

function conditionHit(row, trigger) {
  const value = row.values[trigger.featureKey];
  if (typeof value !== "number" || !Number.isFinite(value)) return false;
  return trigger.direction === "high" ? value >= trigger.threshold : value <= trigger.threshold;
}

function applyPolicy(rows, policy, baselineThreshold) {
  return rows.map((row) => {
    const baselinePredicted = row.primaryScore >= baselineThreshold;
    const triggerPredicted =
      policy.targetSeasons.includes(row.season) &&
      policy.triggers.some((trigger) => conditionHit(row, trigger));
    return {
      ...row,
      baselinePredicted,
      triggerPredicted,
      policyPredicted: baselinePredicted || triggerPredicted
    };
  });
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

function episodeDetails(rows, episodes) {
  const rowsByPoint = groupBy(rows, (row) => row.pointId);
  return episodes.map((episode) => {
    const context = (rowsByPoint.get(episode.pointId) ?? []).filter(
      (row) => row.tsMs >= episode.startTsMs - LEAD_WINDOW_DAYS * DAY_MS && row.tsMs <= episode.endTsMs
    );
    const baselineAlerts = context.filter((row) => row.baselinePredicted);
    const policyAlerts = context.filter((row) => row.policyPredicted);
    const policyPreAlerts = policyAlerts.filter((row) => row.tsMs < episode.startTsMs);
    const earliestPolicyAlert = policyAlerts.slice().sort((left, right) => left.tsMs - right.tsMs)[0] ?? null;
    return {
      episodeId: episode.episodeId,
      pointId: episode.pointId,
      startTs: episode.startTs,
      endTs: episode.endTs,
      baselineHit: baselineAlerts.length > 0,
      baselinePreAlert: baselineAlerts.some((row) => row.tsMs < episode.startTsMs),
      policyHit: policyAlerts.length > 0,
      policyPreAlert: policyPreAlerts.length > 0,
      earliestPolicyLeadDays: earliestPolicyAlert ? (episode.startTsMs - earliestPolicyAlert.tsMs) / DAY_MS : null,
      contextRows: context.length
    };
  });
}

function countBy(values) {
  const counts = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return Object.entries(counts)
    .map(([key, count]) => ({ key, count }))
    .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key));
}

function pickExampleRows(rows, limit = 12) {
  return rows.slice(0, limit).map((row) => ({
    sampleId: row.sampleId,
    eventTs: row.eventTs,
    obsTime: row.obsTime,
    pointId: row.pointId,
    season: row.season,
    label: row.label,
    displacementLabel: row.displacementLabel,
    primaryScore: row.primaryScore,
    triggerFeatureValues: {
      displacementSurfaceMm_delta_24h: row.values.displacementSurfaceMm_delta_24h ?? null,
      displacementSurfaceMm_delta_72h: row.values.displacementSurfaceMm_delta_72h ?? null,
      reservoirLevelM_delta_24h: row.values.reservoirLevelM_delta_24h ?? null,
      reservoirLevelM_delta_72h: row.values.reservoirLevelM_delta_72h ?? null,
      rainfallCurrentMm_sum_72h: row.values.rainfallCurrentMm_sum_72h ?? null
    },
    qualityFlagCodes: row.qualityFlagCodes
  }));
}

function toReviewRows(rows) {
  return rows.map((row) => ({
    sampleId: row.sampleId,
    sourceDataset: row.sourceDataset,
    eventTs: row.eventTs,
    obsTime: row.obsTime,
    pointId: row.pointId,
    sourceRecordKey: row.sourceRecordKey,
    scopeType: row.identity.scopeType ?? null,
    scopeKey: row.identity.scopeKey ?? null,
    regionCode: row.identity.regionCode ?? null,
    slopeCode: row.identity.slopeCode ?? null,
    stationCode: row.identity.stationCode ?? null,
    sourcePath: row.rawRef.sourcePath ?? null,
    sourceFile: row.rawRef.originalFields?.source_file ?? null,
    sourceSheetName: row.rawRef.originalFields?.source_sheet_name ?? null,
    workbookTitle: row.rawRef.originalFields?.workbook_title ?? null,
    rawMetricName: row.rawRef.originalFields?.raw_metric_name ?? null,
    rawUnit: row.rawRef.originalFields?.raw_unit ?? null,
    rawValueField: row.rawRef.originalFields?.raw_value_field ?? null,
    rawCumulativeDisplacementMm: row.rawRef.originalFields?.cumulative_displacement_mm ?? null,
    rawDailyRainfallMm: row.rawRef.originalFields?.daily_rainfall_mm ?? null,
    rawWaterLevelM: row.rawRef.originalFields?.water_level_m ?? null,
    familyRefs: row.rawRef.familyRefs ?? [],
    season: row.season,
    label: row.label,
    displacementLabel: row.displacementLabel,
    warningLabelDerivationMode: row.labelMetadata.warningHitLabel?.derivationMode ?? null,
    displacementLabelDerivationMode: row.labelMetadata.displacementLabel?.derivationMode ?? null,
    baselinePredicted: row.baselinePredicted,
    triggerPredicted: row.triggerPredicted,
    policyPredicted: row.policyPredicted,
    primaryScore: row.primaryScore,
    displacementSurfaceMm: row.values.displacementSurfaceMm ?? null,
    displacementSurfaceMm_delta_24h: row.values.displacementSurfaceMm_delta_24h ?? null,
    displacementSurfaceMm_delta_72h: row.values.displacementSurfaceMm_delta_72h ?? null,
    rainfallCurrentMm: row.values.rainfallCurrentMm ?? null,
    rainfallCurrentMm_sum_24h: row.values.rainfallCurrentMm_sum_24h ?? null,
    rainfallCurrentMm_sum_72h: row.values.rainfallCurrentMm_sum_72h ?? null,
    reservoirLevelM: row.values.reservoirLevelM ?? null,
    reservoirLevelM_delta_24h: row.values.reservoirLevelM_delta_24h ?? null,
    reservoirLevelM_delta_72h: row.values.reservoirLevelM_delta_72h ?? null,
    qualityFlagCodes: row.qualityFlagCodes.join("|"),
    qualityFlags: row.qualityFlags,
    reviewHint:
      row.label === 1
        ? "new true-positive alert; verify future displacement label and raw displacement change"
        : "new false-positive alert; verify whether this is label noise, recoverable pre-signal, or real noise"
  }));
}

function duplicatePointTimestampSummary(rows) {
  const byPointTs = groupBy(rows, (row) => `${row.pointId}|${row.eventTs}`);
  const byStationTs = groupBy(rows, (row) => `${row.identity.stationCode ?? "unknown"}|${row.eventTs}`);
  return {
    pointTimestampDuplicateGroupCount: Array.from(byPointTs.values()).filter((groupRows) => groupRows.length > 1).length,
    stationTimestampDuplicateGroupCount: Array.from(byStationTs.values()).filter((groupRows) => groupRows.length > 1).length,
    rowCountWithDuplicatePointTimestampFlag: rows.filter((row) =>
      row.qualityFlagCodes.includes("duplicate_point_timestamp_rows")
    ).length,
    interpretation:
      "point_id+eventTs duplicate groups are the strict duplicate check; station+eventTs repeats can be normal because ZD1/ZD2/ZD3 share one station/date."
  };
}

function strictGate(baseline, policy, episodeSummary) {
  const fpGrowth = policy.fp / Math.max(1, baseline.fp);
  const precisionDrop = baseline.precision - policy.precision;
  const failed = [];
  if (fpGrowth > 1.35) failed.push(`fpGrowth ${fpGrowth.toFixed(3)} > 1.35`);
  if (precisionDrop > 0.03) failed.push(`precisionDrop ${precisionDrop.toFixed(3)} > 0.03`);
  if (policy.precision < 0.18) failed.push(`precision ${policy.precision.toFixed(3)} < 0.18`);
  if (episodeSummary.newlyHitEpisodeCount < 10) failed.push("newlyHitEpisodeCount < 10");
  return {
    status: failed.length === 0 ? "pass" : "blocked",
    failed,
    fpGrowth,
    precisionDrop
  };
}

function renderMarkdown(report) {
  const lines = [];
  lines.push("# Baijiabao Trigger-Aware Policy Card");
  lines.push("");
  lines.push(`Generated at: ${report.generatedAt}`);
  lines.push("");
  lines.push("## Policy");
  lines.push("");
  lines.push(`- key: \`${report.policy.key}\``);
  lines.push(`- runtimePromotionStatus: \`${report.policy.runtimePromotionStatus}\``);
  lines.push(`- primaryModelKey: \`${report.policy.primaryModelKey}\``);
  lines.push(`- primaryThreshold: \`${report.policy.primaryThreshold}\``);
  lines.push(`- trigger: \`${report.policy.triggers.map((trigger) => `${trigger.featureKey} ${trigger.direction} ${trigger.threshold}`).join("; ")}\``);
  lines.push(`- targetSeasons: \`${report.policy.targetSeasons.join(",")}\``);
  lines.push("");
  lines.push("## Strict Gate");
  lines.push("");
  lines.push(`- status: \`${report.strictGate.status}\``);
  lines.push(`- fpGrowth: \`${report.strictGate.fpGrowth.toFixed(4)}\``);
  lines.push(`- precisionDrop: \`${report.strictGate.precisionDrop.toFixed(4)}\``);
  lines.push(`- failed: ${report.strictGate.failed.length > 0 ? report.strictGate.failed.map((item) => `\`${item}\``).join(", ") : "none"}`);
  lines.push("");
  lines.push("## Metrics");
  lines.push("");
  lines.push("| mode | BA | precision | recall | FP | FN | lead hit rate |");
  lines.push("|---|---:|---:|---:|---:|---:|---:|");
  lines.push(
    `| baseline | ${report.baseline.overall.balancedAccuracy.toFixed(4)} | ${report.baseline.overall.precision.toFixed(4)} | ${report.baseline.overall.recall.toFixed(4)} | ${report.baseline.overall.fp} | ${report.baseline.overall.fn} | ${report.baseline.leadTime.hitRate.toFixed(4)} |`
  );
  lines.push(
    `| trigger-aware | ${report.policyValidation.overall.balancedAccuracy.toFixed(4)} | ${report.policyValidation.overall.precision.toFixed(4)} | ${report.policyValidation.overall.recall.toFixed(4)} | ${report.policyValidation.overall.fp} | ${report.policyValidation.overall.fn} | ${report.policyValidation.leadTime.hitRate.toFixed(4)} |`
  );
  lines.push("");
  lines.push("## Delta");
  lines.push("");
  lines.push(`- newly alerted TP: \`${report.delta.newlyAlertedTp}\``);
  lines.push(`- newly alerted FP: \`${report.delta.newlyAlertedFp}\``);
  lines.push(`- newly hit episodes: \`${report.episodeReview.newlyHitEpisodeCount}\``);
  lines.push(`- newly pre-alerted episodes: \`${report.episodeReview.newlyPreAlertedEpisodeCount}\``);
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
  const triggerReportPath = path.resolve(repoRoot, args.triggerReport);
  const validationSamplesPath = path.resolve(repoRoot, args.validationSamples);
  const primaryRegistryPath = path.resolve(repoRoot, args.primaryRegistry);
  const outDir = path.resolve(repoRoot, args.outDir);

  const triggerReport = await readJson(triggerReportPath);
  const availablePolicies = [
    triggerReport.bestDeployablePolicy,
    ...(Array.isArray(triggerReport.validationTopPolicies) ? triggerReport.validationTopPolicies : [])
  ].filter(Boolean);
  const selectedPolicy = args.policyKey
    ? availablePolicies.find((policy) => policy.key === args.policyKey)
    : triggerReport.bestDeployablePolicy;
  if (!selectedPolicy) throw new Error("No bestDeployablePolicy found in trigger report.");

  const primaryArtifact = await readFirstArtifact(primaryRegistryPath);
  const baselineThreshold = selectedPolicy.primaryThreshold ?? triggerReport.primary?.threshold;
  const rows = applyPolicy(
    buildRows(await readJsonLines(validationSamplesPath), args.labelKey, primaryArtifact),
    selectedPolicy,
    baselineThreshold
  );

  const baselineOverall = confusion(rows, "baselinePredicted");
  const policyOverall = confusion(rows, "policyPredicted");
  const extraAlerts = rows.filter((row) => !row.baselinePredicted && row.policyPredicted);
  const newlyAlertedTpRows = extraAlerts.filter((row) => row.label === 1);
  const newlyAlertedFpRows = extraAlerts.filter((row) => row.label === 0);
  const episodes = buildEpisodes(rows);
  const episodeRows = episodeDetails(rows, episodes);
  const newlyHitEpisodes = episodeRows.filter((episode) => !episode.baselineHit && episode.policyHit);
  const newlyPreAlertedEpisodes = episodeRows.filter((episode) => !episode.baselinePreAlert && episode.policyPreAlert);
  const episodeReview = {
    episodeCount: episodes.length,
    baselineHitEpisodeCount: episodeRows.filter((episode) => episode.baselineHit).length,
    policyHitEpisodeCount: episodeRows.filter((episode) => episode.policyHit).length,
    newlyHitEpisodeCount: newlyHitEpisodes.length,
    newlyPreAlertedEpisodeCount: newlyPreAlertedEpisodes.length,
    newlyHitByPoint: countBy(newlyHitEpisodes.map((episode) => episode.pointId)),
    newlyHitExamples: newlyHitEpisodes.slice(0, 12)
  };
  const gate = strictGate(baselineOverall, policyOverall, episodeReview);

  const report = {
    generatedAt: new Date().toISOString(),
    source: {
      triggerReportPath,
      validationSamplesPath,
      primaryRegistryPath
    },
    policy: {
      schemaVersion: "trigger-aware-policy-card.v1",
      key: selectedPolicy.key,
      runtimePromotionStatus: gate.status === "pass" ? "candidate-review-required" : "blocked",
      primaryModelKey: primaryArtifact.modelKey,
      primaryModelVersion: primaryArtifact.modelVersion,
      primaryThreshold: baselineThreshold,
      targetSeasons: selectedPolicy.targetSeasons,
      triggers: selectedPolicy.triggers,
      requiredRuntimeFeatures: Array.from(
        new Set([
          ...(primaryArtifact.requiredFeatureKeys ?? []),
          ...selectedPolicy.triggers.map((trigger) => trigger.featureKey)
        ])
      ).sort(),
      nonRuntimeReason:
        gate.status === "pass"
          ? "The policy still needs manual label and field review before runtime registration."
          : "Strict FP and precision guardrails failed; keep this policy offline only."
    },
    baseline: {
      overall: baselineOverall,
      bySeason: summarizeGroup(rows, "baselinePredicted", (row) => row.season),
      byPoint: summarizeGroup(rows, "baselinePredicted", (row) => row.pointId),
      leadTime: triggerReport.baseline?.leadTime ?? null
    },
    policyValidation: {
      overall: policyOverall,
      bySeason: summarizeGroup(rows, "policyPredicted", (row) => row.season),
      byPoint: summarizeGroup(rows, "policyPredicted", (row) => row.pointId),
      leadTime: selectedPolicy.leadTime
    },
    delta: {
      newlyAlertedCount: extraAlerts.length,
      newlyAlertedTp: newlyAlertedTpRows.length,
      newlyAlertedFp: newlyAlertedFpRows.length,
      newlyAlertedBySeason: countBy(extraAlerts.map((row) => row.season)),
      newlyAlertedFpBySeason: countBy(newlyAlertedFpRows.map((row) => row.season)),
      newlyAlertedFpByPoint: countBy(newlyAlertedFpRows.map((row) => row.pointId)),
      newlyAlertedRows: toReviewRows(extraAlerts),
      newlyAlertedTpExamples: pickExampleRows(newlyAlertedTpRows),
      newlyAlertedFpExamples: pickExampleRows(newlyAlertedFpRows)
    },
    labelReview: {
      labelKey: args.labelKey,
      labelDerivationModes: countBy(rows.map((row) => row.labelMetadata?.[args.labelKey]?.derivationMode ?? "unknown")),
      displacementLabelDerivationModes: countBy(
        rows.map((row) => row.labelMetadata?.displacementLabel?.derivationMode ?? "unknown")
      ),
      qualityFlagCodes: countBy(rows.flatMap((row) => row.qualityFlagCodes)),
      duplicateSummary: duplicatePointTimestampSummary(rows),
      risk:
        "Labels are derived from future displacement delta, so autumn/winter trigger gains must be checked against raw observation semantics before runtime promotion."
    },
    episodeReview,
    strictGate: gate,
    decision:
      gate.status === "pass"
        ? "Keep as offline challenger metadata and require manual review before runtime registration."
        : "Do not promote to runtime. The signal is useful for the next model family, but this policy is too costly as a hard online rule."
  };

  await writeJson(path.join(outDir, "baijiabao-trigger-aware-policy-card.json"), report.policy);
  await writeJson(path.join(outDir, "baijiabao-trigger-aware-promotion-review.report.json"), report);
  await writeText(path.join(outDir, "baijiabao-trigger-aware-policy-card.md"), renderMarkdown(report));
  await writeText(path.join(outDir, "baijiabao-trigger-aware-new-alert-review.csv"), toCsv(report.delta.newlyAlertedRows));
  await writeText(path.join(outDir, "baijiabao-trigger-aware-new-episode-review.csv"), toCsv(episodeReview.newlyHitExamples));

  console.log(
    JSON.stringify(
      {
        policyCardPath: path.join(outDir, "baijiabao-trigger-aware-policy-card.json"),
        reviewReportPath: path.join(outDir, "baijiabao-trigger-aware-promotion-review.report.json"),
        markdownPath: path.join(outDir, "baijiabao-trigger-aware-policy-card.md"),
        newAlertReviewCsvPath: path.join(outDir, "baijiabao-trigger-aware-new-alert-review.csv"),
        newEpisodeReviewCsvPath: path.join(outDir, "baijiabao-trigger-aware-new-episode-review.csv"),
        policy: report.policy,
        baseline: report.baseline.overall,
        policyValidation: report.policyValidation.overall,
        delta: report.delta,
        episodeReview,
        strictGate: gate,
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
