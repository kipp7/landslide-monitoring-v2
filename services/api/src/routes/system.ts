import type { ClickHouseClient } from "@clickhouse/client";
import type { PoolClient } from "pg";
import type { FastifyInstance, FastifyReply } from "fastify";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { AppConfig } from "../config";
import { requirePermission, type AdminAuthConfig } from "../authz";
import { fail, ok } from "../http";
import type { PgPool } from "../postgres";
import { queryOne, withPgClient } from "../postgres";
import { beijingStartOfDayUtc } from "../time";

async function checkClickhouse(ch: ClickHouseClient): Promise<{ status: string; error?: string }> {
  try {
    const res = await ch.query({ query: "SELECT 1 AS ok", format: "JSONEachRow" });
    await res.json();
    return { status: "healthy" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { status: "unhealthy", error: msg };
  }
}

async function checkPostgres(pg: PgPool | null): Promise<{ status: string; error?: string }> {
  if (!pg) return { status: "not_configured" };
  try {
    const okRow = await withPgClient(pg, async (client) => queryOne<{ ok: number }>(client, "SELECT 1 AS ok", []));
    return okRow ? { status: "healthy" } : { status: "unhealthy", error: "no row returned" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { status: "unhealthy", error: msg };
  }
}

function utcStartOfDay(d: Date): Date {
  const x = new Date(d.getTime());
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

function utcTomorrowStart(d: Date): Date {
  const x = utcStartOfDay(d);
  x.setUTCDate(x.getUTCDate() + 1);
  return x;
}

function toClickhouseDateTime64Utc(d: Date): string {
  return d.toISOString().replace("T", " ").replace("Z", "");
}

function legacyOk(reply: FastifyReply, data: unknown): void {
  void reply.code(200).send(data);
}

const updateConfigsSchema = z
  .object({
    configs: z.array(z.object({ key: z.string().min(1), value: z.string() }).strict()).min(1)
  })
  .strict();

const successNotificationPolicySchema = z.enum(["silent", "always_notify"]);
const updateCommandSuccessNotificationPolicySchema = z
  .object({
    systemDefault: successNotificationPolicySchema,
    commandTypeDefaults: z.record(z.string().min(1), successNotificationPolicySchema)
  })
  .strict();

const COMMAND_SUCCESS_NOTIFICATION_SYSTEM_DEFAULT_KEY = "command.success_notification.system_default";
const COMMAND_SUCCESS_NOTIFICATION_COMMAND_TYPE_DEFAULTS_KEY = "command.success_notification.command_type_defaults";
const FIELD_EDGE_REPORT_STALE_MS = 24 * 60 * 60 * 1000;
const RK3568_STATUS_HTTP_TIMEOUT_MS = 6000;
const DEFAULT_COMMAND_SUCCESS_NOTIFICATION_POLICY = {
  systemDefault: "silent" as const,
  commandTypeDefaults: {
    set_config: "always_notify" as const,
    reboot: "always_notify" as const,
    restart_device: "always_notify" as const,
    deactivate_device: "always_notify" as const,
    set_sampling_interval: "always_notify" as const,
    manual_collect: "always_notify" as const,
    "huawei:reboot": "always_notify" as const
  }
};

function formalDevicePredicate(alias = "devices"): string {
  return `COALESCE(${alias}.device_name, '') NOT LIKE 'field-hardware-replay-%'
    AND COALESCE(${alias}.metadata->>'note', '') NOT IN ('field_hardware_uplink_replay', 'field_rehearsal', 'smoke_test', 'seed demo')
    AND COALESCE(${alias}.metadata->>'identityClass', COALESCE(${alias}.metadata->>'identity_class', '')) NOT IN ('seed', 'replay', 'rehearsal', 'smoke_test', 'lab')`;
}

const operationLogsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(20),
  userId: z.string().uuid().optional(),
  module: z.string().optional(),
  action: z.string().optional(),
  startTime: z.string().datetime().optional(),
  endTime: z.string().datetime().optional()
});

type SystemCheck = {
  status: string;
  error?: string;
};

type SystemStatusItemKey = "postgres" | "clickhouse" | "kafka";
type SystemStatusItemState = "healthy" | "degraded" | "not_configured" | "unknown";

type SystemStatusItem = {
  key: SystemStatusItemKey;
  label: string;
  status: SystemStatusItemState;
  detail: string;
};

type SystemStatusData = {
  uptimeS: number;
  postgres: SystemCheck;
  clickhouse: SystemCheck;
  kafka: SystemCheck;
  emqx: { status: string };
  source: "health_summary";
  note: string;
  items: SystemStatusItem[];
  fieldEdge: FieldEdgeStatusData;
  hermesEdge: HermesEdgeStatusData;
};

type FieldEdgeNodeStatus = {
  fieldNodeId: string;
  deviceId: string;
  installLabel: string;
  enabled: boolean | null;
  deferred: boolean;
  status: string;
  telemetryMessages: number | null;
  commandForwards: number | null;
  ackPublishes: number | null;
  lastTelemetryAgeSeconds: number | null;
  lastAckAgeSeconds: number | null;
};

type FieldEdgeRuntimeSummary = {
  overallLevel: string | null;
  score: number | null;
  deferredNodeIds: string[];
  networkMode: string | null;
  serialOpen: boolean | null;
  mqttConnected: boolean | null;
  portStatus: string | null;
  spoolPending: number | null;
  rejectedMessages: number | null;
  lastPublishedAgeSeconds: number | null;
};

type FieldEdgeSoakSummary = {
  generatedAt: string | null;
  accepted: boolean | null;
  currentBoundary: string | null;
  cleanWindowRounds: number | null;
  allAcked: boolean | null;
  maxBoardObservationSchemaRejectedDelta: number | null;
};

type FieldEdgeStatusData = {
  available: boolean;
  stale: boolean;
  detail: string;
  source: "rk3568_field_link_monitor";
  generatedAt: string | null;
  currentBoundary: string | null;
  accepted: boolean | null;
  summary: FieldEdgeRuntimeSummary | null;
  nodes: FieldEdgeNodeStatus[];
  soak: FieldEdgeSoakSummary | null;
};

type HermesEdgeStressSummary = {
  totalRequests: number | null;
  errorRate: number | null;
  throughputRps: number | null;
  p95Ms: number | null;
  p99Ms: number | null;
  recheckOk: number | null;
};

type HermesEdgeVolatilityDimension = {
  key: string;
  label: string;
  unit: string;
};

type HermesEdgeVolatilityPoint = {
  horizonMinutes: number;
  dimensionKey: string;
  volatilityScore: number;
  confidence: number | null;
  diagnosisType: string | null;
  driver: string;
};

type HermesEdgeVolatilitySurface = {
  generatedAt: string | null;
  surfaceType: "edge_health_volatility_surface";
  method: string;
  horizonsMinutes: number[];
  dimensions: HermesEdgeVolatilityDimension[];
  points: HermesEdgeVolatilityPoint[];
  peakScore: number | null;
  peakDimensionKey: string | null;
  peakHorizonMinutes: number | null;
  modelConfidence: number | null;
  note: string;
};

type HermesEdgeStatusData = {
  available: boolean;
  stale: boolean;
  detail: string;
  source: "rk3568_hermes_edge_supervisor";
  generatedAt: string | null;
  boardHost: string | null;
  serviceActive: boolean | null;
  serviceEnabled: boolean | null;
  accepted: boolean | null;
  currentBoundary: string | null;
  modelLoaded: boolean | null;
  modelKey: string | null;
  modelVersion: string | null;
  modelType: string | null;
  modelTask: string | null;
  featureCount: number | null;
  aiModelCount: number | null;
  diagnosisType: string | null;
  confidence: number | null;
  confidenceLevel: string | null;
  naturalLanguageReady: boolean | null;
  intentCount: number | null;
  actionRecheckAccepted: boolean | null;
  actionRecheckStatus: string | null;
  safetyGatewayCoreTouched: boolean | null;
  safetySerialTouched: boolean | null;
  safetyMqttTouched: boolean | null;
  stress: HermesEdgeStressSummary | null;
  volatilitySurface: HermesEdgeVolatilitySurface | null;
};

type DashboardSummaryData = {
  todayDataCount: number;
  onlineDevices: number;
  offlineDevices: number;
  pendingAlerts: number;
  todayAlerts: number;
  alertsBySeverity: Record<"low" | "medium" | "high" | "critical", number>;
  stations: number;
  freshDevices: number;
  totalDevices: number;
  lastUpdatedAt: string;
};

type DeskDashboardSummaryData = {
  stationCount: number;
  deviceOnlineCount: number;
  alertCountToday: number;
  systemHealthPercent: number;
};

type DashboardWeeklyTrendData = {
  labels: string[];
  rainfallMm: number[];
  alertCount: number[];
  source: "derived_summary";
  note: string;
};

type CommandSuccessNotificationPolicy = {
  systemDefault: z.infer<typeof successNotificationPolicySchema>;
  commandTypeDefaults: Record<string, z.infer<typeof successNotificationPolicySchema>>;
};

function healthStateFromCheck(input: SystemCheck): SystemStatusItemState {
  if (input.status === "healthy" || input.status === "configured") return "healthy";
  if (input.status === "unhealthy") return "degraded";
  if (input.status === "not_configured") return "not_configured";
  return "unknown";
}

function detailFromCheck(input: SystemCheck): string {
  return input.error ? `${input.status}: ${input.error}` : input.status;
}

function repoRootFromHere(): string {
  return path.resolve(__dirname, "..", "..", "..", "..");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function readBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => readString(entry))
    .filter((entry): entry is string => entry !== null);
}

