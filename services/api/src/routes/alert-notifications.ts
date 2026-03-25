import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppConfig } from "../config";
import { requirePermission, type AdminAuthConfig } from "../authz";
import { fail, ok } from "../http";
import type { PgPool } from "../postgres";
import { queryOne, withPgClient } from "../postgres";

const alertIdSchema = z.string().uuid();
const notificationIdSchema = z.string().uuid();

const queryBoolSchema = z.preprocess((v) => {
  if (typeof v === "string") {
    const t = v.trim().toLowerCase();
    if (t === "1" || t === "true") return true;
    if (t === "0" || t === "false") return false;
  }
  return v;
}, z.boolean());

const listAlertNotificationsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(20),
  status: z.enum(["pending", "sent", "delivered", "failed"]).optional(),
  notifyType: z.enum(["app", "sms", "email", "wechat"]).optional(),
  unreadOnly: queryBoolSchema.optional()
});

const alertNotificationStatsQuerySchema = z.object({
  notifyType: z.enum(["app", "sms", "email", "wechat"]).optional()
});

type AlertNotificationRow = {
  notification_id: string;
  event_id: string;
  event_type: string;
  alert_id: string;
  user_id: string;
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

export function registerAlertNotificationRoutes(
  app: FastifyInstance,
  config: AppConfig,
  pg: PgPool | null
): void {
  const adminCfg: AdminAuthConfig = { adminApiToken: config.adminApiToken, jwtEnabled: Boolean(config.jwtAccessSecret) };

  app.get("/alerts/:alertId/notifications", async (request, reply) => {
    const traceId = request.traceId;
    if (!(await requirePermission(adminCfg, pg, request, reply, "alert:view"))) return;
    if (!pg) {
      fail(reply, 503, "PostgreSQL 未配置", traceId);
      return;
    }

    const parseId = alertIdSchema.safeParse((request.params as { alertId?: unknown }).alertId);
    if (!parseId.success) {
      fail(reply, 400, "参数错误", traceId, { field: "alertId" });
      return;
    }
    const alertId = parseId.data;

    const parseQuery = listAlertNotificationsQuerySchema.safeParse(request.query);
    if (!parseQuery.success) {
      fail(reply, 400, "参数错误", traceId, { field: "query", issues: parseQuery.error.issues });
      return;
    }
    const { page, pageSize, status, notifyType, unreadOnly } = parseQuery.data;

    const where: string[] = ["e.alert_id = $1"];
    const params: unknown[] = [alertId];
    if (status) {
      params.push(status);
      where.push("n.status = $" + String(params.length));
    }
    if (notifyType) {
      params.push(notifyType);
      where.push("n.notify_type = $" + String(params.length));
    }
    if (unreadOnly) {
      where.push("n.read_at IS NULL");
    }

    const whereSql = `WHERE ${where.join(" AND ")}`;
    const offset = (page - 1) * pageSize;

    const data = await withPgClient(pg, async (client) => {
      const exists = await queryOne<{ ok: boolean }>(
        client,
        "SELECT TRUE AS ok FROM alert_events WHERE alert_id=$1 LIMIT 1",
        [alertId]
      );
      if (!exists) return null;

      const totalRow = await queryOne<{ total: string }>(
        client,
        `
          SELECT count(*)::text AS total
          FROM alert_notifications n
          JOIN alert_events e ON e.event_id = n.event_id
          ${whereSql}
        `,
        params
      );
      const total = Number(totalRow?.total ?? "0");

      const rows = await client.query<AlertNotificationRow>(
        `
          SELECT
            n.notification_id,
            n.event_id,
            e.event_type,
            e.alert_id,
            n.user_id,
            n.notify_type,
            n.status,
            n.title,
            n.content,
            n.error_message,
            to_char(n.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
            to_char(n.sent_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS sent_at,
            to_char(n.delivered_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS delivered_at,
            to_char(n.read_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS read_at
          FROM alert_notifications n
          JOIN alert_events e ON e.event_id = n.event_id
          ${whereSql}
          ORDER BY n.created_at DESC
          LIMIT $${String(params.length + 1)}
          OFFSET $${String(params.length + 2)}
        `,
        params.concat([pageSize, offset])
      );

      return { total, list: rows.rows };
    });

    if (!data) {
      fail(reply, 404, "资源不存在", traceId, { alertId });
      return;
    }

    ok(
      reply,
      {
        list: data.list.map((n) => ({
          notificationId: n.notification_id,
          eventId: n.event_id,
          eventType: n.event_type,
          alertId: n.alert_id,
          userId: n.user_id,
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

  app.get("/alerts/:alertId/notifications/stats", async (request, reply) => {
    const traceId = request.traceId;
    if (!(await requirePermission(adminCfg, pg, request, reply, "alert:view"))) return;
    if (!pg) {
      fail(reply, 503, "PostgreSQL 未配置", traceId);
      return;
    }

    const parseId = alertIdSchema.safeParse((request.params as { alertId?: unknown }).alertId);
    if (!parseId.success) {
      fail(reply, 400, "参数错误", traceId, { field: "alertId" });
      return;
    }
    const alertId = parseId.data;

    const parseQuery = alertNotificationStatsQuerySchema.safeParse(request.query);
    if (!parseQuery.success) {
      fail(reply, 400, "参数错误", traceId, { field: "query", issues: parseQuery.error.issues });
      return;
    }
    const { notifyType } = parseQuery.data;

    const where: string[] = ["e.alert_id = $1"];
    const params: unknown[] = [alertId];
    if (notifyType) {
      params.push(notifyType);
      where.push("n.notify_type = $" + String(params.length));
    }
    const whereSql = `WHERE ${where.join(" AND ")}`;

    const data = await withPgClient(pg, async (client) => {
      const exists = await queryOne<{ ok: boolean }>(
        client,
        "SELECT TRUE AS ok FROM alert_events WHERE alert_id=$1 LIMIT 1",
        [alertId]
      );
      if (!exists) return null;

      const totalRow = await queryOne<{ total: string }>(
        client,
        `
          SELECT count(*)::text AS total
          FROM alert_notifications n
          JOIN alert_events e ON e.event_id = n.event_id
          ${whereSql}
        `,
        params
      );
      const unreadRow = await queryOne<{ total: string }>(
        client,
        `
          SELECT count(*)::text AS total
          FROM alert_notifications n
          JOIN alert_events e ON e.event_id = n.event_id
          ${whereSql}
            AND n.read_at IS NULL
        `,
        params
      );

      const statusRows = await client.query<{ status: string; count: string }>(
        `
          SELECT n.status, count(*)::text AS count
          FROM alert_notifications n
          JOIN alert_events e ON e.event_id = n.event_id
          ${whereSql}
          GROUP BY n.status
          ORDER BY n.status
        `,
        params
      );

      const typeRows = await client.query<{ notify_type: string; count: string }>(
        `
          SELECT n.notify_type, count(*)::text AS count
          FROM alert_notifications n
          JOIN alert_events e ON e.event_id = n.event_id
          ${whereSql}
          GROUP BY n.notify_type
          ORDER BY n.notify_type
        `,
        params
      );

      return {
        total: Number(totalRow?.total ?? "0"),
        unread: Number(unreadRow?.total ?? "0"),
        byStatus: statusRows.rows.map((r) => ({ status: r.status, count: Number(r.count) })),
        byNotifyType: typeRows.rows.map((r) => ({ notifyType: r.notify_type, count: Number(r.count) }))
      };
    });

    if (!data) {
      fail(reply, 404, "资源不存在", traceId, { alertId });
      return;
    }

    ok(
      reply,
      {
        alertId,
        notifyType: notifyType ?? "",
        totals: { total: data.total, unread: data.unread },
        byStatus: data.byStatus,
        byNotifyType: data.byNotifyType
      },
      traceId
    );
  });

  app.get("/alerts/:alertId/notifications/:notificationId", async (request, reply) => {
    const traceId = request.traceId;
    if (!(await requirePermission(adminCfg, pg, request, reply, "alert:view"))) return;
    if (!pg) {
      fail(reply, 503, "PostgreSQL 未配置", traceId);
      return;
    }

    const parseAlertId = alertIdSchema.safeParse((request.params as { alertId?: unknown }).alertId);
    if (!parseAlertId.success) {
      fail(reply, 400, "参数错误", traceId, { field: "alertId" });
      return;
    }
    const alertId = parseAlertId.data;

    const parseNotificationId = notificationIdSchema.safeParse((request.params as { notificationId?: unknown }).notificationId);
    if (!parseNotificationId.success) {
      fail(reply, 400, "参数错误", traceId, { field: "notificationId" });
      return;
    }
    const notificationId = parseNotificationId.data;

    const row = await withPgClient(pg, async (client) =>
      queryOne<AlertNotificationRow>(
        client,
        `
          SELECT
            n.notification_id,
            n.event_id,
            e.event_type,
            e.alert_id,
            n.user_id,
            n.notify_type,
            n.status,
            n.title,
            n.content,
            n.error_message,
            to_char(n.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
            to_char(n.sent_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS sent_at,
            to_char(n.delivered_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS delivered_at,
            to_char(n.read_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS read_at
          FROM alert_notifications n
          JOIN alert_events e ON e.event_id = n.event_id
          WHERE e.alert_id = $1 AND n.notification_id = $2
        `,
        [alertId, notificationId]
      )
    );

    if (!row) {
      fail(reply, 404, "资源不存在", traceId, { alertId, notificationId });
      return;
    }

    ok(
      reply,
      {
        notificationId: row.notification_id,
        eventId: row.event_id,
        eventType: row.event_type,
        alertId: row.alert_id,
        userId: row.user_id,
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

  app.put("/alerts/:alertId/notifications/:notificationId/read", async (request, reply) => {
    const traceId = request.traceId;
    if (!(await requirePermission(adminCfg, pg, request, reply, "alert:view"))) return;
    if (!pg) {
      fail(reply, 503, "PostgreSQL 未配置", traceId);
      return;
    }

    const parseAlertId = alertIdSchema.safeParse((request.params as { alertId?: unknown }).alertId);
    if (!parseAlertId.success) {
      fail(reply, 400, "参数错误", traceId, { field: "alertId" });
      return;
    }
    const alertId = parseAlertId.data;

    const parseNotificationId = notificationIdSchema.safeParse((request.params as { notificationId?: unknown }).notificationId);
    if (!parseNotificationId.success) {
      fail(reply, 400, "参数错误", traceId, { field: "notificationId" });
      return;
    }
    const notificationId = parseNotificationId.data;

    const row = await withPgClient(pg, async (client) => {
      const existing = await queryOne<{ read_at: string | null }>(
        client,
        `
          SELECT to_char(n.read_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS read_at
          FROM alert_notifications n
          JOIN alert_events e ON e.event_id = n.event_id
          WHERE e.alert_id = $1 AND n.notification_id = $2
        `,
        [alertId, notificationId]
      );
      if (!existing) return null;
      if (existing.read_at) return existing;

      return queryOne<{ read_at: string }>(
        client,
        `
          UPDATE alert_notifications n
          SET read_at = NOW()
          FROM alert_events e
          WHERE n.event_id = e.event_id
            AND e.alert_id = $1
            AND n.notification_id = $2
            AND n.read_at IS NULL
          RETURNING to_char(n.read_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS read_at
        `,
        [alertId, notificationId]
      );
    });

    if (!row) {
      fail(reply, 404, "资源不存在", traceId, { alertId, notificationId });
      return;
    }

    ok(reply, { notificationId, readAt: row.read_at ?? "" }, traceId);
  });
}
