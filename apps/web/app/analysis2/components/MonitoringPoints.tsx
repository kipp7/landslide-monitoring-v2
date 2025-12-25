'use client'

import { CaretDownOutlined, CaretRightOutlined, CheckCircleOutlined, WarningOutlined } from '@ant-design/icons'
import { type ReactNode, useMemo, useState } from 'react'

type AlertType = 'sensor' | 'point'
type AlertLevel = 'critical' | 'warning' | 'notice'
type PointStatus = 'normal' | 'warning' | 'danger'
type SensorStatus = 'normal' | 'warning' | 'error'
type DeviceStatus = 'online' | 'offline' | 'maintenance'
type MonitorView = 'front' | 'left' | 'right' | 'top'

interface AlertData {
  id: string
  type: AlertType
  level: AlertLevel
  message: string
  time: string
  resolved: boolean
  relatedId: string
}

interface PointData {
  name: string
  temperature: number
  humidity: number
  landslideRisk: number
  windSpeed: number
  soilMoisture: number
  lastUpdated: string
  location: string
  elevation: number
  status: PointStatus
}

interface SensorData {
  id: string
  type: string
  model: string
  status: SensorStatus
  installDate: string
  lastMaintenance: string
  accuracy: string
  range: string
  battery: number
  data: {
    current: number
    unit: string
    trend: 'up' | 'down' | 'stable'
  }
}

interface DeviceInfo {
  id: string
  name: string
  type: string
  manufacturer: string
  serialNumber: string
  firmwareVersion: string
  installDate: string
  lastCheck: string
  status: DeviceStatus
}

const DEMO_POINTS: PointData[] = [
  {
    name: 'A',
    temperature: 25.3,
    humidity: 65,
    landslideRisk: 12,
    windSpeed: 5.2,
    soilMoisture: 42,
    lastUpdated: '2023-11-15 09:30',
    location: '北纬 30.5°, 东经 120.2°',
    elevation: 156,
    status: 'normal',
  },
  {
    name: 'B',
    temperature: 27.8,
    humidity: 70,
    landslideRisk: 8,
    windSpeed: 6.1,
    soilMoisture: 38,
    lastUpdated: '2023-11-15 10:45',
    location: '北纬 31.0°, 东经 120.8°',
    elevation: 160,
    status: 'warning',
  },
  {
    name: 'C',
    temperature: 26.5,
    humidity: 68,
    landslideRisk: 16,
    windSpeed: 5.9,
    soilMoisture: 40,
    lastUpdated: '2023-11-15 11:20',
    location: '北纬 30.8°, 东经 120.6°',
    elevation: 155,
    status: 'danger',
  },
]

const DEMO_SENSORS: SensorData[] = [
  {
    id: 'sensor-1',
    type: '湿度传感器',
    model: 'HD-2023Pro',
    status: 'normal',
    installDate: '2023-05-10',
    lastMaintenance: '2023-10-15',
    accuracy: '±2% RH',
    range: '0–100% RH',
    battery: 85,
    data: { current: 65, unit: '% RH', trend: 'stable' },
  },
  {
    id: 'sensor-2',
    type: '温度传感器',
    model: 'TD-2023Pro',
    status: 'warning',
    installDate: '2023-06-05',
    lastMaintenance: '2023-11-01',
    accuracy: '±0.5°C',
    range: '-40°C – 125°C',
    battery: 70,
    data: { current: 28.5, unit: '°C', trend: 'up' },
  },
  {
    id: 'sensor-3',
    type: '风速传感器',
    model: 'WS-2023Pro',
    status: 'error',
    installDate: '2023-07-20',
    lastMaintenance: '2023-12-10',
    accuracy: '±1 m/s',
    range: '0–25 m/s',
    battery: 45,
    data: { current: 4.2, unit: 'm/s', trend: 'down' },
  },
]

