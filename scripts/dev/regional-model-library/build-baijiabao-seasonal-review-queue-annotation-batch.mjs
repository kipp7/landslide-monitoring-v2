import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const DEFAULT_TEMPLATE_CSV =
  ".tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-annotation-template/seasonal-review-queue-annotation-template.csv";
const DEFAULT_OUT_DIR = ".tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-annotation-batch-1";

const DEFAULT_BATCH_SIZE = 24;
const DEFAULT_QUOTAS = {
  "contains-immediate-positive": 8,
  "contains-pre-episode-grey-zone": 5,
  "contains-hard-negative-within-30d": 5,
  "isolated-background-alert-run": 6
};

const DEFAULT_BATCH_1_REVIEW_IDS = [
  "ZD1:run:4",
  "ZD2:run:26",
  "ZD2:run:24",
  "ZD3:run:58",
  "ZD1:run:11",
  "ZD3:run:50",
  "ZD2:run:18",
  "ZD3:run:59",
  "ZD2:run:20",
  "ZD1:run:7",
  "ZD3:run:49",
  "ZD2:run:19",
  "ZD3:run:56",
  "ZD2:run:23",
  "ZD1:run:6",
  "ZD1:run:10",
  "ZD3:run:46",
  "ZD3:run:47",
  "ZD1:run:15",
  "ZD1:run:3",
  "ZD2:run:22",
  "ZD3:run:38",
  "ZD3:run:42",
  "ZD3:run:34"
];

function parseArgs(argv) {
  const parsed = {
    templateCsv: DEFAULT_TEMPLATE_CSV,
    outDir: DEFAULT_OUT_DIR,
    batchSize: DEFAULT_BATCH_SIZE
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--template-csv") parsed.templateCsv = argv[++index] ?? parsed.templateCsv;
    if (token === "--out-dir") parsed.outDir = argv[++index] ?? parsed.outDir;
    if (token === "--batch-size") parsed.batchSize = toPositiveInt(argv[++index], parsed.batchSize);
  }
  return parsed;
}

function toPositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
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
  return Number.isFinite(parsed) ? parsed : 0;
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

function dedupeByReviewItem(rows) {
  const map = new Map();
  for (const row of rows) {
    const key = row.reviewItemId || `${row.pointId}:${row.startTs}:${row.endTs}`;
    if (!map.has(key)) map.set(key, row);
  }
  return Array.from(map.values());
}

function utilityRank(value) {
  const ranks = {
    "contains-immediate-positive": 0,
    "contains-pre-episode-grey-zone": 1,
    "contains-hard-negative-within-30d": 2,
    "isolated-background-alert-run": 3
  };
  return ranks[value] ?? 99;
}

function isWinter(row) {
  return String(row.seasonSet ?? "").split("|").includes("winter");
}

function priorityScore(row) {
  const usefulRows = toNumber(row.usefulRowCount);
  const rowCount = toNumber(row.rowCount);
  const maxBooster = toNumber(row.maxBoosterScore);
  const firstBooster = toNumber(row.firstBoosterScore);
  const winterBonus = isWinter(row) ? 20 : 0;
  const immediateBonus = row.utilityClass === "contains-immediate-positive" ? 20 : 0;
  const greyZoneBonus = row.utilityClass === "contains-pre-episode-grey-zone" ? 14 : 0;
  const within30Bonus = row.utilityClass === "contains-hard-negative-within-30d" ? 10 : 0;
  const isolatedControlBonus = row.utilityClass === "isolated-background-alert-run" ? 4 : 0;
  return (
    immediateBonus +
    greyZoneBonus +
    within30Bonus +
    isolatedControlBonus +
    winterBonus +
    usefulRows * 1.5 +
    Math.min(rowCount, 30) * 0.2 +
    maxBooster * 10 +
    firstBooster * 5
  );
}

function rankRows(rows) {
  return rows.slice().sort((left, right) => {
    const scoreDiff = priorityScore(right) - priorityScore(left);
    if (scoreDiff !== 0) return scoreDiff;
    const utilityDiff = utilityRank(left.utilityClass) - utilityRank(right.utilityClass);
    if (utilityDiff !== 0) return utilityDiff;
    return String(left.startTs).localeCompare(String(right.startTs));
  });
}

function batchReason(row) {
  const reasons = [];
  reasons.push(row.utilityClass || "unknown-utility");
  if (isWinter(row)) reasons.push("winter-coverage");
  if (toNumber(row.usefulRowCount) >= 20) reasons.push("large-useful-run");
  if (toNumber(row.isolatedRatio) >= 0.5) reasons.push("high-isolated-ratio-control");
  if (toNumber(row.maxBoosterScore) >= 0.5) reasons.push("high-booster-score");
  return reasons.join("|");
}

