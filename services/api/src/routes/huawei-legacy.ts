import type { ClickHouseClient } from "@clickhouse/client";
import type { PoolClient } from "pg";
import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import type { AppConfig } from "../config";
import { requirePermission, type AdminAuthConfig } from "../authz";
import type { KafkaPublisher } from "../kafka";
import { createKafkaPublisher } from "../kafka";
import { enqueueOperationLog } from "../operation-log";
import type { PgPool } from "../postgres";
import { queryOne, withPgClient } from "../postgres";

type LegacyOk<T extends Record<string, unknown>> = { success: true; timestamp: string } & T;
type LegacyErr = { success: false; timestamp: string; error: string; message?: string; disabled?: boolean };

function legacyOk(reply: FastifyReply, data: Record<string, unknown>): void {
  const payload: LegacyOk<Record<string, unknown>> = { success: true, timestamp: new Date().toISOString(), ...data };
  void reply.code(200).send(payload);
}

function legacyFail(
  reply: FastifyReply,
  statusCode: number,
  data: Omit<LegacyErr, "timestamp" | "success"> & Partial<Pick<LegacyErr, "timestamp">>
): void {
  const payload: LegacyErr = {
    success: false,
    timestamp: data.timestamp ?? new Date().toISOString(),
    error: data.error,
    ...(data.message ? { message: data.message } : {}),
    ...(data.disabled !== undefined ? { disabled: data.disabled } : {})
  };
  void reply.code(statusCode).send(payload);
}

const legacyDeviceIdSchema = z.string().min(1).max(200);
const uuidSchema = z.string().uuid();

function disabledCommandId(prefix: string): string {
  return `${prefix}${String(Date.now())}`;
}

function replyHuaweiCommandsDisabled(reply: FastifyReply, deviceId: string, commandData: unknown): void {
  void reply.code(200).send({
    success: false,
    disabled: true,
    message: "华为云命令下发功能已禁用",
    device_id: deviceId,
    command_data: commandData ?? null,
    result: { command_id: disabledCommandId("disabled-"), status: "disabled" }
  });
}

function replyHuaweiLedDisabled(reply: FastifyReply, deviceId: string, action: unknown): void {
  void reply.code(200).send({
    success: false,
    disabled: true,
    message: "LED控制功能已禁用",
    device_id: deviceId,
    action: action ?? null,
    result: { command_id: disabledCommandId("disabled-led-"), status: "disabled" }
  });
}

function replyHuaweiMotorDisabled(reply: FastifyReply, deviceId: string, parameters: unknown): void {
  void reply.code(200).send({
    success: false,
    disabled: true,
    message: "电机控制功能已禁用",
    device_id: deviceId,
    parameters: parameters ?? null,
    result: { command_id: disabledCommandId("disabled-motor-"), status: "disabled" }
  });
}

function replyHuaweiBuzzerDisabled(reply: FastifyReply, deviceId: string, parameters: unknown): void {
  void reply.code(200).send({
    success: false,
    disabled: true,
    message: "蜂鸣器控制功能已禁用",
    device_id: deviceId,
    parameters: parameters ?? null,
    result: { command_id: disabledCommandId("disabled-buzzer-"), status: "disabled" }
  });
}

function replyHuaweiRebootDisabled(reply: FastifyReply, deviceId: string): void {
  void reply.code(200).send({
    success: false,
    disabled: true,
    message: "系统重启功能已禁用",
    device_id: deviceId,
    result: { command_id: disabledCommandId("disabled-reboot-"), status: "disabled" }
  });
}

async function resolveDeviceUuid(pg: PgPool | null, inputDeviceId: string): Promise<string | null> {
  const trimmed = inputDeviceId.trim();
  const asUuid = uuidSchema.safeParse(trimmed);
  if (asUuid.success) return asUuid.data;
  if (!pg) return null;

  return withPgClient(pg, async (client) => {
    const row = await queryOne<{ device_id: string }>(
      client,
      `
        SELECT device_id
        FROM devices
        WHERE metadata->>'huawei_device_id' = $1
           OR metadata#>>'{huawei,deviceId}' = $1
           OR metadata#>>'{externalIds,huawei}' = $1
        LIMIT 1
      `,
      [trimmed]
    );
    return row?.device_id ?? null;
  });
}

