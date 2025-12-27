import type { ClickHouseClient } from "@clickhouse/client";
import type { FastifyInstance, FastifyReply } from "fastify";
import type { PoolClient } from "pg";
import { z } from "zod";
import type { AppConfig } from "../config";
import { requirePermission, type AdminAuthConfig } from "../authz";
import type { PgPool } from "../postgres";
import { queryOne, withPgClient } from "../postgres";

function legacyOk(reply: FastifyReply, data: unknown, message = "ok"): void {
  void reply.code(200).send({ success: true, data, message, timestamp: new Date().toISOString() });
}

function legacyFail(reply: FastifyReply, statusCode: number, message: string, details?: unknown): void {
  void reply.code(statusCode).send({ success: false, message, error: details, timestamp: new Date().toISOString() });
}

function redirectLegacyAlias(rawUrl: string | undefined, reply: FastifyReply, from: string, to: string): void {
  const input = rawUrl ?? "";
  const target = input.includes(from) ? input.replace(from, to) : input;
  void reply.redirect(target, 307);
}

const aggregationSchema = z
  .object({
    type: z.enum(["hierarchy_stats", "network_stats", "device_summary", "real_time_dashboard"]),
    devices: z.array(z.string()).optional(),
    timeRange: z.enum(["1h", "6h", "24h", "7d", "30d"]).optional(),
    includeBaselines: z.boolean().optional(),
    includeAnomalies: z.boolean().optional()
  })
  .strict();

const deviceIdSchema = z.string().min(1);

const deviceManagementQuerySchema = z.object({
  device_id: z.string().optional(),
  deviceId: z.string().optional(),
  timeRange: z.string().optional(),
  startTime: z.string().datetime().optional(),
  endTime: z.string().datetime().optional(),
  limit: z.coerce.number().int().positive().max(5000).optional(),
  data_only: z.preprocess((v) => {
    if (v === "" || v === null || v === undefined) return undefined;
    if (v === "true") return true;
    if (v === "false") return false;
    if (v === true) return true;
    if (v === false) return false;
    return v;
  }, z.boolean().optional()),
  dataOnly: z.preprocess((v) => {
    if (v === "" || v === null || v === undefined) return undefined;
    if (v === "true") return true;
    if (v === "false") return false;
    if (v === true) return true;
    if (v === false) return false;
    return v;
  }, z.boolean().optional())
});

const deformationLimitQuerySchema = z
  .object({
    limit: z.coerce.number().int().positive().max(5000).optional()
  })
  .passthrough();

const deformationTrendQuerySchema = z
  .object({
    days: z.coerce.number().int().positive().max(365).optional()
  })
  .passthrough();

const exportStatsQuerySchema = z
  .object({
    device_id: z.string().optional(),
    deviceId: z.string().optional()
  })
  .passthrough();

const exportRequestSchema = z
  .object({
    device_id: z.string().optional(),
    export_type: z.enum(["today", "history", "custom"]).optional(),
    start_date: z.string().optional(),
    end_date: z.string().optional(),
    format: z.enum(["json", "csv", "excel"]).optional()
  })
  .passthrough();

const diagnosticsRequestSchema = z
  .object({
    device_id: z.string().optional(),
    simple_id: z.string().optional()
  })
  .passthrough();

const reportsQuerySchema = z
  .object({
    device_id: z.string().optional()
  })
  .passthrough();

const reportsRequestSchema = z
  .object({
    device_id: z.string().optional(),
    report_type: z.enum(["daily", "weekly", "monthly", "custom"]).optional(),
    start_date: z.string().optional(),
    end_date: z.string().optional()
  })
  .passthrough();

const monitoringStationsUpdateSchema = z.record(z.unknown());

const monitoringStationsBulkUpdateSchema = z
  .object({
    chartType: z.string().optional(),
    deviceLegends: z.record(z.string()).optional()
  })
  .strict();

const baselineSchema = z.object({
  latitude: z.number().finite(),
  longitude: z.number().finite(),
  altitude: z.number().finite().optional()
});

type BaselineInfo = z.infer<typeof baselineSchema> & {
  established_time: string | null;
  established_by: string;
};

function utcStartOfDay(d: Date): Date {
  const x = new Date(d.getTime());
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

function utcStartOfMonth(d: Date): Date {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0));
  return x;
}

function utcTomorrowStart(d: Date): Date {
  const x = utcStartOfDay(d);
  x.setUTCDate(x.getUTCDate() + 1);
  return x;
}

function toClickhouseDateTime64Utc(d: Date): string {
  return d.toISOString().replace("T", " ").replace("Z", "");
}

function clickhouseStringToIsoZ(ts: string): string {
  const t = ts.trim();
  if (t.includes("T") && t.endsWith("Z")) return t;
  if (t.includes("T") && !t.endsWith("Z")) return t + "Z";
  if (t.includes(" ")) return t.replace(" ", "T") + "Z";
  return t;
}

function parseRelativeTimeRange(raw: string | undefined): { label: string; start: Date; end: Date } {
  const end = new Date();
  const fallback = { label: "24h", start: new Date(end.getTime() - 24 * 60 * 60 * 1000), end };
  const input = (raw ?? "").trim().toLowerCase();
  if (!input) return fallback;

  const m = /^(\d+)\s*(h|hr|hrs|hour|hours|d|day|days)$/.exec(input);
  if (!m) return fallback;

  const n = Number.parseInt(m[1] ?? "", 10);
  const unit = (m[2] ?? "").startsWith("d") ? "d" : "h";
  if (!Number.isFinite(n) || n <= 0) return fallback;

  const ms = unit === "d" ? n * 24 * 60 * 60 * 1000 : n * 60 * 60 * 1000;
  return { label: String(n) + unit, start: new Date(end.getTime() - ms), end };
}

function haversineMeters(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const r = 6371000;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
  return 2 * r * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function onlineStatus(lastSeenAt: string | null, status: "inactive" | "active" | "revoked"): "online" | "offline" {
  if (status !== "active") return "offline";
  if (!lastSeenAt) return "offline";
  const t = Date.parse(lastSeenAt);
  if (!Number.isFinite(t)) return "offline";
  return Date.now() - t < 5 * 60_000 ? "online" : "offline";
}

function toZhCnTime(value: string): string {
  const d = new Date(value);
  if (Number.isFinite(d.getTime())) return d.toLocaleString("zh-CN");
  return value;
}

function toCsv(rows: Record<string, string>[]): string {
  if (rows.length === 0) return "";
  const first = rows[0];
  if (!first) return "";
  const headers = Object.keys(first);
  const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
  return [headers.join(","), ...rows.map((r) => headers.map((h) => escape(r[h] ?? "")).join(","))].join("\n");
}

type DeviceListRow = {
  device_id: string;
  device_name: string;
  device_type: string;
  status: "inactive" | "active" | "revoked";
  last_seen_at: string | null;
  metadata: unknown;
  station_id: string | null;
  station_name: string | null;
  latitude: number | null;
  longitude: number | null;
  created_at: string;
};

type BaselineRow = { device_id: string };

function legacyKeyFromMetadata(deviceName: string, metadata: unknown): string {
  const m = metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>) : null;

  const legacy = typeof m?.legacy_device_id === "string" ? m.legacy_device_id.trim() : "";
  if (legacy) return legacy;

  const externalIds = m?.externalIds;
  const externalLegacyRaw =
    externalIds && typeof externalIds === "object" ? (externalIds as Record<string, unknown>).legacy : undefined;
  const externalLegacy = typeof externalLegacyRaw === "string" ? externalLegacyRaw.trim() : "";
  if (externalLegacy) return externalLegacy;

  return deviceName;
}

async function resolveDeviceId(pg: PgPool, input: string): Promise<string | null> {
  return withPgClient(pg, async (client) => resolveDeviceIdWithClient(client, input));
}

async function resolveDeviceIdWithClient(client: PoolClient, input: string): Promise<string | null> {
  const row = await queryOne<{ device_id: string }>(
    client,
    `
      SELECT device_id
      FROM devices
      WHERE device_id::text = $1
         OR device_name = $1
         OR metadata->>'legacy_device_id' = $1
         OR metadata#>>'{externalIds,legacy}' = $1
      LIMIT 1
    `,
    [input]
  );
  return row?.device_id ?? null;
}

async function listDevicesWithStations(pg: PgPool): Promise<DeviceListRow[]> {
  return withPgClient(pg, async (client) => {
    const res = await client.query<DeviceListRow>(
      `
        SELECT
          d.device_id,
          d.device_name,
          d.device_type,
          d.status,
          to_char(d.last_seen_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS last_seen_at,
          d.metadata,
          d.station_id,
          s.station_name,
          s.latitude,
          s.longitude,
          to_char(d.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at
        FROM devices d
        LEFT JOIN stations s ON s.station_id = d.station_id
        WHERE d.status != 'revoked'
        ORDER BY d.device_name
      `
    );
    return res.rows;
  });
}

type ExportBucketRow = {
  bucket_ts: string;
  temperature_c: number | null;
  humidity_pct: number | null;
  illumination: number | null;
  acceleration_x: number | null;
  acceleration_y: number | null;
  acceleration_z: number | null;
  gyroscope_x: number | null;
  gyroscope_y: number | null;
  gyroscope_z: number | null;
};

