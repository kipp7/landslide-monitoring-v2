const assert = require("node:assert/strict");
const test = require("node:test");

const {
  mergeFieldProfileMetrics,
  sanitizeFieldProfileMetrics,
} = require("../dist/field-profile-shadow.js");

test("keeps soil, independent tilt, and professional RTK metrics", () => {
  const metrics = sanitizeFieldProfileMetrics({
    soil_temperature_c: 21.4,
    soil_moisture_pct: 0,
    electrical_conductivity_us_cm: 0,
    tilt_x_deg: 1.2,
    tilt_y_deg: 2.3,
    tilt_z_deg: 3.4,
    rtk_latitude_deg: 24.612345678,
    rtk_longitude_deg: 118.123456789,
    rtk_trusted: true,
    rtk_correction_age_ms: 2000,
    unsupported_metric: 99,
  });

  assert.deepEqual(metrics, {
    soil_temperature_c: 21.4,
    soil_moisture_pct: 0,
    electrical_conductivity_us_cm: 0,
    tilt_x_deg: 1.2,
    tilt_y_deg: 2.3,
    tilt_z_deg: 3.4,
    rtk_latitude_deg: 24.612345678,
    rtk_longitude_deg: 118.123456789,
    rtk_trusted: true,
    rtk_correction_age_ms: 2000,
  });
});

test("preserves the complete compact v4 field contract", () => {
  const metrics = {
    battery_v: 11.52,
    battery_pct: 54,
    soil_temperature_c: 23.45,
    soil_moisture_pct: 48.32,
    electrical_conductivity_us_cm: 678,
    tilt_x_deg: 1.23,
    tilt_y_deg: -0.45,
    tilt_z_deg: 0.06,
    warning_flag: false,
    rtk_latitude_deg: 24.612345678,
    rtk_longitude_deg: 118.123456789,
    rtk_altitude_msl_m: 12.345,
    rtk_geoid_separation_m: -2.345,
    rtk_ellipsoid_height_m: 10,
    rtk_gga_quality: 4,
    rtk_trusted: true,
    rtk_satellites_used: 31,
    rtk_solution_age_ms: 127,
    rtk_correction_age_ms: 2000,
    rtk_gnss_week: 2430,
    rtk_tow_ms: 123456789,
    rtk_hdop: 0.52,
    rtk_gst_sigma_lat_mm: 6,
    rtk_gst_sigma_lon_mm: 7,
    rtk_gst_sigma_alt_mm: 15,
    rtk_fixed_streak_s: 71,
    rtk_fixed_ratio_1m_pct: 98.3,
    rtk_fix_drop_count: 2,
    rtk_reference_station_id: 82,
    rtcm_injection_mode_code: 2,
    rtcm_session_epoch: 0x12345678,
    rtcm_lease_remaining_ms: 59123,
    rtcm_queue_pending: 1,
    rtcm_queue_high_watermark: 4,
    rtcm_last_fragment_age_ms: 123,
    rtcm_last_completed_frame_age_ms: 234,
    rtcm_last_action_age_ms: 345,
    rtcm_accepted_fragments_total: 1234,
    rtcm_completed_frames_total: 456,
    rtcm_injected_frames_total: 450,
    rtcm_rejected_fragments_total: 2,
    rtcm_crc_errors_total: 0,
    rtcm_queue_drops_total: 0,
    rtcm_uart_errors_total: 0,
  };

  assert.deepEqual(sanitizeFieldProfileMetrics(metrics), metrics);
});

test("does not let an invalid legacy GPS sample replace the last valid pair", () => {
  const merged = mergeFieldProfileMetrics(
    { gps_latitude: 24.43803, gps_longitude: 118.09631, gps_altitude: 15.2 },
    { gps_latitude: 0, gps_longitude: 1.6665, gps_altitude: 0, soil_moisture_pct: 0 }
  );

  assert.equal(merged.gps_latitude, 24.43803);
  assert.equal(merged.gps_longitude, 118.09631);
  assert.equal(merged.gps_altitude, 15.2);
  assert.equal(merged.soil_moisture_pct, 0);
});

test("removes a stale invalid legacy GPS pair when there is no valid history", () => {
  const merged = mergeFieldProfileMetrics(
    { gps_latitude: 0, gps_longitude: 1.6665, gps_altitude: 0 },
    { gps_latitude: 0, gps_longitude: 1.6665 }
  );

  assert.equal("gps_latitude" in merged, false);
  assert.equal("gps_longitude" in merged, false);
  assert.equal("gps_altitude" in merged, false);
});
