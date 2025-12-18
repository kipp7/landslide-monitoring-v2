import { createLogger, newTraceId } from "@lsmv2/observability";
import { loadAndCompileSchema } from "@lsmv2/validation";
import { Kafka } from "kafkajs";
import dotenv from "dotenv";
import mqtt from "mqtt";
import path from "node:path";
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

function isoNow(): string {
  return new Date().toISOString();
}

function repoRootFromHere(): string {
  return path.resolve(__dirname, "..", "..", "..");
}

async function main(): Promise<void> {
  dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

  const config = loadConfigFromEnv(process.env);
  const logger = createLogger(config.serviceName);

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

  const validateEnvelope =
    await loadAndCompileSchema<TelemetryEnvelopeV1>(schemaTelemetryEnvelopePath);
  const validateRaw = await loadAndCompileSchema<TelemetryRawV1>(schemaTelemetryRawPath);
  const validateDlq = await loadAndCompileSchema<TelemetryDlqV1>(schemaTelemetryDlqPath);

  const kafka = new Kafka({ clientId: config.kafkaClientId, brokers: config.kafkaBrokers });
  const producer = kafka.producer();
  await producer.connect();

  const mqttClient = mqtt.connect(config.mqttUrl, {
    ...(config.mqttUsername && config.mqttPassword
      ? { username: config.mqttUsername, password: config.mqttPassword }
      : {})
  });

  mqttClient.on("connect", () => {
    logger.info({ mqttUrl: config.mqttUrl, topic: config.mqttTopicTelemetry }, "mqtt connected");
    mqttClient.subscribe(config.mqttTopicTelemetry, { qos: 1 }, (err) => {
      if (err) logger.error({ err }, "mqtt subscribe failed");
      else logger.info({ topic: config.mqttTopicTelemetry }, "mqtt subscribed");
    });
  });

  mqttClient.on("error", (err) => {
    logger.error({ err }, "mqtt error");
  });

  mqttClient.on("message", async (topic, payload) => {
    const traceId = newTraceId();
    const receivedTs = isoNow();
    const rawPayload = payload.toString("utf-8");

    const publishDlq = async (
      partial: Omit<TelemetryDlqV1, "schema_version" | "received_ts" | "raw_payload">
    ) => {
      const dlq: TelemetryDlqV1 = {
        schema_version: 1,
        received_ts: receivedTs,
        raw_payload: rawPayload,
        ...partial
      };

      if (!validateDlq.validate(dlq)) {
        logger.error(
          { traceId, topic, errors: validateDlq.errors },
          "dlq payload does not match schema (BUG)"
        );
        return;
      }

      await producer.send({
        topic: config.kafkaTopicTelemetryDlq,
        messages: [{ key: dlq.device_id ?? null, value: JSON.stringify(dlq) }]
      });
    };

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
        messages: [{ key: raw.device_id, value: JSON.stringify(raw) }]
      });

      logger.info({ traceId, topic, deviceId: raw.device_id }, "telemetry ingested");
    } catch (err) {
      await publishDlq({
        reason_code: "invalid_json",
        reason_detail: err instanceof Error ? err.message : "unknown error",
        device_id: null
      });
      logger.warn({ traceId, topic, err }, "invalid telemetry json");
    }
  });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "shutting down");
    mqttClient.end(true);
    await producer.disconnect();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

void main();
