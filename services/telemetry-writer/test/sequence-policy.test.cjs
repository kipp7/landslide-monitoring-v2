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

test("accepts a compact V6 core sequence reset only with a newer receive time and epoch rollback", () => {
  const previous = {
    metrics: {},
    meta: {
      _writer: { last_seq: 900, last_received_ts: "2026-08-04T00:00:00.000Z" },
      _scope_samples: {
        core: {
          sample_epoch: 700,
          received_ts: "2026-08-04T00:00:00.000Z",
          metrics: {},
          meta: {},
        },
      },
    },
  };
  const reset = {
    seq: 1,
    received_ts: "2026-08-04T00:00:10.000Z",
    meta: { compact_payload_version: 6, compact_scope: "core", sample_epoch: 1 },
  };

  assert.equal(evaluateSequenceReset(reset, 900, previous).reason, "sample_epoch_rollback");
  assert.equal(
    evaluateSequenceReset({ ...reset, seq: 900 }, 900, previous).accept,
    false,
    "an exact duplicate sequence is not a reboot"
  );
  assert.equal(
    evaluateSequenceReset({ ...reset, received_ts: "2026-08-03T23:59:59.000Z" }, 900, previous).accept,
    false,
    "a delayed old packet cannot reset the producer sequence"
  );
  assert.equal(
    evaluateSequenceReset({ ...reset, meta: { ...reset.meta, compact_scope: "environment" } }, 900, previous).accept,
    false,
    "an extension cannot establish a reboot boundary"
  );
});
