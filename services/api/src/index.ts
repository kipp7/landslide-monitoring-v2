import { createLogger, newTraceId } from "@lsmv2/observability";
import cors from "@fastify/cors";
import formbody from "@fastify/formbody";
import dotenv from "dotenv";
import Fastify, { type FastifyInstance } from "fastify";
import path from "node:path";
import { createClickhouseClient } from "./clickhouse";
import { loadConfigFromEnv } from "./config";
import { verifyAccessToken } from "./auth";
import { fail } from "./http";
import { createPgPool } from "./postgres";
import { registerDataRoutes } from "./routes/data";
import { registerDeviceRoutes } from "./routes/devices";
import { registerEmqxRoutes } from "./routes/emqx";
import { registerSensorRoutes } from "./routes/sensors";
import { registerStationRoutes } from "./routes/stations";
import { registerCommandEventRoutes } from "./routes/command-events";
import { registerCommandNotificationRoutes } from "./routes/command-notifications";
import { registerAlertRoutes } from "./routes/alerts";
import { registerAlertRuleRoutes } from "./routes/alert-rules";
import { registerAlertRuleReplayRoutes } from "./routes/alert-rules-replay";
import { registerTelemetryDlqRoutes } from "./routes/telemetry-dlq";
import { registerSystemRoutes } from "./routes/system";
import { registerAuthRoutes } from "./routes/auth";
import { registerUserRoutes } from "./routes/users";
import { registerGpsBaselineRoutes } from "./routes/gps-baselines";
import { registerGpsBaselineAdvancedRoutes, registerGpsBaselineLegacyCompatRoutes } from "./routes/gps-baselines-advanced";
import { registerGpsDeformationRoutes } from "./routes/gps-deformations";
import { registerGpsDeformationLegacyCompatRoutes } from "./routes/gps-deformation-legacy";
import { registerAnomalyAssessmentCompatRoutes } from "./routes/anomaly-assessment";
import { registerRealtimeLegacyCompatRoutes, registerRealtimeRoutes } from "./routes/realtime";
import { registerHuaweiLegacyCompatRoutes } from "./routes/huawei-legacy";
import { registerCameraLegacyCompatRoutes, registerCameraRoutes } from "./routes/camera";
import { registerDeviceHealthExpertLegacyCompatRoutes, registerDeviceHealthExpertRoutes } from "./routes/device-health-expert";
import { registerAiPredictionLegacyCompatRoutes, registerAiPredictionRoutes } from "./routes/ai-predictions";
import { registerLegacyDeviceManagementCompatRoutes } from "./routes/legacy-device-management";

