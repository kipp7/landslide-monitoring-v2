export const GNSS_TRANSPORT_VERSION = 3;
export const GNSS_V3_COMMON_HEADER_BYTES = 28;
export const GNSS_CORE_V3_PAYLOAD_BYTES = 98;
export const RTCM_FRAGMENT_V3_HEADER_BYTES = 42;
export const RTCM3_MAX_FRAME_BYTES = 1029;
export const GNSS_PROBE_STATS_QUERY_V1_BYTES = 12;
export const GNSS_PROBE_STATS_RESPONSE_V1_BYTES = 92;
export const GNSS_PROBE_STATS_RESPONSE_V2_BYTES = 148;
export const GNSS_PROBE_STATS_RESPONSE_V3_BYTES = 204;
export const GNSS_PROBE_STATS_RESPONSE_V4_BYTES = 384;
export const GNSS_PROBE_STATS_RESPONSE_V5_BYTES = 552;
export const GNSS_SENSOR_DIAGNOSTIC_COUNT = 4;
export const FIELD_RS485_DIAGNOSTIC_PATH_COUNT = 4;
export const GNSS_RTCM_ACK_QUERY_V1_BYTES = 12;
export const GNSS_RTCM_ACK_RESPONSE_V1_BYTES = 24;
export const GNSS_RTCM_MODE_COMMAND_V1_BYTES = 19;

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

export type GnssProbeStatsResponseV2 = {
  responseVersion: 2;
  nodeNumber: 1 | 2 | 3;
  injectionMode: 0 | 1 | 2;
  nonce: number;
  snapshotUptimeS: number;
  stats: GnssProbeStatsV1;
  completedTypeCounts: Record<"1005" | "1033" | "1074" | "1094" | "1114" | "1124", number>;
  linkStats: {
    decodedFrames: number;
    decodedRtcmFrames: number;
    decodeErrors: number;
    sequenceGaps: number;
    sequenceDuplicates: number;
    sequenceResets: number;
    fifoDroppedBytes: number;
    fifoDropEvents: number;
  };
};

export const GNSS_SENSOR_DIAGNOSTIC_NAMES = [
  "um220Gnss",
  "rsEcthSoil",
  "rsEcthEc",
  "rsDipTilt"
] as const;

export type GnssSensorDiagnosticName = (typeof GNSS_SENSOR_DIAGNOSTIC_NAMES)[number];

export type GnssSensorDiagnostic = {
  index: number;
  mask: number;
  enabled: boolean;
  initializationSucceeded: boolean;
  currentValid: boolean;
  everSucceeded: boolean;
  sampleCount: number;
  lastSuccessUptimeS: number;
  consecutiveFailures: number;
};

export type GnssProbeStatsResponseV3 = Omit<GnssProbeStatsResponseV2, "responseVersion"> & {
  responseVersion: 3;
  sensorDiagnostics: {
    enabledMask: number;
    initializationSuccessMask: number;
    currentValidMask: number;
    everSuccessMask: number;
    sensors: Record<GnssSensorDiagnosticName, GnssSensorDiagnostic>;
  };
};

export type GnssRs485ProbeMatch = {
  found: boolean;
  channel: number;
  functionCode: number;
  slaveAddress: number;
  startRegister: number;
  registerCount: number;
  baudrate: number;
  xtalHz: number;
};

export type GnssModbusChannelDiagnostics = {
  channel: number;
  requests: number;
  successes: number;
  writeErrors: number;
  txDoneErrors: number;
  readErrors: number;
  noResponses: number;
  shortResponses: number;
  addressErrors: number;
  crcErrors: number;
  exceptionResponses: number;
  functionErrors: number;
  byteCountErrors: number;
  rxBytes: number;
  lastStatus: number;
  lastRxBytes: number;
  lastResponseAddress: number;
  lastResponseFunction: number;
  lastExceptionCode: number;
};

