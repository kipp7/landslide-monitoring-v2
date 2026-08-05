import { FIELD_LINK_MAX_PAYLOAD_BYTES } from "./field-link";

export const RTCM_FRAGMENT_BATCH_HEADER_BYTES = 8;
export const RTCM_FRAGMENT_BATCH_MAX_ENTRIES = 4;
export const RTCM_FRAGMENT_BATCH_MAX_PAYLOAD_BYTES = FIELD_LINK_MAX_PAYLOAD_BYTES;

const MAGIC_0 = 0x47;
const MAGIC_1 = 0x33;
const BATCH_MARKER = 0x42;
const BATCH_VERSION = 1;

export function isRtcmFragmentBatchV1(payload: Buffer): boolean {
  return payload.length >= RTCM_FRAGMENT_BATCH_HEADER_BYTES &&
    payload.readUInt8(0) === MAGIC_0 &&
    payload.readUInt8(1) === MAGIC_1 &&
    payload.readUInt8(2) === BATCH_MARKER &&
    payload.readUInt8(3) === BATCH_VERSION;
}

export function encodeRtcmFragmentBatchV1(fragments: readonly Buffer[]): Buffer {
  if (fragments.length < 2 || fragments.length > RTCM_FRAGMENT_BATCH_MAX_ENTRIES) {
    throw new Error("RTCM fragment batch must contain 2..4 fragments");
  }
  for (const fragment of fragments) {
    if (fragment.length < 1 || fragment.length > 0xffff) {
      throw new Error("RTCM batch fragment length is outside uint16 bounds");
    }
  }

  const totalBytes = RTCM_FRAGMENT_BATCH_HEADER_BYTES +
    fragments.reduce((total, fragment) => total + 2 + fragment.length, 0);
  if (totalBytes > RTCM_FRAGMENT_BATCH_MAX_PAYLOAD_BYTES) {
    throw new Error("RTCM fragment batch exceeds the field-link payload bound");
  }

  const output = Buffer.alloc(totalBytes);
  output.writeUInt8(MAGIC_0, 0);
  output.writeUInt8(MAGIC_1, 1);
  output.writeUInt8(BATCH_MARKER, 2);
  output.writeUInt8(BATCH_VERSION, 3);
  output.writeUInt8(fragments.length, 4);
  let offset = RTCM_FRAGMENT_BATCH_HEADER_BYTES;
  for (const fragment of fragments) {
    output.writeUInt16BE(fragment.length, offset);
    offset += 2;
    fragment.copy(output, offset);
    offset += fragment.length;
  }
  return output;
}

export function decodeRtcmFragmentBatchV1(payload: Buffer): Buffer[] {
  if (payload.length > RTCM_FRAGMENT_BATCH_MAX_PAYLOAD_BYTES) {
    throw new Error("RTCM fragment batch exceeds the field-link payload bound");
  }
  if (!isRtcmFragmentBatchV1(payload)) {
    throw new Error("RTCM fragment batch magic or version mismatch");
  }
  if (payload.readUInt8(5) !== 0 || payload.readUInt16BE(6) !== 0) {
    throw new Error("RTCM fragment batch reserved bytes are non-zero");
  }
  const count = payload.readUInt8(4);
  if (count < 2 || count > RTCM_FRAGMENT_BATCH_MAX_ENTRIES) {
    throw new Error("RTCM fragment batch count is outside 2..4");
  }

  const fragments: Buffer[] = [];
  let offset = RTCM_FRAGMENT_BATCH_HEADER_BYTES;
  for (let index = 0; index < count; index += 1) {
    if (offset + 2 > payload.length) {
      throw new Error("RTCM fragment batch is truncated before a length field");
    }
    const length = payload.readUInt16BE(offset);
    offset += 2;
    if (length === 0 || offset + length > payload.length) {
      throw new Error("RTCM fragment batch contains an invalid fragment length");
    }
    fragments.push(Buffer.from(payload.subarray(offset, offset + length)));
    offset += length;
  }
  if (offset !== payload.length) {
    throw new Error("RTCM fragment batch has trailing bytes");
  }
  return fragments;
}