async function fetchDeviceStateFromPg(client: PoolClient, deviceId: string): Promise<{ state: unknown; updated_at: string } | null> {
  return queryOne<{ state: unknown; updated_at: string }>(
    client,
    `
      SELECT
        state,
        to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at
      FROM device_state
      WHERE device_id = $1
    `,
    [deviceId]
  );
}

type LatestRow = {
  sensor_key: string;
  latest_ts: string;
  value_f64: number | null;
  value_i64: number | null;
  value_str: string | null;
  value_bool: number | null;
};

function normalizeMetricValue(row: {
  value_f64?: number | null;
  value_i64?: number | null;
  value_str?: string | null;
  value_bool?: number | null;
}): unknown {
  if (row.value_f64 != null) return row.value_f64;
  if (row.value_i64 != null) return row.value_i64;
  if (row.value_bool != null) return row.value_bool === 1;
  if (row.value_str != null) return row.value_str;
  return null;
}

function clickhouseStringToIsoZ(ts: string): string {
  const t = ts.trim();
  if (t.includes("T") && t.endsWith("Z")) return t;
  if (t.includes("T") && !t.endsWith("Z")) return t + "Z";
  if (t.includes(" ")) return t.replace(" ", "T") + "Z";
  return t;
}

async function fetchDeviceState(config: AppConfig, ch: ClickHouseClient, pg: PgPool | null, deviceId: string): Promise<unknown> {
  if (pg) {
    const row = await withPgClient(pg, async (client) => fetchDeviceStateFromPg(client, deviceId));
    if (row) return { deviceId, updatedAt: row.updated_at, state: row.state };
  }

  const sql = `
    SELECT
      sensor_key,
      toString(max(received_ts)) AS latest_ts,
      argMax(value_f64, received_ts) AS value_f64,
      argMax(value_i64, received_ts) AS value_i64,
      argMax(value_str, received_ts) AS value_str,
      argMax(value_bool, received_ts) AS value_bool
    FROM ${config.clickhouseDatabase}.${config.clickhouseTable}
    WHERE device_id = {deviceId:String}
    GROUP BY sensor_key
  `;

  const result = await ch.query({
    query: sql,
    query_params: { deviceId },
    format: "JSONEachRow"
  });
  const rows: LatestRow[] = await result.json();

  if (rows.length === 0) return null;

  const metrics: Record<string, unknown> = {};
  let updatedAt: string | null = null;
  for (const row of rows) {
    metrics[row.sensor_key] = normalizeMetricValue(row);
    if (!updatedAt || row.latest_ts > updatedAt) updatedAt = row.latest_ts;
  }

  return { deviceId, updatedAt: clickhouseStringToIsoZ(updatedAt ?? new Date().toISOString()), state: { metrics, meta: {} } };
}

const issueCommandBodySchema = z.record(z.unknown()).default({});

const ledBodySchema = z
  .object({
    action: z.enum(["on", "off"])
  })
  .strict();

const motorBodySchema = z
  .object({
    enable: z.coerce.boolean(),
    speed: z.coerce.number().int().min(0).max(100).default(100),
    direction: z.coerce.number().int().min(-1).max(1).default(1),
    duration: z.coerce.number().int().min(1).max(3600).default(5)
  })
  .strict();

const buzzerBodySchema = z
  .object({
    enable: z.coerce.boolean(),
    frequency: z.coerce.number().int().min(50).max(20000).default(2000),
    duration: z.coerce.number().int().min(1).max(3600).default(3),
    pattern: z.coerce.number().int().min(0).max(10).default(2)
  })
  .strict();

function buildHuaweiCommandType(prefix: string, hint?: string): string {
  const safeHint = (hint ?? "").trim().replace(/[^a-zA-Z0-9:_-]+/g, "-");
  const candidate = safeHint ? `${prefix}:${safeHint}` : prefix;
  return candidate.length > 50 ? candidate.slice(0, 50) : candidate;
}

