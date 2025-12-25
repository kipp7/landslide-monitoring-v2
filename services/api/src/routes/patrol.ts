import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { AppConfig } from "../config";
import { fail, ok } from "../http";
import type { PgPool } from "../postgres";
import { queryOne, withPgClient } from "../postgres";

const reportIdSchema = z.string().uuid();

const listReportsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(20),
  stationId: z.string().uuid().optional(),
  reporterId: z.string().uuid().optional(),
  status: z.enum(["submitted", "reviewed", "archived"]).optional(),
  startTime: z.string().datetime().optional(),
  endTime: z.string().datetime().optional()
});

const attachmentSchema = z.object({
  url: z.string().min(1),
  type: z.enum(["image", "audio", "video", "file"]),
  name: z.string().optional(),
  size: z.number().int().nonnegative().optional(),
  checksum: z.string().optional(),
  thumbUrl: z.string().optional(),
  metadata: z.record(z.unknown()).optional()
});

const createReportSchema = z
  .object({
    stationId: z.string().uuid().optional(),
    taskId: z.string().uuid().optional(),
    notes: z.string().max(2000).optional(),
    attachments: z.array(attachmentSchema).optional(),
    latitude: z.number().finite().optional(),
    longitude: z.number().finite().optional(),
    metadata: z.record(z.unknown()).optional()
  })
  .strict();

type PatrolReportRow = {
  report_id: string;
  station_id: string | null;
  station_name: string | null;
  station_code: string | null;
  task_id: string | null;
  status: "submitted" | "reviewed" | "archived";
  notes: string | null;
  attachments: unknown;
  latitude: number | null;
  longitude: number | null;
  reported_by: string | null;
  created_at: string;
  updated_at: string;
  metadata: unknown;
};

const mockPatrolReports = [
  {
    reportId: "11111111-1111-1111-1111-111111111111",
    stationId: null,
    stationName: "示例站点",
    stationCode: "DEMO001",
    taskId: null,
    status: "submitted",
    notes: "发现裂缝，已拍照留存。",
    attachments: [
      { url: "https://example.com/patrol/photo-1.jpg", type: "image", name: "photo-1.jpg", size: 245812 }
    ],
    latitude: 21.6847,
    longitude: 108.3516,
    reportedBy: "00000000-0000-0000-0000-000000000001",
    createdAt: "2025-12-15T10:00:00Z",
    updatedAt: "2025-12-15T10:00:00Z",
    metadata: { source: "mobile" }
  }
];

function normalizeArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function normalizeObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function mapReport(row: PatrolReportRow) {
  return {
    reportId: row.report_id,
    stationId: row.station_id,
    stationName: row.station_name ?? null,
    stationCode: row.station_code ?? null,
    taskId: row.task_id,
    status: row.status,
    notes: row.notes ?? "",
    attachments: normalizeArray(row.attachments),
    latitude: row.latitude,
    longitude: row.longitude,
    reportedBy: row.reported_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    metadata: normalizeObject(row.metadata)
  };
}

async function fetchReport(pg: PgPool, reportId: string): Promise<PatrolReportRow | null> {
  return withPgClient(pg, async (client) =>
    queryOne<PatrolReportRow>(
      client,
      `
        SELECT
          pr.report_id,
          pr.station_id,
          s.station_name,
          s.station_code,
          pr.task_id,
          pr.status,
          pr.notes,
          pr.attachments,
          pr.latitude,
          pr.longitude,
          pr.reported_by,
          to_char(pr.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
          to_char(pr.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at,
          pr.metadata
        FROM patrol_reports pr
        LEFT JOIN stations s ON s.station_id = pr.station_id
        WHERE pr.report_id = $1 AND pr.deleted_at IS NULL
      `,
      [reportId]
    )
  );
}

