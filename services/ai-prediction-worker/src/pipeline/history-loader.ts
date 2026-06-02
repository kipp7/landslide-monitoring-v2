import type { ClickHouseClient } from "@clickhouse/client";
import type { AppConfig } from "../config";
import { toClickhouseDateTime64Utc } from "../clickhouse";
import {
  FEATURE_DEFINITIONS,
  findDefinitionByMetricKey,
  pickNumber,
  REPLAY_RAINFALL_LOOKBACK_HOURS
} from "./feature-definitions";
import type { TelemetryRawV1 } from "./types";

type HistoryRow = {
  sensor_key: string;
  received_ts_text: string;
  value_f64: number | null;
  value_i64: number | null;
  value_str: string | null;
  value_bool: number | null;
};

export type HistoryPoint = {
  ts: string;
  value: number;
};

export type HistoricalFeatureSource = {
  anchorTs: string;
  historyError: string | null;
  historySource: string;
  queryPointCount: number;
  queryWindowHours: number;
  queriedSensorKeys: string[];
  series: Record<string, HistoryPoint[]>;
  sourceMode: "clickhouse+telemetry-v1" | "telemetry-only-v1";
};

function readNumericHistoryValue(row: HistoryRow): number | null {
  if (typeof row.value_f64 === "number" && Number.isFinite(row.value_f64)) return row.value_f64;
  if (typeof row.value_i64 === "number" && Number.isFinite(row.value_i64)) return row.value_i64;
  if (typeof row.value_str === "string" && row.value_str.trim().length > 0) {
    const parsed = Number(row.value_str);
    if (Number.isFinite(parsed)) return parsed;
  }
  if (typeof row.value_bool === "number" && Number.isFinite(row.value_bool)) return row.value_bool;
  return null;
}

function appendHistoryPoint(
  series: Map<string, HistoryPoint[]>,
  canonicalKey: string,
  point: HistoryPoint
): void {
  const current = series.get(canonicalKey) ?? [];
  current.push(point);
  series.set(canonicalKey, current);
}

function finalizeSeries(series: Map<string, HistoryPoint[]>): Record<string, HistoryPoint[]> {
  return Array.from(series.entries()).reduce<Record<string, HistoryPoint[]>>((accumulator, [canonicalKey, points]) => {
    const deduped = points
      .slice()
      .sort((left, right) => left.ts.localeCompare(right.ts))
      .reduce<Map<string, HistoryPoint>>((map, point) => {
        map.set(point.ts, point);
        return map;
      }, new Map<string, HistoryPoint>());
    accumulator[canonicalKey] = Array.from(deduped.values());
    return accumulator;
  }, {});
}

export async function loadHistoricalFeatureSource(input: {
  clickhouse: ClickHouseClient | null;
  config: AppConfig;
  telemetry: TelemetryRawV1;
}): Promise<HistoricalFeatureSource> {
  const anchorTs = input.telemetry.received_ts;
  const sensorKeys = Array.from(
    new Set(FEATURE_DEFINITIONS.flatMap((definition) => definition.sourceMetricKeys))
  );
  const series = new Map<string, HistoryPoint[]>();

  for (const definition of FEATURE_DEFINITIONS) {
    const currentValue = pickNumber(input.telemetry.metrics, definition.sourceMetricKeys);
    if (currentValue !== null) {
      appendHistoryPoint(series, definition.canonicalKey, { ts: anchorTs, value: currentValue });
    }
  }

  const queryWindowHours = Math.max(input.config.featureHistoryLookbackHours, REPLAY_RAINFALL_LOOKBACK_HOURS);
  if (!input.clickhouse) {
    return {
      anchorTs,
      historyError: "clickhouse-not-configured",
      historySource: "telemetry.current",
      queryPointCount: 0,
      queryWindowHours,
      queriedSensorKeys: sensorKeys,
      series: finalizeSeries(series),
      sourceMode: "telemetry-only-v1"
    };
  }

  const startTs = new Date(Date.parse(anchorTs) - queryWindowHours * 3600 * 1000).toISOString();

  try {
    const result = await input.clickhouse.query({
      query: `
        SELECT
          sensor_key,
          toString(received_ts) AS received_ts_text,
          value_f64,
          value_i64,
          value_str,
          value_bool
        FROM ${input.config.clickhouseDatabase}.${input.config.clickhouseTable}
        WHERE device_id = {deviceId:String}
          AND sensor_key IN {sensorKeys:Array(String)}
          AND received_ts >= {startTs:DateTime64(3, 'UTC')}
          AND received_ts <= {endTs:DateTime64(3, 'UTC')}
        ORDER BY sensor_key ASC, received_ts ASC
      `,
      query_params: {
        deviceId: input.telemetry.device_id,
        sensorKeys,
        startTs: toClickhouseDateTime64Utc(startTs),
        endTs: toClickhouseDateTime64Utc(anchorTs)
      },
      format: "JSONEachRow"
    });
    const rows: HistoryRow[] = await result.json();

    for (const row of rows) {
      const definition = findDefinitionByMetricKey(row.sensor_key);
      if (!definition) continue;
      const numericValue = readNumericHistoryValue(row);
      if (numericValue === null) continue;
      appendHistoryPoint(series, definition.canonicalKey, {
        ts: row.received_ts_text.includes("T") ? row.received_ts_text : row.received_ts_text.replace(" ", "T") + "Z",
        value: numericValue
      });
    }

    return {
      anchorTs,
      historyError: null,
      historySource: `${input.config.clickhouseDatabase}.${input.config.clickhouseTable}`,
      queryPointCount: rows.length,
      queryWindowHours,
      queriedSensorKeys: sensorKeys,
      series: finalizeSeries(series),
      sourceMode: "clickhouse+telemetry-v1"
    };
  } catch (error) {
    return {
      anchorTs,
      historyError: error instanceof Error ? error.message : String(error),
      historySource: "telemetry.current",
      queryPointCount: 0,
      queryWindowHours,
      queriedSensorKeys: sensorKeys,
      series: finalizeSeries(series),
      sourceMode: "telemetry-only-v1"
    };
  }
}
