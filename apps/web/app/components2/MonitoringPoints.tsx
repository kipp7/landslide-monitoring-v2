'use client';
import { useState, useEffect } from 'react';
import { CaretRightOutlined, CaretDownOutlined, WarningOutlined, CheckCircleOutlined } from '@ant-design/icons';
import RiskBadge from './RiskBadge';
import StatusBadge from './StatusBadge';
import BatteryIndicator from './BatteryIndicator';
import InfoItem from './InfoItem';
import TimelineItem from './TimelineItem';
import AlertDetail from './AlertDetail';

// 新增异常数据类型
interface AlertData {
  id: string;
  type: 'sensor' | 'point';
  level: 'critical' | 'warning' | 'notice';
  message: string;
  time: string;
  resolved: boolean;
  relatedId: string;
}

// 监测点数据类型
interface PointData {
  name: string;
  temperature: number;
  humidity: number;
  landslideRisk: number;
  windSpeed: number;
  soilMoisture: number;
  lastUpdated: string;
  location: string;
  elevation: number;
  status: 'normal' | 'warning' | 'danger';
}

// 传感器数据类型
interface SensorData {
  id: string;
  type: string;
  model: string;
  status: 'normal' | 'warning' | 'error';
  installDate: string;
  lastMaintenance: string;
  accuracy: string;
  range: string;
  battery: number;
  data: {
    current: number;
    unit: string;
    trend: 'up' | 'down' | 'stable';
  };
}

// 新增设备基本信息类型
interface DeviceInfo {
  id: string;
  name: string;
  type: string;
  manufacturer: string;
  serialNumber: string;
  firmwareVersion: string;
  installDate: string;
  lastCheck: string;
  status: 'online' | 'offline' | 'maintenance';
}

// 监测点详情组件
const PointDetail = ({ data }: { data: PointData }) => (
  <div className="bg-white rounded-xl shadow-lg overflow-hidden">
    <div className={`p-6 text-white ${data.status === 'normal' ? 'bg-gradient-to-r from-blue-600 to-blue-800' : 
                     data.status === 'warning' ? 'bg-gradient-to-r from-yellow-500 to-yellow-700' : 
                     'bg-gradient-to-r from-red-600 to-red-800'}`}>
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-2xl font-bold">监测点 {data.name}</h2>
          <p className="opacity-90">{data.location}</p>
        </div>
        <div className="bg-white/20 rounded-full p-3">
          {data.status === 'normal' ? <CheckCircleOutlined className="text-2xl" /> : 
           <WarningOutlined className="text-2xl" />}
        </div>
      </div>
    </div>

    <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* 实时数据卡片 */}
      <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
        <h3 className="text-lg font-semibold mb-4">实时数据</h3>
        <div className="grid grid-cols-2 gap-4">
          <DataCard 
            title="温度" 
            value={`${data.temperature}°C`} 
            icon="🌡️"
            trend={data.temperature > 25 ? 'up' : 'down'}
          />
          {/* 其他数据卡片... */}
        </div>
      </div>

      {/* 风险分析卡片 */}
      <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
        <h3 className="text-lg font-semibold mb-4">风险分析</h3>
        <div className="h-40 bg-white rounded p-4">
          {/* 风险图表占位 */}
          <div className="flex items-center justify-center h-full text-gray-400">
            风险趋势图表
          </div>
        </div>
        <div className="mt-4 flex justify-between items-center">
          <span className="text-sm">滑坡风险: {data.landslideRisk}%</span>
          <RiskLevelIndicator risk={data.landslideRisk} />
        </div>
      </div>

      {/* 地图位置卡片 */}
      <div className="md:col-span-2 bg-gray-50 p-4 rounded-lg border border-gray-200">
        <h3 className="text-lg font-semibold mb-4">地理位置</h3>
        <div className="h-64 bg-white rounded overflow-hidden relative">
          {/* 地图占位 */}
          <div className="flex items-center justify-center h-full text-gray-400">
            地图显示区域
          </div>
          <div className="absolute bottom-4 left-4 bg-white p-2 rounded shadow">
            <p>海拔: {data.elevation}m</p>
            <p className="text-sm text-gray-500">最后更新: {data.lastUpdated}</p>
          </div>
        </div>
      </div>
    </div>
  </div>
);