function readIsoAgeMs(isoTs: string | null, now = Date.now()): number | null {
  if (!isoTs) return null;
  const ts = Date.parse(isoTs);
  if (Number.isNaN(ts)) return null;
  return Math.max(0, now - ts);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function roundMetric(value: number, digits = 3): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

async function readJsonArtifact(filePath: string): Promise<Record<string, unknown> | null> {
  try {
    const text = await readFile(filePath, "utf8");
    const normalizedText = text.replace(/^\uFEFF/, "");
    const parsed = JSON.parse(normalizedText) as unknown;
    return asRecord(parsed);
  } catch {
    return null;
  }
}

async function readJsonHttp(url: string | undefined, timeoutMs = RK3568_STATUS_HTTP_TIMEOUT_MS): Promise<Record<string, unknown> | null> {
  const target = url?.trim();
  if (!target) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(target, { signal: controller.signal });
    if (!response.ok) return null;
    const parsed = (await response.json()) as unknown;
    return asRecord(parsed);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function hostFromUrl(url: string | undefined): string | null {
  const target = url?.trim();
  if (!target) return null;
  try {
    return new URL(target).hostname;
  } catch {
    return null;
  }
}

function buildUnavailableFieldEdge(detail: string): FieldEdgeStatusData {
  return {
    available: false,
    stale: false,
    detail,
    source: "rk3568_field_link_monitor",
    generatedAt: null,
    currentBoundary: null,
    accepted: null,
    summary: null,
    nodes: [],
    soak: null
  };
}

function buildUnavailableHermesEdge(detail: string): HermesEdgeStatusData {
  return {
    available: false,
    stale: false,
    detail,
    source: "rk3568_hermes_edge_supervisor",
    generatedAt: null,
    boardHost: null,
    serviceActive: null,
    serviceEnabled: null,
    accepted: null,
    currentBoundary: null,
    modelLoaded: null,
    modelKey: null,
    modelVersion: null,
    modelType: null,
    modelTask: null,
    featureCount: null,
    aiModelCount: null,
    diagnosisType: null,
    confidence: null,
    confidenceLevel: null,
    naturalLanguageReady: null,
    intentCount: null,
    actionRecheckAccepted: null,
    actionRecheckStatus: null,
    safetyGatewayCoreTouched: null,
    safetySerialTouched: null,
    safetyMqttTouched: null,
    stress: null,
    volatilitySurface: null
  };
}

function buildHermesVolatilitySurface(input: {
  generatedAt: string | null;
  diagnosisType: string | null;
  confidence: number | null;
  supervisionFileJson: Record<string, unknown> | null;
  stressReport: Record<string, unknown> | null;
}): HermesEdgeVolatilitySurface {
  const horizonsMinutes = [0, 5, 15, 30, 60];
  const dimensions: HermesEdgeVolatilityDimension[] = [
    { key: "serial_link", label: "串口链路", unit: "vol-score" },
    { key: "mqtt_uplink", label: "MQTT 上行", unit: "vol-score" },
    { key: "spool_queue", label: "缓冲队列", unit: "vol-score" },
    { key: "data_freshness", label: "数据新鲜度", unit: "vol-score" },
    { key: "parser_quality", label: "解析质量", unit: "vol-score" },
    { key: "node_fleet", label: "节点状态", unit: "vol-score" },
    { key: "resource_pressure", label: "资源压力", unit: "vol-score" },
    { key: "hermes_task_queue", label: "Hermes 任务队列", unit: "vol-score" }
  ];
  const diagnosis = input.diagnosisType ?? "unknown";
  const normalizedDiagnosis = diagnosis.toLowerCase();
  const modelConfidence = input.confidence == null ? null : clamp(input.confidence, 0, 1);
  const confidenceBoost = modelConfidence == null ? 0.72 : 0.55 + modelConfidence * 0.45;
  const source = asRecord(input.supervisionFileJson?.source);
  const localResources = asRecord(input.supervisionFileJson?.localResources);
  const summary = asRecord(input.supervisionFileJson?.summary);
  const stressSummary = asRecord(input.stressReport?.summary);
  const stressLatency = asRecord(stressSummary?.latency);
  const taskCount = readNumber(summary?.taskCount) ?? 0;
  const blockedCount = readNumber(summary?.blockedCount) ?? 0;
  const recommendedCount = readNumber(summary?.recommendedCount) ?? 0;
  const automationAgeSeconds = readNumber(source?.automationAgeSeconds) ?? 0;
  const summaryAgeSeconds = readNumber(source?.summaryAgeSeconds) ?? 0;
  const sourceErrorPenalty = source?.automationError || source?.summaryError ? 42 : 0;
  const memAvailableRatio = readNumber(localResources?.memAvailableRatio);
  const diskFreeRatio = readNumber(localResources?.diskFreeRatio);
  const load1 = readNumber(localResources?.load1) ?? 0;
  const maxTemperatureC = readNumber(localResources?.maxTemperatureC) ?? 0;
  const stressErrorRate = readNumber(stressSummary?.errorRate) ?? 0;
  const stressP95Ms = readNumber(stressLatency?.p95Ms) ?? 0;
  const stressP99Ms = readNumber(stressLatency?.p99Ms) ?? 0;
  const overallLevel = readString(summary?.overallLevel);
  const criticalBoost = overallLevel === "critical" ? 18 : overallLevel === "attention" ? 10 : 0;

  const baseByDimension: Record<string, { base: number; driver: string }> = {
    serial_link: {
      base: 22 + criticalBoost + (normalizedDiagnosis.includes("serial") ? 44 : 0),
      driver: normalizedDiagnosis.includes("serial") ? "model_diagnosis" : "southbound_guard"
    },
    mqtt_uplink: {
      base: 24 + criticalBoost + (normalizedDiagnosis.includes("mqtt") ? 52 : 0) + stressErrorRate * 100,
      driver: normalizedDiagnosis.includes("mqtt") ? "model_diagnosis" : "uplink_health"
    },
    spool_queue: {
      base: 18 + recommendedCount * 5 + blockedCount * 9,
      driver: "task_backlog"
    },
    data_freshness: {
      base: 14 + Math.min(44, Math.max(automationAgeSeconds, summaryAgeSeconds) / 3) + sourceErrorPenalty,
      driver: "source_freshness"
    },
    parser_quality: {
      base: 16 + (normalizedDiagnosis.includes("parse") || normalizedDiagnosis.includes("schema") ? 48 : 0),
      driver: "parser_signal"
    },
    node_fleet: {
      base: 20 + taskCount * 4 + blockedCount * 8 + criticalBoost,
      driver: "node_task_state"
    },
    resource_pressure: {
      base:
        12 +
        (memAvailableRatio == null ? 8 : (1 - memAvailableRatio) * 55) +
        (diskFreeRatio == null ? 5 : (1 - diskFreeRatio) * 35) +
        Math.max(0, load1 - 1) * 12 +
        Math.max(0, maxTemperatureC - 50) * 1.6,
      driver: "local_resource_pressure"
    },
    hermes_task_queue: {
      base: 18 + taskCount * 6 + blockedCount * 14 + Math.min(18, stressP95Ms / 12) + Math.min(12, stressP99Ms / 20),
      driver: "hermes_task_and_latency"
    }
  };

  const points = dimensions.flatMap((dimension, dimensionIndex) =>
    horizonsMinutes.map((horizon, horizonIndex) => {
      const shape =
        dimension.key === "resource_pressure"
          ? 0.82 + horizonIndex * 0.055
          : dimension.key === "mqtt_uplink"
            ? 1 - horizonIndex * 0.055
            : dimension.key === "hermes_task_queue"
              ? 0.92 + Math.sin((horizonIndex + dimensionIndex) / 2) * 0.08
              : 0.94 - horizonIndex * 0.035 + Math.sin((dimensionIndex + 1) * (horizonIndex + 1)) * 0.035;
      const base = baseByDimension[dimension.key]?.base ?? 20;
      const volatilityScore = roundMetric(clamp(base * confidenceBoost * shape, 0, 100), 2);
      return {
        horizonMinutes: horizon,
        dimensionKey: dimension.key,
        volatilityScore,
        confidence: modelConfidence,
        diagnosisType: input.diagnosisType,
        driver: baseByDimension[dimension.key]?.driver ?? "derived"
      };
    })
  );

  const peak = points.reduce<HermesEdgeVolatilityPoint | null>(
    (current, point) => (!current || point.volatilityScore > current.volatilityScore ? point : current),
    null
  );

  return {
    generatedAt: input.generatedAt,
    surfaceType: "edge_health_volatility_surface",
    method: "derived_from_hermes_rf_diagnosis_source_freshness_resource_pressure_and_stress_latency",
    horizonsMinutes,
    dimensions,
    points,
    peakScore: peak?.volatilityScore ?? null,
    peakDimensionKey: peak?.dimensionKey ?? null,
    peakHorizonMinutes: peak?.horizonMinutes ?? null,
    modelConfidence,
    note: "该曲面用于展示 Hermes 端侧模型对串口链路、MQTT 上行、数据新鲜度、解析质量、节点状态和资源压力的多维健康不稳定性评估。"
  };
}

function parseFieldEdgeNodes(input: unknown, deferredNodeIds: string[] = []): FieldEdgeNodeStatus[] {
  if (!Array.isArray(input)) return [];
  const now = Date.now();
  const deferredSet = new Set(deferredNodeIds.map((value) => value.toLowerCase()));
  return input
    .map((value) => {
      const row = asRecord(value);
      if (!row) return null;
      const fieldNodeId = readString(row.fieldNodeId);
      const deviceId = readString(row.deviceId);
      if (!fieldNodeId || !deviceId) return null;
      const enabled = readBoolean(row.enabled);
      const deferred =
        enabled === false || deferredSet.has(fieldNodeId.toLowerCase()) || deferredSet.has(deviceId.toLowerCase());
      const lastTelemetryAgeMs = readNumber(row.lastTelemetryAgeMs);
      const lastAckAgeMs = readNumber(row.lastAckAgeMs);
      const lastTelemetryTsAgeMs = readIsoAgeMs(readString(row.lastTelemetryTs), now);
      const lastAckTsAgeMs = readIsoAgeMs(readString(row.lastAckTs), now);
      const lastTelemetryAgeSeconds =
        readNumber(row.lastTelemetryAgeSeconds) ??
        (lastTelemetryAgeMs == null ? null : Math.round(lastTelemetryAgeMs / 1000)) ??
        (lastTelemetryTsAgeMs == null ? null : Math.round(lastTelemetryTsAgeMs / 1000));
      const lastAckAgeSeconds =
        readNumber(row.lastAckAgeSeconds) ??
        (lastAckAgeMs == null ? null : Math.round(lastAckAgeMs / 1000)) ??
        (lastAckTsAgeMs == null ? null : Math.round(lastAckTsAgeMs / 1000));
      return {
        fieldNodeId,
        deviceId,
        installLabel: readString(row.installLabel) ?? fieldNodeId,
        enabled,
        deferred,
        status: readString(row.status) ?? "unknown",
        telemetryMessages: readNumber(row.telemetryMessages),
        commandForwards: readNumber(row.commandForwards),
        ackPublishes: readNumber(row.ackPublishes),
        lastTelemetryAgeSeconds,
        lastAckAgeSeconds
      } satisfies FieldEdgeNodeStatus;
    })
    .filter((value): value is FieldEdgeNodeStatus => value !== null);
}

function parseFieldEdgeNodesFromMonitorDimensions(input: unknown): FieldEdgeNodeStatus[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((value): FieldEdgeNodeStatus | null => {
      const row = asRecord(value);
      const key = readString(row?.key);
      if (!row || !key?.startsWith("node_")) return null;
      const evidence = asRecord(row.evidence);
      const deviceId = readString(evidence?.deviceId);
      if (!deviceId) return null;
      const fieldNodeId = readString(evidence?.fieldNodeId) ?? key.slice("node_".length).toUpperCase();
      return {
        fieldNodeId,
        deviceId,
        installLabel: readString(evidence?.installLabel) ?? fieldNodeId,
        enabled: readBoolean(evidence?.enabled),
        deferred: false,
        status: readString(evidence?.status) ?? "unknown",
        telemetryMessages: readNumber(evidence?.telemetryMessages),
        commandForwards: readNumber(evidence?.commandForwards),
        ackPublishes: readNumber(evidence?.ackPublishes),
        lastTelemetryAgeSeconds: readNumber(evidence?.lastTelemetryAgeSeconds),
        lastAckAgeSeconds: readNumber(evidence?.lastAckAgeSeconds)
      } satisfies FieldEdgeNodeStatus;
    })
    .filter((value): value is FieldEdgeNodeStatus => value !== null);
}

function buildFieldEdgeStatusFromMonitorReport(report: Record<string, unknown>, detail: string): FieldEdgeStatusData {
  const now = Date.now();
  const generatedAt = readString(report.generatedAt);
  const ageMs = readIsoAgeMs(generatedAt, now);
  const stale = ageMs != null && ageMs > FIELD_EDGE_REPORT_STALE_MS;
  const summary = asRecord(report.summary);
  const dimensions = Array.isArray(report.dimensions) ? report.dimensions : [];

  return {
    available: !stale,
    stale,
    detail: stale ? "RK3568 field-link-monitor 实时摘要已过期，等待边缘侧刷新" : detail,
    source: "rk3568_field_link_monitor",
    generatedAt,
    currentBoundary: readString(report.currentBoundary),
    accepted: readBoolean(report.accepted),
    summary: summary
      ? {
          overallLevel: readString(summary.overallLevel),
          score: readNumber(summary.score),
          deferredNodeIds: readStringArray(summary.deferredNodeIds),
          networkMode: readString(summary.networkMode),
          serialOpen: readBoolean(summary.serialOpen),
          mqttConnected: readBoolean(summary.mqttConnected),
          portStatus: readString(summary.portStatus),
          spoolPending: readNumber(summary.spoolPending),
          rejectedMessages: readNumber(summary.rejectedMessages),
          lastPublishedAgeSeconds: readNumber(summary.lastPublishedAgeSeconds)
        }
      : null,
    nodes: parseFieldEdgeNodesFromMonitorDimensions(dimensions),
    soak: null
  };
}

async function buildFieldEdgeStatusData(config: AppConfig): Promise<FieldEdgeStatusData> {
  const liveMonitorReport = await readJsonHttp(config.rk3568FieldLinkMonitorUrl, config.rk3568StatusHttpTimeoutMs);
  if (liveMonitorReport) {
    return buildFieldEdgeStatusFromMonitorReport(liveMonitorReport, "已连接 RK3568 field-link-monitor 实时状态口");
  }

  const repoRoot = repoRootFromHere();
  const edgeLinkQualityPath = path.join(repoRoot, "docs", "unified", "reports", "field-rk3568-edge-link-quality-latest.json");
  const legacyFieldLinkPath = path.join(repoRoot, "docs", "unified", "reports", "field-rk3568-field-link-monitor-latest.json");
  const gatewayRuntimePath = path.join(repoRoot, "docs", "unified", "reports", "field-rk3568-gateway-runtime-latest.json");
  const centerSoakPath = path.join(repoRoot, "docs", "unified", "reports", "field-rk3568-center-soak-latest.json");

  const [edgeLinkQualityReport, legacyFieldLinkReport, gatewayRuntimeReport, centerSoakReport] = await Promise.all([
    readJsonArtifact(edgeLinkQualityPath),
    readJsonArtifact(legacyFieldLinkPath),
    readJsonArtifact(gatewayRuntimePath),
    readJsonArtifact(centerSoakPath)
  ]);

  const primaryReport = edgeLinkQualityReport ?? legacyFieldLinkReport;
  if (!primaryReport) {
    return buildUnavailableFieldEdge("暂未读取到 RK3568 最新链路证据文件");
  }

  const now = Date.now();
  const generatedAt = readString(primaryReport.generatedAt);
  const ageMs = readIsoAgeMs(generatedAt, now);
  const stale = ageMs != null && ageMs > FIELD_EDGE_REPORT_STALE_MS;
  const summaryRoot = edgeLinkQualityReport
    ? asRecord(edgeLinkQualityReport.summary)
    : asRecord(legacyFieldLinkReport?.summaryFileJson) ?? asRecord(legacyFieldLinkReport?.httpSummary);
  const summary = edgeLinkQualityReport ? summaryRoot : asRecord(summaryRoot?.summary);

  const runtimeHealth = asRecord(gatewayRuntimeReport?.runtimeHealth);
  const runtimeSerial = asRecord(runtimeHealth?.serial);
  const runtimeMqtt = asRecord(runtimeHealth?.mqtt);
  const southbound = asRecord(runtimeHealth?.southbound);
  const soakSummary = asRecord(centerSoakReport?.summary);
  const deferredNodeIds = readStringArray(summary?.deferredNodeIds);

  const nodes = parseFieldEdgeNodes(southbound?.nodes, deferredNodeIds);

  return {
    available: !stale,
    stale,
    detail: stale
      ? "RK3568 链路证据已过期，当前显示最后一次可用摘要"
      : edgeLinkQualityReport
        ? "已载入最新 RK3568 边缘链路质量证据"
        : "已载入 RK3568 旧版 field-link 链路证据",
    source: "rk3568_field_link_monitor",
    generatedAt,
    currentBoundary: readString(primaryReport.currentBoundary),
    accepted: readBoolean(primaryReport.accepted),
    summary: summary
      ? {
          overallLevel: readString(summary.overallLevel),
          score: readNumber(summary.score),
          deferredNodeIds,
          networkMode: readString(summary.networkMode),
          serialOpen: readBoolean(summary.serialOpen) ?? readBoolean(runtimeSerial?.open),
          mqttConnected: readBoolean(summary.mqttConnected) ?? readBoolean(runtimeMqtt?.connected),
          portStatus: readString(summary.portStatus),
          spoolPending: readNumber(summary.spoolPending),
          rejectedMessages: readNumber(summary.rejectedMessages),
          lastPublishedAgeSeconds: readNumber(summary.lastPublishedAgeSeconds)
        }
      : null,
    nodes,
    soak: centerSoakReport
      ? {
          generatedAt: readString(centerSoakReport.generatedAt),
          accepted: readBoolean(centerSoakReport.accepted),
          currentBoundary: readString(centerSoakReport.currentBoundary),
          cleanWindowRounds: readNumber(soakSummary?.cleanWindowRounds),
          allAcked: readBoolean(soakSummary?.allAcked),
          maxBoardObservationSchemaRejectedDelta: readNumber(soakSummary?.maxBoardObservationSchemaRejectedDelta)
        }
      : null
  };
}

async function buildCenterDerivedFieldEdgeNodes(pg: PgPool | null): Promise<FieldEdgeNodeStatus[]> {
  if (!pg) return [];

  const rows = await withPgClient(pg, async (client) => {
    const res = await client.query<{
      device_id: string;
      device_name: string;
      device_status: string;
      metadata: unknown;
      last_seen_at: string | null;
      command_forwards: string;
      ack_publishes: string;
      last_ack_at: string | null;
    }>(
      `
        SELECT
          d.device_id::text AS device_id,
          d.device_name,
          d.status AS device_status,
          d.metadata,
          to_char(d.last_seen_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS last_seen_at,
          count(dc.command_id) FILTER (WHERE dc.sent_at IS NOT NULL)::text AS command_forwards,
          count(dc.command_id) FILTER (WHERE dc.acked_at IS NOT NULL)::text AS ack_publishes,
          to_char(max(dc.acked_at) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS last_ack_at
        FROM devices d
        LEFT JOIN device_commands dc ON dc.device_id = d.device_id
        WHERE ${formalDevicePredicate("d")}
        GROUP BY d.device_id, d.device_name, d.status, d.metadata, d.last_seen_at
        ORDER BY d.last_seen_at DESC NULLS LAST, d.created_at DESC
        LIMIT 50
      `
    );
    return res.rows;
  });

  const now = Date.now();
  return rows.map((row) => {
    const metadata = asRecord(row.metadata);
    const nodeCode = readString(metadata?.nodeCode) ?? readString(metadata?.node_code);
    const displayName =
      readString(metadata?.installLabel) ??
      readString(metadata?.install_label) ??
      readString(metadata?.displayName) ??
      readString(metadata?.display_name);
    const lastTelemetryAgeSeconds = readIsoAgeMs(row.last_seen_at, now);
    const lastAckAgeSeconds = readIsoAgeMs(row.last_ack_at, now);
    const telemetryAgeSeconds =
      lastTelemetryAgeSeconds == null ? null : Math.round(lastTelemetryAgeSeconds / 1000);
    const ackAgeSeconds = lastAckAgeSeconds == null ? null : Math.round(lastAckAgeSeconds / 1000);
    const status =
      row.device_status === "revoked"
        ? "offline"
        : telemetryAgeSeconds == null
          ? "unknown"
          : telemetryAgeSeconds <= 15 * 60
            ? "online"
            : telemetryAgeSeconds <= 60 * 60
              ? "degraded"
              : "offline";

    return {
      fieldNodeId: nodeCode ?? row.device_name,
      deviceId: row.device_id,
      installLabel: displayName ?? nodeCode ?? row.device_name,
      enabled: null,
      deferred: false,
      status,
      telemetryMessages: null,
      commandForwards: Number(row.command_forwards),
      ackPublishes: Number(row.ack_publishes),
      lastTelemetryAgeSeconds: telemetryAgeSeconds,
      lastAckAgeSeconds: ackAgeSeconds
    } satisfies FieldEdgeNodeStatus;
  });
}

function buildCenterDerivedFieldEdgeStatus(base: FieldEdgeStatusData, nodes: FieldEdgeNodeStatus[]): FieldEdgeStatusData {
  const activeNodes = nodes.filter((node) => !node.deferred);
  const total = activeNodes.length || nodes.length;
  const onlineCount = activeNodes.filter((node) => node.status === "online").length;
  const degradedCount = activeNodes.filter((node) => node.status === "degraded").length;
  const offlineCount = activeNodes.filter((node) => node.status === "offline").length;
  const knownCount = onlineCount + degradedCount + offlineCount;
  const score =
    total > 0
      ? clamp(Math.round((onlineCount / total) * 100 - degradedCount * 10 - Math.max(0, total - knownCount) * 15), 0, 100)
      : null;
  const overallLevel =
    onlineCount === 0
      ? "critical"
      : offlineCount > 0
        ? "degraded"
        : degradedCount > 0
          ? "attention"
          : "healthy";
  const telemetryAges = nodes
    .map((node) => node.lastTelemetryAgeSeconds)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const freshestTelemetryAgeSeconds = telemetryAges.length > 0 ? Math.min(...telemetryAges) : null;

  return {
    ...base,
    available: onlineCount > 0,
    stale: false,
    detail: base.stale
      ? "RK3568 实时状态口暂不可达，已改用中心数据库实时推导现场节点状态；过期 artifact 不再作为当前状态展示。"
      : "RK3568 节点明细由中心数据库实时推导，用于补齐边缘侧摘要中的节点列表。",
    generatedAt: new Date().toISOString(),
    currentBoundary: base.currentBoundary ?? "center-derived-field-edge-status",
    accepted: onlineCount > 0,
    summary: {
      overallLevel,
      score,
      deferredNodeIds: base.summary?.deferredNodeIds ?? [],
      networkMode: base.summary?.networkMode ?? null,
      serialOpen: base.summary?.serialOpen ?? null,
      mqttConnected: base.summary?.mqttConnected ?? null,
      portStatus: base.summary?.portStatus ?? (onlineCount > 0 ? "online" : "offline"),
      spoolPending: base.summary?.spoolPending ?? null,
      rejectedMessages: base.summary?.rejectedMessages ?? null,
      lastPublishedAgeSeconds: base.summary?.lastPublishedAgeSeconds ?? freshestTelemetryAgeSeconds
    },
    nodes
  };
}

function buildHermesEdgeStatusFromReport(
  supervisorReport: Record<string, unknown>,
  stressReport: Record<string, unknown> | null,
  options: { detail: string; boardHost: string | null; live: boolean }
): HermesEdgeStatusData {
  const now = Date.now();
  const generatedAt = readString(supervisorReport.generatedAt);
  const ageMs = readIsoAgeMs(generatedAt, now);
  const stale = ageMs != null && ageMs > FIELD_EDGE_REPORT_STALE_MS;
  const httpSupervision = asRecord(supervisorReport.httpSupervision) ?? supervisorReport;
  const supervisionFileJson = asRecord(supervisorReport.supervisionFileJson) ?? httpSupervision;
  const derived = asRecord(supervisorReport.derived);
  const aiDiagnosis = asRecord(httpSupervision.aiDiagnosis);
  const actionInterface = asRecord(httpSupervision.actionInterface);
  const aiModels = Array.isArray(httpSupervision.aiModels) ? httpSupervision.aiModels : [];
  const firstModel = asRecord(aiModels[0]);
  const serviceState = asRecord(supervisorReport.serviceState);
  const isActive = asRecord(serviceState?.isActive);
  const isEnabled = asRecord(serviceState?.isEnabled);
  const stressSummary = asRecord(stressReport?.summary);
  const stressLatency = asRecord(stressSummary?.latency);
  const stressEndpoints = asRecord(stressReport?.endpoints);
  const stressRecheck = asRecord(stressEndpoints?.recheck);
  const featureVector = asRecord(aiDiagnosis?.featureVector);
  const supportedActions = Array.isArray(actionInterface?.supportedActions) ? actionInterface.supportedActions : [];

  return {
    available: !stale,
    stale,
    detail: stale ? "RK3568 Hermes 端侧 AI 诊断实时摘要已过期，等待边缘侧刷新" : options.detail,
    source: "rk3568_hermes_edge_supervisor",
    generatedAt,
    boardHost: readString(supervisorReport.boardHost) ?? options.boardHost,
    serviceActive: options.live ? true : readString(isActive?.stdout) === "active",
    serviceEnabled: options.live ? null : readString(isEnabled?.stdout) === "enabled",
    accepted: readBoolean(supervisorReport.accepted) ?? readBoolean(httpSupervision.accepted),
    currentBoundary: readString(supervisorReport.currentBoundary) ?? readString(httpSupervision.currentBoundary),
    modelLoaded: readBoolean(derived?.modelLoaded) ?? readBoolean(aiDiagnosis?.modelLoaded),
    modelKey: readString(aiDiagnosis?.modelKey) ?? readString(firstModel?.modelKey),
    modelVersion: readString(derived?.modelVersion) ?? readString(aiDiagnosis?.modelVersion) ?? readString(firstModel?.modelVersion),
    modelType: readString(aiDiagnosis?.modelType) ?? readString(firstModel?.modelType),
    modelTask: readString(firstModel?.task),
    featureCount:
      readNumber(derived?.featureCount) ??
      readNumber(firstModel?.featureCount) ??
      (featureVector ? Object.keys(featureVector).length : null),
    aiModelCount: readNumber(derived?.aiModelCount) ?? (aiModels.length > 0 ? aiModels.length : null),
    diagnosisType: readString(derived?.diagnosisType) ?? readString(aiDiagnosis?.diagnosisType),
    confidence: readNumber(derived?.confidence) ?? readNumber(aiDiagnosis?.confidence),
    confidenceLevel: readString(aiDiagnosis?.confidenceLevel),
    naturalLanguageReady: readBoolean(derived?.naturalLanguageReady) ?? readBoolean(actionInterface?.naturalLanguageReady),
    intentCount: readNumber(derived?.intentCount) ?? (supportedActions.length > 0 ? supportedActions.length : null),
    actionRecheckAccepted: readBoolean(derived?.actionRecheckAccepted),
    actionRecheckStatus: readString(derived?.actionRecheckStatus),
    safetyGatewayCoreTouched: readBoolean(derived?.actionSafetyGatewayCoreTouched),
    safetySerialTouched: readBoolean(derived?.actionSafetySerialTouched),
    safetyMqttTouched: readBoolean(derived?.actionSafetyMqttTouched),
    stress: stressReport
      ? {
          totalRequests: readNumber(stressSummary?.totalRequests),
          errorRate: readNumber(stressSummary?.errorRate),
          throughputRps: readNumber(stressSummary?.throughputRps),
          p95Ms: readNumber(stressLatency?.p95Ms),
          p99Ms: readNumber(stressLatency?.p99Ms),
          recheckOk: readNumber(stressRecheck?.ok)
        }
      : null,
    volatilitySurface: buildHermesVolatilitySurface({
      generatedAt,
      diagnosisType: readString(derived?.diagnosisType) ?? readString(aiDiagnosis?.diagnosisType),
      confidence: readNumber(derived?.confidence) ?? readNumber(aiDiagnosis?.confidence),
      supervisionFileJson,
      stressReport
    })
  };
}

async function buildHermesEdgeStatusData(config: AppConfig): Promise<HermesEdgeStatusData> {
  const repoRoot = repoRootFromHere();
  const supervisorReportPath = path.join(repoRoot, "docs", "unified", "reports", "rk3568-hermes-edge-supervisor-latest.json");
  const stressReportPath = path.join(repoRoot, "docs", "unified", "reports", "hermes-edge-supervisor-stress-latest.json");
  const [liveSupervisorReport, supervisorReport, stressReport] = await Promise.all([
    readJsonHttp(config.rk3568HermesEdgeSupervisorUrl, config.rk3568StatusHttpTimeoutMs),
    readJsonArtifact(supervisorReportPath),
    readJsonArtifact(stressReportPath)
  ]);

  if (liveSupervisorReport) {
    return buildHermesEdgeStatusFromReport(liveSupervisorReport, stressReport, {
      detail: "已连接 RK3568 Hermes 端侧 AI 诊断实时状态口",
      boardHost: hostFromUrl(config.rk3568HermesEdgeSupervisorUrl),
      live: true
    });
  }

  if (!supervisorReport) {
    return buildUnavailableHermesEdge("暂未读取到 RK3568 Hermes 端侧 AI 诊断状态");
  }

  const generatedAt = readString(supervisorReport.generatedAt);
  const ageMs = readIsoAgeMs(generatedAt);
  const stale = ageMs != null && ageMs > FIELD_EDGE_REPORT_STALE_MS;
  if (stale) {
    return buildUnavailableHermesEdge("RK3568 Hermes 实时状态口暂不可达，已隐藏过期本地摘要；等待边缘侧重新暴露/刷新状态口。");
  }

  return buildHermesEdgeStatusFromReport(supervisorReport, stressReport, {
    detail: "已载入 RK3568 Hermes 本地摘要",
    boardHost: readString(supervisorReport.boardHost) ?? hostFromUrl(config.rk3568HermesEdgeSupervisorUrl),
    live: false
  });
}

function buildSystemStatusItems(postgres: SystemCheck, clickhouse: SystemCheck, kafka: SystemCheck): SystemStatusItem[] {
  return [
    {
      key: "postgres",
      label: "PostgreSQL",
      status: healthStateFromCheck(postgres),
      detail: detailFromCheck(postgres)
    },
    {
      key: "clickhouse",
      label: "ClickHouse",
      status: healthStateFromCheck(clickhouse),
      detail: detailFromCheck(clickhouse)
    },
    {
      key: "kafka",
      label: "Kafka",
      status: healthStateFromCheck(kafka),
      detail: detailFromCheck(kafka)
    }
  ];
}

async function buildSystemStatusData(
  config: AppConfig,
  ch: ClickHouseClient,
  pg: PgPool | null
): Promise<SystemStatusData> {
  const postgres = await checkPostgres(pg);
  const clickhouse = await checkClickhouse(ch);
  const kafka: SystemCheck = { status: config.kafkaBrokers && config.kafkaBrokers.length > 0 ? "configured" : "not_configured" };
  const [fieldEdgeRaw, hermesEdge] = await Promise.all([buildFieldEdgeStatusData(config), buildHermesEdgeStatusData(config)]);
  const centerDerivedNodes =
    fieldEdgeRaw.nodes.length === 0 || fieldEdgeRaw.stale ? await buildCenterDerivedFieldEdgeNodes(pg) : [];
  const fieldEdge =
    (fieldEdgeRaw.nodes.length === 0 || fieldEdgeRaw.stale) && centerDerivedNodes.length > 0
      ? buildCenterDerivedFieldEdgeStatus(fieldEdgeRaw, centerDerivedNodes)
      : fieldEdgeRaw;

  return {
    uptimeS: Math.floor(process.uptime()),
    postgres,
    clickhouse,
    kafka,
    emqx: { status: "unknown" },
    source: "health_summary",
    note: "当前展示的是服务健康摘要，不表示真实 CPU/内存/磁盘占用。",
    items: buildSystemStatusItems(postgres, clickhouse, kafka),
    fieldEdge,
    hermesEdge
  };
}

async function queryTodayDataCount(
  config: AppConfig,
  ch: ClickHouseClient,
  pg: PgPool | null,
  start: Date,
  end: Date
): Promise<number> {
  try {
    if (!pg) return 0;
    const formalIds = await withPgClient(pg, async (client) => {
      const res = await client.query<{ device_id: string }>(
        `SELECT device_id::text AS device_id FROM devices WHERE ${formalDevicePredicate("devices")}`
      );
      return res.rows.map((row) => row.device_id);
    });
    if (formalIds.length === 0) return 0;
    const res = await ch.query({
      query: `
        SELECT toUInt64(count()) AS c
        FROM ${config.clickhouseDatabase}.${config.clickhouseTable}
        WHERE received_ts >= toDateTime64({start:String}, 3, 'UTC')
          AND received_ts < toDateTime64({end:String}, 3, 'UTC')
          AND device_id IN {deviceIds:Array(String)}
      `,
      query_params: {
        start: toClickhouseDateTime64Utc(start),
        end: toClickhouseDateTime64Utc(end),
        deviceIds: formalIds
      },
      format: "JSONEachRow"
    });
    const rows: { c: number | string }[] = await res.json();
    const value = rows[0]?.c;
    return typeof value === "string" ? Number(value) : value ?? 0;
  } catch {
    return 0;
  }
}

async function buildDashboardSummaryData(
  config: AppConfig,
  ch: ClickHouseClient,
  pg: PgPool
): Promise<DashboardSummaryData> {
  const now = new Date();
  const start = beijingStartOfDayUtc(now);
  const todayDataCount = await queryTodayDataCount(config, ch, pg, start, now);
  const freshThreshold = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const data = await withPgClient(pg, async (client) => {
    const devices = await client.query<{ status: string; count: string }>(
      `
        SELECT status, count(*)::text AS count
        FROM devices
        WHERE ${formalDevicePredicate("devices")}
        GROUP BY status
      `
    );
    const onlineDevices = await queryOne<{ count: string }>(
      client,
      `
        SELECT count(*)::text AS count
        FROM devices
        WHERE status != 'revoked'
          AND ${formalDevicePredicate("devices")}
          AND last_seen_at IS NOT NULL
          AND last_seen_at >= $1
      `,
      [freshThreshold]
    );
    const freshDevices = await queryOne<{ count: string }>(
      client,
      `
        SELECT count(*)::text AS count
        FROM devices
        WHERE status != 'revoked'
          AND ${formalDevicePredicate("devices")}
          AND last_seen_at IS NOT NULL
          AND last_seen_at >= $1
      `,
      [freshThreshold]
    );
    const stations = await queryOne<{ count: string }>(
      client,
      `
        SELECT count(DISTINCT station_id)::text AS count
        FROM devices
        WHERE status != 'revoked'
          AND station_id IS NOT NULL
          AND ${formalDevicePredicate("devices")}
      `,
      []
    );

    const alerts = await client.query<{ status: string; severity: string; count: string }>(
      `
        WITH latest AS (
          SELECT DISTINCT ON (alert_id)
            alert_id,
            device_id,
            event_type,
            severity,
            created_at AS last_event_at
          FROM alert_events
          WHERE device_id IN (
            SELECT device_id
            FROM devices
            WHERE ${formalDevicePredicate("devices")}
          )
          ORDER BY alert_id, created_at DESC
        ),
        a AS (
          SELECT
            alert_id,
            CASE
              WHEN event_type IN ('ALERT_TRIGGER','ALERT_UPDATE') THEN 'active'
              WHEN event_type = 'ALERT_ACK' THEN 'acked'
              ELSE 'resolved'
            END AS status,
            severity
          FROM latest
        )
        SELECT status, severity, count(*)::text AS count
        FROM a
        GROUP BY status, severity
      `
    );
    const todayAlerts = await queryOne<{ count: string }>(
      client,
      `
        SELECT count(DISTINCT alert_id)::text AS count
        FROM alert_events
        WHERE created_at >= $1
          AND created_at < $2
          AND device_id IN (
            SELECT device_id
            FROM devices
            WHERE ${formalDevicePredicate("devices")}
          )
          AND event_type IN ('ALERT_TRIGGER', 'ALERT_UPDATE')
      `,
      [start, now]
    );

    return {
      devices: devices.rows,
      onlineDevices: Number(onlineDevices?.count ?? "0"),
      freshDevices: Number(freshDevices?.count ?? "0"),
      stations: Number(stations?.count ?? "0"),
      todayAlerts: Number(todayAlerts?.count ?? "0"),
      alerts: alerts.rows
    };
  });

  const deviceCounts: Record<string, number> = {};
  for (const row of data.devices) deviceCounts[row.status] = Number(row.count);
  const totalDevices = Math.max(0, (deviceCounts.active ?? 0) + (deviceCounts.inactive ?? 0));
  const onlineDevices = data.onlineDevices;
  const offlineDevices = Math.max(0, totalDevices - onlineDevices);

  const alertsBySeverity: Record<"low" | "medium" | "high" | "critical", number> = {
    low: 0,
    medium: 0,
    high: 0,
    critical: 0
  };
  let pendingAlerts = 0;
  for (const row of data.alerts) {
    const count = Number(row.count);
    if (row.status === "active" || row.status === "acked") pendingAlerts += count;
    if (row.status === "active" || row.status === "acked") {
      const severity = row.severity as keyof typeof alertsBySeverity;
      alertsBySeverity[severity] += count;
    }
  }

  return {
    todayDataCount,
    onlineDevices,
    offlineDevices,
    pendingAlerts,
    todayAlerts: data.todayAlerts,
    alertsBySeverity,
    stations: data.stations,
    freshDevices: data.freshDevices,
    totalDevices,
    lastUpdatedAt: now.toISOString()
  };
}

function buildDeskDashboardSummary(summary: DashboardSummaryData): DeskDashboardSummaryData {
  const totalDevices = Math.max(1, summary.totalDevices);
  const availability = summary.onlineDevices / totalDevices;
  const freshness = summary.freshDevices / totalDevices;

  const weightedRiskLoad =
    (summary.alertsBySeverity.low * 0.05) +
    (summary.alertsBySeverity.medium * 0.1) +
    (summary.alertsBySeverity.high * 0.18) +
    (summary.alertsBySeverity.critical * 0.28);
  const riskScore = Math.max(0, 1 - Math.min(0.8, weightedRiskLoad));

  const healthScore = availability * 0.4 + freshness * 0.2 + riskScore * 0.4;

  return {
    stationCount: summary.stations,
    deviceOnlineCount: summary.onlineDevices,
    alertCountToday: summary.todayAlerts,
    systemHealthPercent: Math.max(0, Math.min(100, Math.round(healthScore * 100)))
  };
}

async function buildDashboardWeeklyTrendData(
  config: AppConfig,
  ch: ClickHouseClient,
  pg: PgPool | null
): Promise<DashboardWeeklyTrendData> {
  const now = new Date();
  const start = utcStartOfDay(new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000));
  const end = utcTomorrowStart(now);
  const dayKeys = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(start.getTime() + index * 24 * 60 * 60 * 1000);
    return day.toISOString().slice(0, 10);
  });

  const rainfallByDay = new Map<string, number>();
  const alertCountByDay = new Map<string, number>();
  const noteParts = ["近 7 天按 telemetry `rainfall_mm` 与 `alert_events` 聚合生成，缺失日补 0。"];
  let formalIds: string[] = [];

  if (pg) {
    try {
      formalIds = await withPgClient(pg, async (client) => {
        const res = await client.query<{ device_id: string }>(
          `SELECT device_id::text AS device_id FROM devices WHERE ${formalDevicePredicate("devices")}`
        );
        return res.rows.map((row) => row.device_id);
      });
    } catch {
      noteParts.push("formal device registry 读取失败时已回退为空集合。");
    }
  }

  if (formalIds.length > 0) {
    try {
      const quotedIds = formalIds.map((deviceId) => `'${deviceId}'`).join(",");
      const res = await ch.query({
        query: `
          SELECT
            formatDateTime(toStartOfDay(received_ts), '%F', 'UTC') AS day,
            sum(COALESCE(value_f64, toFloat64(value_i64))) AS rainfall
          FROM ${config.clickhouseDatabase}.${config.clickhouseTable}
          WHERE received_ts >= {start:DateTime64(3, 'UTC')}
            AND received_ts < {end:DateTime64(3, 'UTC')}
            AND sensor_key = 'rainfall_mm'
            AND device_id IN (${quotedIds})
          GROUP BY day
          ORDER BY day
        `,
        query_params: { start: toClickhouseDateTime64Utc(start), end: toClickhouseDateTime64Utc(end) },
        format: "JSONEachRow"
      });
      const rows: { day: string; rainfall: number | string | null }[] = await res.json();
      for (const row of rows) {
        const value = typeof row.rainfall === "string" ? Number(row.rainfall) : row.rainfall ?? 0;
        rainfallByDay.set(row.day, Number(value.toFixed(2)));
      }
    } catch {
      noteParts.push("雨量聚合失败时已回退为 0。");
    }
  } else {
    noteParts.push("当前无 formal device telemetry，雨量聚合已回退为 0。");
  }

  if (!pg) {
    noteParts.push("未配置 PostgreSQL，告警数已回退为 0。");
  } else {
    try {
      const rows = await withPgClient(pg, async (client) => {
        const res = await client.query<{ day: string; alert_count: string }>(
          `
            SELECT
              to_char(date_trunc('day', created_at AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day,
              count(DISTINCT alert_id)::text AS alert_count
            FROM alert_events
            WHERE created_at >= $1
              AND created_at < $2
              AND device_id IN (
                SELECT device_id
                FROM devices
                WHERE ${formalDevicePredicate("devices")}
              )
              AND event_type IN ('ALERT_TRIGGER', 'ALERT_UPDATE')
            GROUP BY 1
            ORDER BY 1
          `,
          [start, end]
        );
        return res.rows;
      });
      for (const row of rows) {
        alertCountByDay.set(row.day, Number(row.alert_count));
      }
    } catch {
      noteParts.push("告警聚合失败时已回退为 0。");
    }
  }

  return {
    labels: dayKeys.map((day) => day.slice(5)),
    rainfallMm: dayKeys.map((day) => rainfallByDay.get(day) ?? 0),
    alertCount: dayKeys.map((day) => alertCountByDay.get(day) ?? 0),
    source: "derived_summary",
    note: noteParts.join(" ")
  };
}

