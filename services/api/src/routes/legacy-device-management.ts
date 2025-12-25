import type { ClickHouseClient } from "@clickhouse/client";
import type { FastifyInstance, FastifyReply } from "fastify";
import type { FastifyRequest } from "fastify";
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

const legacyExportBodySchema = z
  .object({
    device_id: z.string().optional(),
    deviceId: z.string().optional(),
    export_type: z.enum(["today", "history", "custom"]).optional(),
    start_date: z.string().optional(),
    end_date: z.string().optional(),
    format: z.enum(["json", "csv"]).optional()
  })
  .strict();

const legacyExportQuerySchema = z.object({
  device_id: z.string().optional(),
  deviceId: z.string().optional()
});

const legacyReportBodySchema = z
  .object({
    device_id: z.string().optional(),
    deviceId: z.string().optional(),
    report_type: z.enum(["daily", "weekly", "monthly", "custom"]).optional(),
    start_date: z.string().optional(),
    end_date: z.string().optional()
  })
  .strict();

const legacyReportQuerySchema = z.object({
  device_id: z.string().optional(),
  deviceId: z.string().optional()
});

const legacyDiagnosticsBodySchema = z
  .object({
    device_id: z.string().optional(),
    deviceId: z.string().optional(),
    simple_id: z.string().optional(),
    simpleId: z.string().optional()
  })
  .strict();

