const assert = require("node:assert/strict");
const test = require("node:test");

const { crc24q, decodeRtcmFragmentV3 } = require("../dist/gnss-transport-v3.js");
const { RtcmDownlinkController } = require("../dist/rtcm-downlink-controller.js");

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
  const fragment = decodeRtcmFragmentV3(payload);
  assert.equal(fragment.targetMask, 7);
  assert.equal(fragment.sessionEpoch, 0x12345678);
  assert.equal(fragment.messageType, 1074);
  assert.equal(controller.stats(now).allTargetsArmed, true);
  assert.equal(controller.stats(now + 10_001).allTargetsArmed, false);
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
  assert.equal(decodeRtcmFragmentV3(payload).messageType, 1124);
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
