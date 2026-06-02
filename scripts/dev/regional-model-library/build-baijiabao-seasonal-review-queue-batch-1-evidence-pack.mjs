import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const DEFAULT_BATCH_CSV =
  ".tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-annotation-batch-1/seasonal-review-queue-annotation-batch-1.csv";
const DEFAULT_PROXIMITY_CSV =
  ".tmp/regional-model-library/out/artifacts/baijiabao-guarded-alert-pressure-episode-review/guarded-alert-episode-proximity.rows.csv";
const DEFAULT_RUNS_CSV =
  ".tmp/regional-model-library/out/artifacts/baijiabao-guarded-alert-pressure-episode-review/guarded-alert-runs.csv";
const DEFAULT_OUT_DIR = ".tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-batch-1-evidence-pack";

function parseArgs(argv) {
  const parsed = {
    batchCsv: DEFAULT_BATCH_CSV,
    proximityCsv: DEFAULT_PROXIMITY_CSV,
    runsCsv: DEFAULT_RUNS_CSV,
    outDir: DEFAULT_OUT_DIR
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--batch-csv") parsed.batchCsv = argv[++index] ?? parsed.batchCsv;
    if (token === "--proximity-csv") parsed.proximityCsv = argv[++index] ?? parsed.proximityCsv;
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
      } else if (char === '"') quoted = false;
      else current += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      values.push(current);
      current = "";
    } else current += char;
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
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(digits) : "";
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

function tsMs(row, key) {
  const parsed = Date.parse(row[key]);
  return Number.isFinite(parsed) ? parsed : null;
}

function findRows(item, proximityRows) {
  const start = tsMs(item, "startTs");
  const end = tsMs(item, "endTs");
  return proximityRows
    .filter((row) => {
      const ts = tsMs(row, "eventTs");
      return row.pointId === item.pointId && ts !== null && start !== null && end !== null && ts >= start && ts <= end;
    })
    .sort((left, right) => String(left.eventTs).localeCompare(String(right.eventTs)));
}

