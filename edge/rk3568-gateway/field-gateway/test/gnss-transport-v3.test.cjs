const assert = require("node:assert/strict");
const test = require("node:test");

const {
  GNSS_CORE_FIX_CN0_VALID,
  GNSS_CORE_FIX_CORRECTION_AGE_VALID,
  GNSS_CORE_FIX_GST_VALID,
  GNSS_CORE_FIX_NMEA_CHECKSUM_VALID,
  GNSS_CORE_FIX_TIME_VALID,
  GNSS_CORE_FIX_TRUSTED,
  GNSS_CORE_V3_PAYLOAD_BYTES,
  GNSS_V3_TARGET_ALL_NODES,
  GNSS_V3_TARGET_NODE_B,
  RTCM_FRAGMENT_V3_HEADER_BYTES,
  decodeGnssProbeStatsResponse,
  decodeGnssProbeStatsResponseV1,
  decodeGnssProbeStatsResponseV2,
  decodeGnssProbeStatsResponseV3,
  decodeGnssProbeStatsResponseV4,
  decodeGnssProbeStatsResponseV5,
  decodeGnssProbeStatsResponseV6,
  decodeGnssProbeStatsResponseV7,
  decodeGnssRtcmAckResponseV1,
  RtcmReassemblerV3,
  crc24q,
  decodeGnssCoreV3,
  decodeRtcmFragmentV3,
  defaultRtcmTtlMs,
  encodeGnssCoreV3,
  encodeGnssProbeStatsQueryV1,
  encodeGnssRtcmAckQueryV1,
  encodeGnssRtcmModeCommandV1,
  encodeRtcmFragmentV3,
  fragmentRtcmFrameV3,
  gnssRtcmAckReportsCompleted,
  inspectRtcm3Frame,
  maxRtcmTtlMs
} = require("../dist/gnss-transport-v3.js");
const { createCobsCrcFieldLinkAssembler, encodeFieldLinkFrame } = require("../dist/field-link.js");

function buildRtcmFrame(messageType, extraPayloadBytes = 72) {
  const payload = Buffer.alloc(2 + extraPayloadBytes);
  payload[0] = messageType >>> 4;
  payload[1] = (messageType & 0x0f) << 4;
  for (let index = 2; index < payload.length; index += 1) {
    payload[index] = index % 13 === 0 ? 0 : (index * 37) & 0xff;
  }
  const frame = Buffer.alloc(payload.length + 6);
  frame[0] = 0xd3;
  frame[1] = (payload.length >>> 8) & 0x03;
  frame[2] = payload.length & 0xff;
  payload.copy(frame, 3);
  frame.writeUIntBE(crc24q(frame.subarray(0, frame.length - 3)), frame.length - 3, 3);
  return frame;
}

function buildProbeStatsV6() {
  const payload = Buffer.alloc(660);
  payload.write("G3S", 0, "ascii");
  payload.writeUInt8(6, 3);
  payload.writeUInt8(2, 4);
  payload.writeUInt8(2, 5);
  payload.writeUInt32BE(0x89abcdef, 8);
  payload.writeUInt32BE(1300, 12);
  payload.writeUInt8(4, 152);
  payload.writeUInt8(1, 204);
  payload.writeUInt8(1, 220);
  payload.writeUInt8(1, 384);
  payload.writeUInt8(4, 385);
  payload.writeUInt8(1, 552);
  payload.writeUInt8(3, 553);
  payload.writeUInt8(0, 554);
  payload.writeUInt8(0, 555);
  payload.writeUInt32BE(115200, 556);
  payload.writeUInt32BE(115200, 580);
  payload.writeUInt32BE(9600, 620);
  return payload;
}

