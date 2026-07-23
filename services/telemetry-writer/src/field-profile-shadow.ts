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

export function isValidGpsCoordinatePair(latitude: FieldProfileMetricValue | undefined, longitude: FieldProfileMetricValue | undefined): boolean {
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
