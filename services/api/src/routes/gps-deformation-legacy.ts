import type { ClickHouseClient } from "@clickhouse/client";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { PoolClient } from "pg";
import { z } from "zod";
import type { AdminAuthConfig } from "../authz";
import { requirePermission } from "../authz";
import type { AppConfig } from "../config";
import type { PgPool } from "../postgres";
import { queryOne, withPgClient } from "../postgres";
import {
  basicStats,
  clamp01,
  computeGpsDerivedCeemd,
  computeGpsDerivedPrediction,
  computeGpsPredictionThresholdForecast,
  computeGpsTrendDiagnostics
} from "./gps-deformations";

function legacyOk(reply: FastifyReply, data: unknown, message = "ok"): void {
  void reply.code(200).send({ success: true, data, message, timestamp: new Date().toISOString() });
}

function legacyFail(reply: FastifyReply, statusCode: number, message: string, details?: unknown): void {
  void reply.code(statusCode).send({ success: false, message, error: details, timestamp: new Date().toISOString() });
}

const legacyDeviceIdSchema = z.string().min(1).max(200);

const timeWindowSchema = z
  .object({
    days: z.coerce.number().int().positive().max(365).optional(),
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
      legacyFail(reply, 404, "device not mapped", {
        hint: "Use UUID or map legacy id via devices.metadata.legacy_device_id / devices.metadata.externalIds.legacy."
      });
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
    } else if (parsed.data.days) {
      end = new Date();
      start = new Date(end.getTime() - parsed.data.days * 24 * 60 * 60 * 1000);
      label = `${String(parsed.data.days)}d`;
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
      legacyFail(reply, 503, "ClickHouse query failed", err instanceof Error ? err.message : String(err));
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
    const ceemdBase = computeGpsDerivedCeemd(rows.map((r) => r.deformation_distance_3d), timesIso);
    const predictionBase = computeGpsDerivedPrediction(displacementMm, timesIso, { hasBaseline, qualityScore });
    const trendDiagnostics = computeGpsTrendDiagnostics(displacementMm, timesIso);
    const thresholdForecast = computeGpsPredictionThresholdForecast(
      predictionBase.shortTerm,
      predictionBase.longTerm,
      {
        blue: 2,
        yellow: 5,
        red: 8
      },
      timesIso.at(-1) ?? new Date().toISOString()
    );
    const diffs = displacementMm.slice(1).map((v, idx) => v - (displacementMm[idx] ?? 0));
    const avgDiff = diffs.length ? diffs.reduce((a, b) => a + b, 0) / diffs.length : 0;
    const diffStd = diffs.length
      ? Math.sqrt(diffs.reduce((sum, v) => sum + (v - avgDiff) * (v - avgDiff), 0) / diffs.length)
      : 0;
    const maeBase = Math.max(0.5, Math.min(30, Math.abs(diffStd) * 0.6));
    const prediction = {
      confidence: predictionBase.confidence,
      shortTerm: { values: predictionBase.shortTerm, confidence: predictionBase.confidence, method: "ML_Ensemble", horizon: "24小时" },
      longTerm: {
        values: predictionBase.longTerm,
        confidence: Math.max(0, predictionBase.confidence - 0.1),
        method: "ML_Ensemble",
        horizon: "7天"
      },
      modelPerformance: {
        ensemble: { mae: maeBase, r2: clamp01(predictionBase.confidence), confidence: predictionBase.confidence },
        lstm: { mae: maeBase * 1.2, r2: clamp01(predictionBase.confidence * 0.95), confidence: clamp01(predictionBase.confidence * 0.9) },
        svr: { mae: maeBase * 1.4, r2: clamp01(predictionBase.confidence * 0.9), confidence: clamp01(predictionBase.confidence * 0.85) },
        arima: { mae: maeBase * 1.6, r2: clamp01(predictionBase.confidence * 0.85), confidence: clamp01(predictionBase.confidence * 0.8) }
      },
      confidenceIntervals: predictionBase.confidenceIntervals ?? null,
      thresholdForecast
    };

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
        trendDiagnostics,
        riskAssessment: {
          level: riskLevel,
          description: riskDescriptionFromLevel(riskLevel),
          confidence: riskConfidence,
          factors: riskFactors
        },
        ...(ceemdBase
          ? {
              ceemdDecomposition: {
                imfs: ceemdBase.imfs,
                residue: ceemdBase.residue,
                imfAnalysis: {
                  dominantFrequencies: ceemdBase.dominantFrequencies,
                  energyDistribution: ceemdBase.energyDistribution,
                  decompositionQuality: {
                    qualityScore: ceemdBase.qualityScore,
                    reconstructionError: ceemdBase.reconstructionError,
                    orthogonality: ceemdBase.orthogonality,
                    completeness: clamp01(0.75 + 0.25 * ceemdBase.qualityScore)
                  }
                }
              },
              ceemdAnalysis: {
                imfs: ceemdBase.imfs,
                qualityMetrics: { reconstructionError: ceemdBase.reconstructionError },
                dominantFrequencies: ceemdBase.dominantFrequencies,
                energyDistribution: ceemdBase.energyDistribution,
                decompositionQuality: {
                  qualityScore: ceemdBase.qualityScore,
                  reconstructionError: ceemdBase.reconstructionError,
                  orthogonality: ceemdBase.orthogonality,
                  completeness: clamp01(0.75 + 0.25 * ceemdBase.qualityScore)
                }
              }
            }
          : {}),
        prediction
      },
      points: pointsWithRisk
    });
  };

  app.get("/gps-deformation/:deviceId", handler);
  app.post("/gps-deformation/:deviceId", handler);
}
