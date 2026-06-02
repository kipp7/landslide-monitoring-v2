import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const DEFAULT_VALIDATION_SAMPLES =
  ".tmp/regional-model-library/out/threegorges-baijiabao/splits/labeled/baijiabao.validation.future-labels.window-features.jsonl";
const DEFAULT_OUT_DIR = ".tmp/regional-model-library/out/artifacts/baijiabao-monitoring-error-diagnostics";
const DEFAULT_MODELS = [
  {
    key: "published",
    role: "current-runtime-candidate",
    registryPath: "artifacts/models/regional-experts/phase1-monitoring-candidates/registry.json"
  },
  {
    key: "balancedChallenger",
    role: "balanced-warning-challenger",
    registryPath:
      ".tmp/regional-model-library/out/artifacts/baijiabao-monitoring-challenger-grid/best-balanced-accuracy.registry.json"
  },
  {
    key: "lowFalsePositiveChallenger",
    role: "confirmation-challenger",
    registryPath:
      ".tmp/regional-model-library/out/artifacts/baijiabao-monitoring-challenger-grid/best-eligible.registry.json"
  }
];

function parseArgs(argv) {
  const parsed = {
    validationSamples: DEFAULT_VALIDATION_SAMPLES,
    outDir: DEFAULT_OUT_DIR,
    labelKey: "warningHitLabel"
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token) continue;
    switch (token) {
      case "--validation-samples":
        parsed.validationSamples = argv[++index] ?? parsed.validationSamples;
        break;
      case "--out-dir":
        parsed.outDir = argv[++index] ?? parsed.outDir;
        break;
      case "--label-key":
        parsed.labelKey = argv[++index] ?? parsed.labelKey;
        break;
      default:
        break;
    }
  }

  return parsed;
}