// 传感器详情组件
const SensorDetail = ({ data }: { data: SensorData }) => (
  <div className="bg-white rounded-xl shadow-lg overflow-hidden">
    <div className={`p-6 text-white ${data.status === 'normal' ? 'bg-gradient-to-r from-purple-600 to-purple-800' : 
                     data.status === 'warning' ? 'bg-gradient-to-r from-yellow-500 to-yellow-700' : 
                     'bg-gradient-to-r from-red-600 to-red-800'}`}>
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-2xl font-bold">{data.type}</h2>
          <p className="opacity-90">{data.model}</p>
        </div>
        <div className="flex items-center space-x-2">
          <BatteryIndicator level={data.battery} />
          <div className="bg-white/20 rounded-full p-3">
            {data.status === 'normal' ? <CheckCircleOutlined className="text-2xl" /> : 
             <WarningOutlined className="text-2xl" />}
          </div>
        </div>
      </div>
    </div>

    <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* 技术规格卡片 */}
      <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
        <h3 className="text-lg font-semibold mb-4">技术规格</h3>
        <div className="space-y-3">
          <InfoItem label="测量范围" value={data.range} />
          <InfoItem label="精度" value={data.accuracy} />
          <InfoItem label="安装日期" value={data.installDate} />
          <InfoItem label="最后维护" value={data.lastMaintenance} />
        </div>
      </div>

      {/* 实时数据卡片 */}
      <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
        <h3 className="text-lg font-semibold mb-4">实时数据</h3>
        <div className="flex items-center justify-between">
          <div className="text-4xl font-bold">
            {data.data.current} {data.data.unit}
          </div>
          <div className={`text-2xl ${
            data.data.trend === 'up' ? 'text-red-500' : 
            data.data.trend === 'down' ? 'text-green-500' : 'text-gray-500'
          }`}>
            {data.data.trend === 'up' ? '↑' : data.data.trend === 'down' ? '↓' : '→'}
          </div>
        </div>
        <div className="h-32 mt-4 bg-white rounded">
          {/* 数据图表占位 */}
          <div className="flex items-center justify-center h-full text-gray-400">
            数据趋势图表
          </div>
        </div>
      </div>

      {/* 维护记录卡片 */}
      <div className="md:col-span-2 bg-gray-50 p-4 rounded-lg border border-gray-200">
        <h3 className="text-lg font-semibold mb-4">维护记录</h3>
        <div className="space-y-4">
          <TimelineItem 
            date="2025-4-15" 
            action="例行检查" 
            status="completed"
            by="张工程师"
          />
          {/* 其他时间线项目... */}
        </div>
        <button className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition">
          添加维护记录
        </button>
      </div>
    </div>
  </div>
);

