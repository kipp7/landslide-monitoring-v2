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

  type Row = { device_id: string };
  const sql = `
    SELECT DISTINCT device_id
    FROM ${config.clickhouseDatabase}.${config.clickhouseTable}
    WHERE sensor_key IN {sensorKeys:Array(String)}
      AND received_ts >= now() - INTERVAL {days:UInt32} DAY
    LIMIT {limit:UInt32}
  `;
  const res = await ch.query({
    query: sql,
    query_params: { sensorKeys: [latKey, lonKey], days: lookbackDays, limit },
    format: "JSONEachRow"
  });
  const rows: Row[] = await res.json();
  const gpsDeviceIds = [...new Set(rows.map((r) => r.device_id))];

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
    notes: `auto-establish (${points.length} points)`
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

  app.get("/baselines/available-devices", (request, reply) =>
    handleAvailableDevices(request, reply, config, ch, pg, adminCfg, { legacy: true })
  );
  app.post("/baselines/:deviceId/auto-establish", (request, reply) =>
    handleAutoEstablish(request, reply, config, ch, pg, adminCfg, { legacy: true })
  );
  app.get("/baselines/:deviceId/quality-check", (request, reply) =>
    handleQualityCheck(request, reply, config, ch, pg, adminCfg, { legacy: true })
  );
}
