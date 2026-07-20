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

const analysisQuerySchema = z.object({
  timeRange: z.string().optional(),
  startTime: z.string().datetime().optional(),
  endTime: z.string().datetime().optional(),
  limit: z.coerce.number().int().positive().max(5000).default(200)
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

const MAX_DEFORMATION_DISTANCE_METERS = 500;

function isValidGpsCoordinatePair(lat: number, lon: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    Math.abs(lat) > 0.0001 &&
    Math.abs(lon) > 0.0001 &&
    Math.abs(lat) <= 90 &&
    Math.abs(lon) <= 180
  );
}

export function clamp01(n: number): number {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
  }
  return sorted[mid] ?? 0;
}

function standardDeviation(values: number[], avg: number): number {
  if (values.length === 0) return 0;
  const variance = values.reduce((sum, v) => sum + (v - avg) * (v - avg), 0) / values.length;
  return Math.sqrt(variance);
}

function movingAverage(values: number[], windowSize: number): number[] {
  const w = Math.max(1, Math.floor(windowSize));
  const out = new Array<number>(values.length);
  let sum = 0;
  const q: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const v = values[i] ?? 0;
    q.push(v);
    sum += v;
    if (q.length > w) sum -= q.shift() ?? 0;
    out[i] = sum / q.length;
  }
  return out;
}

function estimateSampleIntervalSeconds(timesIso: string[]): number {
  const deltas: number[] = [];
  for (let i = 1; i < timesIso.length; i++) {
    const a = Date.parse(timesIso[i - 1] ?? "");
    const b = Date.parse(timesIso[i] ?? "");
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    const dt = (b - a) / 1000;
    if (!Number.isFinite(dt) || dt <= 0) continue;
    deltas.push(dt);
  }
  return deltas.length > 0 ? Math.max(1, median(deltas)) : 3600;
}

function estimateDominantFrequencyHz(series: number[], sampleIntervalSeconds: number): number {
  if (series.length < 2) return 0;
  let crossings = 0;
  for (let i = 1; i < series.length; i++) {
    const a = series[i - 1] ?? 0;
    const b = series[i] ?? 0;
    if (a !== 0 && a * b < 0) crossings += 1;
  }
  const duration = (series.length - 1) * sampleIntervalSeconds;
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  return crossings / (2 * duration);
}

export function basicStats(values: number[]) {
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length === 0) return { mean: 0, median: 0, standardDeviation: 0, min: 0, max: 0 };
  const avg = mean(finite);
  return {
    mean: avg,
    median: median(finite),
    standardDeviation: standardDeviation(finite, avg),
    min: Math.min(...finite),
    max: Math.max(...finite)
  };
}

