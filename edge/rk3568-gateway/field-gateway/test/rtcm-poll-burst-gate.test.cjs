const assert = require("node:assert/strict");
const test = require("node:test");

const {
  DEFAULT_RTCM_MAX_FRAGMENTS_BETWEEN_POLLS,
  RTCM_POST_BURST_POLL_GUARD_MS,
  RtcmPollBurstGate,
  selectRtcmTargetedPollScope,
  shouldYieldSouthboundPollToRtcm
} = require("../dist/rtcm-poll-burst-gate.js");

test("production RTCM burst limit leaves room for three-node polling", () => {
  assert.equal(DEFAULT_RTCM_MAX_FRAGMENTS_BETWEEN_POLLS, 4);
  assert.equal(RTCM_POST_BURST_POLL_GUARD_MS, 600);
});

test("RTCM burst gate reserves a bounded correction window between sensor polls", () => {
  const gate = new RtcmPollBurstGate(6);

  for (let index = 0; index < 6; index += 1) {
    assert.equal(gate.canDispatchFragment(), true);
    gate.noteFieldFrameDispatched();
  }
  assert.equal(gate.canDispatchFragment(), false);
  assert.deepEqual(gate.stats(), {
    accountingUnit: "field-link-frame",
    maxFragmentsBetweenPolls: 6,
    fragmentsSinceLastPoll: 6,
    minCorrectionWindowMs: 0,
    correctionWindowRemainingMs: 0
  });
  assert.throws(() => gate.noteFieldFrameDispatched(), /field-frame burst limit exceeded/);

  gate.notePollDispatched();
  assert.equal(gate.canDispatchFragment(), true);
  assert.equal(gate.stats().fragmentsSinceLastPoll, 0);
});

test("RTCM burst gate rejects an invalid limit", () => {
  assert.throws(() => new RtcmPollBurstGate(0), /positive safe integer/);
  assert.throws(() => new RtcmPollBurstGate(1.5), /positive safe integer/);
  assert.throws(() => new RtcmPollBurstGate(4, -1), /minimum correction window/);
});

test("RTCM control and armed pending data take priority over a southbound poll", () => {
  const idle = {
    controlWriteDue: false,
    allTargetsArmed: true,
    pendingFragments: 0,
    pendingTypes: 0,
    canDispatchFragment: true,
    correctionWindowActive: false
  };

  assert.equal(shouldYieldSouthboundPollToRtcm(idle), false);
  assert.equal(
    shouldYieldSouthboundPollToRtcm({ ...idle, controlWriteDue: true }),
    true
  );
  assert.equal(
    shouldYieldSouthboundPollToRtcm({ ...idle, pendingTypes: 3 }),
    true
  );
  assert.equal(
    shouldYieldSouthboundPollToRtcm({ ...idle, pendingFragments: 1 }),
    true
  );
});

test("RTCM data priority fails closed until nodes are armed and within burst limit", () => {
  const pending = {
    controlWriteDue: false,
    allTargetsArmed: true,
    pendingFragments: 1,
    pendingTypes: 3,
    canDispatchFragment: true,
    correctionWindowActive: false
  };

  assert.equal(
    shouldYieldSouthboundPollToRtcm({ ...pending, allTargetsArmed: false }),
    false
  );
  assert.equal(
    shouldYieldSouthboundPollToRtcm({ ...pending, canDispatchFragment: false }),
    false
  );
});

test("RTCM correction window holds polling while the shaped queue refills", () => {
  const gate = new RtcmPollBurstGate(12, 2500);
  gate.notePollDispatched(1000);

  assert.equal(gate.correctionWindowActive(3499), true);
  assert.equal(gate.correctionWindowActive(3500), false);
  assert.deepEqual(gate.stats(2000), {
    accountingUnit: "field-link-frame",
    maxFragmentsBetweenPolls: 12,
    fragmentsSinceLastPoll: 0,
    minCorrectionWindowMs: 2500,
    correctionWindowRemainingMs: 1500
  });
  assert.equal(
    shouldYieldSouthboundPollToRtcm({
      controlWriteDue: false,
      allTargetsArmed: true,
      pendingFragments: 0,
      pendingTypes: 0,
      canDispatchFragment: true,
      correctionWindowActive: true
    }),
    true
  );
});

test("targeted RTK polling requests audit only after a core snapshot exists", () => {
  assert.equal(
    selectRtcmTargetedPollScope({
      rtcmActive: true,
      allTargetsArmed: false,
      hasCoreSnapshot: false
    }),
    "core"
  );
  assert.equal(
    selectRtcmTargetedPollScope({
      rtcmActive: true,
      allTargetsArmed: false,
      hasCoreSnapshot: true
    }),
    "audit"
  );
  assert.equal(
    selectRtcmTargetedPollScope({
      rtcmActive: true,
      allTargetsArmed: true,
      hasCoreSnapshot: true
    }),
    "core"
  );
  assert.equal(
    selectRtcmTargetedPollScope({
      rtcmActive: false,
      allTargetsArmed: false,
      hasCoreSnapshot: true
    }),
    "core"
  );
});
