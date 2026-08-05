const assert = require("node:assert/strict");
const test = require("node:test");

const {
  decodeRtcmFragmentBatchV1,
  encodeRtcmFragmentBatchV1,
  isRtcmFragmentBatchV1
} = require("../dist/rtcm-fragment-batch.js");

test("RTCM fragment batch round-trips two bounded binary fragments", () => {
  const fragments = [Buffer.from([0x47, 0x33, 0x03, 0x1c, 0x01]), Buffer.alloc(401, 0xa5)];
  const encoded = encodeRtcmFragmentBatchV1(fragments);

  assert.equal(isRtcmFragmentBatchV1(encoded), true);
  assert.deepEqual(decodeRtcmFragmentBatchV1(encoded), fragments);
});

test("RTCM fragment batch rejects truncation, trailing bytes and oversized aggregation", () => {
  const encoded = encodeRtcmFragmentBatchV1([Buffer.alloc(100, 1), Buffer.alloc(200, 2)]);
  assert.throws(() => decodeRtcmFragmentBatchV1(encoded.subarray(0, encoded.length - 1)), /invalid fragment length/u);
  assert.throws(() => decodeRtcmFragmentBatchV1(Buffer.concat([encoded, Buffer.from([0])])), /trailing bytes/u);
  assert.throws(
    () => encodeRtcmFragmentBatchV1([Buffer.alloc(600), Buffer.alloc(600)]),
    /field-link payload bound/u
  );
});