function gnssCoreFixture() {
  return {
    flags: 0,
    sourceNode: 1,
    targetMask: 0,
    priority: 2,
    sessionEpoch: 17,
    sequence: 1042,
    generatedUnixMs: 1_785_059_400_123,
    ttlMs: 3000,
    coordinateFrame: 1,
    ggaQuality: 4,
    fixFlags:
      GNSS_CORE_FIX_NMEA_CHECKSUM_VALID |
      GNSS_CORE_FIX_TRUSTED |
      GNSS_CORE_FIX_TIME_VALID |
      GNSS_CORE_FIX_GST_VALID |
      GNSS_CORE_FIX_CN0_VALID |
      GNSS_CORE_FIX_CORRECTION_AGE_VALID,
    gnssWeek: 2429,
    satellitesUsed: 32,
    satellitesVisible: 41,
    gnssTowMs: 321_456_789,
    latitudeE9: 39_123_456_789,
    longitudeE9: 116_987_654_321,
    altitudeMslMm: 48_123,
    geoidSeparationMm: -9_876,
    correctionAgeMs: 2000,
    solutionAgeMs: 83,
    hdopX100: 56,
    pdopX100: 91,
    vdopX100: 72,
    gstSigmaLatMm: 8,
    gstSigmaLonMm: 9,
    gstSigmaAltMm: 15,
    cn0MeanDbhzX10: 438,
    cn0MedianDbhzX10: 441,
    cn0MinDbhzX10: 312,
    fixStreakS: 584,
    fixedRatio1mPermille: 1000,
    fixDropCount: 0,
    referenceStationId: 23
  };
}

test("GNSS PROBE stats query and response match the RK2206 golden vector", () => {
  const query = encodeGnssProbeStatsQueryV1(2, 0x89abcdef);
  assert.equal(query.toString("ascii"), "G3QB89ABCDEF");
  assert.throws(() => encodeGnssProbeStatsQueryV1(2, 0), /nonce/);

  const payload = Buffer.from(
    "473353010201000089abcdef000004d2" +
      Array.from({ length: 18 }, (_, index) => (index + 1).toString(16).padStart(8, "0")).join("") +
      "00130014",
    "hex"
  );
  const decoded = decodeGnssProbeStatsResponseV1(payload);
  assert.equal(decoded.nodeNumber, 2);
  assert.equal(decoded.injectionMode, 1);
  assert.equal(decoded.nonce, 0x89abcdef);
  assert.equal(decoded.snapshotUptimeS, 1234);
  assert.equal(decoded.stats.acceptedFragments, 1);
  assert.equal(decoded.stats.injectionDroppedFrames, 18);
  assert.equal(decoded.stats.queueHighWatermark, 19);
  assert.equal(decoded.stats.queuePending, 20);

  const wire = encodeFieldLinkFrame({ frameType: "control", sequence: 72, payloadBytes: payload });
  const result = createCobsCrcFieldLinkAssembler().push(wire);
  assert.deepEqual(result.errors, []);
  assert.equal(result.payloads[0].frameType, "control");
  assert.deepEqual(decodeGnssProbeStatsResponseV1(result.payloads[0].rawPayloadBytes), decoded);
});

test("GNSS PROBE V2 exposes per-type and field-link diagnostics", () => {
  const payload = Buffer.alloc(148);
  payload.write("G3S", 0, "ascii");
  payload.writeUInt8(2, 3);
  payload.writeUInt8(2, 4);
  payload.writeUInt8(1, 5);
  payload.writeUInt32BE(0x89abcdef, 8);
  payload.writeUInt32BE(1234, 12);
  for (let index = 0; index < 18; index += 1) {
    payload.writeUInt32BE(index + 1, 16 + index * 4);
  }
  payload.writeUInt16BE(19, 88);
  payload.writeUInt16BE(20, 90);
  for (let index = 0; index < 6; index += 1) {
    payload.writeUInt32BE(index + 21, 92 + index * 4);
  }
  for (let index = 0; index < 8; index += 1) {
    payload.writeUInt32BE(index + 31, 116 + index * 4);
  }

  const decoded = decodeGnssProbeStatsResponseV2(payload);
  assert.equal(decoded.completedTypeCounts["1124"], 26);
  assert.equal(decoded.linkStats.decodedRtcmFrames, 32);
  assert.equal(decoded.linkStats.fifoDropEvents, 38);
  assert.deepEqual(decodeGnssProbeStatsResponse(payload), decoded);
  assert.throws(() => decodeGnssProbeStatsResponseV1(payload), /not V1/);

  const wire = encodeFieldLinkFrame({ frameType: "control", sequence: 73, payloadBytes: payload });
  const result = createCobsCrcFieldLinkAssembler().push(wire);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(decodeGnssProbeStatsResponseV2(result.payloads[0].rawPayloadBytes), decoded);
});

