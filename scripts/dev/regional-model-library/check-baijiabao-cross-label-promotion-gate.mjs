import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const DEFAULT_REVIEW_REPORT =
  ".tmp/regional-model-library/out/artifacts/baijiabao-grey-zone-training-review/baijiabao-grey-zone-training-review.report.json";
const DEFAULT_OUT_DIR = ".tmp/regional-model-library/out/artifacts/baijiabao-cross-label-promotion-gate";

const DEFAULT_THRESHOLDS = {
  greyZoneBalancedAccuracyMin: 0.62,
  greyZonePrecisionMin: 0.2,
  greyZoneRecallMin: 0.35,
  immediateBalancedAccuracyMin: 0.62,
  immediatePrecisionMin: 0.2,
  immediateRecallMin: 0.35,
  leadHitRateMin: 0.5,
  worstSeasonRecallMin: 0.2,
  worstPointRecallMin: 0.2,
  immediateFalsePositiveMax: 250,
  immediateFalsePositiveGrowthFromGreyZoneMax: 2.5,
  immediatePrecisionRetentionMin: 0.5,
  immediateBalancedAccuracyDropMax: 0.04
};

function parseArgs(argv) {
  const parsed = {
    reviewReport: DEFAULT_REVIEW_REPORT,
    outDir: DEFAULT_OUT_DIR,
    thresholds: { ...DEFAULT_THRESHOLDS }
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--review-report") parsed.reviewReport = argv[++index] ?? parsed.reviewReport;
    if (token === "--out-dir") parsed.outDir = argv[++index] ?? parsed.outDir;
    if (token.startsWith("--min-") || token.startsWith("--max-")) {
      const key = token
        .replace(/^--/u, "")
        .replace(/-([a-z])/gu, (_, char) => char.toUpperCase())
        .replace(/^min/u, "")
        .replace(/^max/u, "");
      const thresholdKey = `${key.charAt(0).toLowerCase()}${key.slice(1)}`;
      const nextValue = Number(argv[++index]);
      if (Object.hasOwn(parsed.thresholds, thresholdKey) && Number.isFinite(nextValue)) {
        parsed.thresholds[thresholdKey] = nextValue;
      }
    }
  }

  return parsed;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf-8"));
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

async function writeText(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, value, "utf-8");
}

