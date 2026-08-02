const assert = require("node:assert/strict");
const test = require("node:test");

const { commitResolvedOffsets } = require("../dist/kafka-offsets.js");

test("explicitly commits resolved offsets when auto commit is disabled", async () => {
  const offsets = {
    topics: [{ topic: "telemetry.raw.v1", partitions: [{ partition: 2, offset: "123" }] }]
  };
  const calls = [];
  const committed = await commitResolvedOffsets({
    uncommittedOffsets: () => offsets,
    commitOffsetsIfNecessary: async (value) => calls.push(value)
  });

  assert.equal(committed, true);
  assert.deepEqual(calls, [offsets]);
});

test("does not issue empty offset commits", async () => {
  let calls = 0;
  const committed = await commitResolvedOffsets({
    uncommittedOffsets: () => ({ topics: [] }),
    commitOffsetsIfNecessary: async () => {
      calls += 1;
    }
  });

  assert.equal(committed, false);
  assert.equal(calls, 0);
});
