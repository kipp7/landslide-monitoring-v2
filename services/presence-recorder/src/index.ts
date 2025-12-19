import { createLogger, newTraceId } from "@lsmv2/observability";
import { loadAndCompileSchema } from "@lsmv2/validation";
import dotenv from "dotenv";
import { Kafka, logLevel } from "kafkajs";
import path from "node:path";
import { Pool } from "pg";
import { loadConfigFromEnv } from "./config";

type PresenceEventsV1 = {
  schema_version: 1;
  device_id: string;
  event_ts: string;
  status: "online" | "offline";
  meta?: Record<string, unknown>;
  received_ts: string;
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
  const schemaPath = path.join(repoRoot, "docs", "integrations", "kafka", "schemas", "presence-events.v1.schema.json");
  const validatePresence = await loadAndCompileSchema<PresenceEventsV1>(schemaPath);

  const kafka = new Kafka({
    clientId: config.kafkaClientId,
    brokers: config.kafkaBrokers,
    logLevel: logLevel.NOTHING
  });
  const consumer = kafka.consumer({ groupId: config.kafkaGroupId });
  await consumer.connect();
  await consumer.subscribe({ topic: config.kafkaTopicPresenceEvents, fromBeginning: false });

  const pg = createPgPool(config);

  logger.info({ topic: config.kafkaTopicPresenceEvents }, "presence-recorder started");

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
          if (!validatePresence.validate(parsed)) {
            logger.warn(
              { traceId, topic: batch.topic, partition: batch.partition, errors: validatePresence.errors },
              "presence.events schema invalid (skipped)"
            );
            ctx.resolveOffset(message.offset);
            continue;
          }

          const p: PresenceEventsV1 = parsed;

          await pg.query(
            `
              INSERT INTO device_presence (device_id, status, event_ts, received_ts, meta)
              VALUES ($1::uuid, $2, $3::timestamptz, $4::timestamptz, $5::jsonb)
              ON CONFLICT (device_id) DO UPDATE SET
                status = EXCLUDED.status,
                event_ts = EXCLUDED.event_ts,
                received_ts = EXCLUDED.received_ts,
                meta = EXCLUDED.meta,
                updated_at = NOW()
            `,
            [p.device_id, p.status, p.event_ts, p.received_ts, JSON.stringify(p.meta ?? {})]
          );

          logger.info({ traceId, deviceId: p.device_id, status: p.status }, "presence recorded");
          ctx.resolveOffset(message.offset);
        } catch (err) {
          logger.error({ traceId, err }, "presence record failed");
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

