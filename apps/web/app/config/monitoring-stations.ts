// 挂傍山滑坡监测站统一配置管理  
// 基于玉林师范学院东校区挂傍山坐标：22.6847°N, 110.1893°E

export interface MonitoringStation {
  deviceId: string;
  stationName: string;
  location: string;
  coordinates: {
    latitude: number;
    longitude: number;
    altitude?: number;
  };
  sensorTypes: string[];
  description: string;
  riskLevel: 'low' | 'medium' | 'high';
  installDate: string;
  status: 'active' | 'inactive' | 'maintenance';
}

export interface ChartLegendConfig {
  chartType: string;
  title: string;
  unit: string;
  yAxisName?: string;
  deviceLegends: {
    [deviceId: string]: string;
  };
}

// 挂傍山监测站配置
export const MONITORING_STATIONS: Record<string, MonitoringStation> = {
  'device_1': {
    deviceId: 'device_1',
    stationName: '挂傍山中心监测站',
    location: '玉林师范学院东校区挂傍山中心点',
    coordinates: {
      latitude: 22.6847,
      longitude: 110.1893,
      altitude: 168.543
    },
    sensorTypes: ['temperature', 'humidity', 'acceleration', 'illumination', 'gps'],
    description: '位于挂傍山核心监测区域的主要传感器节点',
    riskLevel: 'medium',
    installDate: '2024-05-15',
    status: 'active'
  },
  'device_2': {
    deviceId: 'device_2', 
    stationName: '坡顶监测站',
    location: '玉林师范学院东校区挂傍山坡顶',
    coordinates: {
      latitude: 22.6850,
      longitude: 110.1890,
      altitude: 175.234
    },
    sensorTypes: ['temperature', 'humidity', 'gyroscope', 'vibration', 'gps'],
    description: '位于挂傍山坡顶的高海拔监测点',
    riskLevel: 'high',
    installDate: '2024-05-15',
    status: 'active'
  },
  'device_3': {
    deviceId: 'device_3',
    stationName: '坡脚监测站', 
    location: '玉林师范学院东校区挂傍山坡脚',
    coordinates: {
      latitude: 22.6844,
      longitude: 110.1896,
      altitude: 162.156
    },
    sensorTypes: ['temperature', 'acceleration', 'illumination', 'gps', 'vibration'],
    description: '位于挂傍山坡脚的基准监测点',
    riskLevel: 'low',
    installDate: '2024-05-15',
    status: 'active'
  }
};

// 图表图例配置
export const CHART_LEGENDS: Record<string, ChartLegendConfig> = {
  temperature: {
    chartType: 'temperature',
    title: '温度趋势图/°C - 挂傍山监测网络',
    unit: '°C',
    yAxisName: '温度',
    deviceLegends: {
      'device_1': '挂傍山中心监测站',
      'device_2': '坡顶监测站', 
      'device_3': '坡脚监测站'
    }
  },
  humidity: {
    chartType: 'humidity',
    title: '湿度趋势图/% - 挂傍山监测网络',
    unit: '%',
    yAxisName: '湿度',
    deviceLegends: {
      'device_1': '挂傍山中心监测站',
      'device_2': '坡顶监测站',
      'device_3': '坡脚监测站'
    }
  },
  acceleration: {
    chartType: 'acceleration',
    title: '加速度趋势图/mg - 挂傍山监测网络', 
    unit: 'mg',
    yAxisName: '加速度',
    deviceLegends: {
      'device_1': '挂傍山中心监测站',
      'device_2': '坡顶监测站',
      'device_3': '坡脚监测站'
    }
  },
  gyroscope: {
    chartType: 'gyroscope',
    title: '陀螺仪趋势图/°/s - 挂傍山监测网络',
    unit: '°/s', 
    yAxisName: '角速度',
    deviceLegends: {
      'device_1': '挂傍山中心监测站',
      'device_2': '坡顶监测站',
      'device_3': '坡脚监测站'
    }
  },
  rainfall: {
    chartType: 'rainfall',
    title: '雨量趋势图/mm - 挂傍山监测网络',
    unit: 'mm',
    yAxisName: '降雨量',
    deviceLegends: {
      'device_1': '挂傍山中心监测站',
      'device_2': '坡顶监测站', 
      'device_3': '坡脚监测站'
    }
  },
  gps_deformation: {
    chartType: 'gps_deformation',
    title: '地质形变趋势图/mm - 挂傍山监测网络',
    unit: 'mm',
    yAxisName: '位移',
    deviceLegends: {
      'device_1': '挂傍山中心监测站',
      'device_2': '坡顶监测站',
      'device_3': '坡脚监测站'
    }
  }
};

// 获取监测站信息
export const getStationInfo = (deviceId: string): MonitoringStation | null => {
  return MONITORING_STATIONS[deviceId] || null;
};

// 获取监测站名称
export const getStationName = (deviceId: string): string => {
  const station = getStationInfo(deviceId);
  return station?.stationName || deviceId;
};

// 获取监测站简短名称（用于图例）
export const getStationLegendName = (chartType: string, deviceId: string): string => {
  const chartConfig = CHART_LEGENDS[chartType];
  return chartConfig?.deviceLegends[deviceId] || getStationName(deviceId);
};

// 获取图表配置
export const getChartConfig = (chartType: string): ChartLegendConfig | null => {
  return CHART_LEGENDS[chartType] || null;
};

// 获取所有活跃监测站
export const getActiveStations = (): MonitoringStation[] => {
  return Object.values(MONITORING_STATIONS).filter(station => station.status === 'active');
};

// 根据坐标计算监测站（兼容现有逻辑）
export const getStationByCoordinates = (lat: number, lng: number): MonitoringStation | null => {
  const threshold = 0.001; // 坐标匹配阈值
  
  return Object.values(MONITORING_STATIONS).find(station => {
    const latDiff = Math.abs(station.coordinates.latitude - lat);
    const lngDiff = Math.abs(station.coordinates.longitude - lng);
    return latDiff < threshold && lngDiff < threshold;
  }) || null;
};

// 获取监测站风险等级数值
export const getStationRiskLevel = (deviceId: string): number => {
  const station = getStationInfo(deviceId);
  if (!station) return 0.3;
  
  switch (station.riskLevel) {
    case 'high': return 0.7;
    case 'medium': return 0.4; 
    case 'low': return 0.2;
    default: return 0.3;
  }
};

// 生成监测站完整描述
export const getStationDescription = (deviceId: string): string => {
  const station = getStationInfo(deviceId);
  if (!station) return `未知监测站 ${deviceId}`;
  
  return `${station.stationName} - ${station.description}`;
};
