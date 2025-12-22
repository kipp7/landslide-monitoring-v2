import { createLogger } from "@lsmv2/observability";
import { loadAndCompileSchema } from "@lsmv2/validation";
import dotenv from "dotenv";
import { Kafka, logLevel } from "kafkajs";
import { Pool } from "pg";
import path from "node:path";
import crypto from "node:crypto";
import { loadConfigFromEnv } from "./config";

type TelemetryRawV1 = {
  schema_version: 1;
  received_ts: string;
  device_id: string;
  seq?: number;
  metrics: Record<string, unknown>;
  meta?: Record<string, unknown>;
};

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

function createPgPool(config: ReturnType<typeof loadConfigFromEnv>): Pool {
  if (config.postgresUrl) return new Pool({ connectionString: config.postgresUrl, max: config.postgresPoolMax });
  if (!config.postgresPassword) {
    throw new Error("Missing PostgreSQL config: set POSTGRES_URL or POSTGRES_PASSWORD");
  }
  return new Pool({
    host: config.postgresHost,
    port: config.postgresPort,
    user: config.postgresUser,
    password: config.postgresPassword,
    database: config.postgresDatabase,
    max: config.postgresPoolMax
  });
}

function clamp01(v: number): number {
  if (Number.isNaN(v) || !Number.isFinite(v)) return 0;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

function pickNumber(metrics: Record<string, unknown>, keys: string[]): number | null {
  for (const k of keys) {
    const v = metrics[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return null;
}

function riskLevel(score: number): "low" | "medium" | "high" {
  if (score >= 0.8) return "high";
  if (score >= 0.4) return "medium";
  return "low";
}

function heuristicScore(metrics: Record<string, unknown>): { score: number; explain: string } {
  const displacement = pickNumber(metrics, [
    "displacement_mm",
    "displacement",
    "disp_mm",
    "gps_displacement_mm"
  ]);
  const tilt = pickNumber(metrics, ["tilt_deg", "tilt", "inclination_deg"]);
  const vibration = pickNumber(metrics, ["vibration", "vibration_g", "accel_g"]);

  const dispScore = displacement === null ? 0 : clamp01(Math.abs(displacement) / 100);
  const tiltScore = tilt === null ? 0 : clamp01(Math.abs(tilt) / 10);
  const vibScore = vibration === null ? 0 : clamp01(Math.abs(vibration) / 5);

  const score = clamp01(dispScore * 0.6 + tiltScore * 0.3 + vibScore * 0.1);
  const dispLabel = displacement === null ? "n/a" : String(displacement);
  const tiltLabel = tilt === null ? "n/a" : String(tilt);
  const vibLabel = vibration === null ? "n/a" : String(vibration);
  const explain = `heuristic: disp=${dispLabel}, tilt=${tiltLabel}, vib=${vibLabel}`;
  return { score, explain };
}

async function resolveStationId(pg: Pool, deviceId: string): Promise<string | null> {
  const res = await pg.query<{ station_id: string | null }>("SELECT station_id FROM devices WHERE device_id=$1", [
    deviceId
  ]);
  return res.rows[0]?.station_id ?? null;
}

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
  const schemaAiPredPath = path.join(
    repoRoot,
    "docs",
    "integrations",
    "kafka",
    "schemas",
    "ai-predictions.v1.schema.json"
  );
  const validateTelemetryRaw = await loadAndCompileSchema<TelemetryRawV1>(schemaTelemetryRawPath);
  const validateAiPred = await loadAndCompileSchema<AiPredictionEventV1>(schemaAiPredPath);

  const kafka = new Kafka({
    clientId: config.kafkaClientId,
    brokers: config.kafkaBrokers,
    logLevel: logLevel.NOTHING
  });
  const producer = kafka.producer();
  const consumer = kafka.consumer({ groupId: config.kafkaGroupId });

  await producer.connect();
  await consumer.connect();
  await consumer.subscribe({ topic: config.kafkaTopicTelemetryRaw, fromBeginning: false });

  const pg = createPgPool(config);

  await consumer.run({
    eachMessage: async ({ message }) => {
      const raw = message.value?.toString("utf-8") ?? "";
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw) as unknown;
      } catch (err: unknown) {
        logger.warn({ err }, "invalid json (skipped)");
        return;
      }

      if (!validateTelemetryRaw.validate(parsed)) {
        logger.warn({ errors: validateTelemetryRaw.errors }, "telemetry-raw schema validation failed (skipped)");
        return;
      }

      const telemetry: TelemetryRawV1 = parsed;
      const { score, explain } = heuristicScore(telemetry.metrics);
      const level = riskLevel(score);
      const createdTs = new Date().toISOString();
      const predictedTs = new Date(Date.now() + config.predictHorizonSeconds * 1000).toISOString();
      const predictionId = crypto.randomUUID();
      const stationId = await resolveStationId(pg, telemetry.device_id);

      const event: AiPredictionEventV1 = {
        schema_version: 1,
        prediction_id: predictionId,
        created_ts: createdTs,
        device_id: telemetry.device_id,
        station_id: stationId,
        model_key: config.modelKey,
        model_version: config.modelVersion,
        horizon_seconds: config.predictHorizonSeconds,
        predicted_ts: predictedTs,
        risk_score: score,
        risk_level: level,
        explain,
        payload: {
          source: "telemetry.raw.v1",
          received_ts: telemetry.received_ts,
          seq: telemetry.seq ?? null,
          metrics: telemetry.metrics
        }
      };

      if (!validateAiPred.validate(event)) {
        logger.error({ errors: validateAiPred.errors }, "ai-predictions schema validation failed (bug)");
        return;
      }

      await pg.query(
        `
          INSERT INTO ai_predictions (
            prediction_id,
            device_id,
            station_id,
            model_key,
            model_version,
            horizon_seconds,
            predicted_ts,
            risk_score,
            risk_level,
            explain,
            payload
          ) VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb
          )
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
          JSON.stringify(event.payload)
        ]
      );

      await producer.send({
        topic: config.kafkaTopicAiPredictions,
        messages: [{ key: telemetry.device_id, value: JSON.stringify(event) }]
      });
    }
  });

  const shutdown = async () => {
    logger.info("shutting down...");
    await consumer.disconnect();
    await producer.disconnect();
    await pg.end();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
