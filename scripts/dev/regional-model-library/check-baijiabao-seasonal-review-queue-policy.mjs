import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const DEFAULT_ROWS_CSV =
  ".tmp/regional-model-library/out/artifacts/baijiabao-guarded-alert-pressure-episode-review/guarded-alert-episode-proximity.rows.csv";
const DEFAULT_RUNS_CSV =
  ".tmp/regional-model-library/out/artifacts/baijiabao-guarded-alert-pressure-episode-review/guarded-alert-runs.csv";
const DEFAULT_OUT_DIR = ".tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-policy";

function parseArgs(argv) {
  const parsed = {
    rowsCsv: DEFAULT_ROWS_CSV,
    runsCsv: DEFAULT_RUNS_CSV,
    outDir: DEFAULT_OUT_DIR
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--rows-csv") parsed.rowsCsv = argv[++index] ?? parsed.rowsCsv;
    if (token === "--runs-csv") parsed.runsCsv = argv[++index] ?? parsed.runsCsv;
    if (token === "--out-dir") parsed.outDir = argv[++index] ?? parsed.outDir;
  }
  return parsed;
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

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
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

function runUtility(rows) {
  const classifications = new Set(rows.map((row) => row.classification));
  const immediatePositiveCount = rows.filter((row) => row.classification === "immediate-positive").length;
  const greyZoneCount = rows.filter((row) => row.classification === "grey-zone-pre-episode").length;
  const within30Count = rows.filter((row) => row.classification === "hard-negative-within-30d-next-positive").length;
  const isolatedCount = rows.filter((row) => row.classification === "hard-negative-no-positive-within-30d").length;
  let utilityClass = "isolated-background-alert-run";
  if (immediatePositiveCount > 0) utilityClass = "contains-immediate-positive";
  else if (greyZoneCount > 0) utilityClass = "contains-pre-episode-grey-zone";
  else if (within30Count > 0) utilityClass = "contains-hard-negative-within-30d";
  return {
    utilityClass,
    classifications: Array.from(classifications).sort().join("|"),
    immediatePositiveCount,
    greyZoneCount,
    within30Count,
    isolatedCount,
    usefulRowCount: immediatePositiveCount + greyZoneCount + within30Count,
    isolatedRatio: rows.length > 0 ? isolatedCount / rows.length : 0
  };
}

function renderMarkdown(report) {
  const lines = [];
  lines.push("# Baijiabao Seasonal Review Queue Policy");
  lines.push("");
  lines.push(`Generated at: ${report.generatedAt}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- daily guarded incremental alerts: \`${report.summary.dailyAlertCount}\``);
  lines.push(`- review queue items: \`${report.summary.reviewItemCount}\``);
  lines.push(`- compression ratio: \`${report.summary.compressionRatio.toFixed(4)}\``);
  lines.push(`- useful review items: \`${report.summary.usefulReviewItemCount}\``);
  lines.push(`- isolated review items: \`${report.summary.isolatedReviewItemCount}\``);
  lines.push(`- useful item ratio: \`${report.summary.usefulReviewItemRatio.toFixed(4)}\``);
  lines.push("");
  lines.push("## Utility Classes");
  lines.push("");
  lines.push("| class | count |");
  lines.push("|---|---:|");
  for (const row of report.summary.byUtilityClass) lines.push(`| ${row.key} | ${row.count} |`);
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
  const rowsCsv = path.resolve(repoRoot, args.rowsCsv);
  const runsCsv = path.resolve(repoRoot, args.runsCsv);
  const alertRows = await readCsv(rowsCsv);
  const rawRuns = await readCsv(runsCsv);
  const runMap = new Map(rawRuns.map((run) => [run.runId, run]));
  const rowsByRun = groupBy(alertRows, (row) => {
    const tsMs = toNumber(row.tsMs);
    for (const run of rawRuns) {
      if (run.pointId !== row.pointId) continue;
      const start = toNumber(run.startTsMs);
      const end = toNumber(run.endTsMs);
      if (tsMs !== null && start !== null && end !== null && tsMs >= start && tsMs <= end) return run.runId;
    }
    return `${row.pointId}:unmatched:${row.eventTs}`;
  });
  const reviewItems = Array.from(rowsByRun.entries())
    .map(([runId, rows]) => {
      const run = runMap.get(runId) ?? {};
      const utility = runUtility(rows);
      const sorted = rows.slice().sort((left, right) => String(left.eventTs).localeCompare(String(right.eventTs)));
      return {
        reviewItemId: runId,
        pointId: run.pointId ?? sorted[0]?.pointId ?? null,
        startTs: run.startTs ?? sorted[0]?.eventTs ?? null,
        endTs: run.endTs ?? sorted[sorted.length - 1]?.eventTs ?? null,
        rowCount: rows.length,
        durationDays: run.durationDays ?? null,
        seasonSet: Array.from(new Set(rows.map((row) => row.season))).sort().join("|"),
        monthSet: Array.from(new Set(rows.map((row) => row.month))).sort().join("|"),
        firstBoosterScore: sorted[0]?.boosterScore ?? null,
        maxBoosterScore: Math.max(...rows.map((row) => toNumber(row.boosterScore)).filter((value) => value !== null)),
        ...utility
      };
    })
    .sort((left, right) => right.rowCount - left.rowCount || String(left.startTs).localeCompare(String(right.startTs)));
  const usefulItems = reviewItems.filter((item) => item.utilityClass !== "isolated-background-alert-run");
  const isolatedItems = reviewItems.filter((item) => item.utilityClass === "isolated-background-alert-run");
  const report = {
    generatedAt: new Date().toISOString(),
    sourcePaths: {
      rowsCsv,
      runsCsv
    },
    summary: {
      dailyAlertCount: alertRows.length,
      reviewItemCount: reviewItems.length,
      compressionRatio: reviewItems.length / Math.max(1, alertRows.length),
      usefulReviewItemCount: usefulItems.length,
      isolatedReviewItemCount: isolatedItems.length,
      usefulReviewItemRatio: usefulItems.length / Math.max(1, reviewItems.length),
      isolatedDailyRows: isolatedItems.reduce((sum, item) => sum + item.rowCount, 0),
      byUtilityClass: countBy(reviewItems, (item) => item.utilityClass),
      byPoint: countBy(reviewItems, (item) => item.pointId),
      byRowCountBucket: countBy(reviewItems, (item) => {
        if (item.rowCount >= 30) return ">=30";
        if (item.rowCount >= 14) return "14-29";
        if (item.rowCount >= 7) return "7-13";
        if (item.rowCount >= 3) return "3-6";
        return "1-2";
      })
    },
    reviewItems,
    decision:
      usefulItems.length / Math.max(1, reviewItems.length) >= 0.5
        ? "The guarded booster is not suitable as daily prediction, but it may be useful as a deduplicated offline review queue. Keep runtime unchanged; consider a review-only UI/workflow after human validation."
        : "Even after run-level deduplication, most review items are isolated background alerts. Do not pursue this booster without new evidence."
  };
  const outDir = path.resolve(repoRoot, args.outDir);
  const reportPath = path.join(outDir, "baijiabao-seasonal-review-queue-policy.report.json");
  const mdPath = path.join(outDir, "baijiabao-seasonal-review-queue-policy.report.md");
  const queueCsvPath = path.join(outDir, "seasonal-review-queue-items.csv");
  await writeJson(reportPath, report);
  await writeText(mdPath, renderMarkdown(report));
  await writeText(queueCsvPath, toCsv(reviewItems));
  console.log(
    JSON.stringify(
      {
        reportPath,
        markdownPath: mdPath,
        queueCsvPath,
        summary: report.summary,
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
