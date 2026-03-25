import type {
  ApiClient,
  DeviceType,
  EffectiveSuccessNotificationPolicy,
  GpsDerivedAnalysis,
  OnlineStatus,
  RiskLevel,
  StationManagementStation,
  SuccessNotificationPolicy
} from "./client";
import { mapAuthUser, mapBaselineFromV1, mapDashboardSummaryFromV1, mapDevicesFromV1, makeLegacyWeeklyTrend, mapStationsFromV1, mapSystemStatusFromV1 } from "./httpMappers";
import { createHttpTransport } from "./httpTransport";

type HttpClientOptions = {
  baseUrl: string;
  getToken?: () => string | null;
  getRefreshToken?: () => string | null;
  onAuthTokens?: (input: { token: string; refreshToken?: string }) => void;
  onAuthFailure?: () => void;
};

type AuthLoginResponse = {
  token: string;
  refreshToken: string;
  expiresIn: number;
  user: { userId: string; username: string; realName?: string; roles?: string[] };
};

type V1BaselineResponse = {
  list: Array<{
    deviceId: string;
    deviceName: string;
    method?: "auto" | "manual";
    computedAt?: string;
    baseline?: {
      latitude?: number;
      longitude?: number;
      altitude?: number;
      notes?: string;
      establishedBy?: string;
    };
  }>;
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
};

