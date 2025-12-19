import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppConfig } from "../config";
import { requireAdmin, type AdminAuthConfig } from "../authz";
import { fail, ok } from "../http";
import type { PgPool } from "../postgres";
import { queryOne, withPgClient } from "../postgres";

const stationIdSchema = z.string().uuid();

const listStationsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(20),
  keyword: z.string().optional(),
  status: z.enum(["active", "inactive", "maintenance"]).optional()
});

const createStationSchema = z.object({
  stationCode: z.string().min(1).max(50),
  stationName: z.string().min(1).max(100),
  latitude: z.number().finite().optional(),
  longitude: z.number().finite().optional(),
  altitude: z.number().finite().optional(),
  status: z.enum(["active", "inactive", "maintenance"]).optional(),
  metadata: z.record(z.unknown()).optional()
});

const updateStationSchema = z.object({
  stationName: z.string().min(1).max(100).optional(),
  latitude: z.number().finite().nullable().optional(),
  longitude: z.number().finite().nullable().optional(),
  altitude: z.number().finite().nullable().optional(),
  status: z.enum(["active", "inactive", "maintenance"]).optional(),
  metadata: z.record(z.unknown()).optional()
});

type StationRow = {
  station_id: string;
  station_code: string;
  station_name: string;
  status: "active" | "inactive" | "maintenance";
  latitude: number | null;
  longitude: number | null;
  altitude: number | null;
  metadata: unknown;
  created_at: string;
  updated_at: string;
};

