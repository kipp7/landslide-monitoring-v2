const assert = require("node:assert/strict");
const test = require("node:test");

const {
  isCompactLayeredPortBusy,
  layeredBroadcastAcceptsScope,
  matchesActiveScopedPoll,
  nextCompactLayeredExtensionScope
} = require("../dist/compact-layered-scheduler.js");
const {
  buildCompactBroadcastPollCommand,
  buildCompactScopedPollCommand
} = require("../dist/compact-telemetry.js");

test("P1 broadcast is a core-only Compact V6 window", () => {
  assert.match(buildCompactBroadcastPollCommand("1234ABCD").command, /^P1/u);
  assert.equal(layeredBroadcastAcceptsScope("core"), true);
  assert.equal(layeredBroadcastAcceptsScope("environment"), false);
  assert.equal(layeredBroadcastAcceptsScope("audit"), false);
  assert.equal(layeredBroadcastAcceptsScope(null), false);
});

test("P3 and P4 keep their windows open for a wrong telemetry scope", () => {
  const base = {
    expectedDeviceId: "node-a",
    telemetryDeviceId: "node-a",
    expectedCommandId: "P3A1234ABCD",
    telemetryCommandId: null,
    expectedCommandTag: 0x12345678,
    telemetryCommandTag: 0x12345678,
    telemetryUploadTrigger: "scheduler_poll"
  };

  assert.match(buildCompactScopedPollCommand("environment", "A", "1234ABCD").command, /^P3A/u);
  assert.equal(matchesActiveScopedPoll({ ...base, expectedScope: "environment", telemetryScope: "core" }), false);
  assert.equal(matchesActiveScopedPoll({ ...base, expectedScope: "environment", telemetryScope: "environment" }), true);

  assert.match(buildCompactScopedPollCommand("audit", "A", "1234ABCD").command, /^P4A/u);
  assert.equal(matchesActiveScopedPoll({ ...base, expectedScope: "audit", telemetryScope: "environment" }), false);
  assert.equal(matchesActiveScopedPoll({ ...base, expectedScope: "audit", telemetryScope: "audit" }), true);
});

test("layered extensions never overlap a core or another scoped window", () => {
  const idle = {
    pendingCommand: false,
    activeScopedPoll: false,
    commandWriteQueued: false,
    rtcmWriteInFlight: false,
    activeBroadcastPoll: false,
    broadcastAdmissionInFlight: false
  };
  assert.equal(isCompactLayeredPortBusy(idle), false);
  for (const key of Object.keys(idle)) {
    assert.equal(isCompactLayeredPortBusy({ ...idle, [key]: true }), true, key);
  }
});

test("each completed core round schedules at most one extension with audit priority", () => {
  const scopes = Array.from({ length: 30 }, (_, index) =>
    nextCompactLayeredExtensionScope({
      completedCoreRounds: index + 1,
      environmentEveryRounds: 3,
      auditEveryRounds: 15
    })
  );

  assert.equal(scopes[2], "environment");
  assert.equal(scopes[14], "audit");
  assert.equal(scopes[29], "audit");
  assert.equal(scopes.filter((scope) => scope === "environment").length, 8);
  assert.equal(scopes.filter((scope) => scope === "audit").length, 2);
  assert.ok(scopes.every((scope) => scope === null || typeof scope === "string"));
});
