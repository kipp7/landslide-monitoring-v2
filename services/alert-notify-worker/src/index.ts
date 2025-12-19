import { createLogger, newTraceId } from "@lsmv2/observability";
import { compareSeverityAtLeast, type Severity } from "@lsmv2/rules";
import { loadAndCompileSchema } from "@lsmv2/validation";
import dotenv from "dotenv";
import { Kafka, logLevel } from "kafkajs";
import { Pool } from "pg";
import path from "node:path";
import { loadConfigFromEnv } from "./config";

type AlertEventV1 = {
  schema_version: 1;
  alert_id: string;
  event_id: string;
  event_type: "ALERT_TRIGGER" | "ALERT_UPDATE" | "ALERT_RESOLVE" | "ALERT_ACK";
  created_ts: string;
  rule_id: string;
  rule_version: number;
  severity: Severity;
  device_id?: string | null;
  station_id?: string | null;
  evidence?: Record<string, unknown>;
  explain?: string;
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

function shouldNotify(ev: AlertEventV1): boolean {
  return ev.event_type === "ALERT_TRIGGER" || ev.event_type === "ALERT_UPDATE";
}

function buildNotification(ev: AlertEventV1): { title: string; content: string } {
  const title = `告警：${ev.alert_id}`;
  const content =
    `eventType=${ev.event_type}\n` +
    `severity=${ev.severity}\n` +
    (ev.device_id ? `deviceId=${ev.device_id}\n` : "") +
    (ev.station_id ? `stationId=${ev.station_id}\n` : "") +
    `ruleId=${ev.rule_id}\n` +
    `ruleVersion=${String(ev.rule_version)}\n` +
    `createdTs=${ev.created_ts}\n`;
  return { title, content };
}

function isQuietNow(now: Date, start: string, end: string): boolean {
  const toMinutes = (hhmmss: string): number | null => {
    const m = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(hhmmss);
    if (!m) return null;
    const hh = Number(m[1]);
    const mm = Number(m[2]);
    const ss = Number(m[3] ?? "0");
    if (!Number.isFinite(hh) || !Number.isFinite(mm) || !Number.isFinite(ss)) return null;
    if (hh < 0 || hh > 23 || mm < 0 || mm > 59 || ss < 0 || ss > 59) return null;
    return hh * 60 + mm;
  };

  const s = toMinutes(start);
  const e = toMinutes(end);
  if (s === null || e === null) return false;

  const n = now.getHours() * 60 + now.getMinutes();
  if (s === e) return true;
  if (s < e) return n >= s && n < e;
  return n >= s || n < e;
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
    "alerts-events.v1.schema.json"
  );
  const validateEvent = await loadAndCompileSchema<AlertEventV1>(schemaEventPath);

  const kafka = new Kafka({
    clientId: config.kafkaClientId,
    brokers: config.kafkaBrokers,
    logLevel: logLevel.NOTHING
  });
  const consumer = kafka.consumer({ groupId: config.kafkaGroupId });
  await consumer.connect();
  await consumer.subscribe({ topic: config.kafkaTopicAlertsEvents, fromBeginning: false });

  const pg = createPgPool(config);

  logger.info({ topic: config.kafkaTopicAlertsEvents, notifyType: config.notifyType }, "alert-notify-worker started");

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
              "alerts.events schema invalid (skipped)"
            );
            ctx.resolveOffset(message.offset);
            continue;
          }

          const ev: AlertEventV1 = parsed;
          if (!shouldNotify(ev)) {
            ctx.resolveOffset(message.offset);
            continue;
          }

          const subs = await pg.query<{
            subscription_id: string;
            user_id: string;
            device_id: string | null;
            station_id: string | null;
            min_severity: Severity;
            notify_app: boolean;
            notify_sms: boolean;
            notify_email: boolean;
            quiet_start_time: string | null;
            quiet_end_time: string | null;
            is_active: boolean;
          }>(
            `
              SELECT
                subscription_id,
                user_id,
                device_id,
                station_id,
                min_severity,
                notify_app,
                notify_sms,
                notify_email,
                quiet_start_time::text,
                quiet_end_time::text,
                is_active
              FROM user_alert_subscriptions
              WHERE is_active = TRUE
                AND ($1::uuid IS NULL OR device_id IS NULL OR device_id = $1::uuid)
                AND ($2::uuid IS NULL OR station_id IS NULL OR station_id = $2::uuid)
            `,
            [ev.device_id ?? null, ev.station_id ?? null]
          );

          const n = buildNotification(ev);
          const now = new Date();

          for (const sub of subs.rows) {
            if (!compareSeverityAtLeast(ev.severity, sub.min_severity)) continue;
            if (config.notifyType === "app" && !sub.notify_app) continue;
            if (config.notifyType === "sms" && !sub.notify_sms) continue;
            if (config.notifyType === "email" && !sub.notify_email) continue;
            if (sub.quiet_start_time && sub.quiet_end_time && isQuietNow(now, sub.quiet_start_time, sub.quiet_end_time)) {
              continue;
            }

            await pg.query(
              `
                INSERT INTO alert_notifications (
                  event_id, user_id, notify_type, status, title, content
                )
                SELECT $1::uuid, $2::uuid, $3::varchar, 'pending', $4, $5
                WHERE NOT EXISTS (
                  SELECT 1 FROM alert_notifications
                  WHERE event_id = $1::uuid AND user_id = $2::uuid AND notify_type = $3::varchar
                )
              `,
              [ev.event_id, sub.user_id, config.notifyType, n.title, n.content]
            );
          }

          logger.info({ traceId, eventId: ev.event_id, eventType: ev.event_type, alertId: ev.alert_id }, "notifications processed");
          ctx.resolveOffset(message.offset);
        } catch (err) {
          logger.error({ traceId, err }, "notify failed");
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
