import type { ClickHouseClient } from "@clickhouse/client";
import type { PoolClient } from "pg";
import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import type { AppConfig } from "../config";
import { requirePermission, type AdminAuthConfig } from "../authz";
import { fail, ok } from "../http";
import type { PgPool } from "../postgres";
import { queryOne, withPgClient } from "../postgres";

async function checkClickhouse(ch: ClickHouseClient): Promise<{ status: string; error?: string }> {
  try {
    const res = await ch.query({ query: "SELECT 1 AS ok", format: "JSONEachRow" });
    await res.json();
    return { status: "healthy" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { status: "unhealthy", error: msg };
  }
}

async function checkPostgres(pg: PgPool | null): Promise<{ status: string; error?: string }> {
  if (!pg) return { status: "not_configured" };
  try {
    const okRow = await withPgClient(pg, async (client) => queryOne<{ ok: number }>(client, "SELECT 1 AS ok", []));
    return okRow ? { status: "healthy" } : { status: "unhealthy", error: "no row returned" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { status: "unhealthy", error: msg };
  }
}

function utcStartOfDay(d: Date): Date {
  const x = new Date(d.getTime());
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

function utcTomorrowStart(d: Date): Date {
  const x = utcStartOfDay(d);
  x.setUTCDate(x.getUTCDate() + 1);
  return x;
}

function toClickhouseDateTime64Utc(d: Date): string {
  return d.toISOString().replace("T", " ").replace("Z", "");
}

function legacyOk(reply: FastifyReply, data: unknown): void {
  void reply.code(200).send(data);
}

const updateConfigsSchema = z
  .object({
    configs: z.array(z.object({ key: z.string().min(1), value: z.string() }).strict()).min(1)
  })
  .strict();

const successNotificationPolicySchema = z.enum(["silent", "always_notify"]);
const commandSuccessNotificationPolicySchema = z
  .object({
    systemDefault: successNotificationPolicySchema,
    commandTypeDefaults: z.record(z.string().min(1), successNotificationPolicySchema)
  })
  .strict();

const updateCommandSuccessNotificationPolicySchema = z
  .object({
    systemDefault: successNotificationPolicySchema,
    commandTypeDefaults: z.record(z.string().min(1), successNotificationPolicySchema)
  })
  .strict();

const COMMAND_SUCCESS_NOTIFICATION_SYSTEM_DEFAULT_KEY = "command.success_notification.system_default";
const COMMAND_SUCCESS_NOTIFICATION_COMMAND_TYPE_DEFAULTS_KEY = "command.success_notification.command_type_defaults";
const DEFAULT_COMMAND_SUCCESS_NOTIFICATION_POLICY = {
  systemDefault: "silent" as const,
  commandTypeDefaults: {
    set_config: "always_notify" as const,
    reboot: "always_notify" as const,
    restart_device: "always_notify" as const,
    deactivate_device: "always_notify" as const,
    set_sampling_interval: "always_notify" as const,
    manual_collect: "always_notify" as const,
    "huawei:reboot": "always_notify" as const
  }
};

const operationLogsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(20),
  userId: z.string().uuid().optional(),
  module: z.string().optional(),
  action: z.string().optional(),
  startTime: z.string().datetime().optional(),
  endTime: z.string().datetime().optional()
});

type SystemCheck = {
  status: string;
  error?: string;
};

type SystemStatusItemKey = "postgres" | "clickhouse" | "kafka";
type SystemStatusItemState = "healthy" | "degraded" | "not_configured" | "unknown";

type SystemStatusItem = {
  key: SystemStatusItemKey;
  label: string;
  status: SystemStatusItemState;
  detail: string;
};

type SystemStatusData = {
  uptimeS: number;
  postgres: SystemCheck;
  clickhouse: SystemCheck;
  kafka: SystemCheck;
  emqx: { status: string };
  source: "health_summary";
  note: string;
  items: SystemStatusItem[];
};

type DashboardSummaryData = {
  todayDataCount: number;
  onlineDevices: number;
  offlineDevices: number;
  pendingAlerts: number;
  todayAlerts: number;
  alertsBySeverity: Record<"low" | "medium" | "high" | "critical", number>;
  stations: number;
  freshDevices: number;
  totalDevices: number;
  lastUpdatedAt: string;
};

type DeskDashboardSummaryData = {
  stationCount: number;
  deviceOnlineCount: number;
  alertCountToday: number;
  systemHealthPercent: number;
};

type DashboardWeeklyTrendData = {
  labels: string[];
  rainfallMm: number[];
  alertCount: number[];
  source: "derived_summary";
  note: string;
};

type CommandSuccessNotificationPolicy = z.infer<typeof commandSuccessNotificationPolicySchema>;

function healthStateFromCheck(input: SystemCheck): SystemStatusItemState {
  if (input.status === "healthy" || input.status === "configured") return "healthy";
  if (input.status === "unhealthy") return "degraded";
  if (input.status === "not_configured") return "not_configured";
  return "unknown";
}

function detailFromCheck(input: SystemCheck): string {
  return input.error ? `${input.status}: ${input.error}` : input.status;
}

function buildSystemStatusItems(postgres: SystemCheck, clickhouse: SystemCheck, kafka: SystemCheck): SystemStatusItem[] {
  return [
    {
      key: "postgres",
      label: "PostgreSQL",
      status: healthStateFromCheck(postgres),
      detail: detailFromCheck(postgres)
    },
    {
      key: "clickhouse",
      label: "ClickHouse",
      status: healthStateFromCheck(clickhouse),
      detail: detailFromCheck(clickhouse)
    },
    {
      key: "kafka",
      label: "Kafka",
      status: healthStateFromCheck(kafka),
      detail: detailFromCheck(kafka)
    }
  ];
}

async function buildSystemStatusData(
  config: AppConfig,
  ch: ClickHouseClient,
  pg: PgPool | null
): Promise<SystemStatusData> {
  const postgres = await checkPostgres(pg);
  const clickhouse = await checkClickhouse(ch);
  const kafka: SystemCheck = { status: config.kafkaBrokers && config.kafkaBrokers.length > 0 ? "configured" : "not_configured" };

  return {
    uptimeS: Math.floor(process.uptime()),
    postgres,
    clickhouse,
    kafka,
    emqx: { status: "unknown" },
    source: "health_summary",
    note: "当前展示的是服务健康摘要，不表示真实 CPU/内存/磁盘占用。",
    items: buildSystemStatusItems(postgres, clickhouse, kafka)
  };
}

async function queryTodayDataCount(config: AppConfig, ch: ClickHouseClient, start: Date): Promise<number> {
  try {
    const res = await ch.query({
      query: `
        SELECT count()::UInt64 AS c
        FROM ${config.clickhouseDatabase}.${config.clickhouseTable}
        WHERE received_ts >= {start:DateTime64(3, 'UTC')}
      `,
      query_params: { start: toClickhouseDateTime64Utc(start) },
      format: "JSONEachRow"
    });
    const rows: { c: number | string }[] = await res.json();
    const value = rows[0]?.c;
    return typeof value === "string" ? Number(value) : value ?? 0;
  } catch {
    return 0;
  }
}

async function buildDashboardSummaryData(
  config: AppConfig,
  ch: ClickHouseClient,
  pg: PgPool
): Promise<DashboardSummaryData> {
  const now = new Date();
  const start = utcStartOfDay(now);
  const todayDataCount = await queryTodayDataCount(config, ch, start);
  const freshThreshold = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const data = await withPgClient(pg, async (client) => {
    const devices = await client.query<{ status: string; count: string }>(
      `
        SELECT status, count(*)::text AS count
        FROM devices
        GROUP BY status
      `
    );
    const onlineDevices = await queryOne<{ count: string }>(
      client,
      `
        SELECT count(*)::text AS count
        FROM devices
        WHERE status = 'active'
          AND last_seen_at IS NOT NULL
          AND last_seen_at >= $1
      `,
      [freshThreshold]
    );
    const freshDevices = await queryOne<{ count: string }>(
      client,
      `
        SELECT count(*)::text AS count
        FROM devices
        WHERE status != 'revoked'
          AND last_seen_at IS NOT NULL
          AND last_seen_at >= $1
      `,
      [freshThreshold]
    );
    const stations = await queryOne<{ count: string }>(client, "SELECT count(*)::text AS count FROM stations", []);

    const alerts = await client.query<{ status: string; severity: string; count: string }>(
      `
        WITH latest AS (
          SELECT DISTINCT ON (alert_id)
            alert_id,
            event_type,
            severity,
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
            severity
          FROM latest
        )
        SELECT status, severity, count(*)::text AS count
        FROM a
        GROUP BY status, severity
      `
    );
    const todayAlerts = await queryOne<{ count: string }>(
      client,
      `
        SELECT count(DISTINCT alert_id)::text AS count
        FROM alert_events
        WHERE created_at >= $1
          AND created_at < $2
          AND event_type IN ('ALERT_TRIGGER', 'ALERT_UPDATE')
      `,
      [start, now]
    );

    return {
      devices: devices.rows,
      onlineDevices: Number(onlineDevices?.count ?? "0"),
      freshDevices: Number(freshDevices?.count ?? "0"),
      stations: Number(stations?.count ?? "0"),
      todayAlerts: Number(todayAlerts?.count ?? "0"),
      alerts: alerts.rows
    };
  });

  const deviceCounts: Record<string, number> = {};
  for (const row of data.devices) deviceCounts[row.status] = Number(row.count);
  const totalDevices = Math.max(0, (deviceCounts.active ?? 0) + (deviceCounts.inactive ?? 0));
  const onlineDevices = data.onlineDevices;
  const offlineDevices = Math.max(0, totalDevices - onlineDevices);

  const alertsBySeverity: Record<"low" | "medium" | "high" | "critical", number> = {
    low: 0,
    medium: 0,
    high: 0,
    critical: 0
  };
  let pendingAlerts = 0;
  for (const row of data.alerts) {
    const count = Number(row.count);
    if (row.status === "active" || row.status === "acked") pendingAlerts += count;
    if (row.status === "active" || row.status === "acked") {
      const severity = row.severity as keyof typeof alertsBySeverity;
      alertsBySeverity[severity] = (alertsBySeverity[severity] ?? 0) + count;
    }
  }

  return {
    todayDataCount,
    onlineDevices,
    offlineDevices,
    pendingAlerts,
    todayAlerts: data.todayAlerts,
    alertsBySeverity,
    stations: data.stations,
    freshDevices: data.freshDevices,
    totalDevices,
    lastUpdatedAt: now.toISOString()
  };
}

function buildDeskDashboardSummary(summary: DashboardSummaryData): DeskDashboardSummaryData {
  const totalDevices = Math.max(1, summary.totalDevices);
  const availability = summary.onlineDevices / totalDevices;
  const freshness = summary.freshDevices / totalDevices;

  const weightedRiskLoad =
    (summary.alertsBySeverity.low * 0.05) +
    (summary.alertsBySeverity.medium * 0.1) +
    (summary.alertsBySeverity.high * 0.18) +
    (summary.alertsBySeverity.critical * 0.28);
  const riskScore = Math.max(0, 1 - Math.min(0.8, weightedRiskLoad));

  const healthScore = availability * 0.4 + freshness * 0.2 + riskScore * 0.4;

  return {
    stationCount: summary.stations,
    deviceOnlineCount: summary.onlineDevices,
    alertCountToday: summary.todayAlerts,
    systemHealthPercent: Math.max(0, Math.min(100, Math.round(healthScore * 100)))
  };
}

async function buildDashboardWeeklyTrendData(
  config: AppConfig,
  ch: ClickHouseClient,
  pg: PgPool | null
): Promise<DashboardWeeklyTrendData> {
  const now = new Date();
  const start = utcStartOfDay(new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000));
  const end = utcTomorrowStart(now);
  const dayKeys = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(start.getTime() + index * 24 * 60 * 60 * 1000);
    return day.toISOString().slice(0, 10);
  });

  const rainfallByDay = new Map<string, number>();
  const alertCountByDay = new Map<string, number>();
  const noteParts = ["近 7 天按 telemetry `rainfall_mm` 与 `alert_events` 聚合生成，缺失日补 0。"];

  try {
    const res = await ch.query({
      query: `
        SELECT
          formatDateTime(toStartOfDay(received_ts), '%F', 'UTC') AS day,
          sum(COALESCE(value_f64, toFloat64(value_i64))) AS rainfall
        FROM ${config.clickhouseDatabase}.${config.clickhouseTable}
        WHERE received_ts >= {start:DateTime64(3, 'UTC')}
          AND received_ts < {end:DateTime64(3, 'UTC')}
          AND sensor_key = 'rainfall_mm'
        GROUP BY day
        ORDER BY day
      `,
      query_params: { start: toClickhouseDateTime64Utc(start), end: toClickhouseDateTime64Utc(end) },
      format: "JSONEachRow"
    });
    const rows: Array<{ day: string; rainfall: number | string | null }> = await res.json();
    for (const row of rows) {
      const value = typeof row.rainfall === "string" ? Number(row.rainfall) : row.rainfall ?? 0;
      rainfallByDay.set(row.day, Number(value.toFixed(2)));
    }
  } catch {
    noteParts.push("雨量聚合失败时已回退为 0。");
  }

  if (!pg) {
    noteParts.push("未配置 PostgreSQL，告警数已回退为 0。");
  } else {
    try {
      const rows = await withPgClient(pg, async (client) => {
        const res = await client.query<{ day: string; alert_count: string }>(
          `
            SELECT
              to_char(date_trunc('day', created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day,
              count(DISTINCT alert_id)::text AS alert_count
            FROM alert_events
            WHERE created_at >= $1
              AND created_at < $2
              AND event_type IN ('ALERT_TRIGGER', 'ALERT_UPDATE')
            GROUP BY 1
            ORDER BY 1
          `,
          [start, end]
        );
        return res.rows;
      });
      for (const row of rows) {
        alertCountByDay.set(row.day, Number(row.alert_count));
      }
    } catch {
      noteParts.push("告警聚合失败时已回退为 0。");
    }
  }

  return {
    labels: dayKeys.map((day) => day.slice(5)),
    rainfallMm: dayKeys.map((day) => rainfallByDay.get(day) ?? 0),
    alertCount: dayKeys.map((day) => alertCountByDay.get(day) ?? 0),
    source: "derived_summary",
    note: noteParts.join(" ")
  };
}