export function registerStationRoutes(
  app: FastifyInstance,
  config: AppConfig,
  pg: PgPool | null
): void {
  const adminCfg: AdminAuthConfig = { adminApiToken: config.adminApiToken };

  app.get("/stations", async (request, reply) => {
    const traceId = request.traceId;
    if (!requireAdmin(adminCfg, request, reply)) return;
    if (!pg) {
      fail(reply, 503, "PostgreSQL 未配置", traceId);
      return;
    }

    const parseQuery = listStationsQuerySchema.safeParse(request.query);
    if (!parseQuery.success) {
      fail(reply, 400, "参数错误", traceId, { field: "query", issues: parseQuery.error.issues });
      return;
    }
    const { page, pageSize, keyword, status } = parseQuery.data;

    const where: string[] = ["deleted_at IS NULL"];
    const params: unknown[] = [];
    const add = (sql: string, val: unknown) => {
      params.push(val);
      where.push(sql.replaceAll("$X", "$" + String(params.length)));
    };

    if (keyword) add("(station_name ILIKE $X OR station_code ILIKE $X)", `%${keyword}%`);
    if (status) add("(status = $X)", status);

    const whereSql = `WHERE ${where.join(" AND ")}`;
    const offset = (page - 1) * pageSize;

    const data = await withPgClient(pg, async (client) => {
      const totalRow = await queryOne<{ total: string }>(
        client,
        `SELECT count(*)::text AS total FROM stations ${whereSql}`,
        params
      );
      const total = Number(totalRow?.total ?? "0");

      const res = await client.query<StationRow>(
        `
          SELECT
            station_id,
            station_code,
            station_name,
            status,
            latitude,
            longitude,
            altitude,
            metadata,
            to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
            to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at
          FROM stations
          ${whereSql}
          ORDER BY created_at DESC
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
        list: data.list.map((s) => ({
          stationId: s.station_id,
          stationCode: s.station_code,
          stationName: s.station_name,
          status: s.status,
          latitude: s.latitude,
          longitude: s.longitude,
          altitude: s.altitude,
          metadata: s.metadata ?? {},
          createdAt: s.created_at,
          updatedAt: s.updated_at
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

  app.get("/stations/:stationId", async (request, reply) => {
    const traceId = request.traceId;
    if (!requireAdmin(adminCfg, request, reply)) return;
    if (!pg) {
      fail(reply, 503, "PostgreSQL 未配置", traceId);
      return;
    }

    const parseId = stationIdSchema.safeParse((request.params as { stationId?: unknown }).stationId);
    if (!parseId.success) {
      fail(reply, 400, "参数错误", traceId, { field: "stationId" });
      return;
    }
    const stationId = parseId.data;

    const row = await withPgClient(pg, async (client) =>
      queryOne<StationRow>(
        client,
        `
          SELECT
            station_id,
            station_code,
            station_name,
            status,
            latitude,
            longitude,
            altitude,
            metadata,
            to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
            to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at
          FROM stations
          WHERE station_id = $1 AND deleted_at IS NULL
        `,
        [stationId]
      )
    );

    if (!row) {
      fail(reply, 404, "资源不存在", traceId, { stationId });
      return;
    }

    ok(
      reply,
      {
        stationId: row.station_id,
        stationCode: row.station_code,
        stationName: row.station_name,
        status: row.status,
        latitude: row.latitude,
        longitude: row.longitude,
        altitude: row.altitude,
        metadata: row.metadata ?? {},
        createdAt: row.created_at,
        updatedAt: row.updated_at
      },
      traceId
    );
  });

  app.post("/stations", async (request, reply) => {
    const traceId = request.traceId;
    if (!requireAdmin(adminCfg, request, reply)) return;
    if (!pg) {
      fail(reply, 503, "PostgreSQL 未配置", traceId);
      return;
    }

    const parseBody = createStationSchema.safeParse(request.body);
    if (!parseBody.success) {
      fail(reply, 400, "参数错误", traceId, { field: "body", issues: parseBody.error.issues });
      return;
    }

    const body = parseBody.data;
    try {
      const row = await withPgClient(pg, async (client) =>
        queryOne<{ station_id: string }>(
          client,
          `
            INSERT INTO stations (
              station_code,
              station_name,
              status,
              latitude,
              longitude,
              altitude,
              metadata
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7::jsonb
            )
            RETURNING station_id
          `,
          [
            body.stationCode,
            body.stationName,
            body.status ?? "active",
            body.latitude ?? null,
            body.longitude ?? null,
            body.altitude ?? null,
            JSON.stringify(body.metadata ?? {})
          ]
        )
      );

      ok(reply, { stationId: row?.station_id }, traceId);
    } catch (err) {
      const pgCode =
        err && typeof err === "object" && "code" in err ? String((err as { code: unknown }).code) : "";
      if (pgCode === "23505") {
        fail(reply, 409, "资源已存在", traceId, { stationCode: body.stationCode });
        return;
      }
      throw err;
    }
  });

  app.put("/stations/:stationId", async (request, reply) => {
    const traceId = request.traceId;
    if (!requireAdmin(adminCfg, request, reply)) return;
    if (!pg) {
      fail(reply, 503, "PostgreSQL 未配置", traceId);
      return;
    }

    const parseId = stationIdSchema.safeParse((request.params as { stationId?: unknown }).stationId);
    if (!parseId.success) {
      fail(reply, 400, "参数错误", traceId, { field: "stationId" });
      return;
    }
    const stationId = parseId.data;

    const parseBody = updateStationSchema.safeParse(request.body);
    if (!parseBody.success) {
      fail(reply, 400, "参数错误", traceId, { field: "body", issues: parseBody.error.issues });
      return;
    }

    const body = parseBody.data;
    const latitudeProvided = body.latitude !== undefined;
    const longitudeProvided = body.longitude !== undefined;
    const altitudeProvided = body.altitude !== undefined;
    const updated = await withPgClient(pg, async (client) => {
      const row = await queryOne<{ updated_at: string }>(
        client,
        `
          UPDATE stations
          SET
            station_name = COALESCE($2, station_name),
            status = COALESCE($3, status),
            latitude = CASE WHEN $4::boolean THEN $5::double precision ELSE latitude END,
            longitude = CASE WHEN $6::boolean THEN $7::double precision ELSE longitude END,
            altitude = CASE WHEN $8::boolean THEN $9::double precision ELSE altitude END,
            metadata = COALESCE($10::jsonb, metadata),
            updated_at = NOW()
          WHERE station_id = $1 AND deleted_at IS NULL
          RETURNING to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at
        `,
        [
          stationId,
          body.stationName ?? null,
          body.status ?? null,
          latitudeProvided,
          latitudeProvided ? body.latitude : null,
          longitudeProvided,
          longitudeProvided ? body.longitude : null,
          altitudeProvided,
          altitudeProvided ? body.altitude : null,
          body.metadata ? JSON.stringify(body.metadata) : null
        ]
      );
      return row?.updated_at ?? null;
    });

    if (!updated) {
      fail(reply, 404, "资源不存在", traceId, { stationId });
      return;
    }

    ok(reply, { stationId, updatedAt: updated }, traceId);
  });

  app.delete("/stations/:stationId", async (request, reply) => {
    const traceId = request.traceId;
    if (!requireAdmin(adminCfg, request, reply)) return;
    if (!pg) {
      fail(reply, 503, "PostgreSQL 未配置", traceId);
      return;
    }

    const parseId = stationIdSchema.safeParse((request.params as { stationId?: unknown }).stationId);
    if (!parseId.success) {
      fail(reply, 400, "参数错误", traceId, { field: "stationId" });
      return;
    }
    const stationId = parseId.data;

    const row = await withPgClient(pg, async (client) =>
      queryOne<{ ok: boolean }>(
        client,
        `
          UPDATE stations
          SET deleted_at = NOW(), updated_at = NOW()
          WHERE station_id = $1 AND deleted_at IS NULL
          RETURNING TRUE AS ok
        `,
        [stationId]
      )
    );

    if (!row) {
      fail(reply, 404, "资源不存在", traceId, { stationId });
      return;
    }

    ok(reply, {}, traceId);
  });
}
