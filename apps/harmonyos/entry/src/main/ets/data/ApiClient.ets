import http from '@ohos.net.http';
import { ApiEnvelope, LoginData, UserSummary, DashboardSummary, WeeklyTrend, Station, Device, DeviceState, SensorDefinition, MetricSeries, SeriesResponse, AlertPage, AlertEventsResponse, PredictionPage, FieldAlarmStatus, EdgeAiStatus, EdgeAiActionName, EdgeAiActionResponse, EdgeAiActionHistory, EdgeAiIntentResponse, HermesChatResponse, HermesConversationHistory, HermesConversationList } from './Types';
import { normalizeApiBaseUrl } from './ApiConfig';

export class ApiError extends Error {
  statusCode: number;
  traceId: string;

  constructor(message: string, statusCode: number = 0, traceId: string = '') {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.traceId = traceId;
  }
}

type Method = http.RequestMethod;
type TokenObserver = (accessToken: string, refreshToken: string) => void;

interface LoginRequest {
  username: string;
  password: string;
}

interface RefreshRequest {
  refreshToken: string;
}

interface EmptyRequest {}

interface PushDeviceRequest {
  token: string;
  platform?: string;
  bundleName?: string;
}

interface EdgeAiActionRequest {
  action: EdgeAiActionName;
  intent?: string;
  requestId: string;
}

interface EdgeAiIntentRequest {
  intent: string;
  requestId: string;
}

interface HermesChatRequest {
  message: string;
  conversationId?: string;
}