function parseCommandTypeDefaults(
  raw: string | null | undefined
): CommandSuccessNotificationPolicy["commandTypeDefaults"] {
  if (!raw || !raw.trim()) return { ...DEFAULT_COMMAND_SUCCESS_NOTIFICATION_POLICY.commandTypeDefaults };
  try {
    const parsed = JSON.parse(raw) as unknown;
    const checked = z.record(z.string().min(1), successNotificationPolicySchema).safeParse(parsed);
    if (!checked.success) return { ...DEFAULT_COMMAND_SUCCESS_NOTIFICATION_POLICY.commandTypeDefaults };
    return checked.data;
  } catch {
    return { ...DEFAULT_COMMAND_SUCCESS_NOTIFICATION_POLICY.commandTypeDefaults };
  }
}

async function loadCommandSuccessNotificationPolicy(client: PoolClient): Promise<CommandSuccessNotificationPolicy> {
  const rows = await client.query<{ config_key: string; config_value: string | null }>(
    `
      SELECT config_key, config_value
      FROM system_configs
      WHERE config_key IN ($1, $2)
    `,
    [COMMAND_SUCCESS_NOTIFICATION_SYSTEM_DEFAULT_KEY, COMMAND_SUCCESS_NOTIFICATION_COMMAND_TYPE_DEFAULTS_KEY]
  );
  const byKey = new Map(rows.rows.map((row) => [row.config_key, row.config_value] as const));
  const systemDefaultParsed = successNotificationPolicySchema.safeParse(byKey.get(COMMAND_SUCCESS_NOTIFICATION_SYSTEM_DEFAULT_KEY));
  return {
    systemDefault: systemDefaultParsed.success
      ? systemDefaultParsed.data
      : DEFAULT_COMMAND_SUCCESS_NOTIFICATION_POLICY.systemDefault,
    commandTypeDefaults: parseCommandTypeDefaults(byKey.get(COMMAND_SUCCESS_NOTIFICATION_COMMAND_TYPE_DEFAULTS_KEY))
  };
}

