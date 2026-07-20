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
    .transform((v) =>
      v
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    ),
  kafkaClientId: z.string().default("ai-prediction-worker"),
  kafkaGroupId: z.string().default("ai-prediction-worker.v1"),
  kafkaTopicTelemetryRaw: z.string().default("telemetry.raw.v1"),
  kafkaTopicAiPredictions: z.string().default("ai.predictions.v1"),
  serverPredictionsEnabled: z
    .string()
    .optional()
    .transform((value) => (value ?? "true").toLowerCase())
    .pipe(z.enum(["true", "false"]))
    .transform((value) => value === "true"),

  mqttUrl: optionalNonEmptyString(),
  mqttUsername: optionalNonEmptyString(),
  mqttPassword: optionalNonEmptyString(),
  mqttClientId: z.string().default("ai-prediction-worker"),
  mqttEdgePredictionTopic: z.string().default("edge/ai/predictions/+"),
  mqttEdgeModelTopic: z.string().default("edge/ai/models/landslide-risk/v1"),

  postgresUrl: z.string().url().optional(),
  postgresHost: z.string().default("localhost"),
  postgresPort: z.coerce.number().int().positive().default(5432),
  postgresUser: z.string().default("landslide"),
  postgresPassword: optionalNonEmptyString(),
  postgresDatabase: z.string().default("landslide_monitor"),
  postgresPoolMax: z.coerce.number().int().positive().default(5),

  clickhouseUrl: z.string().url().optional(),
  clickhouseUsername: z.string().default("default"),
  clickhousePassword: optionalNonEmptyString(),
  clickhouseDatabase: z.string().default("landslide"),
  clickhouseTable: z.string().default("telemetry_raw"),

  modelKey: z.string().min(1).max(64).default("heuristic.v1"),
  modelVersion: z.string().min(1).max(64).default("1"),
  predictHorizonSeconds: z.coerce.number().int().min(0).max(31_536_000).default(3600),
  artifactRootDir: z.string().min(1).default("artifacts/models"),
  featureHistoryLookbackHours: z.coerce.number().int().min(72).max(720).default(192),
  edgeModelDirectory: z.string().min(1).default("/data/models"),
  edgeModelTrainingWindowHours: z.coerce.number().int().min(1).max(720).default(24),
  edgeModelRetrainIntervalMs: z.coerce
    .number()
    .int()
    .min(60_000)
    .max(7 * 24 * 3600 * 1000)
    .default(6 * 3600 * 1000),
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
    serverPredictionsEnabled: env.SERVER_PREDICTIONS_ENABLED,

    mqttUrl: env.MQTT_URL,
    mqttUsername: env.MQTT_USERNAME,
    mqttPassword: env.MQTT_PASSWORD,
    mqttClientId: env.MQTT_CLIENT_ID,
    mqttEdgePredictionTopic: env.MQTT_EDGE_PREDICTION_TOPIC,
    mqttEdgeModelTopic: env.MQTT_EDGE_MODEL_TOPIC,

    postgresUrl: env.POSTGRES_URL,
    postgresHost: env.POSTGRES_HOST,
    postgresPort: env.POSTGRES_PORT,
    postgresUser: env.POSTGRES_USER,
    postgresPassword: env.POSTGRES_PASSWORD,
    postgresDatabase: env.POSTGRES_DATABASE,
    postgresPoolMax: env.POSTGRES_POOL_MAX,

    clickhouseUrl: env.CLICKHOUSE_URL,
    clickhouseUsername: env.CLICKHOUSE_USERNAME,
    clickhousePassword: env.CLICKHOUSE_PASSWORD,
    clickhouseDatabase: env.CLICKHOUSE_DATABASE,
    clickhouseTable: env.CLICKHOUSE_TABLE,

    modelKey: env.MODEL_KEY,
    modelVersion: env.MODEL_VERSION,
    predictHorizonSeconds: env.PREDICT_HORIZON_SECONDS,
    artifactRootDir: env.ARTIFACT_ROOT_DIR,
    featureHistoryLookbackHours: env.FEATURE_HISTORY_LOOKBACK_HOURS,
    edgeModelDirectory: env.EDGE_MODEL_DIRECTORY,
    edgeModelTrainingWindowHours: env.EDGE_MODEL_TRAINING_WINDOW_HOURS,
    edgeModelRetrainIntervalMs: env.EDGE_MODEL_RETRAIN_INTERVAL_MS,
  });
}
