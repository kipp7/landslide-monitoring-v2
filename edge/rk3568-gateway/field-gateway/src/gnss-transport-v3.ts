export const GNSS_TRANSPORT_VERSION = 3;
export const GNSS_V3_COMMON_HEADER_BYTES = 28;
export const GNSS_CORE_V3_PAYLOAD_BYTES = 98;
export const RTCM_FRAGMENT_V3_HEADER_BYTES = 42;
export const RTCM3_MAX_FRAME_BYTES = 1029;
export const GNSS_PROBE_STATS_QUERY_V1_BYTES = 12;
export const GNSS_PROBE_STATS_RESPONSE_V1_BYTES = 92;

export const GNSS_V3_TARGET_GATEWAY = 0;
export const GNSS_V3_TARGET_NODE_A = 1 << 0;
export const GNSS_V3_TARGET_NODE_B = 1 << 1;
export const GNSS_V3_TARGET_NODE_C = 1 << 2;
export const GNSS_V3_TARGET_ALL_NODES =
  GNSS_V3_TARGET_NODE_A | GNSS_V3_TARGET_NODE_B | GNSS_V3_TARGET_NODE_C;

export const GNSS_V3_FLAG_CACHED_REFERENCE = 1 << 0;

export const GNSS_CORE_FIX_NMEA_CHECKSUM_VALID = 1 << 0;
export const GNSS_CORE_FIX_TRUSTED = 1 << 1;
export const GNSS_CORE_FIX_TIME_VALID = 1 << 2;
export const GNSS_CORE_FIX_GST_VALID = 1 << 3;
export const GNSS_CORE_FIX_CN0_VALID = 1 << 4;
export const GNSS_CORE_FIX_CORRECTION_AGE_VALID = 1 << 5;

export type GnssCoordinateFrameV3 = 1 | 2;
export type RtcmMessageClassV3 = 1 | 2 | 3;

export type GnssTransportHeaderV3 = {
  flags: number;
  sourceNode: number;
  targetMask: number;
  priority: number;
  sessionEpoch: number;
  sequence: number;
  generatedUnixMs: number;
  ttlMs: number;
};

export type GnssCoreV3 = GnssTransportHeaderV3 & {
  coordinateFrame: GnssCoordinateFrameV3;
  ggaQuality: number;
  fixFlags: number;
  gnssWeek: number;
  satellitesUsed: number;
  satellitesVisible: number;
  gnssTowMs: number;
  latitudeE9: number;
  longitudeE9: number;
  altitudeMslMm: number;
  geoidSeparationMm: number;
  correctionAgeMs: number;
  solutionAgeMs: number;
  hdopX100: number;
  pdopX100: number;
  vdopX100: number;
  gstSigmaLatMm: number;
  gstSigmaLonMm: number;
  gstSigmaAltMm: number;
  cn0MeanDbhzX10: number;
  cn0MedianDbhzX10: number;
  cn0MinDbhzX10: number;
  fixStreakS: number;
  fixedRatio1mPermille: number;
  fixDropCount: number;
  referenceStationId: number;
};

export type RtcmFragmentV3 = GnssTransportHeaderV3 & {
  messageType: number;
  messageClass: RtcmMessageClassV3;
  fragmentIndex: number;
  fragmentCount: number;
  totalBytes: number;
  fragmentOffset: number;
  frameCrc24q: number;
  data: Buffer;
};

export type RtcmFrameInfo = {
  messageType: number;
  payloadBytes: number;
  frameBytes: number;
  crc24q: number;
};

export type GnssProbeStatsV1 = {
  acceptedFragments: number;
  duplicateFragments: number;
  rejectedFragments: number;
  completedFrames: number;
  crcErrors: number;
  expiredAssemblies: number;
  capacityEvictions: number;
  ttlUnverifiedFragments: number;
  queuedFrames: number;
  queueEvictions: number;
  queueExpiredFrames: number;
  probeValidatedFrames: number;
  probeValidatedBytes: number;
  injectedFrames: number;
  injectedBytes: number;
  uartWriteErrors: number;
  uartPartialWrites: number;
  injectionDroppedFrames: number;
  queueHighWatermark: number;
  queuePending: number;
};

export type GnssProbeStatsResponseV1 = {
  responseVersion: 1;
  nodeNumber: 1 | 2 | 3;
  injectionMode: 0 | 1 | 2;
  nonce: number;
  snapshotUptimeS: number;
  stats: GnssProbeStatsV1;
};

const UINT8_MAX = 0xff;
const UINT16_MAX = 0xffff;
const UINT32_MAX = 0xffffffff;
const INT32_MIN = -0x80000000;
const INT32_MAX = 0x7fffffff;
const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);

