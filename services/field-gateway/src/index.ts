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

type DeviceCommandV1 = {
  schema_version: 1;
  command_id: string;
  device_id: string;
  command_type: string;
  payload: Record<string, unknown>;
  issued_ts: string;
};

type DeviceCommandAckV1 = {
  schema_version: 1;
  command_id: string;
  device_id: string;
  ack_ts: string;
  status: "acked" | "failed";
  result?: Record<string, unknown>;
};

type SouthboundNode = AppConfig["southboundNodes"][number];

type NodeRuntimeState = {
  fieldNodeId: string;
  deviceId: string;
  installLabel: string | null;
  southboundPort: string | null;
  enabled: boolean;
  telemetryMessages: number;
  commandForwards: number;
  ackPublishes: number;
  lastTelemetryTs: string | null;
  lastCommandTs: string | null;
  lastAckTs: string | null;
  status: "configured" | "online" | "degraded" | "offline";
};

type PortRuntimeState = {
  serialDevice: string;
  open: boolean;
  reconnectScheduled: boolean;
  mappedNodeCount: number;
  enabledNodeCount: number;
  mappedDeviceIds: string[];
  telemetryMessages: number;
  commandWrites: number;
  ackMessages: number;
  reconnectAttempts: number;
  consecutiveReconnectFailures: number;
  serialChunks: number;
  serialBytes: number;
  lastReadTs: string | null;
  lastOpenTs: string | null;
  lastCloseTs: string | null;
  lastCommandTs: string | null;
  lastAckTs: string | null;
  lastReconnectTs: string | null;
  lastReconnectReason: string | null;
  lastError: string | null;
  status: "configured" | "online" | "degraded" | "offline";
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
  rejectedMessages: number;
  rejectedWriteFailures: number;
  publishedMessages: number;
  replayPublishedMessages: number;
  publishFailures: number;
  commandsReceived: number;
  commandsForwarded: number;
  commandRejects: number;
  commandWriteFailures: number;
  ackMessagesPublished: number;
  ackPublishFailures: number;
  spoolPending: number;
  lastSerialReadTs: string | null;
  lastParsedMessageTs: string | null;
  lastPublishedTs: string | null;
  lastCommandForwardedTs: string | null;
  lastAckPublishedTs: string | null;
  lastError: string | null;
};

type GatewayJsonAssembler = {
  push(chunk: Buffer): string[];
};

type JsonObject = Record<string, unknown>;

const FIELD_METRIC_KEYS = new Set([
  "accel_x_g",
  "accel_y_g",
  "accel_z_g",
  "battery_pct",
  "gps_latitude",
  "gps_longitude",
  "gyro_x_dps",
  "gyro_y_dps",
  "gyro_z_dps",
  "humidity_pct",
  "temperature_c",
  "tilt_x_deg",
  "tilt_y_deg",
  "warning_flag"
]);

function isoNow(): string {
  return new Date().toISOString();
}

function ageMsFrom(nowMs: number, isoTs: string | null): number | null {
  if (!isoTs) return null;
  const ts = Date.parse(isoTs);
  if (Number.isNaN(ts)) return null;
  return Math.max(0, nowMs - ts);
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
  const tempPath = `${targetPath}.${String(process.pid)}.${String(Date.now())}.${randomUUID()}.tmp`;
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

function ackTopicForDevice(config: AppConfig, deviceId: string): string {
  return `${config.mqttTopicAckPrefix}${deviceId}`;
}

function topicDeviceId(prefix: string, topic: string): string | null {
  if (!topic.startsWith(prefix)) return null;
  const deviceId = topic.slice(prefix.length).trim();
  return deviceId.length > 0 ? deviceId : null;
}

function createAssembler(): GatewayJsonAssembler {
  let buffer = "";

  return {
    push(chunk: Buffer): string[] {
      buffer += chunk.toString("utf8");
      const lines = buffer.split(/\r?\n/u);
      buffer = lines.pop() ?? "";

      const out = lines
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .filter((line) => line.includes("{") || line.includes("}"));

      if (buffer.length > 4096) {
        const start = buffer.lastIndexOf("{");
        buffer = start >= 0 ? buffer.slice(start) : "";
      }

      return out;
    }
  };
}

function payloadHash(payload: string): string {
  return createHash("sha256").update(payload).digest("hex");
}

function summarizePayloadSnippet(rawPayload: string, limit = 240): string {
  const normalized = rawPayload.replace(/\s+/gu, " ").trim();
  if (normalized.length <= limit) {
    return normalized;
  }
  return `${normalized.slice(0, limit)}...(truncated)`;
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTelemetryScalar(value: unknown): value is number | string | boolean | null {
  return value === null || typeof value === "number" || typeof value === "string" || typeof value === "boolean";
}

function extractBalancedJsonObjectAt(input: string, start: number): string | null {
  if (start < 0 || start >= input.length || input[start] !== "{") {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < input.length; i += 1) {
    const ch = input[i];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (ch === "\\") {
      if (inString) escaped = true;
      continue;
    }

    if (ch === "\"") {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (ch === "{") {
      depth += 1;
      continue;
    }

    if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        return input.slice(start, i + 1);
      }
    }
  }

  return null;
}

function extractBalancedJsonObjects(input: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (ch === "\\") {
      if (inString) escaped = true;
      continue;
    }

    if (ch === "\"") {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (ch === "{") {
      if (depth === 0) {
        start = i;
      }
      depth += 1;
      continue;
    }

    if (ch === "}") {
      if (depth === 0) {
        continue;
      }
      depth -= 1;
      if (depth === 0 && start >= 0) {
        out.push(input.slice(start, i + 1));
        start = -1;
      }
    }
  }

  return out;
}

function extractSchemaVersionJsonObjects(input: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  let searchIndex = 0;
  const objectStartMarker = "{\"schema_version\"";

  while (searchIndex < input.length) {
    const start = input.indexOf(objectStartMarker, searchIndex);
    if (start < 0) {
      break;
    }

    const candidate = extractBalancedJsonObjectAt(input, start);
    if (candidate && !seen.has(candidate)) {
      seen.add(candidate);
      out.push(candidate);
      searchIndex = start + candidate.length;
      continue;
    }

    const markerIndex = input.indexOf("\"schema_version\"", start + objectStartMarker.length);
    if (markerIndex < 0) {
      break;
    }

    const fallbackStart = input.lastIndexOf("{", markerIndex);
    const fallbackCandidate = extractBalancedJsonObjectAt(input, fallbackStart);
    if (fallbackCandidate && !seen.has(fallbackCandidate)) {
      seen.add(fallbackCandidate);
      out.push(fallbackCandidate);
      searchIndex = fallbackStart + fallbackCandidate.length;
      continue;
    }

    searchIndex = markerIndex + "\"schema_version\"".length;
  }

  return out;
}

function isSouthboundSchemaCandidate(candidate: string): boolean {
  return candidate.includes("\"schema_version\"");
}

function recoverJsonCandidates(rawPayload: string): string[] {
  const normalized = rawPayload.trim();
  if (normalized.length === 0) return [];

  const schemaAnchored = extractSchemaVersionJsonObjects(normalized)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  if (schemaAnchored.length > 0) {
    return schemaAnchored;
  }

  const balanced = extractBalancedJsonObjects(normalized)
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .filter(isSouthboundSchemaCandidate);
  if (balanced.length > 0) {
    return balanced;
  }

  if (!normalized.startsWith("{")) {
    return [];
  }

  const lines = normalized
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length <= 1) {
    return isSouthboundSchemaCandidate(normalized) ? [normalized] : [];
  }

  const telemetryLines = lines.filter(
    (line) => line.startsWith("{") && line.endsWith("}") && isSouthboundSchemaCandidate(line) && line.includes("\"device_id\"")
  );

  if (telemetryLines.length > 0) {
    return telemetryLines;
  }

  return isSouthboundSchemaCandidate(normalized) ? [normalized] : [];
}

