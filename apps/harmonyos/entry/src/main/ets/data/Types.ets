export type JsonRecord = Record<string, Object>;

export interface ApiEnvelope<T> {
  success: boolean;
  code: number;
  message: string;
  data: T;
  timestamp: string;
  traceId: string;
}

export interface UserSummary {
  userId: string;
  username: string;
  realName?: string;
  roles?: Array<Object>;
  permissions?: Array<string>;
}

export interface LoginData {
  token?: string;
  accessToken?: string;
  refreshToken: string;
  expiresIn?: number;
  user: UserSummary;
}

export interface DashboardSummary {
  todayDataCount: number;
  todayReportCount?: number;
  onlineDevices: number;
  offlineDevices: number;
  pendingAlerts: number;
  todayAlerts: number;
  alertsBySeverity: JsonRecord;
  stations: number;
  freshDevices: number;
  totalDevices: number;
  lastUpdatedAt: string;
}

export interface FieldAlarmDeviceProbe {
  available?: boolean;
  queriedAt?: string;
}

export interface FieldAlarmActuatorStatus {
  available: boolean;
  state?: string;
  lastActionAt?: string;
  yx75r?: FieldAlarmDeviceProbe;
}

export interface FieldAlarmStatus {
  active: boolean;
  silenced: boolean;
  state: string;
  actuator: FieldAlarmActuatorStatus;
}

export interface WeeklyTrend {
  labels?: Array<string>;
  days?: Array<string>;
  rainfallMm: Array<number>;
  alertCount: Array<number>;
  note?: string;
  generatedAt?: string;
}

export interface Station {
  stationId: string;
  stationCode?: string;
  stationName: string;
  displayName?: string;
  status: string;
  latitude?: number;
  longitude?: number;
  regionCode?: string;
  slopeCode?: string;
  metadata?: JsonRecord;
}

export interface Device {
  deviceId: string;
  deviceName: string;
  displayName?: string;
  deviceType?: string;
  status: string;
  stationId?: string;
  stationName?: string;
  lastSeenAt?: string;
  updatedAt?: string;
  regionCode?: string;
  slopeCode?: string;
  metadata?: JsonRecord;
}

export interface DeviceStatePayload {
  metrics: JsonRecord;
  meta?: JsonRecord;
}

export interface DeviceState {
  deviceId: string;
  updatedAt?: string;
  state: DeviceStatePayload;
}

export interface SensorDefinition {
  sensorKey: string;
  name?: string;
  displayName?: string;
  unit?: string;
  dataType?: string;
}

export interface SeriesPoint {
  ts: string;
  value: number;
}

export interface MetricSeries {
  sensorKey: string;
  unit?: string;
  dataType?: string;
  points: Array<SeriesPoint>;
}

export interface SeriesResponse {
  deviceId: string;
  startTime: string;
  endTime: string;
  interval: string;
  series: Array<MetricSeries>;
  missing?: Array<JsonRecord>;
}

export interface Alert {
  alertId: string;
  status: string;
  severity: string;
  title: string;
  message?: string;
  deviceId?: string;
  stationId?: string;
  latitude?: number;
  longitude?: number;
  evidence?: JsonRecord;
  lastEventAt?: string;
}

export interface AlertStreamEvent {
  type: string;
  eventId: string;
  alertId: string;
  eventType: string;
  severity: string;
  title: string;
  message: string;
  deviceId?: string;
  stationId?: string;
  latitude?: number;
  longitude?: number;
  evidence?: JsonRecord;
  createdAt: string;
}

export type AlertLocationSource = 'alert' | 'gps-live' | 'gps-last' | 'station' | 'default';

export interface AlertMapLocation {
  latitude: number;
  longitude: number;
  source: AlertLocationSource;
  locationName: string;
  deviceId?: string;
  updatedAt?: string;
}

export type UserLocationStatus = 'idle' | 'locating' | 'ready' | 'denied' | 'unavailable';

export interface UserMapLocation {
  latitude: number;
  longitude: number;
  accuracy: number;
  updatedAt: string;
}

export interface EvacuationTarget {
  latitude: number;
  longitude: number;
  name: string;
  instruction?: string;
}

export interface AlertPage {
  list: Array<Alert>;
  pagination?: JsonRecord;
  summary?: JsonRecord;
}

export interface AlertEvent {
  eventId: string;
  eventType: string;
  severity?: string;
  createdAt: string;
  deviceId?: string;
  evidence?: JsonRecord;
}

export interface AlertEventsResponse {
  alertId: string;
  events: Array<AlertEvent>;
}

