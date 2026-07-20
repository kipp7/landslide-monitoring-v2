import { createLogger } from "@lsmv2/observability";
import {
  competitionTiltProfileSchema,
  computeCompetitionTiltDeviation,
  evalCondition,
  findFirstSensorLeaf,
  readTiltVector,
  ruleDslSchema,
  templateString,
  type CompetitionTiltProfile,
  type MetricPoint,
  type MetricSeriesGetter,
  type MetricWindow,
  type RuleDslV1,
  type Severity
} from "@lsmv2/rules";
import { loadAndCompileSchema } from "@lsmv2/validation";
import dotenv from "dotenv";
import { Kafka, logLevel } from "kafkajs";
import { Pool } from "pg";
import path from "node:path";
import { loadConfigFromEnv } from "./config";

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

function normalizeBaseUrl(value?: string | null): string | null {
  const raw = value?.trim();
  return raw ? raw.replace(/\/+$/, "") : null;
}

function isInsideCooldown(latestCreatedAt: string | undefined, cooldownMinutes: number | undefined): boolean {
  if (!latestCreatedAt || cooldownMinutes === undefined || cooldownMinutes <= 0) return false;
  const latestMs = Date.parse(latestCreatedAt);
  if (!Number.isFinite(latestMs)) return false;
  return Date.now() - latestMs < cooldownMinutes * 60_000;
}

type DeviceInfo = { stationId: string | null; expiresAtMs: number };
type SeriesState = Map<string, MetricPoint[]>; // sensorKey -> points
type DeviceSensorInfo = { declared: Map<string, "enabled" | "disabled" | "missing">; expiresAtMs: number };

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

type CompetitionTiltRuntimeState = {
  profileUpdatedAt: string;
  armed: boolean;
  highStreak: number;
  criticalStreak: number;
  recoveryStreak: number;
  lastResolvedEventAt: string | null;
  lastPublishedDeviationDeg: number | null;
  lastPublishedAxis: "x" | "y" | "z" | null;
};

const COMPETITION_PROFILE_CONFIG_KEY = "field_alarm.competition_tilt_profile.v1";
const COMPETITION_PROFILE_REFRESH_MS = 1000;

