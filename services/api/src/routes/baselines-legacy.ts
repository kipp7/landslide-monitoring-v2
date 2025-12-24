import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { AdminAuthConfig } from "../authz";
import { requirePermission } from "../authz";
import type { AppConfig } from "../config";
import type { PgPool } from "../postgres";
import { queryOne, withPgClient } from "../postgres";

function legacyOk(reply: FastifyReply, payload: Record<string, unknown>): void {
  void reply.code(200).send({ success: true, ...payload });
}

function legacyFail(reply: FastifyReply, statusCode: number, message: string): void {
  void reply.code(statusCode).send({ success: false, error: message });
}

function legacyKeyFromMetadata(deviceName: string, metadata: unknown): string {
  const m = metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>) : null;

  const legacy = typeof m?.legacy_device_id === "string" ? m.legacy_device_id.trim() : "";
  if (legacy) return legacy;

  const externalIds = m?.externalIds;
  const externalLegacyRaw =
    externalIds && typeof externalIds === "object" ? (externalIds as Record<string, unknown>).legacy : undefined;
  const externalLegacy = typeof externalLegacyRaw === "string" ? externalLegacyRaw.trim() : "";
  if (externalLegacy) return externalLegacy;

  return deviceName;
}

async function resolveDeviceId(pg: PgPool, input: string): Promise<string | null> {
  return withPgClient(pg, async (client) => {
    const row = await queryOne<{ device_id: string }>(
      client,
      `
        SELECT device_id
        FROM devices
        WHERE device_id::text = $1
           OR device_name = $1
           OR metadata->>'legacy_device_id' = $1
           OR metadata#>>'{externalIds,legacy}' = $1
        LIMIT 1
      `,
      [input]
    );
    return row?.device_id ?? null;
  });
}

const baselineSchema = z.object({
  latitude: z.number().finite(),
  longitude: z.number().finite(),
  altitude: z.number().finite().optional(),
  positionAccuracyMeters: z.number().finite().optional(),
  satelliteCount: z.number().int().positive().optional(),
  notes: z.string().max(2000).optional()
});

const finiteNumberFromUnknown = z.preprocess((v) => {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const t = v.trim();
    if (!t) return v;
    const n = Number(t);
    return Number.isFinite(n) ? n : v;
  }
  return v;
}, z.number().finite());

const optionalFiniteNumberFromUnknown = z.preprocess((v) => {
  if (v === "" || v === null || v === undefined) return undefined;
  return v;
}, finiteNumberFromUnknown.optional());

const upsertLegacyBaselineBodySchema = z
  .object({
    latitude: finiteNumberFromUnknown,
    longitude: finiteNumberFromUnknown,
    altitude: optionalFiniteNumberFromUnknown,
    notes: z.string().max(2000).optional(),
    positionAccuracy: optionalFiniteNumberFromUnknown,
    satelliteCount: z.preprocess(
      (v) => {
        if (v === "" || v === null || v === undefined) return undefined;
        if (typeof v === "number") return v;
        if (typeof v === "string") return v.trim() ? Number(v) : undefined;
        return v;
      },
      z.number().int().positive().optional()
    )
  })
  .passthrough();

type BaselineListRow = {
  device_id: string;
  device_name: string;
  metadata: unknown;
  method: "auto" | "manual";
  points_count: number | null;
  baseline: unknown;
  computed_at: string;
  updated_at: string;
};

function toLegacyRow(row: BaselineListRow): Record<string, unknown> {
  const parsed = baselineSchema.safeParse(row.baseline ?? {});
  const baseline = parsed.success ? parsed.data : null;

  const legacyId = legacyKeyFromMetadata(row.device_name, row.metadata);
  return {
    device_id: legacyId,
    actual_device_id: row.device_id,
    device_name: row.device_name,
    baseline_latitude: baseline?.latitude ?? null,
    baseline_longitude: baseline?.longitude ?? null,
    baseline_altitude: baseline?.altitude ?? null,
    position_accuracy: baseline?.positionAccuracyMeters ?? null,
    satellite_count: baseline?.satelliteCount ?? null,
    notes: baseline?.notes ?? null,
    status: "active",
    method: row.method,
    points_count: row.points_count,
    established_time: row.computed_at,
    updated_at: row.updated_at
  };
}

