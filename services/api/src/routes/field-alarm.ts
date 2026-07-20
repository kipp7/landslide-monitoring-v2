import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  competitionTiltProfileSchema,
  competitionTiltThresholdsSchema,
  computeCompetitionTiltDeviation,
  DEFAULT_COMPETITION_TILT_THRESHOLDS,
  readTiltVector,
  type CompetitionTiltProfile,
  type CompetitionTiltThresholds
} from "@lsmv2/rules";
import type { AppConfig } from "../config";
import { requirePermission, type AdminAuthConfig } from "../authz";
import { fail, ok } from "../http";
import type { PgPool } from "../postgres";
import { queryOne, withPgClient } from "../postgres";
import { enqueueOperationLog } from "../operation-log";

const fieldAlarmActionSchema = z
  .object({
    action: z.enum(["alarm_on", "alarm_off", "silence", "status", "ack", "resolve"]),
    reason: z.string().max(500).optional(),
    alertId: z.string().uuid().optional()
  })
  .strict();

const thresholdPatchSchema = z
  .object({
    highDeg: z.number().positive().max(45).optional(),
    criticalDeg: z.number().positive().max(90).optional(),
    recoveryDeg: z.number().nonnegative().max(45).optional(),
    triggerPoints: z.number().int().min(1).max(10).optional(),
    recoveryPoints: z.number().int().min(1).max(10).optional(),
    updateStepDeg: z.number().positive().max(10).optional()
  })
  .strict();

const competitionCaptureSchema = z
  .object({
    deviceIds: z.array(z.string().uuid()).min(1).max(100).optional(),
    thresholds: thresholdPatchSchema.optional()
  })
  .strict();

const competitionProfileUpdateSchema = z
  .object({
    enabled: z.boolean().optional(),
    thresholds: thresholdPatchSchema.optional()
  })
  .strict()
  .refine((value) => value.enabled !== undefined || value.thresholds !== undefined, {
    message: "enabled or thresholds is required"
  });

const COMPETITION_PROFILE_CONFIG_KEY = "field_alarm.competition_tilt_profile.v1";
const COMPETITION_RULE_NAME = "比赛演示相对倾角分级告警";
const COMPETITION_BASELINE_MAX_AGE_SECONDS = 30;

type FieldAlarmAction = z.infer<typeof fieldAlarmActionSchema>["action"];
type AlertLifecycleEventType = "ALERT_ACK" | "ALERT_RESOLVE";

type LatestAlertRow = {
  alert_id: string;
  status: "active" | "acked" | "resolved";
  severity: "low" | "medium" | "high" | "critical";
  title: string | null;
  message: string | null;
  device_id: string | null;
  station_id: string | null;
  rule_id: string | null;
  rule_version: number | null;
  evidence: unknown;
  last_event_at: string;
};

type ActuatorPayload = {
  available: boolean;
  dryRun?: boolean;
  state?: string;
  lastAction?: string | null;
  lastActionAt?: string | null;
  lastError?: string | null;
  detail?: string;
  yx75r?: unknown;
  tongxiao?: unknown;
};

type CompetitionDeviceStateRow = {
  device_id: string;
  device_name: string;
  station_id: string | null;
  state: unknown;
  updated_at: string;
};

function actuatorBaseUrl(config: AppConfig): string | null {
  const url = config.rk3568AlarmActuatorUrl?.trim();
  return url ? url.replace(/\/+$/, "") : null;
}

