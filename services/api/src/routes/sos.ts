import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { AppConfig } from "../config";
import { fail, ok } from "../http";
import type { PgPool } from "../postgres";
import { queryOne, withPgClient } from "../postgres";

const sosIdSchema = z.string().uuid();

const attachmentSchema = z.object({
  url: z.string().min(1),
  type: z.enum(["image", "audio", "video", "file"]),
  name: z.string().optional(),
  size: z.number().int().nonnegative().optional(),
  checksum: z.string().optional(),
  thumbUrl: z.string().optional(),
  metadata: z.record(z.unknown()).optional()
});

const createSosSchema = z
  .object({
    latitude: z.number().finite(),
    longitude: z.number().finite(),
    description: z.string().max(2000).optional(),
    address: z.string().max(200).optional(),
    contactName: z.string().max(100).optional(),
    contactPhone: z.string().max(50).optional(),
    priority: z.enum(["low", "normal", "high", "critical"]).optional(),
    attachments: z.array(attachmentSchema).optional(),
    metadata: z.record(z.unknown()).optional()
  })
  .strict();

type SosRow = {
  sos_id: string;
  status: "open" | "acknowledged" | "resolved" | "canceled";
  priority: "low" | "normal" | "high" | "critical";
  description: string | null;
  address: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  latitude: number;
  longitude: number;
  attachments: unknown;
  metadata: unknown;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  acknowledged_at: string | null;
  resolved_at: string | null;
};

const mockSosRequest = {
  sosId: "22222222-2222-2222-2222-222222222222",
  status: "open",
  priority: "high",
  description: "疑似滑坡前兆，需要紧急支援。",
  address: "示例路 88 号",
  contactName: "张三",
  contactPhone: "13800000000",
  latitude: 21.6849,
  longitude: 108.3519,
  attachments: [{ url: "https://example.com/sos/audio-1.mp3", type: "audio", name: "audio-1.mp3" }],
  createdBy: "00000000-0000-0000-0000-000000000001",
  createdAt: "2025-12-15T10:00:00Z",
  updatedAt: "2025-12-15T10:00:00Z",
  acknowledgedAt: null,
  resolvedAt: null,
  metadata: { source: "mobile" }
};

function normalizeArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function normalizeObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function mapSos(row: SosRow) {
  return {
    sosId: row.sos_id,
    status: row.status,
    priority: row.priority,
    description: row.description ?? "",
    address: row.address ?? "",
    contactName: row.contact_name ?? "",
    contactPhone: row.contact_phone ?? "",
    latitude: row.latitude,
    longitude: row.longitude,
    attachments: normalizeArray(row.attachments),
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    acknowledgedAt: row.acknowledged_at,
    resolvedAt: row.resolved_at,
    metadata: normalizeObject(row.metadata)
  };
}

async function fetchSos(pg: PgPool, sosId: string): Promise<SosRow | null> {
  return withPgClient(pg, async (client) =>
    queryOne<SosRow>(
      client,
      `
        SELECT
          sos_id,
          status,
          priority,
          description,
          address,
          contact_name,
          contact_phone,
          latitude,
          longitude,
          attachments,
          metadata,
          created_by,
          to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
          to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at,
          to_char(acknowledged_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS acknowledged_at,
          to_char(resolved_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS resolved_at
        FROM sos_requests
        WHERE sos_id = $1
      `,
      [sosId]
    )
  );
}

export function registerSosRoutes(app: FastifyInstance, config: AppConfig, pg: PgPool | null): void {
  app.post("/sos", async (request, reply) => {
    const traceId = request.traceId;

    const parseBody = createSosSchema.safeParse(request.body);
    if (!parseBody.success) {
      fail(reply, 400, "参数错误", traceId, { field: "body", issues: parseBody.error.issues });
      return;
    }

    const body = parseBody.data;
    const sosId = randomUUID();

    if (config.mobileApiMock) {
      ok(
        reply,
        {
          ...mockSosRequest,
          sosId,
          description: body.description ?? mockSosRequest.description,
          latitude: body.latitude,
          longitude: body.longitude,
          priority: body.priority ?? "normal",
          attachments: body.attachments ?? [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
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
          INSERT INTO sos_requests (
            sos_id,
            status,
            priority,
            description,
            address,
            contact_name,
            contact_phone,
            latitude,
            longitude,
            attachments,
            metadata,
            created_by
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12
          )
        `,
        [
          sosId,
          "open",
          body.priority ?? "normal",
          body.description ?? null,
          body.address ?? null,
          body.contactName ?? null,
          body.contactPhone ?? null,
          body.latitude,
          body.longitude,
          JSON.stringify(body.attachments ?? []),
          JSON.stringify(body.metadata ?? {}),
          request.user?.userId ?? null
        ]
      );
    });

    const row = await fetchSos(pg, sosId);
    if (!row) {
      ok(reply, { sosId, status: "open" }, traceId);
      return;
    }

    ok(reply, mapSos(row), traceId);
  });

  app.get("/sos/:sosId", async (request, reply) => {
    const traceId = request.traceId;

    const parseId = sosIdSchema.safeParse((request.params as { sosId?: unknown }).sosId);
    if (!parseId.success) {
      fail(reply, 400, "参数错误", traceId, { field: "sosId" });
      return;
    }
    const sosId = parseId.data;

    if (config.mobileApiMock) {
      ok(reply, { ...mockSosRequest, sosId }, traceId);
      return;
    }

    if (!pg) {
      fail(reply, 503, "PostgreSQL 未配置", traceId);
      return;
    }

    const row = await fetchSos(pg, sosId);
    if (!row) {
      fail(reply, 404, "资源不存在", traceId, { sosId });
      return;
    }

    ok(reply, mapSos(row), traceId);
  });
}
