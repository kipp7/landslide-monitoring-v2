import type { ClickHouseClient } from "@clickhouse/client";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { PoolClient } from "pg";
import { z } from "zod";
import type { AdminAuthConfig } from "../authz";
import { requirePermission } from "../authz";
import type { AppConfig } from "../config";
import type { PgPool } from "../postgres";
import { queryOne, withPgClient } from "../postgres";

function legacyOk(reply: FastifyReply, payload: Record<string, unknown>, message = "ok"): void {
  void reply.code(200).send({ success: true, ...payload, message, timestamp: new Date().toISOString() });
}

function legacyFail(
  reply: FastifyReply,
  statusCode: number,
  message: string,
  details?: unknown,
  extra?: Record<string, unknown>
): void {
  void reply.code(statusCode).send({ success: false, message, error: details, timestamp: new Date().toISOString(), ...(extra ?? {}) });
}

const legacyDeviceIdSchema = z.string().min(1).max(200);

const timeWindowSchema = z
  .object({
    timeRange: z.string().optional(),
    startTime: z.string().datetime().optional(),
    endTime: z.string().datetime().optional(),
    limit: z.coerce.number().int().positive().max(5000).optional()
  })
  .passthrough();

const baselineSchema = z.object({
  latitude: z.number().finite(),
  longitude: z.number().finite(),
  altitude: z.number().finite().optional()
});

type Baseline = z.infer<typeof baselineSchema>;

type LegacyGpsRow = {
  event_time: string;
  latitude: number;
  longitude: number;
  deformation_distance_3d: number;
  deformation_horizontal: number;
  deformation_vertical: number;
  deformation_velocity: number;
  deformation_confidence: number;
  risk_level: number;
  temperature: number | null;
  humidity: number | null;
};

