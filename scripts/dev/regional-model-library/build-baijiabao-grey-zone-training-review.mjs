import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const DEFAULT_LABEL_POLICY_REPORT =
  ".tmp/regional-model-library/out/artifacts/baijiabao-episode-grey-zone-label-policy/baijiabao-episode-grey-zone-label-policy.report.json";
const DEFAULT_GRID_REPORT =
  ".tmp/regional-model-library/out/artifacts/baijiabao-monitoring-challenger-grid-grey-zone-label/challenger-grid.report.json";
const DEFAULT_GREY_ZONE_STABILITY =
  ".tmp/regional-model-library/out/artifacts/baijiabao-grey-zone-label-stability/baijiabao-challenger-stability.report.json";
const DEFAULT_ORIGINAL_LABEL_STABILITY =
  ".tmp/regional-model-library/out/artifacts/baijiabao-grey-zone-label-original-label-stability/baijiabao-challenger-stability.report.json";
const DEFAULT_OUT_DIR = ".tmp/regional-model-library/out/artifacts/baijiabao-grey-zone-training-review";

function parseArgs(argv) {
  const parsed = {
    labelPolicyReport: DEFAULT_LABEL_POLICY_REPORT,
    gridReport: DEFAULT_GRID_REPORT,
    greyZoneStability: DEFAULT_GREY_ZONE_STABILITY,
    originalLabelStability: DEFAULT_ORIGINAL_LABEL_STABILITY,
    outDir: DEFAULT_OUT_DIR
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--label-policy-report") parsed.labelPolicyReport = argv[++index] ?? parsed.labelPolicyReport;
    if (token === "--grid-report") parsed.gridReport = argv[++index] ?? parsed.gridReport;
    if (token === "--grey-zone-stability") parsed.greyZoneStability = argv[++index] ?? parsed.greyZoneStability;
    if (token === "--original-label-stability") {
      parsed.originalLabelStability = argv[++index] ?? parsed.originalLabelStability;
    }
    if (token === "--out-dir") parsed.outDir = argv[++index] ?? parsed.outDir;
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

function compactModel(model) {
  if (!model) return null;
  return {
    key: model.key,
    role: model.role,
    modelKey: model.modelKey,
    threshold: model.threshold,
    thresholdMode: model.thresholdMode,
    evaluatedCount: model.evaluatedCount,
    overall: model.overall,
    leadTime: {
      episodeCount: model.leadTime?.episodeCount ?? null,
      hitRate: model.leadTime?.hitRate ?? null,
      preAlertRate: model.leadTime?.preAlertRate ?? null
    },
    gate: model.gate
  };
}

function findModel(report, key) {
  return (report.models ?? []).find((model) => model.key === key) ?? null;
}

function renderMetric(value) {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(4) : "";
}

function renderMarkdown(report) {
  const lines = [];
  lines.push("# Baijiabao Grey-Zone Training Review");
  lines.push("");
  lines.push(`Generated at: ${report.generatedAt}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- train grey-zone excluded: \`${report.labelPolicy.train.excludedGreyZoneCount}\``);
  lines.push(`- validation grey-zone excluded: \`${report.labelPolicy.validation.excludedGreyZoneCount}\``);
  lines.push(`- best grid model: \`${report.grid.bestEligible.modelKey}\``);
  lines.push(`- best grid threshold: \`${report.grid.bestEligible.threshold}\``);
  lines.push("");
  lines.push("## Cross-Label Stability");
  lines.push("");
  lines.push("| model | validation label read | BA | precision | recall | FP | FN | lead hit | gate |");
  lines.push("|---|---|---:|---:|---:|---:|---:|---:|---|");
  for (const row of report.crossLabelRows) {
    lines.push(
      `| ${row.modelKey} | ${row.labelRead} | ${renderMetric(row.overall?.balancedAccuracy)} | ${renderMetric(
        row.overall?.precision
      )} | ${renderMetric(row.overall?.recall)} | ${row.overall?.fp ?? ""} | ${row.overall?.fn ?? ""} | ${renderMetric(
        row.leadTime?.hitRate
      )} | ${row.gate?.pass ? "pass" : "block"} |`
    );
  }
  lines.push("");
  lines.push("## Decision");
  lines.push("");
  lines.push(report.decision);
  lines.push("");
  return `${lines.join("\n")}\n`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = process.cwd();
  const labelPolicy = await readJson(path.resolve(repoRoot, args.labelPolicyReport));
  const grid = await readJson(path.resolve(repoRoot, args.gridReport));
  const greyZoneStability = await readJson(path.resolve(repoRoot, args.greyZoneStability));
  const originalLabelStability = await readJson(path.resolve(repoRoot, args.originalLabelStability));
  const greyZoneF1OnGreyZone = compactModel(findModel(greyZoneStability, "greyZoneF1"));
  const greyZoneBalancedOnGreyZone = compactModel(findModel(greyZoneStability, "greyZoneBalanced"));
  const greyZoneF1OnOriginal = compactModel(findModel(originalLabelStability, "greyZoneF1"));
  const greyZoneBalancedOnOriginal = compactModel(findModel(originalLabelStability, "greyZoneBalanced"));
  const report = {
    generatedAt: new Date().toISOString(),
    sourceReports: {
      labelPolicyReport: path.resolve(repoRoot, args.labelPolicyReport),
      gridReport: path.resolve(repoRoot, args.gridReport),
      greyZoneStability: path.resolve(repoRoot, args.greyZoneStability),
      originalLabelStability: path.resolve(repoRoot, args.originalLabelStability)
    },
    labelPolicy: {
      policy: labelPolicy.policy,
      train: labelPolicy.splits.find((split) => split.splitName === "train"),
      validation: labelPolicy.splits.find((split) => split.splitName === "validation")
    },
    grid: {
      candidateCount: grid.candidateCount,
      leaderboardRows: grid.leaderboardRows,
      bestEligible: grid.bestEligible,
      bestEligibleByBalancedAccuracy: grid.bestEligibleByBalancedAccuracy
    },
    stability: {
      greyZoneLabelRead: {
        sampleSummary: greyZoneStability.sampleSummary,
        greyZoneF1: greyZoneF1OnGreyZone,
        greyZoneBalanced: greyZoneBalancedOnGreyZone
      },
      originalImmediateLabelRead: {
        sampleSummary: originalLabelStability.sampleSummary,
        greyZoneF1: greyZoneF1OnOriginal,
        greyZoneBalanced: greyZoneBalancedOnOriginal
      }
    },
    crossLabelRows: [
      { labelRead: "grey-zone-excluded", ...greyZoneF1OnGreyZone },
      { labelRead: "immediate-derived", ...greyZoneF1OnOriginal },
      { labelRead: "grey-zone-excluded", ...greyZoneBalancedOnGreyZone },
      { labelRead: "immediate-derived", ...greyZoneBalancedOnOriginal }
    ],
    decision:
      "Grey-zone label training is useful as a controlled offline experiment, but not runtime-ready. The balanced model passes the old gate only under the grey-zone-excluded validation read; under the original immediate derived labels it falls to low precision and remains blocked."
  };
  const outDir = path.resolve(repoRoot, args.outDir);
  const reportPath = path.join(outDir, "baijiabao-grey-zone-training-review.report.json");
  const mdPath = path.join(outDir, "baijiabao-grey-zone-training-review.report.md");
  await writeJson(reportPath, report);
  await writeText(mdPath, renderMarkdown(report));
  console.log(
    JSON.stringify(
      {
        reportPath,
        markdownPath: mdPath,
        labelPolicy: {
          train: report.labelPolicy.train,
          validation: report.labelPolicy.validation
        },
        bestEligible: report.grid.bestEligible,
        greyZoneF1OnGreyZone,
        greyZoneF1OnOriginal,
        greyZoneBalancedOnGreyZone,
        greyZoneBalancedOnOriginal,
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
