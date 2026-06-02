import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const DEFAULT_VALIDATION_SAMPLES =
  ".tmp/regional-model-library/out/threegorges-baijiabao/splits/labeled/baijiabao.validation.future-labels.window-features.jsonl";
const DEFAULT_POLICY_REVIEW =
  ".tmp/regional-model-library/out/artifacts/baijiabao-trigger-aware-policy-card-strict/baijiabao-trigger-aware-promotion-review.report.json";
const DEFAULT_OUT_DIR = ".tmp/regional-model-library/out/artifacts/baijiabao-trigger-aware-label-episode-review";
const DAY_MS = 24 * 3600 * 1000;
const EPISODE_GAP_DAYS = 1.5;
const NEAR_EPISODE_DAYS = 7;
const FUTURE_PROXIMITY_DAYS = [3, 7, 14, 30];

function parseArgs(argv) {
  const parsed = {
    validationSamples: DEFAULT_VALIDATION_SAMPLES,
    policyReview: DEFAULT_POLICY_REVIEW,
    outDir: DEFAULT_OUT_DIR,
    labelKey: "warningHitLabel"
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--validation-samples") parsed.validationSamples = argv[++index] ?? parsed.validationSamples;
    if (token === "--policy-review") parsed.policyReview = argv[++index] ?? parsed.policyReview;
    if (token === "--out-dir") parsed.outDir = argv[++index] ?? parsed.outDir;
    if (token === "--label-key") parsed.labelKey = argv[++index] ?? parsed.labelKey;
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

function monthKey(ts) {
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return "unknown";
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function pointId(sample) {
  return sample.rawRef?.originalFields?.point_id ?? sample.identity?.stationCode ?? "unknown";
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

function countBy(values) {
  const counts = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return Object.entries(counts)
    .map(([key, count]) => ({ key, count }))
    .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key));
}

function buildRows(samples, labelKey) {
  return samples
    .map((sample) => {
      const label = toBinaryLabel(sample.labels?.[labelKey]);
      const tsMs = Date.parse(sample.eventTs);
      if (label === null || !Number.isFinite(tsMs)) return null;
      return {
        sampleId: sample.sampleId ?? null,
        eventTs: sample.eventTs,
        obsTime: sample.rawRef?.originalFields?.obs_time ?? null,
        tsMs,
        pointId: pointId(sample),
        season: season(sample.eventTs),
        month: monthKey(sample.eventTs),
        label,
        displacementLabel:
          typeof sample.labels?.displacementLabel === "number" && Number.isFinite(sample.labels.displacementLabel)
            ? sample.labels.displacementLabel
            : null,
        values: sample.metricsNormalized ?? {},
        rawRef: sample.rawRef ?? {},
        qualityFlagCodes: (sample.qualityFlags ?? []).map((flag) => flag.code).filter(Boolean)
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.tsMs - right.tsMs || left.pointId.localeCompare(right.pointId));
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
          endTs: row.eventTs,
          positiveRows: [row.sampleId]
        };
        episodes.push(current);
      } else {
        current.endTsMs = row.tsMs;
        current.endTs = row.eventTs;
        current.positiveRows.push(row.sampleId);
      }
    }
  }
  return episodes;
}

function nearestEpisodes(row, episodes) {
  const samePoint = episodes.filter((episode) => episode.pointId === row.pointId);
  const next = samePoint
    .filter((episode) => episode.startTsMs > row.tsMs)
    .sort((left, right) => left.startTsMs - right.startTsMs)[0];
  const previous = samePoint
    .filter((episode) => episode.endTsMs < row.tsMs)
    .sort((left, right) => right.endTsMs - left.endTsMs)[0];
  return {
    nextEpisodeId: next?.episodeId ?? null,
    daysToNextEpisode: next ? (next.startTsMs - row.tsMs) / DAY_MS : null,
    previousEpisodeId: previous?.episodeId ?? null,
    daysSincePreviousEpisode: previous ? (row.tsMs - previous.endTsMs) / DAY_MS : null
  };
}

function futureProximityFlags(row, near) {
  return Object.fromEntries(
    FUTURE_PROXIMITY_DAYS.map((days) => [
      `within${days}d`,
      near.daysToNextEpisode !== null && near.daysToNextEpisode >= 0 && near.daysToNextEpisode <= days
    ])
  );
}