export function computeGpsTrendDiagnostics(displacementMm: number[], timesIso: string[]) {
  const n = displacementMm.length;
  if (n === 0) {
    return {
      direction: "stable",
      changeMm: 0,
      slopeMmPerHour: 0,
      durationHours: 0,
      regressionFitR2: 0,
      accelerationMmPerHour2: 0,
      averageStepMm: 0,
      volatilityMm: 0,
      sampleIntervalSeconds: 3600
    } as const;
  }

  const sampleIntervalSeconds = estimateSampleIntervalSeconds(timesIso);
  const first = displacementMm[0] ?? 0;
  const last = displacementMm[n - 1] ?? 0;
  const changeMm = last - first;
  const xHours = timesIso.map((ts, idx) => {
    const parsed = Date.parse(ts);
    if (!Number.isFinite(parsed)) {
      return (idx * sampleIntervalSeconds) / 3600;
    }
    const firstParsed = Date.parse(timesIso[0] ?? "");
    if (!Number.isFinite(firstParsed)) {
      return (idx * sampleIntervalSeconds) / 3600;
    }
    return Math.max(0, (parsed - firstParsed) / (1000 * 60 * 60));
  });
  const totalHours = Math.max(sampleIntervalSeconds / 3600, xHours.at(-1) ?? 0);
  const avgX = mean(xHours);
  const avgY = mean(displacementMm);
  const cov = xHours.reduce((sum, x, idx) => sum + (x - avgX) * ((displacementMm[idx] ?? 0) - avgY), 0);
  const varX = xHours.reduce((sum, x) => sum + (x - avgX) * (x - avgX), 0);
  const slopeMmPerHour = varX > 0 ? cov / varX : changeMm / Math.max(0.0001, totalHours);
  const interceptMm = avgY - slopeMmPerHour * avgX;
  const predicted = xHours.map((x) => interceptMm + slopeMmPerHour * x);
  const ssTot = displacementMm.reduce((sum, value) => sum + (value - avgY) * (value - avgY), 0);
  const ssRes = displacementMm.reduce((sum, value, idx) => {
    const estimate = predicted[idx] ?? value;
    return sum + (value - estimate) * (value - estimate);
  }, 0);
  const regressionFitR2 = ssTot > 0 ? clamp01(1 - ssRes / ssTot) : 1;
  const diffs = displacementMm.slice(1).map((value, idx) => value - (displacementMm[idx] ?? 0));
  const averageStepMm = diffs.length > 0 ? mean(diffs) : 0;
  const volatilityMm = diffs.length > 0 ? standardDeviation(diffs, averageStepMm) : 0;
  const accelerations = diffs.slice(1).map((value, idx) => {
    const prev = diffs[idx] ?? 0;
    return (value - prev) / Math.max(0.0001, sampleIntervalSeconds / 3600);
  });
  const accelerationMmPerHour2 = accelerations.length > 0 ? mean(accelerations) : 0;
  const direction = Math.abs(slopeMmPerHour) < 0.05 && Math.abs(changeMm) < 0.5 ? "stable" : slopeMmPerHour > 0 ? "increasing" : "decreasing";

  return {
    direction,
    changeMm: Number(changeMm.toFixed(3)),
    slopeMmPerHour: Number(slopeMmPerHour.toFixed(4)),
    durationHours: Number(totalHours.toFixed(3)),
    regressionFitR2: Number(regressionFitR2.toFixed(4)),
    accelerationMmPerHour2: Number(accelerationMmPerHour2.toFixed(5)),
    averageStepMm: Number(averageStepMm.toFixed(4)),
    volatilityMm: Number(volatilityMm.toFixed(4)),
    sampleIntervalSeconds
  } as const;
}

type GpsThresholdConfig = {
  blue: number;
  yellow: number;
  red: number;
};

type GpsThresholdCrossing = {
  breached: boolean;
  firstIndex: number | null;
  firstValue: number | null;
  etaHours: number | null;
  etaDays: number | null;
  firstTimestamp: string | null;
};

type GpsPredictionThresholdForecast = {
  thresholdsMm: GpsThresholdConfig;
  shortTerm: Record<keyof GpsThresholdConfig, GpsThresholdCrossing>;
  longTerm: Record<keyof GpsThresholdConfig, GpsThresholdCrossing>;
};

function findThresholdCrossing(series: number[], threshold: number, forecastStartIso: string, stepHours: number): GpsThresholdCrossing {
  const firstIndex = series.findIndex((value) => value >= threshold);
  if (firstIndex < 0) {
    return { breached: false, firstIndex: null, firstValue: null, etaHours: null, etaDays: null, firstTimestamp: null };
  }
  const etaHours = (firstIndex + 1) * stepHours;
  const start = Date.parse(forecastStartIso);
  const firstTimestamp = Number.isFinite(start) ? new Date(start + etaHours * 60 * 60 * 1000).toISOString() : null;
  return {
    breached: true,
    firstIndex: firstIndex + 1,
    firstValue: Number((series[firstIndex] ?? 0).toFixed(2)),
    etaHours: Number(etaHours.toFixed(3)),
    etaDays: Number((etaHours / 24).toFixed(3)),
    firstTimestamp
  };
}

