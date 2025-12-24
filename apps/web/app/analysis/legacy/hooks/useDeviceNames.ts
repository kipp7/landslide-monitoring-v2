'use client'

export interface DeviceNameMapping {
  device_id: string
  friendly_name: string
  display_name: string
  short_name: string
  device_type: string
}

export default function useDeviceNames() {
  const deviceNames: Record<string, DeviceNameMapping> = {}

  const generateFallbackName = (deviceId: string): string => {
    if (!deviceId) return '未知设备'

    if (deviceId === 'device_1') return '龙门滑坡监测站'
    if (deviceId === 'device_2') return '坡顶监测站'
    if (deviceId === 'device_3') return '坡脚监测站'

    if (deviceId.includes('_rk2206')) {
      return `滑坡监测站-${deviceId.slice(-6)}`
    }

    if (deviceId.includes('_')) {
      const parts = deviceId.split('_')
      return `传感器-${parts[parts.length - 1]}`
    }

    if (deviceId.length > 10) {
      return `设备-${deviceId.slice(-6)}`
    }

    return deviceId
  }

  const getFriendlyName = (deviceId: string): string => {
    return deviceNames[deviceId]?.friendly_name || generateFallbackName(deviceId)
  }

  const getDisplayName = (deviceId: string): string => {
    return deviceNames[deviceId]?.display_name || generateFallbackName(deviceId)
  }

  const getShortName = (deviceId: string): string => {
    return deviceNames[deviceId]?.short_name || generateFallbackName(deviceId)
  }

  const getDeviceType = (deviceId: string): string => {
    return deviceNames[deviceId]?.device_type || 'sensor'
  }

  const mapDeviceNames = (deviceIds: string[]): Record<string, string> => {
    const result: Record<string, string> = {}
    deviceIds.forEach((id) => {
      result[id] = getFriendlyName(id)
    })
    return result
  }

  return {
    deviceNames,
    loading: false,
    error: null as Error | null,
    getFriendlyName,
    getDisplayName,
    getShortName,
    getDeviceType,
    mapDeviceNames,
    refetch: () => {},
    data: Object.values(deviceNames),
  }
}

