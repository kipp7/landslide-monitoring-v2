const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildCompactBroadcastPollCommand,
  compactCommandTag,
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
