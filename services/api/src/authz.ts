import type { FastifyReply, FastifyRequest } from "fastify";
import { fail } from "./http";
import type { PgPool } from "./postgres";
import { queryOne, withPgClient } from "./postgres";

export type AdminAuthConfig = {
  adminApiToken?: string | undefined;
  jwtEnabled: boolean;
};

export function requireAdmin(
  cfg: AdminAuthConfig,
  request: FastifyRequest,
  reply: FastifyReply
): boolean {
  if (!cfg.adminApiToken) return true;
  const auth = request.headers.authorization;
  const traceId = request.traceId;
  if (!auth?.startsWith("Bearer ")) {
    fail(reply, 401, "未认证", traceId);
    return false;
  }
  const token = auth.slice("Bearer ".length).trim();
  if (!token || token !== cfg.adminApiToken) {
    fail(reply, 403, "禁止访问", traceId);
    return false;
  }
  return true;
}

async function hasPermission(pg: PgPool, userId: string, permissionCode: string): Promise<boolean> {
  return withPgClient(pg, async (client) => {
    const row = await queryOne<{ ok: boolean }>(
      client,
      `
        SELECT EXISTS (
          SELECT 1
          FROM user_roles ur
          JOIN role_permissions rp ON rp.role_id = ur.role_id
          JOIN permissions p ON p.permission_id = rp.permission_id
          WHERE ur.user_id = $1 AND p.permission_code = $2
        ) AS ok
      `,
      [userId, permissionCode]
    );
    return Boolean(row?.ok);
  });
}

export async function requirePermission(
  cfg: AdminAuthConfig,
  pg: PgPool | null,
  request: FastifyRequest,
  reply: FastifyReply,
  permissionCode: string
): Promise<boolean> {
  const traceId = request.traceId;

  const auth = request.headers.authorization;
  if (cfg.adminApiToken && auth?.startsWith("Bearer ")) {
    const token = auth.slice("Bearer ".length).trim();
    if (token && token === cfg.adminApiToken) return true;
  }

  if (!cfg.jwtEnabled) return true;

  const userId = request.user?.userId;
  if (!userId) {
    fail(reply, 401, "未认证", traceId);
    return false;
  }

  if (!pg) {
    fail(reply, 503, "PostgreSQL 未配置", traceId);
    return false;
  }

  const okPerm = await hasPermission(pg, userId, permissionCode);
  if (!okPerm) {
    fail(reply, 403, "禁止访问", traceId, { permission: permissionCode });
    return false;
  }

  return true;
}
