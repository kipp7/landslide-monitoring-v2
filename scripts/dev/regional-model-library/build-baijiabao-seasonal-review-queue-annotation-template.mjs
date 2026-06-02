import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const DEFAULT_SAMPLE_CSV =
  ".tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-artifact/human-review-sample-combined.csv";
const DEFAULT_ARTIFACT_JSON =
  ".tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-artifact/baijiabao-seasonal-review-queue-artifact.json";
const DEFAULT_QUEUE_CSV =
  ".tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-policy/seasonal-review-queue-items.csv";
const DEFAULT_OUT_DIR = ".tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-annotation-template";

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
    sampleCsv: DEFAULT_SAMPLE_CSV,
    artifactJson: DEFAULT_ARTIFACT_JSON,
    queueCsv: DEFAULT_QUEUE_CSV,
    outDir: DEFAULT_OUT_DIR
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--sample-csv") parsed.sampleCsv = argv[++index] ?? parsed.sampleCsv;
    if (token === "--artifact-json") parsed.artifactJson = argv[++index] ?? parsed.artifactJson;
    if (token === "--queue-csv") parsed.queueCsv = argv[++index] ?? parsed.queueCsv;
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

function dedupeSampleRows(rows) {
  const map = new Map();
  for (const row of rows) {
    const key = row.reviewItemId || `${row.pointId}:${row.startTs}:${row.endTs}`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        ...row,
        sampleSourceGroup: inferSampleSourceGroup(row),
        duplicateSampleRowCount: 1
      });
      continue;
    }
    existing.sampleSourceGroup = Array.from(
      new Set(String(existing.sampleSourceGroup).split("|").concat(inferSampleSourceGroup(row).split("|")))
    )
      .filter(Boolean)
      .sort()
      .join("|");
    existing.duplicateSampleRowCount = Number(existing.duplicateSampleRowCount) + 1;
  }
  return Array.from(map.values()).sort((left, right) => {
    const utilityDiff = utilityRank(left.utilityClass) - utilityRank(right.utilityClass);
    if (utilityDiff !== 0) return utilityDiff;
    return String(left.startTs).localeCompare(String(right.startTs));
  });
}

function inferSampleSourceGroup(row) {
  const groups = [];
  if (row.utilityClass && row.utilityClass !== "isolated-background-alert-run") groups.push("useful");
  if (row.utilityClass === "isolated-background-alert-run") groups.push("isolated");
  if (String(row.seasonSet ?? "").split("|").includes("winter")) groups.push("winter");
  return groups.join("|") || "unknown";
}

