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

test("compact v4 replaces stale fields while preserving RTCM runtime evidence", () => {
  const payload = {
    schema_version: 1,
    device_id: "00000000-0000-0000-0000-000000000001",
    received_ts: "2026-08-03T00:00:02.000Z",
    seq: 101,
    metrics: {
      battery_v: 11.5,
      rtcm_injection_mode_code: 2,
      rtcm_session_epoch: 0x12345678,
      rtcm_lease_remaining_ms: 89999,
      rtcm_queue_pending: 1,
      rtcm_queue_high_watermark: 2,
      rtcm_completed_frames_total: 42,
      rtcm_injected_frames_total: 41,
      rtcm_crc_errors_total: 0,
    },
    meta: {
      install_label: "FIELD-NODE-A",
      legacy_node: "A",
      compact_payload_version: 4,
      gnss_source: "simulated",
      v4_valid_flags: 0x1fff,
      rtcm_injection_mode: "live",
      rtcm_state_flags: 0x07,
    },
  };

  const state = telemetryWriterTestHooks.buildShadowState(payload, {
    metrics: { temperature_c: 25, accel_x_g: 0.1, battery_v: 11.4 },
    meta: { compact_payload_version: 2, legacy_valid_flags: { imu_ok: 1 } },
  });

  assert.deepEqual(state.metrics, payload.metrics);
  assert.equal(state.metrics.temperature_c, undefined);
  assert.equal(state.metrics.accel_x_g, undefined);
  assert.equal(state.meta.rtcm_injection_mode, "live");
  assert.equal(state.meta.gnss_source, "simulated");
  assert.equal(state.meta.rtcm_state_flags, 0x07);
  assert.equal(state.meta.legacy_valid_flags, undefined);
});

test("compact v5 replaces stale V4 counters with the bounded RTCM summary", () => {
  const payload = {
    schema_version: 1,
    device_id: "00000000-0000-0000-0000-000000000001",
    received_ts: "2026-08-04T00:00:02.000Z",
    seq: 102,
    metrics: {
      battery_v: 11.5,
      rtcm_injection_mode_code: 2,
      rtcm_session_epoch: 0x12345678,
      rtcm_lease_remaining_ms: 59200,
      rtcm_queue_pending: 1,
      rtcm_queue_high_watermark: 4,
      rtcm_last_completed_frame_age_ms: 230,
      rtcm_injected_frames_total: 450,
      rtcm_error_summary_flags: 0,
      rtcm_crc_error: false,
    },
    meta: {
      install_label: "FIELD-NODE-A",
      legacy_node: "A",
      compact_payload_version: 5,
      v5_valid_flags: 0x1fff,
      rtcm_injection_mode: "live",
      rtcm_state_flags: 0x3f,
      rtcm_lease_resolution_ms: 100,
      rtcm_completion_age_resolution_ms: 10,
      rtcm_injected_frames_counter_saturated: false,
    },
  };

  const state = telemetryWriterTestHooks.buildShadowState(payload, {
    metrics: { rtcm_completed_frames_total: 42, rtcm_crc_errors_total: 3 },
    meta: { compact_payload_version: 4, v4_valid_flags: 0x1fff },
  });

  assert.deepEqual(state.metrics, payload.metrics);
  assert.equal(state.metrics.rtcm_completed_frames_total, undefined);
  assert.equal(state.metrics.rtcm_crc_errors_total, undefined);
  assert.equal(state.meta.v4_valid_flags, undefined);
  assert.equal(state.meta.v5_valid_flags, 0x1fff);
  assert.equal(state.meta.rtcm_lease_resolution_ms, 100);
});