function buildEvidence(batchRows, proximityRows, runRows) {
  const runById = new Map(runRows.map((row) => [row.runId, row]));
  const itemRows = [];
  const evidenceRows = [];
  const missing = [];
  const mismatches = [];
  for (const item of batchRows) {
    const rows = findRows(item, proximityRows);
    const run = runById.get(item.reviewItemId);
    if (!run || rows.length === 0) missing.push({ reviewItemId: item.reviewItemId, hasRun: Boolean(run), evidenceRows: rows.length });
    if (rows.length !== Number(item.rowCount)) {
      mismatches.push({ reviewItemId: item.reviewItemId, expectedRowCount: item.rowCount, evidenceRows: rows.length });
    }
    const classifications = countBy(rows, (row) => row.classification || "unknown");
    itemRows.push({
      reviewItemId: item.reviewItemId,
      batchPriority: item.batchPriority,
      pointId: item.pointId,
      startTs: item.startTs,
      endTs: item.endTs,
      utilityClass: item.utilityClass,
      seasonSet: item.seasonSet,
      monthSet: item.monthSet,
      rowCount: item.rowCount,
      evidenceRowCount: rows.length,
      rowCountMatched: rows.length === Number(item.rowCount),
      immediatePositiveDays: rows.filter((row) => row.classification === "immediate-positive").length,
      greyZoneDays: rows.filter((row) => row.classification === "grey-zone-pre-episode").length,
      within30Days: rows.filter((row) => row.classification === "hard-negative-within-30d-next-positive").length,
      isolatedDays: rows.filter((row) => row.classification === "hard-negative-no-positive-within-30d").length,
      classificationMix: classifications.map((row) => `${row.key}:${row.count}`).join("|"),
      firstBoosterScore: rows[0]?.boosterScore ?? "",
      maxBoosterScore: Math.max(...rows.map((row) => toNumber(row.boosterScore)).filter((value) => value !== null))
    });
    rows.forEach((row, index) => {
      evidenceRows.push({
        reviewItemId: item.reviewItemId,
        pointId: item.pointId,
        raw_obs_time: row.raw_obs_time,
        eventTs: row.eventTs,
        season: row.season,
        month: row.month,
        classification: row.classification,
        boundaryClass: row.boundaryClass,
        immediateLabel: row.immediateLabel,
        greyZoneLabel: row.greyZoneLabel,
        daysToNextEpisode: row.daysToNextEpisode,
        within3d: row.within3d,
        within7d: row.within7d,
        within14d: row.within14d,
        within30d: row.within30d,
        nextEpisodeId: row.nextEpisodeId,
        daysSincePreviousEpisode: row.daysSincePreviousEpisode,
        previousEpisodeId: row.previousEpisodeId,
        boosterScore: row.boosterScore,
        primaryScore: row.primaryScore,
        guardedHit: row.guardedHit,
        guardedIncremental: row.guardedIncremental,
        primaryHit: row.primaryHit,
        conservativeHit: row.conservativeHit,
        conservativeIncremental: row.conservativeIncremental,
        displacementSurfaceMm: row.displacementSurfaceMm,
        displacementSurfaceMm_delta_24h: row.displacementSurfaceMm_delta_24h,
        displacementSurfaceMm_delta_72h: row.displacementSurfaceMm_delta_72h,
        displacementLabel: row.displacementLabel,
        reservoirLevelM: row.reservoirLevelM,
        reservoirLevelM_delta_24h: row.reservoirLevelM_delta_24h,
        reservoirLevelM_delta_72h: row.reservoirLevelM_delta_72h,
        rainfallCurrentMm: row.rainfallCurrentMm,
        rainfallCurrentMm_sum_24h: row.rainfallCurrentMm_sum_24h,
        rainfallCurrentMm_sum_72h: row.rainfallCurrentMm_sum_72h,
        sampleId: row.sampleId,
        raw_point_id: row.raw_point_id,
        raw_cumulative_displacement_mm: row.raw_cumulative_displacement_mm,
        raw_daily_rainfall_mm: row.raw_daily_rainfall_mm,
        raw_water_level_m: row.raw_water_level_m,
        tsMs: row.tsMs,
        dayIndex: index + 1
      });
    });
  }
  return { itemRows, evidenceRows, missing, mismatches };
}

