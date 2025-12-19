import { z } from "zod";

function optionalNonEmptyString() {
  return z.preprocess((v) => {
    if (typeof v !== "string") return v;
    const trimmed = v.trim();
    return trimmed.length === 0 ? undefined : trimmed;
  }, z.string().min(1).optional());
}

const configSchema = z.object({
  serviceName: z.string().default("telemetry-writer"),

  kafkaBrokers: z
    .string()
    .min(1)
    .transform((v) => v.split(",").map((s) => s.trim()).filter(Boolean)),
  kafkaClientId: z.string().default("telemetry-writer"),
  kafkaGroupId: z.string().default("telemetry-writer.v1"),
  kafkaTopicTelemetryRaw: z.string().default("telemetry.raw.v1"),
  kafkaTopicTelemetryDlq: z.string().default("telemetry.dlq.v1"),

  clickhouseUrl: z.string().url(),
  clickhouseUsername: z.string().default("default"),
  clickhousePassword: z.string().optional(),
  clickhouseDatabase: z.string().default("landslide"),
  clickhouseTable: z.string().default("telemetry_raw"),

  postgresUrl: z.string().url().optional(),
  postgresHost: z.string().default("localhost"),
  postgresPort: z.coerce.number().int().positive().default(5432),
  postgresUser: z.string().default("landslide"),
  postgresPassword: optionalNonEmptyString(),
  postgresDatabase: z.string().default("landslide_monitor"),
  postgresPoolMax: z.coerce.number().int().positive().default(5),

  batchMaxRows: z.coerce.number().int().positive().default(2000),
  batchMaxMessages: z.coerce.number().int().positive().default(500),
  batchFlushIntervalMs: z.coerce.number().int().positive().default(1000),

  messageMaxBytes: z.coerce.number().int().positive().max(10_000_000).default(256 * 1024),
  dlqRawPayloadMaxBytes: z.coerce.number().int().positive().max(10_000_000).default(64 * 1024),
  statsLogIntervalMs: z.coerce.number().int().positive().max(600_000).default(30_000),

  clickhouseInsertMaxRetries: z.coerce.number().int().positive().max(30).default(10),
  clickhouseInsertBackoffMs: z.coerce.number().int().positive().max(60000).default(1000),
  clickhouseInsertBackoffMaxMs: z.coerce.number().int().positive().max(300000).default(15000)
});

export type AppConfig = z.infer<typeof configSchema>;

export function loadConfigFromEnv(env: NodeJS.ProcessEnv): AppConfig {
  return configSchema.parse({
    serviceName: env.SERVICE_NAME,

    kafkaBrokers: env.KAFKA_BROKERS,
    kafkaClientId: env.KAFKA_CLIENT_ID,
    kafkaGroupId: env.KAFKA_GROUP_ID,
    kafkaTopicTelemetryRaw: env.KAFKA_TOPIC_TELEMETRY_RAW,
    kafkaTopicTelemetryDlq: env.KAFKA_TOPIC_TELEMETRY_DLQ,

    clickhouseUrl: env.CLICKHOUSE_URL,
    clickhouseUsername: env.CLICKHOUSE_USERNAME,
    clickhousePassword: env.CLICKHOUSE_PASSWORD,
    clickhouseDatabase: env.CLICKHOUSE_DATABASE,
    clickhouseTable: env.CLICKHOUSE_TABLE,

    postgresUrl: env.POSTGRES_URL,
    postgresHost: env.POSTGRES_HOST,
    postgresPort: env.POSTGRES_PORT,
    postgresUser: env.POSTGRES_USER,
    postgresPassword: env.POSTGRES_PASSWORD,
    postgresDatabase: env.POSTGRES_DATABASE,
    postgresPoolMax: env.POSTGRES_POOL_MAX,

    batchMaxRows: env.BATCH_MAX_ROWS,
    batchMaxMessages: env.BATCH_MAX_MESSAGES,
    batchFlushIntervalMs: env.BATCH_FLUSH_INTERVAL_MS,

    messageMaxBytes: env.MESSAGE_MAX_BYTES,
    dlqRawPayloadMaxBytes: env.DLQ_RAW_PAYLOAD_MAX_BYTES,
    statsLogIntervalMs: env.STATS_LOG_INTERVAL_MS,

    clickhouseInsertMaxRetries: env.CLICKHOUSE_INSERT_MAX_RETRIES,
    clickhouseInsertBackoffMs: env.CLICKHOUSE_INSERT_BACKOFF_MS,
    clickhouseInsertBackoffMaxMs: env.CLICKHOUSE_INSERT_BACKOFF_MAX_MS
  });
}