function parseCommandTypeDefaults(
  raw: string | null | undefined
): CommandSuccessNotificationPolicy["commandTypeDefaults"] {
  if (!raw?.trim()) return { ...DEFAULT_COMMAND_SUCCESS_NOTIFICATION_POLICY.commandTypeDefaults };
  try {
    const parsed = JSON.parse(raw) as unknown;
    const checked = z.record(z.string().min(1), successNotificationPolicySchema).safeParse(parsed);
    if (!checked.success) return { ...DEFAULT_COMMAND_SUCCESS_NOTIFICATION_POLICY.commandTypeDefaults };
    return checked.data;
  } catch {
    return { ...DEFAULT_COMMAND_SUCCESS_NOTIFICATION_POLICY.commandTypeDefaults };
  }
}

async function loadCommandSuccessNotificationPolicy(client: PoolClient): Promise<CommandSuccessNotificationPolicy> {
  const rows = await client.query<{ config_key: string; config_value: string | null }>(
    `
      SELECT config_key, config_value
      FROM system_configs
      WHERE config_key IN ($1, $2)
    `,
    [COMMAND_SUCCESS_NOTIFICATION_SYSTEM_DEFAULT_KEY, COMMAND_SUCCESS_NOTIFICATION_COMMAND_TYPE_DEFAULTS_KEY]
  );
  const byKey = new Map(rows.rows.map((row) => [row.config_key, row.config_value] as const));
  const systemDefaultParsed = successNotificationPolicySchema.safeParse(byKey.get(COMMAND_SUCCESS_NOTIFICATION_SYSTEM_DEFAULT_KEY));
  return {
    systemDefault: systemDefaultParsed.success
      ? systemDefaultParsed.data
      : DEFAULT_COMMAND_SUCCESS_NOTIFICATION_POLICY.systemDefault,
    commandTypeDefaults: parseCommandTypeDefaults(byKey.get(COMMAND_SUCCESS_NOTIFICATION_COMMAND_TYPE_DEFAULTS_KEY))
  };
}