async function callActuator(
  config: AppConfig,
  path: string,
  init?: RequestInit
): Promise<ActuatorPayload> {
  const baseUrl = actuatorBaseUrl(config);
  if (!baseUrl) {
    return {
      available: false,
      dryRun: true,
      state: "not_configured",
      detail: "RK3568_ALARM_ACTUATOR_URL 未配置，平台已记录动作但不会触发现场声光。"
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, config.rk3568StatusHttpTimeoutMs);
  try {
    const res = await fetch(`${baseUrl}${path}`, {
      ...(init ?? {}),
      signal: controller.signal
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      return {
        available: false,
        state: "failed",
        lastError: typeof body.message === "string" ? body.message : `actuator http ${String(res.status)}`
      };
    }
    const payload: ActuatorPayload = {
      available: true,
      state: typeof body.state === "string" ? body.state : "unknown",
      lastAction: typeof body.lastAction === "string" ? body.lastAction : null,
      lastActionAt: typeof body.lastActionAt === "string" ? body.lastActionAt : null,
      lastError: typeof body.lastError === "string" ? body.lastError : null
    };
    if (typeof body.dryRun === "boolean") payload.dryRun = body.dryRun;
    if (typeof body.detail === "string") payload.detail = body.detail;
    if (body.yx75r && typeof body.yx75r === "object") payload.yx75r = body.yx75r;
    if (body.tongxiao && typeof body.tongxiao === "object") payload.tongxiao = body.tongxiao;
    return payload;
  } catch (err) {
    return {
      available: false,
      state: "unreachable",
      lastError: err instanceof Error ? err.message : String(err)
    };
  } finally {
    clearTimeout(timer);
  }
}

async function loadCompetitionProfile(pg: PgPool | null): Promise<CompetitionTiltProfile | null> {
  if (!pg) return null;
  return withPgClient(pg, async (client) => {
    const row = await queryOne<{ config_value: string | null }>(
      client,
      "SELECT config_value FROM system_configs WHERE config_key = $1",
      [COMPETITION_PROFILE_CONFIG_KEY]
    );
    if (!row?.config_value) return null;
    try {
      return competitionTiltProfileSchema.parse(JSON.parse(row.config_value) as unknown);
    } catch {
      return null;
    }
  });
}

async function ensureCompetitionRule(pg: PgPool): Promise<{ ruleId: string; ruleVersion: number }> {
  return withPgClient(pg, async (client) => {
    const existing = await queryOne<{ rule_id: string }>(
      client,
      "SELECT rule_id FROM alert_rules WHERE rule_name = $1 ORDER BY created_at ASC LIMIT 1",
      [COMPETITION_RULE_NAME]
    );
    const rule =
      existing ??
      (await queryOne<{ rule_id: string }>(
        client,
        `
          INSERT INTO alert_rules(rule_name, description, scope, is_active)
          VALUES ($1, $2, 'global', FALSE)
          RETURNING rule_id
        `,
        [COMPETITION_RULE_NAME, "真实倾角传感器相对当前姿态的比赛演示规则；由专用状态机执行并人工解除。"]
      ));
    if (!rule) throw new Error("competition alert rule creation failed");

    const ruleVersion = 1;
    const disabledDsl = {
      dslVersion: 1,
      name: COMPETITION_RULE_NAME,
      scope: { type: "global" },
      enabled: false,
      severity: "high",
      missing: { policy: "ignore" },
      when: { sensorKey: "tilt_x_deg", operator: ">=", value: 9999 },
      actions: [
        {
          type: "emit_alert",
          titleTemplate: "相对倾角告警",
          messageTemplate: "由比赛相对倾角状态机执行"
        }
      ]
    };
    await client.query(
      `
        INSERT INTO alert_rule_versions(
          rule_id, rule_version, dsl_version, dsl_json, conditions, severity, enabled
        )
        VALUES ($1, $2, 1, $3::jsonb, $4::jsonb, 'high', FALSE)
        ON CONFLICT (rule_id, rule_version) DO NOTHING
      `,
      [rule.rule_id, ruleVersion, JSON.stringify(disabledDsl), JSON.stringify(disabledDsl.when)]
    );
    await client.query("UPDATE alert_rules SET is_active = FALSE, updated_at = NOW() WHERE rule_id = $1", [rule.rule_id]);
    return { ruleId: rule.rule_id, ruleVersion };
  });
}

function mergeCompetitionThresholds(
  current: CompetitionTiltThresholds,
  patch?: z.infer<typeof thresholdPatchSchema>
): CompetitionTiltThresholds {
  return competitionTiltThresholdsSchema.parse({ ...current, ...(patch ?? {}) });
}

async function loadCompetitionProfileWithLiveState(pg: PgPool | null) {
  const profile = await loadCompetitionProfile(pg);
  if (!profile || !pg) return profile ? { ...profile, live: [] } : null;
  const deviceIds = profile.devices.map((device) => device.deviceId);
  const rows = await withPgClient(pg, async (client) =>
    client.query<{ device_id: string; state: unknown; updated_at: string }>(
      `
        SELECT
          device_id,
          state,
          to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at
        FROM device_state
        WHERE device_id = ANY($1::uuid[])
      `,
      [deviceIds]
    )
  );
  const liveByDevice = new Map(rows.rows.map((row) => [row.device_id, row]));
  return {
    ...profile,
    live: profile.devices.map((device) => {
      const row = liveByDevice.get(device.deviceId);
      const state = row?.state && typeof row.state === "object" ? (row.state as Record<string, unknown>) : {};
      const metrics = state.metrics && typeof state.metrics === "object" ? (state.metrics as Record<string, unknown>) : {};
      const current = readTiltVector(metrics);
      return {
        deviceId: device.deviceId,
        updatedAt: row?.updated_at ?? null,
        deviation: current ? computeCompetitionTiltDeviation(current, device.baseline) : null
      };
    })
  };
}

async function loadPhysicalAlarmAlerts(pg: PgPool | null): Promise<{
  active: LatestAlertRow[];
  acked: LatestAlertRow[];
}> {
  if (!pg) return { active: [], acked: [] };

  return withPgClient(pg, async (client) => {
    const rows = await client.query<LatestAlertRow>(
      `
        WITH latest AS (
          SELECT DISTINCT ON (alert_id)
            alert_id,
            event_type,
            severity,
            title,
            message,
            device_id,
            station_id,
            rule_id,
            rule_version,
            evidence,
            created_at AS last_event_at
          FROM alert_events
          ORDER BY alert_id, created_at DESC
        ),
        a AS (
          SELECT
            alert_id,
            CASE
              WHEN event_type IN ('ALERT_TRIGGER','ALERT_UPDATE') THEN 'active'
              WHEN event_type = 'ALERT_ACK' THEN 'acked'
              ELSE 'resolved'
            END AS status,
            severity,
            title,
            message,
            device_id,
            station_id,
            rule_id,
            rule_version,
            evidence,
            to_char(last_event_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS last_event_at
          FROM latest
        )
        SELECT *
        FROM a
        WHERE status IN ('active','acked')
          AND severity IN ('high','critical')
        ORDER BY last_event_at DESC
        LIMIT 20
      `
    );

    return {
      active: rows.rows.filter((row) => row.status === "active"),
      acked: rows.rows.filter((row) => row.status === "acked")
    };
  });
}

function toAlertDto(row: LatestAlertRow) {
  return {
    alertId: row.alert_id,
    status: row.status,
    severity: row.severity,
    title: row.title ?? "",
    message: row.message ?? "",
    deviceId: row.device_id,
    stationId: row.station_id,
    ruleId: row.rule_id ?? "",
    ruleVersion: row.rule_version ?? 0,
    evidence: row.evidence ?? {},
    lastEventAt: row.last_event_at
  };
}

function actuatorPathForAction(action: FieldAlarmAction): string {
  if (action === "status") return "/status";
  if (action === "ack") return "/silence";
  if (action === "resolve") return "/alarm_off";
  return `/${action}`;
}

function pickHighestPriorityAlert(alerts: LatestAlertRow[]): LatestAlertRow | null {
  const severityRank: Record<LatestAlertRow["severity"], number> = {
    low: 1,
    medium: 2,
    high: 3,
    critical: 4
  };
  return (
    alerts
      .slice()
      .sort(
        (a, b) =>
          severityRank[b.severity] - severityRank[a.severity] ||
          Date.parse(b.last_event_at) - Date.parse(a.last_event_at)
      )[0] ?? null
  );
}

async function appendAlertLifecycleEvent(
  pg: PgPool | null,
  alertId: string | undefined,
  eventType: AlertLifecycleEventType,
  notes: string
): Promise<{ alertId: string; eventId: string; eventType: AlertLifecycleEventType; createdAt: string } | null> {
  if (!pg || !alertId) return null;

  return withPgClient(pg, async (client) => {
    const latest = await queryOne<{
      rule_id: string | null;
      rule_version: number | null;
      device_id: string | null;
      station_id: string | null;
      severity: "low" | "medium" | "high" | "critical";
      title: string | null;
      message: string | null;
    }>(
      client,
      `
        SELECT rule_id, rule_version, device_id, station_id, severity, title, message
        FROM alert_events
        WHERE alert_id = $1
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [alertId]
    );
    if (!latest) return null;

    const inserted = await queryOne<{ event_id: string; created_at: string }>(
      client,
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
        alertId,
        eventType,
        latest.rule_id,
        latest.rule_version,
        latest.device_id,
        latest.station_id,
        latest.severity,
        latest.title ?? "",
        latest.message ?? "",
        JSON.stringify(notes ? { notes, source: "field_alarm_review" } : { source: "field_alarm_review" }),
        notes ? `field alarm review ${eventType.toLowerCase()} (${notes})` : `field alarm review ${eventType.toLowerCase()}`
      ]
    );

    if (!inserted) {
      throw new Error("insert field alarm lifecycle event failed (no row returned)");
    }

    return {
      alertId,
      eventId: inserted.event_id,
      eventType,
      createdAt: inserted.created_at
    };
  });
}

export function registerFieldAlarmRoutes(
  app: FastifyInstance,
  config: AppConfig,
  pg: PgPool | null
): void {
  const adminCfg: AdminAuthConfig = {
    adminApiToken: config.adminApiToken,
    jwtEnabled: Boolean(config.jwtAccessSecret)
  };

  app.get("/field-alarm/competition-profile", async (request, reply) => {
    const traceId = request.traceId;
    if (!(await requirePermission(adminCfg, pg, request, reply, "alert:view"))) return;
    if (!pg) {
      fail(reply, 503, "PostgreSQL 未配置", traceId);
      return;
    }
    ok(reply, { profile: await loadCompetitionProfileWithLiveState(pg) }, traceId);
  });

  app.post("/field-alarm/competition-profile/capture", async (request, reply) => {
    const traceId = request.traceId;
    if (!(await requirePermission(adminCfg, pg, request, reply, "alert:config"))) return;
    if (!pg) {
      fail(reply, 503, "PostgreSQL 未配置", traceId);
      return;
    }
    const parsed = competitionCaptureSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      fail(reply, 400, "参数错误", traceId, { field: "body", issues: parsed.error.issues });
      return;
    }

    const existing = await loadCompetitionProfile(pg);
    if (existing) {
      const alerts = await loadPhysicalAlarmAlerts(pg);
      const activeCompetitionAlerts = [...alerts.active, ...alerts.acked].filter(
        (alert) => alert.rule_id === existing.ruleId
      );
      if (activeCompetitionAlerts.length > 0) {
        fail(reply, 409, "请先完成人工复核并解除当前比赛告警，再重新采集基线", traceId, {
          alertIds: activeCompetitionAlerts.map((alert) => alert.alert_id)
        });
        return;
      }
    }
    let thresholds: CompetitionTiltThresholds;
    try {
      thresholds = mergeCompetitionThresholds(
        existing?.thresholds ?? DEFAULT_COMPETITION_TILT_THRESHOLDS,
        parsed.data.thresholds
      );
    } catch (err) {
      fail(reply, 400, "告警阈值无效", traceId, {
        reason: err instanceof Error ? err.message : String(err)
      });
      return;
    }

    const rows = await withPgClient(pg, async (client) =>
      client.query<CompetitionDeviceStateRow>(
        `
          SELECT
            d.device_id,
            d.device_name,
            d.station_id,
            ds.state,
            to_char(ds.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS updated_at
          FROM devices d
          JOIN device_state ds ON ds.device_id = d.device_id
          WHERE d.status <> 'revoked'
            AND d.device_type <> 'alarm_terminal'
            AND ($1::uuid[] IS NULL OR d.device_id = ANY($1::uuid[]))
          ORDER BY d.device_name ASC
        `,
        [parsed.data.deviceIds ?? null]
      )
    );

    const now = new Date();
    const skipped: { deviceId: string; deviceName: string; reason: string }[] = [];
    const devices: CompetitionTiltProfile["devices"] = [];
    for (const row of rows.rows) {
      const state = row.state && typeof row.state === "object" ? (row.state as Record<string, unknown>) : {};
      const metrics = state.metrics && typeof state.metrics === "object" ? (state.metrics as Record<string, unknown>) : {};
      const baseline = readTiltVector(metrics);
      const updatedMs = Date.parse(row.updated_at);
      if (!baseline) {
        skipped.push({ deviceId: row.device_id, deviceName: row.device_name, reason: "缺少完整倾角 X/Y/Z" });
        continue;
      }
      if (!Number.isFinite(updatedMs) || now.getTime() - updatedMs > COMPETITION_BASELINE_MAX_AGE_SECONDS * 1000) {
        skipped.push({ deviceId: row.device_id, deviceName: row.device_name, reason: "倾角数据超过 30 秒，未用于基线" });
        continue;
      }
      devices.push({
        deviceId: row.device_id,
        deviceName: row.device_name,
        stationId: row.station_id,
        baseline,
        capturedAt: row.updated_at
      });
    }
    if (devices.length === 0) {
      fail(reply, 409, "没有可用于基线采集的新鲜倾角数据", traceId, { skipped });
      return;
    }

    await withPgClient(pg, async (client) => {
      await client.query(
        `
          UPDATE alert_rules r
          SET is_active = FALSE, updated_at = NOW()
          WHERE r.rule_id IN (
            SELECT DISTINCT v.rule_id
            FROM alert_rule_versions v
            WHERE COALESCE(v.dsl_json->>'name', '') LIKE '现场倾角突变声光联动%'
          )
        `
      );
    });
    const rule = await ensureCompetitionRule(pg);
    const timestamp = now.toISOString();
    const profile = competitionTiltProfileSchema.parse({
      schemaVersion: 1,
      mode: "competition_relative_tilt",
      enabled: true,
      ruleId: rule.ruleId,
      ruleVersion: rule.ruleVersion,
      capturedAt: timestamp,
      updatedAt: timestamp,
      thresholds,
      devices
    });
    await withPgClient(pg, async (client) => {
      await client.query(
        `
          INSERT INTO system_configs(config_key, config_value, config_type, description, is_public)
          VALUES ($1, $2, 'json', $3, FALSE)
          ON CONFLICT (config_key) DO UPDATE SET
            config_value = EXCLUDED.config_value,
            config_type = EXCLUDED.config_type,
            description = EXCLUDED.description,
            updated_at = NOW()
        `,
        [
          COMPETITION_PROFILE_CONFIG_KEY,
          JSON.stringify(profile),
          "比赛演示真实倾角相对基线配置；独立于生产规则，告警需人工解除。"
        ]
      );
    });

    void enqueueOperationLog(pg, request, {
      module: "field_alarm",
      action: "capture_competition_tilt_baseline",
      description: "capture real tilt baseline for competition alert profile",
      status: "success",
      requestData: parsed.data,
      responseData: { profile, skipped }
    });
    ok(reply, { profile, skipped }, traceId);
  });

  app.put("/field-alarm/competition-profile", async (request, reply) => {
    const traceId = request.traceId;
    if (!(await requirePermission(adminCfg, pg, request, reply, "alert:config"))) return;
    if (!pg) {
      fail(reply, 503, "PostgreSQL 未配置", traceId);
      return;
    }
    const parsed = competitionProfileUpdateSchema.safeParse(request.body);
    if (!parsed.success) {
      fail(reply, 400, "参数错误", traceId, { field: "body", issues: parsed.error.issues });
      return;
    }
    const current = await loadCompetitionProfile(pg);
    if (!current) {
      fail(reply, 404, "请先采集当前倾角基线", traceId);
      return;
    }
    let thresholds: CompetitionTiltThresholds;
    try {
      thresholds = mergeCompetitionThresholds(current.thresholds, parsed.data.thresholds);
    } catch (err) {
      fail(reply, 400, "告警阈值无效", traceId, {
        reason: err instanceof Error ? err.message : String(err)
      });
      return;
    }
    const profile = competitionTiltProfileSchema.parse({
      ...current,
      enabled: parsed.data.enabled ?? current.enabled,
      thresholds,
      updatedAt: new Date().toISOString()
    });
    await withPgClient(pg, async (client) => {
      await client.query(
        "UPDATE system_configs SET config_value = $2, updated_at = NOW() WHERE config_key = $1",
        [COMPETITION_PROFILE_CONFIG_KEY, JSON.stringify(profile)]
      );
    });
    void enqueueOperationLog(pg, request, {
      module: "field_alarm",
      action: "update_competition_tilt_profile",
      description: "update competition tilt alert profile",
      status: "success",
      requestData: parsed.data,
      responseData: profile
    });
    ok(reply, { profile }, traceId);
  });

  app.get("/field-alarm/status", async (request, reply) => {
    const traceId = request.traceId;
    if (!(await requirePermission(adminCfg, pg, request, reply, "alert:view"))) return;

    const [alerts, actuator, competitionProfile] = await Promise.all([
      loadPhysicalAlarmAlerts(pg),
      callActuator(config, "/status", { method: "GET" }),
      loadCompetitionProfileWithLiveState(pg)
    ]);

    const actuatorActive = actuator.state === "active" || actuator.lastAction === "alarm_on";
    const activeUnsilencedCount = alerts.active.length;
    const active = activeUnsilencedCount > 0 || actuatorActive;
    const silenced = !active && alerts.acked.length > 0;
    ok(
      reply,
      {
        active,
        silenced,
        state:
          active
            ? "active"
            : silenced
              ? "under_review"
              : "normal",
        activeCount: activeUnsilencedCount,
        ackedCount: alerts.acked.length,
        latestAlert: alerts.active[0] ? toAlertDto(alerts.active[0]) : alerts.acked[0] ? toAlertDto(alerts.acked[0]) : null,
        alerts: [...alerts.active, ...alerts.acked].map(toAlertDto),
        actuator,
        competitionProfile
      },
      traceId
    );
  });

  app.post("/field-alarm/actions", async (request, reply) => {
    const traceId = request.traceId;
    if (!(await requirePermission(adminCfg, pg, request, reply, "alert:handle"))) return;

    const parsed = fieldAlarmActionSchema.safeParse(request.body);
    if (!parsed.success) {
      fail(reply, 400, "参数错误", traceId, { field: "body", issues: parsed.error.issues });
      return;
    }

    const { action, reason, alertId } = parsed.data;
    let actuatorPath = actuatorPathForAction(action);
    let actuatorContext: Record<string, unknown> = {
      source: "api",
      reason: reason ?? "manual desktop action",
      alertId: alertId ?? null
    };

    if ((action === "ack" || action === "resolve") && alertId) {
      const currentAlerts = await loadPhysicalAlarmAlerts(pg);
      const remainingActive = currentAlerts.active.filter((alert) => alert.alert_id !== alertId);
      const remainingAcked = currentAlerts.acked.filter((alert) => alert.alert_id !== alertId);
      const target = pickHighestPriorityAlert(remainingActive);
      if (target) {
        actuatorPath = "/alarm_on";
        actuatorContext = {
          source: "api-alert-aggregate",
          reason: `remaining active alarms after ${action}`,
          alertId: target.alert_id,
          stationId: target.station_id,
          severity: target.severity,
          title: target.title ?? "现场监测告警",
          message: target.message ?? "仍有其他节点处于告警状态"
        };
      } else if (action === "ack" || remainingAcked.length > 0) {
        actuatorPath = "/silence";
      } else {
        actuatorPath = "/alarm_off";
      }
    }

    const requestInit: RequestInit =
      action === "status"
        ? { method: "GET" }
        : {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(actuatorContext)
          };
    const actuator = await callActuator(config, actuatorPath, requestInit);
    const actuatorAccepted = actuator.state !== "failed" && actuator.state !== "unreachable";
    const alertEvent =
      actuatorAccepted && (action === "ack" || action === "resolve")
        ? await appendAlertLifecycleEvent(
            pg,
            alertId,
            action === "ack" ? "ALERT_ACK" : "ALERT_RESOLVE",
            reason ?? (action === "ack" ? "人工确认复核，先静音保留事件。" : "人工复核确认，解除声光报警。")
          )
        : null;

    void enqueueOperationLog(pg, request, {
      module: "field_alarm",
      action,
      description: "field alarm actuator action",
      status: actuatorAccepted ? "success" : "fail",
      requestData: { action, reason: reason ?? null, alertId: alertId ?? null },
      responseData: { actuator, alertEvent },
      targetType: alertId ? "alert" : "actuator",
      targetId: alertId ?? null
    });

    ok(
      reply,
      {
        action,
        accepted: actuatorAccepted,
        actuator,
        alertEvent
      },
      traceId
    );
  });
}
