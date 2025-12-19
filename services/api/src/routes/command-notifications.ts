import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppConfig } from "../config";
import { requireAdmin, type AdminAuthConfig } from "../authz";
import { fail, ok } from "../http";
import type { PgPool } from "../postgres";
import { queryOne, withPgClient } from "../postgres";

const deviceIdSchema = z.string().uuid();
const notificationIdSchema = z.string().uuid();

const listNotificationsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(20),
  commandId: z.string().uuid().optional(),
  status: z.enum(["pending", "sent", "delivered", "failed"]).optional()
});

type NotificationRow = {
  notification_id: string;
  event_id: string;
  event_type: string;
  command_id: string;
  device_id: string;
  notify_type: string;
  status: string;
  title: string;
  content: string;
  error_message: string | null;
  created_at: string;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
};

export function registerCommandNotificationRoutes(
  app: FastifyInstance,
  config: AppConfig,
  pg: PgPool | null
): void {
  const adminCfg: AdminAuthConfig = { adminApiToken: config.adminApiToken };

  app.get("/devices/:deviceId/command-notifications", async (request, reply) => {
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

    const parseQuery = listNotificationsQuerySchema.safeParse(request.query);
    if (!parseQuery.success) {
      fail(reply, 400, "参数错误", traceId, { field: "query", issues: parseQuery.error.issues });
      return;
    }
    const { page, pageSize, commandId, status } = parseQuery.data;

    const where: string[] = ["e.device_id = $1"];
    const params: unknown[] = [deviceId];
    if (commandId) {
      params.push(commandId);
      where.push("e.command_id = $" + String(params.length));
    }
    if (status) {
      params.push(status);
      where.push("n.status = $" + String(params.length));
    }

    const whereSql = `WHERE ${where.join(" AND ")}`;
    const offset = (page - 1) * pageSize;

    const data = await withPgClient(pg, async (client) => {
      const exists = await queryOne<{ ok: boolean }>(
        client,
        "SELECT TRUE AS ok FROM devices WHERE device_id=$1",
        [deviceId]
      );
      if (!exists) return null;

      const totalRow = await queryOne<{ total: string }>(
        client,
        `
          SELECT count(*)::text AS total
          FROM device_command_notifications n
          JOIN device_command_events e ON e.event_id = n.event_id
          ${whereSql}
        `,
        params
      );
      const total = Number(totalRow?.total ?? "0");

      const res = await client.query<NotificationRow>(
        `
          SELECT
            n.notification_id,
            n.event_id,
            e.event_type,
            e.command_id,
            e.device_id,
            n.notify_type,
            n.status,
            n.title,
            n.content,
            n.error_message,
            to_char(n.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
            to_char(n.sent_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS sent_at,
            to_char(n.delivered_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS delivered_at,
            to_char(n.read_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS read_at
          FROM device_command_notifications n
          JOIN device_command_events e ON e.event_id = n.event_id
          ${whereSql}
          ORDER BY n.created_at DESC
          LIMIT $${String(params.length + 1)}
          OFFSET $${String(params.length + 2)}
        `,
        params.concat([pageSize, offset])
      );

      return { total, list: res.rows };
    });

    if (!data) {
      fail(reply, 404, "资源不存在", traceId, { deviceId });
      return;
    }

    ok(
      reply,
      {
        list: data.list.map((n) => ({
          notificationId: n.notification_id,
          eventId: n.event_id,
          eventType: n.event_type,
          commandId: n.command_id,
          deviceId: n.device_id,
          notifyType: n.notify_type,
          status: n.status,
          title: n.title,
          content: n.content,
          errorMessage: n.error_message ?? "",
          createdAt: n.created_at,
          sentAt: n.sent_at,
          deliveredAt: n.delivered_at,
          readAt: n.read_at
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

  app.get("/devices/:deviceId/command-notifications/:notificationId", async (request, reply) => {
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

    const parseN = notificationIdSchema.safeParse(
      (request.params as { notificationId?: unknown }).notificationId
    );
    if (!parseN.success) {
      fail(reply, 400, "参数错误", traceId, { field: "notificationId" });
      return;
    }
    const notificationId = parseN.data;

    const row = await withPgClient(pg, async (client) =>
      queryOne<NotificationRow>(
        client,
        `
          SELECT
            n.notification_id,
            n.event_id,
            e.event_type,
            e.command_id,
            e.device_id,
            n.notify_type,
            n.status,
            n.title,
            n.content,
            n.error_message,
            to_char(n.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
            to_char(n.sent_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS sent_at,
            to_char(n.delivered_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS delivered_at,
            to_char(n.read_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS read_at
          FROM device_command_notifications n
          JOIN device_command_events e ON e.event_id = n.event_id
          WHERE n.notification_id = $1 AND e.device_id = $2
        `,
        [notificationId, deviceId]
      )
    );

    if (!row) {
      fail(reply, 404, "资源不存在", traceId, { deviceId, notificationId });
      return;
    }

    ok(
      reply,
      {
        notificationId: row.notification_id,
        eventId: row.event_id,
        eventType: row.event_type,
        commandId: row.command_id,
        deviceId: row.device_id,
        notifyType: row.notify_type,
        status: row.status,
        title: row.title,
        content: row.content,
        errorMessage: row.error_message ?? "",
        createdAt: row.created_at,
        sentAt: row.sent_at,
        deliveredAt: row.delivered_at,
        readAt: row.read_at
      },
      traceId
    );
  });
}