test("compact v6 merges only scopes from the same sensor sample epoch", () => {
  const deviceId = "00000000-0000-0000-0000-000000000001";
  const payload = (seq, receivedTs, scope, sampleEpoch, metrics, extraMeta = {}) => ({
    schema_version: 1,
    device_id: deviceId,
    received_ts: receivedTs,
    seq,
    metrics,
    meta: {
      install_label: "FIELD-NODE-A",
      legacy_node: "A",
      compact_payload_version: 6,
      compact_scope: scope,
      sample_epoch: sampleEpoch,
      packet_class: scope === "core" ? "hf_displacement_core" : `lf_${scope}`,
      ...extraMeta,
    },
  });

  let state = telemetryWriterTestHooks.buildShadowState(
    payload(1, "2026-08-04T01:00:00.000Z", "core", 10, {
      tilt_x_deg: 1.2,
      rtk_altitude_msl_m: 12.345,
      rtk_trusted: true,
    }),
    null
  );
  state = telemetryWriterTestHooks.buildShadowState(
    payload(2, "2026-08-04T01:00:00.100Z", "environment", 10, {
      battery_v: 11.5,
      soil_moisture_pct: 48.3,
      rtk_geoid_separation_m: -2.345,
    }, { uptime_s: 900 }),
    state
  );
  state = telemetryWriterTestHooks.buildShadowState(
    payload(3, "2026-08-04T01:00:00.200Z", "audit", 10, {
      rtk_fixed_ratio_1m_pct: 98.3,
      rtcm_crc_error: false,
    }, { rtk_fix_flags: 0x7e6f }),
    state
  );

  assert.equal(state.metrics.tilt_x_deg, 1.2);
  assert.equal(state.metrics.battery_v, 11.5);
  assert.equal(state.metrics.soil_moisture_pct, 48.3);
  assert.equal(state.metrics.rtk_fixed_ratio_1m_pct, 98.3);
  assert.equal(state.metrics.rtk_ellipsoid_height_m, 10);
  assert.deepEqual(state.meta._scope_status.matched_scopes, ["core", "environment", "audit"]);
  assert.equal(state.meta.compact_scope, "core");

  state = telemetryWriterTestHooks.buildShadowState(
    payload(4, "2026-08-04T01:00:01.000Z", "core", 11, {
      tilt_x_deg: 1.3,
      rtk_altitude_msl_m: 12.346,
      rtk_trusted: true,
    }),
    state
  );
  assert.deepEqual(state.metrics, {
    tilt_x_deg: 1.3,
    rtk_altitude_msl_m: 12.346,
    rtk_trusted: true,
  });
  assert.deepEqual(state.meta._scope_status.matched_scopes, ["core"]);

  state = telemetryWriterTestHooks.buildShadowState(
    payload(5, "2026-08-04T01:00:01.100Z", "environment", 10, {
      battery_v: 9.9,
      soil_moisture_pct: 99,
    }),
    state
  );
  assert.equal(state.metrics.battery_v, undefined);
  assert.equal(state.metrics.soil_moisture_pct, undefined);

  state = telemetryWriterTestHooks.buildShadowState(
    payload(6, "2026-08-04T01:00:01.200Z", "environment", 11, {
      battery_v: 11.49,
      soil_moisture_pct: 48.2,
    }),
    state
  );
  assert.equal(state.metrics.battery_v, 11.49);
  assert.equal(state.metrics.soil_moisture_pct, 48.2);
  assert.equal(state.meta._writer.last_seq, 6);
});

test("isolated ClickHouse replay builds shadow from successful messages only and honors resets", () => {
  const deviceId = "00000000-0000-0000-0000-000000000001";
  const payload = (seq, receivedTs, scope, sampleEpoch, metrics) => ({
    schema_version: 1,
    device_id: deviceId,
    received_ts: receivedTs,
    seq,
    metrics,
    meta: {
      install_label: "FIELD-NODE-A",
      legacy_node: "A",
      compact_payload_version: 6,
      compact_scope: scope,
      sample_epoch: sampleEpoch,
      packet_class: scope === "core" ? "hf_displacement_core" : `lf_${scope}`,
    },
  });
  const base = telemetryWriterTestHooks.buildShadowState(
    payload(90, "2026-08-04T02:00:00.000Z", "core", 90, { tilt_x_deg: 9 }),
    null
  );

  const updates = telemetryWriterTestHooks.buildSuccessfulShadowUpdates(
    [
      {
        payload: payload(91, "2026-08-04T02:00:01.000Z", "environment", 90, { battery_v: 11.5 }),
        resetsShadow: false,
      },
      {
        payload: payload(1, "2026-08-04T02:00:02.000Z", "core", 1, { tilt_x_deg: 1 }),
        resetsShadow: true,
      },
      {
        payload: payload(2, "2026-08-04T02:00:02.100Z", "audit", 1, { rtcm_crc_error: false }),
        resetsShadow: false,
      },
    ],
    new Map([[deviceId, base]])
  );

  const state = updates.get(deviceId).state;
  assert.deepEqual(state.metrics, { tilt_x_deg: 1, rtcm_crc_error: false });
  assert.equal(state.metrics.battery_v, undefined);
  assert.deepEqual(state.meta._scope_status.matched_scopes, ["core", "audit"]);
  assert.equal(state.meta._writer.last_seq, 2);
});
