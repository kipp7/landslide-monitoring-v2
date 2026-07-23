import { z } from "zod";

const booleanTextSchema = z
  .string()
  .optional()
  .transform((value) => (value ?? "false").toLowerCase())
  .pipe(z.enum(["true", "false"]))
  .transform((value) => value === "true");

const configSchema = z.object({
  serviceName: z.string().min(1).default("tongxiao-alarm-bridge"),
  host: z.string().min(1).default("0.0.0.0"),
  port: z.coerce.number().int().positive().max(65535).default(18088),
  deviceId: z.string().uuid(),
  voiceEnabled: booleanTextSchema,
  mqttUrl: z.string().min(1).default("mqtt://127.0.0.1:1883"),
  mqttUsername: z.string().optional(),
  mqttPassword: z.string().optional(),
  mqttDesiredPrefix: z.string().min(1).default("alarm/desired/"),
  mqttReportedPrefix: z.string().min(1).default("alarm/reported/"),
  mqttPresencePrefix: z.string().min(1).default("presence/"),
  presenceStaleSeconds: z.coerce.number().int().positive().max(3600).default(90)
});

export function loadConfigFromEnv(env: NodeJS.ProcessEnv) {
  return configSchema.parse({
    serviceName: env.SERVICE_NAME,
    host: env.ALARM_BRIDGE_HOST,
    port: env.ALARM_BRIDGE_PORT,
    deviceId: env.TONGXIAO_DEVICE_ID,
    voiceEnabled: env.TONGXIAO_VOICE_ENABLED,
    mqttUrl: env.MQTT_URL,
    mqttUsername: env.MQTT_USERNAME,
    mqttPassword: env.MQTT_PASSWORD,
    mqttDesiredPrefix: env.MQTT_ALARM_DESIRED_PREFIX,
    mqttReportedPrefix: env.MQTT_ALARM_REPORTED_PREFIX,
    mqttPresencePrefix: env.MQTT_PRESENCE_PREFIX,
    presenceStaleSeconds: env.TONGXIAO_PRESENCE_STALE_SECONDS
  });
}

export type AlarmBridgeConfig = ReturnType<typeof loadConfigFromEnv>;
