import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { AppConfig } from "../config";
import { requirePermission, type AdminAuthConfig } from "../authz";
import { fail, ok } from "../http";
import type { PgPool } from "../postgres";
import { queryOne, withPgClient } from "../postgres";

const messageIdSchema = z.string().uuid();
const listDlqQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(200).default(20),
    reasonCode: z.string().min(1).optional(),
    deviceId: z.string().uuid().optional(),
    startTime: z.string().datetime().optional(),
    endTime: z.string().datetime().optional()
  })
  .superRefine((data, ctx) => {
    if ((data.startTime && !data.endTime) || (!data.startTime && data.endTime)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "startTime and endTime must be both set or both empty"
      });
    }
  });

const dlqStatsQuerySchema = z
  .object({
    startTime: z.string().datetime().optional(),
    endTime: z.string().datetime().optional(),
    deviceId: z.string().uuid().optional()
  })
  .superRefine((data, ctx) => {
    if ((data.startTime && !data.endTime) || (!data.startTime && data.endTime)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "startTime and endTime must be both set or both empty"
      });
    }
  });

type DlqRow = {
  message_id: string;
  kafka_topic: string;
  kafka_partition: number;
  kafka_offset: string;
  kafka_key: string | null;
  received_ts: string;
  device_id: string | null;
  reason_code: string;
  reason_detail: string | null;
  raw_payload: string;
  created_at: string;
};

function previewText(value: string, maxLen: number): string {
  if (value.length <= maxLen) return value;
  return value.slice(0, maxLen);
}

