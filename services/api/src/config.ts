import { z } from "zod";

const configSchema = z.object({
  serviceName: z.string().default("api-service"),
  apiHost: z.string().default("0.0.0.0"),
  apiPort: z.coerce.number().int().positive().default(8080),

  authRequired: z
    .string()
    .optional()
    .transform((v) => (v ?? "true").toLowerCase())
    .pipe(z.enum(["true", "false"]))
    .transform((v) => v === "true"),

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
    authRequired: env.AUTH_REQUIRED,

    clickhouseUrl: env.CLICKHOUSE_URL,
    clickhouseUsername: env.CLICKHOUSE_USERNAME,
    clickhousePassword: env.CLICKHOUSE_PASSWORD,
    clickhouseDatabase: env.CLICKHOUSE_DATABASE,
    clickhouseTable: env.CLICKHOUSE_TABLE,

    apiMaxSeriesRangeHours: env.API_MAX_SERIES_RANGE_HOURS,
    apiMaxPoints: env.API_MAX_POINTS
  });
}

