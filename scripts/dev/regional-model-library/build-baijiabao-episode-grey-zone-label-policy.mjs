import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const DEFAULT_TRAIN_SAMPLES =
  ".tmp/regional-model-library/out/threegorges-baijiabao/splits/labeled/baijiabao.train.future-labels.window-features.jsonl";
const DEFAULT_VALIDATION_SAMPLES =
  ".tmp/regional-model-library/out/threegorges-baijiabao/splits/labeled/baijiabao.validation.future-labels.window-features.jsonl";
const DEFAULT_OUT_DIR = ".tmp/regional-model-library/out/artifacts/baijiabao-episode-grey-zone-label-policy";
const DAY_MS = 24 * 3600 * 1000;
const EPISODE_GAP_DAYS = 1.5;
const PRE_EPISODE_GREY_ZONE_DAYS = 14;

function parseArgs(argv) {
  const parsed = {
    trainSamples: DEFAULT_TRAIN_SAMPLES,
    validationSamples: DEFAULT_VALIDATION_SAMPLES,
    outDir: DEFAULT_OUT_DIR,
    labelKey: "warningHitLabel",
    boundaryLabelKey: "warningHitLabelEpisodeBoundary",
    trainingLabelKey: "warningHitLabelEpisodeGreyZoneExcluded",
    greyZoneDays: PRE_EPISODE_GREY_ZONE_DAYS
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--train-samples") parsed.trainSamples = argv[++index] ?? parsed.trainSamples;
    if (token === "--validation-samples") parsed.validationSamples = argv[++index] ?? parsed.validationSamples;
    if (token === "--out-dir") parsed.outDir = argv[++index] ?? parsed.outDir;
    if (token === "--label-key") parsed.labelKey = argv[++index] ?? parsed.labelKey;
    if (token === "--boundary-label-key") parsed.boundaryLabelKey = argv[++index] ?? parsed.boundaryLabelKey;
    if (token === "--training-label-key") parsed.trainingLabelKey = argv[++index] ?? parsed.trainingLabelKey;
    if (token === "--grey-zone-days") {
      const value = Number(argv[++index]);
      if (Number.isFinite(value) && value > 0) parsed.greyZoneDays = value;
    }
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

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

async function writeText(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, value, "utf-8");
}

async function writeJsonLines(filePath, rows) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`, "utf-8");
}

function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return /[",\r\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function toCsv(rows) {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  return `${[headers.join(","), ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(","))].join(
    "\n"
  )}\n`;
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

function pointId(sample) {
  return sample.rawRef?.originalFields?.point_id ?? sample.identity?.stationCode ?? "unknown";
}

function eventTsMs(sample) {
  const value = Date.parse(sample.eventTs);
  return Number.isFinite(value) ? value : null;
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

function buildBaseRows(samples, labelKey) {
  return samples
    .map((sample, index) => {
      const label = toBinaryLabel(sample.labels?.[labelKey]);
      const tsMs = eventTsMs(sample);
      if (label === null || tsMs === null) return null;
      return {
        index,
        sample,
        sampleId: sample.sampleId ?? null,
        eventTs: sample.eventTs,
        tsMs,
        pointId: pointId(sample),
        immediateLabel: label
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.tsMs - right.tsMs || left.pointId.localeCompare(right.pointId));
}

function buildEpisodes(rows) {
  const episodes = [];
  for (const [point, pointRows] of groupBy(rows.filter((row) => row.immediateLabel === 1), (row) => row.pointId).entries()) {
    let current = null;
    for (const row of pointRows.slice().sort((left, right) => left.tsMs - right.tsMs)) {
      if (!current || row.tsMs - current.endTsMs > EPISODE_GAP_DAYS * DAY_MS) {
        current = {
          episodeId: `${point}:${episodes.length + 1}`,
          pointId: point,
          startTs: row.eventTs,
          endTs: row.eventTs,
          startTsMs: row.tsMs,
          endTsMs: row.tsMs,
          positiveSampleIds: [row.sampleId]
        };
        episodes.push(current);
      } else {
        current.endTs = row.eventTs;
        current.endTsMs = row.tsMs;
        current.positiveSampleIds.push(row.sampleId);
      }
    }
  }
  return episodes;
}

function nearestFutureEpisode(row, episodes) {
  return episodes
    .filter((episode) => episode.pointId === row.pointId && episode.startTsMs > row.tsMs)
    .sort((left, right) => left.startTsMs - right.startTsMs)[0] ?? null;
}

function classifyRow(row, episodes, greyZoneDays) {
  if (row.immediateLabel === 1) {
    return {
      boundaryClass: "positive",
      trainingLabel: true,
      falsePositiveCostEligible: true,
      nextEpisodeId: null,
      daysToNextPositiveEpisode: null
    };
  }
  const next = nearestFutureEpisode(row, episodes);
  const daysToNextPositiveEpisode = next ? (next.startTsMs - row.tsMs) / DAY_MS : null;
  const isGreyZone =
    daysToNextPositiveEpisode !== null &&
    daysToNextPositiveEpisode >= 0 &&
    daysToNextPositiveEpisode <= greyZoneDays;
  return {
    boundaryClass: isGreyZone ? "pre_episode_grey_zone" : "negative",
    trainingLabel: isGreyZone ? null : false,
    falsePositiveCostEligible: !isGreyZone,
    nextEpisodeId: next?.episodeId ?? null,
    daysToNextPositiveEpisode
  };
}

function enrichSample(row, classification, args) {
  const flags = [...(row.sample.qualityFlags ?? [])];
  if (classification.boundaryClass === "pre_episode_grey_zone") {
    flags.push({
      code: "episode_boundary_grey_zone",
      severity: "info",
      message: `Immediate negative sample enters a same-point positive episode within ${args.greyZoneDays}d; exclude from hard false-positive cost.`,
      field: args.trainingLabelKey
    });
  }
  return {
    ...row.sample,
    labels: {
      ...(row.sample.labels ?? {}),
      [`${args.labelKey}Immediate`]: row.immediateLabel === 1,
      [args.boundaryLabelKey]: classification.boundaryClass,
      [args.trainingLabelKey]: classification.trainingLabel,
      [`${args.trainingLabelKey}FalsePositiveCostEligible`]: classification.falsePositiveCostEligible
    },
    labelMetadata: {
      ...(row.sample.labelMetadata ?? {}),
      [`${args.labelKey}Immediate`]: {
        valueType: "boolean",
        derivationMode: "derived-threshold",
        sourceField: `labels.${args.labelKey}`,
        horizonSpec: "next-observation"
      },
      [args.boundaryLabelKey]: {
        valueType: "string",
        derivationMode: "derived-episode-boundary-grey-zone",
        sourceField: `labels.${args.labelKey}`,
        horizonSpec: `pre-positive-${args.greyZoneDays}d-grey-zone`
      },
      [args.trainingLabelKey]: {
        valueType: classification.trainingLabel === null ? "null" : "boolean",
        derivationMode: "derived-episode-boundary-grey-zone",
        sourceField: args.boundaryLabelKey,
        horizonSpec: `pre-positive-${args.greyZoneDays}d-grey-zone`
      },
      [`${args.trainingLabelKey}FalsePositiveCostEligible`]: {
        valueType: "boolean",
        derivationMode: "derived-episode-boundary-grey-zone",
        sourceField: args.boundaryLabelKey,
        horizonSpec: `pre-positive-${args.greyZoneDays}d-grey-zone`
      }
    },
    qualityFlags: flags,
    episodeBoundaryReview: {
      policyKey: "baijiabao.episode-boundary-grey-zone.v1",
      sourceLabelKey: args.labelKey,
      boundaryLabelKey: args.boundaryLabelKey,
      trainingLabelKey: args.trainingLabelKey,
      boundaryClass: classification.boundaryClass,
      falsePositiveCostEligible: classification.falsePositiveCostEligible,
      nextPositiveEpisodeId: classification.nextEpisodeId,
      daysToNextPositiveEpisode:
        classification.daysToNextPositiveEpisode === null
          ? null
          : Number(classification.daysToNextPositiveEpisode.toFixed(6)),
      greyZoneDays: args.greyZoneDays
    }
  };
}

function summarize(splitName, rows, classifications, episodes, outputPath) {
  const counts = {
    positive: 0,
    pre_episode_grey_zone: 0,
    negative: 0
  };
  for (const classification of classifications) counts[classification.boundaryClass] += 1;
  return {
    splitName,
    outputPath,
    sampleCount: rows.length,
    immediatePositiveCount: rows.filter((row) => row.immediateLabel === 1).length,
    immediateNegativeCount: rows.filter((row) => row.immediateLabel === 0).length,
    episodeCount: episodes.length,
    boundaryClassCounts: counts,
    binaryTrainingUsableCount: counts.positive + counts.negative,
    excludedGreyZoneCount: counts.pre_episode_grey_zone,
    hardNegativeCount: counts.negative
  };
}

function processSplit(samples, splitName, outputPath, args) {
  const rows = buildBaseRows(samples, args.labelKey);
  const episodes = buildEpisodes(rows);
  const classifications = rows.map((row) => classifyRow(row, episodes, args.greyZoneDays));
  const enrichedByIndex = new Map(
    rows.map((row, index) => [row.index, enrichSample(row, classifications[index], args)])
  );
  const enrichedSamples = samples.map((sample, index) => enrichedByIndex.get(index) ?? sample);
  const reviewRows = rows.map((row, index) => ({
    splitName,
    sampleId: row.sampleId,
    eventTs: row.eventTs,
    pointId: row.pointId,
    immediateLabel: row.immediateLabel,
    boundaryClass: classifications[index].boundaryClass,
    trainingLabel: classifications[index].trainingLabel,
    falsePositiveCostEligible: classifications[index].falsePositiveCostEligible,
    nextPositiveEpisodeId: classifications[index].nextEpisodeId,
    daysToNextPositiveEpisode:
      classifications[index].daysToNextPositiveEpisode === null
        ? null
        : Number(classifications[index].daysToNextPositiveEpisode.toFixed(6))
  }));
  return {
    enrichedSamples,
    reviewRows,
    summary: summarize(splitName, rows, classifications, episodes, outputPath)
  };
}

function renderMarkdown(report) {
  const lines = [];
  lines.push("# Baijiabao Episode Grey-Zone Label Policy");
  lines.push("");
  lines.push(`Generated at: ${report.generatedAt}`);
  lines.push("");
  lines.push("## Policy");
  lines.push("");
  lines.push(`- policy key: \`${report.policy.policyKey}\``);
  lines.push(`- source label: \`${report.policy.sourceLabelKey}\``);
  lines.push(`- boundary label: \`${report.policy.boundaryLabelKey}\``);
  lines.push(`- training label: \`${report.policy.trainingLabelKey}\``);
  lines.push(`- grey zone: \`${report.policy.preEpisodeGreyZoneDays}d before same-point positive episode\``);
  lines.push("");
  lines.push("## Split Summary");
  lines.push("");
  lines.push("| split | samples | immediate positives | immediate negatives | grey-zone excluded | hard negatives | binary usable |");
  lines.push("|---|---:|---:|---:|---:|---:|---:|");
  for (const split of report.splits) {
    lines.push(
      `| ${split.splitName} | ${split.sampleCount} | ${split.immediatePositiveCount} | ${split.immediateNegativeCount} | ${split.excludedGreyZoneCount} | ${split.hardNegativeCount} | ${split.binaryTrainingUsableCount} |`
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
  const outDir = path.resolve(repoRoot, args.outDir);
  const trainPath = path.resolve(repoRoot, args.trainSamples);
  const validationPath = path.resolve(repoRoot, args.validationSamples);
  const trainOutputPath = path.join(outDir, "baijiabao.train.episode-grey-zone-labels.jsonl");
  const validationOutputPath = path.join(outDir, "baijiabao.validation.episode-grey-zone-labels.jsonl");
  const train = processSplit(await readJsonLines(trainPath), "train", trainOutputPath, args);
  const validation = processSplit(await readJsonLines(validationPath), "validation", validationOutputPath, args);
  await writeJsonLines(trainOutputPath, train.enrichedSamples);
  await writeJsonLines(validationOutputPath, validation.enrichedSamples);
  const report = {
    generatedAt: new Date().toISOString(),
    sourcePaths: {
      train: trainPath,
      validation: validationPath
    },
    policy: {
      policyKey: "baijiabao.episode-boundary-grey-zone.v1",
      purpose:
        "Preserve immediate derived labels while excluding pre-positive same-point grey-zone negatives from hard false-positive cost and binary retraining.",
      sourceLabelKey: args.labelKey,
      immediateLabelKey: `${args.labelKey}Immediate`,
      boundaryLabelKey: args.boundaryLabelKey,
      trainingLabelKey: args.trainingLabelKey,
      falsePositiveCostEligibleKey: `${args.trainingLabelKey}FalsePositiveCostEligible`,
      episodeGapDays: EPISODE_GAP_DAYS,
      preEpisodeGreyZoneDays: args.greyZoneDays,
      classRules: [
        {
          class: "positive",
          condition: `${args.labelKey} == true`,
          trainingLabel: true,
          falsePositiveCostEligible: true
        },
        {
          class: "pre_episode_grey_zone",
          condition: `${args.labelKey} == false and same-point next positive episode starts within ${args.greyZoneDays}d`,
          trainingLabel: null,
          falsePositiveCostEligible: false
        },
        {
          class: "negative",
          condition: `${args.labelKey} == false and no same-point next positive episode starts within ${args.greyZoneDays}d`,
          trainingLabel: false,
          falsePositiveCostEligible: true
        }
      ],
      promotionBoundary:
        "Offline label policy only; do not write runtime registry or change online matcher until retrained seasonal expert passes stability gates."
    },
    outputs: {
      train: trainOutputPath,
      validation: validationOutputPath
    },
    splits: [train.summary, validation.summary],
    decision:
      "Use this as a label overlay for offline retraining/evaluation. Do not overwrite the original derived labels; keep immediate labels for traceability and use the grey-zone-excluded label only in controlled experiments."
  };
  const reportPath = path.join(outDir, "baijiabao-episode-grey-zone-label-policy.report.json");
  const policyPath = path.join(outDir, "baijiabao-episode-grey-zone-label-policy.json");
  const mdPath = path.join(outDir, "baijiabao-episode-grey-zone-label-policy.md");
  const reviewCsvPath = path.join(outDir, "baijiabao-episode-grey-zone-label-policy.rows.csv");
  await writeJson(reportPath, report);
  await writeJson(policyPath, report.policy);
  await writeText(mdPath, renderMarkdown(report));
  await writeText(reviewCsvPath, toCsv([...train.reviewRows, ...validation.reviewRows]));
  console.log(
    JSON.stringify(
      {
        reportPath,
        policyPath,
        markdownPath: mdPath,
        reviewCsvPath,
        outputs: report.outputs,
        splits: report.splits,
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
