import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppConfig } from "../config";
import { requireAdmin, type AdminAuthConfig } from "../authz";
import { fail, ok } from "../http";
import type { PgPool } from "../postgres";
import { queryOne, withPgClient } from "../postgres";
import { hashPassword } from "../auth";

const userIdSchema = z.string().uuid();

const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(20),
  keyword: z.string().optional(),
  status: z.enum(["active", "inactive", "locked"]).optional(),
  roleId: z.string().uuid().optional()
});

const createUserSchema = z
  .object({
    username: z.string().min(3).max(50),
    password: z.string().min(6),
    realName: z.string().optional(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    roleIds: z.array(z.string().uuid()).optional()
  })
  .strict();

const updateUserSchema = z
  .object({
    realName: z.string().optional(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    status: z.enum(["active", "inactive", "locked"]).optional(),
    roleIds: z.array(z.string().uuid()).optional()
  })
  .strict();

type RoleRow = { role_id: string; role_name: string; display_name: string; description: string | null };

export function registerUserRoutes(app: FastifyInstance, config: AppConfig, pg: PgPool | null): void {
  const adminCfg: AdminAuthConfig = { adminApiToken: config.adminApiToken };

  app.get("/roles", async (request, reply) => {
    const traceId = request.traceId;
    if (!requireAdmin(adminCfg, request, reply)) return;
    if (!pg) {
      fail(reply, 503, "PostgreSQL 未配置", traceId);
      return;
    }
    const rows = await withPgClient(pg, async (client) => {
      const res = await client.query<RoleRow>(
        "SELECT role_id, role_name, display_name, description FROM roles ORDER BY role_name"
      );
      return res.rows;
    });
    ok(
      reply,
      {
        list: rows.map((r) => ({
          roleId: r.role_id,
          name: r.role_name,
          displayName: r.display_name,
          description: r.description ?? ""
        }))
      },
      traceId
    );
  });

  app.get("/permissions", async (request, reply) => {
    const traceId = request.traceId;
    if (!requireAdmin(adminCfg, request, reply)) return;
    if (!pg) {
      fail(reply, 503, "PostgreSQL 未配置", traceId);
      return;
    }
    const rows = await withPgClient(pg, async (client) => {
      const res = await client.query<{ permission_code: string; description: string | null }>(
        "SELECT permission_code, description FROM permissions ORDER BY permission_code"
      );
      return res.rows;
    });
    ok(
      reply,
      {
        list: rows.map((p) => ({ permissionKey: p.permission_code, description: p.description ?? "" }))
      },
      traceId
    );
  });

  app.get("/users", async (request, reply) => {
    const traceId = request.traceId;
    if (!requireAdmin(adminCfg, request, reply)) return;
    if (!pg) {
      fail(reply, 503, "PostgreSQL 未配置", traceId);
      return;
    }

    const parseQuery = listUsersQuerySchema.safeParse(request.query);
    if (!parseQuery.success) {
      fail(reply, 400, "参数错误", traceId, { field: "query", issues: parseQuery.error.issues });
      return;
    }

    const { page, pageSize, keyword, status, roleId } = parseQuery.data;
    const offset = (page - 1) * pageSize;

    const where: string[] = ["u.deleted_at IS NULL"];
    const params: unknown[] = [];
    const add = (sql: string, val: unknown) => {
      params.push(val);
      where.push(sql.replace("$X", "$" + String(params.length)));
    };

    if (keyword) add("(u.username ILIKE $X OR u.real_name ILIKE $X OR u.phone ILIKE $X)", `%${keyword}%`);
    if (status) add("(u.status = $X)", status);
    if (roleId) add("(EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = u.user_id AND ur.role_id = $X))", roleId);

    const whereSql = `WHERE ${where.join(" AND ")}`;

    const data = await withPgClient(pg, async (client) => {
      const totalRow = await queryOne<{ total: string }>(
        client,
        `SELECT count(*)::text AS total FROM users u ${whereSql}`,
        params
      );
      const total = Number(totalRow?.total ?? "0");

      const res = await client.query<{
        user_id: string;
        username: string;
        real_name: string | null;
        email: string | null;
        phone: string | null;
        status: string;
        last_login_at: string | null;
        created_at: string;
      }>(
        `
          SELECT
            u.user_id,
            u.username,
            u.real_name,
            u.email,
            u.phone,
            u.status,
            to_char(u.last_login_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS last_login_at,
            to_char(u.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at
          FROM users u
          ${whereSql}
          ORDER BY u.created_at DESC
          LIMIT $${String(params.length + 1)}
          OFFSET $${String(params.length + 2)}
        `,
        params.concat([pageSize, offset])
      );

      const userIds = res.rows.map((r) => r.user_id);
      const rolesByUserId = new Map<string, { roleId: string; name: string }[]>();
      if (userIds.length > 0) {
        const roleRes = await client.query<{ user_id: string; role_id: string; role_name: string }>(
          `
            SELECT ur.user_id, r.role_id, r.role_name
            FROM user_roles ur
            JOIN roles r ON r.role_id = ur.role_id
            WHERE ur.user_id = ANY($1::uuid[])
            ORDER BY r.role_name
          `,
          [userIds]
        );
        for (const rr of roleRes.rows) {
          const arr = rolesByUserId.get(rr.user_id) ?? [];
          arr.push({ roleId: rr.role_id, name: rr.role_name });
          rolesByUserId.set(rr.user_id, arr);
        }
      }

      return {
        total,
        list: res.rows.map((u) => ({
          userId: u.user_id,
          username: u.username,
          realName: u.real_name ?? "",
          email: u.email ?? "",
          phone: u.phone ?? "",
          status: u.status,
          roles: rolesByUserId.get(u.user_id) ?? [],
          lastLoginAt: u.last_login_at,
          createdAt: u.created_at
        }))
      };
    });

    ok(reply, { list: data.list, pagination: { page, pageSize, total: data.total } }, traceId);
  });

  app.post("/users", async (request, reply) => {
    const traceId = request.traceId;
    if (!requireAdmin(adminCfg, request, reply)) return;
    if (!pg) {
      fail(reply, 503, "PostgreSQL 未配置", traceId);
      return;
    }

    const parseBody = createUserSchema.safeParse(request.body);
    if (!parseBody.success) {
      fail(reply, 400, "参数错误", traceId, { field: "body", issues: parseBody.error.issues });
      return;
    }
    const { username, password, realName, email, phone, roleIds } = parseBody.data;
    const passwordHash = await hashPassword(password);

    const created = await withPgClient(pg, async (client) => {
      await client.query("BEGIN");
      try {
        const row = await queryOne<{ user_id: string }>(
          client,
          `
            INSERT INTO users (username, password_hash, real_name, email, phone, status)
            VALUES ($1, $2, $3, $4, $5, 'active')
            RETURNING user_id
          `,
          [username, passwordHash, realName ?? null, email ?? null, phone ?? null]
        );
        if (!row) throw new Error("insert user failed");

        const uniqueRoles = Array.from(new Set(roleIds ?? []));
        for (const rid of uniqueRoles) {
          await client.query("INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [
            row.user_id,
            rid
          ]);
        }
        await client.query("COMMIT");
        return row.user_id;
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    });

    ok(reply, { userId: created }, traceId);
  });

  app.get("/users/:userId", async (request, reply) => {
    const traceId = request.traceId;
    if (!requireAdmin(adminCfg, request, reply)) return;
    if (!pg) {
      fail(reply, 503, "PostgreSQL 未配置", traceId);
      return;
    }

    const parseId = userIdSchema.safeParse((request.params as { userId?: unknown }).userId);
    if (!parseId.success) {
      fail(reply, 400, "参数错误", traceId, { field: "userId" });
      return;
    }
    const userId = parseId.data;

    const row = await withPgClient(pg, async (client) =>
      queryOne<{
        user_id: string;
        username: string;
        real_name: string | null;
        email: string | null;
        phone: string | null;
        status: string;
        last_login_at: string | null;
        created_at: string;
        updated_at: string;
      }>(
        client,
        `
          SELECT
            user_id,
            username,
            real_name,
            email,
            phone,
            status,
            to_char(last_login_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS last_login_at,
            to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
            to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at
          FROM users
          WHERE user_id = $1 AND deleted_at IS NULL
        `,
        [userId]
      )
    );

    if (!row) {
      fail(reply, 404, "资源不存在", traceId, { userId });
      return;
    }

    const rolesAndPerms = await withPgClient(pg, async (client) => {
      const roles = await client.query<{ role_id: string; role_name: string; display_name: string }>(
        `
          SELECT r.role_id, r.role_name, r.display_name
          FROM user_roles ur
          JOIN roles r ON r.role_id = ur.role_id
          WHERE ur.user_id = $1
          ORDER BY r.role_name
        `,
        [userId]
      );
      const perms = await client.query<{ permission_code: string }>(
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
        roles: roles.rows.map((r) => ({ roleId: r.role_id, name: r.role_name, displayName: r.display_name })),
        permissions: perms.rows.map((p) => p.permission_code)
      };
    });

    ok(
      reply,
      {
        userId: row.user_id,
        username: row.username,
        realName: row.real_name ?? "",
        email: row.email ?? "",
        phone: row.phone ?? "",
        status: row.status,
        roles: rolesAndPerms.roles,
        permissions: rolesAndPerms.permissions,
        lastLoginAt: row.last_login_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      },
      traceId
    );
  });

  app.put("/users/:userId", async (request, reply) => {
    const traceId = request.traceId;
    if (!requireAdmin(adminCfg, request, reply)) return;
    if (!pg) {
      fail(reply, 503, "PostgreSQL 未配置", traceId);
      return;
    }

    const parseId = userIdSchema.safeParse((request.params as { userId?: unknown }).userId);
    if (!parseId.success) {
      fail(reply, 400, "参数错误", traceId, { field: "userId" });
      return;
    }
    const userId = parseId.data;

    const parseBody = updateUserSchema.safeParse(request.body);
    if (!parseBody.success) {
      fail(reply, 400, "参数错误", traceId, { field: "body", issues: parseBody.error.issues });
      return;
    }

    const { realName, email, phone, status, roleIds } = parseBody.data;

    const updatedAt = await withPgClient(pg, async (client) => {
      const exists = await queryOne<{ ok: boolean }>(client, "SELECT TRUE AS ok FROM users WHERE user_id=$1 AND deleted_at IS NULL", [
        userId
      ]);
      if (!exists) return null;

      await client.query("BEGIN");
      try {
        await client.query(
          `
            UPDATE users
            SET
              real_name = coalesce($2, real_name),
              email = coalesce($3, email),
              phone = coalesce($4, phone),
              status = coalesce($5, status),
              updated_at = NOW()
            WHERE user_id = $1
          `,
          [userId, realName ?? null, email ?? null, phone ?? null, status ?? null]
        );

        if (roleIds) {
          await client.query("DELETE FROM user_roles WHERE user_id = $1", [userId]);
          const unique = Array.from(new Set(roleIds));
          for (const rid of unique) {
            await client.query("INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING", [
              userId,
              rid
            ]);
          }
        }

        const row = await queryOne<{ updated_at: string }>(
          client,
          "SELECT to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"') AS updated_at FROM users WHERE user_id = $1",
          [userId]
        );
        await client.query("COMMIT");
        return row?.updated_at ?? new Date().toISOString();
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    });

    if (!updatedAt) {
      fail(reply, 404, "资源不存在", traceId, { userId });
      return;
    }

    ok(reply, { userId, updatedAt }, traceId);
  });

  app.delete("/users/:userId", async (request, reply) => {
    const traceId = request.traceId;
    if (!requireAdmin(adminCfg, request, reply)) return;
    if (!pg) {
      fail(reply, 503, "PostgreSQL 未配置", traceId);
      return;
    }

    const parseId = userIdSchema.safeParse((request.params as { userId?: unknown }).userId);
    if (!parseId.success) {
      fail(reply, 400, "参数错误", traceId, { field: "userId" });
      return;
    }
    const userId = parseId.data;

    const okDel = await withPgClient(pg, async (client) => {
      const res = await client.query("UPDATE users SET deleted_at = NOW(), updated_at = NOW() WHERE user_id = $1 AND deleted_at IS NULL", [
        userId
      ]);
      return (res.rowCount ?? 0) > 0;
    });

    if (!okDel) {
      fail(reply, 404, "资源不存在", traceId, { userId });
      return;
    }

    ok(reply, {}, traceId);
  });

  app.post("/users/:userId/reset-password", async (request, reply) => {
    const traceId = request.traceId;
    if (!requireAdmin(adminCfg, request, reply)) return;
    if (!pg) {
      fail(reply, 503, "PostgreSQL 未配置", traceId);
      return;
    }

    const parseId = userIdSchema.safeParse((request.params as { userId?: unknown }).userId);
    if (!parseId.success) {
      fail(reply, 400, "参数错误", traceId, { field: "userId" });
      return;
    }
    const userId = parseId.data;

    const random = crypto.randomUUID() + crypto.randomUUID();
    const nextHash = await hashPassword(random);

    const updated = await withPgClient(pg, async (client) => {
      const res = await client.query("UPDATE users SET password_hash=$2, updated_at = NOW() WHERE user_id=$1 AND deleted_at IS NULL", [
        userId,
        nextHash
      ]);
      return (res.rowCount ?? 0) > 0;
    });

    if (!updated) {
      fail(reply, 404, "资源不存在", traceId, { userId });
      return;
    }

    ok(
      reply,
      { userId, mustChangeOnNextLogin: true, resetAt: new Date().toISOString() },
      traceId
    );
  });
}

