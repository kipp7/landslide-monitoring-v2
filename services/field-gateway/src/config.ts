import { z } from "zod";

function optionalNonEmptyString() {
  return z.preprocess((v) => {
    if (typeof v !== "string") return v;
    const trimmed = v.trim();
    return trimmed.length === 0 ? undefined : trimmed;
  }, z.string().min(1).optional());
}

const configSchema = z
  .object({
    serviceName: z.string().default("field-gateway"),
    serialDevice: z.string().default("/dev/ttyS3"),
    serialBaudRate: z.coerce.number().int().positive().default(115200),
    mqttUrl: z.string().url(),
    mqttUsername: optionalNonEmptyString(),
    mqttPassword: optionalNonEmptyString(),
    mqttTopicTelemetryPrefix: z.string().default("telemetry/"),
    spoolRootDir: z.string().default("./data/field-gateway-spool"),
    healthFilePath: z.string().default("./data/field-gateway-spool/health/runtime-health.json"),
    mqttPublishTimeoutMs: z.coerce.number().int().positive().default(8000),
    replayIntervalMs: z.coerce.number().int().positive().default(5000),
    healthEmitIntervalMs: z.coerce.number().int().positive().default(5000),
    maxMessageBytes: z.coerce.number().int().positive().default(256 * 1024),
    maxPendingRecords: z.coerce.number().int().positive().default(10000),
    spoolRetentionPublished: z.coerce.number().int().nonnegative().default(200),
    spoolRetentionRejected: z.coerce.number().int().nonnegative().default(200)
  })
  .superRefine((data, ctx) => {
    const hasUser = Boolean(data.mqttUsername);
    const hasPass = Boolean(data.mqttPassword);
    if (hasUser !== hasPass) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "MQTT_USERNAME and MQTT_PASSWORD must be both set or both empty"
      });
    }
  });

export type AppConfig = z.infer<typeof configSchema>;

export function loadConfigFromEnv(env: NodeJS.ProcessEnv): AppConfig {
  return configSchema.parse({
    serviceName: env.SERVICE_NAME,
    serialDevice: env.SERIAL_DEVICE,
    serialBaudRate: env.SERIAL_BAUD_RATE,
    mqttUrl: env.MQTT_URL,
    mqttUsername: env.MQTT_USERNAME,
    mqttPassword: env.MQTT_PASSWORD,
    mqttTopicTelemetryPrefix: env.MQTT_TOPIC_TELEMETRY_PREFIX,
    spoolRootDir: env.SPOOL_ROOT_DIR,
    healthFilePath: env.HEALTH_FILE_PATH,
    mqttPublishTimeoutMs: env.MQTT_PUBLISH_TIMEOUT_MS,
    replayIntervalMs: env.REPLAY_INTERVAL_MS,
    healthEmitIntervalMs: env.HEALTH_EMIT_INTERVAL_MS,
    maxMessageBytes: env.MAX_MESSAGE_BYTES,
    maxPendingRecords: env.MAX_PENDING_RECORDS,
    spoolRetentionPublished: env.SPOOL_RETENTION_PUBLISHED,
    spoolRetentionRejected: env.SPOOL_RETENTION_REJECTED
  });
}
