import common from '@ohos.app.ability.common';
import { ApiClient, ApiError } from '../data/ApiClient';
import { DEFAULT_API_BASE_URL, normalizeApiBaseUrl } from '../data/ApiConfig';
import { AlertLocationRepository, alertLocationSourceLabel } from '../data/AlertLocationRepository';
import { CacheManager } from '../data/CacheManager';
import { MonitoringRepository } from '../data/Repositories';
import { SecureSession, SessionStore } from '../data/SessionStore';
import { AlertNotificationService } from '../data/AlertNotificationService';
import { AlertAlarmService } from '../data/AlertAlarmService';
import { DeviceLocationService } from '../data/DeviceLocationService';
import { AlertStreamClient } from '../data/AlertStreamClient';
import { PushRegistrationService } from '../data/PushRegistrationService';
import { Alert, AlertEvent, AlertMapLocation, AlertStreamEvent, DashboardSummary, Device, DeviceState, EdgeAgentTask, EdgeAiActionName, EdgeAiIntentResolution, EdgeAiStatus, EdgeRiskDevice, EvacuationTarget, HermesAction, HermesAgentTask, HermesConversation, HermesDiagnosticEvidence, HermesMessage, MetricSeries, SeriesPoint, SeriesResponse, Station, UserLocationStatus, UserMapLocation, alertStatusLabel, beijingClockTime, deviceConnectivityLabel, deviceDisplayName, deviceSupportsConductivity, deviceTypeLabel, displayMetric, eventTypeLabel, isAlarmActuatorDevice, isDeviceOnline, isOnlineStatus, metricShortLabel, metricUnitLabel, metricValue, numberValue, relativeTime, severityLabel, shortTime, soilConductivityValue, soilMoistureValue, soilTemperatureValue, stationDisplayName, stationNameLabel, stationStatusLabel, userDisplayName } from '../data/Types';
import { AlertMapView } from '../components/AlertMapView';
import { ActiveAlertBanner, InAppAlertOverlay } from '../components/InAppAlertOverlay';
import { MetricCard } from '../components/MetricCard';
import { StatusBanner } from '../components/StatusBanner';

type AppScreen = 'overview' | 'stations' | 'ai' | 'alerts' | 'settings' | 'device' | 'alert-map';

const UI_COLOR_TEXT: string = '#18212B';
const UI_COLOR_MUTED: string = '#6C7782';
const UI_COLOR_SUBTLE: string = '#8A949E';
const UI_COLOR_SURFACE: string = '#FFFFFF';
const UI_COLOR_ACCENT: string = '#E46D35';
const UI_COLOR_SUCCESS: string = '#3C9D82';
const UI_COLOR_DANGER: string = '#B44832';
const UI_COLOR_MAP_DEFAULT: string = '#99441F';
const UI_COLOR_MAP_MUTED: string = '#5B6670';
const UI_COLOR_LOGIN_BRAND: string = '#173D32';
const UI_COLOR_LOGIN_PAGE: string = '#F3F6F4';
const UI_COLOR_LOGIN_FIELD: string = '#E8EEEB';
const UI_COLOR_LOGIN_BORDER: string = '#D7E0DC';
const UI_COLOR_LOGIN_ERROR: string = '#F8EAE6';
const UI_COLOR_HERMES: string = '#173D32';
const UI_COLOR_HERMES_SOFT: string = '#EAF1ED';
const UI_COLOR_HERMES_LINE: string = '#C9D8D0';
const UI_PAGE_PADDING: number = 16;

function edgeNodeFallbackName(deviceId: string): string {
  const suffix = deviceId.slice(-4);
  if (suffix === '0001') return '监测节点 A';
  if (suffix === '0002') return '监测节点 B';
  if (suffix === '0003') return '监测节点 C';
  return `监测节点 ${suffix}`;
}

function hermesDiagnosisLabel(value: string | undefined): string {
  if (value === 'healthy_watch') return '链路运行平稳';
  if (value === 'center_mqtt_route_unreachable') return '中心消息通路不可达';
  if (value === 'center_mqtt_service_unavailable') return '中心消息服务不可用';
  if (value === 'southbound_serial_or_gateway_gap') return '南向采集链路异常';
  if (value === 'field_nodes_not_reporting') return '现场节点未形成有效上报';
  if (value === 'shared_port_noise') return '共享串口存在数据干扰';
  if (value === 'ap_fallback_backhaul_degraded') return '回传网络质量下降';
  if (value === 'publish_backlog_pressure') return '上报队列存在积压压力';
  if (value === 'edge_resource_pressure') return '边缘主机资源压力偏高';
  if (value === 'model_unavailable') return '诊断模型暂不可用';
  return '需要人工复核';
}

function localizedHermesText(value: string): string {
  let result = value;
  result = result.replace('spool pending', '待上传队列');
  result = result.replace('publish freshness', '上报时效');
  result = result.replace('field-gateway journal', '网关运行日志');
  result = result.replace('field-gateway', '现场网关');
  result = result.replace('/dev/ttyS3', '南向串口');
  result = result.replace('serial 和 southbound', '串口与南向链路');
  result = result.replace('rejected/schemaRejected/interleaving', '拒收、格式校验与数据交错');
  result = result.replace('RK3568 parser', 'RK3568 解析器');
  result = result.replace('STA 网络', '主 Wi-Fi 网络');
  result = result.replace('AP fallback', '维护热点回退');
  result = result.replace('CPU load', '处理器负载');
  result = result.replace('telemetry', '遥测上报');
  result = result.replace('supervision', '监督');
  result = result.replace('Commands are suggestions for operator/export tooling; this action does not execute them.',
    '仅生成供值守人员查看的诊断计划，不会执行系统命令。');
  return result;
}

function hermesActionSummary(action: HermesAction): string {
  if (action.status === 'queued') return '任务已排队，等待 Hermes 执行';
  if (action.status === 'running') return 'Hermes 正在执行只读任务';
  if (action.status === 'failed') return action.error ? `任务失败：${action.error}` : '任务执行失败，监测主链路未受影响';
  if (action.action === 'recheck' && action.result.diagnosisType) {
    const confidence = action.result.confidence;
    const confidenceText = confidence === undefined ? '' : `，研判置信度 ${Math.round(confidence * 100)}%`;
    return `已完成边缘风险复检：${hermesDiagnosisLabel(action.result.diagnosisType)}${confidenceText}。`;
  }
  return localizedHermesText(action.summary);
}

interface DeviceMonitoringTrend {
  device: Device;
  response: SeriesResponse;
  latestStateAt?: string;
}

@Entry
@Component
struct Index {
  @StorageLink('pendingAlertId') @Watch('onPendingAlertChanged') private pendingAlertId: string = '';
  @StorageLink('pendingAlertPayload') private pendingAlertPayload: string = '';
  @State private sessionRestoring: boolean = true;
  @State private loggedIn: boolean = false;
  @State private showLoginServerSettings: boolean = false;
  @State private busy: boolean = false;
  @State private errorMessage: string = '';
  @State private screen: AppScreen = 'overview';
  @State private username: string = '';
  @State private userName: string = '';
  @State private apiBaseUrl: string = DEFAULT_API_BASE_URL;
  @State private overviewFreshness: string = '尚未更新';
  @State private stationFreshness: string = '尚未更新';
  @State private deviceFreshness: string = '尚未更新';
  @State private alertFreshness: string = '尚未更新';
  @State private overviewOffline: boolean = false;
  @State private stationOffline: boolean = false;
  @State private deviceOffline: boolean = false;
  @State private alertOffline: boolean = false;
  @State private connectionState: string = 'unknown';
  @State private connectionUpdatedAt: string = '尚未请求';
  @State private dashboard: DashboardSummary | null = null;
  @State private edgeAiStatus: EdgeAiStatus | null = null;
  @State private edgeAiRefreshing: boolean = false;
  @State private edgeAiActionBusy: boolean = false;
  @State private edgeAiActions: Array<HermesAction> = [];
  @State private edgeAiLastAction: HermesAction | null = null;
  @State private edgeAiIntentResolution: EdgeAiIntentResolution | null = null;
  @State private edgeAiConversations: Array<HermesConversation> = [];
  @State private edgeAiConversationId: string = '';
  @State private edgeAiMessages: Array<HermesMessage> = [];
  @State private edgeAiConversationTasks: Array<HermesAgentTask> = [];
  @State private edgeAiChatLoading: boolean = false;
  @State private overviewTrends: Array<DeviceMonitoringTrend> = [];
  @State private stations: Array<Station> = [];
  @State private devices: Array<Device> = [];
  @State private alarmActuators: Array<Device> = [];
  @State private alarmActuatorOnline: boolean | null = null;
  @State private deviceStates: Array<DeviceState> = [];
  @State private stationMapLocations: Array<AlertMapLocation> = [];
  @State private stationMapLoading: boolean = false;
  @State private selectedStationId: string = '';
  @State private selectedDevice: Device | null = null;
  @State private selectedDeviceState: DeviceState | null = null;
  @State private selectedSeries: SeriesResponse | null = null;
  @State private alerts: Array<Alert> = [];
  @State private selectedAlert: Alert | null = null;
  @State private alertEvents: Array<AlertEvent> = [];
  @State private eventsLoading: boolean = false;
  @State private stationRefreshing: boolean = false;
  @State private deviceRefreshing: boolean = false;
  @State private overviewRefreshing: boolean = false;
  @State private alertRefreshing: boolean = false;
  @State private alertMapAlert: Alert | null = null;
  @State private alertMapLocation: AlertMapLocation | null = null;
  @State private alertMapLocations: Array<AlertMapLocation> = [];
  @State private alertMapLoading: boolean = false;
  @State private userMapLocation: UserMapLocation | null = null;
  @State private userLocationStatus: UserLocationStatus = 'idle';
  @State private appVisible: boolean = true;
  @State private activeAlertEvent: AlertStreamEvent | null = null;
  @State private alertOverlayVisible: boolean = false;
  @State private alertAlarmMuted: boolean = false;
  @State private queuedAlertCount: number = 0;

  private context: common.UIAbilityContext | undefined = undefined;
  private api: ApiClient = new ApiClient(DEFAULT_API_BASE_URL);
  private repository: MonitoringRepository | undefined = undefined;
  private cache: CacheManager | undefined = undefined;
  private alertLocationRepository: AlertLocationRepository | undefined = undefined;
  private deviceLocationService: DeviceLocationService | undefined = undefined;
  private alertStream: AlertStreamClient | undefined = undefined;
  private alertNotifications: AlertNotificationService | undefined = undefined;
  private alertAlarm: AlertAlarmService | undefined = undefined;
  private pushRegistration: PushRegistrationService = new PushRegistrationService();
  private alertEventQueue: Array<AlertStreamEvent> = [];
  private handlingPendingAlert: boolean = false;
  private overviewTimer: number | undefined = undefined;
  private alertTimer: number | undefined = undefined;
  private stationTimer: number | undefined = undefined;
  private deviceTimer: number | undefined = undefined;
  private deviceSeriesTimer: number | undefined = undefined;
  private stationRequestSequence: number = 0;
  private stationStateRequestSequence: number = 0;
  private stationMapRequestSequence: number = 0;
  private userLocationRequestSequence: number = 0;

  aboutToAppear(): void {
    this.context = getContext(this) as common.UIAbilityContext;
    this.alertAlarm = new AlertAlarmService(this.context);
    this.deviceLocationService = new DeviceLocationService(this.context);
    this.api.setTokenObserver(() => {
      this.saveSession();
    });
    this.restoreSession();
  }

  aboutToDisappear(): void {
    this.stopTimers();
    this.stopAlertStream(true);
    if (this.alertAlarm) this.alertAlarm.release();
    this.alertAlarm = undefined;
  }

  onPageShow(): void {
    this.appVisible = true;
    if (!this.loggedIn) return;
    this.startTimers();
    this.startAlertStream();
    this.refreshCurrentScreen();
    if (this.activeAlertEvent && !this.alertAlarmMuted) this.getAlertAlarm().start();
  }

  onPageHide(): void {
    this.appVisible = false;
    this.stopTimers();
    this.stopAlertStream();
  }

  private getRepository(): MonitoringRepository {
    if (!this.repository && this.context) {
      this.cache = new CacheManager(this.context, this.api.getBaseUrl(), this.username || 'anonymous');
      this.repository = new MonitoringRepository(this.api, this.cache);
      this.alertLocationRepository = new AlertLocationRepository(this.api, this.cache);
    }
    return this.repository as MonitoringRepository;
  }

  private rebuildRepository(): void {
    if (!this.context) return;
    this.cache = new CacheManager(this.context, this.api.getBaseUrl(), this.username || 'anonymous');
    this.repository = new MonitoringRepository(this.api, this.cache);
    this.alertLocationRepository = new AlertLocationRepository(this.api, this.cache);
  }

  private releaseRepositories(): void {
    this.repository = undefined;
    this.cache = undefined;
    this.alertLocationRepository = undefined;
  }

  private async saveSession(): Promise<void> {
    if (!this.loggedIn || !this.username || !this.api.hasSession()) return;
    const session: SecureSession = {
      apiBaseUrl: this.api.getBaseUrl(),
      username: this.username,
      userName: this.userName,
      accessToken: this.api.getAccessToken(),
      refreshToken: this.api.getRefreshToken()
    };
    try {
      await SessionStore.save(session);
    } catch {
      // The active in-memory session remains usable when secure storage is unavailable.
    }
  }

  private async restoreSession(): Promise<void> {
    try {
      const session = await SessionStore.load();
      if (!session) return;
      const apiBaseUrl = normalizeApiBaseUrl(session.apiBaseUrl);
      if (!apiBaseUrl) {
        await SessionStore.clear();
        return;
      }

      this.apiBaseUrl = apiBaseUrl;
      this.api.setBaseUrl(apiBaseUrl);
      this.username = session.username;
      this.userName = session.userName || userDisplayName(session.username);
      this.api.setTokens(session.accessToken, session.refreshToken);
      this.loggedIn = true;
      this.rebuildRepository();

      try {
        const user = await this.api.currentUser();
        this.userName = userDisplayName(user.realName ?? user.username);
        this.markConnection(true);
        await this.saveSession();
      } catch (error) {
        if (error instanceof ApiError && error.statusCode === 401) {
          await this.invalidateSession();
          return;
        }
        this.markConnection(false);
      }

      await this.loadOverview();
      this.startTimers();
      this.startAlertStream();
      this.pushRegistration.register(this.api);
      await this.openPendingAlert();
    } finally {
      this.sessionRestoring = false;
    }
  }

  private async invalidateSession(): Promise<void> {
    this.stopTimers();
    this.stopAlertStream(true);
    this.api.clearTokens();
    if (this.repository) await this.repository.clear();
    await SessionStore.clear();
    this.releaseRepositories();
    this.loggedIn = false;
    this.userName = '';
    this.username = '';
    this.connectionState = 'unknown';
    this.connectionUpdatedAt = '尚未请求';
    this.resetMonitoringData();
  }

  private markConnection(success: boolean): void {
    this.connectionState = success ? 'success' : 'failure';
    this.connectionUpdatedAt = shortTime(new Date().toISOString());
    if (success) this.errorMessage = '';
  }

  private resetMonitoringData(): void {
    this.clearInAppAlerts();
    this.dashboard = null;
    this.edgeAiStatus = null;
    this.edgeAiRefreshing = false;
    this.edgeAiActionBusy = false;
    this.edgeAiActions = [];
    this.edgeAiLastAction = null;
    this.edgeAiIntentResolution = null;
    this.edgeAiConversations = [];
    this.edgeAiConversationId = '';
    this.edgeAiMessages = [];
    this.edgeAiConversationTasks = [];
    this.edgeAiChatLoading = false;
    this.overviewTrends = [];
    this.stations = [];
    this.devices = [];
    this.alarmActuators = [];
    this.alarmActuatorOnline = null;
    this.deviceStates = [];
    this.stationMapLocations = [];
    this.stationMapLoading = false;
    this.stationMapRequestSequence += 1;
    this.selectedStationId = '';
    this.selectedDevice = null;
    this.selectedDeviceState = null;
    this.selectedSeries = null;
    this.alerts = [];
    this.selectedAlert = null;
    this.alertEvents = [];
    this.alertMapAlert = null;
    this.alertMapLocation = null;
    this.alertMapLocations = [];
    this.alertMapLoading = false;
    this.userMapLocation = null;
    this.userLocationStatus = 'idle';
    this.userLocationRequestSequence += 1;
    this.overviewFreshness = '尚未更新';
    this.stationFreshness = '尚未更新';
    this.deviceFreshness = '尚未更新';
    this.alertFreshness = '尚未更新';
    this.overviewOffline = false;
    this.stationOffline = false;
    this.deviceOffline = false;
    this.alertOffline = false;
    this.overviewRefreshing = false;
    this.stationRefreshing = false;
    this.deviceRefreshing = false;
    this.alertRefreshing = false;
    this.screen = 'overview';
    this.errorMessage = '';
  }

  private async login(username: string, password: string, apiBaseUrl: string): Promise<void> {
    this.busy = true;
    this.errorMessage = '';
    try {
      const normalized = normalizeApiBaseUrl(apiBaseUrl);
      if (normalized.length === 0) {
        throw new Error('请输入服务器 API 地址');
      }
      if (normalized !== this.api.getBaseUrl()) {
        await this.saveApiBase(normalized);
      }
      const session = await this.api.login(username.trim(), password);
      this.username = username.trim();
      this.userName = userDisplayName(session.user.realName ?? session.user.username);
      this.loggedIn = true;
      this.showLoginServerSettings = false;
      this.markConnection(true);
      this.rebuildRepository();
      await this.saveSession();
      await this.loadOverview();
      this.startTimers();
      this.startAlertStream();
      this.pushRegistration.register(this.api);
      await this.openPendingAlert();
    } catch (error) {
      this.markConnection(false);
      this.errorMessage = this.errorText(error);
      this.showLoginServerSettings = this.isServerConnectionFailure(error);
    } finally {
      this.busy = false;
    }
  }

  private isServerConnectionFailure(error: Object): boolean {
    if (error instanceof ApiError) {
      return error.statusCode === 0 || error.statusCode === 404 || error.statusCode === 408;
    }
    return true;
  }

  private async saveLoginServerBase(value: string): Promise<void> {
    const normalized = normalizeApiBaseUrl(value);
    if (!normalized) {
      this.errorMessage = '请输入有效的服务器 API 地址';
      return;
    }
    await this.saveApiBase(normalized);
    this.errorMessage = '';
    this.showLoginServerSettings = false;
  }

  private closeLoginServerSettings(): void {
    this.errorMessage = '';
    this.showLoginServerSettings = false;
  }

  private async logout(): Promise<void> {
    this.stopTimers();
    this.stopAlertStream(true);
    await this.pushRegistration.unregister(this.api);
    try {
      await this.api.logout();
    } catch {
      this.api.clearTokens();
    }
    if (this.repository) await this.repository.clear();
    await SessionStore.clear();
    this.releaseRepositories();
    this.loggedIn = false;
    this.userName = '';
    this.username = '';
    this.connectionState = 'unknown';
    this.connectionUpdatedAt = '尚未请求';
    this.resetMonitoringData();
  }

  private applyRealtimeDeviceCounts(summary: DashboardSummary, devices: Array<Device>, states: Array<DeviceState> = []): DashboardSummary {
    let total = 0;
    let online = 0;
    for (let index = 0; index < devices.length; index++) {
      if (devices[index].status.toLowerCase() === 'revoked' || isAlarmActuatorDevice(devices[index])) continue;
      total += 1;
      let latestStateAt: string | undefined = undefined;
      for (let stateIndex = 0; stateIndex < states.length; stateIndex++) {
        if (states[stateIndex].deviceId === devices[index].deviceId) {
          latestStateAt = states[stateIndex].updatedAt;
          break;
        }
      }
      if (isDeviceOnline(devices[index], latestStateAt)) online += 1;
    }
    summary.totalDevices = total;
    summary.onlineDevices = online;
    summary.offlineDevices = Math.max(0, total - online);
    return summary;
  }

  private extractAlarmActuators(devices: Array<Device>): Array<Device> {
    const actuators: Array<Device> = [];
    for (let index = 0; index < devices.length; index++) {
      if (isAlarmActuatorDevice(devices[index])) actuators.push(devices[index]);
    }
    return actuators;
  }

  private async loadOverview(): Promise<void> {
    if (this.overviewRefreshing) return;
    this.overviewRefreshing = true;
    if (!this.repository) this.getRepository();
    const repository = this.repository as MonitoringRepository;
    this.refreshAlarmActuatorStatus();
    this.loadAlerts();
    try {
      const cachedDashboard = await repository.cachedDashboard();
      const cachedDevices = await repository.cachedDevices('');
      if (cachedDevices) this.alarmActuators = this.extractAlarmActuators(cachedDevices.value);
      if (cachedDashboard) {
        this.dashboard = cachedDevices
          ? this.applyRealtimeDeviceCounts(cachedDashboard.value, cachedDevices.value)
          : cachedDashboard.value;
        this.overviewFreshness = `缓存于 ${shortTime(new Date(cachedDashboard.savedAt).toISOString())}`;
      }

      const values = await Promise.all([repository.dashboard(), repository.devices('')]);
      this.alarmActuators = this.extractAlarmActuators(values[1]);
      this.dashboard = this.applyRealtimeDeviceCounts(values[0], values[1]);
      this.overviewFreshness = `更新于 ${shortTime(new Date().toISOString())}`;
      this.overviewOffline = false;
      this.markConnection(true);
      await this.loadOverviewTrends(values[1]);
    } catch (error) {
      this.overviewOffline = true;
      this.markConnection(false);
      this.errorMessage = this.errorText(error);
    } finally {
      this.overviewRefreshing = false;
    }
  }

  private mergeOverviewTrend(trends: Array<DeviceMonitoringTrend>, device: Device, response: SeriesResponse): Array<DeviceMonitoringTrend> {
    const next: Array<DeviceMonitoringTrend> = [];
    let latestStateAt: string | undefined = undefined;
    for (let index = 0; index < trends.length; index++) {
      if (trends[index].device.deviceId !== device.deviceId) {
        next.push(trends[index]);
      } else {
        latestStateAt = trends[index].latestStateAt;
      }
    }
    next.push({ device, response, latestStateAt });
    return next;
  }

  private mergeOverviewState(trends: Array<DeviceMonitoringTrend>, deviceId: string, state: DeviceState): Array<DeviceMonitoringTrend> {
    const next: Array<DeviceMonitoringTrend> = [];
    for (let index = 0; index < trends.length; index++) {
      const trend = trends[index];
      next.push(trend.device.deviceId === deviceId
        ? { device: trend.device, response: trend.response, latestStateAt: state.updatedAt }
        : trend);
    }
    return next;
  }

  private async fetchWeeklySeries(repository: MonitoringRepository, deviceId: string): Promise<SeriesResponse | null> {
    try {
      return await repository.weeklySeries(deviceId);
    } catch {
      return null;
    }
  }

