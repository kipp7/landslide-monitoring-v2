import { createClient, type ClickHouseClient } from "@clickhouse/client";
import { createLogger, newTraceId } from "@lsmv2/observability";
import { loadAndCompileSchema } from "@lsmv2/validation";
import dotenv from "dotenv";
import { Kafka, logLevel } from "kafkajs";
import { Pool } from "pg";
import path from "node:path";
import { loadConfigFromEnv } from "./config";
import { mergeFieldProfileMetrics, sanitizeFieldProfileMetrics } from "./field-profile-shadow";
import { commitResolvedOffsets } from "./kafka-offsets";
import { evaluateSequenceReset, shouldDiscardSyntheticShadow } from "./sequence-policy";

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

type CompactV6Scope = "core" | "environment" | "audit";
type CompactV6ScopeSample = {
  sample_epoch: number;
  received_ts: string;
  metrics: Record<string, number | string | boolean | null>;
  meta: Record<string, unknown>;
};
type CompactV6ScopeSamples = Partial<Record<CompactV6Scope, CompactV6ScopeSample>>;

type ShadowReplayMessage = {
  payload: TelemetryRawV1;
  resetsShadow: boolean;
};

const FIELD_PROFILE_META_KEYS = new Set<string>([
  "_writer",
  "install_label",
  "legacy_node",
  "uptime_s",
  "upload_trigger",
  "last_command_tag",
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
  "time_jump_ms",
  "compact_payload_version",
  "field_sensor_source",
  "gnss_source",
  "battery_estimate_quality_code",
  "rtk_coordinate_frame",
  "rtk_coordinate_frame_code",
  "rtk_fix_type",
  "rtk_fix_flags",
  "rtk_displacement_eligible",
  "v3_valid_flags",
  "v4_valid_flags",
  "v5_valid_flags",
  "rtcm_injection_mode",
  "rtcm_state_flags",
  "rtcm_lease_resolution_ms",
  "rtcm_completion_age_resolution_ms",
  "rtcm_injected_frames_counter_saturated",
  "compact_scope",
  "sample_epoch",
  "v6_valid_flags",
  "v6_quantization",
  "rtk_fixed_streak_saturated",
  "rtk_fix_drop_count_saturated",
  "_scope_samples",
  "_scope_status"
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
    metrics: sanitizeFieldProfileMetrics(state.metrics),
    meta: sanitizeRecordByAllowedKeys(state.meta, FIELD_PROFILE_META_KEYS)
  };
}

function compactV6Scope(value: unknown): CompactV6Scope | null {
  return value === "core" || value === "environment" || value === "audit" ? value : null;
}

function normalizeCompactV6ScopeSamples(value: unknown): CompactV6ScopeSamples {
  const output: CompactV6ScopeSamples = {};
  if (!value || typeof value !== "object") return output;
  const source = value as Record<string, unknown>;
  for (const scope of ["core", "environment", "audit"] as const) {
    const candidate = source[scope];
    if (!candidate || typeof candidate !== "object") continue;
    const sample = candidate as Record<string, unknown>;
    if (!Number.isInteger(sample.sample_epoch) || Number(sample.sample_epoch) <= 0 ||
        Number(sample.sample_epoch) > 0xffff_ffff || typeof sample.received_ts !== "string" ||
        !Number.isFinite(Date.parse(sample.received_ts)) || !sample.metrics || typeof sample.metrics !== "object" ||
        !sample.meta || typeof sample.meta !== "object") {
      continue;
    }
    output[scope] = {
      sample_epoch: Number(sample.sample_epoch),
      received_ts: sample.received_ts,
      metrics: sanitizeFieldProfileMetrics(
        sample.metrics as Record<string, number | string | boolean | null>
      ),
      meta: sanitizeRecordByAllowedKeys(sample.meta as Record<string, unknown>, FIELD_PROFILE_META_KEYS)
    };
  }
  return output;
}

