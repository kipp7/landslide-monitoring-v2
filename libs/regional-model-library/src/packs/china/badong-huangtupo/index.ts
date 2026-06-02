import type { RegionalDatasetPack } from "../../../contracts";

export const BADONG_HUANGTUPO_PACK: RegionalDatasetPack = {
  packKey: "china.badong-huangtupo",
  displayName: "China Badong Huangtupo",
  regionCode: "CN-HB-BADONG-HUANGTUPO",
  scopeType: "slope",
  supportedAdapters: [
    "ts_station_multivariate_adapter",
    "event_inventory_adapter",
    "region_profile_builder"
  ],
  defaultWindowSpecs: ["6h", "24h", "72h"],
  requiredSensors: ["displacement"],
  phase1Template: {
    fileFamilies: [
      "3D Beidou displacement tables",
      "cave slip-belt displacement tables",
      "surface displacement 2018-2019 tables",
      "weather rainfall tables",
      "cave crack tables",
      "cave rainfall tables",
      "tunnel flow tables",
      "temperature / water-content tables",
      "groundwater / water-temperature tables",
      "tunnel settlement tables",
      "bank deformation / bank crack tables",
      "soil pressure / rock-soil stress tables"
    ],
    timestampFieldCandidates: ["obs_time"],
    fieldMapCandidates: {
      beidouDispX: ["displacement_x_mm", "dx"],
      beidouDispY: ["displacement_y_mm", "dy"],
      beidouDispZ: ["displacement_z_mm", "dz"],
      beidouDisplacementChangeMm: ["displacement_change_mm"],
      displacementObservedMm: ["displacement_change_mm", "slip_belt_displacement_value"],
      slipBeltDisplacementMm: ["slip_belt_displacement_value", "displacement_mm"],
      surfaceDisplacementMm: ["displacement_mm"],
      rainfallCurrentMm: ["rainfall_current_mm", "rainfall_mm"],
      rainfallCumulativeMm: ["rainfall_cumulative_mm"],
      caveCrackMm: ["cave_crack_mm"],
      tunnelFlowRate: ["flow_rate", "flow_total"],
      soilTemperatureC: ["temperature_c"],
      soilWaterContentPct: ["water_content_pct"],
      groundwaterLevelM: ["groundwater_level_m", "groundwater_depth_m"],
      tunnelSettlementMm: ["settlement_mm"],
      bankDeformationMm: ["deformation_mm"],
      bankCrackWidthMm: ["crack_width_mm"],
      mechanisticPressureKpa: ["pressure_kpa", "stress_kpa"]
    },
    requiredJoinFamilies: [],
    qualityGateCodes: [
      "stable_sensor_position_identity",
      "single_coordinate_frame_per_file",
      "join_weather_rainfall_when_available",
      "non_negative_rainfall",
      "defer_groundwater_and_pore_pressure_from_phase1_required_features",
      "defer_tunnel_settlement_and_flow_from_phase1_required_features",
      "do_not_merge_settlement_into_primary_label"
    ]
  }
};

export * from "./phase1-normalized-join";
