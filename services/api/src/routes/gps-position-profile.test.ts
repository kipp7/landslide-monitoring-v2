import assert from "node:assert/strict";
import test from "node:test";
import {
  isProfessionalRtkPosition,
  PROFESSIONAL_RTK_POSITION_KEYS
} from "./gps-position-profile";

void test("professional displacement profile uses trusted RTK coordinates", () => {
  assert.deepEqual(PROFESSIONAL_RTK_POSITION_KEYS, {
    latitude: "rtk_latitude_deg",
    longitude: "rtk_longitude_deg",
    altitude: "rtk_altitude_msl_m",
    trusted: "rtk_trusted"
  });
  assert.equal(isProfessionalRtkPosition({
    latKey: PROFESSIONAL_RTK_POSITION_KEYS.latitude,
    lonKey: PROFESSIONAL_RTK_POSITION_KEYS.longitude
  }), true);
  assert.equal(isProfessionalRtkPosition({ latKey: "gps_latitude", lonKey: "gps_longitude" }), false);
  assert.equal(isProfessionalRtkPosition({
    latKey: PROFESSIONAL_RTK_POSITION_KEYS.latitude,
    lonKey: "gps_longitude"
  }), false);
});
