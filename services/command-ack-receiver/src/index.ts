import { createLogger, newTraceId } from "@lsmv2/observability";
import { loadAndCompileSchema } from "@lsmv2/validation";
import dotenv from "dotenv";
import { Kafka, logLevel } from "kafkajs";
import mqtt from "mqtt";
import { Pool } from "pg";
import path from "node:path";
import { loadConfigFromEnv } from "./config";

type DeviceCommandAckV1 = {
  schema_version: 1;
  command_id: string;
  device_id: string;
  ack_ts: string;
  status: "acked" | "failed";
  result?: Record<string, unknown>;
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

function topicToDeviceId(topic: string, prefix: string): string | null {
  if (!topic.startsWith(prefix)) return null;
  const rest = topic.slice(prefix.length);
  if (!rest) return null;
  if (rest.includes("/")) return null;
  return rest;
}

function pickErrorMessage(result: Record<string, unknown> | undefined): string | null {
  if (!result) return null;
  const v = (result as { error_message?: unknown }).error_message;
  if (typeof v === "string" && v.trim().length > 0) return v.trim();
  const v2 = (result as { message?: unknown }).message;
  if (typeof v2 === "string" && v2.trim().length > 0) return v2.trim();
  return null;
}

async function applyAckToPostgres(pg: Pool, ack: DeviceCommandAckV1): Promise<"updated" | "noop" | "missing"> {
  const errorMessage = ack.status === "failed" ? pickErrorMessage(ack.result) : null;
  const res = await pg.query<{ status: string }>(
    `
      UPDATE device_commands
      SET
        status = $3,
        acked_at = $4::timestamptz,
        result = $5::jsonb,
        error_message = $6,
        updated_at = NOW()
      WHERE
        command_id = $1
        AND device_id = $2
        AND status IN ('queued', 'sent')
        AND (acked_at IS NULL OR $4::timestamptz >= acked_at)
      RETURNING status
    `,
    [
      ack.command_id,
      ack.device_id,
      ack.status,
      ack.ack_ts,
      JSON.stringify(ack.result ?? {}),
      errorMessage
    ]
  );
  if ((res.rowCount ?? 0) > 0) return "updated";

  const exists = await pg.query<{ status: string }>(
    "SELECT status FROM device_commands WHERE command_id=$1 AND device_id=$2",
    [ack.command_id, ack.device_id]
  );
  if (exists.rowCount === 0) return "missing";
  return "noop";
}

async function main(): Promise<void> {
  dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

  const config = loadConfigFromEnv(process.env);
  const logger = createLogger(config.serviceName);

  const pg = createPgPool(config);

  const repoRoot = repoRootFromHere();
  const schemaMqttPath = path.join(
    repoRoot,
    "docs",
    "integrations",
    "mqtt",
    "schemas",
    "device-command-ack.v1.schema.json"
  );
  const schemaKafkaPath = path.join(
    repoRoot,
    "docs",
    "integrations",
    "kafka",
    "schemas",
    "device-command-acks.v1.schema.json"
  );
  const validateMqtt = await loadAndCompileSchema<DeviceCommandAckV1>(schemaMqttPath);
  const validateKafka = await loadAndCompileSchema<DeviceCommandAckV1>(schemaKafkaPath);

  const mqttClient = mqtt.connect(config.mqttUrl, {
    ...(config.mqttUsername && config.mqttPassword
      ? { username: config.mqttUsername, password: config.mqttPassword }
      : {})
  });

  await new Promise<void>((resolve, reject) => {
    mqttClient.once("connect", () => {
      resolve();
    });
    mqttClient.once("error", (err) => {
      reject(err);
    });
  });
  logger.info({ mqttUrl: config.mqttUrl }, "mqtt connected");

  const kafka = new Kafka({
    clientId: config.kafkaClientId,
    brokers: config.kafkaBrokers,
    logLevel: logLevel.NOTHING
  });
  const producer = kafka.producer();
  const consumer = kafka.consumer({ groupId: config.kafkaGroupId });

  await producer.connect();
  await consumer.connect();
  await consumer.subscribe({ topic: config.kafkaTopicDeviceCommandAcks, fromBeginning: false });

  mqttClient.subscribe(`${config.mqttTopicAckPrefix}+`, { qos: 1 }, (err) => {
    if (err) logger.error({ err }, "mqtt subscribe failed");
    else logger.info({ topic: `${config.mqttTopicAckPrefix}+` }, "mqtt subscribed");
  });

  mqttClient.on("message", async (topic, payload) => {
    const traceId = newTraceId();
    const raw = payload.toString("utf-8");
    const deviceIdFromTopic = topicToDeviceId(topic, config.mqttTopicAckPrefix);
    if (!deviceIdFromTopic) {
      logger.warn({ traceId, topic }, "ack topic does not match expected prefix (skipped)");
      return;
    }

    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!validateMqtt.validate(parsed)) {
        logger.warn({ traceId, topic, errors: validateMqtt.errors }, "mqtt command ack schema invalid (skipped)");
        return;
      }

      const ack: DeviceCommandAckV1 = parsed;
      if (ack.device_id !== deviceIdFromTopic) {
        logger.warn(
          { traceId, topic, payloadDeviceId: ack.device_id, topicDeviceId: deviceIdFromTopic },
          "ack device_id mismatch (skipped)"
        );
        return;
      }

      if (!validateKafka.validate(ack)) {
        logger.error({ traceId, errors: validateKafka.errors }, "kafka ack mapping invalid (BUG)");
        return;
      }

      await producer.send({
        topic: config.kafkaTopicDeviceCommandAcks,
        messages: [{ key: ack.device_id, value: JSON.stringify(ack) }]
      });
      logger.info({ traceId, commandId: ack.command_id, deviceId: ack.device_id, status: ack.status }, "ack published to kafka");
    } catch (err) {
      logger.warn({ traceId, err }, "mqtt ack parse failed (skipped)");
    }
  });

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
          if (!validateKafka.validate(parsed)) {
            logger.warn(
              { traceId, topic: batch.topic, partition: batch.partition, errors: validateKafka.errors },
              "device.command_acks schema invalid (skipped)"
            );
            ctx.resolveOffset(message.offset);
            continue;
          }

          const ack: DeviceCommandAckV1 = parsed;
          const applied = await applyAckToPostgres(pg, ack);
          if (applied === "missing") {
            logger.warn({ traceId, commandId: ack.command_id, deviceId: ack.device_id }, "ack for missing command (skipped)");
          } else if (applied === "noop") {
            logger.info({ traceId, commandId: ack.command_id, deviceId: ack.device_id }, "ack already applied (noop)");
          } else {
            logger.info({ traceId, commandId: ack.command_id, deviceId: ack.device_id, status: ack.status }, "ack applied to postgres");
          }

          ctx.resolveOffset(message.offset);
        } catch (err) {
          logger.error({ traceId, err }, "ack apply failed");
          throw err;
        }
      }

      await ctx.commitOffsetsIfNecessary();
    }
  });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "shutting down");
    mqttClient.end(true);
    await consumer.disconnect();
    await producer.disconnect();
    await pg.end();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

void main();
