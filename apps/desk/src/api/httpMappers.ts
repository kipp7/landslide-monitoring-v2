import type { Baseline, DashboardSummary, Device, DeviceType, GpsSeries, Station, SystemStatus, User, WeeklyTrend } from "./client";

type AuthUserPayload = {
  userId: string;
  username: string;
  realName?: string;
  roles?: string[];
};

type DashboardPayload = {
  stations: number;
  onlineDevices: number;
  freshDevices: number;
  totalDevices: number;
  todayAlerts: number;
  offlineDevices: number;
  pendingAlerts: number;
  alertsBySeverity?: Partial<Record<"low" | "medium" | "high" | "critical", number>>;
};

type StationPayload = {
  stationId: string;
  stationCode: string;
  stationName: string;
  status: "active" | "inactive" | "maintenance";
  latitude: number | null;
  longitude: number | null;
  metadata?: Record<string, unknown>;
};

type DevicePayload = {
  deviceId: string;
  deviceName?: string;
  deviceType?: string;
  stationId?: string | null;
  status: "inactive" | "active" | "revoked";
  lastSeenAt?: string | null;
};

type BaselinePayload = {
  deviceId: string;
  deviceName: string;
  method?: "auto" | "manual";
  baseline?: {
    latitude?: number;
    longitude?: number;
    altitude?: number;
    notes?: string;
    establishedBy?: string;
  };
  computedAt?: string;
};