// 辅助组件
const DataCard = ({ title, value, icon, trend }: { title: string; value: string; icon: string; trend?: 'up' | 'down' | 'stable' }) => (
  <div className="bg-white p-3 rounded-lg shadow-sm border border-gray-200">
    <div className="flex justify-between">
      <span className="text-gray-500">{title}</span>
      <span>{icon}</span>
    </div>
    <div className="flex items-end justify-between mt-2">
      <span className="text-2xl font-bold">{value}</span>
      {trend && (
        <span className={`text-sm ${
          trend === 'up' ? 'text-red-500' : 
          trend === 'down' ? 'text-green-500' : 'text-gray-500'
        }`}>
          {trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→'}
        </span>
      )}
    </div>
  </div>
);

// 添加 RiskLevelIndicator 组件
const RiskLevelIndicator = ({ risk }: { risk: number }) => {
  let color = 'text-green-500';
  if (risk > 15) color = 'text-red-500';
  else if (risk > 10) color = 'text-yellow-500';

  return (
    <div className="flex items-center">
      <div className={`w-3 h-3 rounded-full ${color} mr-2`} />
      <span className={`text-sm ${color}`}>
        {risk <= 10 ? '低风险' : risk <= 15 ? '中风险' : '高风险'}
      </span>
    </div>
  );
};

// 新增监控视图类型
type MonitorView = 'front' | 'left' | 'right' | 'top';
// 主组件
export default function MonitoringSystem() {
  const [points] = useState<PointData[]>([
    {
      name: "A",
      temperature: 25.3,
      humidity: 65,
      landslideRisk: 12,
      windSpeed: 5.2,
      soilMoisture: 42,
      lastUpdated: "2023-11-15 09:30",
      location: "北纬30.5°, 东经120.2°",
      elevation: 156,
      status: "normal"
    },
    {
      name: "B",
      temperature: 27.8,
      humidity: 70,  
      landslideRisk: 8,
      windSpeed: 6.1,
      soilMoisture: 38,
      lastUpdated: "2023-11-15 10:45",
      location: "北纬31.0°, 东经120.8°",
      elevation: 160,
      status: "warning"
    },
    {
      name: "C",
      temperature: 26.5,
      humidity: 68,
      landslideRisk: 10,
      windSpeed: 5.9,
      soilMoisture: 40,
      lastUpdated: "2023-11-15 11:20",
      location: "北纬30.8°, 东经120.6°",
      elevation: 155,
      status: "danger"
    },
    {
      name: "D",
      temperature: 24.9,
      humidity: 63,
      landslideRisk: 15,
      windSpeed: 4.8,
      soilMoisture: 36,
      lastUpdated: "2023-11-15 12:00",
      location: "北纬30.3°, 东经120.4°",
      elevation: 150,
      status: "normal"
    },
    {
      name: "E",
      temperature: 28.2,
      humidity: 72,
      landslideRisk: 5,
      windSpeed: 6.5,
      soilMoisture: 44,
      lastUpdated: "2023-11-15 13:15",
      location: "北纬31.2°, 东经121.0°",
      elevation: 165,
      status: "warning"
    }
  ]);
  const [sensors] = useState<SensorData[]>([
    {
      id: "sensor-1",
      type: "湿度传感器",
      model: "HD-2023Pro",
      status: "normal",
      installDate: "2023-05-10",
      lastMaintenance: "2023-10-15",
      accuracy: "±2% RH",
      range: "0-100% RH",
      battery: 85,
      data: {
        current: 65,
        unit: "% RH",
        trend: "stable"
      }
    },
    {
      id: "sensor-2",
      type: "温度传感器",
      model: "TD-2023Pro",  
      status: "warning",
      installDate: "2023-06-05",
      lastMaintenance: "2023-11-01",
      accuracy: "±0.5°C",
      range: "-40°C - 125°C",
      battery: 70,
      data: {
        current: 28.5,
        unit: "°C",
        trend: "up" 
      }
    },
    {
      id: "sensor-3",
      type: "风速传感器",
      model: "WS-2023Pro", 
      status: "error",
      installDate: "2023-07-20",
      lastMaintenance: "2023-12-10",
      accuracy: "±1 m/s",
      range: "0-25 m/s",
      battery: 45,
      data: {
        current: 4.2,
        unit: "m/s",
        trend: "down"
      }
    },
    {
      id: "sensor-4",
      type: "光照传感器",
      model: "LS-2023Pro", 
      status: "normal",
      installDate: "2023-08-15",
      lastMaintenance: "2023-12-25",
      accuracy: "±5%",
      range: "0-1000 lux",
      battery: 90,
      data: {
        current: 800,
        unit: "lux",
        trend: "stable"
      }
    },
    {
      id: "sensor-5",
      type: "气压传感器",
      model: "PS-2023Pro", 
      status: "warning",
      installDate: "2023-09-10",
      lastMaintenance: "2023-12-30",
      accuracy: "±2 hPa",
      range: "950-1050 hPa",
      battery: 60,
      data: {
        current: 1015,
        unit: "hPa",
        trend: "up"
      }
    }
  ]);
  // 更新 AlertDetail 组件
const AlertDetail = ({ data }: { data: AlertData }) => (
  <div className="bg-white rounded-xl shadow-lg overflow-hidden">
    <div className={`p-6 text-white ${
      data.level === 'critical' ? 'bg-gradient-to-r from-red-600 to-red-800' :
      data.level === 'warning' ? 'bg-gradient-to-r from-yellow-500 to-yellow-700' : 
      'bg-gradient-to-r from-blue-600 to-blue-800'
    }`}>
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-2xl font-bold">异常详情</h2>
          <p className="opacity-90">{data.message}</p>
        </div>
        <div className="bg-white/20 rounded-full p-3">
          {data.resolved ? <CheckCircleOutlined className="text-2xl" /> : 
           <WarningOutlined className="text-2xl" />}
        </div>
      </div>
    </div>

    <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* 新增异常详情卡片 */}
      <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
        <h3 className="text-lg font-semibold mb-4">基本信息</h3>
        <div className="space-y-3">
          <InfoItem label="异常类型" value={
            data.type === 'sensor' ? '传感器异常' : 
            data.type === 'point' ? '监测点异常' : '监控异常'
          } />
          <InfoItem label="严重程度" value={
            data.level === 'critical' ? '严重' : 
            data.level === 'warning' ? '警告' : '注意'
          } />
          <InfoItem label="发生时间" value={data.time} />
          <InfoItem label="处理状态" value={data.resolved ? '已解决' : '未解决'} />
        </div>
      </div>

      {/* 新增处理建议卡片 */}
      <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
        <h3 className="text-lg font-semibold mb-4">处理建议</h3>
        <div className="space-y-3">
          {data.level === 'critical' && (
            <div className="bg-red-50 p-3 rounded border border-red-200">
              <h4 className="font-medium text-red-800">紧急处理建议</h4>
              <p className="text-sm text-red-600 mt-1">
                请立即联系技术人员处理，必要时启动应急预案
              </p>
            </div>
          )}
          {/* 其他级别处理建议... */}
        </div>
        <button className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition">
          {data.resolved ? '重新打开' : '标记为已解决'}
        </button>
      </div>

      {/* 新增相关数据卡片 */}
      <div className="md:col-span-2 bg-gray-50 p-4 rounded-lg border border-gray-200">
        <h3 className="text-lg font-semibold mb-4">相关数据</h3>
        <div className="h-64 bg-white rounded">
          {/* 数据图表占位 */}
          <div className="flex items-center justify-center h-full text-gray-400">
            相关数据趋势图表
          </div>
        </div>
      </div>
    </div>
  </div>
);
  // 新增状态
  const [alerts] = useState<AlertData[]>([
    {
      id: 'alert-1',
      type: 'point',
      level: 'critical',
      message: '监测点C滑坡风险值超过阈值',
      time: '2023-11-15 11:25',
      resolved: false,
      relatedId: 'C'
    },
    {
      id: 'alert-2', 
      type: 'sensor',
      level: 'warning',
      message: '风速传感器电池电量低',
      time: '2023-11-15 10:30',
      resolved: false,
      relatedId: 'sensor-3'
    },
    {
      id: 'alert-3', 
      type: 'sensor',
      level: 'notice',
      message: '湿度传感器数据异常',
      time: '2023-11-15 09:45',
      resolved: true,
      relatedId: 'sensor-1'
    },
    {
      id: 'alert-4',
      type:'point',
      level: 'critical',
      message: '监测点A温度过高',
      time: '2023-11-15 08:50',
      resolved: false,
      relatedId: 'A'
    },
    {
      id: 'alert-5',
      type:'sensor',
      level: 'warning',
      message: '温度传感器电池电量低',
      time: '2023-11-15 08:00',
      resolved: false,
      relatedId: 'sensor-2'
    }
  ]);

  const [devices] = useState<DeviceInfo[]>([
    {
      id: 'device-1',
      name: '主监测站',
      type: 'RTK基站',
      manufacturer: '华测导航',
      serialNumber: 'HC-2023-001',
      firmwareVersion: 'v2.5.3',
      installDate: '2023-05-10',
      lastCheck: '2023-11-10',
      status: 'online'
    },
    {
      id: 'device-2',
      name: '温度传感器1',
      type: '温度传感器',
      manufacturer: '温湿度科技',
      serialNumber: 'TH-2023-002',
      firmwareVersion: 'v1.8.0',
      installDate: '2023-06-05',
      lastCheck: '2023-11-15',
      status: 'offline'
    },
    {
      id: 'device-3',
      name: '湿度传感器2',
      type: '湿度传感器',
      manufacturer: '温湿度科技',
      serialNumber: 'RH-2023-003',
      firmwareVersion: 'v1.7.5',
      installDate: '2023-07-20',
      lastCheck: '2023-11-20',
      status: 'maintenance'
    },
    {
      id: 'device-4',
      name: '风速传感器3',
      type: '风速传感器', 
      manufacturer: '风速科技',
      serialNumber: 'WS-2023-004',
      firmwareVersion: 'v1.9.2',
      installDate: '2023-08-15',
      lastCheck: '2023-11-25',
      status: 'online'
    },
    {
      id: 'device-5',
      name: '光照传感器4',
      type: '光照传感器',
      manufacturer: '光照科技',
      serialNumber: 'LS-2023-005',
      firmwareVersion: 'v1.6.1',
      installDate: '2023-09-10',
      lastCheck: '2023-11-30',
      status: 'offline'
    }
  ]);

  // 新增选中状态
  const [selectedAlert, setSelectedAlert] = useState<AlertData | null>(null);
  const [selectedDevice, setSelectedDevice] = useState<DeviceInfo | null>(null);
  const [showAlerts, setShowAlerts] = useState(false);
  const [showDevices, setShowDevices] = useState(false);
  const [selectedPoint, setSelectedPoint] = useState<PointData | null>(null);
  const [selectedSensor, setSelectedSensor] = useState<SensorData | null>(null);
  const [showPoints, setShowPoints] = useState(false);
  const [showSensors, setShowSensors] = useState(false);
  const [selectedView, setSelectedView] = useState<MonitorView | null>(null);
  const [showViews, setShowViews] = useState(false);
  


  return (
    <div className="flex h-screen bg-gray-100">
      {/* 左侧导航栏 */}
      <div className="w-80 bg-gray-900 text-gray-100 p-4 shadow-xl overflow-y-auto">
        {/* 异常信息面板 */}
        <div className="mb-6">
          <button 
            className="flex items-center justify-between w-full p-3 hover:bg-gray-800 rounded-lg transition"
            onClick={() => setShowAlerts(!showAlerts)}
          >
            <div className="flex items-center">
              <span className="font-medium">异常信息</span>
              {alerts.filter(a => !a.resolved).length > 0 && (
                <span className="ml-2 bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
                  {alerts.filter(a => !a.resolved).length}
                </span>
              )}
            </div>
            {showAlerts ? <CaretDownOutlined /> : <CaretRightOutlined />}
          </button>
          
          {showAlerts && (
            <div className="mt-2 space-y-2 pl-2">
              {alerts.map(alert => (
                <div 
                  key={alert.id}
                  className={`p-3 rounded-lg cursor-pointer transition-all ${
                    selectedAlert?.id === alert.id ? 'bg-blue-700' : 'hover:bg-gray-800'
                  } ${
                    !alert.resolved && alert.level === 'critical' ? 'border-l-4 border-red-500' :
                    !alert.resolved && alert.level === 'warning' ? 'border-l-4 border-yellow-500' : ''
                  }`}
                  onClick={() => {
                    setSelectedAlert(alert);
                    setSelectedPoint(null);
                    setSelectedSensor(null);
                    setSelectedDevice(null);
                  }}
                >
                  <div className="flex justify-between items-center">
                    <span className="font-medium truncate">{alert.message}</span>
                    {!alert.resolved && (
                      <span className={`text-xs px-1 rounded ${
                        alert.level === 'critical' ? 'bg-red-500' :
                        alert.level === 'warning' ? 'bg-yellow-500' : 'bg-blue-500'
                      }`}>
                        {alert.level === 'critical' ? '严重' : 
                         alert.level === 'warning' ? '警告' : '注意'}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-400 mt-1">{alert.time}</div>
                </div>
              ))}
            </div>
          )}
        </div>
        {/* 监测点折叠面板 */}
        <div className="mb-6">
          <button 
            className="flex items-center justify-between w-full p-3 hover:bg-gray-800 rounded-lg transition"
            onClick={() => setShowPoints(!showPoints)}
          >
            <span className="font-medium">监测点信息</span>
            {showPoints ? <CaretDownOutlined /> : <CaretRightOutlined />}
          </button>
          
          {showPoints && (
            <div className="mt-2 space-y-2 pl-2">
              {points.map(point => (
                <div 
                  key={point.name}
                  className={`p-3 rounded-lg cursor-pointer transition-all ${
                    selectedPoint?.name === point.name ? 'bg-blue-700' : 'hover:bg-gray-800'
                  }`}
                  onClick={() => {
                    setSelectedPoint(point);
                    setSelectedSensor(null);
                  }}
                >
                  <div className="flex justify-between items-center">
                    <span className="font-medium">{point.name}</span>
                    <RiskBadge risk={point.landslideRisk} />
                  </div>
                  <div className="text-xs text-gray-400 mt-1">
                    {point.location}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 传感器折叠面板 */}
        <div>
          <button 
            className="flex items-center justify-between w-full p-3 hover:bg-gray-800 rounded-lg transition"
            onClick={() => setShowSensors(!showSensors)}
          >
            <span className="font-medium">传感器信息</span>
            {showSensors ? <CaretDownOutlined /> : <CaretRightOutlined />}
          </button>
          
          {showSensors && (
            <div className="mt-2 space-y-2 pl-2">
              {sensors.map(sensor => (
                <div 
                  key={sensor.id}
                  className={`p-3 rounded-lg cursor-pointer transition-all ${
                    selectedSensor?.id === sensor.id ? 'bg-purple-700' : 'hover:bg-gray-800'
                  }`}
                  onClick={() => {
                    setSelectedSensor(sensor);
                    setSelectedPoint(null);
                  }}
                >
                  <div className="flex justify-between items-center">
                    <span className="font-medium">{sensor.type}</span>
                    <StatusBadge status={sensor.status} />
                  </div>
                  <div className="text-xs text-gray-400 mt-1">
                    {sensor.model} • 电量 {sensor.battery}%
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        {/* 新增监控视图面板 */}
        <div className="mb-6">
            <button 
              className="flex items-center justify-between w-full p-3 hover:bg-gray-800 rounded-lg transition"
              onClick={() => setShowViews(!showViews)}
            >
              <span className="font-medium">监控视图</span>
              {showViews ? <CaretDownOutlined /> : <CaretRightOutlined />}
            </button>
            
            {showViews && (
              <div className="mt-2 space-y-2 pl-2">
                <div 
                  className={`p-3 rounded-lg cursor-pointer transition-all ${
                    selectedView === 'front' ? 'bg-blue-700' : 'hover:bg-gray-800'
                  }`}
                  onClick={() => {
                    setSelectedView('front');
                    setSelectedPoint(null);
                    setSelectedSensor(null);
                    setSelectedAlert(null);
                  }}
                >
                  <div className="flex items-center">
                    <span className="font-medium">监控正视图</span>
                  </div>
                </div>
                <div 
                  className={`p-3 rounded-lg cursor-pointer transition-all ${
                    selectedView === 'left' ? 'bg-blue-700' : 'hover:bg-gray-800'
                  }`}
                  onClick={() => {
                    setSelectedView('left');
                    setSelectedPoint(null);
                    setSelectedSensor(null);
                    setSelectedAlert(null);
                  }}
                >
                  <div className="flex items-center">
                    <span className="font-medium">监控左视图</span>
                  </div>
                </div>
                <div 
                  className={`p-3 rounded-lg cursor-pointer transition-all ${
                    selectedView === 'right' ? 'bg-blue-700' : 'hover:bg-gray-800'
                  }`}
                  onClick={() => {
                    setSelectedView('right');
                    setSelectedPoint(null);
                    setSelectedSensor(null);
                    setSelectedAlert(null);
                  }}
                >
                  <div className="flex items-center">
                    <span className="font-medium">监控右视图</span>
                  </div>
                </div>
                <div 
                  className={`p-3 rounded-lg cursor-pointer transition-all ${
                    selectedView === 'top' ? 'bg-blue-700' : 'hover:bg-gray-800'
                  }`}
                  onClick={() => {
                    setSelectedView('top');
                    setSelectedPoint(null);
                    setSelectedSensor(null);
                    setSelectedAlert(null);
                  }}
                >
                  <div className="flex items-center">
                    <span className="font-medium">监控顶视图</span>
                  </div>
                </div>
              </div>
            )}
          </div>
      </div>
      {/* 右侧内容区域 */}
      <div className="flex-1 p-6 overflow-y-auto">
      {selectedView ? (
      // 监控视图内容
      <div className="bg-white rounded-xl shadow-lg overflow-hidden">
        <div className="p-6 bg-gradient-to-r from-blue-600 to-blue-800 text-white">
          <h2 className="text-2xl font-bold">
            {selectedView === 'front' && '监控正视图'}
            {selectedView === 'left' && '监控左视图'}
            {selectedView === 'right' && '监控右视图'}
            {selectedView === 'top' && '监控顶视图'}
          </h2>
        </div>
        
        <div className="p-6">
          <div className="grid grid-cols-2 gap-6">
            <div className="bg-gray-100 rounded-lg p-4 h-64 flex items-center justify-center">
              <div className="text-center">
                <div className="text-4xl mb-4">
                  {selectedView === 'front' && '📷'}
                  {selectedView === 'left' && '👈'}
                  {selectedView === 'right' && '👉'}
                  {selectedView === 'top' && '⬇️'}
                </div>
                <p className="text-gray-500">实时监控画面</p>
              </div>
            </div>
            <div className="bg-gray-100 rounded-lg p-4 h-64">
              <h3 className="text-lg font-semibold mb-4">数据分析</h3>
              <div className="h-full flex items-center justify-center text-gray-400">
                数据分析图表
              </div>
            </div>
            <div className="md:col-span-2 bg-gray-100 rounded-lg p-4 h-80">
              <h3 className="text-lg font-semibold mb-4">历史趋势</h3>
              <div className="h-full flex items-center justify-center text-gray-400">
                历史趋势图表
              </div>
            </div>
          </div>
        </div>
      </div>
      ) : (
      // 其他内容
      <>
        {selectedAlert && <AlertDetail data={selectedAlert} />}
        {selectedPoint && <PointDetail data={selectedPoint} />}
        {selectedSensor && <SensorDetail data={selectedSensor} />}
        
        {/* 默认视图 */}
        {!selectedAlert && !selectedPoint && !selectedSensor && (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <div className="text-5xl mb-4">🌄</div>
            <h2 className="text-2xl font-bold mb-2">滑坡监测系统</h2>
            <p className="text-lg">请从左侧选择要查看的项目</p>
          </div>
        )}
      </>
      )}
      </div>
    </div>
  );
};

