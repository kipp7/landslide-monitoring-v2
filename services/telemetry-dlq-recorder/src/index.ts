import { createLogger, newTraceId } from "@lsmv2/observability";
import { loadAndCompileSchema } from "@lsmv2/validation";
import dotenv from "dotenv";
import { Kafka, logLevel } from "kafkajs";
import { Pool } from "pg";
import path from "node:path";
import { loadConfigFromEnv } from "./config";

type TelemetryDlqV1 = {
  schema_version: 1;
  reason_code: string;
  reason_detail?: string;
  received_ts: string;
  device_id?: string | null;
  raw_payload: string;
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
  const schemaDlqPath = path.join(repoRoot, "docs", "integrations", "kafka", "schemas", "telemetry-dlq.v1.schema.json");
  const validateDlq = await loadAndCompileSchema<TelemetryDlqV1>(schemaDlqPath);

  const kafka = new Kafka({
    clientId: config.kafkaClientId,
    brokers: config.kafkaBrokers,
    logLevel: logLevel.NOTHING
  });
  const consumer = kafka.consumer({ groupId: config.kafkaGroupId });
  await consumer.connect();
  await consumer.subscribe({ topic: config.kafkaTopicTelemetryDlq, fromBeginning: false });

  const pg = createPgPool(config);

  logger.info({ topic: config.kafkaTopicTelemetryDlq }, "telemetry-dlq-recorder started");

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
          if (!validateDlq.validate(parsed)) {
            logger.warn(
              { traceId, topic: batch.topic, partition: batch.partition, errors: validateDlq.errors },
              "telemetry.dlq schema invalid (skipped)"
            );
            ctx.resolveOffset(message.offset);
            continue;
          }

          const dlq: TelemetryDlqV1 = parsed;

          await pg.query(
            `
              INSERT INTO telemetry_dlq_messages (
                kafka_topic, kafka_partition, kafka_offset, kafka_key,
                received_ts, device_id, reason_code, reason_detail, raw_payload
              ) VALUES (
                $1, $2::int, $3::bigint, $4,
                $5::timestamptz, $6::uuid, $7, $8, $9
              )
              ON CONFLICT (kafka_topic, kafka_partition, kafka_offset) DO NOTHING
            `,
            [
              batch.topic,
              batch.partition,
              message.offset,
              message.key?.toString("utf-8") ?? null,
              dlq.received_ts,
              dlq.device_id ?? null,
              dlq.reason_code,
              dlq.reason_detail ?? null,
              dlq.raw_payload
            ]
          );

          logger.info(
            { traceId, reasonCode: dlq.reason_code, deviceId: dlq.device_id ?? "", receivedTs: dlq.received_ts },
            "telemetry dlq message recorded"
          );

          ctx.resolveOffset(message.offset);
        } catch (err) {
          logger.error({ traceId, err }, "telemetry dlq record failed");
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

