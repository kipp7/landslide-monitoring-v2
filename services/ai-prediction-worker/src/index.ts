import crypto from "node:crypto";
import path from "node:path";
import type { EdgeRiskModelArtifact } from "@lsmv2/edge-risk-model";
import { createLogger } from "@lsmv2/observability";
import { loadAndCompileSchema } from "@lsmv2/validation";
import dotenv from "dotenv";
import { Kafka, logLevel, type Producer } from "kafkajs";
import mqtt, { type MqttClient } from "mqtt";
import { Pool } from "pg";
import { createClickhouseClient } from "./clickhouse";
import { loadConfigFromEnv, type AppConfig } from "./config";
import { loadLatestEdgeRiskModel, trainEdgeRiskModel } from "./edge-model-trainer";
import { loadArtifactRegistry } from "./pipeline/artifacts/artifact-registry";
import { predictFromTelemetry } from "./pipeline/predict-pipeline";
import type { TelemetryRawV1 } from "./pipeline/types";

type AiPredictionEventV1 = {
  schema_version: 1;
  prediction_id: string;
  created_ts: string;
  device_id: string;
  station_id: string | null;
  model_key: string;
  model_version: string | null;
  horizon_seconds: number;
  predicted_ts: string;
  risk_score: number;
  risk_level: "low" | "medium" | "high" | null;
  explain: string | null;
  payload: Record<string, unknown>;
};

function repoRootFromHere(): string {
  return path.resolve(__dirname, "..", "..", "..");
}

function createPgPool(config: AppConfig): Pool {
  if (config.postgresUrl)
    return new Pool({ connectionString: config.postgresUrl, max: config.postgresPoolMax });
  if (!config.postgresPassword)
    throw new Error("Missing PostgreSQL config: set POSTGRES_URL or POSTGRES_PASSWORD");
  return new Pool({
    host: config.postgresHost,
    port: config.postgresPort,
    user: config.postgresUser,
    password: config.postgresPassword,
    database: config.postgresDatabase,
    max: config.postgresPoolMax,
  });
}

function buildServerPredictionEvent(
  config: AppConfig,
  telemetry: TelemetryRawV1,
  prediction: Awaited<ReturnType<typeof predictFromTelemetry>>
): AiPredictionEventV1 {
  const now = new Date();
  return {
    schema_version: 1,
    prediction_id: crypto.randomUUID(),
    created_ts: now.toISOString(),
    device_id: telemetry.device_id,
    station_id: prediction.stationId,
    model_key: prediction.modelKey,
    model_version: prediction.modelVersion,
    horizon_seconds: config.predictHorizonSeconds,
    predicted_ts: new Date(now.getTime() + config.predictHorizonSeconds * 1000).toISOString(),
    risk_score: prediction.riskScore,
    risk_level: prediction.riskLevel,
    explain: prediction.explain,
    payload: {
      source: "telemetry.raw.v1",
      received_ts: telemetry.received_ts,
      seq: telemetry.seq ?? null,
      metrics: telemetry.metrics,
      ...prediction.payloadExt,
    },
  };
}

async function persistPrediction(pg: Pool, event: AiPredictionEventV1): Promise<boolean> {
  const result = await pg.query<{ prediction_id: string }>(
    `
      INSERT INTO ai_predictions (
        prediction_id, device_id, station_id, model_key, model_version,
        horizon_seconds, predicted_ts, risk_score, risk_level, explain, payload
      ) VALUES (
        $1, $2, COALESCE($3::uuid, (SELECT station_id FROM devices WHERE device_id = $2)),
        $4, $5, $6, $7, $8, $9, $10, $11::jsonb
      )
      ON CONFLICT (prediction_id) DO NOTHING
      RETURNING prediction_id::text
    `,
    [
      event.prediction_id,
      event.device_id,
      event.station_id,
      event.model_key,
      event.model_version,
      event.horizon_seconds,
      event.predicted_ts,
      event.risk_score,
      event.risk_level,
      event.explain,
      JSON.stringify(event.payload),
    ]
  );
  return result.rows.length > 0;
}

async function publishKafka(
  producer: Producer,
  topic: string,
  event: AiPredictionEventV1
): Promise<void> {
  await producer.send({
    topic,
    messages: [{ key: event.device_id, value: JSON.stringify(event) }],
  });
}

function publishModel(
  client: MqttClient | null,
  topic: string,
  artifact: EdgeRiskModelArtifact
): void {
  if (!client?.connected) return;
  client.publish(topic, JSON.stringify(artifact), { qos: 1, retain: true });
}

