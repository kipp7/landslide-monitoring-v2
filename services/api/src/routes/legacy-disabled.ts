import type { FastifyInstance, FastifyReply } from "fastify";
import type { AppConfig } from "../config";

function disabled(reply: FastifyReply, path: string): void {
  void reply.code(403).send({
    success: false,
    error: "disabled",
    message: `endpoint disabled in v2: ${path}`,
    timestamp: new Date().toISOString()
  });
}

export function registerLegacyDisabledRoutes(app: FastifyInstance, _config: AppConfig): void {
  const routes = [
    "/db-admin",
    "/inspect-db",
    "/inspect-tables",
    "/inspect-all-tables",
    "/test-db",
    "/test-expert-health"
  ] as const;

  for (const path of routes) {
    app.get(path, async (_request, reply) => {
      disabled(reply, path);
    });
    app.post(path, async (_request, reply) => {
      disabled(reply, path);
    });
  }
}

