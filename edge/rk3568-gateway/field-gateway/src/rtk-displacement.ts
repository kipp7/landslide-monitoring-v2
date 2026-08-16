import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

export const RTK_DISPLACEMENT_ALGORITHM_VERSION = "ecef-enu-hampel-cv-kf-v1";

export type RtkCoordinateFrame = "WGS84" | "CGCS2000";
type DisplacementConfidence = "low" | "medium" | "high";

export type EcefPoint = {
  x: number;
  y: number;
  z: number;
};

export type EnuPointMm = {
  east: number;
  north: number;
  up: number;
};

export type GeodeticPoint = {
  latitudeDeg: number;
  longitudeDeg: number;
  ellipsoidHeightM: number;
};

export type RtkDisplacementObservation = {
  deviceId: string;
  observedAtMs: number;
  latitudeDeg: number;
  longitudeDeg: number;
  ellipsoidHeightM: number | null;
  coordinateFrame: RtkCoordinateFrame | null;
  displacementEligible: boolean;
  gnssSource: string | null;
  ggaQuality: number | null;
  trusted: boolean;
  correctionAgeMs: number | null;
  solutionAgeMs: number | null;
  sigmaLatitudeMm: number | null;
  sigmaLongitudeMm: number | null;
  sigmaAltitudeMm: number | null;
  sampleEpoch: number | null;
};

export type RtkDisplacementResult = {
  metrics: Record<string, number | string | boolean | null>;
  meta: Record<string, unknown>;
  baselineChanged: boolean;
};

type Ellipsoid = {
  semiMajorAxisM: number;
  flattening: number;
};

type Baseline = GeodeticPoint & {
  id: string;
  coordinateFrame: RtkCoordinateFrame;
  ecef: EcefPoint;
  establishedAt: string;
  sampleCount: number;
  durationMs: number;
  horizontalStdMm: number;
  upStdMm: number;
  confidence: DisplacementConfidence;
};

export type RtkDisplacementPersistentState = {
  schemaVersion: 1;
  algorithmVersion: typeof RTK_DISPLACEMENT_ALGORITHM_VERSION;
  baseline: Baseline;
};

type BaselineCandidate = {
  observedAtMs: number;
  geodetic: GeodeticPoint;
  ecef: EcefPoint;
  confidence: DisplacementConfidence;
};

type TimedEnuPoint = EnuPointMm & {
  observedAtMs: number;
};

type KalmanState = {
  positionMm: number;
  velocityMmPerSecond: number;
  p00: number;
  p01: number;
  p10: number;
  p11: number;
  lastObservedAtMs: number;
};

type EngineOptions = {
  baselineMinimumSamples: number;
  baselineMinimumDurationMs: number;
  baselineMaximumGapMs: number;
  baselineHorizontalStdLimitMm: number;
  baselineUpStdLimitMm: number;
  maximumHorizontalSigmaMm: number;
  maximumUpSigmaMm: number;
  defaultHorizontalSigmaMm: number;
  defaultUpSigmaMm: number;
  hampelWindowSize: number;
  hampelMinimumSamples: number;
  hampelScale: number;
  hampelHorizontalFloorMm: number;
  hampelUpFloorMm: number;
  stepConfirmationSamples: number;
  stepConfirmationWindowMs: number;
  stepHorizontalConsistencyMm: number;
  stepUpConsistencyMm: number;
  filterResetGapMs: number;
  horizontalAccelerationNoiseMmPerSecond2: number;
  verticalAccelerationNoiseMmPerSecond2: number;
};

const DEFAULT_OPTIONS: EngineOptions = {
  baselineMinimumSamples: 30,
  baselineMinimumDurationMs: 60_000,
  baselineMaximumGapMs: 10_000,
  baselineHorizontalStdLimitMm: 20,
  baselineUpStdLimitMm: 40,
  maximumHorizontalSigmaMm: 100,
  maximumUpSigmaMm: 200,
  defaultHorizontalSigmaMm: 20,
  defaultUpSigmaMm: 50,
  hampelWindowSize: 9,
  hampelMinimumSamples: 5,
  hampelScale: 3,
  hampelHorizontalFloorMm: 30,
  hampelUpFloorMm: 60,
  stepConfirmationSamples: 3,
  stepConfirmationWindowMs: 15_000,
  stepHorizontalConsistencyMm: 40,
  stepUpConsistencyMm: 80,
  filterResetGapMs: 30_000,
  horizontalAccelerationNoiseMmPerSecond2: 0.5,
  verticalAccelerationNoiseMmPerSecond2: 1
};

