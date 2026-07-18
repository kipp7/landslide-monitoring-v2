const assert = require("node:assert/strict");
const test = require("node:test");

const {
  evaluateSequenceReset,
  shouldDiscardSyntheticShadow,
} = require("../dist/sequence-policy.js");

const fieldPayload = {
  seq: 25,
  meta: {
    legacy_node: "A",
    install_label: "FIELD-NODE-A",
    uptime_s: 120,
  },
};

test("accepts a sequence reset after a real uptime rollback", () => {
  const decision = evaluateSequenceReset(fieldPayload, 300, {
    metrics: {},
    meta: { uptime_s: 900 },
  });

  assert.equal(decision.accept, true);
  assert.equal(decision.reason, "uptime_rollback");
});

test("rejects an ordinary stale sequence when uptime has not rolled back", () => {
  const decision = evaluateSequenceReset(fieldPayload, 300, {
    metrics: {},
    meta: { uptime_s: 100 },
  });

  assert.equal(decision.accept, false);
  assert.equal(decision.reason, null);
});

test("accepts and replaces an explicit smoke-test shadow", () => {
  const shadow = {
    metrics: { note: "smoke_test", battery_v: 3.92 },
    meta: { fw: "dev" },
  };
  const decision = evaluateSequenceReset(fieldPayload, 1001, shadow);

  assert.equal(decision.accept, true);
  assert.equal(decision.reason, "synthetic_shadow_replaced");
  assert.equal(shouldDiscardSyntheticShadow(fieldPayload, shadow), true);
});

test("does not replace an unmarked shadow with missing uptime", () => {
  const shadow = {
    metrics: { battery_v: 3.92 },
    meta: { fw: "dev" },
  };
  const decision = evaluateSequenceReset(fieldPayload, 1001, shadow);

  assert.equal(decision.accept, false);
  assert.equal(shouldDiscardSyntheticShadow(fieldPayload, shadow), false);
});

test("does not trust a smoke marker without field identity", () => {
  const payload = { seq: 25, meta: { uptime_s: 120 } };
  const shadow = { metrics: { note: "smoke_test" }, meta: {} };

  assert.equal(evaluateSequenceReset(payload, 1001, shadow).accept, false);
  assert.equal(shouldDiscardSyntheticShadow(payload, shadow), false);
});
