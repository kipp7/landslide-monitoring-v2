import { z } from "zod";

const configSchema = z.object({
  serviceName: z.string().min(1).default("rule-engine-worker"),
  kafkaBrokers: z.string().min(1).transform((s) => s.split(",").map((x) => x.trim())),
  kafkaClientId: z.string().min(1).default("rule-engine-worker"),
  kafkaGroupId: z.string().min(1).default("rule-engine-worker.v1"),
  kafkaTopicTelemetryRaw: z.string().min(1).default("telemetry.raw.v1"),

  postgresUrl: z.string().optional(),
  postgresHost: z.string().min(1).default("127.0.0.1"),
  postgresPort: z.coerce.number().int().positive().default(5432),
  postgresUser: z.string().min(1).default("landslide"),
  postgresPassword: z.string().optional(),
  postgresDatabase: z.string().min(1).default("landslide_monitor"),
  postgresPoolMax: z.coerce.number().int().positive().max(50).default(5),

  rulesRefreshMs: z.coerce.number().int().positive().max(5 * 60 * 1000).default(10_000),
  maxPointsPerRule: z.coerce.number().int().positive().max(50_000).default(600)
});

export function loadConfigFromEnv(env: NodeJS.ProcessEnv) {
  const parsed = configSchema.safeParse({
    serviceName: env.SERVICE_NAME,
    kafkaBrokers: env.KAFKA_BROKERS,
    kafkaClientId: env.KAFKA_CLIENT_ID,
    kafkaGroupId: env.KAFKA_GROUP_ID,
    kafkaTopicTelemetryRaw: env.KAFKA_TOPIC_TELEMETRY_RAW,

    postgresUrl: env.POSTGRES_URL,
    postgresHost: env.POSTGRES_HOST,
    postgresPort: env.POSTGRES_PORT,
    postgresUser: env.POSTGRES_USER,
    postgresPassword: env.POSTGRES_PASSWORD,
    postgresDatabase: env.POSTGRES_DATABASE,
    postgresPoolMax: env.POSTGRES_POOL_MAX,

    rulesRefreshMs: env.RULES_REFRESH_MS,
    maxPointsPerRule: env.MAX_POINTS_PER_RULE
  });

  if (!parsed.success) {
    throw new Error("Invalid config: " + parsed.error.message);
  }

  return parsed.data;
}