const ELLIPSOIDS: Record<RtkCoordinateFrame, Ellipsoid> = {
  WGS84: {
    semiMajorAxisM: 6_378_137,
    flattening: 1 / 298.257223563
  },
  CGCS2000: {
    semiMajorAxisM: 6_378_137,
    flattening: 1 / 298.257222101
  }
};

const STATE_SCHEMA_VERSION = 1;

function radians(degrees: number): number {
  return degrees * Math.PI / 180;
}

function degrees(radiansValue: number): number {
  return radiansValue * 180 / Math.PI;
}

function finite(value: number): boolean {
  return Number.isFinite(value);
}

function round(value: number, decimalPlaces = 3): number {
  const scale = 10 ** decimalPlaces;
  return Math.round(value * scale) / scale;
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const upper = sorted[middle] ?? 0;
  if (sorted.length % 2 === 1) return upper;
  return ((sorted[middle - 1] ?? upper) + upper) / 2;
}

function standardDeviation(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1);
  return Math.sqrt(Math.max(0, variance));
}

function medianAbsoluteDeviation(values: readonly number[]): number {
  const center = median(values);
  return median(values.map((value) => Math.abs(value - center)));
}

function medianEnu(points: readonly TimedEnuPoint[]): TimedEnuPoint {
  return {
    east: median(points.map((point) => point.east)),
    north: median(points.map((point) => point.north)),
    up: median(points.map((point) => point.up)),
    observedAtMs: points.at(-1)?.observedAtMs ?? 0
  };
}

export function geodeticToEcef(point: GeodeticPoint, frame: RtkCoordinateFrame): EcefPoint {
  const ellipsoid = ELLIPSOIDS[frame];
  const latitude = radians(point.latitudeDeg);
  const longitude = radians(point.longitudeDeg);
  const eccentricitySquared = ellipsoid.flattening * (2 - ellipsoid.flattening);
  const sinLatitude = Math.sin(latitude);
  const cosLatitude = Math.cos(latitude);
  const primeVerticalRadius = ellipsoid.semiMajorAxisM /
    Math.sqrt(1 - eccentricitySquared * sinLatitude ** 2);

  return {
    x: (primeVerticalRadius + point.ellipsoidHeightM) * cosLatitude * Math.cos(longitude),
    y: (primeVerticalRadius + point.ellipsoidHeightM) * cosLatitude * Math.sin(longitude),
    z: (primeVerticalRadius * (1 - eccentricitySquared) + point.ellipsoidHeightM) * sinLatitude
  };
}

export function ecefToGeodetic(point: EcefPoint, frame: RtkCoordinateFrame): GeodeticPoint {
  const ellipsoid = ELLIPSOIDS[frame];
  const eccentricitySquared = ellipsoid.flattening * (2 - ellipsoid.flattening);
  const radius = Math.hypot(point.x, point.y);
  const longitude = Math.atan2(point.y, point.x);
  let latitude = Math.atan2(point.z, radius * (1 - eccentricitySquared));
  let height = 0;

  for (let iteration = 0; iteration < 12; iteration += 1) {
    const sinLatitude = Math.sin(latitude);
    const primeVerticalRadius = ellipsoid.semiMajorAxisM /
      Math.sqrt(1 - eccentricitySquared * sinLatitude ** 2);
    const cosLatitude = Math.cos(latitude);
    height = Math.abs(cosLatitude) > 1e-12 ? radius / cosLatitude - primeVerticalRadius : 0;
    const nextLatitude = Math.atan2(
      point.z,
      radius * (1 - eccentricitySquared * primeVerticalRadius / (primeVerticalRadius + height))
    );
    if (Math.abs(nextLatitude - latitude) < 1e-13) {
      latitude = nextLatitude;
      break;
    }
    latitude = nextLatitude;
  }

  const sinLatitude = Math.sin(latitude);
  const primeVerticalRadius = ellipsoid.semiMajorAxisM /
    Math.sqrt(1 - eccentricitySquared * sinLatitude ** 2);
  height = radius / Math.cos(latitude) - primeVerticalRadius;
  return {
    latitudeDeg: degrees(latitude),
    longitudeDeg: degrees(longitude),
    ellipsoidHeightM: height
  };
}

