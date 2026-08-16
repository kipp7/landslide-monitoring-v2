const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  RtkDisplacementEngine,
  RtkDisplacementStateStore,
  ecefDeltaToEnuMm,
  ecefToGeodetic,
  geodeticToEcef,
} = require("../dist/rtk-displacement.js");

const ORIGIN = {
  latitudeDeg: 24.612345678,
  longitudeDeg: 118.123456789,
  ellipsoidHeightM: 42.345,
};

const TEST_OPTIONS = {
  baselineMinimumSamples: 3,
  baselineMinimumDurationMs: 2000,
  baselineHorizontalStdLimitMm: 5,
  baselineUpStdLimitMm: 5,
  hampelMinimumSamples: 5,
  hampelWindowSize: 7,
  stepConfirmationSamples: 3,
};

function ecefWithEnuOffset(origin, frame, eastMm, northMm, upMm) {
  const ecef = geodeticToEcef(origin, frame);
  const lat = origin.latitudeDeg * Math.PI / 180;
  const lon = origin.longitudeDeg * Math.PI / 180;
  const sinLat = Math.sin(lat);
  const cosLat = Math.cos(lat);
  const sinLon = Math.sin(lon);
  const cosLon = Math.cos(lon);
  const east = eastMm / 1000;
  const north = northMm / 1000;
  const up = upMm / 1000;
  return {
    x: ecef.x - sinLon * east - sinLat * cosLon * north + cosLat * cosLon * up,
    y: ecef.y + cosLon * east - sinLat * sinLon * north + cosLat * sinLon * up,
    z: ecef.z + cosLat * north + sinLat * up,
  };
}

function observation({
  deviceId = "00000000-0000-0000-0000-000000000001",
  observedAtMs,
  sampleEpoch,
  eastMm = 0,
  northMm = 0,
  upMm = 0,
  frame = "CGCS2000",
  ggaQuality = 4,
  trusted = true,
  displacementEligible = true,
  gnssSource = "hardware",
  correctionAgeMs = 2000,
  solutionAgeMs = 100,
  sigmaLatitudeMm = 6,
  sigmaLongitudeMm = 7,
  sigmaAltitudeMm = 15,
} = {}) {
  const point = ecefToGeodetic(ecefWithEnuOffset(ORIGIN, frame, eastMm, northMm, upMm), frame);
  return {
    deviceId,
    observedAtMs,
    sampleEpoch,
    coordinateFrame: frame,
    displacementEligible,
    gnssSource,
    ggaQuality,
    trusted,
    correctionAgeMs,
    solutionAgeMs,
    sigmaLatitudeMm,
    sigmaLongitudeMm,
    sigmaAltitudeMm,
    ...point,
  };
}

function establishBaseline(engine, startMs = 1_000_000) {
  assert.equal(engine.process(observation({ observedAtMs: startMs, sampleEpoch: 1 })).meta.displacement_state, "collecting_baseline");
  assert.equal(engine.process(observation({ observedAtMs: startMs + 1000, sampleEpoch: 2 })).meta.displacement_state, "collecting_baseline");
  const established = engine.process(observation({ observedAtMs: startMs + 2000, sampleEpoch: 3 }));
  assert.equal(established.meta.displacement_state, "baseline_established");
  assert.equal(established.meta.displacement_confidence, "high");
  assert.equal(established.baselineChanged, true);
  return startMs;
}

test("WGS84 and CGCS2000 geodetic/ECEF conversion uses the correct ellipsoid", () => {
  const equator = geodeticToEcef({ latitudeDeg: 0, longitudeDeg: 0, ellipsoidHeightM: 0 }, "WGS84");
  assert.ok(Math.abs(equator.x - 6378137) < 1e-6);
  assert.ok(Math.abs(equator.y) < 1e-9);
  assert.ok(Math.abs(equator.z) < 1e-9);

  for (const frame of ["WGS84", "CGCS2000"]) {
    const ecef = geodeticToEcef(ORIGIN, frame);
    const recovered = ecefToGeodetic(ecef, frame);
    assert.ok(Math.abs(recovered.latitudeDeg - ORIGIN.latitudeDeg) < 1e-10);
    assert.ok(Math.abs(recovered.longitudeDeg - ORIGIN.longitudeDeg) < 1e-10);
    assert.ok(Math.abs(recovered.ellipsoidHeightM - ORIGIN.ellipsoidHeightM) < 1e-5);
  }
});