async function readSamples(filePath) {
  const content = await readFile(filePath, "utf-8");
  if (filePath.toLowerCase().endsWith(".json")) {
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? parsed : [];
  }
  return content
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

async function readArtifactFromRegistry(filePath) {
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

function featureValues(sample) {
  return Object.entries(sample.metricsNormalized ?? {}).reduce((accumulator, [featureKey, value]) => {
    if (typeof value === "number" && Number.isFinite(value)) accumulator[featureKey] = value;
    return accumulator;
  }, {});
}

function readThreshold(artifact) {
  const replaySummary = artifact.metadata?.replaySummary;
  if (typeof replaySummary?.threshold === "number" && replaySummary.threshold > 0 && replaySummary.threshold < 1) {
    return {
      threshold: replaySummary.threshold,
      thresholdMode: typeof replaySummary.thresholdMode === "string" ? replaySummary.thresholdMode : "unknown",
      source: "metadata.replaySummary.threshold"
    };
  }
  const calibration = artifact.metadata?.calibration;
  if (typeof calibration?.threshold === "number" && calibration.threshold > 0 && calibration.threshold < 1) {
    return {
      threshold: calibration.threshold,
      thresholdMode: typeof calibration.thresholdMode === "string" ? calibration.thresholdMode : "unknown",
      source: "metadata.calibration.threshold"
    };
  }
  return { threshold: 0.5, thresholdMode: "fallback-fixed", source: "fallback" };
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
  const missingFeatureKeys = stage.requiredFeatureKeys.filter(
    (featureKey) => typeof values[featureKey] !== "number" || !Number.isFinite(values[featureKey])
  );
  if (missingFeatureKeys.length > 0) return { score: null, missingFeatureKeys, rawScore: null, contributions: [] };

  let rawScore = typeof stage.bias === "number" ? stage.bias : 0;
  const contributions = [];
  for (const [featureKey, weight] of Object.entries(stage.weights ?? {})) {
    const rawValue = values[featureKey] ?? 0;
    const normalizedValue = normalizeValue(stage, featureKey, rawValue);
    const centeredValue = normalizedValue - (stage.featureCenters?.[featureKey] ?? 0);
    const contribution = weight * centeredValue;
    rawScore += contribution;
    contributions.push({ featureKey, rawValue, normalizedValue, centeredValue, weight, contribution });
  }
  contributions.sort((left, right) => Math.abs(right.contribution) - Math.abs(left.contribution));
  return { score: sigmoid(rawScore), rawScore, missingFeatureKeys: [], contributions };
}

function runArtifact(artifact, values) {
  if (artifact.artifactType !== "two_stage_linear_risk_v1") {
    const stage = {
      stageKey: "stage2_warning",
      outputKey: "stage2WarningScore",
      requiredFeatureKeys: artifact.requiredFeatureKeys ?? [],
      featureNormalization: artifact.featureNormalization ?? {},
      featureCenters: artifact.featureCenters ?? {},
      bias: artifact.bias ?? 0,
      weights: artifact.weights ?? {}
    };
    const result = runStage(stage, values);
    return {
      score: result.score,
      missingFeatureKeys: result.missingFeatureKeys,
      stage1Score: null,
      stage2Score: result.score,
      topContributions: result.contributions.slice(0, 5)
    };
  }

  const stage1 = runStage(artifact.stage1, values);
  if (stage1.score === null) {
    return {
      score: null,
      missingFeatureKeys: stage1.missingFeatureKeys,
      stage1Score: null,
      stage2Score: null,
      topContributions: []
    };
  }
  const stage2 = runStage(artifact.stage2, { ...values, [artifact.stage1.outputKey]: stage1.score });
  if (stage2.score === null) {
    return {
      score: null,
      missingFeatureKeys: stage2.missingFeatureKeys,
      stage1Score: stage1.score,
      stage2Score: null,
      topContributions: stage1.contributions.slice(0, 5)
    };
  }
  return {
    score: stage2.score,
    missingFeatureKeys: [],
    stage1Score: stage1.score,
    stage2Score: stage2.score,
    topContributions: stage2.contributions.slice(0, 5)
  };
}

function confusion(rows) {
  let tp = 0;
  let fp = 0;
  let tn = 0;
  let fn = 0;
  for (const row of rows) {
    if (row.label === 1 && row.predicted === 1) tp += 1;
    if (row.label === 0 && row.predicted === 1) fp += 1;
    if (row.label === 0 && row.predicted === 0) tn += 1;
    if (row.label === 1 && row.predicted === 0) fn += 1;
  }
  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const specificity = tn + fp > 0 ? tn / (tn + fp) : 0;
  const accuracy = rows.length > 0 ? (tp + tn) / rows.length : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  const balancedAccuracy = (recall + specificity) / 2;
  return { tp, fp, tn, fn, precision, recall, specificity, accuracy, f1, balancedAccuracy, youdenJ: recall + specificity - 1 };
}

function quantile(values, q) {
  const sorted = values.filter((value) => typeof value === "number" && Number.isFinite(value)).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const position = (sorted.length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

function numericSummary(rows, featureKey) {
  const values = rows.map((row) => row.values[featureKey]).filter((value) => typeof value === "number");
  return {
    count: values.length,
    min: values.length > 0 ? Math.min(...values) : null,
    p25: quantile(values, 0.25),
    p50: quantile(values, 0.5),
    p75: quantile(values, 0.75),
    max: values.length > 0 ? Math.max(...values) : null
  };
}

function outcomeKey(row) {
  if (row.label === 1 && row.predicted === 1) return "tp";
  if (row.label === 0 && row.predicted === 1) return "fp";
  if (row.label === 0 && row.predicted === 0) return "tn";
  return "fn";
}

function monthBucket(sample) {
  const date = new Date(sample.eventTs);
  if (Number.isNaN(date.getTime())) return "unknown";
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function seasonBucket(sample) {
  const date = new Date(sample.eventTs);
  if (Number.isNaN(date.getTime())) return "unknown";
  const month = date.getUTCMonth() + 1;
  if ([3, 4, 5].includes(month)) return "spring";
  if ([6, 7, 8].includes(month)) return "summer";
  if ([9, 10, 11].includes(month)) return "autumn";
  return "winter";
}

function pointBucket(sample) {
  return sample.rawRef?.originalFields?.point_id ?? sample.identity?.stationCode ?? "unknown";
}

function rainfallBucket(values) {
  const value = values.rainfallCurrentMm_sum_72h ?? values.rainfallCurrentMm ?? null;
  if (typeof value !== "number") return "unknown";
  if (value <= 0) return "0mm";
  if (value <= 10) return "0-10mm";
  if (value <= 30) return "10-30mm";
  if (value <= 60) return "30-60mm";
  return ">60mm";
}

function reservoirLevelBucket(values) {
  const value = values.reservoirLevelM;
  if (typeof value !== "number") return "unknown";
  if (value < 150) return "<150m";
  if (value < 155) return "150-155m";
  if (value < 160) return "155-160m";
  if (value < 165) return "160-165m";
  if (value < 170) return "165-170m";
  return ">=170m";
}

function reservoirDeltaBucket(values) {
  const value = values.reservoirLevelM_delta_72h ?? values.reservoirLevelM_delta_24h;
  if (typeof value !== "number") return "unknown";
  if (value <= -1) return "<=-1m";
  if (value < -0.2) return "-1~-0.2m";
  if (value <= 0.2) return "-0.2~0.2m";
  if (value < 1) return "0.2~1m";
  return ">=1m";
}

function displacementDeltaBucket(values) {
  const value = values.displacementSurfaceMm_delta_72h ?? values.displacementSurfaceMm_delta_24h;
  if (typeof value !== "number") return "unknown";
  if (value <= -1) return "<=-1mm";
  if (value <= 0) return "-1~0mm";
  if (value < 1.3) return "0~1.3mm";
  if (value < 5) return "1.3~5mm";
  return ">=5mm";
}

const GROUPERS = {
  month: (row) => monthBucket(row.sample),
  season: (row) => seasonBucket(row.sample),
  pointId: (row) => pointBucket(row.sample),
  rainfall72h: (row) => rainfallBucket(row.values),
  reservoirLevel: (row) => reservoirLevelBucket(row.values),
  reservoirDelta72h: (row) => reservoirDeltaBucket(row.values),
  displacementDelta72h: (row) => displacementDeltaBucket(row.values)
};

function groupBreakdown(rows, groupBy) {
  const grouper = GROUPERS[groupBy];
  const grouped = new Map();
  for (const row of rows) {
    const key = grouper(row);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(row);
  }
  return Array.from(grouped.entries())
    .map(([key, groupRows]) => ({ key, count: groupRows.length, ...confusion(groupRows) }))
    .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key));
}

function outcomeSummaries(rows) {
  const result = {};
  for (const key of ["tp", "fp", "tn", "fn"]) {
    const subset = rows.filter((row) => outcomeKey(row) === key);
    result[key] = {
      count: subset.length,
      score: numericSummary(subset, "__score"),
      displacementLabel: {
        count: subset.length,
        min: subset.length > 0 ? Math.min(...subset.map((row) => row.displacementLabel).filter(Number.isFinite)) : null,
        p25: quantile(subset.map((row) => row.displacementLabel), 0.25),
        p50: quantile(subset.map((row) => row.displacementLabel), 0.5),
        p75: quantile(subset.map((row) => row.displacementLabel), 0.75),
        max: subset.length > 0 ? Math.max(...subset.map((row) => row.displacementLabel).filter(Number.isFinite)) : null
      },
      features: {
        displacementSurfaceMm: numericSummary(subset, "displacementSurfaceMm"),
        displacementSurfaceMm_delta_72h: numericSummary(subset, "displacementSurfaceMm_delta_72h"),
        rainfallCurrentMm_sum_72h: numericSummary(subset, "rainfallCurrentMm_sum_72h"),
        reservoirLevelM: numericSummary(subset, "reservoirLevelM"),
        reservoirLevelM_delta_72h: numericSummary(subset, "reservoirLevelM_delta_72h")
      }
    };
  }
  return result;
}

function examples(rows, filterFn, orderFn, limit = 12) {
  return rows
    .filter(filterFn)
    .sort(orderFn)
    .slice(0, limit)
    .map((row) => ({
      sampleId: row.sample.sampleId,
      eventTs: row.sample.eventTs,
      pointId: pointBucket(row.sample),
      label: row.label,
      predicted: row.predicted,
      score: row.score,
      threshold: row.threshold,
      displacementLabel: row.displacementLabel,
      features: {
        displacementSurfaceMm: row.values.displacementSurfaceMm ?? null,
        displacementSurfaceMm_delta_72h: row.values.displacementSurfaceMm_delta_72h ?? null,
        rainfallCurrentMm_sum_72h: row.values.rainfallCurrentMm_sum_72h ?? null,
        reservoirLevelM: row.values.reservoirLevelM ?? null,
        reservoirLevelM_delta_72h: row.values.reservoirLevelM_delta_72h ?? null
      },
      topContributions: row.topContributions
    }));
}

function modelDiagnostics(model, rows) {
  const evaluated = rows
    .map((row) => {
      const execution = runArtifact(model.artifact, row.values);
      if (execution.score === null) {
        return {
          ...row,
          modelKey: model.key,
          modelArtifactKey: model.artifact.modelKey,
          score: null,
          threshold: model.threshold.threshold,
          predicted: null,
          missingFeatureKeys: execution.missingFeatureKeys,
          topContributions: execution.topContributions,
          values: row.values
        };
      }
      return {
        ...row,
        modelKey: model.key,
        modelArtifactKey: model.artifact.modelKey,
        score: execution.score,
        threshold: model.threshold.threshold,
        predicted: execution.score >= model.threshold.threshold ? 1 : 0,
        missingFeatureKeys: [],
        topContributions: execution.topContributions,
        values: {
          ...row.values,
          __score: execution.score
        }
      };
    })
    .filter((row) => row.predicted !== null);

  return {
    key: model.key,
    role: model.role,
    modelKey: model.artifact.modelKey,
    modelVersion: model.artifact.modelVersion ?? null,
    threshold: model.threshold.threshold,
    thresholdMode: model.threshold.thresholdMode,
    thresholdSource: model.threshold.source,
    featureCount: model.artifact.requiredFeatureKeys?.length ?? null,
    confusion: confusion(evaluated),
    fallbackCount: rows.length - evaluated.length,
    groupBreakdowns: Object.fromEntries(Object.keys(GROUPERS).map((key) => [key, groupBreakdown(evaluated, key)])),
    outcomeSummaries: outcomeSummaries(evaluated),
    examples: {
      highestFalsePositives: examples(
        evaluated,
        (row) => row.label === 0 && row.predicted === 1,
        (left, right) => right.score - left.score
      ),
      lowestFalseNegatives: examples(
        evaluated,
        (row) => row.label === 1 && row.predicted === 0,
        (left, right) => left.score - right.score
      ),
      strongestTruePositives: examples(
        evaluated,
        (row) => row.label === 1 && row.predicted === 1,
        (left, right) => right.score - left.score
      )
    },
    rows: evaluated
  };
}

function compareModels(left, right) {
  const leftById = new Map(left.rows.map((row) => [row.sample.sampleId, row]));
  const rightById = new Map(right.rows.map((row) => [row.sample.sampleId, row]));
  const transitions = new Map();
  const changed = [];

  for (const [sampleId, leftRow] of leftById.entries()) {
    const rightRow = rightById.get(sampleId);
    if (!rightRow) continue;
    const key = `${outcomeKey(leftRow)}->${outcomeKey(rightRow)}`;
    transitions.set(key, (transitions.get(key) ?? 0) + 1);
    if (leftRow.predicted !== rightRow.predicted) {
      changed.push({
        sampleId,
        eventTs: leftRow.sample.eventTs,
        pointId: pointBucket(leftRow.sample),
        label: leftRow.label,
        displacementLabel: leftRow.displacementLabel,
        left: {
          modelKey: left.key,
          outcome: outcomeKey(leftRow),
          score: leftRow.score,
          threshold: leftRow.threshold,
          predicted: leftRow.predicted
        },
        right: {
          modelKey: right.key,
          outcome: outcomeKey(rightRow),
          score: rightRow.score,
          threshold: rightRow.threshold,
          predicted: rightRow.predicted
        },
        features: {
          displacementSurfaceMm_delta_72h: leftRow.values.displacementSurfaceMm_delta_72h ?? null,
          rainfallCurrentMm_sum_72h: leftRow.values.rainfallCurrentMm_sum_72h ?? null,
          reservoirLevelM: leftRow.values.reservoirLevelM ?? null,
          reservoirLevelM_delta_72h: leftRow.values.reservoirLevelM_delta_72h ?? null
        }
      });
    }
  }

  return {
    left: left.key,
    right: right.key,
    transitions: Object.fromEntries(Array.from(transitions.entries()).sort(([a], [b]) => a.localeCompare(b))),
    changedCount: changed.length,
    changedExamples: changed.slice(0, 30)
  };
}

function renderMarkdown(report) {
  const lines = [];
  lines.push("# Baijiabao Monitoring Error Diagnostics");
  lines.push("");
  lines.push(`Generated at: ${report.generatedAt}`);
  lines.push("");
  lines.push("## Models");
  for (const model of report.models) {
    const c = model.confusion;
    lines.push(
      `- ${model.key}: ${model.modelKey}, threshold=${model.threshold}, BA=${c.balancedAccuracy.toFixed(4)}, AUC=${String(
        report.sourceMetrics?.[model.key]?.auc ?? "n/a"
      )}, F1=${c.f1.toFixed(4)}, precision=${c.precision.toFixed(4)}, recall=${c.recall.toFixed(4)}, FP=${c.fp}, FN=${
        c.fn
      }`
    );
  }
  lines.push("");
  lines.push("## Operational Read");
  lines.push(
    "- `balancedChallenger` reduces false positives versus `published`, but it also increases false negatives. It is a candidate for the main warning policy only if lower nuisance alarms are more important than keeping the current recall."
  );
  lines.push(
    "- `lowFalsePositiveChallenger` is not a main warning model. It is better treated as a confirmation channel because it only fires on a small high-confidence subset."
  );
  lines.push("");
  lines.push("## Key Group Breakdowns");
  for (const model of report.models) {
    lines.push("");
    lines.push(`### ${model.key}`);
    for (const groupName of ["pointId", "season", "rainfall72h", "reservoirLevel", "reservoirDelta72h"]) {
      const top = model.groupBreakdowns[groupName].slice(0, 8);
      lines.push("");
      lines.push(`#### ${groupName}`);
      lines.push("| bucket | count | TP | FP | TN | FN | BA | precision | recall |");
      lines.push("|---|---:|---:|---:|---:|---:|---:|---:|---:|");
      for (const row of top) {
        lines.push(
          `| ${row.key} | ${row.count} | ${row.tp} | ${row.fp} | ${row.tn} | ${row.fn} | ${row.balancedAccuracy.toFixed(
            4
          )} | ${row.precision.toFixed(4)} | ${row.recall.toFixed(4)} |`
        );
      }
    }
  }
  lines.push("");
  lines.push("## Pairwise Transitions");
  for (const comparison of report.comparisons) {
    lines.push("");
    lines.push(`### ${comparison.left} -> ${comparison.right}`);
    for (const [key, value] of Object.entries(comparison.transitions)) {
      lines.push(`- ${key}: ${value}`);
    }
  }
  lines.push("");
  lines.push("Full JSON report contains feature summaries and FP/FN examples.");
  lines.push("");
  return `${lines.join("\n")}\n`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = process.cwd();
  const validationPath = path.resolve(repoRoot, args.validationSamples);
  const outDir = path.resolve(repoRoot, args.outDir);

  const rawSamples = await readSamples(validationPath);
  const rows = rawSamples
    .map((sample) => {
      const label = toBinaryLabel(sample.labels?.[args.labelKey]);
      if (label === null) return null;
      return {
        sample,
        label,
        displacementLabel:
          typeof sample.labels?.displacementLabel === "number" && Number.isFinite(sample.labels.displacementLabel)
            ? sample.labels.displacementLabel
            : null,
        values: featureValues(sample)
      };
    })
    .filter(Boolean);

  const models = [];
  for (const modelConfig of DEFAULT_MODELS) {
    const registryPath = path.resolve(repoRoot, modelConfig.registryPath);
    const artifact = await readArtifactFromRegistry(registryPath);
    models.push({
      ...modelConfig,
      registryPath,
      artifact,
      threshold: readThreshold(artifact)
    });
  }

  const diagnostics = models.map((model) => modelDiagnostics(model, rows));
  const modelReports = diagnostics.map(({ rows: _rows, ...model }) => model);
  const comparisons = [
    compareModels(diagnostics[0], diagnostics[1]),
    compareModels(diagnostics[0], diagnostics[2]),
    compareModels(diagnostics[1], diagnostics[2])
  ];
  const sourceMetrics = Object.fromEntries(
    models.map((model) => [
      model.key,
      {
        ...(model.artifact.metadata?.replaySummary ?? {}),
        featureFamilyKey: model.artifact.metadata?.featureFamilyKey ?? "published-current-all-no-crack",
        trainingMode: model.artifact.metadata?.trainingMode ?? "unknown"
      }
    ])
  );

  const report = {
    generatedAt: new Date().toISOString(),
    validationSamplesPath: validationPath,
    labelKey: args.labelKey,
    sampleSummary: {
      rawSampleCount: rawSamples.length,
      binaryLabelSampleCount: rows.length,
      positiveCount: rows.filter((row) => row.label === 1).length,
      negativeCount: rows.filter((row) => row.label === 0).length
    },
    sourceMetrics,
    models: modelReports,
    comparisons
  };

  const jsonPath = path.join(outDir, "baijiabao-monitoring-error-diagnostics.report.json");
  const mdPath = path.join(outDir, "baijiabao-monitoring-error-diagnostics.report.md");
  await writeJson(jsonPath, report);
  await writeText(mdPath, renderMarkdown(report));

  console.log(
    JSON.stringify(
      {
        reportPath: jsonPath,
        markdownPath: mdPath,
        sampleSummary: report.sampleSummary,
        models: report.models.map((model) => ({
          key: model.key,
          modelKey: model.modelKey,
          threshold: model.threshold,
          thresholdMode: model.thresholdMode,
          confusion: model.confusion
        })),
        comparisons: report.comparisons.map((comparison) => ({
          left: comparison.left,
          right: comparison.right,
          changedCount: comparison.changedCount,
          transitions: comparison.transitions
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