export function ecefDeltaToEnuMm(
  point: EcefPoint,
  origin: EcefPoint,
  originLatitudeDeg: number,
  originLongitudeDeg: number
): EnuPointMm {
  const latitude = radians(originLatitudeDeg);
  const longitude = radians(originLongitudeDeg);
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;
  const dz = point.z - origin.z;
  const sinLatitude = Math.sin(latitude);
  const cosLatitude = Math.cos(latitude);
  const sinLongitude = Math.sin(longitude);
  const cosLongitude = Math.cos(longitude);

  return {
    east: (-sinLongitude * dx + cosLongitude * dy) * 1000,
    north: (-sinLatitude * cosLongitude * dx - sinLatitude * sinLongitude * dy + cosLatitude * dz) * 1000,
    up: (cosLatitude * cosLongitude * dx + cosLatitude * sinLongitude * dy + sinLatitude * dz) * 1000
  };
}

function validatePersistentState(value: unknown): RtkDisplacementPersistentState | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (record.schemaVersion !== STATE_SCHEMA_VERSION ||
      record.algorithmVersion !== RTK_DISPLACEMENT_ALGORITHM_VERSION ||
      !record.baseline || typeof record.baseline !== "object") return null;
  const baseline = record.baseline as Record<string, unknown>;
  const ecef = baseline.ecef as Record<string, unknown> | undefined;
  if ((baseline.coordinateFrame !== "WGS84" && baseline.coordinateFrame !== "CGCS2000") ||
      typeof baseline.id !== "string" || baseline.id.length < 8 ||
      typeof baseline.establishedAt !== "string" || Number.isNaN(Date.parse(baseline.establishedAt)) ||
      typeof baseline.sampleCount !== "number" || !Number.isInteger(baseline.sampleCount) || baseline.sampleCount < 1 ||
      typeof baseline.durationMs !== "number" || !finite(baseline.durationMs) || baseline.durationMs < 0 ||
      typeof baseline.latitudeDeg !== "number" || !finite(baseline.latitudeDeg) ||
      typeof baseline.longitudeDeg !== "number" || !finite(baseline.longitudeDeg) ||
      typeof baseline.ellipsoidHeightM !== "number" || !finite(baseline.ellipsoidHeightM) ||
      typeof baseline.horizontalStdMm !== "number" || !finite(baseline.horizontalStdMm) ||
      typeof baseline.upStdMm !== "number" || !finite(baseline.upStdMm) ||
      (baseline.confidence !== "low" && baseline.confidence !== "medium" && baseline.confidence !== "high") ||
      !ecef || typeof ecef.x !== "number" || !finite(ecef.x) ||
      typeof ecef.y !== "number" || !finite(ecef.y) || typeof ecef.z !== "number" || !finite(ecef.z)) {
    return null;
  }
  return value as RtkDisplacementPersistentState;
}

function baselineId(deviceId: string, frame: RtkCoordinateFrame, ecef: EcefPoint, establishedAt: string): string {
  return createHash("sha256")
    .update(`${deviceId}|${frame}|${ecef.x.toFixed(4)}|${ecef.y.toFixed(4)}|${ecef.z.toFixed(4)}|${establishedAt}`)
    .digest("hex")
    .slice(0, 20);
}

function gateReason(observation: RtkDisplacementObservation): string | null {
  if (observation.gnssSource !== "hardware") return "gnss_not_hardware";
  if (observation.ggaQuality === null || ![1, 2, 4, 5].includes(observation.ggaQuality)) return "gga_fix_unavailable";
  if (!observation.coordinateFrame) return "coordinate_frame_missing";
  if (observation.ellipsoidHeightM === null) return "ellipsoid_height_unavailable";
  if (!finite(observation.latitudeDeg) || Math.abs(observation.latitudeDeg) > 90 ||
      !finite(observation.longitudeDeg) || Math.abs(observation.longitudeDeg) > 180 ||
      !finite(observation.ellipsoidHeightM)) return "position_invalid";
  return null;
}

function observationConfidence(
  observation: RtkDisplacementObservation,
  options: EngineOptions
): DisplacementConfidence {
  const horizontalSigmaGood = observation.sigmaLatitudeMm !== null && observation.sigmaLongitudeMm !== null &&
    observation.sigmaLatitudeMm > 0 && observation.sigmaLongitudeMm > 0 &&
    observation.sigmaLatitudeMm <= options.maximumHorizontalSigmaMm &&
    observation.sigmaLongitudeMm <= options.maximumHorizontalSigmaMm;
  const verticalSigmaGood = observation.sigmaAltitudeMm === null ||
    (observation.sigmaAltitudeMm > 0 && observation.sigmaAltitudeMm <= options.maximumUpSigmaMm);
  if (observation.ggaQuality === 4 && observation.trusted && observation.displacementEligible &&
      observation.correctionAgeMs !== null && observation.correctionAgeMs <= 6000 &&
      observation.solutionAgeMs !== null && observation.solutionAgeMs <= 2000 &&
      horizontalSigmaGood && verticalSigmaGood) return "high";
  if (observation.ggaQuality === 2 || observation.ggaQuality === 4 || observation.ggaQuality === 5) return "medium";
  return "low";
}

