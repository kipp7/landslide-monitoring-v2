import { z } from "zod";

export const severitySchema = z.enum(["low", "medium", "high", "critical"]);

const scopeSchema = z.union([
  z.object({ type: z.literal("device"), deviceId: z.string().uuid() }),
  z.object({ type: z.literal("station"), stationId: z.string().uuid() }),
  z.object({ type: z.literal("global") })
]);

const operatorSchema = z.enum([">", ">=", "<", "<=", "==", "!=", "between"]);

const leafSensorSchema = z.object({
  sensorKey: z.string().min(1),
  operator: operatorSchema,
  value: z.number().optional(),
  min: z.number().optional(),
  max: z.number().optional()
});

type LeafSensor = z.infer<typeof leafSensorSchema>;

const metricWindowSchema = z.union([
  z.object({
    type: z.literal("duration"),
    minutes: z.number().positive(),
    minPoints: z.number().int().positive().optional()
  }),
  z.object({ type: z.literal("points"), points: z.number().int().positive() })
]);

const ruleWindowSchema = z.union([
  z.object({ type: z.literal("duration"), minutes: z.number().positive(), minPoints: z.number().int().positive() }),
  z.object({ type: z.literal("points"), points: z.number().int().positive() })
]);

const metricSchema = z.object({
  sensorKey: z.string().min(1),
  agg: z.enum(["last", "min", "max", "avg", "delta", "slope"]),
  window: metricWindowSchema.optional()
});

const leafMetricSchema = z.object({
  metric: metricSchema,
  operator: operatorSchema,
  value: z.number().optional(),
  min: z.number().optional(),
  max: z.number().optional()
});

type LeafMetric = z.infer<typeof leafMetricSchema>;

export type ConditionNode =
  | { op: "AND"; items: ConditionNode[] }
  | { op: "OR"; items: ConditionNode[] }
  | { op: "NOT"; item: ConditionNode }
  | LeafSensor
  | LeafMetric;

const conditionSchema: z.ZodType<ConditionNode> = z.lazy(() =>
  z.union([
    z.object({ op: z.literal("AND"), items: z.array(conditionSchema).min(1) }),
    z.object({ op: z.literal("OR"), items: z.array(conditionSchema).min(1) }),
    z.object({ op: z.literal("NOT"), item: conditionSchema }),
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

const cooldownSchema = z.object({ minutes: z.number().int().nonnegative() }).strict();
const missingSchema = z.object({ policy: z.enum(["ignore", "treat_as_fail"]) }).strict();

const actionSchema = z.object({
  type: z.literal("emit_alert"),
  titleTemplate: z.string().min(1),
  messageTemplate: z.string().optional()
});

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

export function findFirstSensorLeaf(node: ConditionNode): { sensorKey: string; operator: string; value?: number } | null {
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

export type MetricPoint = { tsMs: number; value: number };
export type MetricWindow =
  | { type: "duration"; minutes: number; minPoints?: number | undefined }
  | { type: "points"; points: number };
export type MetricSeriesGetter = (sensorKey: string, window?: MetricWindow) => MetricPoint[];

function aggMetric(points: MetricPoint[], agg: z.infer<typeof metricSchema>["agg"]): number | null {
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
  operator: z.infer<typeof operatorSchema>,
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
    } else if (node.op === "AND") {
      const items = node.items.map((x) => evalCondition(x, metrics, getSeries));
      if (items.some((x) => x === false)) return false;
      if (items.some((x) => x === null)) return null;
      return true;
    } else {
      const items = node.items.map((x) => evalCondition(x, metrics, getSeries));
      if (items.some((x) => x === true)) return true;
      if (items.some((x) => x === null)) return null;
      return false;
    }
  }

  if ("sensorKey" in node) {
    const raw = metrics[node.sensorKey];
    if (raw === undefined || raw === null) return null;
    if (typeof raw !== "number") return null;
    const v = raw;
    return compareNumber(node.operator, v, node);
  }

  if (!getSeries) return null;
  const points = getSeries(node.metric.sensorKey, node.metric.window);
  const v = aggMetric(points, node.metric.agg);
  if (v === null) return null;
  return compareNumber(node.operator, v, node);
}