test("GNSS PROBE V3 exposes only the deployed RK2206 sensor paths", () => {
  const payload = Buffer.alloc(204);
  payload.write("G3S", 0, "ascii");
  payload.writeUInt8(3, 3);
  payload.writeUInt8(3, 4);
  payload.writeUInt8(1, 5);
  payload.writeUInt32BE(0x89abcdef, 8);
  payload.writeUInt32BE(1234, 12);
  payload.writeUInt8(0x0f, 148);
  payload.writeUInt8(0x0f, 149);
  payload.writeUInt8(0x05, 150);
  payload.writeUInt8(0x0f, 151);
  payload.writeUInt8(4, 152);
  for (let index = 0; index < 4; index += 1) {
    payload.writeUInt32BE(index + 41, 156 + index * 4);
    payload.writeUInt32BE(index + 51, 172 + index * 4);
    payload.writeUInt32BE(index + 61, 188 + index * 4);
  }

  const decoded = decodeGnssProbeStatsResponseV3(payload);
  assert.equal(decoded.responseVersion, 3);
  assert.equal(decoded.sensorDiagnostics.sensors.um220Gnss.currentValid, true);
  assert.equal(decoded.sensorDiagnostics.sensors.rsEcthSoil.currentValid, false);
  assert.equal(decoded.sensorDiagnostics.sensors.rsEcthEc.sampleCount, 43);
  assert.equal(decoded.sensorDiagnostics.sensors.rsDipTilt.consecutiveFailures, 64);
  assert.deepEqual(decodeGnssProbeStatsResponse(payload), decoded);
  assert.throws(() => decodeGnssProbeStatsResponseV2(payload), /not V2/);

  const inconsistent = Buffer.from(payload);
  inconsistent.writeUInt8(0x01, 151);
  assert.throws(() => decodeGnssProbeStatsResponse(inconsistent), /masks are inconsistent/);
});