async function fetchDeviceMinuteBuckets(
  config: AppConfig,
  ch: ClickHouseClient,
  deviceId: string,
  start: Date,
  end: Date,
  limit: number
): Promise<ExportBucketRow[]> {
  const keys = [
    "temperature_c",
    "humidity_pct",
    "illumination",
    "acceleration_x",
    "acceleration_y",
    "acceleration_z",
    "gyroscope_x",
    "gyroscope_y",
    "gyroscope_z"
  ];

  const sql = `
    SELECT
      toString(bucket_ts) AS bucket_ts,
      argMaxIf(v, received_ts, sensor_key = 'temperature_c') AS temperature_c,
      argMaxIf(v, received_ts, sensor_key = 'humidity_pct') AS humidity_pct,
      argMaxIf(v, received_ts, sensor_key = 'illumination') AS illumination,
      argMaxIf(v, received_ts, sensor_key = 'acceleration_x') AS acceleration_x,
      argMaxIf(v, received_ts, sensor_key = 'acceleration_y') AS acceleration_y,
      argMaxIf(v, received_ts, sensor_key = 'acceleration_z') AS acceleration_z,
      argMaxIf(v, received_ts, sensor_key = 'gyroscope_x') AS gyroscope_x,
      argMaxIf(v, received_ts, sensor_key = 'gyroscope_y') AS gyroscope_y,
      argMaxIf(v, received_ts, sensor_key = 'gyroscope_z') AS gyroscope_z
    FROM (
      SELECT
        toStartOfMinute(received_ts) AS bucket_ts,
        received_ts,
        sensor_key,
        if(isNull(value_f64) AND isNull(value_i64), NULL, coalesce(value_f64, toFloat64(value_i64))) AS v
      FROM ${config.clickhouseDatabase}.${config.clickhouseTable}
      WHERE device_id = {deviceId:String}
        AND received_ts >= {start:DateTime64(3, 'UTC')}
        AND received_ts < {end:DateTime64(3, 'UTC')}
        AND sensor_key IN {sensorKeys:Array(String)}
    )
    GROUP BY bucket_ts
    ORDER BY bucket_ts DESC
    LIMIT {limit:UInt32}
  `;

  const result = await ch.query({
    query: sql,
    query_params: {
      deviceId,
      sensorKeys: keys,
      start: toClickhouseDateTime64Utc(start),
      end: toClickhouseDateTime64Utc(end),
      limit
    },
    format: "JSONEachRow"
  });
  const rows: ExportBucketRow[] = await result.json();
  return rows.map((r) => ({ ...r, bucket_ts: clickhouseStringToIsoZ(r.bucket_ts) }));
}

async function baselineDeviceIds(pg: PgPool, deviceIds: string[]): Promise<Set<string>> {
  if (deviceIds.length === 0) return new Set();
  const rows = await withPgClient(pg, async (client) =>
    client.query<BaselineRow>(`SELECT device_id FROM gps_baselines WHERE device_id = ANY($1::uuid[])`, [deviceIds])
  );
  return new Set(rows.rows.map((r) => r.device_id));
}

async function todayTelemetryCounts(
  config: AppConfig,
  ch: ClickHouseClient,
  deviceIds: string[]
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (deviceIds.length === 0) return out;

  const start = utcStartOfDay(new Date());
  const res = await ch.query({
    query: `
      SELECT device_id, count()::UInt64 AS c
      FROM ${config.clickhouseDatabase}.${config.clickhouseTable}
      WHERE received_ts >= {start:DateTime64(3, 'UTC')}
        AND device_id IN {deviceIds:Array(String)}
      GROUP BY device_id
    `,
    query_params: { start: toClickhouseDateTime64Utc(start), deviceIds },
    format: "JSONEachRow"
  });

  const rows: { device_id: string; c: string | number }[] = await res.json();
  for (const r of rows) out.set(r.device_id, typeof r.c === "string" ? Number(r.c) : r.c);
  return out;
}

async function last24hTelemetryCounts(
  config: AppConfig,
  ch: ClickHouseClient,
  deviceIds: string[]
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (deviceIds.length === 0) return out;

  const start = new Date(Date.now() - 24 * 60 * 60_000);
  const res = await ch.query({
    query: `
      SELECT device_id, count()::UInt64 AS c
      FROM ${config.clickhouseDatabase}.${config.clickhouseTable}
      WHERE received_ts >= {start:DateTime64(3, 'UTC')}
        AND device_id IN {deviceIds:Array(String)}
      GROUP BY device_id
    `,
    query_params: { start: toClickhouseDateTime64Utc(start), deviceIds },
    format: "JSONEachRow"
  });

  const rows: { device_id: string; c: string | number }[] = await res.json();
  for (const r of rows) out.set(r.device_id, typeof r.c === "string" ? Number(r.c) : r.c);
  return out;
}

async function fetchDeviceWithStation(pg: PgPool, deviceId: string): Promise<DeviceListRow | null> {
  return withPgClient(pg, async (client) =>
    queryOne<DeviceListRow>(
      client,
      `
        SELECT
          d.device_id,
          d.device_name,
          d.device_type,
          d.status,
          to_char(d.last_seen_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS last_seen_at,
          d.metadata,
          d.station_id,
          s.station_name,
          s.latitude,
          s.longitude,
          to_char(d.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at
        FROM devices d
        LEFT JOIN stations s ON s.station_id = d.station_id
        WHERE d.device_id = $1
      `,
      [deviceId]
    )
  );
}

async function fetchGpsBaseline(pg: PgPool, deviceId: string): Promise<z.infer<typeof baselineSchema> | null> {
  const row = await withPgClient(pg, async (client) =>
    queryOne<{ baseline: unknown }>(
      client,
      `
        SELECT baseline
        FROM gps_baselines
        WHERE device_id = $1
      `,
      [deviceId]
    )
  );
  if (!row) return null;
  const parsed = baselineSchema.safeParse(row.baseline ?? {});
  if (!parsed.success) return null;
  return parsed.data;
}

async function fetchGpsBaselineInfo(pg: PgPool, deviceId: string): Promise<BaselineInfo | null> {
  const row = await withPgClient(pg, async (client) =>
    queryOne<{ baseline: unknown; method: string; computed_at: string | null; updated_at: string | null }>(
      client,
      `
        SELECT
          baseline,
          method,
          to_char(computed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS computed_at,
          to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at
        FROM gps_baselines
        WHERE device_id = $1
        LIMIT 1
      `,
      [deviceId]
    )
  );
  if (!row) return null;

  const parsed = baselineSchema.safeParse(row.baseline ?? {});
  if (!parsed.success) return null;

  const baselineObj = row.baseline && typeof row.baseline === "object" ? (row.baseline as Record<string, unknown>) : {};
  const establishedByRaw = typeof baselineObj.establishedBy === "string" ? baselineObj.establishedBy.trim() : "";
  const established_by = establishedByRaw || (row.method === "auto" ? "系统自动建立" : "管理员");

  return {
    ...parsed.data,
    established_time: row.computed_at ?? row.updated_at ?? null,
    established_by
  };
}

type LegacyGpsRow = {
  event_time: string;
  latitude: number;
  longitude: number;
  deformation_distance_3d: number;
  deformation_horizontal: number;
  deformation_vertical: number;
  deformation_velocity: number;
  deformation_confidence: number;
  risk_level: string | null;
  temperature: number | null;
  humidity: number | null;
};

async function fetchLatestGpsTelemetry(
  config: AppConfig,
  ch: ClickHouseClient,
  deviceId: string,
  limit: number
): Promise<{ eventTime: string; latitude: number; longitude: number }[]> {
  type Row = { event_time: string; latitude: number | null; longitude: number | null };
  const latKey = "gps_latitude";
  const lonKey = "gps_longitude";
  const sensorKeys = [latKey, lonKey];

  const res = await ch.query({
    query: `
      SELECT
        toString(received_ts) AS event_time,
        maxIf(coalesce(value_f64, toFloat64(value_i64)), sensor_key = {latKey:String}) AS latitude,
        maxIf(coalesce(value_f64, toFloat64(value_i64)), sensor_key = {lonKey:String}) AS longitude
      FROM ${config.clickhouseDatabase}.${config.clickhouseTable}
      WHERE device_id = {deviceId:String}
        AND sensor_key IN {sensorKeys:Array(String)}
      GROUP BY received_ts
      HAVING isNotNull(latitude) AND isNotNull(longitude)
      ORDER BY received_ts DESC
      LIMIT {limit:UInt32}
    `,
    query_params: { deviceId, sensorKeys, latKey, lonKey, limit },
    format: "JSONEachRow"
  });

  const rows: Row[] = await res.json();
  return rows
    .filter((r): r is Row & { latitude: number; longitude: number } => typeof r.latitude === "number" && typeof r.longitude === "number")
    .map((r) => ({ eventTime: clickhouseStringToIsoZ(r.event_time), latitude: r.latitude, longitude: r.longitude }));
}

async function fetchGpsTelemetryInRange(
  config: AppConfig,
  ch: ClickHouseClient,
  deviceId: string,
  start: Date,
  end: Date,
  limit: number
): Promise<{ eventTime: string; latitude: number; longitude: number }[]> {
  type Row = { event_time: string; latitude: number | null; longitude: number | null };
  const latKey = "gps_latitude";
  const lonKey = "gps_longitude";
  const sensorKeys = [latKey, lonKey];

  const res = await ch.query({
    query: `
      SELECT
        toString(received_ts) AS event_time,
        maxIf(coalesce(value_f64, toFloat64(value_i64)), sensor_key = {latKey:String}) AS latitude,
        maxIf(coalesce(value_f64, toFloat64(value_i64)), sensor_key = {lonKey:String}) AS longitude
      FROM ${config.clickhouseDatabase}.${config.clickhouseTable}
      WHERE device_id = {deviceId:String}
        AND sensor_key IN {sensorKeys:Array(String)}
        AND received_ts >= {start:DateTime64(3, 'UTC')}
        AND received_ts <= {end:DateTime64(3, 'UTC')}
      GROUP BY received_ts
      HAVING isNotNull(latitude) AND isNotNull(longitude)
      ORDER BY received_ts DESC
      LIMIT {limit:UInt32}
    `,
    query_params: {
      deviceId,
      sensorKeys,
      latKey,
      lonKey,
      start: toClickhouseDateTime64Utc(start),
      end: toClickhouseDateTime64Utc(end),
      limit
    },
    format: "JSONEachRow"
  });

  const rows: Row[] = await res.json();
  return rows
    .filter((r): r is Row & { latitude: number; longitude: number } => typeof r.latitude === "number" && typeof r.longitude === "number")
    .map((r) => ({ eventTime: clickhouseStringToIsoZ(r.event_time), latitude: r.latitude, longitude: r.longitude }));
}

