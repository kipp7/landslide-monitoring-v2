import type { ClickHouseClient } from "@clickhouse/client";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AdminAuthConfig } from "../authz";
import { requirePermission } from "../authz";
import type { AppConfig } from "../config";
import { fail, ok } from "../http";
import type { PgPool } from "../postgres";
import { queryOne, withPgClient } from "../postgres";

const deviceIdSchema = z.string().uuid();

const autoEstablishBodySchema = z
  .object({
    pointsCount: z.number().int().positive().max(5000).default(20),
    lookbackDays: z.number().int().positive().max(365).default(30),
    latKey: z.string().min(1).default("gps_latitude"),
    lonKey: z.string().min(1).default("gps_longitude"),
    altKey: z.string().min(1).optional()
  })
  .strict()
  .default({});

const qualityCheckQuerySchema = z.object({
  pointsCount: z.coerce.number().int().positive().max(5000).default(200),
  lookbackDays: z.coerce.number().int().positive().max(365).default(30),
  latKey: z.string().min(1).default("gps_latitude"),
  lonKey: z.string().min(1).default("gps_longitude"),
  altKey: z.string().min(1).optional()
});

const availableDevicesQuerySchema = z.object({
  lookbackDays: z.coerce.number().int().positive().max(365).default(30),
  latKey: z.string().min(1).default("gps_latitude"),
  lonKey: z.string().min(1).default("gps_longitude"),
  limit: z.coerce.number().int().positive().max(50000).default(10000)
});

const baselineSchema = z.object({
  latitude: z.number().finite(),
  longitude: z.number().finite(),
  altitude: z.number().finite().optional(),
  positionAccuracyMeters: z.number().finite().optional(),
  satelliteCount: z.number().int().positive().optional(),
  notes: z.string().max(2000).optional()
});