function confidenceRank(confidence: DisplacementConfidence): number {
  if (confidence === "high") return 3;
  if (confidence === "medium") return 2;
  return 1;
}

function lowerConfidence(a: DisplacementConfidence, b: DisplacementConfidence): DisplacementConfidence {
  return confidenceRank(a) <= confidenceRank(b) ? a : b;
}

function initializeKalman(positionMm: number, sigmaMm: number, observedAtMs: number): KalmanState {
  return {
    positionMm,
    velocityMmPerSecond: 0,
    p00: sigmaMm ** 2,
    p01: 0,
    p10: 0,
    p11: Math.max(1, (sigmaMm / 10) ** 2),
    lastObservedAtMs: observedAtMs
  };
}

function updateKalman(
  state: KalmanState | null,
  measurementMm: number,
  sigmaMm: number,
  observedAtMs: number,
  accelerationNoise: number,
  resetGapMs: number,
  forceReset: boolean
): { state: KalmanState; innovationNis: number } {
  if (!state || forceReset || observedAtMs <= state.lastObservedAtMs ||
      observedAtMs - state.lastObservedAtMs > resetGapMs) {
    return { state: initializeKalman(measurementMm, sigmaMm, observedAtMs), innovationNis: 0 };
  }

  const dt = Math.max(0.001, (observedAtMs - state.lastObservedAtMs) / 1000);
  const predictedPosition = state.positionMm + dt * state.velocityMmPerSecond;
  const predictedVelocity = state.velocityMmPerSecond;
  const dt2 = dt ** 2;
  const dt3 = dt ** 3;
  const dt4 = dt ** 4;
  const q2 = accelerationNoise ** 2;
  const predictedP00 = state.p00 + dt * (state.p10 + state.p01) + dt2 * state.p11 + q2 * dt4 / 4;
  const predictedP01 = state.p01 + dt * state.p11 + q2 * dt3 / 2;
  const predictedP10 = state.p10 + dt * state.p11 + q2 * dt3 / 2;
  const predictedP11 = state.p11 + q2 * dt2;
  const measurementVariance = Math.max(1, sigmaMm ** 2);
  const innovation = measurementMm - predictedPosition;
  const innovationVariance = Math.max(1e-9, predictedP00 + measurementVariance);
  const gainPosition = predictedP00 / innovationVariance;
  const gainVelocity = predictedP10 / innovationVariance;

  return {
    state: {
      positionMm: predictedPosition + gainPosition * innovation,
      velocityMmPerSecond: predictedVelocity + gainVelocity * innovation,
      p00: Math.max(1e-9, (1 - gainPosition) * predictedP00),
      p01: (1 - gainPosition) * predictedP01,
      p10: predictedP10 - gainVelocity * predictedP00,
      p11: Math.max(1e-9, predictedP11 - gainVelocity * predictedP01),
      lastObservedAtMs: observedAtMs
    },
    innovationNis: innovation ** 2 / innovationVariance
  };
}

export class RtkDisplacementEngine {
  private readonly options: EngineOptions;
  private baseline: Baseline | null = null;
  private baselineCandidates: BaselineCandidate[] = [];
  private acceptedHistory: TimedEnuPoint[] = [];
  private stepCandidates: TimedEnuPoint[] = [];
  private eastFilter: KalmanState | null = null;
  private northFilter: KalmanState | null = null;
  private upFilter: KalmanState | null = null;
  private lastSampleEpoch: number | null = null;
  private lastObservedAtMs: number | null = null;

  constructor(
    private readonly deviceId: string,
    options: Partial<EngineOptions> = {}
  ) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  importPersistentState(value: unknown): boolean {
    const parsed = validatePersistentState(value);
    if (!parsed) return false;
    this.baseline = { ...parsed.baseline, ecef: { ...parsed.baseline.ecef } };
    this.resetTrackingState();
    return true;
  }

  exportPersistentState(): RtkDisplacementPersistentState | null {
    if (!this.baseline) return null;
    return {
      schemaVersion: STATE_SCHEMA_VERSION,
      algorithmVersion: RTK_DISPLACEMENT_ALGORITHM_VERSION,
      baseline: { ...this.baseline, ecef: { ...this.baseline.ecef } }
    };
  }