function assertIntegerRange(name: string, value: number, minimum: number, maximum: number): void {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer in [${String(minimum)}, ${String(maximum)}]`);
  }
}

function assertSafeIntegerRange(name: string, value: number, minimum: number, maximum: number): void {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be a safe integer in [${String(minimum)}, ${String(maximum)}]`);
  }
}

export function encodeGnssProbeStatsQueryV1(nodeNumber: 1 | 2 | 3, nonce: number): Buffer {
  assertIntegerRange("nodeNumber", nodeNumber, 1, 3);
  assertIntegerRange("nonce", nonce, 1, UINT32_MAX);
  const nodeLabel = String.fromCharCode(0x40 + nodeNumber);
  const nonceHex = (nonce >>> 0).toString(16).toUpperCase().padStart(8, "0");
  return Buffer.from(`G3Q${nodeLabel}${nonceHex}`, "ascii");
}

export function decodeGnssProbeStatsResponseV1(input: Buffer): GnssProbeStatsResponseV1 {
  if (input.length !== GNSS_PROBE_STATS_RESPONSE_V1_BYTES) {
    throw new Error(
      `GNSS PROBE stats payload length mismatch: expected=${String(GNSS_PROBE_STATS_RESPONSE_V1_BYTES)} actual=${String(input.length)}`
    );
  }
  if (input.subarray(0, 3).toString("ascii") !== "G3S" || input.readUInt8(3) !== 1) {
    throw new Error("GNSS PROBE stats magic or version mismatch");
  }
  const nodeNumber = input.readUInt8(4);
  const injectionMode = input.readUInt8(5);
  if (nodeNumber < 1 || nodeNumber > 3 || injectionMode > 2) {
    throw new Error("GNSS PROBE stats node or injection mode is invalid");
  }
  if (input.readUInt16BE(6) !== 0) {
    throw new Error("GNSS PROBE stats reserved bytes must be zero");
  }
  const nonce = input.readUInt32BE(8);
  if (nonce === 0) {
    throw new Error("GNSS PROBE stats nonce must be non-zero");
  }
  const counterNames: Array<keyof Omit<GnssProbeStatsV1, "queueHighWatermark" | "queuePending">> = [
    "acceptedFragments", "duplicateFragments", "rejectedFragments", "completedFrames",
    "crcErrors", "expiredAssemblies", "capacityEvictions", "ttlUnverifiedFragments",
    "queuedFrames", "queueEvictions", "queueExpiredFrames", "probeValidatedFrames",
    "probeValidatedBytes", "injectedFrames", "injectedBytes", "uartWriteErrors",
    "uartPartialWrites", "injectionDroppedFrames"
  ];
  const counters = Object.fromEntries(
    counterNames.map((name, index) => [name, input.readUInt32BE(16 + index * 4)])
  ) as Omit<GnssProbeStatsV1, "queueHighWatermark" | "queuePending">;
  return {
    responseVersion: 1,
    nodeNumber: nodeNumber as 1 | 2 | 3,
    injectionMode: injectionMode as 0 | 1 | 2,
    nonce,
    snapshotUptimeS: input.readUInt32BE(12),
    stats: {
      ...counters,
      queueHighWatermark: input.readUInt16BE(88),
      queuePending: input.readUInt16BE(90)
    }
  };
}

function encodeCommonHeader(input: GnssTransportHeaderV3, output: Buffer): void {
  if (output.length < GNSS_V3_COMMON_HEADER_BYTES) {
    throw new Error("GNSS V3 output is shorter than the common header");
  }
  assertIntegerRange("flags", input.flags, 0, UINT8_MAX);
  assertIntegerRange("sourceNode", input.sourceNode, 0, 3);
  assertIntegerRange("targetMask", input.targetMask, 0, GNSS_V3_TARGET_ALL_NODES);
  assertIntegerRange("priority", input.priority, 0, UINT8_MAX);
  assertIntegerRange("sessionEpoch", input.sessionEpoch, 0, UINT32_MAX);
  assertIntegerRange("sequence", input.sequence, 0, UINT32_MAX);
  assertSafeIntegerRange("generatedUnixMs", input.generatedUnixMs, 0, Number.MAX_SAFE_INTEGER);
  assertIntegerRange("ttlMs", input.ttlMs, 1, UINT32_MAX);

  output.writeUInt8(0x47, 0);
  output.writeUInt8(0x33, 1);
  output.writeUInt8(GNSS_TRANSPORT_VERSION, 2);
  output.writeUInt8(GNSS_V3_COMMON_HEADER_BYTES, 3);
  output.writeUInt8(input.flags, 4);
  output.writeUInt8(input.sourceNode, 5);
  output.writeUInt8(input.targetMask, 6);
  output.writeUInt8(input.priority, 7);
  output.writeUInt32BE(input.sessionEpoch >>> 0, 8);
  output.writeUInt32BE(input.sequence >>> 0, 12);
  output.writeBigUInt64BE(BigInt(input.generatedUnixMs), 16);
  output.writeUInt32BE(input.ttlMs >>> 0, 24);
}

