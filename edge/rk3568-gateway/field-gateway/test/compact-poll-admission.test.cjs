const assert = require("node:assert/strict");
const test = require("node:test");

const { CompactPollAdmissionController } = require("../dist/compact-poll-admission.js");

function createController() {
  return new CompactPollAdmissionController({
    steadyIntervalMs: 1000,
    emptyBackoffInitialMs: 2000,
    emptyBackoffMaxMs: 5000
  });
}

test("admits at most one compact broadcast poll per port", () => {
  const controller = createController();

  assert.equal(controller.tryBegin("/dev/ttyS3", 1000), true);
  assert.equal(controller.tryBegin("/dev/ttyS3", 1001), false);
  assert.equal(controller.isInFlight("/dev/ttyS3"), true);

  const closed = controller.close("/dev/ttyS3", "complete", 1500);
  assert.equal(closed.inFlight, false);
  assert.equal(closed.nextEligibleAtMs, 2500);
  assert.equal(controller.tryBegin("/dev/ttyS3", 2499), false);
  assert.equal(controller.tryBegin("/dev/ttyS3", 2500), true);
});

test("retries the first empty poll promptly, then backs off exponentially", () => {
  const controller = createController();
  const port = "/dev/ttyS3";

  assert.equal(controller.tryBegin(port, 0), true);
  let state = controller.close(port, "empty-timeout", 1000);
  assert.equal(state.consecutiveEmptyTimeouts, 1);
  assert.equal(state.nextEligibleInMs, 1000);

  assert.equal(controller.tryBegin(port, 2000), true);
  state = controller.close(port, "empty-timeout", 3000);
  assert.equal(state.consecutiveEmptyTimeouts, 2);
  assert.equal(state.nextEligibleInMs, 2000);

  assert.equal(controller.tryBegin(port, 5000), true);
  state = controller.close(port, "empty-timeout", 6000);
  assert.equal(state.consecutiveEmptyTimeouts, 3);
  assert.equal(state.nextEligibleInMs, 4000);

  assert.equal(controller.tryBegin(port, 10000), true);
  state = controller.close(port, "empty-timeout", 11000);
  assert.equal(state.consecutiveEmptyTimeouts, 4);
  assert.equal(state.nextEligibleInMs, 5000);
});

test("a partial response clears offline backoff without allowing overlap", () => {
  const controller = createController();
  const port = "/dev/ttyS3";

  assert.equal(controller.tryBegin(port, 0), true);
  controller.close(port, "empty-timeout", 1000);
  assert.equal(controller.tryBegin(port, 2000), true);

  const state = controller.close(port, "partial-timeout", 2500);
  assert.equal(state.consecutiveEmptyTimeouts, 0);
  assert.equal(state.nextEligibleInMs, 1000);
  assert.equal(controller.tryBegin(port, 3499), false);
  assert.equal(controller.tryBegin(port, 3500), true);
});