async function saveCommandSuccessNotificationPolicy(
  client: PoolClient,
  input: CommandSuccessNotificationPolicy
): Promise<void> {
  await client.query(
    `
      INSERT INTO system_configs (config_key, config_value, config_type, description, is_public)
      VALUES
        ($1, $2, 'string', '命令成功通知系统默认策略', FALSE),
        ($3, $4, 'json', '命令成功通知按 command_type 的默认策略表', FALSE)
      ON CONFLICT (config_key) DO UPDATE
      SET
        config_value = EXCLUDED.config_value,
        config_type = EXCLUDED.config_type,
        description = EXCLUDED.description,
        updated_at = NOW()
    `,
    [
      COMMAND_SUCCESS_NOTIFICATION_SYSTEM_DEFAULT_KEY,
      input.systemDefault,
      COMMAND_SUCCESS_NOTIFICATION_COMMAND_TYPE_DEFAULTS_KEY,
      JSON.stringify(input.commandTypeDefaults)
    ]
  );
}

export function registerSystemRoutes(
  app: FastifyInstance,
  config: AppConfig,
  ch: ClickHouseClient,
  pg: PgPool | null
): void {
  const adminCfg: AdminAuthConfig = { adminApiToken: config.adminApiToken, jwtEnabled: Boolean(config.jwtAccessSecret) };

  app.get("/system/configs", async (request, reply) => {
    const traceId = request.traceId;
    if (!pg) {
      fail(reply, 503, "PostgreSQL 未配置", traceId);
      return;
    }

    const rows = await withPgClient(pg, async (client) => {
      const res = await client.query<{
        config_key: string;
        config_value: string | null;
        config_type: string;
        description: string | null;
        updated_at: string;
      }>(
        `
          SELECT
            config_key,
            config_value,
            config_type,
            description,
            to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at
          FROM system_configs
          WHERE is_public = TRUE
          ORDER BY config_key
        `
      );
      return res.rows;
    });

    ok(
      reply,
      {
        list: rows.map((r) => ({
          key: r.config_key,
          value: r.config_value ?? "",
          type: r.config_type,
          description: r.description ?? "",
          updatedAt: r.updated_at
        }))
      },
      traceId
    );
  });

  app.put("/system/configs", async (request, reply) => {
    const traceId = request.traceId;
    if (!(await requirePermission(adminCfg, pg, request, reply, "system:config"))) return;
    if (!pg) {
      fail(reply, 503, "PostgreSQL 未配置", traceId);
      return;
    }

    const parseBody = updateConfigsSchema.safeParse(request.body);
    if (!parseBody.success) {
      fail(reply, 400, "参数错误", traceId, { field: "body", issues: parseBody.error.issues });
      return;
    }

    const unique = new Map<string, string>();
    for (const c of parseBody.data.configs) unique.set(c.key, c.value);
    const configs = Array.from(unique.entries()).map(([key, value]) => ({ key, value }));

    const updated = await withPgClient(pg, async (client) => {
      await client.query("BEGIN");
      try {
        const keys = configs.map((c) => c.key);
        const existing = await client.query<{ config_key: string }>(
          "SELECT config_key FROM system_configs WHERE config_key = ANY($1::text[])",
          [keys]
        );
        const exists = new Set(existing.rows.map((r) => r.config_key));
        const missing = keys.filter((k) => !exists.has(k));
        if (missing.length > 0) {
          await client.query("ROLLBACK");
          return { ok: false as const, missing };
        }

        for (const c of configs) {
          await client.query("UPDATE system_configs SET config_value=$1, updated_at=NOW() WHERE config_key=$2", [
            c.value,
            c.key
          ]);
        }

        await client.query("COMMIT");
        return { ok: true as const, updated: configs.length };
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    });

    if (!updated.ok) {
      fail(reply, 404, "资源不存在", traceId, { missingKeys: updated.missing });
      return;
    }

    void withPgClient(pg, async (client) => {
      await client.query(
        `
          INSERT INTO operation_logs (user_id, username, module, action, description, request_data, response_data, ip_address, user_agent, status)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `,
        [
          request.user?.userId ?? null,
          request.user?.username ?? "admin",
          "system",
          "update_configs",
          "update system configs",
          parseBody.data,
          { updated: updated.updated },
          request.ip,
          typeof request.headers["user-agent"] === "string" ? request.headers["user-agent"] : null,
          "success"
        ]
      );
    }).catch(() => undefined);

    ok(reply, { updated: updated.updated }, traceId);
  });

  app.get("/system/command-success-notification-policy", async (request, reply) => {
    const traceId = request.traceId;
    if (!(await requirePermission(adminCfg, pg, request, reply, "system:config"))) return;
    if (!pg) {
      fail(reply, 503, "PostgreSQL 未配置", traceId);
      return;
    }

    const policy = await withPgClient(pg, async (client) => loadCommandSuccessNotificationPolicy(client));
    ok(reply, policy, traceId);
  });

  app.put("/system/command-success-notification-policy", async (request, reply) => {
    const traceId = request.traceId;
    if (!(await requirePermission(adminCfg, pg, request, reply, "system:config"))) return;
    if (!pg) {
      fail(reply, 503, "PostgreSQL 未配置", traceId);
      return;
    }

    const parseBody = updateCommandSuccessNotificationPolicySchema.safeParse(request.body);
    if (!parseBody.success) {
      fail(reply, 400, "参数错误", traceId, { field: "body", issues: parseBody.error.issues });
      return;
    }

    const policy = parseBody.data;
    const previousPolicy = await withPgClient(pg, async (client) => loadCommandSuccessNotificationPolicy(client));
    await withPgClient(pg, async (client) => {
      await client.query("BEGIN");
      try {
        await saveCommandSuccessNotificationPolicy(client, policy);
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    });

    void withPgClient(pg, async (client) => {
      await client.query(
        `
          INSERT INTO operation_logs (user_id, username, module, action, description, request_data, response_data, ip_address, user_agent, status)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `,
        [
          request.user?.userId ?? null,
          request.user?.username ?? "admin",
          "system",
          "update_command_success_notification_policy",
          "update command success notification policy",
          { previousPolicy, nextPolicy: policy },
          { updatedPolicy: policy },
          request.ip,
          typeof request.headers["user-agent"] === "string" ? request.headers["user-agent"] : null,
          "success"
        ]
      );
    }).catch(() => undefined);

    ok(reply, policy, traceId);
  });

  app.get("/system/logs/operation", async (request, reply) => {
    const traceId = request.traceId;
    if (!(await requirePermission(adminCfg, pg, request, reply, "system:log"))) return;
    if (!pg) {
      fail(reply, 503, "PostgreSQL 未配置", traceId);
      return;
    }

    const parseQuery = operationLogsQuerySchema.safeParse(request.query);
    if (!parseQuery.success) {
      fail(reply, 400, "参数错误", traceId, { field: "query", issues: parseQuery.error.issues });
      return;
    }

    const { page, pageSize, userId, module, action, startTime, endTime } = parseQuery.data;
    const offset = (page - 1) * pageSize;

    const where: string[] = [];
    const params: unknown[] = [];
    const add = (sql: string, val: unknown) => {
      params.push(val);
      where.push(sql.replace("$X", "$" + String(params.length)));
    };

    if (userId) add("user_id = $X", userId);
    if (module) add("module = $X", module);
    if (action) add("action = $X", action);
    if (startTime) add("created_at >= $X", new Date(startTime));
    if (endTime) add("created_at <= $X", new Date(endTime));

    const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

    const data = await withPgClient(pg, async (client) => {
      const totalRow = await queryOne<{ total: string }>(
        client,
        `SELECT count(*)::text AS total FROM operation_logs ${whereSql}`,
        params
      );
      const total = Number(totalRow?.total ?? "0");

      const res = await client.query<{
        id: string;
        user_id: string | null;
        username: string | null;
        module: string;
        action: string;
        target_type: string | null;
        target_id: string | null;
        description: string | null;
        request_data: unknown;
        response_data: unknown;
        ip_address: string | null;
        user_agent: string | null;
        status: string;
        error_message: string | null;
        created_at: string;
      }>(
        `
          SELECT
            id::text AS id,
            user_id,
            username,
            module,
            action,
            target_type,
            target_id,
            description,
            request_data,
            response_data,
            ip_address,
            user_agent,
            status,
            error_message,
            to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at
          FROM operation_logs
          ${whereSql}
          ORDER BY created_at DESC, id DESC
          LIMIT $${String(params.length + 1)} OFFSET $${String(params.length + 2)}
        `,
        [...params, pageSize, offset]
      );

      return { total, rows: res.rows };
    });

    ok(
      reply,
      {
        page,
        pageSize,
        total: data.total,
        list: data.rows.map((r) => ({
          id: r.id,
          userId: r.user_id,
          username: r.username ?? "",
          module: r.module,
          action: r.action,
          targetType: r.target_type ?? "",
          targetId: r.target_id ?? "",
          description: r.description ?? "",
          requestData: r.request_data ?? null,
          responseData: r.response_data ?? null,
          ipAddress: r.ip_address ?? "",
          userAgent: r.user_agent ?? "",
          status: r.status,
          errorMessage: r.error_message ?? "",
          createdAt: r.created_at
        }))
      },
      traceId
    );
  });

  app.get("/system/logs/api-stats", async (request, reply) => {
    const traceId = request.traceId;
    if (!(await requirePermission(adminCfg, pg, request, reply, "system:log"))) return;
    if (!pg) {
      fail(reply, 503, "PostgreSQL 未配置", traceId);
      return;
    }

    const since = new Date(Date.now() - 24 * 3600 * 1000);

    const result = await withPgClient(pg, async (client) => {
      const totals = await queryOne<{
        total: string;
        s2xx: string;
        s3xx: string;
        s4xx: string;
        s5xx: string;
        avg_ms: string | null;
      }>(
        client,
        `
          SELECT
            count(*)::text AS total,
            count(*) FILTER (WHERE status_code >= 200 AND status_code < 300)::text AS s2xx,
            count(*) FILTER (WHERE status_code >= 300 AND status_code < 400)::text AS s3xx,
            count(*) FILTER (WHERE status_code >= 400 AND status_code < 500)::text AS s4xx,
            count(*) FILTER (WHERE status_code >= 500)::text AS s5xx,
            avg(response_time_ms)::text AS avg_ms
          FROM api_logs
          WHERE created_at >= $1
        `,
        [since]
      );

      const topPaths = await client.query<{
        method: string | null;
        path: string | null;
        c: string;
        p95_ms: string | null;
      }>(
        `
          SELECT
            method,
            path,
            count(*)::text AS c,
            percentile_cont(0.95) WITHIN GROUP (ORDER BY response_time_ms)::text AS p95_ms
          FROM api_logs
          WHERE created_at >= $1
          GROUP BY method, path
          ORDER BY count(*) DESC
          LIMIT 20
        `,
        [since]
      );

      return { totals, topPaths: topPaths.rows };
    });

    ok(
      reply,
      {
        since: since.toISOString(),
        total: Number(result.totals?.total ?? "0"),
        byStatus: {
          "2xx": Number(result.totals?.s2xx ?? "0"),
          "3xx": Number(result.totals?.s3xx ?? "0"),
          "4xx": Number(result.totals?.s4xx ?? "0"),
          "5xx": Number(result.totals?.s5xx ?? "0")
        },
        avgResponseTimeMs: result.totals?.avg_ms ? Number(result.totals.avg_ms) : null,
        topPaths: result.topPaths.map((r) => ({
          method: r.method ?? "",
          path: r.path ?? "",
          count: Number(r.c),
          p95ResponseTimeMs: r.p95_ms ? Number(r.p95_ms) : null
        }))
      },
      traceId
    );
  });

  app.get("/system/status", async (request, reply) => {
    const traceId = request.traceId;
    if (!(await requirePermission(adminCfg, pg, request, reply, "system:log"))) return;
    ok(reply, await buildSystemStatusData(config, ch, pg), traceId);
  });

  app.get("/dashboard", async (request, reply) => {
    const traceId = request.traceId;
    if (!(await requirePermission(adminCfg, pg, request, reply, "data:view"))) return;
    if (!pg) {
      fail(reply, 503, "PostgreSQL 未配置", traceId);
      return;
    }
    ok(reply, await buildDashboardSummaryData(config, ch, pg), traceId);
  });

  app.get("/dashboard/weekly-trend", async (request, reply) => {
    const traceId = request.traceId;
    if (!(await requirePermission(adminCfg, pg, request, reply, "data:view"))) return;
    ok(reply, await buildDashboardWeeklyTrendData(config, ch, pg), traceId);
  });
}

export function registerSystemLegacyCompatRoutes(
  app: FastifyInstance,
  config: AppConfig,
  ch: ClickHouseClient,
  pg: PgPool | null
): void {
  const adminCfg: AdminAuthConfig = { adminApiToken: config.adminApiToken, jwtEnabled: Boolean(config.jwtAccessSecret) };

  app.get("/system/status", async (request, reply) => {
    if (!(await requirePermission(adminCfg, pg, request, reply, "system:log"))) return;
    legacyOk(reply, await buildSystemStatusData(config, ch, pg));
  });

  app.get("/dashboard/summary", async (request, reply) => {
    const traceId = request.traceId;
    if (!(await requirePermission(adminCfg, pg, request, reply, "data:view"))) return;
    if (!pg) {
      fail(reply, 503, "PostgreSQL 未配置", traceId);
      return;
    }
    legacyOk(reply, buildDeskDashboardSummary(await buildDashboardSummaryData(config, ch, pg)));
  });

  app.get("/dashboard/weekly-trend", async (request, reply) => {
    if (!(await requirePermission(adminCfg, pg, request, reply, "data:view"))) return;
    legacyOk(reply, await buildDashboardWeeklyTrendData(config, ch, pg));
  });
}
