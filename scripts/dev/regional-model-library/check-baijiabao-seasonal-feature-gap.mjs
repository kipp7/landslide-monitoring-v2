import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const DEFAULT_TRAIN_SAMPLES =
  ".tmp/regional-model-library/out/threegorges-baijiabao/splits/labeled/baijiabao.train.future-labels.window-features.jsonl";
const DEFAULT_VALIDATION_SAMPLES =
  ".tmp/regional-model-library/out/threegorges-baijiabao/splits/labeled/baijiabao.validation.future-labels.window-features.jsonl";
const DEFAULT_PRIMARY_REGISTRY =
  ".tmp/regional-model-library/out/artifacts/baijiabao-monitoring-challenger-grid/best-balanced-accuracy.registry.json";
const DEFAULT_OUT_DIR = ".tmp/regional-model-library/out/artifacts/baijiabao-seasonal-feature-gap";
const SEASONS = ["spring", "summer", "autumn", "winter"];

function parseArgs(argv) {
  const parsed = {
    trainSamples: DEFAULT_TRAIN_SAMPLES,
    validationSamples: DEFAULT_VALIDATION_SAMPLES,
    primaryRegistry: DEFAULT_PRIMARY_REGISTRY,
    outDir: DEFAULT_OUT_DIR,
    labelKey: "warningHitLabel"
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--train-samples") parsed.trainSamples = argv[++index] ?? parsed.trainSamples;
    if (token === "--validation-samples") parsed.validationSamples = argv[++index] ?? parsed.validationSamples;
    if (token === "--primary-registry") parsed.primaryRegistry = argv[++index] ?? parsed.primaryRegistry;
    if (token === "--out-dir") parsed.outDir = argv[++index] ?? parsed.outDir;
    if (token === "--label-key") parsed.labelKey = argv[++index] ?? parsed.labelKey;
  }
  return parsed;
}

async function readJsonLines(filePath) {
  const content = await readFile(filePath, "utf-8");
  return content
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

async function readFirstArtifact(filePath) {
  const parsed = JSON.parse(await readFile(filePath, "utf-8"));
  const artifact = Array.isArray(parsed.artifacts) ? parsed.artifacts[0] : null;
  if (!artifact) throw new Error(`No artifact found in ${filePath}`);
  return artifact;
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

async function writeText(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, value, "utf-8");
}

function toBinaryLabel(value) {
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "number") {
    if (value === 0) return 0;
    if (value === 1) return 1;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes"].includes(normalized)) return 1;
    if (["0", "false", "no"].includes(normalized)) return 0;
  }
  return null;
}

function season(ts) {
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return "unknown";
  const month = date.getUTCMonth() + 1;
  if ([3, 4, 5].includes(month)) return "spring";
  if ([6, 7, 8].includes(month)) return "summer";
  if ([9, 10, 11].includes(month)) return "autumn";
  return "winter";
}

function rowsFromSamples(samples, labelKey) {
  return samples
    .map((sample) => {
      const label = toBinaryLabel(sample.labels?.[labelKey]);
      if (label === null) return null;
      return {
        sampleId: sample.sampleId ?? null,
        eventTs: sample.eventTs,
        season: season(sample.eventTs),
        label,
        values: sample.metricsNormalized ?? {}
      };
    })
    .filter(Boolean);
}

function collectFeatureKeys(rows) {
  return Array.from(
    new Set(
      rows.flatMap((row) =>
        Object.entries(row.values)
          .filter(([, value]) => typeof value === "number" && Number.isFinite(value))
          .map(([key]) => key)
      )
    )
  )
    .filter((key) => !key.startsWith("crackDisplacementMm"))
    .sort();
}

function auc(points) {
  const valid = points.filter((point) => typeof point.x === "number" && Number.isFinite(point.x));
  const positiveCount = valid.filter((point) => point.y === 1).length;
  const negativeCount = valid.length - positiveCount;
  if (positiveCount === 0 || negativeCount === 0) return null;
  const sorted = valid.slice().sort((left, right) => left.x - right.x);
  let rankSum = 0;
  let index = 0;
  while (index < sorted.length) {
    let next = index + 1;
    while (next < sorted.length && sorted[next].x === sorted[index].x) next += 1;
    const averageRank = (index + 1 + next) / 2;
    for (let tie = index; tie < next; tie += 1) {
      if (sorted[tie].y === 1) rankSum += averageRank;
    }
    index = next;
  }
  return (rankSum - (positiveCount * (positiveCount + 1)) / 2) / (positiveCount * negativeCount);
}

