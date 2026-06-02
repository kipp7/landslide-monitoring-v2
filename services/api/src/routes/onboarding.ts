import type { ClickHouseClient } from "@clickhouse/client";
import type { FastifyInstance } from "fastify";
import type { PoolClient } from "pg";
import { z } from "zod";
import type { AppConfig } from "../config";
import { requirePermission, type AdminAuthConfig } from "../authz";
import { generateDeviceSecret, hashDeviceSecret } from "../device-secret";
import {
  deriveRegionCodeFromGatewayCode,
  deriveRegionCodeFromSlopeCode,
  deriveSlopeCodeFromStationCode,
  deriveStationCodeFromNodeCode,
  normalizeCanonicalCode,
  normalizeFreeText,
  validateFieldIdentityDraft,
} from "../field-identity";
import { fail, ok } from "../http";
import { enqueueOperationLog } from "../operation-log";
import type { PgPool } from "../postgres";
import { queryOne, withPgClient } from "../postgres";

type StationRow = {
  station_id: string;
  station_code: string;
  station_name: string;
  status: "active" | "inactive" | "maintenance";
  latitude: number | null;
  longitude: number | null;
  altitude: number | null;
  metadata: unknown;
  created_at: string;
  updated_at: string;
};

type DeviceRow = {
  device_id: string;
  device_name: string;
  device_type: string;
  station_id: string | null;
  status: "inactive" | "active" | "revoked";
  metadata: unknown;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
  station_code: string | null;
  station_name: string | null;
  station_metadata: unknown;
};

type BaselineRow = {
  device_id: string;
  device_name: string;
  method: "auto" | "manual";
  computed_at: string;
  baseline: unknown;
};

type AuditRow = {
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
};

type StationReadModel = {
  id: string;
  name: string;
  stationCode: string | null;
  stationName: string;
  displayName: string | null;
  regionCode: string | null;
  slopeCode: string | null;
  lifecycleStatus: string | null;
  area: string;
  risk: "low" | "mid" | "high";
  status: "online" | "offline" | "warning";
  lat: number;
  lng: number;
  deviceCount: number;
  metadata?: Record<string, unknown>;
};

type DeviceReadModel = {
  id: string;
  name: string;
  deviceName: string;
  legacyDeviceId: string;
  stationId: string;
  stationName: string;
  stationCode: string | null;
  displayName: string | null;
  installLabel: string | null;
  identityClass: string | null;
  deviceRole: string | null;
  lifecycleStatus: string | null;
  regionCode: string | null;
  slopeCode: string | null;
  nodeCode: string | null;
  gatewayCode: string | null;
  registryStatus: "inactive" | "active" | "revoked";
  type: "gnss" | "rain" | "tilt" | "temp_hum" | "camera";
  status: "online" | "offline" | "warning";
  lastSeenAt: string;
  createdAt?: string;
  updatedAt?: string;
  metadata?: Record<string, unknown>;
};

type PendingObservation = {
  deviceId: string;
  runtimeName: string;
  displayName: string;
  stationCode: string | null;
  installLabel: string | null;
  fieldNodeId: string | null;
  nodeCodeHint: string | null;
  gatewayCode: string | null;
  regionCode: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  lastSeq: number | null;
  observationSource: "registry_incomplete" | "runtime_observed_only";
  reason: string;
  sampleMetrics: {
    temperatureC: number | null;
    humidityPct: number | null;
    batteryPct: number | null;
    gpsLatitude: number | null;
    gpsLongitude: number | null;
    warningFlag: boolean | null;
  };
  status: "online" | "offline" | "warning";
};

type RuntimeObservedDeviceRow = {
  device_id: string;
  first_seen_at: string;
  last_seen_at: string;
  last_seq: number | null;
  temperature_c: number | null;
  humidity_pct: number | null;
  battery_pct_f64: number | null;
  battery_pct_i64: number | null;
  gps_latitude: number | null;
  gps_longitude: number | null;
  warning_flag: number | null;
};

type StationIdentityContext = {
  stationCode: string | null;
  regionCode: string | null;
  slopeCode: string | null;
  gatewayCode: string | null;
};

type StationIdentitySeedRow = {
  station_code: string | null;
  station_metadata: unknown;
  device_metadata: unknown;
};

const ONBOARDING_PENDING_LOOKBACK_DAYS = 30;
const ONBOARDING_PENDING_RUNTIME_LIMIT = 200;

function trimmedField(max: number) {
  return z
    .string()
    .transform((value) => normalizeFreeText(value))
    .pipe(z.string().min(1).max(max));
}

function canonicalCodeField(max: number) {
  return z
    .string()
    .transform((value) => normalizeCanonicalCode(value))
    .pipe(z.string().min(1).max(max));
}

const bindNewStationBaseSchema = z
  .object({
    stationCode: canonicalCodeField(50),
    stationName: trimmedField(100),
    displayName: trimmedField(100).optional(),
    regionCode: canonicalCodeField(80).optional(),
    slopeCode: canonicalCodeField(80).optional(),
    locationName: trimmedField(120).optional(),
    riskLevel: z.enum(["low", "mid", "high"]).optional(),
    lifecycleStatus: trimmedField(50).optional(),
    latitude: z.number().finite().optional(),
    longitude: z.number().finite().optional(),
    altitude: z.number().finite().optional(),
    gatewayCode: canonicalCodeField(100).optional(),
  })
  .strict();

type BindNewStationInput = z.infer<typeof bindNewStationBaseSchema>;

const bindNewStationSchema = bindNewStationBaseSchema.superRefine((value, ctx) => {
  const issues = validateFieldIdentityDraft({
    regionCode: value.regionCode,
    slopeCode: value.slopeCode,
    stationCode: value.stationCode,
    gatewayCode: value.gatewayCode,
    requireRegionCode: true,
    requireSlopeCode: true,
    requireStationCode: true,
  });

  for (const issue of issues) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: issue.message,
      path: issue.path,
    });
  }
});