function decodeCommonHeader(input: Buffer): GnssTransportHeaderV3 {
  if (input.length < GNSS_V3_COMMON_HEADER_BYTES) {
    throw new Error("GNSS V3 payload is shorter than the common header");
  }
  if (input.readUInt8(0) !== 0x47 || input.readUInt8(1) !== 0x33) {
    throw new Error("GNSS V3 magic mismatch");
  }
  if (input.readUInt8(2) !== GNSS_TRANSPORT_VERSION) {
    throw new Error(`unsupported GNSS transport version: ${String(input.readUInt8(2))}`);
  }
  if (input.readUInt8(3) !== GNSS_V3_COMMON_HEADER_BYTES) {
    throw new Error(`unsupported GNSS V3 header size: ${String(input.readUInt8(3))}`);
  }
  const generatedUnixMsBig = input.readBigUInt64BE(16);
  if (generatedUnixMsBig > MAX_SAFE_BIGINT) {
    throw new Error("GNSS V3 generated time exceeds JavaScript safe integer range");
  }
  const sourceNode = input.readUInt8(5);
  const targetMask = input.readUInt8(6);
  if (sourceNode > 3) {
    throw new Error(`invalid GNSS V3 source node: ${String(sourceNode)}`);
  }
  if ((targetMask & ~GNSS_V3_TARGET_ALL_NODES) !== 0) {
    throw new Error(`invalid GNSS V3 target mask: ${String(targetMask)}`);
  }

  return {
    flags: input.readUInt8(4),
    sourceNode,
    targetMask,
    priority: input.readUInt8(7),
    sessionEpoch: input.readUInt32BE(8),
    sequence: input.readUInt32BE(12),
    generatedUnixMs: Number(generatedUnixMsBig),
    ttlMs: input.readUInt32BE(24)
  };
}

export function targetMaskForNode(nodeNumber: 1 | 2 | 3): number {
  return 1 << (nodeNumber - 1);
}

export function targetMaskIncludesNode(targetMask: number, nodeNumber: 1 | 2 | 3): boolean {
  return (targetMask & targetMaskForNode(nodeNumber)) !== 0;
}

