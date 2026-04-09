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
  source: "mock_sample" | "derived_summary";
  note: string;
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

export type StationManagementStation = {
  stationId: string;
  stationCode: string;
  stationName: string;
  locationName: string;
  description: string;
  chartLegendName: string;
  riskLevel: RiskLevel;
  status: OnlineStatus;
  lat: number;
  lng: number;
  altitude?: number;
  deviceCount: number;
  sensorTypes: DeviceType[];
  lastDataTime: string;
  updatedAt?: string;
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

export type DeviceStateSnapshot = {
  deviceId: string;
  updatedAt: string;
  metrics: Record<string, unknown>;
  meta: Record<string, unknown>;
};

export type DeviceCommandStatus = "queued" | "sent" | "acked" | "failed" | "timeout" | "canceled";
export type SuccessNotificationPolicy = "inherit" | "silent" | "always_notify";
export type EffectiveSuccessNotificationPolicy = Exclude<SuccessNotificationPolicy, "inherit">;

export type DeviceCommand = {
  commandId: string;
  deviceId: string;
  commandType: string;
  payload: Record<string, unknown>;
  notifyOnAck: boolean;
  successNotificationPolicy: SuccessNotificationPolicy;
  effectiveSuccessNotificationPolicy: EffectiveSuccessNotificationPolicy;
  status: DeviceCommandStatus;
  sentAt?: string;
  ackedAt?: string;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
};

export type TelemetrySeriesPoint = {
  ts: string;
  value: number;
};

export type DeviceHealthExpertResult = {
  deviceId: string;
  metric: "all" | "battery" | "health" | "signal";
  runId: string;
  cachedAt?: string;
  result: {
    analysisType: string;
    battery?: {
      soc: number;
      voltage: number | null;
      temperatureC: number | null;
      confidence: number;
      warnings: string[];
    };
    signal?: {
      rssi: number | null;
      strength: number;
      confidence: number;
      warnings: string[];
    };
    health?: {
      score: number;
      level: "good" | "warn" | "bad";
      components: {
        batteryScore: number;
        signalScore: number;
        dataFreshnessScore: number;
      };
      warnings: string[];
    };
    metadata: {
      apiVersion: string;
      analysisMethod: string;
      calculationTime: string;
      cacheUsed: boolean;
    };
  };
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

export type GpsDerivedAnalysis = {
  deviceId: string;
  hasBaseline: boolean;
  qualityScore: number;
  trendDiagnostics?: {
    direction: "stable" | "increasing" | "decreasing";
    changeMm: number;
    slopeMmPerHour: number;
    durationHours: number;
    regressionFitR2: number;
    accelerationMmPerHour2: number;
    averageStepMm: number;
    volatilityMm: number;
    sampleIntervalSeconds: number;
  };
  ceemd?: {
    imfs: number[][];
    residue: number[];
    energyDistribution: number[];
    dominantFrequencies: number[];
    qualityScore: number;
    reconstructionError: number;
    orthogonality: number;
  };
  prediction?: {
    confidence: number;
    shortTerm: number[];
    longTerm: number[];
    thresholdForecast?: {
      thresholdsMm: {
        blue: number;
        yellow: number;
        red: number;
      };
      shortTerm: Record<
        "blue" | "yellow" | "red",
        { breached: boolean; firstIndex: number | null; firstValue: number | null; etaHours: number | null; etaDays: number | null; firstTimestamp: string | null }
      >;
      longTerm: Record<
        "blue" | "yellow" | "red",
        { breached: boolean; firstIndex: number | null; firstValue: number | null; etaHours: number | null; etaDays: number | null; firstTimestamp: string | null }
      >;
    };
    confidenceIntervals?: {
      shortTermLower: number[];
      shortTermUpper: number[];
      longTermLower: number[];
      longTermUpper: number[];
    };
  };
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

export type HealthState = "healthy" | "degraded" | "not_configured" | "unknown";

export type SystemConfigItem = {
  key: string;
  value: string;
  type: string;
  description: string;
  updatedAt?: string;
};

export type CommandSuccessNotificationPolicyConfig = {
  systemDefault: Exclude<SuccessNotificationPolicy, "inherit">;
  commandTypeDefaults: Record<string, Exclude<SuccessNotificationPolicy, "inherit">>;
};

export type OperationLogRow = {
  id: string;
  userId: string | null;
  username: string;
  module: string;
  action: string;
  targetType: string;
  targetId: string;
  description: string;
  requestData: unknown;
  responseData: unknown;
  ipAddress: string;
  userAgent: string;
  status: string;
  errorMessage: string;
  createdAt: string;
};

export type OperationLogsResponse = {
  page: number;
  pageSize: number;
  total: number;
  list: OperationLogRow[];
};

export type SystemStatus = {
  source: "mock_summary" | "health_summary";
  note: string;
  cpuPercent?: number;
  memPercent?: number;
  diskPercent?: number;
  items: Array<{
    key: "postgres" | "clickhouse" | "kafka";
    label: string;
    status: HealthState;
    detail: string;
  }>;
};

export type ApiClient = {
  auth: {
    login: (input: { username: string; password: string } | { mobile: string; code: string }) => Promise<{
      token: string;
      refreshToken?: string;
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
    listManagement: () => Promise<StationManagementStation[]>;
    updateManagement: (input: {
      stationId: string;
      stationName: string;
      locationName: string;
      description: string;
      chartLegendName: string;
      riskLevel: RiskLevel;
      status: OnlineStatus;
      sensorTypes: DeviceType[];
    }) => Promise<{ stationId: string; updatedAt?: string }>;
    updateLegendNames: (input: { legends: Record<string, string> }) => Promise<{ updated: number }>;
  };
  devices: {
    list: (input?: { stationId?: string }) => Promise<Device[]>;
    getState: (input: { deviceId: string }) => Promise<DeviceStateSnapshot>;
    issueCommand: (input: {
      deviceId: string;
      commandType: string;
      payload: Record<string, unknown>;
      notifyOnAck?: boolean;
      successNotificationPolicy?: SuccessNotificationPolicy;
    }) => Promise<{
      commandId: string;
      status: DeviceCommandStatus;
      notifyOnAck: boolean;
      successNotificationPolicy: SuccessNotificationPolicy;
      effectiveSuccessNotificationPolicy: EffectiveSuccessNotificationPolicy;
    }>;
    listCommands: (input: { deviceId: string }) => Promise<DeviceCommand[]>;
    getHealthExpert: (input: { deviceId: string; metric?: "all" | "battery" | "health" | "signal" }) => Promise<DeviceHealthExpertResult>;
  };
  telemetry: {
    getSeries: (input: {
      deviceId: string;
      sensorKey: string;
      startTime: string;
      endTime: string;
      interval?: "raw" | "1m" | "5m" | "1h" | "1d";
    }) => Promise<TelemetrySeriesPoint[]>;
  };
  gps: {
    getSeries: (input: { deviceId: string; days?: number }) => Promise<GpsSeries>;
    getDerivedAnalysis: (input: { deviceId: string; rangeLabel?: string; limit?: number }) => Promise<GpsDerivedAnalysis>;
  };
  baselines: {
    list: () => Promise<Baseline[]>;
    upsert: (input: Omit<Baseline, "deviceName" | "establishedTime"> & { establishedTime?: string; persist?: boolean }) => Promise<Baseline>;
    remove: (input: { deviceId: string }) => Promise<void>;
    autoEstablish: (input: { deviceId: string; persist?: boolean }) => Promise<Baseline>;
  };
  system: {
    getStatus: () => Promise<SystemStatus>;
    getConfigs: () => Promise<SystemConfigItem[]>;
    updateConfigs: (input: { configs: Array<{ key: string; value: string }> }) => Promise<{ updated: number }>;
    getCommandSuccessNotificationPolicy: () => Promise<CommandSuccessNotificationPolicyConfig>;
    updateCommandSuccessNotificationPolicy: (input: CommandSuccessNotificationPolicyConfig) => Promise<CommandSuccessNotificationPolicyConfig>;
    getOperationLogs: (input: {
      page: number;
      pageSize: number;
      module?: string;
      action?: string;
      startTime: string;
      endTime: string;
    }) => Promise<OperationLogsResponse>;
  };
};
