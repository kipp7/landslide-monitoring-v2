import { createLogger, newTraceId } from "@lsmv2/observability";
import { loadAndCompileSchema } from "@lsmv2/validation";
import { Kafka } from "kafkajs";
import dotenv from "dotenv";
import mqtt from "mqtt";
import http from "node:http";
import path from "node:path";
import { Counter, Gauge, Registry, collectDefaultMetrics } from "prom-client";
import { loadConfigFromEnv } from "./config";

type TelemetryEnvelopeV1 = {
  schema_version: 1;
  device_id: string;
  event_ts?: string | null;
  seq?: number | null;
  metrics: Record<string, number | string | boolean | null>;
  meta?: Record<string, unknown>;
};

type TelemetryRawV1 = TelemetryEnvelopeV1 & {
  received_ts: string;
};

type TelemetryDlqV1 = {
  schema_version: 1;
  reason_code: string;
  reason_detail?: string;
  received_ts: string;
  device_id?: string | null;
  raw_payload: string;
};

type PresenceEventV1 = {
  schema_version: 1;
  device_id: string;
  event_ts: string;
  status: "online" | "offline";
  meta?: Record<string, unknown>;
};

type PresenceEventsV1 = PresenceEventV1 & {
  received_ts: string;
};

function isoNow(): string {
  return new Date().toISOString();
}

function repoRootFromHere(): string {
  return path.resolve(__dirname, "..", "..", "..");
}

function truncateUtf8(value: string, maxBytes: number): { value: string; truncated: boolean } {
  if (maxBytes <= 0) return { value: "", truncated: value.length > 0 };
  const bytes = Buffer.byteLength(value, "utf8");
  if (bytes <= maxBytes) return { value, truncated: false };

  const buf = Buffer.from(value, "utf8");
  const slice = buf.subarray(0, maxBytes);
  return { value: slice.toString("utf8"), truncated: true };
}

