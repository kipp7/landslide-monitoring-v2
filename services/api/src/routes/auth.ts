import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppConfig } from "../config";
import { fail, ok } from "../http";
import type { PgPool } from "../postgres";
import { queryOne, withPgClient } from "../postgres";
import { hashPassword, signAccessToken, signRefreshToken, verifyPassword, verifyRefreshToken } from "../auth";
import { enqueueOperationLog } from "../operation-log";

const loginRequestSchema = z
  .object({
    username: z.string().min(1),
    password: z.string().min(1)
  })
  .strict();

const refreshRequestSchema = z
  .object({
    refreshToken: z.string().min(1)
  })
  .strict();

const changePasswordRequestSchema = z
  .object({
    oldPassword: z.string().min(1),
    newPassword: z.string().min(6)
  })
  .strict();

type UserRow = {
  user_id: string;
  username: string;
  password_hash: string;
  email: string | null;
  phone: string | null;
  real_name: string | null;
  status: "active" | "inactive" | "locked";
  last_login_at: string | null;
};

async function loadRolesAndPermissions(pg: PgPool, userId: string): Promise<{
  roles: { roleId: string; name: string; displayName: string }[];
  permissions: string[];
}> {
  return withPgClient(pg, async (client) => {
    const roleRes = await client.query<{ role_id: string; role_name: string; display_name: string }>(
      `
        SELECT r.role_id, r.role_name, r.display_name
        FROM user_roles ur
        JOIN roles r ON r.role_id = ur.role_id
        WHERE ur.user_id = $1
        ORDER BY r.role_name
      `,
      [userId]
    );

    const permRes = await client.query<{ permission_code: string }>(
      `
        SELECT DISTINCT p.permission_code
        FROM user_roles ur
        JOIN role_permissions rp ON rp.role_id = ur.role_id
        JOIN permissions p ON p.permission_id = rp.permission_id
        WHERE ur.user_id = $1
        ORDER BY p.permission_code
      `,
      [userId]
    );

    return {
      roles: roleRes.rows.map((r) => ({ roleId: r.role_id, name: r.role_name, displayName: r.display_name })),
      permissions: permRes.rows.map((p) => p.permission_code)
    };
  });
}

