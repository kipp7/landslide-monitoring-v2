import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_EDGE_RISK_POLICY,
  evaluateEdgeRisk,
  isEdgeRiskModelArtifact,
  type EdgeRiskModelArtifact,
  type EdgeTelemetrySnapshot,
} from "./index";

const deviceId = "00000000-0000-4000-8000-00000000000a";
const stationId = "00000000-0000-4000-8000-000000000001";
const now = new Date("2026-07-21T04:00:00.000Z");

function artifact(): EdgeRiskModelArtifact {
  return {
    schemaVersion: "lsmv2.edge-landslide-risk.v1",
    modelKey: "landslide-edge-risk",
    modelVersion: "test-v1",
    modelType: "robust_baseline_ensemble",
    trainedAt: "2026-07-21T03:00:00.000Z",
    trainingWindowHours: 24,
    trainingSource: "test.telemetry_raw",
    deviceCount: 1,
    sampleCount: 1000,
    calibrations: [
      {
        deviceId,
        stationId,
        sampleCount: 1000,
        baselines: {
          tiltXDeg: 1,
          tiltYDeg: 2,
          soilMoisturePct: 40,
          conductivityUsCm: 500,
          latitude: 24.43803,
          longitude: 118.09631,
        },
        scales: {
          tiltXDeg: 0.05,
          tiltYDeg: 0.05,
          soilMoisturePct: 0.5,
          conductivityUsCm: 10,
          latitude: 0.000001,
          longitude: 0.000001,
        },
      },
    ],
    policy: structuredClone(DEFAULT_EDGE_RISK_POLICY),
    checksumSha256: null,
  };
}

function snapshot(receivedAt: string, metrics: Record<string, unknown>): EdgeTelemetrySnapshot {
  return { deviceId, stationId, receivedAt, metrics };
}

void test("stable live telemetry remains normal", () => {
  const result = evaluateEdgeRisk({
    artifact: artifact(),
    deviceId,
    now,
    history: [
      snapshot("2026-07-21T03:59:55.000Z", {
        tilt_x_deg: 1.02,
        tilt_y_deg: 2.01,
        soil_moisture_pct: 40.2,
        electrical_conductivity_us_cm: 505,
        gps_latitude: 24.43803,
        gps_longitude: 118.09631,
      }),
    ],
  });

  assert.equal(result.riskLevel, "normal");
  assert.equal(result.hardRuleTriggered, false);
  assert.equal(result.dataStatus, "live");
});

void test("tilt hard threshold remains authoritative", () => {
  const result = evaluateEdgeRisk({
    artifact: artifact(),
    deviceId,
    now,
    history: [
      snapshot("2026-07-21T03:59:55.000Z", {
        tilt_x_deg: 7,
        tilt_y_deg: 2,
        gps_latitude: 24.43803,
        gps_longitude: 118.09631,
      }),
    ],
  });

  assert.equal(result.riskLevel, "danger");
  assert.equal(result.hardRuleTriggered, true);
  assert.ok(result.hardRuleReasons.some((reason) => reason.includes("倾角偏移")));
});

void test("GPS baseline displacement triggers the hard boundary", () => {
  const result = evaluateEdgeRisk({
    artifact: artifact(),
    deviceId,
    now,
    history: [
      snapshot("2026-07-21T03:59:55.000Z", {
        tilt_x_deg: 1,
        tilt_y_deg: 2,
        gps_latitude: 24.43833,
        gps_longitude: 118.09631,
      }),
    ],
  });

  assert.equal(result.riskLevel, "danger");
  assert.equal(result.hardRuleTriggered, true);
  assert.ok(result.hardRuleReasons.some((reason) => reason.includes("GPS基线位移")));
});

void test("node without conductivity remains evaluable and stale data is labelled", () => {
  const result = evaluateEdgeRisk({
    artifact: artifact(),
    deviceId,
    now,
    history: [
      snapshot("2026-07-21T03:59:00.000Z", {
        tilt_x_deg: 1,
        tilt_y_deg: 2,
        soil_moisture_pct: 40,
      }),
    ],
  });

  assert.equal(result.dataStatus, "stale");
  assert.equal(
    result.features.find((feature) => feature.key === "conductivity_change")?.available,
    false
  );
  assert.equal(result.hardRuleTriggered, false);
});

void test("malformed or unsafe artifacts are rejected", () => {
  const valid = artifact();
  assert.equal(isEdgeRiskModelArtifact(valid), true);

  const negativeWeight = artifact();
  negativeWeight.policy.featureWeights.tiltDeviation = -1;
  assert.equal(isEdgeRiskModelArtifact(negativeWeight), false);
  assert.equal(isEdgeRiskModelArtifact({ schemaVersion: valid.schemaVersion }), false);
});