const bindPendingDeviceSchema = z
  .object({
    deviceId: z.string().uuid(),
    stationId: z.string().uuid().optional(),
    newStation: bindNewStationSchema.optional(),
    deviceName: trimmedField(100),
    displayName: trimmedField(100),
    installLabel: canonicalCodeField(100),
    nodeCode: canonicalCodeField(100),
    gatewayCode: canonicalCodeField(100).optional(),
    deviceRole: trimmedField(50).default("field_node"),
    lifecycleStatus: trimmedField(50).default("pending_commissioning"),
  })
  .superRefine((value, ctx) => {
    if ((value.stationId ? 1 : 0) + (value.newStation ? 1 : 0) !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "stationId 与 newStation 必须且只能提供一个",
        path: ["stationId"],
      });
    }

    const issues = value.newStation
      ? validateFieldIdentityDraft({
          regionCode: value.newStation.regionCode,
          slopeCode: value.newStation.slopeCode,
          stationCode: value.newStation.stationCode,
          nodeCode: value.nodeCode,
          gatewayCode: value.gatewayCode ?? value.newStation.gatewayCode,
          installLabel: value.installLabel,
          requireNodeCode: true,
          requireInstallLabel: true,
          requireGatewayCode: true,
        })
      : [];

    for (const issue of issues) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: issue.message,
        path:
          issue.path[0] === "regionCode" ||
          issue.path[0] === "slopeCode" ||
          issue.path[0] === "stationCode" ||
          issue.path[0] === "gatewayCode"
            ? ["newStation", ...issue.path]
            : issue.path,
      });
    }
  });

const confirmCommissioningSchema = z
  .object({
    deviceId: z.string().uuid(),
    lifecycleStatus: z.string().min(1).max(50).default("commissioned"),
  })
  .strict();

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readFirstString(record: Record<string, unknown> | null, keys: string[]): string | null {
  for (const key of keys) {
    const value = readString(record?.[key]);
    if (value) return value;
  }
  return null;
}

function readFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function normalizeIdentityClass(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function normalizeRisk(value: unknown): StationReadModel["risk"] {
  const raw = normalizeIdentityClass(value);
  if (raw === "high") return "high";
  if (raw === "mid" || raw === "medium") return "mid";
  return "low";
}

function normalizeStationStatus(value: StationRow["status"]): StationReadModel["status"] {
  if (value === "maintenance") return "warning";
  if (value === "inactive") return "offline";
  return "online";
}

function normalizeDeviceType(value: unknown): DeviceReadModel["type"] {
  const raw = normalizeIdentityClass(value);
  if (raw === "gnss" || raw === "gps" || raw === "multi_sensor" || raw === "multisensor")
    return "gnss";
  if (raw === "rain" || raw === "rainfall") return "rain";
  if (raw === "tilt" || raw === "inclinometer") return "tilt";
  if (raw === "camera" || raw === "video") return "camera";
  return "temp_hum";
}

function normalizeDeviceStatus(
  value: DeviceRow["status"],
  lastSeenAt: string | null
): DeviceReadModel["status"] {
  if (value === "revoked") return "offline";
  if (lastSeenAt) {
    const ts = Date.parse(lastSeenAt);
    if (!Number.isNaN(ts) && ts >= Date.now() - 24 * 60 * 60 * 1000) return "online";
  }
  return value === "active" ? "warning" : "offline";
}

function clickhouseStringToIsoZ(value: string): string {
  const trimmed = value.trim();
  if (trimmed.includes("T") && trimmed.endsWith("Z")) return trimmed;
  if (trimmed.includes("T")) return `${trimmed}Z`;
  if (trimmed.includes(" ")) return `${trimmed.replace(" ", "T")}Z`;
  return trimmed;
}

function toClickhouseDateTime64Utc(value: Date): string {
  return value.toISOString().replace("T", " ").replace("Z", "");
}

function formalDevicePredicate(alias = "devices"): string {
  return `COALESCE(${alias}.device_name, '') NOT LIKE 'field-hardware-replay-%'
    AND COALESCE(${alias}.metadata->>'note', '') NOT IN ('field_hardware_uplink_replay', 'field_rehearsal', 'smoke_test', 'seed demo')
    AND COALESCE(${alias}.metadata->>'identityClass', COALESCE(${alias}.metadata->>'identity_class', '')) NOT IN ('seed', 'replay', 'rehearsal', 'smoke_test', 'lab')`;
}

function formalStationPredicate(alias = "stations"): string {
  return `COALESCE(${alias}.station_code, '') NOT IN ('DEMO001', 'DEMO002')
    AND COALESCE(${alias}.metadata->>'note', '') NOT IN ('field_hardware_uplink_replay', 'field_rehearsal', 'smoke_test', 'seed demo')
    AND COALESCE(${alias}.metadata->>'identityClass', COALESCE(${alias}.metadata->>'identity_class', '')) NOT IN ('seed', 'replay', 'rehearsal', 'smoke_test', 'lab')`;
}

function readLegacyDeviceId(deviceName: string, metadata: unknown): string {
  const meta = asRecord(metadata);
  const direct = readFirstString(meta, ["legacyDeviceId", "legacy_device_id"]);
  if (direct) return direct;
  const externalIds = asRecord(meta?.externalIds);
  return readString(externalIds?.legacy) ?? deviceName;
}

function readCanonicalIdentityClass(
  deviceName: string,
  metadata: Record<string, unknown> | null,
  stationMetadata: Record<string, unknown> | null
): string | null {
  const direct =
    readFirstString(metadata, ["identityClass", "identity_class"]) ??
    readFirstString(stationMetadata, ["identityClass", "identity_class"]);
  if (direct) return direct;

  const note = (
    readFirstString(metadata, ["note"]) ?? readFirstString(stationMetadata, ["note"])
  )?.toLowerCase();
  if (note === "field_hardware_uplink_replay") return "replay";
  if (note === "field_rehearsal") return "rehearsal";
  if (note === "smoke_test") return "smoke_test";
  if (note === "lab") return "lab";
  if (note?.includes("seed")) return "seed";
  if (/^field-hardware-replay-/i.test(deviceName)) return "replay";
  if (/^device_\d+$/i.test(deviceName)) return "seed";
  return null;
}

function isFormalIdentityClass(value: string | null | undefined): boolean {
  return normalizeIdentityClass(value) === "formal";
}

function isFormalStationMetadata(metadata: Record<string, unknown> | null): boolean {
  const note = normalizeIdentityClass(metadata?.note);
  if (note === "seed demo") return false;
  return (
    isFormalIdentityClass(readString(metadata?.identityClass)) ||
    isFormalIdentityClass(readString(metadata?.identity_class))
  );
}

function isCommissionedLifecycle(value: string | null | undefined): boolean {
  const normalized = normalizeIdentityClass(value);
  return normalized === "commissioned" || normalized === "active";
}

function needsPendingObservation(device: DeviceReadModel): boolean {
  return (
    !isFormalIdentityClass(device.identityClass) ||
    !device.stationCode ||
    !device.regionCode ||
    !device.gatewayCode
  );
}

function deriveFieldNodeIdFromNodeCode(nodeCode: string | null | undefined): string | null {
  if (!nodeCode) return null;
  const suffix = nodeCode.trim().match(/-([A-Za-z0-9]+)$/)?.[1];
  return suffix ?? nodeCode;
}

function normalizePendingObservationStatus(
  lastSeenAt: string,
  warningFlag: boolean | null,
  fallback: PendingObservation["status"]
): PendingObservation["status"] {
  if (warningFlag === true) return "warning";
  const ts = Date.parse(lastSeenAt);
  if (!Number.isNaN(ts) && ts >= Date.now() - 24 * 60 * 60 * 1000) return "online";
  return fallback;
}

function buildPendingObservationFromDevice(device: DeviceReadModel): PendingObservation {
  const metadata = asRecord(device.metadata);
  const fieldNodeId =
    readFirstString(metadata, ["fieldNodeId", "field_node_id"]) ??
    deriveFieldNodeIdFromNodeCode(device.nodeCode);

  return {
    deviceId: device.id,
    runtimeName: device.deviceName,
    displayName: device.displayName ?? device.name ?? device.deviceName,
    stationCode: device.stationCode ?? null,
    installLabel: device.installLabel ?? null,
    fieldNodeId,
    nodeCodeHint: device.nodeCode ?? null,
    gatewayCode: device.gatewayCode ?? null,
    regionCode: device.regionCode ?? null,
    firstSeenAt: device.createdAt ?? device.updatedAt ?? device.lastSeenAt,
    lastSeenAt: device.lastSeenAt,
    lastSeq: null,
    observationSource: "registry_incomplete",
    reason: !isFormalIdentityClass(device.identityClass)
      ? "台账已存在，待完成正式认领"
      : "台账已存在，待补齐正式身份字段",
    sampleMetrics: {
      temperatureC: null,
      humidityPct: null,
      batteryPct: null,
      gpsLatitude: null,
      gpsLongitude: null,
      warningFlag: null,
    },
    status: device.status,
  };
}

function pickEarlierIso(left: string, right: string): string {
  const leftMs = Date.parse(left);
  const rightMs = Date.parse(right);
  if (Number.isNaN(leftMs)) return right;
  if (Number.isNaN(rightMs)) return left;
  return leftMs <= rightMs ? left : right;
}

function pickLaterIso(left: string, right: string): string {
  const leftMs = Date.parse(left);
  const rightMs = Date.parse(right);
  if (Number.isNaN(leftMs)) return right;
  if (Number.isNaN(rightMs)) return left;
  return leftMs >= rightMs ? left : right;
}

function mergePendingObservation(
  current: PendingObservation,
  runtime: PendingObservation
): PendingObservation {
  const lastSeenAt = pickLaterIso(current.lastSeenAt, runtime.lastSeenAt);
  const warningFlag = runtime.sampleMetrics.warningFlag ?? current.sampleMetrics.warningFlag;
  return {
    ...current,
    firstSeenAt: pickEarlierIso(current.firstSeenAt, runtime.firstSeenAt),
    lastSeenAt,
    lastSeq: runtime.lastSeq ?? current.lastSeq,
    sampleMetrics: {
      temperatureC: runtime.sampleMetrics.temperatureC ?? current.sampleMetrics.temperatureC,
      humidityPct: runtime.sampleMetrics.humidityPct ?? current.sampleMetrics.humidityPct,
      batteryPct: runtime.sampleMetrics.batteryPct ?? current.sampleMetrics.batteryPct,
      gpsLatitude: runtime.sampleMetrics.gpsLatitude ?? current.sampleMetrics.gpsLatitude,
      gpsLongitude: runtime.sampleMetrics.gpsLongitude ?? current.sampleMetrics.gpsLongitude,
      warningFlag,
    },
    status: normalizePendingObservationStatus(lastSeenAt, warningFlag, current.status),
  };
}

function sortPendingObservations(observations: PendingObservation[]): PendingObservation[] {
  return observations.sort((left, right) => Date.parse(right.lastSeenAt) - Date.parse(left.lastSeenAt));
}

async function loadRuntimePendingObservations(
  config: AppConfig,
  ch: ClickHouseClient
): Promise<PendingObservation[]> {
  const since = new Date(Date.now() - ONBOARDING_PENDING_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const result = await ch.query({
    query: `
      SELECT
        device_id,
        toString(min(received_ts)) AS first_seen_at,
        toString(max(received_ts)) AS last_seen_at,
        argMax(seq, received_ts) AS last_seq,
        argMaxIf(value_f64, received_ts, sensor_key = 'temperature_c') AS temperature_c,
        argMaxIf(value_f64, received_ts, sensor_key = 'humidity_pct') AS humidity_pct,
        argMaxIf(value_f64, received_ts, sensor_key = 'battery_pct') AS battery_pct_f64,
        argMaxIf(value_i64, received_ts, sensor_key = 'battery_pct') AS battery_pct_i64,
        argMaxIf(value_f64, received_ts, sensor_key = 'gps_latitude') AS gps_latitude,
        argMaxIf(value_f64, received_ts, sensor_key = 'gps_longitude') AS gps_longitude,
        argMaxIf(value_bool, received_ts, sensor_key = 'warning_flag') AS warning_flag
      FROM ${config.clickhouseDatabase}.${config.clickhouseTable}
      WHERE received_ts >= toDateTime64({start:String}, 3, 'UTC')
      GROUP BY device_id
      ORDER BY max(received_ts) DESC
      LIMIT {limit:UInt32}
    `,
    query_params: {
      start: toClickhouseDateTime64Utc(since),
      limit: ONBOARDING_PENDING_RUNTIME_LIMIT,
    },
    format: "JSONEachRow",
  });
  const rows: RuntimeObservedDeviceRow[] = await result.json();

  return sortPendingObservations(
    rows.map((row) => {
      const firstSeenAt = clickhouseStringToIsoZ(row.first_seen_at);
      const lastSeenAt = clickhouseStringToIsoZ(row.last_seen_at);
      const warningFlag = row.warning_flag == null ? null : row.warning_flag === 1;
      return {
        deviceId: row.device_id,
        runtimeName: row.device_id,
        displayName: row.device_id,
        stationCode: null,
        installLabel: null,
        fieldNodeId: null,
        nodeCodeHint: null,
        gatewayCode: null,
        regionCode: null,
        firstSeenAt,
        lastSeenAt,
        lastSeq: row.last_seq ?? null,
        observationSource: "runtime_observed_only",
        reason: "运行期已观测，尚未建档认领",
        sampleMetrics: {
          temperatureC: row.temperature_c ?? null,
          humidityPct: row.humidity_pct ?? null,
          batteryPct: row.battery_pct_f64 ?? row.battery_pct_i64 ?? null,
          gpsLatitude: row.gps_latitude ?? null,
          gpsLongitude: row.gps_longitude ?? null,
          warningFlag,
        },
        status: normalizePendingObservationStatus(lastSeenAt, warningFlag, "offline"),
      };
    })
  );
}

function buildStationReadModel(
  row: StationRow,
  deviceCountByStationId: Map<string, number>,
  stationStatusById: Map<string, StationReadModel["status"]>
): StationReadModel {
  const metadata = asRecord(row.metadata);
  const identity = readStationIdentityContext(row.station_code, row.metadata);
  const displayName =
    readFirstString(metadata, ["displayName", "display_name"]) ??
    readString(row.station_name) ??
    readString(row.station_code) ??
    row.station_id;
  const lifecycleStatus = readFirstString(metadata, ["lifecycleStatus", "lifecycle_status"]);

  return {
    id: row.station_id,
    name: displayName,
    stationCode: identity.stationCode,
    stationName: readString(row.station_name) ?? displayName,
    displayName,
    regionCode: identity.regionCode,
    slopeCode: identity.slopeCode,
    lifecycleStatus,
    area:
      readFirstString(metadata, ["locationName", "location_name", "area"]) ??
      identity.regionCode ??
      displayName,
    risk: normalizeRisk(metadata?.riskLevel ?? metadata?.risk_level),
    status: stationStatusById.get(row.station_id) ?? normalizeStationStatus(row.status),
    lat: row.latitude ?? 0,
    lng: row.longitude ?? 0,
    deviceCount: deviceCountByStationId.get(row.station_id) ?? 0,
    ...(metadata ? { metadata } : {}),
  };
}

function buildDeviceReadModel(row: DeviceRow): DeviceReadModel {
  const metadata = asRecord(row.metadata);
  const stationMetadata = asRecord(row.station_metadata);
  const identity = mergeStationIdentityContexts(
    readStationIdentityContext(null, row.metadata),
    readStationIdentityContext(row.station_code, row.station_metadata)
  );
  const displayName =
    readFirstString(metadata, ["displayName", "display_name"]) ??
    readString(row.device_name) ??
    row.device_id;
  const stationId = readString(row.station_id) ?? "";
  const stationName = readString(row.station_name) ?? (stationId || "Unassigned");
  const identityClass = readCanonicalIdentityClass(row.device_name, metadata, stationMetadata);
  const deviceRole = readFirstString(metadata, ["deviceRole", "device_role"]);
  const lifecycleStatus = readFirstString(metadata, ["lifecycleStatus", "lifecycle_status"]);
  const nodeCode = readFirstString(metadata, ["nodeCode", "node_code"]);
  const installLabel = readFirstString(metadata, ["installLabel", "install_label"]);

  return {
    id: row.device_id,
    name: displayName,
    deviceName: readString(row.device_name) ?? row.device_id,
    legacyDeviceId: readLegacyDeviceId(row.device_name, row.metadata),
    stationId,
    stationName,
    stationCode: identity.stationCode,
    displayName,
    installLabel,
    identityClass,
    deviceRole,
    lifecycleStatus,
    regionCode: identity.regionCode,
    slopeCode: identity.slopeCode,
    nodeCode,
    gatewayCode: identity.gatewayCode,
    registryStatus: row.status,
    type: normalizeDeviceType(row.device_type),
    status: normalizeDeviceStatus(row.status, row.last_seen_at),
    lastSeenAt: row.last_seen_at ?? new Date(0).toISOString(),
    ...(row.created_at ? { createdAt: row.created_at } : {}),
    ...(row.updated_at ? { updatedAt: row.updated_at } : {}),
    ...(metadata ? { metadata } : {}),
  };
}

function buildPendingObservations(
  devices: DeviceReadModel[],
  runtimeObservations: PendingObservation[]
): PendingObservation[] {
  const pendingByDeviceId = new Map<string, PendingObservation>();
  const allDevicesById = new Map(devices.map((device) => [device.id, device] as const));

  for (const device of devices) {
    if (!needsPendingObservation(device)) continue;
    pendingByDeviceId.set(device.id, buildPendingObservationFromDevice(device));
  }

  for (const runtimeObservation of runtimeObservations) {
    const current = pendingByDeviceId.get(runtimeObservation.deviceId);
    if (current) {
      pendingByDeviceId.set(
        runtimeObservation.deviceId,
        mergePendingObservation(current, runtimeObservation)
      );
      continue;
    }

    const existingDevice = allDevicesById.get(runtimeObservation.deviceId);
    if (existingDevice && !needsPendingObservation(existingDevice)) continue;
    pendingByDeviceId.set(runtimeObservation.deviceId, runtimeObservation);
  }

  return sortPendingObservations(Array.from(pendingByDeviceId.values()));
}

function buildBaselineReadModel(row: BaselineRow) {
  const baseline = asRecord(row.baseline);
  const altitude = readFiniteNumber(baseline?.altitude);
  const notes = readString(baseline?.notes);
  return {
    deviceId: row.device_id,
    deviceName: row.device_name,
    baselineLat: readFiniteNumber(baseline?.latitude) ?? 0,
    baselineLng: readFiniteNumber(baseline?.longitude) ?? 0,
    ...(altitude == null ? {} : { baselineAlt: altitude }),
    establishedBy: readString(baseline?.establishedBy) ?? row.method ?? "system",
    establishedTime: row.computed_at,
    status: "active" as const,
    ...(notes ? { notes } : {}),
  };
}

function buildAuditReadModel(row: AuditRow) {
  return {
    id: row.id,
    userId: row.user_id,
    username: row.username ?? "system",
    module: row.module,
    action: row.action,
    targetType: row.target_type ?? "",
    targetId: row.target_id ?? "",
    description: row.description ?? "",
    requestData: row.request_data ?? null,
    responseData: row.response_data ?? null,
    ipAddress: row.ip_address ?? "",
    userAgent: row.user_agent ?? "",
    status: row.status,
    errorMessage: row.error_message ?? "",
    createdAt: row.created_at,
  };
}

function buildNewStationMetadata(input: BindNewStationInput): Record<string, unknown> {
  return {
    identityClass: "formal",
    stationCode: input.stationCode,
    ...(input.displayName ? { displayName: input.displayName } : {}),
    ...(input.regionCode ? { regionCode: input.regionCode } : {}),
    ...(input.slopeCode ? { slopeCode: input.slopeCode } : {}),
    ...(input.locationName ? { locationName: input.locationName } : {}),
    ...(input.riskLevel ? { riskLevel: input.riskLevel } : {}),
    lifecycleStatus: input.lifecycleStatus ?? "pending_commissioning",
    ...(input.gatewayCode ? { gatewayCode: input.gatewayCode } : {}),
  };
}

function readStationIdentityContext(
  stationCode: string | null,
  metadata: unknown
): StationIdentityContext {
  const meta = asRecord(metadata);
  const resolvedStationCode =
    readString(stationCode) ??
    readFirstString(meta, ["stationCode", "station_code"]) ??
    deriveStationCodeFromNodeCode(readFirstString(meta, ["nodeCode", "node_code"]));
  const resolvedSlopeCode =
    readFirstString(meta, ["slopeCode", "slope_code"]) ??
    deriveSlopeCodeFromStationCode(resolvedStationCode);
  const resolvedGatewayCode = readFirstString(meta, ["gatewayCode", "gateway_code"]);
  const resolvedRegionCode =
    readFirstString(meta, ["regionCode", "region_code"]) ??
    deriveRegionCodeFromSlopeCode(resolvedSlopeCode) ??
    deriveRegionCodeFromGatewayCode(resolvedGatewayCode);

  return {
    stationCode: resolvedStationCode || null,
    regionCode: resolvedRegionCode || null,
    slopeCode: resolvedSlopeCode || null,
    gatewayCode: resolvedGatewayCode || null,
  };
}

function mergeStationIdentityContexts(
  ...contexts: Array<StationIdentityContext | null | undefined>
): StationIdentityContext {
  const merged: StationIdentityContext = {
    stationCode: null,
    regionCode: null,
    slopeCode: null,
    gatewayCode: null,
  };

  for (const context of contexts) {
    if (!context) continue;
    if (!merged.stationCode && context.stationCode) merged.stationCode = context.stationCode;
    if (!merged.regionCode && context.regionCode) merged.regionCode = context.regionCode;
    if (!merged.slopeCode && context.slopeCode) merged.slopeCode = context.slopeCode;
    if (!merged.gatewayCode && context.gatewayCode) merged.gatewayCode = context.gatewayCode;
  }

  return merged;
}

async function loadStationIdentityContext(
  client: PoolClient,
  stationId: string
): Promise<StationIdentityContext | null> {
  const row = await queryOne<StationIdentitySeedRow>(
    client,
    `
      SELECT
        s.station_code,
        s.metadata AS station_metadata,
        hint.metadata AS device_metadata
      FROM stations s
      LEFT JOIN LATERAL (
        SELECT d.metadata
        FROM devices d
        WHERE d.station_id = s.station_id
          AND d.status != 'revoked'
        ORDER BY
          CASE
            WHEN COALESCE(d.metadata->>'identityClass', COALESCE(d.metadata->>'identity_class', '')) = 'formal'
              THEN 0
            ELSE 1
          END,
          d.updated_at DESC,
          d.created_at DESC
        LIMIT 1
      ) hint ON TRUE
      WHERE s.station_id = $1
        AND s.deleted_at IS NULL
    `,
    [stationId]
  );

  if (!row) return null;

  return mergeStationIdentityContexts(
    readStationIdentityContext(row.station_code, row.station_metadata),
    readStationIdentityContext(null, row.device_metadata)
  );
}

function deriveFieldNodeId(nodeCode: string, currentMetadata: Record<string, unknown>): string {
  const currentFieldNodeId = readFirstString(currentMetadata, ["fieldNodeId", "field_node_id"]);
  if (currentFieldNodeId && currentFieldNodeId !== nodeCode && currentFieldNodeId.length <= 16) {
    return currentFieldNodeId;
  }

  const suffix = nodeCode.trim().match(/-([A-Za-z0-9]+)$/)?.[1];
  if (suffix) return suffix;
  return nodeCode;
}

function readAuditDeviceId(log: {
  target_type: string | null;
  target_id: string | null;
  request_data: unknown;
  response_data: unknown;
}): string | null {
  if (log.target_type === "device" && readString(log.target_id)) return readString(log.target_id);

  const requestData = asRecord(log.request_data);
  const responseData = asRecord(log.response_data);
  return (
    readFirstString(requestData, ["deviceId", "device_id"]) ??
    readFirstString(responseData, ["deviceId", "device_id"])
  );
}

export function registerOnboardingRoutes(
  app: FastifyInstance,
  config: AppConfig,
  ch: ClickHouseClient,
  pg: PgPool | null
): void {
  const adminCfg: AdminAuthConfig = {
    adminApiToken: config.adminApiToken,
    jwtEnabled: Boolean(config.jwtAccessSecret),
  };

  app.get("/onboarding/workbench", async (request, reply) => {
    const traceId = request.traceId;
    if (!(await requirePermission(adminCfg, pg, request, reply, "device:view"))) return;
    if (!pg) {
      fail(reply, 503, "PostgreSQL 未配置", traceId);
      return;
    }

    const data = await withPgClient(pg, async (client) => {
      const [stationRes, deviceRes, baselineRes, auditRes, runtimeObservations] = await Promise.all([
        client.query<StationRow>(
          `
            SELECT
              station_id,
              station_code,
              station_name,
              status,
              latitude,
              longitude,
              altitude,
              metadata,
              to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
              to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at
            FROM stations
            WHERE deleted_at IS NULL
              AND ${formalStationPredicate("stations")}
            ORDER BY created_at DESC
          `
        ),
        client.query<DeviceRow>(
          `
            SELECT
              devices.device_id,
              devices.device_name,
              devices.device_type,
              devices.station_id,
              devices.status,
              devices.metadata,
              to_char(devices.last_seen_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS last_seen_at,
              to_char(devices.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS created_at,
              to_char(devices.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at,
              stations.station_code,
              stations.station_name,
              stations.metadata AS station_metadata
            FROM devices
            LEFT JOIN stations ON stations.station_id = devices.station_id AND stations.deleted_at IS NULL
            WHERE devices.status != 'revoked'
            ORDER BY devices.created_at DESC
          `
        ),
        client.query<BaselineRow>(
          `
            SELECT
              gb.device_id,
              devices.device_name,
              gb.method,
              to_char(gb.computed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS computed_at,
              gb.baseline
            FROM gps_baselines gb
            JOIN devices ON devices.device_id = gb.device_id
            WHERE ${formalDevicePredicate("devices")}
            ORDER BY gb.computed_at DESC
          `
        ),
        client.query<AuditRow>(
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
            WHERE module = 'onboarding'
               OR (module = 'device' AND action IN ('revoke_device', 'reactivate_device'))
            ORDER BY created_at DESC, id DESC
            LIMIT 50
          `
        ),
        loadRuntimePendingObservations(config, ch).catch(() => []),
      ]);

      const allDevices = deviceRes.rows.map((row) => buildDeviceReadModel(row));
      const formalDevices = allDevices.filter((device) =>
        isFormalIdentityClass(device.identityClass)
      );

      const deviceCountByStationId = new Map<string, number>();
      const stationStatusById = new Map<string, StationReadModel["status"]>();
      for (const device of formalDevices) {
        if (!device.stationId) continue;
        deviceCountByStationId.set(
          device.stationId,
          (deviceCountByStationId.get(device.stationId) ?? 0) + 1
        );
        const current = stationStatusById.get(device.stationId);
        if (current === "online") continue;
        if (device.status === "online") {
          stationStatusById.set(device.stationId, "online");
          continue;
        }
        if (current !== "warning" && device.status === "warning") {
          stationStatusById.set(device.stationId, "warning");
          continue;
        }
        if (!current) stationStatusById.set(device.stationId, device.status);
      }

      const stations = stationRes.rows
        .map((row) => buildStationReadModel(row, deviceCountByStationId, stationStatusById))
        .filter(
          (station) =>
            station.deviceCount > 0 || isFormalStationMetadata(asRecord(station.metadata))
        );
      const baselines = baselineRes.rows.map((row) => buildBaselineReadModel(row));
      const formalDeviceIds = new Set(formalDevices.map((device) => device.id));
      const audits = auditRes.rows
        .filter((row) => {
          const deviceId = readAuditDeviceId(row);
          if (!deviceId) return row.module === "onboarding";
          if (formalDeviceIds.has(deviceId)) return true;
          return row.action === "revoke_device" || row.action === "reactivate_device";
        })
        .map((row) => buildAuditReadModel(row));
      const pendingObservations = buildPendingObservations(allDevices, runtimeObservations);

      return {
        summary: {
          pendingCount: pendingObservations.length,
          formalCount: formalDevices.length,
          pendingCommissioningCount: formalDevices.filter(
            (device) =>
              !isCommissionedLifecycle(device.lifecycleStatus) || device.status !== "online"
          ).length,
          auditCount: audits.length,
        },
        stations,
        formalDevices,
        pendingObservations,
        baselines,
        audits,
      };
    });

    ok(reply, data, traceId);
  });

  app.post("/onboarding/bind", async (request, reply) => {
    const traceId = request.traceId;
    if (!(await requirePermission(adminCfg, pg, request, reply, "device:update"))) return;
    if (!pg) {
      fail(reply, 503, "PostgreSQL 未配置", traceId);
      return;
    }

    const parseBody = bindPendingDeviceSchema.safeParse(request.body);
    if (!parseBody.success) {
      fail(reply, 400, parseBody.error.issues[0]?.message ?? "设备接入参数不符合要求", traceId, {
        field: "body",
        issues: parseBody.error.issues,
      });
      return;
    }
    const body = parseBody.data;

    const existingDevice = await withPgClient(pg, async (client) =>
      queryOne<{ status: "inactive" | "active" | "revoked" }>(
        client,
        "SELECT status FROM devices WHERE device_id = $1",
        [body.deviceId]
      )
    );
    if (existingDevice?.status === "revoked") {
      fail(reply, 409, "设备已停用，请先恢复后再认领", traceId, { deviceId: body.deviceId });
      return;
    }

    if ((body.newStation || !existingDevice) &&
      !(await requirePermission(adminCfg, pg, request, reply, "device:create")))
      return;

    try {
      const result = await withPgClient(pg, async (client) => {
        await client.query("BEGIN");
        try {
          const deviceRes = await client.query<{
            device_id: string;
            status: "inactive" | "active" | "revoked";
            metadata: unknown;
          }>(
            `
              SELECT device_id, status, metadata
              FROM devices
              WHERE device_id = $1
              FOR UPDATE
            `,
            [body.deviceId]
          );
          if (deviceRes.rows[0]?.status === "revoked") {
            await client.query("ROLLBACK");
            return { kind: "revoked" as const };
          }
          const currentMetadata = asRecord(deviceRes.rows[0]?.metadata) ?? {};

          let stationId = body.stationId ?? null;
          let createdStationId: string | null = null;
          let stationIdentity: StationIdentityContext | null = null;

          if (body.stationId) {
            stationIdentity = await loadStationIdentityContext(client, body.stationId);
            if (!stationIdentity) {
              await client.query("ROLLBACK");
              return { kind: "station_not_found" as const };
            }
          }

          if (body.newStation) {
            const metadata = buildNewStationMetadata(body.newStation);
            const stationRes = await client.query<{ station_id: string }>(
              `
                INSERT INTO stations (
                  station_code,
                  station_name,
                  status,
                  latitude,
                  longitude,
                  altitude,
                  metadata
                ) VALUES (
                  $1, $2, 'active', $3, $4, $5, $6::jsonb
                )
                RETURNING station_id
              `,
              [
                body.newStation.stationCode,
                body.newStation.stationName,
                body.newStation.latitude ?? null,
                body.newStation.longitude ?? null,
                body.newStation.altitude ?? null,
                JSON.stringify(metadata),
              ]
            );
            stationId = stationRes.rows[0]?.station_id ?? null;
            createdStationId = stationId;
            stationIdentity = readStationIdentityContext(body.newStation.stationCode, metadata);
          }

          stationIdentity = mergeStationIdentityContexts(
            stationIdentity,
            readStationIdentityContext(null, currentMetadata)
          );

          const identityIssues = validateFieldIdentityDraft({
            regionCode: stationIdentity?.regionCode,
            slopeCode: stationIdentity?.slopeCode,
            stationCode: stationIdentity?.stationCode,
            nodeCode: body.nodeCode,
            gatewayCode: body.gatewayCode ?? stationIdentity?.gatewayCode,
            installLabel: body.installLabel,
            requireRegionCode: true,
            requireSlopeCode: true,
            requireStationCode: true,
            requireNodeCode: true,
            requireGatewayCode: true,
            requireInstallLabel: true,
          });
          if (identityIssues.length) {
            await client.query("ROLLBACK");
            return { kind: "identity_invalid" as const, issues: identityIssues };
          }

          const fieldNodeId = deriveFieldNodeId(body.nodeCode, currentMetadata);
          const resolvedGatewayCode = body.gatewayCode ?? stationIdentity?.gatewayCode ?? null;
          const nextMetadata: Record<string, unknown> = {
            ...currentMetadata,
            identityClass: "formal",
            displayName: body.displayName,
            installLabel: body.installLabel,
            stationCode: stationIdentity?.stationCode ?? currentMetadata.stationCode,
            regionCode: stationIdentity?.regionCode ?? currentMetadata.regionCode,
            slopeCode: stationIdentity?.slopeCode ?? currentMetadata.slopeCode,
            nodeCode: body.nodeCode,
            fieldNodeId,
            deviceRole: body.deviceRole,
            lifecycleStatus: body.lifecycleStatus,
          };
          if (resolvedGatewayCode) nextMetadata.gatewayCode = resolvedGatewayCode;

          let createdDevice = false;
          let updatedAt = new Date().toISOString();
          if (deviceRes.rowCount === 1) {
            const updatedRes = await client.query<{ updated_at: string }>(
              `
                UPDATE devices
                SET
                  device_name = $2,
                  station_id = $3::uuid,
                  metadata = $4::jsonb,
                  updated_at = NOW()
                WHERE device_id = $1 AND status != 'revoked'
                RETURNING to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at
              `,
              [body.deviceId, body.deviceName, stationId, JSON.stringify(nextMetadata)]
            );
            updatedAt = updatedRes.rows[0]?.updated_at ?? updatedAt;
          } else {
            const secretHash = hashDeviceSecret(generateDeviceSecret());
            const createdRes = await client.query<{ updated_at: string }>(
              `
                INSERT INTO devices (
                  device_id,
                  device_name,
                  device_type,
                  station_id,
                  status,
                  device_secret_hash,
                  metadata
                ) VALUES (
                  $1::uuid,
                  $2,
                  'multi_sensor',
                  $3::uuid,
                  'inactive',
                  $4,
                  $5::jsonb
                )
                RETURNING to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at
              `,
              [body.deviceId, body.deviceName, stationId, secretHash, JSON.stringify(nextMetadata)]
            );
            createdDevice = true;
            updatedAt = createdRes.rows[0]?.updated_at ?? updatedAt;
          }

          await client.query("COMMIT");
          return {
            kind: "ok" as const,
            stationId,
            createdStationId,
            createdDevice,
            updatedAt,
          };
        } catch (err) {
          await client.query("ROLLBACK");
          throw err;
        }
      });

      if (result.kind === "station_not_found") {
        fail(reply, 404, "资源不存在", traceId, { stationId: body.stationId });
        return;
      }
      if (result.kind === "revoked") {
        fail(reply, 409, "设备已停用，请先恢复后再认领", traceId, { deviceId: body.deviceId });
        return;
      }
      if (result.kind === "identity_invalid") {
        fail(reply, 400, result.issues[0]?.message ?? "现场正式编码不符合命名标准", traceId, {
          field: "body",
          issues: result.issues,
        });
        return;
      }

      await enqueueOperationLog(pg, request, {
        module: "onboarding",
        action: "bind_pending_device",
        description: "bind pending device to formal registry",
        targetType: "device",
        targetId: body.deviceId,
        status: "success",
        requestData: body,
        responseData: {
          deviceId: body.deviceId,
          stationId: result.stationId,
          createdStationId: result.createdStationId,
          createdDevice: result.createdDevice,
          updatedAt: result.updatedAt,
        },
      });

      ok(
        reply,
        {
          deviceId: body.deviceId,
          stationId: result.stationId,
          createdStationId: result.createdStationId,
          createdDevice: result.createdDevice,
          updatedAt: result.updatedAt,
        },
        traceId
      );
    } catch (err) {
      const pgCode =
        err && typeof err === "object" && "code" in err
          ? String((err as { code: unknown }).code)
          : "";
      if (pgCode === "23505") {
        fail(reply, 409, "资源已存在", traceId, {
          stationCode: body.newStation?.stationCode ?? null,
        });
        return;
      }
      throw err;
    }
  });

  app.post("/onboarding/commission", async (request, reply) => {
    const traceId = request.traceId;
    if (!(await requirePermission(adminCfg, pg, request, reply, "device:update"))) return;
    if (!pg) {
      fail(reply, 503, "PostgreSQL 未配置", traceId);
      return;
    }

    const parseBody = confirmCommissioningSchema.safeParse(request.body);
    if (!parseBody.success) {
      fail(reply, 400, "参数错误", traceId, { field: "body", issues: parseBody.error.issues });
      return;
    }
    const body = parseBody.data;

    const updated = await withPgClient(pg, async (client) => {
      await client.query("BEGIN");
      try {
        const deviceRes = await client.query<{ metadata: unknown }>(
          `
            SELECT metadata
            FROM devices
            WHERE device_id = $1 AND status != 'revoked'
            FOR UPDATE
          `,
          [body.deviceId]
        );
        if (deviceRes.rowCount !== 1) {
          await client.query("ROLLBACK");
          return null;
        }

        const currentMetadata = asRecord(deviceRes.rows[0]?.metadata) ?? {};
        const nextMetadata: Record<string, unknown> = {
          ...currentMetadata,
          lifecycleStatus: body.lifecycleStatus,
          commissionedAt: currentMetadata.commissionedAt ?? new Date().toISOString(),
          commissionedBy: currentMetadata.commissionedBy ?? request.user?.username ?? "admin",
        };

        const updateRes = await client.query<{ updated_at: string }>(
          `
            UPDATE devices
            SET
              metadata = $2::jsonb,
              updated_at = NOW()
            WHERE device_id = $1 AND status != 'revoked'
            RETURNING to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS updated_at
          `,
          [body.deviceId, JSON.stringify(nextMetadata)]
        );
        await client.query("COMMIT");
        return updateRes.rows[0]?.updated_at ?? new Date().toISOString();
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    });

    if (!updated) {
      fail(reply, 404, "资源不存在", traceId, { deviceId: body.deviceId });
      return;
    }

    await enqueueOperationLog(pg, request, {
      module: "onboarding",
      action: "confirm_commissioning",
      description: "confirm device commissioning",
      targetType: "device",
      targetId: body.deviceId,
      status: "success",
      requestData: body,
      responseData: { deviceId: body.deviceId, updatedAt: updated },
    });

    ok(reply, { deviceId: body.deviceId, updatedAt: updated }, traceId);
  });
}
