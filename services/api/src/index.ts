import { createLogger, newTraceId } from "@lsmv2/observability";
import dotenv from "dotenv";
import Fastify from "fastify";
import path from "node:path";
import { createClickhouseClient } from "./clickhouse";
import { loadConfigFromEnv } from "./config";
import { fail } from "./http";
import { registerDataRoutes } from "./routes/data";

async function main(): Promise<void> {
  dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

  const config = loadConfigFromEnv(process.env);
  const logger = createLogger(config.serviceName);

  const app = Fastify({
    logger: false,
    disableRequestLogging: true
  });

  app.addHook("onRequest", (request) => {
    request.traceId = newTraceId();
  });

  app.addHook("preHandler", (request, reply) => {
    if (request.url === "/health") return;
    if (!config.authRequired) return;

    const traceId = request.traceId;
    const auth = request.headers.authorization;
    if (!auth || !auth.startsWith("Bearer ") || auth.trim() === "Bearer") {
      fail(reply, 401, "未认证", traceId);
      return;
    }
  });

  app.get("/health", () => ({ ok: true }));

  const ch = createClickhouseClient(config);

  app.register((v1, _opts, done) => {
    registerDataRoutes(v1, config, ch);
    done();
  }, { prefix: "/api/v1" });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "shutting down");
    await app.close();
    await ch.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  await app.listen({ host: config.apiHost, port: config.apiPort });
  logger.info({ host: config.apiHost, port: config.apiPort }, "api-service started");
}

void main();
