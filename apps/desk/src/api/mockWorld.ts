import type { Baseline, DashboardSummary, Device, DeviceType, GpsPoint, GpsSeries, OnlineStatus, RiskLevel, Station, SystemStatus, WeeklyTrend } from "./client";
import { clamp, nowIso } from "./mockUtils";
import type { DemoScenario, MockSimConfig } from "./mockSim";
import { getSimNow, loadMockSimConfig } from "./mockSim";

type BaselineStore = {
  version: 1;
  baselines: Baseline[];
};

const BASELINES_KEY = "desk.mock.baselines.v1";

function safeJsonParse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function hash32(input: string) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rand01(seed: string) {
  return hash32(seed) / 4294967295;
}

function pick<T>(arr: readonly T[], idx: number): T {
  if (!arr.length) {
    throw new Error("Mock world: empty pick source");
  }
  return arr[Math.max(0, Math.min(arr.length - 1, idx))]!;
}

function isoAt(date: Date) {
  return date.toISOString();
}

function scenarioBias(scenario: DemoScenario) {
  // "normal" is used for exhibition defaults: no rain, no offline, mild warnings only.
  if (scenario === "normal") return { rain: 0.0, comms: 0.0, slide: 0.55 };
  if (scenario === "rainstorm") return { rain: 1.25, comms: 0.35, slide: 0.9 };
  if (scenario === "landslide_warning") return { rain: 0.95, comms: 0.25, slide: 1.35 };
  return { rain: 0.85, comms: 0.95, slide: 0.8 };
}

function baseRateMmPerH(risk: RiskLevel) {
  if (risk === "high") return 0.08;
  if (risk === "mid") return 0.04;
  return 0.02;
}

function rainMmPerH(ts: Date, stationId: string, cfg: MockSimConfig) {
  const { rain } = scenarioBias(cfg.scenario);
  const hour = ts.getHours();
  const day = Math.floor(ts.getTime() / (24 * 60 * 60 * 1000));
  const wave = 0.25 + 0.35 * Math.max(0, Math.sin((hour / 24) * Math.PI * 2));
  const pulse = rand01(`${cfg.seed}:${stationId}:pulse:${day}:${hour}`);
  const burst = pulse > 0.965 ? (pulse - 0.965) * 140 : pulse > 0.93 ? (pulse - 0.93) * 55 : 0;
  const base = (wave + burst) * rain;
  return clamp(Number(base.toFixed(2)), 0, 40);
}

function sumRain(ts: Date, stationId: string, hours: number, cfg: MockSimConfig) {
  const t = new Date(ts);
  let sum = 0;
  for (let i = 0; i < hours; i += 1) {
    sum += rainMmPerH(t, stationId, cfg);
    t.setHours(t.getHours() - 1);
  }
  return Number(sum.toFixed(1));
}

function deviceCatalog(stations: Station[]): Array<Omit<Device, "stationName" | "status" | "lastSeenAt">> {
  const rows: Array<Omit<Device, "stationName" | "status" | "lastSeenAt">> = [];
  const push = (stationId: string, type: DeviceType, name: string, suffix: string) => {
    rows.push({
      id: `${stationId}_${type}_${suffix}`,
      name,
      stationId,
      type
    });
  };

  for (const st of stations) {
    const suf = st.id.slice(-1).toUpperCase();

    // Base sensors (5)
    push(st.id, "gnss", `GNSS-${suf}01`, "01");
    push(st.id, "rain", `雨量计-${suf}01`, "01");
    push(st.id, "tilt", `倾角计-${suf}01`, "01");
    push(st.id, "temp_hum", `温湿度-${suf}01`, "01");
    push(st.id, "camera", `摄像头-${suf}01`, "01");

    // Add redundancy for higher-profile stations (stable by station.deviceCount)
    if (st.deviceCount >= 7) push(st.id, "gnss", `GNSS-${suf}02`, "02");
    if (st.deviceCount >= 8) push(st.id, "tilt", `倾角计-${suf}02`, "02");
    if (st.deviceCount >= 9) push(st.id, "camera", `摄像头-${suf}02`, "02");
  }

  return rows;
}

