const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildCompactBroadcastPollCommand,
  compactCommandTag,
  decodeCompactTelemetry,
  decodeCompactTelemetryV1
} = require("../dist/compact-telemetry.js");
const { createCobsCrcFieldLinkAssembler, encodeFieldLinkFrame } = require("../dist/field-link.js");

test("compact broadcast command uses the RK2206 FNV-1a tag", () => {
  const poll = buildCompactBroadcastPollCommand("12345678");
  assert.equal(poll.command, "P112345678");
  assert.equal(poll.commandTag, 0x9664c12a);
  assert.equal(compactCommandTag(poll.command), 0x9664c12a);
});

test("compact telemetry survives binary COBS/CRC framing and preserves every field", () => {
  const payload = Buffer.alloc(46);
  payload.write("LS", 0, "ascii");
  payload.writeUInt8(1, 2);
  payload.writeUInt8(2, 3);
  payload.writeUInt8(1, 4);
  payload.writeUInt8(3, 5);
  payload.writeUInt16BE(0x003f, 6);
  payload.writeUInt32BE(1234, 8);
  payload.writeUInt32BE(5678, 12);
  payload.writeUInt32BE(0x9664c12a, 16);
  payload.writeInt16BE(2534, 20);
  payload.writeUInt16BE(4567, 22);
  payload.writeInt16BE(2468, 24);
  payload.writeUInt16BE(3210, 26);
  payload.writeUInt16BE(789, 28);
  payload.writeInt16BE(-123, 30);
  payload.writeInt16BE(456, 32);
  payload.writeInt16BE(-7, 34);
  payload.writeInt32BE(24612345, 36);
  payload.writeInt32BE(118123456, 40);
  payload.writeUInt16BE(125, 44);

  const frame = encodeFieldLinkFrame({ frameType: "telemetry", sequence: 99, payloadBytes: payload });
  const batch = createCobsCrcFieldLinkAssembler().push(frame);
  assert.deepEqual(batch.errors, []);
  assert.equal(batch.payloads.length, 1);
  assert.equal(batch.payloads[0].sequence, 99);

  const decoded = decodeCompactTelemetryV1(batch.payloads[0].rawPayloadBytes);
  assert.equal(decoded.device_id, "00000000-0000-0000-0000-000000000002");
  assert.equal(decoded.seq, 1234);
  assert.equal(decoded.meta.last_command_tag, 0x9664c12a);
  assert.equal(decoded.meta.upload_trigger, "scheduler_poll");
  assert.deepEqual(decoded.metrics, {
    temperature_c: 25.34,
    humidity_pct: 45.67,
    soil_temperature_c: 24.68,
    soil_moisture_pct: 32.1,
    electrical_conductivity_us_cm: 789,
    tilt_x_deg: -1.23,
    tilt_y_deg: 4.56,
    tilt_z_deg: -0.07,
    warning_flag: true,
    gps_latitude: 24.612345,
    gps_longitude: 118.123456,
    rain_total_mm: 12.5
  });
});

test("compact telemetry v2 carries real battery data and labels simulated RS485 values", () => {
  const payload = Buffer.alloc(46);
  payload.write("LS", 0, "ascii");
  payload.writeUInt8(2, 2);
  payload.writeUInt8(3, 3);
  payload.writeUInt8(0x03, 4);
  payload.writeUInt8(3, 5);
  payload.writeUInt16BE(0x009e, 6);
  payload.writeUInt32BE(77, 8);
  payload.writeUInt32BE(900, 12);
  payload.writeUInt32BE(0x9664c12a, 16);
  payload.writeUInt16BE(12123, 20);
  payload.writeUInt8(83, 22);
  payload.writeUInt8(2, 23);
  payload.writeInt16BE(2310, 24);
  payload.writeUInt16BE(4875, 26);
  payload.writeUInt16BE(645, 28);
  payload.writeInt16BE(134, 30);
  payload.writeInt16BE(-27, 32);
  payload.writeInt16BE(5, 34);
  payload.writeInt32BE(24612345, 36);
  payload.writeInt32BE(118123456, 40);

  const decoded = decodeCompactTelemetry(payload);
  assert.equal(decoded.device_id, "00000000-0000-0000-0000-000000000003");
  assert.equal(decoded.seq, 77);
  assert.deepEqual(decoded.metrics, {
    battery_v: 12.123,
    battery_pct: 83,
    soil_temperature_c: 23.1,
    soil_moisture_pct: 48.75,
    electrical_conductivity_us_cm: 645,
    tilt_x_deg: 1.34,
    tilt_y_deg: -0.27,
    tilt_z_deg: 0.05,
    warning_flag: true,
    gps_latitude: 24.612345,
    gps_longitude: 118.123456
  });
  assert.equal(decoded.meta.compact_payload_version, 2);
  assert.equal(decoded.meta.field_sensor_source, "simulated");
  assert.equal(decoded.meta.battery_estimate_quality, "field-calibrated");
  assert.equal(decoded.meta.battery_estimate_quality_code, 2);
  assert.equal(decoded.meta.legacy_valid_flags.battery_ok, 1);
  assert.equal(decoded.meta.legacy_valid_flags.temp_ok, 0);
});

