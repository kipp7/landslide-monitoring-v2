import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const require = createRequire(import.meta.url);
const { runPredictionRegressionArtifact } = require(path.resolve("libs/regional-model-library/dist"));
const { loadArtifactRegistry } = require(
  path.resolve("services/ai-prediction-worker/dist/pipeline/artifacts/artifact-registry.js")
);
const { predictFromTelemetry } = require(
  path.resolve("services/ai-prediction-worker/dist/pipeline/predict-pipeline.js")
);

const REGISTRY_ROOT = "artifacts/models/regional-experts/phase1-displacement-forecast";
const OUT_JSON = path.join(REGISTRY_ROOT, "check-displacement-production-main-routing.report.json");
const OUT_MD = path.join(REGISTRY_ROOT, "check-displacement-production-main-routing.report.md");

const BAIJIABAO_MODEL_KEY =
  "baijiabao.displacement.pointwise-fixed-expert-ensemble-v31-dev-gated-state-protected-v33";
const BADONG_MODEL_KEY =
  "badong-huangtupo.displacement.hgb-point-gated-v5-selector-v7";

async function writeJson(filePath, payload) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
}

async function writeText(filePath, payload) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, payload, "utf-8");
}

function asRecord(value) {
  return typeof value === "object" && value !== null ? value : {};
}