function utcStartOfDay(d: Date): Date {
  const x = new Date(d.getTime());
  x.setUTCHours(0, 0, 0, 0);
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

function normalizeMetricValue(row: {
  value_f64?: number | null;
  value_i64?: number | null;
  value_str?: string | null;
  value_bool?: number | null;
}): unknown {
  if (row.value_f64 != null) return row.value_f64;
  if (row.value_i64 != null) return row.value_i64;
  if (row.value_bool != null) return row.value_bool === 1;
  if (row.value_str != null) return row.value_str;
  return null;
}

function parseLegacyExportRange(body: {
  export_type?: "today" | "history" | "custom";
  start_date?: string;
  end_date?: string;
}): { start: Date; end: Date; exportType: "today" | "history" | "custom" } | null {
  const exportType = body.export_type ?? "today";
  const now = new Date();
  if (exportType === "today") {
    return { start: utcStartOfDay(now), end: now, exportType };
  }
  if (exportType === "history") {
    return { start: new Date(now.getTime() - 30 * 86400 * 1000), end: now, exportType };
  }
  const start = body.start_date ? new Date(body.start_date) : null;
  const end = body.end_date ? new Date(body.end_date) : null;
  if (!start || !end) return null;
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return null;
  if (!(start < end)) return null;
  return { start, end, exportType };
}

function parseLegacyReportRange(body: {
  report_type?: "daily" | "weekly" | "monthly" | "custom";
  start_date?: string;
  end_date?: string;
}): { start: Date; end: Date; reportType: "daily" | "weekly" | "monthly" | "custom" } | null {
  const reportType = body.report_type ?? "daily";
  const now = new Date();
  if (reportType === "daily") {
    return { start: utcStartOfDay(now), end: now, reportType };
  }
  if (reportType === "weekly") {
    return { start: new Date(now.getTime() - 7 * 86400 * 1000), end: now, reportType };
  }
  if (reportType === "monthly") {
    return { start: new Date(now.getTime() - 30 * 86400 * 1000), end: now, reportType };
  }
  const start = body.start_date ? new Date(body.start_date) : null;
  const end = body.end_date ? new Date(body.end_date) : null;
  if (!start || !end) return null;
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return null;
  if (!(start < end)) return null;
  return { start, end, reportType };
}

type TelemetryRow = {
  received_ts: string;
  sensor_key: string;
  value_f64: number | null;
  value_i64: number | null;
  value_str: string | null;
  value_bool: number | null;
};

async function fetchTelemetryRows(
  config: AppConfig,
  ch: ClickHouseClient,
  deviceId: string,
  start: Date,
  end: Date,
  limit: number,
  order: "asc" | "desc"
): Promise<TelemetryRow[]> {
  const sql = `
    SELECT
      toString(received_ts) AS received_ts,
      sensor_key,
      value_f64,
      value_i64,
      value_str,
      value_bool
    FROM ${config.clickhouseDatabase}.${config.clickhouseTable}
    WHERE device_id = {deviceId:String}
      AND received_ts >= {start:DateTime64(3, 'UTC')}
      AND received_ts <= {end:DateTime64(3, 'UTC')}
    ORDER BY received_ts ${order === "asc" ? "ASC" : "DESC"}
    LIMIT {limit:UInt32}
  `;

  const res = await ch.query({
    query: sql,
    query_params: {
      deviceId,
      start: toClickhouseDateTime64Utc(start),
      end: toClickhouseDateTime64Utc(end),
      limit
    },
    format: "JSONEachRow"
  });

  return res.json<TelemetryRow[]>();
}

async function telemetryCountInRange(
  config: AppConfig,
  ch: ClickHouseClient,
  deviceId: string,
  start: Date,
  end: Date
): Promise<number> {
  const sql = `
    SELECT
      count() AS c
    FROM ${config.clickhouseDatabase}.${config.clickhouseTable}
    WHERE device_id = {deviceId:String}
      AND received_ts >= {start:DateTime64(3, 'UTC')}
      AND received_ts <= {end:DateTime64(3, 'UTC')}
  `;
  const res = await ch.query({
    query: sql,
    query_params: { deviceId, start: toClickhouseDateTime64Utc(start), end: toClickhouseDateTime64Utc(end) },
    format: "JSONEachRow"
  });
  const rows: { c: number | string }[] = await res.json();
  const c = rows[0]?.c ?? 0;
  return typeof c === "string" ? Number(c) : c;
}

async function telemetryMinMaxTs(config: AppConfig, ch: ClickHouseClient, deviceId: string): Promise<{ min: string | null; max: string | null }> {
  const sql = `
    SELECT
      toString(min(received_ts)) AS min_ts,
      toString(max(received_ts)) AS max_ts
    FROM ${config.clickhouseDatabase}.${config.clickhouseTable}
    WHERE device_id = {deviceId:String}
  `;
  const res = await ch.query({ query: sql, query_params: { deviceId }, format: "JSONEachRow" });
  const rows: { min_ts: string; max_ts: string }[] = await res.json();
  const r = rows[0];
  if (!r) return { min: null, max: null };
  const min = r.min_ts?.trim() ? clickhouseStringToIsoZ(r.min_ts) : null;
  const max = r.max_ts?.trim() ? clickhouseStringToIsoZ(r.max_ts) : null;
  return { min, max };
}

async function distinctMinutesInRange(config: AppConfig, ch: ClickHouseClient, deviceId: string, start: Date, end: Date): Promise<number> {
  const sql = `
    SELECT
      countDistinct(toStartOfMinute(received_ts)) AS m
    FROM ${config.clickhouseDatabase}.${config.clickhouseTable}
    WHERE device_id = {deviceId:String}
      AND received_ts >= {start:DateTime64(3, 'UTC')}
      AND received_ts <= {end:DateTime64(3, 'UTC')}
  `;
  const res = await ch.query({
    query: sql,
    query_params: { deviceId, start: toClickhouseDateTime64Utc(start), end: toClickhouseDateTime64Utc(end) },
    format: "JSONEachRow"
  });
  const rows: { m: number | string }[] = await res.json();
  const m = rows[0]?.m ?? 0;
  return typeof m === "string" ? Number(m) : m;
}

type SensorStatsRow = { sensor_key: string; min: number | null; max: number | null; avg: number | null; count: number | string };

async function sensorStatsInRange(
  config: AppConfig,
  ch: ClickHouseClient,
  deviceId: string,
  start: Date,
  end: Date,
  sensorKeys: string[]
): Promise<SensorStatsRow[]> {
  if (sensorKeys.length === 0) return [];

  const sql = `
    SELECT
      sensor_key,
      min(coalesce(value_f64, toFloat64(value_i64))) AS min,
      max(coalesce(value_f64, toFloat64(value_i64))) AS max,
      avg(coalesce(value_f64, toFloat64(value_i64))) AS avg,
      count() AS count
    FROM ${config.clickhouseDatabase}.${config.clickhouseTable}
    WHERE device_id = {deviceId:String}
      AND sensor_key IN {sensorKeys:Array(String)}
      AND received_ts >= {start:DateTime64(3, 'UTC')}
      AND received_ts <= {end:DateTime64(3, 'UTC')}
      AND (isNotNull(value_f64) OR isNotNull(value_i64))
    GROUP BY sensor_key
  `;

  const res = await ch.query({
    query: sql,
    query_params: { deviceId, sensorKeys, start: toClickhouseDateTime64Utc(start), end: toClickhouseDateTime64Utc(end) },
    format: "JSONEachRow"
  });

  return res.json<SensorStatsRow[]>();
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

export function registerLegacyDeviceManagementCompatRoutes(
  app: FastifyInstance,
  config: AppConfig,
  ch: ClickHouseClient,
  pg: PgPool | null
): void {
  const adminCfg: AdminAuthConfig = { adminApiToken: config.adminApiToken, jwtEnabled: Boolean(config.jwtAccessSecret) };

  app.post("/device-management/export", async (request, reply) => {
    if (!(await requirePermission(adminCfg, pg, request, reply, "data:export"))) return;
    if (!pg) {
      legacyFail(reply, 503, "PostgreSQL not configured");
      return;
    }

    const parsed = legacyExportBodySchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      legacyFail(reply, 400, "invalid body", { issues: parsed.error.issues });
      return;
    }

    const inputDeviceId = (parsed.data.device_id ?? parsed.data.deviceId ?? "").trim() || "device_1";
    const resolved = await resolveDeviceId(pg, inputDeviceId);
    if (!resolved) {
      legacyFail(reply, 404, "device not found");
      return;
    }

    const range = parseLegacyExportRange({
      export_type: parsed.data.export_type ?? "today",
      start_date: parsed.data.start_date,
      end_date: parsed.data.end_date
    });
    if (!range) {
      legacyFail(reply, 400, "invalid time range");
      return;
    }

    const format = parsed.data.format ?? "json";
    const limit = Math.min(10000, Math.max(1, config.apiReplayMaxRows));

    const rows = await fetchTelemetryRows(config, ch, resolved, range.start, range.end, limit, "desc");
    const out = rows.map((r) => ({
      receivedTs: clickhouseStringToIsoZ(r.received_ts),
      sensorKey: r.sensor_key,
      value: normalizeMetricValue(r)
    }));

    if (out.length === 0) {
      void reply.code(404).send({ success: false, error: "没有找到数据" });
      return;
    }

    if (format === "csv") {
      const header = "receivedTs,sensorKey,value";
      const lines: string[] = [header];
      for (const r of out) {
        const v =
          r.value === null || r.value === undefined
            ? ""
            : typeof r.value === "string"
              ? JSON.stringify(r.value)
              : typeof r.value === "number" || typeof r.value === "boolean"
                ? String(r.value)
                : JSON.stringify(r.value);
        lines.push(`${r.receivedTs},${r.sensorKey},${v}`);
      }

      void reply.header("Content-Type", "text/csv; charset=utf-8");
      void reply.header(
        "Content-Disposition",
        `attachment; filename=\"device_${encodeURIComponent(inputDeviceId)}_${range.exportType}_${range.start.toISOString().slice(0, 10)}.csv\"`
      );
      void reply.code(200).send(lines.join("\n"));
      return;
    }

    void reply.code(200).send({
      success: true,
      data: out,
      meta: {
        device_id: inputDeviceId,
        export_type: range.exportType,
        total_records: out.length,
        export_time: new Date().toISOString(),
        time_range: { start: range.start.toISOString(), end: range.end.toISOString() }
      }
    });
  });

  app.get("/device-management/export", async (request, reply) => {
    if (!(await requirePermission(adminCfg, pg, request, reply, "data:view"))) return;
    if (!pg) {
      legacyFail(reply, 503, "PostgreSQL not configured");
      return;
    }

    const parsed = legacyExportQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) {
      legacyFail(reply, 400, "invalid query");
      return;
    }

    const inputDeviceId = (parsed.data.device_id ?? parsed.data.deviceId ?? "").trim() || "device_1";
    const resolved = await resolveDeviceId(pg, inputDeviceId);
    if (!resolved) {
      legacyOk(reply, {
        total_records: 0,
        date_range: null,
        today_records: 0,
        this_week_records: 0,
        this_month_records: 0
      });
      return;
    }

    const now = new Date();
    const today = utcStartOfDay(now);
    const week = new Date(now.getTime() - 7 * 86400 * 1000);
    const month = new Date(now.getTime() - 30 * 86400 * 1000);

    const [minmax, total, todayCount, weekCount, monthCount] = await Promise.all([
      telemetryMinMaxTs(config, ch, resolved),
      telemetryCountInRange(config, ch, resolved, new Date(0), now),
      telemetryCountInRange(config, ch, resolved, today, now),
      telemetryCountInRange(config, ch, resolved, week, now),
      telemetryCountInRange(config, ch, resolved, month, now)
    ]);

    legacyOk(reply, {
      total_records: total,
      date_range: minmax.min && minmax.max ? { earliest: minmax.min, latest: minmax.max } : null,
      today_records: todayCount,
      this_week_records: weekCount,
      this_month_records: monthCount
    });
  });

  app.post("/device-management/reports", async (request, reply) => {
    if (!(await requirePermission(adminCfg, pg, request, reply, "data:view"))) return;
    if (!pg) {
      legacyFail(reply, 503, "PostgreSQL not configured");
      return;
    }

    const parsed = legacyReportBodySchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      legacyFail(reply, 400, "invalid body", { issues: parsed.error.issues });
      return;
    }

    const inputDeviceId = (parsed.data.device_id ?? parsed.data.deviceId ?? "").trim() || "device_1";
    const resolved = await resolveDeviceId(pg, inputDeviceId);
    if (!resolved) {
      legacyFail(reply, 404, "device not found");
      return;
    }

    const range = parseLegacyReportRange({
      report_type: parsed.data.report_type ?? "daily",
      start_date: parsed.data.start_date,
      end_date: parsed.data.end_date
    });
    if (!range) {
      legacyFail(reply, 400, "invalid time range");
      return;
    }

    const totalRecords = await telemetryCountInRange(config, ch, resolved, range.start, range.end);
    if (totalRecords === 0) {
      void reply.code(404).send({ success: false, error: "指定时间范围内没有数据" });
      return;
    }

    const totalMinutes = Math.max(1, Math.floor((range.end.getTime() - range.start.getTime()) / (60 * 1000)));
    const minutesWithData = await distinctMinutesInRange(config, ch, resolved, range.start, range.end);
    const dataCompleteness = Math.min(100, (minutesWithData / totalMinutes) * 100);

    const targetKeys = [
      "temperature",
      "humidity",
      "acceleration_x",
      "acceleration_y",
      "acceleration_z",
      "gyroscope_x",
      "gyroscope_y",
      "gyroscope_z"
    ];

    const statsRows = await sensorStatsInRange(config, ch, resolved, range.start, range.end, targetKeys);
    const statsByKey = new Map(statsRows.map((r) => [r.sensor_key, r]));

    const temperature = statsByKey.get("temperature") ?? null;
    const humidity = statsByKey.get("humidity") ?? null;

    const anomalies: { type: string; message: string; severity: "warning" | "critical" }[] = [];
    if (temperature?.min != null && temperature?.max != null && (temperature.min < -10 || temperature.max > 60)) {
      anomalies.push({
        type: "temperature_out_of_range",
        message: `温度超出正常范围: ${temperature.min}°C - ${temperature.max}°C`,
        severity: "warning"
      });
    }
    if (humidity?.min != null && humidity?.max != null && (humidity.min < 0 || humidity.max > 100)) {
      anomalies.push({
        type: "humidity_out_of_range",
        message: `湿度超出正常范围: ${humidity.min}% - ${humidity.max}%`,
        severity: "warning"
      });
    }
    if (dataCompleteness < 50) {
      anomalies.push({ type: "data_incomplete", message: `数据完整性不足: ${dataCompleteness.toFixed(1)}%`, severity: "critical" });
    } else if (dataCompleteness < 80) {
      anomalies.push({ type: "data_incomplete", message: `数据完整性不足: ${dataCompleteness.toFixed(1)}%`, severity: "warning" });
    }

    const overall = anomalies.some((a) => a.severity === "critical") ? "critical" : anomalies.length > 0 ? "warning" : "healthy";

    const formatStat = (r: SensorStatsRow | null) => {
      if (!r) return null;
      const c = typeof r.count === "string" ? Number(r.count) : r.count;
      return {
        min: r.min == null ? null : Math.round(r.min * 10) / 10,
        max: r.max == null ? null : Math.round(r.max * 10) / 10,
        avg: r.avg == null ? null : Math.round(r.avg * 10) / 10,
        count: c
      };
    };

    const baseReport = {
      device_id: inputDeviceId,
      report_type: range.reportType,
      time_range: {
        start: range.start.toISOString(),
        end: range.end.toISOString(),
        duration_hours: Math.round((range.end.getTime() - range.start.getTime()) / (60 * 60 * 1000))
      },
      data_summary: {
        total_records: totalRecords,
        data_completeness: Math.round(dataCompleteness * 100) / 100
      },
      sensor_statistics: {
        temperature: formatStat(temperature),
        humidity: formatStat(humidity)
      },
      device_status: {
        overall,
        anomalies_count: anomalies.length,
        uptime_percentage: Math.round(dataCompleteness * 100) / 100
      },
      anomalies,
      recommendations: [
        ...(dataCompleteness < 90 ? ["检查设备网络连接稳定性"] : []),
        ...(anomalies.length > 0 ? ["及时处理检测到的异常"] : []),
        "定期进行设备维护检查",
        "监控设备运行状态"
      ],
      generated_at: new Date().toISOString()
    };

    const aiAnalysis = {
      summary: "数据分析完成，设备运行状态已生成报告。",
      insights: ["本报告为系统基础分析（不依赖外部 AI 服务）", "可结合告警/趋势图进一步排查异常"],
      recommendations: ["如需 AI 增强分析，请在 v2 侧单独接入并审计外部调用"]
    };

    void reply.code(200).send({
      success: true,
      data: {
        ...baseReport,
        ai_analysis: aiAnalysis,
        enhanced_recommendations: [...baseReport.recommendations, ...aiAnalysis.recommendations]
      }
    });
  });

  app.get("/device-management/reports", async (request, reply) => {
    if (!(await requirePermission(adminCfg, pg, request, reply, "data:view"))) return;
    if (!pg) {
      legacyFail(reply, 503, "PostgreSQL not configured");
      return;
    }

    const parsed = legacyReportQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) {
      legacyFail(reply, 400, "invalid query");
      return;
    }

    const inputDeviceId = (parsed.data.device_id ?? parsed.data.deviceId ?? "").trim() || "device_1";
    const resolved = await resolveDeviceId(pg, inputDeviceId);
    if (!resolved) {
      legacyOk(reply, {
        available_types: [
          { type: "daily", name: "日报告", description: "过去24小时的设备运行报告" },
          { type: "weekly", name: "周报告", description: "过去7天的设备运行报告" },
          { type: "monthly", name: "月报告", description: "过去30天的设备运行报告" },
          { type: "custom", name: "自定义", description: "指定时间范围的设备运行报告" }
        ],
        data_range: { earliest: null, latest: null }
      });
      return;
    }

    const minmax = await telemetryMinMaxTs(config, ch, resolved);

    legacyOk(reply, {
      available_types: [
        { type: "daily", name: "日报告", description: "过去24小时的设备运行报告" },
        { type: "weekly", name: "周报告", description: "过去7天的设备运行报告" },
        { type: "monthly", name: "月报告", description: "过去30天的设备运行报告" },
        { type: "custom", name: "自定义", description: "指定时间范围的设备运行报告" }
      ],
      data_range: { earliest: minmax.min, latest: minmax.max }
    });
  });

  app.post("/device-management/diagnostics", async (request, reply) => {
    if (!(await requirePermission(adminCfg, pg, request, reply, "data:view"))) return;
    if (!pg) {
      legacyFail(reply, 503, "PostgreSQL not configured");
      return;
    }

    const parsed = legacyDiagnosticsBodySchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      legacyFail(reply, 400, "invalid body", { issues: parsed.error.issues });
      return;
    }

    const inputDeviceId = (parsed.data.device_id ?? parsed.data.deviceId ?? parsed.data.simple_id ?? parsed.data.simpleId ?? "").trim();
    if (!inputDeviceId) {
      legacyFail(reply, 400, "missing device_id");
      return;
    }

    const resolved = await resolveDeviceId(pg, inputDeviceId);
    if (!resolved) {
      legacyFail(reply, 404, "device not found");
      return;
    }

    const device = await fetchDeviceWithStation(pg, resolved);
    if (!device) {
      legacyFail(reply, 404, "device not found");
      return;
    }

    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const today = utcStartOfDay(now);

    const baseline = await fetchGpsBaseline(pg, resolved);

    let todayCount = 0;
    try {
      todayCount = await telemetryCountInRange(config, ch, resolved, today, now);
    } catch {
      todayCount = 0;
    }

    const online = onlineStatus(device.last_seen_at, device.status);

    const recent = await fetchTelemetryRows(config, ch, resolved, yesterday, now, 200, "desc");
    const recentAsc = [...recent].reverse();
    let maxGapMinutes = 0;
    let gapCount = 0;
    let sumGap = 0;
    for (let i = 1; i < recentAsc.length; i++) {
      const t0 = Date.parse(clickhouseStringToIsoZ(recentAsc[i - 1]?.received_ts ?? ""));
      const t1 = Date.parse(clickhouseStringToIsoZ(recentAsc[i]?.received_ts ?? ""));
      if (!Number.isFinite(t0) || !Number.isFinite(t1)) continue;
      const gapMinutes = Math.max(0, (t1 - t0) / (1000 * 60));
      if (gapMinutes > 5) {
        gapCount += 1;
        sumGap += gapMinutes;
        if (gapMinutes > maxGapMinutes) maxGapMinutes = gapMinutes;
      }
    }

    const factors = {
      online_status: online === "online" ? 30 : 0,
      data_freshness: 0,
      data_volume: 0,
      baseline_status: baseline ? 15 : 0,
      connection_stability: 0
    };

    const lastSeen = device.last_seen_at ? Date.parse(device.last_seen_at) : NaN;
    if (Number.isFinite(lastSeen)) {
      const minutesSinceLast = (Date.now() - lastSeen) / (1000 * 60);
      if (minutesSinceLast <= 5) factors.data_freshness = 25;
      else if (minutesSinceLast <= 30) factors.data_freshness = 20;
      else if (minutesSinceLast <= 120) factors.data_freshness = 10;
    }

    if (todayCount >= 100) factors.data_volume = 20;
    else if (todayCount >= 50) factors.data_volume = 15;
    else if (todayCount >= 10) factors.data_volume = 10;
    else if (todayCount > 0) factors.data_volume = 5;

    if (recentAsc.length > 0) {
      if (maxGapMinutes <= 10) factors.connection_stability = 10;
      else if (maxGapMinutes <= 30) factors.connection_stability = 7;
      else if (maxGapMinutes <= 60) factors.connection_stability = 4;
    }

    const healthScore = Object.values(factors).reduce((s, x) => s + x, 0);
    const overall_status = healthScore >= 80 ? "healthy" : healthScore >= 50 ? "warning" : "error";

    const recommendations: string[] = [];
    if (online === "offline") recommendations.push("设备离线，检查设备电源和网络连接");
    if (factors.data_freshness === 0) recommendations.push("数据更新延迟，检查数据采集系统");
    if (factors.data_volume <= 5) recommendations.push("数据量偏低，检查传感器工作状态");
    if (!baseline) recommendations.push("建议建立GPS基准点以启用形变监测");
    if (factors.connection_stability <= 4) recommendations.push("连接不稳定，检查网络环境和信号强度");

    const avgGapMinutes = gapCount > 0 ? sumGap / gapCount : 0;

    void reply.code(200).send({
      success: true,
      data: {
        overall_status,
        health_score: Math.round(healthScore),
        data_quality: todayCount > 0 ? "normal" : "poor",
        connection_status: factors.connection_stability >= 7 ? "stable" : "unstable",
        baseline_status: baseline ? "active" : "inactive",
        performance_metrics: {
          today_data_count: todayCount,
          avg_response_time: online === "online" ? 80 : 0,
          last_communication: device.last_seen_at ?? now.toISOString(),
          data_gap_analysis: { maxGapMinutes: maxGapMinutes, avgGapMinutes, gapCount }
        },
        recommendations,
        factors,
        timestamp: now.toISOString()
      },
      timestamp: now.toISOString()
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
      const points = await fetchLatestGpsTelemetry(config, ch, resolved, limit);
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
