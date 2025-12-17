import { createClient, type ClickHouseClient } from "@clickhouse/client";
import { createLogger, newTraceId } from "@lsmv2/observability";
import { loadAndCompileSchema } from "@lsmv2/validation";
import { Kafka, logLevel } from "kafkajs";
import path from "node:path";
import { loadConfigFromEnv } from "./config";

type TelemetryRawV1 = {
  schema_version: 1;
  device_id: string;
  event_ts?: string | null;
  received_ts: string;
  seq?: number | null;
  metrics: Record<string, number | string | boolean | null>;
  meta?: Record<string, unknown>;
};

type TelemetryRow = {
  received_ts: string;
  event_ts: string | null;
  device_id: string;
  sensor_key: string;
  seq: number | null;
  value_f64: number | null;
  value_i64: number | null;
  value_str: string | null;
  value_bool: number | null;
  quality: number | null;
  schema_version: number;
};

function repoRootFromHere(): string {
  return path.resolve(__dirname, "..", "..", "..");
}

function createClickhouseClient(config: ReturnType<typeof loadConfigFromEnv>): ClickHouseClient {
  return createClient({
    url: config.clickhouseUrl,
    username: config.clickhouseUsername,
    password: config.clickhousePassword ?? ""
  });
}

function isSafeInt64(value: number): boolean {
  return Number.isInteger(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER;
}

function toTelemetryRows(payload: TelemetryRawV1): TelemetryRow[] {
  const rows: TelemetryRow[] = [];

  const eventTs = payload.event_ts ?? null;
  const seq = payload.seq ?? null;
  const schemaVersion = payload.schema_version;

  for (const [sensorKey, metricValue] of Object.entries(payload.metrics)) {
    let valueF64: number | null = null;
    let valueI64: number | null = null;
    let valueStr: string | null = null;
    let valueBool: number | null = null;

    if (typeof metricValue === "number") {
      if (isSafeInt64(metricValue)) valueI64 = metricValue;
      else valueF64 = metricValue;
    } else if (typeof metricValue === "string") {
      valueStr = metricValue;
    } else if (typeof metricValue === "boolean") {
      valueBool = metricValue ? 1 : 0;
    }

    rows.push({
      received_ts: payload.received_ts,
      event_ts: eventTs,
      device_id: payload.device_id,
      sensor_key: sensorKey,
      seq,
      value_f64: valueF64,
      value_i64: valueI64,
      value_str: valueStr,
      value_bool: valueBool,
      quality: null,
      schema_version: schemaVersion
    });
  }

  return rows;
}

async function insertRows(
  ch: ClickHouseClient,
  database: string,
  table: string,
  rows: TelemetryRow[]
): Promise<void> {
  if (rows.length === 0) return;
  await ch.insert({
    table: `${database}.${table}`,
    values: rows,
    format: "JSONEachRow"
  });
}

async function main(): Promise<void> {
  const config = loadConfigFromEnv(process.env);
  const logger = createLogger(config.serviceName);

  const repoRoot = repoRootFromHere();
  const schemaTelemetryRawPath = path.join(
    repoRoot,
    "docs",
    "integrations",
    "kafka",
    "schemas",
    "telemetry-raw.v1.schema.json"
  );
  const validateRaw = await loadAndCompileSchema<TelemetryRawV1>(schemaTelemetryRawPath);

  const kafka = new Kafka({
    clientId: config.kafkaClientId,
    brokers: config.kafkaBrokers,
    logLevel: logLevel.NOTHING
  });
  const consumer = kafka.consumer({ groupId: config.kafkaGroupId });
  await consumer.connect();
  await consumer.subscribe({ topic: config.kafkaTopicTelemetryRaw, fromBeginning: false });

  const ch = createClickhouseClient(config);

  let buffer: TelemetryRow[] = [];
  let flushing = false;

  const flush = async (reason: string) => {
    if (flushing) return;
    if (buffer.length === 0) return;

    flushing = true;
    const batch = buffer;
    buffer = [];

    try {
      await insertRows(ch, config.clickhouseDatabase, config.clickhouseTable, batch);
      logger.info({ reason, rows: batch.length }, "clickhouse insert ok");
    } catch (err) {
      logger.error({ err, reason, rows: batch.length }, "clickhouse insert failed");
      buffer = batch.concat(buffer);
    } finally {
      flushing = false;
    }
  };

  const interval = setInterval(() => {
    void flush("interval");
  }, config.batchFlushIntervalMs);

  await consumer.run({
    eachMessage: async ({ message, topic, partition }) => {
      const traceId = newTraceId();
      const raw = message.value?.toString("utf-8") ?? "";

      try {
        const parsed = JSON.parse(raw) as unknown;
        if (!validateRaw.validate(parsed)) {
          logger.warn(
            { traceId, topic, partition, errors: validateRaw.errors },
            "kafka telemetry.raw schema invalid (skipped)"
          );
          return;
        }

        const payload: TelemetryRawV1 = parsed;
        const rows = toTelemetryRows(payload);
        buffer.push(...rows);

        if (buffer.length >= config.batchMaxRows) {
          await flush("batch_max_rows");
        }
      } catch (err) {
        logger.warn({ traceId, topic, partition, err }, "kafka message parse failed (skipped)");
      }
    }
  });

  const shutdown = async (signal: string) => {
    clearInterval(interval);
    logger.info({ signal }, "shutting down");
    await flush("shutdown");
    await consumer.disconnect();
    await ch.close();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

void main();