function readString(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readMetadataRole(artifact) {
  const metadata = asRecord(artifact?.metadata);
  const routing = asRecord(metadata.routing);
  const matcher = asRecord(metadata.matcher);
  return readString(metadata.operationalRole) ?? readString(routing.operationalRole) ?? readString(matcher.operationalRole);
}

function isActiveProductionForecast(artifactRef) {
  const metadata = asRecord(artifactRef.metadata);
  return (
    metadata.activeProduction === true &&
    (metadata.operationalRole === "forecast" ||
      asRecord(metadata.routing).operationalRole === "forecast" ||
      asRecord(metadata.matcher).operationalRole === "forecast")
  );
}

function selectForecastArtifact(registry, context) {
  const scopes = [
    { scopeType: "station", scopeKey: context.stationCode },
    { scopeType: "slope", scopeKey: context.slopeCode },
    { scopeType: "region", scopeKey: context.regionCode },
    { scopeType: "global", scopeKey: null }
  ];

  for (const scope of scopes) {
    const artifact = registry
      .getCandidates(scope.scopeType, scope.scopeKey)
      .find((candidate) => readMetadataRole(candidate) === "forecast");
    if (artifact) {
      return {
        scopeType: scope.scopeType,
        requestedScopeKey: scope.scopeKey,
        modelKey: artifact.modelKey,
        modelVersion: artifact.modelVersion,
        artifactScopeType: artifact.scopeType,
        artifactScopeKey: artifact.scopeKey
      };
    }
  }

  return {
    scopeType: null,
    requestedScopeKey: null,
    modelKey: null,
    modelVersion: null,
    artifactScopeType: null,
    artifactScopeKey: null
  };
}

function makePg(identity) {
  return {
    async query() {
      return {
        rows: [
          {
            device_id: identity.deviceId,
            station_id: identity.stationId,
            device_metadata: identity.deviceMetadata,
            station_code: identity.stationCode,
            station_metadata: identity.stationMetadata
          }
        ]
      };
    }
  };
}

function makeClickhouse(rows) {
  return {
    async query() {
      return {
        async json() {
          return rows;
        }
      };
    }
  };
}

function historyRows(anchorTs, points) {
  return points.map((point) => ({
    sensor_key: point.sensorKey,
    received_ts_text: new Date(Date.parse(anchorTs) - point.hoursBeforeAnchor * 3600 * 1000).toISOString(),
    value_f64: point.value,
    value_i64: null,
    value_str: null,
    value_bool: null
  }));
}

async function runPipelineCase(registry, testCase) {
  const result = await predictFromTelemetry({
    clickhouse: makeClickhouse(testCase.historyRows),
    pg: makePg(testCase.identity),
    artifactRegistry: registry,
    config: {
      clickhouseDatabase: "landslide",
      clickhouseTable: "telemetry_raw",
      featureHistoryLookbackHours: 192,
      predictHorizonSeconds: 86400
    },
    telemetry: {
      schema_version: 1,
      received_ts: testCase.anchorTs,
      device_id: testCase.identity.deviceId,
      metrics: testCase.metrics
    }
  });

  const forecastInference =
    typeof result.payloadExt.forecastInference === "object" && result.payloadExt.forecastInference !== null
      ? result.payloadExt.forecastInference
      : null;
  const pass =
    testCase.expectedForecastModelKey === null
      ? forecastInference === null
      : forecastInference?.modelKey === testCase.expectedForecastModelKey &&
        forecastInference?.requiredFeaturesSatisfied === true &&
        typeof forecastInference?.predictedDisplacementMm === "number";

  return {
    caseKey: testCase.caseKey,
    description: testCase.description,
    pass,
    expectedForecastModelKey: testCase.expectedForecastModelKey,
    stationCode: testCase.identity.stationCode,
    regionCode: testCase.identity.deviceMetadata.regionCode ?? testCase.identity.stationMetadata.regionCode ?? null,
    primaryModelKey: result.modelKey,
    primaryFallbackReason: result.payloadExt.fallbackReason ?? null,
    forecastPresent: forecastInference !== null,
    forecastModelKey: forecastInference?.modelKey ?? null,
    forecastModelVersion: forecastInference?.modelVersion ?? null,
    forecastPredictedDisplacementMm: forecastInference?.predictedDisplacementMm ?? null,
    forecastRequiredFeaturesSatisfied: forecastInference?.requiredFeaturesSatisfied ?? null,
    forecastMissingFeatureKeys: forecastInference?.missingFeatureKeys ?? null,
    matchedRiskModelKey: result.payloadExt.matchedModelKey ?? null,
    traceRefs: result.payloadExt.traceRefs ?? null
  };
}

function directExecutionProbe(artifact, values, pointId, eventTs) {
  const execution = runPredictionRegressionArtifact(artifact, {
    values,
    pointId,
    eventTs
  });
  return {
    modelKey: artifact.modelKey,
    modelVersion: artifact.modelVersion,
    requiredFeatureCount: artifact.requiredFeatureKeys.length,
    requiredFeatureKeys: artifact.requiredFeatureKeys,
    executable: execution !== null,
    predictedDisplacementMm: execution?.predictedValue ?? null,
    explain: execution?.explain ?? "missing required features or incompatible direct input"
  };
}

function buildMarkdown(report) {
  const routeRows = report.pipelineCases
    .map(
      (entry) =>
        `| ${entry.caseKey} | ${entry.pass ? "pass" : "fail"} | ${entry.expectedForecastModelKey ?? "none"} | ${entry.forecastModelKey ?? "none"} | ${entry.forecastRequiredFeaturesSatisfied ?? "n/a"} | ${entry.forecastPredictedDisplacementMm ?? "n/a"} |`
    )
    .join("\n");
  const indexRows = report.productionMainIndex
    .map(
      (entry) =>
        `| ${entry.scopeType} | ${entry.scopeKey} | ${entry.modelKey}@${entry.modelVersion} | ${entry.registryRole ?? "n/a"} |`
    )
    .join("\n");

  return `# Displacement Production-main Routing Proof

Generated at: ${report.generatedAt}

## Verdict

- pass: ${String(report.pass)}
- active global production-main: ${report.registryActiveModelKey}@${report.registryActiveModelVersion}
- regional production-main count: ${String(report.productionMainIndex.length)}
- boundary: displacement forecast is emitted only under \`forecastInference.predictedDisplacementMm\`; risk fields remain separate.

## Production-main Index

| scopeType | scopeKey | model | registryRole |
| --- | --- | --- | --- |
${indexRows}

## Runtime Route Cases

| case | pass | expectedForecastModelKey | actualForecastModelKey | requiredFeaturesSatisfied | predictedDisplacementMm |
| --- | --- | --- | --- | --- | --- |
${routeRows}

## Cross-region Boundary Probe

- Baijiabao v33 on Badong-style minimal input executable: ${String(report.crossRegionBoundaryProbe.baijiabaoV33OnBadongMinimal.executable)}
- Badong production-main on Baijiabao-style minimal input executable: ${String(report.crossRegionBoundaryProbe.badongProductionMainOnBaijiabaoMinimal.executable)}
- Interpretation: execution compatibility is not the routing rule. The production rule is scope-first regional matching; mismatched regions are not promoted as evidence of cross-region generalization.
`;
}

async function main() {
  const registryRoot = path.resolve(REGISTRY_ROOT);
  const registryFile = JSON.parse(await readFile(path.join(REGISTRY_ROOT, "registry.json"), "utf-8"));
  const registry = await loadArtifactRegistry(registryRoot);
  const artifacts = registry.list();
  const baijiabao = artifacts.find((artifact) => artifact.modelKey === BAIJIABAO_MODEL_KEY);
  const badong = artifacts.find((artifact) => artifact.modelKey === BADONG_MODEL_KEY);
  if (!baijiabao) throw new Error(`Missing ${BAIJIABAO_MODEL_KEY}`);
  if (!badong) throw new Error(`Missing ${BADONG_MODEL_KEY}`);

  const productionMainIndex = registryFile.artifacts
    .filter(isActiveProductionForecast)
    .map((entry) => ({
      modelKey: entry.modelKey,
      modelVersion: entry.modelVersion,
      scopeType: entry.scopeType,
      scopeKey: entry.scopeKey,
      registryRole: asRecord(entry.metadata).registryRole ?? null,
      displayName: asRecord(entry.metadata).displayName ?? null
    }));

  const routeProbeCases = [
    {
      caseKey: "baijiabao-station-canonical",
      context: { stationCode: "Baijiabao", slopeCode: null, regionCode: "CN-420527" },
      expectedModelKey: BAIJIABAO_MODEL_KEY
    },
    {
      caseKey: "baijiabao-station-chinese-alias",
      context: { stationCode: "白家包", slopeCode: null, regionCode: "CN-420527" },
      expectedModelKey: BAIJIABAO_MODEL_KEY
    },
    {
      caseKey: "badong-region-canonical",
      context: { stationCode: "P1", slopeCode: "Badong-Huangtupo", regionCode: "CN-HB-BADONG-HUANGTUPO" },
      expectedModelKey: BADONG_MODEL_KEY
    },
    {
      caseKey: "badong-region-admin-code-alias",
      context: { stationCode: "P1", slopeCode: null, regionCode: "CN-420823" },
      expectedModelKey: BADONG_MODEL_KEY
    },
    {
      caseKey: "unknown-region-no-forecast",
      context: { stationCode: "UNKNOWN-STATION", slopeCode: null, regionCode: "CN-UNKNOWN" },
      expectedModelKey: null
    }
  ].map((testCase) => {
    const selected = selectForecastArtifact(registry, testCase.context);
    return {
      ...testCase,
      selected,
      pass: selected.modelKey === testCase.expectedModelKey
    };
  });

  const baijiabaoAnchorTs = "2024-07-04T00:00:00.000Z";
  const badongAnchorTs = "2025-03-08T00:00:00.000Z";
  const pipelineCases = await Promise.all([
    runPipelineCase(registry, {
      caseKey: "baijiabao-runtime-station-alias",
      description: "Station alias routes to Baijiabao v33 forecast production-main.",
      expectedForecastModelKey: BAIJIABAO_MODEL_KEY,
      anchorTs: baijiabaoAnchorTs,
      identity: {
        deviceId: "prod-route-baijiabao",
        stationId: "station-baijiabao-proof",
        stationCode: "白家包",
        deviceMetadata: {
          stationCode: "白家包",
          slopeCode: "ThreeGorges-Baijiabao",
          regionCode: "CN-420527",
          identityClass: "production_route_proof"
        },
        stationMetadata: {
          stationCode: "白家包",
          slopeCode: "ThreeGorges-Baijiabao",
          regionCode: "CN-420527"
        }
      },
      metrics: {
        displacementSurfaceMm: 102,
        rainfallCurrentMm: 2,
        reservoirLevelM: 165.6
      },
      historyRows: historyRows(baijiabaoAnchorTs, [
        { sensorKey: "displacementSurfaceMm", hoursBeforeAnchor: 72, value: 100 },
        { sensorKey: "displacementSurfaceMm", hoursBeforeAnchor: 24, value: 101.2 },
        { sensorKey: "displacementSurfaceMm", hoursBeforeAnchor: 0, value: 102 },
        { sensorKey: "rainfallCurrentMm", hoursBeforeAnchor: 72, value: 3 },
        { sensorKey: "rainfallCurrentMm", hoursBeforeAnchor: 24, value: 5 },
        { sensorKey: "rainfallCurrentMm", hoursBeforeAnchor: 0, value: 2 },
        { sensorKey: "reservoirLevelM", hoursBeforeAnchor: 72, value: 165.1 },
        { sensorKey: "reservoirLevelM", hoursBeforeAnchor: 24, value: 165.4 },
        { sensorKey: "reservoirLevelM", hoursBeforeAnchor: 0, value: 165.6 }
      ])
    }),
    runPipelineCase(registry, {
      caseKey: "badong-runtime-region-alias",
      description: "Badong admin-code alias routes to Badong regional forecast production-main.",
      expectedForecastModelKey: BADONG_MODEL_KEY,
      anchorTs: badongAnchorTs,
      identity: {
        deviceId: "prod-route-badong",
        stationId: "station-badong-proof",
        stationCode: "P1",
        deviceMetadata: {
          stationCode: "P1",
          slopeCode: "Badong-Huangtupo",
          regionCode: "CN-420823",
          identityClass: "production_route_proof"
        },
        stationMetadata: {
          stationCode: "P1",
          slopeCode: "Badong-Huangtupo",
          regionCode: "CN-420823"
        }
      },
      metrics: {
        displacementSurfaceMm: 29.1,
        beidouDispX: 1.5,
        beidouDispY: -0.55,
        beidouDispZ: -1,
        beidouDisplacementChangeMm: 1.85,
        rainfallCurrentMm: 1
      },
      historyRows: historyRows(badongAnchorTs, [
        { sensorKey: "displacementSurfaceMm", hoursBeforeAnchor: 72, value: 28.4 },
        { sensorKey: "displacementSurfaceMm", hoursBeforeAnchor: 24, value: 28.8 },
        { sensorKey: "displacementSurfaceMm", hoursBeforeAnchor: 0, value: 29.1 },
        { sensorKey: "beidouDispX", hoursBeforeAnchor: 72, value: 1.2 },
        { sensorKey: "beidouDispX", hoursBeforeAnchor: 24, value: 1.4 },
        { sensorKey: "beidouDispX", hoursBeforeAnchor: 0, value: 1.5 },
        { sensorKey: "beidouDispY", hoursBeforeAnchor: 72, value: -0.4 },
        { sensorKey: "beidouDispY", hoursBeforeAnchor: 24, value: -0.5 },
        { sensorKey: "beidouDispY", hoursBeforeAnchor: 0, value: -0.55 },
        { sensorKey: "beidouDispZ", hoursBeforeAnchor: 72, value: -0.8 },
        { sensorKey: "beidouDispZ", hoursBeforeAnchor: 24, value: -0.9 },
        { sensorKey: "beidouDispZ", hoursBeforeAnchor: 0, value: -1 },
        { sensorKey: "rainfallCurrentMm", hoursBeforeAnchor: 72, value: 12 },
        { sensorKey: "rainfallCurrentMm", hoursBeforeAnchor: 24, value: 8 },
        { sensorKey: "rainfallCurrentMm", hoursBeforeAnchor: 0, value: 1 }
      ])
    }),
    runPipelineCase(registry, {
      caseKey: "unknown-runtime-no-forecast",
      description: "Unknown region must not borrow Baijiabao or Badong forecast production-main.",
      expectedForecastModelKey: null,
      anchorTs: "2025-01-01T00:00:00.000Z",
      identity: {
        deviceId: "prod-route-unknown",
        stationId: "station-unknown-proof",
        stationCode: "UNKNOWN-STATION",
        deviceMetadata: {
          stationCode: "UNKNOWN-STATION",
          regionCode: "CN-UNKNOWN",
          identityClass: "production_route_proof"
        },
        stationMetadata: {
          stationCode: "UNKNOWN-STATION",
          regionCode: "CN-UNKNOWN"
        }
      },
      metrics: {
        displacementSurfaceMm: 12.3,
        rainfallCurrentMm: 0
      },
      historyRows: []
    })
  ]);

  const crossRegionBoundaryProbe = {
    baijiabaoV33OnBadongMinimal: directExecutionProbe(
      baijiabao,
      { displacementSurfaceMm: 29.1, rainfallCurrentMm: 1 },
      "P1",
      badongAnchorTs
    ),
    badongProductionMainOnBaijiabaoMinimal: directExecutionProbe(
      badong,
      { displacementSurfaceMm: 102, rainfallCurrentMm: 2, reservoirLevelM: 165.6 },
      "Baijiabao",
      baijiabaoAnchorTs
    )
  };

  const report = {
    generatedAt: new Date().toISOString(),
    pass:
      productionMainIndex.some((entry) => entry.modelKey === BAIJIABAO_MODEL_KEY) &&
      productionMainIndex.some((entry) => entry.modelKey === BADONG_MODEL_KEY) &&
      routeProbeCases.every((entry) => entry.pass) &&
      pipelineCases.every((entry) => entry.pass),
    registryRoot: REGISTRY_ROOT,
    registryActiveModelKey: registryFile.activeModelKey,
    registryActiveModelVersion: registryFile.activeModelVersion,
    productionMainIndex,
    routeProbeCases,
    pipelineCases,
    crossRegionBoundaryProbe,
    runtimeBoundary: {
      displacementForecastField: "payloadExt.forecastInference.predictedDisplacementMm",
      riskScoreField: "riskScore",
      riskLevelField: "riskLevel",
      rule: "Forecast production-main artifacts are selected by station/slope/region/global scope order and are not reused as warning risk artifacts."
    }
  };

  await writeJson(OUT_JSON, report);
  await writeText(OUT_MD, buildMarkdown(report));
  console.log(`Pass: ${report.pass}`);
  console.log(`Production mains: ${productionMainIndex.map((entry) => `${entry.scopeKey}:${entry.modelKey}@${entry.modelVersion}`).join("; ")}`);
  console.log(`Pipeline cases: ${pipelineCases.map((entry) => `${entry.caseKey}=${entry.pass ? "pass" : "fail"}:${entry.forecastModelKey ?? "none"}`).join("; ")}`);
  console.log(`Report JSON: ${OUT_JSON}`);
  console.log(`Report MD: ${OUT_MD}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