async function saveCommandSuccessNotificationPolicy(
  client: PoolClient,
  input: CommandSuccessNotificationPolicy
): Promise<void> {
  await client.query(
    `
      INSERT INTO system_configs (config_key, config_value, config_type, description, is_public)
      VALUES
        ($1, $2, 'string', '命令成功通知系统默认策略', FALSE),
        ($3, $4, 'json', '命令成功通知按 command_type 的默认策略表', FALSE)
      ON CONFLICT (config_key) DO UPDATE
      SET
        config_value = EXCLUDED.config_value,
        config_type = EXCLUDED.config_type,
        description = EXCLUDED.description,
        updated_at = NOW()
    `,
    [
      COMMAND_SUCCESS_NOTIFICATION_SYSTEM_DEFAULT_KEY,
      input.systemDefault,
      COMMAND_SUCCESS_NOTIFICATION_COMMAND_TYPE_DEFAULTS_KEY,
      JSON.stringify(input.commandTypeDefaults)
    ]
  );
}

export function registerSystemRoutes(
  app: FastifyInstance,
  config: AppConfig,
  ch: ClickHouseClient,
  pg: PgPool | null
): void {
  const adminCfg: AdminAuthConfig = { adminApiToken: config.adminApiToken, jwtEnabled: Boolean(config.jwtAccessSecret) };

  app.get("/system/configs", async (request, reply) => {
    const traceId = request.traceId;
    if (!pg) {
      fail(reply, 503, "PostgreSQL 未配置", traceId);
      return;
    }

    const rows = await withPgClient(pg, async (client) => {
      const res = await client.query<{
        config_key: string;
        config_value: string | null;
        config_type: string;
        description: string | null;
        updated_at: string;
      }>(
        `
          SELECT
            config_key,
            config_value,
            config_type,
            description,
            to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at
          FROM system_configs
          WHERE is_public = TRUE
          ORDER BY config_key
        `
      );
      return res.rows;
    });

    ok(
      reply,
      {
        list: rows.map((r) => ({
          key: r.config_key,
          value: r.config_value ?? "",
          type: r.config_type,
          description: r.description ?? "",
          updatedAt: r.updated_at
        }))
      },
      traceId
    );
  });

  app.put("/system/configs", async (request, reply) => {
    const traceId = request.traceId;
    if (!(await requirePermission(adminCfg, pg, request, reply, "system:config"))) return;
    if (!pg) {
      fail(reply, 503, "PostgreSQL 未配置", traceId);
      return;
    }

    const parseBody = updateConfigsSchema.safeParse(request.body);
    if (!parseBody.success) {
      fail(reply, 400, "参数错误", traceId, { field: "body", issues: parseBody.error.issues });
      return;
    }

    const unique = new Map<string, string>();
    for (const c of parseBody.data.configs) unique.set(c.key, c.value);
    const configs = Array.from(unique.entries()).map(([key, value]) => ({ key, value }));

    const updated = await withPgClient(pg, async (client) => {
      await client.query("BEGIN");
      try {
        const keys = configs.map((c) => c.key);
        const existing = await client.query<{ config_key: string }>(
          "SELECT config_key FROM system_configs WHERE config_key = ANY($1::text[])",
          [keys]
        );
        const exists = new Set(existing.rows.map((r) => r.config_key));
        const missing = keys.filter((k) => !exists.has(k));
        if (missing.length > 0) {
          await client.query("ROLLBACK");
          return { ok: false as const, missing };
        }

        for (const c of configs) {
          await client.query("UPDATE system_configs SET config_value=$1, updated_at=NOW() WHERE config_key=$2", [
            c.value,
            c.key
          ]);
        }

        await client.query("COMMIT");
        return { ok: true as const, updated: configs.length };
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    });

    if (!updated.ok) {
      fail(reply, 404, "资源不存在", traceId, { missingKeys: updated.missing });
      return;
    }

    void withPgClient(pg, async (client) => {
      await client.query(
        `
          INSERT INTO operation_logs (user_id, username, module, action, description, request_data, response_data, ip_address, user_agent, status)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `,
        [
          request.user?.userId ?? null,
          request.user?.username ?? "admin",
          "system",
          "update_configs",
          "update system configs",
          parseBody.data,
          { updated: updated.updated },
          request.ip,
          typeof request.headers["user-agent"] === "string" ? request.headers["user-agent"] : null,
          "success"
        ]
      );
    }).catch(() => undefined);

    ok(reply, { updated: updated.updated }, traceId);
  });

  app.get("/system/command-success-notification-policy", async (request, reply) => {
    const traceId = request.traceId;
    if (!(await requirePermission(adminCfg, pg, request, reply, "system:config"))) return;
    if (!pg) {
      fail(reply, 503, "PostgreSQL 未配置", traceId);
      return;
    }

    const policy = await withPgClient(pg, async (client) => loadCommandSuccessNotificationPolicy(client));
    ok(reply, policy, traceId);
  });

  app.put("/system/command-success-notification-policy", async (request, reply) => {
    const traceId = request.traceId;
    if (!(await requirePermission(adminCfg, pg, request, reply, "system:config"))) return;
    if (!pg) {
      fail(reply, 503, "PostgreSQL 未配置", traceId);
      return;
    }

    const parseBody = updateCommandSuccessNotificationPolicySchema.safeParse(request.body);
    if (!parseBody.success) {
      fail(reply, 400, "参数错误", traceId, { field: "body", issues: parseBody.error.issues });
      return;
    }

    const policy = parseBody.data;
    const previousPolicy = await withPgClient(pg, async (client) => loadCommandSuccessNotificationPolicy(client));
    await withPgClient(pg, async (client) => {
      await client.query("BEGIN");
      try {
        await saveCommandSuccessNotificationPolicy(client, policy);
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    });

    void withPgClient(pg, async (client) => {
      await client.query(
        `
          INSERT INTO operation_logs (user_id, username, module, action, description, request_data, response_data, ip_address, user_agent, status)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `,
        [
          request.user?.userId ?? null,
          request.user?.username ?? "admin",
          "system",
          "update_command_success_notification_policy",
          "update command success notification policy",
          { previousPolicy, nextPolicy: policy },
          { updatedPolicy: policy },
          request.ip,
          typeof request.headers["user-agent"] === "string" ? request.headers["user-agent"] : null,
          "success"
        ]
      );
    }).catch(() => undefined);

    ok(reply, policy, traceId);
  });

  app.get("/system/logs/operation", async (request, reply) => {
    const traceId = request.traceId;
    if (!(await requirePermission(adminCfg, pg, request, reply, "system:log"))) return;
    if (!pg) {
      fail(reply, 503, "PostgreSQL 未配置", traceId);
      return;
    }

    const parseQuery = operationLogsQuerySchema.safeParse(request.query);
    if (!parseQuery.success) {
      fail(reply, 400, "参数错误", traceId, { field: "query", issues: parseQuery.error.issues });
      return;
    }

    const { page, pageSize, userId, module, action, startTime, endTime } = parseQuery.data;
    const offset = (page - 1) * pageSize;

    const where: string[] = [];
    const params: unknown[] = [];
    const add = (sql: string, val: unknown) => {
      params.push(val);
      where.push(sql.replace("$X", "$" + String(params.length)));
    };

    if (userId) add("user_id = $X", userId);
    if (module) add("module = $X", module);
    if (action) add("action = $X", action);
    if (startTime) add("created_at >= $X", new Date(startTime));
    if (endTime) add("created_at <= $X", new Date(endTime));

    const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

    const data = await withPgClient(pg, async (client) => {
      const totalRow = await queryOne<{ total: string }>(
        client,
        `SELECT count(*)::text AS total FROM operation_logs ${whereSql}`,
        params
      );
      const total = Number(totalRow?.total ?? "0");

      const res = await client.query<{
        id: string;
        user_id: string | null;
        username: string | null;
        module: string;
        action: string;
        target_type: string | null;
        target_id: string | null;
        description: string | null;
        request_data: unknown;
        response_data: unknown;
        ip_address: string | null;
        user_agent: string | null;
        status: string;
        error_message: string | null;
        created_at: string;
      }>(
        `
          SELECT
            id::text AS id,
            user_id,
            username,
            module,
            action,
            target_type,
            target_id,
            description,
            request_data,
            response_data,
            ip_address,
            user_agent,
            status,
            error_message,
            to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at
          FROM operation_logs
          ${whereSql}
          ORDER BY created_at DESC, id DESC
          LIMIT $${String(params.length + 1)} OFFSET $${String(params.length + 2)}
        `,
        [...params, pageSize, offset]
      );

      return { total, rows: res.rows };
    });

    ok(
      reply,
      {
        page,
        pageSize,
        total: data.total,
        list: data.rows.map((r) => ({
          id: r.id,
          userId: r.user_id,
          username: r.username ?? "",
          module: r.module,
          action: r.action,
          targetType: r.target_type ?? "",
          targetId: r.target_id ?? "",
          description: r.description ?? "",
          requestData: r.request_data ?? null,
          responseData: r.response_data ?? null,
          ipAddress: r.ip_address ?? "",
          userAgent: r.user_agent ?? "",
          status: r.status,
          errorMessage: r.error_message ?? "",
          createdAt: r.created_at
        }))
      },
      traceId
    );
  });

  app.get("/system/logs/api-stats", async (request, reply) => {
    const traceId = request.traceId;
    if (!(await requirePermission(adminCfg, pg, request, reply, "system:log"))) return;
    if (!pg) {
      fail(reply, 503, "PostgreSQL 未配置", traceId);
      return;
    }

    const since = new Date(Date.now() - 24 * 3600 * 1000);

    const result = await withPgClient(pg, async (client) => {
      const totals = await queryOne<{
        total: string;
        s2xx: string;
        s3xx: string;
        s4xx: string;
        s5xx: string;
        avg_ms: string | null;
      }>(
        client,
        `
          SELECT
            count(*)::text AS total,
            count(*) FILTER (WHERE status_code >= 200 AND status_code < 300)::text AS s2xx,
            count(*) FILTER (WHERE status_code >= 300 AND status_code < 400)::text AS s3xx,
            count(*) FILTER (WHERE status_code >= 400 AND status_code < 500)::text AS s4xx,
            count(*) FILTER (WHERE status_code >= 500)::text AS s5xx,
            avg(response_time_ms)::text AS avg_ms
          FROM api_logs
          WHERE created_at >= $1
        `,
        [since]
      );

      const topPaths = await client.query<{
        method: string | null;
        path: string | null;
        c: string;
        p95_ms: string | null;
      }>(
        `
          SELECT
            method,
            path,
            count(*)::text AS c,
            percentile_cont(0.95) WITHIN GROUP (ORDER BY response_time_ms)::text AS p95_ms
          FROM api_logs
          WHERE created_at >= $1
          GROUP BY method, path
          ORDER BY count(*) DESC
          LIMIT 20
        `,
        [since]
      );

      return { totals, topPaths: topPaths.rows };
    });

    ok(
      reply,
      {
        since: since.toISOString(),
        total: Number(result.totals?.total ?? "0"),
        byStatus: {
          "2xx": Number(result.totals?.s2xx ?? "0"),
          "3xx": Number(result.totals?.s3xx ?? "0"),
          "4xx": Number(result.totals?.s4xx ?? "0"),
          "5xx": Number(result.totals?.s5xx ?? "0")
        },
        avgResponseTimeMs: result.totals?.avg_ms ? Number(result.totals.avg_ms) : null,
        topPaths: result.topPaths.map((r) => ({
          method: r.method ?? "",
          path: r.path ?? "",
          count: Number(r.c),
          p95ResponseTimeMs: r.p95_ms ? Number(r.p95_ms) : null
        }))
      },
      traceId
    );
  });

  app.get("/system/status", async (request, reply) => {
    const traceId = request.traceId;
    if (!(await requirePermission(adminCfg, pg, request, reply, "system:log"))) return;
    ok(reply, await buildSystemStatusData(config, ch, pg), traceId);
  });

  app.get("/dashboard", async (request, reply) => {
    const traceId = request.traceId;
    if (!(await requirePermission(adminCfg, pg, request, reply, "data:view"))) return;
    if (!pg) {
      fail(reply, 503, "PostgreSQL 未配置", traceId);
      return;
    }
    ok(reply, await buildDashboardSummaryData(config, ch, pg), traceId);
  });

  app.get("/dashboard/weekly-trend", async (request, reply) => {
    const traceId = request.traceId;
    if (!(await requirePermission(adminCfg, pg, request, reply, "data:view"))) return;
    ok(reply, await buildDashboardWeeklyTrendData(config, ch, pg), traceId);
  });
}

export function registerSystemLegacyCompatRoutes(
  app: FastifyInstance,
  config: AppConfig,
  ch: ClickHouseClient,
  pg: PgPool | null
): void {
  const adminCfg: AdminAuthConfig = { adminApiToken: config.adminApiToken, jwtEnabled: Boolean(config.jwtAccessSecret) };

  app.get("/system/status", async (request, reply) => {
    if (!(await requirePermission(adminCfg, pg, request, reply, "system:log"))) return;
    legacyOk(reply, await buildSystemStatusData(config, ch, pg));
  });

  app.get("/dashboard/summary", async (request, reply) => {
    const traceId = request.traceId;
    if (!(await requirePermission(adminCfg, pg, request, reply, "data:view"))) return;
    if (!pg) {
      fail(reply, 503, "PostgreSQL 未配置", traceId);
      return;
    }
    legacyOk(reply, buildDeskDashboardSummary(await buildDashboardSummaryData(config, ch, pg)));
  });

  app.get("/dashboard/weekly-trend", async (request, reply) => {
    if (!(await requirePermission(adminCfg, pg, request, reply, "data:view"))) return;
    legacyOk(reply, await buildDashboardWeeklyTrendData(config, ch, pg));
  });
}
