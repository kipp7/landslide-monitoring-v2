import assert from "node:assert/strict";
import test from "node:test";
import { createDesiredState, RevisionClock } from "../src/contract";

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
  assert.deepEqual(desired.outputs.voice, { phrase_id: "EVACUATE_01", repeat_seconds: 30 });
});

void test("voice is absent when the deployment has not passed silent-boot verification", () => {
  const desired = createDesiredState({
    action: "alarm_on",
    context: { severity: "high" },
    deviceId,
    revision: 102,
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