const DEMO_DEVICES: DeviceInfo[] = [
  {
    id: 'device-1',
    name: '监测终端 1',
    type: '一体化终端',
    manufacturer: '示例厂商',
    serialNumber: 'LM-2023-001',
    firmwareVersion: 'v1.2.3',
    installDate: '2023-05-10',
    lastCheck: '2023-11-20',
    status: 'online',
  },
  {
    id: 'device-2',
    name: '监测终端 2',
    type: '一体化终端',
    manufacturer: '示例厂商',
    serialNumber: 'LM-2023-002',
    firmwareVersion: 'v1.2.1',
    installDate: '2023-06-05',
    lastCheck: '2023-11-18',
    status: 'maintenance',
  },
  {
    id: 'device-3',
    name: '监测终端 3',
    type: '一体化终端',
    manufacturer: '示例厂商',
    serialNumber: 'LM-2023-003',
    firmwareVersion: 'v1.1.9',
    installDate: '2023-07-20',
    lastCheck: '2023-11-12',
    status: 'offline',
  },
]

const DEMO_ALERTS: AlertData[] = [
  {
    id: 'alert-1',
    type: 'point',
    level: 'warning',
    message: '监测点 C 风险升高',
    time: '2023-11-15 11:25',
    resolved: false,
    relatedId: 'C',
  },
  {
    id: 'alert-2',
    type: 'sensor',
    level: 'critical',
    message: '风速传感器异常（sensor-3）',
    time: '2023-11-15 11:40',
    resolved: false,
    relatedId: 'sensor-3',
  },
  {
    id: 'alert-3',
    type: 'sensor',
    level: 'notice',
    message: '温度传感器需要维护（sensor-2）',
    time: '2023-11-14 16:10',
    resolved: true,
    relatedId: 'sensor-2',
  },
]

function classNames(...items: Array<string | false | null | undefined>) {
  return items.filter(Boolean).join(' ')
}

function InfoItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 text-sm">
      <div className="text-gray-500">{label}</div>
      <div className="text-right font-medium">{value}</div>
    </div>
  )
}

function BatteryIndicator({ level }: { level: number }) {
  const pct = Math.max(0, Math.min(100, Math.round(level)))
  const barColor = pct <= 20 ? 'bg-red-500' : pct <= 50 ? 'bg-yellow-500' : 'bg-green-500'
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-16 overflow-hidden rounded bg-white/30">
        <div className={classNames('h-2 rounded', barColor)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-white/80">{pct}%</span>
    </div>
  )
}

function RiskLevelIndicator({ risk }: { risk: number }) {
  const level = risk >= 15 ? 'high' : risk >= 10 ? 'medium' : 'low'
  const dotColor = level === 'high' ? 'bg-red-500' : level === 'medium' ? 'bg-yellow-500' : 'bg-green-500'
  const textColor = level === 'high' ? 'text-red-600' : level === 'medium' ? 'text-yellow-600' : 'text-green-600'
  const label = level === 'high' ? '高风险' : level === 'medium' ? '中风险' : '低风险'
  return (
    <div className="flex items-center gap-2">
      <div className={classNames('h-3 w-3 rounded-full', dotColor)} />
      <span className={classNames('text-sm font-medium', textColor)}>{label}</span>
    </div>
  )
}

function StatusBadge({ status }: { status: PointStatus | SensorStatus | DeviceStatus }) {
  const style = (() => {
    switch (status) {
      case 'normal':
        return { label: '正常', classes: 'bg-green-100 text-green-700 border-green-200' }
      case 'warning':
        return { label: '警告', classes: 'bg-yellow-100 text-yellow-700 border-yellow-200' }
      case 'danger':
        return { label: '危险', classes: 'bg-red-100 text-red-700 border-red-200' }
      case 'error':
        return { label: '故障', classes: 'bg-red-100 text-red-700 border-red-200' }
      case 'online':
        return { label: '在线', classes: 'bg-green-100 text-green-700 border-green-200' }
      case 'offline':
        return { label: '离线', classes: 'bg-gray-100 text-gray-700 border-gray-200' }
      case 'maintenance':
        return { label: '维护', classes: 'bg-blue-100 text-blue-700 border-blue-200' }
      default:
        return { label: String(status), classes: 'bg-gray-100 text-gray-700 border-gray-200' }
    }
  })()

  return <span className={classNames('inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium', style.classes)}>{style.label}</span>
}

