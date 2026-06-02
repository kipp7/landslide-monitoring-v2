import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const DEFAULT_VALIDATION_SAMPLES =
  ".tmp/regional-model-library/out/artifacts/baijiabao-episode-grey-zone-label-policy/baijiabao.validation.episode-grey-zone-labels.jsonl";
const DEFAULT_SEASONAL_REPORT =
  ".tmp/regional-model-library/out/artifacts/baijiabao-seasonal-expert-challenger/baijiabao-seasonal-expert-challenger.report.json";
const DEFAULT_PRIMARY_REGISTRY =
  ".tmp/regional-model-library/out/artifacts/baijiabao-monitoring-challenger-grid/best-balanced-accuracy.registry.json";
const DEFAULT_OUT_DIR = ".tmp/regional-model-library/out/artifacts/baijiabao-seasonal-expert-failure-review";
const TARGET_SEASONS = ["autumn", "winter"];

function parseArgs(argv) {
  const parsed = {
    validationSamples: DEFAULT_VALIDATION_SAMPLES,
    seasonalReport: DEFAULT_SEASONAL_REPORT,
    primaryRegistry: DEFAULT_PRIMARY_REGISTRY,
    outDir: DEFAULT_OUT_DIR
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--validation-samples") parsed.validationSamples = argv[++index] ?? parsed.validationSamples;
    if (token === "--seasonal-report") parsed.seasonalReport = argv[++index] ?? parsed.seasonalReport;
    if (token === "--primary-registry") parsed.primaryRegistry = argv[++index] ?? parsed.primaryRegistry;
    if (token === "--out-dir") parsed.outDir = argv[++index] ?? parsed.outDir;
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

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf-8"));
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
  const text = String(value);
  if (/[",\r\n]/u.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

async function writeCsv(filePath, rows) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const headers = Array.from(
    rows.reduce((set, row) => {
      for (const key of Object.keys(row)) set.add(key);
      return set;
    }, new Set())
  );
  const lines = [
    headers.map(csvEscape).join(","),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(","))
  ];
  await writeFile(filePath, `${lines.join("\n")}\n`, "utf-8");
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

function runBooster(booster, row) {
  if (!TARGET_SEASONS.includes(row.season)) return { score: null, missingFeatureKeys: [] };
  return runStage(booster, row.values);
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

function summarizeScores(rows, key) {
  const values = rows.map((row) => row[key]).filter((value) => typeof value === "number");
  return {
    count: values.length,
    min: values.length > 0 ? Math.min(...values) : null,
    p10: quantile(values, 0.1),
    p25: quantile(values, 0.25),
    p50: quantile(values, 0.5),
    p75: quantile(values, 0.75),
    p90: quantile(values, 0.9),
    max: values.length > 0 ? Math.max(...values) : null
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

function compactRow(row) {
  const original = row.sample.rawRef?.originalFields ?? {};
  return {
    sampleId: row.sampleId,
    eventTs: row.eventTs,
    season: row.season,
    pointId: row.pointId,
    boundaryClass: row.sample.labels?.warningHitLabelEpisodeBoundary ?? null,
    immediateLabel: row.immediateLabel,
    greyZoneLabel: row.greyZoneLabel,
    primaryScore: row.primaryScore,
    boosterScore: row.boosterScore,
    primaryHit: row.primaryHit,
    conservativeHit: row.conservativeHit,
    guardedHit: row.guardedHit,
    conservativeIncremental: row.conservativeHit && !row.primaryHit,
    guardedIncremental: row.guardedHit && !row.primaryHit,
    displacementLabel: row.sample.labels?.displacementLabel ?? null,
    displacementSurfaceMm: row.values.displacementSurfaceMm ?? null,
    displacementSurfaceMm_delta_24h: row.values.displacementSurfaceMm_delta_24h ?? null,
    displacementSurfaceMm_delta_72h: row.values.displacementSurfaceMm_delta_72h ?? null,
    reservoirLevelM: row.values.reservoirLevelM ?? null,
    reservoirLevelM_delta_24h: row.values.reservoirLevelM_delta_24h ?? null,
    reservoirLevelM_delta_72h: row.values.reservoirLevelM_delta_72h ?? null,
    rainfallCurrentMm: row.values.rainfallCurrentMm ?? null,
    rainfallCurrentMm_sum_24h: row.values.rainfallCurrentMm_sum_24h ?? null,
    rainfallCurrentMm_sum_72h: row.values.rainfallCurrentMm_sum_72h ?? null,
    raw_obs_time: original.obs_time ?? null,
    raw_point_id: original.point_id ?? null,
    raw_cumulative_displacement_mm: original.cumulative_displacement_mm ?? null,
    raw_daily_rainfall_mm: original.daily_rainfall_mm ?? null,
    raw_water_level_m: original.water_level_m ?? null
  };
}

function renderMarkdown(report) {
  const lines = [];
  lines.push("# Baijiabao Seasonal Expert Failure Review");
  lines.push("");
  lines.push(`Generated at: ${report.generatedAt}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- target-season rows: \`${report.summary.targetSeasonRows}\``);
  lines.push(`- target-season immediate positives: \`${report.summary.targetSeasonImmediatePositives}\``);
  lines.push(`- conservative incremental alerts: \`${report.summary.conservativeIncrementalAlerts}\``);
  lines.push(`- guarded incremental alerts: \`${report.summary.guardedIncrementalAlerts}\``);
  lines.push(`- winter immediate positives: \`${report.summary.winterImmediatePositives}\``);
  lines.push(`- winter conservative hits: \`${report.summary.winterConservativeHits}\``);
  lines.push(`- winter guarded hits: \`${report.summary.winterGuardedHits}\``);
  lines.push("");
  lines.push("## Interpretation");
  lines.push("");
  lines.push(report.interpretation);
  lines.push("");
  lines.push("## Outputs");
  for (const [key, value] of Object.entries(report.outputs)) lines.push(`- ${key}: \`${value}\``);
  lines.push("");
  return `${lines.join("\n")}\n`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = process.cwd();
  const validationPath = path.resolve(repoRoot, args.validationSamples);
  const seasonalReportPath = path.resolve(repoRoot, args.seasonalReport);
  const primaryRegistryPath = path.resolve(repoRoot, args.primaryRegistry);
  const seasonalReport = await readJson(seasonalReportPath);
  const primaryArtifact = await readFirstArtifact(primaryRegistryPath);
  const booster = seasonalReport.booster;
  const conservativeThreshold =
    seasonalReport.thresholdResults.find((result) => result.thresholdMode === "maximize-balanced-accuracy")?.threshold ??
    0.545602;
  const guardedThreshold =
    seasonalReport.thresholdResults.find((result) => result.thresholdMode === "guarded-recall")?.threshold ?? 0.290563;
  const primaryThreshold = seasonalReport.primary?.threshold ?? primaryArtifact.metadata?.replaySummary?.threshold ?? 0.184245;
  const samples = await readJsonLines(validationPath);
  const rows = samples
    .map((sample) => {
      const values = featureValues(sample);
      const primary = runArtifact(primaryArtifact, values);
      const base = {
        sample,
        sampleId: sample.sampleId ?? null,
        eventTs: sample.eventTs,
        pointId: pointId(sample),
        season: season(sample.eventTs),
        values,
        immediateLabel: toBinaryLabel(sample.labels?.warningHitLabelImmediate),
        greyZoneLabel: toBinaryLabel(sample.labels?.warningHitLabelEpisodeGreyZoneExcluded),
        primaryScore: primary.score,
        primaryMissingFeatureKeys: primary.missingFeatureKeys ?? []
      };
      const boosterResult = runBooster(booster, base);
      return {
        ...base,
        boosterScore: boosterResult.score,
        boosterMissingFeatureKeys: boosterResult.missingFeatureKeys ?? [],
        primaryHit: typeof primary.score === "number" && primary.score >= primaryThreshold,
        conservativeHit:
          (typeof primary.score === "number" && primary.score >= primaryThreshold) ||
          (typeof boosterResult.score === "number" && boosterResult.score >= conservativeThreshold),
        guardedHit:
          (typeof primary.score === "number" && primary.score >= primaryThreshold) ||
          (typeof boosterResult.score === "number" && boosterResult.score >= guardedThreshold)
      };
    })
    .sort((left, right) => Date.parse(left.eventTs) - Date.parse(right.eventTs) || left.pointId.localeCompare(right.pointId));

  const targetRows = rows.filter((row) => TARGET_SEASONS.includes(row.season));
  const targetImmediatePositiveRows = targetRows.filter((row) => row.immediateLabel === 1);
  const winterImmediatePositiveRows = targetImmediatePositiveRows.filter((row) => row.season === "winter");
  const conservativeIncrementalRows = targetRows.filter((row) => row.conservativeHit && !row.primaryHit);
  const guardedIncrementalRows = targetRows.filter((row) => row.guardedHit && !row.primaryHit);
  const targetImmediateNegativeRows = targetRows.filter((row) => row.immediateLabel === 0);
  const bySeason = Object.fromEntries(
    Array.from(groupBy(targetRows, (row) => row.season).entries()).map(([key, groupRows]) => [
      key,
      {
        rows: groupRows.length,
        immediatePositives: groupRows.filter((row) => row.immediateLabel === 1).length,
        immediateNegatives: groupRows.filter((row) => row.immediateLabel === 0).length,
        conservativeIncrementalAlerts: groupRows.filter((row) => row.conservativeHit && !row.primaryHit).length,
        guardedIncrementalAlerts: groupRows.filter((row) => row.guardedHit && !row.primaryHit).length,
        boosterScoreImmediatePositive: summarizeScores(
          groupRows.filter((row) => row.immediateLabel === 1),
          "boosterScore"
        ),
        boosterScoreImmediateNegative: summarizeScores(
          groupRows.filter((row) => row.immediateLabel === 0),
          "boosterScore"
        )
      }
    ])
  );

  const outDir = path.resolve(repoRoot, args.outDir);
  const seasonalPositiveCsv = path.join(outDir, "seasonal-positive-review.csv");
  const winterPositiveCsv = path.join(outDir, "winter-positive-review.csv");
  const conservativeIncrementalCsv = path.join(outDir, "conservative-incremental-alert-review.csv");
  const guardedIncrementalCsv = path.join(outDir, "guarded-recall-alert-pressure-review.csv");
  await writeCsv(seasonalPositiveCsv, targetImmediatePositiveRows.map(compactRow));
  await writeCsv(winterPositiveCsv, winterImmediatePositiveRows.map(compactRow));
  await writeCsv(conservativeIncrementalCsv, conservativeIncrementalRows.map(compactRow));
  await writeCsv(guardedIncrementalCsv, guardedIncrementalRows.map(compactRow));

  const report = {
    generatedAt: new Date().toISOString(),
    sourcePaths: {
      validationSamples: validationPath,
      seasonalReport: seasonalReportPath,
      primaryRegistry: primaryRegistryPath
    },
    thresholds: {
      primaryThreshold,
      conservativeThreshold,
      guardedThreshold
    },
    summary: {
      validationRows: rows.length,
      targetSeasonRows: targetRows.length,
      targetSeasonImmediatePositives: targetImmediatePositiveRows.length,
      targetSeasonImmediateNegatives: targetImmediateNegativeRows.length,
      conservativeIncrementalAlerts: conservativeIncrementalRows.length,
      guardedIncrementalAlerts: guardedIncrementalRows.length,
      winterImmediatePositives: winterImmediatePositiveRows.length,
      winterConservativeHits: winterImmediatePositiveRows.filter((row) => row.conservativeHit).length,
      winterGuardedHits: winterImmediatePositiveRows.filter((row) => row.guardedHit).length
    },
    bySeason,
    scoreSummary: {
      targetImmediatePositiveBoosterScore: summarizeScores(targetImmediatePositiveRows, "boosterScore"),
      targetImmediateNegativeBoosterScore: summarizeScores(targetImmediateNegativeRows, "boosterScore"),
      conservativeIncrementalBoosterScore: summarizeScores(conservativeIncrementalRows, "boosterScore"),
      guardedIncrementalBoosterScore: summarizeScores(guardedIncrementalRows, "boosterScore")
    },
    outputs: {
      seasonalPositiveCsv,
      winterPositiveCsv,
      conservativeIncrementalCsv,
      guardedIncrementalCsv
    },
    interpretation:
      "The seasonal booster can recover winter positives only at a low threshold that also alerts hundreds of autumn/winter negatives. Conservative thresholding preserves false-positive pressure but leaves winter recall at zero. The next useful step is raw review of the exported winter positives and high-volume guarded alerts, or adding independent trigger evidence; further threshold tuning alone is not justified."
  };
  const reportPath = path.join(outDir, "baijiabao-seasonal-expert-failure-review.report.json");
  const mdPath = path.join(outDir, "baijiabao-seasonal-expert-failure-review.report.md");
  await writeJson(reportPath, report);
  await writeText(mdPath, renderMarkdown(report));
  console.log(
    JSON.stringify(
      {
        reportPath,
        markdownPath: mdPath,
        summary: report.summary,
        bySeason: report.bySeason,
        outputs: report.outputs,
        interpretation: report.interpretation
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
