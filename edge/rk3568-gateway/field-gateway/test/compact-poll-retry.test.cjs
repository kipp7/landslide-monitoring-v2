const assert = require("node:assert/strict");
const test = require("node:test");

const {
  classifyCompactPollTelemetry,
  compactPollTelemetryIsPublishable,
  decideCompactPollTimer
} = require("../dist/compact-poll-retry.js");

test("compact poll timer allows only the configured bounded retry", () => {
  assert.equal(
    decideCompactPollTimer({ receivedNodes: 0, expectedNodes: 3, retriesSent: 0, maxRetries: 1 }),
    "timeout"
  );
  assert.equal(
    decideCompactPollTimer({ receivedNodes: 2, expectedNodes: 3, retriesSent: 0, maxRetries: 1 }),
    "retry"
  );
  assert.equal(
    decideCompactPollTimer({ receivedNodes: 2, expectedNodes: 3, retriesSent: 1, maxRetries: 1 }),
    "timeout"
  );
  assert.equal(
    decideCompactPollTimer({ receivedNodes: 3, expectedNodes: 3, retriesSent: 1, maxRetries: 1 }),
    "complete"
  );
});

test("compact poll telemetry separates retry redundancy from real duplicates", () => {
  assert.equal(
    classifyCompactPollTelemetry({
      expected: true,
      alreadyReceived: false,
      retryDispatched: true,
      retryResponseAlreadyObserved: false,
      missingAtRetryDispatch: true
    }),
    "matched-after-retry-dispatch"
  );
  assert.equal(
    classifyCompactPollTelemetry({
      expected: true,
      alreadyReceived: true,
      retryDispatched: true,
      retryResponseAlreadyObserved: false,
      missingAtRetryDispatch: false
    }),
    "redundant-retry"
  );
  assert.equal(
    classifyCompactPollTelemetry({
      expected: true,
      alreadyReceived: true,
      retryDispatched: false,
      retryResponseAlreadyObserved: false,
      missingAtRetryDispatch: false
    }),
    "duplicate"
  );
  assert.equal(
    classifyCompactPollTelemetry({
      expected: false,
      alreadyReceived: false,
      retryDispatched: false,
      retryResponseAlreadyObserved: false,
      missingAtRetryDispatch: false
    }),
    "unmatched"
  );
  assert.equal(
    classifyCompactPollTelemetry({
      expected: true,
      alreadyReceived: true,
      retryDispatched: true,
      retryResponseAlreadyObserved: true,
      missingAtRetryDispatch: false
    }),
    "duplicate"
  );
});

test("only telemetry matched to the active logical poll is publishable", () => {
  assert.equal(compactPollTelemetryIsPublishable("matched"), true);
  assert.equal(compactPollTelemetryIsPublishable("matched-after-retry-dispatch"), true);
  assert.equal(compactPollTelemetryIsPublishable("redundant-retry"), false);
  assert.equal(compactPollTelemetryIsPublishable("duplicate"), false);
  assert.equal(compactPollTelemetryIsPublishable("unmatched"), false);
});

test("a partial A/B round completes after C and drains one retry response per node", () => {
  const expected = new Set(["A", "B", "C"]);
  const received = new Set(["A", "B"]);
  const missingAtRetryDispatch = new Set(["C"]);
  const retryResponses = new Set();

  function ingest(deviceId) {
    const classification = classifyCompactPollTelemetry({
      expected: expected.has(deviceId),
      alreadyReceived: received.has(deviceId),
      retryDispatched: true,
      retryResponseAlreadyObserved: retryResponses.has(deviceId),
      missingAtRetryDispatch: missingAtRetryDispatch.has(deviceId)
    });
    if (classification === "matched" || classification === "matched-after-retry-dispatch") {
      received.add(deviceId);
    } else if (classification === "redundant-retry") {
      retryResponses.add(deviceId);
    }
    return classification;
  }

  assert.equal(ingest("A"), "redundant-retry");
  assert.equal(ingest("A"), "duplicate");
  assert.equal(ingest("C"), "matched-after-retry-dispatch");
  assert.equal(ingest("C"), "redundant-retry");
  assert.equal(
    decideCompactPollTimer({
      receivedNodes: received.size,
      expectedNodes: expected.size,
      retriesSent: 1,
      maxRetries: 1
    }),
    "complete"
  );
});
