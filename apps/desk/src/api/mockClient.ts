import type {
  ApiClient,
  Baseline,
  DashboardSummary,
  Device,
  EffectiveSuccessNotificationPolicy,
  GpsSeries,
  GpsDerivedAnalysis,
  SuccessNotificationPolicy,
  DeviceType,
  Station,
  StationManagementStation,
  SystemStatus,
  WeeklyTrend
} from "./client";
import { addDays, clamp, nowIso, sleep } from "./mockUtils";

type MockOptions = {
  delayMs?: number;
  failureRate?: number;
};

function stablePercent(seed: string, min: number, max: number): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const t = (h >>> 0) / 4294967295;
  return Math.round(min + t * (max - min));
}

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

function makeStationManagementStations(stations: Station[], devices: Device[]): StationManagementStation[] {
  return stations.map((station) => {
    const stationDevices = devices.filter((device) => device.stationId === station.id);
    const sensorTypes = Array.from(new Set(stationDevices.map((device) => device.type))) as DeviceType[];
    const lastDataTime = stationDevices.map((device) => device.lastSeenAt).sort().at(-1) ?? nowIso();
    return {
      stationId: station.id,
      stationCode: station.id.toUpperCase(),
      stationName: station.name,
      locationName: station.area,
      description: `用于统一管理 ${station.name} 的监测站配置与传感器设置。`,
      chartLegendName: station.name,
      riskLevel: station.risk,
      status: station.status,
      lat: station.lat,
      lng: station.lng,
      deviceCount: stationDevices.length,
      sensorTypes,
      lastDataTime,
      updatedAt: nowIso()
    };
  });
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
    alertCount: [1, 0, 2, 0, 1, 3, 1],
    source: "mock_sample",
    note: "当前为 Mock 示例趋势，仅用于本地演示。"
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
    source: "mock_summary",
    note: "当前为 Mock 健康摘要，仅用于本地演示。",
    items: [
      { key: "postgres", label: "PostgreSQL", status: "healthy", detail: "healthy" },
      { key: "clickhouse", label: "ClickHouse", status: "healthy", detail: "healthy" },
      { key: "kafka", label: "Kafka", status: "healthy", detail: "configured" }
    ]
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

function makeGpsDerivedAnalysis(devices: Device[], deviceId: string, rangeLabel: string): GpsDerivedAnalysis {
  const days = rangeLabel.endsWith("d") ? Number.parseInt(rangeLabel, 10) : 7;
  const series = makeGpsSeries(devices, deviceId, Number.isFinite(days) ? days : 7);
  const values = series.points.map((point) => point.dispMm / 1000);
  const imf1 = values.map((_, idx) => Number((Math.sin(idx / 2) * 0.4).toFixed(3)));
  const imf2 = values.map((_, idx) => Number((Math.sin(idx / 4) * 0.7).toFixed(3)));
  const imf3 = values.map((_, idx) => Number((Math.sin(idx / 10) * 1.0).toFixed(3)));
  const residue = values.map((value) => Number((value * 0.12 * 1000).toFixed(3)));
  const last = series.points.at(-1)?.dispMm ?? 0;
  const slope = series.points.length > 1 ? (last - (series.points.at(-2)?.dispMm ?? last)) : 0;
  return {
    deviceId,
    hasBaseline: true,
    qualityScore: 0.84,
    trendDiagnostics: {
      direction: slope > 0.05 ? "increasing" : slope < -0.05 ? "decreasing" : "stable",
      changeMm: Number((last - (series.points[0]?.dispMm ?? last)).toFixed(3)),
      slopeMmPerHour: Number(slope.toFixed(4)),
      durationHours: days * 24,
      regressionFitR2: 0.93,
      accelerationMmPerHour2: Number((slope / 6).toFixed(5)),
      averageStepMm: Number(slope.toFixed(4)),
      volatilityMm: 0.42,
      sampleIntervalSeconds: 3600
    },
    ceemd: {
      imfs: [imf1, imf2, imf3],
      residue,
      energyDistribution: [0.28, 0.33, 0.24, 0.15],
      dominantFrequencies: [0.0018, 0.0008, 0.0003],
      qualityScore: 0.84,
      reconstructionError: 0.08,
      orthogonality: 0.91
    },
    prediction: {
      confidence: 0.81,
      shortTerm: Array.from({ length: 12 }, (_v, idx) => Number((last + slope * (idx + 1)).toFixed(2))),
      longTerm: Array.from({ length: 14 }, (_v, idx) => Number((last + slope * 3 * (idx + 1)).toFixed(2))),
      thresholdForecast: {
        thresholdsMm: {
          blue: 2,
          yellow: 5,
          red: 8
        },
        shortTerm: {
          blue: { breached: true, firstIndex: 1, firstValue: Number((last + slope).toFixed(2)), etaHours: 1, etaDays: 0.042, firstTimestamp: addDays(nowIso(), 1 / 24) },
          yellow: { breached: last >= 5, firstIndex: last >= 5 ? 1 : null, firstValue: last >= 5 ? Number((last + slope).toFixed(2)) : null, etaHours: last >= 5 ? 1 : null, etaDays: last >= 5 ? 0.042 : null, firstTimestamp: last >= 5 ? addDays(nowIso(), 1 / 24) : null },
          red: { breached: false, firstIndex: null, firstValue: null, etaHours: null, etaDays: null, firstTimestamp: null }
        },
        longTerm: {
          blue: { breached: true, firstIndex: 1, firstValue: Number((last + slope * 3).toFixed(2)), etaHours: 1, etaDays: 0.042, firstTimestamp: addDays(nowIso(), 1 / 24) },
          yellow: { breached: true, firstIndex: 3, firstValue: Number((last + slope * 9).toFixed(2)), etaHours: 3, etaDays: 0.125, firstTimestamp: addDays(nowIso(), 3 / 24) },
          red: { breached: false, firstIndex: null, firstValue: null, etaHours: null, etaDays: null, firstTimestamp: null }
        }
      },
      confidenceIntervals: {
        shortTermLower: Array.from({ length: 12 }, (_v, idx) => Number((last + slope * (idx + 1) - 0.8).toFixed(2))),
        shortTermUpper: Array.from({ length: 12 }, (_v, idx) => Number((last + slope * (idx + 1) + 0.8).toFixed(2))),
        longTermLower: Array.from({ length: 14 }, (_v, idx) => Number((last + slope * 3 * (idx + 1) - 1.8).toFixed(2))),
        longTermUpper: Array.from({ length: 14 }, (_v, idx) => Number((last + slope * 3 * (idx + 1) + 1.8).toFixed(2)))
      }
    }
  };
}

function deriveSuccessNotificationPolicy(input: {
  notifyOnAck?: boolean;
  successNotificationPolicy?: SuccessNotificationPolicy;
}): {
  notifyOnAck: boolean;
  successNotificationPolicy: SuccessNotificationPolicy;
  effectiveSuccessNotificationPolicy: EffectiveSuccessNotificationPolicy;
} {
  const successNotificationPolicy =
    input.successNotificationPolicy ?? (input.notifyOnAck ? "always_notify" : "silent");
  const effectiveSuccessNotificationPolicy =
    successNotificationPolicy === "inherit" ? (input.notifyOnAck ? "always_notify" : "silent") : successNotificationPolicy;
  return {
    notifyOnAck: Boolean(input.notifyOnAck ?? effectiveSuccessNotificationPolicy === "always_notify"),
    successNotificationPolicy,
    effectiveSuccessNotificationPolicy
  };
}

export function createMockClient(options: MockOptions = {}): ApiClient {
  const delayMs = options.delayMs ?? 200;
  const failureRate = clamp(options.failureRate ?? 0, 0, 1);
  const stations = makeStations();
  const devices = makeDevices(stations);
  let stationManagementStations = makeStationManagementStations(stations, devices);
  const weeklyTrend = makeWeeklyTrend();
  const summary = makeSummary(stations, devices);
  const systemStatus = makeSystemStatus();
  let systemConfigs = [
    {
      key: "gps.displacement_threshold_blue_mm",
      value: "2",
      type: "number",
      description: "GPS 蓝色预警阈值（mm）",
      updatedAt: nowIso()
    },
    {
      key: "gps.displacement_threshold_yellow_mm",
      value: "5",
      type: "number",
      description: "GPS 黄色预警阈值（mm）",
      updatedAt: nowIso()
    },
    {
      key: "gps.displacement_threshold_red_mm",
      value: "8",
      type: "number",
      description: "GPS 红色预警阈值（mm）",
      updatedAt: nowIso()
    },
    {
      key: "gps.data_limit",
      value: "200",
      type: "number",
      description: "GPS 数据点数限制",
      updatedAt: nowIso()
    }
  ];
  let baselines = makeBaselines(devices, stations);
  let commands: Array<{
    commandId: string;
    deviceId: string;
    commandType: string;
    payload: Record<string, unknown>;
    notifyOnAck: boolean;
    successNotificationPolicy: SuccessNotificationPolicy;
    effectiveSuccessNotificationPolicy: EffectiveSuccessNotificationPolicy;
    status: "queued" | "sent" | "acked" | "failed" | "timeout" | "canceled";
    createdAt: string;
    updatedAt: string;
  }> = [];

  const afterDelay = async (endpoint: string) => {
    await sleep(delayMs);
    if (failureRate <= 0) return;
    if (Math.random() < failureRate) {
      throw new Error(`Mock 故障注入：${endpoint}`);
    }
  };

  const upsertBaseline: ApiClient["baselines"]["upsert"] = async (input) => {
    await afterDelay("baselines.upsert");
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

    if (input.persist !== false) {
      const idx = baselines.findIndex((b) => b.deviceId === input.deviceId);
      if (idx >= 0) baselines = baselines.map((b) => (b.deviceId === input.deviceId ? next : b));
      else baselines = [...baselines, next];
    }
    return next;
  };

  return {
    auth: {
      async login(input) {
        await afterDelay("auth.login");
        const name = "username" in input ? input.username : input.mobile;
        return {
          token: `mock-token-${String(Date.now())}`,
          refreshToken: `mock-refresh-${String(Date.now())}`,
          user: { id: "u_admin", name, role: "admin" }
        };
      },
      async logout() {
        await afterDelay("auth.logout");
      }
    },
    dashboard: {
      async getSummary() {
        await afterDelay("dashboard.getSummary");
        return summary;
      },
      async getWeeklyTrend() {
        await afterDelay("dashboard.getWeeklyTrend");
        return weeklyTrend;
      }
    },
    stations: {
      async list() {
        await afterDelay("stations.list");
        return stations;
      },
      async listManagement() {
        await afterDelay("stations.listManagement");
        return stationManagementStations;
      },
      async updateManagement(input) {
        await afterDelay("stations.updateManagement");
        const updatedAt = nowIso();
        stationManagementStations = stationManagementStations.map((station) =>
          station.stationId === input.stationId
            ? {
                ...station,
                stationName: input.stationName,
                locationName: input.locationName,
                description: input.description,
                chartLegendName: input.chartLegendName,
                riskLevel: input.riskLevel,
                status: input.status,
                sensorTypes: input.sensorTypes,
                updatedAt
              }
            : station
        );
        return { stationId: input.stationId, updatedAt };
      },
      async updateLegendNames(input) {
        await afterDelay("stations.updateLegendNames");
        let updated = 0;
        stationManagementStations = stationManagementStations.map((station) => {
          const nextLegend = input.legends[station.stationId];
          if (!nextLegend || !nextLegend.trim()) return station;
          updated += 1;
          return {
            ...station,
            chartLegendName: nextLegend.trim(),
            updatedAt: nowIso()
          };
        });
        return { updated };
      }
    },
    devices: {
      async list(input) {
        await afterDelay("devices.list");
        if (!input?.stationId) return devices;
        return devices.filter((d) => d.stationId === input.stationId);
      },
      async issueCommand(input) {
        await afterDelay("devices.issueCommand");
        const createdAt = nowIso();
        const commandId = `mock-cmd-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
        const successPolicy = deriveSuccessNotificationPolicy(input);
        commands = [
          {
            commandId,
            deviceId: input.deviceId,
            commandType: input.commandType,
            payload: input.payload,
            ...successPolicy,
            status: "queued",
            createdAt,
            updatedAt: createdAt
          },
          ...commands
        ];
        return { commandId, status: "queued" as const, ...successPolicy };
      },
      async listCommands(input) {
        await afterDelay("devices.listCommands");
        return commands.filter((item) => item.deviceId === input.deviceId);
      },
      async getHealthExpert(input) {
        await afterDelay("devices.getHealthExpert");
        const device = devices.find((item) => item.id === input.deviceId);
        const battery = stablePercent(`${input.deviceId}-battery`, 18, 100);
        const signal = stablePercent(`${input.deviceId}-signal`, 25, 100);
        const freshness = device?.status === "online" ? 100 : device?.status === "warning" ? 45 : 10;
        const score = Math.round(0.4 * battery + 0.3 * signal + 0.3 * freshness);
        const level = score >= 80 ? "good" : score >= 50 ? "warn" : "bad";
        return {
          deviceId: input.deviceId,
          metric: input.metric ?? "all",
          runId: `mock-expert-${Date.now()}`,
          result: {
            analysisType: "mock_expert_v1",
            battery: {
              soc: battery,
              voltage: 3.9,
              temperatureC: 21,
              confidence: 0.8,
              warnings: battery < 20 ? ["battery low"] : []
            },
            signal: {
              rssi: -72,
              strength: signal,
              confidence: 0.8,
              warnings: signal < 40 ? ["signal weak"] : []
            },
            health: {
              score,
              level,
              components: {
                batteryScore: battery,
                signalScore: signal,
                dataFreshnessScore: freshness
              },
              warnings: level === "bad" ? ["data stale"] : []
            },
            metadata: {
              apiVersion: "mock",
              analysisMethod: "mock_expert_v1",
              calculationTime: nowIso(),
              cacheUsed: false
            }
          }
        };
      }
    },
    telemetry: {
      async getSeries(input) {
        await afterDelay("telemetry.getSeries");
        return Array.from({ length: 12 }, (_, idx) => ({
          ts: addDays(nowIso(), idx - 11),
          value: stablePercent(`${input.deviceId}-${input.sensorKey}-${idx}`, 1, 100) / 10
        }));
      }
    },
    gps: {
      async getSeries(input) {
        await afterDelay("gps.getSeries");
        return makeGpsSeries(devices, input.deviceId, input.days ?? 7);
      },
      async getDerivedAnalysis(input) {
        await afterDelay("gps.getDerivedAnalysis");
        return makeGpsDerivedAnalysis(devices, input.deviceId, input.rangeLabel ?? "7d");
      }
    },
    baselines: {
      async list() {
        await afterDelay("baselines.list");
        return baselines;
      },
      upsert: upsertBaseline,
      async remove(input) {
        await afterDelay("baselines.remove");
        baselines = baselines.filter((b) => b.deviceId !== input.deviceId);
      },
      async autoEstablish(input) {
        await afterDelay("baselines.autoEstablish");
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
          notes: "auto established",
          ...(input.persist === undefined ? {} : { persist: input.persist })
        });
      }
    },
    system: {
      async getStatus() {
        await afterDelay("system.getStatus");
        return systemStatus;
      },
      async getConfigs() {
        await afterDelay("system.getConfigs");
        return systemConfigs;
      },
      async updateConfigs(input) {
        await afterDelay("system.updateConfigs");
        const stamp = nowIso();
        const updates = new Map(input.configs.map((item) => [item.key, item.value] as const));
        let updated = 0;
        systemConfigs = systemConfigs.map((item) => {
          if (!updates.has(item.key)) return item;
          updated += 1;
          return {
            ...item,
            value: updates.get(item.key) ?? item.value,
            updatedAt: stamp
          };
        });
        return { updated };
      },
      async getCommandSuccessNotificationPolicy() {
        await afterDelay("system.getCommandSuccessNotificationPolicy");
        return {
          systemDefault: "silent" as const,
          commandTypeDefaults: {
            set_config: "always_notify" as const,
            reboot: "always_notify" as const,
            restart_device: "always_notify" as const,
            deactivate_device: "always_notify" as const
          }
        };
      },
      async updateCommandSuccessNotificationPolicy(input) {
        await afterDelay("system.updateCommandSuccessNotificationPolicy");
        return input;
      },
      async getOperationLogs(input) {
        await afterDelay("system.getOperationLogs");
        return {
          page: input.page,
          pageSize: input.pageSize,
          total: 1,
          list: [
            {
              id: "mock-op-1",
              userId: "u_admin",
              username: "mock-admin",
              module: "system",
              action: "update_command_success_notification_policy",
              targetType: "",
              targetId: "",
              description: "update command success notification policy",
              requestData: {
                previousPolicy: {
                  systemDefault: "silent",
                  commandTypeDefaults: {}
                },
                nextPolicy: {
                  systemDefault: "silent",
                  commandTypeDefaults: {
                    set_config: "always_notify"
                  }
                }
              },
              responseData: {
                updatedPolicy: {
                  systemDefault: "silent",
                  commandTypeDefaults: {
                    set_config: "always_notify"
                  }
                }
              },
              ipAddress: "127.0.0.1",
              userAgent: "mock-client",
              status: "success",
              errorMessage: "",
              createdAt: nowIso()
            }
          ]
        };
      }
    }
  };
}