export interface AiPrediction {
  predictionId: string;
  deviceId?: string;
  stationId?: string;
  modelKey?: string;
  riskScore?: number;
  riskLevel?: string;
  predictedTs?: string;
  explain?: string;
  payload?: JsonRecord;
  createdAt?: string;
}

export interface PredictionPage {
  page: number;
  pageSize: number;
  total: number;
  list: Array<AiPrediction>;
}

export interface EdgeRiskFeature {
  key: string;
  label: string;
  value?: number;
  unit: string;
  score: number;
  weight: number;
  available: boolean;
}

export interface EdgeRiskDevice {
  deviceId: string;
  stationId?: string;
  generatedAt: string;
  dataUpdatedAt?: string;
  dataStatus: string;
  modelKey: string;
  modelVersion: string;
  riskScore: number;
  riskLevel: string;
  confidence: number;
  hardRuleTriggered: boolean;
  hardRuleReasons: Array<string>;
  explain: string;
  factors: Array<string>;
  features: Array<EdgeRiskFeature>;
}

export interface EdgeAgentTask {
  taskId: string;
  taskKey: string;
  title: string;
  status: string;
  trigger: string;
  deviceId?: string;
  createdAt: string;
  completedAt?: string;
  verification: string;
}

export type EdgeAiActionName = 'recheck' | 'collect_logs' | 'generate_report';

export interface EdgeAiActionResult {
  reportReady?: boolean;
  generatedAt?: string;
  overallLevel?: string;
  diagnosisType?: string;
  confidence?: number;
  confidenceLevel?: string;
  taskCount?: number;
  blockedCount?: number;
  recommendedPlan?: Array<string>;
  suggestedCommands?: Array<string>;
  note?: string;
  edgeRiskLevel?: string;
  edgeRiskScore?: number;
  edgeRiskModelVersion?: string;
  edgeAgentPendingUploads?: number;
}

export interface HermesAction {
  id: string;
  createdAt: string;
  action: EdgeAiActionName;
  status: string;
  requestedBy: string;
  naturalLanguageIntent?: string;
  summary: string;
  result: EdgeAiActionResult;
}

export interface EdgeAiSafetyBoundary {
  readOnly: boolean;
  gatewayCoreTouched: boolean;
  serialTouched: boolean;
  mqttTouched: boolean;
  message: string;
}

export interface EdgeAiActionResponse {
  schema_version: number;
  accepted: boolean;
  action: HermesAction;
  safetyBoundary: EdgeAiSafetyBoundary;
}

export interface EdgeAiActionHistory {
  schema_version: number;
  generatedAt: string;
  actions: Array<HermesAction>;
}

export interface EdgeAiIntentResolution {
  resolved: boolean;
  blocked: boolean;
  action?: EdgeAiActionName | null;
  label?: string | null;
  reason: string;
  suggestions: Array<EdgeAiActionName>;
}

export interface EdgeAiIntentResponse {
  intent: string;
  resolution: EdgeAiIntentResolution;
  execution?: EdgeAiActionResponse | null;
}

export interface EdgeRiskModelStatus {
  loaded: boolean;
  modelKey?: string;
  modelVersion?: string;
  trainedAt?: string;
  trainingSource?: string;
  error?: string;
}

export interface EdgeAiStatus {
  available: boolean;
  mode: string;
  generatedAt: string;
  mqttConnected: boolean;
  model: EdgeRiskModelStatus;
  overallRiskLevel: string;
  maxRiskScore?: number;
  hardRuleTriggered: boolean;
  devices: Array<EdgeRiskDevice>;
  tasks: Array<EdgeAgentTask>;
  pendingUploadCount: number;
  runtimeError?: string;
}

export function numberValue(value: Object | undefined): number | null {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

export function metricValue(state: DeviceState | null, key: string): number | null {
  if (!state) return null;
  return numberValue(state.state.metrics[key]);
}

export function metricValueFrom(state: DeviceState | null, keys: Array<string>): number | null {
  for (let index = 0; index < keys.length; index++) {
    const value = metricValue(state, keys[index]);
    if (value !== null) return value;
  }
  return null;
}

export function soilTemperatureValue(state: DeviceState | null): number | null {
  return metricValueFrom(state, ['soil_temperature_c', 'temperature_c']);
}

export function soilMoistureValue(state: DeviceState | null): number | null {
  return metricValueFrom(state, ['soil_moisture_pct', 'soil_moisture_percent', 'humidity_pct', 'humidity_percent']);
}

export function soilConductivityValue(state: DeviceState | null): number | null {
  return metricValue(state, 'electrical_conductivity_us_cm');
}

export function deviceSupportsConductivity(device: Device | null): boolean {
  if (!device?.metadata) return false;
  const configured = device.metadata['hasConductivitySensor'];
  if (typeof configured === 'boolean') return configured;
  const fieldNodeId = device.metadata['fieldNodeId'] ?? device.metadata['field_node_id'];
  if (typeof fieldNodeId !== 'string') return false;
  const normalized = fieldNodeId.trim().toUpperCase();
  return normalized === 'B' || normalized === 'C';
}

export function displayMetric(value: number | null, digits: number = 2): string {
  return value === null ? '--' : value.toFixed(digits);
}

export function userDisplayName(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'admin' || normalized === 'administrator') return '管理员';
  return value;
}

