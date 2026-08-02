const assert = require("node:assert/strict");
const test = require("node:test");

const { telemetryWriterTestHooks } = require("../dist/index.js");

test("compact v3 replaces the field snapshot and purges stale legacy or RTK metrics", () => {
  const previous = {
    metrics: {
      temperature_c: 25,
      humidity_pct: 60,
      accel_x_g: 0.1,
      gps_latitude: 24.5,
      rtk_latitude_deg: 24.6,
      rtk_trusted: true,
      battery_v: 11.4,
    },
    meta: {
      install_label: "FIELD-NODE-A",
      legacy_node: "A",
      legacy_valid_flags: { imu_ok: 1 },
      compact_payload_version: 2,
      _writer: { last_seq: 99, last_received_ts: "2026-08-02T00:00:00.000Z" },
    },
  };
  const payload = {
    schema_version: 1,
    device_id: "00000000-0000-0000-0000-000000000001",
    received_ts: "2026-08-02T00:00:02.000Z",
    seq: 100,
    metrics: {
      battery_v: 11.39,
      battery_pct: 37,
      rtk_gga_quality: 5,
      rtk_trusted: false,
    },
    meta: {
      install_label: "FIELD-NODE-A",
      legacy_node: "A",
      compact_payload_version: 3,
      last_command_tag: 1234,
      rtk_fix_type: "rtk_float",
    },
  };

  const state = telemetryWriterTestHooks.buildShadowState(payload, previous);
  assert.deepEqual(state.metrics, payload.metrics);
  assert.equal(state.metrics.temperature_c, undefined);
  assert.equal(state.metrics.accel_x_g, undefined);
  assert.equal(state.metrics.gps_latitude, undefined);
  assert.equal(state.metrics.rtk_latitude_deg, undefined);
  assert.equal(state.meta.legacy_valid_flags, undefined);
  assert.equal(state.meta.last_command_tag, 1234);
  assert.equal(state.meta._writer.last_seq, 100);
  assert.equal(state.meta._writer.last_received_ts, payload.received_ts);
});

test("compact v2 keeps sparse merge semantics for rollback compatibility", () => {
  const state = telemetryWriterTestHooks.buildShadowState(
    {
      schema_version: 1,
      device_id: "00000000-0000-0000-0000-000000000001",
      received_ts: "2026-08-02T00:00:02.000Z",
      seq: 2,
      metrics: { battery_v: 11.4 },
      meta: {
        install_label: "FIELD-NODE-A",
        legacy_node: "A",
        compact_payload_version: 2,
      },
    },
    {
      metrics: { tilt_x_deg: 1.2 },
      meta: { install_label: "FIELD-NODE-A", legacy_node: "A" },
    }
  );

  assert.deepEqual(state.metrics, { tilt_x_deg: 1.2, battery_v: 11.4 });
});
