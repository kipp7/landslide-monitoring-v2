import type { PoolClient } from "pg";
import { z } from "zod";
import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config";
import { fail, ok } from "../http";
import { createKafkaPublisher } from "../kafka";
import type { PgPool } from "../postgres";
import { queryOne, withPgClient } from "../postgres";
import { generateDeviceSecret, hashDeviceSecret } from "../device-secret";
import { requirePermission, type AdminAuthConfig } from "../authz";
import { enqueueOperationLog } from "../operation-log";

const deviceIdSchema = z.string().uuid();

const createDeviceSchema = z.object({
  deviceId: z.string().uuid().optional(),
  deviceName: z.string().min(1).max(100),
  deviceType: z.string().min(1).max(50).default("generic"),
  stationId: z.string().uuid().optional(),
  metadata: z.record(z.unknown()).optional()
});

const updateDeviceSchema = z.object({
  deviceName: z.string().min(1).max(100).optional(),
  deviceType: z.string().min(1).max(50).optional(),
  stationId: z.string().uuid().nullable().optional(),
  metadata: z.record(z.unknown()).optional()
});

const successNotificationPolicySchema = z.enum(["inherit", "silent", "always_notify"]);

const createDeviceCommandSchema = z.object({
  commandType: z.string().min(1).max(50),
  payload: z.record(z.unknown()),
  notifyOnAck: z.boolean().optional(),
  successNotificationPolicy: successNotificationPolicySchema.optional()
});

const commandIdSchema = z.string().uuid();

const listDeviceCommandsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(20),
  status: z.enum(["queued", "sent", "acked", "failed", "timeout", "canceled"]).optional()
});

const listDevicesQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(20),
  keyword: z.string().optional(),
  status: z.enum(["inactive", "active", "revoked"]).optional(),
  stationId: z.string().uuid().optional(),
  deviceType: z.string().optional()
});

type DeviceRow = {
  device_id: string;
  device_name: string;
  device_type: string;
  station_id: string | null;
  status: "inactive" | "active" | "revoked";
  metadata: unknown;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
};

type DeviceCommandRow = {
  command_id: string;
  device_id: string;
  command_type: string;
  payload: unknown;
  notify_on_acked: boolean;
  success_notification_policy: z.infer<typeof successNotificationPolicySchema> | null;
  status: "queued" | "sent" | "acked" | "failed" | "timeout" | "canceled";
  sent_at: string | null;
  acked_at: string | null;
  result: unknown;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function readLegacyDeviceId(deviceName: string, metadata: unknown): string {
  const meta = asRecord(metadata);
  const direct = typeof meta?.legacy_device_id === "string" ? meta.legacy_device_id.trim() : "";
  if (direct) return direct;

  const externalIds = asRecord(meta?.externalIds);
  const externalLegacy = typeof externalIds?.legacy === "string" ? externalIds.legacy.trim() : "";
  if (externalLegacy) return externalLegacy;

  return deviceName;
}

function readSensorTypes(metadata: unknown): string[] {
  const meta = asRecord(metadata);
  const raw = meta?.sensor_types;
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim());
}

type SuccessNotificationPolicy = z.infer<typeof successNotificationPolicySchema>;
type EffectiveSuccessNotificationPolicy = Exclude<SuccessNotificationPolicy, "inherit">;
type CommandSuccessNotificationConfig = {
  systemDefault: EffectiveSuccessNotificationPolicy;
  commandTypeDefaults: Partial<Record<string, EffectiveSuccessNotificationPolicy>>;
};

const COMMAND_SUCCESS_NOTIFICATION_SYSTEM_DEFAULT_KEY = "command.success_notification.system_default";
const COMMAND_SUCCESS_NOTIFICATION_COMMAND_TYPE_DEFAULTS_KEY = "command.success_notification.command_type_defaults";
const DEFAULT_COMMAND_SUCCESS_NOTIFICATION_CONFIG: CommandSuccessNotificationConfig = {
  systemDefault: "silent",
  commandTypeDefaults: {
    set_config: "always_notify",
    reboot: "always_notify",
    restart_device: "always_notify",
    deactivate_device: "always_notify",
    set_sampling_interval: "always_notify",
    manual_collect: "always_notify",
    "huawei:reboot": "always_notify"
  }
};