export function stationDisplayName(station: Station): string {
  return stationNameLabel(station.displayName ?? station.stationName);
}

export function stationNameLabel(value: string | undefined): string {
  if (!value) return '未命名监测站';
  const normalized = value.toLowerCase();
  if (normalized.startsWith('gbs landslide station ')) {
    return `地表位移监测站 ${value.slice(22).trim()}`;
  }
  if (normalized.startsWith('gbs station ')) {
    return `地表位移监测站 ${value.slice(12).trim()}`;
  }
  return value;
}

export function isAlarmActuatorDevice(device: Device): boolean {
  let identity = `${device.deviceName} ${device.displayName ?? ''} ${device.deviceType ?? ''}`;
  const metadata = device.metadata;
  if (metadata) {
    const keys: Array<string> = ['deviceRole', 'device_role', 'role', 'kind', 'category', 'model'];
    for (let index = 0; index < keys.length; index++) {
      const value = metadata[keys[index]];
      if (typeof value === 'string') identity += ` ${value}`;
    }
  }
  const normalized = identity.toLowerCase();
  return normalized.includes('tongxiao') ||
    normalized.includes('通晓') ||
    normalized.includes('alarm terminal') ||
    normalized.includes('alarm_terminal') ||
    normalized.includes('alarm actuator') ||
    normalized.includes('alarm_actuator') ||
    normalized.includes('声光告警');
}

export function deviceDisplayName(device: Device): string {
  if (isAlarmActuatorDevice(device)) return '通晓 RK2206 声光告警终端';
  const value = device.displayName ?? device.deviceName;
  const normalized = value.toLowerCase();
  const nodeAt = normalized.lastIndexOf(' node ');
  if (nodeAt >= 0) return `监测节点 ${value.slice(nodeAt + 6).trim()}`;
  return value;
}

export function stationStatusLabel(value: string): string {
  switch (value.toLowerCase()) {
    case 'active':
    case 'online':
    case 'normal':
      return '正常监测';
    case 'maintenance':
      return '维护中';
    case 'inactive':
    case 'disabled':
      return '已停用';
    case 'offline':
      return '连接中断';
    default:
      return '状态待确认';
  }
}

export function deviceStatusLabel(value: string): string {
  switch (value.toLowerCase()) {
    case 'active':
    case 'online':
      return '在线';
    case 'maintenance':
      return '维护中';
    case 'inactive':
    case 'disabled':
    case 'revoked':
      return '已停用';
    case 'offline':
      return '离线';
    default:
      return '状态未知';
  }
}

const DEVICE_ONLINE_WINDOW_MS: number = 5 * 60 * 1000;
const DEVICE_FUTURE_CLOCK_TOLERANCE_MS: number = 2 * 60 * 1000;

export function isDeviceOnline(device: Device, latestStateAt?: string): boolean {
  if (device.status.toLowerCase() === 'revoked') return false;
  const observedAt = latestStateAt ?? device.lastSeenAt;
  if (observedAt) {
    const observed = new Date(observedAt);
    if (!Number.isNaN(observed.getTime())) {
      const age = Date.now() - observed.getTime();
      return age >= -DEVICE_FUTURE_CLOCK_TOLERANCE_MS && age <= DEVICE_ONLINE_WINDOW_MS;
    }
  }
  return isOnlineStatus(device.status);
}

export function deviceConnectivityLabel(device: Device, latestStateAt?: string): string {
  if (device.status.toLowerCase() === 'revoked') return '已停用';
  if (device.status.toLowerCase() === 'maintenance') return '维护中';
  return isDeviceOnline(device, latestStateAt) ? '在线' : '离线';
}

export function isOnlineStatus(value: string): boolean {
  const normalized = value.toLowerCase();
  return normalized === 'active' || normalized === 'online' || normalized === 'normal';
}