  private async loadOverviewTrends(devices: Array<Device>): Promise<void> {
    if (!this.repository) return;
    const repository = this.repository as MonitoringRepository;
    let next: Array<DeviceMonitoringTrend> = [];
    const refreshDevices: Array<Device> = [];
    const stateTasks: Array<Promise<DeviceState | null>> = [];
    let latestStates: Array<DeviceState> = [];
    for (let index = 0; index < devices.length; index++) {
      if (isAlarmActuatorDevice(devices[index])) continue;
      const cached = await repository.cachedWeeklySeries(devices[index].deviceId);
      if (cached) next = this.mergeOverviewTrend(next, devices[index], cached.value);
      if (!cached || !cached.fresh) refreshDevices.push(devices[index]);
      const cachedState = await repository.cachedState(devices[index].deviceId);
      if (cachedState) {
        next = this.mergeOverviewState(next, devices[index].deviceId, cachedState.value);
        latestStates = this.mergeDeviceState(latestStates, cachedState.value);
      }
      stateTasks.push(this.fetchDeviceState(repository, devices[index].deviceId));
    }
    if (next.length > 0) this.overviewTrends = next;

    const tasks: Array<Promise<SeriesResponse | null>> = [];
    for (let index = 0; index < refreshDevices.length; index++) {
      tasks.push(this.fetchWeeklySeries(repository, refreshDevices[index].deviceId));
    }
    const responses = await Promise.all(tasks);
    const states = await Promise.all(stateTasks);
    for (let index = 0; index < responses.length; index++) {
      if (responses[index]) {
        next = this.mergeOverviewTrend(next, refreshDevices[index], responses[index] as SeriesResponse);
      }
    }
    for (let index = 0; index < states.length; index++) {
      if (states[index]) {
        const state = states[index] as DeviceState;
        next = this.mergeOverviewState(next, devices[index].deviceId, state);
        latestStates = this.mergeDeviceState(latestStates, state);
      }
    }
    this.overviewTrends = next;
    if (this.dashboard) this.dashboard = this.applyRealtimeDeviceCounts(this.dashboard, devices, latestStates);
  }

  private async loadStations(): Promise<void> {
    const requestSequence = ++this.stationRequestSequence;
    this.stationRefreshing = true;
    if (!this.repository) this.getRepository();
    const repository = this.repository as MonitoringRepository;
    this.refreshAlarmActuatorStatus();
    try {
      const cached = await repository.cachedStations();
      const cachedDevices = await repository.cachedDevices('');
      if (requestSequence !== this.stationRequestSequence) return;
      if (cached) this.stations = cached.value;
      if (cachedDevices) {
        this.alarmActuators = this.extractAlarmActuators(cachedDevices.value);
        this.loadStationMapLocations(cachedDevices.value);
      }

      const allDevicesTask: Promise<Array<Device> | null> = repository.devices('').catch(() => null);
      const stations = await repository.stations();
      if (requestSequence !== this.stationRequestSequence) return;
      this.stations = stations;
      const allDevices = await allDevicesTask;
      if (requestSequence !== this.stationRequestSequence) return;
      if (allDevices) {
        this.alarmActuators = this.extractAlarmActuators(allDevices);
        this.loadStationMapLocations(allDevices);
      }
      this.stationFreshness = `更新于 ${shortTime(new Date().toISOString())}`;
      this.stationOffline = false;
      this.markConnection(true);
    } catch (error) {
      if (requestSequence !== this.stationRequestSequence) return;
      this.stationOffline = true;
      this.markConnection(false);
      this.errorMessage = this.errorText(error);
    }
    if (requestSequence !== this.stationRequestSequence) return;

    let stationId = this.selectedStationId;
    let selectedStationExists = false;
    for (let index = 0; index < this.stations.length; index++) {
      if (this.stations[index].stationId === stationId) selectedStationExists = true;
    }
    if (!selectedStationExists) stationId = this.stations.length > 0 ? this.stations[0].stationId : '';

    if (stationId.length > 0) {
      await this.loadDevices(stationId, requestSequence);
    } else {
      this.selectedStationId = '';
      this.devices = [];
      this.deviceStates = [];
    }
    if (requestSequence === this.stationRequestSequence) {
      this.stationRefreshing = false;
    }
  }

  private async loadStationMapLocations(devices: Array<Device>): Promise<void> {
    const requestSequence = ++this.stationMapRequestSequence;
    this.stationMapLoading = true;
    if (!this.alertLocationRepository && this.cache) {
      this.alertLocationRepository = new AlertLocationRepository(this.api, this.cache);
    }
    const monitoringDevices: Array<Device> = [];
    for (let index = 0; index < devices.length; index++) {
      if (devices[index].status.toLowerCase() === 'revoked' || isAlarmActuatorDevice(devices[index])) continue;
      monitoringDevices.push(devices[index]);
    }
    try {
      const locations = this.alertLocationRepository
        ? await this.alertLocationRepository.resolveNodes(monitoringDevices)
        : [];
      if (requestSequence === this.stationMapRequestSequence) this.stationMapLocations = locations;
    } finally {
      if (requestSequence === this.stationMapRequestSequence) this.stationMapLoading = false;
    }
  }

  private async refreshStationMap(): Promise<void> {
    if (!this.repository) this.getRepository();
    const repository = this.repository as MonitoringRepository;
    let devices: Array<Device> = [];
    try {
      devices = await repository.devices('');
    } catch {
      const cached = await repository.cachedDevices('');
      devices = cached?.value ?? [];
    }
    await this.loadStationMapLocations(devices);
  }

  private async loadDevices(stationId: string, parentRequestSequence?: number): Promise<void> {
    const requestSequence = parentRequestSequence ?? ++this.stationRequestSequence;
    if (parentRequestSequence === undefined) this.stationRefreshing = true;
    if (this.selectedStationId !== stationId) this.deviceStates = [];
    this.selectedStationId = stationId;
    if (!this.repository) this.getRepository();
    const repository = this.repository as MonitoringRepository;
    try {
      const cached = await repository.cachedDevices(stationId);
      if (requestSequence !== this.stationRequestSequence || stationId !== this.selectedStationId) return;
      if (cached) this.devices = cached.value;

      const devices = await repository.devices(stationId);
      if (requestSequence !== this.stationRequestSequence || stationId !== this.selectedStationId) return;
      this.devices = devices;
      this.stationOffline = false;
      this.markConnection(true);
    } catch (error) {
      if (requestSequence !== this.stationRequestSequence || stationId !== this.selectedStationId) return;
      this.stationOffline = true;
      this.markConnection(false);
      this.errorMessage = this.errorText(error);
    }
    await this.refreshStationDeviceStates(stationId);
    if (requestSequence === this.stationRequestSequence) this.stationRefreshing = false;
  }

  private async fetchDeviceState(repository: MonitoringRepository, deviceId: string): Promise<DeviceState | null> {
    try {
      return await repository.deviceState(deviceId);
    } catch {
      return null;
    }
  }

  private mergeDeviceState(states: Array<DeviceState>, state: DeviceState): Array<DeviceState> {
    const next: Array<DeviceState> = [];
    for (let index = 0; index < states.length; index++) {
      if (states[index].deviceId !== state.deviceId) next.push(states[index]);
    }
    next.push(state);
    return next;
  }

  private async refreshStationDeviceStates(stationId: string = this.selectedStationId): Promise<void> {
    if (!this.repository || stationId.length === 0 || stationId !== this.selectedStationId) return;
    const stateRequestSequence = ++this.stationStateRequestSequence;
    const repository = this.repository as MonitoringRepository;
    const stationDevices: Array<Device> = [];
    for (let index = 0; index < this.devices.length; index++) {
      if (!isAlarmActuatorDevice(this.devices[index])) stationDevices.push(this.devices[index]);
    }
    let nextStates: Array<DeviceState> = [];
    const tasks: Array<Promise<DeviceState | null>> = [];
    for (let index = 0; index < stationDevices.length; index++) {
      const cached = await repository.cachedState(stationDevices[index].deviceId);
      if (cached) nextStates = this.mergeDeviceState(nextStates, cached.value);
      tasks.push(this.fetchDeviceState(repository, stationDevices[index].deviceId));
    }
    if (stateRequestSequence !== this.stationStateRequestSequence || stationId !== this.selectedStationId) return;
    if (nextStates.length > 0) this.deviceStates = nextStates;
    const states = await Promise.all(tasks);
    let updated = false;
    for (let index = 0; index < states.length; index++) {
      if (states[index]) {
        nextStates = this.mergeDeviceState(nextStates, states[index] as DeviceState);
        updated = true;
      }
    }
    if (stateRequestSequence !== this.stationStateRequestSequence || stationId !== this.selectedStationId) return;
    this.deviceStates = nextStates;
    if (updated) {
      this.stationFreshness = `更新于 ${shortTime(new Date().toISOString())}`;
      this.stationOffline = false;
      this.markConnection(true);
    } else if (stationDevices.length > 0) {
      this.stationOffline = true;
      this.markConnection(false);
    }
  }

  private async refreshAlarmActuatorStatus(): Promise<void> {
    if (!this.repository) return;
    try {
      const status = await (this.repository as MonitoringRepository).fieldAlarmStatus();
      this.alarmActuatorOnline = status.actuator.yx75r?.available ?? status.actuator.available;
    } catch {
      // Preserve the last verified state when the status request is interrupted.
    }
  }

  private async loadEdgeAiStatus(): Promise<void> {
    if (!this.repository || this.edgeAiRefreshing) return;
    this.edgeAiRefreshing = true;
    const repository = this.repository as MonitoringRepository;
    try {
      const cached = await repository.cachedEdgeAiStatus();
      if (cached) this.edgeAiStatus = cached.value;
      const status = await repository.edgeAiStatus();
      if (status.available || !cached) this.edgeAiStatus = status;
    } catch {
      // AI is an optional sidecar; keep its last snapshot without affecting monitoring pages.
    }
    try {
      const history = await repository.edgeAiActions();
      this.edgeAiActions = history.actions ?? [];
      if (!this.edgeAiLastAction && this.edgeAiActions.length > 0) {
        this.edgeAiLastAction = this.edgeAiActions[0];
      }
    } catch {
      // Keep the latest visible task history when the edge action endpoint is interrupted.
    }
    await this.loadHermesConversations(false);
    this.edgeAiRefreshing = false;
  }

  private async loadHermesConversations(refreshCurrent: boolean): Promise<void> {
    if (!this.repository || this.edgeAiChatLoading) return;
    this.edgeAiChatLoading = true;
    try {
      const repository = this.repository as MonitoringRepository;
      const response = await repository.hermesConversations();
      this.edgeAiConversations = response.conversations ?? [];
      let targetId = this.edgeAiConversationId;
      if (targetId.length === 0 && this.edgeAiConversations.length > 0) {
        targetId = this.edgeAiConversations[0].conversationId;
      }
      if (targetId.length > 0 && (refreshCurrent || this.edgeAiMessages.length === 0)) {
        const history = await repository.hermesConversation(targetId);
        this.edgeAiConversationId = history.conversation.conversationId;
        this.edgeAiMessages = history.messages ?? [];
        this.edgeAiConversationTasks = history.tasks ?? [];
      }
    } catch {
      // The conversation service is optional during a rolling server upgrade.
    } finally {
      this.edgeAiChatLoading = false;
    }
  }

  private async openHermesConversation(conversationId: string): Promise<void> {
    if (!this.repository || this.edgeAiChatLoading || conversationId.length === 0) return;
    this.edgeAiChatLoading = true;
    try {
      const history = await (this.repository as MonitoringRepository).hermesConversation(conversationId);
      this.edgeAiConversationId = history.conversation.conversationId;
      this.edgeAiMessages = history.messages ?? [];
      this.edgeAiConversationTasks = history.tasks ?? [];
    } catch (error) {
      this.errorMessage = this.errorText(error);
    } finally {
      this.edgeAiChatLoading = false;
    }
  }

  private newHermesConversation(): void {
    if (this.edgeAiActionBusy) return;
    this.edgeAiConversationId = '';
    this.edgeAiMessages = [];
    this.edgeAiConversationTasks = [];
    this.edgeAiIntentResolution = null;
  }

  private async recheckEdgeAi(): Promise<void> {
    await this.runEdgeAiAction('recheck', '移动端请求立即复检当前边缘风险和链路状态');
  }

  private actionIntent(action: EdgeAiActionName): string {
    if (action === 'collect_logs') return '诊断当前边缘链路，采集只读证据并保存诊断记录';
    if (action === 'generate_report') return '生成当前山体监测与边缘风险态势报告';
    return '重新研判全部监测节点的当前风险状态';
  }

  private async refreshEdgeAiAfterAction(repository: MonitoringRepository): Promise<void> {
    const status = await repository.edgeAiStatus();
    if (status.available || !this.edgeAiStatus?.available) this.edgeAiStatus = status;
    try {
      const history = await repository.edgeAiActions();
      this.edgeAiActions = history.actions ?? [];
      if (this.edgeAiActions.length > 0) this.edgeAiLastAction = this.edgeAiActions[0];
    } catch {
      // The completed action remains visible even when history refresh is interrupted.
    }
  }

  private async waitForEdgeAiAction(repository: MonitoringRepository, initial: HermesAction): Promise<HermesAction> {
    let current = initial;
    for (let index = 0; index < 20; index++) {
      if (current.status === 'completed' || current.status === 'failed') return current;
      await new Promise<void>((resolve) => setTimeout(() => resolve(), 500));
      try {
        current = (await repository.edgeAiAction(current.id)).action;
      } catch {
        return current;
      }
    }
    return current;
  }

  private async runEdgeAiAction(action: EdgeAiActionName, intent: string = ''): Promise<void> {
    await this.sendHermesMessage(intent.length > 0 ? intent : this.actionIntent(action));
  }

  private async runEdgeAiIntent(intent: string): Promise<void> {
    await this.sendHermesMessage(intent);
  }

  private async sendHermesMessage(intent: string): Promise<void> {
    if (!this.repository || this.edgeAiActionBusy || intent.trim().length === 0) return;
    this.edgeAiActionBusy = true;
    const localMessageId = `local-${Date.now()}`;
    const localMessage: HermesMessage = {
      messageId: localMessageId,
      conversationId: this.edgeAiConversationId,
      role: 'user',
      content: intent.trim(),
      metadata: {},
      createdAt: new Date().toISOString()
    };
    this.edgeAiMessages = [...this.edgeAiMessages, localMessage];
    try {
      const repository = this.repository as MonitoringRepository;
      const response = await repository.sendHermesMessage(intent.trim(), this.edgeAiConversationId);
      this.edgeAiConversationId = response.conversation.conversationId;
      const nextMessages: Array<HermesMessage> = [];
      for (let index = 0; index < this.edgeAiMessages.length; index++) {
        if (this.edgeAiMessages[index].messageId !== localMessageId) nextMessages.push(this.edgeAiMessages[index]);
      }
      for (let index = 0; index < response.messages.length; index++) {
        nextMessages.push(response.messages[index]);
      }
      this.edgeAiMessages = nextMessages;

      const nextTasks: Array<HermesAgentTask> = [];
      for (let index = 0; index < response.tasks.length; index++) nextTasks.push(response.tasks[index]);
      for (let index = 0; index < this.edgeAiConversationTasks.length; index++) {
        let duplicate = false;
        for (let responseIndex = 0; responseIndex < response.tasks.length; responseIndex++) {
          if (response.tasks[responseIndex].taskId === this.edgeAiConversationTasks[index].taskId) duplicate = true;
        }
        if (!duplicate) nextTasks.push(this.edgeAiConversationTasks[index]);
      }
      this.edgeAiConversationTasks = nextTasks;

      const nextConversations: Array<HermesConversation> = [response.conversation];
      for (let index = 0; index < this.edgeAiConversations.length; index++) {
        if (this.edgeAiConversations[index].conversationId !== response.conversation.conversationId) {
          nextConversations.push(this.edgeAiConversations[index]);
        }
      }
      this.edgeAiConversations = nextConversations;
      const assistant = response.messages.length > 0 ? response.messages[response.messages.length - 1] : null;
      this.edgeAiIntentResolution = {
        resolved: response.tasks.length > 0 && !response.blocked,
        blocked: response.blocked,
        action: response.tasks.length === 1 ? response.tasks[0].action : null,
        label: response.tasks.length === 1 ? response.tasks[0].label : null,
        reason: assistant?.content ?? '',
        suggestions: response.suggestions ?? []
      };
      await this.refreshEdgeAiAfterAction(repository);
    } catch (error) {
      const restoredMessages: Array<HermesMessage> = [];
      for (let index = 0; index < this.edgeAiMessages.length; index++) {
        if (this.edgeAiMessages[index].messageId !== localMessageId) restoredMessages.push(this.edgeAiMessages[index]);
      }
      this.edgeAiMessages = restoredMessages;
      this.errorMessage = this.errorText(error);
    } finally {
      this.edgeAiActionBusy = false;
    }
  }

  private async openEdgeAiDevice(deviceId: string): Promise<void> {
    for (let index = 0; index < this.devices.length; index++) {
      if (this.devices[index].deviceId === deviceId) {
        await this.openDevice(this.devices[index]);
        return;
      }
    }
    this.errorMessage = '暂未找到该监测节点，请先刷新站点数据';
  }

  private refreshStationRealtime(): void {
    this.refreshStationDeviceStates();
    this.refreshAlarmActuatorStatus();
  }

  private async loadAlerts(): Promise<void> {
    if (this.alertRefreshing) return;
    this.alertRefreshing = true;
    if (!this.repository) this.getRepository();
    const repository = this.repository as MonitoringRepository;
    try {
      const cached = await repository.cachedAlerts();
      if (cached) {
        this.alerts = cached.value.list ?? [];
        this.alertFreshness = `缓存于 ${shortTime(new Date(cached.savedAt).toISOString())}`;
      }
      const page = await repository.alerts();
      this.alerts = page.list ?? [];
      this.alertFreshness = `更新于 ${shortTime(new Date().toISOString())}`;
      this.alertOffline = false;
      if (this.screen === 'alerts') this.markConnection(true);

      if (this.selectedAlert) {
        let selectedStillExists = false;
        for (let index = 0; index < this.alerts.length; index++) {
          if (this.alerts[index].alertId === this.selectedAlert?.alertId) selectedStillExists = true;
        }
        if (!selectedStillExists) {
          this.selectedAlert = null;
          this.alertEvents = [];
        }
      }
    } catch (error) {
      this.alertOffline = true;
      if (this.screen === 'alerts') {
        this.markConnection(false);
        this.errorMessage = this.errorText(error);
      }
    } finally {
      this.alertRefreshing = false;
    }
  }

  private async openDevice(device: Device): Promise<void> {
    this.selectedDevice = device;
    this.selectedDeviceState = null;
    this.selectedSeries = null;
    this.screen = 'device';
    this.stopDeviceTimers();
    await this.refreshDevice();
    this.startDeviceTimers();
  }

  private async refreshDevice(): Promise<void> {
    if (!this.selectedDevice || !this.repository || this.deviceRefreshing) return;
    this.deviceRefreshing = true;
    const repository = this.repository as MonitoringRepository;
    const deviceId = this.selectedDevice.deviceId;
    try {
      const cachedState = await repository.cachedState(deviceId);
      const cachedSeries = await repository.cachedSeries(deviceId);
      if (cachedState) this.selectedDeviceState = cachedState.value;
      if (cachedSeries) this.selectedSeries = cachedSeries.value;
      await Promise.all([this.refreshDeviceState(true), this.refreshDeviceSeries()]);
    } finally {
      this.deviceRefreshing = false;
    }
  }

  private async refreshDeviceState(showError: boolean = false): Promise<void> {
    if (this.screen !== 'device' || !this.selectedDevice || !this.repository) return;
    try {
      this.selectedDeviceState = await (this.repository as MonitoringRepository).deviceState(this.selectedDevice.deviceId);
      this.deviceFreshness = `更新于 ${shortTime(new Date().toISOString())}`;
      this.deviceOffline = false;
      this.markConnection(true);
    } catch (error) {
      this.deviceOffline = true;
      this.markConnection(false);
      if (showError) this.errorMessage = this.errorText(error);
    }
  }

  private async refreshDeviceSeries(): Promise<void> {
    if (this.screen !== 'device' || !this.selectedDevice || !this.repository) return;
    try {
      this.selectedSeries = await (this.repository as MonitoringRepository).series(this.selectedDevice.deviceId);
    } catch {
      // Latest values remain available when historical storage is temporarily unavailable.
    }
  }

  private startAlertStream(): void {
    if (!this.loggedIn || !this.appVisible || !this.api.hasSession()) return;
    if (!this.alertStream) {
      this.alertStream = new AlertStreamClient(this.api, (event: AlertStreamEvent) => {
        this.handleAlertStreamEvent(event);
      });
    }
    if (!this.alertNotifications && this.context) {
      this.alertNotifications = new AlertNotificationService(this.context);
      this.alertNotifications.prepare();
    }
    this.alertStream.start();
  }

  private stopAlertStream(resetClient: boolean = false): void {
    if (this.alertStream) this.alertStream.stop();
    if (resetClient) this.alertStream = undefined;
  }

  private handleAlertStreamEvent(event: AlertStreamEvent): void {
    if (!this.loggedIn) return;
    const eventType = event.eventType.toUpperCase();
    if (eventType === 'ALERT_TRIGGER') {
      if (this.alertNotifications) this.alertNotifications.publish(event);
      this.presentInAppAlert(event);
    } else if (eventType === 'ALERT_UPDATE') {
      this.updateInAppAlert(event);
    } else if (eventType === 'ALERT_RESOLVE') {
      if (this.alertNotifications) this.alertNotifications.cancel(event.alertId);
      this.resolveInAppAlert(event.alertId);
    }
    if (this.screen === 'alerts' || this.screen === 'overview') this.loadAlerts();
    if (this.screen === 'overview') this.loadOverview();
    if (this.selectedAlert?.alertId === event.alertId) this.openAlert(this.selectedAlert);
  }

  private onPendingAlertChanged(): void {
    this.openPendingAlert();
  }

  private async openPendingAlert(): Promise<void> {
    const alertId = this.pendingAlertId.trim();
    if (!alertId || !this.loggedIn || !this.repository || this.handlingPendingAlert) return;
    this.handlingPendingAlert = true;
    try {
      const pendingEvent = this.parsePendingAlertEvent(alertId);
      let shouldPresentFromAlert = true;
      if (pendingEvent) {
        const eventType = pendingEvent.eventType.toUpperCase();
        if (eventType === 'ALERT_RESOLVE') {
          if (this.alertNotifications) this.alertNotifications.cancel(pendingEvent.alertId);
          this.resolveInAppAlert(pendingEvent.alertId);
          shouldPresentFromAlert = false;
        } else if (eventType === 'ALERT_UPDATE' && this.activeAlertEvent?.alertId === pendingEvent.alertId) {
          this.activeAlertEvent = pendingEvent;
          shouldPresentFromAlert = false;
        } else if (eventType === 'ALERT_TRIGGER') {
          this.presentInAppAlert(pendingEvent);
        }
      }
      this.screen = 'alerts';
      await this.loadAlerts();
      let target: Alert | null = null;
      for (let index = 0; index < this.alerts.length; index++) {
        if (this.alerts[index].alertId === alertId) {
          target = this.alerts[index];
          break;
        }
      }
      if (target && shouldPresentFromAlert) this.presentInAppAlert(this.streamEventFromAlert(target));
    } finally {
      this.pendingAlertId = '';
      this.pendingAlertPayload = '';
      this.handlingPendingAlert = false;
    }
  }

  private parsePendingAlertEvent(alertId: string): AlertStreamEvent | null {
    if (!this.pendingAlertPayload.trim()) return null;
    try {
      const event = JSON.parse(this.pendingAlertPayload) as AlertStreamEvent;
      if (!event.eventId || event.alertId !== alertId) return null;
      return event;
    } catch {
      return null;
    }
  }

  private getAlertAlarm(): AlertAlarmService {
    if (!this.alertAlarm && this.context) this.alertAlarm = new AlertAlarmService(this.context);
    return this.alertAlarm as AlertAlarmService;
  }

