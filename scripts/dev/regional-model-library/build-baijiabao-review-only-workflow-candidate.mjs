import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const DEFAULT_AUTO_ANNOTATION_CSV =
  ".tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-batch-1-auto-review-dry-run/batch-1-auto-review-dry-run.annotation.csv";
const DEFAULT_AUTO_SUMMARY_JSON =
  ".tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-batch-1-auto-review-dry-run-summary/baijiabao-seasonal-review-queue-annotation-summary.report.json";
const DEFAULT_OUT_DIR = ".tmp/regional-model-library/out/artifacts/baijiabao-review-only-workflow-candidate";

function parseArgs(argv) {
  const parsed = {
    autoAnnotationCsv: DEFAULT_AUTO_ANNOTATION_CSV,
    autoSummaryJson: DEFAULT_AUTO_SUMMARY_JSON,
    outDir: DEFAULT_OUT_DIR
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--auto-annotation-csv") parsed.autoAnnotationCsv = argv[++index] ?? parsed.autoAnnotationCsv;
    if (token === "--auto-summary-json") parsed.autoSummaryJson = argv[++index] ?? parsed.autoSummaryJson;
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

function normalize(value) {
  return String(value ?? "").trim();
}

function numberValue(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function severity(row) {
  if (row.humanUseful === "yes" && row.humanConfidence === "high") return "high";
  if (row.humanUseful === "yes") return "medium";
  if (row.humanUseful === "unsure") return "needs-evidence";
  return "low";
}

function recommendedAction(row) {
  if (row.humanFinalClass === "true_pre_signal") return "prioritize-manual-review";
  if (row.humanFinalClass === "process_related") return "review-process-evidence";
  if (row.humanFinalClass === "label_boundary_artifact") return "review-label-window";
  if (row.humanUseful === "unsure") return "request-raw-evidence";
  return "archive-as-control";
}

function buildCandidateItems(rows) {
  return rows
    .map((row) => ({
      queueItemId: `baijiabao-review-only:${row.reviewItemId}`,
      sourceReviewItemId: row.reviewItemId,
      regionCode: "china.threegorges.baijiabao",
      pointId: row.pointId,
      queueType: "offline_review_only",
      status: "auto-dry-run-candidate",
      priority: numberValue(row.batchPriority),
      severity: severity(row),
      recommendedAction: recommendedAction(row),
      window: {
        startTs: row.startTs,
        endTs: row.endTs,
        durationDays: numberValue(row.durationDays),
        seasonSet: row.seasonSet,
        monthSet: row.monthSet
      },
      evidenceSummary: {
        utilityClass: row.utilityClass,
        classificationMix: row.classificationMix,
        rowCount: numberValue(row.rowCount),
        evidenceRowCount: numberValue(row.evidenceRowCount),
        immediatePositiveDays: numberValue(row.immediatePositiveDays),
        greyZoneDays: numberValue(row.greyZoneDays),
        within30Days: numberValue(row.within30Days),
        isolatedDays: numberValue(row.isolatedDays),
        maxBoosterScore: numberValue(row.maxBoosterScore),
        firstRawObsTime: row.firstRawObsTime,
        lastRawObsTime: row.lastRawObsTime,
        firstDisplacementSurfaceMm: numberValue(row.firstDisplacementSurfaceMm),
        firstDisplacementDelta24h: numberValue(row.firstDisplacementDelta24h),
        firstDisplacementDelta72h: numberValue(row.firstDisplacementDelta72h),
        firstReservoirLevelM: numberValue(row.firstReservoirLevelM),
        firstRainfallCurrentMm: numberValue(row.firstRainfallCurrentMm),
        firstRainfallSum72h: numberValue(row.firstRainfallSum72h)
      },
      autoReview: {
        mode: "auto-dry-run",
        finalClass: row.humanFinalClass,
        useful: row.humanUseful,
        confidence: row.humanConfidence,
        displacementEvidence: row.displacementEvidence,
        triggerEvidence: row.triggerEvidence,
        instrumentNoiseSuspected: row.instrumentNoiseSuspected,
        rawEvidenceNeeded: row.rawEvidenceNeeded,
        rule: row.autoDryRunRule,
        reviewer: row.reviewer,
        reviewedAt: row.reviewedAt,
        warning: "Auto dry-run only; not human expert annotation."
      },
      sourcePaths: {
        evidenceCardsPath: row.evidenceCardsPath,
        evidenceRowsPath: row.evidenceRowsPath,
        suggestedCardsPath: row.suggestedCardsPath
      },
      runtimeBoundary: {
        topLevelRiskScoreForbidden: true,
        topLevelRiskLevelForbidden: true,
        runtimeRegistryEligible: false,
        promotionEligible: false
      }
    }))
    .sort((left, right) => left.priority - right.priority || left.queueItemId.localeCompare(right.queueItemId));
}

function flattenItem(item) {
  return {
    queueItemId: item.queueItemId,
    sourceReviewItemId: item.sourceReviewItemId,
    regionCode: item.regionCode,
    pointId: item.pointId,
    queueType: item.queueType,
    status: item.status,
    priority: item.priority,
    severity: item.severity,
    recommendedAction: item.recommendedAction,
    startTs: item.window.startTs,
    endTs: item.window.endTs,
    durationDays: item.window.durationDays,
    seasonSet: item.window.seasonSet,
    utilityClass: item.evidenceSummary.utilityClass,
    classificationMix: item.evidenceSummary.classificationMix,
    evidenceRowCount: item.evidenceSummary.evidenceRowCount,
    immediatePositiveDays: item.evidenceSummary.immediatePositiveDays,
    greyZoneDays: item.evidenceSummary.greyZoneDays,
    within30Days: item.evidenceSummary.within30Days,
    isolatedDays: item.evidenceSummary.isolatedDays,
    autoFinalClass: item.autoReview.finalClass,
    autoUseful: item.autoReview.useful,
    autoConfidence: item.autoReview.confidence,
    autoRule: item.autoReview.rule,
    rawEvidenceNeeded: item.autoReview.rawEvidenceNeeded,
    topLevelRiskScoreForbidden: item.runtimeBoundary.topLevelRiskScoreForbidden,
    runtimeRegistryEligible: item.runtimeBoundary.runtimeRegistryEligible
  };
}

function countBy(items, keyFn) {
  const counts = {};
  for (const item of items) {
    const key = keyFn(item);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.entries(counts)
    .map(([key, count]) => ({ key, count }))
    .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key));
}

function buildArtifact(items, summaryReport) {
  return {
    generatedAt: new Date().toISOString(),
    artifactKey: "baijiabao.review-only.workflow-candidate.auto-dry-run.v1",
    artifactType: "review_only_workflow_candidate_v1",
    status: "auto-dry-run-candidate",
    sourceSummary: {
      decisionStatus: summaryReport.decisionStatus,
      reviewedItems: summaryReport.summary?.reviewedItems,
      reviewPrecision: summaryReport.summary?.reviewPrecision,
      winterUsefulRatio: summaryReport.summary?.winterUsefulRatio,
      invalidRows: summaryReport.summary?.invalidRows
    },
    productGate: {
      reviewOnlyWorkflowCandidate: summaryReport.decisionStatus === "manual-review-supports-review-only-workflow",
      runtimePromotionAllowed: false,
      requiresHumanConfirmationBeforeUserFacingClaim: true
    },
    runtimeBoundary: {
      topLevelRiskScoreForbidden: true,
      topLevelRiskLevelForbidden: true,
      runtimeRegistryEligible: false,
      promotionEligible: false,
      postgresSchemaChangeRequired: false
    },
    summary: {
      itemCount: items.length,
      bySeverity: countBy(items, (item) => item.severity),
      byRecommendedAction: countBy(items, (item) => item.recommendedAction),
      byAutoClass: countBy(items, (item) => item.autoReview.finalClass),
      byPoint: countBy(items, (item) => item.pointId)
    },
    items
  };
}

function renderReport(artifact) {
  const lines = [];
  lines.push("# Baijiabao Review-Only Workflow Candidate");
  lines.push("");
  lines.push("- artifact key: `" + artifact.artifactKey + "`");
  lines.push("- status: `" + artifact.status + "`");
  lines.push("- item count: `" + artifact.summary.itemCount + "`");
  lines.push("- source decision status: `" + artifact.sourceSummary.decisionStatus + "`");
  lines.push("- review precision: `" + artifact.sourceSummary.reviewPrecision + "`");
  lines.push("- winter useful ratio: `" + artifact.sourceSummary.winterUsefulRatio + "`");
  lines.push("- runtime promotion allowed: `false`");
  lines.push("- requires human confirmation before user-facing claim: `true`");
  lines.push("");
  lines.push("## Severity");
  for (const item of artifact.summary.bySeverity) lines.push(`- ${item.key}: \`${item.count}\``);
  lines.push("");
  lines.push("## Recommended Action");
  for (const item of artifact.summary.byRecommendedAction) lines.push(`- ${item.key}: \`${item.count}\``);
  lines.push("");
  lines.push("## Product Boundary");
  lines.push("- This artifact can drive a review-only queue UI.");
  lines.push("- It must not write top-level risk_score or risk_level.");
  lines.push("- It must not be registered as a prediction model.");
  lines.push("");
  return `${lines.join("\n")}\n`;
}

async function main() {
  const repoRoot = process.cwd();
  const args = parseArgs(process.argv.slice(2));
  const autoAnnotationCsv = path.resolve(repoRoot, args.autoAnnotationCsv);
  const autoSummaryJson = path.resolve(repoRoot, args.autoSummaryJson);
  const outDir = path.resolve(repoRoot, args.outDir);
  const rows = await readCsv(autoAnnotationCsv);
  const summaryReport = await readJson(autoSummaryJson);
  const items = buildCandidateItems(rows);
  const artifact = buildArtifact(items, summaryReport);
  const artifactJsonPath = path.join(outDir, "baijiabao-review-only-workflow-candidate.json");
  const itemsCsvPath = path.join(outDir, "baijiabao-review-only-workflow-candidate.items.csv");
  const reportMdPath = path.join(outDir, "baijiabao-review-only-workflow-candidate.report.md");
  await writeJson(artifactJsonPath, artifact);
  await writeText(itemsCsvPath, toCsv(items.map(flattenItem)));
  await writeText(reportMdPath, renderReport(artifact));
  console.log(
    JSON.stringify(
      {
        artifactJsonPath,
        itemsCsvPath,
        reportMdPath,
        status: artifact.status,
        productGate: artifact.productGate,
        summary: artifact.summary
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
