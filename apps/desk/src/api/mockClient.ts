import type {
  ApiClient,
  Baseline,
  DashboardSummary,
  Device,
  GpsSeries,
  Station,
  SystemStatus,
  WeeklyTrend
} from "./client";
import { addDays, clamp, nowIso, sleep } from "./mockUtils";

type MockOptions = {
  delayMs?: number;
};

function makeStations(): Station[] {
  return [
    {
      id: "station_a",
      name: "滑坡点 A",
      area: "XX 省 XX 市",
      risk: "high",
      status: "warning",
      lat: 30.65984,
      lng: 104.06335,
      deviceCount: 8
    },
    {
      id: "station_b",
      name: "滑坡点 B",
      area: "XX 省 XX 市",
      risk: "mid",
      status: "online",
      lat: 30.57227,
      lng: 104.06654,
      deviceCount: 6
    },
    {
      id: "station_c",
      name: "滑坡点 C",
      area: "XX 省 XX 市",
      risk: "low",
      status: "online",
      lat: 30.54518,
      lng: 104.07966,
      deviceCount: 4
    }
  ];
}

function makeDevices(stations: Station[]): Device[] {
  const byId = new Map(stations.map((s) => [s.id, s] as const));
  const mk = (d: Omit<Device, "stationName">): Device => ({
    ...d,
    stationName: byId.get(d.stationId)?.name ?? d.stationId
  });

  return [
    mk({
      id: "device_gnss_01",
      name: "GNSS-01",
      stationId: "station_a",
      type: "gnss",
      status: "online",
      lastSeenAt: nowIso()
    }),
    mk({
      id: "device_rain_01",
      name: "雨量计-01",
      stationId: "station_a",
      type: "rain",
      status: "warning",
      lastSeenAt: nowIso()
    }),
    mk({
      id: "device_tilt_02",
      name: "倾角计-02",
      stationId: "station_b",
      type: "tilt",
      status: "offline",
      lastSeenAt: addDays(nowIso(), -1)
    }),
    mk({
      id: "device_th_03",
      name: "温湿度-03",
      stationId: "station_b",
      type: "temp_hum",
      status: "online",
      lastSeenAt: nowIso()
    }),
    mk({
      id: "device_cam_01",
      name: "摄像头-01",
      stationId: "station_c",
      type: "camera",
      status: "online",
      lastSeenAt: nowIso()
    })
  ];
}

function makeWeeklyTrend(): WeeklyTrend {
  return {
    labels: ["周一", "周二", "周三", "周四", "周五", "周六", "周日"],
    rainfallMm: [12, 8, 15, 6, 9, 18, 11],
    alertCount: [1, 0, 2, 0, 1, 3, 1]
  };
}

function makeBaselines(devices: Device[], stations: Station[]): Baseline[] {
  const stationById = new Map(stations.map((s) => [s.id, s] as const));
  const gnss = devices.filter((d) => d.type === "gnss");

  return gnss.map((d, idx) => {
    const st = stationById.get(d.stationId);
    const baseLat = (st?.lat ?? 30.6) + (idx - 1) * 0.00015;
    const baseLng = (st?.lng ?? 104.06) + (idx - 1) * 0.0002;
    return {
      deviceId: d.id,
      deviceName: d.name,
      baselineLat: Number(baseLat.toFixed(6)),
      baselineLng: Number(baseLng.toFixed(6)),
      baselineAlt: 510 + idx * 2,
      establishedBy: "mock",
      establishedTime: addDays(nowIso(), -idx),
      status: "active",
      notes: "mock baseline"
    };
  });
}

function makeSummary(stations: Station[], devices: Device[]): DashboardSummary {
  const deviceOnlineCount = devices.filter((d) => d.status === "online").length;
  const alertCountToday = devices.filter((d) => d.status === "warning").length;
  const systemHealthPercent = clamp(90 + deviceOnlineCount - alertCountToday * 2, 0, 100);

  return {
    stationCount: stations.length,
    deviceOnlineCount,
    alertCountToday,
    systemHealthPercent
  };
}

function makeSystemStatus(): SystemStatus {
  return {
    cpuPercent: 32,
    memPercent: 58,
    diskPercent: 71
  };
}

function makeGpsSeries(devices: Device[], deviceId: string, days: number): GpsSeries {
  const device = devices.find((d) => d.id === deviceId) ?? devices[0];
  const pointsCount = Math.max(16, Math.min(200, days * 24));

  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - days + 1);

  let v = 0;
  const points = Array.from({ length: pointsCount }, (_, idx) => {
    const ts = new Date(start.getTime() + (idx * days * 24 * 60 * 60 * 1000) / pointsCount).toISOString();
    v += Math.random() * 0.8;
    return { ts, dispMm: Number(v.toFixed(2)) };
  });

  return {
    deviceId,
    deviceName: device?.name ?? deviceId,
    points
  };
}

export function createMockClient(options: MockOptions = {}): ApiClient {
  const delayMs = options.delayMs ?? 200;
  const stations = makeStations();
  const devices = makeDevices(stations);
  const weeklyTrend = makeWeeklyTrend();
  const summary = makeSummary(stations, devices);
  const systemStatus = makeSystemStatus();
  let baselines = makeBaselines(devices, stations);

  const upsertBaseline: ApiClient["baselines"]["upsert"] = async (input) => {
    await sleep(delayMs);
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
    if (idx >= 0) baselines = baselines.map((b) => (b.deviceId === input.deviceId ? next : b));
    else baselines = [...baselines, next];
    return next;
  };

  return {
    auth: {
      async login(input) {
        await sleep(delayMs);
        const name = "username" in input ? input.username : input.mobile;
        return {
          token: `mock-token-${String(Date.now())}`,
          user: { id: "u_admin", name, role: "admin" }
        };
      },
      async logout() {
        await sleep(delayMs);
      }
    },
    dashboard: {
      async getSummary() {
        await sleep(delayMs);
        return summary;
      },
      async getWeeklyTrend() {
        await sleep(delayMs);
        return weeklyTrend;
      }
    },
    stations: {
      async list() {
        await sleep(delayMs);
        return stations;
      }
    },
    devices: {
      async list(input) {
        await sleep(delayMs);
        if (!input?.stationId) return devices;
        return devices.filter((d) => d.stationId === input.stationId);
      }
    },
    gps: {
      async getSeries(input) {
        await sleep(delayMs);
        return makeGpsSeries(devices, input.deviceId, input.days ?? 7);
      }
    },
    baselines: {
      async list() {
        await sleep(delayMs);
        return baselines;
      },
      upsert: upsertBaseline,
      async remove(input) {
        await sleep(delayMs);
        baselines = baselines.filter((b) => b.deviceId !== input.deviceId);
      },
      async autoEstablish(input) {
        const device = devices.find((d) => d.id === input.deviceId);
        const st = stations.find((s) => s.id === device?.stationId);
        const lat = Number(((st?.lat ?? 30.6) + (Math.random() - 0.5) * 0.0006).toFixed(6));
        const lng = Number(((st?.lng ?? 104.06) + (Math.random() - 0.5) * 0.0006).toFixed(6));
        return upsertBaseline({
          deviceId: input.deviceId,
          baselineLat: lat,
          baselineLng: lng,
          baselineAlt: 510,
          establishedBy: "auto(mock)",
          status: "active",
          notes: "auto established"
        });
      }
    },
    system: {
      async getStatus() {
        await sleep(delayMs);
        return systemStatus;
      }
    }
  };
}