test("GNSS PROBE V4 exposes U4, read-only scan and classified Modbus diagnostics", () => {
  const payload = Buffer.alloc(384);
  payload.write("G3S", 0, "ascii");
  payload.writeUInt8(4, 3);
  payload.writeUInt8(2, 4);
  payload.writeUInt8(1, 5);
  payload.writeUInt32BE(0x89abcdef, 8);
  payload.writeUInt32BE(1234, 12);
  payload.writeUInt8(0x0f, 148);
  payload.writeUInt8(0x0f, 149);
  payload.writeUInt8(0x05, 150);
  payload.writeUInt8(0x0f, 151);
  payload.writeUInt8(4, 152);
  payload.writeUInt8(1, 204);
  payload.writeUInt8(0x4d, 205);
  payload.writeUInt8(0x4d, 206);
  payload.writeUInt8(1, 207);
  payload.writeInt8(0, 208);
  payload.writeInt8(0, 209);
  payload.writeInt8(-2, 210);
  payload.writeInt8(0, 211);
  payload.writeInt8(-3, 212);
  payload.writeInt8(0, 213);
  payload.writeInt8(-4, 214);
  payload.writeUInt8(4, 215);
  payload.writeUInt8(2, 216);
  payload.writeUInt8(0x60, 217);
  payload.writeUInt8(1, 220);
  payload.writeUInt8(0x07, 221);
  payload.writeUInt8(0x01, 222);
  payload.writeUInt16BE(27, 224);
  payload.writeUInt16BE(1, 226);
  payload.writeUInt32BE(8123, 228);
  payload.writeUInt8(1, 232);
  payload.writeUInt8(0, 233);
  payload.writeUInt8(3, 234);
  payload.writeUInt8(1, 235);
  payload.writeUInt16BE(0, 236);
  payload.writeUInt16BE(2, 238);
  payload.writeUInt32BE(4800, 240);
  payload.writeUInt32BE(1843200, 244);
  for (let index = 0; index < 13; index += 1) {
    payload.writeUInt32BE(100 + index, 264 + index * 4);
    payload.writeUInt32BE(200 + index, 316 + index * 4);
  }
  payload.writeInt8(-4, 368);
  payload.writeInt8(0, 369);
  payload.writeUInt16BE(113, 370);
  payload.writeUInt16BE(213, 372);
  payload.set([1, 2, 3, 4, 0, 2], 374);

  const decoded = decodeGnssProbeStatsResponseV4(payload);
  assert.equal(decoded.responseVersion, 4);
  assert.equal(decoded.hardwareDiagnostics.sc16is752.addressFound, true);
  assert.deepEqual(decoded.hardwareDiagnostics.sc16is752.scratchpadStatus, [0, -2]);
  assert.equal(decoded.hardwareDiagnostics.readOnlyScan.restoreOk, true);
  assert.equal(decoded.hardwareDiagnostics.readOnlyScan.soilQuery.baudrate, 4800);
  assert.equal(decoded.hardwareDiagnostics.readOnlyScan.tiltQuery.found, false);
  assert.equal(decoded.hardwareDiagnostics.modbusChannels[0].noResponses, 105);
  assert.equal(decoded.hardwareDiagnostics.modbusChannels[1].lastExceptionCode, 2);
  assert.deepEqual(decodeGnssProbeStatsResponse(payload), decoded);
  assert.throws(() => decodeGnssProbeStatsResponseV3(payload), /not V3/);

  const inconsistent = Buffer.from(payload);
  inconsistent.writeUInt8(0x03, 222);
  assert.throws(() => decodeGnssProbeStatsResponse(inconsistent), /match mask is inconsistent/);
});

test("GNSS PROBE V5 separates RS485 path retries, final failures and sample age", () => {
  const payload = Buffer.alloc(552);
  payload.write("G3S", 0, "ascii");
  payload.writeUInt8(5, 3);
  payload.writeUInt8(2, 4);
  payload.writeUInt8(1, 5);
  payload.writeUInt32BE(0x89abcdef, 8);
  payload.writeUInt32BE(1300, 12);
  payload.writeUInt8(4, 152);
  payload.writeUInt8(1, 204);
  payload.writeUInt8(1, 220);
  payload.writeUInt8(1, 384);
  payload.writeUInt8(4, 385);
  payload.writeUInt8(0x07, 386);
  payload.writeUInt8(0x05, 387);
  payload.writeUInt32BE(100, 388);
  payload.writeUInt32BE(1234, 392);
  payload.writeUInt32BE(1680, 396);
  payload.writeUInt32BE(3440, 400);

  const soilOffset = 404;
  [100, 101, 2, 1, 1, 0, 0, 1200].forEach((value, index) => {
    payload.writeUInt32BE(value, soilOffset + index * 4);
  });
  payload.writeInt8(-4, soilOffset + 32);
  payload.writeInt8(0, soilOffset + 33);
  payload.writeUInt8(2, soilOffset + 34);
  payload.writeUInt8(0x03, soilOffset + 35);

  const ecOffset = 440;
  [100, 95, 5, 2, 3, 5, 1, 1234].forEach((value, index) => {
    payload.writeUInt32BE(value, ecOffset + index * 4);
  });
  payload.writeInt8(-4, ecOffset + 32);
  payload.writeInt8(-4, ecOffset + 33);
  payload.writeUInt8(2, ecOffset + 34);
  payload.writeUInt8(0x05, ecOffset + 35);

  const tiltOffset = 476;
  [100, 100, 1, 0, 1, 0, 0, 1250].forEach((value, index) => {
    payload.writeUInt32BE(value, tiltOffset + index * 4);
  });
  payload.writeInt8(0, tiltOffset + 32);
  payload.writeInt8(0, tiltOffset + 33);
  payload.writeUInt8(1, tiltOffset + 34);
  payload.writeUInt8(0x08, tiltOffset + 35);

  const decoded = decodeGnssProbeStatsResponseV5(payload);
  assert.equal(decoded.responseVersion, 5);
  assert.equal(decoded.rs485RuntimeDiagnostics.completedCycles, 100);
  assert.equal(decoded.rs485RuntimeDiagnostics.lastCompletedUptimeS, 1234);
  assert.equal(decoded.rs485RuntimeDiagnostics.paths.soil.retryRecoveries, 1);
  assert.equal(decoded.rs485RuntimeDiagnostics.paths.soilEc.finalFailures, 3);
  assert.equal(decoded.rs485RuntimeDiagnostics.paths.tilt.currentValid, true);
  assert.deepEqual(decodeGnssProbeStatsResponse(payload), decoded);
  assert.throws(() => decodeGnssProbeStatsResponseV4(payload), /not V4/);

  const inconsistent = Buffer.from(payload);
  inconsistent.writeUInt8(0x08, 387);
  assert.throws(() => decodeGnssProbeStatsResponse(inconsistent), /schema, masks or reserved/);

  const impossibleCounters = Buffer.from(payload);
  impossibleCounters.writeUInt32BE(99, soilOffset + 4);
  assert.throws(() => decodeGnssProbeStatsResponse(impossibleCounters), /counters, status or flags/);

  const impossibleEvent = Buffer.from(payload);
  impossibleEvent.writeUInt8(0x01, soilOffset + 35);
  assert.throws(() => decodeGnssProbeStatsResponse(impossibleEvent), /counters, status or flags/);
});

