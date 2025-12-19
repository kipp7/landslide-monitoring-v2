import type { FastifyReply, FastifyRequest } from "fastify";
import { fail } from "./http";

export type AdminAuthConfig = {
  adminApiToken?: string | undefined;
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
