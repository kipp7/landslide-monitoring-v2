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
import {
  buildCompactBroadcastPollCommand,
  decodeCompactTelemetryV1,
  isCompactTelemetryV1
} from "./compact-telemetry";
import {
  createCobsCrcFieldLinkAssembler,
  encodeFieldLinkFrame,
  type FieldLinkFrameType,
  type FieldLinkInboundPayload
} from "./field-link";

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
  sent_ts?: string;
  gateway_sent_ts?: string;
  time_sync?: {
    source: "rk3568_gateway";
    sent_ts: string;
    issued_ts: string;
  };
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
  lastSeenTs: string | null;
  lastSeenKind: "telemetry" | "ack" | "rejected" | null;
  lastCommandTs: string | null;
  lastAckTs: string | null;
  lastTelemetryAgeMs: number | null;
  lastSeenAgeMs: number | null;
  effectiveDegradedAfterMs: number | null;
  effectiveOfflineAfterMs: number | null;
  statusReason: string | null;
  status: "configured" | "online" | "degraded" | "offline";
  latestTelemetry: {
    receivedTs: string;
    eventTs: string | null;
    seq: number | null;
    metrics: Record<string, number | string | boolean | null>;
  } | null;
};

type PortRuntimeState = {
  serialDevice: string;
  open: boolean;
  reconnectScheduled: boolean;
  sendOwnerState: "idle" | "writing-command" | "waiting-for-ack" | "waiting-for-poll-telemetry";
  mappedNodeCount: number;
  enabledNodeCount: number;
  mappedDeviceIds: string[];
  telemetryMessages: number;
  commandWrites: number;
  queuedCommands: number;
  ackMessages: number;
  pendingCommandId: string | null;
  pendingCommandType: string | null;
  pendingCommandDeviceId: string | null;
  quietWindowUntilTs: string | null;
  lastQuietWindowStartTs: string | null;
  lastQuietWindowCloseTs: string | null;
  lastQuietWindowCloseReason: "acked" | "failed" | "timeout" | "shutdown" | null;
  quietWindowTimeouts: number;
  lastPrewriteQuietSatisfiedTs: string | null;
  lastPrewriteQuietWaitMs: number;
  prewriteQuietTimeouts: number;
  lastPrewriteFlushTs: string | null;
  prewriteFlushFailures: number;
  reconnectAttempts: number;
  consecutiveReconnectFailures: number;
  serialChunks: number;
  serialBytes: number;
  lastReadTs: string | null;
  lastOpenTs: string | null;
  lastCloseTs: string | null;
  lastCommandTs: string | null;
  lastAckTs: string | null;
  lastPollCommandTs: string | null;
  lastPollTelemetryTs: string | null;
  lastPollSessionCloseTs: string | null;
  lastPollSessionCloseReason: "telemetry" | "failed" | "timeout" | "shutdown" | null;
  activePollCommandId: string | null;
  activePollDeviceId: string | null;
  pollCommandsIssued: number;
  pollTelemetryMatches: number;
  pollAckSuppressions: number;
  pollSessionTimeouts: number;
  lastPollRoundTripMs: number | null;
  averagePollRoundTripMs: number | null;
  maxPollRoundTripMs: number;
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
  interleavingSuspected: number;
  interleavingWithMultipleSchemas: number;
  interleavingWithMultipleDeviceIds: number;
  publishedMessages: number;
  replayPublishedMessages: number;
  publishFailures: number;
  commandsReceived: number;
  commandsForwarded: number;
  commandRejects: number;
  commandWriteFailures: number;
  ackMessagesPublished: number;
  ackPublishFailures: number;
  internalPollCommandsIssued: number;
  internalPollTelemetryMatches: number;
  internalPollAckSuppressions: number;
  internalPollSessionTimeouts: number;
  compactBroadcastPollsIssued: number;
  compactBroadcastPollsCompleted: number;
  compactBroadcastTelemetryMatches: number;
  compactBroadcastDuplicateTelemetry: number;
  compactBroadcastUnmatchedTelemetry: number;
  compactBroadcastPollTimeouts: number;
  spoolPending: number;
  lastSerialReadTs: string | null;
  lastParsedMessageTs: string | null;
  lastPublishedTs: string | null;
  lastCommandForwardedTs: string | null;
  lastAckPublishedTs: string | null;
  lastInternalPollCommandTs: string | null;
  lastInternalPollTelemetryTs: string | null;
  lastInterleavingTs: string | null;
  lastInterleavingSummary: string | null;
  lastError: string | null;
};

type RejectedPayloadDiagnostics = {
  suspectedInterleaving: boolean;
  schemaVersionCount: number;
  distinctDeviceIds: string[];
  summary: string | null;
};

type PendingCommandWindow = {
  commandId: string;
  commandType: string;
  deviceId: string;
  quietUntilTs: string;
  close: (reason: "acked" | "failed" | "timeout" | "shutdown") => void;
};

type SouthboundCommandOrigin = "mqtt" | "internal-poll";

type InternalPollCommandRecord = {
  commandId: string;
  commandType: string;
  deviceId: string;
  portPath: string;
  issuedTs: string;
  suppressAckPublish: boolean;
};

type ActivePollTelemetryWindow = {
  commandId: string;
  commandType: string;
  deviceId: string;
  portPath: string;
  startedTs: string;
  startedAtMs: number;
  timeoutAtMs: number;
  timer: NodeJS.Timeout;
};

type ActiveCompactBroadcastPollWindow = {
  command: string;
  commandTag: number;
  portPath: string;
  expectedDeviceIds: Set<string>;
  receivedDeviceIds: Set<string>;
  startedTs: string;
  startedAtMs: number;
  timer: NodeJS.Timeout;
};

