import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import * as XLSX from "xlsx";

const DEFAULT_WORKBOOK_XLSX =
  ".tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-batch-1-review-workbook/batch-1-human-review-workbook.xlsx";
const DEFAULT_SHEET_NAME = "batch-1-review";
const DEFAULT_OUT_DIR =
  ".tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-batch-1-review-workbook-export";

const HUMAN_COLUMNS = [
  "humanReviewStatus",
  "humanFinalClass",
  "humanUseful",
  "humanConfidence",
  "displacementEvidence",
  "triggerEvidence",
  "instrumentNoiseSuspected",
  "reviewer",
  "reviewedAt",
  "reviewNotes",
  "rawEvidenceNeeded"
];

function parseArgs(argv) {
  const parsed = {
    workbookXlsx: DEFAULT_WORKBOOK_XLSX,
    sheetName: DEFAULT_SHEET_NAME,
    outDir: DEFAULT_OUT_DIR
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--workbook-xlsx") parsed.workbookXlsx = argv[++index] ?? parsed.workbookXlsx;
    if (token === "--sheet-name") parsed.sheetName = argv[++index] ?? parsed.sheetName;
    if (token === "--out-dir") parsed.outDir = argv[++index] ?? parsed.outDir;
  }
  return parsed;
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

function normalize(value) {
  return String(value ?? "").trim();
}

function countBy(rows, keyName) {
  const counts = {};
  for (const row of rows) {
    const key = normalize(row[keyName]) || "blank";
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.entries(counts)
    .map(([key, count]) => ({ key, count }))
    .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key));
}

async function readWorkbookRows(workbookXlsx, sheetName) {
  const workbookBuffer = await readFile(workbookXlsx);
  const workbook = XLSX.read(workbookBuffer, {
    type: "buffer",
    cellDates: false,
    dense: false
  });
  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) {
    throw new Error(`Sheet not found: ${sheetName}. Available sheets: ${workbook.SheetNames.join(", ")}`);
  }
  return XLSX.utils
    .sheet_to_json(worksheet, {
      defval: "",
      raw: false
    })
    .map((row) =>
      Object.fromEntries(Object.entries(row).map(([key, value]) => [normalize(key), typeof value === "string" ? value.trim() : value]))
    );
}

function buildReport({ rows, workbookXlsx, sheetName }) {
  const duplicateCounts = {};
  for (const row of rows) {
    const reviewItemId = normalize(row.reviewItemId);
    if (reviewItemId) duplicateCounts[reviewItemId] = (duplicateCounts[reviewItemId] ?? 0) + 1;
  }
  const duplicateReviewItemIds = Object.entries(duplicateCounts)
    .filter(([, count]) => count > 1)
    .map(([reviewItemId, count]) => ({ reviewItemId, count }));
  const missingReviewItemIdRows = rows.filter((row) => !normalize(row.reviewItemId)).length;
  const missingHumanColumns = HUMAN_COLUMNS.filter((keyName) => !Object.prototype.hasOwnProperty.call(rows[0] ?? {}, keyName));
  const reviewedRows = rows.filter((row) => normalize(row.humanReviewStatus) === "reviewed");
  const copiedSuggestionRows = rows
    .filter((row) => normalize(row.humanReviewStatus) === "reviewed")
    .filter(
      (row) =>
        normalize(row.humanFinalClass) &&
        normalize(row.humanFinalClass) === normalize(row.suggestedFinalClass) &&
        normalize(row.humanUseful) &&
        normalize(row.humanUseful) === normalize(row.suggestedUseful)
    )
    .map((row) => row.reviewItemId);
  return {
    generatedAt: new Date().toISOString(),
    source: {
      workbookXlsx,
      sheetName
    },
    summary: {
      rows: rows.length,
      uniqueReviewItems: Object.keys(duplicateCounts).length,
      duplicateReviewItemIds,
      missingReviewItemIdRows,
      missingHumanColumns,
      byHumanReviewStatus: countBy(rows, "humanReviewStatus"),
      reviewedRows: reviewedRows.length,
      copiedSuggestionRows
    },
    validation: {
      readyForSummaryChecker:
        rows.length > 0 &&
        duplicateReviewItemIds.length === 0 &&
        missingReviewItemIdRows === 0 &&
        missingHumanColumns.length === 0,
      copiedSuggestionRowsAreWarningsOnly: true,
      runtimeRegistryEligible: false,
      promotionEligible: false
    },
    nextStep:
      "Run check-baijiabao-seasonal-review-queue-annotation-summary.mjs with exportedCsvPath after human review fields are filled."
  };
}

function renderReport(report) {
  const lines = [];
  lines.push("# Baijiabao Batch-1 Review Workbook CSV Export");
  lines.push("");
  lines.push("- rows: `" + report.summary.rows + "`");
  lines.push("- unique review items: `" + report.summary.uniqueReviewItems + "`");
  lines.push("- duplicate review item ids: `" + report.summary.duplicateReviewItemIds.length + "`");
  lines.push("- missing review item id rows: `" + report.summary.missingReviewItemIdRows + "`");
  lines.push("- missing human columns: `" + report.summary.missingHumanColumns.length + "`");
  lines.push("- reviewed rows: `" + report.summary.reviewedRows + "`");
  lines.push("- copied suggestion warning rows: `" + report.summary.copiedSuggestionRows.length + "`");
  lines.push("- ready for summary checker: `" + report.validation.readyForSummaryChecker + "`");
  lines.push("");
  lines.push("## Human Review Status");
  for (const item of report.summary.byHumanReviewStatus) lines.push(`- ${item.key}: \`${item.count}\``);
  lines.push("");
  lines.push(report.nextStep);
  lines.push("");
  return `${lines.join("\n")}\n`;
}

async function main() {
  const repoRoot = process.cwd();
  const args = parseArgs(process.argv.slice(2));
  const workbookXlsx = path.resolve(repoRoot, args.workbookXlsx);
  const outDir = path.resolve(repoRoot, args.outDir);
  const rows = await readWorkbookRows(workbookXlsx, args.sheetName);
  const report = buildReport({ rows, workbookXlsx, sheetName: args.sheetName });
  const exportedCsvPath = path.join(outDir, "batch-1-human-review-workbook.exported.csv");
  const reportJsonPath = path.join(outDir, "baijiabao-seasonal-review-queue-batch-1-review-workbook-export.report.json");
  const reportMdPath = path.join(outDir, "baijiabao-seasonal-review-queue-batch-1-review-workbook-export.report.md");
  await writeText(exportedCsvPath, toCsv(rows));
  await writeJson(reportJsonPath, { ...report, exportedCsvPath });
  await writeText(reportMdPath, renderReport(report));
  console.log(JSON.stringify({ exportedCsvPath, reportJsonPath, reportMdPath, summary: report.summary }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