export function encodeGnssCoreV3(input: GnssCoreV3): Buffer {
  if (input.sourceNode < 1 || input.sourceNode > 3 || input.targetMask !== GNSS_V3_TARGET_GATEWAY) {
    throw new Error("GNSS_CORE must originate from node A/B/C and target the gateway");
  }
  if (input.sessionEpoch === 0 || input.ttlMs > 10_000) {
    throw new Error("GNSS_CORE requires a non-zero session epoch and ttlMs <= 10000");
  }
  assertIntegerRange("coordinateFrame", input.coordinateFrame, 1, 2);
  assertIntegerRange("ggaQuality", input.ggaQuality, 0, UINT8_MAX);
  assertIntegerRange("fixFlags", input.fixFlags, 0, UINT16_MAX);
  assertIntegerRange("gnssWeek", input.gnssWeek, 0, UINT16_MAX);
  assertIntegerRange("satellitesUsed", input.satellitesUsed, 0, UINT8_MAX);
  assertIntegerRange("satellitesVisible", input.satellitesVisible, 0, UINT8_MAX);
  assertIntegerRange("gnssTowMs", input.gnssTowMs, 0, UINT32_MAX);
  assertSafeIntegerRange("latitudeE9", input.latitudeE9, -90_000_000_000, 90_000_000_000);
  assertSafeIntegerRange("longitudeE9", input.longitudeE9, -180_000_000_000, 180_000_000_000);
  assertIntegerRange("altitudeMslMm", input.altitudeMslMm, INT32_MIN, INT32_MAX);
  assertIntegerRange("geoidSeparationMm", input.geoidSeparationMm, INT32_MIN, INT32_MAX);
  assertIntegerRange("correctionAgeMs", input.correctionAgeMs, 0, UINT32_MAX);
  assertIntegerRange("solutionAgeMs", input.solutionAgeMs, 0, UINT32_MAX);
  for (const [name, value] of Object.entries({
    hdopX100: input.hdopX100,
    pdopX100: input.pdopX100,
    vdopX100: input.vdopX100,
    gstSigmaLatMm: input.gstSigmaLatMm,
    gstSigmaLonMm: input.gstSigmaLonMm,
    gstSigmaAltMm: input.gstSigmaAltMm,
    cn0MeanDbhzX10: input.cn0MeanDbhzX10,
    cn0MedianDbhzX10: input.cn0MedianDbhzX10,
    cn0MinDbhzX10: input.cn0MinDbhzX10,
    fixStreakS: input.fixStreakS,
    fixedRatio1mPermille: input.fixedRatio1mPermille,
    fixDropCount: input.fixDropCount,
    referenceStationId: input.referenceStationId
  })) {
    assertIntegerRange(name, value, 0, UINT16_MAX);
  }
  assertIntegerRange("fixedRatio1mPermille", input.fixedRatio1mPermille, 0, 1000);

  const output = Buffer.alloc(GNSS_CORE_V3_PAYLOAD_BYTES);
  encodeCommonHeader(input, output);
  output.writeUInt8(input.coordinateFrame, 28);
  output.writeUInt8(input.ggaQuality, 29);
  output.writeUInt16BE(input.fixFlags, 30);
  output.writeUInt16BE(input.gnssWeek, 32);
  output.writeUInt8(input.satellitesUsed, 34);
  output.writeUInt8(input.satellitesVisible, 35);
  output.writeUInt32BE(input.gnssTowMs >>> 0, 36);
  output.writeBigInt64BE(BigInt(input.latitudeE9), 40);
  output.writeBigInt64BE(BigInt(input.longitudeE9), 48);
  output.writeInt32BE(input.altitudeMslMm, 56);
  output.writeInt32BE(input.geoidSeparationMm, 60);
  output.writeUInt32BE(input.correctionAgeMs >>> 0, 64);
  output.writeUInt32BE(input.solutionAgeMs >>> 0, 68);
  output.writeUInt16BE(input.hdopX100, 72);
  output.writeUInt16BE(input.pdopX100, 74);
  output.writeUInt16BE(input.vdopX100, 76);
  output.writeUInt16BE(input.gstSigmaLatMm, 78);
  output.writeUInt16BE(input.gstSigmaLonMm, 80);
  output.writeUInt16BE(input.gstSigmaAltMm, 82);
  output.writeUInt16BE(input.cn0MeanDbhzX10, 84);
  output.writeUInt16BE(input.cn0MedianDbhzX10, 86);
  output.writeUInt16BE(input.cn0MinDbhzX10, 88);
  output.writeUInt16BE(input.fixStreakS, 90);
  output.writeUInt16BE(input.fixedRatio1mPermille, 92);
  output.writeUInt16BE(input.fixDropCount, 94);
  output.writeUInt16BE(input.referenceStationId, 96);
  return output;
}

export function decodeGnssCoreV3(input: Buffer): GnssCoreV3 {
  if (input.length !== GNSS_CORE_V3_PAYLOAD_BYTES) {
    throw new Error(
      `GNSS_CORE V3 payload length mismatch: expected=${String(GNSS_CORE_V3_PAYLOAD_BYTES)} actual=${String(input.length)}`
    );
  }
  const common = decodeCommonHeader(input);
  if (common.sourceNode < 1 || common.sourceNode > 3 || common.targetMask !== GNSS_V3_TARGET_GATEWAY) {
    throw new Error("GNSS_CORE must originate from node A/B/C and target the gateway");
  }
  const coordinateFrame = input.readUInt8(28);
  if (coordinateFrame !== 1 && coordinateFrame !== 2) {
    throw new Error(`unsupported GNSS coordinate frame: ${String(coordinateFrame)}`);
  }
  const latitudeE9 = Number(input.readBigInt64BE(40));
  const longitudeE9 = Number(input.readBigInt64BE(48));
  if (!Number.isSafeInteger(latitudeE9) || Math.abs(latitudeE9) > 90_000_000_000) {
    throw new Error("GNSS_CORE latitude_e9 is out of range");
  }
  if (!Number.isSafeInteger(longitudeE9) || Math.abs(longitudeE9) > 180_000_000_000) {
    throw new Error("GNSS_CORE longitude_e9 is out of range");
  }

  return {
    ...common,
    coordinateFrame,
    ggaQuality: input.readUInt8(29),
    fixFlags: input.readUInt16BE(30),
    gnssWeek: input.readUInt16BE(32),
    satellitesUsed: input.readUInt8(34),
    satellitesVisible: input.readUInt8(35),
    gnssTowMs: input.readUInt32BE(36),
    latitudeE9,
    longitudeE9,
    altitudeMslMm: input.readInt32BE(56),
    geoidSeparationMm: input.readInt32BE(60),
    correctionAgeMs: input.readUInt32BE(64),
    solutionAgeMs: input.readUInt32BE(68),
    hdopX100: input.readUInt16BE(72),
    pdopX100: input.readUInt16BE(74),
    vdopX100: input.readUInt16BE(76),
    gstSigmaLatMm: input.readUInt16BE(78),
    gstSigmaLonMm: input.readUInt16BE(80),
    gstSigmaAltMm: input.readUInt16BE(82),
    cn0MeanDbhzX10: input.readUInt16BE(84),
    cn0MedianDbhzX10: input.readUInt16BE(86),
    cn0MinDbhzX10: input.readUInt16BE(88),
    fixStreakS: input.readUInt16BE(90),
    fixedRatio1mPermille: input.readUInt16BE(92),
    fixDropCount: input.readUInt16BE(94),
    referenceStationId: input.readUInt16BE(96)
  };
}

