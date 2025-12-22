import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AdminAuthConfig } from "../authz";
import { requirePermission } from "../authz";
import type { AppConfig } from "../config";
import { fail, ok } from "../http";
import type { PgPool } from "../postgres";
import { queryOne, withPgClient } from "../postgres";

const deviceIdSchema = z.string().uuid();

const listBaselinesQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(20),
  keyword: z.string().optional()
});

const baselineSchema = z.object({
  latitude: z.number().finite(),
  longitude: z.number().finite(),
  altitude: z.number().finite().optional(),
  positionAccuracyMeters: z.number().finite().optional(),
  satelliteCount: z.number().int().positive().optional(),
  notes: z.string().max(2000).optional()
});

const upsertBaselineSchema = z.object({
  method: z.enum(["auto", "manual"]).optional(),
  pointsCount: z.number().int().positive().optional(),
  baseline: baselineSchema
});

type BaselineRow = {
  device_id: string;
  device_name: string;
  station_id: string | null;
  method: "auto" | "manual";
  points_count: number | null;
  baseline: unknown;
  computed_at: string;
  updated_at: string;
};

export function registerGpsBaselineRoutes(app: FastifyInstance, config: AppConfig, pg: PgPool | null): void {
  const adminCfg: AdminAuthConfig = { adminApiToken: config.adminApiToken, jwtEnabled: Boolean(config.jwtAccessSecret) };

  app.get("/gps/baselines", async (request, reply) => {
    const traceId = request.traceId;
    if (!(await requirePermission(adminCfg, pg, request, reply, "device:view"))) return;
    if (!pg) {
      fail(reply, 503, "PostgreSQL 未配置", traceId);
      return;
    }

    const parseQuery = listBaselinesQuerySchema.safeParse(request.query);
    if (!parseQuery.success) {
      fail(reply, 400, "参数错误", traceId, { field: "query", issues: parseQuery.error.issues });
      return;
    }
    const { page, pageSize, keyword } = parseQuery.data;

    const where: string[] = ["d.status != 'revoked'"];
    const params: unknown[] = [];
    const add = (sql: string, val: unknown) => {
      params.push(val);
      where.push(sql.replaceAll("$X", "$" + String(params.length)));
    };

    if (keyword) add("(d.device_name ILIKE $X)", `%${keyword}%`);

    const whereSql = `WHERE ${where.join(" AND ")}`;
    const offset = (page - 1) * pageSize;

    const data = await withPgClient(pg, async (client) => {
      const totalRow = await queryOne<{ total: string }>(
        client,
        `
          SELECT count(*)::text AS total
          FROM gps_baselines gb
          JOIN devices d ON d.device_id = gb.device_id
          ${whereSql}
        `,
        params
      );
      const total = Number(totalRow?.total ?? "0");

      const res = await client.query<BaselineRow>(
        `
          SELECT
            gb.device_id,
            d.device_name,
            d.station_id,
            gb.method,
            gb.points_count,
            gb.baseline,
            to_char(gb.computed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS computed_at,
            to_char(gb.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at
          FROM gps_baselines gb
          JOIN devices d ON d.device_id = gb.device_id
          ${whereSql}
          ORDER BY gb.updated_at DESC
          LIMIT $${String(params.length + 1)}
          OFFSET $${String(params.length + 2)}
        `,
        params.concat([pageSize, offset])
      );

      return { total, list: res.rows };
    });

    ok(
      reply,
      {
        list: data.list.map((r) => ({
          deviceId: r.device_id,
          deviceName: r.device_name,
          stationId: r.station_id,
          method: r.method,
          pointsCount: r.points_count,
          baseline: r.baseline ?? {},
          computedAt: r.computed_at,
          updatedAt: r.updated_at
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

  app.get("/gps/baselines/:deviceId", async (request, reply) => {
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
    const deviceId = parseId.data;

    const row = await withPgClient(pg, async (client) =>
      queryOne<BaselineRow>(
        client,
        `
          SELECT
            gb.device_id,
            d.device_name,
            d.station_id,
            gb.method,
            gb.points_count,
            gb.baseline,
            to_char(gb.computed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS computed_at,
            to_char(gb.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at
          FROM gps_baselines gb
          JOIN devices d ON d.device_id = gb.device_id
          WHERE gb.device_id = $1 AND d.status != 'revoked'
        `,
        [deviceId]
      )
    );

    if (!row) {
      fail(reply, 404, "资源不存在", traceId, { deviceId });
      return;
    }

    ok(
      reply,
      {
        deviceId: row.device_id,
        deviceName: row.device_name,
        stationId: row.station_id,
        method: row.method,
        pointsCount: row.points_count,
        baseline: row.baseline ?? {},
        computedAt: row.computed_at,
        updatedAt: row.updated_at
      },
      traceId
    );
  });

  app.put("/gps/baselines/:deviceId", async (request, reply) => {
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

    const parseBody = upsertBaselineSchema.safeParse(request.body);
    if (!parseBody.success) {
      fail(reply, 400, "参数错误", traceId, { field: "body", issues: parseBody.error.issues });
      return;
    }
    const body = parseBody.data;

    const exists = await withPgClient(pg, async (client) =>
      queryOne<{ device_id: string }>(client, `SELECT device_id FROM devices WHERE device_id = $1 AND status != 'revoked'`, [
        deviceId
      ])
    );
    if (!exists) {
      fail(reply, 404, "资源不存在", traceId, { deviceId });
      return;
    }

    await withPgClient(pg, async (client) => {
      await client.query(
        `
          INSERT INTO gps_baselines (device_id, method, points_count, baseline, computed_at, updated_at)
          VALUES ($1, $2, $3, $4::jsonb, NOW(), NOW())
          ON CONFLICT (device_id) DO UPDATE SET
            method = EXCLUDED.method,
            points_count = EXCLUDED.points_count,
            baseline = EXCLUDED.baseline,
            computed_at = NOW(),
            updated_at = NOW()
        `,
        [deviceId, body.method ?? "manual", body.pointsCount ?? null, JSON.stringify(body.baseline)]
      );
    });

    ok(reply, { deviceId }, traceId);
  });

  app.delete("/gps/baselines/:deviceId", async (request, reply) => {
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
      queryOne<{ device_id: string }>(client, `DELETE FROM gps_baselines WHERE device_id = $1 RETURNING device_id`, [deviceId])
    );

    if (!row) {
      fail(reply, 404, "资源不存在", traceId, { deviceId });
      return;
    }

    ok(reply, { deviceId }, traceId);
  });
}