type GatewayPayloadAssembler = {
  push(chunk: Buffer): {
    payloads: FieldLinkInboundPayload[];
    errors: {
      reason: string;
      frameBytes: number;
      rawSnippet: string;
    }[];
  };
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

function buildInternalPollCommandId(): string {
  // Keep schema-compatible IDs so legacy firmware ACKs can still be recognized during rollout.
  return randomUUID();
}

function buildSouthboundCommandPayload(
  command: DeviceCommandV1,
  sentTs: string,
  origin: SouthboundCommandOrigin
): string {
  if (origin === "internal-poll") {
    // The poll is link-local and telemetry is its completion signal. Avoid redundant
    // timestamps so the short downlink command fits comfortably inside a 1s slot.
    return JSON.stringify({
      schema_version: command.schema_version,
      command_id: command.command_id,
      device_id: command.device_id,
      command_type: command.command_type,
      payload: {},
      issued_ts: command.issued_ts
    } satisfies DeviceCommandV1);
  }

  return JSON.stringify({
    ...command,
    sent_ts: sentTs,
    gateway_sent_ts: sentTs,
    time_sync: {
      source: "rk3568_gateway",
      sent_ts: sentTs,
      issued_ts: command.issued_ts
    }
  } satisfies DeviceCommandV1);
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

function createRawJsonAssembler(): GatewayPayloadAssembler {
  let buffer = "";

  return {
    push(chunk: Buffer) {
      buffer += chunk.toString("utf8");
      const extracted = extractBalancedJsonMessagesFromBuffer(buffer);
      buffer = extracted.remaining;

      if (buffer.length > 4096) {
        const schemaStart = buffer.lastIndexOf("{\"schema_version\"");
        if (schemaStart >= 0) {
          buffer = buffer.slice(schemaStart);
        } else {
          const start = buffer.lastIndexOf("{");
          buffer = start >= 0 ? buffer.slice(start) : "";
        }
      }

      const payloads = extracted.messages
        .map((item) => item.trim())
        .filter((item) => item.length > 0)
        .filter(isSouthboundSchemaCandidate)
        .map((rawPayload) => ({
          rawPayload,
          rawPayloadBytes: Buffer.from(rawPayload, "utf8"),
          frameType: null,
          sequence: null,
          integrity: "not_applicable" as const,
          frameBytes: Buffer.byteLength(rawPayload, "utf8")
        }));

      return {
        payloads,
        errors: []
      };
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

function analyzeRejectedPayload(rawPayload: string): RejectedPayloadDiagnostics {
  const schemaVersionCount = (rawPayload.match(/"schema_version"/gu) ?? []).length;
  const deviceIdMatches = Array.from(rawPayload.matchAll(/"device_id"\s*:\s*"([^"]+)"/gu), (match) => match[1] ?? "");
  const distinctDeviceIds = Array.from(new Set(deviceIdMatches.filter((value) => value.length > 0))).sort((a, b) =>
    a.localeCompare(b)
  );
  const suspectedInterleaving = schemaVersionCount > 1 || distinctDeviceIds.length > 1;

  return {
    suspectedInterleaving,
    schemaVersionCount,
    distinctDeviceIds,
    summary: suspectedInterleaving
      ? `schema_version_markers=${String(schemaVersionCount)};device_ids=${distinctDeviceIds.length > 0 ? distinctDeviceIds.join(",") : "none"}`
      : null
  };
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

function extractBalancedJsonMessagesFromBuffer(input: string): { messages: string[]; remaining: string } {
  const messages: string[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;
  let lastConsumed = 0;

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

    if (ch === "}" && depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        messages.push(input.slice(start, i + 1));
        lastConsumed = i + 1;
        start = -1;
      }
    }
  }

  if (depth > 0 && start >= 0) {
    return {
      messages,
      remaining: input.slice(start)
    };
  }

  if (lastConsumed < input.length) {
    const trailing = input.slice(lastConsumed);
    const fallbackStart = trailing.lastIndexOf("{");
    return {
      messages,
      remaining: fallbackStart >= 0 ? trailing.slice(fallbackStart) : ""
    };
  }

  return {
    messages,
    remaining: ""
  };
}

function extractSchemaVersionJsonObjects(input: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  let markerIndex = 0;

  while (markerIndex < input.length) {
    markerIndex = input.indexOf("\"schema_version\"", markerIndex);
    if (markerIndex < 0) {
      break;
    }

    const start = input.lastIndexOf("{", markerIndex);
    if (start < 0) {
      markerIndex += "\"schema_version\"".length;
      continue;
    }

    const candidate = extractBalancedJsonObjectAt(input, start);
    if (candidate && !seen.has(candidate)) {
      seen.add(candidate);
      out.push(candidate);
    }

    markerIndex += "\"schema_version\"".length;
  }

  return out;
}

function isSouthboundSchemaCandidate(candidate: string): boolean {
  return candidate.includes("\"schema_version\"");
}

function isParsableJsonCandidate(candidate: string): boolean {
  try {
    JSON.parse(candidate);
    return true;
  } catch {
    return false;
  }
}

function recoverParsableSchemaCandidates(input: string): string[] {
  const normalized = input.trim();
  if (normalized.length === 0) {
    return [];
  }

  const schemaAnchored = extractSchemaVersionJsonObjects(normalized)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  const parsableSchemaAnchored = schemaAnchored.filter(isParsableJsonCandidate);
  if (parsableSchemaAnchored.length > 0) {
    return parsableSchemaAnchored;
  }

  const balanced = extractBalancedJsonObjects(normalized)
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .filter(isSouthboundSchemaCandidate)
    .filter(isParsableJsonCandidate);
  if (balanced.length > 0) {
    return balanced;
  }

  return [];
}

function recoverJsonCandidates(rawPayload: string): string[] {
  const normalized = rawPayload.trim();
  if (normalized.length === 0) return [];

  const topLevelRecovered = recoverParsableSchemaCandidates(normalized);
  if (topLevelRecovered.length > 0) {
    return topLevelRecovered;
  }

  const lines = normalized
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length > 0) {
    const recoveredFromLines = Array.from(
      new Set(
        lines.flatMap((line) => {
          const directLine = line.startsWith("{") && line.endsWith("}") ? [line] : [];
          return [...directLine, ...recoverParsableSchemaCandidates(line)];
        })
      )
    ).filter((line) => isSouthboundSchemaCandidate(line) && isParsableJsonCandidate(line));

    if (recoveredFromLines.length > 0) {
      return recoveredFromLines;
    }
  }

  return isSouthboundSchemaCandidate(normalized) ? [normalized] : [];
}

function recoverCommandAckCandidate(
  rawPayload: string,
  pendingWindow?: Pick<PendingCommandWindow, "commandId" | "deviceId"> | null
): DeviceCommandAckV1 | null {
  const normalized = rawPayload.trim();
  if (!normalized.includes("\"ack_ts\"") || !normalized.includes("\"command_id\"") || !normalized.includes("\"status\"")) {
    if (!pendingWindow) {
      return null;
    }

    const containsPendingCommandId = normalized.includes(`"command_id":"${pendingWindow.commandId}"`);
    const containsPendingDeviceId = normalized.includes(`"device_id":"${pendingWindow.deviceId}"`);
    const containsAckLikeMarker =
      normalized.includes("\"ack_") ||
      normalized.includes("\"ackTs\"") ||
      normalized.includes("\"status\"") ||
      normalized.includes("\"result\"");

    if (!containsPendingCommandId || !containsPendingDeviceId || !containsAckLikeMarker) {
      return null;
    }

    const status =
      normalized.includes("\"failed\"") || normalized.includes("\"status\":\"failed\"") ? "failed" : "acked";
    const ackTsMatch = /"ack_ts"\s*:\s*"([^"]+)"/u.exec(normalized);

    return {
      schema_version: 1,
      command_id: pendingWindow.commandId,
      device_id: pendingWindow.deviceId,
      ack_ts: ackTsMatch?.[1] ?? isoNow(),
      status,
      result: {
        recovered_from: "pending-command-fragment"
      }
    };
  }

  const schemaVersionMatch = /"schema_version"\s*:\s*(\d+)/u.exec(normalized);
  const commandIdMatch = /"command_id"\s*:\s*"([^"]+)"/u.exec(normalized);
  const deviceIdMatch = /"device_id"\s*:\s*"([^"]+)"/u.exec(normalized);
  const ackTsMatch = /"ack_ts"\s*:\s*"([^"]+)"/u.exec(normalized);
  const statusMatch = /"status"\s*:\s*"(acked|failed)"/u.exec(normalized);
  const ackStatus = statusMatch?.[1];

  if (
    schemaVersionMatch?.[1] !== "1" ||
    !commandIdMatch?.[1] ||
    !deviceIdMatch?.[1] ||
    !ackTsMatch?.[1] ||
    (ackStatus !== "acked" && ackStatus !== "failed")
  ) {
    return null;
  }

  return {
    schema_version: 1,
    command_id: commandIdMatch[1],
    device_id: deviceIdMatch[1],
    ack_ts: ackTsMatch[1],
    status: ackStatus
  };
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
  private readonly assemblers = new Map<string, GatewayPayloadAssembler>();
  private readonly serialReconnectTimers = new Map<string, NodeJS.Timeout>();
  private readonly serialOpenInFlight = new Set<string>();
  private readonly portCommandChains = new Map<string, Promise<void>>();
  private readonly portQuietWindowTimers = new Map<string, NodeJS.Timeout>();
  private readonly pendingCommandWindows = new Map<string, PendingCommandWindow>();
  private readonly internalPollCommands = new Map<string, InternalPollCommandRecord>();
  private readonly activePollTelemetryWindows = new Map<string, ActivePollTelemetryWindow>();
  private readonly activeCompactBroadcastPollWindows = new Map<string, ActiveCompactBroadcastPollWindow>();
  private readonly portPollNodeCursor = new Map<string, number>();
  private readonly portLastReadAtMs = new Map<string, number>();
  private fieldLinkTxSequence = 0;
  private readonly stats: RuntimeStats = {
    serialChunks: 0,
    serialBytes: 0,
    parsedMessages: 0,
    schemaRejected: 0,
    rejectedMessages: 0,
    rejectedWriteFailures: 0,
    interleavingSuspected: 0,
    interleavingWithMultipleSchemas: 0,
    interleavingWithMultipleDeviceIds: 0,
    publishedMessages: 0,
    replayPublishedMessages: 0,
    publishFailures: 0,
    commandsReceived: 0,
    commandsForwarded: 0,
    commandRejects: 0,
    commandWriteFailures: 0,
    ackMessagesPublished: 0,
    ackPublishFailures: 0,
    internalPollCommandsIssued: 0,
    internalPollTelemetryMatches: 0,
    internalPollAckSuppressions: 0,
    internalPollSessionTimeouts: 0,
    compactBroadcastPollsIssued: 0,
    compactBroadcastPollsCompleted: 0,
    compactBroadcastTelemetryMatches: 0,
    compactBroadcastDuplicateTelemetry: 0,
    compactBroadcastUnmatchedTelemetry: 0,
    compactBroadcastPollTimeouts: 0,
    spoolPending: 0,
    lastSerialReadTs: null,
    lastParsedMessageTs: null,
    lastPublishedTs: null,
    lastCommandForwardedTs: null,
    lastAckPublishedTs: null,
    lastInternalPollCommandTs: null,
    lastInternalPollTelemetryTs: null,
    lastInterleavingTs: null,
    lastInterleavingSummary: null,
    lastError: null
  };

  private mqttClient: mqtt.MqttClient | null = null;
  private replayTimer: NodeJS.Timeout | null = null;
  private healthTimer: NodeJS.Timeout | null = null;
  private pollerTimer: NodeJS.Timeout | null = null;
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

    if (this.config.southboundPollingEnabled) {
      this.scheduleSouthboundPolling(this.config.southboundPollingIntervalMs);
    }

    await this.emitHealth();
  }

  async stop(signal: string): Promise<void> {
    this.stopping = true;
    this.logger.info({ signal }, "field gateway shutting down");
    if (this.replayTimer) clearInterval(this.replayTimer);
    if (this.healthTimer) clearInterval(this.healthTimer);
    if (this.pollerTimer) clearTimeout(this.pollerTimer);
    for (const timer of this.serialReconnectTimers.values()) {
      clearTimeout(timer);
    }
    this.serialReconnectTimers.clear();
    for (const timer of this.portQuietWindowTimers.values()) {
      clearTimeout(timer);
    }
    this.portQuietWindowTimers.clear();
    for (const portPath of Array.from(this.pendingCommandWindows.keys())) {
      this.closePendingCommandWindow(portPath, "shutdown");
    }
    for (const portPath of Array.from(this.activePollTelemetryWindows.keys())) {
      this.closeActivePollTelemetryWindow(portPath, "shutdown");
    }
    for (const key of Array.from(this.activeCompactBroadcastPollWindows.keys())) {
      this.closeCompactBroadcastPollWindow(key, "shutdown");
    }

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
    this.assemblers.set(
      portPath,
      this.config.fieldLinkMode === "cobs-crc-v1" ? createCobsCrcFieldLinkAssembler() : createRawJsonAssembler()
    );

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
      this.portLastReadAtMs.set(portPath, Date.now());

      portState.serialChunks += 1;
      portState.serialBytes += chunk.length;
      portState.lastReadTs = receivedTs;

      const batch = assembler.push(chunk);
      for (const error of batch.errors) {
        this.stats.lastError = error.reason;
        portState.lastError = error.reason;
        this.logger.warn(
          {
            serialDevice: portPath,
            fieldLinkMode: this.config.fieldLinkMode,
            frameBytes: error.frameBytes,
            rawSnippet: error.rawSnippet,
            reason: error.reason
          },
          "field gateway field-link decode failed"
        );
      }

      for (const payload of batch.payloads) {
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

  private async handlePayload(input: FieldLinkInboundPayload, sourcePort: string): Promise<void> {
    if (input.frameType === "telemetry" && isCompactTelemetryV1(input.rawPayloadBytes)) {
      try {
        const envelope = decodeCompactTelemetryV1(input.rawPayloadBytes);
        await this.handlePayloadCandidate(JSON.stringify(envelope), sourcePort, input.frameType, input.sequence);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.stats.schemaRejected += 1;
        this.stats.lastError = message;
        this.ensurePortRuntimeState(sourcePort).lastError = message;
        this.logger.warn(
          { err, sourcePort, frameSequence: input.sequence, payloadBytes: input.rawPayloadBytes.length },
          "field gateway compact telemetry decode failed"
        );
      }
      return;
    }

    const candidates = this.orderedPayloadCandidates(input.rawPayload, sourcePort);
    for (const candidate of candidates) {
      await this.handlePayloadCandidate(candidate, sourcePort, input.frameType, input.sequence);
    }
  }

  private orderedPayloadCandidates(rawPayload: string, sourcePort: string): string[] {
    const normalized = rawPayload.trim();
    if (normalized.length === 0) {
      return [];
    }

    const recovered = recoverJsonCandidates(rawPayload);
    const pendingWindow = this.pendingCommandWindows.get(sourcePort);
    const inspectRawFirst = pendingWindow
      ? normalized.includes(`"command_id":"${pendingWindow.commandId}"`) ||
        normalized.includes("\"ack_") ||
        normalized.includes("\"status\"")
      : false;

    return inspectRawFirst ? Array.from(new Set([normalized, ...recovered])) : recovered;
  }

  private async handlePayloadCandidate(
    rawPayload: string,
    sourcePort: string,
    frameType: FieldLinkFrameType | null,
    frameSequence: number | null
  ): Promise<void> {
    const traceId = newTraceId();
    const receivedTs = isoNow();
    const payloadBytes = Buffer.byteLength(rawPayload, "utf8");
    const portState = this.ensurePortRuntimeState(sourcePort);
    const pendingWindow = this.pendingCommandWindows.get(sourcePort);

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
      const recoveredAck = recoverCommandAckCandidate(rawPayload, pendingWindow);
      if (recoveredAck && this.validateCommandAck.validate(recoveredAck)) {
        const recoveredPayload = JSON.stringify(recoveredAck);
        this.logger.warn(
          {
            traceId,
            sourcePort,
            payloadBytes,
            recoveredPayloadBytes: Buffer.byteLength(recoveredPayload, "utf8"),
            commandId: recoveredAck.command_id,
            deviceId: recoveredAck.device_id,
            status: recoveredAck.status,
            rawPayloadSnippet: summarizePayloadSnippet(rawPayload)
          },
          "field gateway command ack recovered from corrupt serial payload"
        );
        await this.publishCommandAck(recoveredAck, recoveredPayload, sourcePort);
        return;
      }

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
      if (frameType && frameType !== "ack" && frameType !== "control") {
        this.logger.warn(
          { traceId, sourcePort, frameType, frameSequence, commandId: parsed.command_id },
          "field gateway frame type mismatch for command ack"
        );
        return;
      }
      await this.publishCommandAck(parsed, rawPayload, sourcePort);
      return;
    }

    const recoveredAck = recoverCommandAckCandidate(rawPayload, pendingWindow);
    if (recoveredAck && this.validateCommandAck.validate(recoveredAck)) {
      const recoveredPayload = JSON.stringify(recoveredAck);
      this.logger.warn(
        {
          traceId,
          sourcePort,
          payloadBytes,
          recoveredPayloadBytes: Buffer.byteLength(recoveredPayload, "utf8"),
          commandId: recoveredAck.command_id,
          deviceId: recoveredAck.device_id,
          status: recoveredAck.status,
          rawPayloadSnippet: summarizePayloadSnippet(rawPayload)
        },
        "field gateway command ack recovered from schema-invalid serial payload"
      );
      await this.publishCommandAck(recoveredAck, recoveredPayload, sourcePort);
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
    if (frameType && frameType !== "telemetry" && frameType !== "control") {
      this.logger.warn(
        { traceId, sourcePort, frameType, frameSequence, deviceId: envelope.device_id, seq: envelope.seq ?? null },
        "field gateway frame type mismatch for telemetry"
      );
      return;
    }
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

    const activePollWindow = this.activePollTelemetryWindows.get(sourcePort);
    const telemetryLastCommandId =
      envelope.meta && typeof envelope.meta.last_command_id === "string" ? envelope.meta.last_command_id : null;
    const telemetryUploadTrigger =
      envelope.meta && typeof envelope.meta.upload_trigger === "string" ? envelope.meta.upload_trigger : null;
    const matchedActivePollWindow =
      activePollWindow?.deviceId === envelope.device_id &&
      telemetryLastCommandId === activePollWindow.commandId &&
      telemetryUploadTrigger === "scheduler_poll";
    if (matchedActivePollWindow) {
      const roundTripMs = Math.max(0, Date.now() - activePollWindow.startedAtMs);
      const previousMatches = portState.pollTelemetryMatches;
      const previousAverage = portState.averagePollRoundTripMs ?? 0;
      portState.lastPollRoundTripMs = roundTripMs;
      portState.averagePollRoundTripMs = Math.round(
        (previousAverage * previousMatches + roundTripMs) / (previousMatches + 1)
      );
      portState.maxPollRoundTripMs = Math.max(portState.maxPollRoundTripMs, roundTripMs);
      this.closeActivePollTelemetryWindow(sourcePort, "telemetry");
      this.stats.internalPollTelemetryMatches += 1;
      this.stats.lastInternalPollTelemetryTs = receivedTs;
      portState.pollTelemetryMatches += 1;
      portState.lastPollTelemetryTs = receivedTs;
    }

    const telemetryLastCommandTag =
      envelope.meta && typeof envelope.meta.last_command_tag === "number"
        ? envelope.meta.last_command_tag >>> 0
        : null;
    if (
      this.config.southboundPollingMode === "compact-broadcast-v1" &&
      telemetryUploadTrigger === "scheduler_poll" &&
      telemetryLastCommandTag !== null
    ) {
      this.matchCompactBroadcastTelemetry(
        sourcePort,
        telemetryLastCommandTag,
        envelope.device_id,
        receivedTs
      );
    }

    this.stats.parsedMessages += 1;
    this.stats.lastParsedMessageTs = receivedTs;
    nodeState.telemetryMessages += 1;
    nodeState.lastTelemetryTs = receivedTs;
    nodeState.lastSeenTs = receivedTs;
    nodeState.lastSeenKind = "telemetry";
    nodeState.status = "online";
    nodeState.latestTelemetry = {
      receivedTs,
      eventTs: envelope.event_ts ?? null,
      seq: envelope.seq ?? null,
      metrics: { ...envelope.metrics }
    };
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
    const diagnostics = analyzeRejectedPayload(rawPayload);
    this.markNodeActivityFromRejected(deviceId, diagnostics.distinctDeviceIds, receivedTs, sourcePort);
    if (diagnostics.suspectedInterleaving) {
      this.stats.interleavingSuspected += 1;
      if (diagnostics.schemaVersionCount > 1) {
        this.stats.interleavingWithMultipleSchemas += 1;
      }
      if (diagnostics.distinctDeviceIds.length > 1) {
        this.stats.interleavingWithMultipleDeviceIds += 1;
      }
      this.stats.lastInterleavingTs = receivedTs;
      this.stats.lastInterleavingSummary = diagnostics.summary;
    }

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
          rejectedPath,
          interleavingSuspected: diagnostics.suspectedInterleaving,
          schemaVersionCount: diagnostics.schemaVersionCount,
          distinctDeviceIds: diagnostics.distinctDeviceIds
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

  private tickSouthboundPolling(): void {
    this.pollerTimer = null;
    if (!this.config.southboundPollingEnabled || this.stopping) {
      return;
    }

    if (this.config.southboundPollingMode === "compact-broadcast-v1") {
      this.tickCompactBroadcastPolling();
      return;
    }

    let issued = false;
    let busy = false;
    for (const portPath of this.getConfiguredPortPaths()) {
      if (this.pendingCommandWindows.has(portPath)) {
        busy = true;
        continue;
      }
      if (this.activePollTelemetryWindows.has(portPath)) {
        busy = true;
        continue;
      }
      if (this.portCommandChains.has(portPath)) {
        busy = true;
        continue;
      }

      const serialPort = this.serialPorts.get(portPath);
      if (!serialPort?.isOpen) {
        continue;
      }

      const nextNode = this.nextPollingNodeForPort(portPath);
      if (!nextNode) {
        continue;
      }

      issued = true;
      void this.issueInternalPollForNode(nextNode, portPath);
    }

    // A busy port will schedule itself when its active session closes. This avoids
    // a fixed timer boundary turning a 1.05s response into a skipped 2s slot.
    if (!issued && !busy) {
      this.scheduleSouthboundPolling(this.config.southboundPollingIntervalMs);
    }
  }

  private tickCompactBroadcastPolling(): void {
    for (const portPath of this.getConfiguredPortPaths()) {
      if (this.pendingCommandWindows.has(portPath) || this.portCommandChains.has(portPath)) {
        continue;
      }

      const serialPort = this.serialPorts.get(portPath);
      if (!serialPort?.isOpen) {
        continue;
      }

      this.enqueueCompactBroadcastPoll(portPath);
    }

    this.scheduleSouthboundPolling(this.config.southboundPollingIntervalMs);
  }

  private enqueueCompactBroadcastPoll(portPath: string): void {
    const portState = this.ensurePortRuntimeState(portPath);
    const previousChain = this.portCommandChains.get(portPath) ?? Promise.resolve();
    portState.queuedCommands += 1;

    const nextChain = previousChain
      .catch(() => undefined)
      .then(async () => this.forwardCompactBroadcastPoll(portPath))
      .finally(() => {
        portState.queuedCommands = Math.max(0, portState.queuedCommands - 1);
        if (this.portCommandChains.get(portPath) === nextChain) {
          this.portCommandChains.delete(portPath);
        }
      });

    this.portCommandChains.set(portPath, nextChain);
    void nextChain;
  }

  private async forwardCompactBroadcastPoll(portPath: string): Promise<void> {
    const serialPort = this.serialPorts.get(portPath);
    if (!serialPort?.isOpen) {
      return;
    }

    const expectedDeviceIds = new Set(
      Array.from(this.nodeState.values())
        .filter((node) => node.enabled && this.nodePort(node) === portPath)
        .map((node) => node.deviceId)
    );
    if (expectedDeviceIds.size === 0) {
      return;
    }

    let compactPoll = buildCompactBroadcastPollCommand(
      randomUUID().replace(/-/gu, "").slice(0, 8)
    );
    let windowKey = this.compactBroadcastPollWindowKey(portPath, compactPoll.commandTag);
    while (this.activeCompactBroadcastPollWindows.has(windowKey)) {
      compactPoll = buildCompactBroadcastPollCommand(randomUUID().replace(/-/gu, "").slice(0, 8));
      windowKey = this.compactBroadcastPollWindowKey(portPath, compactPoll.commandTag);
    }

    const portState = this.ensurePortRuntimeState(portPath);
    const startedTs = isoNow();
    const startedAtMs = Date.now();
    const timer = setTimeout(() => {
      this.closeCompactBroadcastPollWindow(windowKey, "timeout");
    }, this.config.southboundPollingSessionTimeoutMs);
    const window: ActiveCompactBroadcastPollWindow = {
      command: compactPoll.command,
      commandTag: compactPoll.commandTag,
      portPath,
      expectedDeviceIds,
      receivedDeviceIds: new Set<string>(),
      startedTs,
      startedAtMs,
      timer
    };
    this.activeCompactBroadcastPollWindows.set(windowKey, window);
    portState.activePollCommandId = compactPoll.command;
    portState.activePollDeviceId = "broadcast";
    portState.sendOwnerState = "writing-command";

    const serialFrame = encodeFieldLinkFrame({
      frameType: "command",
      sequence: this.nextFieldLinkTxSequence(),
      payloadText: compactPoll.command
    });

    try {
      await this.writeSerialFrame(
        serialPort,
        serialFrame,
        this.config.southboundPollingCommandChunkBytes,
        this.config.southboundPollingCommandChunkDelayMs
      );
    } catch (err) {
      this.stats.commandWriteFailures += 1;
      this.stats.lastError = err instanceof Error ? err.message : String(err);
      portState.lastError = this.stats.lastError;
      this.closeCompactBroadcastPollWindow(windowKey, "failed");
      this.logger.error(
        { err, serialDevice: portPath, commandTag: compactPoll.commandTag },
        "field gateway compact broadcast poll write failed"
      );
      return;
    }

    this.stats.commandsForwarded += 1;
    this.stats.internalPollCommandsIssued += 1;
    this.stats.compactBroadcastPollsIssued += 1;
    this.stats.lastCommandForwardedTs = startedTs;
    this.stats.lastInternalPollCommandTs = startedTs;
    portState.commandWrites += 1;
    portState.pollCommandsIssued += 1;
    portState.lastCommandTs = startedTs;
    portState.lastPollCommandTs = startedTs;
    portState.sendOwnerState = "waiting-for-poll-telemetry";
    for (const deviceId of expectedDeviceIds) {
      const nodeState = this.nodeState.get(deviceId);
      if (!nodeState) continue;
      nodeState.commandForwards += 1;
      nodeState.lastCommandTs = startedTs;
    }

    this.logger.debug(
      {
        serialDevice: portPath,
        command: compactPoll.command,
        commandTag: compactPoll.commandTag,
        expectedNodes: expectedDeviceIds.size,
        frameBytes: serialFrame.length
      },
      "field gateway compact broadcast poll forwarded to serial"
    );
  }

  private scheduleSouthboundPolling(delayMs: number): void {
    if (!this.config.southboundPollingEnabled || this.stopping || this.pollerTimer) {
      return;
    }

    this.pollerTimer = setTimeout(() => {
      this.tickSouthboundPolling();
    }, Math.max(0, delayMs));
  }

  private nextPollingNodeForPort(portPath: string): NodeRuntimeState | null {
    const nodes = Array.from(this.nodeState.values())
      .filter((node) => node.enabled && this.nodePort(node) === portPath)
      .sort((left, right) => {
        const fieldNodeCompare = left.fieldNodeId.localeCompare(right.fieldNodeId);
        return fieldNodeCompare !== 0 ? fieldNodeCompare : left.deviceId.localeCompare(right.deviceId);
      });

    if (nodes.length === 0) {
      return null;
    }

    const currentIndex = this.portPollNodeCursor.get(portPath) ?? -1;
    const nextIndex = (currentIndex + 1) % nodes.length;
    this.portPollNodeCursor.set(portPath, nextIndex);
    return nodes[nextIndex] ?? null;
  }

  private async issueInternalPollForNode(nodeState: NodeRuntimeState, targetPort: string): Promise<void> {
    const traceId = newTraceId();
    const issuedTs = isoNow();
    const command: DeviceCommandV1 = {
      schema_version: 1,
      command_id: buildInternalPollCommandId(),
      device_id: nodeState.deviceId,
      command_type: this.config.southboundPollingCommandType,
      payload: {
        source: "field-gateway-internal-poller",
        scheduler: true
      },
      issued_ts: issuedTs
    };
    const rawPayload = JSON.stringify(command);
    const payloadBytes = Buffer.byteLength(rawPayload, "utf8");

    this.internalPollCommands.set(command.command_id, {
      commandId: command.command_id,
      commandType: command.command_type,
      deviceId: command.device_id,
      portPath: targetPort,
      issuedTs,
      suppressAckPublish: this.config.southboundPollingSuppressAckPublish
    });

    try {
      await this.enqueueCommandForward({
        origin: "internal-poll",
        traceId,
        topic: `internal-poll/${nodeState.deviceId}`,
        rawPayload,
        payloadBytes,
        command,
        nodeState,
        targetPort
      });
    } catch (err) {
      this.internalPollCommands.delete(command.command_id);
      this.closeActivePollTelemetryWindow(targetPort, "failed");
      throw err;
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

    await this.enqueueCommandForward({
      origin: "mqtt",
      traceId,
      topic,
      rawPayload,
      payloadBytes,
      command,
      nodeState,
      targetPort
    });
  }

  private async enqueueCommandForward(params: {
    origin: SouthboundCommandOrigin;
    traceId: string;
    topic: string;
    rawPayload: string;
    payloadBytes: number;
    command: DeviceCommandV1;
    nodeState: NodeRuntimeState;
    targetPort: string;
  }): Promise<void> {
    const { origin, traceId, topic, rawPayload, payloadBytes, command, nodeState, targetPort } = params;
    const portState = this.ensurePortRuntimeState(targetPort);
    const previousChain = this.portCommandChains.get(targetPort) ?? Promise.resolve();

    portState.queuedCommands += 1;

    const nextChain = previousChain
      .catch(() => undefined)
      .then(async () =>
        this.forwardCommandWithQuietWindow({
          origin,
          traceId,
          topic,
          rawPayload,
          payloadBytes,
          command,
          nodeState,
          targetPort
        })
      )
      .finally(() => {
        portState.queuedCommands = Math.max(0, portState.queuedCommands - 1);
        if (this.portCommandChains.get(targetPort) === nextChain) {
          this.portCommandChains.delete(targetPort);
        }
      });

    this.portCommandChains.set(targetPort, nextChain);
    await nextChain;
  }

  private async forwardCommandWithQuietWindow(params: {
    origin: SouthboundCommandOrigin;
    traceId: string;
    topic: string;
    rawPayload: string;
    payloadBytes: number;
    command: DeviceCommandV1;
    nodeState: NodeRuntimeState;
    targetPort: string;
  }): Promise<void> {
    const { origin, traceId, topic, payloadBytes, command, nodeState, targetPort } = params;
    const portState = this.ensurePortRuntimeState(targetPort);
    await this.waitForPortQuietBeforeWrite(targetPort, command, origin);
    try {
      await this.flushPortBeforeCommandWrite(targetPort);
      portState.lastPrewriteFlushTs = isoNow();
    } catch (err) {
      portState.prewriteFlushFailures += 1;
      this.stats.lastError = err instanceof Error ? err.message : String(err);
      portState.lastError = this.stats.lastError;
      this.logger.warn(
        {
          traceId,
          serialDevice: targetPort,
          commandId: command.command_id,
          commandType: command.command_type,
          deviceId: command.device_id,
          err
        },
        "field gateway command prewrite flush failed; continuing with write"
      );
    }
    const internalPollRecord = origin === "internal-poll" ? this.internalPollCommands.get(command.command_id) : null;
    const quietWindow = origin === "internal-poll" ? null : this.beginPendingCommandWindow(targetPort, command);
    if (internalPollRecord) {
      this.beginActivePollTelemetryWindow(internalPollRecord);
    }
    portState.sendOwnerState = "writing-command";

    try {
      const gatewaySentTs = isoNow();
      const southboundPayload = buildSouthboundCommandPayload(command, gatewaySentTs, origin);
      const southboundPayloadBytes = Buffer.byteLength(southboundPayload, "utf8");
      await this.writeCommandToSerial(southboundPayload, targetPort, origin);
      this.stats.commandsForwarded += 1;
      this.stats.lastCommandForwardedTs = gatewaySentTs;
      nodeState.commandForwards += 1;
      nodeState.lastCommandTs = this.stats.lastCommandForwardedTs;
      portState.commandWrites += 1;
      portState.lastCommandTs = this.stats.lastCommandForwardedTs;
      if (origin === "internal-poll") {
        portState.pollCommandsIssued += 1;
        portState.lastPollCommandTs = this.stats.lastCommandForwardedTs;
        this.stats.internalPollCommandsIssued += 1;
        this.stats.lastInternalPollCommandTs = this.stats.lastCommandForwardedTs;
      }
      const logContext = {
        origin,
        topic,
        serialDevice: targetPort,
        commandId: command.command_id,
        commandType: command.command_type,
        deviceId: command.device_id,
        payloadBytes,
        southboundPayloadBytes,
        gatewaySentTs,
        queuedCommands: portState.queuedCommands
      };
      if (origin === "internal-poll") {
        this.logger.debug(logContext, "field gateway poll forwarded to serial");
      } else {
        this.logger.info(logContext, "field gateway command forwarded to serial");
      }
    } catch (err) {
      this.stats.commandWriteFailures += 1;
      this.stats.lastError = err instanceof Error ? err.message : String(err);
      portState.lastError = this.stats.lastError;
      if (origin === "internal-poll") {
        this.internalPollCommands.delete(command.command_id);
        this.closeActivePollTelemetryWindow(targetPort, "failed");
      } else {
        this.closePendingCommandWindow(targetPort, "shutdown");
      }
      this.logger.error({ traceId, topic, serialDevice: targetPort, err }, "field gateway command serial write failed");
      return;
    }

    if (origin === "internal-poll") {
      portState.sendOwnerState = "waiting-for-poll-telemetry";
      return;
    }

    portState.sendOwnerState = "waiting-for-ack";
    await quietWindow;
  }

  private async waitForPortQuietBeforeWrite(
    portPath: string,
    command: DeviceCommandV1,
    origin: SouthboundCommandOrigin
  ): Promise<void> {
    const quietMs =
      origin === "internal-poll" ? this.config.southboundPollingPrewriteQuietMs : this.config.commandPrewriteQuietMs;
    const maxWaitMs =
      origin === "internal-poll"
        ? this.config.southboundPollingPrewriteMaxWaitMs
        : this.config.commandPrewriteMaxWaitMs;
    const portState = this.ensurePortRuntimeState(portPath);

    while (
      this.activePollTelemetryWindows.has(portPath) ||
      this.hasActiveCompactBroadcastPollWindowForPort(portPath)
    ) {
      await delay(100);
    }

    if (quietMs <= 0 || maxWaitMs <= 0) {
      portState.lastPrewriteQuietSatisfiedTs = isoNow();
      portState.lastPrewriteQuietWaitMs = 0;
      return;
    }

    const startedAt = Date.now();
    while (Date.now() - startedAt < maxWaitMs) {
      const lastReadAt = this.portLastReadAtMs.get(portPath);
      const quietForMs = lastReadAt ? Date.now() - lastReadAt : Number.POSITIVE_INFINITY;
      if (quietForMs >= quietMs) {
        portState.lastPrewriteQuietSatisfiedTs = isoNow();
        portState.lastPrewriteQuietWaitMs = Date.now() - startedAt;
        return;
      }

      await delay(Math.min(quietMs, 100));
    }

    portState.prewriteQuietTimeouts += 1;
    portState.lastPrewriteQuietWaitMs = Date.now() - startedAt;
    this.logger.warn(
      {
        serialDevice: portPath,
        commandId: command.command_id,
        commandType: command.command_type,
        deviceId: command.device_id,
        prewriteQuietMs: quietMs,
        prewriteMaxWaitMs: maxWaitMs
      },
      "field gateway command prewrite quiet wait timed out"
    );
  }

  private beginPendingCommandWindow(portPath: string, command: DeviceCommandV1): Promise<void> {
    const existingWindow = this.pendingCommandWindows.get(portPath);
    if (existingWindow) {
      this.closePendingCommandWindow(portPath, "timeout");
    }

    const portState = this.ensurePortRuntimeState(portPath);
    const startedTs = isoNow();
    const quietUntilMs = Date.now() + this.config.commandAckQuietWindowMs;
    const quietUntilTs = new Date(quietUntilMs).toISOString();
    portState.sendOwnerState = "waiting-for-ack";
    portState.pendingCommandId = command.command_id;
    portState.pendingCommandType = command.command_type;
    portState.pendingCommandDeviceId = command.device_id;
    portState.lastQuietWindowStartTs = startedTs;
    portState.quietWindowUntilTs = quietUntilTs;

    return new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        portState.quietWindowTimeouts += 1;
        this.logger.warn(
          {
            serialDevice: portPath,
            commandId: command.command_id,
            commandType: command.command_type,
            deviceId: command.device_id,
            quietWindowMs: this.config.commandAckQuietWindowMs
          },
          "field gateway command quiet window timed out"
        );
        this.closePendingCommandWindow(portPath, "timeout");
      }, this.config.commandAckQuietWindowMs);

      this.portQuietWindowTimers.set(portPath, timer);
      this.pendingCommandWindows.set(portPath, {
        commandId: command.command_id,
        commandType: command.command_type,
        deviceId: command.device_id,
        quietUntilTs,
        close: (reason) => {
          this.clearPendingCommandWindowState(portPath, reason);
          resolve();
        }
      });
    });
  }

  private closePendingCommandWindow(portPath: string, reason: "acked" | "failed" | "timeout" | "shutdown"): void {
    const pendingWindow = this.pendingCommandWindows.get(portPath);
    if (!pendingWindow) {
      this.clearPendingCommandWindowState(portPath, reason);
      return;
    }

    this.pendingCommandWindows.delete(portPath);
    pendingWindow.close(reason);
  }

  private beginActivePollTelemetryWindow(record: InternalPollCommandRecord): void {
    const existing = this.activePollTelemetryWindows.get(record.portPath);
    if (existing) {
      this.closeActivePollTelemetryWindow(record.portPath, "shutdown");
    }

    const portState = this.ensurePortRuntimeState(record.portPath);
    const startedTs = isoNow();
    const startedAtMs = Date.now();
    const timeoutAtMs = startedAtMs + this.config.southboundPollingSessionTimeoutMs;
    portState.sendOwnerState = "waiting-for-poll-telemetry";
    portState.activePollCommandId = record.commandId;
    portState.activePollDeviceId = record.deviceId;

    const timer = setTimeout(() => {
      portState.pollSessionTimeouts += 1;
      this.stats.internalPollSessionTimeouts += 1;
      this.logger.warn(
        {
          serialDevice: record.portPath,
          commandId: record.commandId,
          commandType: record.commandType,
          deviceId: record.deviceId,
          pollSessionTimeoutMs: this.config.southboundPollingSessionTimeoutMs
        },
        "field gateway internal poll telemetry window timed out"
      );
      this.closeActivePollTelemetryWindow(record.portPath, "timeout");
    }, this.config.southboundPollingSessionTimeoutMs);

    this.activePollTelemetryWindows.set(record.portPath, {
      commandId: record.commandId,
      commandType: record.commandType,
      deviceId: record.deviceId,
      portPath: record.portPath,
      startedTs,
      startedAtMs,
      timeoutAtMs,
      timer
    });
  }

  private closeActivePollTelemetryWindow(
    portPath: string,
    reason: "telemetry" | "failed" | "timeout" | "shutdown"
  ): void {
    const activeWindow = this.activePollTelemetryWindows.get(portPath);
    const portState = this.ensurePortRuntimeState(portPath);

    if (activeWindow) {
      const elapsedMs = Math.max(0, Date.now() - activeWindow.startedAtMs);
      clearTimeout(activeWindow.timer);
      this.activePollTelemetryWindows.delete(portPath);
      this.internalPollCommands.delete(activeWindow.commandId);
      if (reason !== "shutdown") {
        const nextDelayMs =
          reason === "telemetry"
            ? Math.max(0, this.config.southboundPollingIntervalMs - elapsedMs)
            : this.config.southboundPollingIntervalMs;
        this.scheduleSouthboundPolling(nextDelayMs);
      }
    }

    portState.activePollCommandId = null;
    portState.activePollDeviceId = null;
    portState.lastPollSessionCloseTs = isoNow();
    portState.lastPollSessionCloseReason = reason;
    if (!this.pendingCommandWindows.has(portPath)) {
      portState.sendOwnerState = "idle";
    }
  }

  private compactBroadcastPollWindowKey(portPath: string, commandTag: number): string {
    return `${portPath}:${String(commandTag >>> 0)}`;
  }

  private hasActiveCompactBroadcastPollWindowForPort(portPath: string): boolean {
    return Array.from(this.activeCompactBroadcastPollWindows.values()).some(
      (window) => window.portPath === portPath
    );
  }

  private matchCompactBroadcastTelemetry(
    portPath: string,
    commandTag: number,
    deviceId: string,
    receivedTs: string
  ): void {
    const windowKey = this.compactBroadcastPollWindowKey(portPath, commandTag);
    const window = this.activeCompactBroadcastPollWindows.get(windowKey);
    if (!window?.expectedDeviceIds.has(deviceId)) {
      this.stats.compactBroadcastUnmatchedTelemetry += 1;
      return;
    }

    if (window.receivedDeviceIds.has(deviceId)) {
      this.stats.compactBroadcastDuplicateTelemetry += 1;
      return;
    }

    window.receivedDeviceIds.add(deviceId);
    const roundTripMs = Math.max(0, Date.now() - window.startedAtMs);
    const portState = this.ensurePortRuntimeState(portPath);
    const previousMatches = portState.pollTelemetryMatches;
    const previousAverage = portState.averagePollRoundTripMs ?? 0;
    portState.lastPollRoundTripMs = roundTripMs;
    portState.averagePollRoundTripMs = Math.round(
      (previousAverage * previousMatches + roundTripMs) / (previousMatches + 1)
    );
    portState.maxPollRoundTripMs = Math.max(portState.maxPollRoundTripMs, roundTripMs);
    portState.pollTelemetryMatches += 1;
    portState.lastPollTelemetryTs = receivedTs;
    this.stats.internalPollTelemetryMatches += 1;
    this.stats.compactBroadcastTelemetryMatches += 1;
    this.stats.lastInternalPollTelemetryTs = receivedTs;

    if (window.receivedDeviceIds.size === window.expectedDeviceIds.size) {
      this.closeCompactBroadcastPollWindow(windowKey, "telemetry");
    }
  }

  private closeCompactBroadcastPollWindow(
    windowKey: string,
    reason: "telemetry" | "failed" | "timeout" | "shutdown"
  ): void {
    const window = this.activeCompactBroadcastPollWindows.get(windowKey);
    if (!window) {
      return;
    }

    clearTimeout(window.timer);
    this.activeCompactBroadcastPollWindows.delete(windowKey);
    const portState = this.ensurePortRuntimeState(window.portPath);
    portState.lastPollSessionCloseTs = isoNow();
    portState.lastPollSessionCloseReason = reason;

    if (reason === "timeout") {
      const missingDeviceIds = Array.from(window.expectedDeviceIds).filter(
        (deviceId) => !window.receivedDeviceIds.has(deviceId)
      );
      portState.pollSessionTimeouts += 1;
      this.stats.internalPollSessionTimeouts += 1;
      this.stats.compactBroadcastPollTimeouts += 1;
      this.logger.warn(
        {
          serialDevice: window.portPath,
          command: window.command,
          commandTag: window.commandTag,
          receivedNodes: window.receivedDeviceIds.size,
          expectedNodes: window.expectedDeviceIds.size,
          missingDeviceIds,
          pollSessionTimeoutMs: this.config.southboundPollingSessionTimeoutMs
        },
        "field gateway compact broadcast telemetry window timed out"
      );
    } else if (reason === "telemetry") {
      this.stats.compactBroadcastPollsCompleted += 1;
    }

    const remainingWindow = Array.from(this.activeCompactBroadcastPollWindows.values()).find(
      (candidate) => candidate.portPath === window.portPath
    );
    portState.activePollCommandId = remainingWindow?.command ?? null;
    portState.activePollDeviceId = remainingWindow ? "broadcast" : null;
    if (!remainingWindow && !this.pendingCommandWindows.has(window.portPath)) {
      portState.sendOwnerState = "idle";
    }
  }

  private clearPendingCommandWindowState(
    portPath: string,
    reason: "acked" | "failed" | "timeout" | "shutdown"
  ): void {
    const timer = this.portQuietWindowTimers.get(portPath);
    if (timer) {
      clearTimeout(timer);
      this.portQuietWindowTimers.delete(portPath);
    }

    const portState = this.ensurePortRuntimeState(portPath);
    portState.lastQuietWindowCloseTs = isoNow();
    portState.lastQuietWindowCloseReason = reason;
    portState.quietWindowUntilTs = null;
    portState.pendingCommandId = null;
    portState.pendingCommandType = null;
    portState.pendingCommandDeviceId = null;
    portState.sendOwnerState = this.activePollTelemetryWindows.has(portPath) ? "waiting-for-poll-telemetry" : "idle";
    if (!this.activePollTelemetryWindows.has(portPath)) {
      this.scheduleSouthboundPolling(this.config.southboundPollingIntervalMs);
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

    this.logger.debug(
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
    const pendingWindow = this.pendingCommandWindows.get(sourcePort);
    const internalPollCommand = this.internalPollCommands.get(ack.command_id);
    const matchedPendingCommand =
      pendingWindow?.commandId === ack.command_id && pendingWindow.deviceId === ack.device_id;

    if (matchedPendingCommand) {
      this.closePendingCommandWindow(sourcePort, ack.status === "failed" ? "failed" : "acked");
    }

    if (internalPollCommand) {
      if (ack.status === "failed") {
        this.closeActivePollTelemetryWindow(sourcePort, "failed");
      }

      if (internalPollCommand.suppressAckPublish) {
        const seenTs = isoNow();
        this.stats.internalPollAckSuppressions += 1;
        nodeState.lastSeenTs = seenTs;
        nodeState.lastSeenKind = "ack";
        nodeState.lastAckTs = seenTs;
        portState.lastAckTs = seenTs;
        portState.pollAckSuppressions += 1;
        this.logger.debug(
          {
            serialDevice: sourcePort,
            commandId: ack.command_id,
            commandType: internalPollCommand.commandType,
            deviceId: ack.device_id,
            status: ack.status
          },
          "field gateway internal poll ack suppressed from northbound publish"
        );
        return;
      }
    }

    try {
      await this.publishMqtt(topic, rawPayload);
      this.stats.ackMessagesPublished += 1;
      this.stats.lastAckPublishedTs = isoNow();
      nodeState.ackPublishes += 1;
      nodeState.lastSeenTs = this.stats.lastAckPublishedTs;
      nodeState.lastSeenKind = "ack";
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
          payloadBytes: Buffer.byteLength(rawPayload, "utf8"),
          matchedPendingCommand
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

  private async writeCommandToSerial(
    payload: string,
    portPath: string,
    origin: SouthboundCommandOrigin
  ): Promise<void> {
    const serialPort = this.serialPorts.get(portPath);
    if (!serialPort?.isOpen) {
      throw new Error(`serial port is not open: ${portPath}`);
    }

    const serialFrame =
      this.config.fieldLinkMode === "cobs-crc-v1"
        ? encodeFieldLinkFrame({
            frameType: "command",
            sequence: this.nextFieldLinkTxSequence(),
            payloadText: payload
          })
        : Buffer.from(`${payload}\n`, "utf8");

    const chunkBytes =
      origin === "internal-poll"
        ? this.config.southboundPollingCommandChunkBytes
        : this.config.commandSerialChunkBytes;
    const chunkDelayMs =
      origin === "internal-poll"
        ? this.config.southboundPollingCommandChunkDelayMs
        : this.config.commandSerialChunkDelayMs;
    await this.writeSerialFrame(serialPort, serialFrame, chunkBytes, chunkDelayMs);
  }

  private async writeSerialFrame(
    serialPort: SerialPort,
    serialFrame: Buffer,
    chunkBytes: number,
    chunkDelayMs: number
  ): Promise<void> {
    if (chunkBytes <= 0 || serialFrame.length <= chunkBytes) {
      await this.writeSerialChunk(serialPort, serialFrame);
      return;
    }

    for (let offset = 0; offset < serialFrame.length; offset += chunkBytes) {
      const nextOffset = Math.min(offset + chunkBytes, serialFrame.length);
      await this.writeSerialChunk(serialPort, serialFrame.subarray(offset, nextOffset));
      if (nextOffset < serialFrame.length && chunkDelayMs > 0) {
        await delay(chunkDelayMs);
      }
    }
  }

  private async writeSerialChunk(serialPort: SerialPort, chunk: Buffer): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      serialPort.write(chunk, (err) => {
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

  private async flushPortBeforeCommandWrite(portPath: string): Promise<void> {
    const serialPort = this.serialPorts.get(portPath);
    if (!serialPort?.isOpen) {
      throw new Error(`serial port is not open: ${portPath}`);
    }

    await new Promise<void>((resolve, reject) => {
      serialPort.flush((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  private nextFieldLinkTxSequence(): number {
    this.fieldLinkTxSequence = (this.fieldLinkTxSequence + 1) >>> 0;
    return this.fieldLinkTxSequence;
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
        field_link_mode: this.config.fieldLinkMode,
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
        pollingEnabled: this.config.southboundPollingEnabled,
        pollingMode: this.config.southboundPollingMode,
        pollingCommandType: this.config.southboundPollingCommandType,
        pollingCompletionSignal:
          this.config.southboundPollingMode === "compact-broadcast-v1"
            ? "three-command-tag-matched-telemetry-frames"
            : "matching-command-id-telemetry",
        pollingIntervalMs: this.config.southboundPollingIntervalMs,
        pollingSessionTimeoutMs: this.config.southboundPollingSessionTimeoutMs,
        pollingCommandChunkBytes: this.config.southboundPollingCommandChunkBytes,
        pollingCommandChunkDelayMs: this.config.southboundPollingCommandChunkDelayMs,
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
      lastSeenTs: null,
      lastSeenKind: null,
      lastCommandTs: null,
      lastAckTs: null,
      lastTelemetryAgeMs: null,
      lastSeenAgeMs: null,
      effectiveDegradedAfterMs: null,
      effectiveOfflineAfterMs: null,
      statusReason: null,
      status: "configured",
      latestTelemetry: null
    };
  }

  private createPortRuntimeState(portPath: string): PortRuntimeState {
    const mappedNodes = Array.from(this.nodeState.values()).filter((node) => this.nodePort(node) === portPath);
    return {
      serialDevice: portPath,
      open: false,
      reconnectScheduled: false,
      sendOwnerState: "idle",
      mappedNodeCount: mappedNodes.length,
      enabledNodeCount: mappedNodes.filter((node) => node.enabled).length,
      mappedDeviceIds: mappedNodes.map((node) => node.deviceId).sort((a, b) => a.localeCompare(b)),
      telemetryMessages: 0,
      commandWrites: 0,
      queuedCommands: 0,
      ackMessages: 0,
      pendingCommandId: null,
      pendingCommandType: null,
      pendingCommandDeviceId: null,
      quietWindowUntilTs: null,
      lastQuietWindowStartTs: null,
      lastQuietWindowCloseTs: null,
      lastQuietWindowCloseReason: null,
      quietWindowTimeouts: 0,
      lastPrewriteQuietSatisfiedTs: null,
      lastPrewriteQuietWaitMs: 0,
      prewriteQuietTimeouts: 0,
      lastPrewriteFlushTs: null,
      prewriteFlushFailures: 0,
      reconnectAttempts: 0,
      consecutiveReconnectFailures: 0,
      serialChunks: 0,
      serialBytes: 0,
      lastReadTs: null,
      lastOpenTs: null,
      lastCloseTs: null,
      lastCommandTs: null,
      lastAckTs: null,
      lastPollCommandTs: null,
      lastPollTelemetryTs: null,
      lastPollSessionCloseTs: null,
      lastPollSessionCloseReason: null,
      activePollCommandId: null,
      activePollDeviceId: null,
      pollCommandsIssued: 0,
      pollTelemetryMatches: 0,
      pollAckSuppressions: 0,
      pollSessionTimeouts: 0,
      lastPollRoundTripMs: null,
      averagePollRoundTripMs: null,
      maxPollRoundTripMs: 0,
      lastReconnectTs: null,
      lastReconnectReason: null,
      lastError: null,
      status: "configured"
    };
  }

  private snapshotNodeRuntimeState(nodeState: NodeRuntimeState, nowMs: number): NodeRuntimeState {
    const portState = this.portState.get(this.nodePort(nodeState));
    const mappedNodeCount = Math.max(1, portState?.enabledNodeCount ?? portState?.mappedNodeCount ?? 1);
    const effectiveDegradedAfterMs = this.config.nodeDegradedAfterMs * mappedNodeCount;
    const effectiveOfflineAfterMs = this.config.nodeOfflineAfterMs * mappedNodeCount;
    const telemetryAgeMs = ageMsFrom(nowMs, nodeState.lastTelemetryTs);
    const activityAgeMs = ageMsFrom(nowMs, nodeState.lastSeenTs ?? nodeState.lastTelemetryTs);

    nodeState.lastTelemetryAgeMs = telemetryAgeMs;
    nodeState.lastSeenAgeMs = activityAgeMs;
    nodeState.effectiveDegradedAfterMs = effectiveDegradedAfterMs;
    nodeState.effectiveOfflineAfterMs = effectiveOfflineAfterMs;

    if (activityAgeMs === null) {
      nodeState.status = "configured";
      nodeState.statusReason = "no-node-activity-yet";
    } else if (telemetryAgeMs !== null && telemetryAgeMs < effectiveDegradedAfterMs) {
      nodeState.status = "online";
      nodeState.statusReason = "recent-telemetry";
    } else if (activityAgeMs >= effectiveOfflineAfterMs) {
      nodeState.status = "offline";
      nodeState.statusReason = "node-activity-stale";
    } else {
      nodeState.status = "degraded";
      nodeState.statusReason =
        nodeState.lastSeenKind === "rejected"
          ? "recent-rejected-node-activity-without-fresh-telemetry"
          : "node-telemetry-stale-within-grace-window";
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
      lastSeenTs: null,
      lastSeenKind: null,
      lastCommandTs: null,
      lastAckTs: null,
      lastTelemetryAgeMs: null,
      lastSeenAgeMs: null,
      effectiveDegradedAfterMs: null,
      effectiveOfflineAfterMs: null,
      statusReason: null,
      status: "configured",
      latestTelemetry: null
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

  private markNodeActivity(deviceId: string, seenTs: string, kind: "telemetry" | "ack" | "rejected", sourcePort: string): void {
    const nodeState = this.nodeState.get(deviceId);
    if (!nodeState?.enabled) {
      return;
    }

    if (this.nodePort(nodeState) !== sourcePort) {
      return;
    }

    nodeState.lastSeenTs = seenTs;
    nodeState.lastSeenKind = kind;
  }

  private markNodeActivityFromRejected(
    explicitDeviceId: string | null,
    distinctDeviceIds: string[],
    seenTs: string,
    sourcePort: string
  ): void {
    const seenDeviceIds = new Set<string>();
    if (explicitDeviceId) {
      seenDeviceIds.add(explicitDeviceId);
    }
    for (const deviceId of distinctDeviceIds) {
      if (deviceId) {
        seenDeviceIds.add(deviceId);
      }
    }

    for (const deviceId of seenDeviceIds) {
      this.markNodeActivity(deviceId, seenTs, "rejected", sourcePort);
    }
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