  process(observation: RtkDisplacementObservation): RtkDisplacementResult {
    const commonMeta: Record<string, unknown> = {
      displacement_algorithm_version: RTK_DISPLACEMENT_ALGORITHM_VERSION,
      displacement_baseline_id: this.baseline?.id ?? null,
      displacement_baseline_sample_count: this.baseline?.sampleCount ?? this.baselineCandidates.length
    };
    const confidence = observationConfidence(observation, this.options);
    const rejected = gateReason(observation);
    if (rejected) {
      if (!this.baseline) this.baselineCandidates = [];
      this.stepCandidates = [];
      return {
        metrics: {},
        meta: {
          ...commonMeta,
          displacement_state: "blocked",
          displacement_gate_reason: rejected,
          displacement_confidence: confidence,
          displacement_filter_status: "not_updated",
          displacement_outlier_rejected: false
        },
        baselineChanged: false
      };
    }

    if (this.baseline && observation.coordinateFrame !== this.baseline.coordinateFrame) {
      return {
        metrics: {},
        meta: {
          ...commonMeta,
          displacement_state: "blocked",
          displacement_gate_reason: "coordinate_frame_changed",
          displacement_filter_status: "not_updated",
          displacement_outlier_rejected: false
        },
        baselineChanged: false
      };
    }

    if (observation.sampleEpoch !== null && observation.sampleEpoch === this.lastSampleEpoch &&
        this.lastObservedAtMs !== null && observation.observedAtMs - this.lastObservedAtMs < 30_000) {
      return {
        metrics: {},
        meta: {
          ...commonMeta,
          displacement_state: this.baseline ? "tracking" : "collecting_baseline",
          displacement_gate_reason: "duplicate_sample_epoch",
          displacement_filter_status: "not_updated",
          displacement_outlier_rejected: false
        },
        baselineChanged: false
      };
    }

    this.lastSampleEpoch = observation.sampleEpoch;
    this.lastObservedAtMs = observation.observedAtMs;
    const frame = observation.coordinateFrame;
    if (!frame) {
      return {
        metrics: {},
        meta: {
          ...commonMeta,
          displacement_state: "blocked",
          displacement_gate_reason: "coordinate_frame_missing",
          displacement_filter_status: "not_updated",
          displacement_outlier_rejected: false
        },
        baselineChanged: false
      };
    }
    const ellipsoidHeightM = observation.ellipsoidHeightM;
    if (ellipsoidHeightM === null) {
      return {
        metrics: {},
        meta: {
          ...commonMeta,
          displacement_state: "blocked",
          displacement_gate_reason: "ellipsoid_height_unavailable",
          displacement_filter_status: "not_updated",
          displacement_outlier_rejected: false
        },
        baselineChanged: false
      };
    }
    const geodetic: GeodeticPoint = {
      latitudeDeg: observation.latitudeDeg,
      longitudeDeg: observation.longitudeDeg,
      ellipsoidHeightM
    };
    const ecef = geodeticToEcef(geodetic, frame);

    if (!this.baseline) {
      return this.collectBaseline(observation, geodetic, ecef, frame);
    }

    return this.trackDisplacement(observation, ecef);
  }

