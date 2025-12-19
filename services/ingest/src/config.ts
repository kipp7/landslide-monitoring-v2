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
    serviceName: z.string().default("ingest-service"),

    mqttUrl: z.string().url(),
    mqttUsername: optionalNonEmptyString(),
    mqttPassword: optionalNonEmptyString(),
    mqttTopicTelemetry: z.string().default("telemetry/+"),
    mqttTopicPresence: z.string().default("presence/+"),

    messageMaxBytes: z.coerce.number().int().positive().max(10_000_000).default(256 * 1024),
    metricsMaxKeys: z.coerce.number().int().positive().max(100_000).default(500),
    dlqRawPayloadMaxBytes: z.coerce.number().int().positive().max(10_000_000).default(64 * 1024),

    kafkaBrokers: z
      .string()
      .min(1)
      .transform((v) => v.split(",").map((s) => s.trim()).filter(Boolean)),
    kafkaClientId: z.string().default("ingest-service"),
    kafkaTopicTelemetryRaw: z.string().default("telemetry.raw.v1"),
    kafkaTopicTelemetryDlq: z.string().default("telemetry.dlq.v1"),
    kafkaTopicPresenceEvents: z.string().default("presence.events.v1")
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
    mqttUrl: env.MQTT_URL,
    mqttUsername: env.MQTT_USERNAME,
    mqttPassword: env.MQTT_PASSWORD,
    mqttTopicTelemetry: env.MQTT_TOPIC_TELEMETRY,
    mqttTopicPresence: env.MQTT_TOPIC_PRESENCE,
    messageMaxBytes: env.MESSAGE_MAX_BYTES,
    metricsMaxKeys: env.METRICS_MAX_KEYS,
    dlqRawPayloadMaxBytes: env.DLQ_RAW_PAYLOAD_MAX_BYTES,
    kafkaBrokers: env.KAFKA_BROKERS,
    kafkaClientId: env.KAFKA_CLIENT_ID,
    kafkaTopicTelemetryRaw: env.KAFKA_TOPIC_TELEMETRY_RAW,
    kafkaTopicTelemetryDlq: env.KAFKA_TOPIC_TELEMETRY_DLQ,
    kafkaTopicPresenceEvents: env.KAFKA_TOPIC_PRESENCE_EVENTS
  });
}
