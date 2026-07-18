const test = require("node:test");
const assert = require("node:assert/strict");

const { assessNetworkMode } = require("../dist/network-mode.js");

test("accepts STA and Ethernet uplinks as healthy steady states", () => {
  assert.deepEqual(assessNetworkMode("sta_connected"), {
    level: "healthy",
    summary: "rk3568 network bootstrap is in sta_connected"
  });
  assert.deepEqual(assessNetworkMode("ethernet_uplink"), {
    level: "healthy",
    summary: "rk3568 network bootstrap is in ethernet_uplink"
  });
});

test("keeps AP fallback visible as an attention state", () => {
  assert.deepEqual(assessNetworkMode("ap_fallback"), {
    level: "attention",
    summary: "rk3568 network bootstrap has fallen back to AP mode"
  });
});

test("keeps disconnected, degraded, unknown, and missing modes critical", () => {
  for (const mode of ["disconnected", "degraded", "unexpected_mode", null]) {
    assert.deepEqual(assessNetworkMode(mode), {
      level: "critical",
      summary: "rk3568 network bootstrap is not in a steady-state mode"
    });
  }
});