function computeLegacyGpsRows(
  pointsDesc: { eventTime: string; latitude: number; longitude: number }[],
  baseline: z.infer<typeof baselineSchema> | null
): { hasBaseline: boolean; rows: LegacyGpsRow[] } {
  const hasBaseline = Boolean(baseline);
  if (!baseline) {
    return {
      hasBaseline,
      rows: pointsDesc.map((p) => ({
        event_time: p.eventTime,
        latitude: p.latitude,
        longitude: p.longitude,
        deformation_distance_3d: 0,
        deformation_horizontal: 0,
        deformation_vertical: 0,
        deformation_velocity: 0,
        deformation_confidence: 0,
        risk_level: null,
        temperature: null,
        humidity: null
      }))
    };
  }

  const baseAlt = typeof baseline.altitude === "number" ? baseline.altitude : null;
  const pointsAsc = [...pointsDesc].reverse();
  const enrichedAsc = pointsAsc.map((p) => {
    const horizontal = haversineMeters(baseline.latitude, baseline.longitude, p.latitude, p.longitude);
    const vertical = baseAlt === null ? 0 : 0;
    const distance3d = Math.sqrt(horizontal * horizontal + vertical * vertical);
    return { ...p, horizontal, vertical, distance3d };
  });

  const velocitiesAsc = enrichedAsc.map((p, idx) => {
    if (idx === 0) return 0;
    const prev = enrichedAsc[idx - 1];
    if (!prev) return 0;
    const t0 = Date.parse(prev.eventTime);
    const t1 = Date.parse(p.eventTime);
    const deltaHours = Number.isFinite(t0) && Number.isFinite(t1) ? Math.max(0.0001, (t1 - t0) / (1000 * 60 * 60)) : 1;
    return (p.distance3d - prev.distance3d) / deltaHours;
  });

  const rowsAsc: LegacyGpsRow[] = enrichedAsc.map((p, idx) => ({
    event_time: p.eventTime,
    latitude: p.latitude,
    longitude: p.longitude,
    deformation_distance_3d: p.distance3d,
    deformation_horizontal: p.horizontal,
    deformation_vertical: p.vertical,
    deformation_velocity: velocitiesAsc[idx] ?? 0,
    deformation_confidence: 0.9,
    risk_level: null,
    temperature: null,
    humidity: null
  }));

  return { hasBaseline, rows: rowsAsc.reverse() };
}

type DeformationType = {
  type: "noise" | "none" | "horizontal" | "vertical" | "combined" | "rotation";
  code: -1 | 0 | 1 | 2 | 3 | 4;
  description: string;
};

function analyzeDeformationType(maxDisplacementMeters: number, maxHorizontalMeters: number, maxVerticalMeters: number): DeformationType {
  const noiseThreshold = 0.001; // 1mm
  const minDisplacement = 0.002; // 2mm

  if (maxDisplacementMeters < noiseThreshold) return { type: "noise", code: -1, description: "GPS噪声" };
  if (maxDisplacementMeters < minDisplacement) return { type: "none", code: 0, description: "无明显形变" };

  const h = Math.abs(maxHorizontalMeters);
  const v = Math.abs(maxVerticalMeters);
  const d = maxDisplacementMeters + 0.0001;
  const hRatio = h / d;
  const vRatio = v / d;

  if (hRatio > 0.8 && vRatio < 0.3) return { type: "horizontal", code: 1, description: "水平形变" };
  if (vRatio > 0.8 && hRatio < 0.3) return { type: "vertical", code: 2, description: "垂直形变" };
  if (hRatio > 0.4 && vRatio > 0.4) return { type: "combined", code: 3, description: "复合形变" };
  return { type: "rotation", code: 4, description: "旋转形变" };
}

function riskFromDisplacement(maxDisplacementMeters: number): { level: number; description: string; factors: string[] } {
  const factors: string[] = [];
  if (maxDisplacementMeters >= 0.1) {
    factors.push(`位移${(maxDisplacementMeters * 1000).toFixed(1)}mm达到I级红色预警(≥100mm)，风险很高，可能性很大`);
    return { level: 1, description: "I级红色", factors };
  }
  if (maxDisplacementMeters >= 0.05) {
    factors.push(`位移${(maxDisplacementMeters * 1000).toFixed(1)}mm达到II级橙色预警(≥50mm)，风险高，可能性较大`);
    return { level: 2, description: "II级橙色", factors };
  }
  if (maxDisplacementMeters >= 0.02) {
    factors.push(`位移${(maxDisplacementMeters * 1000).toFixed(1)}mm达到III级黄色预警(≥20mm)，风险较高，有一定可能性`);
    return { level: 3, description: "III级黄色", factors };
  }
  if (maxDisplacementMeters >= 0.005) {
    factors.push(`位移${(maxDisplacementMeters * 1000).toFixed(1)}mm达到IV级蓝色预警(≥5mm)，风险一般，可能性较小`);
    return { level: 4, description: "IV级蓝色", factors };
  }
  factors.push(`位移${(maxDisplacementMeters * 1000).toFixed(1)}mm未达到预警标准(<5mm)`);
  return { level: 0, description: "正常", factors };
}

function analyzeTrend(distancesMetersOldestFirst: number[]): "stable" | "increasing" | "decreasing" {
  if (distancesMetersOldestFirst.length < 3) return "stable";
  const mid = Math.floor(distancesMetersOldestFirst.length / 2);
  const firstHalf = distancesMetersOldestFirst.slice(0, mid);
  const secondHalf = distancesMetersOldestFirst.slice(mid);
  const avg = (arr: number[]) => (arr.length === 0 ? 0 : arr.reduce((a, b) => a + b, 0) / arr.length);
  const d = avg(secondHalf) - avg(firstHalf);
  if (Math.abs(d) < 0.0005) return "stable"; // 0.5mm
  return d > 0 ? "increasing" : "decreasing";
}