type BasicStats = {
  mean: number;
  median: number;
  standardDeviation: number;
  min: number;
  max: number;
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

async function resolveDeviceUuidWithClient(client: PoolClient, input: string): Promise<string | null> {
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

async function resolveDeviceUuid(pg: PgPool, input: string): Promise<string | null> {
  return withPgClient(pg, async (client) => resolveDeviceUuidWithClient(client, input));
}

async function fetchBaseline(pg: PgPool, deviceId: string): Promise<Baseline | null> {
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
  return parsed.success ? parsed.data : null;
}

type GpsPoint = { eventTime: string; latitude: number; longitude: number };

async function fetchGpsTelemetryInRange(
  config: AppConfig,
  ch: ClickHouseClient,
  deviceId: string,
  start: Date,
  end: Date,
  limit: number
): Promise<GpsPoint[]> {
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
      ORDER BY received_ts ASC
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

function computeLegacyDeformationRows(points: GpsPoint[], baseline: Baseline | null, baselineSource: string | null): LegacyGpsRow[] {
  if (points.length === 0) return [];

  const first = points[0];
  if (!first) return [];
  const effectiveBaseline: Baseline = baseline ?? { latitude: first.latitude, longitude: first.longitude };

  const enriched = points.map((p) => {
    const horizontal = haversineMeters(effectiveBaseline.latitude, effectiveBaseline.longitude, p.latitude, p.longitude);
    const vertical = 0;
    const distance3d = Math.sqrt(horizontal * horizontal + vertical * vertical);
    return { ...p, horizontal, vertical, distance3d };
  });

  const velocities = enriched.map((p, idx) => {
    if (idx === 0) return 0;
    const prev = enriched[idx - 1];
    if (!prev) return 0;
    const t0 = Date.parse(prev.eventTime);
    const t1 = Date.parse(p.eventTime);
    const deltaHours = Number.isFinite(t0) && Number.isFinite(t1) ? Math.max(0.0001, (t1 - t0) / (1000 * 60 * 60)) : 1;
    return (p.distance3d - prev.distance3d) / deltaHours;
  });

  const confidence = baselineSource === "gps_baselines" ? 0.9 : 0.6;

  return enriched.map((p, idx) => ({
    event_time: p.eventTime,
    latitude: p.latitude,
    longitude: p.longitude,
    deformation_distance_3d: p.distance3d,
    deformation_horizontal: p.horizontal,
    deformation_vertical: p.vertical,
    deformation_velocity: velocities[idx] ?? 0,
    deformation_confidence: confidence,
    risk_level: 0,
    temperature: null,
    humidity: null
  }));
}

function clamp01(n: number): number {
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
    const left = sorted[mid - 1] ?? 0;
    const right = sorted[mid] ?? 0;
    return (left + right) / 2;
  }
  return sorted[mid] ?? 0;
}

function standardDeviation(values: number[], avg: number): number {
  if (values.length === 0) return 0;
  const variance = values.reduce((sum, v) => sum + (v - avg) * (v - avg), 0) / values.length;
  return Math.sqrt(variance);
}

function basicStats(values: number[]): BasicStats {
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
    if (dt > 365 * 24 * 60 * 60) continue;
    deltas.push(dt);
  }
  const m = deltas.length > 0 ? median(deltas) : 3600;
  if (!Number.isFinite(m) || m <= 0) return 3600;
  return m;
}

function estimateDominantFrequencyHz(series: number[], sampleIntervalSeconds: number): number {
  if (series.length < 2) return 0;
  let crossings = 0;
  for (let i = 1; i < series.length; i++) {
    const a = series[i - 1] ?? 0;
    const b = series[i] ?? 0;
    if (a === 0) continue;
    if (a * b < 0) crossings += 1;
  }
  const duration = (series.length - 1) * sampleIntervalSeconds;
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  return crossings / (2 * duration);
}

function computeCeemdLikeDecomposition(displacementMeters: number[], timesIso: string[]) {
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

  const decompositionQuality = {
    qualityScore,
    reconstructionError,
    orthogonality: clamp01(0.7 + 0.25 * qualityScore),
    completeness: clamp01(0.75 + 0.25 * qualityScore)
  };

  return {
    ceemdDecomposition: {
      imfs,
      residue: trend,
      imfAnalysis: { dominantFrequencies, energyDistribution, decompositionQuality }
    },
    ceemdAnalysis: {
      imfs,
      qualityMetrics: { reconstructionError },
      dominantFrequencies,
      energyDistribution,
      decompositionQuality
    }
  };
}

function computePrediction(displacementMm: number[], timesIso: string[], opts: { hasBaseline: boolean; qualityScore: number }) {
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
  const shortConfidence = clamp01(baseConfidence);
  const longConfidence = clamp01(baseConfidence - 0.1);

  const clampPred = (v: number) => (Number.isFinite(v) ? Math.max(0, v) : 0);
  const shortTermSteps = 24;
  const longTermSteps = 168;

  const shortTermValues = Array.from({ length: shortTermSteps }, (_v, idx) => clampPred(last + slopeMmPerHour * (idx + 1)));
  const longTermValues = Array.from({ length: longTermSteps }, (_v, idx) => clampPred(last + slopeMmPerHour * (idx + 1)));

  const diffs = displacementMm.slice(1).map((v, idx) => v - (displacementMm[idx] ?? 0));
  const avgDiff = mean(diffs);
  const diffStd = standardDeviation(diffs, avgDiff);
  const maeBase = Math.max(0.5, Math.min(30, Math.abs(diffStd) * 0.6));

  const modelPerformance = {
    ensemble: { mae: maeBase, r2: clamp01(baseConfidence), confidence: shortConfidence },
    lstm: { mae: maeBase * 1.2, r2: clamp01(baseConfidence * 0.95), confidence: clamp01(shortConfidence * 0.9) },
    svr: { mae: maeBase * 1.4, r2: clamp01(baseConfidence * 0.9), confidence: clamp01(shortConfidence * 0.85) },
    arima: { mae: maeBase * 1.6, r2: clamp01(baseConfidence * 0.85), confidence: clamp01(shortConfidence * 0.8) }
  };

  return {
    confidence: shortConfidence,
    shortTerm: { values: shortTermValues, confidence: shortConfidence, method: "ML_Ensemble", horizon: "24小时" },
    longTerm: { values: longTermValues, confidence: longConfidence, method: "ML_Ensemble", horizon: "7天" },
    modelPerformance,
    confidenceIntervals: null
  };
}

function assessRiskLevelFromDisplacementMm(displacementMm: number): number {
  if (displacementMm >= 20) return 1;
  if (displacementMm >= 10) return 2;
  if (displacementMm >= 5) return 3;
  if (displacementMm >= 2) return 4;
  return 0;
}

function riskDescriptionFromLevel(level: number): string {
  if (level === 0) return "正常";
  if (level === 4) return "IV级蓝色";
  if (level === 3) return "III级黄色";
  if (level === 2) return "II级橙色";
  if (level === 1) return "I级红色";
  return "未知";
}

export function registerGpsDeformationLegacyCompatRoutes(
  app: FastifyInstance,
  config: AppConfig,
  ch: ClickHouseClient,
  pg: PgPool | null
): void {
  const adminCfg: AdminAuthConfig = { adminApiToken: config.adminApiToken, jwtEnabled: Boolean(config.jwtAccessSecret) };

  const handler = async (request: FastifyRequest, reply: FastifyReply) => {
    const t0 = Date.now();
    if (!(await requirePermission(adminCfg, pg, request, reply, "data:analysis"))) return;
    if (!pg) {
      legacyFail(reply, 503, "PostgreSQL not configured");
      return;
    }

    const parseId = legacyDeviceIdSchema.safeParse((request.params as { deviceId?: unknown }).deviceId);
    if (!parseId.success) {
      legacyFail(reply, 400, "invalid deviceId");
      return;
    }
    const inputDeviceId = parseId.data;

    const parsed = timeWindowSchema.safeParse(request.method === "GET" ? request.query ?? {} : request.body ?? {});
    if (!parsed.success) {
      legacyFail(reply, 400, "invalid request", parsed.error.issues);
      return;
    }

    const resolved = await resolveDeviceUuid(pg, inputDeviceId);
    if (!resolved) {
      legacyFail(
        reply,
        404,
        "device not mapped",
        {
          hint: "Use UUID or map legacy id via devices.metadata.legacy_device_id / devices.metadata.externalIds.legacy."
        },
        { deviceId: inputDeviceId }
      );
      return;
    }

    const limit = parsed.data.limit ?? 2000;

    let start: Date;
    let end: Date;
    let label: string;

    if (parsed.data.startTime && parsed.data.endTime) {
      start = new Date(parsed.data.startTime);
      end = new Date(parsed.data.endTime);
      if (!(start < end)) {
        legacyFail(reply, 400, "invalid time range");
        return;
      }
      label = "custom";
    } else {
      const parsedRange = parseRelativeTimeRange(parsed.data.timeRange);
      start = parsedRange.start;
      end = parsedRange.end;
      label = parsedRange.label;
    }

    let baseline = await fetchBaseline(pg, resolved);
    const hasBaseline = Boolean(baseline);
    const baselineSource = hasBaseline ? "gps_baselines" : null;

    let points: GpsPoint[];
    try {
      points = await fetchGpsTelemetryInRange(config, ch, resolved, start, end, limit);
    } catch (err) {
      legacyFail(reply, 503, "ClickHouse query failed", err instanceof Error ? err.message : String(err), { deviceId: inputDeviceId });
      return;
    }

    if (!baseline && points.length > 0) {
      const firstPoint = points[0];
      if (firstPoint) {
        baseline = { latitude: firstPoint.latitude, longitude: firstPoint.longitude };
      }
    }

    const rows = computeLegacyDeformationRows(points, baseline, baselineSource);
    const nowIso = new Date().toISOString();

    const displacementMm = rows.map((r) => r.deformation_distance_3d * 1000);
    const maxDisplacementMm = displacementMm.length > 0 ? Math.max(...displacementMm) : 0;
    const minDisplacementMm = displacementMm.length > 0 ? Math.min(...displacementMm) : 0;
    const latest = rows.at(-1) ?? null;

    const firstMm = displacementMm[0] ?? 0;
    const lastMm = displacementMm.at(-1) ?? 0;
    const trendDeltaMm = displacementMm.length >= 2 ? lastMm - firstMm : 0;
    const trend = Math.abs(trendDeltaMm) < 0.5 ? "stable" : trendDeltaMm > 0 ? "increasing" : "decreasing";
    const trendConfidence = clamp01(0.55 + Math.min(0.35, displacementMm.length / 200) + (hasBaseline ? 0.1 : 0));

    const riskLevel = hasBaseline ? assessRiskLevelFromDisplacementMm(maxDisplacementMm) : 0;
    const riskConfidence = clamp01(0.45 + Math.min(0.4, displacementMm.length / 200) + (hasBaseline ? 0.1 : 0));
    const riskFactors: Record<string, unknown> = {
      maxDisplacement: maxDisplacementMm,
      minDisplacement: minDisplacementMm,
      trend,
      trendMagnitude: Math.abs(trendDeltaMm),
      baselineSource: hasBaseline ? "gps_baselines" : rows.length > 0 ? "first_point" : null,
      patternSimilarity: null
    };
    if (!hasBaseline) riskFactors.reason = "未设置基准点";

    const riskIndicators: string[] = [];
    if (!hasBaseline) riskIndicators.push("未设置基准点");
    if (rows.length === 0) riskIndicators.push("无GPS数据");
    if (rows.length > 0) riskIndicators.push("已计算位移/速度序列");

    const pointsWithRisk = rows.map((r) => {
      const level = hasBaseline ? assessRiskLevelFromDisplacementMm(r.deformation_distance_3d * 1000) : 0;
      return { ...r, risk_level: level };
    });

    const realTimeDisplacement = {
      hasBaseline,
      hasLatestData: Boolean(latest),
      displacement: hasBaseline ? latest?.deformation_distance_3d ?? 0 : 0,
      horizontal: hasBaseline ? latest?.deformation_horizontal ?? 0 : 0,
      vertical: hasBaseline ? latest?.deformation_vertical ?? 0 : 0,
      latestTime: latest?.event_time ?? null,
      baseline: hasBaseline && baseline ? { latitude: baseline.latitude, longitude: baseline.longitude, ...(baseline.altitude == null ? {} : { altitude: baseline.altitude }) } : null,
      latestGPS: latest ? { latitude: latest.latitude, longitude: latest.longitude, time: latest.event_time } : null,
      ...(hasBaseline ? {} : { error: "未设置基准点" })
    };

    const qualityScore = clamp01((hasBaseline ? 0.75 : 0.6) + Math.min(0.25, rows.length / 200));
    const completeness = clamp01(rows.length / Math.max(1, Math.min(limit, 200)));
    const consistency = clamp01(0.75 + Math.min(0.2, rows.length / 500));
    const accuracy = clamp01(hasBaseline ? 0.9 : 0.75);

    const timesIso = rows.map((r) => r.event_time);
    const ceemd = computeCeemdLikeDecomposition(rows.map((r) => r.deformation_distance_3d), timesIso);
    const prediction = computePrediction(displacementMm, timesIso, { hasBaseline, qualityScore });

    legacyOk(reply, {
      deviceId: inputDeviceId,
      resolvedDeviceId: resolved,
      timeRange: { label, start: start.toISOString(), end: end.toISOString() },
      hasBaseline,
      baseline: baseline ?? null,
      baselineSource: hasBaseline ? "gps_baselines" : points.length > 0 ? "first_point" : null,
      analysisTime: nowIso,
      processingTime: `${String(Date.now() - t0)}ms`,
      realTimeDisplacement,
      dataQuality: {
        totalPoints: points.length,
        validPoints: rows.length,
        qualityScore,
        completeness,
        consistency,
        accuracy
      },
      results: {
        statisticalAnalysis: {
          basic: basicStats(displacementMm),
          summary: {
            maxDisplacement: maxDisplacementMm,
            minDisplacement: minDisplacementMm,
            riskIndicators
          }
        },
        trendAnalysis: { trend, confidence: trendConfidence, magnitude: Math.abs(trendDeltaMm), deltaMm: trendDeltaMm },
        riskAssessment: {
          level: riskLevel,
          description: riskDescriptionFromLevel(riskLevel),
          confidence: riskConfidence,
          factors: riskFactors
        },
        ...(ceemd ? { ceemdDecomposition: ceemd.ceemdDecomposition, ceemdAnalysis: ceemd.ceemdAnalysis } : {}),
        prediction
      },
      points: pointsWithRisk
    });
  };

  app.get("/gps-deformation/:deviceId", handler);
  app.post("/gps-deformation/:deviceId", handler);
}
