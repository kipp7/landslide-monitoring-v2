import { z } from "zod";

function optionalNonEmptyString() {
  return z.preprocess((v) => {
    if (typeof v !== "string") return v;
    const trimmed = v.trim();
    return trimmed.length === 0 ? undefined : trimmed;
  }, z.string().min(1).optional());
}

const configSchema = z.object({
  serviceName: z.string().default("ai-prediction-worker"),

  kafkaBrokers: z
    .string()
    .min(1)
    .transform((v) => v.split(",").map((s) => s.trim()).filter(Boolean)),
  kafkaClientId: z.string().default("ai-prediction-worker"),
  kafkaGroupId: z.string().default("ai-prediction-worker.v1"),
  kafkaTopicTelemetryRaw: z.string().default("telemetry.raw.v1"),
  kafkaTopicAiPredictions: z.string().default("ai.predictions.v1"),

  postgresUrl: z.string().url().optional(),
  postgresHost: z.string().default("localhost"),
  postgresPort: z.coerce.number().int().positive().default(5432),
  postgresUser: z.string().default("landslide"),
  postgresPassword: optionalNonEmptyString(),
  postgresDatabase: z.string().default("landslide_monitor"),
  postgresPoolMax: z.coerce.number().int().positive().default(5),

  modelKey: z.string().min(1).max(64).default("heuristic.v1"),
  modelVersion: z.string().min(1).max(64).default("1"),
  predictHorizonSeconds: z.coerce.number().int().min(0).max(31_536_000).default(3600)
});

export type AppConfig = z.infer<typeof configSchema>;

export function loadConfigFromEnv(env: NodeJS.ProcessEnv): AppConfig {
  return configSchema.parse({
    serviceName: env.SERVICE_NAME,

    kafkaBrokers: env.KAFKA_BROKERS,
    kafkaClientId: env.KAFKA_CLIENT_ID,
    kafkaGroupId: env.KAFKA_GROUP_ID,
    kafkaTopicTelemetryRaw: env.KAFKA_TOPIC_TELEMETRY_RAW,
    kafkaTopicAiPredictions: env.KAFKA_TOPIC_AI_PREDICTIONS,

    postgresUrl: env.POSTGRES_URL,
    postgresHost: env.POSTGRES_HOST,
    postgresPort: env.POSTGRES_PORT,
    postgresUser: env.POSTGRES_USER,
    postgresPassword: env.POSTGRES_PASSWORD,
    postgresDatabase: env.POSTGRES_DATABASE,
    postgresPoolMax: env.POSTGRES_POOL_MAX,

    modelKey: env.MODEL_KEY,
    modelVersion: env.MODEL_VERSION,
    predictHorizonSeconds: env.PREDICT_HORIZON_SECONDS
  });
}

