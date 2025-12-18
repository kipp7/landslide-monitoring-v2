import type { ClickHouseClient } from "@clickhouse/client";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppConfig } from "../config";
import { fail, ok } from "../http";

const deviceIdSchema = z.string().uuid();

const seriesQuerySchema = z.object({
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  sensorKeys: z.string().min(1),
  interval: z.enum(["raw", "1m", "5m", "1h", "1d"]).default("raw"),
  timeField: z.enum(["received", "event"]).default("received")
});

type LatestRow = {
  sensor_key: string;
  latest_ts: string;
  value_f64: number | null;
  value_i64: number | null;
  value_str: string | null;
  value_bool: number | null;
};

type SeriesRow = {
  sensor_key: string;
  ts: string;
  value_num: number | null;
  value_str: string | null;
  value_bool: number | null;
};

function normalizeMetricValue(row: {
  value_f64?: number | null;
  value_i64?: number | null;
  value_str?: string | null;
  value_bool?: number | null;
  value_num?: number | null;
}): unknown {
  if (row.value_num != null) return row.value_num;
  if (row.value_f64 != null) return row.value_f64;
  if (row.value_i64 != null) return row.value_i64;
  if (row.value_bool != null) return row.value_bool === 1;
  if (row.value_str != null) return row.value_str;
  return null;
}

function intervalSeconds(interval: "1m" | "5m" | "1h" | "1d"): number {
  if (interval === "1m") return 60;
  if (interval === "5m") return 300;
  if (interval === "1h") return 3600;
  return 86400;
}

function toClickhouseDateTime64UtcParam(d: Date): string {
  // ClickHouse query params for DateTime64 are strict; RFC3339 `...Z` may fail.
  // Use `YYYY-MM-DD HH:MM:SS.mmm` (UTC).
  return d.toISOString().replace("T", " ").replace("Z", "");
}