export function computeGpsPredictionThresholdForecast(
  shortTerm: number[],
  longTerm: number[],
  thresholdsMm: GpsThresholdConfig,
  forecastStartIso: string
): GpsPredictionThresholdForecast {
  return {
    thresholdsMm,
    shortTerm: {
      blue: findThresholdCrossing(shortTerm, thresholdsMm.blue, forecastStartIso, 1),
      yellow: findThresholdCrossing(shortTerm, thresholdsMm.yellow, forecastStartIso, 1),
      red: findThresholdCrossing(shortTerm, thresholdsMm.red, forecastStartIso, 1)
    },
    longTerm: {
      blue: findThresholdCrossing(longTerm, thresholdsMm.blue, forecastStartIso, 1),
      yellow: findThresholdCrossing(longTerm, thresholdsMm.yellow, forecastStartIso, 1),
      red: findThresholdCrossing(longTerm, thresholdsMm.red, forecastStartIso, 1)
    }
  };
}

async function loadGpsThresholdConfig(pg: PgPool | null): Promise<GpsThresholdConfig> {
  const defaults: GpsThresholdConfig = { blue: 2, yellow: 5, red: 8 };
  if (!pg) return defaults;

  const rows = await withPgClient(pg, async (client) => {
    const res = await client.query<{ config_key: string; config_value: string }>(
      `
        SELECT config_key, config_value
        FROM system_configs
        WHERE config_key IN (
          'gps.displacement_threshold_blue_mm',
          'gps.displacement_threshold_yellow_mm',
          'gps.displacement_threshold_red_mm'
        )
      `
    );
    return res.rows;
  });

  const byKey = new Map(rows.map((row) => [row.config_key, row.config_value] as const));
  const pick = (key: string, fallback: number) => {
    const value = Number(byKey.get(key) ?? "");
    return Number.isFinite(value) ? value : fallback;
  };

  return {
    blue: pick("gps.displacement_threshold_blue_mm", defaults.blue),
    yellow: pick("gps.displacement_threshold_yellow_mm", defaults.yellow),
    red: pick("gps.displacement_threshold_red_mm", defaults.red)
  };
}

export function computeGpsDerivedCeemd(displacementMeters: number[], timesIso: string[]) {
  const n = displacementMeters.length;
  if (n === 0) return null;

  const wTrend = Math.max(5, Math.floor(n / 10));
  const wMid = Math.max(5, Math.floor(n / 20));
  const trend = movingAverage(displacementMeters, wTrend);
  const residual = displacementMeters.map((v, i) => v - (trend[i] ?? 0));
  const maShort = movingAverage(residual, 3);
  const imf1 = residual.map((v, i) => v - (maShort[i] ?? 0));
  const residual2 = residual.map((v, i) => v - (imf1[i] ?? 0));
  const maMid = movingAverage(residual2, wMid);
  const imf2 = residual2.map((v, i) => v - (maMid[i] ?? 0));
  const imf3 = maMid;
  const imfs = [imf1, imf2, imf3];
  const reconstructed = displacementMeters.map((_, i) => (trend[i] ?? 0) + (imf1[i] ?? 0) + (imf2[i] ?? 0) + (imf3[i] ?? 0));
  const absErrors = displacementMeters.map((v, i) => Math.abs(v - (reconstructed[i] ?? 0)));
  const mae = absErrors.reduce((a, b) => a + b, 0) / Math.max(1, absErrors.length);
  const range = Math.max(1e-9, Math.max(...displacementMeters) - Math.min(...displacementMeters));
  const reconstructionError = mae / range;
  const qualityScore = clamp01(1 - reconstructionError);
  const energies = imfs.map((s) => s.reduce((sum, v) => sum + v * v, 0));
  const totalEnergy = energies.reduce((a, b) => a + b, 0) || 1;
  const energyDistribution = energies.map((e) => e / totalEnergy);
  const sampleIntervalSeconds = estimateSampleIntervalSeconds(timesIso);
  const dominantFrequencies = imfs.map((s) => estimateDominantFrequencyHz(s, sampleIntervalSeconds));

  return {
    imfs,
    residue: trend,
    energyDistribution,
    dominantFrequencies,
    qualityScore,
    reconstructionError,
    orthogonality: clamp01(0.7 + 0.25 * qualityScore)
  };
}

