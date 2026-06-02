import { z } from "zod";

const configSchema = z.object({
  serviceName: z.string().default("field-link-monitor"),
  gatewayHealthFilePath: z.string().min(1).default("/var/lib/lsmv2/field-gateway/health/runtime-health.json"),
  networkStatusFilePath: z.string().min(1).default("/var/lib/lsmv2/network-bootstrap/status/runtime-status.json"),
  summaryFilePath: z.string().min(1).default("./data/field-link-monitor/status/summary.json"),
  httpHost: z.string().min(1).default("127.0.0.1"),
  httpPort: z.coerce.number().int().min(1).max(65535).default(18081),
  pollIntervalMs: z.coerce.number().int().positive().default(5000),
  publishFreshnessMs: z.coerce.number().int().positive().default(30000),
  sourceStaleAfterMs: z.coerce.number().int().positive().default(120000)
});

export type AppConfig = z.infer<typeof configSchema>;

export function loadConfigFromEnv(env: NodeJS.ProcessEnv): AppConfig {
  return configSchema.parse({
    serviceName: env.SERVICE_NAME,
    gatewayHealthFilePath: env.GATEWAY_HEALTH_FILE_PATH,
    networkStatusFilePath: env.NETWORK_STATUS_FILE_PATH,
    summaryFilePath: env.SUMMARY_FILE_PATH,
    httpHost: env.HTTP_HOST,
    httpPort: env.HTTP_PORT,
    pollIntervalMs: env.POLL_INTERVAL_MS,
    publishFreshnessMs: env.PUBLISH_FRESHNESS_MS,
    sourceStaleAfterMs: env.SOURCE_STALE_AFTER_MS
  });
}