function classifyFalsePositive(row, near) {
  if (near.daysToNextEpisode !== null && near.daysToNextEpisode >= 0 && near.daysToNextEpisode <= NEAR_EPISODE_DAYS) {
    return "possible-pre-signal-before-positive-episode";
  }
  if (
    near.daysSincePreviousEpisode !== null &&
    near.daysSincePreviousEpisode >= 0 &&
    near.daysSincePreviousEpisode <= EPISODE_GAP_DAYS
  ) {
    return "possible-episode-boundary-tail";
  }
  return "isolated-false-positive-by-current-label";
}

function numericBucket(value, cuts) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "missing";
  for (const cut of cuts) {
    if (value <= cut) return `<=${cut}`;
  }
  return `>${cuts[cuts.length - 1]}`;
}

function reviewRows(policyReview, validationRows, episodes) {
  const rowsBySampleId = new Map(validationRows.map((row) => [row.sampleId, row]));
  return (policyReview.delta?.newlyAlertedRows ?? [])
    .map((alert) => {
      const row = rowsBySampleId.get(alert.sampleId);
      if (!row) return null;
      const near = nearestEpisodes(row, episodes);
      const classification = row.label === 1 ? "newly-alerted-true-positive" : classifyFalsePositive(row, near);
      return {
        sampleId: row.sampleId,
        eventTs: row.eventTs,
        obsTime: row.obsTime,
        pointId: row.pointId,
        season: row.season,
        month: row.month,
        label: row.label,
        classification,
        displacementLabel: row.displacementLabel,
        displacementSurfaceMm: row.values.displacementSurfaceMm ?? null,
        displacementSurfaceMm_delta_24h: row.values.displacementSurfaceMm_delta_24h ?? null,
        displacementSurfaceMm_delta_72h: row.values.displacementSurfaceMm_delta_72h ?? null,
        rainfallCurrentMm_sum_72h: row.values.rainfallCurrentMm_sum_72h ?? null,
        reservoirLevelM_delta_24h: row.values.reservoirLevelM_delta_24h ?? null,
        reservoirLevelM_delta_72h: row.values.reservoirLevelM_delta_72h ?? null,
        nextEpisodeId: near.nextEpisodeId,
        daysToNextEpisode: near.daysToNextEpisode,
        ...futureProximityFlags(row, near),
        previousEpisodeId: near.previousEpisodeId,
        daysSincePreviousEpisode: near.daysSincePreviousEpisode,
        rawSourceFile: row.rawRef.originalFields?.source_file ?? null,
        rawSheetName: row.rawRef.originalFields?.source_sheet_name ?? null,
        rawCumulativeDisplacementMm: row.rawRef.originalFields?.cumulative_displacement_mm ?? null,
        rawDailyRainfallMm: row.rawRef.originalFields?.daily_rainfall_mm ?? null,
        rawWaterLevelM: row.rawRef.originalFields?.water_level_m ?? null,
        qualityFlagCodes: row.qualityFlagCodes.join("|"),
        displacementDelta24hBucket: numericBucket(row.values.displacementSurfaceMm_delta_24h, [-3, -2, -1.2, -0.8, 0, 1.2])
      };
    })
    .filter(Boolean);
}

