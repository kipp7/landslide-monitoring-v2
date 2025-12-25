'use client'

import { useEffect, useMemo, useState } from 'react'
import useDeviceMappings from './useDeviceMappings'

export interface DeviceNameMapping {
  device_id: string
  friendly_name: string
  display_name: string
  short_name: string
  device_type: string
}

export default function useDeviceNames() {
  const { mappings, loading, error, getDeviceName, refetch } = useDeviceMappings()
  const [deviceNames, setDeviceNames] = useState<Record<string, DeviceNameMapping>>({})

  useEffect(() => {
    const nameMap: Record<string, DeviceNameMapping> = {}
    for (const mapping of mappings) {
      const friendly = mapping.device_name || mapping.location_name || mapping.simple_id
      const row: DeviceNameMapping = {
        device_id: mapping.simple_id,
        friendly_name: friendly,
        display_name: `${friendly} (${mapping.simple_id})`,
        short_name: friendly,
        device_type: mapping.device_type || 'sensor',
      }

      if (mapping.simple_id) nameMap[mapping.simple_id] = row
      if (mapping.actual_device_id) nameMap[mapping.actual_device_id] = row
    }
    setDeviceNames(nameMap)
  }, [mappings])

  const generateFallbackName = useMemo(() => {
    return (deviceId: string): string => {
      if (!deviceId) return '未知设备'

      if (deviceId === 'device_1') return '龙门滑坡监测站'
      if (deviceId === 'device_2') return '坡顶监测站'
      if (deviceId === 'device_3') return '坡脚监测站'

      if (deviceId.includes('_rk2206')) return `滑坡监测站-${deviceId.slice(-6)}`

      if (deviceId.includes('_')) {
        const parts = deviceId.split('_')
        return `传感器-${parts[parts.length - 1]}`
      }

      if (deviceId.length > 10) return `设备-${deviceId.slice(-6)}`

      return deviceId
    }
  }, [])

  const getFriendlyName = (deviceId: string): string => {
    return deviceNames[deviceId]?.friendly_name || getDeviceName(deviceId) || generateFallbackName(deviceId)
  }

  const getDisplayName = (deviceId: string): string => {
    return deviceNames[deviceId]?.display_name || getFriendlyName(deviceId)
  }

  const getShortName = (deviceId: string): string => {
    return deviceNames[deviceId]?.short_name || getFriendlyName(deviceId)
  }

  const getDeviceType = (deviceId: string): string => {
    return deviceNames[deviceId]?.device_type || 'sensor'
  }

  const mapDeviceNames = (deviceIds: string[]): Record<string, string> => {
    const result: Record<string, string> = {}
    for (const id of deviceIds) result[id] = getFriendlyName(id)
    return result
  }

  return {
    deviceNames,
    loading,
    error,
    getFriendlyName,
    getDisplayName,
    getShortName,
    getDeviceType,
    mapDeviceNames,
    refetch,
    data: Object.values(deviceNames),
  }
}
