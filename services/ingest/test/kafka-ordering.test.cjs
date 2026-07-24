const assert = require("node:assert/strict");
const test = require("node:test");

const { ORDERED_IDEMPOTENT_PRODUCER_CONFIG } = require("../dist/kafka-ordering.js");

test("uses an ordered idempotent Kafka producer", () => {
  assert.deepEqual(ORDERED_IDEMPOTENT_PRODUCER_CONFIG, {
    idempotent: true,
    maxInFlightRequests: 1
  });
  assert.equal(Object.isFrozen(ORDERED_IDEMPOTENT_PRODUCER_CONFIG), true);
});