function asEffectiveSuccessNotificationPolicy(
  value: string | null | undefined,
  fallback: EffectiveSuccessNotificationPolicy
): EffectiveSuccessNotificationPolicy {
  return value === "always_notify" || value === "silent" ? value : fallback;
}

function parseCommandTypeSuccessNotificationDefaults(
  raw: string | null | undefined,
  fallback: Partial<Record<string, EffectiveSuccessNotificationPolicy>>
): Partial<Record<string, EffectiveSuccessNotificationPolicy>> {
  if (!raw || !raw.trim()) return fallback;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return fallback;

    const resolved: Partial<Record<string, EffectiveSuccessNotificationPolicy>> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!key.trim()) continue;
      if (value === "always_notify" || value === "silent") {
        resolved[key] = value;
      }
    }
    return Object.keys(resolved).length > 0 ? resolved : fallback;
  } catch {
    return fallback;
  }
}

async function loadCommandSuccessNotificationConfig(client: PoolClient): Promise<CommandSuccessNotificationConfig> {
  const rows = await client.query<{ config_key: string; config_value: string | null }>(
    `
      SELECT config_key, config_value
      FROM system_configs
      WHERE config_key IN ($1, $2)
    `,
    [COMMAND_SUCCESS_NOTIFICATION_SYSTEM_DEFAULT_KEY, COMMAND_SUCCESS_NOTIFICATION_COMMAND_TYPE_DEFAULTS_KEY]
  );
  const byKey = new Map(rows.rows.map((row) => [row.config_key, row.config_value] as const));
  return {
    systemDefault: asEffectiveSuccessNotificationPolicy(
      byKey.get(COMMAND_SUCCESS_NOTIFICATION_SYSTEM_DEFAULT_KEY),
      DEFAULT_COMMAND_SUCCESS_NOTIFICATION_CONFIG.systemDefault
    ),
    commandTypeDefaults: parseCommandTypeSuccessNotificationDefaults(
      byKey.get(COMMAND_SUCCESS_NOTIFICATION_COMMAND_TYPE_DEFAULTS_KEY),
      DEFAULT_COMMAND_SUCCESS_NOTIFICATION_CONFIG.commandTypeDefaults
    )
  };
}

function getCommandTypeDefaultSuccessNotificationPolicy(
  commandType: string,
  config: CommandSuccessNotificationConfig
): EffectiveSuccessNotificationPolicy {
  return config.commandTypeDefaults[commandType] ?? config.systemDefault;
}

function validateSuccessNotificationInputs(input: {
  notifyOnAck: boolean | undefined;
  successNotificationPolicy: SuccessNotificationPolicy | undefined;
}): string | null {
  if (!input.successNotificationPolicy || input.notifyOnAck === undefined) return null;
  if (input.successNotificationPolicy === "inherit") {
    return "successNotificationPolicy=inherit 时不能同时传 notifyOnAck";
  }
  const expectedNotifyOnAck = input.successNotificationPolicy === "always_notify";
  if (input.notifyOnAck !== expectedNotifyOnAck) {
    return "notifyOnAck 与 successNotificationPolicy 冲突";
  }
  return null;
}

function resolveRequestedSuccessNotificationPolicy(input: {
  commandType: string;
  notifyOnAck: boolean | undefined;
  successNotificationPolicy: SuccessNotificationPolicy | undefined;
  config: CommandSuccessNotificationConfig;
}): {
  successNotificationPolicy: SuccessNotificationPolicy;
  effectiveSuccessNotificationPolicy: EffectiveSuccessNotificationPolicy;
  notifyOnAck: boolean;
} {
  const successNotificationPolicy =
    input.successNotificationPolicy ??
    (input.notifyOnAck === undefined ? "inherit" : input.notifyOnAck ? "always_notify" : "silent");
  const effectiveSuccessNotificationPolicy =
    successNotificationPolicy === "inherit"
      ? getCommandTypeDefaultSuccessNotificationPolicy(input.commandType, input.config)
      : successNotificationPolicy;
  return {
    successNotificationPolicy,
    effectiveSuccessNotificationPolicy,
    notifyOnAck: effectiveSuccessNotificationPolicy === "always_notify"
  };
}