export function computeGpsDerivedPrediction(displacementMm: number[], timesIso: string[], opts: { hasBaseline: boolean; qualityScore: number }) {
  const n = displacementMm.length;
  const last = displacementMm.at(-1) ?? 0;
  const window = Math.min(200, n);
  const startIdx = Math.max(0, n - window);
  const t0 = Date.parse(timesIso[startIdx] ?? "");
  const t1 = Date.parse(timesIso[n - 1] ?? "");
  const dtHours = Number.isFinite(t0) && Number.isFinite(t1) ? Math.max(0.0001, (t1 - t0) / (1000 * 60 * 60)) : 1;
  const y0 = displacementMm[startIdx] ?? 0;
  const y1 = displacementMm[n - 1] ?? 0;
  const slopeMmPerHour = (y1 - y0) / dtHours;
  const baseConfidence = clamp01((opts.hasBaseline ? 0.65 : 0.5) + 0.35 * opts.qualityScore);
  const diffs = displacementMm.slice(1).map((v, idx) => v - (displacementMm[idx] ?? 0));
  const avgDiff = diffs.length > 0 ? mean(diffs) : 0;
  const diffStd = diffs.length > 0 ? standardDeviation(diffs, avgDiff) : 0.5;
  const bandBase = Math.max(0.5, diffStd);
  const shortTerm = Array.from({ length: 24 }, (_v, idx) => Math.max(0, Number((last + slopeMmPerHour * (idx + 1)).toFixed(2))));
  const longTerm = Array.from({ length: 168 }, (_v, idx) => Math.max(0, Number((last + slopeMmPerHour * (idx + 1)).toFixed(2))));
  const shortTermLower = shortTerm.map((value, idx) => Math.max(0, Number((value - bandBase * (1 + idx / 24)).toFixed(2))));
  const shortTermUpper = shortTerm.map((value, idx) => Math.max(0, Number((value + bandBase * (1 + idx / 24)).toFixed(2))));
  const longTermLower = longTerm.map((value, idx) => Math.max(0, Number((value - bandBase * 1.8 * (1 + idx / 168)).toFixed(2))));
  const longTermUpper = longTerm.map((value, idx) => Math.max(0, Number((value + bandBase * 1.8 * (1 + idx / 168)).toFixed(2))));
  return {
    confidence: baseConfidence,
    shortTerm,
    longTerm,
    confidenceIntervals: {
      shortTermLower,
      shortTermUpper,
      longTermLower,
      longTermUpper
    }
  };
}

function parseRelativeTimeRange(raw: string | undefined): { start: Date; end: Date } {
  const end = new Date();
  const fallback = { start: new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000), end };
  const input = (raw ?? "").trim().toLowerCase();
  if (!input) return fallback;
  const m = /^(\d+)\s*(h|d)$/.exec(input);
  if (!m) return fallback;
  const n = Number.parseInt(m[1] ?? "", 10);
  const unit = m[2];
  if (!Number.isFinite(n) || n <= 0) return fallback;
  const ms = unit === "d" ? n * 24 * 60 * 60 * 1000 : n * 60 * 60 * 1000;
  return { start: new Date(end.getTime() - ms), end };
}