  private presentInAppAlert(event: AlertStreamEvent): void {
    if (this.activeAlertEvent) {
      if (this.activeAlertEvent.alertId === event.alertId) {
        const escalated = this.activeAlertEvent.severity.toLowerCase() !== 'critical' &&
          event.severity.toLowerCase() === 'critical';
        this.activeAlertEvent = event;
        if (escalated) {
          this.alertOverlayVisible = true;
          this.alertAlarmMuted = false;
          this.getAlertAlarm().start();
        }
        return;
      }
      for (let index = 0; index < this.alertEventQueue.length; index++) {
        if (this.alertEventQueue[index].alertId === event.alertId) {
          this.alertEventQueue[index] = event;
          return;
        }
      }
      this.alertEventQueue.push(event);
      this.queuedAlertCount = this.alertEventQueue.length;
      this.alertOverlayVisible = true;
      if (this.alertAlarmMuted) {
        this.alertAlarmMuted = false;
        this.getAlertAlarm().start();
      }
      return;
    }
    this.activeAlertEvent = event;
    this.alertOverlayVisible = true;
    this.alertAlarmMuted = false;
    this.getAlertAlarm().start();
  }

  private updateInAppAlert(event: AlertStreamEvent): void {
    if (this.activeAlertEvent?.alertId === event.alertId) {
      this.presentInAppAlert(event);
      return;
    }
    for (let index = 0; index < this.alertEventQueue.length; index++) {
      if (this.alertEventQueue[index].alertId === event.alertId) {
        this.alertEventQueue[index] = event;
        return;
      }
    }
    if (event.severity.toLowerCase() === 'critical') this.presentInAppAlert(event);
  }

  private toggleAlertAlarm(): void {
    this.alertAlarmMuted = !this.alertAlarmMuted;
    if (this.alertAlarmMuted) {
      if (this.alertAlarm) this.alertAlarm.stop();
    } else if (this.activeAlertEvent) {
      this.getAlertAlarm().start();
    }
  }

  private hideInAppAlert(): void {
    this.alertOverlayVisible = false;
  }

  private resolveInAppAlert(alertId: string): void {
    if (this.activeAlertEvent?.alertId === alertId) {
      if (this.alertAlarm) this.alertAlarm.stop();
      this.activeAlertEvent = null;
      this.alertOverlayVisible = false;
      this.alertAlarmMuted = false;
      const next = this.alertEventQueue.shift();
      this.queuedAlertCount = this.alertEventQueue.length;
      if (next) this.presentInAppAlert(next);
      return;
    }
    const remaining: Array<AlertStreamEvent> = [];
    for (let index = 0; index < this.alertEventQueue.length; index++) {
      if (this.alertEventQueue[index].alertId !== alertId) remaining.push(this.alertEventQueue[index]);
    }
    this.alertEventQueue = remaining;
    this.queuedAlertCount = remaining.length;
  }

  private discardInAppAlert(): void {
    if (this.alertAlarm) this.alertAlarm.stop();
    this.activeAlertEvent = null;
    this.alertOverlayVisible = false;
    this.alertAlarmMuted = false;
    const next = this.alertEventQueue.shift();
    this.queuedAlertCount = this.alertEventQueue.length;
    if (next) this.presentInAppAlert(next);
  }

  private clearInAppAlerts(): void {
    if (this.alertAlarm) this.alertAlarm.stop();
    this.activeAlertEvent = null;
    this.alertOverlayVisible = false;
    this.alertAlarmMuted = false;
    this.alertEventQueue = [];
    this.queuedAlertCount = 0;
  }

  private streamEventFromAlert(alert: Alert): AlertStreamEvent {
    const event: AlertStreamEvent = {
      type: 'alert',
      eventId: `notification-${alert.alertId}`,
      alertId: alert.alertId,
      eventType: 'ALERT_TRIGGER',
      severity: alert.severity,
      title: alert.title,
      message: alert.message ?? '',
      deviceId: alert.deviceId,
      stationId: alert.stationId,
      evidence: alert.evidence,
      createdAt: alert.lastEventAt ?? new Date().toISOString()
    };
    if (alert.latitude !== undefined) event.latitude = alert.latitude;
    if (alert.longitude !== undefined) event.longitude = alert.longitude;
    return event;
  }

  private alertFromStreamEvent(event: AlertStreamEvent): Alert {
    const alert: Alert = {
      alertId: event.alertId,
      status: 'active',
      severity: event.severity,
      title: event.title.trim().length > 0 ? event.title : '监测告警',
      message: event.message,
      deviceId: event.deviceId,
      stationId: event.stationId,
      evidence: event.evidence,
      lastEventAt: event.createdAt
    };
    if (event.latitude !== undefined) alert.latitude = event.latitude;
    if (event.longitude !== undefined) alert.longitude = event.longitude;
    return alert;
  }

  private async openActiveAlertMap(): Promise<void> {
    const event = this.activeAlertEvent;
    if (!event) return;
    const alert = this.alertFromStreamEvent(event);
    this.alertOverlayVisible = false;
    await this.openAlertMap(alert);
  }

  private activeAlertSourceLabel(): string {
    const event = this.activeAlertEvent;
    if (!event) return '监测告警';
    if (event.deviceId) {
      for (let index = 0; index < this.devices.length; index++) {
        if (this.devices[index].deviceId === event.deviceId) return deviceDisplayName(this.devices[index]);
      }
      for (let index = 0; index < this.overviewTrends.length; index++) {
        if (this.overviewTrends[index].device.deviceId === event.deviceId) {
          return deviceDisplayName(this.overviewTrends[index].device);
        }
      }
      return `监测设备 ${this.shortIdentifier(event.deviceId)}`;
    }
    if (event.stationId) {
      for (let index = 0; index < this.stations.length; index++) {
        if (this.stations[index].stationId === event.stationId) return stationDisplayName(this.stations[index]);
      }
      return `监测站点 ${this.shortIdentifier(event.stationId)}`;
    }
    return '监测站点';
  }

  private shortIdentifier(value: string): string {
    return value.length > 8 ? value.slice(-8) : value;
  }

  private async openAlert(alert: Alert): Promise<void> {
    this.selectedAlert = alert;
    this.alertEvents = [];
    this.eventsLoading = true;
    try {
      const response = await (this.repository as MonitoringRepository).alertEvents(alert.alertId);
      this.alertEvents = response.events ?? [];
      this.alertOffline = false;
      this.markConnection(true);
    } catch (error) {
      this.alertOffline = true;
      this.markConnection(false);
      this.errorMessage = this.errorText(error);
    } finally {
      this.eventsLoading = false;
    }
  }

  private async openAlertMap(alert: Alert | null, preserveCurrentMap: boolean = false): Promise<void> {
    if (!this.repository) this.getRepository();
    const repository = this.repository as MonitoringRepository;
    this.alertMapAlert = alert;
    if (!preserveCurrentMap || !this.alertMapLocation) {
      this.alertMapLocation = null;
      this.alertMapLocations = [];
      this.alertMapLoading = true;
      this.userMapLocation = null;
      this.userLocationStatus = alert ? 'locating' : 'idle';
    }
    this.screen = 'alert-map';
    this.stopDeviceTimers();
    if (alert && !preserveCurrentMap) this.refreshUserMapLocation();

    let events: Array<AlertEvent> = [];
    let stations: Array<Station> = [];
    let devices: Array<Device> = [];
    try {
      if (alert) {
        this.selectedAlert = alert;
        const response = await repository.alertEvents(alert.alertId);
        events = response.events ?? [];
        this.alertEvents = events;
      }
    } catch {
      events = this.alertEvents;
    }
    try {
      stations = await repository.stations();
    } catch {
      const cached = await repository.cachedStations();
      stations = cached?.value ?? [];
    }
    try {
      devices = await repository.devices('');
    } catch {
      const cached = await repository.cachedDevices('');
      devices = cached?.value ?? [];
    }

    if (!this.alertLocationRepository && this.cache) {
      this.alertLocationRepository = new AlertLocationRepository(this.api, this.cache);
    }
    if (this.alertLocationRepository) {
      const monitoringDevices: Array<Device> = [];
      for (let index = 0; index < devices.length; index++) {
        if (devices[index].status.toLowerCase() === 'revoked' || isAlarmActuatorDevice(devices[index])) continue;
        monitoringDevices.push(devices[index]);
      }
      const locations = await this.alertLocationRepository.resolveNodes(monitoringDevices);
      this.alertMapLocations = locations;
      const resolved = alert
        ? await this.alertLocationRepository.resolve(alert, events, stations, monitoringDevices)
        : locations.length > 0
          ? locations[0]
          : await this.alertLocationRepository.resolve(null, [], stations, []);
      if (resolved || !preserveCurrentMap) this.alertMapLocation = resolved;
    }
    this.alertMapLoading = false;
  }

  private async refreshUserMapLocation(): Promise<void> {
    const alertId = this.alertMapAlert?.alertId;
    if (!alertId || !this.context) return;
    if (!this.deviceLocationService) this.deviceLocationService = new DeviceLocationService(this.context);
    const requestSequence = ++this.userLocationRequestSequence;
    this.userLocationStatus = 'locating';
    const result = await this.deviceLocationService.current();
    if (requestSequence !== this.userLocationRequestSequence || this.alertMapAlert?.alertId !== alertId) return;
    this.userLocationStatus = result.status;
    this.userMapLocation = result.location ?? null;
  }

  private refreshAlertMap(): void {
    this.openAlertMap(this.alertMapAlert, true);
    if (this.alertMapAlert) this.refreshUserMapLocation();
  }

  private closeAlertMap(): void {
    this.userLocationRequestSequence += 1;
    this.screen = 'alerts';
    this.alertMapLoading = false;
    this.loadAlerts();
    if (this.activeAlertEvent) this.alertOverlayVisible = true;
    if (!this.activeAlertEvent && this.alertEventQueue.length > 0) this.discardInAppAlert();
  }

  private selectScreen(screen: AppScreen): void {
    this.screen = screen;
    this.errorMessage = '';
    if (screen === 'overview') this.loadOverview();
    if (screen === 'stations') this.loadStations();
    if (screen === 'ai') this.loadEdgeAiStatus();
    if (screen === 'alerts') this.loadAlerts();
    if (screen !== 'device') this.stopDeviceTimers();
  }

  private refreshCurrentScreen(): void {
    if (this.screen === 'overview') this.loadOverview();
    if (this.screen === 'stations') this.loadStations();
    if (this.screen === 'ai') this.loadEdgeAiStatus();
    if (this.screen === 'alerts') this.loadAlerts();
    if (this.screen === 'device') this.refreshDevice();
    if (this.screen === 'alert-map') this.refreshAlertMap();
  }

  private async saveApiBase(value: string): Promise<void> {
    const normalized = normalizeApiBaseUrl(value);
    if (normalized.length === 0) return;
    if (normalized === this.api.getBaseUrl()) return;
    if (this.loggedIn) await this.pushRegistration.unregister(this.api);
    if (this.repository) await this.repository.clear();
    this.stopTimers();
    this.stopAlertStream(true);
    this.api.clearTokens();
    await SessionStore.clear();
    this.apiBaseUrl = normalized;
    this.api.setBaseUrl(normalized);
    this.releaseRepositories();
    this.loggedIn = false;
    this.userName = '';
    this.username = '';
    this.connectionState = 'unknown';
    this.connectionUpdatedAt = '尚未请求';
    this.resetMonitoringData();
  }

  private async clearLocalCache(): Promise<void> {
    if (this.repository) await this.repository.clear();
    this.rebuildRepository();
    this.stationMapLocations = [];
    this.stationMapLoading = false;
    this.overviewFreshness = '本地缓存已清理';
    this.stationFreshness = '本地缓存已清理';
    this.deviceFreshness = '本地缓存已清理';
    this.alertFreshness = '本地缓存已清理';
  }

  private startTimers(): void {
    this.stopTimers();
    this.overviewTimer = setInterval(() => {
      if (this.loggedIn && this.screen === 'overview') this.loadOverview();
      if (this.loggedIn && this.screen === 'ai') this.loadEdgeAiStatus();
    }, 30000);
    this.alertTimer = setInterval(() => {
      if (this.loggedIn && (this.screen === 'overview' || this.screen === 'alerts')) this.loadAlerts();
    }, 30000);
    this.stationTimer = setInterval(() => {
      if (this.loggedIn && this.screen === 'stations') this.refreshStationRealtime();
    }, 10000);
    if (this.screen === 'device') this.startDeviceTimers();
  }

  private startDeviceTimers(): void {
    this.stopDeviceTimers();
    if (!this.loggedIn || this.screen !== 'device') return;
    this.deviceTimer = setInterval(() => {
      this.refreshDeviceState();
    }, 10000);
    this.deviceSeriesTimer = setInterval(() => {
      this.refreshDeviceSeries();
    }, 120000);
  }

  private stopDeviceTimers(): void {
    if (this.deviceTimer !== undefined) {
      clearInterval(this.deviceTimer);
      this.deviceTimer = undefined;
    }
    if (this.deviceSeriesTimer !== undefined) {
      clearInterval(this.deviceSeriesTimer);
      this.deviceSeriesTimer = undefined;
    }
  }

  private stopTimers(): void {
    if (this.overviewTimer !== undefined) clearInterval(this.overviewTimer);
    if (this.alertTimer !== undefined) clearInterval(this.alertTimer);
    if (this.stationTimer !== undefined) clearInterval(this.stationTimer);
    this.stopDeviceTimers();
    this.overviewTimer = undefined;
    this.alertTimer = undefined;
    this.stationTimer = undefined;
  }

  private errorText(error: Object): string {
    if (error instanceof ApiError) return error.message;
    if (error instanceof Error) return error.message;
    return '网络请求失败，请检查服务器地址和连接';
  }

  build() {
    Stack() {
      if (this.sessionRestoring) {
        SessionRestoringPane();
      } else if (!this.loggedIn) {
        if (this.showLoginServerSettings) {
          LoginServerSettingsPane({
            apiBaseUrl: this.apiBaseUrl,
            errorMessage: this.errorMessage,
            onSave: (value: string) => this.saveLoginServerBase(value),
            onBack: () => this.closeLoginServerSettings()
          });
        } else {
          LoginPane({
            busy: this.busy,
            errorMessage: this.errorMessage,
            apiBaseUrl: this.apiBaseUrl,
            onSubmit: (username: string, password: string, apiBaseUrl: string) =>
              this.login(username, password, apiBaseUrl)
          });
        }
      } else {
        Column() {
          if (this.screen === 'overview') {
            OverviewPane({
              dashboard: this.dashboard,
              alerts: this.alerts,
              alertFreshness: this.alertFreshness,
              alertOffline: this.alertOffline,
              alertRefreshing: this.alertRefreshing,
              trends: this.overviewTrends,
              freshness: this.overviewFreshness,
              offline: this.overviewOffline,
              refreshing: this.overviewRefreshing,
              onOpenStations: () => this.selectScreen('stations'),
              onOpenAlerts: () => this.selectScreen('alerts'),
              onOpenAlertMap: (alert: Alert | null) => this.openAlertMap(alert),
              onRefresh: () => this.loadOverview()
            });
          } else if (this.screen === 'stations') {
            StationsPane({
              stations: this.stations,
              devices: this.devices,
              alarmActuators: this.alarmActuators,
              alarmActuatorOnline: this.alarmActuatorOnline,
              deviceStates: this.deviceStates,
              mapLocations: this.stationMapLocations,
              mapLoading: this.stationMapLoading,
              selectedStationId: this.selectedStationId,
              freshness: this.stationFreshness,
              offline: this.stationOffline,
              refreshing: this.stationRefreshing,
              onSelectStation: (id: string) => this.loadDevices(id),
              onSelectDevice: (device: Device) => this.openDevice(device),
              onRefreshMap: () => this.refreshStationMap(),
              onRefresh: () => this.loadStations()
            });
          } else if (this.screen === 'ai') {
            AiPane({
              status: this.edgeAiStatus,
              devices: this.devices,
              actions: this.edgeAiActions,
              lastAction: this.edgeAiLastAction,
              intentResolution: this.edgeAiIntentResolution,
              conversations: this.edgeAiConversations,
              conversationId: this.edgeAiConversationId,
              messages: this.edgeAiMessages,
              conversationTasks: this.edgeAiConversationTasks,
              chatLoading: this.edgeAiChatLoading,
              refreshing: this.edgeAiRefreshing || this.edgeAiActionBusy,
              executing: this.edgeAiActionBusy,
              onRefresh: () => this.loadEdgeAiStatus(),
              onAction: (action: EdgeAiActionName) => this.runEdgeAiAction(action),
              onIntent: (intent: string) => this.runEdgeAiIntent(intent),
              onSelectConversation: (conversationId: string) => this.openHermesConversation(conversationId),
              onNewConversation: () => this.newHermesConversation(),
              onOpenDevice: (deviceId: string) => this.openEdgeAiDevice(deviceId)
            });
          } else if (this.screen === 'device') {
            DevicePane({
              device: this.selectedDevice,
              state: this.selectedDeviceState,
              series: this.selectedSeries,
              freshness: this.deviceFreshness,
              offline: this.deviceOffline,
              refreshing: this.deviceRefreshing,
              onRefresh: () => this.refreshDevice(),
              onBack: () => this.selectScreen('stations')
            });
          } else if (this.screen === 'alert-map') {
            AlertMapPane({
              alert: this.alertMapAlert,
              location: this.alertMapLocation,
              locations: this.alertMapLocations,
              loading: this.alertMapLoading,
              active: this.appVisible,
              userLocation: this.userMapLocation,
              userLocationStatus: this.userLocationStatus,
              onBack: () => this.closeAlertMap(),
              onRetry: () => this.refreshAlertMap(),
              onRelocateUser: () => this.refreshUserMapLocation()
            });
          } else if (this.screen === 'alerts') {
            AlertsPane({
              alerts: this.alerts,
              selectedAlert: this.selectedAlert,
              events: this.alertEvents,
              loadingEvents: this.eventsLoading,
              freshness: this.alertFreshness,
              offline: this.alertOffline,
              refreshing: this.alertRefreshing,
              onSelect: (alert: Alert) => this.openAlert(alert),
              onOpenMap: (alert: Alert | null) => this.openAlertMap(alert),
              onRefresh: () => this.loadAlerts()
            });
          } else {
            SettingsPane({
              userName: this.userName,
              apiBaseUrl: this.apiBaseUrl,
              connectionState: this.connectionState,
              connectionUpdatedAt: this.connectionUpdatedAt,
              onSave: (value: string) => this.saveApiBase(value),
              onClearCache: () => this.clearLocalCache(),
              onLogout: () => this.logout()
            });
          }
          if (this.activeAlertEvent && !this.alertOverlayVisible && this.screen !== 'alert-map') {
            ActiveAlertBanner({
              event: this.activeAlertEvent as AlertStreamEvent,
              muted: this.alertAlarmMuted,
              onOpen: () => this.alertOverlayVisible = true
            });
          }
          if (this.screen !== 'device' && this.screen !== 'alert-map') {
            BottomTabs({
              screen: this.screen,
              onSelect: (screen: AppScreen) => this.selectScreen(screen)
            });
          }
        }
        .width('100%')
        .height('100%')
        .backgroundColor('#F5F7F8')
      }
      if (this.loggedIn && this.activeAlertEvent && this.alertOverlayVisible) {
        InAppAlertOverlay({
          event: this.activeAlertEvent as AlertStreamEvent,
          muted: this.alertAlarmMuted,
          queuedCount: this.queuedAlertCount,
          sourceLabel: this.activeAlertSourceLabel(),
          onToggleMute: () => this.toggleAlertAlarm(),
          onOpenMap: () => this.openActiveAlertMap(),
          onDismiss: () => this.hideInAppAlert()
        });
      }
    }
    .width('100%')
    .height('100%')
    .backgroundColor('#F5F7F8')
  }
}

@Component
struct RefreshIconButton {
  @Prop refreshing: boolean;
  onRefresh: () => void = () => {};

  build() {
    Button({ type: ButtonType.Circle }) {
      if (this.refreshing) {
        LoadingProgress()
          .width(18)
          .height(18)
          .color(UI_COLOR_ACCENT)
      } else {
        SymbolGlyph($r('sys.symbol.arrow_clockwise'))
          .fontSize(20)
          .fontColor([UI_COLOR_TEXT])
      }
    }
    .width(44)
    .height(44)
    .backgroundColor(UI_COLOR_SURFACE)
    .enabled(!this.refreshing)
    .stateEffect(!this.refreshing)
    .accessibilityText(this.refreshing ? '正在同步数据' : '刷新数据')
    .onClick(() => this.onRefresh())
  }
}

@Component
struct BackIconButton {
  @Prop accessibilityLabel: string = '返回';
  onBack: () => void = () => {};

  build() {
    Button({ type: ButtonType.Circle }) {
      SymbolGlyph($r('sys.symbol.chevron_left'))
        .fontSize(22)
        .fontColor([UI_COLOR_TEXT])
    }
    .width(44)
    .height(44)
    .backgroundColor(UI_COLOR_SURFACE)
    .accessibilityText(this.accessibilityLabel)
    .onClick(() => this.onBack())
  }
}

@Component
struct PageHeader {
  @Prop title: string;
  @Prop subtitle: string;
  @Prop offline: boolean;
  @Prop refreshing: boolean;
  onRefresh: () => void = () => {};

  build() {
    Row() {
      Column({ space: 3 }) {
        Text(this.title)
          .fontSize(22)
          .fontWeight(FontWeight.Bold)
          .fontColor(UI_COLOR_TEXT)
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
        Text(this.refreshing ? '正在同步最新数据' : this.subtitle)
          .fontSize(11)
          .fontColor(this.offline ? UI_COLOR_DANGER : UI_COLOR_MUTED)
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
      }
      .alignItems(HorizontalAlign.Start)
      .layoutWeight(1)
      RefreshIconButton({ refreshing: this.refreshing, onRefresh: () => this.onRefresh() })
    }
    .padding({ left: UI_PAGE_PADDING, right: UI_PAGE_PADDING, top: 8, bottom: 12 })
    .width('100%')
  }
}

@Component
struct SessionRestoringPane {
  build() {
    Column({ space: 12 }) {
      LoadingProgress()
        .width(28)
        .height(28)
        .color(UI_COLOR_ACCENT)
      Text('正在恢复登录状态')
        .fontSize(16)
        .fontWeight(FontWeight.Medium)
        .fontColor(UI_COLOR_TEXT)
      Text('准备最近一次监测数据')
        .fontSize(11)
        .fontColor(UI_COLOR_MUTED)
    }
    .width('100%')
    .height('100%')
    .justifyContent(FlexAlign.Center)
    .backgroundColor('#F5F7F8')
    .accessibilityText('正在恢复登录状态')
  }
}

@Component
struct LoginPane {
  @Prop busy: boolean;
  @Prop errorMessage: string;
  @Prop apiBaseUrl: string;
  onSubmit: (username: string, password: string, apiBaseUrl: string) => void = () => {};
  @State private username: string = 'admin';
  @State private password: string = '';

