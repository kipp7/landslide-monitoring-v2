import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const DEFAULT_POLICY_REPORT =
  ".tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-policy/baijiabao-seasonal-review-queue-policy.report.json";
const DEFAULT_QUEUE_CSV =
  ".tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-policy/seasonal-review-queue-items.csv";
const DEFAULT_PROXIMITY_CSV =
  ".tmp/regional-model-library/out/artifacts/baijiabao-guarded-alert-pressure-episode-review/guarded-alert-episode-proximity.rows.csv";
const DEFAULT_RUNS_CSV =
  ".tmp/regional-model-library/out/artifacts/baijiabao-guarded-alert-pressure-episode-review/guarded-alert-runs.csv";
const DEFAULT_SEASONAL_EXPERT_REPORT =
  ".tmp/regional-model-library/out/artifacts/baijiabao-seasonal-expert-challenger/baijiabao-seasonal-expert-challenger.report.json";
const DEFAULT_CROSS_LABEL_GATE_REPORT =
  ".tmp/regional-model-library/out/artifacts/baijiabao-cross-label-promotion-gate/baijiabao-cross-label-promotion-gate.report.json";
const DEFAULT_OUT_DIR = ".tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-artifact";

const ARTIFACT_KEY = "baijiabao.offline.seasonal-review-queue.v1";
const ARTIFACT_TYPE = "offline_review_queue_v1";
const BOOSTER_KEY = "baijiabao.offline.seasonal-autumn-winter.logistic-balanced-l2.booster-v1";
const PRIMARY_MODEL_KEY = "baijiabao.challenger.rainfall-reservoir.mean-diff.linear-risk-v1";

function parseArgs(argv) {
  const parsed = {
    policyReport: DEFAULT_POLICY_REPORT,
    queueCsv: DEFAULT_QUEUE_CSV,
    proximityCsv: DEFAULT_PROXIMITY_CSV,
    runsCsv: DEFAULT_RUNS_CSV,
    seasonalExpertReport: DEFAULT_SEASONAL_EXPERT_REPORT,
    crossLabelGateReport: DEFAULT_CROSS_LABEL_GATE_REPORT,
    outDir: DEFAULT_OUT_DIR,
    usefulLimit: 20,
    isolatedLimit: 12,
    winterLimit: 20
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--policy-report") parsed.policyReport = argv[++index] ?? parsed.policyReport;
    if (token === "--queue-csv") parsed.queueCsv = argv[++index] ?? parsed.queueCsv;
    if (token === "--proximity-csv") parsed.proximityCsv = argv[++index] ?? parsed.proximityCsv;
    if (token === "--runs-csv") parsed.runsCsv = argv[++index] ?? parsed.runsCsv;
    if (token === "--seasonal-expert-report") parsed.seasonalExpertReport = argv[++index] ?? parsed.seasonalExpertReport;
    if (token === "--cross-label-gate-report") parsed.crossLabelGateReport = argv[++index] ?? parsed.crossLabelGateReport;
    if (token === "--out-dir") parsed.outDir = argv[++index] ?? parsed.outDir;
    if (token === "--useful-limit") parsed.usefulLimit = toPositiveInt(argv[++index], parsed.usefulLimit);
    if (token === "--isolated-limit") parsed.isolatedLimit = toPositiveInt(argv[++index], parsed.isolatedLimit);
    if (token === "--winter-limit") parsed.winterLimit = toPositiveInt(argv[++index], parsed.winterLimit);
  }
  return parsed;
}

function toPositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
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

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toFixed(value, digits = 4) {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(digits) : "n/a";
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

function utilityRank(item) {
  const ranks = {
    "contains-immediate-positive": 0,
    "contains-pre-episode-grey-zone": 1,
    "contains-hard-negative-within-30d": 2,
    "isolated-background-alert-run": 3
  };
  return ranks[item.utilityClass] ?? 99;
}

function rankReviewItems(items) {
  return items.slice().sort((left, right) => {
    const utilityDiff = utilityRank(left) - utilityRank(right);
    if (utilityDiff !== 0) return utilityDiff;
    const usefulDiff = (toNumber(right.usefulRowCount) ?? 0) - (toNumber(left.usefulRowCount) ?? 0);
    if (usefulDiff !== 0) return usefulDiff;
    const rowDiff = (toNumber(right.rowCount) ?? 0) - (toNumber(left.rowCount) ?? 0);
    if (rowDiff !== 0) return rowDiff;
    return String(left.startTs).localeCompare(String(right.startTs));
  });
}

function assignRunId(row, runs) {
  const tsMs = toNumber(row.tsMs);
  if (tsMs === null) return null;
  for (const run of runs) {
    if (run.pointId !== row.pointId) continue;
    const start = toNumber(run.startTsMs);
    const end = toNumber(run.endTsMs);
    if (start !== null && end !== null && tsMs >= start && tsMs <= end) return run.runId;
  }
  return null;
}

function summarizeItemRows(reviewItems, proximityRows, runs) {
  const rowsWithRun = proximityRows.map((row) => ({
    ...row,
    reviewItemId: assignRunId(row, runs) ?? `${row.pointId}:unmatched:${row.eventTs}`
  }));
  const rowsByItem = groupBy(rowsWithRun, (row) => row.reviewItemId);
  return reviewItems.map((item) => {
    const rows = rowsByItem.get(item.reviewItemId) ?? [];
    const sorted = rows.slice().sort((left, right) => String(left.eventTs).localeCompare(String(right.eventTs)));
    const first = sorted[0] ?? {};
    const last = sorted[sorted.length - 1] ?? {};
    const sampleRows = sorted.slice(0, 3);
    return {
      reviewItemId: item.reviewItemId,
      pointId: item.pointId,
      startTs: item.startTs,
      endTs: item.endTs,
      rowCount: item.rowCount,
      durationDays: item.durationDays,
      seasonSet: item.seasonSet,
      monthSet: item.monthSet,
      utilityClass: item.utilityClass,
      classifications: item.classifications,
      immediatePositiveCount: item.immediatePositiveCount,
      greyZoneCount: item.greyZoneCount,
      within30Count: item.within30Count,
      isolatedCount: item.isolatedCount,
      usefulRowCount: item.usefulRowCount,
      maxBoosterScore: item.maxBoosterScore,
      firstEventTs: first.eventTs ?? null,
      lastEventTs: last.eventTs ?? null,
      firstRawObsTime: first.raw_obs_time ?? null,
      lastRawObsTime: last.raw_obs_time ?? null,
      firstDisplacementSurfaceMm: first.displacementSurfaceMm ?? null,
      firstDisplacementDelta24h: first.displacementSurfaceMm_delta_24h ?? null,
      firstDisplacementDelta72h: first.displacementSurfaceMm_delta_72h ?? null,
      firstReservoirLevelM: first.reservoirLevelM ?? null,
      firstRainfallCurrentMm: first.rainfallCurrentMm ?? null,
      firstRainfallSum72h: first.rainfallCurrentMm_sum_72h ?? null,
      sampleEvidence: sampleRows
        .map(
          (row) =>
            `${row.raw_obs_time ?? row.eventTs}:${row.classification}:score=${toFixed(toNumber(row.boosterScore), 4)}`
        )
        .join(" | ")
    };
  });
}

function buildHumanValidationChecklist() {
  return [
    "Check whether the run aligns with observed displacement acceleration, not only one noisy day.",
    "Check whether rainfall or reservoir movement gives a plausible trigger context.",
    "Mark whether the run should be a true pre-signal, expected monitoring noise, instrumentation issue, or label-boundary artefact.",
    "Do not use this queue to set top-level risk_score or risk_level before manual validation.",
    "If accepted, register it as a review-only workflow and keep prediction runtime unchanged."
  ];
}

function buildArtifact({ policyReport, seasonalExpertReport, crossLabelGateReport, reviewItems, sampledRows, sourcePaths }) {
  const summary = policyReport.summary;
  const usefulItems = reviewItems.filter((item) => item.utilityClass !== "isolated-background-alert-run");
  const isolatedItems = reviewItems.filter((item) => item.utilityClass === "isolated-background-alert-run");
  const guardedThresholdResult = (seasonalExpertReport.thresholdResults ?? []).find(
    (result) => result.thresholdMode === "guarded-recall"
  );
  return {
    artifactKey: ARTIFACT_KEY,
    artifactType: ARTIFACT_TYPE,
    generatedAt: new Date().toISOString(),
    status: "review-only-candidate",
    promotionEligible: false,
    runtimeRegistryEligible: false,
    runtimeUseForbidden: true,
    scope: {
      type: "station-family",
      key: "threegorges-baijiabao",
      sourceDataset: "Baijiabao observation dataset 2017-2024"
    },
    sourceModels: {
      primaryWarningModelKey: seasonalExpertReport.primary?.modelKey ?? PRIMARY_MODEL_KEY,
      primaryThreshold: seasonalExpertReport.primary?.threshold ?? null,
      boosterModelKey: seasonalExpertReport.booster?.key ?? BOOSTER_KEY,
      guardedBoosterThreshold: guardedThresholdResult?.threshold ?? 0.290563,
      targetSeasons: seasonalExpertReport.targetSeasons ?? ["autumn", "winter"]
    },
    sourcePaths,
    labelPolicy: {
      trainingLabel: seasonalExpertReport.labelKeys?.training ?? "warningHitLabelEpisodeGreyZoneExcluded",
      immediateEvalLabel: seasonalExpertReport.labelKeys?.immediateEval ?? "warningHitLabelImmediate",
      greyZonePolicyKey: crossLabelGateReport.reviewWorkload?.policyKey ?? "baijiabao.episode-boundary-grey-zone.v1",
      preEpisodeGreyZoneDays: crossLabelGateReport.reviewWorkload?.preEpisodeGreyZoneDays ?? 14,
      warning: "Derived labels are not manual landslide-event truth; this artifact is for review triage only."
    },
    queuePolicy: {
      unit: "continuous guarded incremental alert run",
      dedupeMode: "same point continuous run",
      dailyAlertCount: summary.dailyAlertCount,
      reviewItemCount: summary.reviewItemCount,
      compressionRatio: summary.compressionRatio,
      usefulReviewItemCount: summary.usefulReviewItemCount,
      isolatedReviewItemCount: summary.isolatedReviewItemCount,
      usefulReviewItemRatio: summary.usefulReviewItemRatio,
      byUtilityClass: summary.byUtilityClass,
      byPoint: summary.byPoint,
      byRowCountBucket: summary.byRowCountBucket
    },
    reviewItemSchema: {
      reviewItemId: "Run identifier; stable within the generated CSV.",
      pointId: "Monitoring point, e.g. ZD1/ZD2/ZD3.",
      startTs: "First guarded incremental alert timestamp in the run.",
      endTs: "Last guarded incremental alert timestamp in the run.",
      rowCount: "Number of daily guarded incremental alerts compressed into this item.",
      utilityClass: "contains-immediate-positive | contains-pre-episode-grey-zone | contains-hard-negative-within-30d | isolated-background-alert-run.",
      sampleEvidence: "First three row-level evidence snippets for manual triage."
    },
    samples: {
      usefulSampleCount: sampledRows.useful.length,
      isolatedSampleCount: sampledRows.isolated.length,
      winterSampleCount: sampledRows.winter.length
    },
    forbiddenRuntimeUse: [
      "Do not write this artifact into artifacts/models/*/registry.json.",
      "Do not route it through services/ai-prediction-worker.",
      "Do not map its score to top-level risk_score or risk_level.",
      "Do not use it to change PostgreSQL schema.",
      "Do not treat reviewItem utility as a final prediction label."
    ],
    allowedUse: [
      "Offline human review queue.",
      "Evidence collection for label-boundary cleanup.",
      "Candidate review-only workflow design after manual validation.",
      "Source pack for later supervised review-queue model training."
    ],
    humanValidationChecklist: buildHumanValidationChecklist(),
    decision:
      usefulItems.length / Math.max(1, reviewItems.length) >= 0.5
        ? "Package as a review-only offline candidate. It has enough compressed useful items to justify manual validation, but it remains forbidden for runtime prediction."
        : "Archive as exploratory only. The compressed queue is dominated by isolated background alert runs."
  };
}

function renderCard(artifact, sampledRows) {
  const lines = [];
  lines.push("# Baijiabao Seasonal Review Queue Artifact");
  lines.push("");
  lines.push(`Generated at: ${artifact.generatedAt}`);
  lines.push("");
  lines.push("## Identity");
  lines.push("");
  lines.push(`- artifact key: \`${artifact.artifactKey}\``);
  lines.push(`- artifact type: \`${artifact.artifactType}\``);
  lines.push(`- status: \`${artifact.status}\``);
  lines.push(`- runtime registry eligible: \`${artifact.runtimeRegistryEligible}\``);
  lines.push(`- promotion eligible: \`${artifact.promotionEligible}\``);
  lines.push("");
  lines.push("## Queue Summary");
  lines.push("");
  lines.push(`- daily guarded incremental alerts: \`${artifact.queuePolicy.dailyAlertCount}\``);
  lines.push(`- review queue items: \`${artifact.queuePolicy.reviewItemCount}\``);
  lines.push(`- compression ratio: \`${toFixed(artifact.queuePolicy.compressionRatio)}\``);
  lines.push(`- useful review items: \`${artifact.queuePolicy.usefulReviewItemCount}\``);
  lines.push(`- isolated review items: \`${artifact.queuePolicy.isolatedReviewItemCount}\``);
  lines.push(`- useful item ratio: \`${toFixed(artifact.queuePolicy.usefulReviewItemRatio)}\``);
  lines.push("");
  lines.push("## Utility Classes");
  lines.push("");
  lines.push("| class | count |");
  lines.push("|---|---:|");
  for (const row of artifact.queuePolicy.byUtilityClass ?? []) lines.push(`| ${row.key} | ${row.count} |`);
  lines.push("");
  lines.push("## Runtime Boundary");
  lines.push("");
  lines.push("This artifact is intentionally not a prediction model and must not be added to the runtime registry.");
  lines.push("");
  for (const rule of artifact.forbiddenRuntimeUse) lines.push(`- ${rule}`);
  lines.push("");
  lines.push("## Human Validation Checklist");
  lines.push("");
  for (const item of artifact.humanValidationChecklist) lines.push(`- ${item}`);
  lines.push("");
  lines.push("## Sample Pack");
  lines.push("");
  lines.push(`- useful sample rows: \`${sampledRows.useful.length}\``);
  lines.push(`- isolated sample rows: \`${sampledRows.isolated.length}\``);
  lines.push(`- winter sample rows: \`${sampledRows.winter.length}\``);
  lines.push("");
  lines.push("## Decision");
  lines.push("");
  lines.push(artifact.decision);
  lines.push("");
  return `${lines.join("\n")}\n`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = process.cwd();
  const sourcePaths = {
    policyReport: path.resolve(repoRoot, args.policyReport),
    queueCsv: path.resolve(repoRoot, args.queueCsv),
    proximityCsv: path.resolve(repoRoot, args.proximityCsv),
    runsCsv: path.resolve(repoRoot, args.runsCsv),
    seasonalExpertReport: path.resolve(repoRoot, args.seasonalExpertReport),
    crossLabelGateReport: path.resolve(repoRoot, args.crossLabelGateReport)
  };
  const policyReport = await readJson(sourcePaths.policyReport);
  const seasonalExpertReport = await readJson(sourcePaths.seasonalExpertReport);
  const crossLabelGateReport = await readJson(sourcePaths.crossLabelGateReport);
  const reviewItems = await readCsv(sourcePaths.queueCsv);
  const proximityRows = await readCsv(sourcePaths.proximityCsv);
  const runs = await readCsv(sourcePaths.runsCsv);

  const itemSummaries = summarizeItemRows(reviewItems, proximityRows, runs);
  const ranked = rankReviewItems(itemSummaries);
  const useful = ranked
    .filter((item) => item.utilityClass !== "isolated-background-alert-run")
    .slice(0, args.usefulLimit);
  const isolated = ranked
    .filter((item) => item.utilityClass === "isolated-background-alert-run")
    .slice(0, args.isolatedLimit);
  const winter = ranked.filter((item) => String(item.seasonSet).split("|").includes("winter"));
  const winterSample = winter.slice(0, args.winterLimit);
  const sampledRows = { useful, isolated, winter: winterSample };

  const artifact = buildArtifact({
    policyReport,
    seasonalExpertReport,
    crossLabelGateReport,
    reviewItems: itemSummaries,
    sampledRows,
    sourcePaths
  });
  const outDir = path.resolve(repoRoot, args.outDir);
  const artifactPath = path.join(outDir, "baijiabao-seasonal-review-queue-artifact.json");
  const cardPath = path.join(outDir, "baijiabao-seasonal-review-queue-card.md");
  const usefulPath = path.join(outDir, "human-review-sample-useful.csv");
  const isolatedPath = path.join(outDir, "human-review-sample-isolated.csv");
  const winterPath = path.join(outDir, "human-review-sample-winter.csv");
  const allSamplePath = path.join(outDir, "human-review-sample-combined.csv");

  await writeJson(artifactPath, artifact);
  await writeText(cardPath, renderCard(artifact, sampledRows));
  await writeText(usefulPath, toCsv(useful));
  await writeText(isolatedPath, toCsv(isolated));
  await writeText(winterPath, toCsv(winterSample));
  await writeText(allSamplePath, toCsv([...useful, ...isolated, ...winterSample]));

  console.log(
    JSON.stringify(
      {
        artifactPath,
        cardPath,
        samplePaths: {
          useful: usefulPath,
          isolated: isolatedPath,
          winter: winterPath,
          combined: allSamplePath
        },
        artifactType: artifact.artifactType,
        status: artifact.status,
        runtimeRegistryEligible: artifact.runtimeRegistryEligible,
        summary: artifact.queuePolicy,
        sampleCounts: artifact.samples,
        decision: artifact.decision,
        utilityClassCounts: countBy(itemSummaries, (item) => item.utilityClass)
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
