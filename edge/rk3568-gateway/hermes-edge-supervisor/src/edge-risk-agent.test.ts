import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { DEFAULT_EDGE_RISK_POLICY, type EdgeRiskModelArtifact } from "@lsmv2/edge-risk-model";
import { loadConfigFromEnv } from "./config";
import { EdgeRiskAgent, parseTelemetryMessage } from "./edge-risk-agent";

const deviceId = "00000000-0000-4000-8000-00000000000b";
const stationId = "fd5a5432-91ac-4fa9-a6bd-2cd729b1d990";

function signedArtifact(
  deviceIds: string[] = [deviceId],
  trainedAt = new Date().toISOString()
): EdgeRiskModelArtifact {
  const unsigned: EdgeRiskModelArtifact = {
    schemaVersion: "lsmv2.edge-landslide-risk.v1",
    modelKey: "landslide-edge-risk",
    modelVersion: "edge-test-v1",
    modelType: "robust_baseline_ensemble",
    trainedAt,
    trainingWindowHours: 24,
    trainingSource: "test.telemetry_raw",
    deviceCount: deviceIds.length,
    sampleCount: deviceIds.length * 500,
    calibrations: deviceIds.map((calibrationDeviceId) => ({
      deviceId: calibrationDeviceId,
      stationId,
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
    })),
    policy: structuredClone(DEFAULT_EDGE_RISK_POLICY),
    checksumSha256: null,
  };
  const checksumSha256 = createHash("sha256").update(JSON.stringify(unsigned)).digest("hex");
  return { ...unsigned, checksumSha256 };
}

void test("the field telemetry envelope is parsed only when topic and device agree", () => {
  const receivedAt = "2026-07-21T04:30:00.000Z";
  const topic = `telemetry/${deviceId}`;
  const payload = JSON.stringify({
    schema_version: 1,
    device_id: deviceId,
    event_ts: null,
    seq: 3513,
    metrics: {
      temperature_c: 23.6,
      humidity_pct: 41.2,
      electrical_conductivity_us_cm: 520,
      tilt_x_deg: 0.59,
      tilt_y_deg: 0.03,
      warning_flag: false,
      gps_latitude: 24.523165,
      gps_longitude: 118.150734,
    },
    meta: { install_label: "FIELD-NODE-B" },
  });

  assert.deepEqual(parseTelemetryMessage(topic, "telemetry/+", payload, receivedAt), {
    deviceId,
    receivedAt,
    metrics: {
      temperature_c: 23.6,
      humidity_pct: 41.2,
      electrical_conductivity_us_cm: 520,
      tilt_x_deg: 0.59,
      tilt_y_deg: 0.03,
      warning_flag: false,
      gps_latitude: 24.523165,
      gps_longitude: 118.150734,
    },
  });

  assert.throws(
    () => parseTelemetryMessage(`telemetry/${"0".repeat(36)}`, "telemetry/+", payload, receivedAt),
    /does not match MQTT topic/
  );
  assert.throws(
    () =>
      parseTelemetryMessage(
        topic,
        "telemetry/+",
        JSON.stringify({ schema_version: 1, device_id: deviceId, metrics: { nested: {} } }),
        receivedAt
      ),
    /metric value is invalid/
  );
});

void test("all model nodes remain visible before their first live reading", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "lsmv2-edge-nodes-"));
  context.after(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });
  const deviceIds = [
    "00000000-0000-0000-0000-000000000001",
    "00000000-0000-0000-0000-000000000002",
    "00000000-0000-0000-0000-000000000003",
  ];
  const modelPath = path.join(root, "models", "latest.json");
  await fs.mkdir(path.dirname(modelPath), { recursive: true });
  await fs.writeFile(modelPath, JSON.stringify(signedArtifact(deviceIds)), "utf8");
  const agent = new EdgeRiskAgent(
    loadConfigFromEnv({
      RISK_MODEL_PATH: modelPath,
      RISK_STATE_PATH: path.join(root, "state.json"),
      RISK_TASK_LOG_PATH: path.join(root, "tasks.jsonl"),
    })
  );

  await agent.start();
  assert.equal(agent.status().available, false);
  assert.equal(agent.status().devices.length, 3);
  assert.ok(agent.status().devices.every((entry) => entry.dataStatus === "insufficient"));

  await agent.ingest([
    {
      deviceId: deviceIds[1] ?? "",
      receivedAt: new Date().toISOString(),
      metrics: { tilt_x_deg: 1, tilt_y_deg: 2, soil_moisture_pct: 40 },
    },
  ]);
  assert.equal(agent.status().available, true);
  assert.equal(agent.status().devices.length, 3);
  assert.notEqual(
    agent.status().devices.find((entry) => entry.deviceId === deviceIds[1])?.dataUpdatedAt,
    null
  );
  await agent.stop();
});

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
  assert.equal(agent.status().available, false);
  assert.equal(agent.status().devices.length, 1);
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
  for (let index = 0; index < 205; index += 1) {
    await agent.ingest(
      [
        {
          deviceId,
          receivedAt: new Date(queuedAt + index).toISOString(),
          metrics: { tilt_x_deg: 1, tilt_y_deg: 2 },
        },
      ],
      true
    );
  }
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

void test("an expired model buffers telemetry without evaluating or publishing risk", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "lsmv2-edge-stale-model-"));
  context.after(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });
  const modelPath = path.join(root, "latest.json");
  await fs.writeFile(
    modelPath,
    JSON.stringify(signedArtifact([deviceId], "2026-07-20T00:00:00.000Z")),
    "utf8"
  );
  const agent = new EdgeRiskAgent(
    loadConfigFromEnv({
      RISK_MODEL_PATH: modelPath,
      RISK_MODEL_MAX_AGE_MS: String(60 * 60_000),
      RISK_STATE_PATH: path.join(root, "state.json"),
      RISK_TASK_LOG_PATH: path.join(root, "tasks.jsonl"),
    })
  );

  await agent.start();
  await agent.ingest([
    {
      deviceId,
      receivedAt: new Date().toISOString(),
      metrics: {
        tilt_x_deg: 30,
        tilt_y_deg: 30,
        gps_latitude: 30,
        gps_longitude: 120,
      },
    },
  ]);

  const status = agent.status();
  assert.equal(status.model.loaded, true);
  assert.match(status.model.error ?? "", /模型已过期/);
  assert.equal(status.available, false);
  assert.equal(status.devices.length, 0);
  assert.equal(status.pendingUploadCount, 0);
  assert.equal(status.tasks.length, 0);
  await agent.stop();
});
