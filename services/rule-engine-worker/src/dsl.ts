import { z } from "zod";

export const severitySchema = z.enum(["low", "medium", "high", "critical"]);

const scopeSchema = z.union([
  z.object({ type: z.literal("device"), deviceId: z.string().uuid() }),
  z.object({ type: z.literal("station"), stationId: z.string().uuid() }),
  z.object({ type: z.literal("global") })
]);

const leafSensorSchema = z.object({
  sensorKey: z.string().min(1),
  operator: z.enum([">", ">=", "<", "<=", "==", "!=", "between"]),
  value: z.number().optional(),
  min: z.number().optional(),
  max: z.number().optional()
});

type LeafSensor = z.infer<typeof leafSensorSchema>;

export type ConditionNode =
  | { op: "AND"; items: ConditionNode[] }
  | { op: "OR"; items: ConditionNode[] }
  | { op: "NOT"; item: ConditionNode }
  | LeafSensor;

const conditionSchema: z.ZodType<ConditionNode> = z.lazy(() =>
  z.union([
    z.object({ op: z.literal("AND"), items: z.array(conditionSchema).min(1) }),
    z.object({ op: z.literal("OR"), items: z.array(conditionSchema).min(1) }),
    z.object({ op: z.literal("NOT"), item: conditionSchema }),
    leafSensorSchema
  ])
);

const windowSchema = z.union([
  z.object({ type: z.literal("duration"), minutes: z.number().positive(), minPoints: z.number().int().positive() }),
  z.object({ type: z.literal("points"), points: z.number().int().positive() })
]);

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
    window: windowSchema.optional(),
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
  const out: { sensorKey: string; operator: string; value?: number } = {
    sensorKey: node.sensorKey,
    operator: node.operator
  };
  if (node.value !== undefined) out.value = node.value;
  return out;
}

export function evalCondition(node: ConditionNode, metrics: Record<string, unknown>): boolean | null {
  if ("op" in node) {
    if (node.op === "NOT") {
      const v = evalCondition(node.item, metrics);
      return v === null ? null : !v;
    } else if (node.op === "AND") {
      const items = node.items.map((x) => evalCondition(x, metrics));
      if (items.some((x) => x === false)) return false;
      if (items.some((x) => x === null)) return null;
      return true;
    } else {
      const items = node.items.map((x) => evalCondition(x, metrics));
      if (items.some((x) => x === true)) return true;
      if (items.some((x) => x === null)) return null;
      return false;
    }
  }

  const raw = metrics[node.sensorKey];
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "number") return null;
  const v = raw;

  switch (node.operator) {
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