function renderMarkdown(report) {
  const lines = [];
  lines.push("# Baijiabao Trigger-Aware Label / Episode Review");
  lines.push("");
  lines.push(`Generated at: ${report.generatedAt}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- newly alerted rows: \`${report.summary.newAlertedCount}\``);
  lines.push(`- new TP / FP: \`${report.summary.newTpCount} / ${report.summary.newFpCount}\``);
  lines.push(`- possible pre-signal FP: \`${report.summary.possiblePreSignalFpCount}\``);
  lines.push(`- isolated FP: \`${report.summary.isolatedFpCount}\``);
  lines.push(`- possible pre-signal FP within 14d: \`${report.summary.futurePositiveProximity.fpWithin14d}\``);
  lines.push(`- likely true FP after 30d rule: \`${report.summary.futurePositiveProximity.fpWithoutPositiveWithin30d}\``);
  lines.push(
    `- adjusted precision if <=14d pre-signals are review positives: \`${report.summary.adjustedPrecision.assumeFuturePositiveWithin14d.toFixed(
      4
    )}\``
  );
  lines.push(`- point duplicate groups: \`${report.duplicateSummary.pointTimestampDuplicateGroupCount}\``);
  lines.push("");
  lines.push("## Classification");
  lines.push("");
  lines.push("| classification | count |");
  lines.push("|---|---:|");
  for (const row of report.summary.byClassification) lines.push(`| ${row.key} | ${row.count} |`);
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
  const policyReviewPath = path.resolve(repoRoot, args.policyReview);
  const outDir = path.resolve(repoRoot, args.outDir);
  const validationRows = buildRows(await readJsonLines(validationPath), args.labelKey);
  const policyReview = await readJson(policyReviewPath);
  const episodes = buildEpisodes(validationRows);
  const reviewed = reviewRows(policyReview, validationRows, episodes);
  const fpRows = reviewed.filter((row) => row.label === 0);
  const possiblePreSignalFpRows = fpRows.filter((row) => row.classification === "possible-pre-signal-before-positive-episode");
  const isolatedFpRows = fpRows.filter((row) => row.classification === "isolated-false-positive-by-current-label");
  const futurePositiveProximity = {
    fpWithin3d: fpRows.filter((row) => row.within3d).length,
    fpWithin7d: fpRows.filter((row) => row.within7d).length,
    fpWithin14d: fpRows.filter((row) => row.within14d).length,
    fpWithin30d: fpRows.filter((row) => row.within30d).length,
    fpWithoutPositiveWithin30d: fpRows.filter((row) => !row.within30d).length
  };
  const adjustedPrecision = {
    immediateOnly:
      reviewed.length > 0 ? reviewed.filter((row) => row.label === 1).length / reviewed.length : 0,
    assumeFuturePositiveWithin7d:
      reviewed.length > 0
        ? (reviewed.filter((row) => row.label === 1).length + futurePositiveProximity.fpWithin7d) / reviewed.length
        : 0,
    assumeFuturePositiveWithin14d:
      reviewed.length > 0
        ? (reviewed.filter((row) => row.label === 1).length + futurePositiveProximity.fpWithin14d) / reviewed.length
        : 0,
    assumeFuturePositiveWithin30d:
      reviewed.length > 0
        ? (reviewed.filter((row) => row.label === 1).length + futurePositiveProximity.fpWithin30d) / reviewed.length
        : 0
  };
  const byPointTs = groupBy(validationRows, (row) => `${row.pointId}|${row.eventTs}`);
  const byStationTs = groupBy(validationRows, (row) => `${row.rawRef.originalFields?.station_code ?? "unknown"}|${row.eventTs}`);
  const report = {
    generatedAt: new Date().toISOString(),
    validationSamplesPath: validationPath,
    policyReviewPath,
    episodeSpec: {
      episodeGapDays: EPISODE_GAP_DAYS,
      nearEpisodeDays: NEAR_EPISODE_DAYS
    },
    summary: {
      validationRows: validationRows.length,
      episodeCount: episodes.length,
      newAlertedCount: reviewed.length,
      newTpCount: reviewed.filter((row) => row.label === 1).length,
      newFpCount: fpRows.length,
      possiblePreSignalFpCount: possiblePreSignalFpRows.length,
      isolatedFpCount: isolatedFpRows.length,
      futurePositiveProximity,
      adjustedPrecision,
      byClassification: countBy(reviewed.map((row) => row.classification)),
      bySeason: countBy(reviewed.map((row) => row.season)),
      byPoint: countBy(reviewed.map((row) => row.pointId)),
      fpByMonth: countBy(fpRows.map((row) => row.month)),
      fpByDisplacementDelta24hBucket: countBy(fpRows.map((row) => row.displacementDelta24hBucket))
    },
    duplicateSummary: {
      pointTimestampDuplicateGroupCount: Array.from(byPointTs.values()).filter((rows) => rows.length > 1).length,
      stationTimestampDuplicateGroupCount: Array.from(byStationTs.values()).filter((rows) => rows.length > 1).length,
      interpretation:
        "point_id+eventTs is the strict duplicate check; station+eventTs repeats are expected for ZD1/ZD2/ZD3."
    },
    reviewedRows: reviewed,
    decision:
      possiblePreSignalFpRows.length > 0
        ? "Some false positives are close to later positive episodes, so label/episode boundary review is useful before discarding them as pure noise."
        : "New false positives are mostly isolated under the current derived labels; do not promote the trigger policy without better labels."
  };
  const jsonPath = path.join(outDir, "baijiabao-trigger-aware-label-episode-review.report.json");
  const mdPath = path.join(outDir, "baijiabao-trigger-aware-label-episode-review.report.md");
  const csvPath = path.join(outDir, "baijiabao-trigger-aware-label-episode-review.rows.csv");
  await writeJson(jsonPath, report);
  await writeText(mdPath, renderMarkdown(report));
  await writeText(csvPath, toCsv(reviewed));
  console.log(
    JSON.stringify(
      {
        reportPath: jsonPath,
        markdownPath: mdPath,
        csvPath,
        summary: report.summary,
        duplicateSummary: report.duplicateSummary,
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