function makeStations(cfg: MockSimConfig): Station[] {
  // Guabang Mountain (Yulin Normal University, East Campus) – aligns with reference demo data center.
  const baseLat = 22.6847;
  const baseLng = 110.1893;
  const areas = [
    "广西 玉林市 玉林师范学院 东校区 挂傍山监测区域"
  ];

  const defs: Array<{ id: string; name: string; areaIdx: number; dLat: number; dLng: number; baseRisk: RiskLevel; deviceCount: number }> = [
    // Keep all stations clustered on the mountain (within ~500m) to match the exhibition storyline.
    // Reference points: center (22.6847, 110.1893), top (22.6850, 110.1890), foot (22.6844, 110.1896)
    { id: "st_a", name: "挂傍山中心监测站", areaIdx: 0, dLat: 0.0, dLng: 0.0, baseRisk: "high", deviceCount: 9 },
    { id: "st_b", name: "挂傍山坡顶监测点", areaIdx: 0, dLat: 0.0003, dLng: -0.0003, baseRisk: "high", deviceCount: 8 },
    { id: "st_c", name: "挂傍山坡脚基准点", areaIdx: 0, dLat: -0.0003, dLng: 0.0003, baseRisk: "mid", deviceCount: 7 },
    { id: "st_d", name: "挂傍山东侧边坡点", areaIdx: 0, dLat: -0.0001, dLng: 0.0007, baseRisk: "mid", deviceCount: 7 },
    { id: "st_e", name: "挂傍山西侧边坡点", areaIdx: 0, dLat: 0.0001, dLng: -0.0007, baseRisk: "low", deviceCount: 6 },
    { id: "st_f", name: "挂傍山北侧沟谷点", areaIdx: 0, dLat: 0.0007, dLng: 0.0002, baseRisk: "mid", deviceCount: 6 }
  ];

  const simNow = getSimNow(cfg);

  return defs.map((d) => {
    const r24 = sumRain(simNow, d.id, 24, cfg);
    const riskBoost = cfg.scenario === "landslide_warning" && (d.id === "st_a" || d.id === "st_b") ? 1 : 0;
    const rainRisk = r24 >= 55 ? 2 : r24 >= 25 ? 1 : 0;
    const baseScore = d.baseRisk === "high" ? 2 : d.baseRisk === "mid" ? 1 : 0;
    const score = Math.min(2, baseScore + rainRisk + riskBoost);
    const risk: RiskLevel = score >= 2 ? "high" : score >= 1 ? "mid" : "low";

    let status: OnlineStatus = score >= 2 ? "warning" : score >= 1 && r24 >= 30 ? "warning" : "online";
    if (cfg.scenario === "comms_outage" && (d.id === "st_e" || d.id === "st_f")) status = "offline";

    return {
      id: d.id,
      name: d.name,
      area: pick(areas, d.areaIdx),
      risk,
      status,
      lat: Number((baseLat + d.dLat).toFixed(6)),
      lng: Number((baseLng + d.dLng).toFixed(6)),
      deviceCount: d.deviceCount
    };
  });
}

function withStationName(stations: Station[], devices: Array<Omit<Device, "stationName">>): Device[] {
  const byId = new Map(stations.map((s) => [s.id, s] as const));
  return devices.map((d) => ({ ...d, stationName: byId.get(d.stationId)?.name ?? d.stationId }));
}

function computeDeviceStatus(deviceId: string, station: Station, type: DeviceType, cfg: MockSimConfig) {
  const simNow = getSimNow(cfg);
  const hour = Math.floor(simNow.getTime() / (60 * 60 * 1000));
  const comms = scenarioBias(cfg.scenario).comms;
  const stationHot = station.risk === "high" ? 1 : station.risk === "mid" ? 0.6 : 0.25;
  const baseOffline = 0.02 + stationHot * 0.03 + (type === "camera" ? 0.02 : 0) + (type === "gnss" ? 0.01 : 0);
  const offlineProb = clamp(baseOffline * comms, 0, 0.35);
  const offline = rand01(`${cfg.seed}:${deviceId}:offline:${hour}`) < offlineProb;

  const r6 = sumRain(simNow, station.id, 6, cfg);
  const warnProb =
    (station.risk === "high" ? 0.22 : station.risk === "mid" ? 0.14 : 0.08) +
    (type === "rain" ? 0.18 : type === "gnss" ? 0.12 : type === "tilt" ? 0.1 : 0.06) +
    (r6 >= 18 ? 0.2 : r6 >= 8 ? 0.12 : 0);
  const warn = !offline && rand01(`${cfg.seed}:${deviceId}:warn:${hour}`) < clamp(warnProb * scenarioBias(cfg.scenario).slide, 0, 0.65);

  const status: OnlineStatus = offline ? "offline" : warn ? "warning" : "online";

  const minutesAgo = offline ? 80 + Math.round(rand01(`${cfg.seed}:${deviceId}:ago:${hour}`) * 720) : Math.round(rand01(`${cfg.seed}:${deviceId}:ago:${hour}`) * 12);
  const lastSeenAt = new Date(simNow.getTime() - minutesAgo * 60 * 1000).toISOString();

  return { status, lastSeenAt };
}

function makeDevices(cfg: MockSimConfig, stations: Station[]): Device[] {
  const catalog = deviceCatalog(stations);
  const full = catalog.map((d) => {
    const station = stations.find((s) => s.id === d.stationId)!;
    const { status, lastSeenAt } = computeDeviceStatus(d.id, station, d.type, cfg);
    return { ...d, status, lastSeenAt };
  });
  return withStationName(stations, full);
}

