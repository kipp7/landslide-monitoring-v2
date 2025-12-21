import type { FastifyRequest } from "fastify";
import type { PgPool } from "./postgres";
import { withPgClient } from "./postgres";

export type OperationLogStatus = "success" | "fail";

export type OperationLogEntry = {
  module: string;
  action: string;
  description: string;
  status: OperationLogStatus;
  requestData?: unknown;
  responseData?: unknown;
  userIdOverride?: string | null;
  usernameOverride?: string | null;
};

export function enqueueOperationLog(pg: PgPool | null, request: FastifyRequest, entry: OperationLogEntry): void {
  if (!pg) return;

  const userAgent = typeof request.headers["user-agent"] === "string" ? request.headers["user-agent"] : null;

  void withPgClient(pg, async (client) => {
    await client.query(
      `
        INSERT INTO operation_logs (user_id, username, module, action, description, request_data, response_data, ip_address, user_agent, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `,
      [
        entry.userIdOverride ?? request.user?.userId ?? null,
        entry.usernameOverride ?? request.user?.username ?? "admin",
        entry.module,
        entry.action,
        entry.description,
        entry.requestData ?? null,
        entry.responseData ?? null,
        request.ip,
        userAgent,
        entry.status
      ]
    );
  }).catch(() => undefined);
}
