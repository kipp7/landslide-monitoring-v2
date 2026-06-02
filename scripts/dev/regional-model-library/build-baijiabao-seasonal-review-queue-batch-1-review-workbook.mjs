import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import * as XLSX from "xlsx";

const DEFAULT_SUGGESTED_CSV =
  ".tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-batch-1-suggested-labels/batch-1-suggested-labels.csv";
const DEFAULT_ITEMS_CSV =
  ".tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-batch-1-evidence-pack/batch-1-evidence-items.csv";
const DEFAULT_OUT_DIR =
  ".tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-batch-1-review-workbook";

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
    suggestedCsv: DEFAULT_SUGGESTED_CSV,
    itemsCsv: DEFAULT_ITEMS_CSV,
    outDir: DEFAULT_OUT_DIR
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--suggested-csv") parsed.suggestedCsv = argv[++index] ?? parsed.suggestedCsv;
    if (token === "--items-csv") parsed.itemsCsv = argv[++index] ?? parsed.itemsCsv;
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

function normalize(value) {
  return String(value ?? "").trim();
}

function indexByReviewItem(rows) {
  const map = new Map();
  const duplicates = [];
  for (const row of rows) {
    const reviewItemId = normalize(row.reviewItemId);
    if (!reviewItemId) continue;
    if (map.has(reviewItemId)) duplicates.push(reviewItemId);
    else map.set(reviewItemId, row);
  }
  return { map, duplicates };
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

function buildWorkbookRows(suggestedRows, evidenceItemsById) {
  return suggestedRows.map((row) => {
    const evidence = evidenceItemsById.get(normalize(row.reviewItemId)) ?? {};
    return {
      reviewItemId: row.reviewItemId,
      pointId: row.pointId,
      batchPriority: row.batchPriority,
      batchPriorityScore: row.batchPriorityScore,
      batchReason: row.batchReason,
      startTs: row.startTs,
      endTs: row.endTs,
      rowCount: row.rowCount,
      durationDays: row.durationDays,
      seasonSet: row.seasonSet,
      monthSet: row.monthSet,
      humanReviewStatus: "pending",
      humanFinalClass: "",
      humanUseful: "",
      humanConfidence: "",
      displacementEvidence: "",
      triggerEvidence: "",
      instrumentNoiseSuspected: "",
      rawEvidenceNeeded: "",
      reviewNotes: "",
      reviewer: "",
      reviewedAt: "",
      utilityClass: row.utilityClass,
      classifications: row.classifications,
      immediatePositiveCount: row.immediatePositiveCount,
      greyZoneCount: row.greyZoneCount,
      within30Count: row.within30Count,
      isolatedCount: row.isolatedCount,
      usefulRowCount: row.usefulRowCount,
      isolatedRatio: row.isolatedRatio,
      evidenceRowCount: evidence.evidenceRowCount ?? "",
      rowCountMatched: evidence.rowCountMatched ?? "",
      classificationMix: evidence.classificationMix ?? "",
      immediatePositiveDays: evidence.immediatePositiveDays ?? "",
      greyZoneDays: evidence.greyZoneDays ?? "",
      within30Days: evidence.within30Days ?? "",
      isolatedDays: evidence.isolatedDays ?? "",
      firstBoosterScore: row.firstBoosterScore,
      maxBoosterScore: row.maxBoosterScore,
      firstEventTs: row.firstEventTs,
      lastEventTs: row.lastEventTs,
      firstRawObsTime: row.firstRawObsTime,
      lastRawObsTime: row.lastRawObsTime,
      firstDisplacementSurfaceMm: row.firstDisplacementSurfaceMm,
      firstDisplacementDelta24h: row.firstDisplacementDelta24h,
      firstDisplacementDelta72h: row.firstDisplacementDelta72h,
      firstReservoirLevelM: row.firstReservoirLevelM,
      firstRainfallCurrentMm: row.firstRainfallCurrentMm,
      firstRainfallSum72h: row.firstRainfallSum72h,
      sampleEvidence: row.sampleEvidence,
      hasSampleEvidence: row.hasSampleEvidence,
      sampleSourceGroup: row.sampleSourceGroup,
      suggestedFinalClass: row.suggestedFinalClass,
      suggestedUseful: row.suggestedUseful,
      suggestedConfidence: row.suggestedConfidence,
      suggestedTriggerContext: row.suggestedTriggerContext,
      suggestedDisplacementEvidence: row.suggestedDisplacementEvidence,
      suggestedTriggerEvidence: row.suggestedTriggerEvidence,
      suggestedInstrumentNoiseSuspected: row.suggestedInstrumentNoiseSuspected,
      suggestedReason: row.suggestedReason,
      requiresHumanOverride: row.requiresHumanOverride,
      reviewCaution: row.reviewCaution,
      suggestedReviewStatus: row.suggestedReviewStatus,
      evidenceCardsPath:
        ".tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-batch-1-evidence-pack/batch-1-evidence-cards.md",
      evidenceRowsPath:
        ".tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-batch-1-evidence-pack/batch-1-evidence-rows.csv",
      suggestedCardsPath:
        ".tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-batch-1-suggested-labels/batch-1-suggested-label-cards.md"
    };
  });
}

function buildReport({ suggestedRows, workbookRows, missingEvidenceItems, duplicateSuggestedIds, duplicateEvidenceIds, sourcePaths }) {
  const humanConclusionFieldFilled = workbookRows.filter((row) =>
    HUMAN_COLUMNS.some((keyName) => keyName !== "humanReviewStatus" && normalize(row[keyName]))
  ).length;
  return {
    generatedAt: new Date().toISOString(),
    sourcePaths,
    summary: {
      suggestedRows: suggestedRows.length,
      workbookRows: workbookRows.length,
      missingEvidenceItems: missingEvidenceItems.length,
      duplicateSuggestedIds,
      duplicateEvidenceIds,
      humanReviewStatus: countBy(workbookRows, "humanReviewStatus"),
      humanConclusionFieldFilled,
      suggestedUseful: countBy(workbookRows, "suggestedUseful"),
      suggestedFinalClass: countBy(workbookRows, "suggestedFinalClass"),
      suggestedConfidence: countBy(workbookRows, "suggestedConfidence")
    },
    validation: {
      canRunAnnotationSummaryAfterHumanFill: true,
      humanFieldsAutoFilled: false,
      suggestedFieldsAreSidecarOnly: true,
      runtimeRegistryEligible: false,
      promotionEligible: false
    },
    nextStep:
      "Fill humanReviewStatus/humanFinalClass/humanUseful/humanConfidence and evidence fields manually, then run the annotation summary checker with the workbook CSV."
  };
}

function renderReport(report) {
  const lines = [];
  lines.push("# Baijiabao Batch-1 Human Review Workbook");
  lines.push("");
  lines.push("- workbook rows: `" + report.summary.workbookRows + "`");
  lines.push("- missing evidence items: `" + report.summary.missingEvidenceItems + "`");
  lines.push("- human conclusion fields auto-filled: `false`");
  lines.push("- suggested fields are sidecar only: `true`");
  lines.push("- runtime registry eligible: `false`");
  lines.push("- promotion eligible: `false`");
  lines.push("");
  lines.push("## Suggested Useful");
  for (const item of report.summary.suggestedUseful) lines.push(`- ${item.key}: \`${item.count}\``);
  lines.push("");
  lines.push("## Next Step");
  lines.push(report.nextStep);
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function renderCards(workbookRows) {
  const lines = [];
  lines.push("# Baijiabao Batch-1 Human Review Cards");
  lines.push("");
  lines.push("Machine suggestions are hints only. Do not copy them into human fields without raw review.");
  lines.push("");
  for (const row of workbookRows) {
    lines.push(`## ${row.reviewItemId}`);
    lines.push("");
    lines.push(`- point: \`${row.pointId}\``);
    lines.push(`- window: \`${row.startTs}\` -> \`${row.endTs}\``);
    lines.push(`- utility: \`${row.utilityClass}\``);
    lines.push(`- classification mix: \`${row.classificationMix || row.classifications}\``);
    lines.push(
      `- suggested: \`${row.suggestedFinalClass}\` / useful=\`${row.suggestedUseful}\` / confidence=\`${row.suggestedConfidence}\``
    );
    lines.push(`- suggested reason: ${row.suggestedReason}`);
    lines.push(`- human fields: fill in workbook CSV, currently \`pending\``);
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

async function writeWorkbook(filePath, rows) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(rows);
  worksheet["!cols"] = Object.keys(rows[0] ?? {}).map((keyName) => ({
    wch: Math.max(12, Math.min(48, keyName.length + 2))
  }));
  worksheet["!autofilter"] = { ref: XLSX.utils.encode_range(XLSX.utils.decode_range(worksheet["!ref"] ?? "A1:A1")) };
  XLSX.utils.book_append_sheet(workbook, worksheet, "batch-1-review");
  XLSX.utils.book_append_sheet(workbook, buildReadmeSheet(), "README");
  XLSX.utils.book_append_sheet(workbook, buildAllowedValuesSheet(), "allowed-values");
  XLSX.writeFile(workbook, filePath);
}

function buildReadmeSheet() {
  const rows = [
    ["Baijiabao Batch-1 Human Review Workbook"],
    [""],
    ["Purpose", "Fill human review fields after inspecting evidence cards and raw evidence rows."],
    ["Do not", "Do not copy suggested* fields into human* fields without raw review."],
    ["Primary sheet", "batch-1-review"],
    ["Evidence cards", ".tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-batch-1-evidence-pack/batch-1-evidence-cards.md"],
    ["Evidence rows", ".tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-batch-1-evidence-pack/batch-1-evidence-rows.csv"],
    ["Suggested cards", ".tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-batch-1-suggested-labels/batch-1-suggested-label-cards.md"],
    [""],
    ["Required manual fields"],
    ["humanReviewStatus", "pending | reviewed | skipped"],
    ["humanFinalClass", "true_pre_signal | process_related | label_boundary_artifact | expected_noise | instrumentation_issue | unclear"],
    ["humanUseful", "yes | no | unsure"],
    ["humanConfidence", "low | medium | high"],
    ["displacementEvidence", "yes | no | unclear"],
    ["triggerEvidence", "yes | no | unclear"],
    ["instrumentNoiseSuspected", "yes | no | unclear"],
    [""],
    ["After filling", "Export with export-baijiabao-seasonal-review-queue-batch-1-review-workbook-csv.mjs, then run annotation summary checker."]
  ];
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet["!cols"] = [{ wch: 28 }, { wch: 120 }];
  return sheet;
}

function buildAllowedValuesSheet() {
  const rows = [
    ["field", "allowedValue"],
    ["humanReviewStatus", "pending"],
    ["humanReviewStatus", "reviewed"],
    ["humanReviewStatus", "skipped"],
    ["humanFinalClass", "true_pre_signal"],
    ["humanFinalClass", "process_related"],
    ["humanFinalClass", "label_boundary_artifact"],
    ["humanFinalClass", "expected_noise"],
    ["humanFinalClass", "instrumentation_issue"],
    ["humanFinalClass", "unclear"],
    ["humanUseful", "yes"],
    ["humanUseful", "no"],
    ["humanUseful", "unsure"],
    ["humanConfidence", "low"],
    ["humanConfidence", "medium"],
    ["humanConfidence", "high"],
    ["evidenceFlag", "yes"],
    ["evidenceFlag", "no"],
    ["evidenceFlag", "unclear"]
  ];
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet["!cols"] = [{ wch: 28 }, { wch: 32 }];
  sheet["!autofilter"] = { ref: "A1:B19" };
  return sheet;
}

async function main() {
  const repoRoot = process.cwd();
  const args = parseArgs(process.argv.slice(2));
  const suggestedCsv = path.resolve(repoRoot, args.suggestedCsv);
  const itemsCsv = path.resolve(repoRoot, args.itemsCsv);
  const outDir = path.resolve(repoRoot, args.outDir);
  const suggestedRows = await readCsv(suggestedCsv);
  const evidenceRows = await readCsv(itemsCsv);
  const { map: evidenceItemsById, duplicates: duplicateEvidenceIds } = indexByReviewItem(evidenceRows);
  const { duplicates: duplicateSuggestedIds } = indexByReviewItem(suggestedRows);
  const workbookRows = buildWorkbookRows(suggestedRows, evidenceItemsById);
  const missingEvidenceItems = workbookRows
    .filter((row) => !evidenceItemsById.has(normalize(row.reviewItemId)))
    .map((row) => row.reviewItemId);
  const sourcePaths = { suggestedCsv, itemsCsv };
  const report = buildReport({
    suggestedRows,
    workbookRows,
    missingEvidenceItems,
    duplicateSuggestedIds,
    duplicateEvidenceIds,
    sourcePaths
  });
  const workbookCsvPath = path.join(outDir, "batch-1-human-review-workbook.csv");
  const workbookXlsxPath = path.join(outDir, "batch-1-human-review-workbook.xlsx");
  const reportJsonPath = path.join(outDir, "baijiabao-seasonal-review-queue-batch-1-review-workbook.report.json");
  const reportMdPath = path.join(outDir, "baijiabao-seasonal-review-queue-batch-1-review-workbook.report.md");
  const cardsPath = path.join(outDir, "batch-1-human-review-cards.md");
  await writeText(workbookCsvPath, toCsv(workbookRows));
  await writeWorkbook(workbookXlsxPath, workbookRows);
  await writeJson(reportJsonPath, report);
  await writeText(reportMdPath, renderReport(report));
  await writeText(cardsPath, renderCards(workbookRows));
  console.log(
    JSON.stringify({ workbookCsvPath, workbookXlsxPath, reportJsonPath, reportMdPath, cardsPath, summary: report.summary }, null, 2)
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