function metric(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatMetric(value) {
  const normalized = metric(value);
  return normalized === null ? "" : normalized.toFixed(4);
}

function addFloorBlocker(blockers, label, value, floor) {
  const normalized = metric(value);
  if (normalized === null) {
    blockers.push(`${label} missing`);
    return;
  }
  if (normalized < floor) blockers.push(`${label} ${normalized.toFixed(4)} below ${floor.toFixed(4)}`);
}

function addCeilingBlocker(blockers, label, value, ceiling) {
  const normalized = metric(value);
  if (normalized === null) {
    blockers.push(`${label} missing`);
    return;
  }
  if (normalized > ceiling) blockers.push(`${label} ${normalized.toFixed(4)} above ${ceiling.toFixed(4)}`);
}

function rowIdentity(row) {
  return `${row.key ?? "unknown"}::${row.role ?? "unknown"}::${row.modelKey ?? "unknown"}::${
    row.thresholdMode ?? "unknown"
  }::${row.threshold ?? "unknown"}`;
}

function compactRead(row) {
  return {
    labelRead: row.labelRead,
    key: row.key,
    role: row.role,
    modelKey: row.modelKey,
    threshold: row.threshold,
    thresholdMode: row.thresholdMode,
    evaluatedCount: row.evaluatedCount,
    overall: {
      balancedAccuracy: metric(row.overall?.balancedAccuracy),
      precision: metric(row.overall?.precision),
      recall: metric(row.overall?.recall),
      specificity: metric(row.overall?.specificity),
      f1: metric(row.overall?.f1),
      tp: metric(row.overall?.tp),
      fp: metric(row.overall?.fp),
      tn: metric(row.overall?.tn),
      fn: metric(row.overall?.fn)
    },
    leadTime: {
      episodeCount: metric(row.leadTime?.episodeCount),
      hitRate: metric(row.leadTime?.hitRate),
      preAlertRate: metric(row.leadTime?.preAlertRate)
    },
    inheritedGate: row.gate ?? null
  };
}

function buildReviewWorkload(reviewReport) {
  const validation = reviewReport.labelPolicy?.validation ?? {};
  const sampleCount = validation.sampleCount ?? null;
  const excludedGreyZoneCount = validation.excludedGreyZoneCount ?? validation.boundaryClassCounts?.pre_episode_grey_zone ?? null;
  const hardNegativeCount = validation.hardNegativeCount ?? validation.boundaryClassCounts?.negative ?? null;
  const immediatePositiveCount = validation.immediatePositiveCount ?? validation.boundaryClassCounts?.positive ?? null;
  return {
    policyKey: reviewReport.labelPolicy?.policy?.policyKey ?? null,
    preEpisodeGreyZoneDays: reviewReport.labelPolicy?.policy?.preEpisodeGreyZoneDays ?? null,
    falsePositiveCostEligibleKey: reviewReport.labelPolicy?.policy?.falsePositiveCostEligibleKey ?? null,
    validationSampleCount: sampleCount,
    validationImmediatePositiveCount: immediatePositiveCount,
    validationHardNegativeCount: hardNegativeCount,
    validationExcludedGreyZoneCount: excludedGreyZoneCount,
    validationExcludedGreyZoneRatio:
      typeof sampleCount === "number" && sampleCount > 0 && typeof excludedGreyZoneCount === "number"
        ? excludedGreyZoneCount / sampleCount
        : null
  };
}

function evaluatePair(pair, thresholds) {
  const blockers = [];
  const grey = pair.greyZoneExcluded;
  const immediate = pair.immediateDerived;

  if (!grey) blockers.push("grey-zone-excluded label read missing");
  if (!immediate) blockers.push("immediate-derived label read missing");
  if (!grey || !immediate) {
    return {
      pass: false,
      status: "blocked",
      blockers,
      deltas: null,
      recommendation: "Do not promote. Cross-label evidence is incomplete."
    };
  }

  addFloorBlocker(blockers, "grey-zone BA", grey.overall.balancedAccuracy, thresholds.greyZoneBalancedAccuracyMin);
  addFloorBlocker(blockers, "grey-zone precision", grey.overall.precision, thresholds.greyZonePrecisionMin);
  addFloorBlocker(blockers, "grey-zone recall", grey.overall.recall, thresholds.greyZoneRecallMin);
  addFloorBlocker(blockers, "grey-zone lead hit rate", grey.leadTime.hitRate, thresholds.leadHitRateMin);
  addFloorBlocker(
    blockers,
    "grey-zone worst season recall",
    grey.inheritedGate?.worstSeasonRecall,
    thresholds.worstSeasonRecallMin
  );
  addFloorBlocker(
    blockers,
    "grey-zone worst point recall",
    grey.inheritedGate?.worstPointRecall,
    thresholds.worstPointRecallMin
  );

  addFloorBlocker(blockers, "immediate BA", immediate.overall.balancedAccuracy, thresholds.immediateBalancedAccuracyMin);
  addFloorBlocker(blockers, "immediate precision", immediate.overall.precision, thresholds.immediatePrecisionMin);
  addFloorBlocker(blockers, "immediate recall", immediate.overall.recall, thresholds.immediateRecallMin);
  addFloorBlocker(blockers, "immediate lead hit rate", immediate.leadTime.hitRate, thresholds.leadHitRateMin);
  addFloorBlocker(
    blockers,
    "immediate worst season recall",
    immediate.inheritedGate?.worstSeasonRecall,
    thresholds.worstSeasonRecallMin
  );
  addFloorBlocker(
    blockers,
    "immediate worst point recall",
    immediate.inheritedGate?.worstPointRecall,
    thresholds.worstPointRecallMin
  );
  addCeilingBlocker(blockers, "immediate FP", immediate.overall.fp, thresholds.immediateFalsePositiveMax);

  const fpGrowth =
    typeof immediate.overall.fp === "number" && typeof grey.overall.fp === "number" && grey.overall.fp > 0
      ? immediate.overall.fp / grey.overall.fp
      : null;
  const precisionRetention =
    typeof immediate.overall.precision === "number" && typeof grey.overall.precision === "number" && grey.overall.precision > 0
      ? immediate.overall.precision / grey.overall.precision
      : null;
  const balancedAccuracyDrop =
    typeof immediate.overall.balancedAccuracy === "number" && typeof grey.overall.balancedAccuracy === "number"
      ? grey.overall.balancedAccuracy - immediate.overall.balancedAccuracy
      : null;

  if (fpGrowth === null) blockers.push("immediate FP growth from grey-zone read missing");
  else if (fpGrowth > thresholds.immediateFalsePositiveGrowthFromGreyZoneMax) {
    blockers.push(
      `immediate FP growth ${fpGrowth.toFixed(4)} above ${thresholds.immediateFalsePositiveGrowthFromGreyZoneMax.toFixed(4)}`
    );
  }

  if (precisionRetention === null) blockers.push("immediate precision retention missing");
  else if (precisionRetention < thresholds.immediatePrecisionRetentionMin) {
    blockers.push(
      `immediate precision retention ${precisionRetention.toFixed(4)} below ${thresholds.immediatePrecisionRetentionMin.toFixed(
        4
      )}`
    );
  }

  if (balancedAccuracyDrop === null) blockers.push("BA drop from grey-zone to immediate read missing");
  else if (balancedAccuracyDrop > thresholds.immediateBalancedAccuracyDropMax) {
    blockers.push(
      `BA drop from grey-zone to immediate read ${balancedAccuracyDrop.toFixed(4)} above ${thresholds.immediateBalancedAccuracyDropMax.toFixed(
        4
      )}`
    );
  }

  return {
    pass: blockers.length === 0,
    status: blockers.length === 0 ? "promotion-gate-pass" : "blocked",
    blockers,
    deltas: {
      immediateMinusGreyZone: {
        balancedAccuracy:
          typeof immediate.overall.balancedAccuracy === "number" && typeof grey.overall.balancedAccuracy === "number"
            ? immediate.overall.balancedAccuracy - grey.overall.balancedAccuracy
            : null,
        precision:
          typeof immediate.overall.precision === "number" && typeof grey.overall.precision === "number"
            ? immediate.overall.precision - grey.overall.precision
            : null,
        recall:
          typeof immediate.overall.recall === "number" && typeof grey.overall.recall === "number"
            ? immediate.overall.recall - grey.overall.recall
            : null,
        falsePositives:
          typeof immediate.overall.fp === "number" && typeof grey.overall.fp === "number"
            ? immediate.overall.fp - grey.overall.fp
            : null,
        leadHitRate:
          typeof immediate.leadTime.hitRate === "number" && typeof grey.leadTime.hitRate === "number"
            ? immediate.leadTime.hitRate - grey.leadTime.hitRate
            : null
      },
      immediateFalsePositiveGrowthFromGreyZone: fpGrowth,
      immediatePrecisionRetention: precisionRetention,
      balancedAccuracyDrop
    },
    recommendation:
      blockers.length === 0
        ? "Eligible for controlled promotion rehearsal. Still require human review before formal runtime registry overwrite."
        : "Do not promote. Keep as offline candidate and do not write runtime registry."
  };
}

function buildCandidatePairs(reviewReport, thresholds) {
  const rows = (reviewReport.crossLabelRows ?? []).map(compactRead);
  const byIdentity = new Map();

  for (const row of rows) {
    const identity = rowIdentity(row);
    if (!byIdentity.has(identity)) {
      byIdentity.set(identity, {
        candidateId: identity,
        key: row.key,
        role: row.role,
        modelKey: row.modelKey,
        threshold: row.threshold,
        thresholdMode: row.thresholdMode,
        greyZoneExcluded: null,
        immediateDerived: null
      });
    }
    const pair = byIdentity.get(identity);
    if (row.labelRead === "grey-zone-excluded") pair.greyZoneExcluded = row;
    if (row.labelRead === "immediate-derived") pair.immediateDerived = row;
  }

  return Array.from(byIdentity.values()).map((pair) => ({
    ...pair,
    gate: evaluatePair(pair, thresholds)
  }));
}

function evaluateReviewWorkload(workload) {
  const blockers = [];
  if (!workload.policyKey) blockers.push("grey-zone policy key missing");
  if (!workload.falsePositiveCostEligibleKey) blockers.push("false-positive cost eligible key missing");
  if (typeof workload.validationExcludedGreyZoneCount !== "number") blockers.push("validation grey-zone count missing");
  if (typeof workload.validationExcludedGreyZoneRatio !== "number") blockers.push("validation grey-zone ratio missing");
  return {
    pass: blockers.length === 0,
    blockers,
    interpretation:
      blockers.length === 0
        ? "Grey-zone review workload is explicit and must be handled separately from hard false-positive cost."
        : "Grey-zone review workload is not explicit enough for promotion decisions."
  };
}

function renderMarkdown(report) {
  const lines = [];
  lines.push("# Baijiabao Cross-Label Promotion Gate");
  lines.push("");
  lines.push(`Generated at: ${report.generatedAt}`);
  lines.push("");
  lines.push("## Decision");
  lines.push("");
  lines.push(`- overall status: \`${report.decision.status}\``);
  lines.push(`- promotion candidates passed: \`${report.decision.passedCandidateCount}\``);
  lines.push(`- recommendation: ${report.decision.recommendation}`);
  lines.push("");
  lines.push("## Grey-Zone Workload");
  lines.push("");
  lines.push(`- policy: \`${report.reviewWorkload.policyKey ?? ""}\``);
  lines.push(`- validation grey-zone rows: \`${report.reviewWorkload.validationExcludedGreyZoneCount ?? ""}\``);
  lines.push(`- validation grey-zone ratio: \`${formatMetric(report.reviewWorkload.validationExcludedGreyZoneRatio)}\``);
  lines.push(`- workload gate: \`${report.reviewWorkloadGate.pass ? "pass" : "block"}\``);
  lines.push("");
  lines.push("## Candidate Gate");
  lines.push("");
  lines.push("| candidate | threshold mode | grey BA | grey P | grey R | grey FP | grey lead | imm BA | imm P | imm R | imm FP | imm lead | gate |");
  lines.push("|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|");
  for (const candidate of report.candidates) {
    const grey = candidate.greyZoneExcluded;
    const immediate = candidate.immediateDerived;
    lines.push(
      `| ${candidate.key} | ${candidate.thresholdMode ?? ""} | ${formatMetric(grey?.overall?.balancedAccuracy)} | ${formatMetric(
        grey?.overall?.precision
      )} | ${formatMetric(grey?.overall?.recall)} | ${grey?.overall?.fp ?? ""} | ${formatMetric(
        grey?.leadTime?.hitRate
      )} | ${formatMetric(immediate?.overall?.balancedAccuracy)} | ${formatMetric(immediate?.overall?.precision)} | ${formatMetric(
        immediate?.overall?.recall
      )} | ${immediate?.overall?.fp ?? ""} | ${formatMetric(immediate?.leadTime?.hitRate)} | ${
        candidate.gate.pass ? "pass" : "block"
      } |`
    );
  }
  lines.push("");
  lines.push("## Blockers");
  for (const candidate of report.candidates) {
    lines.push("");
    lines.push(`### ${candidate.key}`);
    if (candidate.gate.blockers.length === 0) {
      lines.push("- blocker: none");
    } else {
      for (const blocker of candidate.gate.blockers) lines.push(`- blocker: ${blocker}`);
    }
  }
  lines.push("");
  lines.push("## Thresholds");
  lines.push("");
  lines.push("```json");
  lines.push(JSON.stringify(report.thresholds, null, 2));
  lines.push("```");
  lines.push("");
  return `${lines.join("\n")}\n`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = process.cwd();
  const reviewReportPath = path.resolve(repoRoot, args.reviewReport);
  const outDir = path.resolve(repoRoot, args.outDir);
  const reviewReport = await readJson(reviewReportPath);
  const reviewWorkload = buildReviewWorkload(reviewReport);
  const reviewWorkloadGate = evaluateReviewWorkload(reviewWorkload);
  const candidates = buildCandidatePairs(reviewReport, args.thresholds);
  const passedCandidates = candidates.filter((candidate) => candidate.gate.pass);
  const report = {
    generatedAt: new Date().toISOString(),
    sourceReports: {
      reviewReport: reviewReportPath,
      ...reviewReport.sourceReports
    },
    thresholds: args.thresholds,
    reviewWorkload,
    reviewWorkloadGate,
    candidates,
    decision: {
      status: reviewWorkloadGate.pass && passedCandidates.length > 0 ? "promotion-rehearsal-eligible" : "blocked",
      passedCandidateCount: passedCandidates.length,
      passedCandidateKeys: passedCandidates.map((candidate) => candidate.key),
      recommendation:
        reviewWorkloadGate.pass && passedCandidates.length > 0
          ? "At least one candidate passes cross-label gate; run a controlled promotion rehearsal before runtime registry changes."
          : "No grey-zone trained candidate passes cross-label promotion gate. Do not write runtime registry."
    }
  };

  const jsonPath = path.join(outDir, "baijiabao-cross-label-promotion-gate.report.json");
  const mdPath = path.join(outDir, "baijiabao-cross-label-promotion-gate.report.md");
  await writeJson(jsonPath, report);
  await writeText(mdPath, renderMarkdown(report));

  console.log(
    JSON.stringify(
      {
        reportPath: jsonPath,
        markdownPath: mdPath,
        decision: report.decision,
        reviewWorkload: report.reviewWorkload,
        candidates: report.candidates.map((candidate) => ({
          key: candidate.key,
          thresholdMode: candidate.thresholdMode,
          greyZone: {
            balancedAccuracy: candidate.greyZoneExcluded?.overall?.balancedAccuracy ?? null,
            precision: candidate.greyZoneExcluded?.overall?.precision ?? null,
            recall: candidate.greyZoneExcluded?.overall?.recall ?? null,
            fp: candidate.greyZoneExcluded?.overall?.fp ?? null,
            leadHitRate: candidate.greyZoneExcluded?.leadTime?.hitRate ?? null
          },
          immediate: {
            balancedAccuracy: candidate.immediateDerived?.overall?.balancedAccuracy ?? null,
            precision: candidate.immediateDerived?.overall?.precision ?? null,
            recall: candidate.immediateDerived?.overall?.recall ?? null,
            fp: candidate.immediateDerived?.overall?.fp ?? null,
            leadHitRate: candidate.immediateDerived?.leadTime?.hitRate ?? null
          },
          gate: candidate.gate
        }))
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
