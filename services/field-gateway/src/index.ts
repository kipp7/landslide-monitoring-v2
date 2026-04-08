import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import dotenv from "dotenv";
import mqtt from "mqtt";
import { SerialPort } from "serialport";
import { createLogger, newTraceId } from "@lsmv2/observability";
import { loadAndCompileSchema } from "@lsmv2/validation";
import { loadConfigFromEnv, type AppConfig } from "./config";

type TelemetryEnvelopeV1 = {
  schema_version: 1;
  device_id: string;
  event_ts?: string | null;
  seq?: number | null;
  metrics: Record<string, number | string | boolean | null>;
  meta?: Record<string, unknown>;
};

type SpoolState = "pending" | "published" | "rejected";

type SpoolRecord = {
  schema_version: 1;
  spool_id: string;
  received_ts: string;
  device_id: string | null;
  seq: number | null;
  packet_class: "telemetry";
  payload_hash: string;
  payload_bytes: number;
  state: SpoolState;
  source: {
    serial_device: string;
    serial_baud_rate: number;
  };
  publish_attempts: number;
  last_publish_ts?: string;
  last_error?: string;
  payload: string;
};

type RuntimeStats = {
  serialChunks: number;
  serialBytes: number;
  parsedMessages: number;
  schemaRejected: number;
  publishedMessages: number;
  replayPublishedMessages: number;
  publishFailures: number;
  spoolPending: number;
  lastSerialReadTs: string | null;
  lastParsedMessageTs: string | null;
  lastPublishedTs: string | null;
  lastError: string | null;
};

type GatewayJsonAssembler = {
  push(chunk: Buffer): string[];
};

function isoNow(): string {
  return new Date().toISOString();
}

function repoRootFromHere(): string {
  return path.resolve(__dirname, "..", "..", "..");
}

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