type V1ListResponse<T> = {
  list: T[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
};

type V1GpsDeformationResponse = {
  deviceId: string;
  points: Array<{ ts: string; distanceMeters: number }>;
};

type V1StationPayload = {
  stationId: string;
  stationCode: string;
  stationName: string;
  status: "active" | "inactive" | "maintenance";
  latitude: number | null;
  longitude: number | null;
  altitude?: number | null;
  metadata?: Record<string, unknown>;
  updatedAt?: string;
};

function normalizeManagementRisk(value: unknown): RiskLevel {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (raw === "high") return "high";
  if (raw === "mid" || raw === "medium") return "mid";
  return "low";
}

function normalizeManagementStatus(value: V1StationPayload["status"]): OnlineStatus {
  if (value === "inactive") return "offline";
  if (value === "maintenance") return "warning";
  return "online";
}

function normalizeSensorTypes(value: unknown): DeviceType[] {
  if (!Array.isArray(value)) return [];
  const normalized = value
    .map((item) => (typeof item === "string" ? item.trim().toLowerCase() : ""))
    .map((item): DeviceType | null => {
      if (item === "gnss" || item === "gps" || item === "multi_sensor" || item === "multisensor") return "gnss";
      if (item === "rain" || item === "rainfall") return "rain";
      if (item === "tilt" || item === "inclinometer") return "tilt";
      if (item === "camera" || item === "video") return "camera";
      if (item === "temp_hum" || item === "temperature" || item === "humidity") return "temp_hum";
      return null;
    })
    .filter((item): item is DeviceType => item !== null);
  return Array.from(new Set(normalized));
}

function mapStationManagementFromV1(
  stations: V1StationPayload[],
  devices: Array<{
    deviceId: string;
    deviceName?: string;
    deviceType?: string;
    stationId?: string | null;
    status: "inactive" | "active" | "revoked";
    lastSeenAt?: string | null;
  }>
): StationManagementStation[] {
  const devicesByStation = new Map<string, typeof devices>();
  for (const device of devices) {
    const stationId = typeof device.stationId === "string" ? device.stationId : "";
    if (!stationId) continue;
    const list = devicesByStation.get(stationId) ?? [];
    list.push(device);
    devicesByStation.set(stationId, list);
  }

  return stations.map((station) => {
    const metadata = station.metadata && typeof station.metadata === "object" ? station.metadata : {};
    const stationDevices = devicesByStation.get(station.stationId) ?? [];
    const sensorTypes = normalizeSensorTypes(
      (metadata as Record<string, unknown>).sensorTypes ??
        (metadata as Record<string, unknown>).sensor_types ??
        stationDevices.map((device) => device.deviceType ?? "")
    );
    const lastDataTime =
      stationDevices
        .map((device) => (typeof device.lastSeenAt === "string" ? device.lastSeenAt : ""))
        .filter((value) => value)
        .sort()
        .at(-1) ?? new Date().toISOString();

    return {
      stationId: station.stationId,
      stationCode: station.stationCode,
      stationName: station.stationName,
      locationName:
        typeof (metadata as Record<string, unknown>).locationName === "string"
          ? ((metadata as Record<string, unknown>).locationName as string)
          : typeof (metadata as Record<string, unknown>).location_name === "string"
            ? ((metadata as Record<string, unknown>).location_name as string)
            : station.stationName,
      description:
        typeof (metadata as Record<string, unknown>).description === "string"
          ? ((metadata as Record<string, unknown>).description as string)
          : "",
      chartLegendName:
        typeof (metadata as Record<string, unknown>).chartLegendName === "string"
          ? ((metadata as Record<string, unknown>).chartLegendName as string)
          : typeof (metadata as Record<string, unknown>).chart_legend_name === "string"
            ? ((metadata as Record<string, unknown>).chart_legend_name as string)
            : station.stationName,
      riskLevel: normalizeManagementRisk(
        (metadata as Record<string, unknown>).riskLevel ?? (metadata as Record<string, unknown>).risk_level
      ),
      status: normalizeManagementStatus(station.status),
      lat: typeof station.latitude === "number" ? station.latitude : 0,
      lng: typeof station.longitude === "number" ? station.longitude : 0,
      ...(typeof station.altitude === "number" ? { altitude: station.altitude } : {}),
      deviceCount: stationDevices.length,
      sensorTypes,
      lastDataTime,
      ...(typeof station.updatedAt === "string" ? { updatedAt: station.updatedAt } : {})
    };
  });
}

function computeTimeRange(days: number): { startTime: string; endTime: string; interval: "5m" | "1h" | "1d" } {
  const end = new Date();
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  const interval = days <= 1 ? "5m" : days <= 7 ? "1h" : "1d";
  return { startTime: start.toISOString(), endTime: end.toISOString(), interval };
}

function shouldUseLocalDevFallback(baseUrl: string): boolean {
  try {
    const url = new URL(baseUrl);
    return url.hostname === "127.0.0.1" || url.hostname === "localhost";
  } catch {
    return false;
  }
}

function deriveSuccessNotificationPolicy(item: {
  notifyOnAck?: boolean;
  successNotificationPolicy?: SuccessNotificationPolicy;
  effectiveSuccessNotificationPolicy?: EffectiveSuccessNotificationPolicy;
}): {
  notifyOnAck: boolean;
  successNotificationPolicy: SuccessNotificationPolicy;
  effectiveSuccessNotificationPolicy: EffectiveSuccessNotificationPolicy;
} {
  const successNotificationPolicy =
    item.successNotificationPolicy ?? (item.notifyOnAck ? "always_notify" : "silent");
  const effectiveSuccessNotificationPolicy =
    item.effectiveSuccessNotificationPolicy ??
    (successNotificationPolicy === "inherit" ? (item.notifyOnAck ? "always_notify" : "silent") : successNotificationPolicy);
  return {
    notifyOnAck: Boolean(item.notifyOnAck ?? effectiveSuccessNotificationPolicy === "always_notify"),
    successNotificationPolicy,
    effectiveSuccessNotificationPolicy
  };
}

async function fetchAllV1Pages<T>(
  requestPage: (page: number, pageSize: number) => Promise<V1ListResponse<T>>,
  pageSize = 200
): Promise<T[]> {
  const first = await requestPage(1, pageSize);
  const items = [...first.list];
  const totalPages = Math.max(1, Number(first.pagination?.totalPages ?? 1));

  for (let page = 2; page <= totalPages; page += 1) {
    const next = await requestPage(page, pageSize);
    items.push(...next.list);
  }

  return items;
}

export function createHttpClient(options: HttpClientOptions): ApiClient {
  const transport = createHttpTransport(options);
  const localDevFallback = shouldUseLocalDevFallback(options.baseUrl);

  return {
    auth: {
      async login(input) {
        if ("mobile" in input) {
          throw new Error("当前 HTTP 模式未接入手机号登录，请使用账号密码登录。");
        }

        try {
          const res = await transport.requestV1<AuthLoginResponse>(
            "/api/v1/auth/login",
            transport.withJson({
              method: "POST",
              body: JSON.stringify({ username: input.username, password: input.password })
            })
          );
          options.onAuthTokens?.({ token: res.token, ...(res.refreshToken ? { refreshToken: res.refreshToken } : {}) });
          return {
            token: res.token,
            ...(res.refreshToken ? { refreshToken: res.refreshToken } : {}),
            user: mapAuthUser(res.user)
          };
        } catch (error) {
          if (!localDevFallback) throw error;
          return {
            token: "dev",
            user: { id: "u_http", name: input.username, role: "admin" }
          };
        }
      },
      async logout() {
        try {
          await transport.requestV1<unknown>("/api/v1/auth/logout", { method: "POST" });
        } catch {
          return;
        }
      }
    },
    dashboard: {
      async getSummary() {
        const res = await transport.requestV1<{
          stations: number;
          onlineDevices: number;
          freshDevices: number;
          totalDevices: number;
          todayAlerts: number;
          offlineDevices: number;
          pendingAlerts: number;
          alertsBySeverity?: Partial<Record<"low" | "medium" | "high" | "critical", number>>;
        }>("/api/v1/dashboard");
        return mapDashboardSummaryFromV1(res);
      },
      async getWeeklyTrend() {
        const res = await transport.requestV1<unknown>("/api/v1/dashboard/weekly-trend");
        return makeLegacyWeeklyTrend(res);
      }
    },
    stations: {
      async list() {
        const [stations, devices] = await Promise.all([
          fetchAllV1Pages((page, pageSize) =>
            transport.requestV1<V1ListResponse<{
              stationId: string;
              stationCode: string;
              stationName: string;
              status: "active" | "inactive" | "maintenance";
              latitude: number | null;
              longitude: number | null;
              metadata?: Record<string, unknown>;
            }>>(`/api/v1/stations?page=${String(page)}&pageSize=${String(pageSize)}`)
          ),
          fetchAllV1Pages((page, pageSize) =>
            transport.requestV1<V1ListResponse<{
              deviceId: string;
              deviceName?: string;
              deviceType?: string;
              stationId?: string | null;
              status: "inactive" | "active" | "revoked";
              lastSeenAt?: string | null;
            }>>(`/api/v1/devices?page=${String(page)}&pageSize=${String(pageSize)}`)
          )
        ]);
        return mapStationsFromV1(stations, devices);
      },
      async listManagement() {
        const [stations, devices] = await Promise.all([
          fetchAllV1Pages((page, pageSize) =>
            transport.requestV1<V1ListResponse<V1StationPayload>>(`/api/v1/stations?page=${String(page)}&pageSize=${String(pageSize)}`)
          ),
          fetchAllV1Pages((page, pageSize) =>
            transport.requestV1<V1ListResponse<{
              deviceId: string;
              deviceName?: string;
              deviceType?: string;
              stationId?: string | null;
              status: "inactive" | "active" | "revoked";
              lastSeenAt?: string | null;
            }>>(`/api/v1/devices?page=${String(page)}&pageSize=${String(pageSize)}`)
          )
        ]);
        return mapStationManagementFromV1(stations, devices);
      },
      async updateManagement(input) {
        const metadata = {
          locationName: input.locationName,
          location_name: input.locationName,
          description: input.description,
          chartLegendName: input.chartLegendName,
          chart_legend_name: input.chartLegendName,
          riskLevel: input.riskLevel,
          risk_level: input.riskLevel,
          sensorTypes: input.sensorTypes,
          sensor_types: input.sensorTypes
        };
        const status =
          input.status === "online" ? "active" : input.status === "warning" ? "maintenance" : "inactive";
        const res = await transport.requestV1<{ stationId: string; updatedAt: string }>(
          `/api/v1/stations/${encodeURIComponent(input.stationId)}`,
          transport.withJson({
            method: "PUT",
            body: JSON.stringify({
              stationName: input.stationName,
              status,
              metadata
            })
          })
        );
        return {
          stationId: res.stationId,
          ...(res.updatedAt ? { updatedAt: res.updatedAt } : {})
        };
      },
      async updateLegendNames(input) {
        let updated = 0;
        for (const [stationId, chartLegendName] of Object.entries(input.legends)) {
          if (!chartLegendName.trim()) continue;
          const current = await transport.requestV1<V1StationPayload>(`/api/v1/stations/${encodeURIComponent(stationId)}`);
          const metadata = current.metadata && typeof current.metadata === "object" ? current.metadata : {};
          await transport.requestV1<{ stationId: string; updatedAt: string }>(
            `/api/v1/stations/${encodeURIComponent(stationId)}`,
            transport.withJson({
              method: "PUT",
              body: JSON.stringify({
                metadata: {
                  ...metadata,
                  chartLegendName,
                  chart_legend_name: chartLegendName
                }
              })
            })
          );
          updated += 1;
        }
        return { updated };
      }
    },
    devices: {
      async list(input) {
        const stationQuery = input?.stationId ? `&stationId=${encodeURIComponent(input.stationId)}` : "";
        const [stations, devices] = await Promise.all([
          fetchAllV1Pages((page, pageSize) =>
            transport.requestV1<V1ListResponse<{
              stationId: string;
              stationCode: string;
              stationName: string;
              status: "active" | "inactive" | "maintenance";
              latitude: number | null;
              longitude: number | null;
              metadata?: Record<string, unknown>;
            }>>(`/api/v1/stations?page=${String(page)}&pageSize=${String(pageSize)}`)
          ),
          fetchAllV1Pages((page, pageSize) =>
            transport.requestV1<V1ListResponse<{
              deviceId: string;
              deviceName?: string;
              deviceType?: string;
              stationId?: string | null;
              status: "inactive" | "active" | "revoked";
              lastSeenAt?: string | null;
            }>>(`/api/v1/devices?page=${String(page)}&pageSize=${String(pageSize)}${stationQuery}`)
          )
        ]);
        const stationModels = mapStationsFromV1(stations, devices);
        return mapDevicesFromV1(devices, stationModels);
      },
      async issueCommand(input) {
        const response = await transport.requestV1<{
          commandId: string;
          status: "queued" | "sent" | "acked" | "failed" | "timeout" | "canceled";
          notifyOnAck: boolean;
          successNotificationPolicy: SuccessNotificationPolicy;
          effectiveSuccessNotificationPolicy: EffectiveSuccessNotificationPolicy;
        }>(
          `/api/v1/devices/${encodeURIComponent(input.deviceId)}/commands`,
          transport.withJson({
            method: "POST",
            body: JSON.stringify({
              commandType: input.commandType,
              ...(input.notifyOnAck === undefined ? {} : { notifyOnAck: input.notifyOnAck }),
              ...(input.successNotificationPolicy === undefined
                ? {}
                : { successNotificationPolicy: input.successNotificationPolicy }),
              payload: input.payload
            })
          })
        );
        return {
          commandId: response.commandId,
          status: response.status,
          ...deriveSuccessNotificationPolicy(response)
        };
      },
      async listCommands(input) {
        const list = await fetchAllV1Pages((page, pageSize) =>
          transport.requestV1<V1ListResponse<{
            commandId: string;
            deviceId: string;
            commandType: string;
            payload: Record<string, unknown>;
            notifyOnAck?: boolean;
            successNotificationPolicy?: SuccessNotificationPolicy;
            effectiveSuccessNotificationPolicy?: EffectiveSuccessNotificationPolicy;
            status: "queued" | "sent" | "acked" | "failed" | "timeout" | "canceled";
            sentAt?: string | null;
            ackedAt?: string | null;
            result?: Record<string, unknown>;
            errorMessage?: string;
            createdAt: string;
            updatedAt: string;
          }>>(`/api/v1/devices/${encodeURIComponent(input.deviceId)}/commands?page=${String(page)}&pageSize=${String(pageSize)}`),
          50
        );
        return list.map((item) => ({
          commandId: item.commandId,
          deviceId: item.deviceId,
          commandType: item.commandType,
          payload: item.payload ?? {},
          ...deriveSuccessNotificationPolicy(item),
          status: item.status,
          ...(item.sentAt ? { sentAt: item.sentAt } : {}),
          ...(item.ackedAt ? { ackedAt: item.ackedAt } : {}),
          ...(item.errorMessage ? { errorMessage: item.errorMessage } : {}),
          createdAt: item.createdAt,
          updatedAt: item.updatedAt
        }));
      },
      async getHealthExpert(input) {
        const metric = input.metric ?? "all";
        return transport.requestV1<{
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
        }>(`/api/v1/devices/${encodeURIComponent(input.deviceId)}/health/expert?metric=${encodeURIComponent(metric)}`);
      }
    },
    telemetry: {
      async getSeries(input) {
        const interval = input.interval ?? "1h";
        const res = await transport.requestV1<{
          series: Array<{
            sensorKey: string;
            points: Array<{ ts: string; value: unknown }>;
          }>;
        }>(
          `/api/v1/data/series/${encodeURIComponent(input.deviceId)}?startTime=${encodeURIComponent(input.startTime)}&endTime=${encodeURIComponent(input.endTime)}&sensorKeys=${encodeURIComponent(input.sensorKey)}&interval=${encodeURIComponent(interval)}`
        );
        const series = res.series.find((item) => item.sensorKey === input.sensorKey);
        if (!series) return [];
        return series.points
          .map((point) => ({
            ts: point.ts,
            value: typeof point.value === "number" ? point.value : Number(point.value)
          }))
          .filter((point) => Number.isFinite(point.value));
      }
    },
    gps: {
      async getSeries(input) {
        const days = input.days ?? 7;
        const range = computeTimeRange(days);
        const res = await transport.requestV1<V1GpsDeformationResponse>(
          `/api/v1/gps/deformations/${encodeURIComponent(input.deviceId)}/series?startTime=${encodeURIComponent(range.startTime)}&endTime=${encodeURIComponent(range.endTime)}&interval=${encodeURIComponent(range.interval)}`
        );
        return {
          deviceId: res.deviceId,
          deviceName: input.deviceId,
          points: res.points.map((point) => ({
            ts: point.ts,
            dispMm: Number((point.distanceMeters * 1000).toFixed(2))
          }))
        };
      },
      async getDerivedAnalysis(input): Promise<GpsDerivedAnalysis> {
        const rangeLabel = input.rangeLabel ?? "7d";
        const limit = input.limit ?? 200;
        const res = await transport.requestV1<{
          deviceId: string;
          hasBaseline: boolean;
          qualityScore?: number;
          trendDiagnostics?: {
            direction?: "stable" | "increasing" | "decreasing";
            changeMm?: number;
            slopeMmPerHour?: number;
            durationHours?: number;
            regressionFitR2?: number;
            accelerationMmPerHour2?: number;
            averageStepMm?: number;
            volatilityMm?: number;
            sampleIntervalSeconds?: number;
          };
          ceemd?: {
            imfs?: number[][];
            residue?: number[];
            energyDistribution?: number[];
            dominantFrequencies?: number[];
            qualityScore?: number;
            reconstructionError?: number;
            orthogonality?: number;
          };
          prediction?: {
            confidence?: number;
            shortTerm?: number[];
            longTerm?: number[];
            thresholdForecast?: {
              thresholdsMm?: {
                blue?: number;
                yellow?: number;
                red?: number;
              };
              shortTerm?: Record<
                string,
                {
                  breached?: boolean;
                  firstIndex?: number | null;
                  firstValue?: number | null;
                  etaHours?: number | null;
                  etaDays?: number | null;
                  firstTimestamp?: string | null;
                }
              >;
              longTerm?: Record<
                string,
                {
                  breached?: boolean;
                  firstIndex?: number | null;
                  firstValue?: number | null;
                  etaHours?: number | null;
                  etaDays?: number | null;
                  firstTimestamp?: string | null;
                }
              >;
            };
            confidenceIntervals?: {
              shortTermLower?: number[];
              shortTermUpper?: number[];
              longTermLower?: number[];
              longTermUpper?: number[];
            };
          };
        }>(`/api/v1/gps/deformations/${encodeURIComponent(input.deviceId)}/analysis?timeRange=${encodeURIComponent(rangeLabel)}&limit=${encodeURIComponent(String(limit))}`);

        const ceemdAnalysis = res.ceemd;
        const prediction = res.prediction;

        return {
          deviceId: input.deviceId,
          hasBaseline: Boolean(res.hasBaseline),
          qualityScore: Number(res.qualityScore ?? 0),
          ...(res.trendDiagnostics
            ? {
                trendDiagnostics: {
                  direction: res.trendDiagnostics.direction === "decreasing" ? "decreasing" : res.trendDiagnostics.direction === "increasing" ? "increasing" : "stable",
                  changeMm: Number(res.trendDiagnostics.changeMm ?? 0),
                  slopeMmPerHour: Number(res.trendDiagnostics.slopeMmPerHour ?? 0),
                  durationHours: Number(res.trendDiagnostics.durationHours ?? 0),
                  regressionFitR2: Number(res.trendDiagnostics.regressionFitR2 ?? 0),
                  accelerationMmPerHour2: Number(res.trendDiagnostics.accelerationMmPerHour2 ?? 0),
                  averageStepMm: Number(res.trendDiagnostics.averageStepMm ?? 0),
                  volatilityMm: Number(res.trendDiagnostics.volatilityMm ?? 0),
                  sampleIntervalSeconds: Number(res.trendDiagnostics.sampleIntervalSeconds ?? 0)
                }
              }
            : {}),
          ...(ceemdAnalysis
            ? {
                ceemd: {
                  imfs: Array.isArray(ceemdAnalysis.imfs) ? ceemdAnalysis.imfs.map((series) => series.map((value) => Number((value * 1000).toFixed(3)))) : [],
                  residue: Array.isArray(ceemdAnalysis.residue)
                    ? ceemdAnalysis.residue.map((value) => Number((value * 1000).toFixed(3)))
                    : [],
                  energyDistribution: Array.isArray(ceemdAnalysis.energyDistribution)
                    ? ceemdAnalysis.energyDistribution.map((value) => Number(value))
                    : [],
                  dominantFrequencies: Array.isArray(ceemdAnalysis.dominantFrequencies)
                    ? ceemdAnalysis.dominantFrequencies.map((value) => Number(value))
                    : [],
                  qualityScore: Number(ceemdAnalysis.qualityScore ?? 0),
                  reconstructionError: Number(ceemdAnalysis.reconstructionError ?? 0),
                  orthogonality: Number(ceemdAnalysis.orthogonality ?? 0)
                }
              }
            : {}),
          ...(prediction
            ? {
                prediction: {
                  confidence: Number(prediction.confidence ?? 0),
                  shortTerm: Array.isArray(res.prediction?.shortTerm) ? res.prediction.shortTerm.map((value) => Number(value)) : [],
                  longTerm: Array.isArray(res.prediction?.longTerm) ? res.prediction.longTerm.map((value) => Number(value)) : [],
                  ...(prediction.thresholdForecast
                    ? {
                        thresholdForecast: {
                          thresholdsMm: {
                            blue: Number(prediction.thresholdForecast.thresholdsMm?.blue ?? 0),
                            yellow: Number(prediction.thresholdForecast.thresholdsMm?.yellow ?? 0),
                            red: Number(prediction.thresholdForecast.thresholdsMm?.red ?? 0)
                          },
                          shortTerm: {
                            blue: {
                              breached: Boolean(prediction.thresholdForecast.shortTerm?.blue?.breached),
                              firstIndex:
                                prediction.thresholdForecast.shortTerm?.blue?.firstIndex == null
                                  ? null
                                  : Number(prediction.thresholdForecast.shortTerm.blue.firstIndex),
                              firstValue:
                                prediction.thresholdForecast.shortTerm?.blue?.firstValue == null
                                  ? null
                                  : Number(prediction.thresholdForecast.shortTerm.blue.firstValue),
                              etaHours:
                                prediction.thresholdForecast.shortTerm?.blue?.etaHours == null
                                  ? null
                                  : Number(prediction.thresholdForecast.shortTerm.blue.etaHours),
                              etaDays:
                                prediction.thresholdForecast.shortTerm?.blue?.etaDays == null
                                  ? null
                                  : Number(prediction.thresholdForecast.shortTerm.blue.etaDays),
                              firstTimestamp:
                                prediction.thresholdForecast.shortTerm?.blue?.firstTimestamp == null
                                  ? null
                                  : String(prediction.thresholdForecast.shortTerm.blue.firstTimestamp)
                            },
                            yellow: {
                              breached: Boolean(prediction.thresholdForecast.shortTerm?.yellow?.breached),
                              firstIndex:
                                prediction.thresholdForecast.shortTerm?.yellow?.firstIndex == null
                                  ? null
                                  : Number(prediction.thresholdForecast.shortTerm.yellow.firstIndex),
                              firstValue:
                                prediction.thresholdForecast.shortTerm?.yellow?.firstValue == null
                                  ? null
                                  : Number(prediction.thresholdForecast.shortTerm.yellow.firstValue),
                              etaHours:
                                prediction.thresholdForecast.shortTerm?.yellow?.etaHours == null
                                  ? null
                                  : Number(prediction.thresholdForecast.shortTerm.yellow.etaHours),
                              etaDays:
                                prediction.thresholdForecast.shortTerm?.yellow?.etaDays == null
                                  ? null
                                  : Number(prediction.thresholdForecast.shortTerm.yellow.etaDays),
                              firstTimestamp:
                                prediction.thresholdForecast.shortTerm?.yellow?.firstTimestamp == null
                                  ? null
                                  : String(prediction.thresholdForecast.shortTerm.yellow.firstTimestamp)
                            },
                            red: {
                              breached: Boolean(prediction.thresholdForecast.shortTerm?.red?.breached),
                              firstIndex:
                                prediction.thresholdForecast.shortTerm?.red?.firstIndex == null
                                  ? null
                                  : Number(prediction.thresholdForecast.shortTerm.red.firstIndex),
                              firstValue:
                                prediction.thresholdForecast.shortTerm?.red?.firstValue == null
                                  ? null
                                  : Number(prediction.thresholdForecast.shortTerm.red.firstValue),
                              etaHours:
                                prediction.thresholdForecast.shortTerm?.red?.etaHours == null
                                  ? null
                                  : Number(prediction.thresholdForecast.shortTerm.red.etaHours),
                              etaDays:
                                prediction.thresholdForecast.shortTerm?.red?.etaDays == null
                                  ? null
                                  : Number(prediction.thresholdForecast.shortTerm.red.etaDays),
                              firstTimestamp:
                                prediction.thresholdForecast.shortTerm?.red?.firstTimestamp == null
                                  ? null
                                  : String(prediction.thresholdForecast.shortTerm.red.firstTimestamp)
                            }
                          },
                          longTerm: {
                            blue: {
                              breached: Boolean(prediction.thresholdForecast.longTerm?.blue?.breached),
                              firstIndex:
                                prediction.thresholdForecast.longTerm?.blue?.firstIndex == null
                                  ? null
                                  : Number(prediction.thresholdForecast.longTerm.blue.firstIndex),
                              firstValue:
                                prediction.thresholdForecast.longTerm?.blue?.firstValue == null
                                  ? null
                                  : Number(prediction.thresholdForecast.longTerm.blue.firstValue),
                              etaHours:
                                prediction.thresholdForecast.longTerm?.blue?.etaHours == null
                                  ? null
                                  : Number(prediction.thresholdForecast.longTerm.blue.etaHours),
                              etaDays:
                                prediction.thresholdForecast.longTerm?.blue?.etaDays == null
                                  ? null
                                  : Number(prediction.thresholdForecast.longTerm.blue.etaDays),
                              firstTimestamp:
                                prediction.thresholdForecast.longTerm?.blue?.firstTimestamp == null
                                  ? null
                                  : String(prediction.thresholdForecast.longTerm.blue.firstTimestamp)
                            },
                            yellow: {
                              breached: Boolean(prediction.thresholdForecast.longTerm?.yellow?.breached),
                              firstIndex:
                                prediction.thresholdForecast.longTerm?.yellow?.firstIndex == null
                                  ? null
                                  : Number(prediction.thresholdForecast.longTerm.yellow.firstIndex),
                              firstValue:
                                prediction.thresholdForecast.longTerm?.yellow?.firstValue == null
                                  ? null
                                  : Number(prediction.thresholdForecast.longTerm.yellow.firstValue),
                              etaHours:
                                prediction.thresholdForecast.longTerm?.yellow?.etaHours == null
                                  ? null
                                  : Number(prediction.thresholdForecast.longTerm.yellow.etaHours),
                              etaDays:
                                prediction.thresholdForecast.longTerm?.yellow?.etaDays == null
                                  ? null
                                  : Number(prediction.thresholdForecast.longTerm.yellow.etaDays),
                              firstTimestamp:
                                prediction.thresholdForecast.longTerm?.yellow?.firstTimestamp == null
                                  ? null
                                  : String(prediction.thresholdForecast.longTerm.yellow.firstTimestamp)
                            },
                            red: {
                              breached: Boolean(prediction.thresholdForecast.longTerm?.red?.breached),
                              firstIndex:
                                prediction.thresholdForecast.longTerm?.red?.firstIndex == null
                                  ? null
                                  : Number(prediction.thresholdForecast.longTerm.red.firstIndex),
                              firstValue:
                                prediction.thresholdForecast.longTerm?.red?.firstValue == null
                                  ? null
                                  : Number(prediction.thresholdForecast.longTerm.red.firstValue),
                              etaHours:
                                prediction.thresholdForecast.longTerm?.red?.etaHours == null
                                  ? null
                                  : Number(prediction.thresholdForecast.longTerm.red.etaHours),
                              etaDays:
                                prediction.thresholdForecast.longTerm?.red?.etaDays == null
                                  ? null
                                  : Number(prediction.thresholdForecast.longTerm.red.etaDays),
                              firstTimestamp:
                                prediction.thresholdForecast.longTerm?.red?.firstTimestamp == null
                                  ? null
                                  : String(prediction.thresholdForecast.longTerm.red.firstTimestamp)
                            }
                          }
                        }
                      }
                    : {}),
                  ...(prediction.confidenceIntervals
                    ? {
                        confidenceIntervals: {
                          shortTermLower: Array.isArray(prediction.confidenceIntervals.shortTermLower)
                            ? prediction.confidenceIntervals.shortTermLower.map((value) => Number(value))
                            : [],
                          shortTermUpper: Array.isArray(prediction.confidenceIntervals.shortTermUpper)
                            ? prediction.confidenceIntervals.shortTermUpper.map((value) => Number(value))
                            : [],
                          longTermLower: Array.isArray(prediction.confidenceIntervals.longTermLower)
                            ? prediction.confidenceIntervals.longTermLower.map((value) => Number(value))
                            : [],
                          longTermUpper: Array.isArray(prediction.confidenceIntervals.longTermUpper)
                            ? prediction.confidenceIntervals.longTermUpper.map((value) => Number(value))
                            : []
                        }
                      }
                    : {})
                }
              }
            : {})
        };
      }
    },
    baselines: {
      async list() {
        const list = await fetchAllV1Pages((page, pageSize) =>
          transport.requestV1<V1BaselineResponse>(`/api/v1/gps/baselines?page=${String(page)}&pageSize=${String(pageSize)}`)
        );
        return list.map((item) => mapBaselineFromV1(item));
      },
      async upsert(input) {
        await transport.requestV1<unknown>(
          `/api/v1/gps/baselines/${encodeURIComponent(input.deviceId)}`,
          transport.withJson({
            method: "PUT",
            body: JSON.stringify({
              method: "manual",
              baseline: {
                latitude: input.baselineLat,
                longitude: input.baselineLng,
                ...(input.baselineAlt === undefined ? {} : { altitude: input.baselineAlt }),
                establishedBy: input.establishedBy,
                ...(input.notes === undefined ? {} : { notes: input.notes })
              },
              ...(input.persist === undefined ? {} : { persist: input.persist })
            })
          })
        );
        const detail = await transport.requestV1<{
          deviceId: string;
          deviceName: string;
          method?: "auto" | "manual";
          computedAt?: string;
          baseline?: {
            latitude?: number;
            longitude?: number;
            altitude?: number;
            notes?: string;
            establishedBy?: string;
          };
        }>(`/api/v1/gps/baselines/${encodeURIComponent(input.deviceId)}`);
        return mapBaselineFromV1(detail);
      },
      async remove(input) {
        await transport.requestV1<unknown>(`/api/v1/gps/baselines/${encodeURIComponent(input.deviceId)}`, { method: "DELETE" });
      },
      async autoEstablish(input) {
        const res = await transport.requestV1<{
          deviceId: string;
          pointsUsed: number;
          persisted?: boolean;
          baseline: {
            latitude: number;
            longitude: number;
            altitude?: number;
            notes?: string;
          };
        }>(
          `/api/v1/gps/baselines/${encodeURIComponent(input.deviceId)}/auto-establish`,
          transport.withJson({
            method: "POST",
            body: JSON.stringify({
              pointsCount: 20,
              lookbackDays: 30,
              latKey: "gps_latitude",
              lonKey: "gps_longitude",
              altKey: "gps_altitude",
              ...(input.persist === undefined ? {} : { persist: input.persist })
            })
          })
        );
        const baseline: {
          latitude?: number;
          longitude?: number;
          altitude?: number;
          notes?: string;
        } = res.baseline ?? {};
        return {
          deviceId: input.deviceId,
          deviceName: input.deviceId,
          baselineLat: Number(baseline.latitude ?? 0),
          baselineLng: Number(baseline.longitude ?? 0),
          ...(baseline.altitude === undefined ? {} : { baselineAlt: Number(baseline.altitude) }),
          establishedBy: "system",
          establishedTime: new Date().toISOString(),
          status: "active",
          ...(baseline.notes ? { notes: String(baseline.notes) } : {})
        };
      }
    },
    system: {
      async getStatus() {
        const res = await transport.requestV1<unknown>("/api/v1/system/status");
        return mapSystemStatusFromV1(res);
      },
      async getConfigs() {
        const res = await transport.requestV1<{
          list: Array<{
            key: string;
            value: string;
            type: string;
            description: string;
            updatedAt?: string;
          }>;
        }>("/api/v1/system/configs");
        return res.list.map((item) => ({
          key: item.key,
          value: item.value,
          type: item.type,
          description: item.description,
          ...(item.updatedAt ? { updatedAt: item.updatedAt } : {})
        }));
      },
      async updateConfigs(input) {
        const res = await transport.requestV1<{ updated: number }>("/api/v1/system/configs", transport.withJson({
          method: "PUT",
          body: JSON.stringify({ configs: input.configs })
        }));
        return { updated: res.updated };
      },
      async getCommandSuccessNotificationPolicy() {
        return transport.requestV1<{
          systemDefault: "silent" | "always_notify";
          commandTypeDefaults: Record<string, "silent" | "always_notify">;
        }>("/api/v1/system/command-success-notification-policy");
      },
      async updateCommandSuccessNotificationPolicy(input) {
        return transport.requestV1<{
          systemDefault: "silent" | "always_notify";
          commandTypeDefaults: Record<string, "silent" | "always_notify">;
        }>(
          "/api/v1/system/command-success-notification-policy",
          transport.withJson({
            method: "PUT",
            body: JSON.stringify(input)
          })
        );
      },
      async getOperationLogs(input) {
        const params = new URLSearchParams();
        params.set("page", String(input.page));
        params.set("pageSize", String(input.pageSize));
        params.set("startTime", input.startTime);
        params.set("endTime", input.endTime);
        if (input.module) params.set("module", input.module);
        if (input.action) params.set("action", input.action);
        return transport.requestV1<{
          page: number;
          pageSize: number;
          total: number;
          list: Array<{
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
          }>;
        }>(`/api/v1/system/logs/operation?${params.toString()}`);
      }
    }
  };
}
