import { ApiClient } from './ApiClient';
import { CacheManager, CacheRead } from './CacheManager';
import { DashboardSummary, WeeklyTrend, Station, Device, DeviceState, SensorDefinition, SeriesResponse, AlertPage, AlertEventsResponse, PredictionPage, FieldAlarmStatus, EdgeAiStatus, EdgeAiActionName, EdgeAiActionResponse, EdgeAiActionHistory, EdgeAiIntentResponse, HermesChatResponse, HermesConversationHistory, HermesConversationList } from './Types';

interface CacheTtlConfig {
  state: number;
  summary: number;
  alerts: number;
  metadata: number;
  series: number;
}

export const TTL: CacheTtlConfig = {
  state: 10000,
  summary: 30000,
  alerts: 30000,
  metadata: 300000,
  series: 120000
};

export class MonitoringRepository {
  private api: ApiClient;
  private cache: CacheManager;
  private stateRequests: Map<string, Promise<DeviceState>> = new Map<string, Promise<DeviceState>>();
  private seriesRequests: Map<string, Promise<SeriesResponse>> = new Map<string, Promise<SeriesResponse>>();
  private weeklySeriesRequests: Map<string, Promise<SeriesResponse>> = new Map<string, Promise<SeriesResponse>>();
  private dashboardRequest: Promise<DashboardSummary> | null = null;
  private stationListRequest: Promise<Array<Station>> | null = null;
  private deviceListRequests: Map<string, Promise<Array<Device>>> = new Map<string, Promise<Array<Device>>>();
  private alertsRequest: Promise<AlertPage> | null = null;
  private fieldAlarmStatusRequest: Promise<FieldAlarmStatus> | null = null;
  private edgeAiStatusRequest: Promise<EdgeAiStatus> | null = null;
  private edgeAiActionsRequest: Promise<EdgeAiActionHistory> | null = null;

  constructor(api: ApiClient, cache: CacheManager) {
    this.api = api;
    this.cache = cache;
  }

  cachedDashboard(): Promise<CacheRead<DashboardSummary> | null> {
    return this.cache.read<DashboardSummary>(this.cache.key('/dashboard'), TTL.summary);
  }

  async dashboard(): Promise<DashboardSummary> {
    if (this.dashboardRequest) return this.dashboardRequest;
    this.dashboardRequest = this.fetchDashboard();
    try {
      return await this.dashboardRequest;
    } finally {
      this.dashboardRequest = null;
    }
  }

  private async fetchDashboard(): Promise<DashboardSummary> {
    const value = await this.api.dashboard();
    await this.cache.write(this.cache.key('/dashboard'), value);
    return value;
  }

  cachedWeeklyTrend(): Promise<CacheRead<WeeklyTrend> | null> {
    return this.cache.read<WeeklyTrend>(this.cache.key('/dashboard/weekly-trend'), TTL.summary);
  }

  async weeklyTrend(): Promise<WeeklyTrend> {
    const value = await this.api.weeklyTrend();
    await this.cache.write(this.cache.key('/dashboard/weekly-trend'), value);
    return value;
  }

  cachedStations(): Promise<CacheRead<Array<Station>> | null> {
    return this.cache.read<Array<Station>>(this.cache.key('/stations'), TTL.metadata);
  }

  async stations(): Promise<Array<Station>> {
    if (this.stationListRequest) return this.stationListRequest;
    this.stationListRequest = this.fetchStations();
    try {
      return await this.stationListRequest;
    } finally {
      this.stationListRequest = null;
    }
  }

  private async fetchStations(): Promise<Array<Station>> {
    const value = await this.api.stations();
    await this.cache.write(this.cache.key('/stations'), value);
    return value;
  }

  cachedDevices(stationId: string): Promise<CacheRead<Array<Device>> | null> {
    return this.cache.read<Array<Device>>(this.cache.key('/devices', stationId), TTL.metadata);
  }

  async devices(stationId: string): Promise<Array<Device>> {
    const pending = this.deviceListRequests.get(stationId);
    if (pending) return pending;
    const request = this.fetchDevices(stationId);
    this.deviceListRequests.set(stationId, request);
    try {
      return await request;
    } finally {
      this.deviceListRequests.delete(stationId);
    }
  }

  private async fetchDevices(stationId: string): Promise<Array<Device>> {
    const value = await this.api.devices(stationId);
    await this.cache.write(this.cache.key('/devices', stationId), value);
    return value;
  }

  async fieldAlarmStatus(): Promise<FieldAlarmStatus> {
    if (this.fieldAlarmStatusRequest) return this.fieldAlarmStatusRequest;
    this.fieldAlarmStatusRequest = this.api.fieldAlarmStatus();
    try {
      return await this.fieldAlarmStatusRequest;
    } finally {
      this.fieldAlarmStatusRequest = null;
    }
  }

  cachedEdgeAiStatus(): Promise<CacheRead<EdgeAiStatus> | null> {
    return this.cache.read<EdgeAiStatus>(this.cache.key('/edge-ai/status'), TTL.summary);
  }