function normalizeTelemetryEnvelopeCandidate(parsed: unknown): TelemetryEnvelopeV1 | null {
  if (!isJsonObject(parsed)) {
    return null;
  }

  if (parsed.schema_version !== 1 || typeof parsed.device_id !== "string") {
    return null;
  }

  const metrics: Record<string, number | string | boolean | null> = {};
  let changed = false;

  if (isJsonObject(parsed.metrics)) {
    for (const [key, value] of Object.entries(parsed.metrics)) {
      if (isTelemetryScalar(value)) {
        metrics[key] = value;
        continue;
      }

      changed = true;
    }
  } else if ("metrics" in parsed) {
    changed = true;
  }

  for (const metricKey of FIELD_METRIC_KEYS) {
    if (metricKey in metrics) {
      continue;
    }

    const candidateValue = parsed[metricKey];
    if (!isTelemetryScalar(candidateValue)) {
      continue;
    }

    metrics[metricKey] = candidateValue;
    changed = true;
  }

  if (Object.keys(metrics).length === 0) {
    return null;
  }

  const migratedMetricObjects: Record<string, unknown> = {};
  if (isJsonObject(parsed.metrics)) {
    for (const [key, value] of Object.entries(parsed.metrics)) {
      if (isTelemetryScalar(value)) {
        metrics[key] = value;
        continue;
      }

      migratedMetricObjects[key] = value;
    }
  }

  const rawMeta = isJsonObject(parsed.meta) ? parsed.meta : undefined;
  const nextMeta: Record<string, unknown> = rawMeta ? { ...rawMeta } : {};

  if (Object.keys(migratedMetricObjects).length > 0) {
    for (const [key, value] of Object.entries(migratedMetricObjects)) {
      if (!(key in nextMeta)) {
        nextMeta[key] = value;
      }
    }
    changed = true;
  }

  if (isJsonObject(parsed.legacy_valid_flags) && !("legacy_valid_flags" in nextMeta)) {
    nextMeta.legacy_valid_flags = parsed.legacy_valid_flags;
    changed = true;
  }

  if (!isJsonObject(parsed.metrics)) {
    changed = true;
  }

  if (!changed) {
    return parsed as TelemetryEnvelopeV1;
  }

  const normalized: TelemetryEnvelopeV1 = {
    schema_version: 1,
    device_id: parsed.device_id,
    metrics
  };

  if ("event_ts" in parsed) {
    const eventTs = parsed.event_ts;
    if (eventTs === null || typeof eventTs === "string") {
      normalized.event_ts = eventTs;
    }
  }

  if ("seq" in parsed) {
    const seq = parsed.seq;
    if (seq === null || typeof seq === "number") {
      normalized.seq = seq;
    }
  }

  if (Object.keys(nextMeta).length > 0) {
    normalized.meta = nextMeta;
  }

  return normalized;
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

  async rejectCorruptPending(filePath: string, reason: string): Promise<string> {
    const payload = await fs.readFile(filePath, "utf8").catch(() => "");
    const target = path.join(this.rejectedDir, path.basename(filePath));
    await writeJsonAtomic(target, {
      schema_version: 1,
      spool_id: randomUUID(),
      received_ts: isoNow(),
      device_id: null,
      seq: null,
      packet_class: "telemetry",
      payload_hash: payloadHash(payload),
      payload_bytes: Buffer.byteLength(payload, "utf8"),
      state: "rejected" satisfies SpoolState,
      source: {
        serial_device: this.config.serialDevice,
        serial_baud_rate: this.config.serialBaudRate
      },
      publish_attempts: 0,
      last_error: reason,
      payload
    } satisfies SpoolRecord);
    await fs.rm(filePath, { force: true });
    await trimDirJsonFiles(this.rejectedDir, this.config.spoolRetentionRejected);
    return target;
  }

  async rejectIncoming(record: SpoolRecord, reason: string): Promise<string> {
    const target = path.join(this.rejectedDir, `${record.received_ts.replaceAll(":", "-")}-${record.spool_id}.json`);
    await writeJsonAtomic(target, {
      ...record,
      state: "rejected" satisfies SpoolState,
      last_error: reason
    });
    await trimDirJsonFiles(this.rejectedDir, this.config.spoolRetentionRejected);
    return target;
  }

  async pendingFiles(): Promise<string[]> {
    return listJsonFiles(this.pendingDir);
  }
}