export type GnssProbeStatsResponseV4 = Omit<GnssProbeStatsResponseV3, "responseVersion"> & {
  responseVersion: 4;
  hardwareDiagnostics: {
    sc16is752: {
      configuredI2cAddress: number;
      detectedI2cAddress: number;
      addressFound: boolean;
      initStatus: number;
      scratchpadStatus: [number, number];
      internalLoopbackStatus: [number, number];
      uartInitStatus: [number, number];
      internalLoopbackRxBytes: [number, number];
      detectedLsr: number;
    };
    readOnlyScan: {
      started: boolean;
      completed: boolean;
      restoreOk: boolean;
      matchMask: number;
      attempts: number;
      successfulProbes: number;
      durationMs: number;
      soilQuery: GnssRs485ProbeMatch;
      tiltQuery: GnssRs485ProbeMatch;
    };
    modbusChannels: [GnssModbusChannelDiagnostics, GnssModbusChannelDiagnostics];
  };
};

export const FIELD_RS485_DIAGNOSTIC_PATH_NAMES = [
  "soil",
  "soilEc",
  "tilt",
  "rain"
] as const;

export type FieldRs485DiagnosticPathName = (typeof FIELD_RS485_DIAGNOSTIC_PATH_NAMES)[number];

export type FieldRs485PathRuntimeDiagnostics = {
  index: number;
  mask: number;
  enabled: boolean;
  currentValid: boolean;
  cycles: number;
  attempts: number;
  firstAttemptFailures: number;
  retryRecoveries: number;
  finalFailures: number;
  skippedCycles: number;
  consecutiveFinalFailures: number;
  lastEventUptimeS: number;
  lastFirstStatus: number;
  lastFinalStatus: number;
  lastAttempts: number;
  lastEventFlags: number;
};

export type GnssProbeStatsResponseV5 = Omit<GnssProbeStatsResponseV4, "responseVersion"> & {
  responseVersion: 5;
  rs485RuntimeDiagnostics: {
    enabledMask: number;
    currentValidMask: number;
    completedCycles: number;
    lastCompletedUptimeS: number;
    lastDurationMs: number;
    maxDurationMs: number;
    paths: Record<FieldRs485DiagnosticPathName, FieldRs485PathRuntimeDiagnostics>;
  };
};

