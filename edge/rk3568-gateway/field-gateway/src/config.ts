import { z } from "zod";

function optionalNonEmptyString() {
  return z.preprocess((v) => {
    if (typeof v !== "string") return v;
    const trimmed = v.trim();
    return trimmed.length === 0 ? undefined : trimmed;
  }, z.string().min(1).optional());
}

function envBoolean(defaultValue: boolean) {
  return z.preprocess((value) => {
    if (typeof value === "boolean") return value;
    if (typeof value !== "string") return defaultValue;
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) return true;
    if (["0", "false", "no", "off"].includes(normalized)) return false;
    return value;
  }, z.boolean().default(defaultValue));
}

const southboundNodeSchema = z.object({
  fieldNodeId: z.string().min(1),
  deviceId: z.string().uuid(),
  installLabel: z.string().min(1).optional(),
  southboundPort: z.string().min(1).optional(),
  enabled: z.boolean().default(true)
});

function southboundNodesFromEnv() {
  return z.preprocess((value) => {
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    if (trimmed.length === 0) return [];
    return JSON.parse(trimmed);
  }, z.array(southboundNodeSchema).default([]));
}

const configSchema = z
  .object({
    serviceName: z.string().default("field-gateway"),
    serialDevice: z.string().default("/dev/ttyS3"),
    serialBaudRate: z.coerce.number().int().positive().default(115200),
    fieldLinkMode: z.enum(["raw-json", "cobs-crc-v1"]).default("raw-json"),
    mqttUrl: z.string().url(),
    mqttUsername: optionalNonEmptyString(),
    mqttPassword: optionalNonEmptyString(),
    mqttTopicTelemetryPrefix: z.string().default("telemetry/"),
    mqttTopicCommandPrefix: z.string().default("cmd/"),
    mqttTopicAckPrefix: z.string().default("cmd_ack/"),
    spoolRootDir: z.string().default("./data/field-gateway-spool"),
    healthFilePath: z.string().default("./data/field-gateway-spool/health/runtime-health.json"),
    mqttPublishTimeoutMs: z.coerce.number().int().positive().default(8000),
    commandAckQuietWindowMs: z.coerce.number().int().positive().default(10000),
    commandPrewriteQuietMs: z.coerce.number().int().nonnegative().default(400),
    commandPrewriteMaxWaitMs: z.coerce.number().int().nonnegative().default(4000),
    commandSerialChunkBytes: z.coerce.number().int().nonnegative().default(0),
    commandSerialChunkDelayMs: z.coerce.number().int().nonnegative().default(0),
    southboundPollingEnabled: envBoolean(false),
    southboundPollingCommandType: z.string().min(1).default("poll_latest_telemetry"),
    southboundPollingIntervalMs: z.coerce.number().int().positive().default(1000),
    southboundPollingSessionTimeoutMs: z.coerce.number().int().positive().default(1500),
    southboundPollingPrewriteQuietMs: z.coerce.number().int().nonnegative().default(100),
    southboundPollingPrewriteMaxWaitMs: z.coerce.number().int().nonnegative().default(250),
    southboundPollingCommandChunkBytes: z.coerce.number().int().nonnegative().default(64),
    southboundPollingCommandChunkDelayMs: z.coerce.number().int().nonnegative().default(10),
    southboundPollingSuppressAckPublish: envBoolean(true),
    replayIntervalMs: z.coerce.number().int().positive().default(5000),
    healthEmitIntervalMs: z.coerce.number().int().positive().default(5000),
    serialReconnectBaseDelayMs: z.coerce.number().int().positive().default(5000),
    serialReconnectMaxDelayMs: z.coerce.number().int().positive().default(60000),
    nodeDegradedAfterMs: z.coerce.number().int().positive().default(15000),
    nodeOfflineAfterMs: z.coerce.number().int().positive().default(30000),
    portDegradedAfterMs: z.coerce.number().int().positive().default(15000),
    portOfflineAfterMs: z.coerce.number().int().positive().default(30000),
    maxMessageBytes: z.coerce.number().int().positive().default(256 * 1024),
    maxPendingRecords: z.coerce.number().int().positive().default(10000),
    spoolRetentionPublished: z.coerce.number().int().nonnegative().default(200),
    spoolRetentionRejected: z.coerce.number().int().nonnegative().default(200),
    southboundNodes: southboundNodesFromEnv()
  })
  .superRefine((data, ctx) => {
    const hasUser = Boolean(data.mqttUsername);
    const hasPass = Boolean(data.mqttPassword);
    if (hasUser !== hasPass) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "MQTT_USERNAME and MQTT_PASSWORD must be both set or both empty"
      });
    }

    if (data.nodeOfflineAfterMs <= data.nodeDegradedAfterMs) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["nodeOfflineAfterMs"],
        message: "NODE_OFFLINE_AFTER_MS must be greater than NODE_DEGRADED_AFTER_MS"
      });
    }

    if (data.portOfflineAfterMs <= data.portDegradedAfterMs) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["portOfflineAfterMs"],
        message: "PORT_OFFLINE_AFTER_MS must be greater than PORT_DEGRADED_AFTER_MS"
      });
    }

    if (data.serialReconnectMaxDelayMs < data.serialReconnectBaseDelayMs) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["serialReconnectMaxDelayMs"],
        message: "SERIAL_RECONNECT_MAX_DELAY_MS must be greater than or equal to SERIAL_RECONNECT_BASE_DELAY_MS"
      });
    }

    const deviceIds = new Set<string>();
    const fieldNodeIds = new Set<string>();
    for (const [index, node] of data.southboundNodes.entries()) {
      if (deviceIds.has(node.deviceId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["southboundNodes", index, "deviceId"],
          message: `duplicate southbound deviceId: ${node.deviceId}`
        });
      }
      deviceIds.add(node.deviceId);

      if (fieldNodeIds.has(node.fieldNodeId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["southboundNodes", index, "fieldNodeId"],
          message: `duplicate southbound fieldNodeId: ${node.fieldNodeId}`
        });
      }
      fieldNodeIds.add(node.fieldNodeId);
    }
  });

