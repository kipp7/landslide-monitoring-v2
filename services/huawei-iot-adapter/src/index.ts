import { createLogger, newTraceId } from "@lsmv2/observability";
import { loadAndCompileSchema } from "@lsmv2/validation";
import formbody from "@fastify/formbody";
import dotenv from "dotenv";
import type { FastifyReply, FastifyRequest } from "fastify";
import Fastify from "fastify";
import { Kafka, logLevel } from "kafkajs";
import path from "node:path";
import { z } from "zod";
import { loadConfigFromEnv } from "./config";

type TelemetryRawV1 = {
  schema_version: 1;
  device_id: string;
  event_ts?: string | null;
  received_ts: string;
  seq?: number | null;
  metrics: Record<string, number | string | boolean | null>;
  meta?: Record<string, unknown>;
};

function repoRootFromHere(): string {
  return path.resolve(__dirname, "..", "..", "..");
}

function isoNow(): string {
  return new Date().toISOString();
}

const httpTelemetrySchema = z
  .object({
    deviceId: z.string().uuid().optional(),
    device_id: z.string().uuid().optional(),

    eventTs: z.string().datetime({ offset: true }).optional(),
    event_ts: z.string().datetime({ offset: true }).optional(),

    seq: z.number().int().min(0).optional(),

    // Prefer `metrics`, but allow `data` as an alias for compatibility.
    metrics: z.record(z.string(), z.union([z.number(), z.string(), z.boolean(), z.null()])).optional(),
    data: z.record(z.string(), z.union([z.number(), z.string(), z.boolean(), z.null()])).optional(),

    meta: z.record(z.unknown()).optional()
  })
  .passthrough();

async function main(): Promise<void> {
  dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

  const config = loadConfigFromEnv(process.env);
  const logger = createLogger(config.serviceName);

  const repoRoot = repoRootFromHere();
  const schemaTelemetryRawPath = path.join(
    repoRoot,
    "docs",
    "integrations",
    "kafka",
    "schemas",
    "telemetry-raw.v1.schema.json"
  );
  const validateRaw = await loadAndCompileSchema<TelemetryRawV1>(schemaTelemetryRawPath);

  const kafka = new Kafka({
    clientId: config.kafkaClientId,
    brokers: config.kafkaBrokers,
    logLevel: logLevel.NOTHING
  });
  const producer = kafka.producer();
  await producer.connect();

  const app = Fastify({ logger: false, disableRequestLogging: true });
  await app.register(formbody);

  app.post("/health", async (_req, reply) => {
    reply.send({ ok: true });
  });

  const handleTelemetry = async (request: FastifyRequest, reply: FastifyReply) => {
    const traceId = newTraceId();

    if (config.iotHttpToken) {
      const token = String(request.headers["x-iot-token"] ?? "").trim();
      if (!token) {
        reply.code(401).send({ success: false, message: "missing x-iot-token", traceId });
        return;
      }
      if (token !== config.iotHttpToken) {
        reply.code(403).send({ success: false, message: "invalid token", traceId });
        return;
      }
    }

    const parsed = httpTelemetrySchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send({ success: false, message: "invalid body", traceId, issues: parsed.error.issues });
      return;
    }

    const body = parsed.data;
    const deviceId = (body.deviceId ?? body.device_id ?? "").trim();
    const metrics = (body.metrics ?? body.data) ?? {};
    const eventTs = body.eventTs ?? body.event_ts ?? null;
    const seq = typeof body.seq === "number" ? body.seq : null;

    if (!deviceId) {
      reply.code(400).send({ success: false, message: "missing deviceId", traceId });
      return;
    }
    if (Object.keys(metrics).length === 0) {
      reply.code(400).send({ success: false, message: "missing metrics", traceId });
      return;
    }

    const out: TelemetryRawV1 = {
      schema_version: 1,
      device_id: deviceId,
      received_ts: isoNow(),
      ...(eventTs ? { event_ts: eventTs } : { event_ts: null }),
      ...(seq !== null ? { seq } : {}),
      metrics,
      ...(body.meta ? { meta: body.meta } : {})
    };

    if (!validateRaw.validate(out)) {
      logger.error({ traceId, errors: validateRaw.errors, deviceId }, "telemetry mapping invalid (BUG)");
      reply.code(500).send({ success: false, message: "telemetry mapping invalid", traceId });
      return;
    }

    await producer.send({
      topic: config.kafkaTopicTelemetryRaw,
      messages: [{ key: out.device_id, value: JSON.stringify(out) }]
    });

    reply.send({ success: true, traceId });
  };

  // v2 endpoint
  app.post("/iot/huawei/telemetry", handleTelemetry);

  // Legacy-compatible endpoint (reference system): POST /iot/huawei
  app.post("/iot/huawei", handleTelemetry);

  await app.listen({ host: config.httpHost, port: config.httpPort });
  logger.info({ host: config.httpHost, port: config.httpPort }, "huawei-iot-adapter started");
}

void main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.stack ?? err.message : String(err);
  console.error(msg);
  process.exit(1);
});