export type GnssRtcmAckResponseV1 = {
  responseVersion: 1;
  nodeNumber: 1 | 2 | 3;
  injectionMode: 0 | 1 | 2;
  nonce: number;
  sessionValid: boolean;
  sessionEpoch: number;
  highestSequence: number;
  completedBitmap: number;
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

export function encodeGnssRtcmAckQueryV1(nodeNumber: 1 | 2 | 3, nonce: number): Buffer {
  assertIntegerRange("nodeNumber", nodeNumber, 1, 3);
  assertIntegerRange("nonce", nonce, 1, UINT32_MAX);
  const nodeLabel = String.fromCharCode(0x40 + nodeNumber);
  const nonceHex = (nonce >>> 0).toString(16).toUpperCase().padStart(8, "0");
  return Buffer.from(`G3A${nodeLabel}${nonceHex}`, "ascii");
}

export function encodeGnssRtcmModeCommandV1(params: {
  targetMask: number;
  mode: 0 | 1 | 2;
  sessionEpoch: number;
  leaseSeconds: number;
}): Buffer {
  assertIntegerRange("targetMask", params.targetMask, 1, GNSS_V3_TARGET_ALL_NODES);
  assertIntegerRange("mode", params.mode, 0, 2);
  assertIntegerRange("sessionEpoch", params.sessionEpoch, 0, UINT32_MAX);
  assertIntegerRange("leaseSeconds", params.leaseSeconds, 0, 300);
  if (params.mode === 0) {
    if (params.leaseSeconds !== 0) throw new Error("disabled RTCM mode requires a zero lease");
  } else if (params.sessionEpoch === 0 || params.leaseSeconds < 15) {
    throw new Error("active RTCM mode requires a non-zero session and a 15..300 second lease");
  }
  const target = params.targetMask.toString(16).toUpperCase().padStart(2, "0");
  const session = (params.sessionEpoch >>> 0).toString(16).toUpperCase().padStart(8, "0");
  const lease = params.leaseSeconds.toString(16).toUpperCase().padStart(4, "0");
  const output = Buffer.from(`G3M1${target}${String(params.mode)}${session}${lease}`, "ascii");
  if (output.length !== GNSS_RTCM_MODE_COMMAND_V1_BYTES) {
    throw new Error("RTCM mode command length invariant failed");
  }
  return output;
}

export function decodeGnssRtcmAckResponseV1(input: Buffer): GnssRtcmAckResponseV1 {
  if (
    input.length !== GNSS_RTCM_ACK_RESPONSE_V1_BYTES ||
    input.subarray(0, 3).toString("ascii") !== "G3A" ||
    input.readUInt8(3) !== 1
  ) {
    throw new Error("RTCM ACK response magic, version or length is invalid");
  }
  const nodeNumber = input.readUInt8(4);
  const injectionMode = input.readUInt8(5);
  const flags = input.readUInt8(6);
  if (nodeNumber < 1 || nodeNumber > 3 || injectionMode > 2) {
    throw new Error("RTCM ACK node or injection mode is invalid");
  }
  if ((flags & ~0x01) !== 0 || input.readUInt8(7) !== 0 || input.readUInt16BE(22) !== 0) {
    throw new Error("RTCM ACK flags or reserved bytes are invalid");
  }
  const nonce = input.readUInt32BE(8);
  const sessionEpoch = input.readUInt32BE(12);
  const highestSequence = input.readUInt32BE(16);
  const completedBitmap = input.readUInt16BE(20);
  const sessionValid = (flags & 0x01) !== 0;
  if (nonce === 0) {
    throw new Error("RTCM ACK nonce must be non-zero");
  }
  if (sessionValid && sessionEpoch === 0) {
    throw new Error("RTCM ACK valid session has a zero epoch");
  }
  if (!sessionValid && (sessionEpoch !== 0 || highestSequence !== 0 || completedBitmap !== 0)) {
    throw new Error("RTCM ACK invalid session carries state");
  }
  return {
    responseVersion: 1,
    nodeNumber: nodeNumber as 1 | 2 | 3,
    injectionMode: injectionMode as 0 | 1 | 2,
    nonce,
    sessionValid,
    sessionEpoch,
    highestSequence,
    completedBitmap
  };
}

export function gnssRtcmAckReportsCompleted(
  ack: GnssRtcmAckResponseV1,
  sessionEpoch: number,
  sequence: number
): boolean {
  assertIntegerRange("sessionEpoch", sessionEpoch, 1, UINT32_MAX);
  assertIntegerRange("sequence", sequence, 0, UINT32_MAX);
  if (!ack.sessionValid || ack.sessionEpoch !== sessionEpoch) return false;
  const delta = (ack.highestSequence - sequence) >>> 0;
  return delta < 16 && (ack.completedBitmap & (1 << delta)) !== 0;
}

export function decodeGnssProbeStatsResponse(
  input: Buffer
): GnssProbeStatsResponseV1 | GnssProbeStatsResponseV2 | GnssProbeStatsResponseV3 | GnssProbeStatsResponseV4 | GnssProbeStatsResponseV5 {
  if (input.length < 4 || input.subarray(0, 3).toString("ascii") !== "G3S") {
    throw new Error("GNSS PROBE stats magic or version mismatch");
  }
  const responseVersion = input.readUInt8(3);
  const expectedBytes =
    responseVersion === 1
      ? GNSS_PROBE_STATS_RESPONSE_V1_BYTES
      : responseVersion === 2
        ? GNSS_PROBE_STATS_RESPONSE_V2_BYTES
        : responseVersion === 3
          ? GNSS_PROBE_STATS_RESPONSE_V3_BYTES
          : responseVersion === 4
            ? GNSS_PROBE_STATS_RESPONSE_V4_BYTES
            : responseVersion === 5
              ? GNSS_PROBE_STATS_RESPONSE_V5_BYTES
              : null;
  if (expectedBytes === null) {
    throw new Error("GNSS PROBE stats version is unsupported");
  }
  if (input.length !== expectedBytes) {
    throw new Error(
      `GNSS PROBE stats payload length mismatch: expected=${String(expectedBytes)} actual=${String(input.length)}`
    );
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
  const common = {
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
  if (responseVersion === 1) {
    return { responseVersion: 1, ...common };
  }
  const typeKeys = ["1005", "1033", "1074", "1094", "1114", "1124"] as const;
  const linkKeys = [
    "decodedFrames",
    "decodedRtcmFrames",
    "decodeErrors",
    "sequenceGaps",
    "sequenceDuplicates",
    "sequenceResets",
    "fifoDroppedBytes",
    "fifoDropEvents"
  ] as const;
  const extended = {
    ...common,
    completedTypeCounts: Object.fromEntries(
      typeKeys.map((key, index) => [key, input.readUInt32BE(92 + index * 4)])
    ) as GnssProbeStatsResponseV2["completedTypeCounts"],
    linkStats: Object.fromEntries(
      linkKeys.map((key, index) => [key, input.readUInt32BE(116 + index * 4)])
    ) as GnssProbeStatsResponseV2["linkStats"]
  };
  if (responseVersion === 2) {
    return { responseVersion: 2, ...extended };
  }

  const enabledMask = input.readUInt8(148);
  const initializationSuccessMask = input.readUInt8(149);
  const currentValidMask = input.readUInt8(150);
  const everSuccessMask = input.readUInt8(151);
  const sensorCount = input.readUInt8(152);
  const allSensorMask = (1 << GNSS_SENSOR_DIAGNOSTIC_COUNT) - 1;
  if (
    sensorCount !== GNSS_SENSOR_DIAGNOSTIC_COUNT ||
    input.readUInt8(153) !== 0 ||
    input.readUInt8(154) !== 0 ||
    input.readUInt8(155) !== 0
  ) {
    throw new Error("GNSS PROBE sensor diagnostic count or reserved bytes are invalid");
  }
  if (
    ((enabledMask | initializationSuccessMask | currentValidMask | everSuccessMask) & ~allSensorMask) !== 0 ||
    (initializationSuccessMask & ~enabledMask) !== 0 ||
    (currentValidMask & ~enabledMask) !== 0 ||
    (everSuccessMask & ~enabledMask) !== 0 ||
    (currentValidMask & ~everSuccessMask) !== 0
  ) {
    throw new Error("GNSS PROBE sensor diagnostic masks are inconsistent");
  }
  const sensors = Object.fromEntries(
    GNSS_SENSOR_DIAGNOSTIC_NAMES.map((name, index) => {
      const mask = 1 << index;
      return [
        name,
        {
          index,
          mask,
          enabled: (enabledMask & mask) !== 0,
          initializationSucceeded: (initializationSuccessMask & mask) !== 0,
          currentValid: (currentValidMask & mask) !== 0,
          everSucceeded: (everSuccessMask & mask) !== 0,
          sampleCount: input.readUInt32BE(156 + index * 4),
          lastSuccessUptimeS: input.readUInt32BE(172 + index * 4),
          consecutiveFailures: input.readUInt32BE(188 + index * 4)
        }
      ];
    })
  ) as Record<GnssSensorDiagnosticName, GnssSensorDiagnostic>;
  const v3Extended = {
    ...extended,
    sensorDiagnostics: {
      enabledMask,
      initializationSuccessMask,
      currentValidMask,
      everSuccessMask,
      sensors
    }
  };
  if (responseVersion === 3) {
    return { responseVersion: 3, ...v3Extended };
  }

  if (input.readUInt8(204) !== 1 || input.readUInt16BE(218) !== 0) {
    throw new Error("GNSS PROBE SC16IS752 diagnostic schema or reserved bytes are invalid");
  }
  const addressFound = input.readUInt8(207);
  if (addressFound > 1) {
    throw new Error("GNSS PROBE SC16IS752 address-found flag is invalid");
  }
  const scanFlags = input.readUInt8(221);
  const matchMask = input.readUInt8(222);
  if (
    input.readUInt8(220) !== 1 ||
    (scanFlags & ~0x07) !== 0 ||
    (matchMask & ~0x03) !== 0 ||
    input.readUInt8(223) !== 0
  ) {
    throw new Error("GNSS PROBE RS485 scan schema, flags or match mask are invalid");
  }
  const decodeProbeMatch = (offset: number): GnssRs485ProbeMatch => {
    const foundValue = input.readUInt8(offset);
    const match: GnssRs485ProbeMatch = {
      found: foundValue === 1,
      channel: input.readUInt8(offset + 1),
      functionCode: input.readUInt8(offset + 2),
      slaveAddress: input.readUInt8(offset + 3),
      startRegister: input.readUInt16BE(offset + 4),
      registerCount: input.readUInt16BE(offset + 6),
      baudrate: input.readUInt32BE(offset + 8),
      xtalHz: input.readUInt32BE(offset + 12)
    };
    if (foundValue > 1) {
      throw new Error("GNSS PROBE RS485 match found flag is invalid");
    }
    if (
      match.found &&
      (match.channel > 1 ||
        (match.functionCode !== 3 && match.functionCode !== 4) ||
        match.slaveAddress === 0 ||
        match.registerCount === 0 ||
        match.baudrate === 0 ||
        match.xtalHz === 0)
    ) {
      throw new Error("GNSS PROBE RS485 match parameters are invalid");
    }
    if (!match.found && input.subarray(offset, offset + 16).some((value) => value !== 0)) {
      throw new Error("GNSS PROBE absent RS485 match carries non-zero parameters");
    }
    return match;
  };
  const soilQuery = decodeProbeMatch(232);
  const tiltQuery = decodeProbeMatch(248);
  const expectedMatchMask = Number(soilQuery.found) | (Number(tiltQuery.found) << 1);
  if (matchMask !== expectedMatchMask) {
    throw new Error("GNSS PROBE RS485 match mask is inconsistent");
  }
  const scanStarted = (scanFlags & 0x01) !== 0;
  const scanCompleted = (scanFlags & 0x02) !== 0;
  const restoreOk = (scanFlags & 0x04) !== 0;
  if ((scanCompleted && !scanStarted) || (restoreOk && !scanCompleted)) {
    throw new Error("GNSS PROBE RS485 scan lifecycle flags are inconsistent");
  }
  const modbusCounterNames = [
    "requests", "successes", "writeErrors", "txDoneErrors", "readErrors",
    "noResponses", "shortResponses", "addressErrors", "crcErrors",
    "exceptionResponses", "functionErrors", "byteCountErrors", "rxBytes"
  ] as const;
  const modbusChannels = [0, 1].map((channel) => ({
    channel,
    ...Object.fromEntries(
      modbusCounterNames.map((name, index) => [name, input.readUInt32BE(264 + channel * 52 + index * 4)])
    ),
    lastStatus: input.readInt8(368 + channel),
    lastRxBytes: input.readUInt16BE(370 + channel * 2),
    lastResponseAddress: input.readUInt8(374 + channel),
    lastResponseFunction: input.readUInt8(376 + channel),
    lastExceptionCode: input.readUInt8(378 + channel)
  })) as [GnssModbusChannelDiagnostics, GnssModbusChannelDiagnostics];
  if (input.readUInt32BE(380) !== 0) {
    throw new Error("GNSS PROBE Modbus diagnostic reserved bytes are non-zero");
  }
  const v4Extended = {
    ...v3Extended,
    hardwareDiagnostics: {
      sc16is752: {
        configuredI2cAddress: input.readUInt8(205),
        detectedI2cAddress: input.readUInt8(206),
        addressFound: addressFound === 1,
        initStatus: input.readInt8(208),
        scratchpadStatus: [input.readInt8(209), input.readInt8(210)] as [number, number],
        internalLoopbackStatus: [input.readInt8(211), input.readInt8(212)] as [number, number],
        uartInitStatus: [input.readInt8(213), input.readInt8(214)] as [number, number],
        internalLoopbackRxBytes: [input.readUInt8(215), input.readUInt8(216)] as [number, number],
        detectedLsr: input.readUInt8(217)
      },
      readOnlyScan: {
        started: scanStarted,
        completed: scanCompleted,
        restoreOk,
        matchMask,
        attempts: input.readUInt16BE(224),
        successfulProbes: input.readUInt16BE(226),
        durationMs: input.readUInt32BE(228),
        soilQuery,
        tiltQuery
      },
      modbusChannels
    }
  };
  if (responseVersion === 4) {
    return { responseVersion: 4, ...v4Extended };
  }

  const rs485SchemaVersion = input.readUInt8(384);
  const rs485PathCount = input.readUInt8(385);
  const rs485EnabledMask = input.readUInt8(386);
  const rs485CurrentValidMask = input.readUInt8(387);
  const allRs485PathMask = (1 << FIELD_RS485_DIAGNOSTIC_PATH_COUNT) - 1;
  const rs485CompletedCycles = input.readUInt32BE(388);
  const rs485LastCompletedUptimeS = input.readUInt32BE(392);
  const rs485LastDurationMs = input.readUInt32BE(396);
  const rs485MaxDurationMs = input.readUInt32BE(400);
  if (
    rs485SchemaVersion !== 1 ||
    rs485PathCount !== FIELD_RS485_DIAGNOSTIC_PATH_COUNT ||
    ((rs485EnabledMask | rs485CurrentValidMask) & ~allRs485PathMask) !== 0 ||
    (rs485CurrentValidMask & ~rs485EnabledMask) !== 0 ||
    input.readUInt32BE(548) !== 0 ||
    rs485LastCompletedUptimeS > common.snapshotUptimeS ||
    rs485LastDurationMs > rs485MaxDurationMs ||
    (rs485CompletedCycles === 0 &&
      (rs485EnabledMask !== 0 || rs485CurrentValidMask !== 0 ||
        rs485LastCompletedUptimeS !== 0 || rs485LastDurationMs !== 0 || rs485MaxDurationMs !== 0))
  ) {
    throw new Error("GNSS PROBE RS485 runtime diagnostic schema, masks or reserved bytes are invalid");
  }
  const rs485Paths = Object.fromEntries(
    FIELD_RS485_DIAGNOSTIC_PATH_NAMES.map((name, index) => {
      const offset = 404 + index * 36;
      const mask = 1 << index;
      const lastFirstStatus = input.readInt8(offset + 32);
      const lastFinalStatus = input.readInt8(offset + 33);
      const lastAttempts = input.readUInt8(offset + 34);
      const lastEventFlags = input.readUInt8(offset + 35);
      const enabled = (rs485EnabledMask & mask) !== 0;
      const currentValid = (rs485CurrentValidMask & mask) !== 0;
      const cycles = input.readUInt32BE(offset);
      const attempts = input.readUInt32BE(offset + 4);
      const firstAttemptFailures = input.readUInt32BE(offset + 8);
      const retryRecoveries = input.readUInt32BE(offset + 12);
      const finalFailures = input.readUInt32BE(offset + 16);
      const skippedCycles = input.readUInt32BE(offset + 20);
      const consecutiveFinalFailures = input.readUInt32BE(offset + 24);
      const lastEventUptimeS = input.readUInt32BE(offset + 28);
      const attemptedCycles = cycles - skippedCycles;
      const eventIsValid =
        (lastEventFlags === 0 && lastEventUptimeS === 0 && lastFirstStatus === 0 &&
          lastFinalStatus === 0 && lastAttempts === 0) ||
        (lastEventFlags === 0x10 && lastFirstStatus === -1 && lastFinalStatus === -1 &&
          lastAttempts === 0) ||
        ((lastEventFlags === 0x03 || lastEventFlags === 0x0b) &&
          lastFirstStatus < 0 && lastFinalStatus === 0 && lastAttempts >= 2) ||
        (lastEventFlags === 0x05 && lastFirstStatus < 0 && lastFinalStatus < 0 &&
          lastAttempts >= 1) ||
        (lastEventFlags === 0x08 && lastFirstStatus === 0 && lastFinalStatus === 0 &&
          lastAttempts >= 1);
      if (
        lastFirstStatus < -12 ||
        lastFirstStatus > 0 ||
        lastFinalStatus < -12 ||
        lastFinalStatus > 0 ||
        lastAttempts > 2 ||
        (lastEventFlags & ~0x1f) !== 0 ||
        !eventIsValid ||
        lastEventUptimeS > common.snapshotUptimeS ||
        skippedCycles > cycles ||
        attempts < attemptedCycles ||
        firstAttemptFailures > attemptedCycles ||
        retryRecoveries > firstAttemptFailures ||
        finalFailures > firstAttemptFailures ||
        consecutiveFinalFailures > finalFailures ||
        (firstAttemptFailures !== UINT32_MAX && retryRecoveries !== UINT32_MAX &&
          finalFailures !== UINT32_MAX && retryRecoveries + finalFailures !== firstAttemptFailures) ||
        (enabled ? cycles !== rs485CompletedCycles :
          cycles !== 0 || attempts !== 0 || firstAttemptFailures !== 0 || retryRecoveries !== 0 ||
          finalFailures !== 0 || skippedCycles !== 0 || consecutiveFinalFailures !== 0 ||
          lastEventUptimeS !== 0 || lastFirstStatus !== 0 || lastFinalStatus !== 0 ||
          lastAttempts !== 0 || lastEventFlags !== 0) ||
        (currentValid && (lastEventFlags === 0x05 || lastEventFlags === 0x10)) ||
        (!currentValid && cycles > 0 && (lastEventFlags === 0 || lastEventFlags === 0x03 ||
          lastEventFlags === 0x08 || lastEventFlags === 0x0b))
      ) {
        throw new Error("GNSS PROBE RS485 runtime path counters, status or flags are inconsistent");
      }
      return [
        name,
        {
          index,
          mask,
          enabled,
          currentValid,
          cycles,
          attempts,
          firstAttemptFailures,
          retryRecoveries,
          finalFailures,
          skippedCycles,
          consecutiveFinalFailures,
          lastEventUptimeS,
          lastFirstStatus,
          lastFinalStatus,
          lastAttempts,
          lastEventFlags
        }
      ];
    })
  ) as Record<FieldRs485DiagnosticPathName, FieldRs485PathRuntimeDiagnostics>;
  return {
    responseVersion: 5,
    ...v4Extended,
    rs485RuntimeDiagnostics: {
      enabledMask: rs485EnabledMask,
      currentValidMask: rs485CurrentValidMask,
      completedCycles: rs485CompletedCycles,
      lastCompletedUptimeS: rs485LastCompletedUptimeS,
      lastDurationMs: rs485LastDurationMs,
      maxDurationMs: rs485MaxDurationMs,
      paths: rs485Paths
    }
  };
}

export function decodeGnssProbeStatsResponseV1(input: Buffer): GnssProbeStatsResponseV1 {
  const decoded = decodeGnssProbeStatsResponse(input);
  if (decoded.responseVersion !== 1) {
    throw new Error("GNSS PROBE stats response is not V1");
  }
  return decoded;
}

export function decodeGnssProbeStatsResponseV2(input: Buffer): GnssProbeStatsResponseV2 {
  const decoded = decodeGnssProbeStatsResponse(input);
  if (decoded.responseVersion !== 2) {
    throw new Error("GNSS PROBE stats response is not V2");
  }
  return decoded;
}

export function decodeGnssProbeStatsResponseV3(input: Buffer): GnssProbeStatsResponseV3 {
  const decoded = decodeGnssProbeStatsResponse(input);
  if (decoded.responseVersion !== 3) {
    throw new Error("GNSS PROBE stats response is not V3");
  }
  return decoded;
}

export function decodeGnssProbeStatsResponseV4(input: Buffer): GnssProbeStatsResponseV4 {
  const decoded = decodeGnssProbeStatsResponse(input);
  if (decoded.responseVersion !== 4) {
    throw new Error("GNSS PROBE stats response is not V4");
  }
  return decoded;
}

export function decodeGnssProbeStatsResponseV5(input: Buffer): GnssProbeStatsResponseV5 {
  const decoded = decodeGnssProbeStatsResponse(input);
  if (decoded.responseVersion !== 5) {
    throw new Error("GNSS PROBE stats response is not V5");
  }
  return decoded;
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