test("ECEF delta rotates into millimetre-scale east, north and up axes", () => {
  const originEcef = geodeticToEcef(ORIGIN, "CGCS2000");
  const shifted = ecefWithEnuOffset(ORIGIN, "CGCS2000", 123.4, -56.7, 89.1);
  const enu = ecefDeltaToEnuMm(shifted, originEcef, ORIGIN.latitudeDeg, ORIGIN.longitudeDeg);
  assert.ok(Math.abs(enu.east - 123.4) < 1e-5);
  assert.ok(Math.abs(enu.north + 56.7) < 1e-5);
  assert.ok(Math.abs(enu.up - 89.1) < 1e-5);
});

test("valid hardware fixes remain usable with explicit confidence while simulated input fails closed", () => {
  const engine = new RtkDisplacementEngine("00000000-0000-0000-0000-000000000001", TEST_OPTIONS);
  const notFixed = engine.process(observation({ observedAtMs: 1000, sampleEpoch: 1, ggaQuality: 1, trusted: false, displacementEligible: false }));
  assert.equal(notFixed.meta.displacement_state, "collecting_baseline");
  assert.equal(notFixed.meta.displacement_gate_reason, null);
  assert.equal(notFixed.meta.displacement_confidence, "low");
  assert.deepEqual(notFixed.metrics, {});

  const simulated = engine.process(observation({ observedAtMs: 2000, sampleEpoch: 2, gnssSource: "simulated" }));
  assert.equal(simulated.meta.displacement_gate_reason, "gnss_not_hardware");
  const stale = engine.process(observation({ observedAtMs: 3000, sampleEpoch: 3, correctionAgeMs: 6100 }));
  assert.equal(stale.meta.displacement_state, "collecting_baseline");
  assert.equal(stale.meta.displacement_gate_reason, null);
  assert.equal(stale.meta.displacement_confidence, "medium");
});

test("stable consecutive Fixed samples establish a frozen baseline and produce ENU displacement", () => {
  const engine = new RtkDisplacementEngine("00000000-0000-0000-0000-000000000001", TEST_OPTIONS);
  const start = establishBaseline(engine);
  const tracked = engine.process(observation({
    observedAtMs: start + 3000,
    sampleEpoch: 4,
    eastMm: 12,
    northMm: -5,
    upMm: 3,
  }));
  assert.equal(tracked.meta.displacement_state, "tracking");
  assert.equal(tracked.meta.displacement_confidence, "high");
  assert.equal(tracked.meta.displacement_height_datum, "ellipsoid");
  assert.ok(Math.abs(tracked.metrics.displacement_east_mm - 12) < 0.1);
  assert.ok(Math.abs(tracked.metrics.displacement_north_mm + 5) < 0.1);
  assert.ok(Math.abs(tracked.metrics.displacement_up_mm - 3) < 0.1);
  assert.ok(Math.abs(tracked.metrics.displacement_horizontal_mm - 13) < 0.1);
  assert.equal(tracked.metrics.displacement_mm, tracked.metrics.displacement_horizontal_mm);
});

test("unstable baseline window is rejected and coordinate-frame changes never reuse a baseline", () => {
  const unstable = new RtkDisplacementEngine("00000000-0000-0000-0000-000000000001", TEST_OPTIONS);
  unstable.process(observation({ observedAtMs: 1000, sampleEpoch: 1, eastMm: 0 }));
  unstable.process(observation({ observedAtMs: 2000, sampleEpoch: 2, eastMm: 40 }));
  const result = unstable.process(observation({ observedAtMs: 3000, sampleEpoch: 3, eastMm: -40 }));
  assert.equal(result.meta.displacement_state, "baseline_unstable");
  assert.equal(result.baselineChanged, false);

  const engine = new RtkDisplacementEngine("00000000-0000-0000-0000-000000000001", TEST_OPTIONS);
  const start = establishBaseline(engine);
  const changed = engine.process(observation({ observedAtMs: start + 3000, sampleEpoch: 4, frame: "WGS84" }));
  assert.equal(changed.meta.displacement_state, "blocked");
  assert.equal(changed.meta.displacement_gate_reason, "coordinate_frame_changed");
  assert.deepEqual(changed.metrics, {});
});