export function registerGpsDeformationRoutes(
  app: FastifyInstance,
  config: AppConfig,
  ch: ClickHouseClient,
  pg: PgPool | null
): void {
  const adminCfg: AdminAuthConfig = { adminApiToken: config.adminApiToken, jwtEnabled: Boolean(config.jwtAccessSecret) };

  const buildSeriesData = async (
    deviceId: string,
    start: Date,
    end: Date,
    interval: "1m" | "5m" | "1h" | "1d",
    latKey: string,
    lonKey: string,
    altKey: string | undefined,
    limit: number
  ) => {
    if (!pg) {
      return { error: { code: 503, message: "PostgreSQL 未配置" } };
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
      return { error: { code: 404, message: "未找到基准点（baseline）" } };
    }

    const parsedBaseline = baselineSchema.safeParse(baselineRow.baseline ?? {});
    if (!parsedBaseline.success) {
      return { error: { code: 500, message: "基准点数据不可用", details: parsedBaseline.error.issues } };
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
      (r): r is Row & { lat: number; lon: number } =>
        typeof r.lat === "number" &&
        typeof r.lon === "number" &&
        isValidGpsCoordinatePair(r.lat, r.lon) &&
        haversineMeters(baseline.latitude, baseline.longitude, r.lat, r.lon) <= MAX_DEFORMATION_DISTANCE_METERS
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

    return {
      data: {
        deviceId,
        interval,
        keys: { latKey, lonKey, altKey: altKey ?? null },
        baseline: { ...baseline, method: baselineRow.method, pointsCount: baselineRow.points_count, computedAt: baselineRow.computed_at },
        points
      }
    };
  };

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
    const built = await buildSeriesData(deviceId, start, end, interval, latKey, lonKey, altKey, limit);
    if ("error" in built) {
      fail(reply, built.error.code, built.error.message, traceId, { field: "deviceId", issues: built.error.details });
      return;
    }

    ok(reply, built.data, traceId);
  });

  app.get("/gps/deformations/:deviceId/analysis", async (request, reply) => {
    const traceId = request.traceId;
    if (!(await requirePermission(adminCfg, pg, request, reply, "data:analysis"))) return;

    const parseId = deviceIdSchema.safeParse((request.params as { deviceId?: unknown }).deviceId);
    if (!parseId.success) {
      fail(reply, 400, "参数错误", traceId, { field: "deviceId" });
      return;
    }
    const deviceId = parseId.data;

    const parsed = analysisQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      fail(reply, 400, "参数错误", traceId, { field: "query", issues: parsed.error.issues });
      return;
    }

    const limit = parsed.data.limit;
    const range =
      parsed.data.startTime && parsed.data.endTime
        ? { start: new Date(parsed.data.startTime), end: new Date(parsed.data.endTime) }
        : parseRelativeTimeRange(parsed.data.timeRange);
    if (!(range.start < range.end)) {
      fail(reply, 400, "参数错误", traceId, { field: "timeRange" });
      return;
    }

    const built = await buildSeriesData(deviceId, range.start, range.end, "1h", "gps_latitude", "gps_longitude", "gps_altitude", limit);
    if ("error" in built) {
      fail(reply, built.error.code, built.error.message, traceId, { field: "deviceId", issues: built.error.details });
      return;
    }

    const displacementMeters = built.data.points.map((point) => point.distanceMeters);
    const displacementMm = displacementMeters.map((value) => value * 1000);
    const timesIso = built.data.points.map((point) => point.ts);
    const qualityScore = clamp01(0.75 + Math.min(0.25, built.data.points.length / 200));
    const ceemd = computeGpsDerivedCeemd(displacementMeters, timesIso);
    const prediction = computeGpsDerivedPrediction(displacementMm, timesIso, { hasBaseline: true, qualityScore });
    const trendDiagnostics = computeGpsTrendDiagnostics(displacementMm, timesIso);
    const thresholdForecast = computeGpsPredictionThresholdForecast(
      prediction?.shortTerm ?? [],
      prediction?.longTerm ?? [],
      await loadGpsThresholdConfig(pg),
      timesIso.at(-1) ?? new Date().toISOString()
    );

    ok(
      reply,
      {
        deviceId,
        hasBaseline: true,
        qualityScore,
        trendDiagnostics,
        ceemd,
        prediction: prediction
          ? {
              confidence: prediction.confidence,
              shortTerm: prediction.shortTerm,
              longTerm: prediction.longTerm,
              confidenceIntervals: prediction.confidenceIntervals ?? null,
              thresholdForecast
            }
          : null
      },
      traceId
    );
  });
}