  build() {
    Scroll() {
      Column() {
        Row({ space: 14 }) {
          Image($r('app.media.app_icon'))
            .width(64)
            .height(64)
            .borderRadius(8)
          Column({ space: 4 }) {
            Text('山体滑坡监测')
              .fontSize(24)
              .fontWeight(FontWeight.Bold)
              .fontColor(UI_COLOR_TEXT)
              .maxLines(1)
            Text('鸿蒙移动监测端')
              .fontSize(12)
              .fontWeight(FontWeight.Medium)
              .fontColor(UI_COLOR_LOGIN_BRAND)
          }
          .alignItems(HorizontalAlign.Start)
          .layoutWeight(1)
        }
        .width('100%')

        Blank().height(48)

        Text('登录监测平台')
          .fontSize(21)
          .fontWeight(FontWeight.Bold)
          .fontColor(UI_COLOR_TEXT)
          .width('100%')

        Blank().height(28)

        Column({ space: 10 }) {
          Text('账号')
            .fontSize(13)
            .fontWeight(FontWeight.Medium)
            .fontColor(UI_COLOR_TEXT)
          TextInput({ placeholder: '请输入账号', text: this.username })
            .onChange((value: string) => this.username = value)
            .height(50)
            .fontSize(15)
            .fontColor(UI_COLOR_TEXT)
            .placeholderColor(UI_COLOR_SUBTLE)
            .caretColor(UI_COLOR_LOGIN_BRAND)
            .backgroundColor(UI_COLOR_LOGIN_FIELD)
            .border({ width: 1, color: UI_COLOR_LOGIN_BORDER })
            .borderRadius(8)
        }
        .width('100%')
        .alignItems(HorizontalAlign.Start)

        Blank().height(18)

        Column({ space: 10 }) {
          Text('密码')
            .fontSize(13)
            .fontWeight(FontWeight.Medium)
            .fontColor(UI_COLOR_TEXT)
          TextInput({ placeholder: '请输入密码', text: this.password })
            .type(InputType.Password)
            .onChange((value: string) => this.password = value)
            .height(50)
            .fontSize(15)
            .fontColor(UI_COLOR_TEXT)
            .placeholderColor(UI_COLOR_SUBTLE)
            .caretColor(UI_COLOR_LOGIN_BRAND)
            .backgroundColor(UI_COLOR_LOGIN_FIELD)
            .border({ width: 1, color: UI_COLOR_LOGIN_BORDER })
            .borderRadius(8)
        }
        .width('100%')
        .alignItems(HorizontalAlign.Start)

        if (this.errorMessage.length > 0) {
          Row({ space: 10 }) {
            Text('!')
              .fontSize(12)
              .fontWeight(FontWeight.Bold)
              .fontColor(UI_COLOR_DANGER)
              .width(20)
              .height(20)
              .textAlign(TextAlign.Center)
              .backgroundColor('#FFFFFF')
              .borderRadius(10)
            Text(this.errorMessage)
              .fontSize(12)
              .fontColor(UI_COLOR_DANGER)
              .layoutWeight(1)
          }
          .width('100%')
          .padding(12)
          .margin({ top: 16 })
          .borderRadius(8)
          .backgroundColor(UI_COLOR_LOGIN_ERROR)
          .alignItems(VerticalAlign.Center)
        }

        Button(this.busy ? '正在连接' : '登录')
          .enabled(!this.busy && this.username.trim().length > 0 && this.password.length > 0)
          .backgroundColor(UI_COLOR_LOGIN_BRAND)
          .fontColor('#FFFFFF')
          .fontSize(15)
          .fontWeight(FontWeight.Medium)
          .borderRadius(8)
          .width('100%')
          .height(50)
          .margin({ top: 24 })
          .onClick(() => this.onSubmit(this.username, this.password, this.apiBaseUrl))
      }
      .width('100%')
      .padding({ left: 24, right: 24, top: 52, bottom: 32 })
      .alignItems(HorizontalAlign.Start)
    }
    .width('100%')
    .height('100%')
    .scrollBar(BarState.Off)
    .backgroundColor(UI_COLOR_LOGIN_PAGE)
  }
}

@Component
struct LoginServerSettingsPane {
  @Prop apiBaseUrl: string;
  @Prop errorMessage: string;
  onSave: (apiBaseUrl: string) => void = () => {};
  onBack: () => void = () => {};
  @State private draftUrl: string = '';

  aboutToAppear(): void {
    this.draftUrl = this.apiBaseUrl;
  }

  build() {
    Column() {
      Row({ space: 12 }) {
        BackIconButton({ accessibilityLabel: '返回登录', onBack: () => this.onBack() })
        Text('服务器连接')
          .fontSize(20)
          .fontWeight(FontWeight.Bold)
          .fontColor(UI_COLOR_TEXT)
      }
      .width('100%')
      .height(60)
      .padding({ left: 16, right: 20, top: 4, bottom: 8 })

      Scroll() {
        Column() {
          Row({ space: 12 }) {
            Image($r('app.media.app_icon'))
              .width(48)
              .height(48)
              .borderRadius(8)
            Column({ space: 4 }) {
              Text('无法连接监测服务器')
                .fontSize(18)
                .fontWeight(FontWeight.Bold)
                .fontColor(UI_COLOR_TEXT)
              Text('请检查网络或重新设置地址')
                .fontSize(12)
                .fontColor(UI_COLOR_MUTED)
            }
            .alignItems(HorizontalAlign.Start)
            .layoutWeight(1)
          }
          .width('100%')

          if (this.errorMessage.length > 0) {
            Text(this.errorMessage)
              .fontSize(12)
              .fontColor(UI_COLOR_DANGER)
              .width('100%')
              .padding(12)
              .margin({ top: 20 })
              .borderRadius(8)
              .backgroundColor(UI_COLOR_LOGIN_ERROR)
          }

          Column({ space: 10 }) {
            Text('服务器 API 地址')
              .fontSize(13)
              .fontWeight(FontWeight.Medium)
              .fontColor(UI_COLOR_TEXT)
            TextInput({ placeholder: 'http://host:port/api/v1', text: this.draftUrl })
              .onChange((value: string) => this.draftUrl = value)
              .height(50)
              .fontSize(14)
              .fontColor(UI_COLOR_TEXT)
              .placeholderColor(UI_COLOR_SUBTLE)
              .caretColor(UI_COLOR_LOGIN_BRAND)
              .backgroundColor(UI_COLOR_LOGIN_FIELD)
              .border({ width: 1, color: UI_COLOR_LOGIN_BORDER })
              .borderRadius(8)
            Text('需要包含 /api/v1 路径')
              .fontSize(11)
              .fontColor(UI_COLOR_MUTED)
          }
          .width('100%')
          .alignItems(HorizontalAlign.Start)
          .margin({ top: 30 })

          Button('保存并返回登录')
            .enabled(this.draftUrl.trim().length > 0)
            .backgroundColor(UI_COLOR_LOGIN_BRAND)
            .fontColor('#FFFFFF')
            .fontSize(15)
            .fontWeight(FontWeight.Medium)
            .borderRadius(8)
            .width('100%')
            .height(50)
            .margin({ top: 28 })
            .onClick(() => this.onSave(this.draftUrl))
        }
        .width('100%')
        .padding({ left: 24, right: 24, top: 28, bottom: 32 })
        .alignItems(HorizontalAlign.Start)
      }
      .width('100%')
      .layoutWeight(1)
      .scrollBar(BarState.Off)
    }
    .width('100%')
    .height('100%')
    .backgroundColor(UI_COLOR_LOGIN_PAGE)
  }
}

@Component
struct OverviewPane {
  @Prop dashboard: DashboardSummary | null;
  @Prop alerts: Array<Alert>;
  @Prop alertFreshness: string;
  @Prop alertOffline: boolean;
  @Prop alertRefreshing: boolean;
  @Prop trends: Array<DeviceMonitoringTrend>;
  @Prop freshness: string;
  @Prop offline: boolean;
  @Prop refreshing: boolean;
  onOpenStations: () => void = () => {};
  onOpenAlerts: () => void = () => {};
  onOpenAlertMap: (alert: Alert | null) => void = () => {};
  onRefresh: () => void = () => {};

  build() {
    Column() {
      PageHeader({
        title: '监测总览',
        subtitle: this.freshness,
        offline: this.offline,
        refreshing: this.refreshing,
        onRefresh: () => this.onRefresh()
      });
      Scroll() {
        Column({ space: 12 }) {
          StatusBanner({
            text: this.refreshing
              ? '正在同步 · 当前数据保持可见'
              : this.offline
              ? `离线缓存 · ${this.freshness}`
              : `实时数据 · ${this.dashboard?.onlineDevices ?? '--'} / ${this.dashboard?.totalDevices ?? '--'} 台设备在线 · ${this.freshness}`,
            tone: this.refreshing ? UI_COLOR_ACCENT : this.offline ? UI_COLOR_DANGER : UI_COLOR_SUCCESS
          });
          Row({ space: 8 }) {
            MetricCard({ label: '在线设备', value: `${this.dashboard?.onlineDevices ?? '--'}`, detail: `共 ${this.dashboard?.totalDevices ?? '--'} 台`, accent: '#3C9D82' });
            MetricCard({ label: '监测站点', value: `${this.dashboard?.stations ?? '--'}`, detail: '查看设备', accent: '#E46D35', actionable: true, onTap: () => this.onOpenStations() });
          }
          Row({ space: 8 }) {
            MetricCard({ label: '离线设备', value: `${this.dashboard?.offlineDevices ?? '--'}`, detail: '需要关注', accent: '#B44832' });
            MetricCard({ label: '今日数据上传条数', value: `${this.dashboard?.todayReportCount ?? '--'}`, detail: `北京时间 ${beijingClockTime(this.dashboard?.lastUpdatedAt)}`, accent: '#477B96' });
          }
          OverviewAlertCard({
            alerts: this.alerts,
            freshness: this.alertFreshness,
            offline: this.alertOffline,
            refreshing: this.alertRefreshing,
            onOpenAlerts: () => this.onOpenAlerts(),
            onOpenMap: (alert: Alert | null) => this.onOpenAlertMap(alert)
          });
          OverviewTrendPane({ trends: this.trends });
        }
        .padding({ left: 16, right: 16, bottom: 24 })
        .width('100%')
      }
      .layoutWeight(1)
      .scrollBar(BarState.Off)
      .align(Alignment.TopStart)
    }
    .layoutWeight(1)
  }
}

@Component
struct OverviewAlertCard {
  @Prop alerts: Array<Alert>;
  @Prop freshness: string;
  @Prop offline: boolean;
  @Prop refreshing: boolean;
  onOpenAlerts: () => void = () => {};
  onOpenMap: (alert: Alert | null) => void = () => {};

  private primaryAlert(): Alert | null {
    return this.alerts.length > 0 ? this.alerts[0] : null;
  }

  private severityColor(alert: Alert): string {
    return alert.severity === 'critical' || alert.severity === 'high' ? UI_COLOR_DANGER : '#A76A2E';
  }

  private statusText(): string {
    if (this.refreshing) return '正在同步告警状态';
    if (this.offline) return `缓存数据 · ${this.freshness}`;
    if (this.alerts.length === 0) return '当前无活动告警';
    return `${this.alerts.length} 条待处理 · ${this.freshness}`;
  }

  build() {
    Column({ space: 10 }) {
      Row({ space: 10 }) {
        Stack({ alignContent: Alignment.Center }) {
          Circle({ width: 38, height: 38 })
            .fill(this.alerts.length > 0 ? '#F8E9E5' : '#EAF5F1')
          SymbolGlyph($r('sys.symbol.bell'))
            .fontSize(18)
            .fontColor([this.alerts.length > 0 ? UI_COLOR_DANGER : UI_COLOR_SUCCESS])
        }
        .width(38)
        .height(38)
        Column({ space: 2 }) {
          Text('告警中心')
            .fontSize(16)
            .fontWeight(FontWeight.Bold)
            .fontColor(UI_COLOR_TEXT)
          Text(this.statusText())
            .fontSize(10)
            .fontColor(this.offline ? UI_COLOR_DANGER : UI_COLOR_MUTED)
            .maxLines(1)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
        }
        .alignItems(HorizontalAlign.Start)
        .layoutWeight(1)
        Button({ type: ButtonType.Circle }) {
          SymbolGlyph($r('sys.symbol.chevron_right'))
            .fontSize(16)
            .fontColor([UI_COLOR_MUTED])
        }
        .width(32)
        .height(32)
        .backgroundColor('#F1F3F4')
        .onClick(() => this.onOpenAlerts())
      }
      .width('100%')

      if (this.primaryAlert()) {
        Column({ space: 7 }) {
          Row() {
            Text(this.primaryAlert()?.title ?? '监测告警')
              .fontSize(13)
              .fontWeight(FontWeight.Medium)
              .fontColor(UI_COLOR_TEXT)
              .maxLines(2)
              .textOverflow({ overflow: TextOverflow.Ellipsis })
              .layoutWeight(1)
            Text(severityLabel(this.primaryAlert()?.severity ?? ''))
              .fontSize(10)
              .fontColor(this.severityColor(this.primaryAlert() as Alert))
          }
          Text(`${alertStatusLabel(this.primaryAlert()?.status ?? '')} · ${relativeTime(this.primaryAlert()?.lastEventAt)}`)
            .fontSize(11)
            .fontColor(UI_COLOR_MUTED)
          Row({ space: 8 }) {
            Button('查看全部')
              .height(34)
              .fontSize(12)
              .fontColor('#FFFFFF')
              .backgroundColor(UI_COLOR_TEXT)
              .borderRadius(6)
              .layoutWeight(1)
              .onClick(() => this.onOpenAlerts())
            Button('地图定位')
              .height(34)
              .fontSize(12)
              .fontColor(UI_COLOR_TEXT)
              .backgroundColor('#E9EDF0')
              .borderRadius(6)
              .layoutWeight(1)
              .onClick(() => this.onOpenMap(this.primaryAlert()))
          }
          .width('100%')
        }
        .padding(12)
        .backgroundColor('#FFF7F3')
        .borderRadius(7)
      } else {
        Row({ space: 8 }) {
          Text(this.offline ? '暂时无法获取最新告警' : '系统运行正常，暂无活动告警')
            .fontSize(12)
            .fontColor(UI_COLOR_MUTED)
            .layoutWeight(1)
          Button('查看全部')
            .height(32)
            .fontSize(11)
            .fontColor(UI_COLOR_TEXT)
            .backgroundColor('#E9EDF0')
            .borderRadius(6)
            .onClick(() => this.onOpenAlerts())
        }
        .width('100%')
      }
    }
    .padding(14)
    .backgroundColor(UI_COLOR_SURFACE)
    .borderRadius(8)
    .width('100%')
  }
}

@Component
struct AiPane {
  @Prop status: EdgeAiStatus | null;
  @Prop devices: Array<Device>;
  @Prop actions: Array<HermesAction>;
  @Prop lastAction: HermesAction | null;
  @Prop intentResolution: EdgeAiIntentResolution | null;
  @Prop conversations: Array<HermesConversation>;
  @Prop conversationId: string;
  @Prop messages: Array<HermesMessage>;
  @Prop conversationTasks: Array<HermesAgentTask>;
  @Prop chatLoading: boolean;
  @Prop refreshing: boolean;
  @Prop executing: boolean;
  onRefresh: () => void = () => {};
  onAction: (action: EdgeAiActionName) => void = () => {};
  onIntent: (intent: string) => void = () => {};
  onSelectConversation: (conversationId: string) => void = () => {};
  onNewConversation: () => void = () => {};
  onOpenDevice: (deviceId: string) => void = () => {};

  private subtitle(): string {
    if (!this.status) return '正在连接 RK3568 边缘智能';
    if (!this.status.available) return '边缘智能暂不可用 · 保留最近任务';
    return `安全执行 · ${this.status.devices.length} 个节点 · ${shortTime(this.status.generatedAt)}`;
  }

  build() {
    Column() {
      PageHeader({
        title: 'Hermes 智能',
        subtitle: this.subtitle(),
        offline: this.status !== null && !this.status.available,
        refreshing: this.refreshing,
        onRefresh: () => this.onRefresh()
      });
      Scroll() {
        Column({ space: 18 }) {
          HermesSituationPanel({
            status: this.status,
            devices: this.devices,
            onOpenDevice: (deviceId: string) => this.onOpenDevice(deviceId)
          });
          HermesCommandPanel({
            executing: this.executing,
            resolution: this.intentResolution,
            lastAction: this.lastAction,
            conversations: this.conversations,
            conversationId: this.conversationId,
            messages: this.messages,
            tasks: this.conversationTasks,
            loading: this.chatLoading,
            onAction: (action: EdgeAiActionName) => this.onAction(action),
            onIntent: (intent: string) => this.onIntent(intent),
            onSelectConversation: (conversationId: string) => this.onSelectConversation(conversationId),
            onNewConversation: () => this.onNewConversation()
          });
          HermesNodeSection({
            status: this.status,
            devices: this.devices,
            onOpenDevice: (deviceId: string) => this.onOpenDevice(deviceId)
          });
          HermesTaskSection({
            tasks: this.conversationTasks,
            actions: this.actions,
            fallbackTasks: this.status?.tasks ?? []
          });
          HermesRuntimeStrip({ status: this.status });
        }
        .padding({ left: 16, right: 16, bottom: 24 })
        .width('100%')
      }
      .layoutWeight(1)
      .scrollBar(BarState.Off)
      .align(Alignment.TopStart)
    }
    .layoutWeight(1)
    .backgroundColor('#F5F7F6')
  }
}

@Component
struct HermesSituationPanel {
  @Prop status: EdgeAiStatus | null;
  @Prop devices: Array<Device>;
  onOpenDevice: (deviceId: string) => void = () => {};

  private primaryDevice(): EdgeRiskDevice | null {
    if (!this.status || this.status.devices.length === 0) return null;
    return this.status.devices[0];
  }

  private deviceLabel(deviceId: string): string {
    for (let index = 0; index < this.devices.length; index++) {
      if (this.devices[index].deviceId === deviceId) return deviceDisplayName(this.devices[index]);
    }
    return edgeNodeFallbackName(deviceId);
  }

  private riskLabel(): string {
    const level = this.status?.overallRiskLevel ?? 'unavailable';
    if (level === 'danger') return '危险';
    if (level === 'warning') return '预警';
    if (level === 'attention') return '关注';
    if (level === 'normal') return '平稳';
    return '待连接';
  }

  private headline(): string {
    const device = this.primaryDevice();
    if (!this.status?.available) return '等待边缘侧恢复实时研判';
    if (device?.hardRuleTriggered) return `${this.deviceLabel(device.deviceId)}触发安全阈值`;
    if (device) return device.explain;
    return 'Hermes 正在建立当前态势';
  }

  private recommendation(): string {
    const level = this.status?.overallRiskLevel ?? 'unavailable';
    if (level === 'danger') return '立即核对现场告警与人员安全，保持物理处置由规则引擎和人工确认。';
    if (level === 'warning') return '提高监测频率，复核主要风险因素并准备现场处置。';
    if (level === 'attention') return '持续观察倾角、GPS 与土壤变化，关注风险是否继续上升。';
    if (level === 'normal') return '三个节点持续参与研判，当前无需新增现场动作。';
    return '最近一次有效任务仍保留，监测主链路不受影响。';
  }

  private scoreText(): string {
    const score = this.status?.maxRiskScore;
    return score === undefined || score === null ? '--' : `${Math.round(score * 100)}%`;
  }

  build() {
    Column({ space: 14 }) {
      Row() {
        Row({ space: 7 }) {
          Circle({ width: 8, height: 8 })
            .fill(this.status?.available ? '#75D3B7' : '#AAB5AF')
          Text('HERMES · 边缘态势')
            .fontSize(11)
            .fontWeight(FontWeight.Medium)
            .fontColor('#DDEAE4')
        }
        .layoutWeight(1)
        Text(this.riskLabel())
          .fontSize(12)
          .fontWeight(FontWeight.Bold)
          .fontColor(this.status?.overallRiskLevel === 'danger' ? '#FFE0D6' : '#EAF4EF')
      }
      .width('100%')

      Text(this.headline())
        .fontSize(21)
        .fontWeight(FontWeight.Bold)
        .fontColor('#F4F8F6')
        .lineHeight(29)
        .maxLines(3)
        .textOverflow({ overflow: TextOverflow.Ellipsis })
        .width('100%')

      Text(this.recommendation())
        .fontSize(12)
        .fontColor('#C8D9D1')
        .lineHeight(19)
        .width('100%')

      Row({ space: 8 }) {
        Text(`风险 ${this.scoreText()}`)
          .fontSize(10)
          .fontWeight(FontWeight.Medium)
          .fontColor('#173D32')
          .backgroundColor('#DDECE5')
          .borderRadius(5)
          .padding({ left: 9, right: 9, top: 5, bottom: 5 })
        Text(this.status?.mqttConnected ? '链路在线' : '离线研判')
          .fontSize(10)
          .fontColor('#DDEAE4')
          .backgroundColor('#285648')
          .borderRadius(5)
          .padding({ left: 9, right: 9, top: 5, bottom: 5 })
        Blank()
        if (this.primaryDevice()) {
          Button('查看节点')
            .height(34)
            .fontSize(11)
            .fontWeight(FontWeight.Medium)
            .fontColor(UI_COLOR_HERMES)
            .backgroundColor('#F2F7F4')
            .borderRadius(6)
            .onClick(() => this.onOpenDevice((this.primaryDevice() as EdgeRiskDevice).deviceId))
        }
      }
      .width('100%')
    }
    .padding(16)
    .backgroundColor(UI_COLOR_HERMES)
    .borderRadius(10)
    .width('100%')
  }
}

@Component
struct HermesCommandPanel {
  @Prop executing: boolean;
  @Prop resolution: EdgeAiIntentResolution | null;
  @Prop lastAction: HermesAction | null;
  @Prop conversations: Array<HermesConversation>;
  @Prop conversationId: string;
  @Prop messages: Array<HermesMessage>;
  @Prop tasks: Array<HermesAgentTask>;
  @Prop loading: boolean;
  @State private intentText: string = '';
  onAction: (action: EdgeAiActionName) => void = () => {};
  onIntent: (intent: string) => void = () => {};
  onSelectConversation: (conversationId: string) => void = () => {};
  onNewConversation: () => void = () => {};

  private submitIntent(): void {
    const value = this.intentText.trim();
    if (value.length === 0 || this.executing) return;
    this.intentText = '';
    this.onIntent(value);
  }

  private feedbackColor(): string {
    if (this.resolution?.blocked) return UI_COLOR_DANGER;
    if (this.resolution?.resolved) return UI_COLOR_SUCCESS;
    return '#A06A18';
  }

  private actionPlan(): Array<string> {
    const source = this.lastAction?.result.recommendedPlan ?? [];
    const result: Array<string> = [];
    for (let index = 0; index < source.length; index++) {
      result.push(localizedHermesText(source[index]));
    }
    return result;
  }

  private activeTitle(): string {
    for (let index = 0; index < this.conversations.length; index++) {
      if (this.conversations[index].conversationId === this.conversationId) return this.conversations[index].title;
    }
    return '新的研判任务';
  }

