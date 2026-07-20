import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { ClickHouseClient } from "@clickhouse/client";
import type { Pool } from "pg";
import { loadConfigFromEnv } from "./config";
import { trainEdgeRiskModel } from "./edge-model-trainer";

const deviceId = "00000000-0000-4000-8000-00000000000c";

void test("trainer creates checksummed artifacts and retains only ten versions", async (context) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "lsmv2-edge-trainer-"));
  context.after(async () => {
    await fs.rm(directory, { recursive: true, force: true });
  });
  const rows = [
    { device_id: deviceId, sensor_key: "tilt_x_deg", samples: "100", q25: 0.9, q50: 1, q75: 1.1 },
    { device_id: deviceId, sensor_key: "tilt_y_deg", samples: "100", q25: 1.9, q50: 2, q75: 2.1 },
    {
      device_id: deviceId,
      sensor_key: "soil_moisture_pct",
      samples: "90",
      q25: 39,
      q50: 40,
      q75: 41,
    },
    {
      device_id: deviceId,
      sensor_key: "electrical_conductivity_us_cm",
      samples: "90",
      q25: 0,
      q50: 0,
      q75: 0,
    },
    {
      device_id: deviceId,
      sensor_key: "gps_latitude",
      samples: "100",
      q25: 24.43802,
      q50: 24.43803,
      q75: 24.43804,
    },
    {
      device_id: deviceId,
      sensor_key: "gps_longitude",
      samples: "100",
      q25: 118.0963,
      q50: 118.09631,
      q75: 118.09632,
    },
  ];
  const clickhouse = {
    query: () => Promise.resolve({ json: () => Promise.resolve(rows) }),
  } as unknown as ClickHouseClient;
  const pg = {
    query: () =>
      Promise.resolve({
        rows: [{ device_id: deviceId, station_id: "00000000-0000-4000-8000-000000000001" }],
      }),
  } as unknown as Pool;
  const config = loadConfigFromEnv({
    CLICKHOUSE_URL: "http://127.0.0.1:8123",
    KAFKA_BROKERS: "127.0.0.1:9092",
    POSTGRES_PASSWORD: "test-only",
    EDGE_MODEL_DIRECTORY: directory,
  });

  let latestVersion = "";
  for (let index = 0; index < 11; index += 1) {
    const artifact = await trainEdgeRiskModel({
      clickhouse,
      pg,
      config,
      now: new Date(Date.UTC(2026, 6, 21, 0, 0, index)),
    });
    latestVersion = artifact.modelVersion;
    const calibration = artifact.calibrations[0];
    assert.ok(calibration);
    assert.match(artifact.checksumSha256 ?? "", /^[a-f0-9]{64}$/);
    assert.equal(calibration.baselines.conductivityUsCm, null);
    assert.equal(calibration.baselines.tiltXDeg, 1);
  }

  const files = await fs.readdir(directory);
  const versions = files.filter(
    (file) => file.startsWith("landslide-edge-risk-") && file.endsWith(".json")
  );
  assert.equal(versions.length, 10);
  const latest = JSON.parse(await fs.readFile(path.join(directory, "latest.json"), "utf8")) as {
    modelVersion?: string;
  };
  assert.equal(latest.modelVersion, latestVersion);
});