export type AppConfig = z.infer<typeof configSchema>;

export function loadConfigFromEnv(env: NodeJS.ProcessEnv): AppConfig {
  return configSchema.parse({
    serviceName: env.SERVICE_NAME,
    serialDevice: env.SERIAL_DEVICE,
    serialBaudRate: env.SERIAL_BAUD_RATE,
    fieldLinkMode: env.FIELD_LINK_MODE,
    mqttUrl: env.MQTT_URL,
    mqttUsername: env.MQTT_USERNAME,
    mqttPassword: env.MQTT_PASSWORD,
    mqttTopicTelemetryPrefix: env.MQTT_TOPIC_TELEMETRY_PREFIX,
    mqttTopicCommandPrefix: env.MQTT_TOPIC_COMMAND_PREFIX,
    mqttTopicAckPrefix: env.MQTT_TOPIC_ACK_PREFIX,
    spoolRootDir: env.SPOOL_ROOT_DIR,
    healthFilePath: env.HEALTH_FILE_PATH,
    mqttPublishTimeoutMs: env.MQTT_PUBLISH_TIMEOUT_MS,
    commandAckQuietWindowMs: env.COMMAND_ACK_QUIET_WINDOW_MS,
    commandPrewriteQuietMs: env.COMMAND_PREWRITE_QUIET_MS,
    commandPrewriteMaxWaitMs: env.COMMAND_PREWRITE_MAX_WAIT_MS,
    commandSerialChunkBytes: env.COMMAND_SERIAL_CHUNK_BYTES,
    commandSerialChunkDelayMs: env.COMMAND_SERIAL_CHUNK_DELAY_MS,
    southboundPollingEnabled: env.SOUTHBOUND_POLLING_ENABLED,
    southboundPollingCommandType: env.SOUTHBOUND_POLLING_COMMAND_TYPE,
    southboundPollingIntervalMs: env.SOUTHBOUND_POLLING_INTERVAL_MS,
    southboundPollingSessionTimeoutMs: env.SOUTHBOUND_POLLING_SESSION_TIMEOUT_MS,
    southboundPollingPrewriteQuietMs: env.SOUTHBOUND_POLLING_PREWRITE_QUIET_MS,
    southboundPollingPrewriteMaxWaitMs: env.SOUTHBOUND_POLLING_PREWRITE_MAX_WAIT_MS,
    southboundPollingCommandChunkBytes: env.SOUTHBOUND_POLLING_COMMAND_CHUNK_BYTES,
    southboundPollingCommandChunkDelayMs: env.SOUTHBOUND_POLLING_COMMAND_CHUNK_DELAY_MS,
    southboundPollingSuppressAckPublish: env.SOUTHBOUND_POLLING_SUPPRESS_ACK_PUBLISH,
    replayIntervalMs: env.REPLAY_INTERVAL_MS,
    healthEmitIntervalMs: env.HEALTH_EMIT_INTERVAL_MS,
    serialReconnectBaseDelayMs: env.SERIAL_RECONNECT_BASE_DELAY_MS,
    serialReconnectMaxDelayMs: env.SERIAL_RECONNECT_MAX_DELAY_MS,
    nodeDegradedAfterMs: env.NODE_DEGRADED_AFTER_MS,
    nodeOfflineAfterMs: env.NODE_OFFLINE_AFTER_MS,
    portDegradedAfterMs: env.PORT_DEGRADED_AFTER_MS,
    portOfflineAfterMs: env.PORT_OFFLINE_AFTER_MS,
    maxMessageBytes: env.MAX_MESSAGE_BYTES,
    maxPendingRecords: env.MAX_PENDING_RECORDS,
    spoolRetentionPublished: env.SPOOL_RETENTION_PUBLISHED,
    spoolRetentionRejected: env.SPOOL_RETENTION_REJECTED,
    southboundNodes: env.SOUTHBOUND_NODES_JSON
  });
}