  build() {
    Column({ space: 12 }) {
      Row() {
        Column({ space: 2 }) {
          Text('Hermes 对话')
            .fontSize(18)
            .fontWeight(FontWeight.Bold)
            .fontColor(UI_COLOR_TEXT)
          Text(this.conversationId.length > 0 ? this.activeTitle() : '首次发送后自动保存')
            .fontSize(12)
            .fontColor(UI_COLOR_MUTED)
            .maxLines(1)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
        }
        .layoutWeight(1)
        Button('新对话')
          .height(44)
          .fontSize(12)
          .fontWeight(FontWeight.Medium)
          .fontColor(UI_COLOR_HERMES)
          .backgroundColor(UI_COLOR_HERMES_SOFT)
          .borderRadius(6)
          .enabled(!this.executing)
          .onClick(() => this.onNewConversation())
      }
      .width('100%')

      if (this.conversations.length > 0) {
        Column() {
          ForEach(this.conversations.slice(0, 3), (conversation: HermesConversation, index: number) => {
            Row({ space: 10 }) {
              Circle({ width: 7, height: 7 })
                .fill(conversation.conversationId === this.conversationId ? UI_COLOR_HERMES : '#C6CECA')
              Text(conversation.title)
                .fontSize(13)
                .fontWeight(conversation.conversationId === this.conversationId ? FontWeight.Medium : FontWeight.Regular)
                .fontColor(UI_COLOR_TEXT)
                .maxLines(1)
                .textOverflow({ overflow: TextOverflow.Ellipsis })
                .layoutWeight(1)
              Text(relativeTime(conversation.updatedAt))
                .fontSize(11)
                .fontColor(UI_COLOR_MUTED)
              SymbolGlyph($r('sys.symbol.chevron_right'))
                .fontSize(15)
                .fontColor([UI_COLOR_SUBTLE])
            }
            .height(44)
            .padding({ left: 10, right: 8 })
            .width('100%')
            .border({ width: { bottom: index === Math.min(2, this.conversations.length - 1) ? 0 : 1 }, color: '#E1E7E3' })
            .accessibilityText(`打开历史对话：${conversation.title}`)
            .onClick(() => this.onSelectConversation(conversation.conversationId))
          }, (conversation: HermesConversation) => conversation.conversationId)
        }
        .backgroundColor('#F0F4F2')
        .borderRadius(7)
        .width('100%')
      }

      if (this.loading) {
        Row({ space: 8 }) {
          LoadingProgress().width(18).height(18).color(UI_COLOR_HERMES)
          Text('正在读取对话记录').fontSize(12).fontColor(UI_COLOR_MUTED)
        }
        .height(44)
      } else if (this.messages.length === 0) {
        Column({ space: 5 }) {
          Text('可以直接安排连续任务')
            .fontSize(14)
            .fontWeight(FontWeight.Medium)
            .fontColor(UI_COLOR_TEXT)
          Text('例如：先诊断链路，再重新研判，最后生成报告。Hermes 会按顺序执行并回传结果。')
            .fontSize(13)
            .fontColor(UI_COLOR_MUTED)
            .lineHeight(20)
        }
        .padding(12)
        .backgroundColor('#EDF3EF')
        .borderRadius(7)
        .width('100%')
      } else {
        Column({ space: 10 }) {
          ForEach(this.messages.slice(Math.max(0, this.messages.length - 10)), (message: HermesMessage) => {
            HermesMessageRow({ message: message });
          }, (message: HermesMessage) => message.messageId)
        }
        .width('100%')
      }

      if (this.executing) {
        Row({ space: 8 }) {
          LoadingProgress().width(18).height(18).color(UI_COLOR_ACCENT)
          Text('正在规划并执行 RK3568 安全任务')
            .fontSize(12)
            .fontColor(UI_COLOR_ACCENT)
        }
        .height(36)
        .width('100%')
      }

      Row({ space: 8 }) {
        TextInput({ text: this.intentText, placeholder: '继续追问，或下发一项任务' })
          .height(48)
          .fontSize(14)
          .fontColor(UI_COLOR_TEXT)
          .placeholderColor(UI_COLOR_SUBTLE)
          .caretColor(UI_COLOR_HERMES)
          .backgroundColor(UI_COLOR_SURFACE)
          .border({ width: 1, color: UI_COLOR_HERMES_LINE })
          .borderRadius(7)
          .padding({ left: 12, right: 12 })
          .onChange((value: string) => this.intentText = value)
          .enabled(!this.executing)
          .layoutWeight(1)
        Button({ type: ButtonType.Circle }) {
          if (this.executing) {
            LoadingProgress().width(18).height(18).color('#FFFFFF')
          } else {
            SymbolGlyph($r('sys.symbol.chevron_right'))
              .fontSize(19)
              .fontColor(['#FFFFFF'])
          }
        }
        .width(48)
        .height(48)
        .backgroundColor(UI_COLOR_HERMES)
        .enabled(!this.executing && this.intentText.trim().length > 0)
        .accessibilityText('发送给 Hermes')
        .onClick(() => this.submitIntent())
      }
      .width('100%')

      Row({ space: 7 }) {
        HermesQuickAction({
          label: '重新研判',
          action: 'recheck',
          actionEnabled: !this.executing,
          onAction: (action: EdgeAiActionName) => this.onAction(action)
        });
        HermesQuickAction({
          label: '生成报告',
          action: 'generate_report',
          actionEnabled: !this.executing,
          onAction: (action: EdgeAiActionName) => this.onAction(action)
        });
        HermesQuickAction({
          label: '诊断链路',
          action: 'collect_logs',
          actionEnabled: !this.executing,
          onAction: (action: EdgeAiActionName) => this.onAction(action)
        });
      }
      .width('100%')

      if (this.resolution?.blocked) {
        Row({ space: 8 }) {
          Circle({ width: 8, height: 8 }).fill(this.feedbackColor())
          Text('受保护操作未执行，请前往对应功能页人工确认')
            .fontSize(12)
            .fontColor(this.feedbackColor())
            .layoutWeight(1)
        }
        .padding({ left: 11, right: 11, top: 9, bottom: 9 })
        .backgroundColor(this.resolution?.blocked ? '#F8EAE6' : '#F1F5F2')
        .borderRadius(7)
        .width('100%')
      }

      if (this.lastAction) {
        Column({ space: 7 }) {
          Row() {
            Text(this.lastAction ? hermesActionSummary(this.lastAction) : '')
              .fontSize(12)
              .fontWeight(FontWeight.Medium)
              .fontColor(UI_COLOR_TEXT)
              .layoutWeight(1)
            Text(shortTime(this.lastAction?.createdAt ?? ''))
              .fontSize(9)
              .fontColor(UI_COLOR_SUBTLE)
          }
          .width('100%')
          if (this.actionPlan().length > 0) {
            ForEach(this.actionPlan().slice(0, 3), (item: string) => {
              Row({ space: 7 }) {
                Circle({ width: 5, height: 5 }).fill(UI_COLOR_HERMES)
                Text(item)
                  .fontSize(10)
                  .fontColor(UI_COLOR_MUTED)
                  .layoutWeight(1)
              }
            })
          } else if (this.lastAction?.result.note) {
            Text(localizedHermesText(this.lastAction.result.note))
              .fontSize(10)
              .fontColor(UI_COLOR_MUTED)
              .width('100%')
          }
          Text(this.lastAction.status === 'completed' ? '已执行 · 已记录 · 未触碰网关核心' :
            this.lastAction.status === 'failed' ? '执行失败 · 主链路未受影响' : '任务已记录 · 正在独立队列中处理')
            .fontSize(9)
            .fontColor(this.lastAction.status === 'failed' ? UI_COLOR_DANGER :
              this.lastAction.status === 'completed' ? UI_COLOR_SUCCESS : UI_COLOR_ACCENT)
            .width('100%')
        }
        .padding(12)
        .backgroundColor(UI_COLOR_SURFACE)
        .borderRadius(8)
        .width('100%')
      }
    }
    .padding({ top: 2 })
    .width('100%')
  }
}

@Component
struct HermesMessageRow {
  @Prop message: HermesMessage;

  build() {
    Row() {
      if (this.message.role === 'user') {
        Blank().layoutWeight(1)
      }
      Column({ space: 5 }) {
        Row() {
          Text(this.message.role === 'user' ? '我' : 'Hermes')
            .fontSize(11)
            .fontWeight(FontWeight.Medium)
            .fontColor(this.message.role === 'user' ? '#DDE9E3' : UI_COLOR_HERMES)
            .layoutWeight(1)
          Text(shortTime(this.message.createdAt))
            .fontSize(10)
            .fontColor(this.message.role === 'user' ? '#B9CEC4' : UI_COLOR_SUBTLE)
        }
        .width('100%')
        Text(this.message.content)
          .fontSize(14)
          .fontColor(this.message.role === 'user' ? '#F5F8F6' : UI_COLOR_TEXT)
          .lineHeight(21)
          .width('100%')
      }
      .padding({ left: 12, right: 12, top: 10, bottom: 10 })
      .backgroundColor(this.message.role === 'user' ? UI_COLOR_HERMES : '#EDF2EF')
      .borderRadius(7)
      .width('86%')
      if (this.message.role !== 'user') {
        Blank().layoutWeight(1)
      }
    }
    .width('100%')
    .alignItems(VerticalAlign.Top)
  }
}

@Component
struct HermesQuickAction {
  @Prop label: string;
  @Prop action: EdgeAiActionName;
  @Prop actionEnabled: boolean;
  onAction: (action: EdgeAiActionName) => void = () => {};

  build() {
    Button(this.label)
      .height(44)
      .fontSize(12)
      .fontWeight(FontWeight.Medium)
      .fontColor(UI_COLOR_HERMES)
      .backgroundColor(UI_COLOR_HERMES_SOFT)
      .borderRadius(6)
      .enabled(this.actionEnabled)
      .layoutWeight(1)
      .onClick(() => this.onAction(this.action))
  }
}

@Component
struct HermesNodeSection {
  @Prop status: EdgeAiStatus | null;
  @Prop devices: Array<Device>;
  onOpenDevice: (deviceId: string) => void = () => {};

  build() {
    Column({ space: 10 }) {
      Row() {
        Text('节点研判')
          .fontSize(17)
          .fontWeight(FontWeight.Bold)
          .fontColor(UI_COLOR_TEXT)
          .layoutWeight(1)
        Text(`${this.status?.devices.length ?? 0} 个节点`)
          .fontSize(10)
          .fontColor(UI_COLOR_MUTED)
      }
      .width('100%')
      Column() {
        if (!this.status || this.status.devices.length === 0) {
          Text('等待节点遥测进入边缘研判')
            .fontSize(11)
            .fontColor(UI_COLOR_MUTED)
            .padding(14)
            .width('100%')
        } else {
          ForEach(this.status.devices, (risk: EdgeRiskDevice, index: number) => {
            HermesNodeRow({
              risk: risk,
              devices: this.devices,
              onOpen: (deviceId: string) => this.onOpenDevice(deviceId)
            });
            if (index < (this.status?.devices.length ?? 0) - 1) {
              Divider().strokeWidth(1).color('#E8ECEA').margin({ left: 14, right: 14 })
            }
          }, (risk: EdgeRiskDevice) => risk.deviceId)
        }
      }
      .backgroundColor(UI_COLOR_SURFACE)
      .borderRadius(9)
      .width('100%')
    }
    .width('100%')
  }
}

@Component
struct HermesNodeRow {
  @Prop risk: EdgeRiskDevice;
  @Prop devices: Array<Device>;
  onOpen: (deviceId: string) => void = () => {};

  private deviceLabel(): string {
    for (let index = 0; index < this.devices.length; index++) {
      if (this.devices[index].deviceId === this.risk.deviceId) return deviceDisplayName(this.devices[index]);
    }
    return edgeNodeFallbackName(this.risk.deviceId);
  }

  private riskLabel(): string {
    if (this.risk.riskLevel === 'danger') return '危险';
    if (this.risk.riskLevel === 'warning') return '预警';
    if (this.risk.riskLevel === 'attention') return '关注';
    return '平稳';
  }

  private riskColor(): string {
    if (this.risk.riskLevel === 'danger') return UI_COLOR_DANGER;
    if (this.risk.riskLevel === 'warning') return '#D46B2E';
    if (this.risk.riskLevel === 'attention') return '#A06A18';
    return UI_COLOR_SUCCESS;
  }

  private dataLabel(): string {
    if (this.risk.dataStatus === 'offline') return '离线数据';
    if (this.risk.dataStatus === 'stale') return '数据延迟';
    if (this.risk.dataStatus === 'insufficient') return '数据不足';
    return '实时';
  }

  private factorText(): string {
    const value = this.risk.factors.length > 0 ? this.risk.factors[0] : this.risk.explain;
    return value.replace('deg', '°');
  }

  build() {
    Row({ space: 11 }) {
      Column({ space: 3 }) {
        Text(this.deviceLabel())
          .fontSize(13)
          .fontWeight(FontWeight.Bold)
          .fontColor(UI_COLOR_TEXT)
        Text(this.factorText())
          .fontSize(10)
          .fontColor(UI_COLOR_MUTED)
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
        Text(`${this.dataLabel()} · ${this.risk.dataUpdatedAt ? shortTime(this.risk.dataUpdatedAt) : '尚无数据'}`)
          .fontSize(9)
          .fontColor(UI_COLOR_SUBTLE)
      }
      .alignItems(HorizontalAlign.Start)
      .layoutWeight(1)
      Column({ space: 3 }) {
        Text(this.riskLabel())
          .fontSize(10)
          .fontWeight(FontWeight.Bold)
          .fontColor(this.riskColor())
        Text(`${Math.round(this.risk.riskScore * 100)}%`)
          .fontSize(12)
          .fontWeight(FontWeight.Bold)
          .fontColor(UI_COLOR_TEXT)
      }
      .alignItems(HorizontalAlign.End)
      SymbolGlyph($r('sys.symbol.chevron_right'))
        .fontSize(16)
        .fontColor([UI_COLOR_SUBTLE])
    }
    .padding({ left: 14, right: 12, top: 12, bottom: 12 })
    .width('100%')
    .onClick(() => this.onOpen(this.risk.deviceId))
  }
}

@Component
struct HermesTaskSection {
  @Prop tasks: Array<HermesAgentTask>;
  @Prop actions: Array<HermesAction>;
  @Prop fallbackTasks: Array<EdgeAgentTask>;

  build() {
    Column({ space: 10 }) {
      Row() {
        Text('任务轨迹')
          .fontSize(17)
          .fontWeight(FontWeight.Bold)
          .fontColor(UI_COLOR_TEXT)
          .layoutWeight(1)
        Text('计划 · 执行 · 留痕')
          .fontSize(12)
          .fontColor(UI_COLOR_MUTED)
      }
      .width('100%')
      if (this.tasks.length > 0) {
        ForEach(this.tasks.slice(0, 6), (task: HermesAgentTask, index: number) => {
          HermesAgentTaskTimelineRow({
            task: task,
            last: index === Math.min(this.tasks.length, 6) - 1
          });
        }, (task: HermesAgentTask) => task.taskId)
      } else if (this.actions.length > 0) {
        ForEach(this.actions.slice(0, 5), (action: HermesAction, index: number) => {
          HermesActionTimelineRow({
            action: action,
            last: index === Math.min(this.actions.length, 5) - 1
          });
        }, (action: HermesAction) => action.id)
      } else if (this.fallbackTasks.length > 0) {
        ForEach(this.fallbackTasks.slice(0, 4), (task: EdgeAgentTask, index: number) => {
          HermesPredictionTimelineRow({
            task: task,
            last: index === Math.min(this.fallbackTasks.length, 4) - 1
          });
        }, (task: EdgeAgentTask) => task.taskId)
      } else {
        Text('Hermes 正在等待下一项安全任务')
          .fontSize(11)
          .fontColor(UI_COLOR_MUTED)
          .padding({ top: 8, bottom: 8 })
          .width('100%')
      }
    }
    .width('100%')
  }
}

@Component
struct HermesAgentTaskTimelineRow {
  @Prop task: HermesAgentTask;
  @Prop last: boolean;
  @State private expanded: boolean = false;

  private statusLabel(): string {
    if (this.task.status === 'succeeded') return '已完成';
    if (this.task.status === 'failed') return '执行失败';
    if (this.task.status === 'running') return '执行中';
    if (this.task.status === 'awaiting_confirmation') return '等待确认';
    return '已排队';
  }

  private statusColor(): string {
    if (this.task.status === 'succeeded') return UI_COLOR_SUCCESS;
    if (this.task.status === 'failed') return UI_COLOR_DANGER;
    if (this.task.status === 'running') return UI_COLOR_ACCENT;
    return UI_COLOR_MUTED;
  }

  private detail(): string {
    if (this.task.error) return this.task.error;
    if (this.task.result.artifactName) return `记录：${this.task.result.artifactName}`;
    if (this.task.summary.length > 0) return localizedHermesText(this.task.summary);
    return '任务状态已写入服务器审计记录';
  }

  private hasRecord(): boolean {
    return (this.task.result.reportText?.length ?? 0) > 0 || (this.task.result.evidence?.length ?? 0) > 0;
  }

  build() {
    Column({ space: 8 }) {
      Row({ space: 10 }) {
        Column() {
          Circle({ width: 10, height: 10 }).fill(this.statusColor())
          if (!this.last) {
            Rect().width(2).height(48).fill(UI_COLOR_HERMES_LINE)
          }
        }
        .width(12)
        .alignItems(HorizontalAlign.Center)
        Column({ space: 4 }) {
          Row() {
            Text(this.task.label)
              .fontSize(14)
              .fontWeight(FontWeight.Medium)
              .fontColor(UI_COLOR_TEXT)
              .layoutWeight(1)
            Text(this.statusLabel())
              .fontSize(12)
              .fontWeight(FontWeight.Medium)
              .fontColor(this.statusColor())
          }
          .width('100%')
          Text(this.detail())
            .fontSize(12)
            .fontColor(UI_COLOR_MUTED)
            .maxLines(2)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
          Row() {
            Text(`${shortTime(this.task.createdAt)} · ${this.task.safetyLevel === 'read_only' ? '只读自动执行' : '需要人工确认'}`)
              .fontSize(11)
              .fontColor(UI_COLOR_SUBTLE)
              .layoutWeight(1)
            if (this.hasRecord()) {
              Button(this.expanded ? '收起记录' : '查看记录')
                .height(44)
                .fontSize(12)
                .fontColor(UI_COLOR_HERMES)
                .backgroundColor('#E8EFEB')
                .borderRadius(6)
                .onClick(() => this.expanded = !this.expanded)
            }
          }
          .width('100%')
        }
        .padding({ bottom: this.last ? 0 : 8 })
        .layoutWeight(1)
      }
      .alignItems(VerticalAlign.Top)
      .width('100%')

      if (this.expanded && this.hasRecord()) {
        Column({ space: 10 }) {
          if (this.task.result.reportText) {
            Text(this.task.result.reportText)
              .fontSize(12)
              .fontColor(UI_COLOR_TEXT)
              .lineHeight(19)
              .width('100%')
          }
          if (this.task.result.evidence) {
            ForEach(this.task.result.evidence.slice(0, 6), (evidence: HermesDiagnosticEvidence) => {
              HermesDiagnosticEvidenceRow({ evidence: evidence });
            }, (evidence: HermesDiagnosticEvidence) => evidence.command)
          }
        }
        .padding(12)
        .backgroundColor('#F0F4F2')
        .borderRadius(7)
        .width('100%')
      }
    }
    .width('100%')
  }
}

@Component
struct HermesDiagnosticEvidenceRow {
  @Prop evidence: HermesDiagnosticEvidence;

  private output(): string {
    if (this.evidence.stdout.trim().length > 0) return this.evidence.stdout.trim();
    if (this.evidence.stderr.trim().length > 0) return this.evidence.stderr.trim();
    if (this.evidence.error) return this.evidence.error;
    return '命令已完成，没有额外输出';
  }

  build() {
    Column({ space: 3 }) {
      Row() {
        Text(this.evidence.command)
          .fontSize(11)
          .fontWeight(FontWeight.Medium)
          .fontColor(UI_COLOR_TEXT)
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
          .layoutWeight(1)
        Text(this.evidence.ok ? '正常' : '异常')
          .fontSize(11)
          .fontColor(this.evidence.ok ? UI_COLOR_SUCCESS : UI_COLOR_DANGER)
      }
      .width('100%')
      Text(this.output())
        .fontSize(11)
        .fontColor(UI_COLOR_MUTED)
        .lineHeight(17)
        .maxLines(4)
        .textOverflow({ overflow: TextOverflow.Ellipsis })
        .width('100%')
    }
    .width('100%')
  }
}

@Component
struct HermesActionTimelineRow {
  @Prop action: HermesAction;
  @Prop last: boolean;

  private actionLabel(): string {
    if (this.action.action === 'collect_logs') return '链路诊断';
    if (this.action.action === 'generate_report') return '态势报告';
    return '风险复检';
  }

  private statusColor(): string {
    if (this.action.status === 'failed') return UI_COLOR_DANGER;
    if (this.action.status === 'completed') return UI_COLOR_SUCCESS;
    return UI_COLOR_ACCENT;
  }

  private statusText(): string {
    if (this.action.status === 'failed') return '执行失败 · 主链路未受影响';
    if (this.action.status === 'completed') return '验证完成 · 操作已留痕';
    if (this.action.status === 'running') return '执行中 · 使用独立只读队列';
    return '已排队 · 等待 Hermes 执行';
  }

  build() {
    Row({ space: 10 }) {
      Column() {
        Circle({ width: 10, height: 10 }).fill(this.statusColor())
        if (!this.last) {
          Rect().width(2).height(42).fill(UI_COLOR_HERMES_LINE)
        }
      }
      .width(12)
      .alignItems(HorizontalAlign.Center)
      Column({ space: 3 }) {
        Row() {
          Text(this.actionLabel())
            .fontSize(12)
            .fontWeight(FontWeight.Bold)
            .fontColor(UI_COLOR_TEXT)
            .layoutWeight(1)
          Text(shortTime(this.action.createdAt))
            .fontSize(9)
            .fontColor(UI_COLOR_SUBTLE)
        }
        .width('100%')
        Text(hermesActionSummary(this.action))
          .fontSize(10)
          .fontColor(UI_COLOR_MUTED)
          .maxLines(2)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
        Text(this.statusText())
          .fontSize(9)
          .fontColor(this.statusColor())
      }
      .padding({ bottom: this.last ? 0 : 8 })
      .layoutWeight(1)
    }
    .alignItems(VerticalAlign.Top)
    .width('100%')
  }
}

@Component
struct HermesPredictionTimelineRow {
  @Prop task: EdgeAgentTask;
  @Prop last: boolean;

  build() {
    Row({ space: 10 }) {
      Column() {
        Circle({ width: 10, height: 10 }).fill(this.task.status === 'completed' ? UI_COLOR_SUCCESS : UI_COLOR_ACCENT)
        if (!this.last) {
          Rect().width(2).height(42).fill(UI_COLOR_HERMES_LINE)
        }
      }
      .width(12)
      .alignItems(HorizontalAlign.Center)
      Column({ space: 3 }) {
        Row() {
          Text(this.task.title)
            .fontSize(12)
            .fontWeight(FontWeight.Bold)
            .fontColor(UI_COLOR_TEXT)
            .layoutWeight(1)
          Text(shortTime(this.task.createdAt))
            .fontSize(9)
            .fontColor(UI_COLOR_SUBTLE)
        }
        .width('100%')
        Text(this.task.verification)
          .fontSize(10)
          .fontColor(UI_COLOR_MUTED)
          .maxLines(2)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
      }
      .padding({ bottom: this.last ? 0 : 8 })
      .layoutWeight(1)
    }
    .alignItems(VerticalAlign.Top)
    .width('100%')
  }
}

@Component
struct HermesRuntimeStrip {
  @Prop status: EdgeAiStatus | null;

  build() {
    Row() {
      Column({ space: 2 }) {
        Text(this.status?.model.loaded ? '就绪' : '准备中')
          .fontSize(14)
          .fontWeight(FontWeight.Bold)
          .fontColor(this.status?.model.loaded ? UI_COLOR_SUCCESS : UI_COLOR_MUTED)
        Text('风险模型')
          .fontSize(9)
          .fontColor(UI_COLOR_MUTED)
      }
      .alignItems(HorizontalAlign.Start)
      .layoutWeight(1)
      Column({ space: 2 }) {
        Text(`${this.status?.devices.length ?? 0}`)
          .fontSize(14)
          .fontWeight(FontWeight.Bold)
          .fontColor(UI_COLOR_TEXT)
        Text('研判节点')
          .fontSize(9)
          .fontColor(UI_COLOR_MUTED)
      }
      .alignItems(HorizontalAlign.Start)
      .layoutWeight(1)
      Column({ space: 2 }) {
        Text(`${this.status?.pendingUploadCount ?? 0}`)
          .fontSize(14)
          .fontWeight(FontWeight.Bold)
          .fontColor((this.status?.pendingUploadCount ?? 0) > 0 ? UI_COLOR_ACCENT : UI_COLOR_TEXT)
        Text('待回传')
          .fontSize(9)
          .fontColor(UI_COLOR_MUTED)
      }
      .alignItems(HorizontalAlign.Start)
      .layoutWeight(1)
      Column({ space: 2 }) {
        Text(this.status?.mqttConnected ? '在线' : '离线')
          .fontSize(14)
          .fontWeight(FontWeight.Bold)
          .fontColor(this.status?.mqttConnected ? UI_COLOR_SUCCESS : UI_COLOR_DANGER)
        Text('边缘链路')
          .fontSize(9)
          .fontColor(UI_COLOR_MUTED)
      }
      .alignItems(HorizontalAlign.Start)
      .layoutWeight(1)
    }
    .padding({ top: 13, bottom: 13 })
    .border({ width: { top: 1, bottom: 1 }, color: UI_COLOR_HERMES_LINE })
    .width('100%')
  }
}