async function main(): Promise<void> {
  dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

  const config = loadConfigFromEnv(process.env);
  const logger = createLogger(config.serviceName);

  const app = Fastify({
    logger: false,
    disableRequestLogging: true
  });

  const defaultCorsOrigins = new Set(["http://localhost:3000", "http://127.0.0.1:3000"]);
  const corsOrigins = new Set([...(config.corsOrigins ?? []), ...defaultCorsOrigins]);

  await app.register(cors, {
    origin: (origin, cb) => {
      if (!origin) {
        cb(null, true);
        return;
      }
      if (corsOrigins.has(origin)) {
        cb(null, true);
        return;
      }
      cb(null, false);
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type", "Accept"],
    maxAge: 86400
  });

  await app.register(formbody);

  app.decorateRequest("traceId", "");
  app.decorateRequest("startTimeMs", 0);
  app.decorateRequest("user", null);

  app.addHook("onRequest", async (request, _reply) => {
    request.traceId = newTraceId();
    request.startTimeMs = Date.now();
    request.user = null;
  });

  app.addHook("preHandler", async (request, reply) => {
    if (request.url === "/health") return;
    if (request.url.startsWith("/emqx/")) return;
    if (request.url === "/api/v1/auth/login") return;
    if (request.url === "/api/v1/auth/refresh") return;
    if (!config.authRequired) return;

    const traceId = request.traceId;
    const auth = request.headers.authorization;
    if (!auth || !auth.startsWith("Bearer ") || auth.trim() === "Bearer") {
      fail(reply, 401, "未认证", traceId);
      return;
    }

    const token = auth.slice("Bearer ".length).trim();

    if (config.adminApiToken && token === config.adminApiToken) {
      request.user = null;
      return;
    }

    const u = verifyAccessToken(config, token);
    if (u) {
      request.user = u;
      return;
    }

    // Backward compatibility: if JWT is not configured yet, only require a bearer token to exist.
    if (!config.jwtAccessSecret) {
      request.user = null;
      return;
    }

    fail(reply, 401, "未认证", traceId);
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

  app.addHook("onResponse", async (request, reply) => {
    if (!pg) return;
    if (request.url === "/health") return;
    if (request.url.startsWith("/emqx/")) return;

    const responseTimeMs = Math.max(0, Date.now() - request.startTimeMs);
    const method = request.method;
    const pathOnly = request.raw.url?.split("?")[0] ?? request.url.split("?")[0] ?? request.url;
    const routePath = request.routeOptions.url ?? pathOnly;

    const userAgent = typeof request.headers["user-agent"] === "string" ? request.headers["user-agent"] : null;

    void pg
      .query(
        `
          INSERT INTO api_logs (user_id, method, path, query_params, status_code, response_time_ms, ip_address, user_agent)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `,
        [
          request.user?.userId ?? null,
          method,
          routePath,
          (request.query ?? {}) as unknown,
          reply.statusCode,
          responseTimeMs,
          request.ip,
          userAgent
        ]
      )
      .catch(() => undefined);
  });

  registerEmqxRoutes(app, config, pg);

  // Legacy-compatible paths (reference system): /huawei/*
  registerHuaweiLegacyCompatRoutes(app, config, ch, pg);

  // Backward-compatible camera path (historical): /camera
  registerCameraLegacyCompatRoutes(app, config, pg);

  const registerLegacyCompatApi = (api: FastifyInstance): void => {
    registerAnomalyAssessmentCompatRoutes(api, config, pg, { legacyResponse: true });
    registerGpsBaselineLegacyCompatRoutes(api, config, ch, pg);
    registerGpsDeformationLegacyCompatRoutes(api, config, ch, pg);
    registerRealtimeLegacyCompatRoutes(api, config, ch, pg);
    registerAiPredictionLegacyCompatRoutes(api, config, pg);
    registerDeviceHealthExpertLegacyCompatRoutes(api, config, ch, pg);
    registerLegacyDeviceManagementCompatRoutes(api, config, ch, pg);
    registerCameraLegacyCompatRoutes(api, config, pg);
  };

  // Legacy-compatible path (reference system): /api/*
  app.register((api, _opts, done) => {
    registerLegacyCompatApi(api);
    done();
  }, { prefix: "/api" });

  // Legacy-compatible path (reference system behind nginx): /iot/api/*
  app.register((api, _opts, done) => {
    registerLegacyCompatApi(api);
    done();
  }, { prefix: "/iot/api" });

  app.register((v1, _opts, done) => {
    registerAuthRoutes(v1, config, pg);
    registerUserRoutes(v1, config, pg);
    registerDataRoutes(v1, config, ch, pg);
    registerDeviceRoutes(v1, config, pg);
    registerSensorRoutes(v1, config, pg);
    registerStationRoutes(v1, config, pg);
    registerAlertRoutes(v1, config, pg);
    registerAlertRuleRoutes(v1, config, pg);
    registerAlertRuleReplayRoutes(v1, config, ch, pg);
    registerCommandEventRoutes(v1, config, pg);
    registerCommandNotificationRoutes(v1, config, pg);
    registerTelemetryDlqRoutes(v1, config, pg);
    registerSystemRoutes(v1, config, ch, pg);
    registerGpsBaselineRoutes(v1, config, pg);
    registerGpsBaselineAdvancedRoutes(v1, config, ch, pg);
    registerGpsDeformationRoutes(v1, config, ch, pg);
    registerAnomalyAssessmentCompatRoutes(v1, config, pg);
    registerRealtimeRoutes(v1, config, ch, pg);
    registerDeviceHealthExpertRoutes(v1, config, ch, pg);
    registerCameraRoutes(v1, config, pg);
    registerAiPredictionRoutes(v1, config, pg);
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