test("GNSS PROBE V6/V7 preserve UART evidence and add bounded RTCM stage histograms", () => {
  const v6Payload = buildProbeStatsV6();
  const decodedV6 = decodeGnssProbeStatsResponseV6(v6Payload);
  assert.equal(decodedV6.gpsUartDiagnostics.state, 3);
  assert.equal(decodedV6.gpsUartDiagnostics.activeBaudrate, 115200);
  assert.equal(decodedV6.gpsUartDiagnostics.candidates[1].baudrate, 9600);

  const v7Payload = Buffer.alloc(916);
  v6Payload.copy(v7Payload);
  v7Payload.writeUInt8(7, 3);
  v7Payload.set([1, 3, 14, 0], 660);
  v7Payload.writeUInt32BE(0x10203040, 664);
  [0, 1, 2, 5, 10, 20, 50, 100, 250, 500, 1000, 2000, 3000, 0xffffffff]
    .forEach((bound, index) => v7Payload.writeUInt32BE(bound, 668 + index * 4));
  v7Payload.writeUInt32BE(4, 724);
  v7Payload.writeUInt32BE(90, 728);
  v7Payload.writeUInt32BE(4, 732 + 7 * 4);
  v7Payload.writeUInt32BE(3, 788);
  v7Payload.writeUInt32BE(8, 792);
  v7Payload.writeUInt32BE(3, 796 + 4 * 4);
  v7Payload.writeUInt32BE(3, 852);
  v7Payload.writeUInt32BE(105, 856);
  v7Payload.writeUInt32BE(3, 860 + 8 * 4);

  const decodedV7 = decodeGnssProbeStatsResponseV7(v7Payload);
  assert.equal(decodedV7.rtcmLatencyDiagnostics.sessionEpoch, 0x10203040);
  assert.equal(decodedV7.rtcmLatencyDiagnostics.completionToDequeueMs.sampleCount, 4);
  assert.equal(decodedV7.rtcmLatencyDiagnostics.completionToDequeueMs.p95UpperBoundMs, 100);
  assert.equal(decodedV7.rtcmLatencyDiagnostics.uartWriteMs.maxMs, 8);
  assert.equal(decodedV7.rtcmLatencyDiagnostics.completionToUartFinishedMs.p50UpperBoundMs, 250);
  assert.deepEqual(decodeGnssProbeStatsResponse(v7Payload), decodedV7);
  assert.throws(() => decodeGnssProbeStatsResponseV6(v7Payload), /not V6/);

  const inconsistent = Buffer.from(v7Payload);
  inconsistent.writeUInt32BE(2, 724);
  assert.throws(() => decodeGnssProbeStatsResponse(inconsistent), /histogram counters or maximum/);

  const oversizedBucketCount = Buffer.from(v7Payload);
  oversizedBucketCount.writeUInt8(0xff, 662);
  assert.throws(() => decodeGnssProbeStatsResponse(oversizedBucketCount), /schema, histogram count or bounds/);

  const inconsistentBound = Buffer.from(v7Payload);
  inconsistentBound.writeUInt32BE(21, 668 + 5 * 4);
  assert.throws(() => decodeGnssProbeStatsResponse(inconsistentBound), /schema, histogram count or bounds/);
});

