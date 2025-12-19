import { createClient, type ClickHouseClient } from "@clickhouse/client";
import { createLogger, newTraceId } from "@lsmv2/observability";
import { loadAndCompileSchema } from "@lsmv2/validation";
import dotenv from "dotenv";
import { Kafka, logLevel } from "kafkajs";
import { Pool } from "pg";
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

function toClickhouseDateTime64Utc(value: string): string {
  // ClickHouse DateTime64 text format: "YYYY-MM-DD HH:MM:SS.mmm" (no trailing "Z", no "T")
  // We normalize through Date to ensure UTC and keep millisecond precision.
  const iso = new Date(value).toISOString(); // always ends with 'Z'
  return iso.replace("T", " ").replace("Z", "");
}

function toTelemetryRows(payload: TelemetryRawV1): TelemetryRow[] {
  const rows: TelemetryRow[] = [];

  const receivedTs = toClickhouseDateTime64Utc(payload.received_ts);
  const eventTs = payload.event_ts ? toClickhouseDateTime64Utc(payload.event_ts) : null;
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
      received_ts: receivedTs,
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

function createPostgresPoolIfConfigured(
  config: ReturnType<typeof loadConfigFromEnv>
): Pool | null {
  if (config.postgresUrl) {
    return new Pool({ connectionString: config.postgresUrl, max: config.postgresPoolMax });
  }
  if (!config.postgresPassword) return null;
  return new Pool({
    host: config.postgresHost,
    port: config.postgresPort,
    user: config.postgresUser,
    password: config.postgresPassword,
    database: config.postgresDatabase,
    max: config.postgresPoolMax
  });
}

async function upsertDeviceStateShadow(
  pool: Pool,
  deviceId: string,
  updatedAtIso: string,
  state: unknown
): Promise<void> {
  await pool.query(
    `
      INSERT INTO device_state (device_id, version, state, updated_at)
      VALUES ($1, 1, $2::jsonb, $3::timestamptz)
      ON CONFLICT (device_id) DO UPDATE
      SET
        version = device_state.version + 1,
        state = EXCLUDED.state,
        updated_at = EXCLUDED.updated_at
      WHERE EXCLUDED.updated_at >= device_state.updated_at
    `,
    [deviceId, JSON.stringify(state), updatedAtIso]
  );
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function insertWithRetry(
  ch: ClickHouseClient,
  config: ReturnType<typeof loadConfigFromEnv>,
  logger: ReturnType<typeof createLogger>,
  reason: string,
  rows: TelemetryRow[]
): Promise<void> {
  let attempt = 0;
  for (;;) {
    attempt += 1;
    try {
      await insertRows(ch, config.clickhouseDatabase, config.clickhouseTable, rows);
      return;
    } catch (err) {
      if (attempt >= config.clickhouseInsertMaxRetries) {
        logger.error({ err, reason, rows: rows.length, attempt }, "clickhouse insert failed (giving up)");
        throw err;
      }
      const backoff = Math.min(
        config.clickhouseInsertBackoffMaxMs,
        config.clickhouseInsertBackoffMs * attempt
      );
      logger.error({ err, reason, rows: rows.length, attempt, backoffMs: backoff }, "clickhouse insert failed (retry)");
      await sleep(backoff);
    }
  }
}

async function main(): Promise<void> {
  dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

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
  const pg = createPostgresPoolIfConfigured(config);
  if (!pg) {
    logger.warn(
      { postgresHost: config.postgresHost, postgresDatabase: config.postgresDatabase },
      "PostgreSQL device_state shadow disabled (missing POSTGRES_URL or POSTGRES_PASSWORD)"
    );
  }

  await consumer.run({
    autoCommit: false,
    eachBatchAutoResolve: false,
    eachBatch: async (ctx) => {
      const { batch } = ctx;
      if (!ctx.isRunning() || ctx.isStale()) return;

      const pendingOffsets: string[] = [];
      let rows: TelemetryRow[] = [];
      let lastFlushAt = Date.now();
      const deviceStateByDeviceId = new Map<string, { updatedAtIso: string; state: unknown }>();

      const flush = async (reason: string) => {
        if (rows.length === 0) return;
        const startedAt = Date.now();

        await insertWithRetry(ch, config, logger, reason, rows);
        logger.info({ reason, rows: rows.length, tookMs: Date.now() - startedAt }, "clickhouse insert ok");

        if (pg && deviceStateByDeviceId.size > 0) {
          try {
            for (const [deviceId, v] of deviceStateByDeviceId.entries()) {
              await upsertDeviceStateShadow(pg, deviceId, v.updatedAtIso, v.state);
            }
          } catch (err) {
            logger.error(
              { err, reason, devices: deviceStateByDeviceId.size },
              "device_state shadow update failed (ignored)"
            );
          }
        }

        for (const off of pendingOffsets) ctx.resolveOffset(off);
        pendingOffsets.length = 0;
        rows = [];
        deviceStateByDeviceId.clear();
        await ctx.commitOffsetsIfNecessary();
      };

      for (const message of batch.messages) {
        if (!ctx.isRunning() || ctx.isStale()) break;
        await ctx.heartbeat();

        const traceId = newTraceId();
        const raw = message.value?.toString("utf-8") ?? "";

        try {
          const parsed = JSON.parse(raw) as unknown;
          if (!validateRaw.validate(parsed)) {
            logger.warn(
              { traceId, topic: batch.topic, partition: batch.partition, errors: validateRaw.errors },
              "kafka telemetry.raw schema invalid (skipped)"
            );
            ctx.resolveOffset(message.offset);
            continue;
          }

          const payload: TelemetryRawV1 = parsed;
          const messageRows = toTelemetryRows(payload);
          if (messageRows.length > 0) {
            rows.push(...messageRows);
            pendingOffsets.push(message.offset);

            const updatedAtIso = new Date(payload.received_ts).toISOString();
            const existing = deviceStateByDeviceId.get(payload.device_id);
            if (!existing || existing.updatedAtIso <= updatedAtIso) {
              deviceStateByDeviceId.set(payload.device_id, {
                updatedAtIso,
                state: { metrics: payload.metrics, meta: payload.meta ?? {} }
              });
            }
          } else {
            ctx.resolveOffset(message.offset);
          }

          if (rows.length >= config.batchMaxRows) {
            await flush("batch_max_rows");
            lastFlushAt = Date.now();
          } else if (Date.now() - lastFlushAt >= config.batchFlushIntervalMs) {
            await flush("interval");
            lastFlushAt = Date.now();
          }
        } catch (err) {
          logger.warn(
            { traceId, topic: batch.topic, partition: batch.partition, err },
            "kafka message parse failed (skipped)"
          );
          ctx.resolveOffset(message.offset);
        }
      }

      await flush("batch_end");
      await ctx.heartbeat();
      await ctx.commitOffsetsIfNecessary();
    }
  });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "shutting down");
    await consumer.disconnect();
    await ch.close();
    await pg?.end();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

void main();