export function registerDataRoutes(
  app: FastifyInstance,
  config: AppConfig,
  ch: ClickHouseClient
): void {
  app.get("/data/state/:deviceId", async (request, reply) => {
    const traceId = request.traceId;
    const parseId = deviceIdSchema.safeParse((request.params as { deviceId?: unknown }).deviceId);
    if (!parseId.success) {
      fail(reply, 400, "参数错误", traceId, { field: "deviceId" });
      return;
    }
    const deviceId = parseId.data;

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
      GROUP BY sensor_key
    `;

    const result = await ch.query({
      query: sql,
      query_params: { deviceId },
      format: "JSONEachRow"
    });
    const rows: LatestRow[] = await result.json();

    if (rows.length === 0) {
      fail(reply, 404, "资源不存在", traceId, { deviceId });
      return;
    }

    const metrics: Record<string, unknown> = {};
    let updatedAt: string | null = null;

    for (const row of rows) {
      metrics[row.sensor_key] = normalizeMetricValue(row);
      if (!updatedAt || row.latest_ts > updatedAt) updatedAt = row.latest_ts;
    }

    ok(
      reply,
      { deviceId, updatedAt: updatedAt ?? new Date().toISOString(), state: { metrics, meta: {} } },
      traceId
    );
  });

  app.get("/data/series/:deviceId", async (request, reply) => {
    const traceId = request.traceId;
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

    const { startTime, endTime, sensorKeys, interval, timeField } = parseQuery.data;
    const start = new Date(startTime);
    const end = new Date(endTime);
    if (!(start < end)) {
      fail(reply, 400, "参数错误", traceId, { field: "timeRange" });
      return;
    }

    const maxRangeMs = config.apiMaxSeriesRangeHours * 3600 * 1000;
    if (end.getTime() - start.getTime() > maxRangeMs) {
      fail(reply, 400, "查询范围过大", traceId, { maxHours: config.apiMaxSeriesRangeHours });
      return;
    }

    const keys = sensorKeys
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const uniqueKeys = Array.from(new Set(keys));
    if (uniqueKeys.length === 0) {
      fail(reply, 400, "参数错误", traceId, { field: "sensorKeys" });
      return;
    }

    const timeExpr = timeField === "event" ? "event_ts" : "received_ts";
    const timeFilter =
      timeField === "event"
        ? `event_ts IS NOT NULL AND event_ts >= {start:DateTime64(3, 'UTC')} AND event_ts <= {end:DateTime64(3, 'UTC')}`
        : `received_ts >= {start:DateTime64(3, 'UTC')} AND received_ts <= {end:DateTime64(3, 'UTC')}`;

    let sql: string;

    if (interval === "raw") {
      sql = `
        SELECT
          sensor_key,
          toString(${timeExpr}) AS ts,
          avgOrNull(
            if(isNull(value_f64) AND isNull(value_i64), NULL, coalesce(value_f64, toFloat64(value_i64)))
          ) AS value_num,
          argMax(value_str, ${timeExpr}) AS value_str,
          argMax(value_bool, ${timeExpr}) AS value_bool
        FROM ${config.clickhouseDatabase}.${config.clickhouseTable}
        WHERE device_id = {deviceId:String}
          AND sensor_key IN ({sensorKeys:Array(String)})
          AND ${timeFilter}
        GROUP BY sensor_key, ts
        ORDER BY sensor_key, ts
        LIMIT {limit:UInt32}
      `;
    } else {
      const seconds = intervalSeconds(interval);
      sql = `
        SELECT
          sensor_key,
          toString(toStartOfInterval(${timeExpr}, INTERVAL {bucket:UInt32} SECOND)) AS ts,
          avgOrNull(
            if(isNull(value_f64) AND isNull(value_i64), NULL, coalesce(value_f64, toFloat64(value_i64)))
          ) AS value_num,
          argMax(value_str, ${timeExpr}) AS value_str,
          argMax(value_bool, ${timeExpr}) AS value_bool
        FROM ${config.clickhouseDatabase}.${config.clickhouseTable}
        WHERE device_id = {deviceId:String}
          AND sensor_key IN ({sensorKeys:Array(String)})
          AND ${timeFilter}
        GROUP BY sensor_key, ts
        ORDER BY sensor_key, ts
        LIMIT {limit:UInt32}
      `;

      const result = await ch.query({
        query: sql,
        query_params: {
          deviceId,
          sensorKeys: uniqueKeys,
          start: toClickhouseDateTime64UtcParam(start),
          end: toClickhouseDateTime64UtcParam(end),
          bucket: seconds,
          limit: config.apiMaxPoints
        },
        format: "JSONEachRow"
      });
      const rows: SeriesRow[] = await result.json();
      ok(reply, buildSeriesResponse(deviceId, startTime, endTime, interval, uniqueKeys, rows), traceId);
      return;
    }

    const result = await ch.query({
      query: sql,
      query_params: {
        deviceId,
        sensorKeys: uniqueKeys,
        start: toClickhouseDateTime64UtcParam(start),
        end: toClickhouseDateTime64UtcParam(end),
        limit: config.apiMaxPoints
      },
      format: "JSONEachRow"
    });
    const rows: SeriesRow[] = await result.json();
    ok(reply, buildSeriesResponse(deviceId, startTime, endTime, interval, uniqueKeys, rows), traceId);
  });
}

function buildSeriesResponse(
  deviceId: string,
  startTime: string,
  endTime: string,
  interval: string,
  sensorKeys: string[],
  rows: SeriesRow[]
): {
  deviceId: string;
  startTime: string;
  endTime: string;
  interval: string;
  series: { sensorKey: string; unit?: string; dataType?: string; points: { ts: string; value: unknown }[] }[];
  missing: { sensorKey: string; reason: string }[];
} {
  const seriesMap = new Map<
    string,
    { sensorKey: string; unit?: string; dataType?: string; points: { ts: string; value: unknown }[] }
  >();
  for (const key of sensorKeys) {
    seriesMap.set(key, { sensorKey: key, unit: "", dataType: "", points: [] });
  }

  for (const row of rows) {
    const entry = seriesMap.get(row.sensor_key);
    if (!entry) continue;
    entry.points.push({ ts: row.ts, value: normalizeMetricValue(row) });
  }

  const series = Array.from(seriesMap.values()).filter((s) => s.points.length > 0);
  const missing = Array.from(seriesMap.values())
    .filter((s) => s.points.length === 0)
    .map((s) => ({ sensorKey: s.sensorKey, reason: "no_data_in_range" }));

  return {
    deviceId,
    startTime,
    endTime,
    interval,
    series,
    missing
  };
}
