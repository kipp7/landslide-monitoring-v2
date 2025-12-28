import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppConfig } from "../config";
import { requirePermission, type AdminAuthConfig } from "../authz";
import { fail, ok } from "../http";
import type { PgPool } from "../postgres";
import { queryOne, withPgClient } from "../postgres";

const deviceIdSchema = z.string().uuid();

const putDeviceSensorsSchema = z.object({
  sensors: z
    .array(
      z.object({
        sensorKey: z.string().min(1),
        status: z.enum(["enabled", "disabled", "missing"])
      })
    )
    .min(0)
});

type SensorRow = {
  sensor_key: string;
  display_name: string;
  unit: string | null;
  data_type: string;
};

export function registerSensorRoutes(app: FastifyInstance, config: AppConfig, pg: PgPool | null): void {
  const adminCfg: AdminAuthConfig = { adminApiToken: config.adminApiToken, jwtEnabled: Boolean(config.jwtAccessSecret) };

  app.get("/sensors", async (request, reply) => {
    const traceId = request.traceId;
    if (!(await requirePermission(adminCfg, pg, request, reply, "device:view"))) return;
    if (!pg) {
      ok(reply, { list: [], warnings: [{ kind: "pg_missing", message: "PostgreSQL not configured" }], unavailable: true }, traceId);
      return;
    }

    const rows = await withPgClient(pg, async (client) => {
      const res = await client.query<SensorRow>(
        `
          SELECT sensor_key, display_name, unit, data_type
          FROM sensors
          WHERE is_enabled = TRUE
          ORDER BY sensor_key
        `
      );
      return res.rows;
    });

    ok(
      reply,
      {
        list: rows.map((r) => ({
          sensorKey: r.sensor_key,
          displayName: r.display_name,
          unit: r.unit ?? "",
          dataType: r.data_type
        }))
      },
      traceId
    );
  });

  app.get("/devices/:deviceId/sensors", async (request, reply) => {
    const traceId = request.traceId;
    if (!(await requirePermission(adminCfg, pg, request, reply, "device:view"))) return;
    const parseId = deviceIdSchema.safeParse((request.params as { deviceId?: unknown }).deviceId);
    if (!parseId.success) {
      fail(reply, 400, "参数错误", traceId, { field: "deviceId" });
      return;
    }
    const deviceId = parseId.data;

    if (!pg) {
      ok(reply, { deviceId, list: [], warnings: [{ kind: "pg_missing", message: "PostgreSQL not configured" }], unavailable: true }, traceId);
      return;
    }

    const data = await withPgClient(pg, async (client) => {
      const exists = await queryOne<{ ok: boolean }>(client, "SELECT TRUE AS ok FROM devices WHERE device_id=$1", [
        deviceId
      ]);
      if (!exists) return null;

      const res = await client.query<{
        sensor_key: string;
        status: string;
        display_name: string;
        unit: string | null;
        data_type: string;
      }>(
        `
          SELECT
            ds.sensor_key,
            ds.status,
            s.display_name,
            s.unit,
            s.data_type
          FROM device_sensors ds
          JOIN sensors s ON s.sensor_key = ds.sensor_key
          WHERE ds.device_id = $1
          ORDER BY ds.sensor_key
        `,
        [deviceId]
      );

      return res.rows;
    });

    if (!data) {
      fail(reply, 404, "资源不存在", traceId, { deviceId });
      return;
    }

    ok(
      reply,
      {
        deviceId,
        list: data.map((r) => ({
          sensorKey: r.sensor_key,
          status: r.status,
          displayName: r.display_name,
          unit: r.unit ?? "",
          dataType: r.data_type
        }))
      },
      traceId
    );
  });

  app.put("/devices/:deviceId/sensors", async (request, reply) => {
    const traceId = request.traceId;
    if (!(await requirePermission(adminCfg, pg, request, reply, "device:update"))) return;
    const parseId = deviceIdSchema.safeParse((request.params as { deviceId?: unknown }).deviceId);
    if (!parseId.success) {
      fail(reply, 400, "参数错误", traceId, { field: "deviceId" });
      return;
    }
    const deviceId = parseId.data;

    const parseBody = putDeviceSensorsSchema.safeParse(request.body);
    if (!parseBody.success) {
      fail(reply, 400, "参数错误", traceId, { field: "body", issues: parseBody.error.issues });
      return;
    }

    if (!pg) {
      ok(
        reply,
        {
          deviceId,
          sensors: [],
          updatedAt: new Date().toISOString(),
          warnings: [{ kind: "pg_missing", message: "PostgreSQL not configured" }],
          unavailable: true
        },
        traceId
      );
      return;
    }

    const sensors = parseBody.data.sensors;
    const unique = new Map<string, "enabled" | "disabled" | "missing">();
    for (const s of sensors) unique.set(s.sensorKey, s.status);

    const result = await withPgClient(pg, async (client) => {
      const exists = await queryOne<{ ok: boolean }>(
        client,
        "SELECT TRUE AS ok FROM devices WHERE device_id=$1",
        [deviceId]
      );
      if (!exists) return null;

      await client.query("BEGIN");
      try {
        for (const [sensorKey, status] of unique.entries()) {
          await client.query(
            `
              INSERT INTO device_sensors(device_id, sensor_key, status)
              VALUES ($1, $2, $3)
              ON CONFLICT (device_id, sensor_key)
              DO UPDATE SET status = EXCLUDED.status, updated_at = NOW()
            `,
            [deviceId, sensorKey, status]
          );
        }
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }

      const res = await client.query<{ sensor_key: string; status: string }>(
        `
          SELECT sensor_key, status
          FROM device_sensors
          WHERE device_id = $1
          ORDER BY sensor_key
        `,
        [deviceId]
      );
      return res.rows;
    });

    if (!result) {
      fail(reply, 404, "资源不存在", traceId, { deviceId });
      return;
    }

    ok(
      reply,
      {
        deviceId,
        sensors: result.map((r) => ({ sensorKey: r.sensor_key, status: r.status })),
        updatedAt: new Date().toISOString()
      },
      traceId
    );
  });
}