test("RTCM ACK V1 reports the recent completed-sequence bitmap", () => {
  const query = encodeGnssRtcmAckQueryV1(2, 0x89abcdef);
  assert.equal(query.toString("ascii"), "G3AB89ABCDEF");
  assert.throws(() => encodeGnssRtcmAckQueryV1(2, 0), /nonce/);

  const payload = Buffer.alloc(24);
  payload.write("G3A", 0, "ascii");
  payload.writeUInt8(1, 3);
  payload.writeUInt8(2, 4);
  payload.writeUInt8(1, 5);
  payload.writeUInt8(1, 6);
  payload.writeUInt32BE(0x89abcdef, 8);
  payload.writeUInt32BE(0x10203040, 12);
  payload.writeUInt32BE(117, 16);
  payload.writeUInt16BE(0xa55a, 20);

  const decoded = decodeGnssRtcmAckResponseV1(payload);
  assert.equal(decoded.completedBitmap, 0xa55a);
  assert.equal(gnssRtcmAckReportsCompleted(decoded, 0x10203040, 116), true);
  assert.equal(gnssRtcmAckReportsCompleted(decoded, 0x10203040, 117), false);
});

test("RTCM runtime command arms one broadcast session with a bounded lease", () => {
  const command = encodeGnssRtcmModeCommandV1({
    targetMask: GNSS_V3_TARGET_ALL_NODES,
    mode: 2,
    sessionEpoch: 0x12345678,
    leaseSeconds: 90
  });
  assert.equal(command.length, 19);
  assert.equal(command.toString("ascii"), "G3M107212345678005A");
  assert.equal(
    encodeGnssRtcmModeCommandV1({ targetMask: 7, mode: 0, sessionEpoch: 0, leaseSeconds: 0 }).toString("ascii"),
    "G3M1070000000000000"
  );
  assert.throws(
    () => encodeGnssRtcmModeCommandV1({ targetMask: 7, mode: 2, sessionEpoch: 0, leaseSeconds: 90 }),
    /non-zero session/u
  );
  assert.throws(
    () => encodeGnssRtcmModeCommandV1({ targetMask: 7, mode: 2, sessionEpoch: 1, leaseSeconds: 14 }),
    /15\.\.300/u
  );
});

test("GNSS_CORE V3 preserves nanodegrees and survives the binary field-link", () => {
  const fixture = gnssCoreFixture();
  const payload = encodeGnssCoreV3(fixture);
  assert.equal(payload.length, GNSS_CORE_V3_PAYLOAD_BYTES);
  assert.equal(
    payload.toString("hex"),
    "4733031c0001000200000011000004120000019f9dd4d9bb00000bb80104003f097d202913290a95000000091bf093150000001b3d01f0b10000bbfbffffd96c000007d0000000530038005b004800080009000f01b601b90138024803e800000017"
  );
  assert.deepEqual(decodeGnssCoreV3(payload), fixture);

  const wire = encodeFieldLinkFrame({ frameType: "gnss-core", sequence: 71, payloadBytes: payload });
  const result = createCobsCrcFieldLinkAssembler().push(wire);
  assert.deepEqual(result.errors, []);
  assert.equal(result.payloads.length, 1);
  assert.equal(result.payloads[0].frameType, "gnss-core");
  assert.equal(result.payloads[0].sequence, 71);
  assert.deepEqual(decodeGnssCoreV3(result.payloads[0].rawPayloadBytes), fixture);
  assert.ok(wire.length <= 116, `GNSS_CORE wire frame unexpectedly grew to ${wire.length} bytes`);
});

