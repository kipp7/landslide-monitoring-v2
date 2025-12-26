'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { listDevices } from '../../lib/api/devices'
import { listLegacyDeviceMappings, type LegacyDeviceMappingRow } from '../../lib/api/legacyDeviceMappings'

export interface DeviceMapping {
  simple_id: string
  actual_device_id: string
  device_name: string
  location_name: string
  device_type: string
  latitude: number
  longitude: number
  status: string
  description: string
  install_date: string
  last_data_time: string
  online_status: 'online' | 'offline' | 'maintenance'
}

function normalizeMapping(row: LegacyDeviceMappingRow): DeviceMapping {
  const onlineRaw = (row.online_status ?? '').toLowerCase()
  const online_status: DeviceMapping['online_status'] =
    onlineRaw === 'online' || onlineRaw === 'maintenance' ? onlineRaw : 'offline'

  return {
    simple_id: row.simple_id,
    actual_device_id: row.actual_device_id,
    device_name: row.device_name || row.location_name || row.simple_id,
    location_name: row.location_name || '',
    device_type: row.device_type || 'sensor',
    latitude: typeof row.latitude === 'number' ? row.latitude : 0,
    longitude: typeof row.longitude === 'number' ? row.longitude : 0,
    status: row.status || 'active',
    description: row.description || '',
    install_date: row.install_date || '',
    last_data_time: row.last_data_time || '',
    online_status,
  }
}

function fallbackMappings(): DeviceMapping[] {
  return [
    {
      simple_id: 'device_1',
      actual_device_id: '6815a14f9314d118511807c6_rk2206',
      device_name: '榫欓棬婊戝潯鐩戞祴绔?',
      location_name: '闃插煄娓崕鐭抽晣榫欓棬鏉?',
      device_type: 'rk2206',
      latitude: 22.817,
      longitude: 108.3669,
      status: 'active',
      description: 'RK2206 婊戝潯鐩戞祴绔?',
      install_date: new Date().toISOString(),
      last_data_time: new Date().toISOString(),
      online_status: 'online',
    },
  ]
}

export default function useDeviceMappings() {
  const [mappings, setMappings] = useState<DeviceMapping[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const fetchMappings = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const result = await listLegacyDeviceMappings()
      if (result && typeof result === 'object' && 'success' in result && result.success === true) {
        const rows = Array.isArray(result.data) ? result.data : []
        setMappings(rows.map(normalizeMapping))
        return
      }

      const msg =
        result && typeof result === 'object' && 'message' in result && typeof result.message === 'string'
          ? result.message
          : '鑾峰彇璁惧鏄犲皠澶辫触'
      throw new Error(msg)
    } catch (caught) {
      console.error('鑾峰彇璁惧鏄犲皠澶辫触:', caught)
      setMappings(fallbackMappings())
      setError(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchMappings()
  }, [fetchMappings])

  const bySimpleId = useMemo(() => {
    const map = new Map<string, DeviceMapping>()
    for (const m of mappings) map.set(m.simple_id, m)
    return map
  }, [mappings])

  const byActualId = useMemo(() => {
    const map = new Map<string, DeviceMapping>()
    for (const m of mappings) map.set(m.actual_device_id, m)
    return map
  }, [mappings])

  const getDeviceBySimpleId = (simpleId: string): DeviceMapping | undefined => bySimpleId.get(simpleId)
  const getDeviceByActualId = (actualId: string): DeviceMapping | undefined => byActualId.get(actualId)

  const getDeviceName = (deviceId: string): string => {
    const bySimple = getDeviceBySimpleId(deviceId)
    if (bySimple) return bySimple.device_name

    const byActual = getDeviceByActualId(deviceId)
    if (byActual) return byActual.device_name

    return deviceId
  }

  const getDeviceLocation = (deviceId: string) => {
    const device = getDeviceBySimpleId(deviceId) || getDeviceByActualId(deviceId)
    if (!device) return null
    return {
      location_name: device.location_name,
      latitude: device.latitude,
      longitude: device.longitude,
      device_type: device.device_type,
    }
  }

  const getOnlineDeviceCount = (): number => {
    return mappings.filter((device) => device.online_status === 'online').length
  }

  const getDeviceStats = () => {
    const total = mappings.length
    const online = mappings.filter((d) => d.online_status === 'online').length
    const offline = mappings.filter((d) => d.online_status === 'offline').length
    const maintenance = mappings.filter((d) => d.online_status === 'maintenance').length

    return {
      total,
      online,
      offline,
      maintenance,
      onlineRate: total > 0 ? Math.round((online / total) * 100) : 0,
    }
  }

  const getDevicesByType = () => {
    const grouped: Record<string, DeviceMapping[]> = {}
    mappings.forEach((device) => {
      if (!grouped[device.device_type]) grouped[device.device_type] = []
      grouped[device.device_type]!.push(device)
    })
    return grouped
  }

  const getRecentActiveDevices = (limit = 5) => {
    return [...mappings]
      .filter((device) => device.last_data_time)
      .sort((a, b) => new Date(b.last_data_time).getTime() - new Date(a.last_data_time).getTime())
      .slice(0, limit)
  }

  const createNameMapping = (): Record<string, string> => {
    const nameMap: Record<string, string> = {}
    mappings.forEach((device) => {
      nameMap[device.simple_id] = device.device_name
    })
    return nameMap
  }

  const getDeviceDetails = async (simpleId: string) => {
    const mapping = getDeviceBySimpleId(simpleId) || getDeviceByActualId(simpleId)
    const deviceId = mapping?.actual_device_id || simpleId

    try {
      const json = await listDevices({ page: 1, pageSize: 1, keyword: deviceId })
      const device = json.data?.list?.[0] ?? null
      return { mapping: mapping ?? null, device }
    } catch (caught) {
      if (mapping) return { mapping, device: null }
      throw caught
    }
  }

  return {
    mappings,
    loading,
    error,
    getDeviceBySimpleId,
    getDeviceByActualId,
    getDeviceName,
    getDeviceLocation,
    getDeviceDetails,
    getOnlineDeviceCount,
    getDeviceStats,
    getDevicesByType,
    getRecentActiveDevices,
    createNameMapping,
    refetch: fetchMappings,
  }
}

