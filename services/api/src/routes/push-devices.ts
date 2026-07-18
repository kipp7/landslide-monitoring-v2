import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppConfig } from "../config";
import { requirePermission, type AdminAuthConfig } from "../authz";
import { fail, ok } from "../http";
import type { PgPool } from "../postgres";
import { queryOne, withPgClient } from "../postgres";

const registrationSchema = z
  .object({
    token: z.string().trim().min(16).max(4096),
    platform: z.literal("harmonyos"),
    bundleName: z.string().trim().min(3).max(200)
  })
  .strict();

const unregisterSchema = z
  .object({
    token: z.string().trim().min(16).max(4096)
  })
  .strict();

export function registerPushDeviceRoutes(app: FastifyInstance, config: AppConfig, pg: PgPool | null): void {
  const adminCfg: AdminAuthConfig = {
    adminApiToken: config.adminApiToken,
    jwtEnabled: Boolean(config.jwtAccessSecret)
  };

  app.post("/push/devices", async (request, reply) => {
    const traceId = request.traceId;
    if (!(await requirePermission(adminCfg, pg, request, reply, "alert:view"))) return;
    if (!pg) {
      fail(reply, 503, "PostgreSQL 未配置", traceId);
      return;
    }
    const userId = request.user?.userId;
    if (!userId) {
      fail(reply, 401, "未认证", traceId);
      return;
    }
    const parsed = registrationSchema.safeParse(request.body);
    if (!parsed.success) {
      fail(reply, 400, "参数错误", traceId, { field: "body", issues: parsed.error.issues });
      return;
    }

    const row = await withPgClient(pg, async (client) => {
      return queryOne<{ push_device_id: string; last_registered_at: string }>(
        client,
        `
          INSERT INTO app_push_devices(user_id, platform, push_token, bundle_name)
          VALUES ($1::uuid, $2, $3, $4)
          ON CONFLICT (push_token) DO UPDATE SET
            user_id = EXCLUDED.user_id,
            platform = EXCLUDED.platform,
            bundle_name = EXCLUDED.bundle_name,
            is_active = TRUE,
            last_registered_at = NOW(),
            updated_at = NOW()
          RETURNING
            push_device_id,
            to_char(last_registered_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS last_registered_at
        `,
        [userId, parsed.data.platform, parsed.data.token, parsed.data.bundleName]
      );
    });
    if (!row) {
      fail(reply, 500, "推送设备注册失败", traceId);
      return;
    }
    ok(reply, { pushDeviceId: row.push_device_id, registeredAt: row.last_registered_at }, traceId);
  });

  app.delete("/push/devices", async (request, reply) => {
    const traceId = request.traceId;
    if (!(await requirePermission(adminCfg, pg, request, reply, "alert:view"))) return;
    if (!pg) {
      fail(reply, 503, "PostgreSQL 未配置", traceId);
      return;
    }
    const userId = request.user?.userId;
    if (!userId) {
      fail(reply, 401, "未认证", traceId);
      return;
    }
    const parsed = unregisterSchema.safeParse(request.body);
    if (!parsed.success) {
      fail(reply, 400, "参数错误", traceId, { field: "body", issues: parsed.error.issues });
      return;
    }

    const disabled = await withPgClient(pg, async (client) => {
      const result = await client.query(
        `
          UPDATE app_push_devices
          SET is_active = FALSE, updated_at = NOW()
          WHERE user_id = $1::uuid AND push_token = $2 AND is_active = TRUE
        `,
        [userId, parsed.data.token]
      );
      return result.rowCount ?? 0;
    });
    ok(reply, { disabled }, traceId);
  });
}
