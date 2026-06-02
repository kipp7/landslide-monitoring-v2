import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const DEFAULT_VALIDATION_SAMPLES =
  ".tmp/regional-model-library/out/artifacts/baijiabao-episode-grey-zone-label-policy/baijiabao.validation.episode-grey-zone-labels.jsonl";
const DEFAULT_SEASONAL_REVIEW =
  ".tmp/regional-model-library/out/artifacts/baijiabao-seasonal-expert-failure-review/guarded-recall-alert-pressure-review.csv";
const DEFAULT_OUT_DIR = ".tmp/regional-model-library/out/artifacts/baijiabao-guarded-alert-pressure-episode-review";
const DAY_MS = 24 * 3600 * 1000;
const EPISODE_GAP_DAYS = 1.5;
const FUTURE_PROXIMITY_DAYS = [3, 7, 14, 30];

function parseArgs(argv) {
  const parsed = {
    validationSamples: DEFAULT_VALIDATION_SAMPLES,
    seasonalReviewCsv: DEFAULT_SEASONAL_REVIEW,
    outDir: DEFAULT_OUT_DIR
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--validation-samples") parsed.validationSamples = argv[++index] ?? parsed.validationSamples;
    if (token === "--seasonal-review-csv") parsed.seasonalReviewCsv = argv[++index] ?? parsed.seasonalReviewCsv;
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

async function readCsv(filePath) {
  const content = await readFile(filePath, "utf-8");
  const lines = content.split(/\r?\n/u).filter(Boolean);
  const headers = parseCsvLine(lines[0] ?? "");
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  });
}

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (quoted) {
      if (char === '"' && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        current += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current);
  return values;
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

function toCsv(rows) {
  if (rows.length === 0) return "";
  const headers = Array.from(
    rows.reduce((set, row) => {
      for (const key of Object.keys(row)) set.add(key);
      return set;
    }, new Set())
  );
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

function groupBy(rows, keyFn) {
  const map = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return map;
}

function countBy(rows, keyFn) {
  const counts = {};
  for (const row of rows) {
    const key = keyFn(row);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.entries(counts)
    .map(([key, count]) => ({ key, count }))
    .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key));
}

function buildValidationRows(samples) {
  return samples
    .map((sample) => {
      const tsMs = Date.parse(sample.eventTs);
      if (!Number.isFinite(tsMs)) return null;
      return {
        sampleId: sample.sampleId ?? null,
        eventTs: sample.eventTs,
        tsMs,
        pointId: pointId(sample),
        season: season(sample.eventTs),
        month: monthKey(sample.eventTs),
        immediateLabel: toBinaryLabel(sample.labels?.warningHitLabelImmediate ?? sample.labels?.warningHitLabel),
        greyZoneLabel: toBinaryLabel(sample.labels?.warningHitLabelEpisodeGreyZoneExcluded),
        boundaryClass: sample.labels?.warningHitLabelEpisodeBoundary ?? null
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.tsMs - right.tsMs || left.pointId.localeCompare(right.pointId));
}

function buildEpisodes(rows) {
  const episodes = [];
  for (const [point, pointRows] of groupBy(rows.filter((row) => row.immediateLabel === 1), (row) => row.pointId).entries()) {
    let current = null;
    for (const row of pointRows) {
      if (!current || row.tsMs - current.endTsMs > EPISODE_GAP_DAYS * DAY_MS) {
        current = {
          episodeId: `${point}:${episodes.length + 1}`,
          pointId: point,
          startTsMs: row.tsMs,
          endTsMs: row.tsMs,
          startTs: row.eventTs,
          endTs: row.eventTs,
          positiveCount: 1
        };
        episodes.push(current);
      } else {
        current.endTsMs = row.tsMs;
        current.endTs = row.eventTs;
        current.positiveCount += 1;
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

function classify(row, near) {
  if (row.immediateLabel === 1) return "immediate-positive";
  if (row.boundaryClass === "pre_episode_grey_zone") return "grey-zone-pre-episode";
  if (near.daysToNextEpisode !== null && near.daysToNextEpisode >= 0 && near.daysToNextEpisode <= 14) {
    return "hard-negative-within-14d-next-positive";
  }
  if (near.daysToNextEpisode !== null && near.daysToNextEpisode > 14 && near.daysToNextEpisode <= 30) {
    return "hard-negative-within-30d-next-positive";
  }
  return "hard-negative-no-positive-within-30d";
}

function buildRuns(rows) {
  const runs = [];
  for (const [point, pointRows] of groupBy(rows, (row) => row.pointId).entries()) {
    const sorted = pointRows.slice().sort((left, right) => left.tsMs - right.tsMs);
    let current = null;
    for (const row of sorted) {
      if (!current || row.tsMs - current.endTsMs > 1.5 * DAY_MS) {
        current = {
          runId: `${point}:run:${runs.length + 1}`,
          pointId: point,
          startTs: row.eventTs,
          endTs: row.eventTs,
          startTsMs: row.tsMs,
          endTsMs: row.tsMs,
          rowCount: 1,
          immediatePositiveCount: row.immediateLabel === 1 ? 1 : 0,
          greyZoneCount: row.boundaryClass === "pre_episode_grey_zone" ? 1 : 0,
          hardNegativeCount: row.immediateLabel === 0 && row.boundaryClass !== "pre_episode_grey_zone" ? 1 : 0
        };
        runs.push(current);
      } else {
        current.endTs = row.eventTs;
        current.endTsMs = row.tsMs;
        current.rowCount += 1;
        current.immediatePositiveCount += row.immediateLabel === 1 ? 1 : 0;
        current.greyZoneCount += row.boundaryClass === "pre_episode_grey_zone" ? 1 : 0;
        current.hardNegativeCount += row.immediateLabel === 0 && row.boundaryClass !== "pre_episode_grey_zone" ? 1 : 0;
      }
    }
  }
  return runs
    .map((run) => ({
      ...run,
      durationDays: Number(((run.endTsMs - run.startTsMs) / DAY_MS + 1).toFixed(3))
    }))
    .sort((left, right) => right.rowCount - left.rowCount || left.startTs.localeCompare(right.startTs));
}

function renderMarkdown(report) {
  const lines = [];
  lines.push("# Baijiabao Guarded Alert Pressure Episode Review");
  lines.push("");
  lines.push(`Generated at: ${report.generatedAt}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- guarded incremental alerts: \`${report.summary.guardedIncrementalAlerts}\``);
  lines.push(`- immediate positives: \`${report.summary.immediatePositiveCount}\``);
  lines.push(`- grey-zone pre-episode alerts: \`${report.summary.greyZonePreEpisodeCount}\``);
  lines.push(`- hard negatives within 14d: \`${report.summary.hardNegativeWithin14dCount}\``);
  lines.push(`- hard negatives within 30d: \`${report.summary.hardNegativeWithin30dCount}\``);
  lines.push(`- hard negatives without positive within 30d: \`${report.summary.hardNegativeNoPositiveWithin30dCount}\``);
  lines.push(`- alert runs: \`${report.summary.runCount}\``);
  lines.push(`- top run rows: \`${report.summary.topRunRowCount}\``);
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
  const seasonalReviewPath = path.resolve(repoRoot, args.seasonalReviewCsv);
  const validationRows = buildValidationRows(await readJsonLines(validationPath));
  const bySampleId = new Map(validationRows.map((row) => [row.sampleId, row]));
  const episodes = buildEpisodes(validationRows);
  const guardedRows = (await readCsv(seasonalReviewPath))
    .map((csvRow) => {
      const row = bySampleId.get(csvRow.sampleId);
      if (!row) return null;
      const near = nearestEpisodes(row, episodes);
      const daysFlags = Object.fromEntries(
        FUTURE_PROXIMITY_DAYS.map((days) => [
          `within${days}d`,
          near.daysToNextEpisode !== null && near.daysToNextEpisode >= 0 && near.daysToNextEpisode <= days
        ])
      );
      return {
        ...csvRow,
        ...row,
        ...near,
        ...daysFlags,
        classification: classify(row, near),
        boosterScore: Number(csvRow.boosterScore),
        primaryScore: Number(csvRow.primaryScore)
      };
    })
    .filter(Boolean);
  const runs = buildRuns(guardedRows);
  const hardNegativeRows = guardedRows.filter(
    (row) => row.immediateLabel === 0 && row.boundaryClass !== "pre_episode_grey_zone"
  );
  const summary = {
    validationRows: validationRows.length,
    episodeCount: episodes.length,
    guardedIncrementalAlerts: guardedRows.length,
    immediatePositiveCount: guardedRows.filter((row) => row.immediateLabel === 1).length,
    greyZonePreEpisodeCount: guardedRows.filter((row) => row.boundaryClass === "pre_episode_grey_zone").length,
    hardNegativeCount: hardNegativeRows.length,
    hardNegativeWithin14dCount: hardNegativeRows.filter((row) => row.within14d).length,
    hardNegativeWithin30dCount: hardNegativeRows.filter((row) => row.within30d).length,
    hardNegativeNoPositiveWithin30dCount: hardNegativeRows.filter((row) => !row.within30d).length,
    runCount: runs.length,
    topRunRowCount: runs[0]?.rowCount ?? 0,
    byClassification: countBy(guardedRows, (row) => row.classification),
    bySeason: countBy(guardedRows, (row) => row.season),
    byPoint: countBy(guardedRows, (row) => row.pointId),
    byMonth: countBy(guardedRows, (row) => row.month)
  };
  const outDir = path.resolve(repoRoot, args.outDir);
  const report = {
    generatedAt: new Date().toISOString(),
    sourcePaths: {
      validationSamples: validationPath,
      seasonalReviewCsv: seasonalReviewPath
    },
    episodeSpec: {
      episodeGapDays: EPISODE_GAP_DAYS,
      futureProximityDays: FUTURE_PROXIMITY_DAYS
    },
    summary,
    runs: runs.slice(0, 50),
    decision:
      summary.hardNegativeNoPositiveWithin30dCount > summary.immediatePositiveCount + summary.greyZonePreEpisodeCount
        ? "Guarded recall is dominated by broad hard-negative alert pressure, not by clean pre-signal recovery. Do not tune this threshold further without new labels or independent trigger evidence."
        : "A substantial share of guarded alerts are near future positives; review the exported rows before rejecting the signal."
  };
  const reportPath = path.join(outDir, "baijiabao-guarded-alert-pressure-episode-review.report.json");
  const mdPath = path.join(outDir, "baijiabao-guarded-alert-pressure-episode-review.report.md");
  const rowsCsvPath = path.join(outDir, "guarded-alert-episode-proximity.rows.csv");
  const runsCsvPath = path.join(outDir, "guarded-alert-runs.csv");
  await writeJson(reportPath, report);
  await writeText(mdPath, renderMarkdown(report));
  await writeText(rowsCsvPath, toCsv(guardedRows));
  await writeText(runsCsvPath, toCsv(runs));
  console.log(
    JSON.stringify(
      {
        reportPath,
        markdownPath: mdPath,
        rowsCsvPath,
        runsCsvPath,
        summary,
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
