export type RiskLevel = 'low' | 'medium' | 'high'

export interface LocationInfo {
  name: string
  description: string
  riskLevel: RiskLevel
}

const CENTER_LAT = 22.6847
const CENTER_LON = 110.1893

// 基于经纬度的地名生成工具
// 针对广西玉林师范学院东校区挂傍山滑坡监测区域
export function getDetailedLocationInfo(lat: number, lon: number): LocationInfo {
  const latDiff = lat - CENTER_LAT
  const lonDiff = lon - CENTER_LON

  const distance = Math.sqrt(latDiff * latDiff + lonDiff * lonDiff)

  if (distance < 0.001) {
    return { name: '挂傍山中心', description: '挂傍山核心监测区域', riskLevel: 'medium' }
  }

  // 北部区域（山坡地带）
  if (latDiff > 0.003) {
    if (lonDiff > 0.003) return { name: '挂傍山东北坡', description: '挂傍山东北侧山坡地带', riskLevel: 'high' }
    if (lonDiff < -0.003) return { name: '挂傍山西北坡', description: '挂傍山西北侧山坡地带', riskLevel: 'high' }
    return { name: '挂傍山北坡', description: '挂傍山北侧山坡监测区', riskLevel: 'high' }
  }

  // 南部区域（相对平缓）
  if (latDiff < -0.003) {
    if (lonDiff > 0.003) return { name: '挂傍山东南麓', description: '挂傍山东南侧山麓区域', riskLevel: 'low' }
    if (lonDiff < -0.003) return { name: '挂傍山西南麓', description: '挂傍山西南侧山麓区域', riskLevel: 'low' }
    return { name: '挂傍山南麓', description: '挂傍山南侧山麓区域', riskLevel: 'low' }
  }

  // 东西两侧
  if (lonDiff > 0.003) return { name: '挂傍山东坡', description: '挂傍山东侧坡面监测区', riskLevel: 'medium' }
  if (lonDiff < -0.003) return { name: '挂傍山西坡', description: '挂傍山西侧坡面监测区', riskLevel: 'medium' }

  // 近距离区域
  if (latDiff > 0.001) return { name: '挂傍山北侧', description: '挂傍山北侧监测区域', riskLevel: 'medium' }
  if (latDiff < -0.001) return { name: '挂傍山南侧', description: '挂傍山南侧监测区域', riskLevel: 'low' }
  if (lonDiff > 0.001) return { name: '挂傍山东侧', description: '挂傍山东侧监测区域', riskLevel: 'low' }
  if (lonDiff < -0.001) return { name: '挂傍山西侧', description: '挂傍山西侧监测区域', riskLevel: 'low' }

  return { name: '挂傍山', description: '挂傍山滑坡监测区域', riskLevel: 'medium' }
}

export function getLocationName(lat: number, lon: number): string {
  return getDetailedLocationInfo(lat, lon).name
}

// 根据地名获取风险等级（数值：0~1）
export function getRiskByLocation(lat: number, lon: number): number {
  const info = getDetailedLocationInfo(lat, lon)
  if (info.riskLevel === 'high') return 0.7
  if (info.riskLevel === 'medium') return 0.4
  return 0.2
}

// 生成完整的设备名称（当没有映射记录时使用）
export function generateDeviceName(lat: number, lon: number, _deviceId?: string): string {
  void _deviceId
  const locationInfo = getDetailedLocationInfo(lat, lon)
  return `${locationInfo.name}监测站`
}

export function generateDeviceDescription(lat: number, lon: number): string {
  const locationInfo = getDetailedLocationInfo(lat, lon)
  return `位于${locationInfo.description}的滑坡监测设备`
}
