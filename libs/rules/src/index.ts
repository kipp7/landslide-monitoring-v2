import { z } from "zod";

export const severitySchema = z.enum(["low", "medium", "high", "critical"]);
export type Severity = z.infer<typeof severitySchema>;

const scopeSchema = z.union([
  z.object({ type: z.literal("device"), deviceId: z.string().uuid() }).strict(),
  z.object({ type: z.literal("station"), stationId: z.string().uuid() }).strict(),
  z.object({ type: z.literal("global") }).strict()
]);

export type Scope = z.infer<typeof scopeSchema>;

const operatorSchema = z.enum([">", ">=", "<", "<=", "==", "!=", "between"]);
export type Operator = z.infer<typeof operatorSchema>;

const leafSensorSchema = z
  .object({
    sensorKey: z.string().min(1),
    operator: operatorSchema,
    value: z.number().optional(),
    min: z.number().optional(),
    max: z.number().optional()
  })
  .strict();

export type LeafSensor = z.infer<typeof leafSensorSchema>;

const metricWindowSchema = z.union([
  z
    .object({
      type: z.literal("duration"),
      minutes: z.number().positive(),
      minPoints: z.number().int().positive().optional()
    })
    .strict(),
  z.object({ type: z.literal("points"), points: z.number().int().positive() }).strict()
]);

export type MetricWindow =
  | { type: "duration"; minutes: number; minPoints?: number | undefined }
  | { type: "points"; points: number };

const ruleWindowSchema = z.union([
  z
    .object({ type: z.literal("duration"), minutes: z.number().positive(), minPoints: z.number().int().positive() })
    .strict(),
  z.object({ type: z.literal("points"), points: z.number().int().positive() }).strict()
]);

export type RuleWindow =
  | { type: "duration"; minutes: number; minPoints: number }
  | { type: "points"; points: number };

const metricSchema = z
  .object({
    sensorKey: z.string().min(1),
    agg: z.enum(["last", "min", "max", "avg", "delta", "slope"]),
    window: metricWindowSchema.optional()
  })
  .strict();

export type MetricSpec = z.infer<typeof metricSchema>;

const leafMetricSchema = z
  .object({
    metric: metricSchema,
    operator: operatorSchema,
    value: z.number().optional(),
    min: z.number().optional(),
    max: z.number().optional()
  })
  .strict();

export type LeafMetric = z.infer<typeof leafMetricSchema>;

export type ConditionNode =
  | { op: "AND"; items: ConditionNode[] }
  | { op: "OR"; items: ConditionNode[] }
  | { op: "NOT"; item: ConditionNode }
  | LeafSensor
  | LeafMetric;

const conditionSchema: z.ZodType<ConditionNode> = z.lazy(() =>
  z.union([
    z.object({ op: z.literal("AND"), items: z.array(conditionSchema).min(1) }).strict(),
    z.object({ op: z.literal("OR"), items: z.array(conditionSchema).min(1) }).strict(),
    z.object({ op: z.literal("NOT"), item: conditionSchema }).strict(),
    leafSensorSchema,
    leafMetricSchema
  ])
);

const hysteresisSchema = z
  .object({
    recoverBelow: z.number().optional(),
    recoverAbove: z.number().optional()
  })
  .strict();

export type Hysteresis = z.infer<typeof hysteresisSchema>;

const cooldownSchema = z.object({ minutes: z.number().int().nonnegative() }).strict();
export type Cooldown = z.infer<typeof cooldownSchema>;

const missingSchema = z.union([
  z.object({ policy: z.literal("ignore") }).strict(),
  z.object({ policy: z.literal("treat_as_fail") }).strict(),
  z.object({ policy: z.literal("raise_missing_alert"), sensorKeys: z.array(z.string().min(1)).min(1) }).strict()
]);

export type MissingPolicy =
  | { policy: "ignore" }
  | { policy: "treat_as_fail" }
  | { policy: "raise_missing_alert"; sensorKeys: string[] };

const actionSchema = z
  .object({
    type: z.literal("emit_alert"),
    titleTemplate: z.string().min(1),
    messageTemplate: z.string().optional()
  })
  .strict();

export type RuleAction = z.infer<typeof actionSchema>;