  private collectBaseline(
    observation: RtkDisplacementObservation,
    geodetic: GeodeticPoint,
    ecef: EcefPoint,
    frame: RtkCoordinateFrame
  ): RtkDisplacementResult {
    const lastCandidate = this.baselineCandidates.at(-1);
    if (lastCandidate && observation.observedAtMs - lastCandidate.observedAtMs > this.options.baselineMaximumGapMs) {
      this.baselineCandidates = [];
    }
    this.baselineCandidates.push({
      observedAtMs: observation.observedAtMs,
      geodetic,
      ecef,
      confidence: observationConfidence(observation, this.options)
    });
    const maximumCandidates = Math.max(this.options.baselineMinimumSamples * 2, this.options.baselineMinimumSamples + 5);
    if (this.baselineCandidates.length > maximumCandidates) this.baselineCandidates.shift();
    const first = this.baselineCandidates[0];
    const durationMs = first ? observation.observedAtMs - first.observedAtMs : 0;
    if (this.baselineCandidates.length < this.options.baselineMinimumSamples ||
        durationMs < this.options.baselineMinimumDurationMs) {
      return this.baselineResult("collecting_baseline", null, false);
    }

    const baselineEcef: EcefPoint = {
      x: median(this.baselineCandidates.map((candidate) => candidate.ecef.x)),
      y: median(this.baselineCandidates.map((candidate) => candidate.ecef.y)),
      z: median(this.baselineCandidates.map((candidate) => candidate.ecef.z))
    };
    const baselineGeodetic = ecefToGeodetic(baselineEcef, frame);
    const residuals = this.baselineCandidates.map((candidate) =>
      ecefDeltaToEnuMm(
        candidate.ecef,
        baselineEcef,
        baselineGeodetic.latitudeDeg,
        baselineGeodetic.longitudeDeg
      )
    );
    const eastStdMm = standardDeviation(residuals.map((point) => point.east));
    const northStdMm = standardDeviation(residuals.map((point) => point.north));
    const horizontalStdMm = Math.hypot(eastStdMm, northStdMm);
    const upStdMm = standardDeviation(residuals.map((point) => point.up));

    if (horizontalStdMm > this.options.baselineHorizontalStdLimitMm ||
        upStdMm > this.options.baselineUpStdLimitMm) {
      this.baselineCandidates.shift();
      return this.baselineResult(
        "baseline_unstable",
        `dispersion_exceeded:h=${round(horizontalStdMm)}mm,u=${round(upStdMm)}mm`,
        false
      );
    }

    const establishedAt = new Date(observation.observedAtMs).toISOString();
    const confidence = this.baselineCandidates.reduce<DisplacementConfidence>(
      (result, candidate) => lowerConfidence(result, candidate.confidence),
      "high"
    );
    this.baseline = {
      id: baselineId(this.deviceId, frame, baselineEcef, establishedAt),
      coordinateFrame: frame,
      ecef: baselineEcef,
      ...baselineGeodetic,
      establishedAt,
      sampleCount: this.baselineCandidates.length,
      durationMs,
      horizontalStdMm,
      upStdMm,
      confidence
    };
    this.baselineCandidates = [];
    this.resetTrackingState();
    return this.baselineResult("baseline_established", null, true);
  }

  private baselineResult(state: string, reason: string | null, baselineChanged: boolean): RtkDisplacementResult {
    return {
      metrics: {},
      meta: {
        displacement_algorithm_version: RTK_DISPLACEMENT_ALGORITHM_VERSION,
        displacement_state: state,
        displacement_gate_reason: reason,
        displacement_baseline_id: this.baseline?.id ?? null,
        displacement_baseline_sample_count: this.baseline?.sampleCount ?? this.baselineCandidates.length,
        displacement_confidence: this.baseline?.confidence ??
          this.baselineCandidates.reduce<DisplacementConfidence>(
            (result, candidate) => lowerConfidence(result, candidate.confidence),
            "high"
          ),
        displacement_filter_status: "not_initialized",
        displacement_outlier_rejected: false
      },
      baselineChanged
    };
  }

