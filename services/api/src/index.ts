import { createLogger, newTraceId } from "@lsmv2/observability";
import formbody from "@fastify/formbody";
import dotenv from "dotenv";
import Fastify from "fastify";
import path from "node:path";
import { createClickhouseClient } from "./clickhouse";
import { loadConfigFromEnv } from "./config";
import { fail } from "./http";
import { createPgPool } from "./postgres";
import { registerDataRoutes } from "./routes/data";
import { registerDeviceRoutes } from "./routes/devices";
import { registerEmqxRoutes } from "./routes/emqx";
import { registerSensorRoutes } from "./routes/sensors";
import { registerStationRoutes } from "./routes/stations";

async function main(): Promise<void> {
  dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

  const config = loadConfigFromEnv(process.env);
  const logger = createLogger(config.serviceName);

  const app = Fastify({
    logger: false,
    disableRequestLogging: true
  });

  await app.register(formbody);

  app.decorateRequest("traceId", "");

  app.addHook("onRequest", async (request, _reply) => {
    request.traceId = newTraceId();
  });

  app.addHook("preHandler", async (request, reply) => {
    if (request.url === "/health") return;
    if (request.url.startsWith("/emqx/")) return;
    if (!config.authRequired) return;

    const traceId = request.traceId;
    const auth = request.headers.authorization;
    if (!auth || !auth.startsWith("Bearer ") || auth.trim() === "Bearer") {
      fail(reply, 401, "未认证", traceId);
      return;
    }
  });

  app.setErrorHandler((err, request, reply) => {
    logger.error({ err, traceId: request.traceId, url: request.url }, "request failed");

    const statusCode =
      typeof (err as { statusCode?: unknown }).statusCode === "number"
        ? (err as { statusCode: number }).statusCode
        : 500;

    if (statusCode >= 400 && statusCode < 500) {
      fail(reply, statusCode, "参数错误", request.traceId, { code: (err as { code?: unknown }).code });
      return;
    }

    fail(reply, 500, "内部错误", request.traceId);
  });

  app.get("/health", () => ({ ok: true }));

  const ch = createClickhouseClient(config);
  const pg = createPgPool(config);

  registerEmqxRoutes(app, config, pg);

  app.register((v1, _opts, done) => {
    registerDataRoutes(v1, config, ch, pg);
    registerDeviceRoutes(v1, config, pg);
    registerSensorRoutes(v1, config, pg);
    registerStationRoutes(v1, config, pg);
    done();
  }, { prefix: "/api/v1" });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "shutting down");
    await app.close();
    await pg?.end();
    await ch.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  await app.listen({ host: config.apiHost, port: config.apiPort });
  logger.info({ host: config.apiHost, port: config.apiPort }, "api-service started");
}

void main();