export const ruleDslSchema = z
  .object({
    dslVersion: z.literal(1),
    name: z.string().min(1).optional(),
    scope: scopeSchema,
    enabled: z.boolean(),
    severity: severitySchema,
    cooldown: cooldownSchema.optional(),
    timeField: z.enum(["received", "event"]).optional(),
    missing: missingSchema.optional(),
    when: conditionSchema,
    window: ruleWindowSchema.optional(),
    hysteresis: hysteresisSchema.optional(),
    actions: z.array(actionSchema).min(1)
  })
  .strict();

export type RuleDslV1 = z.infer<typeof ruleDslSchema>;

export function templateString(input: string, vars: Record<string, string>): string {
  return input.replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (m: string, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? (vars[key] ?? m) : m
  );
}

export function findFirstSensorLeaf(
  node: ConditionNode
): { sensorKey: string; operator: string; value?: number } | null {
  if ("op" in node) {
    if (node.op === "NOT") return findFirstSensorLeaf(node.item);
    for (const it of node.items) {
      const leaf = findFirstSensorLeaf(it);
      if (leaf) return leaf;
    }
    return null;
  }
  if ("sensorKey" in node) {
    const out: { sensorKey: string; operator: string; value?: number } = {
      sensorKey: node.sensorKey,
      operator: node.operator
    };
    if (node.value !== undefined) out.value = node.value;
    return out;
  }
  return null;
}

export function collectSensorKeys(node: ConditionNode): { sensors: Set<string>; metrics: Set<string> } {
  const sensors = new Set<string>();
  const metrics = new Set<string>();

  const walk = (n: ConditionNode) => {
    if ("op" in n) {
      if (n.op === "NOT") walk(n.item);
      else for (const it of n.items) walk(it);
      return;
    }
    if ("sensorKey" in n) sensors.add(n.sensorKey);
    else metrics.add(n.metric.sensorKey);
  };
  walk(node);
  return { sensors, metrics };
}

export type MetricPoint = { tsMs: number; value: number };
export type MetricSeriesGetter = (sensorKey: string, window?: MetricWindow) => MetricPoint[];

function aggMetric(points: MetricPoint[], agg: MetricSpec["agg"]): number | null {
  if (points.length === 0) return null;
  const last = points[points.length - 1];
  const first = points[0];
  if (!last || !first) return null;

  switch (agg) {
    case "last":
      return last.value;
    case "min":
      return Math.min(...points.map((p) => p.value));
    case "max":
      return Math.max(...points.map((p) => p.value));
    case "avg":
      return points.reduce((sum, p) => sum + p.value, 0) / points.length;
    case "delta":
      return last.value - first.value;
    case "slope": {
      const dtMs = last.tsMs - first.tsMs;
      if (dtMs <= 0) return null;
      const dv = last.value - first.value;
      const perMinute = dv / (dtMs / 60_000);
      return perMinute;
    }
  }
}

function compareNumber(
  operator: Operator,
  v: number,
  node: { value?: number | undefined; min?: number | undefined; max?: number | undefined }
): boolean {
  switch (operator) {
    case ">":
      return v > (node.value ?? Number.NaN);
    case ">=":
      return v >= (node.value ?? Number.NaN);
    case "<":
      return v < (node.value ?? Number.NaN);
    case "<=":
      return v <= (node.value ?? Number.NaN);
    case "==":
      return v === (node.value ?? Number.NaN);
    case "!=":
      return v !== (node.value ?? Number.NaN);
    case "between":
      return v >= (node.min ?? Number.NaN) && v <= (node.max ?? Number.NaN);
  }
}

export function evalCondition(
  node: ConditionNode,
  metrics: Record<string, unknown>,
  getSeries?: MetricSeriesGetter
): boolean | null {
  if ("op" in node) {
    if (node.op === "NOT") {
      const v = evalCondition(node.item, metrics, getSeries);
      return v === null ? null : !v;
    }
    if (node.op === "AND") {
      const items = node.items.map((x) => evalCondition(x, metrics, getSeries));
      if (items.some((x) => x === false)) return false;
      if (items.some((x) => x === null)) return null;
      return true;
    }
    const items = node.items.map((x) => evalCondition(x, metrics, getSeries));
    if (items.some((x) => x === true)) return true;
    if (items.some((x) => x === null)) return null;
    return false;
  }

  if ("sensorKey" in node) {
    const raw = metrics[node.sensorKey];
    if (raw === undefined || raw === null) return null;
    if (typeof raw !== "number") return null;
    return compareNumber(node.operator, raw, node);
  }

  if (!getSeries) return null;
  const points = getSeries(node.metric.sensorKey, node.metric.window);
  const v = aggMetric(points, node.metric.agg);
  if (v === null) return null;
  return compareNumber(node.operator, v, node);
}

