import type { ClickHouseClient } from "@clickhouse/client";
import {
  collectSensorKeys,
  evalCondition,
  ruleDslSchema,
  type MetricPoint,
  type MetricSeriesGetter,
  type MetricWindow,
  type RuleDslV1
} from "@lsmv2/rules";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppConfig } from "../config";
import { requirePermission, type AdminAuthConfig } from "../authz";
import { fail, ok } from "../http";
import type { PgPool } from "../postgres";
import { queryOne, withPgClient } from "../postgres";

const ruleIdSchema = z.string().uuid();

const replayRequestSchema = z
  .object({
    startTime: z.string().datetime(),
    endTime: z.string().datetime(),
    deviceIds: z.array(z.string().uuid()).optional()
  })
  .strict();

type ChRow = {
  device_id: string;
  sensor_key: string;
  ts_ms: number | string;
  value_num: number | null;
};

function toClickhouseDateTime64Utc(d: Date): string {
  return d.toISOString().replace("T", " ").replace("Z", "");
}

function defaultMetricWindowFromRuleWindow(rule: RuleDslV1): MetricWindow | undefined {
  if (rule.window?.type === "duration") {
    return { type: "duration", minutes: rule.window.minutes, minPoints: rule.window.minPoints };
  }
  if (rule.window?.type === "points") {
    return { type: "points", points: rule.window.points };
  }
  return undefined;
}

type WindowPoint = { tsMs: number; ok: boolean };

function pruneWindow(points: WindowPoint[], nowMs: number, win: RuleDslV1["window"], maxPoints: number): void {
  if (win?.type === "duration") {
    const cutoff = nowMs - win.minutes * 60_000;
    while (points.length > 0) {
      const first = points[0];
      if (!first || first.tsMs >= cutoff) break;
      points.shift();
    }
  } else if (win?.type === "points") {
    while (points.length > win.points) points.shift();
  } else {
    while (points.length > 1) points.shift();
  }
  while (points.length > maxPoints) points.shift();
}

function isWindowReady(points: WindowPoint[], win: RuleDslV1["window"]): boolean {
  if (win?.type === "duration") return points.length >= win.minPoints;
  if (win?.type === "points") return points.length >= win.points;
  return true;
}