export function deviceTypeLabel(value: string | undefined): string {
  if (!value) return '监测设备';
  const normalized = value.toLowerCase();
  if (normalized.includes('alarm') || normalized.includes('actuator') || normalized.includes('siren')) return '联动告警终端';
  if (normalized.includes('gateway')) return '边缘网关';
  if (normalized.includes('gbs')) return '地表位移监测终端';
  if (normalized.includes('rain')) return '雨量监测终端';
  if (normalized.includes('tilt')) return '倾角监测终端';
  if (normalized.includes('node') || normalized.includes('monitor')) return '监测终端';
  if (normalized.includes('sensor')) return '传感器终端';
  return '监测设备';
}

export function metricLabel(value: string): string {
  switch (value.toLowerCase()) {
    case 'displacement_mm': return '位移量';
    case 'tilt_x_deg': return 'X 轴倾角';
    case 'tilt_y_deg': return 'Y 轴倾角';
    case 'tilt_z_deg': return 'Z 轴倾角';
    case 'rainfall_mm': return '降雨量';
    case 'battery_v': return '电池电压';
    case 'soil_temperature_c':
    case 'temperature_c': return '土壤温度';
    case 'soil_moisture_pct':
    case 'soil_moisture_percent':
    case 'humidity_pct':
    case 'humidity_percent': return '土壤湿度';
    case 'electrical_conductivity_us_cm': return '土壤电导率';
    case 'pore_pressure_kpa': return '孔隙水压力';
    default: return '监测指标';
  }
}

export function metricShortLabel(value: string): string {
  switch (value.toLowerCase()) {
    case 'tilt_x_deg': return 'X 倾角';
    case 'tilt_y_deg': return 'Y 倾角';
    case 'soil_temperature_c':
    case 'temperature_c': return '土壤温度';
    case 'soil_moisture_pct':
    case 'soil_moisture_percent':
    case 'humidity_pct':
    case 'humidity_percent': return '土壤湿度';
    case 'electrical_conductivity_us_cm': return '土壤电导率';
    default: return metricLabel(value);
  }
}

export function metricUnitLabel(value: string | undefined): string {
  if (!value) return '';
  const normalized = value.toLowerCase();
  if (normalized === 'deg') return '°';
  if (normalized === 'percent') return '%';
  if (normalized === 'us/cm' || normalized === 'μs/cm' || normalized === 'µs/cm') return 'μS/cm';
  return value;
}

export function alertStatusLabel(value: string): string {
  switch (value.toLowerCase()) {
    case 'open':
    case 'active': return '待处理';
    case 'acknowledged':
    case 'acked': return '已确认';
    case 'resolved':
    case 'closed': return '已解除';
    default: return '状态待确认';
  }
}

export function severityLabel(value: string): string {
  switch (value.toLowerCase()) {
    case 'critical': return '紧急';
    case 'high': return '高风险';
    case 'medium': return '中风险';
    case 'low': return '低风险';
    default: return '风险待确认';
  }
}

export function eventTypeLabel(value: string): string {
  switch (value.toLowerCase()) {
    case 'created':
    case 'alert_trigger':
    case 'triggered': return '触发告警';
    case 'acknowledged':
    case 'alert_ack':
    case 'acked': return '确认告警';
    case 'alert_resolve':
    case 'resolved': return '解除告警';
    case 'updated':
    case 'alert_update':
    case 'status_changed': return '状态更新';
    default: return '告警事件';
  }
}

export function relativeTime(value: string | undefined): string {
  if (!value) return '暂无上报';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '时间待确认';
  const elapsed = Date.now() - date.getTime();
  if (elapsed < 0 || elapsed < 60 * 1000) return '刚刚上报';
  if (elapsed < 60 * 60 * 1000) return `${Math.floor(elapsed / 60000)} 分钟前`;
  if (elapsed < 24 * 60 * 60 * 1000) return `${Math.floor(elapsed / 3600000)} 小时前`;
  return `${date.getMonth() + 1} 月 ${date.getDate()} 日`;
}

export function shortTime(value: string | undefined): string {
  if (!value) return '暂无';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function twoDigit(value: number): string {
  return value < 10 ? `0${value}` : `${value}`;
}

export function beijingClockTime(value: string | undefined): string {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return '--:--:--';
  const beijing = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  return `${twoDigit(beijing.getUTCHours())}:${twoDigit(beijing.getUTCMinutes())}:${twoDigit(beijing.getUTCSeconds())}`;
}
