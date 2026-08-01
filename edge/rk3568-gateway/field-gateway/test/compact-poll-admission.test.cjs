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

test("backs off exponentially when every expected node is missing", () => {
  const controller = createController();
  const port = "/dev/ttyS3";

  assert.equal(controller.tryBegin(port, 0), true);
  let state = controller.close(port, "empty-timeout", 1000);
  assert.equal(state.consecutiveEmptyTimeouts, 1);
  assert.equal(state.nextEligibleInMs, 2000);

  assert.equal(controller.tryBegin(port, 3000), true);
  state = controller.close(port, "empty-timeout", 4000);
  assert.equal(state.consecutiveEmptyTimeouts, 2);
  assert.equal(state.nextEligibleInMs, 4000);

  assert.equal(controller.tryBegin(port, 8000), true);
  state = controller.close(port, "empty-timeout", 9000);
  assert.equal(state.consecutiveEmptyTimeouts, 3);
  assert.equal(state.nextEligibleInMs, 5000);
});

test("a partial response clears offline backoff without allowing overlap", () => {
  const controller = createController();
  const port = "/dev/ttyS3";

  assert.equal(controller.tryBegin(port, 0), true);
  controller.close(port, "empty-timeout", 1000);
  assert.equal(controller.tryBegin(port, 3000), true);

  const state = controller.close(port, "partial-timeout", 3500);
  assert.equal(state.consecutiveEmptyTimeouts, 0);
  assert.equal(state.nextEligibleInMs, 1000);
  assert.equal(controller.tryBegin(port, 4499), false);
  assert.equal(controller.tryBegin(port, 4500), true);
});
