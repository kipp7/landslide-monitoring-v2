import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const DEFAULT_BATCH_CSV =
  ".tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-annotation-batch-1/seasonal-review-queue-annotation-batch-1.csv";
const DEFAULT_ITEMS_CSV =
  ".tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-batch-1-evidence-pack/batch-1-evidence-items.csv";
const DEFAULT_ROWS_CSV =
  ".tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-batch-1-evidence-pack/batch-1-evidence-rows.csv";
const DEFAULT_OUT_DIR = ".tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-batch-1-suggested-labels";

function parseArgs(argv) {
  const parsed = {
    batchCsv: DEFAULT_BATCH_CSV,
    itemsCsv: DEFAULT_ITEMS_CSV,
    rowsCsv: DEFAULT_ROWS_CSV,
    outDir: DEFAULT_OUT_DIR
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--batch-csv") parsed.batchCsv = argv[++index] ?? parsed.batchCsv;
    if (token === "--items-csv") parsed.itemsCsv = argv[++index] ?? parsed.itemsCsv;
    if (token === "--rows-csv") parsed.rowsCsv = argv[++index] ?? parsed.rowsCsv;
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

function groupBy(rows, keyFn) {
  const map = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return map;
}

function maxNumber(rows, key) {
  const values = rows.map((row) => toNumber(row[key])).filter((value) => value !== null);
  return values.length > 0 ? Math.max(...values) : null;
}

function minNumber(rows, key) {
  const values = rows.map((row) => toNumber(row[key])).filter((value) => value !== null);
  return values.length > 0 ? Math.min(...values) : null;
}

function absoluteMax(rows, key) {
  const values = rows.map((row) => toNumber(row[key])).filter((value) => value !== null);
  return values.length > 0 ? Math.max(...values.map((value) => Math.abs(value))) : null;
}

function classifySuggestion(item, evidenceRows) {
  const rowCount = Math.max(1, evidenceRows.length);
  const immediate = evidenceRows.filter((row) => row.classification === "immediate-positive").length;
  const grey = evidenceRows.filter((row) => row.classification === "grey-zone-pre-episode").length;
  const within30 = evidenceRows.filter((row) => row.classification === "hard-negative-within-30d-next-positive").length;
  const isolated = evidenceRows.filter((row) => row.classification === "hard-negative-no-positive-within-30d").length;
  const usefulRatio = (immediate + grey + within30) / rowCount;
  const greyRatio = grey / rowCount;
  const isolatedRatio = isolated / rowCount;
  const conservativeHitDays = evidenceRows.filter((row) => row.conservativeHit === "true" || row.conservativeHit === true).length;
  const minDisplacementDelta24h = minNumber(evidenceRows, "displacementSurfaceMm_delta_24h");
  const minDisplacementDelta72h = minNumber(evidenceRows, "displacementSurfaceMm_delta_72h");
  const maxAbsDisp24h = absoluteMax(evidenceRows, "displacementSurfaceMm_delta_24h");
  const maxAbsDisp72h = absoluteMax(evidenceRows, "displacementSurfaceMm_delta_72h");
  const maxAbsDispLabel = absoluteMax(evidenceRows, "displacementLabel");
  const maxBoosterScore = maxNumber(evidenceRows, "boosterScore");
  const maxRain72h = maxNumber(evidenceRows, "rainfallCurrentMm_sum_72h");
  const maxReservoirDelta72hAbs = absoluteMax(evidenceRows, "reservoirLevelM_delta_72h");
  const displacementTrigger =
    (maxAbsDisp24h ?? 0) >= 2 || (maxAbsDisp72h ?? 0) >= 3 || (maxAbsDispLabel ?? 0) >= 1.3;
  const rainfallTrigger = (maxRain72h ?? 0) >= 20;
  const reservoirTrigger = (maxReservoirDelta72hAbs ?? 0) >= 0.8;
  const evidenceFamilyCount =
    (immediate > 0 || grey > 0 || within30 > 0 ? 1 : 0) +
    (displacementTrigger ? 1 : 0) +
    (rainfallTrigger || reservoirTrigger ? 1 : 0) +
    (conservativeHitDays > 0 || (maxBoosterScore ?? 0) >= 0.53 ? 1 : 0);
  const triggerContext = [rainfallTrigger ? "rainfall" : "", reservoirTrigger ? "reservoir" : ""]
    .filter(Boolean)
    .join("+") || (displacementTrigger ? "displacement_only" : "weak");
  const reasons = [
    `utility=${item.utilityClass}`,
    `n=${rowCount}`,
    `usefulRatio=${usefulRatio.toFixed(3)}`,
    `grey=${grey}`,
    `within30=${within30}`,
    `isolated=${isolated}`,
    `conservativeHitDays=${conservativeHitDays}`,
    `maxBooster=${maxBoosterScore ?? "n/a"}`,
    `minD24=${minDisplacementDelta24h ?? "n/a"}`,
    `maxAbsD24=${maxAbsDisp24h ?? "n/a"}`,
    `maxAbsD72=${maxAbsDisp72h ?? "n/a"}`,
    `maxAbsDispLabel=${maxAbsDispLabel ?? "n/a"}`,
    `rain72max=${maxRain72h ?? "n/a"}`,
    `reservoirD72abs=${maxReservoirDelta72hAbs ?? "n/a"}`,
    "primaryHit=0-so-human-review-only"
  ];
  if (immediate > 0 && usefulRatio >= 0.75 && evidenceFamilyCount >= 3) {
    const confidence = evidenceFamilyCount >= 4 && conservativeHitDays > 0 ? "high" : "medium";
    return suggestion("true_pre_signal", "yes", confidence, triggerContext, reasons, {
      displacementTrigger,
      rainfallTrigger,
      reservoirTrigger
    });
  }
  if (immediate > 0 && usefulRatio >= 0.5) {
    return suggestion("process_related", "yes", "medium", triggerContext, reasons, {
      displacementTrigger,
      rainfallTrigger,
      reservoirTrigger
    });
  }
  if (immediate === 0 && greyRatio >= 0.5 && (displacementTrigger || rainfallTrigger || reservoirTrigger)) {
    const finalClass = evidenceFamilyCount >= 3 ? "process_related" : "label_boundary_artifact";
    const confidence = evidenceFamilyCount >= 3 ? "medium" : "low";
    return suggestion(finalClass, "yes", confidence, triggerContext, reasons, {
      displacementTrigger,
      rainfallTrigger,
      reservoirTrigger
    });
  }
  if (immediate === 0 && within30 > 0 && usefulRatio >= 0.4) {
    const finalClass = displacementTrigger || rainfallTrigger || reservoirTrigger ? "process_related" : "label_boundary_artifact";
    return suggestion(finalClass, "yes", "medium", triggerContext, reasons, {
      displacementTrigger,
      rainfallTrigger,
      reservoirTrigger
    });
  }
  if (isolatedRatio >= 0.7 && grey === 0 && within30 === 0 && immediate === 0) {
    const confidence = isolatedRatio >= 0.9 && !displacementTrigger && !rainfallTrigger && !reservoirTrigger ? "medium" : "low";
    return suggestion("expected_noise", "no", confidence, triggerContext, reasons, {
      displacementTrigger,
      rainfallTrigger,
      reservoirTrigger
    });
  }
  if (item.utilityClass === "isolated-background-alert-run" && isolatedRatio >= 0.5) {
    return suggestion("expected_noise", "no", "low", triggerContext, reasons, {
      displacementTrigger,
      rainfallTrigger,
      reservoirTrigger
    });
  }
  return suggestion("unclear", "unsure", "low", triggerContext, reasons, {
    displacementTrigger,
    rainfallTrigger,
    reservoirTrigger
  });
}

function suggestion(finalClass, useful, confidence, triggerContext, reasons, signals = {}) {
  return {
    suggestedFinalClass: finalClass,
    suggestedUseful: useful,
    suggestedConfidence: confidence,
    suggestedTriggerContext: triggerContext,
    suggestedDisplacementEvidence: signals.displacementTrigger ? "yes" : "unclear",
    suggestedTriggerEvidence: signals.rainfallTrigger || signals.reservoirTrigger ? "yes" : "unclear",
    suggestedInstrumentNoiseSuspected: finalClass === "expected_noise" ? "unclear" : "no",
    suggestedReason: reasons.join("; "),
    suggestionPolicyVersion: "baijiabao.batch1.suggested-labels.v1",
    requiresHumanOverride: "yes",
    reviewCaution: "machine suggestion only; do not copy into human fields without raw review",
    suggestedReviewStatus: "machine-suggested-human-required"
  };
}

function renderMarkdown(report) {
  const lines = [];
  lines.push("# Baijiabao Batch-1 Suggested Labels");
  lines.push("");
  lines.push(`Generated at: ${report.generatedAt}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- batch items: \`${report.summary.batchItems}\``);
  lines.push(`- useful suggestions: \`${report.summary.suggestedUsefulYes}\``);
  lines.push(`- no-use suggestions: \`${report.summary.suggestedUsefulNo}\``);
  lines.push(`- unsure suggestions: \`${report.summary.suggestedUsefulUnsure}\``);
  lines.push("");
  lines.push("## Suggested Classes");
  lines.push("");
  lines.push("| class | count |");
  lines.push("|---|---:|");
  for (const row of report.summary.bySuggestedClass) lines.push(`| ${row.key} | ${row.count} |`);
  lines.push("");
  lines.push("## Boundary");
  lines.push("");
  lines.push("Suggestions are not human labels. They must not be copied into `humanFinalClass` without review.");
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function renderCards(rows) {
  const lines = ["# Baijiabao Batch-1 Suggested Label Cards", "", "These are machine suggestions only.", ""];
  for (const row of rows) {
    lines.push(`## ${row.batchPriority}. ${row.reviewItemId}`);
    lines.push("");
    lines.push(`- suggestedFinalClass: \`${row.suggestedFinalClass}\``);
    lines.push(`- suggestedUseful: \`${row.suggestedUseful}\``);
    lines.push(`- suggestedConfidence: \`${row.suggestedConfidence}\``);
    lines.push(`- utilityClass: \`${row.utilityClass}\``);
    lines.push(`- evidenceRows: \`${row.evidenceRows}\``);
    lines.push(`- reason: ${row.suggestedReason}`);
    lines.push("- caution: machine suggestion only; human reviewer must fill human fields manually");
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = process.cwd();
  const batchCsv = path.resolve(repoRoot, args.batchCsv);
  const itemsCsv = path.resolve(repoRoot, args.itemsCsv);
  const rowsCsv = path.resolve(repoRoot, args.rowsCsv);
  const outDir = path.resolve(repoRoot, args.outDir);
  const batchRows = await readCsv(batchCsv);
  const itemRows = await readCsv(itemsCsv);
  const evidenceRows = await readCsv(rowsCsv);
  const itemById = new Map(itemRows.map((row) => [row.reviewItemId, row]));
  const rowsByItem = groupBy(evidenceRows, (row) => row.reviewItemId);
  const suggestedRows = batchRows.map((batchRow) => {
    const item = itemById.get(batchRow.reviewItemId) ?? batchRow;
    const rows = rowsByItem.get(batchRow.reviewItemId) ?? [];
    return {
      ...batchRow,
      ...classifySuggestion(item, rows),
      evidenceRows: rows.length
    };
  });
  const report = {
    generatedAt: new Date().toISOString(),
    sourcePaths: { batchCsv, itemsCsv, rowsCsv },
    ruleSet: {
      version: "baijiabao.batch1.suggested-labels.v1",
      note: "Conservative machine suggestions for prioritizing human review; not labels."
    },
    summary: {
      batchItems: suggestedRows.length,
      suggestedUsefulYes: suggestedRows.filter((row) => row.suggestedUseful === "yes").length,
      suggestedUsefulNo: suggestedRows.filter((row) => row.suggestedUseful === "no").length,
      suggestedUsefulUnsure: suggestedRows.filter((row) => row.suggestedUseful === "unsure").length,
      bySuggestedClass: countBy(suggestedRows, (row) => row.suggestedFinalClass),
      bySuggestedConfidence: countBy(suggestedRows, (row) => row.suggestedConfidence),
      byUtilityClass: countBy(suggestedRows, (row) => row.utilityClass || "unknown")
    },
    runtimeBoundary: {
      runtimeRegistryEligible: false,
      promotionEligible: false,
      runtimeUseForbidden: true
    },
    decision:
      "Use suggested labels only to prioritize manual review. Do not treat them as human annotation or runtime evidence."
  };
  const suggestedCsvPath = path.join(outDir, "batch-1-suggested-annotations.csv");
  const suggestedLabelsCsvPath = path.join(outDir, "batch-1-suggested-labels.csv");
  const fullJsonPath = path.join(outDir, "baijiabao-seasonal-review-queue-batch-1-suggested-labels.json");
  const reportJsonPath = path.join(outDir, "baijiabao-seasonal-review-queue-batch-1-suggested-labels.report.json");
  const reportMdPath = path.join(outDir, "baijiabao-seasonal-review-queue-batch-1-suggested-labels.report.md");
  const cardsPath = path.join(outDir, "batch-1-suggested-label-cards.md");
  await writeText(suggestedCsvPath, toCsv(suggestedRows));
  await writeText(suggestedLabelsCsvPath, toCsv(suggestedRows));
  await writeJson(fullJsonPath, { ...report, items: suggestedRows });
  await writeJson(reportJsonPath, report);
  await writeText(reportMdPath, renderMarkdown(report));
  await writeText(cardsPath, renderCards(suggestedRows));
  console.log(
    JSON.stringify(
      { suggestedLabelsCsvPath, fullJsonPath, reportJsonPath, reportMdPath, cardsPath, summary: report.summary },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