test("compact telemetry v3 decodes the RK2206 golden vector without losing RTK precision", () => {
  const payload = Buffer.from(
    "4c53030303031fff0000004d000003849664c12a2f5b5302092e12eb02a1008cffe0" +
      "000300000005bb02974e0000001b80b4e91500003039fffff6d7000007d00000007f" +
      "075bcd15097e04017e6f1f003400060007000f004703d700020052",
    "hex"
  );
  assert.equal(payload.length, 95);

  const frame = encodeFieldLinkFrame({ frameType: "telemetry", sequence: 9, payloadBytes: payload });
  assert.equal(frame.length, 113);
  const batch = createCobsCrcFieldLinkAssembler().push(frame);
  assert.deepEqual(batch.errors, []);
  assert.equal(batch.payloads.length, 1);

  const decoded = decodeCompactTelemetry(batch.payloads[0].rawPayloadBytes);
  assert.equal(decoded.device_id, "00000000-0000-0000-0000-000000000003");
  assert.equal(decoded.seq, 77);
  assert.deepEqual(decoded.metrics, {
    battery_v: 12.123,
    battery_pct: 83,
    soil_temperature_c: 23.5,
    soil_moisture_pct: 48.43,
    electrical_conductivity_us_cm: 673,
    tilt_x_deg: 1.4,
    tilt_y_deg: -0.32,
    tilt_z_deg: 0.03,
    warning_flag: true,
    rtk_gga_quality: 4,
    rtk_trusted: true,
    rtk_satellites_used: 31,
    rtk_solution_age_ms: 127,
    rtk_latitude_deg: 24.612345678,
    rtk_longitude_deg: 118.123456789,
    rtk_altitude_msl_m: 12.345,
    rtk_geoid_separation_m: -2.345,
    rtk_ellipsoid_height_m: 10,
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
    rtk_reference_station_id: 82
  });
  assert.equal(decoded.meta.compact_payload_version, 3);
  assert.equal(decoded.meta.rtk_coordinate_frame, "CGCS2000");
  assert.equal(decoded.meta.rtk_fix_type, "rtk_fixed");
  assert.equal(decoded.meta.rtk_displacement_eligible, true);
  assert.equal(decoded.metrics.gps_latitude, undefined);
  assert.equal(decoded.metrics.accel_x_g, undefined);
  assert.equal(decoded.metrics.temperature_c, undefined);
});

test("compact telemetry v4 preserves all sensors and reports auditable RTCM runtime evidence", () => {
  const payload = Buffer.from(
    "4c53040303031fff0000004d000003849664c12a2f5b5302092e12eb02a1008cffe0" +
      "000300000005bb02974e0000001b80b4e91500003039fffff6d7000007d00000007f" +
      "075bcd15097e04017e6f1f003400060007000f004703d700020052023f0104123456" +
      "780000e6f30000007b000000ea00000159000004d2000001c8000001c20002000100" +
      "0c0006",
    "hex"
  );
  assert.equal(payload.length, 139);
  const frame = encodeFieldLinkFrame({ frameType: "telemetry", sequence: 10, payloadBytes: payload });
  assert.equal(frame.length, 157);

  const decoded = decodeCompactTelemetry(payload);
  assert.equal(decoded.meta.compact_payload_version, 4);
  assert.equal(decoded.meta.rtcm_injection_mode, "live");
  assert.equal(decoded.meta.rtcm_state_flags, 0x3f);
  assert.equal(decoded.metrics.battery_v, 12.123);
  assert.equal(decoded.metrics.soil_moisture_pct, 48.43);
  assert.equal(decoded.metrics.tilt_x_deg, 1.4);
  assert.equal(decoded.metrics.rtk_latitude_deg, 24.612345678);
  assert.equal(decoded.metrics.rtk_trusted, true);
  assert.equal(decoded.metrics.rtcm_injection_mode_code, 2);
  assert.equal(decoded.metrics.rtcm_session_epoch, 0x12345678);
  assert.equal(decoded.metrics.rtcm_lease_remaining_ms, 59123);
  assert.equal(decoded.metrics.rtcm_last_fragment_age_ms, 123);
  assert.equal(decoded.metrics.rtcm_last_completed_frame_age_ms, 234);
  assert.equal(decoded.metrics.rtcm_last_action_age_ms, 345);
  assert.equal(decoded.metrics.rtcm_accepted_fragments_total, 1234);
  assert.equal(decoded.metrics.rtcm_completed_frames_total, 456);
  assert.equal(decoded.metrics.rtcm_injected_frames_total, 450);
  assert.equal(decoded.metrics.rtcm_rejected_fragments_total, 2);
  assert.equal(decoded.metrics.rtcm_crc_errors_total, 1);
  assert.equal(decoded.metrics.rtcm_queue_drops_total, 12);
  assert.equal(decoded.metrics.rtcm_uart_errors_total, 6);
});