class GatewayRuntime {
  private readonly logger: ReturnType<typeof createLogger>;
  private readonly spool: SpoolManager;
  private readonly nodeState = new Map<string, NodeRuntimeState>();
  private readonly portState = new Map<string, PortRuntimeState>();
  private readonly serialPorts = new Map<string, SerialPort>();
  private readonly assemblers = new Map<string, GatewayJsonAssembler>();
  private readonly serialReconnectTimers = new Map<string, NodeJS.Timeout>();
  private readonly serialOpenInFlight = new Set<string>();
  private readonly stats: RuntimeStats = {
    serialChunks: 0,
    serialBytes: 0,
    parsedMessages: 0,
    schemaRejected: 0,
    rejectedMessages: 0,
    rejectedWriteFailures: 0,
    publishedMessages: 0,
    replayPublishedMessages: 0,
    publishFailures: 0,
    commandsReceived: 0,
    commandsForwarded: 0,
    commandRejects: 0,
    commandWriteFailures: 0,
    ackMessagesPublished: 0,
    ackPublishFailures: 0,
    spoolPending: 0,
    lastSerialReadTs: null,
    lastParsedMessageTs: null,
    lastPublishedTs: null,
    lastCommandForwardedTs: null,
    lastAckPublishedTs: null,
    lastError: null
  };

  private mqttClient: mqtt.MqttClient | null = null;
  private replayTimer: NodeJS.Timeout | null = null;
  private healthTimer: NodeJS.Timeout | null = null;
  private replayRunning = false;
  private mqttConnected = false;
  private stopping = false;

  constructor(
    private readonly config: AppConfig,
    private readonly validateEnvelope: Awaited<ReturnType<typeof loadAndCompileSchema<TelemetryEnvelopeV1>>>,
    private readonly validateCommand: Awaited<ReturnType<typeof loadAndCompileSchema<DeviceCommandV1>>>,
    private readonly validateCommandAck: Awaited<ReturnType<typeof loadAndCompileSchema<DeviceCommandAckV1>>>
  ) {
    this.logger = createLogger(config.serviceName);
    this.spool = new SpoolManager(config);
    for (const node of config.southboundNodes) {
      this.nodeState.set(node.deviceId, this.createNodeRuntimeState(node));
    }
    for (const portPath of this.getConfiguredPortPaths()) {
      this.portState.set(portPath, this.createPortRuntimeState(portPath));
    }
  }

  async start(): Promise<void> {
    this.stopping = false;
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
      mqttClient.subscribe(`${this.config.mqttTopicCommandPrefix}+`, { qos: 1 }, (err) => {
        if (err) {
          this.stats.lastError = err.message;
          this.logger.error({ err }, "field gateway mqtt command subscribe failed");
          return;
        }

        this.logger.info(
          {
            topicFilter: `${this.config.mqttTopicCommandPrefix}+`,
            configuredNodeCount: this.config.southboundNodes.length,
            configuredPortCount: this.portState.size
          },
          "field gateway mqtt command subscription ready"
        );
      });
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
    mqttClient.on("message", (topic, payload) => {
      void this.handleMqttMessage(topic, payload);
    });

    await Promise.all(this.getConfiguredPortPaths().map(async (portPath) => this.openSerialPort(portPath)));

    this.replayTimer = setInterval(() => {
      void this.replayPending("interval");
    }, this.config.replayIntervalMs);

    this.healthTimer = setInterval(() => {
      void this.emitHealth();
    }, this.config.healthEmitIntervalMs);

    await this.emitHealth();
  }

