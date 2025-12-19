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

          await pg.query(
            `
              INSERT INTO device_command_events (
                event_id, event_type, command_id, device_id, status, detail, result, created_at
              ) VALUES (
                $1::uuid, $2, $3::uuid, $4::uuid, $5, $6, $7::jsonb, $8::timestamptz
              )
              ON CONFLICT (event_id) DO NOTHING
            `,
            [
              ev.event_id,
              ev.event_type,
              ev.command_id,
              ev.device_id,
              ev.status,
              ev.detail ?? null,
              JSON.stringify(ev.result ?? {}),
              ev.created_ts
            ]
          );

          logger.info(
            { traceId, eventType: ev.event_type, commandId: ev.command_id, deviceId: ev.device_id, status: ev.status },
            "command event recorded"
          );

          ctx.resolveOffset(message.offset);
        } catch (err) {
          logger.error({ traceId, err }, "command event record failed");
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