export function crc24q(input: Buffer): number {
  let crc = 0;
  for (const byte of input) {
    crc ^= byte << 16;
    for (let bit = 0; bit < 8; bit += 1) {
      crc <<= 1;
      if ((crc & 0x1000000) !== 0) {
        crc ^= 0x1864cfb;
      }
    }
  }
  return crc & 0xffffff;
}

export function inspectRtcm3Frame(frame: Buffer): RtcmFrameInfo {
  if (frame.length < 8 || frame.readUInt8(0) !== 0xd3) {
    throw new Error("RTCM3 frame preamble or minimum length is invalid");
  }
  if ((frame.readUInt8(1) & 0xfc) !== 0) {
    throw new Error("RTCM3 reserved header bits are non-zero");
  }
  const payloadBytes = ((frame.readUInt8(1) & 0x03) << 8) | frame.readUInt8(2);
  const expectedFrameBytes = payloadBytes + 6;
  if (frame.length !== expectedFrameBytes) {
    throw new Error(
      `RTCM3 frame length mismatch: expected=${String(expectedFrameBytes)} actual=${String(frame.length)}`
    );
  }
  if (payloadBytes < 2) {
    throw new Error("RTCM3 payload is too short to contain a message type");
  }
  const expectedCrc = frame.readUIntBE(frame.length - 3, 3);
  const actualCrc = crc24q(frame.subarray(0, frame.length - 3));
  if (expectedCrc !== actualCrc) {
    throw new Error(
      `RTCM3 CRC24Q mismatch: expected=0x${expectedCrc.toString(16)} actual=0x${actualCrc.toString(16)}`
    );
  }
  return {
    messageType: (frame.readUInt8(3) << 4) | (frame.readUInt8(4) >>> 4),
    payloadBytes,
    frameBytes: frame.length,
    crc24q: actualCrc
  };
}

export function classifyRtcmMessageType(messageType: number): RtcmMessageClassV3 {
  if (messageType >= 1071 && messageType <= 1137) {
    return 1;
  }
  if ([1005, 1006, 1007, 1008, 1033].includes(messageType)) {
    return 2;
  }
  return 3;
}

export function defaultRtcmTtlMs(messageClass: RtcmMessageClassV3): number {
  if (messageClass === 1) return 3000;
  if (messageClass === 2) return 600_000;
  return 30_000;
}

export function maxRtcmTtlMs(messageClass: RtcmMessageClassV3): number {
  if (messageClass === 1) return 5000;
  if (messageClass === 2) return 3_600_000;
  return 120_000;
}

