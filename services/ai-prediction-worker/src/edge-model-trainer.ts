import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { ClickHouseClient } from "@clickhouse/client";
import {
  DEFAULT_EDGE_RISK_POLICY,
  isEdgeRiskModelArtifact,
  type EdgeDeviceCalibration,
  type EdgeRiskModelArtifact,
} from "@lsmv2/edge-risk-model";
import type { Pool } from "pg";
import type { AppConfig } from "./config";

type CalibrationRow = {
  device_id: string;
  sensor_key: string;
  samples: number | string;
  q25: number | string | null;
  q50: number | string | null;
  q75: number | string | null;
};

type MetricStats = {
  samples: number;
  median: number | null;
  robustScale: number;
};

const SENSOR_KEYS = [
  "tilt_x_deg",
  "tilt_y_deg",
  "soil_moisture_pct",
  "humidity_pct",
  "electrical_conductivity_us_cm",
  "gps_latitude",
  "gps_longitude",
] as const;

function numberOrNull(value: number | string | null | undefined): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function positiveNumber(value: number | string | null | undefined): number {
  return Math.max(0, numberOrNull(value) ?? 0);
}

function modelVersion(now: Date): string {
  return now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

function metricStats(row: CalibrationRow | undefined, minimumScale: number): MetricStats {
  const q25 = numberOrNull(row?.q25);
  const q50 = numberOrNull(row?.q50);
  const q75 = numberOrNull(row?.q75);
  const robustScale =
    q25 !== null && q75 !== null ? Math.max(minimumScale, (q75 - q25) / 1.349) : minimumScale;
  return {
    samples: Math.round(positiveNumber(row?.samples)),
    median: q50,
    robustScale,
  };
}

function rowFor(
  rows: CalibrationRow[],
  deviceId: string,
  keys: readonly string[]
): CalibrationRow | undefined {
  return rows.find((row) => row.device_id === deviceId && keys.includes(row.sensor_key));
}

async function stationIds(pg: Pool, deviceIds: string[]): Promise<Map<string, string | null>> {
  if (deviceIds.length === 0) return new Map<string, string | null>();
  const result = await pg.query<{ device_id: string; station_id: string | null }>(
    `SELECT device_id::text, station_id::text FROM devices WHERE device_id = ANY($1::uuid[])`,
    [deviceIds]
  );
  return new Map(result.rows.map((row) => [row.device_id, row.station_id]));
}

function buildCalibration(
  rows: CalibrationRow[],
  deviceId: string,
  stationId: string | null
): EdgeDeviceCalibration {
  const tiltX = metricStats(rowFor(rows, deviceId, ["tilt_x_deg"]), 0.05);
  const tiltY = metricStats(rowFor(rows, deviceId, ["tilt_y_deg"]), 0.05);
  const moisture = metricStats(rowFor(rows, deviceId, ["soil_moisture_pct", "humidity_pct"]), 0.5);
  const conductivity = metricStats(rowFor(rows, deviceId, ["electrical_conductivity_us_cm"]), 10);
  const latitude = metricStats(rowFor(rows, deviceId, ["gps_latitude"]), 0.000001);
  const longitude = metricStats(rowFor(rows, deviceId, ["gps_longitude"]), 0.000001);
  const conductivityBaseline =
    conductivity.median !== null && conductivity.median > 0 ? conductivity.median : null;

  return {
    deviceId,
    stationId,
    sampleCount: Math.max(
      tiltX.samples,
      tiltY.samples,
      moisture.samples,
      conductivity.samples,
      latitude.samples,
      longitude.samples
    ),
    baselines: {
      tiltXDeg: tiltX.median,
      tiltYDeg: tiltY.median,
      soilMoisturePct: moisture.median,
      conductivityUsCm: conductivityBaseline,
      latitude: latitude.median,
      longitude: longitude.median,
    },
    scales: {
      tiltXDeg: tiltX.robustScale,
      tiltYDeg: tiltY.robustScale,
      soilMoisturePct: moisture.robustScale,
      conductivityUsCm: conductivity.robustScale,
      latitude: latitude.robustScale,
      longitude: longitude.robustScale,
    },
  };
}

function withChecksum(artifact: EdgeRiskModelArtifact): EdgeRiskModelArtifact {
  const checksumSha256 = createHash("sha256")
    .update(JSON.stringify({ ...artifact, checksumSha256: null }))
    .digest("hex");
  return { ...artifact, checksumSha256 };
}

async function writeAtomic(targetPath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  const tempPath = `${targetPath}.${String(process.pid)}.${String(Date.now())}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(value, null, 2), "utf8");
  await fs.rename(tempPath, targetPath);
}

async function persistArtifact(directory: string, artifact: EdgeRiskModelArtifact): Promise<void> {
  await fs.mkdir(directory, { recursive: true });
  const versionPath = path.join(directory, `${artifact.modelKey}-${artifact.modelVersion}.json`);
  await writeAtomic(versionPath, artifact);
  await writeAtomic(path.join(directory, "latest.json"), artifact);

  const files = (await fs.readdir(directory))
    .filter((file) => file.startsWith(`${artifact.modelKey}-`) && file.endsWith(".json"))
    .sort()
    .reverse();
  await Promise.all(
    files.slice(10).map((file) => fs.unlink(path.join(directory, file)).catch(() => undefined))
  );
}

export async function trainEdgeRiskModel(input: {
  clickhouse: ClickHouseClient;
  pg: Pool;
  config: AppConfig;
  now?: Date;
}): Promise<EdgeRiskModelArtifact> {
  const now = input.now ?? new Date();
  const result = await input.clickhouse.query({
    query: `
      SELECT
        device_id,
        sensor_key,
        toUInt64(count()) AS samples,
        quantileTDigest(0.25)(value) AS q25,
        quantileTDigest(0.50)(value) AS q50,
        quantileTDigest(0.75)(value) AS q75
      FROM
      (
        SELECT
          device_id,
          sensor_key,
          coalesce(value_f64, toFloat64(value_i64), toFloat64OrNull(value_str), toFloat64(value_bool)) AS value
        FROM ${input.config.clickhouseDatabase}.${input.config.clickhouseTable}
        WHERE received_ts >= now() - toIntervalHour({windowHours:UInt32})
          AND sensor_key IN {sensorKeys:Array(String)}
      )
      WHERE value IS NOT NULL
      GROUP BY device_id, sensor_key
      ORDER BY device_id, sensor_key
    `,
    query_params: {
      windowHours: input.config.edgeModelTrainingWindowHours,
      sensorKeys: Array.from(SENSOR_KEYS),
    },
    clickhouse_settings: {
      max_threads: 1,
      max_execution_time: 30,
      max_memory_usage: "268435456",
    },
    format: "JSONEachRow",
  });
  const rows: CalibrationRow[] = await result.json();
  const deviceIds = Array.from(new Set(rows.map((row) => row.device_id))).sort();
  if (deviceIds.length === 0) throw new Error("edge model training found no telemetry samples");
  const stationIdByDevice = await stationIds(input.pg, deviceIds);
  const calibrations = deviceIds.map((deviceId) =>
    buildCalibration(rows, deviceId, stationIdByDevice.get(deviceId) ?? null)
  );
  const sampleCount = calibrations.reduce((sum, calibration) => sum + calibration.sampleCount, 0);
  const artifact = withChecksum({
    schemaVersion: "lsmv2.edge-landslide-risk.v1",
    modelKey: "landslide-edge-risk",
    modelVersion: modelVersion(now),
    modelType: "robust_baseline_ensemble",
    trainedAt: now.toISOString(),
    trainingWindowHours: input.config.edgeModelTrainingWindowHours,
    trainingSource: `${input.config.clickhouseDatabase}.${input.config.clickhouseTable}`,
    deviceCount: calibrations.length,
    sampleCount,
    calibrations,
    policy: DEFAULT_EDGE_RISK_POLICY,
    checksumSha256: null,
  });
  await persistArtifact(input.config.edgeModelDirectory, artifact);
  return artifact;
}

export async function loadLatestEdgeRiskModel(
  directory: string
): Promise<EdgeRiskModelArtifact | null> {
  try {
    const parsed: unknown = JSON.parse(
      await fs.readFile(path.join(directory, "latest.json"), "utf8")
    );
    return isEdgeRiskModelArtifact(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function createFallbackEdgeRiskModel(now = new Date()): EdgeRiskModelArtifact {
  return withChecksum({
    schemaVersion: "lsmv2.edge-landslide-risk.v1",
    modelKey: "landslide-edge-risk",
    modelVersion: `fallback-${modelVersion(now)}`,
    modelType: "robust_baseline_ensemble",
    trainedAt: now.toISOString(),
    trainingWindowHours: 0,
    trainingSource: "fallback-no-history",
    deviceCount: 0,
    sampleCount: 0,
    calibrations: [],
    policy: DEFAULT_EDGE_RISK_POLICY,
    checksumSha256: null,
  });
}