async function issueDeviceCommand(
  pg: PgPool,
  kafkaPublisher: KafkaPublisher,
  deviceId: string,
  commandType: string,
  payload: Record<string, unknown>,
): Promise<{ commandId: string; status: string; issuedAt: string }> {
  const created = await withPgClient(pg, async (client) => {
    const device = await queryOne<{ status: string }>(client, "SELECT status FROM devices WHERE device_id=$1", [deviceId]);
    if (!device) return null;
    if (device.status === "revoked") return "revoked";

    await client.query("BEGIN");
    try {
      const row = await queryOne<{ command_id: string; status: string; issued_ts: string }>(
        client,
        `
          INSERT INTO device_commands (
            device_id, command_type, payload, status, requested_by, request_source
          ) VALUES (
            $1, $2, $3::jsonb, 'queued', NULL, 'legacy-huawei'
          )
          RETURNING
            command_id,
            status,
            to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS issued_ts
        `,
        [deviceId, commandType, JSON.stringify(payload)]
      );
      if (!row) throw new Error("insert failed");

      await kafkaPublisher.publishDeviceCommand({
        schema_version: 1,
        command_id: row.command_id,
        device_id: deviceId,
        command_type: commandType,
        payload,
        issued_ts: row.issued_ts,
        requested_by: null
      });

      await client.query("COMMIT");
      return { command_id: row.command_id, status: row.status, issued_ts: row.issued_ts };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }
  });

  if (created === "revoked") {
    const err = new Error("device revoked");
    (err as { statusCode?: number }).statusCode = 409;
    throw err;
  }

  if (!created) {
    const err = new Error("device not found");
    (err as { statusCode?: number }).statusCode = 404;
    throw err;
  }

  return { commandId: created.command_id, status: created.status, issuedAt: created.issued_ts };
}

