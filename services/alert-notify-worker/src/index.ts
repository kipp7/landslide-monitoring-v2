import { createLogger, newTraceId } from "@lsmv2/observability";
import { compareSeverityAtLeast, type Severity } from "@lsmv2/rules";
import { loadAndCompileSchema } from "@lsmv2/validation";
import dotenv from "dotenv";
import { Kafka, logLevel } from "kafkajs";
import { Pool } from "pg";
import path from "node:path";
import { loadConfigFromEnv } from "./config";
import { createSmsProvider } from "./sms-provider";

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

type BuiltNotification = { title: string; content: string };

type SmsContactRecipient = {
  contact_id: string;
  contact_name: string;
  phone_e164: string;
  min_severity: Severity;
  duty_label: string | null;
  scope_rank: number;
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

function buildNotification(ev: AlertEventV1): BuiltNotification {
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

function buildSmsTemplateParams(ev: AlertEventV1, recipient: SmsContactRecipient): Record<string, unknown> {
  return {
    alertId: ev.alert_id,
    eventType: ev.event_type,
    severity: ev.severity,
    stationId: ev.station_id ?? "",
    deviceId: ev.device_id ?? "",
    ruleId: ev.rule_id,
    contactName: recipient.contact_name,
    dutyLabel: recipient.duty_label ?? ""
  };
}

async function hasContactLibrary(pg: Pool): Promise<boolean> {
  const result = await pg.query<{ ok: boolean }>(
    `
      SELECT
        to_regclass('public.alert_contacts') IS NOT NULL
        AND to_regclass('public.alert_contact_bindings') IS NOT NULL
        AND to_regclass('public.alert_sms_delivery_jobs') IS NOT NULL AS ok
    `
  );
  return result.rows[0]?.ok === true;
}

async function resolveSmsContactRecipients(pg: Pool, ev: AlertEventV1): Promise<SmsContactRecipient[]> {
  const result = await pg.query<SmsContactRecipient>(
    `
      WITH event_station AS (
        SELECT
          station_id,
          station_code,
          COALESCE(metadata->>'regionCode', metadata->>'region_code', metadata->>'region') AS region_code
        FROM stations
        WHERE station_id = $2::uuid
      ),
      matched AS (
        SELECT DISTINCT ON (c.contact_id)
          c.contact_id,
          c.contact_name,
          c.phone_e164,
          b.min_severity,
          b.duty_label,
          CASE
            WHEN b.device_id = $1::uuid OR g.device_id = $1::uuid THEN 1
            WHEN b.station_id = $2::uuid OR g.station_id = $2::uuid THEN 2
            WHEN b.region_code IS NOT NULL AND b.region_code = event_station.region_code THEN 3
            WHEN g.region_code IS NOT NULL AND g.region_code = event_station.region_code THEN 4
            WHEN g.group_type = 'global' THEN 9
            ELSE 20
          END AS scope_rank
        FROM alert_contact_bindings b
        JOIN alert_contacts c ON c.contact_id = b.contact_id
        LEFT JOIN alert_contact_groups g ON g.group_id = b.group_id
        LEFT JOIN event_station ON TRUE
        WHERE b.is_active = TRUE
          AND b.notify_sms = TRUE
          AND c.is_active = TRUE
          AND (
            ($1::uuid IS NOT NULL AND (b.device_id = $1::uuid OR g.device_id = $1::uuid))
            OR ($2::uuid IS NOT NULL AND (b.station_id = $2::uuid OR g.station_id = $2::uuid))
            OR (event_station.region_code IS NOT NULL AND (b.region_code = event_station.region_code OR g.region_code = event_station.region_code))
            OR g.group_type = 'global'
          )
        ORDER BY c.contact_id, scope_rank ASC, b.priority ASC
      )
      SELECT contact_id, contact_name, phone_e164, min_severity, duty_label, scope_rank
      FROM matched
      ORDER BY scope_rank ASC, contact_name ASC
    `,
    [ev.device_id ?? null, ev.station_id ?? null]
  );
  return result.rows;
}

async function createOrReuseSmsJob(
  pg: Pool,
  ev: AlertEventV1,
  recipient: SmsContactRecipient,
  provider: string,
  notification: BuiltNotification
): Promise<{ jobId: string; status: string }> {
  const result = await pg.query<{ sms_job_id: string; status: string }>(
    `
      INSERT INTO alert_sms_delivery_jobs (
        event_id,
        contact_id,
        phone_e164,
        provider,
        status,
        title,
        content,
        template_params
      )
      VALUES (
        $1::uuid,
        $2::uuid,
        $3,
        $4,
        'queued',
        $5,
        $6,
        $7::jsonb
      )
      ON CONFLICT (event_id, contact_id, phone_e164, provider)
      DO UPDATE SET updated_at = NOW()
      RETURNING sms_job_id, status
    `,
    [
      ev.event_id,
      recipient.contact_id,
      recipient.phone_e164,
      provider,
      notification.title,
      notification.content,
      JSON.stringify(buildSmsTemplateParams(ev, recipient))
    ]
  );
  const row = result.rows[0];
  if (!row) throw new Error("failed to create sms delivery job");
  return { jobId: row.sms_job_id, status: row.status };
}

async function updateSmsJobResult(
  pg: Pool,
  jobId: string,
  result: {
    status: "sent" | "failed" | "skipped";
    providerMessageId?: string;
    providerResponse: Record<string, unknown>;
    errorMessage?: string;
  }
): Promise<void> {
  await pg.query(
    `
      UPDATE alert_sms_delivery_jobs
      SET
        status = $2::varchar,
        provider_message_id = $3,
        provider_response = $4::jsonb,
        error_message = $5,
        sent_at = CASE WHEN $2::varchar = 'sent' THEN NOW() ELSE sent_at END,
        updated_at = NOW()
      WHERE sms_job_id = $1::uuid
    `,
    [
      jobId,
      result.status,
      result.providerMessageId ?? null,
      JSON.stringify(result.providerResponse),
      result.errorMessage ?? null
    ]
  );
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
  const smsProvider = createSmsProvider(config);
  const contactLibraryEnabled =
    config.notifyType === "sms" && (config.smsRecipientMode === "contact_library" || config.smsRecipientMode === "both");
  const contactLibraryAvailable = contactLibraryEnabled ? await hasContactLibrary(pg) : false;

  logger.info(
    {
      topic: config.kafkaTopicAlertsEvents,
      notifyType: config.notifyType,
      smsRecipientMode: config.smsRecipientMode,
      smsProvider: smsProvider.providerName,
      contactLibraryAvailable
    },
    "alert-notify-worker started"
  );

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

          if (config.notifyType !== "sms" || config.smsRecipientMode !== "contact_library") {
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
          }

          if (contactLibraryEnabled && contactLibraryAvailable) {
            const recipients = await resolveSmsContactRecipients(pg, ev);
            for (const recipient of recipients) {
              if (!compareSeverityAtLeast(ev.severity, recipient.min_severity)) continue;
              const job = await createOrReuseSmsJob(pg, ev, recipient, smsProvider.providerName, n);
              if (job.status === "sent" || job.status === "delivered") continue;

              const result = await smsProvider.send({
                jobId: job.jobId,
                phoneE164: recipient.phone_e164,
                title: n.title,
                content: n.content,
                templateParams: buildSmsTemplateParams(ev, recipient)
              });
              await updateSmsJobResult(pg, job.jobId, result);
            }
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