export function registerBaselineLegacyCompatRoutes(app: FastifyInstance, _config: AppConfig, pg: PgPool | null): void {
  const adminCfg: AdminAuthConfig = { adminApiToken: _config.adminApiToken, jwtEnabled: Boolean(_config.jwtAccessSecret) };

  app.get("/baselines", async (request, reply) => {
    if (!(await requirePermission(adminCfg, pg, request, reply, "device:view"))) return;
    if (!pg) {
      legacyFail(reply, 503, "PostgreSQL not configured");
      return;
    }

    try {
      const rows = await withPgClient(pg, async (client) => {
        const res = await client.query<BaselineListRow>(
          `
            SELECT
              gb.device_id,
              d.device_name,
              d.metadata,
              gb.method,
              gb.points_count,
              gb.baseline,
              to_char(gb.computed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS computed_at,
              to_char(gb.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at
            FROM gps_baselines gb
            JOIN devices d ON d.device_id = gb.device_id
            WHERE d.status != 'revoked'
            ORDER BY gb.updated_at DESC
          `
        );
        return res.rows;
      });

      legacyOk(reply, { data: rows.map(toLegacyRow), count: rows.length });
    } catch (err) {
      legacyFail(reply, 500, err instanceof Error ? err.message : "query failed");
    }
  });

  app.get("/baselines/:deviceId", async (request, reply) => {
    if (!(await requirePermission(adminCfg, pg, request, reply, "device:view"))) return;
    if (!pg) {
      legacyFail(reply, 503, "PostgreSQL not configured");
      return;
    }

    const deviceParam = (request.params as { deviceId?: unknown }).deviceId;
    const inputDeviceId = typeof deviceParam === "string" ? deviceParam.trim() : "";
    if (!inputDeviceId) {
      legacyFail(reply, 400, "invalid deviceId");
      return;
    }

    try {
      const resolved = await resolveDeviceId(pg, inputDeviceId);
      if (!resolved) {
        legacyFail(reply, 404, "device not found");
        return;
      }

      const row = await withPgClient(pg, async (client) =>
        queryOne<BaselineListRow>(
          client,
          `
            SELECT
              gb.device_id,
              d.device_name,
              d.metadata,
              gb.method,
              gb.points_count,
              gb.baseline,
              to_char(gb.computed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS computed_at,
              to_char(gb.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at
            FROM gps_baselines gb
            JOIN devices d ON d.device_id = gb.device_id
            WHERE gb.device_id = $1
          `,
          [resolved]
        )
      );

      if (!row) {
        void reply.code(200).send({ success: false, error: "baseline not set", hasBaseline: false });
        return;
      }

      void reply.code(200).send({ success: true, data: toLegacyRow(row), hasBaseline: true });
    } catch (err) {
      legacyFail(reply, 500, err instanceof Error ? err.message : "query failed");
    }
  });

  const upsert = async (request: FastifyRequest, reply: FastifyReply) => {
    if (!(await requirePermission(adminCfg, pg, request, reply, "device:update"))) return;
    if (!pg) {
      legacyFail(reply, 503, "PostgreSQL not configured");
      return;
    }

    const deviceParam = (request.params as { deviceId?: unknown }).deviceId;
    const inputDeviceId = typeof deviceParam === "string" ? deviceParam.trim() : "";
    if (!inputDeviceId) {
      legacyFail(reply, 400, "invalid deviceId");
      return;
    }

    const parsedBody = upsertLegacyBaselineBodySchema.safeParse(request.body ?? {});
    if (!parsedBody.success) {
      legacyFail(reply, 400, "invalid body");
      return;
    }

    const { latitude, longitude, altitude, notes, positionAccuracy, satelliteCount } = parsedBody.data;
    if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
      legacyFail(reply, 400, "coordinate out of range");
      return;
    }

    try {
      const resolved = await resolveDeviceId(pg, inputDeviceId);
      if (!resolved) {
        legacyFail(reply, 404, "device not found");
        return;
      }

      const baseline = {
        latitude,
        longitude,
        ...(typeof altitude === "number" ? { altitude } : {}),
        ...(typeof positionAccuracy === "number" ? { positionAccuracyMeters: positionAccuracy } : {}),
        ...(typeof satelliteCount === "number" ? { satelliteCount } : {}),
        ...(typeof notes === "string" && notes.trim() ? { notes: notes.trim() } : {})
      };

      await withPgClient(pg, async (client) => {
        await client.query(
          `
            INSERT INTO gps_baselines (device_id, method, points_count, baseline, computed_at, updated_at)
            VALUES ($1, 'manual', NULL, $2::jsonb, NOW(), NOW())
            ON CONFLICT (device_id) DO UPDATE SET
              method = EXCLUDED.method,
              points_count = EXCLUDED.points_count,
              baseline = EXCLUDED.baseline,
              computed_at = NOW(),
              updated_at = NOW()
          `,
          [resolved, JSON.stringify(baseline)]
        );
      });

      const row = await withPgClient(pg, async (client) =>
        queryOne<BaselineListRow>(
          client,
          `
            SELECT
              gb.device_id,
              d.device_name,
              d.metadata,
              gb.method,
              gb.points_count,
              gb.baseline,
              to_char(gb.computed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS computed_at,
              to_char(gb.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at
            FROM gps_baselines gb
            JOIN devices d ON d.device_id = gb.device_id
            WHERE gb.device_id = $1
          `,
          [resolved]
        )
      );

      legacyOk(reply, { data: row ? toLegacyRow(row) : null, message: "baseline upserted" });
    } catch (err) {
      legacyFail(reply, 500, err instanceof Error ? err.message : "upsert failed");
    }
  };

  app.post("/baselines/:deviceId", async (request, reply) => {
    await upsert(request, reply);
  });

  app.put("/baselines/:deviceId", async (request, reply) => {
    await upsert(request, reply);
  });

  app.delete("/baselines/:deviceId", async (request, reply) => {
    if (!(await requirePermission(adminCfg, pg, request, reply, "device:update"))) return;
    if (!pg) {
      legacyFail(reply, 503, "PostgreSQL not configured");
      return;
    }

    const deviceParam = (request.params as { deviceId?: unknown }).deviceId;
    const inputDeviceId = typeof deviceParam === "string" ? deviceParam.trim() : "";
    if (!inputDeviceId) {
      legacyFail(reply, 400, "invalid deviceId");
      return;
    }

    try {
      const resolved = await resolveDeviceId(pg, inputDeviceId);
      if (!resolved) {
        legacyFail(reply, 404, "device not found");
        return;
      }

      const deleted = await withPgClient(pg, async (client) =>
        queryOne<{ device_id: string }>(client, `DELETE FROM gps_baselines WHERE device_id = $1 RETURNING device_id`, [resolved])
      );
      if (!deleted) {
        legacyFail(reply, 404, "baseline not found");
        return;
      }

      legacyOk(reply, { message: "baseline deleted" });
    } catch (err) {
      legacyFail(reply, 500, err instanceof Error ? err.message : "delete failed");
    }
  });
}