test("compact telemetry v4 rejects active RTCM without a lease and dirty disabled state", () => {
  const base = Buffer.from(
    "4c53040303031fff0000004d000003849664c12a2f5b5302092e12eb02a1008cffe0" +
      "000300000005bb02974e0000001b80b4e91500003039fffff6d7000007d00000007f" +
      "075bcd15097e04017e6f1f003400060007000f004703d700020052023f0104123456" +
      "780000e6f30000007b000000ea00000159000004d2000001c8000001c20002000100" +
      "0c0006",
    "hex"
  );
  const activeWithoutLease = Buffer.from(base);
  activeWithoutLease.writeUInt32BE(0, 103);
  assert.throws(() => decodeCompactTelemetry(activeWithoutLease), /lacks a valid session lease/u);

  const dirtyDisabled = Buffer.from(base);
  dirtyDisabled.writeUInt8(0, 95);
  assert.throws(() => decodeCompactTelemetry(dirtyDisabled), /disabled RTCM state is not fail-closed/u);
});

test("compact telemetry rejects a truncated v3 packet", () => {
  const payload = Buffer.alloc(94);
  payload.write("LS", 0, "ascii");
  payload.writeUInt8(3, 2);
  assert.throws(() => decodeCompactTelemetry(payload), /signature mismatch/u);
});

test("compact telemetry v3 rejects contradictory trusted RTK evidence", () => {
  const golden = Buffer.from(
    "4c53030303031fff0000004d000003849664c12a2f5b5302092e12eb02a1008cffe0" +
      "000300000005bb02974e0000001b80b4e91500003039fffff6d7000007d00000007f" +
      "075bcd15097e04017e6f1f003400060007000f004703d700020052",
    "hex"
  );
  const falseTrustedFloat = Buffer.from(golden);
  falseTrustedFloat.writeUInt8(5, 74);
  assert.throws(
    () => decodeCompactTelemetry(falseTrustedFloat),
    /trusted RTK evidence violates/u
  );

  const mismatchedPosition = Buffer.from(golden);
  mismatchedPosition.writeUInt16BE(mismatchedPosition.readUInt16BE(6) & ~(1 << 5), 6);
  assert.throws(
    () => decodeCompactTelemetry(mismatchedPosition),
    /validity bitmap contradicts/u
  );

  const reservedValidityBit = Buffer.from(golden);
  reservedValidityBit.writeUInt16BE(reservedValidityBit.readUInt16BE(6) | (1 << 13), 6);
  assert.throws(
    () => decodeCompactTelemetry(reservedValidityBit),
    /reserved bits/u
  );

  const missingGnssStatus = Buffer.from(golden);
  missingGnssStatus.writeUInt16BE(missingGnssStatus.readUInt16BE(6) & ~(1 << 4), 6);
  assert.throws(
    () => decodeCompactTelemetry(missingGnssStatus),
    /without a valid GNSS status/u
  );

  const invalidCoordinateFrame = Buffer.from(golden);
  invalidCoordinateFrame.writeUInt8(3, 75);
  assert.throws(
    () => decodeCompactTelemetry(invalidCoordinateFrame),
    /coordinate-frame code contradicts/u
  );

  const impossibleFixedRatio = Buffer.from(golden);
  impossibleFixedRatio.writeUInt16BE(1001, 89);
  assert.throws(
    () => decodeCompactTelemetry(impossibleFixedRatio),
    /Fixed ratio exceeds/u
  );
});
