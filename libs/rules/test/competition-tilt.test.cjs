const assert = require("node:assert/strict");
const test = require("node:test");

const {
  competitionTiltProfileSchema,
  computeCompetitionTiltDeviation,
  DEFAULT_COMPETITION_TILT_QUICK_ALARM_THRESHOLDS,
  DEFAULT_COMPETITION_TILT_THRESHOLDS,
  evaluateCompetitionTiltQuickTrigger,
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

test("keeps Z drift as diagnostic evidence but excludes it from alarm deviation", () => {
  const result = computeCompetitionTiltDeviation(
    { x: 1.02, y: -0.47, z: 40.0 },
    { x: 1.0, y: -0.5, z: -54.0 }
  );

  assert.equal(result.maxAxis, "y");
  assert.ok(Math.abs(result.maxDeviationDeg - 0.03) < 1e-9);
  assert.deepEqual(result.delta, { x: 0.020000000000000018, y: 0.030000000000000027, z: 94 });
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

test("quick alarm triggers on one plausible fresh movement from the baseline", () => {
  const result = evaluateCompetitionTiltQuickTrigger({
    previous: { x: 0.2, y: -0.1, z: 89.9 },
    current: { x: 3.4, y: -0.2, z: 90.1 },
    baseline: { x: 0, y: 0, z: 90 },
    previousTsMs: 1_000,
    currentTsMs: 4_000,
    previousSeq: 10,
    currentSeq: 11,
    baselineTriggerDeg: 3,
    thresholds: DEFAULT_COMPETITION_TILT_QUICK_ALARM_THRESHOLDS,
  });

  assert.equal(result.triggered, true);
  assert.equal(result.reason, "triggered");
  assert.ok(Math.abs(result.maxPointDeltaDeg - 3.2) < 1e-9);
});

test("quick alarm tolerates a missing tilt cycle in the three-node field link", () => {
  const result = evaluateCompetitionTiltQuickTrigger({
    previous: { x: 1.23, y: -0.02, z: -33.78 },
    current: { x: 6.27, y: -4.65, z: -33.78 },
    baseline: { x: 1.23, y: -0.02, z: -33.78 },
    previousTsMs: 1_000,
    currentTsMs: 16_200,
    previousSeq: 641,
    currentSeq: 647,
    baselineTriggerDeg: 3,
    thresholds: DEFAULT_COMPETITION_TILT_QUICK_ALARM_THRESHOLDS,
  });

  assert.equal(result.triggered, true);
  assert.equal(result.reason, "triggered");
  assert.ok(Math.abs(result.gapSeconds - 15.2) < 1e-9);
});

test("quick alarm rejects stale, reordered, already-displaced and implausible points", () => {
  const base = {
    previous: { x: 0.2, y: 0, z: 90 },
    current: { x: 3.4, y: 0, z: 90 },
    baseline: { x: 0, y: 0, z: 90 },
    previousTsMs: 1_000,
    currentTsMs: 4_000,
    previousSeq: 10,
    currentSeq: 11,
    baselineTriggerDeg: 3,
    thresholds: DEFAULT_COMPETITION_TILT_QUICK_ALARM_THRESHOLDS,
  };

  assert.equal(evaluateCompetitionTiltQuickTrigger({ ...base, currentTsMs: 32_000 }).reason, "gap_too_large");
  assert.equal(evaluateCompetitionTiltQuickTrigger({ ...base, currentSeq: 10 }).reason, "invalid_sequence_order");
  assert.equal(
    evaluateCompetitionTiltQuickTrigger({ ...base, previous: { x: 1.2, y: 0, z: 90 } }).reason,
    "anchor_outside_baseline"
  );
  assert.equal(
    evaluateCompetitionTiltQuickTrigger({ ...base, current: { x: 40, y: 0, z: 90 } }).reason,
    "implausible_point_delta"
  );
});
