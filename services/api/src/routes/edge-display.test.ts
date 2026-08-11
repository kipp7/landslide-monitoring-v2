import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { loadConfigFromEnv } from "../config";
import type { PgPool } from "../postgres";
import { buildEdgeDisplayModelSummary, isEdgeDisplayReadRequest } from "./edge-display";

function fakePool(): PgPool {
  const query = async (sql: string) => {
    if (sql.includes("FROM stations s")) {
      return { rows: [{
        station_id: "10000000-0000-0000-0000-000000000001",
        station_code: "ST-LS-CN-GX-YL-GBS-001-01",
        station_name: "GBS Landslide Station 01",
        status: "active",
        device_count: "3",
        online_device_count: "0",
        latest_device_seen_at: "2026-08-10T22:28:13.547Z",
      }] };
    }
    if (sql.includes("persisted_version_count")) {
      return { rows: [{
        persisted_version_count: "44",
        predictions_24h: "580",
        latest_prediction_at: "2026-08-10T22:56:17.049Z",
      }] };
    }
    if (sql.includes("DISTINCT ON")) {
      return { rows: [
        {
          device_id: "00000000-0000-0000-0000-000000000001",
          model_version: "20260810T211304Z",
          horizon_seconds: 3600,
          risk_score: 0.028,
          risk_level: "low",
          payload: {
            confidence: 0.5623,
            dataStatus: "offline",
            dataUpdatedAt: "2026-08-10T22:28:13.593Z",
            features: [{
              key: "tilt_deviation",
              label: "倾角偏移",
              unit: "deg",
              value: 0.3607,
              score: 0.0721,
              weight: 0.28,
              available: true,
            }],
          },
          created_at: "2026-08-10T22:56:17.049Z",
        },
        {
          device_id: "00000000-0000-0000-0000-000000000002",
          model_version: "20260810T211304Z",
          horizon_seconds: 3600,
          risk_score: 0.31,
          risk_level: "low",
          payload: {
            riskLevel: "normal",
            confidence: 0.61,
            dataStatus: "offline",
            dataUpdatedAt: "2026-08-10T22:28:11.853Z",
            hardRuleTriggered: false,
            executionPolicy: "advisory-first-hard-rules-protected",
            factors: ["倾角偏移 0.8deg"],
            features: [
              {
                key: "tilt_deviation",
                label: "倾角偏移",
                unit: "deg",
                value: 0.8,
                score: 0.2,
                weight: 0.28,
                available: true,
              },
              {
                key: "gps_displacement",
                label: "GPS基线位移",
                unit: "m",
                value: null,
                score: 0,
                weight: 0.2,
                available: false,
              },
            ],
          },
          created_at: "2026-08-10T22:56:12.088Z",
        },
      ] };
    }
    if (sql.includes("date_trunc('hour'")) {
      return { rows: [
        { bucket_at: "2026-08-10T21:00:00Z", risk_score: 0.22 },
        { bucket_at: "2026-08-10T22:00:00Z", risk_score: 0.31 },
      ] };
    }
    if (sql.includes("GROUP BY model_version")) {
      return { rows: [{
        model_version: "20260810T211304Z",
        first_prediction_at: "2026-08-10T21:13:08.856Z",
        last_prediction_at: "2026-08-10T22:56:17.049Z",
        prediction_count: "347",
      }] };
    }
    throw new Error(`unexpected query: ${sql}`);
  };
  return {
    connect: async () => ({ query, release: () => undefined }),
  } as unknown as PgPool;
}

test("edge display read token is scoped to the edge display route", () => {
  const config = { edgeDisplayReadToken: "display-only-token" };
  assert.equal(
    isEdgeDisplayReadRequest(config, "/api/v1/edge-display/model-summary", "Bearer display-only-token"),
    true
  );
  assert.equal(
    isEdgeDisplayReadRequest(config, "/api/v1/system/overview", "Bearer display-only-token"),
    false
  );
  assert.equal(
    isEdgeDisplayReadRequest(config, "/api/v1/edge-display/model-summary", "Bearer wrong-token"),
    false
  );
});

test("model summary uses persisted facts and preserves unavailable evaluation states", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "lsmv2-edge-display-"));
  const artifactPath = path.join(directory, "latest.json");
  const evaluationPath = path.join(directory, "evaluation.json");
  await fs.writeFile(artifactPath, JSON.stringify({
    modelKey: "landslide-edge-risk",
    modelVersion: "20260810T211304Z",
    modelType: "robust_baseline_ensemble",
    trainedAt: "2026-08-10T21:13:04.393Z",
    trainingWindowHours: 24,
    trainingSource: "landslide.telemetry_raw",
    sampleCount: 20286,
    deviceCount: 3,
  }));
  await fs.writeFile(evaluationPath, JSON.stringify({
    displayName: "BJB-DP-ENS-SUPPORT-CAL-v22",
    modelKey: "baijiabao.displacement.v22",
    modelVersion: "0.22.0",
    evaluatedSamples: 1352,
    metrics: { maeMm: 0.6263070948659626, withinOneMm: 0.8114 },
  }));

  try {
    const config = loadConfigFromEnv({
      CLICKHOUSE_URL: "http://127.0.0.1:8123",
      EDGE_MODEL_ARTIFACT_PATH: artifactPath,
      REGIONAL_MODEL_EVALUATION_PATH: evaluationPath,
    });
    const summary = await buildEdgeDisplayModelSummary({
      config,
      pg: fakePool(),
      now: new Date("2026-08-10T23:00:00.000Z"),
    });

    assert.equal(summary.station.name, "GBS Landslide Station 01");
    assert.equal(summary.model.persistedVersionCount, 44);
    assert.equal(summary.model.sampleCount, 20286);
    assert.equal(summary.currentAssessment.riskScore, 0.31);
    assert.equal(summary.currentAssessment.sourceDeviceCount, 2);
    assert.equal(summary.currentAssessment.features[0]?.contribution, 0.05600000000000001);
    assert.deepEqual(summary.displacementForecast.missingInputs, ["GPS基线位移"]);
    assert.equal(summary.evaluation.currentStation.status, "not_evaluated");
    assert.equal(summary.evaluation.currentStation.label, "未评估");
    assert.equal(summary.displacementForecast.status, "unavailable");
    assert.equal(summary.evaluation.regionalReference?.evaluatedSamples, 1352);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
