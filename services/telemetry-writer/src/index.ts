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

type TelemetryDlqV1 = {
  schema_version: 1;
  reason_code: string;
  reason_detail?: string;
  received_ts: string;
  device_id?: string | null;
  raw_payload: string;
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

type TelemetryEnvelopeProjection = {
  schema_version: 1;
  device_id: string;
  event_ts?: string | null;
  seq?: number | null;
  metrics: Record<string, number | string | boolean | null>;
  meta?: Record<string, unknown>;
};

type ShadowState = {
  metrics: Record<string, number | string | boolean | null>;
  meta: Record<string, unknown>;
};

const FIELD_PROFILE_METRIC_KEYS = new Set<string>([
  "temperature_c",
  "humidity_pct",
  "accel_x_g",
  "accel_y_g",
  "accel_z_g",
  "gyro_x_dps",
  "gyro_y_dps",
  "gyro_z_dps",
  "tilt_x_deg",
  "tilt_y_deg",
  "gps_latitude",
  "gps_longitude",
  "gps_altitude",
  "battery_pct",
  "battery_v",
  "warning_flag",
  "rainfall_mm",
  "rainfall_intensity_mm_h",
  "soil_moisture_pct",
  "illumination",
  "rssi_dbm",
  "snr_db",
  "packet_loss_pct",
  "displacement_mm",
  "vibration_g"
]);

const FIELD_PROFILE_META_KEYS = new Set<string>([
  "_writer",
  "install_label",
  "legacy_node",
  "uptime_s",
  "upload_trigger",
  "legacy_valid_flags",
  "last_command_type",
  "last_command_id",
  "last_command_uptime_s",
  "sampling_s",
  "report_interval_s",
  "fw",
  "power_mode",
  "packet_class",
  "gateway_received_ts",
  "replay_kind",
  "replay_source",
  "time_jump_ms"
]);

const FIELD_PROFILE_IDENTITY_META_KEYS = ["install_label", "legacy_node", "upload_trigger", "last_command_id", "last_command_type"];

function repoRootFromHere(): string {
  return path.resolve(__dirname, "..", "..", "..");
}

function isoNow(): string {
  return new Date().toISOString();
}

const uuidV4ishRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

function createClickhouseClient(config: ReturnType<typeof loadConfigFromEnv>): ClickHouseClient {
  return createClient({
    url: config.clickhouseUrl,
    username: config.clickhouseUsername,
    password: config.clickhousePassword ?? ""
  });
}

function extractDeviceIdOrNull(parsed: unknown): string | null {
  if (!parsed || typeof parsed !== "object") return null;
  const v = (parsed as { device_id?: unknown }).device_id;
  if (typeof v !== "string") return null;
  return uuidV4ishRegex.test(v) ? v : null;
}

function extractReceivedTsOrNow(parsed: unknown): string {
  if (!parsed || typeof parsed !== "object") return isoNow();
  const v = (parsed as { received_ts?: unknown }).received_ts;
  if (typeof v !== "string") return isoNow();
  const t = Date.parse(v);
  return Number.isFinite(t) ? new Date(t).toISOString() : isoNow();
}

function truncateUtf8(value: string, maxBytes: number): { value: string; truncated: boolean } {
  if (maxBytes <= 0) return { value: "", truncated: value.length > 0 };
  const bytes = Buffer.byteLength(value, "utf8");
  if (bytes <= maxBytes) return { value, truncated: false };

  const buf = Buffer.from(value, "utf8");
  const slice = buf.subarray(0, maxBytes);
  return { value: slice.toString("utf8"), truncated: true };
}

function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

function isProbablyTransientClickhouseError(err: unknown): boolean {
  const msg = describeError(err);
  return /(ECONNREFUSED|ETIMEDOUT|EHOSTUNREACH|ENOTFOUND|socket hang up|fetch failed)/i.test(msg);
}

type ClickhouseUnavailableError = Error & { code: "CLICKHOUSE_UNAVAILABLE"; cause?: unknown };

function isClickhouseUnavailableError(err: unknown): err is ClickhouseUnavailableError {
  if (!(err instanceof Error)) return false;
  const code = (err as unknown as { code?: unknown }).code;
  return code === "CLICKHOUSE_UNAVAILABLE";
}

function isProbablyClickhouseDataError(err: unknown): boolean {
  if (isProbablyTransientClickhouseError(err)) return false;
  const msg = describeError(err);
  return /(Cannot parse|Type mismatch|Unknown (identifier|field|function)|No such (column|table)|DB::Exception)/i.test(
    msg
  );
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

function toEnvelopeProjection(payload: TelemetryRawV1): TelemetryEnvelopeProjection {
  return {
    schema_version: payload.schema_version,
    device_id: payload.device_id,
    ...(payload.event_ts !== undefined ? { event_ts: payload.event_ts ?? null } : {}),
    ...(payload.seq !== undefined ? { seq: payload.seq ?? null } : {}),
    metrics: payload.metrics,
    ...(payload.meta ? { meta: payload.meta } : {})
  };
}

function getSemanticPayloadBytes(payload: TelemetryRawV1): number {
  return Buffer.byteLength(JSON.stringify(toEnvelopeProjection(payload)), "utf8");
}

function getPacketClass(payload: TelemetryRawV1): string | null {
  const meta = payload.meta;
  if (!meta || typeof meta !== "object") return null;
  const packetClass = meta.packet_class;
  if (typeof packetClass !== "string") return null;
  const trimmed = packetClass.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isHighFrequencyPacket(payload: TelemetryRawV1): boolean {
  const packetClass = getPacketClass(payload);
  return packetClass?.toLowerCase().startsWith("hf_") ?? false;
}

function normalizeShadowState(state: unknown): ShadowState {
  if (!state || typeof state !== "object") {
    return { metrics: {}, meta: {} };
  }

  const obj = state as { metrics?: unknown; meta?: unknown };
  const metrics =
    obj.metrics && typeof obj.metrics === "object"
      ? ({ ...(obj.metrics as Record<string, number | string | boolean | null>) } as Record<string, number | string | boolean | null>)
      : {};
  const meta = obj.meta && typeof obj.meta === "object" ? { ...(obj.meta as Record<string, unknown>) } : {};
  return { metrics, meta };
}

function sanitizeRecordByAllowedKeys<TValue>(
  input: Record<string, TValue>,
  allowedKeys: ReadonlySet<string>
): Record<string, TValue> {
  const output: Record<string, TValue> = {};
  for (const [key, value] of Object.entries(input)) {
    if (allowedKeys.has(key)) {
      output[key] = value;
    }
  }
  return output;
}

function isFieldProfileMetaRecord(meta: Record<string, unknown> | null | undefined): boolean {
  if (!meta) return false;
  return FIELD_PROFILE_IDENTITY_META_KEYS.some((key) => key in meta);
}

function sanitizeFieldProfileShadowState(state: ShadowState): ShadowState {
  return {
    metrics: sanitizeRecordByAllowedKeys(state.metrics, FIELD_PROFILE_METRIC_KEYS),
    meta: sanitizeRecordByAllowedKeys(state.meta, FIELD_PROFILE_META_KEYS)
  };
}

function toFiniteNumberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function getShadowMetaNumber(state: ShadowState | null | undefined, key: string): number | null {
  if (!state) return null;
  return toFiniteNumberOrNull(state.meta[key]);
}

function getPayloadMetaNumber(payload: TelemetryRawV1, key: string): number | null {
  if (!payload.meta || typeof payload.meta !== "object") return null;
  return toFiniteNumberOrNull(payload.meta[key]);
}

function shouldAcceptSeqAfterUptimeRollback(
  payload: TelemetryRawV1,
  latestSeq: number,
  previousShadowState: ShadowState | null | undefined
): { accept: boolean; previousUptimeS: number | null; nextUptimeS: number | null } {
  const previousUptimeS = getShadowMetaNumber(previousShadowState, "uptime_s");
  const nextUptimeS = getPayloadMetaNumber(payload, "uptime_s");
  return {
    accept:
      previousUptimeS != null &&
      nextUptimeS != null &&
      payload.seq != null &&
      payload.seq <= latestSeq &&
      nextUptimeS < previousUptimeS,
    previousUptimeS,
    nextUptimeS
  };
}

function buildShadowState(payload: TelemetryRawV1, previousState: unknown): ShadowState {
  const previousRaw = normalizeShadowState(previousState);
  const payloadMeta = payload.meta && typeof payload.meta === "object" ? payload.meta : {};
  const useFieldProfileSanitizer =
    isFieldProfileMetaRecord(payloadMeta) || isFieldProfileMetaRecord(previousRaw.meta);
  const previous = useFieldProfileSanitizer ? sanitizeFieldProfileShadowState(previousRaw) : previousRaw;
  const nextMetrics = useFieldProfileSanitizer
    ? sanitizeRecordByAllowedKeys(payload.metrics, FIELD_PROFILE_METRIC_KEYS)
    : payload.metrics;
  const nextPayloadMeta = useFieldProfileSanitizer
    ? sanitizeRecordByAllowedKeys(payloadMeta, FIELD_PROFILE_META_KEYS)
    : payloadMeta;
  const meta: Record<string, unknown> = {
    ...previous.meta,
    ...nextPayloadMeta
  };

  const writerMeta: Record<string, unknown> =
    meta._writer && typeof meta._writer === "object" ? { ...(meta._writer as Record<string, unknown>) } : {};

  if (payload.seq != null) writerMeta.last_seq = payload.seq;
  writerMeta.last_received_ts = payload.received_ts;
  meta._writer = writerMeta;

  return {
    metrics: {
      ...previous.metrics,
      ...nextMetrics
    },
    meta
  };
}

async function getLatestShadowSeq(pool: Pool, deviceId: string): Promise<number | null> {
  const row = await pool.query<{ last_seq: string | null }>(
    `
      SELECT state #>> '{meta,_writer,last_seq}' AS last_seq
      FROM device_state
      WHERE device_id = $1
    `,
    [deviceId]
  );
  const value = row.rows[0]?.last_seq ?? null;
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function getLatestShadowState(pool: Pool, deviceId: string): Promise<ShadowState | null> {
  const row = await pool.query<{ state: unknown }>(
    `
      SELECT state
      FROM device_state
      WHERE device_id = $1
    `,
    [deviceId]
  );
  if (row.rowCount === 0) return null;
  return normalizeShadowState(row.rows[0]?.state);
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
      const isTransient = isProbablyTransientClickhouseError(err);
      if (attempt >= config.clickhouseInsertMaxRetries) {
        logger.error({ err, reason, rows: rows.length, attempt, isTransient }, "clickhouse insert failed (giving up)");
        if (isTransient) {
          const e = new Error("ClickHouse temporarily unavailable") as ClickhouseUnavailableError;
          e.code = "CLICKHOUSE_UNAVAILABLE";
          e.cause = err;
          throw e;
        }
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
  const schemaTelemetryDlqPath = path.join(
    repoRoot,
    "docs",
    "integrations",
    "kafka",
    "schemas",
    "telemetry-dlq.v1.schema.json"
  );
  const validateRaw = await loadAndCompileSchema<TelemetryRawV1>(schemaTelemetryRawPath);
  const validateDlq = await loadAndCompileSchema<TelemetryDlqV1>(schemaTelemetryDlqPath);

  const kafka = new Kafka({
    clientId: config.kafkaClientId,
    brokers: config.kafkaBrokers,
    logLevel: logLevel.NOTHING
  });
  const consumer = kafka.consumer({ groupId: config.kafkaGroupId });
  const producer = kafka.producer();
  await consumer.connect();
  await producer.connect();
  await consumer.subscribe({ topic: config.kafkaTopicTelemetryRaw, fromBeginning: false });

  const ch = createClickhouseClient(config);
  const pg = createPostgresPoolIfConfigured(config);
  if (!pg) {
    logger.warn(
      { postgresHost: config.postgresHost, postgresDatabase: config.postgresDatabase },
      "PostgreSQL device_state shadow disabled (missing POSTGRES_URL or POSTGRES_PASSWORD)"
    );
  }

  const stats = {
    startedAtMs: Date.now(),
    kafkaMessagesOk: 0,
    kafkaMessagesSkipped: 0,
    dlqPublished: 0,
    clickhouseInsertBatchesOk: 0,
    clickhouseInsertBatchesIsolated: 0,
    clickhouseInsertMessagesFailed: 0
  };

  let consecutiveClickhouseUnavailable = 0;

  const publishDlq = async (dlq: TelemetryDlqV1) => {
    const trunc = truncateUtf8(dlq.raw_payload, config.dlqRawPayloadMaxBytes);
    const normalized: TelemetryDlqV1 = {
      ...dlq,
      raw_payload: trunc.value,
      ...(trunc.truncated
        ? {
            reason_detail: dlq.reason_detail
              ? `${dlq.reason_detail} (raw_payload truncated)`
              : "raw_payload truncated"
          }
        : {})
    };

    if (!validateDlq.validate(normalized)) {
      logger.error({ errors: validateDlq.errors, dlq: normalized }, "dlq payload does not match schema (BUG)");
      throw new Error("dlq payload does not match schema");
    }

    await producer.send({
      topic: config.kafkaTopicTelemetryDlq,
      messages: [{ key: normalized.device_id ?? null, value: JSON.stringify(normalized) }]
    });
    stats.dlqPublished += 1;
  };

  const statsTimer = setInterval(() => {
    logger.info(
      {
        uptimeS: Math.floor((Date.now() - stats.startedAtMs) / 1000),
        ...stats
      },
      "writer stats"
    );
  }, config.statsLogIntervalMs);
  statsTimer.unref();

  await consumer.run({
    autoCommit: false,
    eachBatchAutoResolve: false,
    eachBatch: async (ctx) => {
      const { batch } = ctx;
      if (!ctx.isRunning() || ctx.isStale()) return;

      type PendingMessage = {
        offset: string;
        raw: string;
        payload: TelemetryRawV1;
        rows: TelemetryRow[];
      };

      const pending: PendingMessage[] = [];
      let pendingRowsCount = 0;
      let lastFlushAt = Date.now();
      const deviceStateByDeviceId = new Map<string, { updatedAtIso: string; state: unknown }>();
      const latestSeqByDeviceId = new Map<string, number | null>();
      const latestShadowStateByDeviceId = new Map<string, ShadowState | null>();

      const flush = async (reason: string) => {
        if (pending.length === 0) return;

        const allRows = pending.flatMap((p) => p.rows);
        const startedAt = Date.now();
        try {
          await insertWithRetry(ch, config, logger, reason, allRows);
          stats.clickhouseInsertBatchesOk += 1;
          consecutiveClickhouseUnavailable = 0;
          logger.info(
            { reason, rows: allRows.length, messages: pending.length, tookMs: Date.now() - startedAt },
            "clickhouse insert ok"
          );

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

          for (const p of pending) ctx.resolveOffset(p.offset);
          pending.length = 0;
          deviceStateByDeviceId.clear();
          latestSeqByDeviceId.clear();
          latestShadowStateByDeviceId.clear();
          await ctx.commitOffsetsIfNecessary();
          return;
        } catch (err) {
          if (isClickhouseUnavailableError(err)) {
            consecutiveClickhouseUnavailable += 1;
            const exp = Math.min(8, Math.max(0, consecutiveClickhouseUnavailable - 1));
            const cooldown = Math.min(
              config.clickhouseUnavailableCooldownMaxMs,
              config.clickhouseUnavailableCooldownMs * Math.pow(2, exp)
            );
            logger.warn(
              { reason, attemptWindow: consecutiveClickhouseUnavailable, cooldownMs: cooldown, err: err.cause ?? err },
              "clickhouse unavailable; entering cooldown"
            );
            await sleep(cooldown);
            throw err;
          }
          if (!isProbablyClickhouseDataError(err)) throw err;

          logger.warn(
            { err, reason, messages: pending.length, rows: allRows.length },
            "clickhouse insert failed (data error suspected); isolating per-message"
          );
          stats.clickhouseInsertBatchesIsolated += 1;

          const shadowUpdates = new Map<string, { updatedAtIso: string; state: unknown }>();

          for (const p of pending) {
            if (!ctx.isRunning() || ctx.isStale()) break;
            await ctx.heartbeat();

            try {
              await insertRows(ch, config.clickhouseDatabase, config.clickhouseTable, p.rows);

              const updatedAtIso = new Date(p.payload.received_ts).toISOString();
              shadowUpdates.set(p.payload.device_id, {
                updatedAtIso,
                state: buildShadowState(p.payload, latestShadowStateByDeviceId.get(p.payload.device_id))
              });

              ctx.resolveOffset(p.offset);
            } catch (err2) {
              if (!isProbablyClickhouseDataError(err2)) throw err2;

              const detail = describeError(err2);
              await publishDlq({
                schema_version: 1,
                reason_code: "writer_clickhouse_insert_failed",
                reason_detail: detail,
                received_ts: p.payload.received_ts,
                device_id: p.payload.device_id,
                raw_payload: p.raw
              });
              stats.clickhouseInsertMessagesFailed += 1;
              logger.warn(
                { reason, deviceId: p.payload.device_id, detail },
                "message sent to telemetry.dlq.v1 due to clickhouse insert failure"
              );
              ctx.resolveOffset(p.offset);
            }
          }

          if (pg && shadowUpdates.size > 0) {
            try {
              for (const [deviceId, v] of shadowUpdates.entries()) {
                await upsertDeviceStateShadow(pg, deviceId, v.updatedAtIso, v.state);
              }
            } catch (err3) {
              logger.error({ err: err3, reason, devices: shadowUpdates.size }, "device_state shadow update failed (ignored)");
            }
          }

          pending.length = 0;
          deviceStateByDeviceId.clear();
          latestSeqByDeviceId.clear();
          latestShadowStateByDeviceId.clear();
          await ctx.commitOffsetsIfNecessary();
          return;
        }
      };

      try {
        for (const message of batch.messages) {
          if (!ctx.isRunning() || ctx.isStale()) break;
          await ctx.heartbeat();

        const traceId = newTraceId();
        const raw = message.value?.toString("utf-8") ?? "";
        const rawBytes = Buffer.byteLength(raw, "utf8");

        if (rawBytes > config.messageMaxBytes) {
          await publishDlq({
            schema_version: 1,
            reason_code: "writer_message_too_large",
            reason_detail:
              "message size " +
              String(rawBytes) +
              " exceeds MESSAGE_MAX_BYTES=" +
              String(config.messageMaxBytes),
            received_ts: isoNow(),
            device_id: null,
            raw_payload: raw
          });
          logger.warn({ traceId, topic: batch.topic, partition: batch.partition, rawBytes }, "kafka message too large (dlq)");
          ctx.resolveOffset(message.offset);
          stats.kafkaMessagesSkipped += 1;
          continue;
        }

        try {
          const parsed = JSON.parse(raw) as unknown;
          if (!validateRaw.validate(parsed)) {
            await publishDlq({
              schema_version: 1,
              reason_code: "writer_schema_validation_failed",
              reason_detail: "Kafka telemetry.raw schema validation failed",
              received_ts: extractReceivedTsOrNow(parsed),
              device_id: extractDeviceIdOrNull(parsed),
              raw_payload: raw
            });
            logger.warn({ traceId, topic: batch.topic, partition: batch.partition, errors: validateRaw.errors }, "kafka telemetry.raw schema invalid (dlq)");
            ctx.resolveOffset(message.offset);
            stats.kafkaMessagesSkipped += 1;
            continue;
          }

          const payload: TelemetryRawV1 = parsed;
          if (pg && !latestShadowStateByDeviceId.has(payload.device_id)) {
            latestShadowStateByDeviceId.set(payload.device_id, await getLatestShadowState(pg, payload.device_id));
          }

          if (payload.seq != null) {
            let latestSeq: number | null = null;
            if (latestSeqByDeviceId.has(payload.device_id)) {
              latestSeq = latestSeqByDeviceId.get(payload.device_id) ?? null;
            } else if (pg) {
              latestSeq = await getLatestShadowSeq(pg, payload.device_id);
              latestSeqByDeviceId.set(payload.device_id, latestSeq);
            }

            if (latestSeq != null && payload.seq <= latestSeq) {
              const seqResetDecision = shouldAcceptSeqAfterUptimeRollback(
                payload,
                latestSeq,
                latestShadowStateByDeviceId.get(payload.device_id)
              );
              if (seqResetDecision.accept) {
                logger.info(
                  {
                    traceId,
                    topic: batch.topic,
                    partition: batch.partition,
                    deviceId: payload.device_id,
                    seq: payload.seq,
                    latestSeq,
                    previousUptimeS: seqResetDecision.previousUptimeS,
                    nextUptimeS: seqResetDecision.nextUptimeS
                  },
                  "telemetry seq rollback accepted after uptime rollback"
                );
              } else {
                const reasonCode = payload.seq === latestSeq ? "duplicate_seq" : "stale_seq";
                await publishDlq({
                  schema_version: 1,
                  reason_code: reasonCode,
                  reason_detail:
                    "device_id=" +
                    payload.device_id +
                    " seq=" +
                    String(payload.seq) +
                    " is not newer than latest_seq=" +
                    String(latestSeq),
                  received_ts: payload.received_ts,
                  device_id: payload.device_id,
                  raw_payload: raw
                });
                logger.warn(
                  {
                    traceId,
                    topic: batch.topic,
                    partition: batch.partition,
                    deviceId: payload.device_id,
                    seq: payload.seq,
                    latestSeq,
                    reasonCode
                  },
                  "telemetry seq rejected before persistence (dlq)"
                );
                ctx.resolveOffset(message.offset);
                stats.kafkaMessagesSkipped += 1;
                continue;
              }
            }

            latestSeqByDeviceId.set(payload.device_id, payload.seq);
          }
          const semanticBytes = getSemanticPayloadBytes(payload);
          const packetClass = getPacketClass(payload);
          if (isHighFrequencyPacket(payload) && semanticBytes > config.highFrequencyBudgetBytes) {
            await publishDlq({
              schema_version: 1,
              reason_code: "high_frequency_budget_exceeded",
              reason_detail:
                "packet_class=" +
                String(packetClass) +
                " semantic_bytes=" +
                String(semanticBytes) +
                " exceeds HIGH_FREQUENCY_BUDGET_BYTES=" +
                String(config.highFrequencyBudgetBytes),
              received_ts: payload.received_ts,
              device_id: payload.device_id,
              raw_payload: raw
            });
            logger.warn(
              {
                traceId,
                topic: batch.topic,
                partition: batch.partition,
                deviceId: payload.device_id,
                packetClass,
                semanticBytes,
                limitBytes: config.highFrequencyBudgetBytes
              },
              "high-frequency packet exceeded semantic budget (dlq)"
            );
            ctx.resolveOffset(message.offset);
            stats.kafkaMessagesSkipped += 1;
            continue;
          }
          const messageRows = toTelemetryRows(payload);
          if (messageRows.length > 0) {
            pending.push({ offset: message.offset, raw, payload, rows: messageRows });
            pendingRowsCount += messageRows.length;

            const updatedAtIso = new Date(payload.received_ts).toISOString();
            const existing = deviceStateByDeviceId.get(payload.device_id);
            if (!existing || existing.updatedAtIso <= updatedAtIso) {
              const previousState = existing
                ? normalizeShadowState(existing.state)
                : latestShadowStateByDeviceId.get(payload.device_id);
              const nextState = buildShadowState(payload, previousState);
              deviceStateByDeviceId.set(payload.device_id, {
                updatedAtIso,
                state: nextState
              });
              latestShadowStateByDeviceId.set(payload.device_id, nextState);
            }
            stats.kafkaMessagesOk += 1;
          } else {
            ctx.resolveOffset(message.offset);
            stats.kafkaMessagesSkipped += 1;
          }

          if (pendingRowsCount >= config.batchMaxRows) {
            await flush("batch_max_rows");
            pendingRowsCount = 0;
            lastFlushAt = Date.now();
          } else if (pending.length >= config.batchMaxMessages) {
            await flush("batch_max_messages");
            pendingRowsCount = 0;
            lastFlushAt = Date.now();
          } else if (Date.now() - lastFlushAt >= config.batchFlushIntervalMs) {
            await flush("interval");
            pendingRowsCount = 0;
            lastFlushAt = Date.now();
          }
          } catch (err) {
            await publishDlq({
              schema_version: 1,
              reason_code: "writer_invalid_json",
              reason_detail: describeError(err),
              received_ts: isoNow(),
              device_id: null,
              raw_payload: raw
            });
            logger.warn({ traceId, topic: batch.topic, partition: batch.partition, err }, "kafka message parse failed (dlq)");
            ctx.resolveOffset(message.offset);
            stats.kafkaMessagesSkipped += 1;
          }
        }

        await flush("batch_end");
        pendingRowsCount = 0;
        await ctx.heartbeat();
        await ctx.commitOffsetsIfNecessary();
      } catch (err) {
        if (isClickhouseUnavailableError(err)) {
          // cooldown already applied; do not resolve offsets so we can retry later
          return;
        }
        throw err;
      }
    }
  });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "shutting down");
    clearInterval(statsTimer);
    await consumer.disconnect();
    await producer.disconnect();
    await ch.close();
    await pg?.end();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

void main();
