export type FieldProfileMetricValue = number | string | boolean | null;

export const FIELD_PROFILE_METRIC_KEYS = new Set<string>([
  "temperature_c",
  "humidity_pct",
  "soil_temperature_c",
  "soil_moisture_pct",
  "electrical_conductivity_us_cm",
  "accel_x_g",
  "accel_y_g",
  "accel_z_g",
  "gyro_x_dps",
  "gyro_y_dps",
  "gyro_z_dps",
  "tilt_x_deg",
  "tilt_y_deg",
  "tilt_z_deg",
  "gps_latitude",
  "gps_longitude",
  "gps_altitude",
  "battery_pct",
  "battery_v",
  "warning_flag",
  "rainfall_mm",
  "rainfall_intensity_mm_h",
  "rtk_latitude_deg",
  "rtk_longitude_deg",
  "rtk_altitude_msl_m",
  "rtk_geoid_separation_m",
  "rtk_ellipsoid_height_m",
  "rtk_gga_quality",
  "rtk_trusted",
  "rtk_satellites_used",
  "rtk_solution_age_ms",
  "rtk_correction_age_ms",
  "rtk_gnss_week",
  "rtk_tow_ms",
  "rtk_hdop",
  "rtk_gst_sigma_lat_mm",
  "rtk_gst_sigma_lon_mm",
  "rtk_gst_sigma_alt_mm",
  "rtk_fixed_streak_s",
  "rtk_fixed_ratio_1m_pct",
  "rtk_fix_drop_count",
  "rtk_reference_station_id",
  "rtcm_injection_mode_code",
  "rtcm_session_epoch",
  "rtcm_lease_remaining_ms",
  "rtcm_queue_pending",
  "rtcm_queue_high_watermark",
  "rtcm_last_fragment_age_ms",
  "rtcm_last_completed_frame_age_ms",
  "rtcm_last_action_age_ms",
  "rtcm_accepted_fragments_total",
  "rtcm_completed_frames_total",
  "rtcm_injected_frames_total",
  "rtcm_rejected_fragments_total",
  "rtcm_crc_errors_total",
  "rtcm_queue_drops_total",
  "rtcm_uart_errors_total",
  "rtcm_error_summary_flags",
  "rtcm_rejected_fragment_error",
  "rtcm_crc_error",
  "rtcm_queue_drop_error",
  "rtcm_uart_error",
  "illumination",
  "rssi_dbm",
  "snr_db",
  "packet_loss_pct",
  "displacement_mm",
  "vibration_g"
]);

function toFiniteNumber(value: FieldProfileMetricValue | undefined): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export function isValidGpsCoordinatePair(
  latitude: FieldProfileMetricValue | undefined,
  longitude: FieldProfileMetricValue | undefined
): boolean {
  const lat = toFiniteNumber(latitude);
  const lng = toFiniteNumber(longitude);
  return lat != null && lng != null && Math.abs(lat) > 0.0001 && Math.abs(lng) > 0.0001 && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

export function sanitizeFieldProfileMetrics(
  input: Record<string, FieldProfileMetricValue>
): Record<string, FieldProfileMetricValue> {
  const output: Record<string, FieldProfileMetricValue> = {};
  for (const [key, value] of Object.entries(input)) {
    if (FIELD_PROFILE_METRIC_KEYS.has(key)) output[key] = value;
  }

  const hasGpsMetric = "gps_latitude" in output || "gps_longitude" in output || "gps_altitude" in output;
  if (hasGpsMetric && !isValidGpsCoordinatePair(output.gps_latitude, output.gps_longitude)) {
    delete output.gps_latitude;
    delete output.gps_longitude;
    delete output.gps_altitude;
  }
  return output;
}

export function mergeFieldProfileMetrics(
  previous: Record<string, FieldProfileMetricValue>,
  incoming: Record<string, FieldProfileMetricValue>
): Record<string, FieldProfileMetricValue> {
  return {
    ...sanitizeFieldProfileMetrics(previous),
    ...sanitizeFieldProfileMetrics(incoming)
  };
}
