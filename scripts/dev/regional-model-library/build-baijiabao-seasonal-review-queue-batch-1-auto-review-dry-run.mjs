import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import * as XLSX from "xlsx";

const DEFAULT_WORKBOOK_CSV =
  ".tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-batch-1-review-workbook/batch-1-human-review-workbook.csv";
const DEFAULT_EVIDENCE_ROWS_CSV =
  ".tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-batch-1-evidence-pack/batch-1-evidence-rows.csv";
const DEFAULT_OUT_DIR =
  ".tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-batch-1-auto-review-dry-run";

function parseArgs(argv) {
  const parsed = {
    workbookCsv: DEFAULT_WORKBOOK_CSV,
    evidenceRowsCsv: DEFAULT_EVIDENCE_ROWS_CSV,
    outDir: DEFAULT_OUT_DIR
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--workbook-csv") parsed.workbookCsv = argv[++index] ?? parsed.workbookCsv;
    if (token === "--evidence-rows-csv") parsed.evidenceRowsCsv = argv[++index] ?? parsed.evidenceRowsCsv;
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

function numberValue(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
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

function maxAbs(rows, keyName) {
  return Math.max(0, ...rows.map((row) => Math.abs(numberValue(row[keyName]))));
}

function maxValue(rows, keyName) {
  return Math.max(0, ...rows.map((row) => numberValue(row[keyName])));
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

function classifyAutoReview(row, evidenceRows) {
  const immediate = numberValue(row.immediatePositiveDays || row.immediatePositiveCount);
  const grey = numberValue(row.greyZoneDays || row.greyZoneCount);
  const within30 = numberValue(row.within30Days || row.within30Count);
  const isolated = numberValue(row.isolatedDays || row.isolatedCount);
  const rowCount = Math.max(1, numberValue(row.evidenceRowCount || row.rowCount));
  const usefulRatio = (immediate + grey + within30) / rowCount;
  const isolatedRatio = isolated / rowCount;
  const maxAbsD24 = maxAbs(evidenceRows, "displacementSurfaceMm_delta_24h");
  const maxAbsD72 = maxAbs(evidenceRows, "displacementSurfaceMm_delta_72h");
  const maxAbsDisplacementLabel = maxAbs(evidenceRows, "displacementLabel");
  const maxRain72 = maxValue(evidenceRows, "rainfallCurrentMm_sum_72h");
  const maxReservoirD72 = maxAbs(evidenceRows, "reservoirLevelM_delta_72h");
  const conservativeHitDays = evidenceRows.filter((item) => normalize(item.conservativeHit) === "true").length;
  const hasDisplacementSignal =
    conservativeHitDays > 0 || maxAbsD24 >= 1.5 || maxAbsD72 >= 3 || maxAbsDisplacementLabel >= 1.5;
  const hasTriggerSignal = maxRain72 >= 20 || maxReservoirD72 >= 0.8;
  const displacementEvidence = hasDisplacementSignal ? "yes" : immediate + grey + within30 > 0 ? "unclear" : "no";
  const triggerEvidence = hasTriggerSignal ? "yes" : immediate + grey + within30 > 0 ? "unclear" : "no";
  const instrumentNoiseSuspected =
    immediate === 0 &&
    grey === 0 &&
    within30 === 0 &&
    isolatedRatio >= 0.9 &&
    !hasDisplacementSignal &&
    !hasTriggerSignal
      ? "yes"
      : "no";

  if (immediate >= 2 && usefulRatio >= 0.75 && hasDisplacementSignal && hasTriggerSignal && rowCount >= 5) {
    return {
      humanFinalClass: "true_pre_signal",
      humanUseful: "yes",
      humanConfidence: "high",
      displacementEvidence,
      triggerEvidence,
      instrumentNoiseSuspected,
      rawEvidenceNeeded: "no",
      rule: "strict-immediate-positive-with-displacement-and-trigger"
    };
  }

  if ((immediate > 0 && hasDisplacementSignal) || (grey + within30 >= 5 && (hasDisplacementSignal || hasTriggerSignal))) {
    return {
      humanFinalClass: "process_related",
      humanUseful: "yes",
      humanConfidence: hasDisplacementSignal && hasTriggerSignal ? "medium" : "low",
      displacementEvidence,
      triggerEvidence,
      instrumentNoiseSuspected,
      rawEvidenceNeeded: "yes",
      rule: "pre-episode-or-within30-process-related"
    };
  }

  if (immediate === 0 && grey + within30 >= 3 && usefulRatio >= 0.5) {
    return {
      humanFinalClass: "label_boundary_artifact",
      humanUseful: "yes",
      humanConfidence: "low",
      displacementEvidence,
      triggerEvidence,
      instrumentNoiseSuspected,
      rawEvidenceNeeded: "yes",
      rule: "label-boundary-near-event"
    };
  }

  if (instrumentNoiseSuspected === "yes") {
    return {
      humanFinalClass: "expected_noise",
      humanUseful: "no",
      humanConfidence: "medium",
      displacementEvidence,
      triggerEvidence,
      instrumentNoiseSuspected,
      rawEvidenceNeeded: "yes",
      rule: "isolated-background-or-low-evidence"
    };
  }

  return {
    humanFinalClass: "unclear",
    humanUseful: "unsure",
    humanConfidence: "low",
    displacementEvidence,
    triggerEvidence,
    instrumentNoiseSuspected,
    rawEvidenceNeeded: "yes",
    rule: "insufficient-auto-evidence"
  };
}

function buildAutoRows(workbookRows, evidenceRowsByReviewItem) {
  const reviewedAt = new Date().toISOString();
  return workbookRows.map((row) => {
    const evidenceRows = evidenceRowsByReviewItem.get(normalize(row.reviewItemId)) ?? [];
    const result = classifyAutoReview(row, evidenceRows);
    return {
      ...row,
      humanReviewStatus: "reviewed",
      humanFinalClass: result.humanFinalClass,
      humanUseful: result.humanUseful,
      humanConfidence: result.humanConfidence,
      displacementEvidence: result.displacementEvidence,
      triggerEvidence: result.triggerEvidence,
      instrumentNoiseSuspected: result.instrumentNoiseSuspected,
      rawEvidenceNeeded: result.rawEvidenceNeeded,
      reviewNotes: `AUTO_DRY_RUN_ONLY rule=${result.rule}; not human expert truth; evidenceRows=${evidenceRows.length}`,
      reviewer: "auto-dry-run:rule-v1",
      reviewedAt,
      autoDryRunRule: result.rule,
      autoDryRunEvidenceRows: evidenceRows.length
    };
  });
}

function buildReport(rows) {
  return {
    generatedAt: new Date().toISOString(),
    mode: "auto-review-dry-run",
    warning: "This file fills human* columns only to stress-test the review workflow. It is not human expert annotation.",
    summary: {
      rows: rows.length,
      byHumanFinalClass: countBy(rows, (row) => row.humanFinalClass),
      byHumanUseful: countBy(rows, (row) => row.humanUseful),
      byHumanConfidence: countBy(rows, (row) => row.humanConfidence),
      byRule: countBy(rows, (row) => row.autoDryRunRule),
      byPoint: countBy(rows, (row) => row.pointId),
      bySeasonSet: countBy(rows, (row) => row.seasonSet)
    },
    runtimeBoundary: {
      runtimeRegistryEligible: false,
      promotionEligible: false,
      reason: "Auto dry-run is allowed for pipeline testing only; product decisions need human review or objective event truth."
    }
  };
}

function renderReport(report) {
  const lines = [];
  lines.push("# Baijiabao Batch-1 Auto Review Dry Run");
  lines.push("");
  lines.push(report.warning);
  lines.push("");
  lines.push("- rows: `" + report.summary.rows + "`");
  lines.push("- runtime registry eligible: `false`");
  lines.push("- promotion eligible: `false`");
  lines.push("");
  lines.push("## Human Useful Dry-Run Distribution");
  for (const item of report.summary.byHumanUseful) lines.push(`- ${item.key}: \`${item.count}\``);
  lines.push("");
  lines.push("## Auto Rules");
  for (const item of report.summary.byRule) lines.push(`- ${item.key}: \`${item.count}\``);
  lines.push("");
  return `${lines.join("\n")}\n`;
}

async function writeWorkbook(filePath, rows) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet(rows);
  sheet["!cols"] = Object.keys(rows[0] ?? {}).map((keyName) => ({
    wch: Math.max(12, Math.min(52, keyName.length + 2))
  }));
  sheet["!autofilter"] = { ref: XLSX.utils.encode_range(XLSX.utils.decode_range(sheet["!ref"] ?? "A1:A1")) };
  XLSX.utils.book_append_sheet(workbook, sheet, "auto-dry-run");
  XLSX.writeFile(workbook, filePath);
}

async function main() {
  const repoRoot = process.cwd();
  const args = parseArgs(process.argv.slice(2));
  const workbookCsv = path.resolve(repoRoot, args.workbookCsv);
  const evidenceRowsCsv = path.resolve(repoRoot, args.evidenceRowsCsv);
  const outDir = path.resolve(repoRoot, args.outDir);
  const workbookRows = await readCsv(workbookCsv);
  const evidenceRows = await readCsv(evidenceRowsCsv);
  const evidenceRowsByReviewItem = groupBy(evidenceRows, (row) => normalize(row.reviewItemId));
  const autoRows = buildAutoRows(workbookRows, evidenceRowsByReviewItem);
  const report = buildReport(autoRows);
  const annotationCsvPath = path.join(outDir, "batch-1-auto-review-dry-run.annotation.csv");
  const annotationXlsxPath = path.join(outDir, "batch-1-auto-review-dry-run.annotation.xlsx");
  const reportJsonPath = path.join(outDir, "baijiabao-seasonal-review-queue-batch-1-auto-review-dry-run.report.json");
  const reportMdPath = path.join(outDir, "baijiabao-seasonal-review-queue-batch-1-auto-review-dry-run.report.md");
  await writeText(annotationCsvPath, toCsv(autoRows));
  await writeWorkbook(annotationXlsxPath, autoRows);
  await writeJson(reportJsonPath, report);
  await writeText(reportMdPath, renderReport(report));
  console.log(JSON.stringify({ annotationCsvPath, annotationXlsxPath, reportJsonPath, reportMdPath, summary: report.summary }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
