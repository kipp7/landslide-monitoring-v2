const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildPublication,
  buildTelemetryEnvelope,
  deriveDeviceIds,
  parseArgs,
  percentile
} = require("./telemetry-pipeline-stress.cjs");

const TEST_DEVICE_ID = "00000000-0000-4000-9000-000000900001";

test("parses bounded load options", () => {
  const options = parseArgs([
    "--count",
    "10000",
    "--rate",
    "800",
    "--concurrency",
    "128",
    "--device-id",
    TEST_DEVICE_ID,
    "--devices",
    "10",
    "--start-seq",
    "101",
    "--run-id",
    "unit-test"
  ]);
  assert.equal(options.count, 10000);
  assert.equal(options.rate, 800);
  assert.equal(options.concurrency, 128);
  assert.equal(options.devices, 10);
  assert.equal(options.startSeq, 101);
});

test("derives a contiguous isolated UUID range", () => {
  assert.deepEqual(deriveDeviceIds("00000000-0000-4000-9000-00000090fffe", 3), [
    "00000000-0000-4000-9000-00000090fffe",
    "00000000-0000-4000-9000-00000090ffff",
    "00000000-0000-4000-9000-000000910000"
  ]);
});

test("round-robins devices while keeping each sequence contiguous", () => {
  const options = parseArgs([
    "--device-id",
    TEST_DEVICE_ID,
    "--devices",
    "3",
    "--count",
    "7",
    "--start-seq",
    "10",
    "--run-id",
    "unit-test"
  ]);
  const publications = Array.from({ length: 7 }, (_, index) => buildPublication(options, index));
  assert.deepEqual(
    publications.map(({ deviceId, sequence }) => [deviceId.slice(-1), sequence]),
    [
      ["1", 10],
      ["2", 10],
      ["3", 10],
      ["1", 11],
      ["2", 11],
      ["3", 11],
      ["1", 12]
    ]
  );
});

test("refuses formal field-node identities", () => {
  assert.throws(
    () => parseArgs(["--device-id", "00000000-0000-0000-0000-000000000001"]),
    /refusing to use a formal A\/B\/C device UUID/
  );
});

test("builds a normal eleven-metric telemetry envelope", () => {
  const options = parseArgs(["--device-id", TEST_DEVICE_ID, "--run-id", "unit-test"]);
  const payload = buildTelemetryEnvelope(options, 42);
  assert.equal(payload.device_id, TEST_DEVICE_ID);
  assert.equal(payload.seq, 42);
  assert.equal(Object.keys(payload.metrics).length, 11);
  assert.equal(payload.metrics.warning_flag, false);
  assert.equal(payload.meta.load_test, true);
});

test("computes nearest-rank percentiles", () => {
  assert.equal(percentile([5, 1, 4, 2, 3], 0.5), 3);
  assert.equal(percentile([5, 1, 4, 2, 3], 0.95), 5);
  assert.equal(percentile([], 0.5), null);
});