export class ApiClient {
  private baseUrl: string;
  private accessToken: string = '';
  private refreshTokenValue: string = '';
  private refreshPromise: Promise<boolean> | null = null;
  private tokenObserver: TokenObserver | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = normalizeApiBaseUrl(baseUrl);
  }

  setBaseUrl(value: string): void {
    this.baseUrl = normalizeApiBaseUrl(value);
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  setTokens(accessToken: string, refreshToken: string): void {
    this.accessToken = accessToken;
    this.refreshTokenValue = refreshToken;
    if (this.tokenObserver) this.tokenObserver(accessToken, refreshToken);
  }

  setTokenObserver(observer: TokenObserver): void {
    this.tokenObserver = observer;
  }

  getAccessToken(): string {
    return this.accessToken;
  }

  getRefreshToken(): string {
    return this.refreshTokenValue;
  }

  clearTokens(): void {
    this.accessToken = '';
    this.refreshTokenValue = '';
    this.refreshPromise = null;
  }

  hasSession(): boolean {
    return this.accessToken.length > 0;
  }

  async login(username: string, password: string): Promise<LoginData> {
    const requestBody: LoginRequest = {
      username,
      password
    };
    const data = await this.request<LoginData>('/auth/login', http.RequestMethod.POST, requestBody, false, false);
    const accessToken = data.token ?? data.accessToken ?? '';
    if (!accessToken || !data.refreshToken) {
      throw new ApiError('登录响应缺少 Token');
    }
    this.setTokens(accessToken, data.refreshToken);
    return data;
  }

  async currentUser(): Promise<UserSummary> {
    return this.request<UserSummary>('/auth/me');
  }

  async logout(): Promise<void> {
    try {
      const requestBody: EmptyRequest = {};
      await this.request<Object>('/auth/logout', http.RequestMethod.POST, requestBody);
    } finally {
      this.clearTokens();
    }
  }

  async dashboard(): Promise<DashboardSummary> {
    return this.request<DashboardSummary>('/dashboard');
  }

  async weeklyTrend(): Promise<WeeklyTrend> {
    return this.request<WeeklyTrend>('/dashboard/weekly-trend');
  }

  async stations(): Promise<Array<Station>> {
    const data = await this.request<Object>('/stations?page=1&pageSize=100');
    return this.listFromPage<Station>(data);
  }

  async devices(stationId: string): Promise<Array<Device>> {
    const query = stationId ? `?stationId=${encodeURIComponent(stationId)}&page=1&pageSize=100` : '?page=1&pageSize=100';
    const data = await this.request<Object>(`/devices${query}`);
    return this.listFromPage<Device>(data);
  }

  async fieldAlarmStatus(): Promise<FieldAlarmStatus> {
    return this.request<FieldAlarmStatus>('/field-alarm/status');
  }

  async sensors(deviceId: string): Promise<Array<SensorDefinition>> {
    const data = await this.request<Object>(`/devices/${encodeURIComponent(deviceId)}/sensors`);
    if (Array.isArray(data)) return data as Array<SensorDefinition>;
    return this.listFromPage<SensorDefinition>(data);
  }

  async deviceState(deviceId: string): Promise<DeviceState> {
    return this.request<DeviceState>(`/data/state/${encodeURIComponent(deviceId)}`);
  }

  async series(deviceId: string, sensorKeys: Array<string> = ['tilt_x_deg', 'tilt_y_deg', 'soil_temperature_c', 'temperature_c', 'soil_moisture_pct', 'humidity_pct', 'electrical_conductivity_us_cm']): Promise<SeriesResponse> {
    return this.seriesForRange(deviceId, sensorKeys, 24, '5m');
  }

  async weeklySeries(deviceId: string): Promise<SeriesResponse> {
    return this.seriesForRange(
      deviceId,
      ['tilt_y_deg', 'soil_temperature_c', 'temperature_c', 'soil_moisture_pct', 'humidity_pct', 'electrical_conductivity_us_cm'],
      7 * 24,
      '1h'
    );
  }

  async gpsSeries(deviceId: string): Promise<SeriesResponse> {
    const end = new Date();
    const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
    const sensorKeys = ['gps_latitude', 'gps_longitude'];
    const query = `?startTime=${encodeURIComponent(start.toISOString())}&endTime=${encodeURIComponent(end.toISOString())}&sensorKeys=${encodeURIComponent(sensorKeys.join(','))}&interval=5m&timeField=received`;
    return this.request<SeriesResponse>(`/data/series/${encodeURIComponent(deviceId)}${query}`);
  }

  private async seriesForRange(deviceId: string, sensorKeys: Array<string>, hours: number, interval: string): Promise<SeriesResponse> {
    const end = new Date();
    const start = new Date(end.getTime() - hours * 60 * 60 * 1000);
    const query = `?startTime=${encodeURIComponent(start.toISOString())}&endTime=${encodeURIComponent(end.toISOString())}&sensorKeys=${encodeURIComponent(sensorKeys.join(','))}&interval=${encodeURIComponent(interval)}&timeField=received`;
    const response = await this.request<SeriesResponse>(`/data/series/${encodeURIComponent(deviceId)}${query}`);
    return this.normalizeMonitoringSeries(response);
  }

  private findSeries(series: Array<MetricSeries>, sensorKey: string): MetricSeries | null {
    for (let index = 0; index < series.length; index++) {
      if (series[index].sensorKey === sensorKey && series[index].points.length > 0) return series[index];
    }
    return null;
  }

  private preferredSeries(series: Array<MetricSeries>, sensorKey: string, fallbackKey: string = ''): MetricSeries | null {
    const source = this.findSeries(series, sensorKey) ?? (fallbackKey.length > 0 ? this.findSeries(series, fallbackKey) : null);
    if (!source) return null;
    return {
      sensorKey,
      unit: source.unit,
      dataType: source.dataType,
      points: source.points
    };
  }

  private normalizeMonitoringSeries(response: SeriesResponse): SeriesResponse {
    const normalized: Array<MetricSeries> = [];
    const tiltX = this.preferredSeries(response.series, 'tilt_x_deg');
    const tiltY = this.preferredSeries(response.series, 'tilt_y_deg');
    const soilTemperature = this.preferredSeries(response.series, 'soil_temperature_c', 'temperature_c');
    const soilMoisture = this.preferredSeries(response.series, 'soil_moisture_pct', 'humidity_pct');
    const soilConductivity = this.preferredSeries(response.series, 'electrical_conductivity_us_cm');
    if (tiltX) normalized.push(tiltX);
    if (tiltY) normalized.push(tiltY);
    if (soilTemperature) normalized.push(soilTemperature);
    if (soilMoisture) normalized.push(soilMoisture);
    if (soilConductivity) normalized.push(soilConductivity);
    return {
      deviceId: response.deviceId,
      startTime: response.startTime,
      endTime: response.endTime,
      interval: response.interval,
      series: normalized,
      missing: response.missing
    };
  }

  async alerts(): Promise<AlertPage> {
    return this.request<AlertPage>('/alerts?page=1&pageSize=50&status=active');
  }

  async alertEvents(alertId: string): Promise<AlertEventsResponse> {
    return this.request<AlertEventsResponse>(`/alerts/${encodeURIComponent(alertId)}/events`);
  }

  async predictions(): Promise<PredictionPage> {
    return this.request<PredictionPage>('/ai/predictions?page=1&pageSize=5');
  }

  async edgeAiStatus(): Promise<EdgeAiStatus> {
    return this.request<EdgeAiStatus>('/edge-ai/status');
  }

  async edgeAiActions(): Promise<EdgeAiActionHistory> {
    return this.request<EdgeAiActionHistory>('/edge-ai/actions');
  }

  async edgeAiAction(actionId: string): Promise<EdgeAiActionResponse> {
    return this.request<EdgeAiActionResponse>(`/edge-ai/actions/${encodeURIComponent(actionId)}`);
  }

  async runEdgeAiAction(action: EdgeAiActionName, intent: string): Promise<EdgeAiActionResponse> {
    const body: EdgeAiActionRequest = {
      action,
      intent,
      requestId: this.edgeAiRequestId(action)
    };
    return this.request<EdgeAiActionResponse>('/edge-ai/actions', http.RequestMethod.POST, body);
  }

  async runEdgeAiIntent(intent: string): Promise<EdgeAiIntentResponse> {
    const body: EdgeAiIntentRequest = { intent, requestId: this.edgeAiRequestId('intent') };
    return this.request<EdgeAiIntentResponse>('/edge-ai/intents', http.RequestMethod.POST, body);
  }

  async hermesConversations(): Promise<HermesConversationList> {
    return this.request<HermesConversationList>('/edge-ai/conversations?pageSize=20');
  }

  async hermesConversation(conversationId: string): Promise<HermesConversationHistory> {
    return this.request<HermesConversationHistory>(
      `/edge-ai/conversations/${encodeURIComponent(conversationId)}/messages`
    );
  }

  async sendHermesMessage(message: string, conversationId: string = ''): Promise<HermesChatResponse> {
    const body: HermesChatRequest = conversationId.length > 0
      ? { message: message, conversationId: conversationId }
      : { message: message };
    return this.request<HermesChatResponse>('/edge-ai/chat', http.RequestMethod.POST, body, true, true, 30000);
  }

  private edgeAiRequestId(kind: string): string {
    const randomPart = Math.floor(Math.random() * 0xFFFFFFF).toString(36);
    return `harmonyos:${kind}:${Date.now().toString(36)}:${randomPart}`;
  }

  async refreshSession(): Promise<boolean> {
    return this.refresh();
  }

  async registerPushDevice(token: string): Promise<void> {
    const body: PushDeviceRequest = {
      token,
      platform: 'harmonyos',
      bundleName: 'com.kipp7.landslide.monitoring'
    };
    await this.request<Object>('/push/devices', http.RequestMethod.POST, body);
  }

  async unregisterPushDevice(token: string): Promise<void> {
    const body: PushDeviceRequest = { token };
    await this.request<Object>('/push/devices', http.RequestMethod.DELETE, body);
  }

  private listFromPage<T>(data: Object): Array<T> {
    if (Array.isArray(data)) return data as Array<T>;
    const record = data as Record<string, Object>;
    if (Array.isArray(record.list)) return record.list as Array<T>;
    const nested = record.data as Record<string, Object> | undefined;
    if (nested && Array.isArray(nested.list)) return nested.list as Array<T>;
    return [];
  }

  private async refresh(): Promise<boolean> {
    if (!this.refreshTokenValue) return false;
    if (this.refreshPromise) return this.refreshPromise;
    const requestBody: RefreshRequest = {
      refreshToken: this.refreshTokenValue
    };
    this.refreshPromise = this.request<Object>('/auth/refresh', http.RequestMethod.POST, requestBody, false, false)
      .then((data) => {
        const record = data as Record<string, Object>;
        const accessToken = String(record.token ?? record.accessToken ?? '');
        const refreshToken = String(record.refreshToken ?? this.refreshTokenValue);
        if (!accessToken) return false;
        this.setTokens(accessToken, refreshToken);
        return true;
      })
      .catch(() => false)
      .finally(() => {
        this.refreshPromise = null;
      });
    return this.refreshPromise;
  }

  private async request<T>(path: string, method: Method = http.RequestMethod.GET, body?: Object, auth: boolean = true, retry: boolean = true, readTimeoutMs: number = 10000): Promise<T> {
    const request = http.createHttp();
    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    };
    if (auth && this.accessToken) headers['Authorization'] = `Bearer ${this.accessToken}`;

    try {
      const response = await request.request(`${this.baseUrl}${path}`, {
        method,
        header: headers,
        extraData: body === undefined ? undefined : JSON.stringify(body),
        connectTimeout: 10000,
        readTimeout: readTimeoutMs
      });
      const envelope = this.parseEnvelope<T>(response.result);
      if (response.responseCode === 401 && auth && retry && await this.refresh()) {
        return this.request<T>(path, method, body, auth, false, readTimeoutMs);
      }
      if (response.responseCode < 200 || response.responseCode >= 300 || envelope.success === false) {
        throw new ApiError(envelope.message || `HTTP ${response.responseCode}`, response.responseCode, envelope.traceId || '');
      }
      return envelope.data;
    } finally {
      request.destroy();
    }
  }

  private parseEnvelope<T>(result: Object): ApiEnvelope<T> {
    if (typeof result === 'string') {
      try {
        return JSON.parse(result) as ApiEnvelope<T>;
      } catch {
        throw new ApiError('服务器响应格式异常');
      }
    }
    return result as ApiEnvelope<T>;
  }
}
