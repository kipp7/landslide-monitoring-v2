import type { PoolClient } from "pg";
import { z } from "zod";
import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config";
import { fail, ok } from "../http";
import { createKafkaPublisher } from "../kafka";
import type { PgPool } from "../postgres";
import { queryOne, withPgClient } from "../postgres";
import { generateDeviceSecret, hashDeviceSecret } from "../device-secret";
import { requireAdmin, type AdminAuthConfig } from "../authz";

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

const createDeviceCommandSchema = z.object({
  commandType: z.string().min(1).max(50),
  payload: z.record(z.unknown())
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
  const adminCfg: AdminAuthConfig = { adminApiToken: config.adminApiToken };
  const kafkaPublisher = createKafkaPublisher(config);

  app.get("/devices", async (request, reply) => {
    const traceId = request.traceId;
    if (!requireAdmin(adminCfg, request, reply)) return;
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
    if (!requireAdmin(adminCfg, request, reply)) return;
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
    if (!requireAdmin(adminCfg, request, reply)) return;
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
    if (!requireAdmin(adminCfg, request, reply)) return;
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

    const updated = await withPgClient(pg, async (client) => {
      const row = await queryOne<{ updated_at: string }>(
        client,
        `
          UPDATE devices
          SET
            device_name = COALESCE($2, device_name),
            device_type = COALESCE($3, device_type),
            station_id = CASE WHEN $4::text IS NULL THEN station_id ELSE $4::uuid END,
            metadata = COALESCE($5::jsonb, metadata),
            updated_at = NOW()
          WHERE device_id = $1
          RETURNING to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at
        `,
        [
          deviceId,
          body.deviceName ?? null,
          body.deviceType ?? null,
          body.stationId === undefined ? null : body.stationId,
          body.metadata ? JSON.stringify(body.metadata) : null
        ]
      );
      return row?.updated_at ?? null;
    });

    if (!updated) {
      fail(reply, 404, "资源不存在", traceId, { deviceId });
      return;
    }

    ok(reply, { deviceId, updatedAt: updated }, traceId);
  });

  app.put("/devices/:deviceId/revoke", async (request, reply) => {
    const traceId = request.traceId;
    if (!requireAdmin(adminCfg, request, reply)) return;
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

    ok(reply, { deviceId, status: row.status, revokedAt: row.revoked_at }, traceId);
  });

  app.post("/devices/:deviceId/commands", async (request, reply) => {
    const traceId = request.traceId;
    if (!requireAdmin(adminCfg, request, reply)) return;
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

    const { commandType, payload } = parseBody.data;

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
        const row = await queryOne<{ command_id: string; status: string; issued_ts: string }>(
          client,
          `
            INSERT INTO device_commands (
              device_id, command_type, payload, status, requested_by, request_source
            ) VALUES (
              $1, $2, $3::jsonb, 'queued', NULL, 'api'
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
        return { command_id: row.command_id, status: row.status };
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

    ok(reply, { commandId: created.command_id, status: created.status }, traceId);
  });
}
