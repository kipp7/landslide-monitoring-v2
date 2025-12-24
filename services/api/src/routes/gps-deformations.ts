import type { ClickHouseClient } from "@clickhouse/client";
import type { FastifyInstance, FastifyReply } from "fastify";
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

    const validRows = rows.filter(
      (r): r is Row & { lat: number; lon: number } => typeof r.lat === "number" && typeof r.lon === "number"
    );

    const points = validRows.map((r) => {
      const horizontalMeters = haversineMeters(baseline.latitude, baseline.longitude, r.lat, r.lon);
      const verticalMeters = baseAlt !== null && typeof r.alt === "number" ? r.alt - baseAlt : null;
        const distanceMeters =
          verticalMeters === null ? horizontalMeters : Math.sqrt(horizontalMeters * horizontalMeters + verticalMeters * verticalMeters);
        return {
          ts: clickhouseStringToIsoZ(r.ts),
          latitude: r.lat,
          longitude: r.lon,
          altitude: typeof r.alt === "number" ? r.alt : null,
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

const legacyGpsDeformationBodySchema = z
  .object({
    timeRange: z.enum(["1h", "6h", "24h", "7d", "15d", "30d"]).optional()
  })
  .passthrough();

type LegacyGpsDeformationPoint = { ts: string; latitude: number; longitude: number; distanceMeters: number };

function legacyOk(reply: FastifyReply, data: unknown): void {
  void reply.code(200).send({ success: true, data });
}

function legacyFail(reply: FastifyReply, statusCode: number, message: string, details?: unknown): void {
  void reply.code(statusCode).send({ success: false, message, error: details, timestamp: new Date().toISOString() });
}

function parseLegacyTimeRange(timeRange: string | undefined): { start: Date; end: Date; bucketSeconds: number } {
  const raw = (timeRange ?? "").trim();
  const tr = raw.length > 0 ? raw : "30d";
  const end = new Date();

  const durationMs =
    tr === "1h"
      ? 60 * 60 * 1000
      : tr === "6h"
        ? 6 * 60 * 60 * 1000
        : tr === "24h"
          ? 24 * 60 * 60 * 1000
          : tr === "7d"
            ? 7 * 24 * 60 * 60 * 1000
            : tr === "15d"
              ? 15 * 24 * 60 * 60 * 1000
              : 30 * 24 * 60 * 60 * 1000;

  const bucketSeconds =
    tr === "1h"
      ? 60
      : tr === "6h"
        ? 300
        : tr === "24h"
          ? 900
          : tr === "7d"
            ? 3600
            : tr === "15d"
              ? 7200
              : 14400;

  return { start: new Date(end.getTime() - durationMs), end, bucketSeconds };
}

function safeNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] ?? 0;
  const a = sorted[mid - 1] ?? 0;
  const b = sorted[mid] ?? 0;
  return (a + b) / 2;
}

function stdDev(values: number[]): number {
  if (values.length === 0) return 0;
  const m = mean(values);
  const variance = values.reduce((sum, v) => sum + (v - m) * (v - m), 0) / values.length;
  return Math.sqrt(Math.max(0, variance));
}

function skewness(values: number[]): number {
  if (values.length < 3) return 0;
  const m = mean(values);
  const s = stdDev(values);
  if (s === 0) return 0;
  const n = values.length;
  const m3 = values.reduce((sum, v) => sum + Math.pow((v - m) / s, 3), 0) / n;
  return m3;
}

function kurtosis(values: number[]): number {
  if (values.length < 4) return 0;
  const m = mean(values);
  const s = stdDev(values);
  if (s === 0) return 0;
  const n = values.length;
  const m4 = values.reduce((sum, v) => sum + Math.pow((v - m) / s, 4), 0) / n;
  return m4 - 3;
}

function autocorrelationLag1(values: number[]): number {
  if (values.length < 3) return 0;
  const x0 = values.slice(0, -1);
  const x1 = values.slice(1);
  const m0 = mean(x0);
  const m1 = mean(x1);
  const denom0 = x0.reduce((sum, v) => sum + (v - m0) * (v - m0), 0);
  const denom1 = x1.reduce((sum, v) => sum + (v - m1) * (v - m1), 0);
  const denom = Math.sqrt(denom0 * denom1);
  if (denom === 0) return 0;
  const num = x0.reduce((sum, v, idx) => sum + (v - m0) * ((x1[idx] ?? 0) - m1), 0);
  return num / denom;
}

function linearTrend(values: number[]): { slope: number; r2: number } {
  const n = values.length;
  if (n < 2) return { slope: 0, r2: 0 };
  const xs = Array.from({ length: n }, (_, i) => i);
  const xMean = mean(xs);
  const yMean = mean(values);
  const denom = xs.reduce((sum, x) => sum + (x - xMean) * (x - xMean), 0);
  const numer = xs.reduce((sum, x, idx) => sum + (x - xMean) * ((values[idx] ?? 0) - yMean), 0);
  const slope = denom === 0 ? 0 : numer / denom;

  const fitted = xs.map((x) => yMean + slope * (x - xMean));
  const sst = values.reduce((sum, y) => sum + (y - yMean) * (y - yMean), 0);
  const sse = values.reduce((sum, y, idx) => sum + (y - (fitted[idx] ?? yMean)) * (y - (fitted[idx] ?? yMean)), 0);
  const r2 = sst === 0 ? 0 : Math.max(0, Math.min(1, 1 - sse / sst));

  return { slope, r2 };
}

function assessRealTimeRisk(displacementMeters: number): { level: number; description: string } {
  const thresholds = { level1: 0.005, level2: 0.02, level3: 0.05, level4: 0.1 };
  if (displacementMeters >= thresholds.level4) return { level: 1, description: "I_level_red" };
  if (displacementMeters >= thresholds.level3) return { level: 2, description: "II_level_orange" };
  if (displacementMeters >= thresholds.level2) return { level: 3, description: "III_level_yellow" };
  if (displacementMeters >= thresholds.level1) return { level: 4, description: "IV_level_blue" };
  return { level: 0, description: "normal" };
}

async function resolveDeviceId(pg: PgPool, input: string): Promise<string | null> {
  return withPgClient(pg, async (client) => {
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
  });
}

async function fetchLegacyGpsPoints(
  config: AppConfig,
  ch: ClickHouseClient,
  deviceId: string,
  baseline: z.infer<typeof baselineSchema> | null,
  opts: { start: Date; end: Date; bucketSeconds: number }
): Promise<LegacyGpsDeformationPoint[]> {
  type Row = {
    ts: string;
    lat: number | null;
    lon: number | null;
  };

  const latKey = "gps_latitude";
  const lonKey = "gps_longitude";
  const sensorKeys = [latKey, lonKey];

  const sql = `
    SELECT
      toString(toStartOfInterval(received_ts, INTERVAL {bucket:UInt32} SECOND)) AS ts,
      avgIf(coalesce(value_f64, toFloat64(value_i64)), sensor_key = {latKey:String}) AS lat,
      avgIf(coalesce(value_f64, toFloat64(value_i64)), sensor_key = {lonKey:String}) AS lon
    FROM ${config.clickhouseDatabase}.${config.clickhouseTable}
    WHERE device_id = {deviceId:String}
      AND sensor_key IN {sensorKeys:Array(String)}
      AND received_ts >= {start:DateTime64(3, 'UTC')}
      AND received_ts <= {end:DateTime64(3, 'UTC')}
    GROUP BY ts
    ORDER BY ts ASC
    LIMIT 20000
  `;

  const res = await ch.query({
    query: sql,
    query_params: {
      deviceId,
      sensorKeys,
      bucket: opts.bucketSeconds,
      latKey,
      lonKey,
      start: toClickhouseDateTime64Utc(opts.start),
      end: toClickhouseDateTime64Utc(opts.end)
    },
    format: "JSONEachRow"
  });

  const rows: Row[] = await res.json();

  const out: LegacyGpsDeformationPoint[] = [];
  for (const r of rows) {
    const lat = safeNumber(r.lat);
    const lon = safeNumber(r.lon);
    if (lat === null || lon === null) continue;

    const distanceMeters = baseline ? haversineMeters(baseline.latitude, baseline.longitude, lat, lon) : 0;
    out.push({ ts: clickhouseStringToIsoZ(r.ts), latitude: lat, longitude: lon, distanceMeters });
  }
  return out;
}

export function registerGpsDeformationLegacyCompatRoutes(
  app: FastifyInstance,
  config: AppConfig,
  ch: ClickHouseClient,
  pg: PgPool | null
): void {
  const adminCfg: AdminAuthConfig = { adminApiToken: config.adminApiToken, jwtEnabled: Boolean(config.jwtAccessSecret) };

  app.post("/gps-deformation/:deviceId", async (request, reply) => {
    try {
      if (!(await requirePermission(adminCfg, pg, request, reply, "data:analysis"))) return;
      if (!pg) {
        legacyFail(reply, 503, "PostgreSQL not configured");
        return;
      }

      const deviceParam = (request.params as { deviceId?: unknown }).deviceId;
      const deviceIdRaw = typeof deviceParam === "string" ? deviceParam.trim() : "";
      if (!deviceIdRaw) {
        legacyFail(reply, 400, "invalid deviceId");
        return;
      }

      const parsedBody = legacyGpsDeformationBodySchema.safeParse(request.body ?? {});
      if (!parsedBody.success) {
        legacyFail(reply, 400, "invalid body", parsedBody.error.issues);
        return;
      }

      const startedAt = Date.now();
      const resolved = await resolveDeviceId(pg, deviceIdRaw);
      if (!resolved) {
        legacyFail(reply, 404, "device not found");
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
          [resolved]
        );
      });

      const parsedBaseline = baselineRow ? baselineSchema.safeParse(baselineRow.baseline ?? {}) : null;
      const baselineData = parsedBaseline?.success ? parsedBaseline.data : null;
      const hasBaseline = Boolean(baselineData);

      const { start, end, bucketSeconds } = parseLegacyTimeRange(parsedBody.data.timeRange);

      const points = await fetchLegacyGpsPoints(config, ch, resolved, baselineData, { start, end, bucketSeconds });
      const latest = points.length > 0 ? points[points.length - 1] : null;

      const displacementMeters = latest ? latest.distanceMeters : 0;
      const risk = assessRealTimeRisk(displacementMeters);

      const distances = points.map((p) => p.distanceMeters);
      const maxDisp = distances.length > 0 ? Math.max(...distances) : 0;
      const minDisp = distances.length > 0 ? Math.min(...distances) : 0;
      const sd = stdDev(distances);
      const m = mean(distances);

      const trend = linearTrend(distances);
      const trendLabel = Math.abs(trend.slope) < 0.00001 ? "stable" : trend.slope > 0 ? "increasing" : "decreasing";

      const analysis = {
        success: true,
        deviceId: deviceIdRaw,
        analysisTime: new Date().toISOString(),
        processingTime: `${String(Date.now() - startedAt)}ms`,
        realTimeDisplacement: {
          hasBaseline,
          hasLatestData: Boolean(latest),
          displacement: displacementMeters,
          horizontal: displacementMeters,
          vertical: 0,
          latestTime: latest?.ts ?? null,
          baseline:
            hasBaseline && baselineRow && baselineData
              ? { latitude: baselineData.latitude, longitude: baselineData.longitude, established_time: baselineRow.computed_at }
              : null,
          latestGPS: latest ? { latitude: latest.latitude, longitude: latest.longitude, time: latest.ts } : null,
          error: hasBaseline ? null : "baseline not established"
        },
        dataQuality: {
          totalPoints: points.length,
          validPoints: points.length,
          qualityScore: points.length >= 5 ? 0.9 : points.length > 0 ? 0.6 : 0,
          completeness: points.length > 0 ? 1 : 0,
          consistency: points.length >= 3 ? Math.max(0, Math.min(1, 1 - sd / Math.max(0.000001, maxDisp))) : 0,
          accuracy: points.length > 0 ? 0.9 : 0
        },
        results: {
          riskAssessment: {
            level: risk.level,
            description: risk.description,
            confidence: points.length > 0 ? 0.85 : 0,
            factors: {
              realTimeDisplacement: displacementMeters,
              maxDisplacement: maxDisp,
              meanDisplacement: m
            }
          },
          trendAnalysis: {
            trend: trendLabel,
            magnitude: trend.slope,
            confidence: trend.r2
          },
          statisticalAnalysis: {
            basic: {
              mean: m,
              median: median(distances),
              standardDeviation: sd,
              skewness: skewness(distances),
              kurtosis: kurtosis(distances),
              coefficientOfVariation: m === 0 ? 0 : sd / Math.abs(m)
            },
            summary: {
              maxDisplacement: maxDisp,
              minDisplacement: minDisp,
              riskIndicators: [
                maxDisp >= 0.1 ? "displacement>=100mm" : null,
                maxDisp >= 0.05 ? "displacement>=50mm" : null,
                maxDisp >= 0.02 ? "displacement>=20mm" : null,
                maxDisp >= 0.005 ? "displacement>=5mm" : null
              ].filter((x): x is string => Boolean(x))
            },
            time: {
              volatility: sd,
              autocorrelation: autocorrelationLag1(distances)
            }
          },
          dtwAnalysis: {
            totalPatterns: 0,
            topMatches: [],
            accuracy: 0
          },
          ceemdDecomposition: {
            imfs: [],
            residue: [],
            imfAnalysis: { dominantFrequencies: [], energyDistribution: [], decompositionQuality: { qualityScore: 0 } }
          },
          prediction: {
            shortTerm: { values: [], confidence: 0, method: "v2_basic", horizon: "24h" },
            longTerm: { values: [], confidence: 0, method: "v2_basic", horizon: "7d" }
          }
        },
        metadata: {
          algorithmVersion: "v2-gps-deformation-basic",
          source: hasBaseline ? "v2_clickhouse_baseline" : "v2_missing_baseline"
        }
      };

      legacyOk(reply, analysis);
    } catch (err) {
      legacyFail(reply, 500, "gps deformation analysis failed", err instanceof Error ? err.message : String(err));
    }
  });
}
