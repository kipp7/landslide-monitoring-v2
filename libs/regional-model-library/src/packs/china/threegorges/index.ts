import type { RegionalDatasetPack } from "../../../contracts";

export const THREEGORGES_PACK: RegionalDatasetPack = {
  packKey: "china.threegorges",
  displayName: "China Three Gorges Reservoir",
  regionCode: "CN-HB-THREEGORGES",
  scopeType: "station",
  supportedAdapters: [
    "ts_station_multivariate_adapter",
    "event_inventory_adapter",
    "region_profile_builder"
  ],
  defaultWindowSpecs: ["6h", "24h", "72h"],
  requiredSensors: ["rainfall", "displacement", "reservoir_level"],
  phase1Template: {
    fileFamilies: [
      "surface GPS / deformation tables",
      "rainfall tables",
      "reservoir / Yangtze water-level tables",
      "groundwater tables",
      "air-temperature tables",
      "crack deformation tables",
      "inclinometer / borehole tables",
      "basic-feature / annual-report tables"
    ],
    timestampFieldCandidates: ["obs_time"],
    fieldMapCandidates: {
      displacementSurfaceMm: [
        "cumulative_displacement_mm",
        "increment_displacement_mm",
        "axis-style displacement columns"
      ],
      rainfallCurrentMm: ["rainfall_mm", "daily_rainfall_mm", "cum_rainfall_mm"],
      reservoirLevelM: ["water_level_m", "change_rate_m"],
      groundwaterLevelM: ["groundwater_level_m", "groundwater_depth_m"],
      airTemperatureC: ["temperature_c"],
      crackDisplacementMm: ["crack_width_mm", "crack_displacement_mm"]
    },
    requiredJoinFamilies: [
      "rainfall tables",
      "reservoir / Yangtze water-level tables"
    ],
    qualityGateCodes: [
      "monotonic_timestamp_per_point",
      "non_negative_rainfall",
      "explicit_reservoir_gauge_identity",
      "groundwater_level_depth_semantics_explicit",
      "no_duplicate_point_timestamp_rows"
    ]
  }
};

export * from "./phase1-normalized-join";
