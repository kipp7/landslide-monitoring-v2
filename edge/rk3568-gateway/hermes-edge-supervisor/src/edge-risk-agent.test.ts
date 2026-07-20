import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { DEFAULT_EDGE_RISK_POLICY, type EdgeRiskModelArtifact } from "@lsmv2/edge-risk-model";
import { loadConfigFromEnv } from "./config";
import { EdgeRiskAgent } from "./edge-risk-agent";

const deviceId = "00000000-0000-4000-8000-00000000000b";

function signedArtifact(): EdgeRiskModelArtifact {
  const unsigned: EdgeRiskModelArtifact = {
    schemaVersion: "lsmv2.edge-landslide-risk.v1",
    modelKey: "landslide-edge-risk",
    modelVersion: "edge-test-v1",
    modelType: "robust_baseline_ensemble",
    trainedAt: "2026-07-21T03:00:00.000Z",
    trainingWindowHours: 24,
    trainingSource: "test.telemetry_raw",
    deviceCount: 1,
    sampleCount: 500,
    calibrations: [
      {
        deviceId,
        stationId: null,
        sampleCount: 500,
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
  const checksumSha256 = createHash("sha256").update(JSON.stringify(unsigned)).digest("hex");
  return { ...unsigned, checksumSha256 };
}

void test("offline predictions are bounded, persisted and restored without MQTT", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "lsmv2-edge-agent-"));
  context.after(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });
  const modelPath = path.join(root, "models", "latest.json");
  const statePath = path.join(root, "status", "state.json");
  const taskPath = path.join(root, "events", "tasks.jsonl");
  await fs.mkdir(path.dirname(modelPath), { recursive: true });
  await fs.writeFile(modelPath, JSON.stringify(signedArtifact()), "utf8");

  const config = loadConfigFromEnv({
    RISK_MODEL_PATH: modelPath,
    RISK_STATE_PATH: statePath,
    RISK_TASK_LOG_PATH: taskPath,
    PREDICTION_PUBLISH_INTERVAL_MS: "10000",
  });
  const agent = new EdgeRiskAgent(config);
  await agent.start();
  await agent.ingest([
    {
      deviceId,
      receivedAt: new Date().toISOString(),
      metrics: {
        tilt_x_deg: 1,
        tilt_y_deg: 2,
        soil_moisture_pct: 40,
        gps_latitude: 24.43803,
        gps_longitude: 118.09631,
      },
    },
  ]);

  assert.equal(agent.status().available, true);
  assert.equal(agent.status().mqttConnected, false);
  assert.equal(agent.status().pendingUploadCount, 1);
  assert.equal(agent.status().tasks[0]?.status, "queued");
  const queuedAt = Date.now();
  await agent.ingest(
    Array.from({ length: 205 }, (_, index) => ({
      deviceId,
      receivedAt: new Date(queuedAt + index).toISOString(),
      metrics: { tilt_x_deg: 1, tilt_y_deg: 2 },
    })),
    true
  );
  assert.equal(agent.status().pendingUploadCount, 200);
  await agent.stop();

  const restored = new EdgeRiskAgent(config);
  await restored.start();
  assert.equal(restored.status().pendingUploadCount, 200);
  assert.equal(restored.status().model.loaded, true);
  await restored.stop();
});

void test("a model with an invalid checksum is never activated", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "lsmv2-edge-model-"));
  context.after(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });
  const model = signedArtifact();
  model.checksumSha256 = "0".repeat(64);
  const modelPath = path.join(root, "latest.json");
  await fs.writeFile(modelPath, JSON.stringify(model), "utf8");
  const agent = new EdgeRiskAgent(
    loadConfigFromEnv({
      RISK_MODEL_PATH: modelPath,
      RISK_STATE_PATH: path.join(root, "state.json"),
      RISK_TASK_LOG_PATH: path.join(root, "tasks.jsonl"),
    })
  );

  await agent.start();
  assert.equal(agent.status().model.loaded, false);
  assert.match(agent.status().model.error ?? "", /checksum/);
  await agent.stop();
});
