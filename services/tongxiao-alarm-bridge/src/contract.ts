import { z } from "zod";

export const severitySchema = z.enum(["normal", "low", "medium", "high", "critical"]);
export type AlarmSeverity = z.infer<typeof severitySchema>;

export const phraseIdSchema = z.enum([
  "PREPARE_01",
  "EVACUATE_01",
  "EVACUATE_REPEAT_01",
  "ALL_CLEAR_01",
  "SELF_TEST_01"
]);

const alertContextSchema = z
  .object({
    alertId: z.string().max(64).nullable().optional(),
    stationId: z.string().max(64).nullable().optional(),
    severity: severitySchema.optional(),
    title: z.string().max(120).optional(),
    message: z.string().max(500).optional(),
    source: z.string().min(1).max(64).optional(),
    reason: z.string().max(500).optional()
  })
  .passthrough();

export function parseActionContext(value: unknown): AlarmActionContext {
  return alertContextSchema.parse(value ?? {});
}

export type AlarmActionContext = z.infer<typeof alertContextSchema>;
export type AlarmAction = "alarm_on" | "alarm_off" | "silence";

export const alarmDesiredStateSchema = z.object({
  schema_version: z.literal(1),
  device_id: z.string().uuid(),
  revision: z.number().int().positive(),
  issued_ts: z.string().datetime(),
  state: z.enum(["idle", "active", "silenced"]),
  severity: severitySchema,
  source: z.string().min(1).max(64),
  reason: z.string().max(500).optional(),
  alert: z
    .object({
      alert_id: z.string().max(64).nullable(),
      station_id: z.string().max(64).nullable(),
      title: z.string().max(120),
      message: z.string().max(500)
    })
    .nullable()
    .optional(),
  outputs: z.object({
    buzzer: z.boolean(),
    motor: z.boolean(),
    rgb: z.enum(["off", "red_flash", "red_fast_flash", "amber_solid"]),
    display: z.enum(["standby", "risk", "silenced", "all_clear", "self_test"]),
    voice: z
      .object({
        phrase_id: phraseIdSchema,
        repeat_seconds: z.number().int().min(0).max(300)
      })
      .nullable()
  })
});

export type AlarmDesiredState = z.infer<typeof alarmDesiredStateSchema>;

export const alarmReportedStateSchema = z.object({
  schema_version: z.literal(1),
  device_id: z.string().uuid(),
  applied_revision: z.number().int().nonnegative(),
  reported_ts: z.string().datetime(),
  state: z.enum(["idle", "active", "silenced", "error"]),
  severity: severitySchema,
  outputs: z.object({
    buzzer: z.boolean(),
    motor: z.boolean(),
    rgb: z.enum(["off", "red_flash", "red_fast_flash", "amber_solid"]),
    display: z.enum(["standby", "risk", "silenced", "all_clear", "self_test"]),
    voice_phrase_id: phraseIdSchema.nullable()
  }),
  firmware_version: z.string().min(1).max(32),
  rssi_dbm: z.number().int().min(-127).max(0).nullable().optional(),
  last_error: z.string().max(200).nullable().optional()
});

export type AlarmReportedState = z.infer<typeof alarmReportedStateSchema>;

export const presenceEventSchema = z.object({
  schema_version: z.literal(1),
  device_id: z.string().uuid(),
  event_ts: z.string().datetime(),
  status: z.enum(["online", "offline"]),
  meta: z.record(z.unknown()).optional()
});

export type PresenceEvent = z.infer<typeof presenceEventSchema>;

export class RevisionClock {
  private current = 0;

  observe(revision: number): void {
    if (Number.isSafeInteger(revision) && revision > this.current) this.current = revision;
  }

  next(nowMs = Date.now()): number {
    this.current = Math.max(this.current + 1, Math.trunc(nowMs));
    return this.current;
  }
}

function alertFromContext(context: AlarmActionContext, previous?: AlarmDesiredState | null) {
  const previousAlert = previous?.alert ?? null;
  const hasNewAlert =
    context.alertId !== undefined ||
    context.stationId !== undefined ||
    context.title !== undefined ||
    context.message !== undefined;
  if (!hasNewAlert) return previousAlert;
  return {
    alert_id: context.alertId ?? previousAlert?.alert_id ?? null,
    station_id: context.stationId ?? previousAlert?.station_id ?? null,
    title: context.title ?? previousAlert?.title ?? "",
    message: context.message ?? previousAlert?.message ?? ""
  };
}

export function createDesiredState(args: {
  action: AlarmAction;
  context: AlarmActionContext;
  deviceId: string;
  revision: number;
  issuedTs?: string;
  voiceEnabled: boolean;
  previous?: AlarmDesiredState | null;
}): AlarmDesiredState {
  const { action, context, previous } = args;
  const source = context.source ?? "http-actuator";
  const common = {
    schema_version: 1 as const,
    device_id: args.deviceId,
    revision: args.revision,
    issued_ts: args.issuedTs ?? new Date().toISOString(),
    source,
    ...(context.reason ? { reason: context.reason } : {})
  };

  if (action === "alarm_on") {
    const severity = context.severity === "critical" ? "critical" : "high";
    return alarmDesiredStateSchema.parse({
      ...common,
      state: "active",
      severity,
      alert: alertFromContext(context, previous),
      outputs: {
        buzzer: true,
        motor: true,
        rgb: severity === "critical" ? "red_fast_flash" : "red_flash",
        display: "risk",
        voice: args.voiceEnabled
          ? {
              phrase_id: severity === "critical" ? "EVACUATE_01" : "PREPARE_01",
              repeat_seconds: severity === "critical" ? 30 : 60
            }
          : null
      }
    });
  }

  if (action === "silence") {
    return alarmDesiredStateSchema.parse({
      ...common,
      state: "silenced",
      severity: context.severity ?? previous?.severity ?? "high",
      alert: alertFromContext(context, previous),
      outputs: {
        buzzer: false,
        motor: false,
        rgb: "amber_solid",
        display: "silenced",
        voice: null
      }
    });
  }

  return alarmDesiredStateSchema.parse({
    ...common,
    state: "idle",
    severity: "normal",
    alert: alertFromContext(context, previous),
    outputs: {
      buzzer: false,
      motor: false,
      rgb: "off",
      display: "all_clear",
      voice: args.voiceEnabled ? { phrase_id: "ALL_CLEAR_01", repeat_seconds: 0 } : null
    }
  });
}
