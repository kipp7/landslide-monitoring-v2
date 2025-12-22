import { z } from "zod";

function optionalNonEmptyString() {
  return z.preprocess((v) => {
    if (typeof v !== "string") return v;
    const trimmed = v.trim();
    return trimmed.length === 0 ? undefined : trimmed;
  }, z.string().min(1).optional());
}

function requiredCsvList() {
  return z
    .string()
    .min(1)
    .transform((v) =>
      v
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    )
    .pipe(z.array(z.string().min(1)).min(1));
}

const configSchema = z.object({
  serviceName: z.string().default("huawei-iot-adapter"),

  httpHost: z.string().default("0.0.0.0"),
  httpPort: z.coerce.number().int().positive().default(8091),

  iotHttpToken: optionalNonEmptyString(),

  kafkaBrokers: requiredCsvList(),
  kafkaClientId: z.string().default("huawei-iot-adapter"),
  kafkaTopicTelemetryRaw: z.string().default("telemetry.raw.v1")
});

export type HuaweiIotAdapterConfig = z.infer<typeof configSchema>;

export function loadConfigFromEnv(env: NodeJS.ProcessEnv): HuaweiIotAdapterConfig {
  return configSchema.parse({
    serviceName: env.SERVICE_NAME,
    httpHost: env.HTTP_HOST,
    httpPort: env.HTTP_PORT,
    iotHttpToken: env.IOT_HTTP_TOKEN,
    kafkaBrokers: env.KAFKA_BROKERS,
    kafkaClientId: env.KAFKA_CLIENT_ID,
    kafkaTopicTelemetryRaw: env.KAFKA_TOPIC_TELEMETRY_RAW
  });
}

