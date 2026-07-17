import { z } from "zod";

function optionalNonEmptyString() {
  return z.preprocess((v) => {
    if (typeof v !== "string") return v;
    const trimmed = v.trim();
    return trimmed.length === 0 ? undefined : trimmed;
  }, z.string().min(1).optional());
}

const configSchema = z.object({
  serviceName: z.string().default("alert-notify-worker"),

  kafkaBrokers: z
    .string()
    .min(1)
    .transform((v) => v.split(",").map((s) => s.trim()).filter(Boolean)),
  kafkaClientId: z.string().default("alert-notify-worker"),
  kafkaGroupId: z.string().default("alert-notify-worker.v1"),
  kafkaTopicAlertsEvents: z.string().default("alerts.events.v1"),

  postgresUrl: z.string().url().optional(),
  postgresHost: z.string().default("localhost"),
  postgresPort: z.coerce.number().int().positive().default(5432),
  postgresUser: z.string().default("landslide"),
  postgresPassword: optionalNonEmptyString(),
  postgresDatabase: z.string().default("landslide_monitor"),
  postgresPoolMax: z.coerce.number().int().positive().default(5),

  notifyType: z.enum(["app", "sms", "email", "wechat"]).default("app"),
  smsRecipientMode: z.enum(["subscriptions", "contact_library", "both"]).default("subscriptions"),
  smsProvider: z.enum(["mock", "aliyun"]).default("mock"),
  smsRealSendEnabled: z
    .string()
    .optional()
    .transform((v) => (v ?? "false").toLowerCase())
    .pipe(z.enum(["true", "false"]))
    .transform((v) => v === "true"),
  smsAliyunAccessKeyId: optionalNonEmptyString(),
  smsAliyunAccessKeySecret: optionalNonEmptyString(),
  smsAliyunEndpoint: z.string().default("dysmsapi.aliyuncs.com"),
  smsAliyunSignName: optionalNonEmptyString(),
  smsAliyunTemplateCode: optionalNonEmptyString()
});

export type AppConfig = z.infer<typeof configSchema>;

export function loadConfigFromEnv(env: NodeJS.ProcessEnv): AppConfig {
  return configSchema.parse({
    serviceName: env.SERVICE_NAME,

    kafkaBrokers: env.KAFKA_BROKERS,
    kafkaClientId: env.KAFKA_CLIENT_ID,
    kafkaGroupId: env.KAFKA_GROUP_ID,
    kafkaTopicAlertsEvents: env.KAFKA_TOPIC_ALERTS_EVENTS,

    postgresUrl: env.POSTGRES_URL,
    postgresHost: env.POSTGRES_HOST,
    postgresPort: env.POSTGRES_PORT,
    postgresUser: env.POSTGRES_USER,
    postgresPassword: env.POSTGRES_PASSWORD,
    postgresDatabase: env.POSTGRES_DATABASE,
    postgresPoolMax: env.POSTGRES_POOL_MAX,

    notifyType: env.NOTIFY_TYPE,
    smsRecipientMode: env.SMS_RECIPIENT_MODE,
    smsProvider: env.SMS_PROVIDER,
    smsRealSendEnabled: env.SMS_REAL_SEND_ENABLED,
    smsAliyunAccessKeyId: env.SMS_ALIYUN_ACCESS_KEY_ID,
    smsAliyunAccessKeySecret: env.SMS_ALIYUN_ACCESS_KEY_SECRET,
    smsAliyunEndpoint: env.SMS_ALIYUN_ENDPOINT,
    smsAliyunSignName: env.SMS_ALIYUN_SIGN_NAME,
    smsAliyunTemplateCode: env.SMS_ALIYUN_TEMPLATE_CODE
  });
}