function buildCompactV6ShadowState(
  payload: TelemetryRawV1,
  previous: ShadowState,
  payloadMetrics: Record<string, number | string | boolean | null>,
  payloadMeta: Record<string, unknown>
): ShadowState {
  const scope = compactV6Scope(payloadMeta.compact_scope);
  const sampleEpoch = payloadMeta.sample_epoch;
  if (!scope || !Number.isInteger(sampleEpoch) || Number(sampleEpoch) <= 0) {
    return { metrics: {}, meta: {} };
  }

  const scopeSamples = normalizeCompactV6ScopeSamples(previous.meta._scope_samples);
  scopeSamples[scope] = {
    sample_epoch: Number(sampleEpoch),
    received_ts: payload.received_ts,
    metrics: { ...payloadMetrics },
    meta: { ...payloadMeta }
  };

  const core = scopeSamples.core;
  const metrics: Record<string, number | string | boolean | null> = core ? { ...core.metrics } : {};
  const meta: Record<string, unknown> = core ? { ...core.meta } : {
    install_label: payloadMeta.install_label,
    legacy_node: payloadMeta.legacy_node,
    compact_payload_version: 6
  };
  const matchedScopes: CompactV6Scope[] = core ? ["core"] : [];
  if (core) {
    for (const extensionScope of ["environment", "audit"] as const) {
      const extension = scopeSamples[extensionScope];
      if (extension?.sample_epoch !== core.sample_epoch) continue;
      Object.assign(metrics, extension.metrics);
      Object.assign(meta, extension.meta);
      matchedScopes.push(extensionScope);
    }
    if (typeof metrics.rtk_altitude_msl_m === "number" &&
        typeof metrics.rtk_geoid_separation_m === "number") {
      metrics.rtk_ellipsoid_height_m =
        Math.round((metrics.rtk_altitude_msl_m + metrics.rtk_geoid_separation_m) * 1000) / 1000;
    }
    meta.compact_scope = "core";
    meta.packet_class = "hf_displacement_core";
    meta.sample_epoch = core.sample_epoch;
  }

  meta._scope_samples = scopeSamples;
  meta._scope_status = {
    current_sample_epoch: core?.sample_epoch ?? null,
    matched_scopes: matchedScopes,
    environment_sample_epoch: scopeSamples.environment?.sample_epoch ?? null,
    audit_sample_epoch: scopeSamples.audit?.sample_epoch ?? null
  };
  const previousWriter = previous.meta._writer;
  const writerMeta = previousWriter && typeof previousWriter === "object"
    ? { ...(previousWriter as Record<string, unknown>) }
    : {};
  if (payload.seq != null) writerMeta.last_seq = payload.seq;
  writerMeta.last_received_ts = payload.received_ts;
  meta._writer = writerMeta;
  return { metrics, meta };
}

function buildShadowState(payload: TelemetryRawV1, previousState: unknown): ShadowState {
  const normalizedPrevious = normalizeShadowState(previousState);
  const payloadMeta = payload.meta && typeof payload.meta === "object" ? payload.meta : {};
  const previousRaw = shouldDiscardSyntheticShadow(payload, normalizedPrevious)
    ? { metrics: {}, meta: {} }
    : normalizedPrevious;
  const useFieldProfileSanitizer =
    isFieldProfileMetaRecord(payloadMeta) || isFieldProfileMetaRecord(previousRaw.meta);
  const previous = useFieldProfileSanitizer ? sanitizeFieldProfileShadowState(previousRaw) : previousRaw;
  const nextMetrics = useFieldProfileSanitizer
    ? sanitizeFieldProfileMetrics(payload.metrics)
    : payload.metrics;
  const mergedMetrics = useFieldProfileSanitizer
    ? mergeFieldProfileMetrics(previous.metrics, payload.metrics)
    : { ...previous.metrics, ...payload.metrics };
  const nextPayloadMeta = useFieldProfileSanitizer
    ? sanitizeRecordByAllowedKeys(payloadMeta, FIELD_PROFILE_META_KEYS)
    : payloadMeta;
  if (payloadMeta.compact_payload_version === 6) {
    return buildCompactV6ShadowState(payload, previous, nextMetrics, nextPayloadMeta);
  }
  const replaceFieldSnapshot =
    payloadMeta.compact_payload_version === 3 ||
    payloadMeta.compact_payload_version === 4 ||
    payloadMeta.compact_payload_version === 5;
  const meta: Record<string, unknown> = {
    ...(replaceFieldSnapshot ? {} : previous.meta),
    ...nextPayloadMeta
  };

  const writerMeta: Record<string, unknown> =
    previous.meta._writer && typeof previous.meta._writer === "object"
      ? { ...(previous.meta._writer as Record<string, unknown>) }
      : {};

  if (payload.seq != null) writerMeta.last_seq = payload.seq;
  writerMeta.last_received_ts = payload.received_ts;
  meta._writer = writerMeta;

  return {
    metrics: replaceFieldSnapshot ? { ...nextMetrics } : mergedMetrics,
    meta
  };
}