function renderCards(itemRows, evidenceRows) {
  const byItem = new Map();
  for (const row of evidenceRows) {
    if (!byItem.has(row.reviewItemId)) byItem.set(row.reviewItemId, []);
    byItem.get(row.reviewItemId).push(row);
  }
  const lines = ["# Baijiabao Batch-1 Evidence Cards", "", "Use `reviewItemId` as the stable manual-review key.", ""];
  for (const item of itemRows) {
    const rows = byItem.get(item.reviewItemId) ?? [];
    lines.push(`## ${item.batchPriority}. ${item.reviewItemId}`);
    lines.push("");
    lines.push(`- point: \`${item.pointId}\``);
    lines.push(`- range: \`${item.startTs}\` to \`${item.endTs}\``);
    lines.push(`- utility: \`${item.utilityClass}\``);
    lines.push(`- evidence rows: \`${item.evidenceRowCount}\`, mix: \`${item.classificationMix}\``);
    lines.push("");
    lines.push("| day | raw date | class | disp | d24 | d72 | reservoir | rain | rain72 | booster | next+days |");
    lines.push("|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---:|");
    for (const row of rows.slice(0, 12)) {
      lines.push(
        `| ${row.dayIndex} | ${row.raw_obs_time} | ${row.classification} | ${row.displacementSurfaceMm} | ${row.displacementSurfaceMm_delta_24h} | ${row.displacementSurfaceMm_delta_72h} | ${row.reservoirLevelM} | ${row.rainfallCurrentMm} | ${row.rainfallCurrentMm_sum_72h} | ${toFixed(toNumber(row.boosterScore))} | ${row.daysToNextEpisode} |`
      );
    }
    if (rows.length > 12) lines.push(`| ... | ${rows.length - 12} more rows | | | | | | | | | |`);
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

function renderReport(report) {
  const s = report.summary;
  return `# Baijiabao Batch-1 Evidence Pack

Generated at: ${report.generatedAt}

## Summary

- batch items: \`${s.batchItems}\`
- evidence rows: \`${s.evidenceRows}\`
- missing evidence items: \`${s.missingEvidenceItems}\`
- row count mismatches: \`${s.rowCountMismatches}\`
- grey-zone days: \`${s.greyZoneDays}\`
- within-30d days: \`${s.within30Days}\`
- isolated days: \`${s.isolatedDays}\`
- immediate positive days: \`${s.immediatePositiveDays}\`

## Runtime Boundary

Offline human-review evidence only. Do not add to runtime registry, worker routing, top-level risk output, or PostgreSQL schema.
`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = process.cwd();
  const batchCsv = path.resolve(repoRoot, args.batchCsv);
  const proximityCsv = path.resolve(repoRoot, args.proximityCsv);
  const runsCsv = path.resolve(repoRoot, args.runsCsv);
  const outDir = path.resolve(repoRoot, args.outDir);
  const batchRows = await readCsv(batchCsv);
  const proximityRows = await readCsv(proximityCsv);
  const runRows = await readCsv(runsCsv);
  const { itemRows, evidenceRows, missing, mismatches } = buildEvidence(batchRows, proximityRows, runRows);
  const report = {
    generatedAt: new Date().toISOString(),
    sourcePaths: { batchCsv, proximityCsv, runsCsv },
    batchIdentity: {
      batchName: "baijiabao-seasonal-review-batch-1",
      batchNumber: 1,
      batchItems: batchRows.length,
      reviewItemIds: batchRows.map((row) => row.reviewItemId)
    },
    runtimeBoundary: {
      runtimeRegistryEligible: false,
      promotionEligible: false,
      runtimeUseForbidden: true
    },
    summary: {
      batchItems: batchRows.length,
      evidenceRows: evidenceRows.length,
      missingEvidenceItems: missing.length,
      rowCountMismatches: mismatches.length,
      immediatePositiveDays: evidenceRows.filter((row) => row.classification === "immediate-positive").length,
      greyZoneDays: evidenceRows.filter((row) => row.classification === "grey-zone-pre-episode").length,
      within30Days: evidenceRows.filter((row) => row.classification === "hard-negative-within-30d-next-positive").length,
      isolatedDays: evidenceRows.filter((row) => row.classification === "hard-negative-no-positive-within-30d").length,
      byUtilityClass: countBy(itemRows, (row) => row.utilityClass || "unknown"),
      byPoint: countBy(itemRows, (row) => row.pointId || "unknown"),
      bySeasonSet: countBy(itemRows, (row) => row.seasonSet || "unknown"),
      byDailyClassification: countBy(evidenceRows, (row) => row.classification || "unknown")
    },
    items: itemRows,
    missingEvidence: missing,
    rowCountMismatches: mismatches,
    decision:
      missing.length === 0 && mismatches.length === 0
        ? "Batch-1 evidence pack is complete for manual review."
        : "Evidence pack has missing or mismatched rows; inspect before review."
  };
  await writeJson(path.join(outDir, "baijiabao-seasonal-review-queue-batch-1-evidence-pack.json"), {
    ...report,
    evidenceRows
  });
  await writeJson(path.join(outDir, "baijiabao-seasonal-review-queue-batch-1-evidence-pack.report.json"), report);
  await writeText(path.join(outDir, "baijiabao-seasonal-review-queue-batch-1-evidence-pack.report.md"), renderReport(report));
  await writeText(path.join(outDir, "batch-1-evidence-items.csv"), toCsv(itemRows));
  await writeText(path.join(outDir, "batch-1-evidence-rows.csv"), toCsv(evidenceRows));
  await writeText(path.join(outDir, "batch-1-evidence-missing.csv"), toCsv(missing.concat(mismatches)));
  await writeText(path.join(outDir, "batch-1-evidence-cards.md"), renderCards(itemRows, evidenceRows));
  console.log(
    JSON.stringify(
      {
        outDir,
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