function loadBaselines(cfg: MockSimConfig, devices: Device[], stations: Station[]): Baseline[] {
  const raw = localStorage.getItem(BASELINES_KEY);
  const parsed = raw ? safeJsonParse<BaselineStore>(raw) : null;
  if (parsed?.version === 1 && Array.isArray(parsed.baselines)) return parsed.baselines;

  const stationById = new Map(stations.map((s) => [s.id, s] as const));
  const gnss = devices.filter((d) => d.type === "gnss");
  const simNow = getSimNow(cfg);

  const baselines: Baseline[] = gnss.map((d, idx) => {
    const st = stationById.get(d.stationId);
    const jitterLat = (rand01(`${cfg.seed}:${d.id}:bLat`) - 0.5) * 0.0002;
    const jitterLng = (rand01(`${cfg.seed}:${d.id}:bLng`) - 0.5) * 0.0002;
    const baselineLat = Number(((st?.lat ?? 22.6263) + jitterLat).toFixed(6));
    const baselineLng = Number(((st?.lng ?? 110.1805) + jitterLng).toFixed(6));
    const baselineAlt = 88 + idx * 3 + Math.round(rand01(`${cfg.seed}:${d.id}:alt`) * 6);
    return {
      deviceId: d.id,
      deviceName: d.name,
      baselineLat,
      baselineLng,
      baselineAlt,
      establishedBy: "mock",
      establishedTime: new Date(simNow.getTime() - (2 + idx) * 24 * 60 * 60 * 1000).toISOString(),
      status: "active",
      notes: "展厅演示：基线为仿真数据"
    };
  });

  localStorage.setItem(BASELINES_KEY, JSON.stringify({ version: 1, baselines }));
  return baselines;
}

function saveBaselines(baselines: Baseline[]) {
  localStorage.setItem(BASELINES_KEY, JSON.stringify({ version: 1, baselines }));
}

function makeWeeklyTrend(cfg: MockSimConfig, stations: Station[]) {
  const simNow = getSimNow(cfg);
  const labels: string[] = [];
  const rainfallMm: number[] = [];
  const alertCount: number[] = [];

  const days = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

  for (let back = 6; back >= 0; back -= 1) {
    const dayStart = new Date(simNow);
    dayStart.setHours(0, 0, 0, 0);
    dayStart.setDate(dayStart.getDate() - back);
    const dayIdx = dayStart.getDay();
    labels.push(days[dayIdx] ?? `D${dayIdx}`);

    const station = stations[0] ?? { id: "st_a" } as Station;
    let sum = 0;
    let warnHours = 0;
    for (let h = 0; h < 24; h += 1) {
      const t = new Date(dayStart);
      t.setHours(h, 0, 0, 0);
      const mmh = rainMmPerH(t, station.id, cfg);
      sum += mmh;
      if (mmh >= 3.8) warnHours += 1;
    }
    rainfallMm.push(Number(sum.toFixed(1)));
    alertCount.push(Math.min(6, Math.round(warnHours / 4)));
  }

  return { labels, rainfallMm, alertCount } satisfies WeeklyTrend;
}

function makeSummary(stations: Station[], devices: Device[]): DashboardSummary {
  const deviceOnlineCount = devices.filter((d) => d.status === "online").length;
  const alertCountToday = devices.filter((d) => d.status === "warning").length;
  const systemHealthPercent = clamp(92 + deviceOnlineCount - alertCountToday * 3 - devices.filter((d) => d.status === "offline").length * 2, 0, 100);

  return {
    stationCount: stations.length,
    deviceOnlineCount,
    alertCountToday,
    systemHealthPercent
  };
}

function makeSystemStatus(cfg: MockSimConfig, devices: Device[]): SystemStatus {
  const warn = devices.filter((d) => d.status === "warning").length;
  const offline = devices.filter((d) => d.status === "offline").length;
  const load = clamp((warn * 6 + offline * 4) / Math.max(1, devices.length), 0, 1);
  const cpuPercent = clamp(Math.round(28 + load * 55 + rand01(`${cfg.seed}:cpu:${Math.floor(Date.now() / 60000)}`) * 6), 5, 99);
  const memPercent = clamp(Math.round(46 + load * 42 + rand01(`${cfg.seed}:mem:${Math.floor(Date.now() / 60000)}`) * 5), 10, 99);
  const diskPercent = clamp(Math.round(63 + load * 18), 15, 99);
  return { cpuPercent, memPercent, diskPercent };
}

