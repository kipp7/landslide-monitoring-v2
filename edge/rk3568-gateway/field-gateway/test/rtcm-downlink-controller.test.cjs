const assert = require("node:assert/strict");
const test = require("node:test");

const { crc24q, decodeRtcmFragmentV3 } = require("../dist/gnss-transport-v3.js");
const { RtcmDownlinkController } = require("../dist/rtcm-downlink-controller.js");
const { decodeRtcmFragmentBatchV1 } = require("../dist/rtcm-fragment-batch.js");

function buildRtcmFrame(messageType, extraPayloadBytes = 72) {
  const payload = Buffer.alloc(2 + extraPayloadBytes);
  payload[0] = messageType >>> 4;
  payload[1] = (messageType & 0x0f) << 4;
  const frame = Buffer.alloc(payload.length + 6);
  frame[0] = 0xd3;
  frame[1] = (payload.length >>> 8) & 0x03;
  frame[2] = payload.length & 0xff;
  payload.copy(frame, 3);
  frame.writeUIntBE(crc24q(frame.subarray(0, frame.length - 3)), frame.length - 3, 3);
  return frame;
}

test("RTCM controller waits for every target node to confirm one leased session", () => {
  const now = 1_785_059_400_000;
  const controller = new RtcmDownlinkController({
    mode: "live",
    targetMask: 7,
    leaseSeconds: 90,
    maxFragmentDataBytes: 160,
    observationIntervalMs: 1000,
    sessionEpoch: 0x12345678
  });
  assert.equal(controller.buildModeCommand().toString("ascii"), "G3M107212345678005A");
  controller.offerNtripChunk(buildRtcmFrame(1074), now);
  assert.equal(controller.takeNextFragment(now), null);

  for (const nodeLabel of ["A", "B", "C"]) {
    controller.observeNode({
      nodeLabel,
      mode: 2,
      sessionEpoch: 0x12345678,
      leaseRemainingMs: 80_000,
      observedUnixMs: now
    });
  }
  const payload = controller.takeNextFragment(now);
  assert.ok(payload);
  const fragment = decodeRtcmFragmentV3(payload.payload);
  assert.equal(fragment.targetMask, 7);
  assert.equal(fragment.sessionEpoch, 0x12345678);
  assert.equal(fragment.messageType, 1074);
  assert.equal(controller.stats(now).allTargetsArmed, true);
  assert.equal(controller.stats(now + 10_001).allTargetsArmed, true);
  assert.equal(controller.stats(now + 45_000).allTargetsArmed, true);
  assert.equal(controller.stats(now + 45_001).allTargetsArmed, false);
});

test("RTCM controller filters unsupported NTRIP messages through the UM220 essential profile", () => {
  const now = 1_785_059_400_000;
  const controller = new RtcmDownlinkController({
    mode: "probe",
    targetMask: 1,
    leaseSeconds: 90,
    maxFragmentDataBytes: 160,
    observationIntervalMs: 1000,
    sessionEpoch: 7
  });
  controller.observeNode({ nodeLabel: "A", mode: 1, sessionEpoch: 7, leaseRemainingMs: 80_000, observedUnixMs: now });
  controller.offerNtripChunk(Buffer.concat([buildRtcmFrame(1114), buildRtcmFrame(1124)]), now);
  const payload = controller.takeNextFragment(now);
  assert.equal(decodeRtcmFragmentV3(payload.payload).messageType, 1124);
  assert.equal(controller.stats(now).shaper.unsupportedFrames, 1);
});

test("RTCM controller returns a failed serial fragment to the head of its bounded queue", () => {
  const controller = new RtcmDownlinkController({
    mode: "live",
    targetMask: 0x01,
    leaseSeconds: 90,
    maxFragmentDataBytes: 160,
    observationIntervalMs: 1000,
    sessionEpoch: 0x01020304
  });
  controller.observeNode({
    nodeLabel: "A",
    mode: 2,
    sessionEpoch: 0x01020304,
    leaseRemainingMs: 80_000,
    observedUnixMs: 10_000
  });
  controller.offerNtripChunk(buildRtcmFrame(1074, 48), 10_000);

  const first = controller.takeNextFragment(10_000);
  assert.ok(first);
  controller.returnFragment(first);

  const retry = controller.takeNextFragment(10_001);
  assert.deepEqual(retry, first);
});

