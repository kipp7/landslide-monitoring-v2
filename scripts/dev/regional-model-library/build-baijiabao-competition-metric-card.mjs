import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const DEFAULT_MODEL =
  ".tmp/regional-model-library/out/artifacts/baijiabao-monitoring-challenger-grid/baijiabao.challenger.reservoir-only.logistic-balanced-l2.linear-risk-v1.json";
const DEFAULT_VALIDATION =
  ".tmp/regional-model-library/out/threegorges-baijiabao/splits/labeled/baijiabao.validation.future-labels.window-features.jsonl";
const DEFAULT_OUT_DIR = ".tmp/regional-model-library/out/artifacts/baijiabao-competition-metric-card";

function parseArgs(argv) {
  const parsed = {
    model: DEFAULT_MODEL,
    validationSamples: DEFAULT_VALIDATION,
    labelKey: "warningHitLabel",
    outDir: DEFAULT_OUT_DIR,
    minPositiveHits: 5
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--model") parsed.model = argv[++index] ?? parsed.model;
    if (token === "--validation-samples") parsed.validationSamples = argv[++index] ?? parsed.validationSamples;
    if (token === "--label-key") parsed.labelKey = argv[++index] ?? parsed.labelKey;
    if (token === "--out-dir") parsed.outDir = argv[++index] ?? parsed.outDir;
    if (token === "--min-positive-hits") {
      const value = Number(argv[++index]);
      if (Number.isInteger(value) && value >= 1) parsed.minPositiveHits = value;
    }
  }
  return parsed;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf-8"));
}