export function fragmentRtcmFrameV3(params: {
  frame: Buffer;
  sessionEpoch: number;
  sequence: number;
  generatedUnixMs: number;
  targetMask?: number;
  priority?: number;
  flags?: number;
  ttlMs?: number;
  maxFragmentDataBytes: number;
}): RtcmFragmentV3[] {
  const info = inspectRtcm3Frame(params.frame);
  assertIntegerRange("maxFragmentDataBytes", params.maxFragmentDataBytes, 1, UINT16_MAX);
  const fragmentCount = Math.ceil(params.frame.length / params.maxFragmentDataBytes);
  assertIntegerRange("fragmentCount", fragmentCount, 1, UINT8_MAX);
  const messageClass = classifyRtcmMessageType(info.messageType);
  const targetMask = params.targetMask ?? GNSS_V3_TARGET_ALL_NODES;
  if (targetMask === GNSS_V3_TARGET_GATEWAY) {
    throw new Error("RTCM downlink target mask must include at least one field node");
  }
  const common: GnssTransportHeaderV3 = {
    flags: params.flags ?? (messageClass === 2 ? GNSS_V3_FLAG_CACHED_REFERENCE : 0),
    sourceNode: 0,
    targetMask,
    priority: params.priority ?? 1,
    sessionEpoch: params.sessionEpoch,
    sequence: params.sequence,
    generatedUnixMs: params.generatedUnixMs,
    ttlMs: params.ttlMs ?? defaultRtcmTtlMs(messageClass)
  };

  return Array.from({ length: fragmentCount }, (_, fragmentIndex) => {
    const fragmentOffset = fragmentIndex * params.maxFragmentDataBytes;
    return {
      ...common,
      messageType: info.messageType,
      messageClass,
      fragmentIndex,
      fragmentCount,
      totalBytes: params.frame.length,
      fragmentOffset,
      frameCrc24q: info.crc24q,
      data: Buffer.from(
        params.frame.subarray(fragmentOffset, Math.min(fragmentOffset + params.maxFragmentDataBytes, params.frame.length))
      )
    };
  });
}

export function encodeRtcmFragmentV3(input: RtcmFragmentV3): Buffer {
  if (input.sourceNode !== 0 || input.targetMask === GNSS_V3_TARGET_GATEWAY) {
    throw new Error("RTCM V3 must originate from the gateway and target at least one field node");
  }
  assertIntegerRange("messageType", input.messageType, 1, 4095);
  assertIntegerRange("messageClass", input.messageClass, 1, 3);
  if (input.sessionEpoch === 0) {
    throw new Error("RTCM V3 requires a non-zero session epoch");
  }
  if (classifyRtcmMessageType(input.messageType) !== input.messageClass) {
    throw new Error("RTCM message class does not match its message type");
  }
  if (input.ttlMs > maxRtcmTtlMs(input.messageClass)) {
    throw new Error("RTCM ttlMs exceeds the message-class safety limit");
  }
  assertIntegerRange("fragmentIndex", input.fragmentIndex, 0, UINT8_MAX);
  assertIntegerRange("fragmentCount", input.fragmentCount, 1, UINT8_MAX);
  if (input.fragmentIndex >= input.fragmentCount) {
    throw new Error("RTCM fragment index must be less than fragment count");
  }
  assertIntegerRange("totalBytes", input.totalBytes, 1, RTCM3_MAX_FRAME_BYTES);
  assertIntegerRange("fragmentOffset", input.fragmentOffset, 0, UINT16_MAX);
  assertIntegerRange("frameCrc24q", input.frameCrc24q, 0, 0xffffff);
  if (input.data.length === 0 || input.fragmentOffset + input.data.length > input.totalBytes) {
    throw new Error("RTCM fragment data range is invalid");
  }

  const output = Buffer.alloc(RTCM_FRAGMENT_V3_HEADER_BYTES + input.data.length);
  encodeCommonHeader(input, output);
  output.writeUInt16BE(input.messageType, 28);
  output.writeUInt8(input.messageClass, 30);
  output.writeUInt8(input.fragmentIndex, 31);
  output.writeUInt8(input.fragmentCount, 32);
  output.writeUInt8(0, 33);
  output.writeUInt16BE(input.totalBytes, 34);
  output.writeUInt16BE(input.fragmentOffset, 36);
  output.writeUInt32BE(input.frameCrc24q, 38);
  input.data.copy(output, RTCM_FRAGMENT_V3_HEADER_BYTES);
  return output;
}

export function decodeRtcmFragmentV3(input: Buffer): RtcmFragmentV3 {
  if (input.length <= RTCM_FRAGMENT_V3_HEADER_BYTES) {
    throw new Error("RTCM V3 fragment has no data");
  }
  const common = decodeCommonHeader(input);
  const fragment: RtcmFragmentV3 = {
    ...common,
    messageType: input.readUInt16BE(28),
    messageClass: input.readUInt8(30) as RtcmMessageClassV3,
    fragmentIndex: input.readUInt8(31),
    fragmentCount: input.readUInt8(32),
    totalBytes: input.readUInt16BE(34),
    fragmentOffset: input.readUInt16BE(36),
    frameCrc24q: input.readUInt32BE(38),
    data: Buffer.from(input.subarray(RTCM_FRAGMENT_V3_HEADER_BYTES))
  };
  encodeRtcmFragmentV3(fragment);
  if (input.readUInt8(33) !== 0) {
    throw new Error("RTCM V3 reserved byte is non-zero");
  }
  return fragment;
}

