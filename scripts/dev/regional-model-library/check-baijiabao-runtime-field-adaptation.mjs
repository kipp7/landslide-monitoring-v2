import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const DEFAULT_OUT_DIR = ".tmp/regional-model-library/out/artifacts/baijiabao-runtime-field-adaptation";
const MODELS = [
  {
    key: "published",
    role: "current-runtime-candidate",
    registryPath: "artifacts/models/regional-experts/phase1-monitoring-candidates/registry.json"
  },
  {
    key: "balancedChallenger",
    role: "main-warning-candidate",
    registryPath:
      ".tmp/regional-model-library/out/artifacts/baijiabao-monitoring-challenger-grid/best-balanced-accuracy.registry.json"
  },
  {
    key: "lowFalsePositiveChallenger",
    role: "confirmation-candidate",
    registryPath:
      ".tmp/regional-model-library/out/artifacts/baijiabao-monitoring-challenger-grid/best-eligible.registry.json"
  }
];

const FEATURE_WINDOW_HOURS = [6, 24, 72];

const FEATURE_DEFINITIONS = [
  {
    canonicalKey: "displacementSurfaceMm",
    sourceMetricKeys: [
      "displacementSurfaceMm",
      "displacement_mm",
      "displacement",
      "disp_mm",
      "gps_displacement_mm",
      "cumulative_displacement_mm"
    ],
    windowAggregates: ["last", "delta", "mean", "min", "max"],
    payloadSummaryKeys: ["displacementAbsMm", "displacementDelta24h"]
  },
  {
    canonicalKey: "crackDisplacementMm",
    sourceMetricKeys: ["crackDisplacementMm", "crack_displacement_mm", "crack_width_mm", "crack_mm"],
    windowAggregates: ["last", "delta", "mean", "min", "max"],
    payloadSummaryKeys: []
  },
  {
    canonicalKey: "rainfallCurrentMm",
    sourceMetricKeys: ["rainfallCurrentMm", "rainfall_mm", "rain_mm", "precipitation_mm", "precipitation", "rainfall"],
    windowAggregates: ["last", "sum", "mean", "max"],
    payloadSummaryKeys: ["rainfallCurrentMm", "rainfallSum24h", "rainfallSum72h"]
  },
  {
    canonicalKey: "reservoirLevelM",
    sourceMetricKeys: ["reservoirLevelM", "reservoir_level_m", "water_level_m", "level_m"],
    windowAggregates: ["last", "delta", "mean", "min", "max"],
    payloadSummaryKeys: ["reservoirLevelM"]
  },
  {
    canonicalKey: "groundwaterLevelM",
    sourceMetricKeys: ["groundwater_level_m", "groundwater_m", "water_table_m"],
    windowAggregates: ["last", "delta", "mean", "min", "max"],
    payloadSummaryKeys: ["groundwaterLevelM"]
  },
  {
    canonicalKey: "airTemperatureC",
    sourceMetricKeys: ["temperature_c", "air_temperature_c", "temp_c"],
    windowAggregates: ["last", "mean", "min", "max"],
    payloadSummaryKeys: []
  },
  {
    canonicalKey: "beidouDispX",
    sourceMetricKeys: ["dx", "beidou_dx", "disp_x"],
    windowAggregates: ["last", "delta", "mean", "min", "max"],
    payloadSummaryKeys: []
  },
  {
    canonicalKey: "beidouDispY",
    sourceMetricKeys: ["dy", "beidou_dy", "disp_y"],
    windowAggregates: ["last", "delta", "mean", "min", "max"],
    payloadSummaryKeys: []
  },
  {
    canonicalKey: "beidouDispZ",
    sourceMetricKeys: ["dz", "beidou_dz", "disp_z"],
    windowAggregates: ["last", "delta", "mean", "min", "max"],
    payloadSummaryKeys: []
  },
  {
    canonicalKey: "tunnelFlowRate",
    sourceMetricKeys: ["flow_rate", "flow_total", "tunnel_flow_rate"],
    windowAggregates: ["last", "mean", "min", "max"],
    payloadSummaryKeys: []
  }
];

function parseArgs(argv) {
  const parsed = { outDir: DEFAULT_OUT_DIR };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--out-dir") parsed.outDir = argv[++index] ?? parsed.outDir;
  }
  return parsed;
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

async function writeText(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, value, "utf-8");
}

async function readArtifactFromRegistry(filePath) {
  const parsed = JSON.parse(await readFile(filePath, "utf-8"));
  const artifact = Array.isArray(parsed.artifacts) ? parsed.artifacts[0] : null;
  if (!artifact) throw new Error(`No artifact found in ${filePath}`);
  return artifact;
}