export function registerTelemetryDlqRoutes(app: FastifyInstance, config: AppConfig, pg: PgPool | null): void {
  const adminCfg: AdminAuthConfig = { adminApiToken: config.adminApiToken, jwtEnabled: Boolean(config.jwtAccessSecret) };

  app.get("/telemetry/dlq/stats", async (request, reply) => {
    const traceId = request.traceId;
    if (!(await requirePermission(adminCfg, pg, request, reply, "data:analysis"))) return;
    if (!pg) {
      fail(reply, 503, "PostgreSQL 未配置", traceId);
      return;
    }

    const parseQuery = dlqStatsQuerySchema.safeParse(request.query);
    if (!parseQuery.success) {
      fail(reply, 400, "参数错误", traceId, { field: "query", issues: parseQuery.error.issues });
      return;
    }

    const { startTime, endTime, deviceId } = parseQuery.data;
    if (startTime && endTime) {
      const start = new Date(startTime);
      const end = new Date(endTime);
      if (!(start < end)) {
        fail(reply, 400, "参数错误", traceId, { field: "timeRange" });
        return;
      }
    }

    const where: string[] = [];
    const params: unknown[] = [];
    if (deviceId) {
      params.push(deviceId);
      where.push(`device_id = $${String(params.length)}::uuid`);
    }
    if (startTime && endTime) {
      params.push(startTime);
      where.push(`received_ts >= $${String(params.length)}::timestamptz`);
      params.push(endTime);
      where.push(`received_ts <= $${String(params.length)}::timestamptz`);
    }
    const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

    const data = await withPgClient(pg, async (client) => {
      const totalRow = await queryOne<{ total: string }>(
        client,
        `SELECT count(*)::text AS total FROM telemetry_dlq_messages ${whereSql}`,
        params
      );
      const total = Number(totalRow?.total ?? "0");

      const byReason = await client.query<{ reason_code: string; count: string }>(
        `
          SELECT reason_code, count(*)::text AS count
          FROM telemetry_dlq_messages
          ${whereSql}
          GROUP BY reason_code
          ORDER BY count(*) DESC, reason_code ASC
        `,
        params
      );

      return {
        total,
        byReasonCode: byReason.rows.map((r) => ({ reasonCode: r.reason_code, count: Number(r.count) }))
      };
    });

    ok(
      reply,
      {
        window: startTime && endTime ? { startTime, endTime } : null,
        deviceId: deviceId ?? "",
        totals: { total: data.total },
        byReasonCode: data.byReasonCode
      },
      traceId
    );
  });

  app.get("/telemetry/dlq", async (request, reply) => {
    const traceId = request.traceId;
    if (!(await requirePermission(adminCfg, pg, request, reply, "data:analysis"))) return;
    if (!pg) {
      fail(reply, 503, "PostgreSQL 未配置", traceId);
      return;
    }

    const parseQuery = listDlqQuerySchema.safeParse(request.query);
    if (!parseQuery.success) {
      fail(reply, 400, "参数错误", traceId, { field: "query", issues: parseQuery.error.issues });
      return;
    }

    const { page, pageSize, reasonCode, deviceId, startTime, endTime } = parseQuery.data;
    const offset = (page - 1) * pageSize;

    const where: string[] = [];
    const params: unknown[] = [];
    if (reasonCode) {
      params.push(reasonCode);
      where.push(`reason_code = $${String(params.length)}`);
    }
    if (deviceId) {
      params.push(deviceId);
      where.push(`device_id = $${String(params.length)}::uuid`);
    }
    if (startTime && endTime) {
      params.push(startTime);
      where.push(`received_ts >= $${String(params.length)}::timestamptz`);
      params.push(endTime);
      where.push(`received_ts <= $${String(params.length)}::timestamptz`);
    }

    const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

    const data = await withPgClient(pg, async (client) => {
      const totalRow = await queryOne<{ total: string }>(
        client,
        `SELECT count(*)::text AS total FROM telemetry_dlq_messages ${whereSql}`,
        params
      );
      const total = Number(totalRow?.total ?? "0");

      const res = await client.query<DlqRow>(
        `
          SELECT
            message_id,
            kafka_topic,
            kafka_partition,
            kafka_offset::text AS kafka_offset,
            kafka_key,
            to_char(received_ts AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS received_ts,
            device_id::text AS device_id,
            reason_code,
            reason_detail,
            raw_payload,
            to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at
          FROM telemetry_dlq_messages
          ${whereSql}
          ORDER BY received_ts DESC, created_at DESC
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
        list: data.list.map((m) => ({
          messageId: m.message_id,
          receivedAt: m.received_ts,
          deviceId: m.device_id ?? "",
          reasonCode: m.reason_code,
          reasonDetail: m.reason_detail ?? "",
          rawPayloadPreview: previewText(m.raw_payload, 200),
          kafka: {
            topic: m.kafka_topic,
            partition: m.kafka_partition,
            offset: m.kafka_offset,
            key: m.kafka_key ?? ""
          },
          createdAt: m.created_at
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

  app.get("/telemetry/dlq/:messageId", async (request, reply) => {
    const traceId = request.traceId;
    if (!(await requirePermission(adminCfg, pg, request, reply, "data:analysis"))) return;
    if (!pg) {
      fail(reply, 503, "PostgreSQL 未配置", traceId);
      return;
    }

    const parseId = messageIdSchema.safeParse((request.params as { messageId?: unknown }).messageId);
    if (!parseId.success) {
      fail(reply, 400, "参数错误", traceId, { field: "messageId" });
      return;
    }
    const messageId = parseId.data;

    const row = await withPgClient(pg, async (client) =>
      queryOne<DlqRow>(
        client,
        `
          SELECT
            message_id,
            kafka_topic,
            kafka_partition,
            kafka_offset::text AS kafka_offset,
            kafka_key,
            to_char(received_ts AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS received_ts,
            device_id::text AS device_id,
            reason_code,
            reason_detail,
            raw_payload,
            to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at
          FROM telemetry_dlq_messages
          WHERE message_id = $1::uuid
        `,
        [messageId]
      )
    );

    if (!row) {
      fail(reply, 404, "资源不存在", traceId, { messageId });
      return;
    }

    ok(
      reply,
      {
        messageId: row.message_id,
        receivedAt: row.received_ts,
        deviceId: row.device_id ?? "",
        reasonCode: row.reason_code,
        reasonDetail: row.reason_detail ?? "",
        rawPayload: row.raw_payload,
        kafka: {
          topic: row.kafka_topic,
          partition: row.kafka_partition,
          offset: row.kafka_offset,
          key: row.kafka_key ?? ""
        },
        createdAt: row.created_at
      },
      traceId
    );
  });
}