type PendingRtcmMessage = {
  fragment: RtcmFragmentV3;
  firstSeenMs: number;
  fragments: Map<number, { offset: number; data: Buffer }>;
};

export type RtcmReassemblyResult =
  | { status: "accepted"; sequence: number }
  | { status: "duplicate"; sequence: number }
  | { status: "complete"; sequence: number; frame: Buffer; info: RtcmFrameInfo }
  | { status: "rejected"; sequence: number | null; reason: string };

export type RtcmReassemblerStats = {
  acceptedFragments: number;
  duplicateFragments: number;
  completedFrames: number;
  rejectedFragments: number;
  expiredAssemblies: number;
  capacityEvictions: number;
};

export class RtcmReassemblerV3 {
  private activeSessionEpoch: number | null = null;
  private highestSequence: number | null = null;
  private readonly pending = new Map<number, PendingRtcmMessage>();
  private readonly completed = new Map<number, number>();
  private readonly counters: RtcmReassemblerStats = {
    acceptedFragments: 0,
    duplicateFragments: 0,
    completedFrames: 0,
    rejectedFragments: 0,
    expiredAssemblies: 0,
    capacityEvictions: 0
  };

  constructor(
    private readonly config: {
      localNode: 1 | 2 | 3;
      maxInflightMessages?: number;
      maxMessageBytes?: number;
      maxFragmentsPerMessage?: number;
      maxSequenceLag?: number;
      reassemblyTimeoutMs?: number;
      maxFutureSkewMs?: number;
      completedRetentionMs?: number;
    }
  ) {}

  stats(): RtcmReassemblerStats & { activeSessionEpoch: number | null; pendingMessages: number } {
    return {
      ...this.counters,
      activeSessionEpoch: this.activeSessionEpoch,
      pendingMessages: this.pending.size
    };
  }

  push(payload: Buffer, nowUnixMs: number): RtcmReassemblyResult {
    this.expireState(nowUnixMs);
    let fragment: RtcmFragmentV3;
    try {
      fragment = decodeRtcmFragmentV3(payload);
    } catch (err) {
      return this.reject(null, err instanceof Error ? err.message : String(err));
    }
    const sequence = fragment.sequence;
    const maxMessageBytes = this.config.maxMessageBytes ?? RTCM3_MAX_FRAME_BYTES;
    const maxFragments = this.config.maxFragmentsPerMessage ?? 32;
    if (!targetMaskIncludesNode(fragment.targetMask, this.config.localNode)) {
      return this.reject(sequence, "fragment_not_targeted_to_local_node");
    }
    if (fragment.totalBytes > maxMessageBytes || fragment.fragmentCount > maxFragments) {
      return this.reject(sequence, "fragment_exceeds_reassembly_bounds");
    }
    if (fragment.generatedUnixMs > nowUnixMs + (this.config.maxFutureSkewMs ?? 2000)) {
      return this.reject(sequence, "fragment_generated_in_future");
    }
    if (nowUnixMs - fragment.generatedUnixMs > fragment.ttlMs) {
      return this.reject(sequence, "fragment_ttl_expired");
    }
    if (!this.acceptSession(fragment.sessionEpoch)) {
      return this.reject(sequence, "stale_session_epoch");
    }
    if (!this.acceptSequence(sequence)) {
      return this.reject(sequence, "stale_sequence");
    }
    if (this.completed.has(sequence)) {
      this.counters.duplicateFragments += 1;
      return { status: "duplicate", sequence };
    }

    let pending = this.pending.get(sequence);
    if (!pending) {
      this.ensureCapacity();
      pending = {
        fragment,
        firstSeenMs: nowUnixMs,
        fragments: new Map()
      };
      this.pending.set(sequence, pending);
    } else if (!this.metadataMatches(pending.fragment, fragment)) {
      this.pending.delete(sequence);
      return this.reject(sequence, "fragment_metadata_conflict");
    }

    const duplicate = pending.fragments.get(fragment.fragmentIndex);
    if (duplicate) {
      if (duplicate.offset !== fragment.fragmentOffset || !duplicate.data.equals(fragment.data)) {
        this.pending.delete(sequence);
        return this.reject(sequence, "fragment_duplicate_conflict");
      }
      this.counters.duplicateFragments += 1;
      return { status: "duplicate", sequence };
    }
    for (const existing of pending.fragments.values()) {
      const existingEnd = existing.offset + existing.data.length;
      const fragmentEnd = fragment.fragmentOffset + fragment.data.length;
      if (fragment.fragmentOffset < existingEnd && existing.offset < fragmentEnd) {
        this.pending.delete(sequence);
        return this.reject(sequence, "fragment_ranges_overlap");
      }
    }

    pending.fragments.set(fragment.fragmentIndex, {
      offset: fragment.fragmentOffset,
      data: Buffer.from(fragment.data)
    });
    this.counters.acceptedFragments += 1;
    if (pending.fragments.size !== fragment.fragmentCount) {
      return { status: "accepted", sequence };
    }

    const ordered = Array.from(pending.fragments.values()).sort((left, right) => left.offset - right.offset);
    let cursor = 0;
    for (const part of ordered) {
      if (part.offset !== cursor) {
        this.pending.delete(sequence);
        return this.reject(sequence, "fragment_coverage_has_gap");
      }
      cursor += part.data.length;
    }
    if (cursor !== fragment.totalBytes) {
      this.pending.delete(sequence);
      return this.reject(sequence, "fragment_coverage_length_mismatch");
    }
    const frame = Buffer.concat(ordered.map((part) => part.data), fragment.totalBytes);
    let info: RtcmFrameInfo;
    try {
      info = inspectRtcm3Frame(frame);
    } catch (err) {
      this.pending.delete(sequence);
      return this.reject(sequence, err instanceof Error ? err.message : String(err));
    }
    if (info.messageType !== fragment.messageType || info.crc24q !== fragment.frameCrc24q) {
      this.pending.delete(sequence);
      return this.reject(sequence, "reassembled_rtcm_metadata_mismatch");
    }

    this.pending.delete(sequence);
    this.completed.set(sequence, nowUnixMs);
    this.counters.completedFrames += 1;
    return { status: "complete", sequence, frame, info };
  }

