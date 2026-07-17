export type WindowAggregateKind = "delta" | "last" | "max" | "mean" | "min" | "sum";

export type FeatureDefinition = {
  canonicalKey: string;
  sourceMetricKeys: string[];
  windowAggregates: WindowAggregateKind[];
};

export const FEATURE_WINDOW_HOURS = [6, 24, 72] as const;
export const REPLAY_RAINFALL_WINDOW_DAYS = [1, 3, 7] as const;
export const REPLAY_RAINFALL_TIME_ZONE = "Asia/Shanghai";
export const REPLAY_RAINFALL_LOOKBACK_HOURS = (Math.max(...REPLAY_RAINFALL_WINDOW_DAYS) + 1) * 24;

export const FEATURE_DEFINITIONS: FeatureDefinition[] = [
  {
    canonicalKey: "displacementSurfaceMm",
    sourceMetricKeys: [
      "displacementSurfaceMm",
      "displacement_mm",
      "displacement",
      "disp_mm",
      "gps_displacement_mm",
      "cumulative_displacement_mm"
    ],
    windowAggregates: ["last", "delta", "mean", "min", "max"]
  },
  {
    canonicalKey: "crackDisplacementMm",
    sourceMetricKeys: ["crackDisplacementMm", "caveCrackMm", "crack_displacement_mm", "crack_width_mm", "crack_mm"],
    windowAggregates: ["last", "delta", "mean", "min", "max"]
  },
  {
    canonicalKey: "rainfallCurrentMm",
    sourceMetricKeys: ["rainfallCurrentMm", "rainfall_mm", "rain_mm", "precipitation_mm", "precipitation", "rainfall"],
    windowAggregates: ["last", "sum", "mean", "max"]
  },
  {
    canonicalKey: "reservoirLevelM",
    sourceMetricKeys: ["reservoirLevelM", "reservoir_level_m", "water_level_m", "level_m"],
    windowAggregates: ["last", "delta", "mean", "min", "max"]
  },
  {
    canonicalKey: "groundwaterLevelM",
    sourceMetricKeys: ["groundwaterLevelM", "groundwater_level_m", "groundwater_m", "water_table_m"],
    windowAggregates: ["last", "delta", "mean", "min", "max"]
  },
  {
    canonicalKey: "groundwaterDepthM",
    sourceMetricKeys: ["groundwaterDepthM", "groundwater_depth_m", "groundwater_depth", "water_depth_m"],
    windowAggregates: ["last", "delta", "mean", "min", "max"]
  },
  {
    canonicalKey: "groundwaterTemperatureC",
    sourceMetricKeys: ["groundwaterTemperatureC", "groundwater_temperature_c", "groundwater_temp_c"],
    windowAggregates: ["last", "delta", "mean", "min", "max"]
  },
  {
    canonicalKey: "porePressureKpa",
    sourceMetricKeys: ["porePressureKpa", "pore_pressure_kpa", "pore_pressure", "pwp_kpa"],
    windowAggregates: ["last", "delta", "mean", "min", "max"]
  },
  {
    canonicalKey: "airTemperatureC",
    sourceMetricKeys: ["temperature_c", "air_temperature_c", "temp_c"],
    windowAggregates: ["last", "mean", "min", "max"]
  },
  {
    canonicalKey: "beidouDispX",
    sourceMetricKeys: ["beidouDispX", "dx", "beidou_dx", "disp_x", "displacement_x_mm"],
    windowAggregates: ["last", "delta", "mean", "min", "max"]
  },
  {
    canonicalKey: "beidouDispY",
    sourceMetricKeys: ["beidouDispY", "dy", "beidou_dy", "disp_y", "displacement_y_mm"],
    windowAggregates: ["last", "delta", "mean", "min", "max"]
  },
  {
    canonicalKey: "beidouDispZ",
    sourceMetricKeys: ["beidouDispZ", "dz", "beidou_dz", "disp_z", "displacement_z_mm"],
    windowAggregates: ["last", "delta", "mean", "min", "max"]
  },
  {
    canonicalKey: "beidouDisplacementChangeMm",
    sourceMetricKeys: [
      "beidouDisplacementChangeMm",
      "beidou_displacement_change_mm",
      "displacement_change_mm",
      "beidou_change_mm"
    ],
    windowAggregates: ["last", "delta", "mean", "min", "max"]
  },
  {
    canonicalKey: "slipBeltDisplacementMm",
    sourceMetricKeys: [
      "slipBeltDisplacementMm",
      "slip_belt_displacement_mm",
      "slip_belt_displacement_value",
      "slip_displacement_mm"
    ],
    windowAggregates: ["last", "delta", "mean", "min", "max"]
  },
  {
    canonicalKey: "tunnelFlowRate",
    sourceMetricKeys: ["tunnelFlowRate", "flow_rate", "flow_total", "tunnel_flow_rate", "flow_value"],
    windowAggregates: ["last", "mean", "min", "max"]
  },
  {
    canonicalKey: "tunnelSettlementMm",
    sourceMetricKeys: ["tunnelSettlementMm", "tunnel_settlement_mm", "settlement_value", "settlement_mm"],
    windowAggregates: ["last", "delta", "mean", "min", "max"]
  },
  {
    canonicalKey: "slipBeltWaterContent",
    sourceMetricKeys: ["slipBeltWaterContent", "water_content_value", "slip_belt_water_content"],
    windowAggregates: ["last", "delta", "mean", "min", "max"]
  },
  {
    canonicalKey: "caveWaterTemperatureC",
    sourceMetricKeys: ["caveWaterTemperatureC", "water_temperature_value", "cave_water_temperature_c"],
    windowAggregates: ["last", "mean", "min", "max"]
  }
];

const FEATURE_ALIAS_TO_DEFINITION = FEATURE_DEFINITIONS.reduce<Map<string, FeatureDefinition>>((map, definition) => {
  for (const metricKey of definition.sourceMetricKeys) {
    map.set(metricKey, definition);
  }
  return map;
}, new Map<string, FeatureDefinition>());

export function pickNumber(metrics: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = metrics[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim().length > 0) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

export function findDefinitionByMetricKey(metricKey: string): FeatureDefinition | undefined {
  return FEATURE_ALIAS_TO_DEFINITION.get(metricKey);
}

export function windowAggregateFeatureKey(
  canonicalKey: string,
  aggregate: WindowAggregateKind,
  hours: number
): string {
  return `${canonicalKey}_${aggregate}_${String(hours)}h`;
}