type GpsDeformationPayload = {
  deviceId: string;
  points: Array<{
    ts: string;
    distanceMeters: number;
  }>;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function readString(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function normalizeRisk(value: unknown): Station["risk"] {
  const raw = readString(value).toLowerCase();
  if (raw === "high") return "high";
  if (raw === "mid" || raw === "medium") return "mid";
  return "low";
}

function normalizeStationStatus(value: StationPayload["status"]): Station["status"] {
  if (value === "maintenance") return "warning";
  if (value === "inactive") return "offline";
  return "online";
}

function normalizeDeviceType(value: unknown): DeviceType {
  const raw = readString(value).toLowerCase();
  if (raw === "gnss" || raw === "gps" || raw === "multi_sensor" || raw === "multisensor") return "gnss";
  if (raw === "rain" || raw === "rainfall") return "rain";
  if (raw === "tilt" || raw === "inclinometer") return "tilt";
  if (raw === "camera" || raw === "video") return "camera";
  return "temp_hum";
}

function normalizeDeviceStatus(value: DevicePayload["status"], lastSeenAt?: string | null): Device["status"] {
  if (value === "revoked") return "offline";
  const lastSeen = readString(lastSeenAt);
  if (lastSeen) {
    const ts = new Date(lastSeen);
    if (!Number.isNaN(ts.getTime())) {
      const threshold = Date.now() - 24 * 60 * 60 * 1000;
      if (ts.getTime() >= threshold) return "online";
    }
  }
  return value === "active" ? "warning" : "offline";
}

function normalizeHealthState(value: unknown): SystemStatus["items"][number]["status"] {
  const raw = readString(value, "unknown");
  if (raw === "healthy" || raw === "configured") return "healthy";
  if (raw === "not_configured") return "not_configured";
  if (raw === "unhealthy") return "degraded";
  return "unknown";
}

function buildHealthPercentFromItems(
  items: Array<{
    status: SystemStatus["items"][number]["status"];
  }>
): number {
  const healthyCount = items.filter((item) => item.status === "healthy").length;
  return Math.round((healthyCount / Math.max(1, items.length)) * 100);
}

export function mapAuthUser(input: AuthUserPayload): User {
  const roles = Array.isArray(input.roles) ? input.roles : [];
  return {
    id: input.userId,
    name: readString(input.realName, readString(input.username, input.userId)),
    role: roles.includes("admin") ? "admin" : "viewer"
  };
}

export function mapDashboardSummaryFromV1(input: DashboardPayload): DashboardSummary {
  const totalDevices = Math.max(1, Number(input.totalDevices ?? input.onlineDevices + input.offlineDevices));
  const availability = Number(input.onlineDevices ?? 0) / totalDevices;
  const freshness = Number(input.freshDevices ?? 0) / totalDevices;
  const alertsBySeverity = {
    low: Number(input.alertsBySeverity?.low ?? 0),
    medium: Number(input.alertsBySeverity?.medium ?? 0),
    high: Number(input.alertsBySeverity?.high ?? 0),
    critical: Number(input.alertsBySeverity?.critical ?? 0)
  };
  const weightedRiskLoad =
    alertsBySeverity.low * 0.05 +
    alertsBySeverity.medium * 0.1 +
    alertsBySeverity.high * 0.18 +
    alertsBySeverity.critical * 0.28;
  const riskScore = Math.max(0, 1 - Math.min(0.8, weightedRiskLoad));
  const healthScore = availability * 0.4 + freshness * 0.2 + riskScore * 0.4;

  return {
    stationCount: Number(input.stations ?? 0),
    deviceOnlineCount: Number(input.onlineDevices ?? 0),
    alertCountToday: Number(input.todayAlerts ?? 0),
    systemHealthPercent: Math.max(0, Math.min(100, Math.round(healthScore * 100)))
  };
}

export function makeLegacyWeeklyTrend(input: unknown): WeeklyTrend {
  const record = asRecord(input);
  const labels = Array.isArray(record?.labels) ? record.labels.map((x) => String(x)) : [];
  const rainfallMm = Array.isArray(record?.rainfallMm) ? record.rainfallMm.map((x) => Number(x)) : [];
  const alertCount = Array.isArray(record?.alertCount) ? record.alertCount.map((x) => Number(x)) : [];
  return {
    labels,
    rainfallMm,
    alertCount,
    source: "derived_summary",
    note: readString(record?.note, "基于后端聚合生成。")
  };
}

export function mapStationsFromV1(input: StationPayload[], devices: DevicePayload[]): Station[] {
  const deviceCountByStationId = new Map<string, number>();
  const stationStatusById = new Map<string, Station["status"]>();
  for (const device of devices) {
    const stationId = readString(device.stationId);
    if (!stationId) continue;
    deviceCountByStationId.set(stationId, (deviceCountByStationId.get(stationId) ?? 0) + 1);
    const nextStatus = normalizeDeviceStatus(device.status, device.lastSeenAt);
    const current = stationStatusById.get(stationId);
    if (current === "online") continue;
    if (nextStatus === "online") {
      stationStatusById.set(stationId, "online");
      continue;
    }
    if (current !== "warning" && nextStatus === "warning") {
      stationStatusById.set(stationId, "warning");
      continue;
    }
    if (!current) stationStatusById.set(stationId, nextStatus);
  }

  return input.map((station) => {
    const metadata = asRecord(station.metadata);
    return {
      id: station.stationId,
      name: readString(station.stationName, station.stationCode),
      area: readString(metadata?.locationName, readString(metadata?.location_name, readString(metadata?.area, station.stationName))),
      risk: normalizeRisk(metadata?.riskLevel ?? metadata?.risk_level),
      status: stationStatusById.get(station.stationId) ?? normalizeStationStatus(station.status),
      lat: asFiniteNumber(station.latitude) ?? 0,
      lng: asFiniteNumber(station.longitude) ?? 0,
      deviceCount: deviceCountByStationId.get(station.stationId) ?? 0
    };
  });
}

export function mapMonitoringStationsLegacy(input: unknown): Station[] {
  const record = asRecord(input);
  const list = Array.isArray(record?.data) ? record.data : Array.isArray(input) ? input : [];
  const grouped = new Map<string, Station>();

  for (const item of list) {
    const row = asRecord(item);
    if (!row) continue;
    const id = readString(row.actual_device_id, readString(row.device_id));
    const stationName = readString(row.station_name, id);
    const area = readString(row.location_name, stationName);
    const lat = asFiniteNumber(row.latitude) ?? 0;
    const lng = asFiniteNumber(row.longitude) ?? 0;
    const risk = normalizeRisk(row.risk_level);
    const statusRaw = readString(row.online_status).toLowerCase();
    const status: Station["status"] = statusRaw === "online" ? "online" : "offline";
    const key = `${stationName}|${area}|${lat}|${lng}`;

    const existing = grouped.get(key);
    if (existing) {
      existing.deviceCount += 1;
      if (existing.status !== "online" && status === "online") existing.status = "online";
      if (existing.risk === "low" && risk !== "low") existing.risk = risk;
      continue;
    }

    grouped.set(key, {
      id,
      name: stationName,
      area,
      risk,
      status,
      lat,
      lng,
      deviceCount: 1
    });
  }

  return Array.from(grouped.values());
}

export function mapDevicesFromV1(input: DevicePayload[], stations: Station[]): Device[] {
  const stationNameById = new Map(stations.map((station) => [station.id, station.name] as const));
  return input.map((device) => {
    const stationId = readString(device.stationId);
    const stationName = stationNameById.get(stationId) ?? (stationId || "Unassigned");
    return {
      id: device.deviceId,
      name: readString(device.deviceName, device.deviceId),
      stationId,
      stationName,
      type: normalizeDeviceType(device.deviceType),
      status: normalizeDeviceStatus(device.status, device.lastSeenAt),
      lastSeenAt: readString(device.lastSeenAt, new Date(0).toISOString())
    };
  });
}

export function mapDevicesFromLegacy(input: unknown): Device[] {
  const list = Array.isArray(input) ? input : [];
  return list.map((item) => {
    const row = asRecord(item) ?? {};
    return {
      id: readString(row.id),
      name: readString(row.name, readString(row.id)),
      stationId: readString(row.stationId),
      stationName: readString(row.stationName, "Unassigned"),
      type: normalizeDeviceType(row.type),
      status: readString(row.status).toLowerCase() === "online" ? "online" : "offline",
      lastSeenAt: readString(row.lastSeenAt, new Date(0).toISOString())
    };
  });
}

export function mapBaselineFromV1(input: BaselinePayload): Baseline {
  const baseline = input.baseline ?? {};
  const altitude = asFiniteNumber(baseline.altitude);
  return {
    deviceId: input.deviceId,
    deviceName: input.deviceName,
    baselineLat: asFiniteNumber(baseline.latitude) ?? 0,
    baselineLng: asFiniteNumber(baseline.longitude) ?? 0,
    ...(altitude == null ? {} : { baselineAlt: altitude }),
    establishedBy: readString(baseline.establishedBy, input.method ?? "manual"),
    establishedTime: readString(input.computedAt, new Date().toISOString()),
    status: "active",
    ...(readString(baseline.notes) ? { notes: readString(baseline.notes) } : {})
  };
}

export function mapBaselinesFromLegacy(input: unknown): Baseline[] {
  const record = asRecord(input);
  const list = Array.isArray(record?.data) ? record.data : [];
  return list.map((item) => {
    const row = asRecord(item) ?? {};
    const altitude = asFiniteNumber(row.baseline_altitude);
    return {
      deviceId: readString(row.device_id),
      deviceName: readString(row.device_name, readString(row.device_id)),
      baselineLat: asFiniteNumber(row.baseline_latitude) ?? 0,
      baselineLng: asFiniteNumber(row.baseline_longitude) ?? 0,
      ...(altitude == null ? {} : { baselineAlt: altitude }),
      establishedBy: readString(row.established_by, "manual"),
      establishedTime: readString(row.established_time, new Date().toISOString()),
      status: "active",
      ...(readString(row.notes) ? { notes: readString(row.notes) } : {})
    };
  });
}

export function mapBaselineDetailFromLegacy(input: unknown): Baseline {
  const record = asRecord(input);
  const row = asRecord(record?.data) ?? {};
  const altitude = asFiniteNumber(row.baseline_altitude);
  return {
    deviceId: readString(row.device_id),
    deviceName: readString(row.device_name, readString(row.device_id)),
    baselineLat: asFiniteNumber(row.baseline_latitude) ?? 0,
    baselineLng: asFiniteNumber(row.baseline_longitude) ?? 0,
    ...(altitude == null ? {} : { baselineAlt: altitude }),
    establishedBy: readString(row.established_by, "manual"),
    establishedTime: readString(row.established_time, new Date().toISOString()),
    status: "active",
    ...(readString(row.notes) ? { notes: readString(row.notes) } : {})
  };
}

export function mapGpsSeriesFromLegacy(input: unknown, deviceName: string): GpsSeries {
  const record = asRecord(input);
  const data = asRecord(record?.data) ?? {};
  const points = Array.isArray(data.points) ? data.points : [];
  return {
    deviceId: readString(data.resolvedDeviceId, readString(data.deviceId)),
    deviceName,
    points: points.map((point) => {
      const row = asRecord(point) ?? {};
      return {
        ts: readString(row.event_time, new Date().toISOString()),
        dispMm: Number((asFiniteNumber(row.deformation_distance_3d) ?? 0).toFixed(2))
      };
    })
  };
}

export function mapSystemStatusFromLegacy(input: unknown): SystemStatus {
  const record = asRecord(input) ?? {};
  const rawItems = Array.isArray(record.items) ? record.items : [];
  const fallbackItems = rawItems.length > 0
    ? rawItems
    : [
        { key: "postgres", label: "PostgreSQL", status: asRecord(record.postgres)?.status, detail: asRecord(record.postgres)?.status },
        { key: "clickhouse", label: "ClickHouse", status: asRecord(record.clickhouse)?.status, detail: asRecord(record.clickhouse)?.status },
        { key: "kafka", label: "Kafka", status: asRecord(record.kafka)?.status, detail: asRecord(record.kafka)?.status }
      ];
  const items: SystemStatus["items"] = fallbackItems.map((item) => {
    const row = asRecord(item) ?? {};
    return {
      key: readString(row.key) as SystemStatus["items"][number]["key"],
      label: readString(row.label, readString(row.key)),
      status: normalizeHealthState(row.status),
      detail: readString(row.detail, readString(row.status, "unknown"))
    };
  });
  const healthPercent = buildHealthPercentFromItems(items);
  return {
    source: readString(record.source, "health_summary") as SystemStatus["source"],
    note: readString(record.note, "当前页面展示的是健康摘要。"),
    cpuPercent: healthPercent,
    memPercent: healthPercent,
    diskPercent: healthPercent,
    items
  };
}

export function mapSystemStatusFromV1(input: unknown): SystemStatus {
  return mapSystemStatusFromLegacy(input);
}