@Component
struct OverviewTrendPane {
  @Prop trends: Array<DeviceMonitoringTrend>;
  @State private selectedMetricKey: string = 'tilt_y_deg';

  private metricOptions(): Array<DeviceMetricOption> {
    return [
      { sensorKey: 'tilt_y_deg', label: 'Y 倾角' },
      { sensorKey: 'soil_temperature_c', label: '土壤温度' },
      { sensorKey: 'soil_moisture_pct', label: '土壤湿度' },
      { sensorKey: 'electrical_conductivity_us_cm', label: '电导率' }
    ];
  }

  private metricFor(trend: DeviceMonitoringTrend): MetricSeries | null {
    if (this.selectedMetricKey === 'electrical_conductivity_us_cm' &&
      !deviceSupportsConductivity(trend.device)) return null;
    const series = trend.response.series;
    for (let index = 0; index < series.length; index++) {
      if (series[index].sensorKey === this.selectedMetricKey) return series[index];
    }
    return null;
  }

  private hasMetric(sensorKey: string): boolean {
    for (let index = 0; index < this.trends.length; index++) {
      if (sensorKey === 'electrical_conductivity_us_cm' &&
        !deviceSupportsConductivity(this.trends[index].device)) continue;
      const series = this.trends[index].response.series;
      for (let metricIndex = 0; metricIndex < series.length; metricIndex++) {
        if (series[metricIndex].sensorKey === sensorKey) return true;
      }
    }
    return false;
  }

  build() {
    Column({ space: 10 }) {
      Row() {
        Column({ space: 2 }) {
          Text('近 7 日监测趋势')
            .fontSize(16)
            .fontWeight(FontWeight.Bold)
            .fontColor('#18212B')
          Text('按节点对比 · 1 小时均值')
            .fontSize(10)
            .fontColor('#8A949E')
        }
        .alignItems(HorizontalAlign.Start)
      }
      .width('100%')
      Row({ space: 4 }) {
        ForEach(this.metricOptions(), (option: DeviceMetricOption) => {
          MetricSegment({
            label: option.label,
            active: this.selectedMetricKey === option.sensorKey,
            available: this.hasMetric(option.sensorKey),
            onTap: () => this.selectedMetricKey = option.sensorKey
          });
        }, (option: DeviceMetricOption) => option.sensorKey)
      }
      .width('100%')
      if (this.trends.length > 0) {
        ForEach(this.trends, (trend: DeviceMonitoringTrend, index: number) => {
          OverviewTrendRow({
            trend: trend,
            metric: this.metricFor(trend),
            unsupported: this.selectedMetricKey === 'electrical_conductivity_us_cm' &&
              !deviceSupportsConductivity(trend.device),
            showDivider: index < this.trends.length - 1
          });
        }, (trend: DeviceMonitoringTrend) => `${trend.device.deviceId}-${this.selectedMetricKey}`)
      } else {
        Column({ space: 5 }) {
          Text('正在获取节点趋势')
            .fontSize(13)
            .fontWeight(FontWeight.Medium)
            .fontColor('#18212B')
          Text('总览数值可先正常查看')
            .fontSize(11)
            .fontColor('#6C7782')
        }
        .alignItems(HorizontalAlign.Start)
        .padding({ top: 12, bottom: 12 })
        .width('100%')
      }
    }
    .padding(14)
    .backgroundColor('#FFFFFF')
    .borderRadius(8)
    .width('100%')
  }
}

@Component
struct OverviewTrendRow {
  @Prop trend: DeviceMonitoringTrend;
  @Prop metric: MetricSeries | null;
  @Prop unsupported: boolean;
  @Prop showDivider: boolean;

  private unit(): string {
    if (!this.metric) return '';
    if (this.metric.sensorKey === 'tilt_y_deg') return '°';
    if (this.metric.sensorKey === 'soil_temperature_c') return '°C';
    if (this.metric.sensorKey === 'soil_moisture_pct') return '%';
    if (this.metric.sensorKey === 'electrical_conductivity_us_cm') return 'μS/cm';
    return metricUnitLabel(this.metric.unit);
  }

  private digits(): number {
    if (this.metric?.sensorKey === 'tilt_y_deg') return 2;
    if (this.metric?.sensorKey === 'electrical_conductivity_us_cm') return 0;
    return 1;
  }

  private latest(): string {
    if (!this.metric || this.metric.points.length === 0) return '--';
    return this.metric.points[this.metric.points.length - 1].value.toFixed(this.digits());
  }

  private change(): string {
    if (!this.metric || this.metric.points.length < 2) return '暂无对比';
    const points = this.metric.points;
    const value = points[points.length - 1].value - points[0].value;
    return `区间 ${value > 0 ? '+' : ''}${value.toFixed(this.digits())}${this.unit()}`;
  }

  private latestTime(): string {
    if (!this.metric || this.metric.points.length === 0) return '暂无历史数据';
    return `${this.metric.points.length} 个时段 · 截至 ${shortTime(this.metric.points[this.metric.points.length - 1].ts)}`;
  }

  private summaryText(): string {
    if (this.unsupported) return '未配置该监测项';
    return `${this.latestTime()} · ${this.change()}`;
  }

  private accent(): string {
    if (this.metric?.sensorKey === 'soil_temperature_c') return '#B96B38';
    if (this.metric?.sensorKey === 'soil_moisture_pct') return '#3C9D82';
    if (this.metric?.sensorKey === 'electrical_conductivity_us_cm') return '#8B6D2E';
    return '#477B96';
  }

  private fillColor(): string {
    if (this.metric?.sensorKey === 'soil_temperature_c') return 'rgba(185,107,56,0.08)';
    if (this.metric?.sensorKey === 'soil_moisture_pct') return 'rgba(60,157,130,0.08)';
    if (this.metric?.sensorKey === 'electrical_conductivity_us_cm') return 'rgba(139,109,46,0.08)';
    return 'rgba(71,123,150,0.08)';
  }

  build() {
    Column({ space: 7 }) {
      Row({ space: 8 }) {
        Circle({ width: 8, height: 8 })
          .fill(isDeviceOnline(this.trend.device, this.trend.latestStateAt) ? UI_COLOR_SUCCESS : UI_COLOR_DANGER)
        Column({ space: 2 }) {
          Text(deviceDisplayName(this.trend.device))
            .fontSize(13)
            .fontWeight(FontWeight.Medium)
            .fontColor('#18212B')
          Text(this.summaryText())
            .fontSize(10)
            .fontColor('#6C7782')
            .maxLines(1)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
        }
        .alignItems(HorizontalAlign.Start)
        .layoutWeight(1)
        Text(`${this.latest()}${this.unit()}`)
          .fontSize(18)
          .fontWeight(FontWeight.Bold)
          .fontColor(this.metric ? this.accent() : '#8A949E')
      }
      if (this.metric && this.metric.points.length >= 2) {
        TrendLineChart({
          metric: this.metric as MetricSeries,
          accent: this.accent(),
          fillColor: this.fillColor(),
          chartHeight: 48,
          showGrid: false
        });
      } else {
        Text(this.unsupported ? '此节点未配置电导率传感器' :
          this.metric ? '仅 1 个数据点，暂不能形成趋势' : '该节点暂无此项历史数据')
          .fontSize(10)
          .fontColor('#8A949E')
      }
      if (this.showDivider) {
        Divider().color('#EEF1F3').margin({ top: 3 })
      }
    }
    .width('100%')
  }
}

@Component
struct StationsPane {
  @Prop stations: Array<Station>;
  @Prop devices: Array<Device>;
  @Prop alarmActuators: Array<Device>;
  @Prop alarmActuatorOnline: boolean | null;
  @Prop deviceStates: Array<DeviceState>;
  @Prop mapLocations: Array<AlertMapLocation>;
  @Prop mapLoading: boolean;
  @Prop selectedStationId: string;
  @Prop freshness: string;
  @Prop offline: boolean;
  @Prop refreshing: boolean;
  onSelectStation: (id: string) => void = () => {};
  onSelectDevice: (device: Device) => void = () => {};
  onRefreshMap: () => void = () => {};
  onRefresh: () => void = () => {};

  private selectedStation(): Station | null {
    for (let index = 0; index < this.stations.length; index++) {
      if (this.stations[index].stationId === this.selectedStationId) return this.stations[index];
    }
    return null;
  }

  private monitoringDevices(): Array<Device> {
    const devices: Array<Device> = [];
    for (let index = 0; index < this.devices.length; index++) {
      if (!isAlarmActuatorDevice(this.devices[index])) devices.push(this.devices[index]);
    }
    return devices;
  }

  private linkageDevices(): Array<Device> {
    const devices: Array<Device> = [];
    for (let index = 0; index < this.devices.length; index++) {
      if (isAlarmActuatorDevice(this.devices[index])) devices.push(this.devices[index]);
    }
    for (let index = 0; index < this.alarmActuators.length; index++) {
      let exists = false;
      for (let current = 0; current < devices.length; current++) {
        if (devices[current].deviceId === this.alarmActuators[index].deviceId) exists = true;
      }
      if (!exists) devices.push(this.alarmActuators[index]);
    }
    return devices;
  }

  private onlineDeviceCount(devices: Array<Device>): number {
    let count = 0;
    for (let index = 0; index < devices.length; index++) {
      if (this.deviceIsOnline(devices[index])) count += 1;
    }
    return count;
  }

  private stationDeviceSummary(): string {
    const monitoring = this.monitoringDevices();
    const linkage = this.linkageDevices();
    const base = `${monitoring.length} 个监测节点 · ${this.onlineDeviceCount(monitoring)} 个在线`;
    return linkage.length > 0 ? `${base} · ${linkage.length} 台联动设备` : base;
  }

  private stateForDevice(deviceId: string): DeviceState | null {
    for (let index = 0; index < this.deviceStates.length; index++) {
      if (this.deviceStates[index].deviceId === deviceId) return this.deviceStates[index];
    }
    return null;
  }

  private deviceUpdatedAt(device: Device): string | undefined {
    return this.stateForDevice(device.deviceId)?.updatedAt ?? device.lastSeenAt;
  }

  private deviceIsOnline(device: Device): boolean {
    if (isAlarmActuatorDevice(device)) {
      return this.alarmActuatorOnline ?? isOnlineStatus(device.status);
    }
    return isDeviceOnline(device, this.deviceUpdatedAt(device));
  }

  private deviceStatus(device: Device): string {
    if (isAlarmActuatorDevice(device)) {
      if (this.alarmActuatorOnline === null) return '检测中';
      return this.alarmActuatorOnline ? '在线' : '离线';
    }
    return deviceConnectivityLabel(device, this.deviceUpdatedAt(device));
  }

  private linkageStatusDetail(): string {
    if (this.alarmActuatorOnline === null) return '正在检测现场声光链路';
    return this.alarmActuatorOnline ? '现场声光链路正常' : '现场声光链路中断';
  }

  private selectedStationName(): string {
    const station = this.selectedStation();
    return station ? stationDisplayName(station) : '当前监测站';
  }

  private mapFocus(): AlertMapLocation | null {
    for (let deviceIndex = 0; deviceIndex < this.devices.length; deviceIndex++) {
      if (isAlarmActuatorDevice(this.devices[deviceIndex])) continue;
      for (let locationIndex = 0; locationIndex < this.mapLocations.length; locationIndex++) {
        if (this.mapLocations[locationIndex].deviceId === this.devices[deviceIndex].deviceId) {
          return this.mapLocations[locationIndex];
        }
      }
    }
    return this.mapLocations.length > 0 ? this.mapLocations[0] : null;
  }

  private mapStatusText(): string {
    if (this.mapLoading) return this.mapLocations.length > 0 ? '正在更新节点位置' : '正在获取节点位置';
    if (this.mapLocations.length === 0) return '暂无可显示的位置';
    let liveCount = 0;
    let retainedCount = 0;
    for (let index = 0; index < this.mapLocations.length; index++) {
      if (this.mapLocations[index].source === 'gps-live') liveCount += 1;
      if (this.mapLocations[index].source === 'gps-last') retainedCount += 1;
    }
    const detail = liveCount > 0 ? ` · ${liveCount} 个实时 GPS` : retainedCount > 0 ? ` · ${retainedCount} 个最后位置` : '';
    return `${this.mapLocations.length} 个监测节点${detail}`;
  }

  build() {
    Column() {
      PageHeader({
        title: '监测站点',
        subtitle: `共 ${this.stations.length} 个站点 · ${this.freshness}`,
        offline: this.offline,
        refreshing: this.refreshing,
        onRefresh: () => this.onRefresh()
      });
      Scroll() {
        Column({ space: 12 }) {
          StatusBanner({
            text: this.refreshing
              ? `正在同步 · 保留当前 ${this.monitoringDevices().length} 个节点数据`
              : this.offline
              ? `离线缓存 · ${this.freshness}`
              : `实时数据 · ${this.onlineDeviceCount(this.monitoringDevices())} / ${this.monitoringDevices().length} 个监测节点在线 · ${this.freshness}`,
            tone: this.refreshing ? UI_COLOR_ACCENT : this.offline ? UI_COLOR_DANGER : UI_COLOR_SUCCESS
          });
          Column({ space: 10 }) {
            Row() {
              Column({ space: 3 }) {
                Text('站点分布')
                  .fontSize(16)
                  .fontWeight(FontWeight.Bold)
                  .fontColor(UI_COLOR_TEXT)
                Text(this.mapStatusText())
                  .fontSize(11)
                  .fontColor(UI_COLOR_MUTED)
              }
              .alignItems(HorizontalAlign.Start)
              .layoutWeight(1)
              if (this.mapLoading) {
                LoadingProgress()
                  .width(20)
                  .height(20)
                  .color(UI_COLOR_ACCENT)
              }
            }
            .width('100%')

            if (this.mapFocus()) {
              AlertMapView({
                location: this.mapFocus() as AlertMapLocation,
                locations: this.mapLocations,
                highlightAlert: false,
                userLocation: null,
                evacuationTarget: null,
                refreshAccessibilityText: '刷新站点分布与地图',
                onRelocate: () => this.onRefreshMap()
              })
                .width('100%')
                .height(238)
                .borderRadius(8)
                .clip(true)
            } else {
              Column({ space: 8 }) {
                SymbolGlyph($r('sys.symbol.map'))
                  .fontSize(28)
                  .fontColor([UI_COLOR_SUBTLE])
                Text(this.mapLoading ? '正在准备站点地图' : '节点位置可用后将在这里显示')
                  .fontSize(12)
                  .fontColor(UI_COLOR_MUTED)
              }
              .width('100%')
              .height(150)
              .justifyContent(FlexAlign.Center)
              .backgroundColor('#EEF2F0')
              .borderRadius(8)
            }
          }
          .width('100%')
          Text('选择站点')
            .fontSize(13)
            .fontWeight(FontWeight.Medium)
            .fontColor('#52606D')
            .width('100%')
          ForEach(this.stations, (station: Station) => {
            Row({ space: 12 }) {
              Circle({ width: 10, height: 10 })
                .fill(isOnlineStatus(station.status) ? '#3C9D82' : '#B44832')
              Column({ space: 4 }) {
                Text(stationDisplayName(station))
                  .fontSize(16)
                  .fontWeight(FontWeight.Medium)
                  .fontColor('#18212B')
                  .maxLines(1)
                  .textOverflow({ overflow: TextOverflow.Ellipsis })
                Text(`${station.stationCode ?? '未设置编号'} · ${station.regionCode ?? '未配置区域'}`)
                  .fontSize(11)
                  .fontColor('#6C7782')
              }
              .alignItems(HorizontalAlign.Start)
              .layoutWeight(1)
              Text(stationStatusLabel(station.status))
                .fontSize(11)
                .fontColor(isOnlineStatus(station.status) ? '#287C67' : '#B44832')
            }
            .padding({ left: 14, right: 14, top: 13, bottom: 13 })
            .backgroundColor(this.selectedStationId === station.stationId ? '#FFF1EA' : '#FFFFFF')
            .borderRadius(8)
            .width('100%')
            .onClick(() => this.onSelectStation(station.stationId))
          }, (station: Station) => station.stationId)
          if (this.selectedStationId.length > 0) {
            Divider().color('#E3E8EB').margin({ top: 4, bottom: 2 })
            Row() {
              Column({ space: 3 }) {
                Text(this.selectedStationName())
                  .fontSize(17)
                  .fontWeight(FontWeight.Bold)
                  .fontColor('#18212B')
                Text(this.stationDeviceSummary())
                  .fontSize(12)
                  .fontColor('#6C7782')
              }
              .alignItems(HorizontalAlign.Start)
              .layoutWeight(1)
              Text('设备列表')
                .fontSize(12)
                .fontColor('#6C7782')
            }
            .width('100%')
            ForEach(this.monitoringDevices(), (device: Device) => {
              Column({ space: 10 }) {
                Row({ space: 12 }) {
                  Circle({ width: 10, height: 10 })
                    .fill(this.deviceIsOnline(device) ? '#3C9D82' : '#B44832')
                  Column({ space: 4 }) {
                    Text(deviceDisplayName(device))
                      .fontSize(15)
                      .fontWeight(FontWeight.Medium)
                      .fontColor('#18212B')
                    Text(`${deviceTypeLabel(device.deviceType)} · ${relativeTime(this.deviceUpdatedAt(device))}`)
                      .fontSize(11)
                      .fontColor('#6C7782')
                  }
                  .alignItems(HorizontalAlign.Start)
                  .layoutWeight(1)
                  Column({ space: 2 }) {
                    Text(this.deviceStatus(device))
                      .fontSize(11)
                      .fontColor(this.deviceIsOnline(device) ? '#287C67' : '#B44832')
                    Text('›')
                      .fontSize(22)
                      .fontColor('#8A949E')
                  }
                }
                if (this.stateForDevice(device.deviceId)) {
                  Divider().color('#EEF1F3')
                  Row() {
                    StationMetric({ label: 'X 倾角', value: displayMetric(metricValue(this.stateForDevice(device.deviceId), 'tilt_x_deg')), unit: '°' });
                    StationMetric({ label: 'Y 倾角', value: displayMetric(metricValue(this.stateForDevice(device.deviceId), 'tilt_y_deg')), unit: '°' });
                    StationMetric({ label: '土壤温度', value: displayMetric(soilTemperatureValue(this.stateForDevice(device.deviceId)), 1), unit: '°C' });
                    StationMetric({ label: '土壤湿度', value: displayMetric(soilMoistureValue(this.stateForDevice(device.deviceId)), 1), unit: '%' });
                  }
                  .width('100%')
                } else {
                  Text('正在获取节点实时数据…')
                    .fontSize(11)
                    .fontColor('#8A949E')
                    .width('100%')
                }
              }
              .padding({ left: 14, right: 12, top: 13, bottom: 13 })
              .backgroundColor('#FFFFFF')
              .borderRadius(8)
              .width('100%')
              .onClick(() => this.onSelectDevice(device))
            }, (device: Device) => device.deviceId)
            if (this.monitoringDevices().length === 0) {
              Text('该站点暂无监测节点')
                .fontSize(13)
                .fontColor('#6C7782')
            }
            if (this.linkageDevices().length > 0) {
              Text('联动告警设备')
                .fontSize(13)
                .fontWeight(FontWeight.Medium)
                .fontColor('#52606D')
                .width('100%')
                .margin({ top: 6 })
              ForEach(this.linkageDevices(), (device: Device) => {
                Row({ space: 12 }) {
                  Stack({ alignContent: Alignment.Center }) {
                    Circle({ width: 36, height: 36 })
                      .fill(this.deviceIsOnline(device) ? '#EAF5F1' : '#F8E9E5')
                    SymbolGlyph($r('sys.symbol.bell'))
                      .fontSize(18)
                      .fontColor([this.deviceIsOnline(device) ? UI_COLOR_SUCCESS : UI_COLOR_DANGER])
                  }
                  .width(36)
                  .height(36)
                  Column({ space: 4 }) {
                    Text(deviceDisplayName(device))
                      .fontSize(15)
                      .fontWeight(FontWeight.Medium)
                      .fontColor(UI_COLOR_TEXT)
                      .maxLines(1)
                      .textOverflow({ overflow: TextOverflow.Ellipsis })
                    Text(this.linkageStatusDetail())
                      .fontSize(11)
                      .fontColor(UI_COLOR_MUTED)
                  }
                  .alignItems(HorizontalAlign.Start)
                  .layoutWeight(1)
                  Text(this.deviceStatus(device))
                    .fontSize(11)
                    .fontWeight(FontWeight.Medium)
                    .fontColor(this.deviceIsOnline(device) ? '#287C67' : UI_COLOR_DANGER)
                }
                .padding({ left: 14, right: 14, top: 13, bottom: 13 })
                .backgroundColor(UI_COLOR_SURFACE)
                .borderRadius(8)
                .width('100%')
              }, (device: Device) => device.deviceId)
            }
          }
          if (this.stations.length === 0) {
            Text('暂无站点数据')
              .fontSize(13)
              .fontColor('#6C7782')
          }
        }
        .padding({ left: 16, right: 16, bottom: 24 })
        .width('100%')
      }
      .layoutWeight(1)
      .scrollBar(BarState.Off)
      .align(Alignment.TopStart)
    }
    .layoutWeight(1)
  }
}

@Component
struct StationMetric {
  @Prop label: string;
  @Prop value: string;
  @Prop unit: string;

  build() {
    Column({ space: 3 }) {
      Text(this.label)
        .fontSize(10)
        .fontColor('#6C7782')
      Text(`${this.value}${this.unit}`)
        .fontSize(13)
        .fontWeight(FontWeight.Medium)
        .fontColor('#18212B')
        .maxLines(1)
    }
    .alignItems(HorizontalAlign.Start)
    .layoutWeight(1)
  }
}

@Component
struct CurrentMetricsPane {
  @Prop state: DeviceState | null;
  @Prop conductivity: number | null;
  @Prop showConductivity: boolean;

  build() {
    Column({ space: 12 }) {
      Row() {
        Text('当前监测值')
          .fontSize(15)
          .fontWeight(FontWeight.Bold)
          .fontColor('#18212B')
        Blank().layoutWeight(1)
        Text(relativeTime(this.state?.updatedAt))
          .fontSize(11)
          .fontColor('#6C7782')
      }
      Row() {
        DetailMetric({ label: 'X 轴倾角', value: displayMetric(metricValue(this.state, 'tilt_x_deg')), unit: '°' });
        DetailMetric({ label: 'Y 轴倾角', value: displayMetric(metricValue(this.state, 'tilt_y_deg')), unit: '°' });
      }
      Divider().color('#EEF1F3')
      Row() {
        DetailMetric({ label: '土壤温度', value: displayMetric(soilTemperatureValue(this.state), 1), unit: '°C' });
        DetailMetric({ label: '土壤湿度', value: displayMetric(soilMoistureValue(this.state), 1), unit: '%' });
      }
      if (this.showConductivity) {
        Divider().color('#EEF1F3')
        Row() {
          DetailMetric({ label: '土壤电导率', value: displayMetric(this.conductivity, 0), unit: 'μS/cm' });
        }
      }
    }
    .padding(14)
    .backgroundColor('#FFFFFF')
    .borderRadius(8)
    .width('100%')
  }
}