async function readJsonLines(filePath) {
  const content = await readFile(filePath, "utf-8");
  return content
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
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

function featureValues(sample) {
  return Object.entries(sample.metricsNormalized ?? {}).reduce((accumulator, [featureKey, value]) => {
    if (typeof value === "number" && Number.isFinite(value)) accumulator[featureKey] = value;
    return accumulator;
  }, {});
}

function clamp01(value) {
  if (!Number.isFinite(value)) return 0.5;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function sigmoid(value) {
  if (!Number.isFinite(value)) return 0.5;
  if (value >= 20) return 1;
  if (value <= -20) return 0;
  if (value >= 0) {
    const z = Math.exp(-value);
    return 1 / (1 + z);
  }
  const z = Math.exp(value);
  return z / (1 + z);
}

function normalizeValue(stage, featureKey, value) {
  const rule = stage.featureNormalization?.[featureKey];
  if (!rule) return value;
  const span = rule.max - rule.min;
  if (!Number.isFinite(span) || span <= 0) return 0.5;
  return clamp01((value - rule.min) / span);
}

function runStage(stage, values) {
  const missingFeatureKeys = (stage.requiredFeatureKeys ?? []).filter(
    (featureKey) => typeof values[featureKey] !== "number" || !Number.isFinite(values[featureKey])
  );
  if (missingFeatureKeys.length > 0) return { score: null, missingFeatureKeys };

  let rawScore = typeof stage.bias === "number" ? stage.bias : 0;
  for (const [featureKey, weight] of Object.entries(stage.weights ?? {})) {
    const normalized = normalizeValue(stage, featureKey, values[featureKey] ?? 0);
    rawScore += weight * (normalized - (stage.featureCenters?.[featureKey] ?? 0));
  }
  return { score: sigmoid(rawScore), missingFeatureKeys: [] };
}

function runArtifact(artifact, values) {
  if (artifact.artifactType !== "two_stage_linear_risk_v1") {
    return runStage(artifact, values);
  }
  const stage1 = runStage(artifact.stage1, values);
  if (stage1.score === null) return stage1;
  return runStage(artifact.stage2, { ...values, [artifact.stage1.outputKey]: stage1.score });
}

function confusion(rows, threshold) {
  let tp = 0;
  let fp = 0;
  let tn = 0;
  let fn = 0;
  for (const row of rows) {
    const predicted = row.score >= threshold ? 1 : 0;
    if (row.label === 1 && predicted === 1) tp += 1;
    if (row.label === 0 && predicted === 1) fp += 1;
    if (row.label === 0 && predicted === 0) tn += 1;
    if (row.label === 1 && predicted === 0) fn += 1;
  }
  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const specificity = tn + fp > 0 ? tn / (tn + fp) : 0;
  const accuracy = rows.length > 0 ? (tp + tn) / rows.length : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  const balancedAccuracy = (recall + specificity) / 2;
  return { threshold, tp, fp, tn, fn, precision, recall, specificity, accuracy, f1, balancedAccuracy };
}

function auc(rows) {
  const sorted = [...rows].sort((left, right) => left.score - right.score);
  const positiveCount = sorted.filter((row) => row.label === 1).length;
  const negativeCount = sorted.length - positiveCount;
  if (positiveCount === 0 || negativeCount === 0) return null;
  let rankSum = 0;
  let rank = 1;
  for (let index = 0; index < sorted.length; ) {
    let nextIndex = index + 1;
    while (nextIndex < sorted.length && sorted[nextIndex].score === sorted[index].score) nextIndex += 1;
    const averageRank = (rank + rank + (nextIndex - index) - 1) / 2;
    for (let rowIndex = index; rowIndex < nextIndex; rowIndex += 1) {
      if (sorted[rowIndex].label === 1) rankSum += averageRank;
    }
    rank += nextIndex - index;
    index = nextIndex;
  }
  return (rankSum - (positiveCount * (positiveCount + 1)) / 2) / (positiveCount * negativeCount);
}

function chooseBest(candidates, scoreFn, guardFn = () => true) {
  let best = null;
  for (const candidate of candidates) {
    if (!guardFn(candidate)) continue;
    const score = scoreFn(candidate);
    if (!Number.isFinite(score)) continue;
    if (
      !best ||
      score > best.score ||
      (score === best.score && candidate.precision > best.metrics.precision) ||
      (score === best.score && candidate.precision === best.metrics.precision && candidate.recall > best.metrics.recall)
    ) {
      best = { score, metrics: candidate };
    }
  }
  return best?.metrics ?? null;
}

function pct(value) {
  return `${(value * 100).toFixed(2)}%`;
}

function renderReport(report) {
  const lines = [
    "# Baijiabao Competition Metric Card",
    "",
    `- modelKey: \`${report.model.modelKey}\``,
    `- labelKey: \`${report.labelKey}\``,
    `- evaluatedCount: \`${report.evaluation.evaluatedCount}\``,
    `- fallbackCount: \`${report.evaluation.fallbackCount}\``,
    `- auc: \`${pct(report.evaluation.auc)}\``,
    "",
    "## Recommended Competition Framing",
    "",
    "| Framing | Threshold | Accuracy | Precision | Specificity | Recall | F1 | TP | FP | TN | FN |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |"
  ];

  for (const item of report.recommended) {
    const m = item.metrics;
    lines.push(
      `| ${item.name} | \`${m.threshold.toFixed(6)}\` | \`${pct(m.accuracy)}\` | \`${pct(m.precision)}\` | \`${pct(m.specificity)}\` | \`${pct(m.recall)}\` | \`${pct(m.f1)}\` | \`${m.tp}\` | \`${m.fp}\` | \`${m.tn}\` | \`${m.fn}\` |`
    );
  }

  lines.push(
    "",
    "## Writing Guidance",
    "",
    "- Use `maxAccuracy` when the material needs the highest overall accuracy.",
    "- Use `zeroFalsePositive` only as an ultra-conservative high-confidence confirmation mode.",
    "- Do not describe these thresholds as full-coverage early warning models when recall is low.",
    ""
  );

  return `${lines.join("\n")}\n`;
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  const repoRoot = process.cwd();
  const modelPath = path.resolve(repoRoot, parsed.model);
  const validationPath = path.resolve(repoRoot, parsed.validationSamples);
  const outDir = path.resolve(repoRoot, parsed.outDir);

  const artifact = await readJson(modelPath);
  const samples = await readJsonLines(validationPath);
  const predictions = [];
  let fallbackCount = 0;
  let ignoredCount = 0;

  for (const sample of samples) {
    const label = toBinaryLabel(sample.labels?.[parsed.labelKey]);
    if (label === null) {
      ignoredCount += 1;
      continue;
    }
    const execution = runArtifact(artifact, featureValues(sample));
    if (execution.score === null) {
      fallbackCount += 1;
      continue;
    }
    predictions.push({ sampleId: sample.sampleId, label, score: execution.score });
  }

  const thresholds = Array.from(new Set(predictions.map((row) => Number(row.score.toFixed(6)))))
    .concat([0, 0.5, 1.000001])
    .sort((left, right) => left - right);
  const candidates = thresholds.map((threshold) => confusion(predictions, threshold));
  const aucValue = auc(predictions);

  const maxAccuracy = chooseBest(candidates, (m) => m.accuracy, (m) => m.tp >= parsed.minPositiveHits);
  const maxPrecisionAtMinHits = chooseBest(candidates, (m) => m.precision, (m) => m.tp >= parsed.minPositiveHits);
  const zeroFalsePositive = chooseBest(candidates, (m) => m.tp, (m) => m.fp === 0 && m.tp > 0);
  const balanced = chooseBest(candidates, (m) => m.balancedAccuracy);
  const highPrecisionBalanced = chooseBest(
    candidates,
    (m) => m.accuracy + m.precision + m.specificity + m.f1,
    (m) => m.precision >= 0.7 && m.tp >= parsed.minPositiveHits
  );

  const report = {
    generatedAt: new Date().toISOString(),
    sourcePaths: { model: modelPath, validationSamples: validationPath },
    labelKey: parsed.labelKey,
    minPositiveHits: parsed.minPositiveHits,
    model: {
      modelKey: artifact.modelKey,
      modelVersion: artifact.modelVersion,
      featureFamily: "reservoir-only",
      trainingMode: artifact.stage2?.metadata?.trainingMode ?? artifact.metadata?.trainingMode ?? null
    },
    evaluation: {
      sampleCount: samples.length,
      evaluatedCount: predictions.length,
      fallbackCount,
      ignoredCount,
      positiveCount: predictions.filter((row) => row.label === 1).length,
      negativeCount: predictions.filter((row) => row.label === 0).length,
      auc: aucValue
    },
    recommended: [
      { key: "maxAccuracy", name: "Highest accuracy with minimum positive hits", metrics: maxAccuracy },
      { key: "maxPrecisionAtMinHits", name: "Highest precision with minimum positive hits", metrics: maxPrecisionAtMinHits },
      { key: "zeroFalsePositive", name: "Zero false-positive confirmation", metrics: zeroFalsePositive },
      { key: "highPrecisionBalanced", name: "High-precision balanced display", metrics: highPrecisionBalanced },
      { key: "balancedAccuracy", name: "Balanced screening reference", metrics: balanced }
    ].filter((entry) => entry.metrics)
  };

  await mkdir(outDir, { recursive: true });
  await writeJson(path.join(outDir, "baijiabao-competition-metric-card.report.json"), report);
  await writeText(path.join(outDir, "baijiabao-competition-metric-card.report.md"), renderReport(report));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
