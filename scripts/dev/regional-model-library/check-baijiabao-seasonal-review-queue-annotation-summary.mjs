import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const DEFAULT_ANNOTATION_CSV =
  ".tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-annotation-template/seasonal-review-queue-annotation-template.csv";
const DEFAULT_ARTIFACT_JSON =
  ".tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-artifact/baijiabao-seasonal-review-queue-artifact.json";
const DEFAULT_OUT_DIR = ".tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-annotation-summary";

const HUMAN_REVIEW_STATUS = ["pending", "reviewed", "skipped"];
const HUMAN_FINAL_CLASS = [
  "true_pre_signal",
  "process_related",
  "label_boundary_artifact",
  "expected_noise",
  "instrumentation_issue",
  "unclear"
];
const HUMAN_USEFUL = ["yes", "no", "unsure"];
const HUMAN_CONFIDENCE = ["low", "medium", "high"];
const YES_NO_UNCLEAR = ["yes", "no", "unclear"];

function parseArgs(argv) {
  const parsed = {
    annotationCsv: DEFAULT_ANNOTATION_CSV,
    artifactJson: DEFAULT_ARTIFACT_JSON,
    outDir: DEFAULT_OUT_DIR
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--annotation-csv") parsed.annotationCsv = argv[++index] ?? parsed.annotationCsv;
    if (token === "--artifact-json") parsed.artifactJson = argv[++index] ?? parsed.artifactJson;
    if (token === "--out-dir") parsed.outDir = argv[++index] ?? parsed.outDir;
  }
  return parsed;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf-8"));
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

function normalize(value) {
  return String(value ?? "").trim();
}

function isReviewed(row) {
  return normalize(row.humanReviewStatus) === "reviewed";
}

function isWinter(row) {
  return normalize(row.seasonSet).split("|").includes("winter");
}

function isUseful(row) {
  if (normalize(row.humanUseful) === "yes") return true;
  return ["true_pre_signal", "process_related", "label_boundary_artifact"].includes(normalize(row.humanFinalClass));
}

function dedupeByReviewItem(rows) {
  const map = new Map();
  for (const row of rows) {
    const key = normalize(row.reviewItemId) || `${row.pointId}:${row.startTs}:${row.endTs}`;
    if (!map.has(key)) map.set(key, row);
  }
  return Array.from(map.values());
}

function validateRows(rows) {
  const invalidRows = [];
  const duplicateCounts = {};
  for (const row of rows) {
    const key = normalize(row.reviewItemId) || `${row.pointId}:${row.startTs}:${row.endTs}`;
    duplicateCounts[key] = (duplicateCounts[key] ?? 0) + 1;
    const errors = [];
    if (!HUMAN_REVIEW_STATUS.includes(normalize(row.humanReviewStatus))) {
      errors.push("invalid humanReviewStatus");
    }
    if (normalize(row.humanFinalClass) && !HUMAN_FINAL_CLASS.includes(normalize(row.humanFinalClass))) {
      errors.push("invalid humanFinalClass");
    }
    if (normalize(row.humanUseful) && !HUMAN_USEFUL.includes(normalize(row.humanUseful))) {
      errors.push("invalid humanUseful");
    }
    if (normalize(row.humanConfidence) && !HUMAN_CONFIDENCE.includes(normalize(row.humanConfidence))) {
      errors.push("invalid humanConfidence");
    }
    for (const keyName of ["displacementEvidence", "triggerEvidence", "instrumentNoiseSuspected"]) {
      if (normalize(row[keyName]) && !YES_NO_UNCLEAR.includes(normalize(row[keyName]))) {
        errors.push(`invalid ${keyName}`);
      }
    }
    if (isReviewed(row) && !normalize(row.humanFinalClass) && !normalize(row.humanUseful)) {
      errors.push("reviewed row missing humanFinalClass/humanUseful");
    }
    if (errors.length > 0) invalidRows.push({ ...row, validationErrors: errors.join("; ") });
  }
  for (const [reviewItemId, count] of Object.entries(duplicateCounts)) {
    if (count > 1) invalidRows.push({ reviewItemId, validationErrors: `duplicate reviewItemId count=${count}` });
  }
  return invalidRows;
}

function summarize(rows, artifact) {
  const invalidRows = validateRows(rows);
  const uniqueRows = dedupeByReviewItem(rows);
  const reviewedRows = uniqueRows.filter(isReviewed);
  const usefulRows = reviewedRows.filter(isUseful);
  const truePreSignalRows = reviewedRows.filter((row) => normalize(row.humanFinalClass) === "true_pre_signal");
  const processRelatedRows = reviewedRows.filter((row) => normalize(row.humanFinalClass) === "process_related");
  const labelBoundaryRows = reviewedRows.filter((row) => normalize(row.humanFinalClass) === "label_boundary_artifact");
  const falsePositiveRows = reviewedRows.filter((row) => normalize(row.humanFinalClass) === "expected_noise");
  const instrumentationIssueRows = reviewedRows.filter((row) => normalize(row.humanFinalClass) === "instrumentation_issue");
  const winterReviewedRows = reviewedRows.filter(isWinter);
  const winterUsefulRows = winterReviewedRows.filter(isUseful);
  const isolatedReviewedRows = reviewedRows.filter((row) => row.utilityClass === "isolated-background-alert-run");
  const isolatedRejectedRows = isolatedReviewedRows.filter((row) =>
    ["expected_noise", "instrumentation_issue"].includes(normalize(row.humanFinalClass))
  );
  const reviewPrecision = usefulRows.length / Math.max(1, reviewedRows.length);
  const strictPreSignalRatio = truePreSignalRows.length / Math.max(1, reviewedRows.length);
  const winterUsefulRatio = winterUsefulRows.length / Math.max(1, winterReviewedRows.length);
  const isolatedRejectedRatio = isolatedRejectedRows.length / Math.max(1, isolatedReviewedRows.length);
  const thresholds = {
    minReviewedItems: 20,
    reviewPrecisionMin: 0.5,
    winterUsefulRatioMin: 0.4,
    invalidRowsMax: 0
  };
  const decisionStatus =
    reviewedRows.length < thresholds.minReviewedItems
      ? "pending-human-review"
      : invalidRows.length > thresholds.invalidRowsMax
        ? "invalid-annotation-file"
        : reviewPrecision >= thresholds.reviewPrecisionMin && winterUsefulRatio >= thresholds.winterUsefulRatioMin
          ? "manual-review-supports-review-only-workflow"
          : "manual-review-does-not-support-review-only-workflow";
  return {
    generatedAt: new Date().toISOString(),
    sourceArtifact: {
      artifactKey: artifact.artifactKey,
      artifactType: artifact.artifactType,
      status: artifact.status,
      runtimeRegistryEligible: artifact.runtimeRegistryEligible,
      promotionEligible: artifact.promotionEligible
    },
    thresholds,
    summary: {
      inputRows: rows.length,
      uniqueReviewItems: uniqueRows.length,
      duplicateRowsRemovedForMetrics: rows.length - uniqueRows.length,
      reviewedItems: reviewedRows.length,
      pendingItems: uniqueRows.filter((row) => normalize(row.humanReviewStatus) === "pending").length,
      skippedItems: uniqueRows.filter((row) => normalize(row.humanReviewStatus) === "skipped").length,
      invalidRows: invalidRows.length,
      usefulItems: usefulRows.length,
      truePreSignalItems: truePreSignalRows.length,
      processRelatedItems: processRelatedRows.length,
      labelBoundaryItems: labelBoundaryRows.length,
      expectedNoiseItems: falsePositiveRows.length,
      instrumentationIssueItems: instrumentationIssueRows.length,
      reviewPrecision,
      strictPreSignalRatio,
      winterReviewedItems: winterReviewedRows.length,
      winterUsefulItems: winterUsefulRows.length,
      winterUsefulRatio,
      isolatedReviewedItems: isolatedReviewedRows.length,
      isolatedRejectedItems: isolatedRejectedRows.length,
      isolatedRejectedRatio,
      byHumanFinalClass: countBy(reviewedRows, (row) => normalize(row.humanFinalClass) || "blank"),
      byHumanUseful: countBy(reviewedRows, (row) => normalize(row.humanUseful) || "blank"),
      byUtilityClass: countBy(reviewedRows, (row) => row.utilityClass || "unknown"),
      byPoint: countBy(reviewedRows, (row) => row.pointId || "unknown"),
      bySeasonSet: countBy(reviewedRows, (row) => row.seasonSet || "unknown")
    },
    invalidRows,
    runtimeBoundary: {
      registryEligibleAfterReview: false,
      promotionEligibleAfterReview: false,
      reason:
        "This summary can only justify or reject a review-only workflow. It must not promote the guarded booster into top-level prediction."
    },
    decisionStatus,
    decision:
      decisionStatus === "manual-review-supports-review-only-workflow"
        ? "Manual annotations support designing a review-only workflow. Keep prediction runtime unchanged."
        : decisionStatus === "manual-review-does-not-support-review-only-workflow"
          ? "Manual annotations do not support continuing this review queue as a product workflow."
          : decisionStatus === "invalid-annotation-file"
            ? "Fix invalid annotation rows before using this summary."
            : "More manual review is required before making a workflow decision."
  };
}

function renderMarkdown(report) {
  const lines = [];
  lines.push("# Baijiabao Seasonal Review Queue Annotation Summary");
  lines.push("");
  lines.push(`Generated at: ${report.generatedAt}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- input rows: \`${report.summary.inputRows}\``);
  lines.push(`- unique review items: \`${report.summary.uniqueReviewItems}\``);
  lines.push(`- reviewed items: \`${report.summary.reviewedItems}\``);
  lines.push(`- invalid rows: \`${report.summary.invalidRows}\``);
  lines.push(`- useful items: \`${report.summary.usefulItems}\``);
  lines.push(`- review precision: \`${report.summary.reviewPrecision.toFixed(4)}\``);
  lines.push(`- winter reviewed items: \`${report.summary.winterReviewedItems}\``);
  lines.push(`- winter useful ratio: \`${report.summary.winterUsefulRatio.toFixed(4)}\``);
  lines.push(`- decision status: \`${report.decisionStatus}\``);
  lines.push("");
  lines.push("## Decision");
  lines.push("");
  lines.push(report.decision);
  lines.push("");
  lines.push("## Runtime Boundary");
  lines.push("");
  lines.push(report.runtimeBoundary.reason);
  lines.push("");
  return `${lines.join("\n")}\n`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = process.cwd();
  const annotationCsv = path.resolve(repoRoot, args.annotationCsv);
  const artifactJson = path.resolve(repoRoot, args.artifactJson);
  const outDir = path.resolve(repoRoot, args.outDir);
  const artifact = await readJson(artifactJson);
  const rows = await readCsv(annotationCsv);
  const report = summarize(rows, artifact);
  const reportJsonPath = path.join(outDir, "baijiabao-seasonal-review-queue-annotation-summary.report.json");
  const reportMdPath = path.join(outDir, "baijiabao-seasonal-review-queue-annotation-summary.report.md");
  const rowsCsvPath = path.join(outDir, "seasonal-review-queue-annotation-summary.rows.csv");
  const invalidRowsPath = path.join(outDir, "seasonal-review-queue-annotation-invalid.rows.csv");
  await writeJson(reportJsonPath, report);
  await writeText(reportMdPath, renderMarkdown(report));
  await writeText(rowsCsvPath, toCsv(dedupeByReviewItem(rows)));
  await writeText(invalidRowsPath, toCsv(report.invalidRows));
  console.log(
    JSON.stringify(
      {
        reportJsonPath,
        reportMdPath,
        rowsCsvPath,
        invalidRowsPath,
        decisionStatus: report.decisionStatus,
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
