import { z } from "zod";

const configSchema = z.object({
  serviceName: z.string().default("telemetry-writer"),

  kafkaBrokers: z
    .string()
    .min(1)
    .transform((v) => v.split(",").map((s) => s.trim()).filter(Boolean)),
  kafkaClientId: z.string().default("telemetry-writer"),
  kafkaGroupId: z.string().default("telemetry-writer.v1"),
  kafkaTopicTelemetryRaw: z.string().default("telemetry.raw.v1"),

  clickhouseUrl: z.string().url(),
  clickhouseUsername: z.string().default("default"),
  clickhousePassword: z.string().optional(),
  clickhouseDatabase: z.string().default("landslide"),
  clickhouseTable: z.string().default("telemetry_raw"),

  batchMaxRows: z.coerce.number().int().positive().default(2000),
  batchFlushIntervalMs: z.coerce.number().int().positive().default(1000)
});

export type AppConfig = z.infer<typeof configSchema>;

export function loadConfigFromEnv(env: NodeJS.ProcessEnv): AppConfig {
  return configSchema.parse({
    serviceName: env.SERVICE_NAME,

    kafkaBrokers: env.KAFKA_BROKERS,
    kafkaClientId: env.KAFKA_CLIENT_ID,
    kafkaGroupId: env.KAFKA_GROUP_ID,
    kafkaTopicTelemetryRaw: env.KAFKA_TOPIC_TELEMETRY_RAW,

    clickhouseUrl: env.CLICKHOUSE_URL,
    clickhouseUsername: env.CLICKHOUSE_USERNAME,
    clickhousePassword: env.CLICKHOUSE_PASSWORD,
    clickhouseDatabase: env.CLICKHOUSE_DATABASE,
    clickhouseTable: env.CLICKHOUSE_TABLE,

    batchMaxRows: env.BATCH_MAX_ROWS,
    batchFlushIntervalMs: env.BATCH_FLUSH_INTERVAL_MS
  });
}

