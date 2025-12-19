import { createLogger } from "@lsmv2/observability";
import { loadAndCompileSchema } from "@lsmv2/validation";
import dotenv from "dotenv";
import { Kafka, logLevel } from "kafkajs";
import { Pool } from "pg";
import path from "node:path";
import { loadConfigFromEnv } from "./config";
import { evalCondition, findFirstSensorLeaf, ruleDslSchema, templateString, type RuleDslV1 } from "./dsl";

type TelemetryRawV1 = {
  schema_version: 1;
  received_ts: string;
  device_id: string;
  seq?: number;
  metrics: Record<string, unknown>;
  meta?: Record<string, unknown>;
};

type DbRuleRow = {
  rule_id: string;
  rule_name: string;
  description: string | null;
  scope: "device" | "station" | "global";
  device_id: string | null;
  station_id: string | null;
  is_active: boolean;
  rule_version: number;
  dsl_json: unknown;
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

type WindowPoint = { tsMs: number; ok: boolean };
type WindowState = { points: WindowPoint[] };
type ActiveKey = string; // ruleId|deviceId

function makeActiveKey(ruleId: string, deviceId: string): ActiveKey {
  return `${ruleId}|${deviceId}`;
}

type DeviceInfo = { stationId: string | null; expiresAtMs: number };

async function main(): Promise<void> {
  dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

  const config = loadConfigFromEnv(process.env);
  const logger = createLogger(config.serviceName);

  const repoRoot = repoRootFromHere();
  const schemaRawPath = path.join(
    repoRoot,
    "docs",
    "integrations",
    "kafka",
    "schemas",
    "telemetry-raw.v1.schema.json"
  );
  const validateRaw = await loadAndCompileSchema<TelemetryRawV1>(schemaRawPath);

  const kafka = new Kafka({
    clientId: config.kafkaClientId,
    brokers: config.kafkaBrokers,
    logLevel: logLevel.NOTHING
  });
  const consumer = kafka.consumer({ groupId: config.kafkaGroupId });
  await consumer.connect();
  await consumer.subscribe({ topic: config.kafkaTopicTelemetryRaw, fromBeginning: false });

  const pg = createPgPool(config);

  let cachedRules: { row: DbRuleRow; dsl: RuleDslV1 }[] = [];
  let lastRefreshMs = 0;

  const refreshRules = async () => {
    const now = Date.now();
    if (now - lastRefreshMs < config.rulesRefreshMs) return;
    lastRefreshMs = now;

    const res = await pg.query<DbRuleRow>(
      `
        SELECT
          r.rule_id,
          r.rule_name,
          r.description,
          r.scope,
          r.device_id,
          r.station_id,
          r.is_active,
          v.rule_version,
          v.dsl_json
        FROM alert_rules r
        JOIN LATERAL (
          SELECT rule_version, dsl_json
          FROM alert_rule_versions
          WHERE rule_id = r.rule_id
          ORDER BY rule_version DESC
          LIMIT 1
        ) v ON TRUE
        WHERE r.is_active = TRUE
      `
    );

    const next: { row: DbRuleRow; dsl: RuleDslV1 }[] = [];
    for (const row of res.rows) {
      const parsed = ruleDslSchema.safeParse(row.dsl_json);
      if (!parsed.success) {
        logger.warn({ ruleId: row.rule_id, issues: parsed.error.issues }, "invalid rule dsl_json (skipped)");
        continue;
      }
      if (!parsed.data.enabled) continue;
      next.push({ row, dsl: parsed.data });
    }
    cachedRules = next;
    logger.info({ rules: cachedRules.length }, "rules refreshed");
  };

  const windowByKey = new Map<ActiveKey, WindowState>();
  const deviceInfoById = new Map<string, DeviceInfo>();

  const getDeviceInfo = async (deviceId: string): Promise<DeviceInfo> => {
    const now = Date.now();
    const cached = deviceInfoById.get(deviceId);
    if (cached && cached.expiresAtMs > now) return cached;

    const row = await pg.query<{ station_id: string | null }>(
      "SELECT station_id FROM devices WHERE device_id=$1",
      [deviceId]
    );
    const stationId = row.rows[0]?.station_id ?? null;
    const next: DeviceInfo = { stationId, expiresAtMs: now + 60_000 };
    deviceInfoById.set(deviceId, next);
    return next;
  };

  const getOrCreateWindow = (k: ActiveKey): WindowState => {
    const existing = windowByKey.get(k);
    if (existing) return existing;
    const s: WindowState = { points: [] };
    windowByKey.set(k, s);
    return s;
  };

  const loadLatestAlertForRuleDevice = async (ruleId: string, deviceId: string) => {
    const row = await pg.query<{
      alert_id: string;
      event_type: string;
      created_at: string;
      severity: string;
    }>(
      `
        SELECT alert_id, event_type, to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at, severity
        FROM alert_events
        WHERE rule_id = $1 AND device_id = $2
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [ruleId, deviceId]
    );
    return row.rows[0] ?? null;
  };

  const insertAlertEvent = async (args: {
    alertId: string;
    eventType: "ALERT_TRIGGER" | "ALERT_UPDATE" | "ALERT_RESOLVE" | "ALERT_ACK";
    ruleId: string;
    ruleVersion: number;
    deviceId: string;
    stationId: string | null;
    severity: "low" | "medium" | "high" | "critical";
    title: string;
    message: string;
    evidence: Record<string, unknown>;
    explain: string;
  }) => {
    const res = await pg.query<{ event_id: string; created_at: string }>(
      `
        INSERT INTO alert_events(
          alert_id, event_type, rule_id, rule_version, device_id, station_id,
          severity, title, message, evidence, explain, created_at
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,NOW())
        RETURNING
          event_id,
          to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at
      `,
      [
        args.alertId,
        args.eventType,
        args.ruleId,
        args.ruleVersion,
        args.deviceId,
        args.stationId,
        args.severity,
        args.title,
        args.message,
        JSON.stringify(args.evidence),
        args.explain
      ]
    );
    const row = res.rows[0];
    if (!row) throw new Error("insert alert event failed (no row returned)");
    return row;
  };

  logger.info(
    { topic: config.kafkaTopicTelemetryRaw, rulesRefreshMs: config.rulesRefreshMs },
    "rule-engine-worker started"
  );

  await consumer.run({
    autoCommit: true,
    eachMessage: async ({ message }) => {
      const raw = message.value?.toString("utf-8") ?? "";
      let payload: TelemetryRawV1;
      try {
        const parsed = JSON.parse(raw) as unknown;
        if (!validateRaw.validate(parsed)) {
          logger.warn({ errors: validateRaw.errors }, "telemetry.raw schema invalid (skipped)");
          return;
        }
        payload = parsed;
      } catch (err) {
        logger.warn({ err }, "telemetry.raw parse failed (skipped)");
        return;
      }

      await refreshRules();

      const deviceId = payload.device_id;
      const tsMs = Date.parse(payload.received_ts);
      const metrics = payload.metrics;
      const deviceInfo = await getDeviceInfo(deviceId);
      const deviceStationId = deviceInfo.stationId;

      for (const r of cachedRules) {
        if (r.row.scope === "device") {
          if (!r.row.device_id || r.row.device_id !== deviceId) continue;
        } else if (r.row.scope === "station") {
          if (!deviceStationId) continue;
          if (!r.row.station_id || r.row.station_id !== deviceStationId) continue;
        } else {
          // global: applies to all devices
        }

        const key = makeActiveKey(r.row.rule_id, deviceId);
        const dsl = r.dsl;

        const missingPolicy = dsl.missing?.policy ?? "ignore";
        const okNow = evalCondition(dsl.when, metrics);
        const okNowBool = okNow === true;

        const win = getOrCreateWindow(key);
        win.points.push({ tsMs, ok: okNowBool });

        if (dsl.window?.type === "duration") {
          const cutoff = tsMs - dsl.window.minutes * 60_000;
          while (win.points.length > 0) {
            const first = win.points[0];
            if (!first || first.tsMs >= cutoff) break;
            win.points.shift();
          }
        } else if (dsl.window?.type === "points") {
          while (win.points.length > dsl.window.points) win.points.shift();
        } else {
          while (win.points.length > 1) win.points.shift();
        }

        while (win.points.length > config.maxPointsPerRule) win.points.shift();

        let windowReady = true;
        if (dsl.window?.type === "duration") {
          const minPoints = dsl.window.minPoints;
          windowReady = win.points.length >= minPoints;
        } else if (dsl.window?.type === "points") {
          windowReady = win.points.length >= dsl.window.points;
        }

        if (!windowReady) {
          if (missingPolicy === "treat_as_fail") {
            continue;
          }
          continue;
        }

        const triggered = win.points.every((p) => p.ok);
        const latest = await loadLatestAlertForRuleDevice(r.row.rule_id, deviceId);
        const lastEventType = latest?.event_type ?? "";
        const lastAlertId = latest?.alert_id ?? "";
        const isActive = lastEventType === "ALERT_TRIGGER" || lastEventType === "ALERT_UPDATE";
        const isAcked = lastEventType === "ALERT_ACK";

        const action = dsl.actions[0];
        if (!action) continue;
        const valueVars: Record<string, string> = {
          deviceId,
          sensorKey: "",
          value: "",
          ts: payload.received_ts
        };

        const leaf = findFirstSensorLeaf(dsl.when);
        if (leaf && typeof metrics[leaf.sensorKey] === "number") {
          valueVars.sensorKey = leaf.sensorKey;
          valueVars.value = String(metrics[leaf.sensorKey]);
        }

        const title = templateString(action.titleTemplate, valueVars);
        const messageText = templateString(action.messageTemplate ?? "", valueVars);

        const explain = triggered ? "rule triggered" : "rule recovered";

        const shouldResolve = () => {
          if (!isActive && !isAcked) return false;
          if (!dsl.hysteresis) return !triggered;
          const h = dsl.hysteresis;
          if (h.recoverBelow !== undefined && valueVars.value) {
            const v = Number(valueVars.value);
            return v < h.recoverBelow;
          }
          if (h.recoverAbove !== undefined && valueVars.value) {
            const v = Number(valueVars.value);
            return v > h.recoverAbove;
          }
          return !triggered;
        };

        if (triggered) {
          if (isActive || isAcked) {
            continue;
          }
          const alertId = crypto.randomUUID();
          await insertAlertEvent({
            alertId,
            eventType: "ALERT_TRIGGER",
            ruleId: r.row.rule_id,
            ruleVersion: r.row.rule_version,
            deviceId,
            stationId: r.row.station_id ?? deviceStationId,
            severity: dsl.severity,
            title,
            message: messageText,
            evidence: {
              timeField: dsl.timeField ?? "received",
              sensorKey: valueVars.sensorKey,
              value: valueVars.value ? Number(valueVars.value) : null,
              receivedTs: payload.received_ts,
              seq: payload.seq ?? null,
              window: { type: dsl.window?.type ?? "duration", points: win.points.length }
            },
            explain
          });
          logger.info({ ruleId: r.row.rule_id, deviceId, alertId }, "alert triggered");
          continue;
        }

        if (shouldResolve()) {
          const alertId = lastAlertId;
          const inserted = await insertAlertEvent({
            alertId,
            eventType: "ALERT_RESOLVE",
            ruleId: r.row.rule_id,
            ruleVersion: r.row.rule_version,
            deviceId,
            stationId: r.row.station_id ?? deviceStationId,
            severity: dsl.severity,
            title,
            message: messageText,
            evidence: {
              timeField: dsl.timeField ?? "received",
              sensorKey: valueVars.sensorKey,
              value: valueVars.value ? Number(valueVars.value) : null,
              receivedTs: payload.received_ts,
              seq: payload.seq ?? null
            },
            explain
          });
          logger.info(
            { ruleId: r.row.rule_id, deviceId, alertId, eventId: inserted.event_id },
            "alert resolved"
          );
        }
      }
    }
  });
}

void main();
