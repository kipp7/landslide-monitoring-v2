import { z } from "zod";

const configSchema = z.object({
  serviceName: z.string().default("hermes-edge-supervisor"),
  automationUrl: z.string().url().default("http://127.0.0.1:18081/v1/automation"),
  summaryUrl: z.string().url().default("http://127.0.0.1:18081/v1/summary"),
  diagnosisModelPath: z.string().min(1).default("./models/edge-diagnosis-rf-v1.json"),
  supervisionFilePath: z.string().min(1).default("./data/hermes-edge-supervisor/status/supervision.json"),
  eventLogFilePath: z.string().min(1).default("./data/hermes-edge-supervisor/events/events.jsonl"),
  httpHost: z.string().min(1).default("127.0.0.1"),
  httpPort: z.coerce.number().int().min(1).max(65535).default(18082),
  pollIntervalMs: z.coerce.number().int().positive().default(5000),
  sourceStaleAfterMs: z.coerce.number().int().positive().default(120000)
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
    sourceStaleAfterMs: env.SOURCE_STALE_AFTER_MS
  });
}