export function compareSeverityAtLeast(actual: Severity, min: Severity): boolean {
  const order: Record<Severity, number> = { low: 1, medium: 2, high: 3, critical: 4 };
  return order[actual] >= order[min];
}

export const tiltVectorSchema = z
  .object({
    x: z.number().finite(),
    y: z.number().finite(),
    z: z.number().finite()
  })
  .strict();

export type TiltVector = z.infer<typeof tiltVectorSchema>;

export const competitionTiltThresholdsSchema = z
  .object({
    highDeg: z.number().positive().max(45),
    criticalDeg: z.number().positive().max(90),
    recoveryDeg: z.number().nonnegative().max(45),
    triggerPoints: z.number().int().min(1).max(10),
    recoveryPoints: z.number().int().min(1).max(10),
    updateStepDeg: z.number().positive().max(10)
  })
  .strict()
  .refine((value) => value.criticalDeg > value.highDeg, {
    message: "criticalDeg must be greater than highDeg",
    path: ["criticalDeg"]
  })
  .refine((value) => value.recoveryDeg < value.highDeg, {
    message: "recoveryDeg must be lower than highDeg",
    path: ["recoveryDeg"]
  });

export type CompetitionTiltThresholds = z.infer<typeof competitionTiltThresholdsSchema>;

export const DEFAULT_COMPETITION_TILT_THRESHOLDS: CompetitionTiltThresholds = {
  highDeg: 3,
  criticalDeg: 7,
  recoveryDeg: 1.5,
  triggerPoints: 2,
  recoveryPoints: 2,
  updateStepDeg: 0.25
};

export const competitionTiltDeviceSchema = z
  .object({
    deviceId: z.string().uuid(),
    deviceName: z.string().min(1).max(100),
    stationId: z.string().uuid().nullable(),
    baseline: tiltVectorSchema,
    capturedAt: z.string().datetime()
  })
  .strict();

export const competitionTiltProfileSchema = z
  .object({
    schemaVersion: z.literal(1),
    mode: z.literal("competition_relative_tilt"),
    enabled: z.boolean(),
    ruleId: z.string().uuid(),
    ruleVersion: z.number().int().positive(),
    capturedAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    thresholds: competitionTiltThresholdsSchema,
    devices: z.array(competitionTiltDeviceSchema).min(1).max(100)
  })
  .strict();

export type CompetitionTiltProfile = z.infer<typeof competitionTiltProfileSchema>;

export type CompetitionTiltDeviation = {
  current: TiltVector;
  baseline: TiltVector;
  delta: TiltVector;
  maxAxis: "x" | "y" | "z";
  maxDeviationDeg: number;
};

export function readTiltVector(metrics: Record<string, unknown>): TiltVector | null {
  const x = metrics.tilt_x_deg;
  const y = metrics.tilt_y_deg;
  const zValue = metrics.tilt_z_deg;
  if (
    typeof x !== "number" ||
    !Number.isFinite(x) ||
    typeof y !== "number" ||
    !Number.isFinite(y) ||
    typeof zValue !== "number" ||
    !Number.isFinite(zValue)
  ) {
    return null;
  }
  return { x, y, z: zValue };
}

export function computeCompetitionTiltDeviation(
  current: TiltVector,
  baseline: TiltVector
): CompetitionTiltDeviation {
  const delta: TiltVector = {
    x: current.x - baseline.x,
    y: current.y - baseline.y,
    z: current.z - baseline.z
  };
  const axes: { axis: "x" | "y" | "z"; value: number }[] = [
    { axis: "x", value: Math.abs(delta.x) },
    { axis: "y", value: Math.abs(delta.y) },
    { axis: "z", value: Math.abs(delta.z) }
  ];
  axes.sort((a, b) => b.value - a.value);
  const maximum = axes[0] ?? { axis: "x" as const, value: 0 };
  return {
    current,
    baseline,
    delta,
    maxAxis: maximum.axis,
    maxDeviationDeg: maximum.value
  };
}