function findDefinition(canonicalKey) {
  return FEATURE_DEFINITIONS.find((definition) => definition.canonicalKey === canonicalKey) ?? null;
}

function parseRequiredFeatureKey(featureKey) {
  const match = featureKey.match(/^(.+)_(last|delta|mean|min|max|sum)_(6h|24h|72h)$/u);
  if (!match) {
    return {
      featureKey,
      canonicalKey: featureKey,
      aggregate: null,
      window: null,
      runtimeSource: "current-telemetry-or-latest-history"
    };
  }
  return {
    featureKey,
    canonicalKey: match[1],
    aggregate: match[2],
    window: match[3],
    runtimeSource: "historical-window"
  };
}

function fieldAdaptation(featureKey) {
  const parsed = parseRequiredFeatureKey(featureKey);
  const definition = findDefinition(parsed.canonicalKey);
  const sourceMetricKeys = definition?.sourceMetricKeys ?? [];
  const payloadSummaryKeys = definition?.payloadSummaryKeys ?? [];
  const windowHours = parsed.window ? Number(parsed.window.replace("h", "")) : null;
  const canonicalSupported = definition !== null;
  const aggregateSupported = parsed.aggregate === null || definition?.windowAggregates.includes(parsed.aggregate) === true;
  const windowSupported = windowHours === null || FEATURE_WINDOW_HOURS.includes(windowHours);
  const supported = canonicalSupported && aggregateSupported && windowSupported;
  const requiredRuntimeInputs =
    parsed.aggregate === null
      ? [
          {
            layer: "telemetry.metrics",
            acceptedKeys: sourceMetricKeys,
            note: "The current telemetry message can provide this value directly."
          },
          {
            layer: "ClickHouse telemetry_raw",
            acceptedSensorKeys: sourceMetricKeys,
            note: "If the current telemetry message omits the value, worker can backfill the latest historical value."
          }
        ]
      : [
          {
            layer: "ClickHouse telemetry_raw",
            acceptedSensorKeys: sourceMetricKeys,
            requiredWindow: parsed.window,
            aggregate: parsed.aggregate,
            note: "Worker derives this feature from historical points for the same device."
          },
          {
            layer: "telemetry.metrics",
            acceptedKeys: sourceMetricKeys,
            note: "The current message is appended into the runtime history window before aggregation."
          }
        ];

  return {
    featureKey,
    canonicalKey: parsed.canonicalKey,
    aggregate: parsed.aggregate,
    window: parsed.window,
    runtimeSource: parsed.runtimeSource,
    supported,
    supportReasons: {
      canonicalSupported,
      aggregateSupported,
      windowSupported
    },
    sourceMetricKeys,
    requiredRuntimeInputs,
    canonicalFeatureKey: parsed.canonicalKey,
    modelRequiredFeatureKey: featureKey,
    payloadEvidence: {
      featureSummaryKeys: payloadSummaryKeys,
      presentFeatureKeysPath: "payload.featureSummary.presentFeatureKeys",
      windowCoveragePath: parsed.aggregate === null ? null : `payload.windowSummary.coverage.${parsed.window}.${parsed.canonicalKey}`,
      missingFeatureKeysPath: "payload.missingFeatureKeys",
      matchTracePath: "payload.matchTrace.candidateSet[].missingFeatureKeys"
    }
  };
}

function summarizeModel(model, artifact) {
  const requiredFeatureKeys = artifact.requiredFeatureKeys ?? [];
  const fields = requiredFeatureKeys.map(fieldAdaptation);
  const unsupportedFields = fields.filter((field) => !field.supported);
  const canonicalInputs = Array.from(new Set(fields.map((field) => field.canonicalKey))).sort();
  const acceptedSensorKeys = Array.from(new Set(fields.flatMap((field) => field.sourceMetricKeys))).sort();
  const historicalWindowRequired = fields.some((field) => field.runtimeSource === "historical-window");

  return {
    key: model.key,
    role: model.role,
    registryPath: model.registryPath,
    modelKey: artifact.modelKey,
    modelVersion: artifact.modelVersion ?? null,
    featureFamilyKey: artifact.metadata?.featureFamilyKey ?? "published-current-all-no-crack",
    requiredFeatureCount: requiredFeatureKeys.length,
    canonicalInputs,
    acceptedSensorKeys,
    historicalWindowRequired,
    supported: unsupportedFields.length === 0,
    unsupportedFields: unsupportedFields.map((field) => field.featureKey),
    fields
  };
}

