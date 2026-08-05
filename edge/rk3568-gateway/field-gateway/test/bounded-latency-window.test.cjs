const assert = require("node:assert/strict");
const test = require("node:test");

const { BoundedLatencyWindow } = require("../dist/bounded-latency-window.js");

test("bounded latency window retains only its fixed-capacity tail", () => {
  const window = new BoundedLatencyWindow(256);
  for (let value = 0; value < 300; value += 1) window.record(value);

  assert.deepEqual(window.stats(), {
    samplesTotal: 300,
    samplesInWindow: 256,
    windowCapacity: 256,
    p50Ms: 171,
    p95Ms: 287,
    maxMs: 299,
    lastMs: 299
  });
});

test("bounded latency window ignores invalid samples", () => {
  const window = new BoundedLatencyWindow(4);
  window.record(-1);
  window.record(Number.NaN);
  assert.equal(window.stats().samplesTotal, 0);
});
