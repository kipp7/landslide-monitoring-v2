export type EdgeRiskLevel = "normal" | "attention" | "warning" | "danger";
export type EdgeRiskDataStatus = "live" | "stale" | "offline" | "insufficient";

export type EdgeRiskBaselines = {
  tiltXDeg: number | null;
  tiltYDeg: number | null;
  soilMoisturePct: number | null;
  conductivityUsCm: number | null;
  latitude: number | null;
  longitude: number | null;
};

export type EdgeRiskScales = {
  tiltXDeg: number;
  tiltYDeg: number;
  soilMoisturePct: number;
  conductivityUsCm: number;
  latitude: number;
  longitude: number;
};

export type EdgeDeviceCalibration = {
  deviceId: string;
  stationId: string | null;
  sampleCount: number;
  baselines: EdgeRiskBaselines;
  scales: EdgeRiskScales;
};

export type EdgeRiskPolicy = {
  scoreThresholds: {
    attention: number;
    warning: number;
    danger: number;
  };
  hardRules: {
    tiltDeviationDeg: number;
    tiltChange5mDeg: number;
    gpsDisplacementM: number;
  };
  featureDangerValues: {
    tiltDeviationDeg: number;
    tiltChange5mDeg: number;
    gpsDisplacementM: number;
    gpsMovement30mM: number;
    soilMoistureDeltaPct: number;
    conductivityChangePct: number;
  };
  featureWeights: {
    tiltDeviation: number;
    tiltChange5m: number;
    gpsDisplacement: number;
    gpsMovement30m: number;
    soilMoistureDelta: number;
    conductivityChange: number;
  };
  staleAfterSeconds: number;
  offlineAfterSeconds: number;
};

export type EdgeRiskModelArtifact = {
  schemaVersion: "lsmv2.edge-landslide-risk.v1";
  modelKey: string;
  modelVersion: string;
  modelType: "robust_baseline_ensemble";
  trainedAt: string;
  trainingWindowHours: number;
  trainingSource: string;
  deviceCount: number;
  sampleCount: number;
  calibrations: EdgeDeviceCalibration[];
  policy: EdgeRiskPolicy;
  checksumSha256: string | null;
};

export type EdgeTelemetrySnapshot = {
  deviceId: string;
  stationId?: string | null;
  receivedAt: string;
  metrics: Record<string, unknown>;
};

export type EdgeRiskFeatureResult = {
  key: string;
  label: string;
  value: number | null;
  unit: string;
  score: number;
  weight: number;
  available: boolean;
};

export type EdgeRiskEvaluation = {
  deviceId: string;
  stationId: string | null;
  generatedAt: string;
  dataUpdatedAt: string | null;
  dataStatus: EdgeRiskDataStatus;
  modelKey: string;
  modelVersion: string;
  riskScore: number;
  riskLevel: EdgeRiskLevel;
  confidence: number;
  hardRuleTriggered: boolean;
  hardRuleReasons: string[];
  explain: string;
  factors: string[];
  features: EdgeRiskFeatureResult[];
};

const METRIC_ALIASES = {
  tiltX: ["tilt_x_deg", "tilt_x", "inclination_x_deg"],
  tiltY: ["tilt_y_deg", "tilt_y", "inclination_y_deg"],
  moisture: ["soil_moisture_pct", "humidity_pct", "soil_humidity_pct", "humidity"],
  conductivity: ["electrical_conductivity_us_cm", "conductivity_us_cm", "soil_conductivity_us_cm"],
  latitude: ["gps_latitude", "latitude", "lat"],
  longitude: ["gps_longitude", "longitude", "lng", "lon"],
} as const;

