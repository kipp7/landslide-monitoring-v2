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
    southboundPollingMode: z
      .enum(["round-robin-json", "compact-broadcast-v1", "compact-targeted-v1", "compact-layered-v1"])
      .default("round-robin-json"),
    southboundPollingCommandType: z.string().min(1).default("poll_latest_telemetry"),
    southboundPollingIntervalMs: z.coerce.number().int().positive().default(1000),
    southboundPollingSessionTimeoutMs: z.coerce.number().int().positive().default(5000),
    southboundPollingPartialRetries: z.coerce.number().int().min(0).max(1).default(0),
    southboundPollingRetryAfterMs: z.coerce.number().int().positive().default(1200),
    southboundPollingPrewriteQuietMs: z.coerce.number().int().nonnegative().default(100),
    southboundPollingPrewriteMaxWaitMs: z.coerce.number().int().nonnegative().default(250),
    southboundPollingCommandChunkBytes: z.coerce.number().int().nonnegative().default(64),
    southboundPollingCommandChunkDelayMs: z.coerce.number().int().nonnegative().default(10),
    southboundPollingSuppressAckPublish: envBoolean(true),
    southboundPollingEmptyBackoffInitialMs: z.coerce.number().int().positive().default(2000),
    southboundPollingEmptyBackoffMaxMs: z.coerce.number().int().positive().default(30000),
    southboundLayeredEnvironmentEveryRounds: z.coerce.number().int().min(1).max(1000).default(3),
    southboundLayeredAuditEveryRounds: z.coerce.number().int().min(2).max(10000).default(15),
    ntripEnabled: envBoolean(false),
    ntripHost: optionalNonEmptyString(),
    ntripPort: z.coerce.number().int().min(1).max(65535).default(8003),
    ntripMountpoint: optionalNonEmptyString(),
    ntripUsername: optionalNonEmptyString(),
    ntripPassword: optionalNonEmptyString(),
    ntripCoordinateFrame: z.enum(["CGCS2000", "WGS84"]).default("CGCS2000"),
    ntripGgaSourceNode: z.enum(["A", "B", "C"]).default("A"),
    ntripGgaIntervalMs: z.coerce.number().int().min(1000).max(60000).default(10000),
    ntripConnectTimeoutMs: z.coerce.number().int().min(1000).max(60000).default(10000),
    ntripReconnectBaseDelayMs: z.coerce.number().int().min(250).max(60000).default(1000),
    ntripReconnectMaxDelayMs: z.coerce.number().int().min(1000).max(300000).default(30000),
    rtcmRuntimeMode: z.enum(["probe", "live"]).default("live"),
    rtcmTargetMask: z.coerce.number().int().min(1).max(7).default(7),
    rtcmSessionLeaseSeconds: z.coerce.number().int().min(15).max(300).default(90),
    rtcmSessionRefreshMs: z.coerce.number().int().min(5000).max(120000).default(30000),
    rtcmDispatchIntervalMs: z.coerce.number().int().min(50).max(2000).default(160),
    rtcmFragmentDataBytes: z.coerce.number().int().min(64).max(512).default(160),
    rtcmObservationIntervalMs: z.coerce.number().int().min(500).max(5000).default(1000),
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

    if (data.southboundPollingEmptyBackoffMaxMs < data.southboundPollingEmptyBackoffInitialMs) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["southboundPollingEmptyBackoffMaxMs"],
        message:
          "SOUTHBOUND_POLLING_EMPTY_BACKOFF_MAX_MS must be greater than or equal to SOUTHBOUND_POLLING_EMPTY_BACKOFF_INITIAL_MS"
      });
    }

    if (data.ntripReconnectMaxDelayMs < data.ntripReconnectBaseDelayMs) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ntripReconnectMaxDelayMs"],
        message: "NTRIP_RECONNECT_MAX_DELAY_MS must be greater than or equal to NTRIP_RECONNECT_BASE_DELAY_MS"
      });
    }

    if (data.rtcmSessionRefreshMs >= data.rtcmSessionLeaseSeconds * 1000) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["rtcmSessionRefreshMs"],
        message: "RTCM_SESSION_REFRESH_MS must be shorter than the session lease"
      });
    }

    if (data.ntripEnabled) {
      for (const [field, value] of [
        ["ntripHost", data.ntripHost],
        ["ntripMountpoint", data.ntripMountpoint],
        ["ntripUsername", data.ntripUsername],
        ["ntripPassword", data.ntripPassword]
      ] as const) {
        if (!value) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [field],
            message: `${field} is required when NTRIP_ENABLED=true`
          });
        }
      }
      if (data.fieldLinkMode !== "cobs-crc-v1") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["fieldLinkMode"],
          message: "NTRIP RTCM downlink requires FIELD_LINK_MODE=cobs-crc-v1"
        });
      }
    }

    if (data.southboundPollingMode.startsWith("compact-") && data.fieldLinkMode !== "cobs-crc-v1") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["fieldLinkMode"],
        message: `${data.southboundPollingMode} requires FIELD_LINK_MODE=cobs-crc-v1`
      });
    }

    const requiredRetryWindowMs = data.southboundPollingRetryAfterMs *
      (data.southboundPollingPartialRetries > 0 ? 4 : 1);
    if (
      data.southboundPollingPartialRetries > 0 &&
      data.southboundPollingMode !== "compact-broadcast-v1" &&
      data.southboundPollingMode !== "compact-layered-v1"
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["southboundPollingPartialRetries"],
        message: "SOUTHBOUND_POLLING_PARTIAL_RETRIES requires compact-broadcast-v1 or compact-layered-v1"
      });
    }
    if (
      data.southboundPollingPartialRetries > 0 &&
      data.southboundPollingSessionTimeoutMs < requiredRetryWindowMs
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["southboundPollingSessionTimeoutMs"],
        message:
          "SOUTHBOUND_POLLING_SESSION_TIMEOUT_MS must cover the broadcast window and three bounded targeted recovery windows"
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
    southboundPollingMode: env.SOUTHBOUND_POLLING_MODE,
    southboundPollingCommandType: env.SOUTHBOUND_POLLING_COMMAND_TYPE,
    southboundPollingIntervalMs: env.SOUTHBOUND_POLLING_INTERVAL_MS,
    southboundPollingSessionTimeoutMs: env.SOUTHBOUND_POLLING_SESSION_TIMEOUT_MS,
    southboundPollingPartialRetries: env.SOUTHBOUND_POLLING_PARTIAL_RETRIES,
    southboundPollingRetryAfterMs: env.SOUTHBOUND_POLLING_RETRY_AFTER_MS,
    southboundPollingPrewriteQuietMs: env.SOUTHBOUND_POLLING_PREWRITE_QUIET_MS,
    southboundPollingPrewriteMaxWaitMs: env.SOUTHBOUND_POLLING_PREWRITE_MAX_WAIT_MS,
    southboundPollingCommandChunkBytes: env.SOUTHBOUND_POLLING_COMMAND_CHUNK_BYTES,
    southboundPollingCommandChunkDelayMs: env.SOUTHBOUND_POLLING_COMMAND_CHUNK_DELAY_MS,
    southboundPollingSuppressAckPublish: env.SOUTHBOUND_POLLING_SUPPRESS_ACK_PUBLISH,
    southboundPollingEmptyBackoffInitialMs: env.SOUTHBOUND_POLLING_EMPTY_BACKOFF_INITIAL_MS,
    southboundPollingEmptyBackoffMaxMs: env.SOUTHBOUND_POLLING_EMPTY_BACKOFF_MAX_MS,
    southboundLayeredEnvironmentEveryRounds: env.SOUTHBOUND_LAYERED_ENVIRONMENT_EVERY_ROUNDS,
    southboundLayeredAuditEveryRounds: env.SOUTHBOUND_LAYERED_AUDIT_EVERY_ROUNDS,
    ntripEnabled: env.NTRIP_ENABLED,
    ntripHost: env.NTRIP_HOST,
    ntripPort: env.NTRIP_PORT,
    ntripMountpoint: env.NTRIP_MOUNTPOINT,
    ntripUsername: env.NTRIP_USERNAME,
    ntripPassword: env.NTRIP_PASSWORD,
    ntripCoordinateFrame: env.NTRIP_COORDINATE_FRAME,
    ntripGgaSourceNode: env.NTRIP_GGA_SOURCE_NODE,
    ntripGgaIntervalMs: env.NTRIP_GGA_INTERVAL_MS,
    ntripConnectTimeoutMs: env.NTRIP_CONNECT_TIMEOUT_MS,
    ntripReconnectBaseDelayMs: env.NTRIP_RECONNECT_BASE_DELAY_MS,
    ntripReconnectMaxDelayMs: env.NTRIP_RECONNECT_MAX_DELAY_MS,
    rtcmRuntimeMode: env.RTCM_RUNTIME_MODE,
    rtcmTargetMask: env.RTCM_TARGET_MASK,
    rtcmSessionLeaseSeconds: env.RTCM_SESSION_LEASE_SECONDS,
    rtcmSessionRefreshMs: env.RTCM_SESSION_REFRESH_MS,
    rtcmDispatchIntervalMs: env.RTCM_DISPATCH_INTERVAL_MS,
    rtcmFragmentDataBytes: env.RTCM_FRAGMENT_DATA_BYTES,
    rtcmObservationIntervalMs: env.RTCM_OBSERVATION_INTERVAL_MS,
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