function quantile(values, ratio) {
  const sorted = values.filter((value) => typeof value === "number" && Number.isFinite(value)).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const position = (sorted.length - 1) * ratio;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

function summary(values) {
  const valid = values.filter((value) => typeof value === "number" && Number.isFinite(value));
  return {
    count: valid.length,
    min: valid.length > 0 ? Math.min(...valid) : null,
    p25: quantile(valid, 0.25),
    p50: quantile(valid, 0.5),
    p75: quantile(valid, 0.75),
    max: valid.length > 0 ? Math.max(...valid) : null
  };
}

function featureDiagnostics(rows, featureKeys, primaryRequiredSet) {
  const bySeason = {};
  for (const seasonKey of SEASONS) {
    const seasonRows = rows.filter((row) => row.season === seasonKey);
    const ranked = featureKeys
      .map((featureKey) => {
        const signedAuc = auc(seasonRows.map((row) => ({ x: row.values[featureKey], y: row.label })));
        if (signedAuc === null) return null;
        const positiveValues = seasonRows
          .filter((row) => row.label === 1)
          .map((row) => row.values[featureKey]);
        const negativeValues = seasonRows
          .filter((row) => row.label === 0)
          .map((row) => row.values[featureKey]);
        return {
          featureKey,
          inPrimaryModel: primaryRequiredSet.has(featureKey),
          signedAuc,
          separabilityAuc: Math.max(signedAuc, 1 - signedAuc),
          direction: signedAuc >= 0.5 ? "higher-positive" : "lower-positive",
          positive: summary(positiveValues),
          negative: summary(negativeValues)
        };
      })
      .filter(Boolean)
      .sort((left, right) => right.separabilityAuc - left.separabilityAuc);
    bySeason[seasonKey] = {
      count: seasonRows.length,
      positiveCount: seasonRows.filter((row) => row.label === 1).length,
      topAllFeatures: ranked.slice(0, 20),
      topPrimaryFeatures: ranked.filter((entry) => entry.inPrimaryModel).slice(0, 20),
      topExcludedFeatures: ranked.filter((entry) => !entry.inPrimaryModel).slice(0, 20)
    };
  }
  return bySeason;
}

function renderMarkdown(report) {
  const lines = [];
  lines.push("# Baijiabao Seasonal Feature Gap");
  lines.push("");
  lines.push(`Generated at: ${report.generatedAt}`);
  lines.push("");
  lines.push(`Primary model: ${report.primaryModel.modelKey}`);
  lines.push("");
  for (const seasonKey of SEASONS) {
    const seasonReport = report.validation.bySeason[seasonKey];
    lines.push(`## ${seasonKey}`);
    lines.push("");
    lines.push(`- rows: ${seasonReport.count}`);
    lines.push(`- positives: ${seasonReport.positiveCount}`);
    lines.push("");
    lines.push("### Top All Features");
    lines.push("| feature | in primary | AUC | direction | pos p50 | neg p50 |");
    lines.push("|---|---|---:|---|---:|---:|");
    for (const feature of seasonReport.topAllFeatures.slice(0, 8)) {
      lines.push(
        `| ${feature.featureKey} | ${feature.inPrimaryModel ? "yes" : "no"} | ${feature.separabilityAuc.toFixed(
          4
        )} | ${feature.direction} | ${String(feature.positive.p50)} | ${String(feature.negative.p50)} |`
      );
    }
    lines.push("");
  }
  lines.push("## Interpretation");
  lines.push("");
  lines.push(report.interpretation);
  lines.push("");
  return `${lines.join("\n")}\n`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = process.cwd();
  const trainPath = path.resolve(repoRoot, args.trainSamples);
  const validationPath = path.resolve(repoRoot, args.validationSamples);
  const primaryRegistryPath = path.resolve(repoRoot, args.primaryRegistry);
  const outDir = path.resolve(repoRoot, args.outDir);
  const primaryArtifact = await readFirstArtifact(primaryRegistryPath);
  const primaryRequiredSet = new Set(primaryArtifact.requiredFeatureKeys ?? []);
  const trainRows = rowsFromSamples(await readJsonLines(trainPath), args.labelKey);
  const validationRows = rowsFromSamples(await readJsonLines(validationPath), args.labelKey);
  const featureKeys = collectFeatureKeys([...trainRows, ...validationRows]);
  const report = {
    generatedAt: new Date().toISOString(),
    trainSamplesPath: trainPath,
    validationSamplesPath: validationPath,
    primaryRegistryPath,
    labelKey: args.labelKey,
    primaryModel: {
      modelKey: primaryArtifact.modelKey,
      modelVersion: primaryArtifact.modelVersion ?? null,
      requiredFeatureCount: primaryRequiredSet.size,
      requiredFeatureKeys: Array.from(primaryRequiredSet).sort()
    },
    train: {
      rowCount: trainRows.length,
      positiveCount: trainRows.filter((row) => row.label === 1).length,
      bySeason: featureDiagnostics(trainRows, featureKeys, primaryRequiredSet)
    },
    validation: {
      rowCount: validationRows.length,
      positiveCount: validationRows.filter((row) => row.label === 1).length,
      bySeason: featureDiagnostics(validationRows, featureKeys, primaryRequiredSet)
    },
    interpretation:
      "Autumn and winter failures are not solved by a simple threshold. Validation winter's strongest available signals include displacement delta features that are excluded from the current rainfall-reservoir primary challenger; autumn is dominated by reservoir delta direction and has heavy score overlap. The next useful experiment is a seasonal/trigger-aware challenger that can use displacement delta evidence selectively, not a runtime threshold patch."
  };

  const jsonPath = path.join(outDir, "baijiabao-seasonal-feature-gap.report.json");
  const mdPath = path.join(outDir, "baijiabao-seasonal-feature-gap.report.md");
  await writeJson(jsonPath, report);
  await writeText(mdPath, renderMarkdown(report));
  console.log(
    JSON.stringify(
      {
        reportPath: jsonPath,
        markdownPath: mdPath,
        primaryModel: report.primaryModel,
        validationTop: Object.fromEntries(
          SEASONS.map((seasonKey) => [
            seasonKey,
            report.validation.bySeason[seasonKey].topAllFeatures.slice(0, 5).map((feature) => ({
              featureKey: feature.featureKey,
              inPrimaryModel: feature.inPrimaryModel,
              separabilityAuc: feature.separabilityAuc,
              direction: feature.direction
            }))
          ])
        ),
        interpretation: report.interpretation
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