export function registerAlertRuleReplayRoutes(
  app: FastifyInstance,
  config: AppConfig,
  ch: ClickHouseClient,
  pg: PgPool | null
): void {
  const adminCfg: AdminAuthConfig = { adminApiToken: config.adminApiToken, jwtEnabled: Boolean(config.jwtAccessSecret) };

  app.post("/alert-rules/:ruleId/versions/:version/replay", async (request, reply) => {
    const traceId = request.traceId;
    if (!(await requirePermission(adminCfg, pg, request, reply, "alert:config"))) return;
    if (!pg) {
      fail(reply, 503, "PostgreSQL 未配置", traceId);
      return;
    }

    const parseId = ruleIdSchema.safeParse((request.params as { ruleId?: unknown }).ruleId);
    if (!parseId.success) {
      fail(reply, 400, "参数错误", traceId, { field: "ruleId" });
      return;
    }
    const ruleId = parseId.data;

    const versionRaw = (request.params as { version?: unknown }).version;
    const parseVersion = z.coerce.number().int().positive().safeParse(versionRaw);
    if (!parseVersion.success) {
      fail(reply, 400, "参数错误", traceId, { field: "version" });
      return;
    }
    const version = parseVersion.data;

    const parseBody = replayRequestSchema.safeParse(request.body);
    if (!parseBody.success) {
      fail(reply, 400, "参数错误", traceId, { field: "body", issues: parseBody.error.issues });
      return;
    }
    const { startTime, endTime, deviceIds } = parseBody.data;
    const start = new Date(startTime);
    const end = new Date(endTime);
    if (!(start < end)) {
      fail(reply, 400, "参数错误", traceId, { field: "timeRange" });
      return;
    }

    const maxRangeMs = config.apiReplayMaxRangeHours * 3600 * 1000;
    if (end.getTime() - start.getTime() > maxRangeMs) {
      fail(reply, 400, "查询范围过大", traceId, { maxHours: config.apiReplayMaxRangeHours });
      return;
    }

    const fetched = await withPgClient(pg, async (client) => {
      const ruleRow = await queryOne<{
        rule_id: string;
        scope: "device" | "station" | "global";
        device_id: string | null;
        station_id: string | null;
      }>(
        client,
        `
          SELECT rule_id, scope, device_id, station_id
          FROM alert_rules
          WHERE rule_id = $1
        `,
        [ruleId]
      );
      if (!ruleRow) return null;

      const verRow = await queryOne<{ dsl_json: unknown }>(
        client,
        `
          SELECT dsl_json
          FROM alert_rule_versions
          WHERE rule_id = $1 AND rule_version = $2
        `,
        [ruleId, version]
      );
      if (!verRow) return null;

      const targetDeviceIds: string[] = [];
      if (deviceIds && deviceIds.length > 0) {
        if (deviceIds.length > config.apiReplayMaxDevices) {
          return { error: { code: "too_many_devices", max: config.apiReplayMaxDevices } };
        }
        targetDeviceIds.push(...Array.from(new Set(deviceIds)));
      } else if (ruleRow.scope === "device") {
        if (!ruleRow.device_id) return { error: { code: "rule_missing_device" } };
        targetDeviceIds.push(ruleRow.device_id);
      } else if (ruleRow.scope === "station") {
        if (!ruleRow.station_id) return { error: { code: "rule_missing_station" } };
        const res = await client.query<{ device_id: string }>(
          "SELECT device_id FROM devices WHERE station_id = $1",
          [ruleRow.station_id]
        );
        targetDeviceIds.push(...res.rows.map((r) => r.device_id));
      } else {
        return { error: { code: "global_requires_device_ids" } };
      }

      return { ruleRow, dslRaw: verRow.dsl_json, deviceIds: targetDeviceIds };
    });

    if (!fetched) {
      fail(reply, 404, "资源不存在", traceId, { ruleId, version });
      return;
    }
    if ("error" in fetched) {
      fail(reply, 400, "参数错误", traceId, fetched.error);
      return;
    }

    const parsedDsl = ruleDslSchema.safeParse((fetched as { dslRaw: unknown }).dslRaw);
    if (!parsedDsl.success) {
      fail(reply, 500, "规则 DSL 无法解析（服务端 BUG）", traceId, { issues: parsedDsl.error.issues });
      return;
    }
    const dsl = parsedDsl.data;

    const targetDeviceIds = (fetched as { deviceIds: string[] }).deviceIds.filter(Boolean);
    if (targetDeviceIds.length === 0) {
      ok(reply, { ruleId, version, startTime, endTime, devices: [], totals: { rows: 0, points: 0, events: 0 } }, traceId);
      return;
    }

    const { sensors, metrics } = collectSensorKeys(dsl.when);
    const sensorKeys = Array.from(new Set([...Array.from(sensors), ...Array.from(metrics)]));
    if (sensorKeys.length === 0) {
      fail(reply, 400, "规则不包含任何 sensorKey", traceId, { ruleId, version });
      return;
    }

    const timeExpr = (dsl.timeField ?? "received") === "event" ? "event_ts" : "received_ts";
    const timeFilter =
      (dsl.timeField ?? "received") === "event"
        ? `event_ts IS NOT NULL AND event_ts >= {start:DateTime64(3, 'UTC')} AND event_ts <= {end:DateTime64(3, 'UTC')}`
        : `received_ts >= {start:DateTime64(3, 'UTC')} AND received_ts <= {end:DateTime64(3, 'UTC')}`;

    const sql = `
      SELECT
        device_id,
        sensor_key,
        toUnixTimestamp64Milli(${timeExpr}) AS ts_ms,
        avgOrNull(
          if(isNull(value_f64) AND isNull(value_i64), NULL, coalesce(value_f64, toFloat64(value_i64)))
        ) AS value_num
      FROM ${config.clickhouseDatabase}.${config.clickhouseTable}
      WHERE device_id IN {deviceIds:Array(String)}
        AND sensor_key IN {sensorKeys:Array(String)}
        AND ${timeFilter}
      GROUP BY device_id, sensor_key, ts_ms
      ORDER BY device_id, ts_ms, sensor_key
      LIMIT {limit:UInt32}
    `;

    const result = await ch.query({
      query: sql,
      query_params: {
        deviceIds: targetDeviceIds,
        sensorKeys,
        start: toClickhouseDateTime64Utc(start),
        end: toClickhouseDateTime64Utc(end),
        limit: config.apiReplayMaxRows
      },
      format: "JSONEachRow"
    });
    const rows: ChRow[] = await result.json();

    const defaultMetricWindow = defaultMetricWindowFromRuleWindow(dsl);
    const perDevice: Record<
      string,
      {
        points: number;
        events: { eventType: string; ts: string; evidence: Record<string, unknown>; explain: string }[];
      }
    > = {};

    let totalPoints = 0;
    let totalEvents = 0;

    const stateByDevice = new Map<
      string,
      { series: Map<string, MetricPoint[]>; window: WindowPoint[]; activeKind: "" | "missing" | "rule"; active: boolean }
    >();

    const getOrCreateState = (deviceId: string) => {
      const existing = stateByDevice.get(deviceId);
      if (existing) return existing;
      const s: {
        series: Map<string, MetricPoint[]>;
        window: WindowPoint[];
        activeKind: "" | "missing" | "rule";
        active: boolean;
      } = { series: new Map<string, MetricPoint[]>(), window: [], activeKind: "", active: false };
      stateByDevice.set(deviceId, s);
      return s;
    };

    const updateSeries = (series: Map<string, MetricPoint[]>, tsMs: number, metricsMap: Record<string, unknown>) => {
      for (const [k, v] of Object.entries(metricsMap)) {
        if (typeof v !== "number") continue;
        const arr = series.get(k) ?? [];
        arr.push({ tsMs, value: v });
        while (arr.length > 1000) arr.shift();
        series.set(k, arr);
      }
    };

    const getSeries = (series: Map<string, MetricPoint[]>, nowMs: number): MetricSeriesGetter => {
      return (sensorKey, window) => {
        const arr = series.get(sensorKey) ?? [];
        const w = window ?? defaultMetricWindow;
        if (!w) return arr.slice(-1);
        if (w.type === "points") return arr.slice(-w.points);
        const cutoff = nowMs - w.minutes * 60_000;
        let i = arr.length;
        while (i > 0) {
          const p = arr[i - 1];
          if (!p || p.tsMs < cutoff) break;
          i -= 1;
        }
        return arr.slice(i);
      };
    };

    const emit = (deviceId: string, eventType: string, tsMs: number, evidence: Record<string, unknown>, explain: string) => {
      const ts = new Date(tsMs).toISOString();
      const entry = (perDevice[deviceId] ??= { points: 0, events: [] });
      entry.events.push({ eventType, ts, evidence, explain });
      totalEvents += 1;
    };

    let currentDevice = "";
    let currentTs = -1;
    let currentMetrics: Record<string, unknown> = {};

    const flushPoint = () => {
      if (!currentDevice || currentTs < 0) return;
      const entry = (perDevice[currentDevice] ??= { points: 0, events: [] });
      entry.points += 1;
      totalPoints += 1;

      const st = getOrCreateState(currentDevice);
      updateSeries(st.series, currentTs, currentMetrics);
      const seriesGetter = getSeries(st.series, currentTs);
      const okNow = evalCondition(dsl.when, currentMetrics, seriesGetter);
      const missing = dsl.missing;
      const missingPolicy = missing?.policy ?? "ignore";
      const missingCfg = missing?.policy === "raise_missing_alert" ? missing : null;

      if (okNow === null && missingPolicy === "ignore") {
        currentMetrics = {};
        return;
      }

      st.window.push({ tsMs: currentTs, ok: okNow === true });
      pruneWindow(st.window, currentTs, dsl.window, 10000);
      const ready = isWindowReady(st.window, dsl.window);

      const missingNow =
        missingCfg !== null &&
        (okNow === null || !ready || missingCfg.sensorKeys.some((k) => typeof currentMetrics[k] !== "number"));

      if (st.active && st.activeKind === "missing" && !missingNow) {
        emit(
          currentDevice,
          "ALERT_RESOLVE",
          currentTs,
          { kind: "missing", ready, points: st.window.length },
          "missing data recovered"
        );
        st.active = false;
        st.activeKind = "";
      }

      if (missingNow) {
        if (!st.active) {
          const missingKeys = missingCfg.sensorKeys.filter((k) => typeof currentMetrics[k] !== "number");
          emit(
            currentDevice,
            "ALERT_TRIGGER",
            currentTs,
            { kind: "missing", missingSensorKeys: missingKeys, ready, points: st.window.length },
            "missing data"
          );
          st.active = true;
          st.activeKind = "missing";
        }
        currentMetrics = {};
        return;
      }

      if (!ready) {
        currentMetrics = {};
        return;
      }

      const triggered = st.window.every((p) => p.ok);
      if (triggered && !st.active) {
        emit(currentDevice, "ALERT_TRIGGER", currentTs, { kind: "rule", points: st.window.length }, "rule triggered");
        st.active = true;
        st.activeKind = "rule";
      } else if (!triggered && st.active && st.activeKind === "rule") {
        emit(currentDevice, "ALERT_RESOLVE", currentTs, { kind: "rule", points: st.window.length }, "rule recovered");
        st.active = false;
        st.activeKind = "";
      }

      currentMetrics = {};
    };

    for (const row of rows) {
      const tsMs = typeof row.ts_ms === "string" ? Number(row.ts_ms) : row.ts_ms;
      if (!Number.isFinite(tsMs)) continue;
      if (row.device_id !== currentDevice || tsMs !== currentTs) {
        flushPoint();
        currentDevice = row.device_id;
        currentTs = tsMs;
      }
      if (row.value_num !== null) currentMetrics[row.sensor_key] = row.value_num;
    }
    flushPoint();

    ok(
      reply,
      {
        ruleId,
        version,
        startTime,
        endTime,
        sensorKeys,
        devices: Object.entries(perDevice).map(([deviceId, v]) => ({
          deviceId,
          points: v.points,
          events: v.events
        })),
        totals: { rows: rows.length, points: totalPoints, events: totalEvents }
      },
      traceId
    );
  });
}
