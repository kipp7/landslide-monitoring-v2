import type { ClickHouseClient } from "@clickhouse/client";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AdminAuthConfig } from "../authz";
import { requirePermission } from "../authz";
import type { AppConfig } from "../config";
import type { PgPool } from "../postgres";
import { queryOne, withPgClient } from "../postgres";

type DeviceRow = {
  device_id: string;
  device_name: string;
  device_type: string;
  status: "inactive" | "active" | "revoked";
  last_seen_at: string | null;
  metadata: unknown;
  station_name: string | null;
  latitude: number | null;
  longitude: number | null;
  created_at: string;
};

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

function onlineStatus(lastSeenAt: string | null, status: "inactive" | "active" | "revoked"): "online" | "offline" {
  if (status !== "active") return "offline";
  if (!lastSeenAt) return "offline";
  const t = Date.parse(lastSeenAt);
  if (!Number.isFinite(t)) return "offline";
  return Date.now() - t < 5 * 60_000 ? "online" : "offline";
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

const baselineSchema = z.object({
  latitude: z.number().finite(),
  longitude: z.number().finite(),
  altitude: z.number().finite().optional()
});

function haversineMeters(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const r = 6371000;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);
  const a = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
  return 2 * r * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function resolveDeviceId(pg: PgPool, input: string): Promise<string | null> {
  const trimmed = input.trim();
  if (!trimmed) return null;

  return withPgClient(pg, async (client) => {
    const row = await queryOne<{ device_id: string }>(
      client,
      `
        SELECT device_id
        FROM devices
        WHERE status != 'revoked'
          AND (
            device_id::text = $1
            OR device_name = $1
            OR metadata->>'legacy_device_id' = $1
            OR metadata#>>'{externalIds,legacy}' = $1
          )
        LIMIT 1
      `,
      [trimmed]
    );
    return row?.device_id ?? null;
  });
}

async function fetchDevice(pg: PgPool, deviceId: string): Promise<DeviceRow | null> {
  return withPgClient(pg, async (client) =>
    queryOne<DeviceRow>(
      client,
      `
        SELECT
          d.device_id,
          d.device_name,
          d.device_type,
          d.status,
          to_char(d.last_seen_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS last_seen_at,
          d.metadata,
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

async function listDevices(pg: PgPool): Promise<DeviceRow[]> {
  return withPgClient(pg, async (client) => {
    const res = await client.query<DeviceRow>(
      `
        SELECT
          d.device_id,
          d.device_name,
          d.device_type,
          d.status,
          to_char(d.last_seen_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS last_seen_at,
          d.metadata,
          s.station_name,
          s.latitude,
          s.longitude,
          to_char(d.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at
        FROM devices d
        LEFT JOIN stations s ON s.station_id = d.station_id
        WHERE d.status != 'revoked'
        ORDER BY d.created_at DESC
      `
    );
    return res.rows;
  });
}

async function todayTelemetryCount(config: AppConfig, ch: ClickHouseClient, deviceId: string): Promise<number> {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date();

  const sql = `
    SELECT count() AS c
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

async function fetchGpsBaseline(pg: PgPool, deviceId: string): Promise<z.infer<typeof baselineSchema> | null> {
  const row = await withPgClient(pg, async (client) =>
    queryOne<{ baseline: unknown }>(client, `SELECT baseline FROM gps_baselines WHERE device_id = $1`, [deviceId])
  );
  if (!row) return null;
  const parsed = baselineSchema.safeParse(row.baseline ?? {});
  return parsed.success ? parsed.data : null;
}

async function latestMetricsForKeys(
  config: AppConfig,
  ch: ClickHouseClient,
  deviceId: string,
  sensorKeys: string[]
): Promise<{ updatedAt: string | null; metrics: Record<string, unknown> }> {
  if (sensorKeys.length === 0) return { updatedAt: null, metrics: {} };

  const sql = `
    SELECT
      sensor_key,
      toString(max(received_ts)) AS latest_ts,
      argMax(value_f64, received_ts) AS value_f64,
      argMax(value_i64, received_ts) AS value_i64,
      argMax(value_str, received_ts) AS value_str,
      argMax(value_bool, received_ts) AS value_bool
    FROM ${config.clickhouseDatabase}.${config.clickhouseTable}
    WHERE device_id = {deviceId:String}
      AND sensor_key IN {sensorKeys:Array(String)}
    GROUP BY sensor_key
  `;

  const res = await ch.query({ query: sql, query_params: { deviceId, sensorKeys }, format: "JSONEachRow" });
  const rows: {
    sensor_key: string;
    latest_ts: string;
    value_f64: number | null;
    value_i64: number | null;
    value_str: string | null;
    value_bool: number | null;
  }[] = await res.json();

  const metrics: Record<string, unknown> = {};
  let updatedAt: string | null = null;

  const normalize = (r: {
    value_f64: number | null;
    value_i64: number | null;
    value_str: string | null;
    value_bool: number | null;
  }): unknown => {
    if (r.value_f64 != null) return r.value_f64;
    if (r.value_i64 != null) return r.value_i64;
    if (r.value_bool != null) return r.value_bool === 1;
    if (r.value_str != null) return r.value_str;
    return null;
  };

  for (const row of rows) {
    metrics[row.sensor_key] = normalize(row);
    const ts = clickhouseStringToIsoZ(row.latest_ts);
    if (!updatedAt || ts > updatedAt) updatedAt = ts;
  }

  return { updatedAt, metrics };
}

async function latestGpsPoint(
  config: AppConfig,
  ch: ClickHouseClient,
  deviceId: string
): Promise<{ eventTime: string; latitude: number; longitude: number } | null> {
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
      LIMIT 1
    `,
    query_params: { deviceId, sensorKeys, latKey, lonKey },
    format: "JSONEachRow"
  });

  const rows: { event_time: string; latitude: number | null; longitude: number | null }[] = await res.json();
  const row = rows[0];
  if (!row || typeof row.latitude !== "number" || typeof row.longitude !== "number") return null;
  return { eventTime: clickhouseStringToIsoZ(row.event_time), latitude: row.latitude, longitude: row.longitude };
}

async function latestDeviceTelemetry(
  config: AppConfig,
  ch: ClickHouseClient,
  deviceId: string,
  limit: number
): Promise<{ received_ts: string; sensor_key: string; value: unknown }[]> {
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
    ORDER BY received_ts DESC
    LIMIT {limit:UInt32}
  `;
  const res = await ch.query({ query: sql, query_params: { deviceId, limit }, format: "JSONEachRow" });
  const rows: {
    received_ts: string;
    sensor_key: string;
    value_f64: number | null;
    value_i64: number | null;
    value_str: string | null;
    value_bool: number | null;
  }[] = await res.json();

  const normalize = (r: { value_f64: number | null; value_i64: number | null; value_str: string | null; value_bool: number | null }): unknown => {
    if (r.value_f64 != null) return r.value_f64;
    if (r.value_i64 != null) return r.value_i64;
    if (r.value_bool != null) return r.value_bool === 1;
    if (r.value_str != null) return r.value_str;
    return null;
  };

  return rows.map((r) => ({
    received_ts: clickhouseStringToIsoZ(r.received_ts),
    sensor_key: r.sensor_key,
    value: normalize(r)
  }));
}

const deviceIdSchema = z.string().min(1);
const latestDataQuerySchema = z
  .object({
    limit: z.coerce.number().int().positive().max(5000).default(50)
  })
  .strict();

export function registerLegacyIotDeviceEndpoints(
  app: FastifyInstance,
  config: AppConfig,
  ch: ClickHouseClient,
  pg: PgPool | null
): void {
  const adminCfg: AdminAuthConfig = { adminApiToken: config.adminApiToken, jwtEnabled: Boolean(config.jwtAccessSecret) };

  app.get("/info", async (_request, reply) => {
    void reply.code(200).send({
      success: true,
      service: config.serviceName,
      time: new Date().toISOString(),
      endpoints: {
        health: "GET /health",
        legacy_api: "GET|POST /api/*",
        legacy_iot_api: "GET|POST /iot/api/*",
        devices_list: "GET /devices/list",
        devices_mappings: "GET /devices/mappings",
        device_info: "GET /devices/info/:simpleId",
        device_details: "GET /devices/:deviceId",
        device_management: "GET /devices/:deviceId/management",
        device_status: "GET /devices/:deviceId/status",
        debug_latest_data: "GET /debug/latest-data(/:deviceId)"
      }
    });
  });

  app.get("/devices/:deviceId", async (request, reply) => {
    if (!(await requirePermission(adminCfg, pg, request, reply, "data:view"))) return;
    if (!pg) {
      void reply.code(503).send({ success: false, error: "PostgreSQL not configured" });
      return;
    }

    const parsed = deviceIdSchema.safeParse((request.params as { deviceId?: unknown }).deviceId);
    if (!parsed.success) {
      void reply.code(400).send({ success: false, error: "invalid deviceId" });
      return;
    }

    const resolved = await resolveDeviceId(pg, parsed.data);
    if (!resolved) {
      void reply.code(404).send({ success: false, error: "设备不存在" });
      return;
    }

    const d = await fetchDevice(pg, resolved);
    if (!d) {
      void reply.code(404).send({ success: false, error: "设备不存在" });
      return;
    }

    const online = onlineStatus(d.last_seen_at, d.status);
    void reply.code(200).send({
      success: true,
      data: {
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
      }
    });
  });

  app.get("/devices/list", async (request, reply) => {
    if (!(await requirePermission(adminCfg, pg, request, reply, "data:view"))) return;
    if (!pg) {
      void reply.code(503).send({ success: false, error: "PostgreSQL not configured" });
      return;
    }

    const devices = await listDevices(pg);
    const out = devices.map((d) => {
      const simpleId = legacyKeyFromMetadata(d.device_name, d.metadata);
      const online = onlineStatus(d.last_seen_at, d.status);
      return {
        device_id: simpleId,
        friendly_name: d.station_name ?? d.device_name,
        display_name: d.station_name ?? d.device_name,
        location_name: d.station_name ?? "",
        device_type: d.device_type,
        status: online,
        last_active: d.last_seen_at ?? d.created_at
      };
    });

    void reply.code(200).send({ success: true, data: out, count: out.length });
  });

  app.get("/devices/mappings", async (request, reply) => {
    if (!(await requirePermission(adminCfg, pg, request, reply, "data:view"))) return;
    if (!pg) {
      void reply.code(503).send({ success: false, error: "PostgreSQL not configured" });
      return;
    }

    const devices = await listDevices(pg);
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

    void reply.code(200).send({ success: true, data: mapped, count: mapped.length });
  });

  app.get("/devices/info/:simpleId", async (request, reply) => {
    if (!(await requirePermission(adminCfg, pg, request, reply, "data:view"))) return;
    if (!pg) {
      void reply.code(503).send({ success: false, error: "PostgreSQL not configured" });
      return;
    }

    const parsed = deviceIdSchema.safeParse((request.params as { simpleId?: unknown }).simpleId);
    if (!parsed.success) {
      void reply.code(400).send({ success: false, error: "invalid simpleId" });
      return;
    }

    const resolved = await resolveDeviceId(pg, parsed.data);
    if (!resolved) {
      void reply.code(404).send({ success: false, error: "设备不存在" });
      return;
    }

    const d = await fetchDevice(pg, resolved);
    if (!d) {
      void reply.code(404).send({ success: false, error: "设备不存在" });
      return;
    }

    void reply.code(200).send({
      success: true,
      data: {
        simple_id: legacyKeyFromMetadata(d.device_name, d.metadata),
        actual_device_id: d.device_id,
        device_name: d.device_name,
        location: {
          location_name: d.station_name ?? "",
          latitude: d.latitude,
          longitude: d.longitude,
          device_type: d.device_type
        }
      }
    });
  });

  app.get("/devices/:deviceId/management", async (request, reply) => {
    if (!(await requirePermission(adminCfg, pg, request, reply, "data:view"))) return;
    if (!pg) {
      void reply.code(503).send({ success: false, error: "PostgreSQL not configured" });
      return;
    }

    const parsed = deviceIdSchema.safeParse((request.params as { deviceId?: unknown }).deviceId);
    if (!parsed.success) {
      void reply.code(400).send({ success: false, error: "invalid deviceId" });
      return;
    }

    const resolved = await resolveDeviceId(pg, parsed.data);
    if (!resolved) {
      void reply.code(404).send({ success: false, error: "设备不存在" });
      return;
    }

    const d = await fetchDevice(pg, resolved);
    if (!d) {
      void reply.code(404).send({ success: false, error: "设备不存在" });
      return;
    }

    const { updatedAt, metrics } = await latestMetricsForKeys(config, ch, resolved, ["temperature", "humidity"]);

    let todayCount = 0;
    try {
      todayCount = await todayTelemetryCount(config, ch, resolved);
    } catch {
      todayCount = 0;
    }

    const online = onlineStatus(d.last_seen_at, d.status);
    const lastDataTime = updatedAt ?? d.last_seen_at ?? d.created_at;

    let deformationData: unknown = null;
    try {
      const baseline = await fetchGpsBaseline(pg, resolved);
      const gps = await latestGpsPoint(config, ch, resolved);
      if (baseline && gps) {
        const horizontal = haversineMeters(baseline.latitude, baseline.longitude, gps.latitude, gps.longitude);
        deformationData = {
          latitude: gps.latitude,
          longitude: gps.longitude,
          deformation_distance_3d: horizontal,
          deformation_horizontal: horizontal,
          deformation_vertical: 0,
          deformation_velocity: 0,
          deformation_risk_level: null,
          deformation_type: null,
          deformation_confidence: 0,
          baseline_established: true
        };
      } else if (gps) {
        deformationData = {
          latitude: gps.latitude,
          longitude: gps.longitude,
          deformation_distance_3d: 0,
          deformation_horizontal: 0,
          deformation_vertical: 0,
          deformation_velocity: 0,
          deformation_risk_level: null,
          deformation_type: null,
          deformation_confidence: 0,
          baseline_established: Boolean(baseline)
        };
      }
    } catch {
      deformationData = null;
    }

    void reply.code(200).send({
      success: true,
      data: {
        device_id: legacyKeyFromMetadata(d.device_name, d.metadata),
        real_name: d.device_id,
        display_name: d.station_name ?? d.device_name,
        location: d.station_name ?? "",
        coordinates: { lat: d.latitude, lng: d.longitude },
        device_type: d.device_type,
        firmware_version: "",
        install_date: d.created_at,
        status: online,
        last_active: lastDataTime,
        data_count_today: todayCount,
        last_data_time: lastDataTime,
        health_score: online === "online" ? 95 : 0,
        temperature: typeof metrics.temperature === "number" ? metrics.temperature : null,
        humidity: typeof metrics.humidity === "number" ? metrics.humidity : null,
        battery_level: online === "online" ? 85 : 0,
        signal_strength: online === "online" ? 90 : 0,
        real_time_data: null
      },
      deformation_data: deformationData,
      timestamp: new Date().toISOString()
    });
  });

  app.get("/devices/:deviceId/status", async (request, reply) => {
    if (!(await requirePermission(adminCfg, pg, request, reply, "data:view"))) return;
    if (!pg) {
      void reply.code(503).send({ success: false, error: "PostgreSQL not configured" });
      return;
    }

    const parsed = deviceIdSchema.safeParse((request.params as { deviceId?: unknown }).deviceId);
    if (!parsed.success) {
      void reply.code(400).send({ success: false, error: "invalid deviceId" });
      return;
    }

    const resolved = await resolveDeviceId(pg, parsed.data);
    if (!resolved) {
      void reply.code(404).send({ success: false, error: "设备不存在" });
      return;
    }

    const d = await fetchDevice(pg, resolved);
    if (!d) {
      void reply.code(404).send({ success: false, error: "设备不存在" });
      return;
    }

    const online = onlineStatus(d.last_seen_at, d.status);
    const { updatedAt, metrics } = await latestMetricsForKeys(config, ch, resolved, ["temperature", "humidity"]);
    void reply.code(200).send({
      success: true,
      data: {
        device_id: legacyKeyFromMetadata(d.device_name, d.metadata),
        status: online,
        health_score: online === "online" ? 95 : 0,
        battery_level: online === "online" ? 85 : 0,
        last_update: updatedAt ?? d.last_seen_at ?? d.created_at,
        current_data: {
          temperature: typeof metrics.temperature === "number" ? metrics.temperature : null,
          humidity: typeof metrics.humidity === "number" ? metrics.humidity : null,
          vibration: null,
          risk_level: null,
          alarm_active: null,
          uptime: null
        },
        today_stats: null,
        weekly_trend: null
      },
      timestamp: new Date().toISOString()
    });
  });

  app.get("/debug/latest-data", async (request, reply) => {
    if (!(await requirePermission(adminCfg, pg, request, reply, "data:view"))) return;
    const parsedQuery = latestDataQuerySchema.safeParse(request.query ?? {});
    if (!parsedQuery.success) {
      void reply.code(400).send({ success: false, error: "invalid query" });
      return;
    }

    const now = new Date();
    const sql = `
      SELECT
        toString(received_ts) AS received_ts,
        device_id,
        sensor_key,
        value_f64,
        value_i64,
        value_str,
        value_bool
      FROM ${config.clickhouseDatabase}.${config.clickhouseTable}
      ORDER BY received_ts DESC
      LIMIT {limit:UInt32}
    `;
    const res = await ch.query({ query: sql, query_params: { limit: parsedQuery.data.limit }, format: "JSONEachRow" });
    const rows: {
      received_ts: string;
      device_id: string;
      sensor_key: string;
      value_f64: number | null;
      value_i64: number | null;
      value_str: string | null;
      value_bool: number | null;
    }[] = await res.json();

    const normalize = (r: {
      value_f64: number | null;
      value_i64: number | null;
      value_str: string | null;
      value_bool: number | null;
    }): unknown => {
      if (r.value_f64 != null) return r.value_f64;
      if (r.value_i64 != null) return r.value_i64;
      if (r.value_bool != null) return r.value_bool === 1;
      if (r.value_str != null) return r.value_str;
      return null;
    };

    const data = rows.map((r) => {
      const ts = clickhouseStringToIsoZ(r.received_ts);
      const ageSec = Math.round((now.getTime() - Date.parse(ts)) / 1000);
      return {
        device_id: r.device_id,
        event_time: ts,
        sensor_key: r.sensor_key,
        value: normalize(r),
        data_age_seconds: Number.isFinite(ageSec) ? ageSec : null
      };
    });

    void reply.code(200).send({
      success: true,
      data,
      total_records: data.length,
      query_time: now.toISOString(),
      device_filter: "all"
    });
  });

  app.get("/debug/latest-data/:deviceId", async (request, reply) => {
    if (!(await requirePermission(adminCfg, pg, request, reply, "data:view"))) return;
    if (!pg) {
      void reply.code(503).send({ success: false, error: "PostgreSQL not configured" });
      return;
    }

    const parsedId = deviceIdSchema.safeParse((request.params as { deviceId?: unknown }).deviceId);
    if (!parsedId.success) {
      void reply.code(400).send({ success: false, error: "invalid deviceId" });
      return;
    }

    const parsedQuery = latestDataQuerySchema.safeParse(request.query ?? {});
    if (!parsedQuery.success) {
      void reply.code(400).send({ success: false, error: "invalid query" });
      return;
    }

    const resolved = await resolveDeviceId(pg, parsedId.data);
    if (!resolved) {
      void reply.code(404).send({ success: false, error: "device not found" });
      return;
    }

    const rows = await latestDeviceTelemetry(config, ch, resolved, parsedQuery.data.limit);
    const now = new Date();
    const data = rows.map((r) => {
      const ageSec = Math.round((now.getTime() - Date.parse(r.received_ts)) / 1000);
      return {
        device_id: resolved,
        event_time: r.received_ts,
        sensor_key: r.sensor_key,
        value: r.value,
        data_age_seconds: Number.isFinite(ageSec) ? ageSec : null
      };
    });

    void reply.code(200).send({
      success: true,
      data,
      total_records: data.length,
      query_time: now.toISOString(),
      device_filter: parsedId.data
    });
  });
}