export function registerLegacyDeviceManagementCompatRoutes(
  app: FastifyInstance,
  config: AppConfig,
  ch: ClickHouseClient,
  pg: PgPool | null
): void {
  const adminCfg: AdminAuthConfig = { adminApiToken: config.adminApiToken, jwtEnabled: Boolean(config.jwtAccessSecret) };

  app.get("/device-management/deformation/:deviceId", async (request, reply) => {
    if (!(await requirePermission(adminCfg, pg, request, reply, "data:view"))) return;
    if (!pg) {
      legacyFail(reply, 503, "PostgreSQL not configured");
      return;
    }

    const parsedParams = z.object({ deviceId: deviceIdSchema }).safeParse(request.params ?? {});
    if (!parsedParams.success) {
      legacyFail(reply, 400, "invalid deviceId");
      return;
    }

    const parsedQuery = deformationLimitQuerySchema.safeParse(request.query ?? {});
    if (!parsedQuery.success) {
      legacyFail(reply, 400, "invalid query");
      return;
    }

    const inputDeviceId = parsedParams.data.deviceId;
    const limit = parsedQuery.data.limit ?? 50;

    const resolved = await resolveDeviceId(pg, inputDeviceId);
    if (!resolved) {
      legacyFail(reply, 404, "device not found");
      return;
    }

    const baselineInfo = await fetchGpsBaselineInfo(pg, resolved);
    if (!baselineInfo) {
      void reply.code(400).send({ success: false, error: "设备未设置基准点", hasBaseline: false, timestamp: new Date().toISOString() });
      return;
    }

    const points = await fetchLatestGpsTelemetry(config, ch, resolved, limit);
    if (points.length === 0) {
      void reply.code(400).send({ success: false, error: "无GPS数据", hasData: false, timestamp: new Date().toISOString() });
      return;
    }

    const computed = computeLegacyGpsRows(points, baselineInfo);
    const rows = computed.rows;
    const nowIso = new Date().toISOString();

    const distances = rows.map((r) => r.deformation_distance_3d);
    const horizontals = rows.map((r) => Math.abs(r.deformation_horizontal));
    const verticals = rows.map((r) => Math.abs(r.deformation_vertical));

    const maxDisplacement = distances.length > 0 ? Math.max(...distances) : 0;
    const avgDisplacement = distances.length > 0 ? distances.reduce((a, b) => a + b, 0) / distances.length : 0;
    const maxHorizontal = horizontals.length > 0 ? Math.max(...horizontals) : 0;
    const maxVertical = verticals.length > 0 ? Math.max(...verticals) : 0;

    const deformationType = analyzeDeformationType(maxDisplacement, maxHorizontal, maxVertical);
    const trend = analyzeTrend([...distances].reverse());

    const latest = rows[0];
    const previous = rows[1];
    const velocity =
      latest && previous
        ? (() => {
            const t0 = Date.parse(latest.event_time);
            const t1 = Date.parse(previous.event_time);
            const hours = Number.isFinite(t0) && Number.isFinite(t1) ? Math.max(0.0001, (t0 - t1) / (1000 * 60 * 60)) : 1;
            return (latest.deformation_distance_3d - previous.deformation_distance_3d) / hours;
          })()
        : 0;

    const confidence = rows.length > 0 ? rows.reduce((sum, r) => sum + r.deformation_confidence, 0) / rows.length : 0.9;
    const quality = Math.min(1, rows.length / 20) * Math.min(1, confidence / 0.8);

    const baseRisk = riskFromDisplacement(maxDisplacement);
    let riskLevel = baseRisk.level;
    const factors = [...baseRisk.factors];

    if (Math.abs(velocity) > 0.001) {
      riskLevel = Math.max(riskLevel, 1);
      factors.push("形变速度较快");
    }
    if (deformationType.code > 0) {
      riskLevel = Math.max(riskLevel, 1);
      factors.push(`检测到${deformationType.description}`);
      if (deformationType.code === 3 || deformationType.code === 4) {
        riskLevel = Math.max(riskLevel, 2);
        factors.push("复杂形变模式");
      }
    }
    if (quality < 0.7) factors.push("数据质量较低");

    const riskDescription =
      riskLevel === 1 ? "I级红色" : riskLevel === 2 ? "II级橙色" : riskLevel === 3 ? "III级黄色" : riskLevel === 4 ? "IV级蓝色" : "正常";

    void reply.code(200).send({
      success: true,
      deviceId: inputDeviceId,
      timestamp: nowIso,
      hasBaseline: true,
      hasData: true,
      baseline: {
        latitude: baselineInfo.latitude,
        longitude: baselineInfo.longitude,
        established_time: baselineInfo.established_time,
        established_by: baselineInfo.established_by
      },
      deformation: {
        type: deformationType.type,
        type_code: deformationType.code,
        type_description: deformationType.description,
        max_displacement: maxDisplacement,
        avg_displacement: avgDisplacement,
        horizontal_displacement: maxHorizontal,
        vertical_displacement: maxVertical,
        trend,
        velocity,
        risk_level: riskLevel,
        risk_description: riskDescription,
        risk_factors: factors,
        data_quality: quality,
        confidence,
        data_count: rows.length
      },
      latest_data: latest
        ? {
            timestamp: latest.event_time,
            latitude: latest.latitude,
            longitude: latest.longitude,
            displacement_3d: latest.deformation_distance_3d,
            horizontal: latest.deformation_horizontal,
            vertical: latest.deformation_vertical
          }
        : null
    });
  });

  app.get("/device-management/deformation/:deviceId/trend", async (request, reply) => {
    if (!(await requirePermission(adminCfg, pg, request, reply, "data:view"))) return;
    if (!pg) {
      legacyFail(reply, 503, "PostgreSQL not configured");
      return;
    }

    const parsedParams = z.object({ deviceId: deviceIdSchema }).safeParse(request.params ?? {});
    if (!parsedParams.success) {
      legacyFail(reply, 400, "invalid deviceId");
      return;
    }
    const parsedQuery = deformationTrendQuerySchema.safeParse(request.query ?? {});
    if (!parsedQuery.success) {
      legacyFail(reply, 400, "invalid query");
      return;
    }

    const inputDeviceId = parsedParams.data.deviceId;
    const days = parsedQuery.data.days ?? 7;
    const limit = Math.min(days * 24, 500);

    const resolved = await resolveDeviceId(pg, inputDeviceId);
    if (!resolved) {
      legacyFail(reply, 404, "device not found");
      return;
    }

    const baselineInfo = await fetchGpsBaselineInfo(pg, resolved);
    if (!baselineInfo) {
      void reply.code(400).send({ success: false, error: "设备未设置基准点", hasBaseline: false, timestamp: new Date().toISOString() });
      return;
    }

    const points = await fetchLatestGpsTelemetry(config, ch, resolved, limit);
    if (points.length === 0) {
      void reply.code(400).send({ success: false, error: "无GPS数据", hasData: false, timestamp: new Date().toISOString() });
      return;
    }

    const computed = computeLegacyGpsRows(points, baselineInfo);
    const rows = computed.rows;

    const distances = rows.map((r) => r.deformation_distance_3d);
    const maxDisplacement = distances.length > 0 ? Math.max(...distances) : 0;
    const trend = analyzeTrend([...distances].reverse());

    const latest = rows[0];
    const previous = rows[1];
    const velocity =
      latest && previous
        ? (() => {
            const t0 = Date.parse(latest.event_time);
            const t1 = Date.parse(previous.event_time);
            const hours = Number.isFinite(t0) && Number.isFinite(t1) ? Math.max(0.0001, (t0 - t1) / (1000 * 60 * 60)) : 1;
            return (latest.deformation_distance_3d - previous.deformation_distance_3d) / hours;
          })()
        : 0;

    const deformationType = analyzeDeformationType(maxDisplacement, maxDisplacement, 0);
    const risk = riskFromDisplacement(maxDisplacement);
    let riskLevel = risk.level;
    if (Math.abs(velocity) > 0.001 || deformationType.code > 0) riskLevel = Math.max(riskLevel, 1);
    const riskDescription =
      riskLevel === 1 ? "I级红色" : riskLevel === 2 ? "II级橙色" : riskLevel === 3 ? "III级黄色" : riskLevel === 4 ? "IV级蓝色" : "正常";

    const confidence = rows.length > 0 ? rows.reduce((sum, r) => sum + r.deformation_confidence, 0) / rows.length : 0.9;
    const quality = Math.min(1, rows.length / 20) * Math.min(1, confidence / 0.8);

    void reply.code(200).send({
      success: true,
      deviceId: inputDeviceId,
      timestamp: new Date().toISOString(),
      trend: {
        direction: trend,
        velocity,
        max_displacement: maxDisplacement,
        risk_level: riskLevel,
        risk_description: riskDescription
      },
      data_quality: quality,
      data_count: rows.length
    });
  });

  app.get("/device-management/deformation/:deviceId/summary", async (request, reply) => {
    if (!(await requirePermission(adminCfg, pg, request, reply, "data:view"))) return;
    if (!pg) {
      legacyFail(reply, 503, "PostgreSQL not configured");
      return;
    }

    const parsedParams = z.object({ deviceId: deviceIdSchema }).safeParse(request.params ?? {});
    if (!parsedParams.success) {
      legacyFail(reply, 400, "invalid deviceId");
      return;
    }

    const inputDeviceId = parsedParams.data.deviceId;
    const resolved = await resolveDeviceId(pg, inputDeviceId);
    if (!resolved) {
      legacyFail(reply, 404, "device not found");
      return;
    }

    const baselineInfo = await fetchGpsBaselineInfo(pg, resolved);
    if (!baselineInfo) {
      void reply.code(400).send({ success: false, error: "设备未设置基准点", hasBaseline: false, timestamp: new Date().toISOString() });
      return;
    }

    const points = await fetchLatestGpsTelemetry(config, ch, resolved, 20);
    if (points.length === 0) {
      void reply.code(400).send({ success: false, error: "无GPS数据", hasData: false, timestamp: new Date().toISOString() });
      return;
    }

    const computed = computeLegacyGpsRows(points, baselineInfo);
    const rows = computed.rows;

    const distances = rows.map((r) => r.deformation_distance_3d);
    const horizontals = rows.map((r) => Math.abs(r.deformation_horizontal));
    const verticals = rows.map((r) => Math.abs(r.deformation_vertical));

    const maxDisplacement = distances.length > 0 ? Math.max(...distances) : 0;
    const maxHorizontal = horizontals.length > 0 ? Math.max(...horizontals) : 0;
    const maxVertical = verticals.length > 0 ? Math.max(...verticals) : 0;

    const deformationType = analyzeDeformationType(maxDisplacement, maxHorizontal, maxVertical);
    const trend = analyzeTrend([...distances].reverse());

    const latest = rows[0];
    const previous = rows[1];
    const velocity =
      latest && previous
        ? (() => {
            const t0 = Date.parse(latest.event_time);
            const t1 = Date.parse(previous.event_time);
            const hours = Number.isFinite(t0) && Number.isFinite(t1) ? Math.max(0.0001, (t0 - t1) / (1000 * 60 * 60)) : 1;
            return (latest.deformation_distance_3d - previous.deformation_distance_3d) / hours;
          })()
        : 0;

    const confidence = rows.length > 0 ? rows.reduce((sum, r) => sum + r.deformation_confidence, 0) / rows.length : 0.9;
    const quality = Math.min(1, rows.length / 20) * Math.min(1, confidence / 0.8);

    const risk = riskFromDisplacement(maxDisplacement);
    let riskLevel = risk.level;
    if (Math.abs(velocity) > 0.001 || deformationType.code > 0) riskLevel = Math.max(riskLevel, 1);
    const riskDescription =
      riskLevel === 1 ? "I级红色" : riskLevel === 2 ? "II级橙色" : riskLevel === 3 ? "III级黄色" : riskLevel === 4 ? "IV级蓝色" : "正常";

    void reply.code(200).send({
      success: true,
      deviceId: inputDeviceId,
      timestamp: new Date().toISOString(),
      hasBaseline: true,
      hasData: true,
      deformation_type: deformationType.code,
      deformation_type_description: deformationType.description,
      max_displacement: maxDisplacement,
      horizontal_displacement: maxHorizontal,
      vertical_displacement: maxVertical,
      risk_level: riskLevel,
      risk_description: riskDescription,
      trend,
      velocity,
      confidence,
      data_quality: quality,
      debug_info: {
        raw_max_displacement: maxDisplacement,
        raw_horizontal: maxHorizontal,
        raw_vertical: maxVertical,
        raw_velocity: velocity,
        raw_confidence: confidence
      }
    });
  });

  app.get("/device-management", async (request, reply) => {
    if (!(await requirePermission(adminCfg, pg, request, reply, "data:view"))) return;
    if (!pg) {
      legacyFail(reply, 503, "PostgreSQL not configured");
      return;
    }

    const parsed = deviceManagementQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) {
      legacyFail(reply, 400, "invalid query");
      return;
    }

    const inputDeviceId = (parsed.data.device_id ?? parsed.data.deviceId ?? "").trim() || "device_1";
    const limit = parsed.data.limit ?? 50;
    const dataOnly = parsed.data.data_only ?? parsed.data.dataOnly ?? false;

    const resolved = await resolveDeviceId(pg, inputDeviceId);
    if (!resolved) {
      legacyFail(reply, 404, "device not found");
      return;
    }

    if (dataOnly) {
      let points: { eventTime: string; latitude: number; longitude: number }[];

      if (parsed.data.startTime && parsed.data.endTime) {
        const start = new Date(parsed.data.startTime);
        const end = new Date(parsed.data.endTime);
        if (!(start < end)) {
          legacyFail(reply, 400, "invalid time range");
          return;
        }
        points = await fetchGpsTelemetryInRange(config, ch, resolved, start, end, limit);
      } else if (parsed.data.timeRange) {
        const r = parseRelativeTimeRange(parsed.data.timeRange);
        points = await fetchGpsTelemetryInRange(config, ch, resolved, r.start, r.end, limit);
      } else {
        points = await fetchLatestGpsTelemetry(config, ch, resolved, limit);
      }

      const baseline = await fetchGpsBaseline(pg, resolved);
      const computed = computeLegacyGpsRows(points, baseline);

      void reply.code(200).send({
        success: true,
        data: computed.rows,
        count: computed.rows.length,
        deviceId: inputDeviceId,
        hasBaseline: computed.hasBaseline,
        calculationMode: "v2_clickhouse",
        timestamp: new Date().toISOString()
      });
      return;
    }

    const device = await fetchDeviceWithStation(pg, resolved);
    if (!device) {
      legacyFail(reply, 404, "device not found");
      return;
    }

    let todayCounts = new Map<string, number>();
    try {
      todayCounts = await todayTelemetryCounts(config, ch, [resolved]);
    } catch {
      todayCounts = new Map();
    }

    const baseline = await fetchGpsBaseline(pg, resolved);
    const online = onlineStatus(device.last_seen_at, device.status);

    void reply.code(200).send({
      success: true,
      data: {
        device_id: legacyKeyFromMetadata(device.device_name, device.metadata),
        real_name: device.device_id,
        display_name: device.station_name ?? device.device_name,
        status: online,
        last_active: device.last_seen_at ?? device.created_at,
        location: device.station_name ?? "",
        coordinates: { lat: device.latitude, lng: device.longitude },
        device_type: device.device_type,
        firmware_version: "",
        install_date: device.created_at,
        data_count_today: todayCounts.get(resolved) ?? 0,
        last_data_time: device.last_seen_at ?? device.created_at,
        health_score: online === "online" ? 95 : 0,
        temperature: null,
        humidity: null,
        battery_level: online === "online" ? 85 : 0,
        signal_strength: online === "online" ? 90 : 0,
        baseline_established: Boolean(baseline)
      },
      timestamp: new Date().toISOString()
    });
  });

  app.get("/device-management-optimized", async (request, reply) => {
    redirectLegacyAlias(request.raw.url, reply, "/device-management-optimized", "/device-management");
  });

  app.get("/device-management-real", async (request, reply) => {
    redirectLegacyAlias(request.raw.url, reply, "/device-management-real", "/device-management");
  });

  app.get("/device-management-real-db", async (request, reply) => {
    redirectLegacyAlias(request.raw.url, reply, "/device-management-real-db", "/device-management");
  });

  app.post("/device-management-real/diagnostics", async (request, reply) => {
    redirectLegacyAlias(request.raw.url, reply, "/device-management-real/diagnostics", "/device-management/diagnostics");
  });

  app.get("/device-management/hierarchical", async (request, reply) => {
    if (!(await requirePermission(adminCfg, pg, request, reply, "data:view"))) return;
    if (!pg) {
      legacyFail(reply, 503, "PostgreSQL not configured");
      return;
    }

    const devices = await listDevicesWithStations(pg);
    const deviceIds = devices.map((d) => d.device_id);
    const baselineIds = await baselineDeviceIds(pg, deviceIds);

    let todayCounts = new Map<string, number>();
    try {
      todayCounts = await todayTelemetryCounts(config, ch, deviceIds);
    } catch {
      todayCounts = new Map();
    }

    const mapped = devices.map((d) => {
      const simpleId = legacyKeyFromMetadata(d.device_name, d.metadata);
      const online = onlineStatus(d.last_seen_at, d.status);
      return {
        simple_id: simpleId,
        actual_device_id: d.device_id,
        device_name: d.device_name,
        location_name: d.station_name ?? "",
        device_type: d.device_type,
        latitude: d.latitude,
        longitude: d.longitude,
        status: "active",
        description: "",
        install_date: d.created_at,
        last_data_time: d.last_seen_at ?? d.created_at,
        online_status: online,
        today_data_count: todayCounts.get(d.device_id) ?? 0,
        baseline_established: baselineIds.has(d.device_id),
        health_score: online === "online" ? 95 : 0,
        battery_level: online === "online" ? 85 : 0,
        signal_strength: online === "online" ? 90 : 0
      };
    });

    const onlineDevices = mapped.filter((d) => d.online_status === "online").length;
    const offlineDevices = mapped.length - onlineDevices;

    const regions = [
      {
        id: "default",
        name: "默认监测区",
        devices: mapped,
        total_devices: mapped.length,
        online_devices: onlineDevices,
        offline_devices: offlineDevices
      }
    ];

    legacyOk(reply, {
      regions,
      allDevices: mapped,
      totalDevices: mapped.length,
      onlineDevices,
      offlineDevices
    });
  });

  app.get("/device-management/export", async (request, reply) => {
    if (!(await requirePermission(adminCfg, pg, request, reply, "data:view"))) return;
    if (!pg) {
      legacyFail(reply, 503, "PostgreSQL not configured");
      return;
    }

    const parsed = exportStatsQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      legacyFail(reply, 400, "invalid query");
      return;
    }

    const inputDeviceId = parsed.data.device_id ?? parsed.data.deviceId ?? "device_1";
    const resolved = await resolveDeviceId(pg, inputDeviceId);
    if (!resolved) {
      legacyFail(reply, 404, "device not found", inputDeviceId);
      return;
    }

    const now = new Date();
    const today = utcStartOfDay(now);
    const thisWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thisMonth = utcStartOfMonth(now);

    const result = await ch.query({
      query: `
        SELECT
          uniqExact(toStartOfMinute(received_ts)) AS total_records,
          toString(min(received_ts)) AS earliest,
          toString(max(received_ts)) AS latest,
          uniqExactIf(toStartOfMinute(received_ts), received_ts >= {today:DateTime64(3, 'UTC')}) AS today_records,
          uniqExactIf(toStartOfMinute(received_ts), received_ts >= {week:DateTime64(3, 'UTC')}) AS this_week_records,
          uniqExactIf(toStartOfMinute(received_ts), received_ts >= {month:DateTime64(3, 'UTC')}) AS this_month_records
        FROM ${config.clickhouseDatabase}.${config.clickhouseTable}
        WHERE device_id = {deviceId:String}
      `,
      query_params: {
        deviceId: resolved,
        today: toClickhouseDateTime64Utc(today),
        week: toClickhouseDateTime64Utc(thisWeek),
        month: toClickhouseDateTime64Utc(thisMonth)
      },
      format: "JSONEachRow"
    });

    const rows: {
      total_records: number | string;
      earliest: string | null;
      latest: string | null;
      today_records: number | string;
      this_week_records: number | string;
      this_month_records: number | string;
    }[] = await result.json();
    const row = rows[0];

    const totalRecords = typeof row?.total_records === "string" ? Number(row.total_records) : (row?.total_records ?? 0);
    const earliest = row?.earliest ? clickhouseStringToIsoZ(row.earliest) : null;
    const latest = row?.latest ? clickhouseStringToIsoZ(row.latest) : null;
    const todayRecords = typeof row?.today_records === "string" ? Number(row.today_records) : (row?.today_records ?? 0);
    const weekRecords =
      typeof row?.this_week_records === "string" ? Number(row.this_week_records) : (row?.this_week_records ?? 0);
    const monthRecords =
      typeof row?.this_month_records === "string" ? Number(row.this_month_records) : (row?.this_month_records ?? 0);

    legacyOk(reply, {
      total_records: totalRecords,
      date_range: totalRecords > 0 ? { earliest, latest } : null,
      today_records: todayRecords,
      this_week_records: weekRecords,
      this_month_records: monthRecords
    });
  });

  app.post("/device-management/export", async (request, reply) => {
    if (!(await requirePermission(adminCfg, pg, request, reply, "data:export"))) return;
    if (!pg) {
      legacyFail(reply, 503, "PostgreSQL not configured");
      return;
    }

    const parsed = exportRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      legacyFail(reply, 400, "invalid body");
      return;
    }

    const inputDeviceId = parsed.data.device_id ?? "device_1";
    const exportType = parsed.data.export_type ?? "today";
    const format = parsed.data.format ?? "json";

    const resolved = await resolveDeviceId(pg, inputDeviceId);
    if (!resolved) {
      legacyFail(reply, 404, "device not found", inputDeviceId);
      return;
    }

    const now = new Date();
    let start: Date;
    let end: Date;

    if (exportType === "today") {
      start = utcStartOfDay(now);
      end = utcTomorrowStart(now);
    } else if (exportType === "history") {
      start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      end = now;
    } else {
      const startParsed = parsed.data.start_date ? new Date(parsed.data.start_date) : null;
      const endParsed = parsed.data.end_date ? new Date(parsed.data.end_date) : null;
      if (!startParsed || !endParsed || !Number.isFinite(startParsed.getTime()) || !Number.isFinite(endParsed.getTime())) {
        legacyFail(reply, 400, "invalid time range");
        return;
      }
      start = startParsed;
      end = endParsed;
    }

    const buckets = await fetchDeviceMinuteBuckets(config, ch, resolved, start, end, 10000);
    if (buckets.length === 0) {
      legacyFail(reply, 404, "没有找到数据", "no data");
      return;
    }

    const processed = buckets.map((r) => ({
      时间: toZhCnTime(r.bucket_ts),
      设备ID: inputDeviceId,
      温度: r.temperature_c == null ? "N/A" : `${String(r.temperature_c)}°C`,
      湿度: r.humidity_pct == null ? "N/A" : `${String(r.humidity_pct)}%`,
      照度: r.illumination == null ? "N/A" : String(r.illumination),
      加速度X: r.acceleration_x == null ? "N/A" : String(r.acceleration_x),
      加速度Y: r.acceleration_y == null ? "N/A" : String(r.acceleration_y),
      加速度Z: r.acceleration_z == null ? "N/A" : String(r.acceleration_z),
      陀螺仪X: r.gyroscope_x == null ? "N/A" : String(r.gyroscope_x),
      陀螺仪Y: r.gyroscope_y == null ? "N/A" : String(r.gyroscope_y),
      陀螺仪Z: r.gyroscope_z == null ? "N/A" : String(r.gyroscope_z)
    }));

    if (format === "csv") {
      const csv = toCsv(processed);
      const ymd = new Date().toISOString().slice(0, 10);
      void reply
        .header("Content-Type", "text/csv; charset=utf-8")
        .header("Content-Disposition", `attachment; filename="device_${inputDeviceId}_${exportType}_${ymd}.csv"`)
        .code(200)
        .send(csv);
      return;
    }

    void reply.code(200).send({
      success: true,
      data: processed,
      meta: {
        device_id: inputDeviceId,
        export_type: exportType,
        total_records: processed.length,
        export_time: new Date().toISOString(),
        time_range: {
          start: buckets[buckets.length - 1]?.bucket_ts ?? null,
          end: buckets[0]?.bucket_ts ?? null
        }
      }
    });
  });

  app.get("/device-management/reports", async (request, reply) => {
    if (!(await requirePermission(adminCfg, pg, request, reply, "data:view"))) return;
    if (!pg) {
      legacyFail(reply, 503, "PostgreSQL not configured");
      return;
    }

    const parsed = reportsQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      legacyFail(reply, 400, "invalid query");
      return;
    }

    const inputDeviceId = parsed.data.device_id ?? "device_1";
    const resolved = await resolveDeviceId(pg, inputDeviceId);
    if (!resolved) {
      legacyFail(reply, 404, "device not found", inputDeviceId);
      return;
    }

    const res = await ch.query({
      query: `
        SELECT
          toString(min(received_ts)) AS earliest,
          toString(max(received_ts)) AS latest
        FROM ${config.clickhouseDatabase}.${config.clickhouseTable}
        WHERE device_id = {deviceId:String}
      `,
      query_params: { deviceId: resolved },
      format: "JSONEachRow"
    });
    const rows: { earliest: string | null; latest: string | null }[] = await res.json();
    const earliest = rows[0]?.earliest ? clickhouseStringToIsoZ(rows[0].earliest) : null;
    const latest = rows[0]?.latest ? clickhouseStringToIsoZ(rows[0].latest) : null;

    void reply.code(200).send({
      success: true,
      data: {
        available_types: [
          { type: "daily", name: "日报告", description: "过去24小时的设备运行报告" },
          { type: "weekly", name: "周报告", description: "过去7天的设备运行报告" },
          { type: "monthly", name: "月报告", description: "过去30天的设备运行报告" },
          { type: "custom", name: "自定义", description: "指定时间范围的设备运行报告" }
        ],
        data_range: earliest && latest ? { earliest, latest } : { earliest: null, latest: null }
      }
    });
  });

  app.post("/device-management/reports", async (request, reply) => {
    if (!(await requirePermission(adminCfg, pg, request, reply, "data:view"))) return;
    if (!pg) {
      legacyFail(reply, 503, "PostgreSQL not configured");
      return;
    }

    const parsed = reportsRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      legacyFail(reply, 400, "invalid body");
      return;
    }

    const inputDeviceId = parsed.data.device_id ?? "device_1";
    const reportType = parsed.data.report_type ?? "daily";
    const resolved = await resolveDeviceId(pg, inputDeviceId);
    if (!resolved) {
      legacyFail(reply, 404, "device not found", inputDeviceId);
      return;
    }

    const now = new Date();
    let start: Date;
    let end: Date = now;

    if (reportType === "daily") {
      start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    } else if (reportType === "weekly") {
      start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (reportType === "monthly") {
      start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    } else {
      const startParsed = parsed.data.start_date ? new Date(parsed.data.start_date) : null;
      const endParsed = parsed.data.end_date ? new Date(parsed.data.end_date) : null;
      if (!startParsed || !endParsed || !Number.isFinite(startParsed.getTime()) || !Number.isFinite(endParsed.getTime())) {
        legacyFail(reply, 400, "invalid time range");
        return;
      }
      start = startParsed;
      end = endParsed;
    }

    const statsRes = await ch.query({
      query: `
        SELECT
          uniqExact(toStartOfMinute(received_ts)) AS total_records,
          toString(min(received_ts)) AS first_record,
          toString(max(received_ts)) AS last_record,
          minIf(v, sensor_key = 'temperature_c') AS temp_min,
          maxIf(v, sensor_key = 'temperature_c') AS temp_max,
          avgIf(v, sensor_key = 'temperature_c') AS temp_avg,
          countIf(sensor_key = 'temperature_c' AND NOT isNull(v)) AS temp_count,
          minIf(v, sensor_key = 'humidity_pct') AS humidity_min,
          maxIf(v, sensor_key = 'humidity_pct') AS humidity_max,
          avgIf(v, sensor_key = 'humidity_pct') AS humidity_avg,
          countIf(sensor_key = 'humidity_pct' AND NOT isNull(v)) AS humidity_count
        FROM (
          SELECT
            received_ts,
            sensor_key,
            if(isNull(value_f64) AND isNull(value_i64), NULL, coalesce(value_f64, toFloat64(value_i64))) AS v
          FROM ${config.clickhouseDatabase}.${config.clickhouseTable}
          WHERE device_id = {deviceId:String}
            AND received_ts >= {start:DateTime64(3, 'UTC')}
            AND received_ts <= {end:DateTime64(3, 'UTC')}
            AND sensor_key IN {sensorKeys:Array(String)}
        )
      `,
      query_params: {
        deviceId: resolved,
        start: toClickhouseDateTime64Utc(start),
        end: toClickhouseDateTime64Utc(end),
        sensorKeys: ["temperature_c", "humidity_pct"]
      },
      format: "JSONEachRow"
    });

    const rows: {
      total_records: number | string;
      first_record: string | null;
      last_record: string | null;
      temp_min: number | null;
      temp_max: number | null;
      temp_avg: number | null;
      temp_count: number | string;
      humidity_min: number | null;
      humidity_max: number | null;
      humidity_avg: number | null;
      humidity_count: number | string;
    }[] = await statsRes.json();
    const s = rows[0];

    const totalRecords =
      typeof s?.total_records === "string" ? Number(s.total_records) : (s?.total_records ?? 0);
    if (!totalRecords) {
      legacyFail(reply, 404, "指定时间范围内没有数据");
      return;
    }

    const expectedRecords = Math.max(1, Math.floor((end.getTime() - start.getTime()) / (60 * 1000)));
    const dataCompleteness = Math.min(100, (totalRecords / expectedRecords) * 100);

    const anomalies: { type: string; message: string; severity: "warning" | "critical" }[] = [];
    if (s?.temp_min != null && s.temp_max != null) {
      if (s.temp_min < -10 || s.temp_max > 60) {
        anomalies.push({
          type: "temperature_out_of_range",
          message: `温度超出正常范围: ${String(s.temp_min)}°C - ${String(s.temp_max)}°C`,
          severity: "warning"
        });
      }
    }
    if (s?.humidity_min != null && s.humidity_max != null) {
      if (s.humidity_min < 0 || s.humidity_max > 100) {
        anomalies.push({
          type: "humidity_out_of_range",
          message: `湿度超出正常范围: ${String(s.humidity_min)}% - ${String(s.humidity_max)}%`,
          severity: "warning"
        });
      }
    }
    if (dataCompleteness < 80) {
      anomalies.push({
        type: "data_incomplete",
        message: `数据完整性不足: ${dataCompleteness.toFixed(1)}%`,
        severity: dataCompleteness < 50 ? "critical" : "warning"
      });
    }

    let deviceStatus: "healthy" | "warning" | "critical" = "healthy";
    if (anomalies.some((a) => a.severity === "critical")) deviceStatus = "critical";
    else if (anomalies.length > 0) deviceStatus = "warning";

    const tempCount = typeof s?.temp_count === "string" ? Number(s.temp_count) : (s?.temp_count ?? 0);
    const humidityCount =
      typeof s?.humidity_count === "string" ? Number(s.humidity_count) : (s?.humidity_count ?? 0);

    const baseReport = {
      device_id: inputDeviceId,
      report_type: reportType,
      time_range: {
        start: start.toISOString(),
        end: end.toISOString(),
        duration_hours: Math.round((end.getTime() - start.getTime()) / (60 * 60 * 1000))
      },
      data_summary: {
        total_records: totalRecords,
        expected_records: expectedRecords,
        data_completeness: Math.round(dataCompleteness * 100) / 100,
        first_record: s?.first_record ? clickhouseStringToIsoZ(s.first_record) : null,
        last_record: s?.last_record ? clickhouseStringToIsoZ(s.last_record) : null
      },
      sensor_statistics: {
        temperature:
          s?.temp_min != null && s.temp_max != null && s.temp_avg != null
            ? {
                min: Math.round(s.temp_min * 10) / 10,
                max: Math.round(s.temp_max * 10) / 10,
                avg: Math.round(s.temp_avg * 10) / 10,
                count: tempCount
              }
            : null,
        humidity:
          s?.humidity_min != null && s.humidity_max != null && s.humidity_avg != null
            ? {
                min: Math.round(s.humidity_min * 10) / 10,
                max: Math.round(s.humidity_max * 10) / 10,
                avg: Math.round(s.humidity_avg * 10) / 10,
                count: humidityCount
              }
            : null
      },
      device_status: {
        overall: deviceStatus,
        anomalies_count: anomalies.length,
        uptime_percentage: dataCompleteness
      },
      anomalies,
      recommendations: [
        ...(dataCompleteness < 90 ? ["检查设备网络连接稳定性"] : []),
        ...(s?.temp_min != null && s.temp_max != null && s.temp_max - s.temp_min > 30 ? ["检查温度传感器稳定性"] : []),
        ...(anomalies.length > 0 ? ["及时处理检测到的异常"] : []),
        "定期进行设备维护检查",
        "监控设备运行状态"
      ],
      generated_at: new Date().toISOString()
    };

    const aiAnalysis = {
      summary:
        deviceStatus === "healthy"
          ? "设备运行状态良好，数据采集与传输正常。"
          : deviceStatus === "warning"
            ? "设备运行存在轻微风险，建议关注告警与数据完整性。"
            : "设备运行风险较高，建议尽快排查网络/传感器与供电问题。",
      insights: [
        `数据完整性：${dataCompleteness.toFixed(1)}%`,
        ...(baseReport.sensor_statistics.temperature
          ? [
              `温度范围：${String(baseReport.sensor_statistics.temperature.min)}°C ~ ${String(
                baseReport.sensor_statistics.temperature.max
              )}°C`
            ]
          : []),
        ...(baseReport.sensor_statistics.humidity
          ? [
              `湿度范围：${String(baseReport.sensor_statistics.humidity.min)}% ~ ${String(
                baseReport.sensor_statistics.humidity.max
              )}%`
            ]
          : [])
      ],
      recommendations: ["保持网络稳定", "按计划进行巡检与维护"]
    };

    const report = {
      ...baseReport,
      ai_analysis: aiAnalysis,
      enhanced_recommendations: [...baseReport.recommendations, ...aiAnalysis.recommendations]
    };

    void reply.code(200).send({ success: true, data: report });
  });

  app.post("/device-management/diagnostics", async (request, reply) => {
    if (!(await requirePermission(adminCfg, pg, request, reply, "data:view"))) return;
    if (!pg) {
      legacyFail(reply, 503, "PostgreSQL not configured");
      return;
    }

    const parsed = diagnosticsRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      legacyFail(reply, 400, "invalid body");
      return;
    }

    const inputDeviceId = parsed.data.simple_id ?? parsed.data.device_id;
    if (!inputDeviceId) {
      legacyFail(reply, 400, "missing device_id");
      return;
    }

    const resolved = await resolveDeviceId(pg, inputDeviceId);
    if (!resolved) {
      legacyFail(reply, 404, "device not found", inputDeviceId);
      return;
    }

    const device = await fetchDeviceWithStation(pg, resolved);
    if (!device) {
      legacyFail(reply, 404, "device not found", inputDeviceId);
      return;
    }

    const now = new Date();
    const online = onlineStatus(device.last_seen_at, device.status);

    const baseline = await fetchGpsBaseline(pg, resolved);

    const todayStart = utcStartOfDay(now);
    const statsRes = await ch.query({
      query: `
        SELECT
          uniqExactIf(toStartOfMinute(received_ts), received_ts >= {today:DateTime64(3, 'UTC')}) AS today_records,
          groupUniqArray(toUnixTimestamp(toStartOfMinute(received_ts))) AS buckets
        FROM ${config.clickhouseDatabase}.${config.clickhouseTable}
        WHERE device_id = {deviceId:String}
          AND received_ts >= {start:DateTime64(3, 'UTC')}
          AND sensor_key IN {sensorKeys:Array(String)}
      `,
      query_params: {
        deviceId: resolved,
        today: toClickhouseDateTime64Utc(todayStart),
        start: toClickhouseDateTime64Utc(new Date(now.getTime() - 24 * 60 * 60 * 1000)),
        sensorKeys: ["temperature_c", "humidity_pct", "vibration_g", "battery_v", "battery_pct", "rssi_dbm"]
      },
      format: "JSONEachRow"
    });
    const statRows: { today_records: number | string; buckets: number[] }[] = await statsRes.json();
    const firstStats = statRows[0];
    const todayRaw = firstStats?.today_records;
    const todayRecords = typeof todayRaw === "string" ? Number(todayRaw) : (todayRaw ?? 0);
    const bucketSeconds = Array.isArray(firstStats?.buckets) ? firstStats.buckets.slice().sort((a, b) => a - b) : [];

    const gaps: number[] = [];
    for (let i = 1; i < bucketSeconds.length; i++) {
      const curr = bucketSeconds[i];
      const prev = bucketSeconds[i - 1];
      if (curr == null || prev == null) continue;
      const gapMinutes = (curr - prev) / 60;
      if (gapMinutes > 5) gaps.push(gapMinutes);
    }
    const gapAnalysis = {
      maxGapMinutes: gaps.length > 0 ? Math.max(...gaps) : 0,
      avgGapMinutes: gaps.length > 0 ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0,
      gapCount: gaps.length
    };

    const lastDataTime = device.last_seen_at ? new Date(device.last_seen_at) : null;
    const minutesSinceLastData =
      lastDataTime && Number.isFinite(lastDataTime.getTime())
        ? (now.getTime() - lastDataTime.getTime()) / (1000 * 60)
        : null;

    const factors = {
      online_status: 0,
      data_freshness: 0,
      data_volume: 0,
      baseline_status: 0,
      connection_stability: 0
    };

    if (online === "online") factors.online_status = 30;
    if (minutesSinceLastData != null) {
      if (minutesSinceLastData <= 5) factors.data_freshness = 25;
      else if (minutesSinceLastData <= 30) factors.data_freshness = 20;
      else if (minutesSinceLastData <= 120) factors.data_freshness = 10;
    }

    if (todayRecords >= 100) factors.data_volume = 20;
    else if (todayRecords >= 50) factors.data_volume = 15;
    else if (todayRecords >= 10) factors.data_volume = 10;
    else if (todayRecords > 0) factors.data_volume = 5;

    if (baseline) factors.baseline_status = 15;

    if (bucketSeconds.length > 1) {
      if (gapAnalysis.maxGapMinutes <= 10) factors.connection_stability = 10;
      else if (gapAnalysis.maxGapMinutes <= 30) factors.connection_stability = 7;
      else if (gapAnalysis.maxGapMinutes <= 60) factors.connection_stability = 4;
    }

    const healthScore = Object.values(factors).reduce((sum, v) => sum + v, 0);
    const overallStatus = healthScore >= 80 ? "healthy" : healthScore >= 50 ? "warning" : "error";

    const recommendations: string[] = [];
    if (online !== "online") recommendations.push("设备离线，检查设备电源和网络连接");
    if (factors.data_freshness === 0) recommendations.push("数据更新延迟，检查数据采集系统");
    if (factors.data_volume <= 5) recommendations.push("数据量偏低，检查传感器工作状态");
    if (!baseline) recommendations.push("建议建立GPS基准点以启用形变监测");
    if (factors.connection_stability <= 4) recommendations.push("连接不稳定，检查网络环境和信号强度");

    void reply.code(200).send({
      success: true,
      data: {
        overall_status: overallStatus,
        health_score: Math.round(healthScore),
        data_quality: todayRecords > 0 ? "normal" : "poor",
        connection_status: factors.connection_stability >= 7 ? "stable" : "unstable",
        baseline_status: baseline ? "active" : "inactive",
        performance_metrics: {
          today_data_count: todayRecords,
          avg_response_time: online === "online" ? Math.floor(Math.random() * 100) + 50 : 0,
          last_communication: device.last_seen_at ?? now.toISOString(),
          data_gap_analysis: bucketSeconds.length > 1 ? gapAnalysis : null
        },
        recommendations,
        factors,
        timestamp: now.toISOString()
      },
      timestamp: now.toISOString()
    });
  });

  app.get("/iot/devices/mappings", async (request, reply) => {
    if (!(await requirePermission(adminCfg, pg, request, reply, "data:view"))) return;
    if (!pg) {
      legacyFail(reply, 503, "PostgreSQL not configured");
      return;
    }

    const devices = await listDevicesWithStations(pg);
    const mapped = devices.map((d) => {
      const online = onlineStatus(d.last_seen_at, d.status);
      return {
        simple_id: legacyKeyFromMetadata(d.device_name, d.metadata),
        actual_device_id: d.device_id,
        device_name: d.device_name,
        location_name: d.station_name ?? "",
        device_type: d.device_type,
        latitude: d.latitude,
        longitude: d.longitude,
        status: "active",
        description: "",
        install_date: d.created_at,
        last_data_time: d.last_seen_at ?? d.created_at,
        online_status: online
      };
    });

    legacyOk(reply, mapped);
  });

  app.get("/iot/devices/:deviceId", async (request, reply) => {
    if (!(await requirePermission(adminCfg, pg, request, reply, "data:view"))) return;
    if (!pg) {
      legacyFail(reply, 503, "PostgreSQL not configured");
      return;
    }

    const parsed = deviceIdSchema.safeParse((request.params as { deviceId?: unknown }).deviceId);
    if (!parsed.success) {
      legacyFail(reply, 400, "invalid deviceId");
      return;
    }

    const resolved = await resolveDeviceId(pg, parsed.data);
    if (!resolved) {
      legacyFail(reply, 404, "device not found");
      return;
    }

    const row = await withPgClient(pg, async (client) =>
      queryOne<DeviceListRow>(
        client,
        `
          SELECT
            d.device_id,
            d.device_name,
            d.device_type,
            d.status,
            to_char(d.last_seen_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS last_seen_at,
            d.metadata,
            d.station_id,
            s.station_name,
            s.latitude,
            s.longitude,
            to_char(d.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at
          FROM devices d
          LEFT JOIN stations s ON s.station_id = d.station_id
          WHERE d.device_id = $1
        `,
        [resolved]
      )
    );

    if (!row) {
      legacyFail(reply, 404, "device not found");
      return;
    }

    const online = onlineStatus(row.last_seen_at, row.status);
    legacyOk(reply, {
      simple_id: legacyKeyFromMetadata(row.device_name, row.metadata),
      actual_device_id: row.device_id,
      device_name: row.device_name,
      location_name: row.station_name ?? "",
      device_type: row.device_type,
      latitude: row.latitude,
      longitude: row.longitude,
      status: "active",
      description: "",
      install_date: row.created_at,
      last_data_time: row.last_seen_at ?? row.created_at,
      online_status: online
    });
  });

  app.get("/monitoring-stations", async (request, reply) => {
    if (!(await requirePermission(adminCfg, pg, request, reply, "data:view"))) return;
    if (!pg) {
      legacyFail(reply, 503, "PostgreSQL not configured");
      return;
    }

    const query = (request.query ?? {}) as { chartType?: unknown };
    const chartType = typeof query.chartType === "string" ? query.chartType : "";
    if (chartType) {
      legacyOk(reply, {
        chartType,
        title: chartType,
        unit: "",
        yAxisName: "",
        deviceLegends: {}
      });
      return;
    }

    const devices = await listDevicesWithStations(pg);
    const list = devices.map((d) => ({
      device_id: legacyKeyFromMetadata(d.device_name, d.metadata),
      actual_device_id: d.device_id,
      station_name: d.station_name ?? d.device_name,
      location_name: d.station_name ?? "",
      latitude: d.latitude,
      longitude: d.longitude,
      status: d.status
    }));

    legacyOk(reply, list);
  });

  // Compatibility: legacy docs use /monitoring-stations/chart-config?type=temperature
  app.get("/monitoring-stations/chart-config", async (request, reply) => {
    if (!(await requirePermission(adminCfg, pg, request, reply, "data:view"))) return;

    const query = (request.query ?? {}) as { type?: unknown; chartType?: unknown };
    const chartType = typeof query.type === "string" ? query.type : typeof query.chartType === "string" ? query.chartType : "";
    if (!chartType) {
      legacyFail(reply, 400, "type is required");
      return;
    }

    legacyOk(reply, {
      chartType,
      title: chartType,
      unit: "",
      yAxisName: "",
      deviceLegends: {}
    });
  });

  app.put("/monitoring-stations", async (request, reply) => {
    if (!(await requirePermission(adminCfg, pg, request, reply, "data:view"))) return;
    if (!pg) {
      legacyFail(reply, 503, "PostgreSQL not configured");
      return;
    }

    const query = (request.query ?? {}) as { deviceId?: unknown; device_id?: unknown };
    const input = typeof query.deviceId === "string" ? query.deviceId : typeof query.device_id === "string" ? query.device_id : "";
    if (!input.trim()) {
      legacyFail(reply, 400, "deviceId is required");
      return;
    }

    const resolved = await resolveDeviceId(pg, input.trim());
    if (!resolved) {
      legacyFail(reply, 404, "device not found");
      return;
    }

    const bodyParsed = monitoringStationsUpdateSchema.safeParse(request.body ?? {});
    if (!bodyParsed.success) {
      legacyFail(reply, 400, "invalid body");
      return;
    }

    const patch = bodyParsed.data;
    await withPgClient(pg, async (client) => {
      await client.query(
        `
          UPDATE devices
          SET metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb, updated_at = NOW()
          WHERE device_id = $1
        `,
        [resolved, JSON.stringify(patch)]
      );
    });

    legacyOk(reply, { updated: true });
  });

  app.post("/monitoring-stations", async (request, reply) => {
    if (!(await requirePermission(adminCfg, pg, request, reply, "data:view"))) return;
    if (!pg) {
      legacyFail(reply, 503, "PostgreSQL not configured");
      return;
    }

    const parsed = monitoringStationsBulkUpdateSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      legacyFail(reply, 400, "invalid body");
      return;
    }

    const legends = parsed.data.deviceLegends ?? {};
    const entries = Object.entries(legends).filter(([, name]) => typeof name === "string" && name.trim());
    if (entries.length === 0) {
      legacyOk(reply, { updated: 0 }, "no-op");
      return;
    }

    const updated = await withPgClient(pg, async (client) => {
      await client.query("BEGIN");
      try {
        let count = 0;
        for (const [deviceKey, legendName] of entries) {
          const resolved = await resolveDeviceIdWithClient(client, deviceKey);
          if (!resolved) continue;
          await client.query(
            `
              UPDATE devices
              SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{chart_legend_name}', to_jsonb($2::text), true),
                  updated_at = NOW()
              WHERE device_id = $1
            `,
            [resolved, legendName]
          );
          count += 1;
        }
        await client.query("COMMIT");
        return count;
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    });

    legacyOk(reply, { updated });
  });

  app.get("/monitoring-stations-optimized", async (request, reply) => {
    redirectLegacyAlias(request.raw.url, reply, "/monitoring-stations-optimized", "/monitoring-stations");
  });

  app.put("/monitoring-stations-optimized", async (request, reply) => {
    redirectLegacyAlias(request.raw.url, reply, "/monitoring-stations-optimized", "/monitoring-stations");
  });

  app.get("/monitoring-stations/:deviceId", async (request, reply) => {
    if (!(await requirePermission(adminCfg, pg, request, reply, "data:view"))) return;
    if (!pg) {
      legacyFail(reply, 503, "PostgreSQL not configured");
      return;
    }

    const parsed = deviceIdSchema.safeParse((request.params as { deviceId?: unknown }).deviceId);
    if (!parsed.success) {
      legacyFail(reply, 400, "invalid deviceId");
      return;
    }

    const resolved = await resolveDeviceId(pg, parsed.data);
    if (!resolved) {
      legacyFail(reply, 404, "monitoring station not found");
      return;
    }

    const row = await withPgClient(pg, async (client) =>
      queryOne<DeviceListRow>(
        client,
        `
          SELECT
            d.device_id,
            d.device_name,
            d.device_type,
            d.status,
            to_char(d.last_seen_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS last_seen_at,
            d.metadata,
            d.station_id,
            s.station_name,
            s.latitude,
            s.longitude,
            to_char(d.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at
          FROM devices d
          LEFT JOIN stations s ON s.station_id = d.station_id
          WHERE d.device_id = $1
        `,
        [resolved]
      )
    );

    if (!row) {
      legacyFail(reply, 404, "monitoring station not found");
      return;
    }

    legacyOk(reply, {
      device_id: legacyKeyFromMetadata(row.device_name, row.metadata),
      actual_device_id: row.device_id,
      station_name: row.station_name ?? row.device_name,
      location_name: row.station_name ?? "",
      latitude: row.latitude,
      longitude: row.longitude,
      status: row.status
    });
  });

  app.delete("/data-aggregation", async (request, reply) => {
    if (!(await requirePermission(adminCfg, pg, request, reply, "data:view"))) return;

    const q = request.query as { action?: unknown };
    const action = typeof q.action === "string" ? q.action : "";
    if (action !== "clear_cache") {
      legacyFail(reply, 400, "invalid action");
      return;
    }

    legacyOk(reply, { cleared: true }, "cache cleared");
  });

  app.post("/data-aggregation", async (request, reply) => {
    if (!(await requirePermission(adminCfg, pg, request, reply, "data:view"))) return;
    if (!pg) {
      legacyFail(reply, 503, "PostgreSQL not configured");
      return;
    }

    const parsed = aggregationSchema.safeParse(request.body);
    if (!parsed.success) {
      legacyFail(reply, 400, "invalid body");
      return;
    }

    const type = parsed.data.type;
    const devicesInput = parsed.data.devices ?? [];
    const deviceIds = devicesInput.length > 0 ? devicesInput : [];
    const timeRange = parsed.data.timeRange ?? "24h";
    const send = (payload: Record<string, unknown>) => {
      void reply.code(200).send({ success: true, ...payload, timestamp: new Date().toISOString() });
    };

    try {
      if (type === "hierarchy_stats") {
        const stats = await withPgClient(pg, async (client) => {
          const stations = await queryOne<{ count: string }>(client, "SELECT count(*)::text AS count FROM stations", []);
          const devices = await client.query<{ status: string; count: string }>(
            `
              SELECT status, count(*)::text AS count
              FROM devices
              WHERE status != 'revoked'
              GROUP BY status
            `
          );
          return { stations: Number(stations?.count ?? "0"), devices: devices.rows };
        });

        const deviceCounts: Record<string, number> = {};
        for (const r of stats.devices) deviceCounts[r.status] = Number(r.count);

        send({
          type,
          data: {
            summary: {
              total_regions: 1,
              total_networks: 0,
              total_devices: (deviceCounts.active ?? 0) + (deviceCounts.inactive ?? 0),
              active_devices: deviceCounts.active ?? 0,
              stations: stats.stations
            }
          },
          generatedAt: new Date().toISOString(),
          source: "v2-postgres"
        });
        return;
      } else if (type === "real_time_dashboard") {
        const now = new Date();
        const start = utcStartOfDay(now);

        const todayDataCount = await (async () => {
          try {
            const res = await ch.query({
              query: `
                SELECT count()::UInt64 AS c
                FROM ${config.clickhouseDatabase}.${config.clickhouseTable}
                WHERE received_ts >= {start:DateTime64(3, 'UTC')}
              `,
              query_params: { start: toClickhouseDateTime64Utc(start) },
              format: "JSONEachRow"
            });
            const rows: { c: number | string }[] = await res.json();
            const v = rows[0]?.c;
            return typeof v === "string" ? Number(v) : v ?? 0;
          } catch {
            return 0;
          }
        })();

        const data = await withPgClient(pg, async (client) => {
          const devices = await client.query<{ status: string; count: string }>(
            `
              SELECT status, count(*)::text AS count
              FROM devices
              GROUP BY status
            `
          );
          const stations = await queryOne<{ count: string }>(client, "SELECT count(*)::text AS count FROM stations", []);

          const alerts = await client.query<{ status: string; severity: string; count: string }>(
            `
              WITH latest AS (
                SELECT DISTINCT ON (alert_id)
                  alert_id,
                  event_type,
                  severity,
                  created_at AS last_event_at
                FROM alert_events
                ORDER BY alert_id, created_at DESC
              ),
              a AS (
                SELECT
                  alert_id,
                  CASE
                    WHEN event_type IN ('ALERT_TRIGGER','ALERT_UPDATE') THEN 'active'
                    WHEN event_type = 'ALERT_ACK' THEN 'acked'
                    ELSE 'resolved'
                  END AS status,
                  severity
                FROM latest
              )
              SELECT status, severity, count(*)::text AS count
              FROM a
              GROUP BY status, severity
            `
          );

          return { devices: devices.rows, stations: Number(stations?.count ?? "0"), alerts: alerts.rows };
        });

        const deviceCounts: Record<string, number> = {};
        for (const r of data.devices) deviceCounts[r.status] = Number(r.count);
        const onlineDevices = deviceCounts.active ?? 0;
        const offlineDevices = deviceCounts.inactive ?? 0;

        const alertsBySeverity: Record<string, number> = { low: 0, medium: 0, high: 0, critical: 0 };
        let pendingAlerts = 0;
        for (const r of data.alerts) {
          const c = Number(r.count);
          if (r.status === "active" || r.status === "acked") pendingAlerts += c;
          if (r.status === "active" || r.status === "acked") {
            alertsBySeverity[r.severity] = (alertsBySeverity[r.severity] ?? 0) + c;
          }
        }

        send({
          type,
          data: {
            todayDataCount,
            onlineDevices,
            offlineDevices,
            pendingAlerts,
            alertsBySeverity,
            stations: data.stations,
            lastUpdatedAt: now.toISOString()
          },
          generatedAt: now.toISOString(),
          source: "v2-dashboard"
        });
        return;
      } else if (type === "network_stats") {
        const devices = deviceIds.length > 0 ? deviceIds : (await listDevicesWithStations(pg)).map((d) => d.device_id);
        let counts = new Map<string, number>();
        try {
          counts = await last24hTelemetryCounts(config, ch, devices);
        } catch {
          counts = new Map();
        }

        send({
          type,
          data: {
            devices: devices.map((id) => ({ device_id: id, data_points: counts.get(id) ?? 0 })),
            network_summary: {
              total_devices: devices.length,
              total_data_points: Array.from(counts.values()).reduce((a, b) => a + b, 0),
              timeRange
            }
          },
          generatedAt: new Date().toISOString(),
          source: "v2-clickhouse"
        });
        return;
      } else {
        const targets = deviceIds.length > 0 ? deviceIds : (await listDevicesWithStations(pg)).map((d) => d.device_id);
        const deviceRows = await withPgClient(pg, async (client) => {
          const res = await client.query<{ device_id: string; state: unknown; updated_at: string }>(
            `
              SELECT
                device_id,
                state,
                to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at
              FROM device_state
              WHERE device_id = ANY($1::uuid[])
            `,
            [targets]
          );
          return res.rows;
        });
        const byId = new Map(deviceRows.map((r) => [r.device_id, r]));
        send({
          type,
          data: targets.map((id) => ({ device_id: id, updated_at: byId.get(id)?.updated_at ?? null, state: byId.get(id)?.state ?? null })),
          generatedAt: new Date().toISOString(),
          source: "v2-device_state"
        });
        return;
      }
    } catch (err) {
      legacyFail(reply, 500, "aggregation failed", err instanceof Error ? err.message : String(err));
    }
  });
}