@Component
struct DetailMetric {
  @Prop label: string;
  @Prop value: string;
  @Prop unit: string;

  build() {
    Column({ space: 4 }) {
      Text(this.label)
        .fontSize(11)
        .fontColor('#6C7782')
      Text(`${this.value}${this.unit}`)
        .fontSize(22)
        .fontWeight(FontWeight.Bold)
        .fontColor('#18212B')
        .maxLines(1)
    }
    .alignItems(HorizontalAlign.Start)
    .layoutWeight(1)
  }
}

@Component
struct DevicePane {
  @Prop device: Device | null;
  @Prop state: DeviceState | null;
  @Prop series: SeriesResponse | null;
  @Prop freshness: string;
  @Prop offline: boolean;
  @Prop refreshing: boolean;
  onRefresh: () => void = () => {};
  onBack: () => void = () => {};
  @State private selectedMetricKey: string = 'tilt_x_deg';

  private metricOptions(): Array<DeviceMetricOption> {
    const options: Array<DeviceMetricOption> = [
      { sensorKey: 'tilt_x_deg', label: 'X 倾角' },
      { sensorKey: 'tilt_y_deg', label: 'Y 倾角' },
      { sensorKey: 'soil_temperature_c', label: '土壤温度' },
      { sensorKey: 'soil_moisture_pct', label: '土壤湿度' }
    ];
    if (deviceSupportsConductivity(this.device)) {
      options.push({ sensorKey: 'electrical_conductivity_us_cm', label: '电导率' });
    }
    return options;
  }

  private metricFor(sensorKey: string): MetricSeries | null {
    if (sensorKey === 'electrical_conductivity_us_cm' &&
      !deviceSupportsConductivity(this.device)) return null;
    const metrics = this.series?.series ?? [];
    for (let index = 0; index < metrics.length; index++) {
      if (metrics[index].sensorKey === sensorKey) return metrics[index];
    }
    return null;
  }

  private activeMetric(): MetricSeries | null {
    const selected = this.metricFor(this.selectedMetricKey);
    if (selected) return selected;
    const metrics = this.series?.series ?? [];
    return metrics.length > 0 ? metrics[0] : null;
  }

  private activeMetricKey(): string {
    return this.activeMetric()?.sensorKey ?? this.selectedMetricKey;
  }

  private activeMetrics(): Array<MetricSeries> {
    const metric = this.activeMetric();
    return metric ? [metric] : [];
  }

  private metricRenderKey(metric: MetricSeries): string {
    const latest = metric.points.length > 0 ? metric.points[metric.points.length - 1].ts : 'empty';
    return `${metric.sensorKey}-${latest}`;
  }

  private currentConductivity(): number | null {
    if (!deviceSupportsConductivity(this.device)) return null;
    const current = soilConductivityValue(this.state);
    if (current !== null) return current;
    const series = this.metricFor('electrical_conductivity_us_cm');
    if (!series || series.points.length === 0) return null;
    return series.points[series.points.length - 1].value;
  }

  build() {
    Column() {
      Row({ space: 12 }) {
        BackIconButton({ accessibilityLabel: '返回站点列表', onBack: () => this.onBack() })
        Column({ space: 3 }) {
          Text(this.device ? deviceDisplayName(this.device) : '设备详情')
            .fontSize(20)
            .fontWeight(FontWeight.Bold)
            .fontColor(UI_COLOR_TEXT)
            .maxLines(1)
            .textOverflow({ overflow: TextOverflow.Ellipsis })
          Text(stationNameLabel(this.device?.stationName))
            .fontSize(11)
            .fontColor(UI_COLOR_MUTED)
        }
        .alignItems(HorizontalAlign.Start)
        .layoutWeight(1)
        RefreshIconButton({ refreshing: this.refreshing, onRefresh: () => this.onRefresh() })
      }
      .height(60)
      .padding({ left: UI_PAGE_PADDING, right: UI_PAGE_PADDING, top: 4, bottom: 8 })
      Scroll() {
        Column({ space: 12 }) {
          StatusBanner({
            text: this.refreshing
              ? '正在同步 · 当前监测值保持可见'
              : this.offline
              ? `离线缓存 · ${this.freshness}`
              : `实时数据 · ${this.device ? deviceConnectivityLabel(this.device, this.state?.updatedAt) : '状态未知'} · ${this.freshness}`,
            tone: this.refreshing ? UI_COLOR_ACCENT : this.offline ? UI_COLOR_DANGER : this.device && isDeviceOnline(this.device, this.state?.updatedAt) ? UI_COLOR_SUCCESS : UI_COLOR_DANGER
          });
          CurrentMetricsPane({
            state: this.state,
            conductivity: this.currentConductivity(),
            showConductivity: deviceSupportsConductivity(this.device)
          });
          Row() {
            Text('24 小时趋势')
              .fontSize(16)
              .fontWeight(FontWeight.Bold)
              .fontColor('#18212B')
            Blank().layoutWeight(1)
            Text('5 分钟均值')
              .fontSize(11)
              .fontColor('#6C7782')
          }
          .width('100%')
          Row({ space: 4 }) {
            ForEach(this.metricOptions(), (option: DeviceMetricOption) => {
              MetricSegment({
                label: option.label,
                active: this.activeMetricKey() === option.sensorKey,
                available: this.metricFor(option.sensorKey) !== null,
                onTap: () => this.selectedMetricKey = option.sensorKey
              });
            }, (option: DeviceMetricOption) => option.sensorKey)
          }
          .width('100%')
          ForEach(this.activeMetrics(), (metric: MetricSeries) => {
            SeriesTrendCard({ metric: metric });
          }, (metric: MetricSeries) => this.metricRenderKey(metric))
          if (this.activeMetrics().length === 0) {
            Column({ space: 6 }) {
              Text('暂无历史趋势')
                .fontSize(14)
                .fontWeight(FontWeight.Medium)
                .fontColor('#18212B')
              Text('当前值仍会每 10 秒更新')
                .fontSize(11)
                .fontColor('#6C7782')
            }
            .alignItems(HorizontalAlign.Start)
            .padding(14)
            .backgroundColor('#FFFFFF')
            .borderRadius(8)
            .width('100%')
          }
        }
        .padding({ left: 16, right: 16, bottom: 24 })
      }
      .layoutWeight(1)
      .scrollBar(BarState.Off)
      .align(Alignment.TopStart)
    }
    .layoutWeight(1)
  }
}

interface DeviceMetricOption {
  sensorKey: string;
  label: string;
}

@Component
struct MetricSegment {
  @Prop label: string;
  @Prop active: boolean;
  @Prop available: boolean;
  onTap: () => void = () => {};

  build() {
    Text(this.label)
      .fontSize(11)
      .fontWeight(this.active ? FontWeight.Bold : FontWeight.Medium)
      .fontColor(this.active ? '#FFFFFF' : this.available ? '#52606D' : '#AAB2B9')
      .textAlign(TextAlign.Center)
      .maxLines(1)
      .height(34)
      .layoutWeight(1)
      .backgroundColor(this.active ? '#18212B' : '#E9EDF0')
      .borderRadius(6)
      .enabled(this.available)
      .onClick(() => {
        if (this.available) this.onTap();
      })
  }
}

@Component
struct SeriesTrendCard {
  @Prop metric: MetricSeries;

  private points(): Array<SeriesPoint> {
    return this.metric.points;
  }

  private digits(): number {
    if (this.metric.sensorKey === 'electrical_conductivity_us_cm') return 0;
    return this.metric.sensorKey === 'soil_temperature_c' || this.metric.sensorKey === 'soil_moisture_pct' ? 1 : 2;
  }

  private formatted(value: number): string {
    return value.toFixed(this.digits());
  }

  private unit(): string {
    const configured = metricUnitLabel(this.metric.unit);
    if (configured.length > 0) return configured === 'C' ? '°C' : configured;
    if (this.metric.sensorKey.startsWith('tilt_')) return '°';
    if (this.metric.sensorKey === 'soil_temperature_c') return '°C';
    if (this.metric.sensorKey === 'soil_moisture_pct') return '%';
    if (this.metric.sensorKey === 'electrical_conductivity_us_cm') return 'μS/cm';
    return '';
  }

  private latestValue(): string {
    if (this.metric.points.length === 0) return '--';
    const latest = this.metric.points[this.metric.points.length - 1];
    return this.formatted(latest.value);
  }

  private minimum(): number {
    const points = this.points();
    if (points.length === 0) return 0;
    let value = points[0].value;
    for (let index = 1; index < points.length; index++) value = Math.min(value, points[index].value);
    return value;
  }

  private maximum(): number {
    const points = this.points();
    if (points.length === 0) return 0;
    let value = points[0].value;
    for (let index = 1; index < points.length; index++) value = Math.max(value, points[index].value);
    return value;
  }

  private change(): number {
    const points = this.points();
    if (points.length < 2) return 0;
    return points[points.length - 1].value - points[0].value;
  }

  private changeText(): string {
    const value = this.change();
    const sign = value > 0 ? '+' : '';
    return `${sign}${this.formatted(value)}${this.unit()}`;
  }

  private accent(): string {
    switch (this.metric.sensorKey) {
      case 'tilt_y_deg': return '#477B96';
      case 'soil_temperature_c': return '#B96B38';
      case 'soil_moisture_pct': return '#3C9D82';
      case 'electrical_conductivity_us_cm': return '#8B6D2E';
      default: return '#E46D35';
    }
  }

  private fillColor(): string {
    switch (this.metric.sensorKey) {
      case 'tilt_y_deg': return 'rgba(71,123,150,0.10)';
      case 'soil_temperature_c': return 'rgba(185,107,56,0.10)';
      case 'soil_moisture_pct': return 'rgba(60,157,130,0.10)';
      case 'electrical_conductivity_us_cm': return 'rgba(139,109,46,0.10)';
      default: return 'rgba(228,109,53,0.10)';
    }
  }

  private startTime(): string {
    const points = this.points();
    return points.length > 0 ? shortTime(points[0].ts) : '--';
  }

  private endTime(): string {
    const points = this.points();
    return points.length > 0 ? shortTime(points[points.length - 1].ts) : '--';
  }

  build() {
    Column({ space: 10 }) {
      Row() {
        Column({ space: 2 }) {
          Text(metricShortLabel(this.metric.sensorKey))
            .fontSize(15)
            .fontWeight(FontWeight.Bold)
            .fontColor('#18212B')
          Text(`${this.metric.points.length} 个数据点 · ${this.startTime()} 至 ${this.endTime()}`)
            .fontSize(11)
            .fontColor('#6C7782')
        }
        .alignItems(HorizontalAlign.Start)
        Blank().layoutWeight(1)
        Text(`${this.latestValue()}${this.unit()}`)
          .fontSize(25)
          .fontWeight(FontWeight.Bold)
          .fontColor(this.accent())
      }
      Row() {
        TrendStat({ label: '最低', value: `${this.formatted(this.minimum())}${this.unit()}` });
        TrendStat({ label: '最高', value: `${this.formatted(this.maximum())}${this.unit()}` });
        TrendStat({ label: '区间变化', value: this.changeText() });
      }
      .width('100%')
      TrendLineChart({ metric: this.metric, accent: this.accent(), fillColor: this.fillColor() });
      Row() {
        Text(this.startTime())
          .fontSize(10)
          .fontColor(UI_COLOR_SUBTLE)
        Blank().layoutWeight(1)
        Text(this.endTime())
          .fontSize(10)
          .fontColor(UI_COLOR_SUBTLE)
      }
      .width('100%')
    }
    .padding(14)
    .backgroundColor('#FFFFFF')
    .borderRadius(8)
    .width('100%')
  }
}

@Component
struct TrendStat {
  @Prop label: string;
  @Prop value: string;

  build() {
    Column({ space: 2 }) {
      Text(this.label)
        .fontSize(10)
        .fontColor('#8A949E')
      Text(this.value)
        .fontSize(12)
        .fontWeight(FontWeight.Medium)
        .fontColor('#52606D')
        .maxLines(1)
    }
    .alignItems(HorizontalAlign.Start)
    .layoutWeight(1)
  }
}

@Component
struct TrendLineChart {
  @Prop metric: MetricSeries;
  @Prop accent: string;
  @Prop fillColor: string;
  @Prop chartHeight: number = 92;
  @Prop showGrid: boolean = true;
  private settings: RenderingContextSettings = new RenderingContextSettings(true);
  private context: CanvasRenderingContext2D = new CanvasRenderingContext2D(this.settings);
  private chartWidth: number = 320;

  private points(): Array<SeriesPoint> {
    const source = this.metric.points;
    if (source.length <= 96) return source;
    const sampled: Array<SeriesPoint> = [];
    const step = (source.length - 1) / 95;
    for (let index = 0; index < 96; index++) {
      sampled.push(source[Math.round(index * step)]);
    }
    return sampled;
  }

  private drawChart(): void {
    const width = this.chartWidth;
    const height = this.chartHeight;
    const points = this.points();
    this.context.clearRect(0, 0, width, height);

    const plotTop = 6;
    const plotBottom = height - 6;
    if (this.showGrid) {
      this.context.strokeStyle = '#E5EAED';
      this.context.lineWidth = 1;
      for (let index = 0; index < 3; index++) {
        const y = plotTop + index * (plotBottom - plotTop) / 2;
        this.context.beginPath();
        this.context.moveTo(0, y);
        this.context.lineTo(width, y);
        this.context.stroke();
      }
    }
    if (points.length === 0) return;

    let minimum = points[0].value;
    let maximum = points[0].value;
    for (let index = 1; index < points.length; index++) {
      minimum = Math.min(minimum, points[index].value);
      maximum = Math.max(maximum, points[index].value);
    }
    if (Math.abs(maximum - minimum) < 0.000001) {
      const padding = Math.max(1, Math.abs(maximum) * 0.05);
      minimum -= padding;
      maximum += padding;
    }

    const plotHeight = plotBottom - plotTop;
    const xStep = points.length > 1 ? width / (points.length - 1) : 0;
    const yFor = (value: number): number => plotBottom - (value - minimum) / (maximum - minimum) * plotHeight;

    if (points.length === 1) {
      this.context.beginPath();
      this.context.arc(width / 2, yFor(points[0].value), 4, 0, Math.PI * 2);
      this.context.fillStyle = '#FFFFFF';
      this.context.fill();
      this.context.strokeStyle = this.accent;
      this.context.lineWidth = 2;
      this.context.stroke();
      return;
    }

    this.context.beginPath();
    this.context.moveTo(0, plotBottom);
    for (let index = 0; index < points.length; index++) {
      this.context.lineTo(index * xStep, yFor(points[index].value));
    }
    this.context.lineTo((points.length - 1) * xStep, plotBottom);
    this.context.closePath();
    this.context.fillStyle = this.fillColor;
    this.context.fill();

    this.context.beginPath();
    for (let index = 0; index < points.length; index++) {
      const x = index * xStep;
      const y = yFor(points[index].value);
      if (index === 0) this.context.moveTo(x, y);
      else this.context.lineTo(x, y);
    }
    this.context.strokeStyle = this.accent;
    this.context.lineWidth = 2.5;
    this.context.stroke();

    const lastX = (points.length - 1) * xStep;
    const lastY = yFor(points[points.length - 1].value);
    this.context.beginPath();
    this.context.arc(lastX, lastY, 4, 0, Math.PI * 2);
    this.context.fillStyle = '#FFFFFF';
    this.context.fill();
    this.context.strokeStyle = this.accent;
    this.context.lineWidth = 2;
    this.context.stroke();
  }

  build() {
    Canvas(this.context)
      .width('100%')
      .height(this.chartHeight)
      .onReady(() => this.drawChart())
      .onAreaChange((oldValue: Area, newValue: Area) => {
        if (typeof newValue.width === 'number' && newValue.width > 0) {
          this.chartWidth = newValue.width;
          this.drawChart();
        }
      })
  }
}

@Component
struct AlertsPane {
  @Prop alerts: Array<Alert>;
  @Prop selectedAlert: Alert | null;
  @Prop events: Array<AlertEvent>;
  @Prop loadingEvents: boolean;
  @Prop freshness: string;
  @Prop offline: boolean;
  @Prop refreshing: boolean;
  onSelect: (alert: Alert) => void = () => {};
  onOpenMap: (alert: Alert | null) => void = () => {};
  onRefresh: () => void = () => {};

  build() {
    Column() {
      PageHeader({
        title: '当前告警',
        subtitle: `${this.alerts.length} 条待处理 · ${this.freshness}`,
        offline: this.offline,
        refreshing: this.refreshing,
        onRefresh: () => this.onRefresh()
      });
      Scroll() {
        Column({ space: 10 }) {
          ForEach(this.alerts, (alert: Alert) => {
            Column({ space: 10 }) {
              Row() {
                Column({ space: 4 }) {
                  Text(alert.title)
                    .fontSize(14)
                    .fontWeight(FontWeight.Medium)
                    .fontColor('#18212B')
                    .maxLines(2)
                  Text(`${alertStatusLabel(alert.status)} · ${relativeTime(alert.lastEventAt)}`)
                    .fontSize(11)
                    .fontColor('#6C7782')
                }
                .alignItems(HorizontalAlign.Start)
                .layoutWeight(1)
                Text(severityLabel(alert.severity))
                  .fontSize(11)
                  .fontColor(alert.severity === 'critical' || alert.severity === 'high' ? '#B44832' : '#A76A2E')
              }
              Divider().color('#EEF1F3')
              Row({ space: 8 }) {
                SymbolGlyph($r('sys.symbol.dot_radiowaves_left_and_right'))
                  .fontSize(15)
                  .fontColor(['#B44832'])
                Text('告警位置')
                  .fontSize(11)
                  .fontColor('#6C7782')
                Blank().layoutWeight(1)
                Button('查看地图')
                  .height(34)
                  .fontSize(12)
                  .fontColor('#FFFFFF')
                  .backgroundColor('#18212B')
                  .borderRadius(6)
                  .onClick(() => this.onOpenMap(alert))
              }
            }
            .padding(14)
            .backgroundColor(this.selectedAlert?.alertId === alert.alertId ? '#FFF1EA' : '#FFFFFF')
            .borderRadius(8)
            .onClick(() => this.onSelect(alert))
          }, (alert: Alert) => alert.alertId)
          if (this.alerts.length === 0) {
            Column({ space: 8 }) {
              Stack({ alignContent: Alignment.Center }) {
                Circle({ width: 44, height: 44 })
                  .fill(this.offline ? '#F8E9E5' : this.refreshing ? '#FFF1EA' : '#EAF5F1')
                SymbolGlyph($r('sys.symbol.bell'))
                  .fontSize(21)
                  .fontColor([this.offline ? UI_COLOR_DANGER : this.refreshing ? UI_COLOR_ACCENT : UI_COLOR_SUCCESS])
              }
              .width(44)
              .height(44)
              Text(this.refreshing ? '正在检查告警状态' : this.offline ? '暂时无法获取告警' : '当前无活动告警')
                .fontSize(16)
                .fontWeight(FontWeight.Medium)
                .fontColor('#18212B')
              Text(this.offline ? `保留最近缓存 · ${this.freshness}` : this.refreshing ? '正在连接监测服务器' : '监测系统运行正常')
                .fontSize(12)
                .fontColor('#6C7782')
              Button() {
                Row({ space: 7 }) {
                  SymbolGlyph($r('sys.symbol.dot_radiowaves_left_and_right'))
                    .fontSize(17)
                    .fontColor(['#FFFFFF'])
                  Text('地图预览')
                    .fontSize(13)
                    .fontWeight(FontWeight.Medium)
                    .fontColor('#FFFFFF')
                }
              }
              .height(42)
              .margin({ top: 8 })
              .padding({ left: 18, right: 18 })
              .backgroundColor('#18212B')
              .borderRadius(7)
              .onClick(() => this.onOpenMap(null))
            }
            .justifyContent(FlexAlign.Center)
            .padding({ top: 28, bottom: 28 })
            .backgroundColor('#FFFFFF')
            .borderRadius(8)
            .width('100%')
          }
          if (this.selectedAlert) {
            Row() {
              Text('事件记录')
                .fontSize(16)
                .fontWeight(FontWeight.Bold)
                .fontColor('#18212B')
              Blank().layoutWeight(1)
              Button('地图')
                .height(34)
                .fontSize(12)
                .fontColor('#18212B')
                .backgroundColor('#E9EDF0')
                .borderRadius(6)
                .onClick(() => this.onOpenMap(this.selectedAlert))
            }
            .width('100%')
            .margin({ top: 8 })
            if (this.loadingEvents) {
              Text('正在读取事件…')
                .fontSize(13)
                .fontColor('#6C7782')
            }
            ForEach(this.events, (event: AlertEvent) => {
              Column({ space: 4 }) {
                Text(eventTypeLabel(event.eventType))
                  .fontSize(13)
                  .fontColor('#18212B')
                Text(`${relativeTime(event.createdAt)} · ${severityLabel(event.severity ?? '')}`)
                  .fontSize(11)
                  .fontColor('#6C7782')
              }
              .padding(12)
              .backgroundColor('#FFFFFF')
              .borderRadius(8)
            }, (event: AlertEvent) => event.eventId)
          }
        }
        .padding({ left: 16, right: 16, bottom: 24 })
        .width('100%')
      }
      .layoutWeight(1)
      .scrollBar(BarState.Off)
      .align(Alignment.TopStart)
    }
    .layoutWeight(1)
  }
}

@Component
struct AlertMapPane {
  @Prop alert: Alert | null;
  @Prop location: AlertMapLocation | null;
  @Prop locations: Array<AlertMapLocation>;
  @Prop loading: boolean;
  @Prop active: boolean;
  @Prop userLocation: UserMapLocation | null;
  @Prop userLocationStatus: UserLocationStatus;
  onBack: () => void = () => {};
  onRetry: () => void = () => {};
  onRelocateUser: () => void = () => {};

  private sourceTone(): string {
    if (!this.alert) return UI_COLOR_SUCCESS;
    if (!this.location) return UI_COLOR_MUTED;
    if (this.location.source === 'alert') return UI_COLOR_DANGER;
    if (this.location.source === 'gps-live') return UI_COLOR_SUCCESS;
    if (this.location.source === 'default') return UI_COLOR_MAP_DEFAULT;
    return '#477B96';
  }

  private mapTitle(): string {
    return this.alert ? '告警地图' : '地图预览';
  }

  private alertTitle(): string {
    return this.alert?.title || '全部监测节点';
  }

  private sourceCount(source: string): number {
    let count = 0;
    for (let index = 0; index < this.locations.length; index++) {
      if (this.locations[index].source === source) count++;
    }
    return count;
  }

  private nodeSummary(): string {
    const live = this.sourceCount('gps-live');
    const last = this.sourceCount('gps-last');
    const registered = this.sourceCount('station');
    const fallback = this.sourceCount('default');
    const parts: Array<string> = [];
    if (live > 0) parts.push(`实时 ${live}`);
    if (last > 0) parts.push(`最后位置 ${last}`);
    if (registered > 0) parts.push(`站点坐标 ${registered}`);
    if (fallback > 0) parts.push(`默认位置 ${fallback}`);
    return parts.length > 0 ? parts.join(' · ') : '节点位置待确认';
  }

  private coordinateText(): string {
    if (!this.location) return '--';
    return `${this.location.latitude.toFixed(6)}, ${this.location.longitude.toFixed(6)}`;
  }

  private updatedText(): string {
    if (!this.location?.updatedAt) {
      return this.location?.source === 'default' ? '等待首次有效 GPS' : '坐标时间待确认';
    }
    return `坐标更新于 ${shortTime(this.location.updatedAt)}`;
  }