async function main(): Promise<void> {
  dotenv.config({ path: path.resolve(__dirname, "..", ".env") });
  const config = loadConfigFromEnv(process.env);
  const logger = createLogger(config.serviceName);
  const repoRoot = repoRootFromHere();
  const validateTelemetryRaw = await loadAndCompileSchema<TelemetryRawV1>(
    path.join(repoRoot, "docs", "integrations", "kafka", "schemas", "telemetry-raw.v1.schema.json")
  );
  const validateAiPrediction = await loadAndCompileSchema<AiPredictionEventV1>(
    path.join(repoRoot, "docs", "integrations", "kafka", "schemas", "ai-predictions.v1.schema.json")
  );
  const pg = createPgPool(config);
  const clickhouse = createClickhouseClient(config);
  const kafka = new Kafka({
    clientId: config.kafkaClientId,
    brokers: config.kafkaBrokers,
    logLevel: logLevel.NOTHING,
  });
  const producer = kafka.producer();
  const consumer = kafka.consumer({ groupId: config.kafkaGroupId });
  const artifactRegistry = await loadArtifactRegistry(
    path.resolve(repoRoot, config.artifactRootDir)
  );
  let currentModel = await loadLatestEdgeRiskModel(config.edgeModelDirectory);
  let mqttClient: MqttClient | null = null;
  let retrainTimer: NodeJS.Timeout | null = null;
  let retrainInProgress = false;

  await producer.connect();
  await consumer.connect();
  await consumer.subscribe({ topic: config.kafkaTopicTelemetryRaw, fromBeginning: false });

  const retrain = async (): Promise<void> => {
    if (retrainInProgress) return;
    if (!clickhouse) {
      logger.warn("ClickHouse is not configured; retaining the last edge risk model");
      return;
    }
    retrainInProgress = true;
    try {
      currentModel = await trainEdgeRiskModel({ clickhouse, pg, config });
      publishModel(mqttClient, config.mqttEdgeModelTopic, currentModel);
      logger.info(
        {
          modelKey: currentModel.modelKey,
          modelVersion: currentModel.modelVersion,
          deviceCount: currentModel.deviceCount,
          sampleCount: currentModel.sampleCount,
        },
        "edge risk model trained and published"
      );
    } catch (error) {
      logger.error(
        { err: error },
        "edge risk model training failed; retaining the last valid model"
      );
    } finally {
      retrainInProgress = false;
    }
  };

  if (config.mqttUrl) {
    mqttClient = mqtt.connect(config.mqttUrl, {
      clientId: config.mqttClientId,
      ...(config.mqttUsername ? { username: config.mqttUsername } : {}),
      ...(config.mqttPassword ? { password: config.mqttPassword } : {}),
      clean: true,
      reconnectPeriod: 5000,
    });
    mqttClient.on("connect", () => {
      mqttClient?.subscribe(config.mqttEdgePredictionTopic, { qos: 1 });
      if (currentModel) publishModel(mqttClient, config.mqttEdgeModelTopic, currentModel);
      logger.info({ topic: config.mqttEdgePredictionTopic }, "MQTT edge AI return path connected");
    });
    mqttClient.on("message", (topic, payload) => {
      if (!topic.startsWith(config.mqttEdgePredictionTopic.replace("+", ""))) return;
      void (async () => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(payload.toString("utf8")) as unknown;
        } catch (error) {
          logger.warn({ err: error, topic }, "invalid edge AI prediction JSON");
          return;
        }
        if (!validateAiPrediction.validate(parsed)) {
          logger.warn(
            { errors: validateAiPrediction.errors, topic },
            "edge AI prediction schema rejected"
          );
          return;
        }
        const event = parsed;
        try {
          if (await persistPrediction(pg, event)) {
            await publishKafka(producer, config.kafkaTopicAiPredictions, event);
          }
        } catch (error) {
          logger.error(
            { err: error, topic, predictionId: event.prediction_id },
            "edge AI prediction persistence failed"
          );
        }
      })();
    });
    mqttClient.on("error", (error) => {
      logger.warn({ err: error }, "MQTT edge AI connection error");
    });
  }

  void retrain();
  retrainTimer = setInterval(() => void retrain(), config.edgeModelRetrainIntervalMs);

  await consumer.run({
    eachMessage: async ({ message }) => {
      const raw = message.value?.toString("utf8") ?? "";
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw) as unknown;
      } catch (error) {
        logger.warn({ err: error }, "invalid telemetry JSON");
        return;
      }
      if (!validateTelemetryRaw.validate(parsed)) {
        logger.warn(
          { errors: validateTelemetryRaw.errors },
          "telemetry schema rejected by AI worker"
        );
        return;
      }
      const telemetry = parsed;
      try {
        const prediction = await predictFromTelemetry({
          clickhouse,
          telemetry,
          pg,
          config,
          artifactRegistry,
        });
        const event = buildServerPredictionEvent(config, telemetry, prediction);
        if (!validateAiPrediction.validate(event)) {
          logger.error(
            { errors: validateAiPrediction.errors },
            "generated AI prediction schema rejected"
          );
          return;
        }
        if (await persistPrediction(pg, event)) {
          await publishKafka(producer, config.kafkaTopicAiPredictions, event);
        }
      } catch (error) {
        logger.error({ err: error, deviceId: telemetry.device_id }, "server AI prediction failed");
      }
    },
  });

  const shutdown = async (): Promise<void> => {
    clearInterval(retrainTimer);
    mqttClient?.end(true);
    await consumer.disconnect();
    await producer.disconnect();
    await clickhouse?.close();
    await pg.end();
  };
  process.once("SIGINT", () => void shutdown().finally(() => process.exit(0)));
  process.once("SIGTERM", () => void shutdown().finally(() => process.exit(0)));
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
