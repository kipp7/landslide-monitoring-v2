import type { FastifyInstance } from "fastify";
import { z } from "zod";
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
  const timer = setTimeout(() => controller.abort(), config.rk3568StatusHttpTimeoutMs);
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
        lastError: typeof body.message === "string" ? body.message : `actuator http ${res.status}`
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

  app.get("/field-alarm/status", async (request, reply) => {
    const traceId = request.traceId;
    if (!(await requirePermission(adminCfg, pg, request, reply, "alert:view"))) return;

    const [alerts, actuator] = await Promise.all([
      loadPhysicalAlarmAlerts(pg),
      callActuator(config, "/status", { method: "GET" })
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
        actuator
      },
      traceId
    );
  });

  app.post("/field-alarm/actions", async (request, reply) => {
    const traceId = request.traceId;
    if (!(await requirePermission(adminCfg, pg, request, reply, "alert:handle"))) return;

    const parsed = fieldAlarmActionSchema.safeParse(request.body);
    if (!parsed.success) {
      fail(reply, 400, "鍙傛暟閿欒", traceId, { field: "body", issues: parsed.error.issues });
      return;
    }

    const { action, reason, alertId } = parsed.data;
    const requestInit: RequestInit =
      action === "status"
        ? { method: "GET" }
        : {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              source: "api",
              reason: reason ?? "manual desktop action",
              alertId: alertId ?? null
            })
          };
    const actuator = await callActuator(config, actuatorPathForAction(action), requestInit);
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

    enqueueOperationLog(pg, request, {
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


