import {
  FEATURE_DEFINITIONS,
  FEATURE_WINDOW_HOURS,
  pickNumber,
  REPLAY_RAINFALL_TIME_ZONE,
  REPLAY_RAINFALL_WINDOW_DAYS,
  windowAggregateFeatureKey
} from "./feature-definitions";
import type { HistoricalFeatureSource } from "./history-loader";
import type { FeatureVector, RegionContext, TelemetryRawV1 } from "./types";

const CHINA_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: REPLAY_RAINFALL_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});

function roundMetric(value: number): number {
  return Number(value.toFixed(6));
}

function toChinaDateKey(ts: string): string {
  const date = new Date(ts);
  const parts = CHINA_DATE_FORMATTER.formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

function parseDateKeyUtc(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00.000Z`);
}

function buildChinaDateRange(anchorTs: string, windowDays: number): string[] {
  const anchorDateKey = toChinaDateKey(anchorTs);
  const anchorDateUtc = parseDateKeyUtc(anchorDateKey);
  const dateKeys: string[] = [];
  for (let offset = windowDays; offset >= 0; offset -= 1) {
    const dateUtc = new Date(anchorDateUtc);
    dateUtc.setUTCDate(anchorDateUtc.getUTCDate() - offset);
    dateKeys.push(dateUtc.toISOString().slice(0, 10));
  }
  return dateKeys;
}

function buildReplayRainfallFeatureValues(input: {
  anchorTs: string;
  rainfallSeries: { ts: string; value: number }[];
}): Record<string, number> {
  if (input.rainfallSeries.length === 0) {
    return {};
  }

  // Replay packs are built from daily CHM_PRE rainfall totals. At runtime we approximate
  // the same feature contract by summing rainfall observations into China-local day buckets.
  const rainfallByDate = input.rainfallSeries.reduce<Map<string, number>>((map, point) => {
    const dateKey = toChinaDateKey(point.ts);
    map.set(dateKey, (map.get(dateKey) ?? 0) + point.value);
    return map;
  }, new Map<string, number>());

  return REPLAY_RAINFALL_WINDOW_DAYS.reduce<Record<string, number>>((accumulator, windowDays) => {
    const suffix = `${String(windowDays)}d`;
    const rainfallValues = buildChinaDateRange(input.anchorTs, windowDays).map(
      (dateKey) => rainfallByDate.get(dateKey) ?? 0
    );

    accumulator[`rainfallAccum${suffix}Mm`] = roundMetric(
      rainfallValues.reduce((sum, value) => sum + value, 0)
    );
    accumulator[`rainfallMean${suffix}Mm`] = roundMetric(
      rainfallValues.reduce((sum, value) => sum + value, 0) / rainfallValues.length
    );
    accumulator[`rainfallMax${suffix}Mm`] = roundMetric(Math.max(...rainfallValues));
    accumulator[`rainfallMin${suffix}Mm`] = roundMetric(Math.min(...rainfallValues));
    accumulator[`rainfallWetDayCount${suffix}`] = rainfallValues.filter((value) => value > 0).length;
    accumulator[`rainfallDayCount${suffix}`] = rainfallValues.length;
    return accumulator;
  }, {});
}

function summarizeWindowPoints(points: { ts: string; value: number }[]): Record<string, unknown> {
  if (points.length === 0) {
    return {
      pointCount: 0,
      earliestTs: null,
      latestTs: null
    };
  }
  return {
    pointCount: points.length,
    earliestTs: points[0]?.ts ?? null,
    latestTs: points[points.length - 1]?.ts ?? null
  };
}

export function buildFeatureVector(input: {
  historicalSource: HistoricalFeatureSource;
  telemetry: TelemetryRawV1;
  regionContext: RegionContext;
  horizonSeconds: number;
}): FeatureVector {
  const baseFeatureCandidates = FEATURE_DEFINITIONS.reduce<{
    backfilledFeatureKeys: string[];
    currentFeatureCandidates: Record<string, number | null>;
  }>(
    (accumulator, definition) => {
      const directValue = pickNumber(input.telemetry.metrics, definition.sourceMetricKeys);
      const latestHistoricalValue = input.historicalSource.series[definition.canonicalKey]?.slice(-1)[0]?.value ?? null;
      const resolvedValue = directValue ?? latestHistoricalValue;
      accumulator.currentFeatureCandidates[definition.canonicalKey] = resolvedValue;
      if (directValue === null && latestHistoricalValue !== null) {
        accumulator.backfilledFeatureKeys.push(definition.canonicalKey);
      }
      return accumulator;
    },
    {
      backfilledFeatureKeys: [],
      currentFeatureCandidates: {}
    }
  );

  const displacementValue = baseFeatureCandidates.currentFeatureCandidates.displacementSurfaceMm ?? null;
  const tiltValue = pickNumber(input.telemetry.metrics, ["tilt_deg", "tilt", "inclination_deg"]);
  const vibrationValue = pickNumber(input.telemetry.metrics, [
    "vibration",
    "vibration_g",
    "accel_g"
  ]);
  const crackDisplacementValue = baseFeatureCandidates.currentFeatureCandidates.crackDisplacementMm ?? null;
  const rainfallValue = baseFeatureCandidates.currentFeatureCandidates.rainfallCurrentMm ?? null;
  const reservoirLevelValue = baseFeatureCandidates.currentFeatureCandidates.reservoirLevelM ?? null;
  const groundwaterLevelValue = baseFeatureCandidates.currentFeatureCandidates.groundwaterLevelM ?? null;
  const airTemperatureValue = baseFeatureCandidates.currentFeatureCandidates.airTemperatureC ?? null;
  const beidouDispXValue = baseFeatureCandidates.currentFeatureCandidates.beidouDispX ?? null;
  const beidouDispYValue = baseFeatureCandidates.currentFeatureCandidates.beidouDispY ?? null;
  const beidouDispZValue = baseFeatureCandidates.currentFeatureCandidates.beidouDispZ ?? null;
  const tunnelFlowValue = baseFeatureCandidates.currentFeatureCandidates.tunnelFlowRate ?? null;

  const displacement = displacementValue ?? 0;
  const tilt = tiltValue ?? 0;
  const vibration = vibrationValue ?? 0;
  const rainfallReplayFeatureValues = buildReplayRainfallFeatureValues({
    anchorTs: input.historicalSource.anchorTs,
    rainfallSeries: input.historicalSource.series.rainfallCurrentMm ?? []
  });

  const featureCandidates: Record<string, number | null> = {
    displacementSurfaceMm: displacementValue,
    crackDisplacementMm: crackDisplacementValue,
    rainfallCurrentMm: rainfallValue,
    reservoirLevelM: reservoirLevelValue,
    groundwaterLevelM: groundwaterLevelValue,
    airTemperatureC: airTemperatureValue,
    beidouDispX: beidouDispXValue,
    beidouDispY: beidouDispYValue,
    beidouDispZ: beidouDispZValue,
    tunnelFlowRate: tunnelFlowValue,
    displacement_abs_mm: displacementValue !== null ? Math.abs(displacement) : null,
    tilt_abs_deg: tiltValue !== null ? Math.abs(tilt) : null,
    vibration_abs_g: vibrationValue !== null ? Math.abs(vibration) : null,
    ...rainfallReplayFeatureValues
  };

  const historicalFeatureCandidates = FEATURE_DEFINITIONS.reduce<{
    coverage: Record<string, Record<string, unknown>>;
    values: Record<string, number | null>;
  }>(
    (accumulator, definition) => {
      const series = input.historicalSource.series[definition.canonicalKey] ?? [];
      const anchorMs = Date.parse(input.historicalSource.anchorTs);

      for (const hours of FEATURE_WINDOW_HOURS) {
        const windowStartMs = anchorMs - hours * 3600 * 1000;
        const points = series.filter((point) => {
          const pointMs = Date.parse(point.ts);
          return Number.isFinite(pointMs) && pointMs >= windowStartMs && pointMs <= anchorMs;
        });
        const windowKey = `${String(hours)}h`;
        accumulator.coverage[windowKey] ??= {};
        accumulator.coverage[windowKey][definition.canonicalKey] = summarizeWindowPoints(points);

        if (points.length === 0) continue;

        for (const aggregate of definition.windowAggregates) {
          let value: number | null = null;
          if (aggregate === "last") value = points[points.length - 1]?.value ?? null;
          if (aggregate === "sum") value = points.reduce((sum, point) => sum + point.value, 0);
          if (aggregate === "mean")
            value = points.reduce((sum, point) => sum + point.value, 0) / Math.max(points.length, 1);
          if (aggregate === "min") value = Math.min(...points.map((point) => point.value));
          if (aggregate === "max") value = Math.max(...points.map((point) => point.value));
          if (aggregate === "delta" && points.length >= 2) {
            const firstPoint = points[0];
            const lastPoint = points[points.length - 1];
            if (firstPoint && lastPoint) {
              value = lastPoint.value - firstPoint.value;
            }
          }
          if (value === null) continue;
          accumulator.values[windowAggregateFeatureKey(definition.canonicalKey, aggregate, hours)] = roundMetric(value);
        }
      }

      return accumulator;
    },
    {
      coverage: {},
      values: {}
    }
  );

  const values = Object.entries({ ...featureCandidates, ...historicalFeatureCandidates.values }).reduce<Record<string, number>>(
    (accumulator, [featureKey, value]) => {
      if (value !== null) {
        accumulator[featureKey] = value;
      }
      return accumulator;
    },
    {}
  );
  const presentFeatureKeys = Object.entries({ ...featureCandidates, ...historicalFeatureCandidates.values })
    .filter(([, value]) => value !== null)
    .map(([featureKey]) => featureKey);

  return {
    horizonSeconds: input.horizonSeconds,
    receivedTs: input.telemetry.received_ts,
    values,
    presentFeatureKeys,
    availableMetrics: Object.keys(input.telemetry.metrics),
    windowSummary: {
      sourceMode: input.historicalSource.sourceMode,
      horizonSeconds: input.horizonSeconds,
      receivedTs: input.telemetry.received_ts,
      anchorTs: input.historicalSource.anchorTs,
      historySource: input.historicalSource.historySource,
      historyError: input.historicalSource.historyError,
      queryWindowHours: input.historicalSource.queryWindowHours,
      queryPointCount: input.historicalSource.queryPointCount,
      queriedSensorKeys: input.historicalSource.queriedSensorKeys,
      requestedWindows: FEATURE_WINDOW_HOURS.map((hours) => `${String(hours)}h`),
      rainfallReplayWindows: REPLAY_RAINFALL_WINDOW_DAYS.map((days) => `${String(days)}d`),
      rainfallReplayTimeZone: REPLAY_RAINFALL_TIME_ZONE,
      backfilledFeatureKeys: baseFeatureCandidates.backfilledFeatureKeys,
      coverage: historicalFeatureCandidates.coverage,
      presentFeatureKeys
    },
    featureSummary: {
      presentFeatureKeys,
      backfilledFeatureKeys: baseFeatureCandidates.backfilledFeatureKeys,
      displacementAbsMm: values.displacement_abs_mm ?? null,
      displacementDelta24h: values.displacementSurfaceMm_delta_24h ?? null,
      tiltAbsDeg: values.tilt_abs_deg ?? null,
      vibrationAbsG: values.vibration_abs_g ?? null,
      rainfallCurrentMm: values.rainfallCurrentMm ?? null,
      rainfallSum24h: values.rainfallCurrentMm_sum_24h ?? null,
      rainfallSum72h: values.rainfallCurrentMm_sum_72h ?? null,
      rainfallAccum1dMm: values.rainfallAccum1dMm ?? null,
      rainfallAccum3dMm: values.rainfallAccum3dMm ?? null,
      rainfallAccum7dMm: values.rainfallAccum7dMm ?? null,
      rainfallWetDayCount1d: values.rainfallWetDayCount1d ?? null,
      rainfallWetDayCount3d: values.rainfallWetDayCount3d ?? null,
      rainfallWetDayCount7d: values.rainfallWetDayCount7d ?? null,
      reservoirLevelM: values.reservoirLevelM ?? null,
      groundwaterLevelM: values.groundwaterLevelM ?? null,
      historyMode: input.historicalSource.sourceMode,
      historyError: input.historicalSource.historyError,
      regionCode: input.regionContext.regionCode,
      stationCode: input.regionContext.stationCode
    }
  };
}
