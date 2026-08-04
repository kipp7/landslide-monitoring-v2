const assert = require("node:assert/strict");
const test = require("node:test");

const {
  DEFAULT_RTCM_MAX_FRAGMENTS_BETWEEN_POLLS,
  RTCM_POST_BURST_POLL_GUARD_MS,
  RtcmPollBurstGate
} = require("../dist/rtcm-poll-burst-gate.js");

test("production RTCM burst limit leaves room for three-node polling", () => {
  assert.equal(DEFAULT_RTCM_MAX_FRAGMENTS_BETWEEN_POLLS, 4);
  assert.equal(RTCM_POST_BURST_POLL_GUARD_MS, 600);
});

test("RTCM burst gate reserves a bounded correction window between sensor polls", () => {
  const gate = new RtcmPollBurstGate(6);

  for (let index = 0; index < 6; index += 1) {
    assert.equal(gate.canDispatchFragment(), true);
    gate.noteFragmentDispatched();
  }
  assert.equal(gate.canDispatchFragment(), false);
  assert.deepEqual(gate.stats(), {
    maxFragmentsBetweenPolls: 6,
    fragmentsSinceLastPoll: 6
  });
  assert.throws(() => gate.noteFragmentDispatched(), /burst limit exceeded/);

  gate.notePollDispatched();
  assert.equal(gate.canDispatchFragment(), true);
  assert.equal(gate.stats().fragmentsSinceLastPoll, 0);
});

test("RTCM burst gate rejects an invalid limit", () => {
  assert.throws(() => new RtcmPollBurstGate(0), /positive safe integer/);
  assert.throws(() => new RtcmPollBurstGate(1.5), /positive safe integer/);
});