export const DEFAULT_EDGE_RISK_POLICY: EdgeRiskPolicy = {
  scoreThresholds: {
    attention: 0.3,
    warning: 0.55,
    danger: 0.8,
  },
  hardRules: {
    tiltDeviationDeg: 5,
    tiltChange5mDeg: 3,
    gpsDisplacementM: 25,
  },
  featureDangerValues: {
    tiltDeviationDeg: 5,
    tiltChange5mDeg: 3,
    gpsDisplacementM: 25,
    gpsMovement30mM: 15,
    soilMoistureDeltaPct: 30,
    conductivityChangePct: 80,
  },
  featureWeights: {
    tiltDeviation: 0.28,
    tiltChange5m: 0.24,
    gpsDisplacement: 0.2,
    gpsMovement30m: 0.12,
    soilMoistureDelta: 0.1,
    conductivityChange: 0.06,
  },
  staleAfterSeconds: 30,
  offlineAfterSeconds: 120,
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNullableFinite(value: unknown): boolean {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

function hasNumericKeys(
  value: unknown,
  keys: readonly string[],
  allowNull: boolean,
  strictlyPositive: boolean
): boolean {
  if (!isObject(value)) return false;
  return keys.every((key) => {
    const entry = value[key];
    if (allowNull && entry === null) return true;
    if (typeof entry !== "number" || !Number.isFinite(entry)) return false;
    return !strictlyPositive || entry > 0;
  });
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function metricValue(metrics: Record<string, unknown>, aliases: readonly string[]): number | null {
  for (const alias of aliases) {
    const value = finiteNumber(metrics[alias]);
    if (value !== null) return value;
  }
  return null;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return value >= 1 ? 1 : value;
}

function round(value: number, digits = 4): number {
  return Number(value.toFixed(digits));
}

function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const radiusM = 6_371_000;
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLon = (lon2 - lon1) * toRad;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return radiusM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
}

function closestBefore(
  history: EdgeTelemetrySnapshot[],
  targetMs: number
): EdgeTelemetrySnapshot | null {
  let candidate: EdgeTelemetrySnapshot | null = null;
  let candidateMs = Number.NEGATIVE_INFINITY;
  for (const snapshot of history) {
    const snapshotMs = Date.parse(snapshot.receivedAt);
    if (Number.isFinite(snapshotMs) && snapshotMs <= targetMs && snapshotMs > candidateMs) {
      candidate = snapshot;
      candidateMs = snapshotMs;
    }
  }
  return candidate;
}

function riskLevel(
  score: number,
  policy: EdgeRiskPolicy,
  hardRuleTriggered: boolean
): EdgeRiskLevel {
  if (hardRuleTriggered || score >= policy.scoreThresholds.danger) return "danger";
  if (score >= policy.scoreThresholds.warning) return "warning";
  if (score >= policy.scoreThresholds.attention) return "attention";
  return "normal";
}

function riskLabel(level: EdgeRiskLevel): string {
  if (level === "danger") return "危险";
  if (level === "warning") return "预警";
  if (level === "attention") return "关注";
  return "正常";
}

function feature(
  key: string,
  label: string,
  value: number | null,
  unit: string,
  dangerValue: number,
  weight: number
): EdgeRiskFeatureResult {
  return {
    key,
    label,
    value: value === null ? null : round(value),
    unit,
    score:
      value === null ? 0 : round(clamp01(Math.abs(value) / Math.max(dangerValue, Number.EPSILON))),
    weight,
    available: value !== null,
  };
}

export function evaluateEdgeRisk(input: {
  artifact: EdgeRiskModelArtifact;
  deviceId: string;
  history: EdgeTelemetrySnapshot[];
  now?: Date;
}): EdgeRiskEvaluation {
  const now = input.now ?? new Date();
  const sortedHistory = input.history
    .filter(
      (entry) => entry.deviceId === input.deviceId && Number.isFinite(Date.parse(entry.receivedAt))
    )
    .slice()
    .sort((left, right) => Date.parse(left.receivedAt) - Date.parse(right.receivedAt));
  const latest = sortedHistory[sortedHistory.length - 1] ?? null;
  const calibration =
    input.artifact.calibrations.find((entry) => entry.deviceId === input.deviceId) ?? null;
  const policy = input.artifact.policy;
  const latestMs = latest ? Date.parse(latest.receivedAt) : Number.NaN;
  const dataAgeSeconds = Number.isFinite(latestMs)
    ? Math.max(0, (now.getTime() - latestMs) / 1000)
    : null;
  const snapshot5m = latest ? closestBefore(sortedHistory, latestMs - 5 * 60 * 1000) : null;
  const snapshot30m = latest ? closestBefore(sortedHistory, latestMs - 30 * 60 * 1000) : null;

  const latestTiltX = latest ? metricValue(latest.metrics, METRIC_ALIASES.tiltX) : null;
  const latestTiltY = latest ? metricValue(latest.metrics, METRIC_ALIASES.tiltY) : null;
  const tiltX5m = snapshot5m ? metricValue(snapshot5m.metrics, METRIC_ALIASES.tiltX) : null;
  const tiltY5m = snapshot5m ? metricValue(snapshot5m.metrics, METRIC_ALIASES.tiltY) : null;
  const latestMoisture = latest ? metricValue(latest.metrics, METRIC_ALIASES.moisture) : null;
  const latestConductivity = latest
    ? metricValue(latest.metrics, METRIC_ALIASES.conductivity)
    : null;
  const latestLat = latest ? metricValue(latest.metrics, METRIC_ALIASES.latitude) : null;
  const latestLon = latest ? metricValue(latest.metrics, METRIC_ALIASES.longitude) : null;
  const lat30m = snapshot30m ? metricValue(snapshot30m.metrics, METRIC_ALIASES.latitude) : null;
  const lon30m = snapshot30m ? metricValue(snapshot30m.metrics, METRIC_ALIASES.longitude) : null;

  const tiltDeviation =
    latestTiltX !== null &&
    latestTiltY !== null &&
    calibration?.baselines.tiltXDeg != null &&
    calibration.baselines.tiltYDeg != null
      ? Math.hypot(
          latestTiltX - calibration.baselines.tiltXDeg,
          latestTiltY - calibration.baselines.tiltYDeg
        )
      : null;
  const tiltChange5m =
    latestTiltX !== null && latestTiltY !== null && tiltX5m !== null && tiltY5m !== null
      ? Math.hypot(latestTiltX - tiltX5m, latestTiltY - tiltY5m)
      : null;
  const gpsDisplacement =
    latestLat !== null &&
    latestLon !== null &&
    calibration?.baselines.latitude != null &&
    calibration.baselines.longitude != null
      ? distanceMeters(
          calibration.baselines.latitude,
          calibration.baselines.longitude,
          latestLat,
          latestLon
        )
      : null;
  const gpsMovement30m =
    latestLat !== null && latestLon !== null && lat30m !== null && lon30m !== null
      ? distanceMeters(lat30m, lon30m, latestLat, latestLon)
      : null;
  const moistureDelta =
    latestMoisture !== null && calibration?.baselines.soilMoisturePct != null
      ? latestMoisture - calibration.baselines.soilMoisturePct
      : null;
  const conductivityChangePct =
    latestConductivity !== null &&
    calibration?.baselines.conductivityUsCm != null &&
    calibration.baselines.conductivityUsCm > 0
      ? ((latestConductivity - calibration.baselines.conductivityUsCm) /
          calibration.baselines.conductivityUsCm) *
        100
      : null;

  const features = [
    feature(
      "tilt_deviation",
      "倾角偏移",
      tiltDeviation,
      "deg",
      policy.featureDangerValues.tiltDeviationDeg,
      policy.featureWeights.tiltDeviation
    ),
    feature(
      "tilt_change_5m",
      "5分钟倾角变化",
      tiltChange5m,
      "deg",
      policy.featureDangerValues.tiltChange5mDeg,
      policy.featureWeights.tiltChange5m
    ),
    feature(
      "gps_displacement",
      "GPS基线位移",
      gpsDisplacement,
      "m",
      policy.featureDangerValues.gpsDisplacementM,
      policy.featureWeights.gpsDisplacement
    ),
    feature(
      "gps_movement_30m",
      "30分钟GPS位移",
      gpsMovement30m,
      "m",
      policy.featureDangerValues.gpsMovement30mM,
      policy.featureWeights.gpsMovement30m
    ),
    feature(
      "soil_moisture_delta",
      "土壤湿度变化",
      moistureDelta,
      "%",
      policy.featureDangerValues.soilMoistureDeltaPct,
      policy.featureWeights.soilMoistureDelta
    ),
    feature(
      "conductivity_change",
      "电导率变化",
      conductivityChangePct,
      "%",
      policy.featureDangerValues.conductivityChangePct,
      policy.featureWeights.conductivityChange
    ),
  ];
  const availableFeatures = features.filter((entry) => entry.available);
  const availableWeight = availableFeatures.reduce((sum, entry) => sum + entry.weight, 0);
  const weightedScore =
    availableWeight > 0
      ? availableFeatures.reduce((sum, entry) => sum + entry.score * entry.weight, 0) /
        availableWeight
      : 0;
  const hardRuleReasons: string[] = [];
  if (tiltDeviation !== null && tiltDeviation >= policy.hardRules.tiltDeviationDeg)
    hardRuleReasons.push("倾角偏移超过硬阈值");
  if (tiltChange5m !== null && tiltChange5m >= policy.hardRules.tiltChange5mDeg)
    hardRuleReasons.push("5分钟倾角突变超过硬阈值");
  if (gpsDisplacement !== null && gpsDisplacement >= policy.hardRules.gpsDisplacementM)
    hardRuleReasons.push("GPS基线位移超过硬阈值");
  const hardRuleTriggered = hardRuleReasons.length > 0;
  const riskScore = round(
    hardRuleTriggered ? Math.max(weightedScore, policy.scoreThresholds.danger) : weightedScore
  );
  const level = riskLevel(riskScore, policy, hardRuleTriggered);
  const coverage =
    availableWeight /
    Math.max(
      Object.values(policy.featureWeights).reduce((sum, weight) => sum + weight, 0),
      Number.EPSILON
    );
  const sampleConfidence = calibration
    ? clamp01(Math.log10(Math.max(calibration.sampleCount, 1)) / 4)
    : 0.2;
  const freshnessFactor =
    dataAgeSeconds === null
      ? 0
      : dataAgeSeconds >= policy.offlineAfterSeconds
        ? 0.2
        : dataAgeSeconds >= policy.staleAfterSeconds
          ? 0.6
          : 1;
  const confidence = round(
    clamp01(coverage * 0.65 + sampleConfidence * 0.25 + freshnessFactor * 0.1)
  );
  const dataStatus: EdgeRiskDataStatus = !latest
    ? "insufficient"
    : dataAgeSeconds !== null && dataAgeSeconds >= policy.offlineAfterSeconds
      ? "offline"
      : dataAgeSeconds !== null && dataAgeSeconds >= policy.staleAfterSeconds
        ? "stale"
        : availableFeatures.length < 2
          ? "insufficient"
          : "live";
  const factors = availableFeatures
    .slice()
    .sort((left, right) => right.score * right.weight - left.score * left.weight)
    .slice(0, 3)
    .map(
      (entry) => `${entry.label} ${entry.value === null ? "--" : String(entry.value)}${entry.unit}`
    );
  const explain = hardRuleTriggered
    ? `${riskLabel(level)}：${hardRuleReasons.join("；")}`
    : `${riskLabel(level)}：综合风险 ${String(Math.round(riskScore * 100))}%，${factors.join("；") || "有效特征不足"}`;

  return {
    deviceId: input.deviceId,
    stationId: calibration?.stationId ?? latest?.stationId ?? null,
    generatedAt: now.toISOString(),
    dataUpdatedAt: latest?.receivedAt ?? null,
    dataStatus,
    modelKey: input.artifact.modelKey,
    modelVersion: input.artifact.modelVersion,
    riskScore,
    riskLevel: level,
    confidence,
    hardRuleTriggered,
    hardRuleReasons,
    explain,
    factors,
    features,
  };
}

export function isEdgeRiskModelArtifact(value: unknown): value is EdgeRiskModelArtifact {
  if (!isObject(value)) return false;
  if (value.schemaVersion !== "lsmv2.edge-landslide-risk.v1") return false;
  if (value.modelType !== "robust_baseline_ensemble") return false;
  if (typeof value.modelKey !== "string" || value.modelKey.length === 0) return false;
  if (typeof value.modelVersion !== "string" || value.modelVersion.length === 0) return false;
  if (typeof value.trainedAt !== "string" || !Number.isFinite(Date.parse(value.trainedAt)))
    return false;
  if (typeof value.trainingSource !== "string") return false;
  if (
    typeof value.trainingWindowHours !== "number" ||
    !Number.isFinite(value.trainingWindowHours) ||
    value.trainingWindowHours < 0
  )
    return false;
  if (
    typeof value.deviceCount !== "number" ||
    !Number.isInteger(value.deviceCount) ||
    value.deviceCount < 0
  )
    return false;
  if (
    typeof value.sampleCount !== "number" ||
    !Number.isInteger(value.sampleCount) ||
    value.sampleCount < 0
  )
    return false;
  if (
    value.checksumSha256 !== null &&
    (typeof value.checksumSha256 !== "string" || !/^[a-f0-9]{64}$/i.test(value.checksumSha256))
  )
    return false;
  if (!Array.isArray(value.calibrations) || !isObject(value.policy)) return false;

  const baselineKeys = [
    "tiltXDeg",
    "tiltYDeg",
    "soilMoisturePct",
    "conductivityUsCm",
    "latitude",
    "longitude",
  ];
  const calibrationsValid = value.calibrations.every((entry) => {
    if (!isObject(entry)) return false;
    if (typeof entry.deviceId !== "string" || entry.deviceId.length === 0) return false;
    if (entry.stationId !== null && typeof entry.stationId !== "string") return false;
    if (
      typeof entry.sampleCount !== "number" ||
      !Number.isInteger(entry.sampleCount) ||
      entry.sampleCount < 0
    )
      return false;
    const baselines = entry.baselines;
    const scales = entry.scales;
    if (!hasNumericKeys(baselines, baselineKeys, true, false)) return false;
    if (!hasNumericKeys(scales, baselineKeys, false, true)) return false;
    return isObject(baselines) && baselineKeys.every((key) => isNullableFinite(baselines[key]));
  });
  if (!calibrationsValid || value.calibrations.length !== value.deviceCount) return false;

  const policy = value.policy;
  const scoreThresholds = isObject(policy.scoreThresholds) ? policy.scoreThresholds : null;
  const attention = scoreThresholds?.attention;
  const warning = scoreThresholds?.warning;
  const danger = scoreThresholds?.danger;
  if (typeof attention !== "number" || typeof warning !== "number" || typeof danger !== "number")
    return false;
  if (
    ![attention, warning, danger].every(
      (entry) => Number.isFinite(entry) && entry >= 0 && entry <= 1
    )
  )
    return false;
  if (!(attention <= warning && warning <= danger)) return false;
  if (
    !hasNumericKeys(
      policy.hardRules,
      ["tiltDeviationDeg", "tiltChange5mDeg", "gpsDisplacementM"],
      false,
      true
    )
  )
    return false;
  if (
    !hasNumericKeys(
      policy.featureDangerValues,
      [
        "tiltDeviationDeg",
        "tiltChange5mDeg",
        "gpsDisplacementM",
        "gpsMovement30mM",
        "soilMoistureDeltaPct",
        "conductivityChangePct",
      ],
      false,
      true
    )
  )
    return false;
  const weightKeys = [
    "tiltDeviation",
    "tiltChange5m",
    "gpsDisplacement",
    "gpsMovement30m",
    "soilMoistureDelta",
    "conductivityChange",
  ];
  const featureWeights = policy.featureWeights;
  if (!hasNumericKeys(featureWeights, weightKeys, false, false) || !isObject(featureWeights))
    return false;
  const weights = weightKeys.map((key) => featureWeights[key] as number);
  if (weights.some((weight) => weight < 0) || weights.reduce((sum, weight) => sum + weight, 0) <= 0)
    return false;
  if (
    typeof policy.staleAfterSeconds !== "number" ||
    !Number.isFinite(policy.staleAfterSeconds) ||
    policy.staleAfterSeconds <= 0
  )
    return false;
  if (
    typeof policy.offlineAfterSeconds !== "number" ||
    !Number.isFinite(policy.offlineAfterSeconds) ||
    policy.offlineAfterSeconds <= policy.staleAfterSeconds
  )
    return false;
  return true;
}

export function toAiPredictionRiskLevel(level: EdgeRiskLevel): "low" | "medium" | "high" {
  if (level === "danger") return "high";
  if (level === "warning" || level === "attention") return "medium";
  return "low";
}