function resolveStoredSuccessNotificationPolicy(input: {
  commandType: string;
  notifyOnAck: boolean;
  successNotificationPolicy: SuccessNotificationPolicy | null;
  config: CommandSuccessNotificationConfig;
}): {
  successNotificationPolicy: SuccessNotificationPolicy;
  effectiveSuccessNotificationPolicy: EffectiveSuccessNotificationPolicy;
  notifyOnAck: boolean;
} {
  const successNotificationPolicy =
    input.successNotificationPolicy ??
    (input.notifyOnAck ? "always_notify" : "silent");
  const effectiveSuccessNotificationPolicy =
    successNotificationPolicy === "inherit"
      ? getCommandTypeDefaultSuccessNotificationPolicy(input.commandType, input.config)
      : successNotificationPolicy;
  return {
    successNotificationPolicy,
    effectiveSuccessNotificationPolicy,
    notifyOnAck: effectiveSuccessNotificationPolicy === "always_notify"
  };
}

async function getDevice(client: PoolClient, deviceId: string): Promise<DeviceRow | null> {
  return queryOne<DeviceRow>(
    client,
    `
      SELECT
        device_id,
        device_name,
        device_type,
        station_id,
        status,
        metadata,
        last_seen_at,
        created_at,
        updated_at
      FROM devices
      WHERE device_id = $1
    `,
    [deviceId]
  );
}