test("RTCM V3 reassembles shuffled fragments and validates CRC24Q", () => {
  const now = 1_785_059_400_000;
  const frame = buildRtcmFrame(1124, 121);
  const info = inspectRtcm3Frame(frame);
  assert.equal(info.messageType, 1124);

  const fragments = fragmentRtcmFrameV3({
    frame,
    sessionEpoch: 31,
    sequence: 88,
    generatedUnixMs: now,
    maxFragmentDataBytes: 31
  });
  const reassembler = new RtcmReassemblerV3({ localNode: 2 });
  const order = [2, 0, 4, 1, 3];
  let complete = null;
  for (const index of order) {
    const result = reassembler.push(encodeRtcmFragmentV3(fragments[index]), now + index * 10);
    if (result.status === "complete") complete = result;
    else assert.equal(result.status, "accepted");
  }
  assert.ok(complete);
  assert.deepEqual(complete.frame, frame);
  assert.equal(complete.info.crc24q, info.crc24q);
  assert.equal(reassembler.stats().completedFrames, 1);
});

test("RTCM V3 rejects wrong targets, expired data, future data and stale sessions", () => {
  const now = 1_785_059_400_000;
  const frame = buildRtcmFrame(1074, 40);
  const base = {
    frame,
    sequence: 1,
    generatedUnixMs: now,
    maxFragmentDataBytes: 128
  };

  const nodeA = new RtcmReassemblerV3({ localNode: 1 });
  const wrongTarget = fragmentRtcmFrameV3({ ...base, sessionEpoch: 10, targetMask: GNSS_V3_TARGET_NODE_B })[0];
  assert.deepEqual(nodeA.push(encodeRtcmFragmentV3(wrongTarget), now), {
    status: "rejected",
    sequence: 1,
    reason: "fragment_not_targeted_to_local_node"
  });

  const expired = fragmentRtcmFrameV3({ ...base, sessionEpoch: 10, ttlMs: 1000 })[0];
  assert.equal(nodeA.push(encodeRtcmFragmentV3(expired), now + 1001).reason, "fragment_ttl_expired");

  const future = fragmentRtcmFrameV3({ ...base, sessionEpoch: 10, generatedUnixMs: now + 2500 })[0];
  assert.equal(nodeA.push(encodeRtcmFragmentV3(future), now).reason, "fragment_generated_in_future");

  const epoch10 = fragmentRtcmFrameV3({ ...base, sessionEpoch: 10 })[0];
  assert.equal(nodeA.push(encodeRtcmFragmentV3(epoch10), now).status, "complete");
  const epoch11 = fragmentRtcmFrameV3({ ...base, sessionEpoch: 11, sequence: 2 })[0];
  assert.equal(nodeA.push(encodeRtcmFragmentV3(epoch11), now).status, "complete");
  const oldAgain = fragmentRtcmFrameV3({ ...base, sessionEpoch: 10, sequence: 3 })[0];
  assert.equal(nodeA.push(encodeRtcmFragmentV3(oldAgain), now).reason, "stale_session_epoch");
});