  private trackDisplacement(observation: RtkDisplacementObservation, ecef: EcefPoint): RtkDisplacementResult {
    const baseline = this.baseline;
    if (!baseline) return this.baselineResult("collecting_baseline", "baseline_missing", false);
    const confidence = lowerConfidence(
      baseline.confidence,
      observationConfidence(observation, this.options)
    );
    let measured: TimedEnuPoint = {
      ...ecefDeltaToEnuMm(
        ecef,
        baseline.ecef,
        baseline.latitudeDeg,
        baseline.longitudeDeg
      ),
      observedAtMs: observation.observedAtMs
    };
    const outlier = this.isHampelOutlier(measured);
    let filterStatus = "updated";
    let forceFilterReset = false;

    if (outlier) {
      const step = this.addStepCandidate(measured);
      if (!step) {
        return {
          metrics: {},
          meta: {
            displacement_algorithm_version: RTK_DISPLACEMENT_ALGORITHM_VERSION,
            displacement_state: "step_candidate",
            displacement_gate_reason: "hampel_outlier_pending_confirmation",
            displacement_baseline_id: baseline.id,
            displacement_baseline_sample_count: baseline.sampleCount,
            displacement_confidence: confidence,
            displacement_filter_status: "not_updated",
            displacement_outlier_rejected: true,
            displacement_step_candidate_count: this.stepCandidates.length
          },
          baselineChanged: false
        };
      }
      measured = step;
      filterStatus = "persistent_step_confirmed";
      forceFilterReset = true;
      this.acceptedHistory = [];
    } else {
      this.stepCandidates = [];
    }

    this.acceptedHistory.push(measured);
    while (this.acceptedHistory.length > this.options.hampelWindowSize) this.acceptedHistory.shift();
    const eastSigma = observation.sigmaLongitudeMm ?? this.options.defaultHorizontalSigmaMm;
    const northSigma = observation.sigmaLatitudeMm ?? this.options.defaultHorizontalSigmaMm;
    const upSigma = observation.sigmaAltitudeMm ?? this.options.defaultUpSigmaMm;
    const east = updateKalman(
      this.eastFilter,
      measured.east,
      eastSigma,
      observation.observedAtMs,
      this.options.horizontalAccelerationNoiseMmPerSecond2,
      this.options.filterResetGapMs,
      forceFilterReset
    );
    const north = updateKalman(
      this.northFilter,
      measured.north,
      northSigma,
      observation.observedAtMs,
      this.options.horizontalAccelerationNoiseMmPerSecond2,
      this.options.filterResetGapMs,
      forceFilterReset
    );
    const up = updateKalman(
      this.upFilter,
      measured.up,
      upSigma,
      observation.observedAtMs,
      this.options.verticalAccelerationNoiseMmPerSecond2,
      this.options.filterResetGapMs,
      forceFilterReset
    );
    this.eastFilter = east.state;
    this.northFilter = north.state;
    this.upFilter = up.state;
    const horizontalMm = Math.hypot(east.state.positionMm, north.state.positionMm);
    const displacement3dMm = Math.hypot(horizontalMm, up.state.positionMm);
    const velocityHorizontalMmPerHour = Math.hypot(
      east.state.velocityMmPerSecond,
      north.state.velocityMmPerSecond
    ) * 3600;

    return {
      metrics: {
        displacement_east_mm: round(east.state.positionMm),
        displacement_north_mm: round(north.state.positionMm),
        displacement_up_mm: round(up.state.positionMm),
        displacement_horizontal_mm: round(horizontalMm),
        displacement_3d_mm: round(displacement3dMm),
        displacement_mm: round(horizontalMm),
        displacement_velocity_east_mm_h: round(east.state.velocityMmPerSecond * 3600),
        displacement_velocity_north_mm_h: round(north.state.velocityMmPerSecond * 3600),
        displacement_velocity_up_mm_h: round(up.state.velocityMmPerSecond * 3600),
        displacement_velocity_horizontal_mm_h: round(velocityHorizontalMmPerHour),
        displacement_sigma_horizontal_mm: round(Math.hypot(Math.sqrt(east.state.p00), Math.sqrt(north.state.p00))),
        displacement_sigma_up_mm: round(Math.sqrt(up.state.p00)),
        displacement_innovation_nis: round(east.innovationNis + north.innovationNis + up.innovationNis)
      },
      meta: {
        displacement_algorithm_version: RTK_DISPLACEMENT_ALGORITHM_VERSION,
        displacement_state: "tracking",
        displacement_gate_reason: null,
        displacement_baseline_id: baseline.id,
        displacement_baseline_sample_count: baseline.sampleCount,
        displacement_confidence: confidence,
        displacement_filter_status: filterStatus,
        displacement_outlier_rejected: false,
        displacement_coordinate_frame: baseline.coordinateFrame,
        displacement_height_datum: "ellipsoid"
      },
      baselineChanged: false
    };
  }

  private isHampelOutlier(point: TimedEnuPoint): boolean {
    if (this.acceptedHistory.length < this.options.hampelMinimumSamples) return false;
    const eastValues = this.acceptedHistory.map((item) => item.east);
    const northValues = this.acceptedHistory.map((item) => item.north);
    const upValues = this.acceptedHistory.map((item) => item.up);
    const eastLimit = Math.max(
      this.options.hampelHorizontalFloorMm,
      this.options.hampelScale * 1.4826 * medianAbsoluteDeviation(eastValues)
    );
    const northLimit = Math.max(
      this.options.hampelHorizontalFloorMm,
      this.options.hampelScale * 1.4826 * medianAbsoluteDeviation(northValues)
    );
    const upLimit = Math.max(
      this.options.hampelUpFloorMm,
      this.options.hampelScale * 1.4826 * medianAbsoluteDeviation(upValues)
    );
    return Math.abs(point.east - median(eastValues)) > eastLimit ||
      Math.abs(point.north - median(northValues)) > northLimit ||
      Math.abs(point.up - median(upValues)) > upLimit;
  }

  private addStepCandidate(point: TimedEnuPoint): TimedEnuPoint | null {
    const first = this.stepCandidates[0];
    if (first && point.observedAtMs - first.observedAtMs > this.options.stepConfirmationWindowMs) {
      this.stepCandidates = [];
    }
    if (this.stepCandidates.length > 0) {
      const center = medianEnu(this.stepCandidates);
      const horizontalDifference = Math.hypot(point.east - center.east, point.north - center.north);
      const upDifference = Math.abs(point.up - center.up);
      if (horizontalDifference > this.options.stepHorizontalConsistencyMm ||
          upDifference > this.options.stepUpConsistencyMm) {
        this.stepCandidates = [];
      }
    }
    this.stepCandidates.push(point);
    if (this.stepCandidates.length < this.options.stepConfirmationSamples) return null;
    const accepted = medianEnu(this.stepCandidates);
    this.stepCandidates = [];
    return accepted;
  }

