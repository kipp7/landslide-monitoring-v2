import { z } from "zod";

function optionalNonEmptyString() {
  return z.preprocess((v) => {
    if (typeof v !== "string") return v;
    const trimmed = v.trim();
    return trimmed.length === 0 ? undefined : trimmed;
  }, z.string().min(1).optional());
}

const configSchema = z.object({
  serviceName: z.string().default("command-events-recorder"),

  kafkaBrokers: z
    .string()
    .min(1)
    .transform((v) => v.split(",").map((s) => s.trim()).filter(Boolean)),
  kafkaClientId: z.string().default("command-events-recorder"),
  kafkaGroupId: z.string().default("command-events-recorder.v1"),
  kafkaTopicDeviceCommandEvents: z.string().default("device.command_events.v1"),

  postgresUrl: z.string().url().optional(),
  postgresHost: z.string().default("localhost"),
  postgresPort: z.coerce.number().int().positive().default(5432),
  postgresUser: z.string().default("landslide"),
  postgresPassword: optionalNonEmptyString(),
  postgresDatabase: z.string().default("landslide_monitor"),
  postgresPoolMax: z.coerce.number().int().positive().default(5)
});

export type AppConfig = z.infer<typeof configSchema>;

export function loadConfigFromEnv(env: NodeJS.ProcessEnv): AppConfig {
  return configSchema.parse({
    serviceName: env.SERVICE_NAME,

    kafkaBrokers: env.KAFKA_BROKERS,
    kafkaClientId: env.KAFKA_CLIENT_ID,
    kafkaGroupId: env.KAFKA_GROUP_ID,
    kafkaTopicDeviceCommandEvents: env.KAFKA_TOPIC_DEVICE_COMMAND_EVENTS,

    postgresUrl: env.POSTGRES_URL,
    postgresHost: env.POSTGRES_HOST,
    postgresPort: env.POSTGRES_PORT,
    postgresUser: env.POSTGRES_USER,
    postgresPassword: env.POSTGRES_PASSWORD,
    postgresDatabase: env.POSTGRES_DATABASE,
    postgresPoolMax: env.POSTGRES_POOL_MAX
  });
}