test("RTCM V3 handles duplicates but rejects conflicting or overlapping fragments", () => {
  const now = 1_785_059_400_000;
  const frame = buildRtcmFrame(1084, 80);
  const fragments = fragmentRtcmFrameV3({
    frame,
    sessionEpoch: 50,
    sequence: 7,
    generatedUnixMs: now,
    maxFragmentDataBytes: 32
  });
  const reassembler = new RtcmReassemblerV3({ localNode: 3 });
  const first = encodeRtcmFragmentV3(fragments[0]);
  assert.equal(reassembler.push(first, now).status, "accepted");
  assert.equal(reassembler.push(first, now + 1).status, "duplicate");

  const conflict = { ...fragments[0], data: Buffer.from(fragments[0].data) };
  conflict.data[0] ^= 0xff;
  assert.equal(reassembler.push(encodeRtcmFragmentV3(conflict), now + 2).reason, "fragment_duplicate_conflict");

  const overlapAssembler = new RtcmReassemblerV3({ localNode: 3 });
  assert.equal(overlapAssembler.push(first, now).status, "accepted");
  const overlap = { ...fragments[1], fragmentOffset: fragments[0].data.length - 1 };
  assert.equal(overlapAssembler.push(encodeRtcmFragmentV3(overlap), now + 2).reason, "fragment_ranges_overlap");
});

test("RTCM V3 bounds incomplete messages and expires missing fragments", () => {
  const now = 1_785_059_400_000;
  const frame = buildRtcmFrame(1094, 80);
  const reassembler = new RtcmReassemblerV3({
    localNode: 1,
    maxInflightMessages: 2,
    reassemblyTimeoutMs: 100
  });

  for (let sequence = 1; sequence <= 3; sequence += 1) {
    const fragment = fragmentRtcmFrameV3({
      frame,
      sessionEpoch: 90,
      sequence,
      generatedUnixMs: now,
      maxFragmentDataBytes: 32
    })[0];
    assert.equal(reassembler.push(encodeRtcmFragmentV3(fragment), now + sequence).status, "accepted");
  }
  assert.equal(reassembler.stats().capacityEvictions, 1);
  assert.equal(reassembler.stats().pendingMessages, 2);

  const later = fragmentRtcmFrameV3({
    frame,
    sessionEpoch: 90,
    sequence: 4,
    generatedUnixMs: now,
    ttlMs: 1000,
    maxFragmentDataBytes: 32
  })[0];
  reassembler.push(encodeRtcmFragmentV3(later), now + 200);
  assert.equal(reassembler.stats().expiredAssemblies, 2);
});

test("RTCM fragment byte budget remains below the 220-byte probe ceiling", () => {
  const now = 1_785_059_400_000;
  const frame = buildRtcmFrame(1114, 300);
  const fragment = fragmentRtcmFrameV3({
    frame,
    sessionEpoch: 1,
    sequence: 1,
    generatedUnixMs: now,
    targetMask: GNSS_V3_TARGET_ALL_NODES,
    maxFragmentDataBytes: 160
  })[0];
  const payload = encodeRtcmFragmentV3(fragment);
  const wire = encodeFieldLinkFrame({ frameType: "rtcm", sequence: 1, payloadBytes: payload });
  const decodedWire = createCobsCrcFieldLinkAssembler().push(wire);
  assert.equal(payload.length, RTCM_FRAGMENT_V3_HEADER_BYTES + 160);
  assert.ok(wire.length <= 220, `RTCM fragment wire frame unexpectedly grew to ${wire.length} bytes`);
  assert.equal(decodedWire.payloads[0].frameType, "rtcm");
  assert.deepEqual(decodedWire.payloads[0].rawPayloadBytes, payload);
  assert.equal(decodeRtcmFragmentV3(payload).data.length, 160);
  assert.equal(defaultRtcmTtlMs(fragment.messageClass), 3000);
  assert.equal(maxRtcmTtlMs(fragment.messageClass), 5000);
});

test("RTCM observation fragments cannot claim reference-message lifetime", () => {
  const now = 1_785_059_400_000;
  const fragment = fragmentRtcmFrameV3({
    frame: buildRtcmFrame(1074, 40),
    sessionEpoch: 1,
    sequence: 1,
    generatedUnixMs: now,
    maxFragmentDataBytes: 128
  })[0];
  assert.throws(
    () => encodeRtcmFragmentV3({ ...fragment, messageClass: 2 }),
    /message class does not match/
  );
  assert.throws(() => encodeRtcmFragmentV3({ ...fragment, ttlMs: 5001 }), /safety limit/);
});
