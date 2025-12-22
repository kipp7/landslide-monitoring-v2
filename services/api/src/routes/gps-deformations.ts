import type { ClickHouseClient } from "@clickhouse/client";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AdminAuthConfig } from "../authz";
import { requirePermission } from "../authz";
import type { AppConfig } from "../config";
import { fail, ok } from "../http";
import type { PgPool } from "../postgres";
import { queryOne, withPgClient } from "../postgres";

const deviceIdSchema = z.string().uuid();

const baselineSchema = z.object({
  latitude: z.number().finite(),
  longitude: z.number().finite(),
  altitude: z.number().finite().optional(),
  positionAccuracyMeters: z.number().finite().optional(),
  satelliteCount: z.number().int().positive().optional(),
  notes: z.string().max(2000).optional()
});

const seriesQuerySchema = z.object({
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  interval: z.enum(["1m", "5m", "1h", "1d"]).default("1h"),
  latKey: z.string().min(1).default("gps_latitude"),
  lonKey: z.string().min(1).default("gps_longitude"),
  altKey: z.string().min(1).optional(),
  limit: z.coerce.number().int().positive().max(200000).default(20000)
});

type BaselineRow = {
  method: "auto" | "manual";
  points_count: number | null;
  baseline: unknown;
  computed_at: string;
  updated_at: string;
};

function intervalSeconds(interval: "1m" | "5m" | "1h" | "1d"): number {
  if (interval === "1m") return 60;
  if (interval === "5m") return 300;
  if (interval === "1h") return 3600;
  return 86400;
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

export function registerGpsDeformationRoutes(
  app: FastifyInstance,
  config: AppConfig,
  ch: ClickHouseClient,
  pg: PgPool | null
): void {
  const adminCfg: AdminAuthConfig = { adminApiToken: config.adminApiToken, jwtEnabled: Boolean(config.jwtAccessSecret) };

  app.get("/gps/deformations/:deviceId/series", async (request, reply) => {
    const traceId = request.traceId;
    if (!(await requirePermission(adminCfg, pg, request, reply, "data:analysis"))) return;

    const parseId = deviceIdSchema.safeParse((request.params as { deviceId?: unknown }).deviceId);
    if (!parseId.success) {
      fail(reply, 400, "参数错误", traceId, { field: "deviceId" });
      return;
    }
    const deviceId = parseId.data;

    const parseQuery = seriesQuerySchema.safeParse(request.query);
    if (!parseQuery.success) {
      fail(reply, 400, "参数错误", traceId, { field: "query", issues: parseQuery.error.issues });
      return;
    }

    const { startTime, endTime, interval, latKey, lonKey, altKey, limit } = parseQuery.data;
    const start = new Date(startTime);
    const end = new Date(endTime);
    if (!(start < end)) {
      fail(reply, 400, "参数错误", traceId, { field: "timeRange" });
      return;
    }
    if (!pg) {
      fail(reply, 503, "PostgreSQL 未配置", traceId);
      return;
    }

    const baselineRow = await withPgClient(pg, async (client) => {
      return queryOne<BaselineRow>(
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
      );
    });

    if (!baselineRow) {
      fail(reply, 404, "未找到基准点（baseline）", traceId, { field: "deviceId" });
      return;
    }

    const parsedBaseline = baselineSchema.safeParse(baselineRow.baseline ?? {});
    if (!parsedBaseline.success) {
      fail(reply, 500, "基准点数据不可用", traceId, { field: "baseline", issues: parsedBaseline.error.issues });
      return;
    }

    const bucketSeconds = intervalSeconds(interval);
    const sensorKeys = altKey ? [latKey, lonKey, altKey] : [latKey, lonKey];

    type Row = {
      ts: string;
      lat: number | null;
      lon: number | null;
      alt: number | null;
      lat_count: number | string;
      lon_count: number | string;
      alt_count: number | string;
    };

    const sql = `
      SELECT
        toString(toStartOfInterval(received_ts, INTERVAL {bucket:UInt32} SECOND)) AS ts,
        avgIf(coalesce(value_f64, toFloat64(value_i64)), sensor_key = {latKey:String}) AS lat,
        avgIf(coalesce(value_f64, toFloat64(value_i64)), sensor_key = {lonKey:String}) AS lon,
        avgIf(coalesce(value_f64, toFloat64(value_i64)), sensor_key = {altKey:String}) AS alt,
        countIf(sensor_key = {latKey:String})::UInt64 AS lat_count,
        countIf(sensor_key = {lonKey:String})::UInt64 AS lon_count,
        countIf(sensor_key = {altKey:String})::UInt64 AS alt_count
      FROM ${config.clickhouseDatabase}.${config.clickhouseTable}
      WHERE device_id = {deviceId:String}
        AND sensor_key IN {sensorKeys:Array(String)}
        AND received_ts >= {start:DateTime64(3, 'UTC')}
        AND received_ts <= {end:DateTime64(3, 'UTC')}
      GROUP BY ts
      ORDER BY ts ASC
      LIMIT {limit:UInt32}
    `;

    const result = await ch.query({
      query: sql,
      query_params: {
        deviceId,
        sensorKeys,
        bucket: bucketSeconds,
        latKey,
        lonKey,
        altKey: altKey ?? "__no_alt_key__",
        start: toClickhouseDateTime64Utc(start),
        end: toClickhouseDateTime64Utc(end),
        limit
      },
      format: "JSONEachRow"
    });

    const rows: Row[] = await result.json();
    const baseline = parsedBaseline.data;
    const baseAlt = typeof baseline.altitude === "number" ? baseline.altitude : null;

    const points = rows
      .filter((r) => typeof r.lat === "number" && typeof r.lon === "number")
      .map((r) => {
        const horizontalMeters = haversineMeters(baseline.latitude, baseline.longitude, r.lat as number, r.lon as number);
        const verticalMeters = baseAlt !== null && typeof r.alt === "number" ? (r.alt as number) - baseAlt : null;
        const distanceMeters =
          verticalMeters === null ? horizontalMeters : Math.sqrt(horizontalMeters * horizontalMeters + verticalMeters * verticalMeters);
        return {
          ts: clickhouseStringToIsoZ(r.ts),
          latitude: r.lat as number,
          longitude: r.lon as number,
          altitude: typeof r.alt === "number" ? (r.alt as number) : null,
          horizontalMeters,
          verticalMeters,
          distanceMeters,
          counts: {
            lat: typeof r.lat_count === "string" ? Number(r.lat_count) : r.lat_count,
            lon: typeof r.lon_count === "string" ? Number(r.lon_count) : r.lon_count,
            alt: typeof r.alt_count === "string" ? Number(r.alt_count) : r.alt_count
          }
        };
      });

    ok(
      reply,
      {
        deviceId,
        interval,
        keys: { latKey, lonKey, altKey: altKey ?? null },
        baseline: { ...baseline, method: baselineRow.method, pointsCount: baselineRow.points_count, computedAt: baselineRow.computed_at },
        points
      },
      traceId
    );
  });
}