export function registerAuthRoutes(app: FastifyInstance, config: AppConfig, pg: PgPool | null): void {
  app.post("/auth/login", async (request, reply) => {
    const traceId = request.traceId;
    if (!pg) {
      fail(reply, 503, "PostgreSQL 未配置", traceId);
      return;
    }
    if (!config.jwtAccessSecret || !config.jwtRefreshSecret) {
      fail(reply, 503, "JWT 未配置", traceId);
      return;
    }

    const parseBody = loginRequestSchema.safeParse(request.body);
    if (!parseBody.success) {
      fail(reply, 400, "参数错误", traceId, { field: "body", issues: parseBody.error.issues });
      return;
    }
    const { username, password } = parseBody.data;

    const row = await withPgClient(pg, async (client) =>
      queryOne<UserRow>(
        client,
        `
          SELECT
            user_id,
            username,
            password_hash,
            email,
            phone,
            real_name,
            status,
            to_char(last_login_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS last_login_at
          FROM users
          WHERE username = $1 AND deleted_at IS NULL
        `,
        [username]
      )
    );

    if (!row) {
      fail(reply, 401, "用户名或密码错误", traceId);
      return;
    }
    if (row.status !== "active") {
      fail(reply, 403, "账号不可用", traceId, { status: row.status });
      return;
    }

    const okPwd = await verifyPassword(password, row.password_hash);
    if (!okPwd) {
      fail(reply, 401, "用户名或密码错误", traceId);
      return;
    }

    const authUser = { userId: row.user_id, username: row.username };
    const { token, expiresIn } = signAccessToken(config, authUser);
    const { refreshToken } = signRefreshToken(config, authUser);

    const extra = await loadRolesAndPermissions(pg, row.user_id);

    void withPgClient(pg, async (client) => {
      await client.query("UPDATE users SET last_login_at = NOW(), login_attempts = 0 WHERE user_id = $1", [
        row.user_id
      ]);
    }).catch(() => undefined);

    enqueueOperationLog(pg, request, {
      module: "auth",
      action: "login",
      description: "user login",
      status: "success",
      requestData: { username },
      responseData: { userId: row.user_id },
      userIdOverride: row.user_id,
      usernameOverride: row.username
    });

    ok(
      reply,
      {
        token,
        refreshToken,
        expiresIn,
        user: {
          userId: row.user_id,
          username: row.username,
          realName: row.real_name ?? "",
          roles: extra.roles.map((r) => r.name),
          permissions: extra.permissions
        }
      },
      traceId
    );
  });

  app.post("/auth/refresh", async (request, reply) => {
    const traceId = request.traceId;
    if (!pg) {
      fail(reply, 503, "PostgreSQL 未配置", traceId);
      return;
    }
    if (!config.jwtAccessSecret || !config.jwtRefreshSecret) {
      fail(reply, 503, "JWT 未配置", traceId);
      return;
    }

    const parseBody = refreshRequestSchema.safeParse(request.body);
    if (!parseBody.success) {
      fail(reply, 400, "参数错误", traceId, { field: "body", issues: parseBody.error.issues });
      return;
    }
    const { refreshToken } = parseBody.data;

    const u = verifyRefreshToken(config, refreshToken);
    if (!u) {
      fail(reply, 401, "未认证", traceId);
      return;
    }

    const exists = await withPgClient(pg, async (client) =>
      queryOne<{ ok: boolean }>(client, "SELECT TRUE AS ok FROM users WHERE user_id=$1 AND deleted_at IS NULL", [
        u.userId
      ])
    );
    if (!exists) {
      fail(reply, 401, "未认证", traceId);
      return;
    }

    const nextAccess = signAccessToken(config, u);
    const nextRefresh = signRefreshToken(config, u);

    ok(
      reply,
      { token: nextAccess.token, refreshToken: nextRefresh.refreshToken, expiresIn: nextAccess.expiresIn },
      traceId
    );
  });

  app.post("/auth/logout", async (request, reply) => {
    const traceId = request.traceId;
    ok(reply, {}, traceId);
  });

  app.get("/auth/me", async (request, reply) => {
    const traceId = request.traceId;
    if (!pg) {
      fail(reply, 503, "PostgreSQL 未配置", traceId);
      return;
    }
    const u = request.user;
    if (!u) {
      fail(reply, 401, "未认证", traceId);
      return;
    }

    const row = await withPgClient(pg, async (client) =>
      queryOne<{
        user_id: string;
        username: string;
        email: string | null;
        phone: string | null;
        real_name: string | null;
      }>(
        client,
        `
          SELECT user_id, username, email, phone, real_name
          FROM users
          WHERE user_id = $1 AND deleted_at IS NULL
        `,
        [u.userId]
      )
    );
    if (!row) {
      fail(reply, 401, "未认证", traceId);
      return;
    }

    const extra = await loadRolesAndPermissions(pg, u.userId);

    ok(
      reply,
      {
        userId: row.user_id,
        username: row.username,
        email: row.email ?? "",
        phone: row.phone ?? "",
        realName: row.real_name ?? "",
        roles: extra.roles,
        permissions: extra.permissions
      },
      traceId
    );
  });

  app.put("/auth/password", async (request, reply) => {
    const traceId = request.traceId;
    if (!pg) {
      fail(reply, 503, "PostgreSQL 未配置", traceId);
      return;
    }
    const u = request.user;
    if (!u) {
      fail(reply, 401, "未认证", traceId);
      return;
    }

    const parseBody = changePasswordRequestSchema.safeParse(request.body);
    if (!parseBody.success) {
      fail(reply, 400, "参数错误", traceId, { field: "body", issues: parseBody.error.issues });
      return;
    }
    const { oldPassword, newPassword } = parseBody.data;

    const row = await withPgClient(pg, async (client) =>
      queryOne<{ password_hash: string }>(
        client,
        "SELECT password_hash FROM users WHERE user_id = $1 AND deleted_at IS NULL",
        [u.userId]
      )
    );
    if (!row) {
      fail(reply, 401, "未认证", traceId);
      return;
    }

    const okPwd = await verifyPassword(oldPassword, row.password_hash);
    if (!okPwd) {
      fail(reply, 400, "旧密码错误", traceId);
      return;
    }

    const nextHash = await hashPassword(newPassword);
    await withPgClient(pg, async (client) => {
      await client.query("UPDATE users SET password_hash = $2, updated_at = NOW() WHERE user_id = $1", [
        u.userId,
        nextHash
      ]);
    });

    enqueueOperationLog(pg, request, {
      module: "auth",
      action: "change_password",
      description: "change password",
      status: "success",
      requestData: {},
      responseData: {}
    });

    ok(reply, {}, traceId);
  });
}