export function registerHuaweiLegacyCompatRoutes(
  app: FastifyInstance,
  config: AppConfig,
  ch: ClickHouseClient,
  pg: PgPool | null
): void {
  const adminCfg: AdminAuthConfig = { adminApiToken: config.adminApiToken, jwtEnabled: Boolean(config.jwtAccessSecret) };
  const kafkaPublisher = createKafkaPublisher(config);

  app.get("/huawei/config", async (request, reply) => {
    const traceId = request.traceId;
    if (!(await requirePermission(adminCfg, pg, request, reply, "system:config"))) return;

    const enabled = Boolean(pg) && Boolean(kafkaPublisher);
    legacyOk(reply, {
      data: {
        enabled,
        mode: "v2-compat",
        telemetryEndpoint: "/iot/huawei (legacy) /iot/huawei/telemetry (v2)",
        commandEndpoint: "/huawei/devices/:deviceId/* (legacy) -> /api/v1/devices/:deviceId/commands (v2)",
        note: enabled
          ? "Commands are mapped to v2 device_commands + Kafka pipeline."
          : "Disabled: requires PostgreSQL + Kafka in api-service."
      },
      traceId
    });
  });

  app.get("/huawei/command-templates", async (request, reply) => {
    const traceId = request.traceId;
    if (!(await requirePermission(adminCfg, pg, request, reply, "device:control"))) return;

    if (!pg || !kafkaPublisher) {
      legacyFail(reply, 503, { error: "disabled", message: "device command pipeline not configured", disabled: true });
      return;
    }

    legacyOk(reply, {
      data: [
        {
          id: "led",
          name: "LED 控制",
          method: "POST",
          endpoint: "/huawei/devices/:deviceId/led",
          exampleBody: { action: "on" }
        },
        {
          id: "motor",
          name: "电机控制",
          method: "POST",
          endpoint: "/huawei/devices/:deviceId/motor",
          exampleBody: { enable: true, speed: 100, direction: 1, duration: 5 }
        },
        {
          id: "buzzer",
          name: "蜂鸣器控制",
          method: "POST",
          endpoint: "/huawei/devices/:deviceId/buzzer",
          exampleBody: { enable: true, frequency: 2000, duration: 3, pattern: 2 }
        },
        {
          id: "reboot",
          name: "设备重启",
          method: "POST",
          endpoint: "/huawei/devices/:deviceId/reboot",
          exampleBody: {}
        },
        {
          id: "commands",
          name: "自定义命令（透传）",
          method: "POST",
          endpoint: "/huawei/devices/:deviceId/commands",
          exampleBody: { service_id: "IntelligentCockpit", command_name: "light_control", paras: { onoff: "ON" } }
        }
      ],
      traceId
    });
  });

  app.get("/huawei/devices/:deviceId/shadow", async (request, reply) => {
    const traceId = request.traceId;
    if (!(await requirePermission(adminCfg, pg, request, reply, "device:view"))) return;

    const parseId = legacyDeviceIdSchema.safeParse((request.params as { deviceId?: unknown }).deviceId);
    if (!parseId.success) {
      legacyFail(reply, 400, { error: "invalid deviceId" });
      return;
    }
    const legacyDeviceId = parseId.data;

    const resolved = await resolveDeviceUuid(pg, legacyDeviceId);
    if (!resolved) {
      legacyFail(reply, 404, {
        error: "device not mapped",
        message: "Set device.metadata.huawei_device_id (or huawei.deviceId / externalIds.huawei) to map legacy device id.",
        disabled: true
      });
      return;
    }

    const state = await fetchDeviceState(config, ch, pg, resolved);
    if (!state) {
      legacyFail(reply, 404, { error: "no state", message: "no device state found" });
      return;
    }

    legacyOk(reply, { device_id: legacyDeviceId, resolved_device_id: resolved, data: { shadow: [{ reported: state }] }, traceId });
  });

  app.post("/huawei/devices/:deviceId/commands", async (request, reply) => {
    if (!(await requirePermission(adminCfg, pg, request, reply, "device:control"))) return;

    const parseId = legacyDeviceIdSchema.safeParse((request.params as { deviceId?: unknown }).deviceId);
    if (!parseId.success) {
      legacyFail(reply, 400, { error: "invalid deviceId" });
      return;
    }
    const legacyDeviceId = parseId.data;

    if (!pg || !kafkaPublisher) {
      replyHuaweiCommandsDisabled(reply, legacyDeviceId, request.body ?? null);
      return;
    }

    const resolved = await resolveDeviceUuid(pg, legacyDeviceId);
    if (!resolved) {
      legacyFail(reply, 404, { error: "device not mapped", message: "unknown legacy device id", disabled: true });
      return;
    }

    const parseBody = issueCommandBodySchema.safeParse(request.body);
    if (!parseBody.success) {
      legacyFail(reply, 400, { error: "invalid body" });
      return;
    }

    const raw = parseBody.data;
    const cmdHint = typeof raw.command_name === "string" ? raw.command_name : undefined;
    const commandType = buildHuaweiCommandType("huawei", cmdHint);
    const payload = { legacy: true, endpoint: "commands", raw } as Record<string, unknown>;

    try {
      const issued = await issueDeviceCommand(pg, kafkaPublisher, resolved, commandType, payload);
      enqueueOperationLog(pg, request, {
        module: "device",
        action: "issue_command_legacy_huawei",
        description: "issue device command (legacy huawei)",
        status: "success",
        requestData: { legacyDeviceId, deviceId: resolved, endpoint: "commands", commandType, payloadKeys: Object.keys(payload) },
        responseData: { commandId: issued.commandId, status: issued.status }
      });
      legacyOk(reply, {
        data: {
          command_id: issued.commandId,
          status: issued.status,
          issued_at: issued.issuedAt
        },
        device_id: legacyDeviceId,
        resolved_device_id: resolved,
        message: "command queued"
      });
    } catch (err) {
      const status = typeof (err as { statusCode?: unknown }).statusCode === "number" ? (err as { statusCode: number }).statusCode : 500;
      legacyFail(reply, status, { error: "command failed", message: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post("/huawei/devices/:deviceId/led", async (request, reply) => {
    if (!(await requirePermission(adminCfg, pg, request, reply, "device:control"))) return;
    const parseId = legacyDeviceIdSchema.safeParse((request.params as { deviceId?: unknown }).deviceId);
    if (!parseId.success) {
      legacyFail(reply, 400, { error: "invalid deviceId" });
      return;
    }
    const legacyDeviceId = parseId.data;

    if (!pg || !kafkaPublisher) {
      const action = (request.body && typeof request.body === "object" ? (request.body as Record<string, unknown>).action : null) ?? null;
      replyHuaweiLedDisabled(reply, legacyDeviceId, action);
      return;
    }

    const resolved = await resolveDeviceUuid(pg, legacyDeviceId);
    if (!resolved) {
      legacyFail(reply, 404, { error: "device not mapped", disabled: true });
      return;
    }

    const parseBody = ledBodySchema.safeParse(request.body);
    if (!parseBody.success) {
      legacyFail(reply, 400, { error: "invalid body" });
      return;
    }

    try {
      const payload = { legacy: true, ...parseBody.data } as Record<string, unknown>;
      const issued = await issueDeviceCommand(pg, kafkaPublisher, resolved, "huawei:led", payload);
      enqueueOperationLog(pg, request, {
        module: "device",
        action: "issue_command_legacy_huawei",
        description: "issue device command (legacy huawei)",
        status: "success",
        requestData: { legacyDeviceId, deviceId: resolved, endpoint: "led", commandType: "huawei:led", payloadKeys: Object.keys(payload) },
        responseData: { commandId: issued.commandId, status: issued.status }
      });
      legacyOk(reply, { device_id: legacyDeviceId, resolved_device_id: resolved, data: { command_id: issued.commandId, status: issued.status } });
    } catch (err) {
      const status = typeof (err as { statusCode?: unknown }).statusCode === "number" ? (err as { statusCode: number }).statusCode : 500;
      legacyFail(reply, status, { error: "command failed", message: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post("/huawei/devices/:deviceId/motor", async (request, reply) => {
    if (!(await requirePermission(adminCfg, pg, request, reply, "device:control"))) return;
    const parseId = legacyDeviceIdSchema.safeParse((request.params as { deviceId?: unknown }).deviceId);
    if (!parseId.success) {
      legacyFail(reply, 400, { error: "invalid deviceId" });
      return;
    }
    const legacyDeviceId = parseId.data;

    if (!pg || !kafkaPublisher) {
      const rawBody = request.body && typeof request.body === "object" ? (request.body as Record<string, unknown>) : {};
      const parameters = {
        enable: rawBody.enable ?? null,
        speed: rawBody.speed ?? 100,
        direction: rawBody.direction ?? 1,
        duration: rawBody.duration ?? 5
      };
      replyHuaweiMotorDisabled(reply, legacyDeviceId, parameters);
      return;
    }

    const resolved = await resolveDeviceUuid(pg, legacyDeviceId);
    if (!resolved) {
      legacyFail(reply, 404, { error: "device not mapped", disabled: true });
      return;
    }

    const parseBody = motorBodySchema.safeParse(request.body);
    if (!parseBody.success) {
      legacyFail(reply, 400, { error: "invalid body" });
      return;
    }

    try {
      const payload = { legacy: true, ...parseBody.data } as Record<string, unknown>;
      const issued = await issueDeviceCommand(pg, kafkaPublisher, resolved, "huawei:motor", payload);
      enqueueOperationLog(pg, request, {
        module: "device",
        action: "issue_command_legacy_huawei",
        description: "issue device command (legacy huawei)",
        status: "success",
        requestData: { legacyDeviceId, deviceId: resolved, endpoint: "motor", commandType: "huawei:motor", payloadKeys: Object.keys(payload) },
        responseData: { commandId: issued.commandId, status: issued.status }
      });
      legacyOk(reply, { device_id: legacyDeviceId, resolved_device_id: resolved, data: { command_id: issued.commandId, status: issued.status } });
    } catch (err) {
      const status = typeof (err as { statusCode?: unknown }).statusCode === "number" ? (err as { statusCode: number }).statusCode : 500;
      legacyFail(reply, status, { error: "command failed", message: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post("/huawei/devices/:deviceId/buzzer", async (request, reply) => {
    if (!(await requirePermission(adminCfg, pg, request, reply, "device:control"))) return;
    const parseId = legacyDeviceIdSchema.safeParse((request.params as { deviceId?: unknown }).deviceId);
    if (!parseId.success) {
      legacyFail(reply, 400, { error: "invalid deviceId" });
      return;
    }
    const legacyDeviceId = parseId.data;

    if (!pg || !kafkaPublisher) {
      const rawBody = request.body && typeof request.body === "object" ? (request.body as Record<string, unknown>) : {};
      const parameters = {
        enable: rawBody.enable ?? null,
        frequency: rawBody.frequency ?? 2000,
        duration: rawBody.duration ?? 3,
        pattern: rawBody.pattern ?? 2
      };
      replyHuaweiBuzzerDisabled(reply, legacyDeviceId, parameters);
      return;
    }

    const resolved = await resolveDeviceUuid(pg, legacyDeviceId);
    if (!resolved) {
      legacyFail(reply, 404, { error: "device not mapped", disabled: true });
      return;
    }

    const parseBody = buzzerBodySchema.safeParse(request.body);
    if (!parseBody.success) {
      legacyFail(reply, 400, { error: "invalid body" });
      return;
    }

    try {
      const payload = { legacy: true, ...parseBody.data } as Record<string, unknown>;
      const issued = await issueDeviceCommand(pg, kafkaPublisher, resolved, "huawei:buzzer", payload);
      enqueueOperationLog(pg, request, {
        module: "device",
        action: "issue_command_legacy_huawei",
        description: "issue device command (legacy huawei)",
        status: "success",
        requestData: { legacyDeviceId, deviceId: resolved, endpoint: "buzzer", commandType: "huawei:buzzer", payloadKeys: Object.keys(payload) },
        responseData: { commandId: issued.commandId, status: issued.status }
      });
      legacyOk(reply, { device_id: legacyDeviceId, resolved_device_id: resolved, data: { command_id: issued.commandId, status: issued.status } });
    } catch (err) {
      const status = typeof (err as { statusCode?: unknown }).statusCode === "number" ? (err as { statusCode: number }).statusCode : 500;
      legacyFail(reply, status, { error: "command failed", message: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post("/huawei/devices/:deviceId/reboot", async (request, reply) => {
    if (!(await requirePermission(adminCfg, pg, request, reply, "device:control"))) return;
    const parseId = legacyDeviceIdSchema.safeParse((request.params as { deviceId?: unknown }).deviceId);
    if (!parseId.success) {
      legacyFail(reply, 400, { error: "invalid deviceId" });
      return;
    }
    const legacyDeviceId = parseId.data;

    if (!pg || !kafkaPublisher) {
      replyHuaweiRebootDisabled(reply, legacyDeviceId);
      return;
    }

    const resolved = await resolveDeviceUuid(pg, legacyDeviceId);
    if (!resolved) {
      legacyFail(reply, 404, { error: "device not mapped", disabled: true });
      return;
    }

    try {
      const payload = { legacy: true };
      const issued = await issueDeviceCommand(pg, kafkaPublisher, resolved, "huawei:reboot", payload);
      enqueueOperationLog(pg, request, {
        module: "device",
        action: "issue_command_legacy_huawei",
        description: "issue device command (legacy huawei)",
        status: "success",
        requestData: { legacyDeviceId, deviceId: resolved, endpoint: "reboot", commandType: "huawei:reboot", payloadKeys: Object.keys(payload) },
        responseData: { commandId: issued.commandId, status: issued.status }
      });
      legacyOk(reply, { device_id: legacyDeviceId, resolved_device_id: resolved, data: { command_id: issued.commandId, status: issued.status } });
    } catch (err) {
      const status = typeof (err as { statusCode?: unknown }).statusCode === "number" ? (err as { statusCode: number }).statusCode : 500;
      legacyFail(reply, status, { error: "command failed", message: err instanceof Error ? err.message : String(err) });
    }
  });
}