function buildSuccessfulShadowUpdates(
  messages: ShadowReplayMessage[],
  baseStateByDeviceId: Map<string, ShadowState | null>
): Map<string, { updatedAtIso: string; state: ShadowState }> {
  const updates = new Map<string, { updatedAtIso: string; state: ShadowState }>();
  for (const message of messages) {
    const { payload } = message;
    const updatedAtIso = new Date(payload.received_ts).toISOString();
    const accumulated = updates.get(payload.device_id);
    if (accumulated && accumulated.updatedAtIso > updatedAtIso) continue;

    const previousState = message.resetsShadow
      ? null
      : accumulated
        ? accumulated.state
        : baseStateByDeviceId.get(payload.device_id) ?? null;
    updates.set(payload.device_id, {
      updatedAtIso,
      state: buildShadowState(payload, previousState)
    });
  }
  return updates;
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
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
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
    await client.query(
      `
      UPDATE devices
      SET
          status = CASE WHEN status = 'revoked' THEN status ELSE 'active' END,
          last_seen_at = GREATEST(COALESCE(last_seen_at, '-infinity'::timestamptz), $2::timestamptz),
          updated_at = GREATEST(COALESCE(updated_at, '-infinity'::timestamptz), $2::timestamptz)
        WHERE device_id = $1
      `,
      [deviceId, updatedAtIso]
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
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
        resetsShadow: boolean;
      };

      const pending: PendingMessage[] = [];
      let pendingRowsCount = 0;
      let lastFlushAt = Date.now();
      const deviceStateByDeviceId = new Map<string, { updatedAtIso: string; state: unknown }>();
      const latestSeqByDeviceId = new Map<string, number | null>();
      const latestShadowStateByDeviceId = new Map<string, ShadowState | null>();
      const shadowBaseByDeviceId = new Map<string, ShadowState | null>();

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
          shadowBaseByDeviceId.clear();
          await commitResolvedOffsets(ctx);
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

          const successfulShadowMessages: ShadowReplayMessage[] = [];

          for (const p of pending) {
            if (!ctx.isRunning() || ctx.isStale()) break;
            await ctx.heartbeat();

            try {
              await insertRows(ch, config.clickhouseDatabase, config.clickhouseTable, p.rows);

              successfulShadowMessages.push({
                payload: p.payload,
                resetsShadow: p.resetsShadow
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

          const shadowUpdates = buildSuccessfulShadowUpdates(
            successfulShadowMessages,
            shadowBaseByDeviceId
          );
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
          shadowBaseByDeviceId.clear();
          await commitResolvedOffsets(ctx);
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
          let resetsShadow = false;
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
              const seqResetDecision = evaluateSequenceReset(
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
                    resetReason: seqResetDecision.reason,
                    previousUptimeS: seqResetDecision.previousUptimeS,
                    nextUptimeS: seqResetDecision.nextUptimeS
                  },
                  "telemetry seq rollback accepted for a verified producer reset"
                );
                latestShadowStateByDeviceId.set(payload.device_id, null);
                deviceStateByDeviceId.delete(payload.device_id);
                resetsShadow = true;
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
            pending.push({ offset: message.offset, raw, payload, rows: messageRows, resetsShadow });
            pendingRowsCount += messageRows.length;

            const updatedAtIso = new Date(payload.received_ts).toISOString();
            const existing = deviceStateByDeviceId.get(payload.device_id);
            const currentState = existing
              ? normalizeShadowState(existing.state)
              : latestShadowStateByDeviceId.get(payload.device_id) ?? null;
            if (!shadowBaseByDeviceId.has(payload.device_id)) {
              shadowBaseByDeviceId.set(payload.device_id, currentState);
            }
            if (!existing || existing.updatedAtIso <= updatedAtIso) {
              const nextState = buildShadowState(payload, resetsShadow ? null : currentState);
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
        await commitResolvedOffsets(ctx);
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

export const telemetryWriterTestHooks = { buildShadowState, buildSuccessfulShadowUpdates };

if (require.main === module) {
  void main();
}
