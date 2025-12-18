import { z } from "zod";

function optionalNonEmptyString() {
  return z.preprocess((v) => {
    if (typeof v !== "string") return v;
    const trimmed = v.trim();
    return trimmed.length === 0 ? undefined : trimmed;
  }, z.string().min(1).optional());
}

const configSchema = z.object({
  serviceName: z.string().default("api-service"),
  apiHost: z.string().default("0.0.0.0"),
  apiPort: z.coerce.number().int().positive().default(8080),

  postgresUrl: z.string().url().optional(),
  postgresHost: z.string().default("localhost"),
  postgresPort: z.coerce.number().int().positive().default(5432),
  postgresUser: z.string().default("landslide"),
  postgresPassword: z.string().optional(),
  postgresDatabase: z.string().default("landslide_monitor"),
  postgresPoolMax: z.coerce.number().int().positive().default(10),

  adminApiToken: z.string().optional(),

  authRequired: z
    .string()
    .optional()
    .transform((v) => (v ?? "true").toLowerCase())
    .pipe(z.enum(["true", "false"]))
    .transform((v) => v === "true"),

  emqxWebhookToken: optionalNonEmptyString(),
  mqttInternalUsername: z.string().default("ingest-service"),
  mqttInternalPassword: optionalNonEmptyString(),

  clickhouseUrl: z.string().url(),
  clickhouseUsername: z.string().default("default"),
  clickhousePassword: z.string().optional(),
  clickhouseDatabase: z.string().default("landslide"),
  clickhouseTable: z.string().default("telemetry_raw"),

  apiMaxSeriesRangeHours: z.coerce.number().int().positive().default(168),
  apiMaxPoints: z.coerce.number().int().positive().default(100000)
});

export type AppConfig = z.infer<typeof configSchema>;

export function loadConfigFromEnv(env: NodeJS.ProcessEnv): AppConfig {
  return configSchema.parse({
    serviceName: env.SERVICE_NAME,
    apiHost: env.API_HOST,
    apiPort: env.API_PORT,

    postgresUrl: env.POSTGRES_URL,
    postgresHost: env.POSTGRES_HOST,
    postgresPort: env.POSTGRES_PORT,
    postgresUser: env.POSTGRES_USER,
    postgresPassword: env.POSTGRES_PASSWORD,
    postgresDatabase: env.POSTGRES_DATABASE,
    postgresPoolMax: env.POSTGRES_POOL_MAX,

    adminApiToken: env.ADMIN_API_TOKEN,
    authRequired: env.AUTH_REQUIRED,

    clickhouseUrl: env.CLICKHOUSE_URL,
    clickhouseUsername: env.CLICKHOUSE_USERNAME,
    clickhousePassword: env.CLICKHOUSE_PASSWORD,
    clickhouseDatabase: env.CLICKHOUSE_DATABASE,
    clickhouseTable: env.CLICKHOUSE_TABLE,

  apiMaxSeriesRangeHours: env.API_MAX_SERIES_RANGE_HOURS,
    apiMaxPoints: env.API_MAX_POINTS,

    emqxWebhookToken: env.EMQX_WEBHOOK_TOKEN,
    mqttInternalUsername: env.MQTT_INTERNAL_USERNAME,
    mqttInternalPassword: env.MQTT_INTERNAL_PASSWORD
  });
}
