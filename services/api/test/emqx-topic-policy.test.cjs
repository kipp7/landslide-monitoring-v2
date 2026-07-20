const assert = require("node:assert/strict");
const test = require("node:test");
const { isAllowedDeviceTopic } = require("../dist/routes/emqx.js");

const deviceId = "00000000-0000-4000-8000-000000022206";
const otherDeviceId = "00000000-0000-4000-8000-000000022207";

test("alarm terminal can subscribe desired and publish reported for itself", () => {
  assert.equal(isAllowedDeviceTopic("subscribe", `alarm/desired/${deviceId}`, deviceId), true);
  assert.equal(isAllowedDeviceTopic("publish", `alarm/reported/${deviceId}`, deviceId), true);
  assert.equal(isAllowedDeviceTopic("publish", `presence/${deviceId}`, deviceId), true);
});

test("alarm terminal cannot reverse topic direction or access another device", () => {
  assert.equal(isAllowedDeviceTopic("publish", `alarm/desired/${deviceId}`, deviceId), false);
  assert.equal(isAllowedDeviceTopic("subscribe", `alarm/reported/${deviceId}`, deviceId), false);
  assert.equal(isAllowedDeviceTopic("subscribe", `alarm/desired/${otherDeviceId}`, deviceId), false);
  assert.equal(isAllowedDeviceTopic("publish", `alarm/reported/${otherDeviceId}`, deviceId), false);
});

test("existing telemetry and command topic permissions remain unchanged", () => {
  assert.equal(isAllowedDeviceTopic("publish", `telemetry/${deviceId}`, deviceId), true);
  assert.equal(isAllowedDeviceTopic("publish", `cmd_ack/${deviceId}`, deviceId), true);
  assert.equal(isAllowedDeviceTopic("subscribe", `cmd/${deviceId}`, deviceId), true);
});