function mergeTemplateBaseRows(sampleRows, queueRows) {
  const sampleById = new Map(dedupeSampleRows(sampleRows).map((row) => [row.reviewItemId, row]));
  const baseRows = queueRows.length > 0 ? queueRows : Array.from(sampleById.values());
  return baseRows.map((queueRow) => {
    const sampleRow = sampleById.get(queueRow.reviewItemId) ?? {};
    return {
      ...queueRow,
      firstEventTs: sampleRow.firstEventTs ?? queueRow.startTs ?? "",
      lastEventTs: sampleRow.lastEventTs ?? queueRow.endTs ?? "",
      firstRawObsTime: sampleRow.firstRawObsTime ?? "",
      lastRawObsTime: sampleRow.lastRawObsTime ?? "",
      firstDisplacementSurfaceMm: sampleRow.firstDisplacementSurfaceMm ?? "",
      firstDisplacementDelta24h: sampleRow.firstDisplacementDelta24h ?? "",
      firstDisplacementDelta72h: sampleRow.firstDisplacementDelta72h ?? "",
      firstReservoirLevelM: sampleRow.firstReservoirLevelM ?? "",
      firstRainfallCurrentMm: sampleRow.firstRainfallCurrentMm ?? "",
      firstRainfallSum72h: sampleRow.firstRainfallSum72h ?? "",
      sampleEvidence: sampleRow.sampleEvidence ?? "",
      hasSampleEvidence: sampleRow.sampleEvidence ? "yes" : "no",
      sampleSourceGroup: sampleRow.sampleSourceGroup ?? inferSampleSourceGroup(queueRow),
      duplicateSampleRowCount: sampleRow.duplicateSampleRowCount ?? 0
    };
  });
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

function buildTemplateRows(rows, queueRows) {
  return mergeTemplateBaseRows(rows, queueRows).map((row) => ({
    humanReviewStatus: "pending",
    humanFinalClass: "",
    humanUseful: "",
    humanConfidence: "",
    displacementEvidence: "",
    triggerEvidence: "",
    instrumentNoiseSuspected: "",
    reviewer: "",
    reviewedAt: "",
    reviewNotes: "",
    rawEvidenceNeeded: "",
    ...row
  }));
}

function renderGuide(artifact, summary) {
  const lines = [];
  lines.push("# Baijiabao Seasonal Review Queue Annotation Template");
  lines.push("");
  lines.push("## Purpose");
  lines.push("");
  lines.push(
    "This template is for manual review of the offline seasonal review queue. It is not a prediction artifact and must not be connected to runtime."
  );
  lines.push("");
  lines.push("## Source");
  lines.push("");
  lines.push(`- artifact key: \`${artifact.artifactKey}\``);
  lines.push(`- artifact type: \`${artifact.artifactType}\``);
  lines.push(`- input sample rows: \`${summary.inputSampleRows}\``);
  lines.push(`- unique review items: \`${summary.uniqueReviewItems}\``);
  lines.push(`- duplicate sample rows removed: \`${summary.duplicateSampleRowsRemoved}\``);
  lines.push("");
  lines.push("## Fill These Columns");
  lines.push("");
  lines.push(`- humanReviewStatus: ${HUMAN_REVIEW_STATUS.map((item) => `\`${item}\``).join(", ")}`);
  lines.push(`- humanFinalClass: ${HUMAN_FINAL_CLASS.map((item) => `\`${item}\``).join(", ")}`);
  lines.push(`- humanUseful: ${HUMAN_USEFUL.map((item) => `\`${item}\``).join(", ")}`);
  lines.push(`- humanConfidence: ${HUMAN_CONFIDENCE.map((item) => `\`${item}\``).join(", ")}`);
  lines.push(`- displacementEvidence: ${YES_NO_UNCLEAR.map((item) => `\`${item}\``).join(", ")}`);
  lines.push(`- triggerEvidence: ${YES_NO_UNCLEAR.map((item) => `\`${item}\``).join(", ")}`);
  lines.push(`- instrumentNoiseSuspected: ${YES_NO_UNCLEAR.map((item) => `\`${item}\``).join(", ")}`);
  lines.push("- reviewer / reviewedAt / reviewNotes / rawEvidenceNeeded: free text");
  lines.push("");
  lines.push("## Class Meaning");
  lines.push("");
  lines.push("- `true_pre_signal`: raw process evidence supports an early warning signal.");
  lines.push("- `process_related`: process has meaningful deformation/trigger context but is not enough to call true pre-signal.");
  lines.push("- `label_boundary_artifact`: derived label window is too narrow; queue item is useful for label cleanup.");
  lines.push("- `expected_noise`: expected background variability, not operationally useful.");
  lines.push("- `instrumentation_issue`: likely sensor/table/data issue.");
  lines.push("- `unclear`: cannot judge with current evidence.");
  lines.push("");
  lines.push("## Runtime Boundary");
  lines.push("");
  lines.push("- Do not write this template or its summary into `artifacts/models/*/registry.json`.");
  lines.push("- Do not route it through `services/ai-prediction-worker`.");
  lines.push("- Do not map it to top-level `risk_score` or `risk_level`.");
  lines.push("- Do not change PostgreSQL schema for this review queue.");
  lines.push("");
  return `${lines.join("\n")}\n`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = process.cwd();
  const sampleCsv = path.resolve(repoRoot, args.sampleCsv);
  const artifactJson = path.resolve(repoRoot, args.artifactJson);
  const queueCsv = path.resolve(repoRoot, args.queueCsv);
  const outDir = path.resolve(repoRoot, args.outDir);
  const artifact = await readJson(artifactJson);
  const sampleRows = await readCsv(sampleCsv);
  const queueRows = await readCsv(queueCsv);
  const templateRows = buildTemplateRows(sampleRows, queueRows);
  const summary = {
    inputSampleRows: sampleRows.length,
    queueReviewItems: queueRows.length,
    uniqueReviewItems: templateRows.length,
    templateRowsWithSampleEvidence: templateRows.filter((row) => row.hasSampleEvidence === "yes").length,
    duplicateSampleRowsRemoved: sampleRows.length - dedupeSampleRows(sampleRows).length,
    runtimeRegistryEligible: false,
    promotionEligible: false
  };

  const templatePath = path.join(outDir, "seasonal-review-queue-annotation-template.csv");
  const guidePath = path.join(outDir, "baijiabao-seasonal-review-queue-annotation-template.md");
  const reportPath = path.join(outDir, "baijiabao-seasonal-review-queue-annotation-template.report.json");
  await writeText(templatePath, toCsv(templateRows));
  await writeText(guidePath, renderGuide(artifact, summary));
  await writeJson(reportPath, {
    generatedAt: new Date().toISOString(),
    sourcePaths: { sampleCsv, artifactJson, queueCsv },
    allowedValues: {
      humanReviewStatus: HUMAN_REVIEW_STATUS,
      humanFinalClass: HUMAN_FINAL_CLASS,
      humanUseful: HUMAN_USEFUL,
      humanConfidence: HUMAN_CONFIDENCE,
      displacementEvidence: YES_NO_UNCLEAR,
      triggerEvidence: YES_NO_UNCLEAR,
      instrumentNoiseSuspected: YES_NO_UNCLEAR
    },
    summary,
    decision:
      "Fill the generated template manually, then run check-baijiabao-seasonal-review-queue-annotation-summary.mjs against the filled CSV."
  });
  console.log(JSON.stringify({ templatePath, guidePath, reportPath, summary }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