test("Hampel rejects an isolated spike but accepts a coherent persistent displacement step", () => {
  const engine = new RtkDisplacementEngine("00000000-0000-0000-0000-000000000001", TEST_OPTIONS);
  const start = establishBaseline(engine);
  for (let index = 4; index <= 8; index += 1) {
    const stable = engine.process(observation({ observedAtMs: start + index * 1000, sampleEpoch: index }));
    assert.equal(stable.meta.displacement_state, "tracking");
  }

  const spike = engine.process(observation({ observedAtMs: start + 9000, sampleEpoch: 9, eastMm: 500 }));
  assert.equal(spike.meta.displacement_state, "step_candidate");
  assert.equal(spike.meta.displacement_outlier_rejected, true);
  assert.deepEqual(spike.metrics, {});
  const normal = engine.process(observation({ observedAtMs: start + 10_000, sampleEpoch: 10, eastMm: 1 }));
  assert.equal(normal.meta.displacement_state, "tracking");

  const step1 = engine.process(observation({ observedAtMs: start + 11_000, sampleEpoch: 11, eastMm: 200, northMm: 50 }));
  const step2 = engine.process(observation({ observedAtMs: start + 12_000, sampleEpoch: 12, eastMm: 202, northMm: 49 }));
  const step3 = engine.process(observation({ observedAtMs: start + 13_000, sampleEpoch: 13, eastMm: 201, northMm: 51 }));
  assert.equal(step1.meta.displacement_state, "step_candidate");
  assert.equal(step2.meta.displacement_state, "step_candidate");
  assert.equal(step3.meta.displacement_state, "tracking");
  assert.equal(step3.meta.displacement_filter_status, "persistent_step_confirmed");
  assert.ok(Math.abs(step3.metrics.displacement_east_mm - 201) < 1);
  assert.ok(Math.abs(step3.metrics.displacement_north_mm - 50) < 1);
});

test("persistent baseline state restores cleanly and corrupt state fails closed", async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "rtk-displacement-"));
  try {
    const statePath = path.join(tempRoot, "state.json");
    const deviceId = "00000000-0000-0000-0000-000000000001";
    const store = new RtkDisplacementStateStore(statePath, TEST_OPTIONS);
    await store.init();
    store.process(observation({ deviceId, observedAtMs: 1000, sampleEpoch: 1 }));
    store.process(observation({ deviceId, observedAtMs: 2000, sampleEpoch: 2 }));
    const established = store.process(observation({ deviceId, observedAtMs: 3000, sampleEpoch: 3 }));
    assert.equal(established.baselineChanged, true);
    await store.persistChangedBaseline(deviceId);

    const restored = new RtkDisplacementStateStore(statePath, TEST_OPTIONS);
    await restored.init();
    const tracked = restored.process(observation({ deviceId, observedAtMs: 4000, sampleEpoch: 4, eastMm: 10 }));
    assert.equal(tracked.meta.displacement_state, "tracking");

    await fs.writeFile(statePath, "{broken", "utf8");
    const corrupt = new RtkDisplacementStateStore(statePath, TEST_OPTIONS);
    await corrupt.init();
    const blocked = corrupt.process(observation({ deviceId, observedAtMs: 5000, sampleEpoch: 5 }));
    assert.equal(blocked.meta.displacement_state, "blocked");
    assert.match(blocked.meta.displacement_gate_reason, /^state_invalid:/);
    assert.deepEqual(blocked.metrics, {});
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
