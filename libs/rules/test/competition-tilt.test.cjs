const assert = require("node:assert/strict");
const test = require("node:test");

const {
  competitionTiltProfileSchema,
  computeCompetitionTiltDeviation,
  DEFAULT_COMPETITION_TILT_THRESHOLDS,
  readTiltVector,
} = require("../dist/index.js");

test("reads zero tilt values as valid telemetry", () => {
  assert.deepEqual(
    readTiltVector({ tilt_x_deg: 0, tilt_y_deg: 0, tilt_z_deg: 0 }),
    { x: 0, y: 0, z: 0 }
  );
});

test("computes the largest absolute offset from a non-level baseline", () => {
  const result = computeCompetitionTiltDeviation(
    { x: 13.2, y: -4.5, z: 91.1 },
    { x: 10.1, y: -5.0, z: 89.8 }
  );
  assert.equal(result.maxAxis, "x");
  assert.ok(Math.abs(result.maxDeviationDeg - 3.1) < 1e-9);
  assert.deepEqual(result.delta, { x: 3.0999999999999996, y: 0.5, z: 1.2999999999999972 });
});

test("rejects a critical threshold below the high threshold", () => {
  const parsed = competitionTiltProfileSchema.safeParse({
    schemaVersion: 1,
    mode: "competition_relative_tilt",
    enabled: true,
    ruleId: "10000000-0000-4000-8000-000000000001",
    ruleVersion: 1,
    capturedAt: "2026-07-20T00:00:00.000Z",
    updatedAt: "2026-07-20T00:00:00.000Z",
    thresholds: {
      ...DEFAULT_COMPETITION_TILT_THRESHOLDS,
      highDeg: 8,
      criticalDeg: 7,
    },
    devices: [
      {
        deviceId: "00000000-0000-0000-0000-000000000001",
        deviceName: "FIELD-NODE-A",
        stationId: null,
        baseline: { x: 0, y: 0, z: 0 },
        capturedAt: "2026-07-20T00:00:00.000Z",
      },
    ],
  });
  assert.equal(parsed.success, false);
});
