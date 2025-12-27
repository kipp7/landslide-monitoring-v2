import { z } from "zod";

function optionalNonEmptyString() {
  return z.preprocess((v) => {
    if (typeof v !== "string") return v;
    const trimmed = v.trim();
    return trimmed.length === 0 ? undefined : trimmed;
  }, z.string().min(1).optional());
}

function optionalCsvList() {
  return z.preprocess((v) => {
    if (typeof v !== "string") return v;
    const trimmed = v.trim();
    if (trimmed.length === 0) return undefined;
    return trimmed;
  }, z.string().min(1).transform((v) => v.split(",").map((s) => s.trim()).filter(Boolean)).optional());
}

const configSchema = z.object({
  serviceName: z.string().default("api-service"),
  apiHost: z.string().default("0.0.0.0"),
  apiPort: z.coerce.number().int().positive().default(8080),

  corsOrigins: optionalCsvList(),

  postgresUrl: z.string().url().optional(),
  postgresHost: z.string().default("localhost"),
  postgresPort: z.coerce.number().int().positive().default(5432),
  postgresUser: z.string().default("landslide"),
  postgresPassword: z.string().optional(),
  postgresDatabase: z.string().default("landslide_monitor"),
  postgresPoolMax: z.coerce.number().int().positive().default(10),

  adminApiToken: z.string().optional(),
  dbAdminEnabled: z
    .string()
    .optional()
    .transform((v) => (v ?? "false").toLowerCase())
    .pipe(z.enum(["true", "false"]))
    .transform((v) => v === "true"),

  authRequired: z
    .string()
    .optional()
    .transform((v) => (v ?? "true").toLowerCase())
    .pipe(z.enum(["true", "false"]))
    .transform((v) => v === "true"),

  emqxWebhookToken: optionalNonEmptyString(),
  mqttInternalUsername: z.string().default("ingest-service"),
  mqttInternalPassword: optionalNonEmptyString(),

  jwtAccessSecret: optionalNonEmptyString(),
  jwtRefreshSecret: optionalNonEmptyString(),
  jwtAccessExpiresInSeconds: z.coerce.number().int().positive().default(2 * 3600),
  jwtRefreshExpiresInSeconds: z.coerce.number().int().positive().default(7 * 24 * 3600),

  clickhouseUrl: z.string().url(),
  clickhouseUsername: z.string().default("default"),
  clickhousePassword: z.string().optional(),
  clickhouseDatabase: z.string().default("landslide"),
  clickhouseTable: z.string().default("telemetry_raw"),

  kafkaBrokers: optionalCsvList(),
  kafkaTopicDeviceCommands: z.string().default("device.commands.v1"),

  apiMaxSeriesRangeHours: z.coerce.number().int().positive().default(168),
  apiMaxPoints: z.coerce.number().int().positive().default(100000),
  apiReplayMaxRangeHours: z.coerce.number().int().positive().default(168),
  apiReplayMaxRows: z.coerce.number().int().positive().default(200000),
  apiReplayMaxDevices: z.coerce.number().int().positive().default(50)
});

export type AppConfig = z.infer<typeof configSchema>;

export function loadConfigFromEnv(env: NodeJS.ProcessEnv): AppConfig {
  return configSchema.parse({
    serviceName: env.SERVICE_NAME,
    apiHost: env.API_HOST,
    apiPort: env.API_PORT,

    corsOrigins: env.CORS_ORIGINS,

    postgresUrl: env.POSTGRES_URL,
    postgresHost: env.POSTGRES_HOST,
    postgresPort: env.POSTGRES_PORT,
    postgresUser: env.POSTGRES_USER,
    postgresPassword: env.POSTGRES_PASSWORD,
    postgresDatabase: env.POSTGRES_DATABASE,
    postgresPoolMax: env.POSTGRES_POOL_MAX,

    adminApiToken: env.ADMIN_API_TOKEN,
    dbAdminEnabled: env.DB_ADMIN_ENABLED,
    authRequired: env.AUTH_REQUIRED,

    clickhouseUrl: env.CLICKHOUSE_URL,
    clickhouseUsername: env.CLICKHOUSE_USERNAME,
    clickhousePassword: env.CLICKHOUSE_PASSWORD,
    clickhouseDatabase: env.CLICKHOUSE_DATABASE,
    clickhouseTable: env.CLICKHOUSE_TABLE,

    apiMaxSeriesRangeHours: env.API_MAX_SERIES_RANGE_HOURS,
    apiMaxPoints: env.API_MAX_POINTS,
    apiReplayMaxRangeHours: env.API_REPLAY_MAX_RANGE_HOURS,
    apiReplayMaxRows: env.API_REPLAY_MAX_ROWS,
    apiReplayMaxDevices: env.API_REPLAY_MAX_DEVICES,

    emqxWebhookToken: env.EMQX_WEBHOOK_TOKEN,
    mqttInternalUsername: env.MQTT_INTERNAL_USERNAME,
    mqttInternalPassword: env.MQTT_INTERNAL_PASSWORD,

    jwtAccessSecret: env.JWT_ACCESS_SECRET,
    jwtRefreshSecret: env.JWT_REFRESH_SECRET,
    jwtAccessExpiresInSeconds: env.JWT_ACCESS_EXPIRES_IN_SECONDS,
    jwtRefreshExpiresInSeconds: env.JWT_REFRESH_EXPIRES_IN_SECONDS,

    kafkaBrokers: env.KAFKA_BROKERS,
    kafkaTopicDeviceCommands: env.KAFKA_TOPIC_DEVICE_COMMANDS
  });
}
