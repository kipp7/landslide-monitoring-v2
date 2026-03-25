import { createLogger, newTraceId } from "@lsmv2/observability";
import { loadAndCompileSchema } from "@lsmv2/validation";
import dotenv from "dotenv";
import { Kafka, logLevel } from "kafkajs";
import { Pool } from "pg";
import path from "node:path";
import { loadConfigFromEnv } from "./config";

type DeviceCommandEventV1 = {
  schema_version: 1;
  event_id: string;
  event_type: "COMMAND_SENT" | "COMMAND_ACKED" | "COMMAND_FAILED" | "COMMAND_TIMEOUT";
  created_ts: string;
  command_id: string;
  device_id: string;
  status: "queued" | "sent" | "acked" | "failed" | "timeout" | "canceled";
  detail?: string;
  result?: Record<string, unknown>;
};

type SuccessNotificationPolicy = "inherit" | "silent" | "always_notify";
type EffectiveSuccessNotificationPolicy = Exclude<SuccessNotificationPolicy, "inherit">;
type CommandSuccessNotificationConfig = {
  systemDefault: EffectiveSuccessNotificationPolicy;
  commandTypeDefaults: Partial<Record<string, EffectiveSuccessNotificationPolicy>>;
};

const COMMAND_SUCCESS_NOTIFICATION_SYSTEM_DEFAULT_KEY = "command.success_notification.system_default";
const COMMAND_SUCCESS_NOTIFICATION_COMMAND_TYPE_DEFAULTS_KEY = "command.success_notification.command_type_defaults";
const DEFAULT_COMMAND_SUCCESS_NOTIFICATION_CONFIG: CommandSuccessNotificationConfig = {
  systemDefault: "silent",
  commandTypeDefaults: {
    set_config: "always_notify",
    reboot: "always_notify",
    restart_device: "always_notify",
    deactivate_device: "always_notify",
    set_sampling_interval: "always_notify",
    manual_collect: "always_notify",
    "huawei:reboot": "always_notify"
  }
};

function repoRootFromHere(): string {
  return path.resolve(__dirname, "..", "..", "..");
}

function createPgPool(config: ReturnType<typeof loadConfigFromEnv>): Pool {
  if (config.postgresUrl) return new Pool({ connectionString: config.postgresUrl, max: config.postgresPoolMax });
  if (!config.postgresPassword) {
    throw new Error("Missing PostgreSQL config: set POSTGRES_URL or POSTGRES_PASSWORD");
  }
  return new Pool({
    host: config.postgresHost,
    port: config.postgresPort,
    user: config.postgresUser,
    password: config.postgresPassword,
    database: config.postgresDatabase,
    max: config.postgresPoolMax
  });
}

function asEffectiveSuccessNotificationPolicy(
  value: string | null | undefined,
  fallback: EffectiveSuccessNotificationPolicy
): EffectiveSuccessNotificationPolicy {
  return value === "always_notify" || value === "silent" ? value : fallback;
}

function parseCommandTypeSuccessNotificationDefaults(
  raw: string | null | undefined,
  fallback: Partial<Record<string, EffectiveSuccessNotificationPolicy>>
): Partial<Record<string, EffectiveSuccessNotificationPolicy>> {
  if (!raw || !raw.trim()) return fallback;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return fallback;

    const resolved: Partial<Record<string, EffectiveSuccessNotificationPolicy>> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!key.trim()) continue;
      if (value === "always_notify" || value === "silent") {
        resolved[key] = value;
      }
    }
    return Object.keys(resolved).length > 0 ? resolved : fallback;
  } catch {
    return fallback;
  }
}

async function loadCommandSuccessNotificationConfig(pg: Pool): Promise<CommandSuccessNotificationConfig> {
  const rows = await pg.query<{ config_key: string; config_value: string | null }>(
    `
      SELECT config_key, config_value
      FROM system_configs
      WHERE config_key IN ($1, $2)
    `,
    [COMMAND_SUCCESS_NOTIFICATION_SYSTEM_DEFAULT_KEY, COMMAND_SUCCESS_NOTIFICATION_COMMAND_TYPE_DEFAULTS_KEY]
  );
  const byKey = new Map(rows.rows.map((row) => [row.config_key, row.config_value] as const));
  return {
    systemDefault: asEffectiveSuccessNotificationPolicy(
      byKey.get(COMMAND_SUCCESS_NOTIFICATION_SYSTEM_DEFAULT_KEY),
      DEFAULT_COMMAND_SUCCESS_NOTIFICATION_CONFIG.systemDefault
    ),
    commandTypeDefaults: parseCommandTypeSuccessNotificationDefaults(
      byKey.get(COMMAND_SUCCESS_NOTIFICATION_COMMAND_TYPE_DEFAULTS_KEY),
      DEFAULT_COMMAND_SUCCESS_NOTIFICATION_CONFIG.commandTypeDefaults
    )
  };
}

function getCommandTypeDefaultSuccessNotificationPolicy(
  commandType: string,
  config: CommandSuccessNotificationConfig
): EffectiveSuccessNotificationPolicy {
  return config.commandTypeDefaults[commandType] ?? config.systemDefault;
}