function selectBatch(rows, batchSize) {
  const uniqueRows = dedupeByReviewItem(rows);
  const rowById = new Map(uniqueRows.map((row) => [row.reviewItemId, row]));
  const selected = [];
  const selectedIds = new Set();
  for (const reviewItemId of DEFAULT_BATCH_1_REVIEW_IDS) {
    const row = rowById.get(reviewItemId);
    if (row) addSelected(row, selected, selectedIds);
    if (selected.length >= batchSize) break;
  }
  if (selected.length >= batchSize) return annotateBatchRows(selected.slice(0, batchSize));
  const quotas = { ...DEFAULT_QUOTAS };
  for (const [utilityClass, quota] of Object.entries(quotas)) {
    const candidates = rankRows(uniqueRows.filter((row) => row.utilityClass === utilityClass));
    for (const row of candidates.slice(0, quota)) addSelected(row, selected, selectedIds);
  }
  const winterSelected = selected.filter(isWinter).length;
  if (winterSelected < 6) {
    for (const row of rankRows(uniqueRows.filter(isWinter))) {
      if (selected.filter(isWinter).length >= 6) break;
      addSelected(row, selected, selectedIds);
    }
  }
  const points = ["ZD1", "ZD2", "ZD3"];
  for (const point of points) {
    if (selected.some((row) => row.pointId === point)) continue;
    const candidate = rankRows(uniqueRows.filter((row) => row.pointId === point))[0];
    if (candidate) addSelected(candidate, selected, selectedIds);
  }
  for (const row of rankRows(uniqueRows)) {
    if (selected.length >= batchSize) break;
    addSelected(row, selected, selectedIds);
  }
  return annotateBatchRows(rankRows(selected).slice(0, batchSize));
}

function annotateBatchRows(rows) {
  return rows.map((row, index) => ({
      batchName: "baijiabao-seasonal-review-batch-1",
      batchPriority: index + 1,
      batchPriorityScore: Number(priorityScore(row).toFixed(4)),
      batchReason: batchReason(row),
      ...row
    }));
}

function addSelected(row, selected, selectedIds) {
  const id = row.reviewItemId;
  if (!id || selectedIds.has(id)) return;
  selected.push(row);
  selectedIds.add(id);
}

function renderMarkdown(report) {
  const lines = [];
  lines.push("# Baijiabao Seasonal Review Queue Annotation Batch 1");
  lines.push("");
  lines.push(`Generated at: ${report.generatedAt}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- source unique items: \`${report.summary.sourceUniqueItems}\``);
  lines.push(`- batch items: \`${report.summary.batchItems}\``);
  lines.push(`- winter items: \`${report.summary.winterItems}\``);
  lines.push(`- point coverage: \`${report.summary.pointCoverage.map((row) => `${row.key}:${row.count}`).join(", ")}\``);
  lines.push("");
  lines.push("## Utility Class Mix");
  lines.push("");
  lines.push("| class | count |");
  lines.push("|---|---:|");
  for (const row of report.summary.byUtilityClass) lines.push(`| ${row.key} | ${row.count} |`);
  lines.push("");
  lines.push("## Review Rule");
  lines.push("");
  lines.push("Fill this batch first. Keep each row keyed by unique `reviewItemId` and do not compute review precision by raw CSV row count.");
  lines.push("");
  lines.push("## Runtime Boundary");
  lines.push("");
  lines.push("This batch is for offline human review only. It must not be connected to runtime prediction or model registry.");
  lines.push("");
  return `${lines.join("\n")}\n`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = process.cwd();
  const templateCsv = path.resolve(repoRoot, args.templateCsv);
  const outDir = path.resolve(repoRoot, args.outDir);
  const rows = await readCsv(templateCsv);
  const batchRows = selectBatch(rows, args.batchSize);
  const report = {
    generatedAt: new Date().toISOString(),
    sourcePaths: { templateCsv },
    selectionPolicy: {
      batchSize: args.batchSize,
      utilityQuotas: DEFAULT_QUOTAS,
      preferredReviewItemIds: DEFAULT_BATCH_1_REVIEW_IDS,
      minWinterItems: 6,
      requiredPointCoverage: ["ZD1", "ZD2", "ZD3"],
      score: "utility rank + winter bonus + useful row count + run length + booster score"
    },
    summary: {
      sourceRows: rows.length,
      sourceUniqueItems: dedupeByReviewItem(rows).length,
      batchItems: batchRows.length,
      winterItems: batchRows.filter(isWinter).length,
      byUtilityClass: countBy(batchRows, (row) => row.utilityClass || "unknown"),
      pointCoverage: countBy(batchRows, (row) => row.pointId || "unknown"),
      bySeasonSet: countBy(batchRows, (row) => row.seasonSet || "unknown")
    },
    runtimeRegistryEligible: false,
    promotionEligible: false,
    decision:
      "Use this first batch for manual review. The result can only inform review-only workflow feasibility, not runtime promotion."
  };
  const batchCsvPath = path.join(outDir, "seasonal-review-queue-annotation-batch-1.csv");
  const reportJsonPath = path.join(outDir, "baijiabao-seasonal-review-queue-annotation-batch-1.report.json");
  const reportMdPath = path.join(outDir, "baijiabao-seasonal-review-queue-annotation-batch-1.report.md");
  await writeText(batchCsvPath, toCsv(batchRows));
  await writeJson(reportJsonPath, report);
  await writeText(reportMdPath, renderMarkdown(report));
  console.log(JSON.stringify({ batchCsvPath, reportJsonPath, reportMdPath, summary: report.summary }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