const ACTUATOR_RECONCILE_COOLDOWN_MS = Math.max(
  0,
  Number.parseInt(process.env.ACTUATOR_RECONCILE_COOLDOWN_MS ?? "30000", 10) || 0
);

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
  const schemaAlertEventPath = path.join(
    repoRoot,
    "docs",
    "integrations",
    "kafka",
    "schemas",
    "alerts-events.v1.schema.json"
  );
  const validateRaw = await loadAndCompileSchema<TelemetryRawV1>(schemaRawPath);
  const validateAlertEvent = await loadAndCompileSchema<AlertEventV1>(schemaAlertEventPath);

  const kafka = new Kafka({
    clientId: config.kafkaClientId,
    brokers: config.kafkaBrokers,
    logLevel: logLevel.NOTHING
  });
  const producer = kafka.producer();
  const consumer = kafka.consumer({ groupId: config.kafkaGroupId });

  await producer.connect();
  await consumer.connect();
  await consumer.subscribe({ topic: config.kafkaTopicTelemetryRaw, fromBeginning: false });

  const pg = createPgPool(config);

  let cachedRules: { row: DbRuleRow; dsl: RuleDslV1 }[] = [];
  let lastRefreshMs = 0;
  let competitionProfile: CompetitionTiltProfile | null = null;
  let competitionProfileRefreshedAtMs = 0;

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

  const refreshCompetitionProfile = async () => {
    const now = Date.now();
    if (now - competitionProfileRefreshedAtMs < COMPETITION_PROFILE_REFRESH_MS) return;
    competitionProfileRefreshedAtMs = now;
    const row = await pg.query<{ config_value: string | null }>(
      "SELECT config_value FROM system_configs WHERE config_key = $1",
      [COMPETITION_PROFILE_CONFIG_KEY]
    );
    const raw = row.rows[0]?.config_value;
    if (!raw) {
      competitionProfile = null;
      return;
    }
    try {
      competitionProfile = competitionTiltProfileSchema.parse(JSON.parse(raw) as unknown);
    } catch (err) {
      competitionProfile = null;
      logger.warn({ err }, "invalid competition tilt profile ignored");
    }
  };

  const windowByKey = new Map<ActiveKey, WindowState>();
  const deviceInfoById = new Map<string, DeviceInfo>();
  const deviceSensorsById = new Map<string, DeviceSensorInfo>();
  const seriesByKey = new Map<ActiveKey, SeriesState>();
  const lastManualResetByKey = new Map<ActiveKey, string>();
  const competitionStateByDevice = new Map<string, CompetitionTiltRuntimeState>();
  let lastAggregateActuation: { signature: string; atMs: number } | null = null;

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

  const getDeviceSensorInfo = async (deviceId: string): Promise<DeviceSensorInfo> => {
    const now = Date.now();
    const cached = deviceSensorsById.get(deviceId);
    if (cached && cached.expiresAtMs > now) return cached;

    const rows = await pg.query<{ sensor_key: string; status: "enabled" | "disabled" | "missing" }>(
      `
        SELECT sensor_key, status
        FROM device_sensors
        WHERE device_id = $1
      `,
      [deviceId]
    );

    const declared = new Map<string, "enabled" | "disabled" | "missing">();
    for (const row of rows.rows) {
      declared.set(row.sensor_key, row.status);
    }

    const next: DeviceSensorInfo = { declared, expiresAtMs: now + 60_000 };
    deviceSensorsById.set(deviceId, next);
    return next;
  };

  const getOrCreateWindow = (k: ActiveKey): WindowState => {
    const existing = windowByKey.get(k);
    if (existing) return existing;
    const s: WindowState = { points: [] };
    windowByKey.set(k, s);
    return s;
  };

  const getOrCreateSeries = (k: ActiveKey): SeriesState => {
    const existing = seriesByKey.get(k);
    if (existing) return existing;
    const s: SeriesState = new Map<string, MetricPoint[]>();
    seriesByKey.set(k, s);
    return s;
  };

  const updateSeries = (state: SeriesState, tsMs: number, metrics: Record<string, unknown>) => {
    for (const [k, v] of Object.entries(metrics)) {
      if (typeof v !== "number") continue;
      const arr = state.get(k) ?? [];
      arr.push({ tsMs, value: v });
      while (arr.length > config.maxPointsPerRule) arr.shift();
      state.set(k, arr);
    }
  };

  const getSeries = (state: SeriesState, nowMs: number): MetricSeriesGetter => {
    return (sensorKey: string, window?: MetricWindow) => {
      const arr = state.get(sensorKey) ?? [];
      if (!window) return arr.slice(-1);
      if (window.type === "points") return arr.slice(-window.points);
      const cutoff = nowMs - window.minutes * 60_000;
      let i = arr.length;
      while (i > 0) {
        const p = arr[i - 1];
        if (!p || p.tsMs < cutoff) break;
        i -= 1;
      }
      return arr.slice(i);
    };
  };

  const loadLatestAlertForRuleDevice = async (ruleId: string, deviceId: string) => {
    const row = await pg.query<{
      alert_id: string;
      event_type: string;
      evidence_kind: string;
      evidence_source: string;
      created_at: string;
      severity: Severity;
      station_id: string | null;
      title: string;
      message: string;
    }>(
      `
        SELECT
          alert_id,
          event_type,
          coalesce(evidence->>'kind', '') AS evidence_kind,
          coalesce(evidence->>'source', '') AS evidence_source,
          to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
          severity,
          station_id,
          coalesce(title, '') AS title,
          coalesce(message, '') AS message
        FROM alert_events
        WHERE rule_id = $1 AND device_id = $2
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [ruleId, deviceId]
    );
    return row.rows[0] ?? null;
  };

  const publishAlertEvent = async (ev: AlertEventV1) => {
    if (!validateAlertEvent.validate(ev)) {
      logger.error({ errors: validateAlertEvent.errors, ev }, "alerts.events schema invalid (BUG)");
      return;
    }
    await producer.send({
      topic: config.kafkaTopicAlertsEvents,
      messages: [{ key: ev.device_id ?? ev.alert_id, value: JSON.stringify(ev) }]
    });
  };

  const actuateFieldAlarm = async (
    path: "/alarm_on" | "/alarm_off" | "/silence",
    context: Record<string, unknown>
  ) => {
    const baseUrl = normalizeBaseUrl(config.rk3568AlarmActuatorUrl);
    if (!baseUrl) return;

    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, config.actuatorTimeoutMs);
    try {
      const res = await fetch(`${baseUrl}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ source: "rule-engine-worker", ...context }),
        signal: controller.signal
      });
      const body = await res.text().catch(() => "");
      if (!res.ok) {
        logger.warn({ status: res.status, path, body: body.slice(0, 500), ...context }, "rk3568 alarm actuator returned non-2xx");
      } else {
        logger.info({ status: res.status, path, body: body.slice(0, 500), ...context }, "rk3568 alarm actuator called");
      }
    } catch (err) {
      logger.warn({ err, path, ...context }, "rk3568 alarm actuator call failed");
    } finally {
      clearTimeout(timer);
    }
  };

  const loadActuatorAggregate = async () => {
    const rows = await pg.query<{
      alert_id: string;
      event_type: string;
      severity: Severity;
      rule_id: string | null;
      device_id: string | null;
      station_id: string | null;
      title: string | null;
      message: string | null;
    }>(
      `
        WITH latest AS (
          SELECT DISTINCT ON (alert_id)
            alert_id,
            event_type,
            severity,
            rule_id,
            device_id,
            station_id,
            title,
            message,
            created_at
          FROM alert_events
          ORDER BY alert_id, created_at DESC
        )
        SELECT alert_id, event_type, severity, rule_id, device_id, station_id, title, message
        FROM latest
        WHERE severity IN ('high', 'critical')
          AND event_type IN ('ALERT_TRIGGER', 'ALERT_UPDATE', 'ALERT_ACK')
        ORDER BY
          CASE severity WHEN 'critical' THEN 4 WHEN 'high' THEN 3 ELSE 0 END DESC,
          created_at DESC
      `
    );
    return {
      active: rows.rows.filter((row) => row.event_type === "ALERT_TRIGGER" || row.event_type === "ALERT_UPDATE"),
      acked: rows.rows.filter((row) => row.event_type === "ALERT_ACK")
    };
  };

  const maybeActuateFieldAlarm = async (args: {
    ruleId: string;
    deviceId: string;
    severity: Severity;
    evidenceKind: unknown;
    reason: "new-alert-trigger" | "alert-severity-update" | "active-alert-reconcile" | "rule-alert-resolve";
    alertId?: string;
    stationId?: string | null;
    title?: string;
    message?: string;
  }) => {
    if (args.evidenceKind !== "rule") return;
    if (args.severity !== "high" && args.severity !== "critical") return;
    const aggregate = await loadActuatorAggregate();
    const target = aggregate.active[0];
    const now = Date.now();
    const path = target ? "/alarm_on" : aggregate.acked.length > 0 ? "/silence" : "/alarm_off";
    const signature = target
      ? `${path}:${target.alert_id}:${target.severity}`
      : `${path}:${aggregate.acked[0]?.alert_id ?? "none"}`;
    if (
      lastAggregateActuation?.signature === signature &&
      ACTUATOR_RECONCILE_COOLDOWN_MS > 0 &&
      now - lastAggregateActuation.atMs < ACTUATOR_RECONCILE_COOLDOWN_MS
    ) {
      logger.info(
        {
          signature,
          reason: args.reason,
          cooldownMs: ACTUATOR_RECONCILE_COOLDOWN_MS
        },
        "field alarm actuator skipped by aggregate reconcile cooldown"
      );
      return;
    }

    lastAggregateActuation = { signature, atMs: now };
    await actuateFieldAlarm(path, {
      ruleId: target?.rule_id ?? args.ruleId,
      deviceId: target?.device_id ?? args.deviceId,
      reason: args.reason,
      severity: target?.severity ?? args.severity,
      alertId: target?.alert_id ?? args.alertId ?? null,
      stationId: target?.station_id ?? args.stationId ?? null,
      title: target?.title ?? args.title ?? "",
      message: target?.message ?? args.message ?? "",
      activeAlertCount: aggregate.active.length,
      ackedAlertCount: aggregate.acked.length
    });
  };

  const insertAlertEvent = async (args: {
    alertId: string;
    eventType: "ALERT_TRIGGER" | "ALERT_UPDATE" | "ALERT_RESOLVE" | "ALERT_ACK";
    ruleId: string;
    ruleVersion: number;
    deviceId: string;
    stationId: string | null;
    severity: Severity;
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

    await publishAlertEvent({
      schema_version: 1,
      alert_id: args.alertId,
      event_id: row.event_id,
      event_type: args.eventType,
      created_ts: row.created_at,
      rule_id: args.ruleId,
      rule_version: args.ruleVersion,
      severity: args.severity,
      device_id: args.deviceId,
      station_id: args.stationId,
      evidence: args.evidence,
      explain: args.explain
    });

    if (args.eventType === "ALERT_TRIGGER" || args.eventType === "ALERT_UPDATE") {
      await maybeActuateFieldAlarm({
        ruleId: args.ruleId,
        deviceId: args.deviceId,
        severity: args.severity,
        evidenceKind: args.evidence.kind,
        reason: args.eventType === "ALERT_TRIGGER" ? "new-alert-trigger" : "alert-severity-update",
        alertId: args.alertId,
        stationId: args.stationId,
        title: args.title,
        message: args.message
      });
    } else if (args.eventType === "ALERT_RESOLVE") {
      await maybeActuateFieldAlarm({
        ruleId: args.ruleId,
        deviceId: args.deviceId,
        severity: args.severity,
        evidenceKind: args.evidence.kind,
        reason: "rule-alert-resolve",
        alertId: args.alertId,
        stationId: args.stationId,
        title: args.title,
        message: args.message
      });
    }

    return row;
  };

  const evaluateCompetitionTiltProfile = async (payload: TelemetryRawV1) => {
    const profile = competitionProfile;
    if (!profile?.enabled) return;
    const configuredDevice = profile.devices.find((device) => device.deviceId === payload.device_id);
    if (!configuredDevice) return;

    const current = readTiltVector(payload.metrics);
    if (!current) return;
    const deviation = computeCompetitionTiltDeviation(current, configuredDevice.baseline);
    const thresholds = profile.thresholds;
    const latest = await loadLatestAlertForRuleDevice(profile.ruleId, payload.device_id);
    let runtime = competitionStateByDevice.get(payload.device_id);
    if (runtime?.profileUpdatedAt !== profile.updatedAt) {
      runtime = {
        profileUpdatedAt: profile.updatedAt,
        armed: true,
        highStreak: 0,
        criticalStreak: 0,
        recoveryStreak: 0,
        lastResolvedEventAt: null,
        lastPublishedDeviationDeg: null,
        lastPublishedAxis: null
      };
      competitionStateByDevice.set(payload.device_id, runtime);
    }

    const latestIsActive = latest?.event_type === "ALERT_TRIGGER" || latest?.event_type === "ALERT_UPDATE";
    const latestIsAcked = latest?.event_type === "ALERT_ACK";
    const latestIsResolved = latest?.event_type === "ALERT_RESOLVE";

    if (latestIsResolved && runtime.lastResolvedEventAt !== latest.created_at) {
      runtime.armed = false;
      runtime.highStreak = 0;
      runtime.criticalStreak = 0;
      runtime.recoveryStreak = 0;
      runtime.lastResolvedEventAt = latest.created_at;
      runtime.lastPublishedDeviationDeg = null;
      runtime.lastPublishedAxis = null;
    }

    if (!runtime.armed && !latestIsActive && !latestIsAcked) {
      runtime.recoveryStreak =
        deviation.maxDeviationDeg <= thresholds.recoveryDeg ? runtime.recoveryStreak + 1 : 0;
      if (runtime.recoveryStreak < thresholds.recoveryPoints) return;
      runtime.armed = true;
      runtime.recoveryStreak = 0;
      logger.info(
        { deviceId: payload.device_id, maxDeviationDeg: deviation.maxDeviationDeg },
        "competition tilt profile re-armed after returning to baseline"
      );
    }

    const rounded = (value: number) => Number(value.toFixed(3));
    const severityForDeviation: Severity =
      deviation.maxDeviationDeg >= thresholds.criticalDeg ? "critical" : "high";
    const titleForSeverity = (severity: Severity) =>
      severity === "critical"
        ? `${configuredDevice.deviceName} 严重倾角告警`
        : `${configuredDevice.deviceName} 倾角高风险告警`;
    const messageForSeverity = (severity: Severity) => {
      const threshold = severity === "critical" ? thresholds.criticalDeg : thresholds.highDeg;
      return `${configuredDevice.deviceName} 相对比赛基线的 ${deviation.maxAxis.toUpperCase()} 轴偏移 ${String(
        rounded(deviation.maxDeviationDeg)
      )}°，达到 ${String(threshold)}° ${severity === "critical" ? "严重风险" : "高风险"}阈值。`;
    };
    const evidence = (severity: Severity, consecutivePoints: number) => ({
      kind: "rule",
      source: "competition_relative_tilt",
      mode: profile.mode,
      baseline: configuredDevice.baseline,
      current: deviation.current,
      delta: {
        x: rounded(deviation.delta.x),
        y: rounded(deviation.delta.y),
        z: rounded(deviation.delta.z)
      },
      maxAxis: deviation.maxAxis,
      maxDeviationDeg: rounded(deviation.maxDeviationDeg),
      thresholds,
      severity,
      consecutivePoints,
      receivedTs: payload.received_ts,
      seq: payload.seq ?? null,
      latchedUntilManualResolve: true
    });

    if (latestIsActive || latestIsAcked) {
      runtime.criticalStreak =
        deviation.maxDeviationDeg >= thresholds.criticalDeg ? runtime.criticalStreak + 1 : 0;
      if (latest.severity !== "critical" && runtime.criticalStreak >= thresholds.triggerPoints) {
        await insertAlertEvent({
          alertId: latest.alert_id,
          eventType: "ALERT_UPDATE",
          ruleId: profile.ruleId,
          ruleVersion: profile.ruleVersion,
          deviceId: payload.device_id,
          stationId: configuredDevice.stationId,
          severity: "critical",
          title: titleForSeverity("critical"),
          message: messageForSeverity("critical"),
          evidence: evidence("critical", runtime.criticalStreak),
          explain: "competition tilt alert escalated to critical and remains latched until manual resolve"
        });
        runtime.lastPublishedDeviationDeg = deviation.maxDeviationDeg;
        runtime.lastPublishedAxis = deviation.maxAxis;
        return;
      }

      const movementSinceUpdate =
        runtime.lastPublishedDeviationDeg === null
          ? Number.POSITIVE_INFINITY
          : Math.abs(deviation.maxDeviationDeg - runtime.lastPublishedDeviationDeg);
      if (
        latestIsActive &&
        (movementSinceUpdate >= thresholds.updateStepDeg || runtime.lastPublishedAxis !== deviation.maxAxis)
      ) {
        const severity = latest.severity === "critical" ? "critical" : severityForDeviation;
        await insertAlertEvent({
          alertId: latest.alert_id,
          eventType: "ALERT_UPDATE",
          ruleId: profile.ruleId,
          ruleVersion: profile.ruleVersion,
          deviceId: payload.device_id,
          stationId: configuredDevice.stationId,
          severity,
          title: titleForSeverity(severity),
          message: messageForSeverity(severity),
          evidence: evidence(severity, severity === "critical" ? runtime.criticalStreak : runtime.highStreak),
          explain: "competition tilt alert evidence updated; alert remains latched until manual resolve"
        });
        runtime.lastPublishedDeviationDeg = deviation.maxDeviationDeg;
        runtime.lastPublishedAxis = deviation.maxAxis;
      }
      return;
    }

    runtime.criticalStreak =
      deviation.maxDeviationDeg >= thresholds.criticalDeg ? runtime.criticalStreak + 1 : 0;
    runtime.highStreak = deviation.maxDeviationDeg >= thresholds.highDeg ? runtime.highStreak + 1 : 0;
    if (runtime.highStreak < thresholds.triggerPoints) return;

    const severity =
      runtime.criticalStreak >= thresholds.triggerPoints ? ("critical" as const) : ("high" as const);
    const alertId = crypto.randomUUID();
    await insertAlertEvent({
      alertId,
      eventType: "ALERT_TRIGGER",
      ruleId: profile.ruleId,
      ruleVersion: profile.ruleVersion,
      deviceId: payload.device_id,
      stationId: configuredDevice.stationId,
      severity,
      title: titleForSeverity(severity),
      message: messageForSeverity(severity),
      evidence: evidence(severity, severity === "critical" ? runtime.criticalStreak : runtime.highStreak),
      explain: "competition tilt alert triggered from real telemetry and latched until manual resolve"
    });
    runtime.lastPublishedDeviationDeg = deviation.maxDeviationDeg;
    runtime.lastPublishedAxis = deviation.maxAxis;
    logger.info(
      { deviceId: payload.device_id, alertId, severity, maxDeviationDeg: deviation.maxDeviationDeg },
      "competition tilt alert triggered"
    );
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
      await refreshCompetitionProfile();

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

        const latest = await loadLatestAlertForRuleDevice(r.row.rule_id, deviceId);
        if (
          latest?.event_type === "ALERT_RESOLVE" &&
          latest.evidence_source === "field_alarm_review" &&
          lastManualResetByKey.get(key) !== latest.created_at
        ) {
          seriesByKey.delete(key);
          windowByKey.delete(key);
          lastManualResetByKey.set(key, latest.created_at);
          logger.info(
            { ruleId: r.row.rule_id, deviceId, alertId: latest.alert_id, resetAt: latest.created_at },
            "rule series reset after manual field alarm resolve"
          );
        }

        const seriesState = getOrCreateSeries(key);
        updateSeries(seriesState, tsMs, metrics);
        const baseSeriesGetter = getSeries(seriesState, tsMs);
        const defaultMetricWindow: MetricWindow | undefined =
          dsl.window?.type === "duration"
            ? { type: "duration", minutes: dsl.window.minutes, minPoints: dsl.window.minPoints }
            : dsl.window?.type === "points"
              ? { type: "points", points: dsl.window.points }
              : undefined;
        const seriesGetter: MetricSeriesGetter = (sensorKey, window) =>
          baseSeriesGetter(sensorKey, window ?? defaultMetricWindow);

        const okNow = evalCondition(dsl.when, metrics, seriesGetter);
        const missing = dsl.missing;
        const missingPolicy = missing?.policy ?? "ignore";
        if (okNow === null && missingPolicy === "ignore") {
          continue;
        }

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

        const missingCfg = missing?.policy === "raise_missing_alert" ? missing : null;
        let governedMissingKeys: string[] = [];
        if (missingCfg) {
          const sensorInfo = await getDeviceSensorInfo(deviceId);
          if (sensorInfo.declared.size > 0) {
            governedMissingKeys = missingCfg.sensorKeys.filter((k) => {
              const status = sensorInfo.declared.get(k);
              return status === "enabled" || status === "missing";
            });
          } else {
            governedMissingKeys = missingCfg.sensorKeys.slice();
          }
        }
        const missingNow =
          missingCfg !== null &&
          governedMissingKeys.length > 0 &&
          (okNow === null || !windowReady || governedMissingKeys.some((k) => typeof metrics[k] !== "number"));

        if (!windowReady) {
          if (missingPolicy !== "raise_missing_alert") continue;
        }

        const triggered = win.points.every((p) => p.ok);
        const lastEventType = latest?.event_type ?? "";
        const lastAlertId = latest?.alert_id ?? "";
        const lastKind = latest?.evidence_kind ?? "";
        let isActive = lastEventType === "ALERT_TRIGGER" || lastEventType === "ALERT_UPDATE";
        let isAcked = lastEventType === "ALERT_ACK";

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

        if (lastKind === "missing" && (isActive || isAcked) && !missingNow) {
          const inserted = await insertAlertEvent({
            alertId: lastAlertId,
            eventType: "ALERT_RESOLVE",
            ruleId: r.row.rule_id,
            ruleVersion: r.row.rule_version,
            deviceId,
            stationId: r.row.station_id ?? deviceStationId,
            severity: dsl.severity,
            title,
            message: messageText,
            evidence: {
              kind: "missing",
              timeField: dsl.timeField ?? "received",
              receivedTs: payload.received_ts,
              seq: payload.seq ?? null,
              missingSensorKeys: []
            },
            explain: "missing data recovered"
          });
          logger.info(
            { ruleId: r.row.rule_id, deviceId, alertId: lastAlertId, eventId: inserted.event_id },
            "missing alert resolved"
          );
          isActive = false;
          isAcked = false;
        }

        if (missingNow) {
          if (isActive || isAcked) {
            continue;
          }
          const missingKeys =
            governedMissingKeys.filter((k) => typeof metrics[k] !== "number");
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
              kind: "missing",
              timeField: dsl.timeField ?? "received",
              receivedTs: payload.received_ts,
              seq: payload.seq ?? null,
              missingSensorKeys: missingKeys,
              window: { type: dsl.window?.type ?? "duration", points: win.points.length, ready: windowReady }
            },
            explain: "missing data"
          });
          logger.info({ ruleId: r.row.rule_id, deviceId, alertId }, "missing alert triggered");
          continue;
        }

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
            if (isActive && lastKind === "rule") {
              await maybeActuateFieldAlarm({
                ruleId: r.row.rule_id,
                deviceId,
                severity: dsl.severity,
                evidenceKind: lastKind,
                reason: "active-alert-reconcile",
                ...(latest?.alert_id ? { alertId: latest.alert_id } : {}),
                stationId: latest?.station_id ?? r.row.station_id ?? deviceStationId,
                title: latest?.title ?? title,
                message: latest?.message ?? messageText
              });
            }
            continue;
          }
          if (isInsideCooldown(latest?.created_at, dsl.cooldown?.minutes)) {
            logger.info(
              { ruleId: r.row.rule_id, deviceId, cooldownMinutes: dsl.cooldown?.minutes },
              "alert trigger skipped by cooldown"
            );
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
              kind: "rule",
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
              kind: "rule",
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
      await evaluateCompetitionTiltProfile(payload);
    }
  });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "shutting down");
    await consumer.disconnect();
    await producer.disconnect();
    await pg.end();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

void main();