function resolveStoredSuccessNotificationPolicy(input: {
  commandType: string;
  notifyOnAck: boolean;
  successNotificationPolicy: SuccessNotificationPolicy | null;
  config: CommandSuccessNotificationConfig;
}): EffectiveSuccessNotificationPolicy {
  const successNotificationPolicy =
    input.successNotificationPolicy ?? (input.notifyOnAck ? "always_notify" : "silent");
  return successNotificationPolicy === "inherit"
    ? getCommandTypeDefaultSuccessNotificationPolicy(input.commandType, input.config)
    : successNotificationPolicy;
}

async function shouldNotify(pg: Pool, ev: DeviceCommandEventV1): Promise<boolean> {
  if (ev.event_type === "COMMAND_TIMEOUT" || ev.event_type === "COMMAND_FAILED") return true;
  if (ev.event_type !== "COMMAND_ACKED") return false;

  const row = await pg.query<{
    command_type: string;
    notify_on_acked: boolean;
    success_notification_policy: SuccessNotificationPolicy | null;
  }>(
    `
      SELECT command_type, notify_on_acked, success_notification_policy
      FROM device_commands
      WHERE command_id = $1::uuid AND device_id = $2::uuid
      LIMIT 1
    `,
    [ev.command_id, ev.device_id]
  );
  const command = row.rows[0];
  if (!command) return false;
  const successNotificationConfig = await loadCommandSuccessNotificationConfig(pg);
  return (
    resolveStoredSuccessNotificationPolicy({
      commandType: command.command_type,
      notifyOnAck: Boolean(command.notify_on_acked),
      successNotificationPolicy: command.success_notification_policy,
      config: successNotificationConfig
    }) === "always_notify"
  );
}

function buildNotification(ev: DeviceCommandEventV1): { title: string; content: string } {
  const prefix =
    ev.event_type === "COMMAND_TIMEOUT"
      ? "命令超时"
      : ev.event_type === "COMMAND_FAILED"
        ? "命令失败"
        : "命令已确认";
  const title = `${prefix}：${ev.command_id}`;

  const detail = ev.detail ? `detail=${ev.detail}` : "";
  const content =
    `${prefix}\n` +
    `deviceId=${ev.device_id}\n` +
    `commandId=${ev.command_id}\n` +
    `status=${ev.status}\n` +
    (detail ? detail + "\n" : "");

  return { title, content };
}

async function main(): Promise<void> {
  dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

  const config = loadConfigFromEnv(process.env);
  const logger = createLogger(config.serviceName);

  const repoRoot = repoRootFromHere();
  const schemaEventPath = path.join(
    repoRoot,
    "docs",
    "integrations",
    "kafka",
    "schemas",
    "device-command-events.v1.schema.json"
  );
  const validateEvent = await loadAndCompileSchema<DeviceCommandEventV1>(schemaEventPath);

  const kafka = new Kafka({
    clientId: config.kafkaClientId,
    brokers: config.kafkaBrokers,
    logLevel: logLevel.NOTHING
  });
  const consumer = kafka.consumer({ groupId: config.kafkaGroupId });
  await consumer.connect();
  await consumer.subscribe({ topic: config.kafkaTopicDeviceCommandEvents, fromBeginning: false });

  const pg = createPgPool(config);

  logger.info({ topic: config.kafkaTopicDeviceCommandEvents, notifyType: config.notifyType }, "command-notify-worker started");

  await consumer.run({
    autoCommit: false,
    eachBatchAutoResolve: false,
    eachBatch: async (ctx) => {
      const { batch } = ctx;
      if (!ctx.isRunning() || ctx.isStale()) return;

      for (const message of batch.messages) {
        if (!ctx.isRunning() || ctx.isStale()) break;
        await ctx.heartbeat();

        const traceId = newTraceId();
        const raw = message.value?.toString("utf-8") ?? "";

        try {
          const parsed = JSON.parse(raw) as unknown;
          if (!validateEvent.validate(parsed)) {
            logger.warn(
              { traceId, topic: batch.topic, partition: batch.partition, errors: validateEvent.errors },
              "device.command_events schema invalid (skipped)"
            );
            ctx.resolveOffset(message.offset);
            continue;
          }

          const ev: DeviceCommandEventV1 = parsed;
          if (!(await shouldNotify(pg, ev))) {
            ctx.resolveOffset(message.offset);
            continue;
          }

          const n = buildNotification(ev);
          await pg.query(
            `
              INSERT INTO device_command_notifications (
                event_id, notify_type, status, title, content
              ) VALUES (
                $1::uuid, $2, 'pending', $3, $4
              )
              ON CONFLICT (event_id, notify_type) DO NOTHING
            `,
            [ev.event_id, config.notifyType, n.title, n.content]
          );

          logger.info({ traceId, eventId: ev.event_id, eventType: ev.event_type, commandId: ev.command_id }, "notification created");
          ctx.resolveOffset(message.offset);
        } catch (err) {
          logger.error({ traceId, err }, "notify failed");
          throw err;
        }
      }

      await ctx.commitOffsetsIfNecessary();
    }
  });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "shutting down");
    await consumer.disconnect();
    await pg.end();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

void main();
