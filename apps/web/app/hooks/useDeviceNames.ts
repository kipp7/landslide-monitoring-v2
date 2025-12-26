'use client'

import { useEffect, useState } from 'react'
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
    mappings.forEach((mapping) => {
      nameMap[mapping.simple_id] = {
        device_id: mapping.simple_id,
        friendly_name: mapping.device_name,
        display_name: `${mapping.device_name} (${mapping.simple_id})`,
        short_name: mapping.device_name,
        device_type: mapping.device_type,
      }
    })
    setDeviceNames(nameMap)
  }, [mappings])

  const generateFallbackName = (deviceId: string): string => {
    if (!deviceId) return '鏈煡璁惧'

    if (deviceId.includes('_rk2206')) return `婊戝潯鐩戞祴绔?${deviceId.slice(-6)}`

    if (deviceId.includes('_')) {
      const parts = deviceId.split('_')
      return `浼犳劅鍣?${parts[parts.length - 1]}`
    }

    if (deviceId.length > 10) return `璁惧-${deviceId.slice(-6)}`

    return deviceId
  }

  const getFriendlyName = (deviceId: string): string => {
    return deviceNames[deviceId]?.friendly_name || getDeviceName(deviceId) || generateFallbackName(deviceId)
  }

  const getDisplayName = (deviceId: string): string => {
    return deviceNames[deviceId]?.display_name || generateFallbackName(deviceId)
  }

  const getShortName = (deviceId: string): string => {
    return deviceNames[deviceId]?.short_name || generateFallbackName(deviceId)
  }

  const mapDeviceNames = (deviceIds: string[]): Record<string, string> => {
    const result: Record<string, string> = {}
    deviceIds.forEach((id) => {
      result[id] = getFriendlyName(id)
    })
    return result
  }

  const getDeviceType = (deviceId: string): string => {
    return deviceNames[deviceId]?.device_type || 'sensor'
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