  async stop(signal: string): Promise<void> {
    this.stopping = true;
    this.logger.info({ signal }, "field gateway shutting down");
    if (this.replayTimer) clearInterval(this.replayTimer);
    if (this.healthTimer) clearInterval(this.healthTimer);
    for (const timer of this.serialReconnectTimers.values()) {
      clearTimeout(timer);
    }
    this.serialReconnectTimers.clear();

    await this.emitHealth();

    const shutdownTasks: Promise<void>[] = [];
    for (const serialPort of this.serialPorts.values()) {
      if (!serialPort.isOpen) continue;
      shutdownTasks.push(
        new Promise<void>((resolve) => {
          serialPort.close(() => {
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

  private scheduleSerialReconnect(portPath: string, reason: string): void {
    if (this.stopping) {
      return;
    }

    if (this.serialReconnectTimers.has(portPath)) {
      return;
    }

    const portState = this.ensurePortRuntimeState(portPath);
    portState.reconnectAttempts += 1;
    portState.consecutiveReconnectFailures += 1;
    portState.reconnectScheduled = true;
    portState.lastReconnectTs = isoNow();
    portState.lastReconnectReason = reason;

    const backoffFactor = Math.max(0, portState.consecutiveReconnectFailures - 1);
    const delayMs = Math.min(
      this.config.serialReconnectBaseDelayMs * 2 ** backoffFactor,
      this.config.serialReconnectMaxDelayMs
    );

    this.logger.warn(
      {
        serialDevice: portPath,
        reason,
        delayMs,
        reconnectAttempts: portState.reconnectAttempts,
        consecutiveReconnectFailures: portState.consecutiveReconnectFailures
      },
      "field gateway serial reconnect scheduled"
    );

    const timer = setTimeout(() => {
      this.serialReconnectTimers.delete(portPath);
      void this.openSerialPort(portPath);
    }, delayMs);
    this.serialReconnectTimers.set(portPath, timer);
  }

  private clearSerialReconnectTimer(portPath: string): void {
    const timer = this.serialReconnectTimers.get(portPath);
    if (!timer) {
      return;
    }

    clearTimeout(timer);
    this.serialReconnectTimers.delete(portPath);
  }

  private async closeSerialPortReference(portPath: string): Promise<void> {
    const serialPort = this.serialPorts.get(portPath);
    if (!serialPort) {
      this.assemblers.delete(portPath);
      return;
    }

    serialPort.removeAllListeners();
    if (serialPort.isOpen) {
      await new Promise<void>((resolve) => {
        serialPort.close(() => {
          resolve();
        });
      });
    }

    this.serialPorts.delete(portPath);
    this.assemblers.delete(portPath);
  }

  private async openSerialPort(portPath: string): Promise<void> {
    if (this.stopping) {
      return;
    }

    if (this.serialOpenInFlight.has(portPath)) {
      return;
    }

    const current = this.serialPorts.get(portPath);
    if (current?.isOpen) {
      return;
    }

    this.serialOpenInFlight.add(portPath);
    this.clearSerialReconnectTimer(portPath);

    const portState = this.ensurePortRuntimeState(portPath);
    portState.reconnectScheduled = false;
    portState.lastReconnectReason = null;

    await this.closeSerialPortReference(portPath);

    const serialPort = new SerialPort({
      path: portPath,
      baudRate: this.config.serialBaudRate,
      dataBits: 8,
      stopBits: 1,
      parity: "none",
      autoOpen: false
    });
    this.serialPorts.set(portPath, serialPort);
    this.assemblers.set(portPath, createAssembler());

    serialPort.on("error", (err) => {
      const message = err instanceof Error ? err.message : String(err);
      this.stats.lastError = message;
      portState.open = false;
       portState.lastCloseTs = isoNow();
      portState.lastError = message;
      this.logger.error({ err, serialDevice: portPath }, "field gateway serial error");
      this.scheduleSerialReconnect(portPath, message);
    });

    serialPort.on("close", () => {
      portState.open = false;
      portState.lastCloseTs = isoNow();
      if (!this.stopping) {
        this.logger.warn({ serialDevice: portPath }, "field gateway serial closed");
        this.scheduleSerialReconnect(portPath, "serial-close");
      }
    });

    serialPort.on("data", (chunk: Buffer) => {
      const receivedTs = isoNow();
      const assembler = this.assemblers.get(portPath);
      if (!assembler) return;

      this.stats.serialChunks += 1;
      this.stats.serialBytes += chunk.length;
      this.stats.lastSerialReadTs = receivedTs;

      portState.serialChunks += 1;
      portState.serialBytes += chunk.length;
      portState.lastReadTs = receivedTs;

      for (const payload of assembler.push(chunk)) {
        void this.handlePayload(payload, portPath);
      }
    });

    try {
      await new Promise<void>((resolve, reject) => {
        serialPort.open((err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      portState.open = true;
      portState.lastOpenTs = isoNow();
      portState.lastError = null;
      portState.lastReconnectReason = null;
      portState.reconnectScheduled = false;
      portState.consecutiveReconnectFailures = 0;
      portState.status = "configured";

      this.logger.info(
        {
          serialDevice: portPath,
          serialBaudRate: this.config.serialBaudRate,
          mappedNodeCount: portState.mappedNodeCount,
          enabledNodeCount: portState.enabledNodeCount
        },
        "field gateway serial opened"
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.stats.lastError = message;
      portState.open = false;
      portState.lastCloseTs = isoNow();
      portState.lastError = message;
      this.logger.error({ err, serialDevice: portPath }, "field gateway serial open failed");
      this.scheduleSerialReconnect(portPath, message);
    } finally {
      this.serialOpenInFlight.delete(portPath);
    }
  }

  private async handlePayload(rawPayload: string, sourcePort: string): Promise<void> {
    const candidates = recoverJsonCandidates(rawPayload);
    for (const candidate of candidates) {
      await this.handlePayloadCandidate(candidate, sourcePort);
    }
  }

  private async handlePayloadCandidate(rawPayload: string, sourcePort: string): Promise<void> {
    const traceId = newTraceId();
    const receivedTs = isoNow();
    const payloadBytes = Buffer.byteLength(rawPayload, "utf8");
    const portState = this.ensurePortRuntimeState(sourcePort);

    if (payloadBytes > this.config.maxMessageBytes) {
      this.stats.schemaRejected += 1;
      this.stats.lastError = `payload too large (${String(payloadBytes)})`;
      await this.rejectIncomingTelemetry({
        traceId,
        sourcePort,
        receivedTs,
        rawPayload,
        deviceId: null,
        seq: null,
        reason: this.stats.lastError
      });
      this.logger.warn({ traceId, payloadBytes, sourcePort }, "field gateway payload too large");
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawPayload);
    } catch (err) {
      this.stats.schemaRejected += 1;
      this.stats.lastError = err instanceof Error ? err.message : String(err);
      await this.rejectIncomingTelemetry({
        traceId,
        sourcePort,
        receivedTs,
        rawPayload,
        deviceId: null,
        seq: null,
        reason: `json parse failed: ${this.stats.lastError}`
      });
      this.logger.warn(
        {
          traceId,
          err,
          sourcePort,
          payloadBytes,
          rawPayloadSnippet: summarizePayloadSnippet(rawPayload)
        },
        "field gateway json parse failed"
      );
      return;
    }

    if (this.validateCommandAck.validate(parsed)) {
      await this.publishCommandAck(parsed, rawPayload, sourcePort);
      return;
    }

    const normalizedTelemetry = normalizeTelemetryEnvelopeCandidate(parsed);
    let envelopeCandidate: TelemetryEnvelopeV1 | null = null;
    if (normalizedTelemetry && this.validateEnvelope.validate(normalizedTelemetry)) {
      envelopeCandidate = normalizedTelemetry;
    } else if (this.validateEnvelope.validate(parsed)) {
      envelopeCandidate = parsed;
    } else {
      this.stats.schemaRejected += 1;
      this.stats.lastError = "schema validation failed";
      await this.rejectIncomingTelemetry({
        traceId,
        sourcePort,
        receivedTs,
        rawPayload,
        deviceId: isJsonObject(parsed) && typeof parsed.device_id === "string" ? parsed.device_id : null,
        seq: isJsonObject(parsed) && typeof parsed.seq === "number" ? parsed.seq : null,
        reason: this.stats.lastError
      });
      this.logger.warn(
        {
          traceId,
          sourcePort,
          telemetryErrors: this.validateEnvelope.errors,
          ackErrors: this.validateCommandAck.errors,
          rawPayloadSnippet: summarizePayloadSnippet(rawPayload)
        },
        "field gateway schema invalid"
      );
      return;
    }

    const envelope = envelopeCandidate;
    const normalizedPayload = JSON.stringify(envelope);
    const normalizedPayloadBytes = Buffer.byteLength(normalizedPayload, "utf8");
    const nodeState = this.resolveNodeForTelemetry(envelope.device_id, traceId, sourcePort);
    if (!nodeState) {
      await this.rejectIncomingTelemetry({
        traceId,
        sourcePort,
        receivedTs,
        rawPayload: normalizedPayload,
        deviceId: envelope.device_id,
        seq: envelope.seq ?? null,
        reason: this.stats.lastError ?? "telemetry routing rejected"
      });
      return;
    }

    this.stats.parsedMessages += 1;
    this.stats.lastParsedMessageTs = receivedTs;
    nodeState.telemetryMessages += 1;
    nodeState.lastTelemetryTs = receivedTs;
    nodeState.status = "online";
    portState.telemetryMessages += 1;

    const record: SpoolRecord = {
      schema_version: 1,
      spool_id: randomUUID(),
      received_ts: receivedTs,
      device_id: envelope.device_id,
      seq: envelope.seq ?? null,
      packet_class: "telemetry",
      payload_hash: payloadHash(normalizedPayload),
      payload_bytes: normalizedPayloadBytes,
      state: "pending",
      source: {
        serial_device: sourcePort,
        serial_baud_rate: this.config.serialBaudRate
      },
      publish_attempts: 0,
      payload: normalizedPayload
    };

    try {
      await this.spool.enqueue(record);
      this.stats.spoolPending = await this.spool.pendingCount();
      await this.replayPending("ingest");
    } catch (err) {
      this.stats.lastError = err instanceof Error ? err.message : String(err);
      await this.rejectIncomingTelemetry({
        traceId,
        sourcePort,
        receivedTs,
        rawPayload: normalizedPayload,
        deviceId: envelope.device_id,
        seq: envelope.seq ?? null,
        reason: `pending enqueue failed: ${this.stats.lastError}`
      });
      this.logger.error({ traceId, err, sourcePort }, "field gateway spool enqueue failed");
    }
  }

  private async rejectIncomingTelemetry(params: {
    traceId: string;
    sourcePort: string;
    receivedTs: string;
    rawPayload: string;
    deviceId: string | null;
    seq: number | null;
    reason: string;
  }): Promise<void> {
    const { traceId, sourcePort, receivedTs, rawPayload, deviceId, seq, reason } = params;
    const record: SpoolRecord = {
      schema_version: 1,
      spool_id: randomUUID(),
      received_ts: receivedTs,
      device_id: deviceId,
      seq,
      packet_class: "telemetry",
      payload_hash: payloadHash(rawPayload),
      payload_bytes: Buffer.byteLength(rawPayload, "utf8"),
      state: "rejected",
      source: {
        serial_device: sourcePort,
        serial_baud_rate: this.config.serialBaudRate
      },
      publish_attempts: 0,
      last_error: reason,
      payload: rawPayload
    };

    try {
      const rejectedPath = await this.spool.rejectIncoming(record, reason);
      this.stats.rejectedMessages += 1;
      this.logger.warn(
        {
          traceId,
          sourcePort,
          deviceId,
          seq,
          reason,
          rejectedPath
        },
        "field gateway telemetry written to rejected evidence"
      );
    } catch (err) {
      this.stats.rejectedWriteFailures += 1;
      this.logger.error(
        {
          traceId,
          sourcePort,
          deviceId,
          seq,
          reason,
          err
        },
        "field gateway rejected evidence write failed"
      );
    }
  }

  private async handleMqttMessage(topic: string, payload: Buffer): Promise<void> {
    const topicDevice = topicDeviceId(this.config.mqttTopicCommandPrefix, topic);
    if (!topicDevice) {
      return;
    }

    this.stats.commandsReceived += 1;
    const traceId = newTraceId();
    const rawPayload = payload.toString("utf8").trim();
    const payloadBytes = Buffer.byteLength(rawPayload, "utf8");

    if (payloadBytes > this.config.maxMessageBytes) {
      this.stats.commandRejects += 1;
      this.stats.lastError = `command payload too large (${String(payloadBytes)})`;
      this.logger.warn({ traceId, topic, payloadBytes }, "field gateway command payload too large");
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawPayload);
    } catch (err) {
      this.stats.commandRejects += 1;
      this.stats.lastError = err instanceof Error ? err.message : String(err);
      this.logger.warn({ traceId, topic, err }, "field gateway command json parse failed");
      return;
    }

    if (!this.validateCommand.validate(parsed)) {
      this.stats.commandRejects += 1;
      this.stats.lastError = "command schema validation failed";
      this.logger.warn({ traceId, topic, errors: this.validateCommand.errors }, "field gateway command schema invalid");
      return;
    }

    const command = parsed;
    if (command.device_id !== topicDevice) {
      this.stats.commandRejects += 1;
      this.stats.lastError = "command topic device mismatch";
      this.logger.warn(
        { traceId, topic, topicDevice, payloadDevice: command.device_id, commandId: command.command_id },
        "field gateway command topic device mismatch"
      );
      return;
    }

    const nodeState = this.resolveNodeForCommand(command.device_id, traceId, topic);
    if (!nodeState) {
      return;
    }
    const targetPort = this.nodePort(nodeState);
    const portState = this.ensurePortRuntimeState(targetPort);

    try {
      await this.writeCommandToSerial(rawPayload, targetPort);
      this.stats.commandsForwarded += 1;
      this.stats.lastCommandForwardedTs = isoNow();
      nodeState.commandForwards += 1;
      nodeState.lastCommandTs = this.stats.lastCommandForwardedTs;
      portState.commandWrites += 1;
      portState.lastCommandTs = this.stats.lastCommandForwardedTs;
      this.logger.info(
        {
          topic,
          serialDevice: targetPort,
          commandId: command.command_id,
          commandType: command.command_type,
          deviceId: command.device_id,
          payloadBytes
        },
        "field gateway command forwarded to serial"
      );
    } catch (err) {
      this.stats.commandWriteFailures += 1;
      this.stats.lastError = err instanceof Error ? err.message : String(err);
      portState.lastError = this.stats.lastError;
      this.logger.error({ traceId, topic, serialDevice: targetPort, err }, "field gateway command serial write failed");
    }
  }

  private async replayPending(reason: "ingest" | "interval" | "mqtt-connect"): Promise<void> {
    if (this.replayRunning || !this.mqttConnected) return;
    this.replayRunning = true;

    try {
      const files = await this.spool.pendingFiles();
      for (const filePath of files) {
        let record: SpoolRecord;
        try {
          record = await loadRecord(filePath);
        } catch (err) {
          const reason = `pending spool decode failed: ${err instanceof Error ? err.message : String(err)}`;
          this.stats.schemaRejected += 1;
          this.stats.lastError = reason;

          try {
            const rejectedPath = await this.spool.rejectCorruptPending(filePath, reason);
            this.stats.rejectedMessages += 1;
            this.logger.warn(
              {
                err,
                filePath,
                rejectedPath
              },
              "field gateway corrupt pending record moved to rejected evidence"
            );
            continue;
          } catch (rejectErr) {
            this.stats.rejectedWriteFailures += 1;
            this.logger.error(
              {
                err,
                rejectErr,
                filePath
              },
              "field gateway corrupt pending record reject failed"
            );
            break;
          }
        }

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
        sourcePort: record.source.serial_device,
        seq: record.seq,
        topic,
        payloadBytes: record.payload_bytes,
        publishAttempts: record.publish_attempts
      },
      "field gateway telemetry published"
    );
  }

  private async publishCommandAck(ack: DeviceCommandAckV1, rawPayload: string, sourcePort: string): Promise<void> {
    const nodeState = this.resolveNodeForAck(ack.device_id, ack.command_id, sourcePort);
    if (!nodeState) {
      return;
    }

    const topic = ackTopicForDevice(this.config, ack.device_id);
    const portState = this.ensurePortRuntimeState(sourcePort);

    try {
      await this.publishMqtt(topic, rawPayload);
      this.stats.ackMessagesPublished += 1;
      this.stats.lastAckPublishedTs = isoNow();
      nodeState.ackPublishes += 1;
      nodeState.lastAckTs = this.stats.lastAckPublishedTs;
      portState.ackMessages += 1;
      portState.lastAckTs = this.stats.lastAckPublishedTs;
      this.logger.info(
        {
          topic,
          serialDevice: sourcePort,
          commandId: ack.command_id,
          deviceId: ack.device_id,
          status: ack.status,
          payloadBytes: Buffer.byteLength(rawPayload, "utf8")
        },
        "field gateway command ack published"
      );
    } catch (err) {
      this.stats.ackPublishFailures += 1;
      this.stats.lastError = err instanceof Error ? err.message : String(err);
      portState.lastError = this.stats.lastError;
      this.logger.error(
        { err, topic, serialDevice: sourcePort, commandId: ack.command_id },
        "field gateway command ack publish failed"
      );
    }
  }

  private async publishMqtt(topic: string, payload: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error("mqtt publish timeout"));
      }, this.config.mqttPublishTimeoutMs);
      this.mqttClient?.publish(topic, payload, { qos: 1 }, (err) => {
        clearTimeout(timer);
        if (err) reject(err);
        else resolve();
      });
    });
  }

  private async writeCommandToSerial(payload: string, portPath: string): Promise<void> {
    const serialPort = this.serialPorts.get(portPath);
    if (!serialPort?.isOpen) {
      throw new Error(`serial port is not open: ${portPath}`);
    }

    const serialFrame = `${payload}\n`;
    await new Promise<void>((resolve, reject) => {
      serialPort.write(serialFrame, "utf8", (err) => {
        if (err) {
          reject(err);
          return;
        }

        serialPort.drain((drainErr) => {
          if (drainErr) reject(drainErr);
          else resolve();
        });
      });
    });
  }

  private async emitHealth(): Promise<void> {
    this.stats.spoolPending = await this.spool.pendingCount();
    const nowMs = Date.now();
    const nodes = Array.from(this.nodeState.values()).map((nodeState) => this.snapshotNodeRuntimeState(nodeState, nowMs));
    const ports = Array.from(this.portState.values()).map((portState) => this.snapshotPortRuntimeState(portState, nowMs));

    await writeJsonAtomic(path.resolve(this.config.healthFilePath), {
      schema_version: 1,
      service: this.config.serviceName,
      emitted_ts: isoNow(),
      serial: {
        device: this.config.serialDevice,
        baud_rate: this.config.serialBaudRate,
        open: this.serialPorts.get(this.config.serialDevice)?.isOpen === true,
        configuredPorts: Array.from(this.portState.keys()),
        openPortCount: Array.from(this.serialPorts.values()).filter((port) => port.isOpen).length
      },
      mqtt: {
        url: this.config.mqttUrl,
        connected: this.mqttConnected
      },
      southbound: {
        routeMode: this.config.southboundNodes.length === 0 ? "legacy-single-port" : "configured-node-routing",
        configuredNodes: this.config.southboundNodes.length,
        configuredPorts: this.portState.size,
        activeSerialDevice: this.config.serialDevice,
        ports,
        nodes
      },
      stats: this.stats
    });
  }

  private createNodeRuntimeState(node: SouthboundNode): NodeRuntimeState {
    return {
      fieldNodeId: node.fieldNodeId,
      deviceId: node.deviceId,
      installLabel: node.installLabel ?? null,
      southboundPort: this.normalizePortPath(node.southboundPort),
      enabled: node.enabled,
      telemetryMessages: 0,
      commandForwards: 0,
      ackPublishes: 0,
      lastTelemetryTs: null,
      lastCommandTs: null,
      lastAckTs: null,
      status: "configured"
    };
  }

  private createPortRuntimeState(portPath: string): PortRuntimeState {
    const mappedNodes = Array.from(this.nodeState.values()).filter((node) => this.nodePort(node) === portPath);
    return {
      serialDevice: portPath,
      open: false,
      reconnectScheduled: false,
      mappedNodeCount: mappedNodes.length,
      enabledNodeCount: mappedNodes.filter((node) => node.enabled).length,
      mappedDeviceIds: mappedNodes.map((node) => node.deviceId).sort((a, b) => a.localeCompare(b)),
      telemetryMessages: 0,
      commandWrites: 0,
      ackMessages: 0,
      reconnectAttempts: 0,
      consecutiveReconnectFailures: 0,
      serialChunks: 0,
      serialBytes: 0,
      lastReadTs: null,
      lastOpenTs: null,
      lastCloseTs: null,
      lastCommandTs: null,
      lastAckTs: null,
      lastReconnectTs: null,
      lastReconnectReason: null,
      lastError: null,
      status: "configured"
    };
  }

  private snapshotNodeRuntimeState(nodeState: NodeRuntimeState, nowMs: number): NodeRuntimeState {
    const ageMs = ageMsFrom(nowMs, nodeState.lastTelemetryTs);
    if (ageMs === null) {
      nodeState.status = "configured";
    } else if (ageMs >= this.config.nodeOfflineAfterMs) {
      nodeState.status = "offline";
    } else if (ageMs >= this.config.nodeDegradedAfterMs) {
      nodeState.status = "degraded";
    } else {
      nodeState.status = "online";
    }

    return { ...nodeState };
  }

  private snapshotPortRuntimeState(portState: PortRuntimeState, nowMs: number): PortRuntimeState {
    const ageMs = ageMsFrom(nowMs, portState.lastReadTs);
    if (!portState.open) {
      portState.status = "offline";
    } else if (ageMs === null) {
      portState.status = "configured";
    } else if (ageMs >= this.config.portOfflineAfterMs) {
      portState.status = "offline";
    } else if (ageMs >= this.config.portDegradedAfterMs) {
      portState.status = "degraded";
    } else {
      portState.status = "online";
    }

    return { ...portState };
  }

  private ensurePortRuntimeState(portPath: string): PortRuntimeState {
    const existing = this.portState.get(portPath);
    if (existing) {
      return existing;
    }

    const created = this.createPortRuntimeState(portPath);
    this.portState.set(portPath, created);
    return created;
  }

  private normalizePortPath(portPath: string | null | undefined): string {
    const normalized = (portPath ?? this.config.serialDevice).trim();
    return normalized.length > 0 ? normalized : this.config.serialDevice;
  }

  private getConfiguredPortPaths(): string[] {
    if (this.config.southboundNodes.length === 0) {
      return [this.config.serialDevice];
    }

    const ports = new Set<string>();
    for (const node of this.config.southboundNodes) {
      ports.add(this.normalizePortPath(node.southboundPort));
    }
    return Array.from(ports).sort((a, b) => a.localeCompare(b));
  }

  private nodePort(nodeState: NodeRuntimeState): string {
    return this.normalizePortPath(nodeState.southboundPort);
  }

  private ensureEphemeralNode(deviceId: string, sourcePort: string): NodeRuntimeState {
    const existing = this.nodeState.get(deviceId);
    if (existing) {
      return existing;
    }

    const created: NodeRuntimeState = {
      fieldNodeId: `auto:${deviceId.slice(0, 8)}`,
      deviceId,
      installLabel: null,
      southboundPort: sourcePort,
      enabled: true,
      telemetryMessages: 0,
      commandForwards: 0,
      ackPublishes: 0,
      lastTelemetryTs: null,
      lastCommandTs: null,
      lastAckTs: null,
      status: "configured"
    };
    this.nodeState.set(deviceId, created);

    const portState = this.ensurePortRuntimeState(sourcePort);
    if (!portState.mappedDeviceIds.includes(deviceId)) {
      portState.mappedDeviceIds.push(deviceId);
      portState.mappedDeviceIds.sort((a, b) => a.localeCompare(b));
      portState.mappedNodeCount += 1;
      portState.enabledNodeCount += 1;
    }

    return created;
  }

  private resolveNodeForTelemetry(deviceId: string, traceId: string, sourcePort: string): NodeRuntimeState | null {
    if (this.config.southboundNodes.length === 0) {
      return this.ensureEphemeralNode(deviceId, sourcePort);
    }

    const nodeState = this.nodeState.get(deviceId);
    if (!nodeState) {
      this.stats.schemaRejected += 1;
      this.stats.lastError = `unknown telemetry device ${deviceId}`;
      this.logger.warn({ traceId, deviceId, sourcePort }, "field gateway telemetry device is not configured");
      return null;
    }

    if (!nodeState.enabled) {
      this.stats.schemaRejected += 1;
      this.stats.lastError = `disabled telemetry device ${deviceId}`;
      this.logger.warn({ traceId, deviceId, sourcePort }, "field gateway telemetry device is disabled");
      return null;
    }

    const configuredPort = this.nodePort(nodeState);
    if (configuredPort !== sourcePort) {
      this.stats.schemaRejected += 1;
      this.stats.lastError = `telemetry device ${deviceId} belongs to ${configuredPort}`;
      this.logger.warn(
        { traceId, deviceId, configuredPort, sourcePort },
        "field gateway telemetry device routed to different southbound port"
      );
      return null;
    }

    return nodeState;
  }

  private resolveNodeForCommand(deviceId: string, traceId: string, topic: string): NodeRuntimeState | null {
    if (this.config.southboundNodes.length === 0) {
      return this.ensureEphemeralNode(deviceId, this.config.serialDevice);
    }

    const nodeState = this.nodeState.get(deviceId);
    if (!nodeState) {
      this.stats.commandRejects += 1;
      this.stats.lastError = `unknown command device ${deviceId}`;
      this.logger.warn({ traceId, topic, deviceId }, "field gateway command device is not configured");
      return null;
    }

    if (!nodeState.enabled) {
      this.stats.commandRejects += 1;
      this.stats.lastError = `disabled command device ${deviceId}`;
      this.logger.warn({ traceId, topic, deviceId }, "field gateway command device is disabled");
      return null;
    }

    return nodeState;
  }

  private resolveNodeForAck(deviceId: string, commandId: string, sourcePort: string): NodeRuntimeState | null {
    if (this.config.southboundNodes.length === 0) {
      return this.ensureEphemeralNode(deviceId, sourcePort);
    }

    const nodeState = this.nodeState.get(deviceId);
    if (!nodeState) {
      this.stats.ackPublishFailures += 1;
      this.stats.lastError = `unknown ack device ${deviceId}`;
      this.logger.warn({ deviceId, commandId, sourcePort }, "field gateway ack device is not configured");
      return null;
    }

    if (!nodeState.enabled) {
      this.stats.ackPublishFailures += 1;
      this.stats.lastError = `disabled ack device ${deviceId}`;
      this.logger.warn({ deviceId, commandId, sourcePort }, "field gateway ack device is disabled");
      return null;
    }

    const configuredPort = this.nodePort(nodeState);
    if (configuredPort !== sourcePort) {
      this.stats.ackPublishFailures += 1;
      this.stats.lastError = `ack device ${deviceId} belongs to ${configuredPort}`;
      this.logger.warn(
        { deviceId, commandId, configuredPort, sourcePort },
        "field gateway ack routed to different southbound port"
      );
      return null;
    }

    return nodeState;
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
  const schemaDeviceCommandPath = path.join(
    repoRoot,
    "docs",
    "integrations",
    "mqtt",
    "schemas",
    "device-command.v1.schema.json"
  );
  const schemaDeviceCommandAckPath = path.join(
    repoRoot,
    "docs",
    "integrations",
    "mqtt",
    "schemas",
    "device-command-ack.v1.schema.json"
  );

  const validateEnvelope = await loadAndCompileSchema<TelemetryEnvelopeV1>(schemaTelemetryEnvelopePath);
  const validateCommand = await loadAndCompileSchema<DeviceCommandV1>(schemaDeviceCommandPath);
  const validateCommandAck = await loadAndCompileSchema<DeviceCommandAckV1>(schemaDeviceCommandAckPath);
  const runtime = new GatewayRuntime(config, validateEnvelope, validateCommand, validateCommandAck);
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
