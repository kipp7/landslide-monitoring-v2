import { createLogger, newTraceId } from "@lsmv2/observability";
import { loadAndCompileSchema } from "@lsmv2/validation";
import dotenv from "dotenv";
import { Kafka, logLevel } from "kafkajs";
import mqtt from "mqtt";
import { Pool } from "pg";
import path from "node:path";
import { loadConfigFromEnv } from "./config";

type DeviceCommandKafkaV1 = {
  schema_version: 1;
  command_id: string;
  device_id: string;
  command_type: string;
  payload: Record<string, unknown>;
  issued_ts: string;
  requested_by?: string | null;
};

type DeviceCommandMqttV1 = {
  schema_version: 1;
  command_id: string;
  device_id: string;
  command_type: string;
  payload: Record<string, unknown>;
  issued_ts: string;
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

function mqttPublish(client: mqtt.MqttClient, topic: string, payload: string): Promise<void> {
  return new Promise((resolve, reject) => {
    client.publish(topic, payload, { qos: 1 }, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function waitForMqttConnected(client: mqtt.MqttClient): Promise<void> {
  if (client.connected) return Promise.resolve();
  return new Promise((resolve) => {
    client.once("connect", () => {
      resolve();
    });
  });
}

async function sleepMs(ms: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function getCommandAndDeviceStatus(
  pg: Pool,
  commandId: string
): Promise<{ commandStatus: string; deviceStatus: string } | null> {
  const row = await pg.query<{ command_status: string; device_status: string }>(
    `
      SELECT
        dc.status AS command_status,
        d.status AS device_status
      FROM device_commands dc
      JOIN devices d ON d.device_id = dc.device_id
      WHERE dc.command_id = $1
    `,
    [commandId]
  );

  if (row.rowCount === 0) return null;
  return {
    commandStatus: row.rows[0]?.command_status ?? "unknown",
    deviceStatus: row.rows[0]?.device_status ?? "unknown"
  };
}

async function main(): Promise<void> {
  dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

  const config = loadConfigFromEnv(process.env);
  const logger = createLogger(config.serviceName);

  const pg = createPgPool(config);

  const repoRoot = repoRootFromHere();
  const schemaPath = path.join(
    repoRoot,
    "docs",
    "integrations",
    "kafka",
    "schemas",
    "device-commands.v1.schema.json"
  );
  const validate = await loadAndCompileSchema<DeviceCommandKafkaV1>(schemaPath);

  const mqttClient = mqtt.connect(config.mqttUrl, {
    ...(config.mqttUsername && config.mqttPassword
      ? { username: config.mqttUsername, password: config.mqttPassword }
      : {})
  });

  mqttClient.on("error", (err) => {
    logger.error({ err }, "mqtt error");
  });

  mqttClient.on("connect", () => {
    logger.info({ mqttUrl: config.mqttUrl }, "mqtt connected");
  });

  const kafka = new Kafka({
    clientId: config.kafkaClientId,
    brokers: config.kafkaBrokers,
    logLevel: logLevel.NOTHING
  });
  const consumer = kafka.consumer({ groupId: config.kafkaGroupId });
  await consumer.connect();
  await consumer.subscribe({ topic: config.kafkaTopicDeviceCommands, fromBeginning: false });

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
          if (!validate.validate(parsed)) {
            logger.warn(
              { traceId, topic: batch.topic, partition: batch.partition, errors: validate.errors },
              "device.commands schema invalid (skipped)"
            );
            ctx.resolveOffset(message.offset);
            continue;
          }

          const cmd: DeviceCommandKafkaV1 = parsed;

          let state = await getCommandAndDeviceStatus(pg, cmd.command_id);
          if (!state) {
            // The API publishes to Kafka inside a DB transaction; a fast consumer may see the Kafka message
            // before the transaction is committed. Retry briefly to avoid dropping valid commands.
            const deadline = Date.now() + 5000;
            while (!state && Date.now() < deadline) {
              await sleepMs(200);
              state = await getCommandAndDeviceStatus(pg, cmd.command_id);
            }

            if (!state) {
              logger.warn({ traceId, commandId: cmd.command_id }, "command not found in postgres after retry (skipped)");
              ctx.resolveOffset(message.offset);
              continue;
            }
          }

          const { commandStatus, deviceStatus } = state;

          if (deviceStatus === "revoked") {
            await pg.query(
              `
                UPDATE device_commands
                SET
                  status = 'canceled',
                  error_message = 'device revoked',
                  updated_at = NOW()
                WHERE command_id = $1 AND status <> 'acked'
              `,
              [cmd.command_id]
            );

            logger.warn({ traceId, commandId: cmd.command_id }, "device revoked; command canceled");
            ctx.resolveOffset(message.offset);
            continue;
          }

          if (commandStatus === "acked" || commandStatus === "canceled") {
            ctx.resolveOffset(message.offset);
            continue;
          }

          const mqttPayload: DeviceCommandMqttV1 = {
            schema_version: 1,
            command_id: cmd.command_id,
            device_id: cmd.device_id,
            command_type: cmd.command_type,
            payload: cmd.payload,
            issued_ts: cmd.issued_ts
          };

          const mqttTopic = `${config.mqttTopicCommandPrefix}${cmd.device_id}`;
          await waitForMqttConnected(mqttClient);
          await mqttPublish(mqttClient, mqttTopic, JSON.stringify(mqttPayload));

          await pg.query(
            `
              UPDATE device_commands
              SET
                status = CASE WHEN status='queued' THEN 'sent' ELSE status END,
                sent_at = COALESCE(sent_at, NOW()),
                updated_at = NOW()
              WHERE command_id = $1
            `,
            [cmd.command_id]
          );

          logger.info({ traceId, commandId: cmd.command_id, mqttTopic }, "command dispatched");
          ctx.resolveOffset(message.offset);
        } catch (err) {
          logger.error({ traceId, err }, "command dispatch failed");
          // Do not resolve offset: allow retry after restart/backoff.
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
    await pg.end();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

void main();
