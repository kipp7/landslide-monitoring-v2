import { z } from "zod";

const configSchema = z.object({
  serviceName: z.string().default("ingest-service"),

  mqttUrl: z.string().url(),
  mqttUsername: z.string().min(1),
  mqttPassword: z.string().min(1),
  mqttTopicTelemetry: z.string().default("telemetry/+"),

  kafkaBrokers: z
    .string()
    .min(1)
    .transform((v) => v.split(",").map((s) => s.trim()).filter(Boolean)),
  kafkaClientId: z.string().default("ingest-service"),
  kafkaTopicTelemetryRaw: z.string().default("telemetry.raw.v1"),
  kafkaTopicTelemetryDlq: z.string().default("telemetry.dlq.v1")
});

export type AppConfig = z.infer<typeof configSchema>;

export function loadConfigFromEnv(env: NodeJS.ProcessEnv): AppConfig {
  return configSchema.parse({
    serviceName: env.SERVICE_NAME,
    mqttUrl: env.MQTT_URL,
    mqttUsername: env.MQTT_USERNAME,
    mqttPassword: env.MQTT_PASSWORD,
    mqttTopicTelemetry: env.MQTT_TOPIC_TELEMETRY,
    kafkaBrokers: env.KAFKA_BROKERS,
    kafkaClientId: env.KAFKA_CLIENT_ID,
    kafkaTopicTelemetryRaw: env.KAFKA_TOPIC_TELEMETRY_RAW,
    kafkaTopicTelemetryDlq: env.KAFKA_TOPIC_TELEMETRY_DLQ
  });
}