function gpsGeneratePoints(cfg: MockSimConfig, station: Station, deviceId: string, days: number): GpsPoint[] {
  const simNow = getSimNow(cfg);
  const points: GpsPoint[] = [];

  const totalMinutes = Math.max(60, Math.round(days * 24 * 60));
  const maxPoints = days <= 1 ? 360 : 240;
  const baseStepMinutes = days <= 1 ? 5 : days <= 7 ? 30 : 60;
  const stepMinutes = Math.max(baseStepMinutes, Math.ceil(totalMinutes / maxPoints / baseStepMinutes) * baseStepMinutes);
  const stepHours = stepMinutes / 60;

  const start = new Date(simNow.getTime() - (totalMinutes - stepMinutes) * 60 * 1000);
  start.setSeconds(0, 0);

  const base = (rand01(`${cfg.seed}:${deviceId}:base`) * 8 + (station.risk === "high" ? 10 : station.risk === "mid" ? 6 : 3)) * scenarioBias(cfg.scenario).slide;
  let v = base;
  const rate = baseRateMmPerH(station.risk) * scenarioBias(cfg.scenario).slide;

  for (let m = 0; m < totalMinutes; m += stepMinutes) {
    const ts = new Date(start.getTime() + m * 60 * 1000);
    let delta = rate * stepHours;

    // Rainfall effect (approx): use current mm/h as instantaneous intensity.
    const mmh = rainMmPerH(ts, station.id, cfg);
    delta += mmh * (station.risk === "high" ? 0.06 : station.risk === "mid" ? 0.035 : 0.02) * stepHours;

    const hourKey = Math.floor(ts.getTime() / (60 * 60 * 1000));
    const noise = (rand01(`${cfg.seed}:${deviceId}:n:${hourKey}`) - 0.5) * 0.22 * stepHours;
    delta += noise;

    if (cfg.scenario === "landslide_warning" && station.id === "st_a" && ts.getHours() >= 18 && ts.getHours() <= 22) {
      delta += 0.5 * stepHours;
    }

    v = Math.max(0, v + delta);
    points.push({ ts: isoAt(ts), dispMm: Number(v.toFixed(2)) });
  }

  return points;
}

export type MockWorld = {
  config: MockSimConfig;
  simNow: Date;
  stations: Station[];
  devices: Device[];
  baselines: Baseline[];
  weeklyTrend: WeeklyTrend;
  summary: DashboardSummary;
  systemStatus: SystemStatus;
  getGpsSeries: (deviceId: string, days: number) => GpsSeries;
  upsertBaseline: (input: Omit<Baseline, "deviceName" | "establishedTime"> & { establishedTime?: string }) => Baseline;
  removeBaseline: (deviceId: string) => void;
};

export function createMockWorld(config?: MockSimConfig): MockWorld {
  const cfg = config ?? loadMockSimConfig();
  const simNow = getSimNow(cfg);
  const stations = makeStations(cfg);
  const devices = makeDevices(cfg, stations);
  let baselines = loadBaselines(cfg, devices, stations);

  const weeklyTrend = makeWeeklyTrend(cfg, stations);
  const summary = makeSummary(stations, devices);
  const systemStatus = makeSystemStatus(cfg, devices);

  const getGpsSeries = (deviceId: string, days: number): GpsSeries => {
    const device = devices.find((d) => d.id === deviceId) ?? devices.find((d) => d.type === "gnss") ?? devices[0] ?? null;
    const station = stations.find((s) => s.id === device?.stationId) ?? stations[0] ?? null;
    if (!device || !station) {
      return { deviceId, deviceName: deviceId, points: [] };
    }
    const points = gpsGeneratePoints(cfg, station, device.id, days);
    return { deviceId: device.id, deviceName: device.name, points };
  };

  const upsertBaseline = (input: Omit<Baseline, "deviceName" | "establishedTime"> & { establishedTime?: string }): Baseline => {
    const device = devices.find((d) => d.id === input.deviceId);
    const establishedTime = input.establishedTime ?? nowIso();

    const next: Baseline = {
      deviceId: input.deviceId,
      deviceName: device?.name ?? input.deviceId,
      baselineLat: input.baselineLat,
      baselineLng: input.baselineLng,
      establishedBy: input.establishedBy,
      establishedTime,
      status: input.status,
      ...(input.baselineAlt !== undefined ? { baselineAlt: input.baselineAlt } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {})
    };

    const idx = baselines.findIndex((b) => b.deviceId === input.deviceId);
    baselines = idx >= 0 ? baselines.map((b) => (b.deviceId === input.deviceId ? next : b)) : [...baselines, next];
    saveBaselines(baselines);
    return next;
  };

  const removeBaseline = (deviceId: string) => {
    baselines = baselines.filter((b) => b.deviceId !== deviceId);
    saveBaselines(baselines);
  };

  return {
    config: cfg,
    simNow,
    stations,
    devices,
    baselines,
    weeklyTrend,
    summary,
    systemStatus,
    getGpsSeries,
    upsertBaseline,
    removeBaseline
  };
}
