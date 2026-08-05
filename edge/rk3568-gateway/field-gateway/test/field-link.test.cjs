const assert = require("node:assert/strict");
const test = require("node:test");

const {
  FIELD_LINK_MAX_PAYLOAD_BYTES,
  createCobsCrcFieldLinkAssembler,
  encodeFieldLinkFrame
} = require("../dist/field-link.js");

test("field-link enforces the RK2206 1024-byte payload contract", () => {
  const payload = Buffer.alloc(FIELD_LINK_MAX_PAYLOAD_BYTES, 0xa5);
  const frame = encodeFieldLinkFrame({ frameType: "rtcm", sequence: 7, payloadBytes: payload });
  const decoded = createCobsCrcFieldLinkAssembler().push(frame);

  assert.equal(decoded.errors.length, 0);
  assert.equal(decoded.payloads.length, 1);
  assert.deepEqual(decoded.payloads[0].rawPayloadBytes, payload);
  assert.throws(
    () => encodeFieldLinkFrame({
      frameType: "rtcm",
      sequence: 8,
      payloadBytes: Buffer.alloc(FIELD_LINK_MAX_PAYLOAD_BYTES + 1)
    }),
    /field-link payload exceeds 1024 bytes/u
  );
});