export function registerPatrolRoutes(app: FastifyInstance, config: AppConfig, pg: PgPool | null): void {
  app.get("/patrol/reports", async (request, reply) => {
    const traceId = request.traceId;

    const parseQuery = listReportsQuerySchema.safeParse(request.query);
    if (!parseQuery.success) {
      fail(reply, 400, "参数错误", traceId, { field: "query", issues: parseQuery.error.issues });
      return;
    }

    if (config.mobileApiMock) {
      ok(
        reply,
        {
          list: mockPatrolReports,
          pagination: { page: 1, pageSize: mockPatrolReports.length, total: mockPatrolReports.length, totalPages: 1 }
        },
        traceId
      );
      return;
    }

    if (!pg) {
      fail(reply, 503, "PostgreSQL 未配置", traceId);
      return;
    }

    const { page, pageSize, stationId, reporterId, status, startTime, endTime } = parseQuery.data;
    const where: string[] = ["pr.deleted_at IS NULL"];
    const params: unknown[] = [];
    const add = (sql: string, val: unknown) => {
      params.push(val);
      where.push(sql.replaceAll("$X", "$" + String(params.length)));
    };

    if (stationId) add("pr.station_id = $X", stationId);
    if (reporterId) add("pr.reported_by = $X", reporterId);
    if (status) add("pr.status = $X", status);

    if (startTime) add("pr.created_at >= $X", startTime);
    if (endTime) add("pr.created_at <= $X", endTime);

    if (startTime && endTime) {
      const start = new Date(startTime);
      const end = new Date(endTime);
      if (!(start < end)) {
        fail(reply, 400, "参数错误", traceId, { field: "timeRange" });
        return;
      }
    }

    const whereSql = `WHERE ${where.join(" AND ")}`;
    const offset = (page - 1) * pageSize;

    const data = await withPgClient(pg, async (client) => {
      const totalRow = await queryOne<{ total: string }>(
        client,
        `SELECT count(*)::text AS total FROM patrol_reports pr ${whereSql}`,
        params
      );
      const total = Number(totalRow?.total ?? "0");

      const res = await client.query<PatrolReportRow>(
        `
          SELECT
            pr.report_id,
            pr.station_id,
            s.station_name,
            s.station_code,
            pr.task_id,
            pr.status,
            pr.notes,
            pr.attachments,
            pr.latitude,
            pr.longitude,
            pr.reported_by,
            to_char(pr.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
            to_char(pr.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at,
            pr.metadata
          FROM patrol_reports pr
          LEFT JOIN stations s ON s.station_id = pr.station_id
          ${whereSql}
          ORDER BY pr.created_at DESC
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
        list: data.list.map(mapReport),
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

  app.get("/patrol/reports/:reportId", async (request, reply) => {
    const traceId = request.traceId;

    const parseId = reportIdSchema.safeParse((request.params as { reportId?: unknown }).reportId);
    if (!parseId.success) {
      fail(reply, 400, "参数错误", traceId, { field: "reportId" });
      return;
    }
    const reportId = parseId.data;

    if (config.mobileApiMock) {
      ok(
        reply,
        { ...mockPatrolReports[0], reportId },
        traceId
      );
      return;
    }

    if (!pg) {
      fail(reply, 503, "PostgreSQL 未配置", traceId);
      return;
    }

    const row = await fetchReport(pg, reportId);
    if (!row) {
      fail(reply, 404, "资源不存在", traceId, { reportId });
      return;
    }

    ok(reply, mapReport(row), traceId);
  });

  app.post("/patrol/reports", async (request, reply) => {
    const traceId = request.traceId;

    const parseBody = createReportSchema.safeParse(request.body);
    if (!parseBody.success) {
      fail(reply, 400, "参数错误", traceId, { field: "body", issues: parseBody.error.issues });
      return;
    }

    const body = parseBody.data;
    const reportId = randomUUID();

    if (config.mobileApiMock) {
      ok(
        reply,
        {
          reportId,
          stationId: body.stationId ?? null,
          stationName: null,
          stationCode: null,
          taskId: body.taskId ?? null,
          status: "submitted",
          notes: body.notes ?? "",
          attachments: body.attachments ?? [],
          latitude: body.latitude ?? null,
          longitude: body.longitude ?? null,
          reportedBy: request.user?.userId ?? null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          metadata: body.metadata ?? {}
        },
        traceId
      );
      return;
    }

    if (!pg) {
      fail(reply, 503, "PostgreSQL 未配置", traceId);
      return;
    }

    await withPgClient(pg, async (client) => {
      await client.query(
        `
          INSERT INTO patrol_reports (
            report_id,
            station_id,
            task_id,
            status,
            notes,
            attachments,
            latitude,
            longitude,
            reported_by,
            metadata
          ) VALUES (
            $1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10::jsonb
          )
        `,
        [
          reportId,
          body.stationId ?? null,
          body.taskId ?? null,
          "submitted",
          body.notes ?? null,
          JSON.stringify(body.attachments ?? []),
          body.latitude ?? null,
          body.longitude ?? null,
          request.user?.userId ?? null,
          JSON.stringify(body.metadata ?? {})
        ]
      );
    });

    const row = await fetchReport(pg, reportId);
    if (!row) {
      ok(reply, { reportId, status: "submitted" }, traceId);
      return;
    }

    ok(reply, mapReport(row), traceId);
  });
}