type BaselineRow = {
  method: "auto" | "manual";
  points_count: number | null;
  baseline: unknown;
  computed_at: string;
  updated_at: string;
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

function coerceOptionalNumber() {
  return z.preprocess((v) => {
    if (v === "" || v === null || v === undefined) return undefined;
    return v;
  }, z.coerce.number().finite().optional());
}

function coerceOptionalInt() {
  return z.preprocess((v) => {
    if (v === "" || v === null || v === undefined) return undefined;
    return v;
  }, z.coerce.number().int().positive().optional());
}

const legacyBaselineListQuerySchema = z.object({
  keyword: z.string().optional(),
  limit: z.coerce.number().int().positive().max(5000).default(2000)
});

const legacyBaselineUpsertBodySchema = z
  .object({
    latitude: z.coerce.number().finite(),
    longitude: z.coerce.number().finite(),
    altitude: coerceOptionalNumber(),
    establishedBy: z.string().optional(),
    notes: z.string().optional(),
    positionAccuracy: coerceOptionalNumber(),
    measurementDuration: coerceOptionalInt(),
    satelliteCount: coerceOptionalInt(),
    pdopValue: coerceOptionalNumber()
  })
  .strict();

type LegacyBaselineJoinRow = {
  device_id: string;
  device_name: string;
  metadata: unknown;
  method: "auto" | "manual";
  points_count: number | null;
  baseline: unknown;
  computed_at: string;
  updated_at: string;
};

type LegacyBaselineRecord = {
  device_id: string;
  baseline_latitude: number;
  baseline_longitude: number;
  baseline_altitude: number | null;
  established_by: string;
  established_time: string;
  notes?: string;
  status: "active";
  position_accuracy?: number;
  measurement_duration?: number;
  satellite_count?: number;
  pdop_value?: number;
  confidence_level?: number;
  data_points_used?: number;
};

function readFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const t = value.trim();
    if (!t) return null;
    const n = Number(t);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function readFiniteInt(value: unknown): number | null {
  const n = readFiniteNumber(value);
  if (n == null) return null;
  const i = Math.trunc(n);
  if (!Number.isFinite(i)) return null;
  return i;
}

function legacyBaselineFromRow(row: LegacyBaselineJoinRow, deviceKeyOverride?: string): LegacyBaselineRecord {
  const baselineObj = row.baseline && typeof row.baseline === "object" ? (row.baseline as Record<string, unknown>) : {};

  const latitude = readFiniteNumber(baselineObj.latitude) ?? 0;
  const longitude = readFiniteNumber(baselineObj.longitude) ?? 0;
  const altitude = readFiniteNumber(baselineObj.altitude);
  const positionAccuracyMeters = readFiniteNumber(baselineObj.positionAccuracyMeters);
  const satelliteCount = readFiniteInt(baselineObj.satelliteCount);
  const measurementDuration = readFiniteInt(baselineObj.measurementDuration);
  const pdopValue = readFiniteNumber(baselineObj.pdopValue);
  const notes = typeof baselineObj.notes === "string" && baselineObj.notes.trim() ? baselineObj.notes.trim() : undefined;
  const establishedBy =
    typeof baselineObj.establishedBy === "string" && baselineObj.establishedBy.trim() ? baselineObj.establishedBy.trim() : "";

  const deviceKey = deviceKeyOverride ?? legacyKeyFromMetadata(row.device_name, row.metadata);
  const established_time = row.computed_at || row.updated_at || new Date().toISOString();

  return {
    device_id: deviceKey,
    baseline_latitude: latitude,
    baseline_longitude: longitude,
    baseline_altitude: altitude ?? null,
    established_by: establishedBy || (row.method === "auto" ? "系统自动建立" : "管理员"),
    established_time,
    ...(notes ? { notes } : {}),
    status: "active",
    ...(positionAccuracyMeters == null ? {} : { position_accuracy: positionAccuracyMeters }),
    ...(measurementDuration == null ? {} : { measurement_duration: measurementDuration }),
    ...(satelliteCount == null ? {} : { satellite_count: satelliteCount }),
    ...(pdopValue == null ? {} : { pdop_value: pdopValue }),
    ...(row.points_count == null ? {} : { data_points_used: row.points_count })
  };
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

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function stddev(values: number[], m: number): number {
  if (values.length === 0) return 0;
  const v = values.reduce((s, x) => s + (x - m) * (x - m), 0) / values.length;
  return Math.sqrt(v);
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[idx] ?? 0;
}

function positionAccuracyMeters(latStdDeg: number, lonStdDeg: number): number {
  const maxStd = Math.max(Math.abs(latStdDeg), Math.abs(lonStdDeg));
  return maxStd * 111000;
}

async function fetchBaselineRow(pg: PgPool, deviceId: string): Promise<BaselineRow | null> {
  return withPgClient(pg, async (client) =>
    queryOne<BaselineRow>(
      client,
      `
        SELECT
          gb.method,
          gb.points_count,
          gb.baseline,
          to_char(gb.computed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS computed_at,
          to_char(gb.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at
        FROM gps_baselines gb
        WHERE gb.device_id = $1
      `,
      [deviceId]
    )
  );
}

async function upsertBaseline(pg: PgPool, deviceId: string, method: "auto" | "manual", pointsCount: number | null, baseline: unknown) {
  await withPgClient(pg, async (client) => {
    await client.query(
      `
        INSERT INTO gps_baselines (device_id, method, points_count, baseline, computed_at, updated_at)
        VALUES ($1, $2, $3, $4::jsonb, NOW(), NOW())
        ON CONFLICT (device_id) DO UPDATE SET
          method = EXCLUDED.method,
          points_count = EXCLUDED.points_count,
          baseline = EXCLUDED.baseline,
          computed_at = NOW(),
          updated_at = NOW()
      `,
      [deviceId, method, pointsCount, JSON.stringify(baseline)]
    );
  });
}

type GpsPoint = { ts: string; lat: number; lon: number; alt: number | null };

async function fetchLatestGpsPoints(
  config: AppConfig,
  ch: ClickHouseClient,
  deviceId: string,
  keys: { latKey: string; lonKey: string; altKey?: string },
  lookbackDays: number,
  limit: number
): Promise<GpsPoint[]> {
  const end = new Date();
  const start = new Date(Date.now() - lookbackDays * 86400 * 1000);
  const sensorKeys = keys.altKey ? [keys.latKey, keys.lonKey, keys.altKey] : [keys.latKey, keys.lonKey];

  type Row = { ts: string; lat: number | null; lon: number | null; alt: number | null };

  const sql = `
    SELECT
      toString(received_ts) AS ts,
      maxIf(coalesce(value_f64, toFloat64(value_i64)), sensor_key = {latKey:String}) AS lat,
      maxIf(coalesce(value_f64, toFloat64(value_i64)), sensor_key = {lonKey:String}) AS lon,
      maxIf(coalesce(value_f64, toFloat64(value_i64)), sensor_key = {altKey:String}) AS alt
    FROM ${config.clickhouseDatabase}.${config.clickhouseTable}
    WHERE device_id = {deviceId:String}
      AND sensor_key IN {sensorKeys:Array(String)}
      AND received_ts >= {start:DateTime64(3, 'UTC')}
      AND received_ts <= {end:DateTime64(3, 'UTC')}
    GROUP BY received_ts
    HAVING isNotNull(lat) AND isNotNull(lon)
    ORDER BY received_ts DESC
    LIMIT {limit:UInt32}
  `;

  const result = await ch.query({
    query: sql,
    query_params: {
      deviceId,
      sensorKeys,
      latKey: keys.latKey,
      lonKey: keys.lonKey,
      altKey: keys.altKey ?? "__no_alt_key__",
      start: toClickhouseDateTime64Utc(start),
      end: toClickhouseDateTime64Utc(end),
      limit
    },
    format: "JSONEachRow"
  });
  const rows: Row[] = await result.json();

  return rows
    .filter((r): r is Row & { lat: number; lon: number } => typeof r.lat === "number" && typeof r.lon === "number")
    .map((r) => ({
      ts: clickhouseStringToIsoZ(r.ts),
      lat: r.lat,
      lon: r.lon,
      alt: typeof r.alt === "number" ? r.alt : null
    }));
}

type RegisterOptions = { legacy?: boolean };

function respond(reply: FastifyReply, data: unknown, traceId: string, opts?: RegisterOptions): void {
  if (opts?.legacy) {
    void reply.code(200).send({ success: true, data });
    return;
  }
  ok(reply, data, traceId);
}

function respondError(reply: FastifyReply, statusCode: number, message: string, traceId: string, opts?: RegisterOptions): void {
  if (opts?.legacy) {
    void reply.code(statusCode).send({ success: false, error: message });
    return;
  }
  fail(reply, statusCode, message, traceId);
}

async function handleAvailableDevices(
  request: FastifyRequest,
  reply: FastifyReply,
  config: AppConfig,
  ch: ClickHouseClient,
  pg: PgPool | null,
  adminCfg: AdminAuthConfig,
  opts?: RegisterOptions
): Promise<void> {
  const traceId = request.traceId;
  if (!(await requirePermission(adminCfg, pg, request, reply, "device:view"))) return;
  if (!pg) {
    respondError(reply, 503, "PostgreSQL 未配置", traceId, opts);
    return;
  }

  const parseQuery = availableDevicesQuerySchema.safeParse(request.query);
  if (!parseQuery.success) {
    respondError(reply, 400, "参数错误", traceId, opts);
    return;
  }
  const { lookbackDays, latKey, lonKey, limit } = parseQuery.data;

  const start = new Date(Date.now() - lookbackDays * 86400 * 1000);

  type Row = { device_id: string; lat_count: number | string; lon_count: number | string };
  const sql = `
    SELECT
      device_id,
      countIf(sensor_key = {latKey:String})::UInt64 AS lat_count,
      countIf(sensor_key = {lonKey:String})::UInt64 AS lon_count
    FROM ${config.clickhouseDatabase}.${config.clickhouseTable}
    WHERE sensor_key IN {sensorKeys:Array(String)}
      AND received_ts >= {start:DateTime64(3, 'UTC')}
    GROUP BY device_id
    HAVING lat_count > 0 AND lon_count > 0
    LIMIT {limit:UInt32}
  `;
  const res = await ch.query({
    query: sql,
    query_params: { sensorKeys: [latKey, lonKey], latKey, lonKey, start: toClickhouseDateTime64Utc(start), limit },
    format: "JSONEachRow"
  });
  const rows: Row[] = await res.json();
  const gpsDeviceIds = [...new Set(rows.map((r) => r.device_id))].filter((id) => deviceIdSchema.safeParse(id).success);
  if (gpsDeviceIds.length === 0) {
    respond(
      reply,
      { availableDevices: [], totalGpsDevices: 0, devicesWithBaseline: 0, devicesNeedingBaseline: 0, lookbackDays },
      traceId,
      opts
    );
    return;
  }

  const activeDeviceIds = await withPgClient(pg, async (client) => {
    const r = await client.query<{ device_id: string }>(
      `SELECT device_id FROM devices WHERE status != 'revoked' AND device_id = ANY($1::uuid[])`,
      [gpsDeviceIds]
    );
    return r.rows.map((x) => x.device_id);
  });

  const baselineIds = new Set<string>();
  if (activeDeviceIds.length > 0) {
    const r = await withPgClient(pg, async (client) =>
      client.query<{ device_id: string }>(`SELECT device_id FROM gps_baselines WHERE device_id = ANY($1::uuid[])`, [activeDeviceIds])
    );
    for (const row of r.rows) baselineIds.add(row.device_id);
  }

  const availableDevices = activeDeviceIds.filter((id) => !baselineIds.has(id));

  respond(
    reply,
    {
      availableDevices,
      totalGpsDevices: activeDeviceIds.length,
      devicesWithBaseline: baselineIds.size,
      devicesNeedingBaseline: availableDevices.length,
      lookbackDays
    },
    traceId,
    opts
  );
}

async function handleAutoEstablish(
  request: FastifyRequest,
  reply: FastifyReply,
  config: AppConfig,
  ch: ClickHouseClient,
  pg: PgPool | null,
  adminCfg: AdminAuthConfig,
  opts?: RegisterOptions
): Promise<void> {
  const traceId = request.traceId;
  if (!(await requirePermission(adminCfg, pg, request, reply, "device:update"))) return;
  if (!pg) {
    respondError(reply, 503, "PostgreSQL 未配置", traceId, opts);
    return;
  }

  const parseId = deviceIdSchema.safeParse((request.params as { deviceId?: unknown }).deviceId);
  if (!parseId.success) {
    respondError(reply, 400, "参数错误", traceId, opts);
    return;
  }
  const deviceId = parseId.data;

  const parseBody = autoEstablishBodySchema.safeParse(request.body ?? {});
  if (!parseBody.success) {
    respondError(reply, 400, "参数错误", traceId, opts);
    return;
  }
  const body = parseBody.data;

  const exists = await withPgClient(pg, async (client) =>
    queryOne<{ device_id: string }>(client, `SELECT device_id FROM devices WHERE device_id = $1 AND status != 'revoked'`, [deviceId])
  );
  if (!exists) {
    respondError(reply, 404, "资源不存在", traceId, opts);
    return;
  }

  const points = await fetchLatestGpsPoints(
    config,
    ch,
    deviceId,
    { latKey: body.latKey, lonKey: body.lonKey, ...(body.altKey ? { altKey: body.altKey } : {}) },
    body.lookbackDays,
    body.pointsCount
  );

  if (points.length < 10) {
    respondError(reply, 400, "数据点不足", traceId, opts);
    return;
  }

  const latVals = points.map((p) => p.lat);
  const lonVals = points.map((p) => p.lon);
  const altVals = points.map((p) => p.alt).filter((v): v is number => typeof v === "number");

  const latAvg = mean(latVals);
  const lonAvg = mean(lonVals);
  const altAvg = altVals.length > 0 ? mean(altVals) : null;
  const latStd = stddev(latVals, latAvg);
  const lonStd = stddev(lonVals, lonAvg);
  const accuracy = positionAccuracyMeters(latStd, lonStd);

  const baseline = baselineSchema.parse({
    latitude: latAvg,
    longitude: lonAvg,
    altitude: altAvg ?? undefined,
    positionAccuracyMeters: accuracy,
    notes: `auto-establish (${String(points.length)} points)`
  });

  await upsertBaseline(pg, deviceId, "auto", points.length, baseline);

  const tsValues = points.map((p) => p.ts);
  const startTs = tsValues.length > 0 ? tsValues[tsValues.length - 1] : null;
  const endTs = tsValues.length > 0 ? tsValues[0] : null;

  respond(
    reply,
    {
      deviceId,
      pointsUsed: points.length,
      lookbackDays: body.lookbackDays,
      keys: { latKey: body.latKey, lonKey: body.lonKey, altKey: body.altKey ?? null },
      baseline,
      statistics: {
        latStdDeg: latStd,
        lonStdDeg: lonStd,
        positionAccuracyMeters: accuracy,
        timeRange: { start: startTs, end: endTs }
      }
    },
    traceId,
    opts
  );
}

async function handleQualityCheck(
  request: FastifyRequest,
  reply: FastifyReply,
  config: AppConfig,
  ch: ClickHouseClient,
  pg: PgPool | null,
  adminCfg: AdminAuthConfig,
  opts?: RegisterOptions
): Promise<void> {
  const traceId = request.traceId;
  if (!(await requirePermission(adminCfg, pg, request, reply, "device:view"))) return;
  if (!pg) {
    respondError(reply, 503, "PostgreSQL 未配置", traceId, opts);
    return;
  }

  const parseId = deviceIdSchema.safeParse((request.params as { deviceId?: unknown }).deviceId);
  if (!parseId.success) {
    respondError(reply, 400, "参数错误", traceId, opts);
    return;
  }
  const deviceId = parseId.data;

  const parseQuery = qualityCheckQuerySchema.safeParse(request.query);
  if (!parseQuery.success) {
    respondError(reply, 400, "参数错误", traceId, opts);
    return;
  }
  const q = parseQuery.data;

  const baselineRow = await fetchBaselineRow(pg, deviceId);
  if (!baselineRow) {
    respondError(reply, 404, "未找到基准点（baseline）", traceId, opts);
    return;
  }

  const parsedBaseline = baselineSchema.safeParse(baselineRow.baseline ?? {});
  if (!parsedBaseline.success) {
    respondError(reply, 500, "基准点数据不可用", traceId, opts);
    return;
  }
  const baseline = parsedBaseline.data;

  const points = await fetchLatestGpsPoints(
    config,
    ch,
    deviceId,
    { latKey: q.latKey, lonKey: q.lonKey, ...(q.altKey ? { altKey: q.altKey } : {}) },
    q.lookbackDays,
    q.pointsCount
  );
  if (points.length < 10) {
    respondError(reply, 400, "数据点不足", traceId, opts);
    return;
  }

  const distances = points.map((p) => haversineMeters(baseline.latitude, baseline.longitude, p.lat, p.lon));
  const dMean = mean(distances);
  const dStd = stddev(distances, dMean);
  const dP95 = percentile(distances, 0.95);
  const dMax = Math.max(...distances);

  const level = dP95 <= 2 ? "good" : dP95 <= 5 ? "warn" : "bad";
  const baselineAgeHours = (() => {
    const computed = new Date(baselineRow.computed_at);
    if (Number.isNaN(computed.getTime())) return 0;
    return (Date.now() - computed.getTime()) / 3600000;
  })();

  const tsValues = points.map((p) => p.ts);
  const startTs = tsValues.length > 0 ? tsValues[tsValues.length - 1] : null;
  const endTs = tsValues.length > 0 ? tsValues[0] : null;

  respond(
    reply,
    {
      deviceId,
      lookbackDays: q.lookbackDays,
      keys: { latKey: q.latKey, lonKey: q.lonKey, altKey: q.altKey ?? null },
      baseline: {
        ...baseline,
        method: baselineRow.method,
        pointsCount: baselineRow.points_count,
        computedAt: clickhouseStringToIsoZ(baselineRow.computed_at)
      },
      sample: { pointsUsed: points.length, timeRange: { start: startTs, end: endTs } },
      driftMeters: { mean: dMean, std: dStd, p95: dP95, max: dMax },
      recommendation: { level, thresholds: { goodP95Meters: 2, warnP95Meters: 5 } },
      baselineAgeHours
    },
    traceId,
    opts
  );
}

export function registerGpsBaselineAdvancedRoutes(
  app: FastifyInstance,
  config: AppConfig,
  ch: ClickHouseClient,
  pg: PgPool | null
): void {
  const adminCfg: AdminAuthConfig = { adminApiToken: config.adminApiToken, jwtEnabled: Boolean(config.jwtAccessSecret) };

  app.get("/gps/baselines/available-devices", (request, reply) => handleAvailableDevices(request, reply, config, ch, pg, adminCfg));
  app.post("/gps/baselines/:deviceId/auto-establish", (request, reply) => handleAutoEstablish(request, reply, config, ch, pg, adminCfg));
  app.get("/gps/baselines/:deviceId/quality-check", (request, reply) => handleQualityCheck(request, reply, config, ch, pg, adminCfg));
}

export function registerGpsBaselineLegacyCompatRoutes(
  app: FastifyInstance,
  config: AppConfig,
  ch: ClickHouseClient,
  pg: PgPool | null
): void {
  const adminCfg: AdminAuthConfig = { adminApiToken: config.adminApiToken, jwtEnabled: Boolean(config.jwtAccessSecret) };

  app.get("/baselines", async (request, reply) => {
    if (!(await requirePermission(adminCfg, pg, request, reply, "device:view"))) return;
    if (!pg) {
      void reply.code(503).send({ success: false, error: "PostgreSQL 未配置" });
      return;
    }

    const parsed = legacyBaselineListQuerySchema.safeParse(request.query ?? {});
    if (!parsed.success) {
      void reply.code(400).send({ success: false, error: "参数错误" });
      return;
    }

    const { keyword, limit } = parsed.data;

    const where: string[] = ["d.status != 'revoked'"];
    const params: unknown[] = [];
    const add = (sql: string, val: unknown) => {
      params.push(val);
      where.push(sql.replaceAll("$X", "$" + String(params.length)));
    };

    const keywordTrimmed = keyword?.trim();
    if (keywordTrimmed) {
      const k = `%${keywordTrimmed}%`;
      add(
        "(d.device_name ILIKE $X OR d.metadata->>'legacy_device_id' ILIKE $X OR d.metadata#>>'{externalIds,legacy}' ILIKE $X)",
        k
      );
    }

    const whereSql = `WHERE ${where.join(" AND ")}`;

    const rows = await withPgClient(pg, async (client) =>
      client.query<LegacyBaselineJoinRow>(
        `
          SELECT
            gb.device_id,
            d.device_name,
            d.metadata,
            gb.method,
            gb.points_count,
            gb.baseline,
            to_char(gb.computed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS computed_at,
            to_char(gb.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at
          FROM gps_baselines gb
          JOIN devices d ON d.device_id = gb.device_id
          ${whereSql}
          ORDER BY gb.updated_at DESC
          LIMIT $${String(params.length + 1)}
        `,
        params.concat([limit])
      )
    );

    const data = rows.rows.map((r) => legacyBaselineFromRow(r));
    void reply.code(200).send({ success: true, data, count: data.length });
  });

  app.get("/baselines/available-devices", (request, reply) =>
    handleAvailableDevices(request, reply, config, ch, pg, adminCfg, { legacy: true })
  );

  app.get("/baselines/:deviceId", async (request, reply) => {
    if (!(await requirePermission(adminCfg, pg, request, reply, "device:view"))) return;
    if (!pg) {
      void reply.code(503).send({ success: false, error: "PostgreSQL 未配置" });
      return;
    }

    const rawId = typeof (request.params as { deviceId?: unknown }).deviceId === "string" ? (request.params as { deviceId: string }).deviceId : "";
    const deviceKey = rawId.trim();
    if (!deviceKey) {
      void reply.code(400).send({ success: false, error: "参数错误", hasBaseline: false });
      return;
    }

    const deviceRow = await withPgClient(pg, async (client) =>
      queryOne<{ device_id: string; device_name: string; metadata: unknown }>(
        client,
        `
          SELECT device_id, device_name, metadata
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
        [deviceKey]
      )
    );

    if (!deviceRow) {
      void reply.code(200).send({ success: false, error: "该设备没有设置基准点", hasBaseline: false });
      return;
    }

    const baselineRow = await withPgClient(pg, async (client) =>
      queryOne<LegacyBaselineJoinRow>(
        client,
        `
          SELECT
            gb.device_id,
            d.device_name,
            d.metadata,
            gb.method,
            gb.points_count,
            gb.baseline,
            to_char(gb.computed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS computed_at,
            to_char(gb.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at
          FROM gps_baselines gb
          JOIN devices d ON d.device_id = gb.device_id
          WHERE gb.device_id = $1
            AND d.status != 'revoked'
        `,
        [deviceRow.device_id]
      )
    );

    if (!baselineRow) {
      void reply.code(200).send({ success: false, error: "该设备没有设置基准点", hasBaseline: false });
      return;
    }

    const key = legacyKeyFromMetadata(deviceRow.device_name, deviceRow.metadata);
    const record = legacyBaselineFromRow(baselineRow, key);
    void reply.code(200).send({ success: true, data: record, hasBaseline: true });
  });

  const upsertLegacy = async (request: FastifyRequest, reply: FastifyReply, mode: "create" | "update") => {
    if (!(await requirePermission(adminCfg, pg, request, reply, "device:update"))) return;
    if (!pg) {
      void reply.code(503).send({ success: false, error: "PostgreSQL 未配置" });
      return;
    }

    const rawId = typeof (request.params as { deviceId?: unknown }).deviceId === "string" ? (request.params as { deviceId: string }).deviceId : "";
    const deviceKey = rawId.trim();
    if (!deviceKey) {
      void reply.code(400).send({ success: false, error: "参数错误" });
      return;
    }

    const parsed = legacyBaselineUpsertBodySchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      void reply.code(400).send({ success: false, error: "参数错误" });
      return;
    }

    const body = parsed.data;
    const latitude = body.latitude;
    const longitude = body.longitude;

    if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
      void reply.code(400).send({ success: false, error: "坐标值超出有效范围" });
      return;
    }

    const deviceRow = await withPgClient(pg, async (client) =>
      queryOne<{ device_id: string; device_name: string; metadata: unknown }>(
        client,
        `
          SELECT device_id, device_name, metadata
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
        [deviceKey]
      )
    );

    if (!deviceRow) {
      void reply.code(404).send({ success: false, error: "设备不存在" });
      return;
    }

    const notes = body.notes?.trim();
    const establishedBy = body.establishedBy?.trim();

    const baseline: Record<string, unknown> = {
      latitude,
      longitude,
      ...(body.altitude == null ? {} : { altitude: body.altitude }),
      ...(body.positionAccuracy == null ? {} : { positionAccuracyMeters: body.positionAccuracy }),
      ...(body.satelliteCount == null ? {} : { satelliteCount: body.satelliteCount }),
      ...(notes ? { notes } : {}),
      ...(establishedBy ? { establishedBy } : {}),
      ...(body.measurementDuration == null ? {} : { measurementDuration: body.measurementDuration }),
      ...(body.pdopValue == null ? {} : { pdopValue: body.pdopValue })
    };

    await upsertBaseline(pg, deviceRow.device_id, "manual", null, baseline);

    const nowIso = new Date().toISOString();
    const key = legacyKeyFromMetadata(deviceRow.device_name, deviceRow.metadata);
    const record = legacyBaselineFromRow(
      {
        device_id: deviceRow.device_id,
        device_name: deviceRow.device_name,
        metadata: deviceRow.metadata,
        method: "manual",
        points_count: null,
        baseline,
        computed_at: nowIso,
        updated_at: nowIso
      },
      key
    );

    void reply
      .code(200)
      .send({ success: true, data: record, message: mode === "update" ? "基准点更新成功" : "基准点设置成功" });
  };

  app.post("/baselines/:deviceId", async (request, reply) => upsertLegacy(request, reply, "create"));
  app.put("/baselines/:deviceId", async (request, reply) => upsertLegacy(request, reply, "update"));

  app.delete("/baselines/:deviceId", async (request, reply) => {
    if (!(await requirePermission(adminCfg, pg, request, reply, "device:update"))) return;
    if (!pg) {
      void reply.code(503).send({ success: false, error: "PostgreSQL 未配置" });
      return;
    }

    const rawId = typeof (request.params as { deviceId?: unknown }).deviceId === "string" ? (request.params as { deviceId: string }).deviceId : "";
    const deviceKey = rawId.trim();
    if (!deviceKey) {
      void reply.code(400).send({ success: false, error: "参数错误" });
      return;
    }

    const deviceRow = await withPgClient(pg, async (client) =>
      queryOne<{ device_id: string }>(
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
        [deviceKey]
      )
    );

    if (!deviceRow) {
      void reply.code(404).send({ success: false, error: "设备不存在" });
      return;
    }

    await withPgClient(pg, async (client) => {
      await client.query(`DELETE FROM gps_baselines WHERE device_id = $1`, [deviceRow.device_id]);
    });

    void reply.code(200).send({ success: true, message: "基准点删除成功" });
  });

  app.post("/baselines/:deviceId/auto-establish", (request, reply) =>
    handleAutoEstablish(request, reply, config, ch, pg, adminCfg, { legacy: true })
  );
  app.post("/baselines/:deviceId/auto-establish-advanced", (request, reply) =>
    handleAutoEstablish(request, reply, config, ch, pg, adminCfg, { legacy: true })
  );
  app.post("/baselines/:deviceId/auto-establish-simple", (request, reply) =>
    handleAutoEstablish(request, reply, config, ch, pg, adminCfg, { legacy: true })
  );
  app.get("/baselines/:deviceId/quality-check", (request, reply) =>
    handleQualityCheck(request, reply, config, ch, pg, adminCfg, { legacy: true })
  );
  app.get("/baselines/:deviceId/quality-assessment", (request, reply) =>
    handleQualityCheck(request, reply, config, ch, pg, adminCfg, { legacy: true })
  );
}