function AlertLevelBadge({ level, resolved }: { level: AlertLevel; resolved: boolean }) {
  if (resolved) return <span className="text-xs text-gray-400">已解决</span>
  const style =
    level === 'critical'
      ? { label: '严重', classes: 'bg-red-600 text-white' }
      : level === 'warning'
        ? { label: '警告', classes: 'bg-yellow-500 text-white' }
        : { label: '提示', classes: 'bg-blue-600 text-white' }
  return <span className={classNames('rounded px-1.5 py-0.5 text-xs font-medium', style.classes)}>{style.label}</span>
}

function DataCard({ title, value, trend }: { title: string; value: string; trend?: 'up' | 'down' | 'stable' }) {
  const trendText = trend === 'up' ? '↑' : trend === 'down' ? '↓' : trend === 'stable' ? '→' : ''
  const trendColor = trend === 'up' ? 'text-red-600' : trend === 'down' ? 'text-green-600' : 'text-gray-500'
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-500">{title}</span>
        {trend ? <span className={classNames('text-sm font-semibold', trendColor)}>{trendText}</span> : null}
      </div>
      <div className="mt-2 text-2xl font-bold text-gray-900">{value}</div>
    </div>
  )
}

function PointDetail({ data }: { data: PointData }) {
  const headerColor =
    data.status === 'normal'
      ? 'from-blue-600 to-blue-800'
      : data.status === 'warning'
        ? 'from-yellow-500 to-yellow-700'
        : 'from-red-600 to-red-800'
  return (
    <div className="overflow-hidden rounded-xl bg-white shadow-lg">
      <div className={classNames('p-6 text-white bg-gradient-to-r', headerColor)}>
        <div className="flex items-start justify-between gap-6">
          <div>
            <h2 className="text-2xl font-bold">监测点 {data.name}</h2>
            <div className="mt-1 text-sm opacity-90">{data.location}</div>
          </div>
          <div className="rounded-full bg-white/20 p-3">
            {data.status === 'normal' ? <CheckCircleOutlined className="text-2xl" /> : <WarningOutlined className="text-2xl" />}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 p-6 md:grid-cols-2">
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <div className="mb-4 text-lg font-semibold text-gray-900">实时数据</div>
          <div className="grid grid-cols-2 gap-4">
            <DataCard title="温度" value={`${data.temperature.toFixed(1)} °C`} trend={data.temperature >= 26 ? 'up' : 'down'} />
            <DataCard title="湿度" value={`${data.humidity.toFixed(0)} %`} trend={data.humidity >= 70 ? 'up' : 'stable'} />
            <DataCard title="风速" value={`${data.windSpeed.toFixed(1)} m/s`} trend={data.windSpeed >= 6 ? 'up' : 'stable'} />
            <DataCard title="土壤含水" value={`${data.soilMoisture.toFixed(0)} %`} trend={data.soilMoisture >= 45 ? 'up' : 'stable'} />
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <div className="mb-4 text-lg font-semibold text-gray-900">风险分析</div>
          <div className="flex h-40 items-center justify-center rounded bg-white text-sm text-gray-400">风险趋势图（占位）</div>
          <div className="mt-4 flex items-center justify-between gap-4">
            <span className="text-sm text-gray-700">滑坡风险：{data.landslideRisk}%</span>
            <RiskLevelIndicator risk={data.landslideRisk} />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-4">
            <InfoItem label="海拔" value={`${data.elevation} m`} />
            <InfoItem label="最后更新" value={<span className="font-mono text-xs">{data.lastUpdated}</span>} />
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 md:col-span-2">
          <div className="mb-4 text-lg font-semibold text-gray-900">地理位置</div>
          <div className="relative h-64 overflow-hidden rounded bg-white">
            <div className="flex h-full items-center justify-center text-sm text-gray-400">地图显示区域（占位）</div>
            <div className="absolute bottom-4 left-4 rounded bg-white p-3 shadow">
              <div className="text-sm text-gray-700">{data.location}</div>
              <div className="mt-1 text-xs text-gray-500">最后更新：{data.lastUpdated}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function SensorDetail({ data }: { data: SensorData }) {
  const headerColor =
    data.status === 'normal'
      ? 'from-purple-600 to-purple-800'
      : data.status === 'warning'
        ? 'from-yellow-500 to-yellow-700'
        : 'from-red-600 to-red-800'
  return (
    <div className="overflow-hidden rounded-xl bg-white shadow-lg">
      <div className={classNames('p-6 text-white bg-gradient-to-r', headerColor)}>
        <div className="flex items-start justify-between gap-6">
          <div>
            <h2 className="text-2xl font-bold">{data.type}</h2>
            <div className="mt-1 text-sm opacity-90">{data.model}</div>
          </div>
          <div className="flex items-center gap-3">
            <BatteryIndicator level={data.battery} />
            <div className="rounded-full bg-white/20 p-3">
              {data.status === 'normal' ? <CheckCircleOutlined className="text-2xl" /> : <WarningOutlined className="text-2xl" />}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 p-6 md:grid-cols-2">
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <div className="mb-4 text-lg font-semibold text-gray-900">技术规格</div>
          <div className="space-y-3">
            <InfoItem label="测量范围" value={data.range} />
            <InfoItem label="精度" value={data.accuracy} />
            <InfoItem label="安装日期" value={<span className="font-mono text-xs">{data.installDate}</span>} />
            <InfoItem label="最后维护" value={<span className="font-mono text-xs">{data.lastMaintenance}</span>} />
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <div className="mb-4 text-lg font-semibold text-gray-900">实时数据</div>
          <div className="flex items-end justify-between gap-4">
            <div className="text-4xl font-bold text-gray-900">
              {data.data.current} <span className="text-xl font-semibold text-gray-700">{data.data.unit}</span>
            </div>
            <div className="text-2xl font-semibold text-gray-600">
              {data.data.trend === 'up' ? '↑' : data.data.trend === 'down' ? '↓' : '→'}
            </div>
          </div>
          <div className="mt-4 rounded bg-white p-4 text-sm text-gray-400">数据趋势图（占位）</div>
          <div className="mt-4">
            <StatusBadge status={data.status} />
          </div>
        </div>
      </div>
    </div>
  )
}

function DeviceDetail({ data }: { data: DeviceInfo }) {
  const headerColor = data.status === 'online' ? 'from-emerald-600 to-emerald-800' : data.status === 'maintenance' ? 'from-blue-600 to-blue-800' : 'from-gray-600 to-gray-800'
  return (
    <div className="overflow-hidden rounded-xl bg-white shadow-lg">
      <div className={classNames('p-6 text-white bg-gradient-to-r', headerColor)}>
        <div className="flex items-start justify-between gap-6">
          <div>
            <h2 className="text-2xl font-bold">{data.name}</h2>
            <div className="mt-1 text-sm opacity-90">{data.type}</div>
          </div>
          <div className="rounded bg-white/15 px-3 py-2">
            <StatusBadge status={data.status} />
          </div>
        </div>
      </div>
      <div className="p-6">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
            <div className="mb-4 text-lg font-semibold text-gray-900">设备信息</div>
            <div className="space-y-3">
              <InfoItem label="厂商" value={data.manufacturer} />
              <InfoItem label="序列号" value={<span className="font-mono text-xs">{data.serialNumber}</span>} />
              <InfoItem label="固件版本" value={<span className="font-mono text-xs">{data.firmwareVersion}</span>} />
              <InfoItem label="安装日期" value={<span className="font-mono text-xs">{data.installDate}</span>} />
              <InfoItem label="最后巡检" value={<span className="font-mono text-xs">{data.lastCheck}</span>} />
            </div>
          </div>
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
            <div className="mb-4 text-lg font-semibold text-gray-900">说明</div>
            <div className="text-sm text-gray-600">
              该页面为参考区 `/analysis2` 的 UI 迁移（demo 数据）。后续可在不改变布局的前提下，逐步对接 v2 的站点/设备/告警与实时数据源。
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function AlertDetail({ data }: { data: AlertData }) {
  const headerColor = data.level === 'critical' ? 'from-red-600 to-red-800' : data.level === 'warning' ? 'from-yellow-500 to-yellow-700' : 'from-blue-600 to-blue-800'
  return (
    <div className="overflow-hidden rounded-xl bg-white shadow-lg">
      <div className={classNames('p-6 text-white bg-gradient-to-r', headerColor)}>
        <div className="flex items-start justify-between gap-6">
          <div>
            <h2 className="text-2xl font-bold">异常详情</h2>
            <div className="mt-1 text-sm opacity-90">{data.message}</div>
          </div>
          <div className="rounded-full bg-white/20 p-3">
            {data.resolved ? <CheckCircleOutlined className="text-2xl" /> : <WarningOutlined className="text-2xl" />}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 p-6 md:grid-cols-2">
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <div className="mb-4 text-lg font-semibold text-gray-900">基本信息</div>
          <div className="space-y-3">
            <InfoItem label="类型" value={data.type === 'sensor' ? '传感器异常' : '监测点异常'} />
            <InfoItem
              label="级别"
              value={data.level === 'critical' ? '严重' : data.level === 'warning' ? '警告' : '提示'}
            />
            <InfoItem label="发生时间" value={<span className="font-mono text-xs">{data.time}</span>} />
            <InfoItem label="关联对象" value={<span className="font-mono text-xs">{data.relatedId}</span>} />
            <InfoItem label="处理状态" value={data.resolved ? '已解决' : '未解决'} />
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <div className="mb-4 text-lg font-semibold text-gray-900">处理建议</div>
          <div className="space-y-3 text-sm text-gray-700">
            {data.level === 'critical' ? (
              <div className="rounded border border-red-200 bg-red-50 p-3">
                <div className="font-medium text-red-800">紧急处理</div>
                <div className="mt-1 text-red-700">建议立即排查设备与数据链路，必要时启动应急预案。</div>
              </div>
            ) : data.level === 'warning' ? (
              <div className="rounded border border-yellow-200 bg-yellow-50 p-3">
                <div className="font-medium text-yellow-800">尽快核查</div>
                <div className="mt-1 text-yellow-700">建议安排现场核查与复测，关注后续趋势。</div>
              </div>
            ) : (
              <div className="rounded border border-blue-200 bg-blue-50 p-3">
                <div className="font-medium text-blue-800">持续观察</div>
                <div className="mt-1 text-blue-700">建议持续观察指标变化，并记录运维处理信息。</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function ViewDetail({ view }: { view: MonitorView }) {
  const title = view === 'front' ? '监控正视图' : view === 'left' ? '监控左视图' : view === 'right' ? '监控右视图' : '监控顶视图'
  const icon = view === 'front' ? '📷' : view === 'left' ? '🧭' : view === 'right' ? '🛰️' : '🗺️'
  return (
    <div className="overflow-hidden rounded-xl bg-white shadow-lg">
      <div className="bg-gradient-to-r from-blue-600 to-blue-800 p-6 text-white">
        <h2 className="text-2xl font-bold">{title}</h2>
      </div>
      <div className="p-6">
        <div className="grid grid-cols-2 gap-6">
          <div className="flex h-64 items-center justify-center rounded-lg bg-gray-100 p-4">
            <div className="text-center">
              <div className="text-4xl">{icon}</div>
              <div className="mt-2 text-sm text-gray-500">监控画面（占位）</div>
            </div>
          </div>
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
            <div className="mb-4 text-lg font-semibold text-gray-900">说明</div>
            <div className="space-y-3 text-sm text-gray-700">
              <div>此处为参考区 `/analysis2` 的“监控视图”占位。</div>
              <div>后续可对接视频/图片流或站点全景图。</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function MonitoringPoints() {
  const [selectedAlert, setSelectedAlert] = useState<AlertData | null>(null)
  const [selectedDevice, setSelectedDevice] = useState<DeviceInfo | null>(null)
  const [selectedPoint, setSelectedPoint] = useState<PointData | null>(null)
  const [selectedSensor, setSelectedSensor] = useState<SensorData | null>(null)
  const [selectedView, setSelectedView] = useState<MonitorView | null>(null)

  const [showAlerts, setShowAlerts] = useState(false)
  const [showPoints, setShowPoints] = useState(false)
  const [showSensors, setShowSensors] = useState(false)
  const [showDevices, setShowDevices] = useState(false)
  const [showViews, setShowViews] = useState(false)

  const unresolvedAlertsCount = useMemo(() => DEMO_ALERTS.filter((a) => !a.resolved).length, [])

  const clearSelections = () => {
    setSelectedAlert(null)
    setSelectedDevice(null)
    setSelectedPoint(null)
    setSelectedSensor(null)
    setSelectedView(null)
  }

  const content = selectedView ? (
    <ViewDetail view={selectedView} />
  ) : selectedAlert ? (
    <AlertDetail data={selectedAlert} />
  ) : selectedPoint ? (
    <PointDetail data={selectedPoint} />
  ) : selectedSensor ? (
    <SensorDetail data={selectedSensor} />
  ) : selectedDevice ? (
    <DeviceDetail data={selectedDevice} />
  ) : (
    <div className="rounded-xl bg-white p-6 shadow">
      <div className="text-xl font-semibold text-gray-900">分析 2 / 监测点视图</div>
      <div className="mt-2 text-sm text-gray-600">从左侧选择“异常 / 监测点 / 传感器 / 设备 / 视图”以查看详情。</div>
      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <div className="text-sm text-gray-500">监测点</div>
          <div className="mt-1 text-2xl font-bold text-gray-900">{DEMO_POINTS.length}</div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <div className="text-sm text-gray-500">传感器</div>
          <div className="mt-1 text-2xl font-bold text-gray-900">{DEMO_SENSORS.length}</div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <div className="text-sm text-gray-500">未解决异常</div>
          <div className="mt-1 text-2xl font-bold text-gray-900">{unresolvedAlertsCount}</div>
        </div>
      </div>
    </div>
  )

  return (
    <div className="flex h-screen bg-gray-100">
      <div className="w-80 overflow-y-auto bg-gray-900 p-4 text-gray-100 shadow-xl">
        <div className="mb-4">
          <div className="text-lg font-semibold">监测点系统（demo）</div>
          <div className="mt-1 text-xs text-gray-400">参考区 `/analysis2` UI 迁移</div>
        </div>

        <div className="mb-6">
          <button
            type="button"
            className="flex w-full items-center justify-between rounded-lg p-3 transition hover:bg-gray-800"
            onClick={() => setShowAlerts((v) => !v)}
          >
            <div className="flex items-center gap-2">
              <span className="font-medium">异常信息</span>
              {unresolvedAlertsCount > 0 ? <span className="rounded-full bg-red-500 px-2 py-0.5 text-xs text-white">{unresolvedAlertsCount}</span> : null}
            </div>
            {showAlerts ? <CaretDownOutlined /> : <CaretRightOutlined />}
          </button>

          {showAlerts ? (
            <div className="mt-2 space-y-2 pl-2">
              {DEMO_ALERTS.map((alert) => (
                <div
                  key={alert.id}
                  className={classNames(
                    'cursor-pointer rounded-lg p-3 transition-all',
                    selectedAlert?.id === alert.id ? 'bg-blue-700' : 'hover:bg-gray-800',
                    !alert.resolved && alert.level === 'critical' && 'border-l-4 border-red-500',
                    !alert.resolved && alert.level === 'warning' && 'border-l-4 border-yellow-500',
                  )}
                  onClick={() => {
                    setSelectedAlert(alert)
                    setSelectedPoint(null)
                    setSelectedSensor(null)
                    setSelectedDevice(null)
                    setSelectedView(null)
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium">{alert.message}</span>
                    <AlertLevelBadge level={alert.level} resolved={alert.resolved} />
                  </div>
                  <div className="mt-1 text-xs text-gray-400">{alert.time}</div>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div className="mb-6">
          <button
            type="button"
            className="flex w-full items-center justify-between rounded-lg p-3 transition hover:bg-gray-800"
            onClick={() => setShowPoints((v) => !v)}
          >
            <span className="font-medium">监测点信息</span>
            {showPoints ? <CaretDownOutlined /> : <CaretRightOutlined />}
          </button>

          {showPoints ? (
            <div className="mt-2 space-y-2 pl-2">
              {DEMO_POINTS.map((point) => (
                <div
                  key={point.name}
                  className={classNames('cursor-pointer rounded-lg p-3 transition-all', selectedPoint?.name === point.name ? 'bg-blue-700' : 'hover:bg-gray-800')}
                  onClick={() => {
                    setSelectedPoint(point)
                    setSelectedAlert(null)
                    setSelectedSensor(null)
                    setSelectedDevice(null)
                    setSelectedView(null)
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">点 {point.name}</span>
                    <StatusBadge status={point.status} />
                  </div>
                  <div className="mt-1 text-xs text-gray-400">风险 {point.landslideRisk}%</div>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div className="mb-6">
          <button
            type="button"
            className="flex w-full items-center justify-between rounded-lg p-3 transition hover:bg-gray-800"
            onClick={() => setShowSensors((v) => !v)}
          >
            <span className="font-medium">传感器信息</span>
            {showSensors ? <CaretDownOutlined /> : <CaretRightOutlined />}
          </button>

          {showSensors ? (
            <div className="mt-2 space-y-2 pl-2">
              {DEMO_SENSORS.map((sensor) => (
                <div
                  key={sensor.id}
                  className={classNames('cursor-pointer rounded-lg p-3 transition-all', selectedSensor?.id === sensor.id ? 'bg-blue-700' : 'hover:bg-gray-800')}
                  onClick={() => {
                    setSelectedSensor(sensor)
                    setSelectedAlert(null)
                    setSelectedPoint(null)
                    setSelectedDevice(null)
                    setSelectedView(null)
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{sensor.type}</span>
                    <StatusBadge status={sensor.status} />
                  </div>
                  <div className="mt-1 text-xs text-gray-400">
                    {sensor.model} · 电量 {sensor.battery}%
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div className="mb-6">
          <button
            type="button"
            className="flex w-full items-center justify-between rounded-lg p-3 transition hover:bg-gray-800"
            onClick={() => setShowDevices((v) => !v)}
          >
            <span className="font-medium">设备信息</span>
            {showDevices ? <CaretDownOutlined /> : <CaretRightOutlined />}
          </button>

          {showDevices ? (
            <div className="mt-2 space-y-2 pl-2">
              {DEMO_DEVICES.map((device) => (
                <div
                  key={device.id}
                  className={classNames('cursor-pointer rounded-lg p-3 transition-all', selectedDevice?.id === device.id ? 'bg-blue-700' : 'hover:bg-gray-800')}
                  onClick={() => {
                    setSelectedDevice(device)
                    setSelectedAlert(null)
                    setSelectedPoint(null)
                    setSelectedSensor(null)
                    setSelectedView(null)
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{device.name}</span>
                    <StatusBadge status={device.status} />
                  </div>
                  <div className="mt-1 truncate text-xs text-gray-400">{device.serialNumber}</div>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div className="mb-2">
          <button
            type="button"
            className="flex w-full items-center justify-between rounded-lg p-3 transition hover:bg-gray-800"
            onClick={() => setShowViews((v) => !v)}
          >
            <span className="font-medium">监控视图</span>
            {showViews ? <CaretDownOutlined /> : <CaretRightOutlined />}
          </button>

          {showViews ? (
            <div className="mt-2 space-y-2 pl-2">
              {(['front', 'left', 'right', 'top'] as const).map((view) => (
                <div
                  key={view}
                  className={classNames('cursor-pointer rounded-lg p-3 transition-all', selectedView === view ? 'bg-blue-700' : 'hover:bg-gray-800')}
                  onClick={() => {
                    clearSelections()
                    setSelectedView(view)
                  }}
                >
                  <div className="font-medium">
                    {view === 'front' ? '监控正视图' : view === 'left' ? '监控左视图' : view === 'right' ? '监控右视图' : '监控顶视图'}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">{content}</div>
    </div>
  )
}