export function registerDeviceRoutes(
  app: FastifyInstance,
  config: AppConfig,
  pg: PgPool | null
): void {
  const adminCfg: AdminAuthConfig = { adminApiToken: config.adminApiToken, jwtEnabled: Boolean(config.jwtAccessSecret) };
  const kafkaPublisher = createKafkaPublisher(config);

  app.get("/devices", async (request, reply) => {
    const traceId = request.traceId;
    if (!(await requirePermission(adminCfg, pg, request, reply, "device:view"))) return;
    if (!pg) {
      fail(reply, 503, "PostgreSQL 未配置", traceId);
      return;
    }

    const parseQuery = listDevicesQuerySchema.safeParse(request.query);
    if (!parseQuery.success) {
      fail(reply, 400, "参数错误", traceId, { field: "query", issues: parseQuery.error.issues });
      return;
    }
    const { page, pageSize, keyword, status, stationId, deviceType } = parseQuery.data;

    const where: string[] = [];
    const params: unknown[] = [];
    const add = (sql: string, val: unknown) => {
      params.push(val);
      where.push(sql.replace("$X", "$" + String(params.length)));
    };

    if (keyword) add("(device_name ILIKE $X)", `%${keyword}%`);
    if (status) add("(status = $X)", status);
    if (stationId) add("(station_id = $X)", stationId);
    if (deviceType) add("(device_type = $X)", deviceType);

    const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
    const offset = (page - 1) * pageSize;

    const data = await withPgClient(pg, async (client) => {
      const totalRow = await queryOne<{ total: string }>(
        client,
        `SELECT count(*)::text AS total FROM devices ${whereSql}`,
        params
      );
      const total = Number(totalRow?.total ?? "0");

      const list = await client.query<DeviceRow>(
        `
          SELECT
            device_id,
            device_name,
            device_type,
            station_id,
            status,
            metadata,
            last_seen_at,
            created_at,
            updated_at
          FROM devices
          ${whereSql}
          ORDER BY created_at DESC
          LIMIT $${String(params.length + 1)}
          OFFSET $${String(params.length + 2)}
        `,
        params.concat([pageSize, offset])
      );

      return { total, list: list.rows };
    });

    ok(
      reply,
      {
        list: data.list.map((d: DeviceRow) => ({
          deviceId: d.device_id,
          deviceName: d.device_name,
          deviceType: d.device_type,
          status: d.status,
          stationId: d.station_id,
          lastSeenAt: d.last_seen_at
        })),
        pagination: {
          page,
          pageSize,
          total: data.total,
          totalPages: Math.max(1, Math.ceil(data.total / pageSize))
        }
      },
      traceId
    );
  });

  app.get("/devices/:deviceId", async (request, reply) => {
    const traceId = request.traceId;
    if (!(await requirePermission(adminCfg, pg, request, reply, "device:view"))) return;
    if (!pg) {
      fail(reply, 503, "PostgreSQL 未配置", traceId);
      return;
    }

    const parseId = deviceIdSchema.safeParse((request.params as { deviceId?: unknown }).deviceId);
    if (!parseId.success) {
      fail(reply, 400, "参数错误", traceId, { field: "deviceId" });
      return;
    }

    const row = await withPgClient(pg, async (client) => getDevice(client, parseId.data));
    if (!row) {
      fail(reply, 404, "资源不存在", traceId, { deviceId: parseId.data });
      return;
    }

    ok(
      reply,
      {
        deviceId: row.device_id,
        deviceName: row.device_name,
        deviceType: row.device_type,
        status: row.status,
        stationId: row.station_id,
        metadata: row.metadata ?? {},
        lastSeenAt: row.last_seen_at
      },
      traceId
    );
  });

  app.post("/devices", async (request, reply) => {
    const traceId = request.traceId;
    if (!(await requirePermission(adminCfg, pg, request, reply, "device:create"))) return;
    if (!pg) {
      fail(reply, 503, "PostgreSQL 未配置", traceId);
      return;
    }

    const parseBody = createDeviceSchema.safeParse(request.body);
    if (!parseBody.success) {
      fail(reply, 400, "参数错误", traceId, { field: "body", issues: parseBody.error.issues });
      return;
    }

    const body = parseBody.data;
    const secretPlain = generateDeviceSecret();
    const secretHash = hashDeviceSecret(secretPlain);

    const created = await withPgClient(pg, async (client) => {
      const row = await queryOne<{ device_id: string }>(
        client,
        `
          INSERT INTO devices (
            device_id, device_name, device_type, station_id, status, device_secret_hash, metadata
          ) VALUES (
            COALESCE($1::uuid, gen_random_uuid()),
            $2,
            $3,
            $4::uuid,
            'inactive',
            $5,
            COALESCE($6::jsonb, '{}'::jsonb)
          )
          RETURNING device_id
        `,
        [body.deviceId ?? null, body.deviceName, body.deviceType, body.stationId ?? null, secretHash, body.metadata ? JSON.stringify(body.metadata) : null]
      );
      if (!row) throw new Error("insert failed");
      return row.device_id;
    });

    enqueueOperationLog(pg, request, {
      module: "device",
      action: "create_device",
      description: "create device",
      status: "success",
      requestData: {
        deviceId: body.deviceId ?? null,
        deviceName: body.deviceName,
        deviceType: body.deviceType,
        stationId: body.stationId ?? null
      },
      responseData: { deviceId: created }
    });

    ok(
      reply,
      {
        deviceId: created,
        deviceSecret: secretPlain,
        schemaVersion: 1,
        credVersion: 1
      },
      traceId
    );
  });

  app.put("/devices/:deviceId", async (request, reply) => {
    const traceId = request.traceId;
    if (!(await requirePermission(adminCfg, pg, request, reply, "device:update"))) return;
    if (!pg) {
      fail(reply, 503, "PostgreSQL 未配置", traceId);
      return;
    }

    const parseId = deviceIdSchema.safeParse((request.params as { deviceId?: unknown }).deviceId);
    if (!parseId.success) {
      fail(reply, 400, "参数错误", traceId, { field: "deviceId" });
      return;
    }
    const parseBody = updateDeviceSchema.safeParse(request.body);
    if (!parseBody.success) {
      fail(reply, 400, "参数错误", traceId, { field: "body", issues: parseBody.error.issues });
      return;
    }

    const deviceId = parseId.data;
    const body = parseBody.data;
    const stationIdProvided = body.stationId !== undefined;

    const updated = await withPgClient(pg, async (client) => {
      const row = await queryOne<{ updated_at: string }>(
        client,
        `
          UPDATE devices
          SET
            device_name = COALESCE($2, device_name),
            device_type = COALESCE($3, device_type),
            station_id = CASE WHEN $4::boolean THEN $5::uuid ELSE station_id END,
            metadata = COALESCE($6::jsonb, metadata),
            updated_at = NOW()
          WHERE device_id = $1
          RETURNING to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at
        `,
        [
          deviceId,
          body.deviceName ?? null,
          body.deviceType ?? null,
          stationIdProvided,
          stationIdProvided ? body.stationId : null,
          body.metadata ? JSON.stringify(body.metadata) : null
        ]
      );
      return row?.updated_at ?? null;
    });

    if (!updated) {
      fail(reply, 404, "资源不存在", traceId, { deviceId });
      return;
    }

    enqueueOperationLog(pg, request, {
      module: "device",
      action: "update_device",
      description: "update device",
      status: "success",
      requestData: { deviceId, deviceName: body.deviceName ?? null, deviceType: body.deviceType ?? null, stationId: body.stationId ?? null },
      responseData: { updatedAt: updated }
    });

    ok(reply, { deviceId, updatedAt: updated }, traceId);
  });

  app.put("/devices/:deviceId/revoke", async (request, reply) => {
    const traceId = request.traceId;
    if (!(await requirePermission(adminCfg, pg, request, reply, "device:update"))) return;
    if (!pg) {
      fail(reply, 503, "PostgreSQL 未配置", traceId);
      return;
    }

    const parseId = deviceIdSchema.safeParse((request.params as { deviceId?: unknown }).deviceId);
    if (!parseId.success) {
      fail(reply, 400, "参数错误", traceId, { field: "deviceId" });
      return;
    }
    const deviceId = parseId.data;

    const row = await withPgClient(pg, async (client) =>
      queryOne<{ status: string; revoked_at: string }>(
        client,
        `
          UPDATE devices
          SET status = 'revoked', updated_at = NOW()
          WHERE device_id = $1
          RETURNING status, to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS revoked_at
        `,
        [deviceId]
      )
    );

    if (!row) {
      fail(reply, 404, "资源不存在", traceId, { deviceId });
      return;
    }

    enqueueOperationLog(pg, request, {
      module: "device",
      action: "revoke_device",
      description: "revoke device",
      status: "success",
      requestData: { deviceId },
      responseData: { status: row.status, revokedAt: row.revoked_at }
    });

    ok(reply, { deviceId, status: row.status, revokedAt: row.revoked_at }, traceId);
  });

  app.post("/devices/:deviceId/commands", async (request, reply) => {
    const traceId = request.traceId;
    if (!(await requirePermission(adminCfg, pg, request, reply, "device:control"))) return;
    if (!pg) {
      fail(reply, 503, "PostgreSQL 未配置", traceId);
      return;
    }
    if (!kafkaPublisher) {
      fail(reply, 503, "Kafka 未配置", traceId);
      return;
    }

    const parseId = deviceIdSchema.safeParse((request.params as { deviceId?: unknown }).deviceId);
    if (!parseId.success) {
      fail(reply, 400, "参数错误", traceId, { field: "deviceId" });
      return;
    }
    const deviceId = parseId.data;

    const parseBody = createDeviceCommandSchema.safeParse(request.body);
    if (!parseBody.success) {
      fail(reply, 400, "参数错误", traceId, { field: "body", issues: parseBody.error.issues });
      return;
    }

    const { commandType, payload, notifyOnAck, successNotificationPolicy } = parseBody.data;
    const successNotificationInputError = validateSuccessNotificationInputs({ notifyOnAck, successNotificationPolicy });
    if (successNotificationInputError) {
      fail(reply, 400, successNotificationInputError, traceId, {
        field: "body",
        notifyOnAck: notifyOnAck ?? null,
        successNotificationPolicy: successNotificationPolicy ?? null
      });
      return;
    }
    const created = await withPgClient(pg, async (client) => {
      const device = await queryOne<{ status: string }>(
        client,
        "SELECT status FROM devices WHERE device_id=$1",
        [deviceId]
      );
      if (!device) return null;
      if (device.status === "revoked") return "revoked";

        await client.query("BEGIN");
        try {
          const successNotificationConfig = await loadCommandSuccessNotificationConfig(client);
          const resolvedSuccessNotification = resolveRequestedSuccessNotificationPolicy({
            commandType,
            notifyOnAck,
            successNotificationPolicy,
            config: successNotificationConfig
          });
          const row = await queryOne<{ command_id: string; status: string; issued_ts: string }>(
            client,
            `
            INSERT INTO device_commands (
              device_id, command_type, payload, notify_on_acked, success_notification_policy, status, requested_by, request_source
            ) VALUES (
              $1, $2, $3::jsonb, $4::boolean, $5, 'queued', NULL, 'api'
            )
            RETURNING
              command_id,
              status,
              notify_on_acked,
              success_notification_policy,
              to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS issued_ts
          `,
            [
              deviceId,
              commandType,
              JSON.stringify(payload),
              resolvedSuccessNotification.notifyOnAck,
              resolvedSuccessNotification.successNotificationPolicy
            ]
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
          return {
            command_id: row.command_id,
            status: row.status,
            notify_on_acked: Boolean((row as { notify_on_acked?: boolean }).notify_on_acked),
            success_notification_policy: (row as { success_notification_policy?: SuccessNotificationPolicy | null })
              .success_notification_policy ?? null,
            resolved_success_notification: resolvedSuccessNotification
          };
        } catch (err) {
          await client.query("ROLLBACK");
        throw err;
      }
    });

    if (created === "revoked") {
      fail(reply, 409, "设备已吊销", traceId, { deviceId });
      return;
    }
    if (!created) {
      fail(reply, 404, "资源不存在", traceId, { deviceId });
      return;
    }

    enqueueOperationLog(pg, request, {
      module: "device",
      action: "issue_command",
      description: "issue device command",
      status: "success",
      requestData: {
        deviceId,
        commandType,
        notifyOnAck: notifyOnAck ?? null,
        successNotificationPolicy: successNotificationPolicy ?? null,
        payloadKeys: Object.keys(payload)
      },
      responseData: {
        commandId: created.command_id,
        status: created.status,
        notifyOnAck: created.resolved_success_notification.notifyOnAck,
        successNotificationPolicy: created.resolved_success_notification.successNotificationPolicy,
        effectiveSuccessNotificationPolicy: created.resolved_success_notification.effectiveSuccessNotificationPolicy
      }
    });

    ok(
      reply,
      {
        commandId: created.command_id,
        status: created.status,
        notifyOnAck: created.resolved_success_notification.notifyOnAck,
        successNotificationPolicy: created.resolved_success_notification.successNotificationPolicy,
        effectiveSuccessNotificationPolicy: created.resolved_success_notification.effectiveSuccessNotificationPolicy
      },
      traceId
    );
  });

  app.get("/devices/:deviceId/commands", async (request, reply) => {
    const traceId = request.traceId;
    if (!(await requirePermission(adminCfg, pg, request, reply, "device:control"))) return;
    if (!pg) {
      fail(reply, 503, "PostgreSQL 未配置", traceId);
      return;
    }

    const parseId = deviceIdSchema.safeParse((request.params as { deviceId?: unknown }).deviceId);
    if (!parseId.success) {
      fail(reply, 400, "参数错误", traceId, { field: "deviceId" });
      return;
    }
    const deviceId = parseId.data;

    const parseQuery = listDeviceCommandsQuerySchema.safeParse(request.query);
    if (!parseQuery.success) {
      fail(reply, 400, "参数错误", traceId, { field: "query", issues: parseQuery.error.issues });
      return;
    }
    const { page, pageSize, status } = parseQuery.data;

    const where: string[] = ["device_id = $1"];
    const params: unknown[] = [deviceId];
    if (status) {
      params.push(status);
      where.push("status = $" + String(params.length));
    }

    const whereSql = `WHERE ${where.join(" AND ")}`;
    const offset = (page - 1) * pageSize;

    const data = await withPgClient(pg, async (client) => {
      const successNotificationConfig = await loadCommandSuccessNotificationConfig(client);
      const exists = await queryOne<{ ok: boolean }>(
        client,
        "SELECT TRUE AS ok FROM devices WHERE device_id=$1",
        [deviceId]
      );
      if (!exists) return null;

      const totalRow = await queryOne<{ total: string }>(
        client,
        `SELECT count(*)::text AS total FROM device_commands ${whereSql}`,
        params
      );
      const total = Number(totalRow?.total ?? "0");

      const res = await client.query<DeviceCommandRow>(
        `
          SELECT
            command_id,
            device_id,
            command_type,
            payload,
            notify_on_acked,
            success_notification_policy,
            status,
            to_char(sent_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS sent_at,
            to_char(acked_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS acked_at,
            result,
            error_message,
            to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
            to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at
          FROM device_commands
          ${whereSql}
          ORDER BY created_at DESC
          LIMIT $${String(params.length + 1)}
          OFFSET $${String(params.length + 2)}
        `,
        params.concat([pageSize, offset])
      );

      return { total, list: res.rows, successNotificationConfig };
    });

    if (!data) {
      fail(reply, 404, "资源不存在", traceId, { deviceId });
      return;
    }

    ok(
      reply,
      {
        list: data.list.map((c) => {
          const resolvedSuccessNotification = resolveStoredSuccessNotificationPolicy({
            commandType: c.command_type,
            notifyOnAck: c.notify_on_acked,
            successNotificationPolicy: c.success_notification_policy,
            config: data.successNotificationConfig
          });
          return {
            commandId: c.command_id,
            deviceId: c.device_id,
            commandType: c.command_type,
            payload: c.payload ?? {},
            notifyOnAck: resolvedSuccessNotification.notifyOnAck,
            successNotificationPolicy: resolvedSuccessNotification.successNotificationPolicy,
            effectiveSuccessNotificationPolicy: resolvedSuccessNotification.effectiveSuccessNotificationPolicy,
            status: c.status,
            sentAt: c.sent_at,
            ackedAt: c.acked_at,
            result: c.result ?? {},
            errorMessage: c.error_message ?? "",
            createdAt: c.created_at,
            updatedAt: c.updated_at
          };
        }),
        pagination: {
          page,
          pageSize,
          total: data.total,
          totalPages: Math.max(1, Math.ceil(data.total / pageSize))
        }
      },
      traceId
    );
  });

  app.get("/devices/:deviceId/commands/:commandId", async (request, reply) => {
    const traceId = request.traceId;
    if (!(await requirePermission(adminCfg, pg, request, reply, "device:control"))) return;
    if (!pg) {
      fail(reply, 503, "PostgreSQL 未配置", traceId);
      return;
    }

    const parseId = deviceIdSchema.safeParse((request.params as { deviceId?: unknown }).deviceId);
    if (!parseId.success) {
      fail(reply, 400, "参数错误", traceId, { field: "deviceId" });
      return;
    }
    const deviceId = parseId.data;

    const parseCmd = commandIdSchema.safeParse((request.params as { commandId?: unknown }).commandId);
    if (!parseCmd.success) {
      fail(reply, 400, "参数错误", traceId, { field: "commandId" });
      return;
    }
    const commandId = parseCmd.data;

    const row = await withPgClient(pg, async (client) =>
      Promise.all([
        queryOne<DeviceCommandRow>(
          client,
          `
            SELECT
              command_id,
              device_id,
              command_type,
              payload,
              notify_on_acked,
              success_notification_policy,
              status,
              to_char(sent_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS sent_at,
              to_char(acked_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS acked_at,
              result,
              error_message,
              to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
              to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at
            FROM device_commands
            WHERE command_id = $1 AND device_id = $2
          `,
          [commandId, deviceId]
        ),
        loadCommandSuccessNotificationConfig(client)
      ]).then(([commandRow, successNotificationConfig]) => ({
        commandRow,
        successNotificationConfig
      }))
    );

    if (!row?.commandRow) {
      fail(reply, 404, "资源不存在", traceId, { deviceId, commandId });
      return;
    }

    ok(
      reply,
      {
        commandId: row.commandRow.command_id,
        deviceId: row.commandRow.device_id,
        commandType: row.commandRow.command_type,
        payload: row.commandRow.payload ?? {},
        ...resolveStoredSuccessNotificationPolicy({
          commandType: row.commandRow.command_type,
          notifyOnAck: row.commandRow.notify_on_acked,
          successNotificationPolicy: row.commandRow.success_notification_policy,
          config: row.successNotificationConfig
        }),
        status: row.commandRow.status,
        sentAt: row.commandRow.sent_at,
        ackedAt: row.commandRow.acked_at,
        result: row.commandRow.result ?? {},
        errorMessage: row.commandRow.error_message ?? "",
        createdAt: row.commandRow.created_at,
        updatedAt: row.commandRow.updated_at
      },
      traceId
    );
  });
}

function normalizeLegacyDeviceStatus(
  status: DeviceRow["status"],
  lastSeenAt: string | null
): "online" | "offline" | "warning" {
  if (status === "revoked") return "offline";
  if (!lastSeenAt) return status === "active" ? "warning" : "offline";

  const lastSeen = new Date(lastSeenAt);
  if (Number.isNaN(lastSeen.getTime())) return status === "active" ? "warning" : "offline";

  const threshold = Date.now() - 24 * 60 * 60 * 1000;
  if (lastSeen.getTime() >= threshold) return "online";
  return status === "active" ? "warning" : "offline";
}

function normalizeLegacyDeviceType(value: string): "gnss" | "rain" | "tilt" | "temp_hum" | "camera" {
  const raw = value.trim().toLowerCase();
  if (raw === "gnss" || raw === "gps" || raw === "multi_sensor" || raw === "multisensor") return "gnss";
  if (raw === "rain" || raw === "rainfall") return "rain";
  if (raw === "tilt" || raw === "inclinometer") return "tilt";
  if (raw === "camera" || raw === "video") return "camera";
  return "temp_hum";
}

export function registerDeviceLegacyCompatRoutes(
  app: FastifyInstance,
  config: AppConfig,
  pg: PgPool | null
): void {
  const adminCfg: AdminAuthConfig = { adminApiToken: config.adminApiToken, jwtEnabled: Boolean(config.jwtAccessSecret) };

  app.get("/devices", async (request, reply) => {
    const traceId = request.traceId;
    if (!(await requirePermission(adminCfg, pg, request, reply, "device:view"))) return;
    if (!pg) {
      fail(reply, 503, "PostgreSQL 未配置", traceId);
      return;
    }

    const q = (request.query ?? {}) as { station_id?: string; stationId?: string };
    const legacyStationId = typeof q.station_id === "string" && q.station_id.trim() ? q.station_id.trim() : "";
    const stationId = legacyStationId || (typeof q.stationId === "string" ? q.stationId.trim() : "");

    const rows = await withPgClient(pg, async (client) => {
      const params: unknown[] = [];
      let whereSql = "";
      if (stationId) {
        params.push(stationId);
        whereSql = "WHERE d.station_id = $1";
      }

      const res = await client.query<
        DeviceRow & {
          station_name: string | null;
        }
      >(
        `
          SELECT
            d.device_id,
            d.device_name,
            d.device_type,
            d.station_id,
            d.status,
            d.metadata,
            to_char(d.last_seen_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS last_seen_at,
            to_char(d.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
            to_char(d.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at,
            s.station_name
          FROM devices d
          LEFT JOIN stations s ON s.station_id = d.station_id
          ${whereSql}
          ORDER BY d.created_at DESC
        `,
        params
      );
      return res.rows;
    });

    void reply.code(200).send(
      rows.map((row) => ({
        id: row.device_id,
        name: row.device_name,
        legacyDeviceId: readLegacyDeviceId(row.device_name, row.metadata),
        stationId: row.station_id ?? "",
        stationName: row.station_name ?? row.station_id ?? "Unassigned",
        type: normalizeLegacyDeviceType(row.device_type),
        sensorTypes: readSensorTypes(row.metadata),
        status: normalizeLegacyDeviceStatus(row.status, row.last_seen_at),
        lastSeenAt: row.last_seen_at ?? new Date(0).toISOString()
      }))
    );
  });
}