function renderMarkdown(report) {
  const lines = [];
  lines.push("# Baijiabao Runtime Field Adaptation");
  lines.push("");
  lines.push(`Generated at: ${report.generatedAt}`);
  lines.push("");
  lines.push("## Rule");
  lines.push("");
  lines.push("Do not rename raw data directly into UI fields. The stable chain is:");
  lines.push("");
  lines.push("`telemetry.metrics / ClickHouse sensor_key aliases -> worker canonical feature -> model requiredFeatureKey -> ai_predictions.payload evidence`");
  lines.push("");
  lines.push("## Model Summary");
  lines.push("");
  lines.push("| model | role | feature family | required | canonical inputs | supported |");
  lines.push("|---|---|---|---:|---|---|");
  for (const model of report.models) {
    lines.push(
      `| ${model.key} | ${model.role} | ${model.featureFamilyKey} | ${model.requiredFeatureCount} | ${model.canonicalInputs.join(
        ", "
      )} | ${model.supported ? "yes" : "no"} |`
    );
  }
  lines.push("");
  lines.push("## Accepted Runtime Sensor Keys");
  lines.push("");
  for (const model of report.models) {
    lines.push(`- ${model.key}: ${model.acceptedSensorKeys.join(", ")}`);
  }
  lines.push("");
  lines.push("## Required Field Matrix");
  for (const model of report.models) {
    lines.push("");
    lines.push(`### ${model.key}`);
    lines.push("");
    lines.push("| model required field | canonical feature | runtime source | accepted input aliases | payload evidence | supported |");
    lines.push("|---|---|---|---|---|---|");
    for (const field of model.fields) {
      const evidence = [
        field.payloadEvidence.presentFeatureKeysPath,
        field.payloadEvidence.windowCoveragePath,
        field.payloadEvidence.missingFeatureKeysPath
      ]
        .filter(Boolean)
        .join("<br>");
      lines.push(
        `| ${field.modelRequiredFeatureKey} | ${field.canonicalFeatureKey} | ${field.runtimeSource}${
          field.window ? ` ${field.window}` : ""
        } | ${field.sourceMetricKeys.join("<br>")} | ${evidence} | ${field.supported ? "yes" : "no"} |`
      );
    }
  }
  lines.push("");
  lines.push("## Decision");
  lines.push("");
  lines.push("- The balanced warning challenger is field-compatible with current worker runtime because it only needs rainfall and reservoir features already produced by `feature-builder`.");
  lines.push("- The low-false-positive confirmation challenger is field-compatible because it only needs reservoir features already produced by `feature-builder`.");
  lines.push("- Both challengers require historical ClickHouse coverage for 6h/24h/72h window fields; without ClickHouse they can fall back only if the required window features are not selected or enough current telemetry history is present.");
  lines.push("- UI/API adaptation should read evidence from `ai_predictions.payload`, not from raw telemetry aliases.");
  lines.push("");
  return `${lines.join("\n")}\n`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = process.cwd();
  const outDir = path.resolve(repoRoot, args.outDir);
  const models = [];

  for (const model of MODELS) {
    const registryPath = path.resolve(repoRoot, model.registryPath);
    const artifact = await readArtifactFromRegistry(registryPath);
    models.push(summarizeModel({ ...model, registryPath }, artifact));
  }

  const report = {
    generatedAt: new Date().toISOString(),
    runtimeContract: {
      rawLayer: ["telemetry.metrics", "ClickHouse telemetry_raw.sensor_key"],
      canonicalLayer: "services/ai-prediction-worker/src/pipeline/feature-definitions.ts",
      featureBuilder: "services/ai-prediction-worker/src/pipeline/feature-builder.ts",
      payloadEvidenceLayer: "ai_predictions.payload"
    },
    supportedWindows: FEATURE_WINDOW_HOURS.map((hours) => `${hours}h`),
    models,
    overallSupported: models.every((model) => model.supported)
  };

  const jsonPath = path.join(outDir, "baijiabao-runtime-field-adaptation.report.json");
  const mdPath = path.join(outDir, "baijiabao-runtime-field-adaptation.report.md");
  await writeJson(jsonPath, report);
  await writeText(mdPath, renderMarkdown(report));

  console.log(
    JSON.stringify(
      {
        reportPath: jsonPath,
        markdownPath: mdPath,
        overallSupported: report.overallSupported,
        models: report.models.map((model) => ({
          key: model.key,
          modelKey: model.modelKey,
          requiredFeatureCount: model.requiredFeatureCount,
          canonicalInputs: model.canonicalInputs,
          historicalWindowRequired: model.historicalWindowRequired,
          supported: model.supported,
          unsupportedFields: model.unsupportedFields
        }))
      },
      null,
      2
    )
  );

  if (!report.overallSupported) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
