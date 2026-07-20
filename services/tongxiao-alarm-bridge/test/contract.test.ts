import assert from "node:assert/strict";
import test from "node:test";
import { loadConfigFromEnv } from "../src/config";
import { createDesiredState, isPresenceFresh, RevisionClock } from "../src/contract";

const deviceId = "00000000-0000-4000-8000-000000022206";

void test("critical alarm drives every local warning output and fixed evacuation voice", () => {
  const desired = createDesiredState({
    action: "alarm_on",
    context: {
      severity: "critical",
      source: "rule-engine-worker",
      alertId: "alert-1",
      stationId: "station-1",
      title: "critical risk",
      message: "evacuate"
    },
    deviceId,
    revision: 101,
    issuedTs: "2026-07-19T08:00:00.000Z",
    voiceEnabled: true
  });

  assert.equal(desired.state, "active");
  assert.equal(desired.severity, "critical");
  assert.equal(desired.outputs.buzzer, true);
  assert.equal(desired.outputs.motor, true);
  assert.equal(desired.outputs.rgb, "red_fast_flash");
  assert.deepEqual(desired.outputs.voice, { phrase_id: "EVACUATE_01", repeat_seconds: 15 });
});

void test("high alarm repeats the full preparation phrase while risk remains active", () => {
  const desired = createDesiredState({
    action: "alarm_on",
    context: { severity: "high" },
    deviceId,
    revision: 102,
    voiceEnabled: true
  });

  assert.deepEqual(desired.outputs.voice, { phrase_id: "PREPARE_01", repeat_seconds: 30 });
});

void test("all clear requests spaced repeats for the firmware three-play schedule", () => {
  const desired = createDesiredState({
    action: "alarm_off",
    context: {},
    deviceId,
    revision: 103,
    voiceEnabled: true
  });

  assert.deepEqual(desired.outputs.voice, { phrase_id: "ALL_CLEAR_01", repeat_seconds: 12 });
});

void test("voice is absent when the deployment has not passed silent-boot verification", () => {
  const desired = createDesiredState({
    action: "alarm_on",
    context: { severity: "high" },
    deviceId,
    revision: 104,
    voiceEnabled: false
  });
  assert.equal(desired.outputs.voice, null);
});

void test("silence stops buzzer and motor but preserves alert context", () => {
  const active = createDesiredState({
    action: "alarm_on",
    context: { severity: "critical", alertId: "alert-2", title: "risk" },
    deviceId,
    revision: 200,
    voiceEnabled: true
  });
  const silenced = createDesiredState({
    action: "silence",
    context: { reason: "operator acknowledged" },
    deviceId,
    revision: 201,
    voiceEnabled: true,
    previous: active
  });

  assert.equal(silenced.state, "silenced");
  assert.equal(silenced.severity, "critical");
  assert.equal(silenced.alert?.alert_id, "alert-2");
  assert.equal(silenced.outputs.buzzer, false);
  assert.equal(silenced.outputs.motor, false);
  assert.equal(silenced.outputs.voice, null);
});

void test("revision clock stays monotonic across retained state and clock skew", () => {
  const clock = new RevisionClock();
  clock.observe(5000);
  assert.equal(clock.next(1000), 5001);
  assert.equal(clock.next(9000), 9000);
});

void test("presence expires from board online status after the receipt freshness window", () => {
  const presence = {
    schema_version: 1 as const,
    device_id: deviceId,
    event_ts: "1970-01-01T00:00:00.000Z",
    status: "online" as const,
    meta: { fw: "credential-check" }
  };

  assert.equal(isPresenceFresh(presence, 1000, 90_999, 90_000), true);
  assert.equal(isPresenceFresh(presence, 1000, 91_001, 90_000), false);
  assert.equal(isPresenceFresh({ ...presence, status: "offline" }, 1000, 1001, 90_000), false);
});

void test("presence freshness configuration defaults to 90 seconds and accepts an override", () => {
  assert.equal(loadConfigFromEnv({ TONGXIAO_DEVICE_ID: deviceId }).presenceStaleSeconds, 90);
  assert.equal(
    loadConfigFromEnv({ TONGXIAO_DEVICE_ID: deviceId, TONGXIAO_PRESENCE_STALE_SECONDS: "120" })
      .presenceStaleSeconds,
    120
  );
});