  private evidenceNumber(keys: Array<string>): number | null {
    for (let index = 0; index < keys.length; index++) {
      const value = numberValue(this.alert?.evidence?.[keys[index]]);
      if (value !== null) return value;
    }
    return null;
  }

  private evidenceText(keys: Array<string>): string {
    for (let index = 0; index < keys.length; index++) {
      const value = this.alert?.evidence?.[keys[index]];
      if (typeof value === 'string' && value.trim().length > 0) return value.trim();
    }
    return '';
  }

  private evacuationTarget(): EvacuationTarget | null {
    const latitude = this.evidenceNumber(['safeZoneLatitude', 'safe_zone_latitude']);
    const longitude = this.evidenceNumber(['safeZoneLongitude', 'safe_zone_longitude']);
    if (latitude === null || longitude === null || latitude < -90 || latitude > 90 ||
      longitude < -180 || longitude > 180) return null;
    const name = this.evidenceText(['safeZoneName', 'safe_zone_name']) || '安全集合点';
    const instruction = this.evidenceText(['evacuationInstruction', 'evacuation_instruction']);
    const target: EvacuationTarget = { latitude, longitude, name };
    if (instruction.length > 0) target.instruction = instruction;
    return target;
  }

  private distanceMeters(latitude: number, longitude: number): number | null {
    if (!this.userLocation) return null;
    const earthRadius = 6371000;
    const radians = Math.PI / 180;
    const deltaLatitude = (latitude - this.userLocation.latitude) * radians;
    const deltaLongitude = (longitude - this.userLocation.longitude) * radians;
    const sourceLatitude = this.userLocation.latitude * radians;
    const targetLatitude = latitude * radians;
    const haversine = Math.sin(deltaLatitude / 2) * Math.sin(deltaLatitude / 2) +
      Math.cos(sourceLatitude) * Math.cos(targetLatitude) *
      Math.sin(deltaLongitude / 2) * Math.sin(deltaLongitude / 2);
    return earthRadius * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
  }

  private formattedDistance(distance: number | null): string {
    if (distance === null) return '--';
    if (distance < 1000) return `${Math.max(1, Math.round(distance))} 米`;
    return `${(distance / 1000).toFixed(distance < 10000 ? 1 : 0)} 公里`;
  }

  private bearingLabel(latitude: number, longitude: number): string {
    if (!this.userLocation) return '--';
    const radians = Math.PI / 180;
    const sourceLatitude = this.userLocation.latitude * radians;
    const targetLatitude = latitude * radians;
    const deltaLongitude = (longitude - this.userLocation.longitude) * radians;
    const y = Math.sin(deltaLongitude) * Math.cos(targetLatitude);
    const x = Math.cos(sourceLatitude) * Math.sin(targetLatitude) -
      Math.sin(sourceLatitude) * Math.cos(targetLatitude) * Math.cos(deltaLongitude);
    const degrees = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
    const directions: Array<string> = ['北', '东北', '东', '东南', '南', '西南', '西', '西北'];
    return directions[Math.round(degrees / 45) % directions.length];
  }

  private userLocationText(): string {
    if (this.userLocationStatus === 'locating') return '正在获取手机定位';
    if (this.userLocationStatus === 'denied') return '未获得手机定位权限';
    if (this.userLocationStatus === 'unavailable') return '手机定位暂时不可用';
    if (this.userLocation) return `我的位置 · 精度约 ${Math.max(1, Math.round(this.userLocation.accuracy))} 米`;
    return '尚未获取手机定位';
  }

  private proximityText(): string {
    const target = this.evacuationTarget();
    if (target && this.userLocation) {
      return `${target.name}在${this.bearingLabel(target.latitude, target.longitude)}方向 · ${this.formattedDistance(this.distanceMeters(target.latitude, target.longitude))}`;
    }
    if (!this.location || this.location.source === 'default') return '告警位置待确认，暂不计算撤离距离';
    if (!this.userLocation) return '获取手机定位后显示与告警点的距离';
    return `距告警点 ${this.formattedDistance(this.distanceMeters(this.location.latitude, this.location.longitude))} · 告警点在${this.bearingLabel(this.location.latitude, this.location.longitude)}方向`;
  }

  private evacuationAdvice(): string {
    const target = this.evacuationTarget();
    if (target?.instruction) return target.instruction;
    if (target) return `快速离开危险区域，按核验路线前往${target.name}`;
    return '立即远离边坡与沟谷，按现场疏散标识前往安全区域';
  }

  build() {
    Column() {
      Row({ space: 12 }) {
        BackIconButton({ accessibilityLabel: '返回告警列表', onBack: () => this.onBack() })
        Column({ space: 3 }) {
          Text(this.mapTitle())
            .fontSize(20)
            .fontWeight(FontWeight.Bold)
            .fontColor(UI_COLOR_TEXT)
          Text(this.alert
            ? this.location ? alertLocationSourceLabel(this.location.source) : '正在解析位置'
            : `${this.locations.length} 个监测节点`)
            .fontSize(11)
            .fontColor(this.sourceTone())
        }
        .alignItems(HorizontalAlign.Start)
        .layoutWeight(1)
      }
      .height(60)
      .padding({ left: 16, right: 16, top: 4, bottom: 8 })
      .backgroundColor('#F5F7F8')
      .width('100%')

      if (this.loading) {
        Column({ space: 10 }) {
          LoadingProgress()
            .width(30)
            .height(30)
            .color(UI_COLOR_ACCENT)
          Text(this.alert ? '正在定位告警位置' : '正在读取节点位置')
            .fontSize(14)
            .fontWeight(FontWeight.Medium)
            .fontColor(UI_COLOR_TEXT)
        }
        .layoutWeight(1)
        .width('100%')
        .justifyContent(FlexAlign.Center)
      } else if (this.location) {
        Stack({ alignContent: Alignment.Bottom }) {
          if (this.active) {
            AlertMapView({
              location: this.location as AlertMapLocation,
              locations: this.locations,
              highlightAlert: this.alert !== null,
              userLocation: this.userLocation,
              evacuationTarget: this.evacuationTarget(),
              onRelocate: () => this.onRetry()
            })
          } else {
            Column()
              .width('100%')
              .height('100%')
              .backgroundColor('#EEF2F0')
          }

          Column({ space: 10 }) {
            Row() {
              Text(this.alert ? alertLocationSourceLabel(this.location.source) : '节点总览')
                .fontSize(11)
                .fontWeight(FontWeight.Medium)
                .fontColor(this.sourceTone())
                .padding({ left: 8, right: 8, top: 4, bottom: 4 })
                .backgroundColor(this.alert && this.location.source === 'default' ? '#FFF1EA' : '#EEF2F0')
                .borderRadius(4)
              Blank().layoutWeight(1)
              Text(this.alert ? severityLabel(this.alert.severity) : `共 ${this.locations.length} 个`)
                .fontSize(11)
                .fontWeight(FontWeight.Medium)
                .fontColor(this.alert ? UI_COLOR_DANGER : UI_COLOR_MAP_MUTED)
            }
            .width('100%')
            Text(this.alertTitle())
              .fontSize(18)
              .fontWeight(FontWeight.Bold)
              .fontColor(UI_COLOR_TEXT)
              .maxLines(2)
              .textOverflow({ overflow: TextOverflow.Ellipsis })
            Row({ space: 8 }) {
              Circle({ width: 8, height: 8 })
                .fill(this.sourceTone())
              Text(this.alert ? this.location.locationName : 'A / B / C 节点位置')
                .fontSize(13)
                .fontWeight(FontWeight.Medium)
                .fontColor('#52606D')
                .layoutWeight(1)
                .maxLines(1)
                .textOverflow({ overflow: TextOverflow.Ellipsis })
            }
            if (this.alert) {
              Column({ space: 8 }) {
                Row({ space: 8 }) {
                  Circle({ width: 8, height: 8 })
                    .fill(this.userLocation ? '#377BB1' : UI_COLOR_SUBTLE)
                  Text(this.userLocationText())
                    .fontSize(12)
                    .fontColor(this.userLocation ? '#285F89' : UI_COLOR_MAP_MUTED)
                    .layoutWeight(1)
                  if (this.userLocationStatus !== 'locating') {
                    Button({ type: ButtonType.Circle }) {
                      SymbolGlyph($r('sys.symbol.arrow_clockwise'))
                        .fontSize(15)
                        .fontColor(['#285F89'])
                    }
                    .width(30)
                    .height(30)
                    .backgroundColor('#EAF3F8')
                    .accessibilityText('重新获取手机定位')
                    .onClick(() => this.onRelocateUser())
                  }
                }
                .width('100%')
                .alignItems(VerticalAlign.Center)

                Text(this.proximityText())
                  .width('100%')
                  .fontSize(14)
                  .fontWeight(FontWeight.Bold)
                  .fontColor(this.location.source === 'default' ? UI_COLOR_MAP_DEFAULT : UI_COLOR_TEXT)

                Row({ space: 9 }) {
                  SymbolGlyph($r('sys.symbol.exclamationmark_triangle'))
                    .fontSize(17)
                    .fontColor([UI_COLOR_DANGER])
                  Text(this.evacuationAdvice())
                    .fontSize(13)
                    .fontWeight(FontWeight.Medium)
                    .fontColor('#7E2E21')
                    .lineHeight(19)
                    .layoutWeight(1)
                    .maxLines(3)
                }
                .width('100%')
                .padding({ left: 12, right: 12, top: 10, bottom: 10 })
                .backgroundColor('#F9ECE8')
                .borderRadius(6)

                Text(`${this.coordinateText()} · ${this.updatedText()}`)
                  .fontSize(10)
                  .fontColor(UI_COLOR_MAP_MUTED)
                  .maxLines(1)
                  .textOverflow({ overflow: TextOverflow.Ellipsis })
              }
              .width('100%')
            } else {
              Text(this.nodeSummary())
                .fontSize(13)
                .fontColor(UI_COLOR_MAP_MUTED)
            }
          }
          .width('100%')
          .padding({ left: 18, right: 18, top: 14, bottom: 18 })
          .backgroundColor('#FAFCFB')
          .borderRadius({ topLeft: 8, topRight: 8 })
          .shadow({ radius: 14, color: '#26000000', offsetY: -3 })
        }
        .layoutWeight(1)
        .width('100%')
      } else {
        Column({ space: 10 }) {
          SymbolGlyph($r('sys.symbol.dot_radiowaves_left_and_right'))
            .fontSize(28)
            .fontColor([UI_COLOR_DANGER])
          Text('位置解析失败')
            .fontSize(16)
            .fontWeight(FontWeight.Medium)
            .fontColor(UI_COLOR_TEXT)
          Button('重新定位')
            .height(44)
            .fontSize(13)
            .fontColor('#FFFFFF')
            .backgroundColor(UI_COLOR_TEXT)
            .borderRadius(7)
            .onClick(() => this.onRetry())
        }
        .layoutWeight(1)
        .width('100%')
        .justifyContent(FlexAlign.Center)
      }
    }
    .layoutWeight(1)
    .width('100%')
    .backgroundColor('#F5F7F8')
  }
}


@Component
struct SettingsPane {
  @Prop userName: string;
  @Prop apiBaseUrl: string;
  @Prop connectionState: string;
  @Prop connectionUpdatedAt: string;
  onSave: (value: string) => void = () => {};
  onClearCache: () => void = () => {};
  onLogout: () => void = () => {};
  @State private draftUrl: string = '';
  @State private editingServer: boolean = false;
  @State private cacheStatus: string = '保留最近一次总览、站点与设备快照';

  aboutToAppear(): void {
    this.draftUrl = this.apiBaseUrl;
  }

  private connectionTone(): string {
    if (this.connectionState === 'success') return '#3C9D82';
    if (this.connectionState === 'failure') return '#B44832';
    return '#8A949E';
  }

  private connectionText(): string {
    if (this.connectionState === 'success') return `最近请求成功 · ${this.connectionUpdatedAt}`;
    if (this.connectionState === 'failure') return `最近请求失败 · ${this.connectionUpdatedAt}`;
    return '尚未验证服务器连接';
  }

  private clearCache(): void {
    this.onClearCache();
    this.cacheStatus = '本地缓存已清理';
  }

  build() {
    Column() {
      if (this.editingServer) {
        Row({ space: 10 }) {
          BackIconButton({ accessibilityLabel: '返回我的', onBack: () => this.editingServer = false })
          Column({ space: 3 }) {
            Text('服务器连接')
              .fontSize(20)
              .fontWeight(FontWeight.Bold)
              .fontColor(UI_COLOR_TEXT)
            Text('修改后需要重新登录')
              .fontSize(11)
              .fontColor(UI_COLOR_MUTED)
          }
          .alignItems(HorizontalAlign.Start)
        }
        .padding({ left: 8, right: 16, top: 6, bottom: 10 })
        .width('100%')

        Scroll() {
          Column({ space: 16 }) {
            Row({ space: 9 }) {
              Circle({ width: 9, height: 9 }).fill(this.connectionTone())
              Text(this.connectionText())
                .fontSize(12)
                .fontColor(this.connectionState === 'failure' ? UI_COLOR_DANGER : UI_COLOR_MUTED)
                .layoutWeight(1)
            }
            .width('100%')
            .padding(14)
            .backgroundColor(UI_COLOR_SURFACE)
            .borderRadius(8)

            Column({ space: 10 }) {
              Text('服务器 API 地址')
                .fontSize(13)
                .fontWeight(FontWeight.Medium)
                .fontColor(UI_COLOR_TEXT)
              TextInput({ text: this.draftUrl, placeholder: 'http://host:port/api/v1' })
                .onChange((value: string) => this.draftUrl = value)
                .height(48)
                .fontSize(14)
                .backgroundColor('#F2F5F4')
                .border({ width: 1, color: UI_COLOR_LOGIN_BORDER })
                .borderRadius(8)
              Text('地址需要包含 /api/v1')
                .fontSize(11)
                .fontColor(UI_COLOR_MUTED)
            }
            .alignItems(HorizontalAlign.Start)
            .width('100%')

            Button('保存服务器设置')
              .enabled(this.draftUrl.trim().length > 0)
              .width('100%')
              .height(48)
              .fontColor(UI_COLOR_SURFACE)
              .backgroundColor(UI_COLOR_TEXT)
              .borderRadius(8)
              .onClick(() => {
                this.onSave(this.draftUrl);
                this.editingServer = false;
              })
          }
          .padding({ left: 16, right: 16, bottom: 24 })
          .width('100%')
        }
        .layoutWeight(1)
        .scrollBar(BarState.Off)
      } else {
        Column({ space: 3 }) {
          Text('我的')
            .fontSize(22)
            .fontWeight(FontWeight.Bold)
            .fontColor(UI_COLOR_TEXT)
          Text('账号、安全与数据')
            .fontSize(11)
            .fontColor(UI_COLOR_MUTED)
        }
        .alignItems(HorizontalAlign.Start)
        .padding({ left: 16, right: 16, top: 8, bottom: 12 })
        .width('100%')

        Scroll() {
          Column({ space: 14 }) {
            Row({ space: 12 }) {
              Text(this.userName.slice(0, 1))
                .fontSize(18)
                .fontWeight(FontWeight.Bold)
                .fontColor(UI_COLOR_SURFACE)
                .textAlign(TextAlign.Center)
                .width(44)
                .height(44)
                .backgroundColor('#477B96')
                .borderRadius(22)
              Column({ space: 3 }) {
                Text(this.userName)
                  .fontSize(16)
                  .fontWeight(FontWeight.Medium)
                  .fontColor(UI_COLOR_TEXT)
                Text('已登录 · 监测平台账号')
                  .fontSize(11)
                  .fontColor(UI_COLOR_SUCCESS)
              }
              .alignItems(HorizontalAlign.Start)
            }
            .padding(14)
            .backgroundColor(UI_COLOR_SURFACE)
            .borderRadius(8)
            .width('100%')

            SettingsSectionTitle({ text: '告警与安全' });
            Column() {
              SettingsItem({
                icon: $r('sys.symbol.bell'),
                title: '告警提醒',
                detail: '软件内弹窗、声音与震动',
                tone: UI_COLOR_DANGER,
                actionable: false
              });
              Divider().color('#EEF1F3').margin({ left: 52 })
              SettingsItem({
                icon: $r('sys.symbol.dot_radiowaves_left_and_right'),
                title: '定位使用',
                detail: '查看告警地图时获取当前位置',
                tone: '#377BB1',
                actionable: false
              });
            }
            .width('100%')
            .backgroundColor(UI_COLOR_SURFACE)
            .borderRadius(8)

            SettingsSectionTitle({ text: '数据与连接' });
            Column() {
              SettingsItem({
                icon: $r('sys.symbol.arrow_clockwise'),
                title: '数据更新',
                detail: '总览 30 秒 · 节点状态 10 秒',
                tone: UI_COLOR_SUCCESS,
                actionable: false
              });
              Divider().color('#EEF1F3').margin({ left: 52 })
              SettingsItem({
                icon: $r('sys.symbol.house'),
                title: '本地缓存',
                detail: this.cacheStatus,
                tone: '#477B96',
                actionable: true,
                actionLabel: '清理',
                onTap: () => this.clearCache()
              });
              Divider().color('#EEF1F3').margin({ left: 52 })
              SettingsItem({
                icon: $r('sys.symbol.dot_radiowaves_left_and_right'),
                title: '服务器连接',
                detail: this.connectionText(),
                tone: this.connectionTone(),
                actionable: true,
                actionLabel: '修改',
                onTap: () => this.editingServer = true
              });
            }
            .width('100%')
            .backgroundColor(UI_COLOR_SURFACE)
            .borderRadius(8)

            SettingsSectionTitle({ text: '关于' });
            Column() {
              SettingsItem({
                icon: $r('sys.symbol.person_crop_circle_fill_1'),
                title: '山体滑坡监测',
                detail: 'HarmonyOS 移动端 · 版本 0.1.0',
                tone: UI_COLOR_ACCENT,
                actionable: false
              });
            }
            .width('100%')
            .backgroundColor(UI_COLOR_SURFACE)
            .borderRadius(8)

            Button('退出登录')
              .width('100%')
              .height(46)
              .fontColor(UI_COLOR_DANGER)
              .backgroundColor(UI_COLOR_SURFACE)
              .borderRadius(8)
              .onClick(() => this.onLogout())
          }
          .padding({ left: 16, right: 16, bottom: 24 })
          .width('100%')
        }
        .layoutWeight(1)
        .scrollBar(BarState.Off)
        .align(Alignment.TopStart)
      }
    }
    .layoutWeight(1)
  }
}

@Component
struct SettingsSectionTitle {
  @Prop text: string;

  build() {
    Text(this.text)
      .fontSize(13)
      .fontWeight(FontWeight.Medium)
      .fontColor('#52606D')
      .width('100%')
  }
}

@Component
struct SettingsItem {
  @Prop icon: Resource;
  @Prop title: string;
  @Prop detail: string;
  @Prop tone: string;
  @Prop actionable: boolean;
  @Prop actionLabel: string = '';
  onTap: () => void = () => {};

  build() {
    Row({ space: 12 }) {
      Stack({ alignContent: Alignment.Center }) {
        Circle({ width: 36, height: 36 }).fill('#EEF2F0')
        SymbolGlyph(this.icon)
          .fontSize(18)
          .fontColor([this.tone])
      }
      .width(36)
      .height(36)
      Column({ space: 3 }) {
        Text(this.title)
          .fontSize(14)
          .fontWeight(FontWeight.Medium)
          .fontColor(UI_COLOR_TEXT)
        Text(this.detail)
          .fontSize(11)
          .fontColor(UI_COLOR_MUTED)
          .maxLines(1)
          .textOverflow({ overflow: TextOverflow.Ellipsis })
      }
      .alignItems(HorizontalAlign.Start)
      .layoutWeight(1)
      if (this.actionable) {
        Row({ space: 5 }) {
          if (this.actionLabel.length > 0) {
            Text(this.actionLabel)
              .fontSize(11)
              .fontColor(UI_COLOR_MUTED)
          }
          SymbolGlyph($r('sys.symbol.chevron_right'))
            .fontSize(15)
            .fontColor([UI_COLOR_SUBTLE])
        }
      }
    }
    .width('100%')
    .height(64)
    .padding({ left: 12, right: 12 })
    .alignItems(VerticalAlign.Center)
    .onClick(() => {
      if (this.actionable) this.onTap();
    })
  }
}

@Component
struct BottomTabs {
  @Prop screen: AppScreen;
  onSelect: (screen: AppScreen) => void = () => {};

  build() {
    Column() {
      Divider().color('#EEF1F3')
      Row() {
        TabButton({ label: '总览', icon: $r('sys.symbol.house'), active: this.screen === 'overview' || this.screen === 'alerts', badgeCount: 0, onTap: () => this.onSelect('overview') });
        TabButton({ label: '站点', icon: $r('sys.symbol.dot_radiowaves_left_and_right'), active: this.screen === 'stations' || this.screen === 'device', badgeCount: 0, onTap: () => this.onSelect('stations') });
        TabButton({ label: 'AI', icon: $r('sys.symbol.arrow_clockwise'), textIcon: 'AI', active: this.screen === 'ai', badgeCount: 0, onTap: () => this.onSelect('ai') });
        TabButton({ label: '我的', icon: $r('sys.symbol.person_crop_circle_fill_1'), active: this.screen === 'settings', badgeCount: 0, onTap: () => this.onSelect('settings') });
      }
      .layoutWeight(1)
      .width('100%')
    }
    .height(65)
    .width('100%')
    .backgroundColor(UI_COLOR_SURFACE)
  }
}

@Component
struct TabButton {
  @Prop label: string;
  @Prop icon: Resource;
  @Prop textIcon: string = '';
  @Prop active: boolean;
  @Prop badgeCount: number;
  onTap: () => void = () => {};

  build() {
    Column({ space: 2 }) {
      Stack({ alignContent: Alignment.TopEnd }) {
        if (this.textIcon.length > 0) {
          Text(this.textIcon)
            .fontSize(11)
            .fontWeight(FontWeight.Bold)
            .fontColor(this.active ? UI_COLOR_ACCENT : UI_COLOR_MUTED)
            .textAlign(TextAlign.Center)
            .width(25)
            .height(22)
            .border({ width: 1.5, color: this.active ? UI_COLOR_ACCENT : UI_COLOR_MUTED })
            .borderRadius(6)
        } else {
          SymbolGlyph(this.icon)
            .fontSize(22)
            .fontColor([this.active ? UI_COLOR_ACCENT : UI_COLOR_MUTED])
        }
        if (this.badgeCount > 0) {
          Text(this.badgeCount > 99 ? '99+' : `${this.badgeCount}`)
            .fontSize(8)
            .fontWeight(FontWeight.Bold)
            .fontColor(UI_COLOR_SURFACE)
            .textAlign(TextAlign.Center)
            .width(this.badgeCount > 99 ? 24 : 15)
            .height(15)
            .padding({ left: 3, right: 3 })
            .backgroundColor(UI_COLOR_DANGER)
            .borderRadius(8)
            .offset({ x: 8, y: -3 })
        }
      }
      .width(32)
      .height(24)
      Text(this.label)
        .fontSize(10)
        .fontColor(this.active ? UI_COLOR_ACCENT : UI_COLOR_MUTED)
        .fontWeight(this.active ? FontWeight.Bold : FontWeight.Medium)
    }
    .layoutWeight(1)
    .height('100%')
    .justifyContent(FlexAlign.Center)
    .accessibilityText(`${this.label}${this.badgeCount > 0 ? `，${this.badgeCount} 条待处理` : ''}`)
    .onClick(() => this.onTap())
  }
}
