const assert = require("node:assert/strict");
const test = require("node:test");

const {
  mergeFieldProfileMetrics,
  sanitizeFieldProfileMetrics,
} = require("../dist/field-profile-shadow.js");

test("keeps soil temperature, moisture, conductivity, and all tilt axes", () => {
  const metrics = sanitizeFieldProfileMetrics({
    soil_temperature_c: 21.4,
    soil_moisture_pct: 0,
    electrical_conductivity_us_cm: 0,
    tilt_x_deg: 1.2,
    tilt_y_deg: 2.3,
    tilt_z_deg: 3.4,
    unsupported_metric: 99,
  });

  assert.deepEqual(metrics, {
    soil_temperature_c: 21.4,
    soil_moisture_pct: 0,
    electrical_conductivity_us_cm: 0,
    tilt_x_deg: 1.2,
    tilt_y_deg: 2.3,
    tilt_z_deg: 3.4,
  });
});

test("does not let an invalid GPS sample replace the last valid pair", () => {
  const merged = mergeFieldProfileMetrics(
    { gps_latitude: 24.43803, gps_longitude: 118.09631, gps_altitude: 15.2 },
    { gps_latitude: 0, gps_longitude: 1.6665, gps_altitude: 0, soil_moisture_pct: 0 }
  );

  assert.equal(merged.gps_latitude, 24.43803);
  assert.equal(merged.gps_longitude, 118.09631);
  assert.equal(merged.gps_altitude, 15.2);
  assert.equal(merged.soil_moisture_pct, 0);
});

test("removes a stale invalid GPS pair when there is no valid history", () => {
  const merged = mergeFieldProfileMetrics(
    { gps_latitude: 0, gps_longitude: 1.6665, gps_altitude: 0 },
    { gps_latitude: 0, gps_longitude: 1.6665 }
  );

  assert.equal("gps_latitude" in merged, false);
  assert.equal("gps_longitude" in merged, false);
  assert.equal("gps_altitude" in merged, false);
});
