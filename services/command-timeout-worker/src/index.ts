import { createLogger } from "@lsmv2/observability";
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  const producer = kafka.producer();
  await producer.connect();

  const pg = createPgPool(config);

  const publishEvent = async (event: DeviceCommandEventV1) => {
    if (!validateEvent.validate(event)) {
      logger.error({ errors: validateEvent.errors, event }, "device.command_events schema invalid (BUG)");
      return;
    }
    await producer.send({
      topic: config.kafkaTopicDeviceCommandEvents,
      messages: [{ key: event.device_id, value: JSON.stringify(event) }]
    });
  };

  logger.info(
    {
      timeoutSeconds: config.commandAckTimeoutSeconds,
      scanIntervalMs: config.scanIntervalMs,
      scanLimit: config.scanLimit
    },
    "command-timeout-worker started"
  );

  for (;;) {
    const startedAt = Date.now();
    try {
      const res = await pg.query<{
        command_id: string;
        device_id: string;
        sent_at: string;
      }>(
        `
          SELECT command_id, device_id, sent_at
          FROM device_commands
          WHERE
            status = 'sent'
            AND sent_at IS NOT NULL
            AND sent_at <= NOW() - ($1::int || ' seconds')::interval
          ORDER BY sent_at ASC
          LIMIT $2
        `,
        [config.commandAckTimeoutSeconds, config.scanLimit]
      );

      let changed = 0;
      for (const row of res.rows) {
        const upd = await pg.query(
          `
            UPDATE device_commands
            SET
              status = 'timeout',
              error_message = $3,
              updated_at = NOW()
            WHERE command_id = $1 AND device_id = $2 AND status = 'sent'
          `,
          [
            row.command_id,
            row.device_id,
            "ack timeout after " + String(config.commandAckTimeoutSeconds) + "s"
          ]
        );
        if ((upd.rowCount ?? 0) === 0) continue;
        changed += 1;

        await publishEvent({
          schema_version: 1,
          event_id: crypto.randomUUID(),
          event_type: "COMMAND_TIMEOUT",
          created_ts: new Date().toISOString(),
          command_id: row.command_id,
          device_id: row.device_id,
          status: "timeout",
          detail: "ack timeout after " + String(config.commandAckTimeoutSeconds) + "s",
          result: {}
        });
      }

      logger.info({ scanned: res.rowCount ?? 0, timedOut: changed, tookMs: Date.now() - startedAt }, "timeout scan ok");
    } catch (err) {
      logger.error({ err }, "timeout scan failed");
    }

    const sleepFor = Math.max(0, config.scanIntervalMs - (Date.now() - startedAt));
    await sleep(sleepFor);
  }
}

void main();
