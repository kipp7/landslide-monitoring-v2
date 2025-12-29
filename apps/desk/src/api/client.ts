export type ApiMode = "mock" | "http";

export type RiskLevel = "low" | "mid" | "high";
export type OnlineStatus = "online" | "offline" | "warning";

export type User = {
  id: string;
  name: string;
  role: "admin" | "viewer";
};

export type DashboardSummary = {
  stationCount: number;
  deviceOnlineCount: number;
  alertCountToday: number;
  systemHealthPercent: number;
};

export type WeeklyTrend = {
  labels: string[];
  rainfallMm: number[];
  alertCount: number[];
};

export type Station = {
  id: string;
  name: string;
  area: string;
  risk: RiskLevel;
  status: OnlineStatus;
  lat: number;
  lng: number;
  deviceCount: number;
};

export type DeviceType = "gnss" | "rain" | "tilt" | "temp_hum" | "camera";

export type Device = {
  id: string;
  name: string;
  stationId: string;
  stationName: string;
  type: DeviceType;
  status: OnlineStatus;
  lastSeenAt: string;
};

export type GpsPoint = {
  ts: string;
  dispMm: number;
};

export type GpsSeries = {
  deviceId: string;
  deviceName: string;
  points: GpsPoint[];
};

export type BaselineStatus = "active" | "missing" | "draft";

export type Baseline = {
  deviceId: string;
  deviceName: string;
  baselineLat: number;
  baselineLng: number;
  baselineAlt?: number;
  establishedBy: string;
  establishedTime: string;
  status: BaselineStatus;
  notes?: string;
};

export type SystemStatus = {
  cpuPercent: number;
  memPercent: number;
  diskPercent: number;
};

export type ApiClient = {
  auth: {
    login: (input: { username: string; password: string } | { mobile: string; code: string }) => Promise<{
      token: string;
      user: User;
    }>;
    logout: () => Promise<void>;
  };
  dashboard: {
    getSummary: () => Promise<DashboardSummary>;
    getWeeklyTrend: () => Promise<WeeklyTrend>;
  };
  stations: {
    list: () => Promise<Station[]>;
  };
  devices: {
    list: (input?: { stationId?: string }) => Promise<Device[]>;
  };
  gps: {
    getSeries: (input: { deviceId: string; days?: number }) => Promise<GpsSeries>;
  };
  baselines: {
    list: () => Promise<Baseline[]>;
    upsert: (input: Omit<Baseline, "deviceName" | "establishedTime"> & { establishedTime?: string }) => Promise<Baseline>;
    remove: (input: { deviceId: string }) => Promise<void>;
    autoEstablish: (input: { deviceId: string }) => Promise<Baseline>;
  };
  system: {
    getStatus: () => Promise<SystemStatus>;
  };
};
