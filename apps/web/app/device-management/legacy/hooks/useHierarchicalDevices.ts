'use client'

import { useCallback, useEffect, useState } from 'react'
import { apiGetJson } from '../../../../lib/v2Api'

export type DeviceRow = {
  simple_id: string
  actual_device_id: string
  device_name: string
  location_name: string
  device_type: string
  latitude: number | null
  longitude: number | null
  status: string
  online_status: 'online' | 'offline' | 'maintenance'
  last_data_time: string
  install_date: string
  description?: string
  today_data_count?: number
  baseline_established?: boolean
  health_score?: number
  battery_level?: number
  signal_strength?: number
}

export type DeviceRegion = {
  id: string
  name: string
  devices: DeviceRow[]
  total_devices: number
  online_devices: number
  offline_devices: number
}

export type HierarchicalDevicesData = {
  regions: DeviceRegion[]
  allDevices: DeviceRow[]
  totalDevices: number
  onlineDevices: number
  offlineDevices: number
}

type LegacyOk<T> = { success: true; data: T; message?: string; timestamp?: string }
type LegacyErr = { success: false; message: string; error?: unknown; timestamp?: string }

export function useHierarchicalDevices() {
  const [data, setData] = useState<HierarchicalDevicesData>({
    regions: [],
    allDevices: [],
    totalDevices: 0,
    onlineDevices: 0,
    offlineDevices: 0,
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchHierarchicalDevices = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const result = await apiGetJson<LegacyOk<HierarchicalDevicesData> | LegacyErr>('/api/device-management/hierarchical')

      if (result && typeof result === 'object' && 'success' in result && result.success === true) {
        setData(result.data)
        return
      }

      const msg = result && typeof result === 'object' && 'message' in result && typeof result.message === 'string' ? result.message : '获取分层设备数据失败'
      throw new Error(msg)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
      setData({
        regions: [],
        allDevices: [],
        totalDevices: 0,
        onlineDevices: 0,
        offlineDevices: 0,
      })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchHierarchicalDevices()
  }, [fetchHierarchicalDevices])

  const getDeviceBySimpleId = useCallback(
    (simpleId: string): DeviceRow | null => {
      for (const region of data.regions) {
        const device = region.devices.find((d) => d.simple_id === simpleId)
        if (device) return device
      }
      return null
    },
    [data.regions],
  )

  const getDevicesByRegion = useCallback(
    (regionId: string): DeviceRow[] => {
      const region = data.regions.find((r) => r.id === regionId)
      return region ? region.devices : []
    },
    [data.regions],
  )

  return {
    data,
    loading,
    error,
    fetchHierarchicalDevices,
    getDeviceBySimpleId,
    getDevicesByRegion,
  }
}