test("RTCM controller aggregates two observations and restores their order after a failed write", () => {
  const now = 10_000;
  const controller = new RtcmDownlinkController({
    mode: "live",
    targetMask: 0x01,
    leaseSeconds: 90,
    maxFragmentDataBytes: 512,
    observationIntervalMs: 1000,
    maxFragmentsPerFieldFrame: 2,
    sessionEpoch: 0x01020304
  });
  controller.observeNode({
    nodeLabel: "A",
    mode: 2,
    sessionEpoch: 0x01020304,
    leaseRemainingMs: 80_000,
    observedUnixMs: now
  });
  controller.offerNtripChunk(Buffer.concat([buildRtcmFrame(1074, 48), buildRtcmFrame(1124, 160)]), now);

  const prepared = controller.takeNextFieldPayload(now);
  assert.ok(prepared);
  assert.equal(prepared.batched, true);
  assert.equal(prepared.fragments.length, 2);
  assert.deepEqual(decodeRtcmFragmentBatchV1(prepared.payload), prepared.fragments.map((fragment) => fragment.payload));
  assert.deepEqual(
    prepared.fragments.map((fragment) => decodeRtcmFragmentV3(fragment.payload).messageType),
    [1074, 1124]
  );

  controller.returnFieldPayload(prepared);
  const retry = controller.takeNextFieldPayload(now + 1);
  assert.ok(retry);
  assert.deepEqual(retry.fragments, prepared.fragments);
});

test("RTCM controller attributes bounded queue, arbitration, serial and caster-to-write latency", () => {
  const controller = new RtcmDownlinkController({
    mode: "live",
    targetMask: 0x01,
    leaseSeconds: 90,
    maxFragmentDataBytes: 512,
    observationIntervalMs: 1000,
    maxFragmentsPerFieldFrame: 2,
    sessionEpoch: 0x01020304
  });
  controller.observeNode({
    nodeLabel: "A",
    mode: 2,
    sessionEpoch: 0x01020304,
    leaseRemainingMs: 80_000,
    observedUnixMs: 10_000
  });
  controller.offerNtripChunk(Buffer.concat([buildRtcmFrame(1074, 48), buildRtcmFrame(1005, 32)]), 10_000);

  controller.noteDispatchBlocked("poll-guard", 10_100);
  const prepared = controller.takeNextFieldPayload(10_300);
  assert.ok(prepared);
  controller.noteDispatchReady(10_700);
  controller.noteFieldPayloadWritten(prepared, 10_920, 10_950);

  const latency = controller.stats(10_950).latency;
  assert.equal(latency.shaperQueueMs.all.samplesTotal, 2);
  assert.equal(latency.shaperQueueMs.all.p95Ms, 300);
  assert.equal(latency.shaperQueueMs.byMessageType["1074"].lastMs, 300);
  assert.equal(latency.shaperQueueMs.byMessageType["1005"].lastMs, 300);
  assert.equal(latency.dispatchBlockMs.all.lastMs, 600);
  assert.equal(latency.dispatchBlockMs.byReason["poll-guard"].lastMs, 600);
  assert.equal(latency.preparedToWriteStartMs.lastMs, 620);
  assert.equal(latency.serialWriteMs.lastMs, 30);
  assert.equal(latency.casterToFieldWriteMs.all.samplesTotal, 2);
  assert.equal(latency.casterToFieldWriteMs.all.lastMs, 950);
  assert.deepEqual(latency.lastFieldWrite.messageTypes, [1005, 1074]);
  assert.equal(latency.lastFieldWrite.oldestCasterAgeMs, 950);
});