  private reject(sequence: number | null, reason: string): RtcmReassemblyResult {
    this.counters.rejectedFragments += 1;
    return { status: "rejected", sequence, reason };
  }

  private acceptSession(sessionEpoch: number): boolean {
    if (this.activeSessionEpoch === null) {
      this.activeSessionEpoch = sessionEpoch;
      return true;
    }
    if (sessionEpoch === this.activeSessionEpoch) return true;
    if (!isUint32Newer(sessionEpoch, this.activeSessionEpoch)) return false;
    this.activeSessionEpoch = sessionEpoch;
    this.highestSequence = null;
    this.pending.clear();
    this.completed.clear();
    return true;
  }

  private acceptSequence(sequence: number): boolean {
    if (this.highestSequence === null || isUint32Newer(sequence, this.highestSequence)) {
      this.highestSequence = sequence;
      return true;
    }
    if (sequence === this.highestSequence) return true;
    const lag = (this.highestSequence - sequence) >>> 0;
    return lag <= (this.config.maxSequenceLag ?? 8);
  }

  private metadataMatches(left: RtcmFragmentV3, right: RtcmFragmentV3): boolean {
    return (
      left.sessionEpoch === right.sessionEpoch &&
      left.sequence === right.sequence &&
      left.messageType === right.messageType &&
      left.messageClass === right.messageClass &&
      left.fragmentCount === right.fragmentCount &&
      left.totalBytes === right.totalBytes &&
      left.frameCrc24q === right.frameCrc24q &&
      left.generatedUnixMs === right.generatedUnixMs &&
      left.ttlMs === right.ttlMs &&
      left.targetMask === right.targetMask &&
      left.flags === right.flags
    );
  }

  private ensureCapacity(): void {
    const maxInflight = this.config.maxInflightMessages ?? 4;
    if (this.pending.size < maxInflight) return;
    const oldest = Array.from(this.pending.entries()).sort((left, right) => left[1].firstSeenMs - right[1].firstSeenMs)[0];
    if (oldest) {
      this.pending.delete(oldest[0]);
      this.counters.capacityEvictions += 1;
    }
  }

  private expireState(nowUnixMs: number): void {
    const timeoutMs = this.config.reassemblyTimeoutMs ?? 1500;
    for (const [sequence, pending] of this.pending.entries()) {
      if (nowUnixMs - pending.firstSeenMs > timeoutMs) {
        this.pending.delete(sequence);
        this.counters.expiredAssemblies += 1;
      }
    }
    const retentionMs = this.config.completedRetentionMs ?? 10_000;
    for (const [sequence, completedAtMs] of this.completed.entries()) {
      if (nowUnixMs - completedAtMs > retentionMs) {
        this.completed.delete(sequence);
      }
    }
  }
}

function isUint32Newer(candidate: number, reference: number): boolean {
  const delta = (candidate - reference) >>> 0;
  return delta !== 0 && delta < 0x80000000;
}