  private resetTrackingState(): void {
    this.acceptedHistory = [];
    this.stepCandidates = [];
    this.eastFilter = null;
    this.northFilter = null;
    this.upFilter = null;
    this.lastSampleEpoch = null;
    this.lastObservedAtMs = null;
  }
}

type ProcessorFileState = {
  schemaVersion: 1;
  algorithmVersion: typeof RTK_DISPLACEMENT_ALGORITHM_VERSION;
  updatedAt: string;
  nodes: Record<string, RtkDisplacementPersistentState>;
};

export class RtkDisplacementStateStore {
  private readonly engines = new Map<string, RtkDisplacementEngine>();
  private readonly persisted = new Map<string, RtkDisplacementPersistentState>();
  private stateUsable = true;
  private stateError: string | null = null;

  constructor(
    private readonly stateFilePath: string,
    private readonly engineOptions: Partial<EngineOptions> = {}
  ) {}

  async init(): Promise<void> {
    let raw: string;
    try {
      raw = await fs.readFile(this.stateFilePath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      this.failState(`state_read_failed:${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== "object") throw new Error("root is not an object");
      const record = parsed as Record<string, unknown>;
      if (record.schemaVersion !== STATE_SCHEMA_VERSION ||
          record.algorithmVersion !== RTK_DISPLACEMENT_ALGORITHM_VERSION ||
          !record.nodes || typeof record.nodes !== "object") {
        throw new Error("schema or algorithm version mismatch");
      }
      for (const [deviceId, value] of Object.entries(record.nodes as Record<string, unknown>)) {
        const state = validatePersistentState(value);
        if (!state) throw new Error(`invalid node state: ${deviceId}`);
        this.persisted.set(deviceId, state);
      }
    } catch (error) {
      this.failState(`state_invalid:${error instanceof Error ? error.message : String(error)}`);
    }
  }

  process(observation: RtkDisplacementObservation): RtkDisplacementResult {
    if (!this.stateUsable) {
      return {
        metrics: {},
        meta: {
          displacement_algorithm_version: RTK_DISPLACEMENT_ALGORITHM_VERSION,
          displacement_state: "blocked",
          displacement_gate_reason: this.stateError ?? "state_unavailable",
          displacement_baseline_id: null,
          displacement_baseline_sample_count: 0,
          displacement_filter_status: "not_updated",
          displacement_outlier_rejected: false
        },
        baselineChanged: false
      };
    }
    let engine = this.engines.get(observation.deviceId);
    if (!engine) {
      engine = new RtkDisplacementEngine(observation.deviceId, this.engineOptions);
      const persisted = this.persisted.get(observation.deviceId);
      if (persisted && !engine.importPersistentState(persisted)) {
        this.failState(`state_invalid_for_device:${observation.deviceId}`);
        return this.process(observation);
      }
      this.engines.set(observation.deviceId, engine);
    }
    return engine.process(observation);
  }

  async persistChangedBaseline(deviceId: string): Promise<void> {
    if (!this.stateUsable) return;
    const state = this.engines.get(deviceId)?.exportPersistentState();
    if (!state) return;
    this.persisted.set(deviceId, state);
    const nodes = Object.fromEntries(this.persisted.entries());
    const fileState: ProcessorFileState = {
      schemaVersion: STATE_SCHEMA_VERSION,
      algorithmVersion: RTK_DISPLACEMENT_ALGORITHM_VERSION,
      updatedAt: new Date().toISOString(),
      nodes
    };
    const directory = path.dirname(this.stateFilePath);
    const temporaryPath = `${this.stateFilePath}.${String(process.pid)}.${randomUUID()}.tmp`;
    try {
      await fs.mkdir(directory, { recursive: true });
      await fs.writeFile(temporaryPath, JSON.stringify(fileState, null, 2), { encoding: "utf8", mode: 0o600 });
      await fs.rename(temporaryPath, this.stateFilePath);
      await fs.chmod(this.stateFilePath, 0o600);
    } catch (error) {
      await fs.rm(temporaryPath, { force: true }).catch(() => undefined);
      this.failState(`state_write_failed:${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  private failState(reason: string): void {
    this.stateUsable = false;
    this.stateError = reason;
    this.engines.clear();
    this.persisted.clear();
  }
}