async function writeJsonAtomic(targetPath: string, value: unknown): Promise<void> {
  const dir = path.dirname(targetPath);
  await ensureDir(dir);
  const tempPath = `${targetPath}.${String(process.pid)}.${String(Date.now())}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(value, null, 2), "utf8");
  await fs.rename(tempPath, targetPath);
}

async function listJsonFiles(dir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => path.join(dir, entry.name))
      .sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

async function trimDirJsonFiles(dir: string, keep: number): Promise<void> {
  if (keep <= 0) return;
  const files = await listJsonFiles(dir);
  const extra = files.length - keep;
  if (extra <= 0) return;
  await Promise.all(files.slice(0, extra).map((file) => fs.rm(file, { force: true })));
}

function topicForDevice(config: AppConfig, deviceId: string): string {
  return `${config.mqttTopicTelemetryPrefix}${deviceId}`;
}

function createAssembler(): GatewayJsonAssembler {
  let buffer = "";
  let start = -1;
  let depth = 0;
  let inString = false;
  let escapeNext = false;

  return {
    push(chunk: Buffer): string[] {
      const out: string[] = [];
      buffer += chunk.toString("utf8");

      for (let index = 0; index < buffer.length; index += 1) {
        const ch = buffer[index];

        if (start === -1) {
          if (ch === "{") {
            start = index;
            depth = 1;
            inString = false;
            escapeNext = false;
          }
          continue;
        }

        if (escapeNext) {
          escapeNext = false;
          continue;
        }

        if (inString) {
          if (ch === "\\") {
            escapeNext = true;
          } else if (ch === "\"") {
            inString = false;
          }
          continue;
        }

        if (ch === "\"") {
          inString = true;
          continue;
        }

        if (ch === "{") {
          depth += 1;
          continue;
        }

        if (ch === "}") {
          depth -= 1;
          if (depth === 0 && start >= 0) {
            out.push(buffer.slice(start, index + 1));
            buffer = buffer.slice(index + 1);
            index = -1;
            start = -1;
            depth = 0;
            inString = false;
            escapeNext = false;
          }
        }
      }

      if (start === -1) {
        if (buffer.length > 4096) {
          buffer = buffer.slice(-1024);
        }
      } else if (start > 0) {
        buffer = buffer.slice(start);
        start = 0;
      }

      return out;
    }
  };
}

function payloadHash(payload: string): string {
  return createHash("sha256").update(payload).digest("hex");
}

async function loadRecord(filePath: string): Promise<SpoolRecord> {
  return JSON.parse(await fs.readFile(filePath, "utf8")) as SpoolRecord;
}

class SpoolManager {
  constructor(private readonly config: AppConfig) {}

  get pendingDir(): string {
    return path.resolve(this.config.spoolRootDir, "pending");
  }

  get publishedDir(): string {
    return path.resolve(this.config.spoolRootDir, "published");
  }

  get rejectedDir(): string {
    return path.resolve(this.config.spoolRootDir, "rejected");
  }

  async init(): Promise<void> {
    await Promise.all([ensureDir(this.pendingDir), ensureDir(this.publishedDir), ensureDir(this.rejectedDir)]);
  }

  async pendingCount(): Promise<number> {
    return (await listJsonFiles(this.pendingDir)).length;
  }

  async enqueue(record: SpoolRecord): Promise<string> {
    const count = await this.pendingCount();
    if (count >= this.config.maxPendingRecords) {
      throw new Error(`spool pending limit exceeded (${String(this.config.maxPendingRecords)})`);
    }

    const target = path.join(this.pendingDir, `${record.received_ts.replaceAll(":", "-")}-${record.spool_id}.json`);
    await writeJsonAtomic(target, record);
    return target;
  }

  async markPublished(filePath: string, record: SpoolRecord): Promise<void> {
    const target = path.join(this.publishedDir, path.basename(filePath));
    await writeJsonAtomic(target, { ...record, state: "published" satisfies SpoolState });
    await fs.rm(filePath, { force: true });
    await trimDirJsonFiles(this.publishedDir, this.config.spoolRetentionPublished);
  }

  async markRejected(filePath: string, record: SpoolRecord): Promise<void> {
    const target = path.join(this.rejectedDir, path.basename(filePath));
    await writeJsonAtomic(target, { ...record, state: "rejected" satisfies SpoolState });
    await fs.rm(filePath, { force: true });
    await trimDirJsonFiles(this.rejectedDir, this.config.spoolRetentionRejected);
  }

  async pendingFiles(): Promise<string[]> {
    return listJsonFiles(this.pendingDir);
  }
}

class GatewayRuntime {
  private readonly logger: ReturnType<typeof createLogger>;
  private readonly spool: SpoolManager;
  private readonly assembler = createAssembler();
  private readonly stats: RuntimeStats = {
    serialChunks: 0,
    serialBytes: 0,
    parsedMessages: 0,
    schemaRejected: 0,
    publishedMessages: 0,
    replayPublishedMessages: 0,
    publishFailures: 0,
    spoolPending: 0,
    lastSerialReadTs: null,
    lastParsedMessageTs: null,
    lastPublishedTs: null,
    lastError: null
  };

  private mqttClient: mqtt.MqttClient | null = null;
  private serialPort: SerialPort | null = null;
  private replayTimer: NodeJS.Timeout | null = null;
  private healthTimer: NodeJS.Timeout | null = null;
  private replayRunning = false;
  private mqttConnected = false;

  constructor(
    private readonly config: AppConfig,
    private readonly validateEnvelope: Awaited<ReturnType<typeof loadAndCompileSchema<TelemetryEnvelopeV1>>>
  ) {
    this.logger = createLogger(config.serviceName);
    this.spool = new SpoolManager(config);
  }

  async start(): Promise<void> {
    await this.spool.init();
    const mqttClient = mqtt.connect(this.config.mqttUrl, {
      ...(this.config.mqttUsername && this.config.mqttPassword
        ? { username: this.config.mqttUsername, password: this.config.mqttPassword }
        : {})
    });
    this.mqttClient = mqttClient;

    mqttClient.on("connect", () => {
      this.mqttConnected = true;
      this.logger.info({ mqttUrl: this.config.mqttUrl }, "field gateway mqtt connected");
      void this.replayPending("mqtt-connect");
    });
    mqttClient.on("reconnect", () => {
      this.mqttConnected = false;
      this.logger.warn("field gateway mqtt reconnecting");
    });
    mqttClient.on("error", (err) => {
      this.mqttConnected = false;
      this.stats.lastError = err instanceof Error ? err.message : String(err);
      this.logger.error({ err }, "field gateway mqtt error");
    });

    const serialPort = new SerialPort({
      path: this.config.serialDevice,
      baudRate: this.config.serialBaudRate,
      dataBits: 8,
      stopBits: 1,
      parity: "none",
      autoOpen: false
    });
    this.serialPort = serialPort;

    serialPort.on("error", (err) => {
      this.stats.lastError = err instanceof Error ? err.message : String(err);
      this.logger.error({ err, serialDevice: this.config.serialDevice }, "field gateway serial error");
    });

    serialPort.on("data", (chunk: Buffer) => {
      this.stats.serialChunks += 1;
      this.stats.serialBytes += chunk.length;
      this.stats.lastSerialReadTs = isoNow();
      for (const payload of this.assembler.push(chunk)) {
        void this.handlePayload(payload);
      }
    });

    await new Promise<void>((resolve, reject) => {
      serialPort.open((err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    this.logger.info(
      { serialDevice: this.config.serialDevice, serialBaudRate: this.config.serialBaudRate },
      "field gateway serial opened"
    );

    this.replayTimer = setInterval(() => {
      void this.replayPending("interval");
    }, this.config.replayIntervalMs);

    this.healthTimer = setInterval(() => {
      void this.emitHealth();
    }, this.config.healthEmitIntervalMs);

    await this.emitHealth();
  }

  async stop(signal: string): Promise<void> {
    this.logger.info({ signal }, "field gateway shutting down");
    if (this.replayTimer) clearInterval(this.replayTimer);
    if (this.healthTimer) clearInterval(this.healthTimer);

    await this.emitHealth();

    const shutdownTasks: Promise<void>[] = [];

    if (this.serialPort?.isOpen) {
      shutdownTasks.push(
        new Promise<void>((resolve) => {
          this.serialPort?.close(() => {
            resolve();
          });
        })
      );
    }

    if (this.mqttClient) {
      shutdownTasks.push(
        new Promise<void>((resolve) => {
          this.mqttClient?.end(true, {}, () => {
            resolve();
          });
        })
      );
    }

    await Promise.allSettled(shutdownTasks);
  }

  private async handlePayload(rawPayload: string): Promise<void> {
    const traceId = newTraceId();
    const receivedTs = isoNow();
    const payloadBytes = Buffer.byteLength(rawPayload, "utf8");

    if (payloadBytes > this.config.maxMessageBytes) {
      this.stats.schemaRejected += 1;
      this.stats.lastError = `payload too large (${String(payloadBytes)})`;
      this.logger.warn({ traceId, payloadBytes }, "field gateway payload too large");
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawPayload);
    } catch (err) {
      this.stats.schemaRejected += 1;
      this.stats.lastError = err instanceof Error ? err.message : String(err);
      this.logger.warn({ traceId, err }, "field gateway json parse failed");
      return;
    }

    if (!this.validateEnvelope.validate(parsed)) {
      this.stats.schemaRejected += 1;
      this.stats.lastError = "schema validation failed";
      this.logger.warn({ traceId, errors: this.validateEnvelope.errors }, "field gateway schema invalid");
      return;
    }

    const envelope: TelemetryEnvelopeV1 = parsed;
    this.stats.parsedMessages += 1;
    this.stats.lastParsedMessageTs = receivedTs;

    const record: SpoolRecord = {
      schema_version: 1,
      spool_id: randomUUID(),
      received_ts: receivedTs,
      device_id: envelope.device_id,
      seq: envelope.seq ?? null,
      packet_class: "telemetry",
      payload_hash: payloadHash(rawPayload),
      payload_bytes: payloadBytes,
      state: "pending",
      source: {
        serial_device: this.config.serialDevice,
        serial_baud_rate: this.config.serialBaudRate
      },
      publish_attempts: 0,
      payload: rawPayload
    };

    try {
      await this.spool.enqueue(record);
      this.stats.spoolPending = await this.spool.pendingCount();
      await this.replayPending("ingest");
    } catch (err) {
      this.stats.lastError = err instanceof Error ? err.message : String(err);
      this.logger.error({ traceId, err }, "field gateway spool enqueue failed");
    }
  }

  private async replayPending(reason: "ingest" | "interval" | "mqtt-connect"): Promise<void> {
    if (this.replayRunning || !this.mqttConnected) return;
    this.replayRunning = true;

    try {
      const files = await this.spool.pendingFiles();
      for (const filePath of files) {
        const record = await loadRecord(filePath);
        const nextRecord: SpoolRecord = {
          ...record,
          publish_attempts: record.publish_attempts + 1,
          last_publish_ts: isoNow()
        };

        try {
          await this.publishRecord(nextRecord);
          await this.spool.markPublished(filePath, nextRecord);
          this.stats.publishedMessages += 1;
          if (reason !== "ingest") this.stats.replayPublishedMessages += 1;
          this.stats.lastPublishedTs = isoNow();
        } catch (err) {
          this.stats.publishFailures += 1;
          this.stats.lastError = err instanceof Error ? err.message : String(err);
          await writeJsonAtomic(filePath, {
            ...nextRecord,
            last_error: this.stats.lastError
          });
          this.logger.warn({ err, filePath }, "field gateway publish failed; will retry");
          break;
        }
      }
      this.stats.spoolPending = await this.spool.pendingCount();
    } finally {
      this.replayRunning = false;
      await this.emitHealth();
    }
  }

  private async publishRecord(record: SpoolRecord): Promise<void> {
    const deviceId = record.device_id;
    if (!deviceId) {
      throw new Error("spool record missing device_id");
    }
    const topic = topicForDevice(this.config, deviceId);

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error("mqtt publish timeout"));
      }, this.config.mqttPublishTimeoutMs);
      this.mqttClient?.publish(topic, record.payload, { qos: 1 }, (err) => {
        clearTimeout(timer);
        if (err) reject(err);
        else resolve();
      });
    });

    this.logger.info(
      {
        deviceId,
        seq: record.seq,
        topic,
        payloadBytes: record.payload_bytes,
        publishAttempts: record.publish_attempts
      },
      "field gateway telemetry published"
    );
  }

  private async emitHealth(): Promise<void> {
    this.stats.spoolPending = await this.spool.pendingCount();
    await writeJsonAtomic(path.resolve(this.config.healthFilePath), {
      schema_version: 1,
      service: this.config.serviceName,
      emitted_ts: isoNow(),
      serial: {
        device: this.config.serialDevice,
        baud_rate: this.config.serialBaudRate,
        open: this.serialPort?.isOpen === true
      },
      mqtt: {
        url: this.config.mqttUrl,
        connected: this.mqttConnected
      },
      stats: this.stats
    });
  }
}

async function main(): Promise<void> {
  dotenv.config({ path: path.resolve(__dirname, "..", ".env") });
  const config = loadConfigFromEnv(process.env);

  const repoRoot = repoRootFromHere();
  const schemaTelemetryEnvelopePath = path.join(
    repoRoot,
    "docs",
    "integrations",
    "mqtt",
    "schemas",
    "telemetry-envelope.v1.schema.json"
  );

  const validateEnvelope = await loadAndCompileSchema<TelemetryEnvelopeV1>(schemaTelemetryEnvelopePath);
  const runtime = new GatewayRuntime(config, validateEnvelope);
  await runtime.start();

  const shutdown = async (signal: string) => {
    await runtime.stop(signal);
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  await new Promise<void>(() => {
    void delay;
  });
}

void main();