  async edgeAiStatus(): Promise<EdgeAiStatus> {
    if (this.edgeAiStatusRequest) return this.edgeAiStatusRequest;
    this.edgeAiStatusRequest = this.fetchEdgeAiStatus();
    try {
      return await this.edgeAiStatusRequest;
    } finally {
      this.edgeAiStatusRequest = null;
    }
  }

  private async fetchEdgeAiStatus(): Promise<EdgeAiStatus> {
    const value = await this.api.edgeAiStatus();
    if (value.available) await this.cache.write(this.cache.key('/edge-ai/status'), value);
    return value;
  }

  async edgeAiActions(): Promise<EdgeAiActionHistory> {
    if (this.edgeAiActionsRequest) return this.edgeAiActionsRequest;
    this.edgeAiActionsRequest = this.api.edgeAiActions();
    try {
      return await this.edgeAiActionsRequest;
    } finally {
      this.edgeAiActionsRequest = null;
    }
  }

  runEdgeAiAction(action: EdgeAiActionName, intent: string): Promise<EdgeAiActionResponse> {
    return this.api.runEdgeAiAction(action, intent);
  }

  runEdgeAiIntent(intent: string): Promise<EdgeAiIntentResponse> {
    return this.api.runEdgeAiIntent(intent);
  }

  hermesConversations(): Promise<HermesConversationList> {
    return this.api.hermesConversations();
  }

  hermesConversation(conversationId: string): Promise<HermesConversationHistory> {
    return this.api.hermesConversation(conversationId);
  }

  sendHermesMessage(message: string, conversationId: string = ''): Promise<HermesChatResponse> {
    return this.api.sendHermesMessage(message, conversationId);
  }

  cachedState(deviceId: string): Promise<CacheRead<DeviceState> | null> {
    return this.cache.read<DeviceState>(this.cache.key('/data/state', deviceId), TTL.state);
  }

  async deviceState(deviceId: string): Promise<DeviceState> {
    const pending = this.stateRequests.get(deviceId);
    if (pending) return pending;
    const request = this.fetchDeviceState(deviceId);
    this.stateRequests.set(deviceId, request);
    try {
      return await request;
    } finally {
      this.stateRequests.delete(deviceId);
    }
  }

  private async fetchDeviceState(deviceId: string): Promise<DeviceState> {
    const value = await this.api.deviceState(deviceId);
    await this.cache.write(this.cache.key('/data/state', deviceId), value);
    return value;
  }

  cachedSeries(deviceId: string): Promise<CacheRead<SeriesResponse> | null> {
    return this.cache.read<SeriesResponse>(this.cache.key('/data/series', deviceId), TTL.series);
  }

  async series(deviceId: string): Promise<SeriesResponse> {
    const pending = this.seriesRequests.get(deviceId);
    if (pending) return pending;
    const request = this.fetchSeries(deviceId);
    this.seriesRequests.set(deviceId, request);
    try {
      return await request;
    } finally {
      this.seriesRequests.delete(deviceId);
    }
  }

  private async fetchSeries(deviceId: string): Promise<SeriesResponse> {
    const value = await this.api.series(deviceId);
    await this.cache.write(this.cache.key('/data/series', deviceId), value, false);
    return value;
  }

  cachedWeeklySeries(deviceId: string): Promise<CacheRead<SeriesResponse> | null> {
    return this.cache.read<SeriesResponse>(this.cache.key('/data/series/weekly', deviceId), TTL.series);
  }

  async weeklySeries(deviceId: string): Promise<SeriesResponse> {
    const pending = this.weeklySeriesRequests.get(deviceId);
    if (pending) return pending;
    const request = this.fetchWeeklySeries(deviceId);
    this.weeklySeriesRequests.set(deviceId, request);
    try {
      return await request;
    } finally {
      this.weeklySeriesRequests.delete(deviceId);
    }
  }

  private async fetchWeeklySeries(deviceId: string): Promise<SeriesResponse> {
    const value = await this.api.weeklySeries(deviceId);
    await this.cache.write(this.cache.key('/data/series/weekly', deviceId), value, false);
    return value;
  }

  cachedAlerts(): Promise<CacheRead<AlertPage> | null> {
    return this.cache.read<AlertPage>(this.cache.key('/alerts'), TTL.alerts);
  }

  async alerts(): Promise<AlertPage> {
    if (this.alertsRequest) return this.alertsRequest;
    this.alertsRequest = this.fetchAlerts();
    try {
      return await this.alertsRequest;
    } finally {
      this.alertsRequest = null;
    }
  }

  private async fetchAlerts(): Promise<AlertPage> {
    const value = await this.api.alerts();
    await this.cache.write(this.cache.key('/alerts'), value);
    return value;
  }

  async alertEvents(alertId: string): Promise<AlertEventsResponse> {
    return this.api.alertEvents(alertId);
  }

  async predictions(): Promise<PredictionPage> {
    return this.api.predictions();
  }

  async clear(): Promise<void> {
    this.dashboardRequest = null;
    this.stationListRequest = null;
    this.alertsRequest = null;
    this.fieldAlarmStatusRequest = null;
    this.edgeAiStatusRequest = null;
    this.deviceListRequests.clear();
    this.stateRequests.clear();
    this.seriesRequests.clear();
    this.weeklySeriesRequests.clear();
    await this.cache.clear();
  }
}
