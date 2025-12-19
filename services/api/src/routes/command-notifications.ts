import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppConfig } from "../config";
import { requireAdmin, type AdminAuthConfig } from "../authz";
import { fail, ok } from "../http";
import type { PgPool } from "../postgres";
import { queryOne, withPgClient } from "../postgres";

const deviceIdSchema = z.string().uuid();
const notificationIdSchema = z.string().uuid();

const queryBoolSchema = z.preprocess((v) => {
  if (typeof v === "string") {
    const t = v.trim().toLowerCase();
    if (t === "1" || t === "true") return true;
    if (t === "0" || t === "false") return false;
  }
  return v;
}, z.boolean());

const listNotificationsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(20),
  startTime: z.string().datetime().optional(),
  endTime: z.string().datetime().optional(),
  commandId: z.string().uuid().optional(),
  eventType: z
    .enum(["COMMAND_SENT", "COMMAND_ACKED", "COMMAND_FAILED", "COMMAND_TIMEOUT"])
    .optional(),
  status: z.enum(["pending", "sent", "delivered", "failed"]).optional(),
  notifyType: z.enum(["app", "sms", "email", "wechat"]).optional(),
  unreadOnly: queryBoolSchema.optional()
});

const notificationStatsQuerySchema = z.object({
  startTime: z.string().datetime().optional(),
  endTime: z.string().datetime().optional(),
  notifyType: z.enum(["app", "sms", "email", "wechat"]).optional(),
  bucket: z.enum(["1h", "1d"]).optional()
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
    const { page, pageSize, startTime, endTime, commandId, eventType, status, notifyType, unreadOnly } =
      parseQuery.data;

    if ((startTime && !endTime) || (!startTime && endTime)) {
      fail(reply, 400, "参数错误", traceId, { field: "timeRange" });
      return;
    }
    const start = startTime ? new Date(startTime) : null;
    const end = endTime ? new Date(endTime) : null;
    if (start && end && !(start < end)) {
      fail(reply, 400, "参数错误", traceId, { field: "timeRange" });
      return;
    }

    const where: string[] = ["e.device_id = $1"];
    const params: unknown[] = [deviceId];
    if (start && end) {
      params.push(start);
      where.push("n.created_at >= $" + String(params.length) + "::timestamptz");
      params.push(end);
      where.push("n.created_at <= $" + String(params.length) + "::timestamptz");
    }
    if (commandId) {
      params.push(commandId);
      where.push("e.command_id = $" + String(params.length));
    }
    if (eventType) {
      params.push(eventType);
      where.push("e.event_type = $" + String(params.length));
    }
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

  app.get("/devices/:deviceId/command-notifications/stats", async (request, reply) => {
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

    const parseQuery = notificationStatsQuerySchema.safeParse(request.query);
    if (!parseQuery.success) {
      fail(reply, 400, "参数错误", traceId, { field: "query", issues: parseQuery.error.issues });
      return;
    }

    const { startTime, endTime, notifyType } = parseQuery.data;
    if ((startTime && !endTime) || (!startTime && endTime)) {
      fail(reply, 400, "参数错误", traceId, { field: "timeRange" });
      return;
    }
    const start = startTime ? new Date(startTime) : null;
    const end = endTime ? new Date(endTime) : null;
    if (start && end && !(start < end)) {
      fail(reply, 400, "参数错误", traceId, { field: "timeRange" });
      return;
    }

    const where: string[] = ["e.device_id = $1"];
    const params: unknown[] = [deviceId];
    if (start && end) {
      params.push(start);
      where.push("n.created_at >= $" + String(params.length) + "::timestamptz");
      params.push(end);
      where.push("n.created_at <= $" + String(params.length) + "::timestamptz");
    }
    if (notifyType) {
      params.push(notifyType);
      where.push("n.notify_type = $" + String(params.length));
    }

    const whereSql = `WHERE ${where.join(" AND ")}`;
    const bucket = parseQuery.data.bucket;
    if (bucket && !(startTime && endTime)) {
      fail(reply, 400, "参数错误", traceId, { field: "bucket", reason: "bucket requires startTime + endTime" });
      return;
    }

    if (bucket && start && end) {
      const bucketMs = bucket === "1h" ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
      const maxBuckets = 1000;
      const buckets = Math.ceil((end.getTime() - start.getTime()) / bucketMs);
      if (buckets > maxBuckets) {
        fail(reply, 400, "参数错误", traceId, { field: "bucket", reason: "time range too large" });
        return;
      }
    }

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

      const unreadRow = await queryOne<{ total: string }>(
        client,
        `
          SELECT count(*)::text AS total
          FROM device_command_notifications n
          JOIN device_command_events e ON e.event_id = n.event_id
          ${whereSql}
            AND n.read_at IS NULL
        `,
        params
      );
      const unread = Number(unreadRow?.total ?? "0");

      const statusRows = await client.query<{ status: string; count: string }>(
        `
          SELECT n.status, count(*)::text AS count
          FROM device_command_notifications n
          JOIN device_command_events e ON e.event_id = n.event_id
          ${whereSql}
          GROUP BY n.status
          ORDER BY n.status
        `,
        params
      );

      const typeRows = await client.query<{ notify_type: string; count: string }>(
        `
          SELECT n.notify_type, count(*)::text AS count
          FROM device_command_notifications n
          JOIN device_command_events e ON e.event_id = n.event_id
          ${whereSql}
          GROUP BY n.notify_type
          ORDER BY n.notify_type
        `,
        params
      );

      const eventTypeRows = await client.query<{ event_type: string; count: string }>(
        `
          SELECT e.event_type, count(*)::text AS count
          FROM device_command_notifications n
          JOIN device_command_events e ON e.event_id = n.event_id
          ${whereSql}
          GROUP BY e.event_type
          ORDER BY e.event_type
        `,
        params
      );

      const bucketRows =
        bucket && start && end
          ? await client.query<{ bucket_start: string; total: string; unread: string }>(
              `
                SELECT
                  to_char(date_trunc('${bucket === "1h" ? "hour" : "day"}', n.created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS bucket_start,
                  count(*)::text AS total,
                  sum(CASE WHEN n.read_at IS NULL THEN 1 ELSE 0 END)::text AS unread
                FROM device_command_notifications n
                JOIN device_command_events e ON e.event_id = n.event_id
                ${whereSql}
                GROUP BY 1
                ORDER BY 1
              `,
              params
            )
          : null;

      return {
        total,
        unread,
        byStatus: statusRows.rows.map((r) => ({ status: r.status, count: Number(r.count) })),
        byNotifyType: typeRows.rows.map((r) => ({
          notifyType: r.notify_type,
          count: Number(r.count)
        })),
        byEventType: eventTypeRows.rows.map((r) => ({ eventType: r.event_type, count: Number(r.count) })),
        byBucket:
          bucketRows?.rows.map((r) => ({
            bucketStartTime: r.bucket_start,
            totals: { total: Number(r.total), unread: Number(r.unread) }
          })) ?? []
      };
    });

    if (!data) {
      fail(reply, 404, "资源不存在", traceId, { deviceId });
      return;
    }

    ok(
      reply,
      {
        deviceId,
        window: startTime && endTime ? { startTime, endTime } : null,
        notifyType: notifyType ?? "",
        bucket: bucket ?? "",
        totals: {
          total: data.total,
          unread: data.unread
        },
        byStatus: data.byStatus,
        byNotifyType: data.byNotifyType,
        byEventType: data.byEventType,
        byBucket: data.byBucket
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

  app.put("/devices/:deviceId/command-notifications/:notificationId/read", async (request, reply) => {
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

    const row = await withPgClient(pg, async (client) => {
      const existing = await queryOne<{ read_at: string | null }>(
        client,
        `
          SELECT to_char(n.read_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS read_at
          FROM device_command_notifications n
          JOIN device_command_events e ON e.event_id = n.event_id
          WHERE n.notification_id = $1 AND e.device_id = $2
        `,
        [notificationId, deviceId]
      );
      if (!existing) return null;
      if (existing.read_at) return existing;

      return queryOne<{ read_at: string }>(
        client,
        `
          UPDATE device_command_notifications n
          SET read_at = NOW()
          FROM device_command_events e
          WHERE n.event_id = e.event_id
            AND n.notification_id = $1
            AND e.device_id = $2
            AND n.read_at IS NULL
          RETURNING to_char(n.read_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS read_at
        `,
        [notificationId, deviceId]
      );
    });

    if (!row) {
      fail(reply, 404, "资源不存在", traceId, { deviceId, notificationId });
      return;
    }

    ok(reply, { notificationId, readAt: row.read_at ?? "" }, traceId);
  });
}
