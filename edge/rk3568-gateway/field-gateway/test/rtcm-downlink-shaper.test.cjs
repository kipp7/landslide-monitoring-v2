const assert = require("node:assert/strict");
const test = require("node:test");
const { crc24q } = require("../dist/gnss-transport-v3.js");
const {
  Rtcm3StreamDecoder,
  Um220RtcmShaper
} = require("../dist/rtcm-downlink-shaper.js");

function rtcmFrame(messageType, frameBytes, seed = 1) {
  const payloadBytes = frameBytes - 6;
  const payload = Buffer.alloc(payloadBytes);
  payload[0] = messageType >>> 4;
  payload[1] = (messageType & 0x0f) << 4;
  for (let index = 2; index < payload.length; index += 1) {
    payload[index] = (index * 29 + seed * 17 + messageType) & 0xff;
  }
  const header = Buffer.from([0xd3, (payloadBytes >>> 8) & 0x03, payloadBytes & 0xff]);
  const packet = Buffer.concat([header, payload]);
  const crc = crc24q(packet);
  return Buffer.concat([packet, Buffer.from([(crc >>> 16) & 0xff, (crc >>> 8) & 0xff, crc & 0xff])]);
}

test("RTCM stream decoder handles chunking, junk and CRC failures", () => {
  const first = rtcmFrame(1074, 90);
  const bad = Buffer.from(rtcmFrame(1084, 90));
  bad[bad.length - 1] ^= 0xff;
  const second = rtcmFrame(1124, 250);
  const input = Buffer.concat([Buffer.from("junk"), first, bad, second]);
  const decoder = new Rtcm3StreamDecoder();
  const output = [
    ...decoder.push(input.subarray(0, 17)),
    ...decoder.push(input.subarray(17, 133)),
    ...decoder.push(input.subarray(133))
  ];

  assert.deepEqual(output, [first, second]);
  assert.deepEqual(decoder.stats(), {
    chunks: 3,
    bytes: input.length,
    validFrames: 2,
    crcOrFrameErrors: 1,
    discardedBytes: 4,
    bufferResets: 0,
    bufferedBytes: 0
  });
});

test("UM220 shaper rejects non-essential constellations and keeps the newest frame per type", () => {
  const shaper = new Um220RtcmShaper();
  const oldBds = rtcmFrame(1124, 250, 1);
  const newBds = rtcmFrame(1124, 250, 2);

  assert.equal(shaper.offer(rtcmFrame(1084, 90), 1000), "unsupported");
  assert.equal(shaper.offer(rtcmFrame(1114, 90), 1000), "unsupported");
  assert.equal(shaper.offer(oldBds, 1000), "accepted");
  assert.equal(shaper.offer(newBds, 1200), "accepted");
  const selected = shaper.takeNext(1200);
  assert.ok(selected);
  assert.equal(selected.info.messageType, 1124);
  assert.deepEqual(selected.frame, newBds);
  assert.equal(selected.queueAgeMs, 0);
  assert.deepEqual(shaper.stats(), {
    acceptedFrames: 2,
    invalidFrames: 0,
    unsupportedFrames: 2,
    supersededFrames: 1,
    expiredFrames: 0,
    emittedFrames: 1,
    emittedBytes: 250,
    pendingTypes: 0
  });
});

test("UM220 shaper enforces 1 Hz observations and expires stale corrections", () => {
  const shaper = new Um220RtcmShaper();
  assert.equal(shaper.offer(rtcmFrame(1074, 90, 1), 1000), "accepted");
  assert.equal(shaper.takeNext(1000)?.info.messageType, 1074);
  assert.equal(shaper.offer(rtcmFrame(1074, 90, 2), 1400), "accepted");
  assert.equal(shaper.takeNext(1800), null);
  assert.equal(shaper.takeNext(2000)?.info.messageType, 1074);

  assert.equal(shaper.offer(rtcmFrame(1094, 90), 3000), "accepted");
  assert.equal(shaper.takeNext(6001), null);
  assert.equal(shaper.stats().expiredFrames, 1);
});

test("UM220 shaper prioritizes slow reference frames without starving observations", () => {
  const shaper = new Um220RtcmShaper();
  assert.equal(shaper.offer(rtcmFrame(1074, 90), 1000), "accepted");
  assert.equal(shaper.offer(rtcmFrame(1005, 100), 1100), "accepted");
  assert.equal(shaper.takeNext(1200)?.info.messageType, 1005);
  assert.equal(shaper.takeNext(1360)?.info.messageType, 1074);
});