async function main(): Promise<void> {
  dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

  const config = loadConfigFromEnv(process.env);
  const logger = createLogger(config.serviceName);

  const registry = new Registry();
  registry.setDefaultLabels({ service: config.serviceName });
  collectDefaultMetrics({ register: registry });

  const messagesTotal = new Counter({
    name: "ingest_messages_total",
    help: "MQTT messages processed by ingest",
    labelNames: ["kind", "result"],
    registers: [registry]
  });
  const kafkaProducedTotal = new Counter({
    name: "ingest_kafka_produced_total",
    help: "Kafka messages produced by ingest",
    labelNames: ["topic"],
    registers: [registry]
  });
  const queueSize = new Gauge({
    name: "ingest_queue_size",
    help: "Current in-memory queue size",
    registers: [registry]
  });
  const inFlightGauge = new Gauge({
    name: "ingest_in_flight",
    help: "Current number of in-flight message processors",
    registers: [registry]
  });

  let kafkaReady = false;
  let mqttReady = false;

  const opsServer = http.createServer(async (req, res) => {
    const url = (req.url ?? "").split("?")[0] ?? "";
    if (url === "/healthz" || url === "/health") {
      res.statusCode = 200;
      res.setHeader("content-type", "text/plain; charset=utf-8");
      res.end("ok");
      return;
    }
    if (url === "/readyz" || url === "/ready") {
      const ready = kafkaReady && mqttReady;
      res.statusCode = ready ? 200 : 503;
      res.setHeader("content-type", "text/plain; charset=utf-8");
      res.end(ready ? "ready" : "not_ready");
      return;
    }
    if (url === "/metrics") {
      try {
        const out = await registry.metrics();
        res.statusCode = 200;
        res.setHeader("content-type", registry.contentType);
        res.end(out);
      } catch {
        res.statusCode = 500;
        res.setHeader("content-type", "text/plain; charset=utf-8");
        res.end("metrics_error");
      }
      return;
    }
    res.statusCode = 404;
    res.setHeader("content-type", "text/plain; charset=utf-8");
    res.end("not_found");
  });
  opsServer.listen(config.opsPort, config.opsHost, () => {
    logger.info({ host: config.opsHost, port: config.opsPort }, "ops server started");
  });

  const repoRoot = repoRootFromHere();
  const schemaTelemetryEnvelopePath = path.join(
    repoRoot,
    "docs",
    "integrations",
    "mqtt",
    "schemas",
    "telemetry-envelope.v1.schema.json"
  );
  const schemaTelemetryRawPath = path.join(
    repoRoot,
    "docs",
    "integrations",
    "kafka",
    "schemas",
    "telemetry-raw.v1.schema.json"
  );
  const schemaTelemetryDlqPath = path.join(
    repoRoot,
    "docs",
    "integrations",
    "kafka",
    "schemas",
    "telemetry-dlq.v1.schema.json"
  );
  const schemaPresenceEventPath = path.join(
    repoRoot,
    "docs",
    "integrations",
    "mqtt",
    "schemas",
    "presence-event.v1.schema.json"
  );
  const schemaPresenceEventsPath = path.join(
    repoRoot,
    "docs",
    "integrations",
    "kafka",
    "schemas",
    "presence-events.v1.schema.json"
  );

  const validateEnvelope =
    await loadAndCompileSchema<TelemetryEnvelopeV1>(schemaTelemetryEnvelopePath);
  const validateRaw = await loadAndCompileSchema<TelemetryRawV1>(schemaTelemetryRawPath);
  const validateDlq = await loadAndCompileSchema<TelemetryDlqV1>(schemaTelemetryDlqPath);
  const validatePresence = await loadAndCompileSchema<PresenceEventV1>(schemaPresenceEventPath);
  const validatePresenceEvents = await loadAndCompileSchema<PresenceEventsV1>(schemaPresenceEventsPath);

  const kafka = new Kafka({ clientId: config.kafkaClientId, brokers: config.kafkaBrokers });
  const producer = kafka.producer();
  await producer.connect();
  kafkaReady = true;

  const mqttClient = mqtt.connect(config.mqttUrl, {
    ...(config.mqttUsername && config.mqttPassword
      ? { username: config.mqttUsername, password: config.mqttPassword }
      : {})
  });

  mqttClient.on("connect", () => {
    mqttReady = true;
    logger.info(
      { mqttUrl: config.mqttUrl, topicTelemetry: config.mqttTopicTelemetry, topicPresence: config.mqttTopicPresence },
      "mqtt connected"
    );
    mqttClient.subscribe([config.mqttTopicTelemetry, config.mqttTopicPresence], { qos: 1 }, (err) => {
      if (err) logger.error({ err }, "mqtt subscribe failed");
      else
        logger.info(
          { topicTelemetry: config.mqttTopicTelemetry, topicPresence: config.mqttTopicPresence },
          "mqtt subscribed"
        );
    });
  });

  mqttClient.on("error", (err) => {
    mqttReady = false;
    logger.error({ err }, "mqtt error");
  });

  mqttClient.on("close", () => {
    mqttReady = false;
    logger.warn("mqtt connection closed");
  });
  mqttClient.on("offline", () => {
    mqttReady = false;
    logger.warn("mqtt offline");
  });

  type QueueItem = { topic: string; payload: Buffer };
  const queue: QueueItem[] = [];
  let inFlight = 0;

  async function handleMessage(topic: string, payload: Buffer): Promise<void> {
    const traceId = newTraceId();
    const receivedTs = isoNow();
    const rawPayload = payload.toString("utf-8");
    const rawBytes = Buffer.byteLength(rawPayload, "utf8");

    const isPresence = topic.startsWith("presence/");
    messagesTotal.inc({ kind: isPresence ? "presence" : "telemetry", result: "received" });

    if (isPresence) {
      if (rawBytes > config.messageMaxBytes) {
        logger.warn(
          { traceId, topic, rawBytes, limitBytes: config.messageMaxBytes },
          "presence payload too large (dropped)"
        );
        return;
      }

      try {
        const parsed = JSON.parse(rawPayload) as unknown;
        if (!validatePresence.validate(parsed)) {
          logger.warn({ traceId, topic, errors: validatePresence.errors }, "presence schema invalid (skipped)");
          messagesTotal.inc({ kind: "presence", result: "skipped" });
          return;
        }
        const p: PresenceEventV1 = parsed;

        const out: PresenceEventsV1 = {
          schema_version: 1,
          device_id: p.device_id,
          event_ts: p.event_ts,
          status: p.status,
          ...(p.meta ? { meta: p.meta } : {}),
          received_ts: receivedTs
        };

        if (!validatePresenceEvents.validate(out)) {
          logger.error({ traceId, topic, errors: validatePresenceEvents.errors }, "presence mapping invalid (BUG)");
          return;
        }

        await producer.send({
          topic: config.kafkaTopicPresenceEvents,
          messages: [{ key: out.device_id, value: JSON.stringify(out), headers: { traceId } }]
        });
        kafkaProducedTotal.inc({ topic: config.kafkaTopicPresenceEvents });

        logger.info({ traceId, topic, deviceId: out.device_id, status: out.status }, "presence ingested");
        messagesTotal.inc({ kind: "presence", result: "ok" });
      } catch (err) {
        logger.warn({ traceId, topic, err }, "invalid presence json");
        messagesTotal.inc({ kind: "presence", result: "invalid" });
      }

      return;
    }

    const publishDlq = async (
      partial: Omit<TelemetryDlqV1, "schema_version" | "received_ts" | "raw_payload">
    ) => {
      const trunc = truncateUtf8(rawPayload, config.dlqRawPayloadMaxBytes);
      const dlq: TelemetryDlqV1 = {
        schema_version: 1,
        received_ts: receivedTs,
        raw_payload: trunc.value,
        ...partial
      };

      if (trunc.truncated) {
        dlq.reason_detail = dlq.reason_detail
          ? `${dlq.reason_detail} (raw_payload truncated)`
          : "raw_payload truncated";
      }

      if (!validateDlq.validate(dlq)) {
        logger.error(
          { traceId, topic, errors: validateDlq.errors },
          "dlq payload does not match schema (BUG)"
        );
        return;
      }

      await producer.send({
        topic: config.kafkaTopicTelemetryDlq,
        messages: [{ key: dlq.device_id ?? null, value: JSON.stringify(dlq), headers: { traceId } }]
      });
      kafkaProducedTotal.inc({ topic: config.kafkaTopicTelemetryDlq });
      messagesTotal.inc({ kind: "telemetry", result: "dlq" });
    };

    if (rawBytes > config.messageMaxBytes) {
      await publishDlq({
        reason_code: "payload_too_large",
        reason_detail: `payload bytes=${String(rawBytes)} exceeds limit=${String(config.messageMaxBytes)}`,
        device_id: null
      });
      logger.warn(
        { traceId, topic, rawBytes, limitBytes: config.messageMaxBytes },
        "telemetry payload too large (sent to dlq)"
      );
      return;
    }

    try {
      const parsed = JSON.parse(rawPayload) as unknown;

      if (!validateEnvelope.validate(parsed)) {
        await publishDlq({
          reason_code: "schema_validation_failed",
          reason_detail: "TelemetryEnvelope schema validation failed",
          device_id: null
        });
        logger.warn({ traceId, topic, errors: validateEnvelope.errors }, "telemetry schema invalid");
        return;
      }

      const envelope: TelemetryEnvelopeV1 = parsed;
      const metricsCount = Object.keys(envelope.metrics).length;
      if (metricsCount > config.metricsMaxKeys) {
        await publishDlq({
          reason_code: "metrics_too_many",
          reason_detail: `metrics keys=${String(metricsCount)} exceeds limit=${String(config.metricsMaxKeys)}`,
          device_id: envelope.device_id
        });
        logger.warn(
          { traceId, topic, deviceId: envelope.device_id, metricsCount, limit: config.metricsMaxKeys },
          "telemetry metrics too many (sent to dlq)"
        );
        return;
      }
      const raw: TelemetryRawV1 = {
        schema_version: envelope.schema_version,
        device_id: envelope.device_id,
        event_ts: envelope.event_ts ?? null,
        received_ts: receivedTs,
        seq: envelope.seq ?? null,
        metrics: envelope.metrics,
        ...(envelope.meta ? { meta: envelope.meta } : {})
      };

      if (!validateRaw.validate(raw)) {
        await publishDlq({
          reason_code: "internal_mapping_failed",
          reason_detail: "Kafka telemetry.raw mapping does not match schema",
          device_id: envelope.device_id
        });
        logger.error({ traceId, topic, errors: validateRaw.errors }, "raw mapping invalid (BUG)");
        return;
      }

      await producer.send({
        topic: config.kafkaTopicTelemetryRaw,
        messages: [{ key: raw.device_id, value: JSON.stringify(raw), headers: { traceId } }]
      });
      kafkaProducedTotal.inc({ topic: config.kafkaTopicTelemetryRaw });
      messagesTotal.inc({ kind: "telemetry", result: "ok" });

      logger.info({ traceId, topic, deviceId: raw.device_id }, "telemetry ingested");
    } catch (err) {
      await publishDlq({
        reason_code: "invalid_json",
        reason_detail: err instanceof Error ? err.message : "unknown error",
        device_id: null
      });
      logger.warn({ traceId, topic, err }, "invalid telemetry json");
      messagesTotal.inc({ kind: "telemetry", result: "invalid" });
    }
  }

  const pump = () => {
    while (inFlight < config.maxInFlight && queue.length > 0) {
      const item = queue.shift();
      if (!item) break;
      inFlight += 1;
      inFlightGauge.set(inFlight);
      queueSize.set(queue.length);

      void handleMessage(item.topic, item.payload)
        .catch((err: unknown) => {
          logger.error({ err }, "message handler failed");
        })
        .finally(() => {
          inFlight -= 1;
          inFlightGauge.set(inFlight);
          queueSize.set(queue.length);
          pump();
        });
    }
  };

  mqttClient.on("message", (topic, payload) => {
    const isPresence = topic.startsWith("presence/");
    if (queue.length >= config.maxQueueSize) {
      messagesTotal.inc({ kind: isPresence ? "presence" : "telemetry", result: "dropped" });
      logger.warn({ topic, queued: queue.length, limit: config.maxQueueSize }, "ingest queue full; dropping message");
      return;
    }
    queue.push({ topic, payload });
    queueSize.set(queue.length);
    pump();
  });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "shutting down");
    kafkaReady = false;
    mqttReady = false;
    await new Promise<void>((resolve) => {
      opsServer.close(() => {
        resolve();
      });
    });
    mqttClient.end(true);
    await producer.disconnect();
    process.exit(0);
  };

  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
}

void main();
