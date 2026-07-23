import { z } from "zod";

function optionalNonEmptyString() {
  return z.preprocess((value) => {
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }, z.string().min(1).optional());
}

const configSchema = z.object({
  serviceName: z.string().default("hermes-edge-supervisor"),
  automationUrl: z.string().url().default("http://127.0.0.1:18081/v1/automation"),
  summaryUrl: z.string().url().default("http://127.0.0.1:18081/v1/summary"),
  diagnosisModelPath: z.string().min(1).default("./models/edge-diagnosis-rf-v1.json"),
  supervisionFilePath: z
    .string()
    .min(1)
    .default("./data/hermes-edge-supervisor/status/supervision.json"),
  eventLogFilePath: z.string().min(1).default("./data/hermes-edge-supervisor/events/events.jsonl"),
  httpHost: z.string().min(1).default("127.0.0.1"),
  httpPort: z.coerce.number().int().min(1).max(65535).default(18082),
  pollIntervalMs: z.coerce.number().int().positive().default(5000),
  sourceStaleAfterMs: z.coerce.number().int().positive().default(120000),
  mqttUrl: optionalNonEmptyString(),
  mqttUsername: optionalNonEmptyString(),
  mqttPassword: optionalNonEmptyString(),
  mqttClientId: z.string().min(1).default("hermes-edge-supervisor"),
  mqttModelTopic: z.string().min(1).default("edge/ai/models/landslide-risk/v1"),
  mqttTelemetryTopic: z
    .string()
    .regex(/^[^+#]*\+$/, "MQTT telemetry topic must end with one single-level wildcard")
    .default("telemetry/+"),
  mqttTelemetryMaxPayloadBytes: z.coerce
    .number()
    .int()
    .min(1024)
    .max(1024 * 1024)
    .default(64 * 1024),
  mqttPredictionTopicPrefix: z.string().min(1).default("edge/ai/predictions/"),
  riskModelPath: z
    .string()
    .min(1)
    .default("./data/hermes-edge-supervisor/models/landslide-risk-latest.json"),
  riskModelMaxAgeMs: z.coerce
    .number()
    .int()
    .min(60 * 60_000)
    .max(30 * 24 * 60 * 60_000)
    .default(12 * 60 * 60_000),
  riskStatePath: z
    .string()
    .min(1)
    .default("./data/hermes-edge-supervisor/status/edge-risk-state.json"),
  riskTaskLogPath: z
    .string()
    .min(1)
    .default("./data/hermes-edge-supervisor/events/edge-agent-tasks.jsonl"),
  riskHistoryWindowMs: z.coerce
    .number()
    .int()
    .min(5 * 60_000)
    .max(24 * 3600_000)
    .default(31 * 60_000),
  predictionPublishIntervalMs: z.coerce.number().int().min(10_000).max(3600_000).default(60_000),
  predictionHorizonSeconds: z.coerce.number().int().min(0).max(31_536_000).default(3600),
});

export type AppConfig = z.infer<typeof configSchema>;

export function loadConfigFromEnv(env: NodeJS.ProcessEnv): AppConfig {
  return configSchema.parse({
    serviceName: env.SERVICE_NAME,
    automationUrl: env.AUTOMATION_URL,
    summaryUrl: env.SUMMARY_URL,
    diagnosisModelPath: env.DIAGNOSIS_MODEL_PATH,
    supervisionFilePath: env.SUPERVISION_FILE_PATH,
    eventLogFilePath: env.EVENT_LOG_FILE_PATH,
    httpHost: env.HTTP_HOST,
    httpPort: env.HTTP_PORT,
    pollIntervalMs: env.POLL_INTERVAL_MS,
    sourceStaleAfterMs: env.SOURCE_STALE_AFTER_MS,
    mqttUrl: env.MQTT_URL,
    mqttUsername: env.MQTT_USERNAME,
    mqttPassword: env.MQTT_PASSWORD,
    mqttClientId: env.MQTT_CLIENT_ID,
    mqttModelTopic: env.MQTT_MODEL_TOPIC,
    mqttTelemetryTopic: env.MQTT_TELEMETRY_TOPIC,
    mqttTelemetryMaxPayloadBytes: env.MQTT_TELEMETRY_MAX_PAYLOAD_BYTES,
    mqttPredictionTopicPrefix: env.MQTT_PREDICTION_TOPIC_PREFIX,
    riskModelPath: env.RISK_MODEL_PATH,
    riskModelMaxAgeMs: env.RISK_MODEL_MAX_AGE_MS,
    riskStatePath: env.RISK_STATE_PATH,
    riskTaskLogPath: env.RISK_TASK_LOG_PATH,
    riskHistoryWindowMs: env.RISK_HISTORY_WINDOW_MS,
    predictionPublishIntervalMs: env.PREDICTION_PUBLISH_INTERVAL_MS,
    predictionHorizonSeconds: env.PREDICTION_HORIZON_SECONDS,
  });
}
