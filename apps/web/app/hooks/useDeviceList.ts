'use client'

import { useCallback, useEffect, useState } from 'react'

export interface DeviceInfo {
  id: string
  name: string
  type: string
  manufacturer: string
  serialNumber: string
  firmwareVersion: string
  installDate: string
  lastCheck: string
  status: 'online' | 'offline' | 'maintenance'
  device_id: string
  friendly_name: string
  display_name: string
  model: string
  last_active: string
}

type ApiSuccessResponse<T> = {
  success: true
  code: number
  message: string
  data: T
  timestamp: string
  traceId: string
}

type PaginatedDevices = {
  list: Array<{
    deviceId: string
    deviceName?: string
    deviceType?: string
    status: 'inactive' | 'active' | 'revoked'
    lastSeenAt?: string | null
    createdAt: string
    metadata?: Record<string, unknown>
  }>
  pagination: {
    page: number
    pageSize: number
    total: number
    totalPages: number
  }
}

function getApiBaseUrl(): string {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL
  return base ? base.replace(/\/+$/, '') : ''
}

function buildApiUrl(path: string): string {
  const base = getApiBaseUrl()
  if (!base) return path
  return `${base}${path.startsWith('/') ? '' : '/'}${path}`
}

function formatDate(dateString?: string | null): string {
  if (!dateString) return '未知'
  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) return '未知'
  return date.toLocaleDateString('zh-CN')
}

function getDeviceTypeDisplay(deviceType?: string): string {
  const typeMap: Record<string, string> = {
    rk2206: 'RK2206 滑坡监测站',
    sensor: '传感器节点',
    gateway: '网关设备',
    default: '监测设备',
  }
  if (!deviceType) return typeMap.default
  return typeMap[deviceType] || typeMap.default
}

function determineDeviceStatus(
  apiStatus: 'inactive' | 'active' | 'revoked',
  lastSeenAt?: string | null
): 'online' | 'offline' | 'maintenance' {
  if (apiStatus !== 'active') return 'offline'
  if (!lastSeenAt) return 'offline'
  const last = new Date(lastSeenAt).getTime()
  if (Number.isNaN(last)) return 'offline'
  return Date.now() - last < 5 * 60 * 1000 ? 'online' : 'offline'
}

export default function useDeviceList() {
  const [devices, setDevices] = useState<DeviceInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const fetchDevices = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const url = buildApiUrl('/api/v1/devices?page=1&pageSize=100')
      const resp = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      })

      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status} ${resp.statusText}`)
      }

      const json = (await resp.json()) as ApiSuccessResponse<PaginatedDevices>
      const list = json.data?.list ?? []

      const mapped = list.map((device) => {
        const deviceId = device.deviceId
        const name = device.deviceName || deviceId
        const deviceType = getDeviceTypeDisplay(device.deviceType)
        const lastSeenAt = device.lastSeenAt ?? undefined

        return {
          id: deviceId,
          device_id: deviceId,
          name,
          friendly_name: name,
          display_name: name,
          type: deviceType,
          manufacturer: String(device.metadata?.manufacturer ?? 'Huawei IoT'),
          model: String(device.metadata?.model ?? device.deviceType ?? 'unknown'),
          serialNumber: deviceId.slice(-8),
          firmwareVersion: String(device.metadata?.firmwareVersion ?? 'unknown'),
          installDate: formatDate(device.createdAt),
          lastCheck: formatDate(lastSeenAt),
          last_active: lastSeenAt || device.createdAt,
          status: determineDeviceStatus(device.status, lastSeenAt),
        }
      })

      setDevices(mapped)
    } catch (caught) {
      const err = caught instanceof Error ? caught : new Error(String(caught))
      setError(err)
      setDevices([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchDevices()
  }, [fetchDevices])

  const getDeviceStats = () => {
    const total = devices.length
    const online = devices.filter((d) => d.status === 'online').length
    const offline = devices.filter((d) => d.status === 'offline').length
    const maintenance = devices.filter((d) => d.status === 'maintenance').length

    return {
      total,
      online,
      offline,
      maintenance,
      onlineRate: total > 0 ? Math.round((online / total) * 100) : 0,
    }
  }

  const getDevicesByType = () => {
    const grouped: Record<string, DeviceInfo[]> = {}
    devices.forEach((device) => {
      if (!grouped[device.type]) grouped[device.type] = []
      grouped[device.type].push(device)
    })
    return grouped
  }

  const getRecentActiveDevices = (limit = 5) => {
    return [...devices]
      .sort((a, b) => new Date(b.last_active).getTime() - new Date(a.last_active).getTime())
      .slice(0, limit)
  }

  return {
    devices,
    loading,
    error,
    stats: getDeviceStats(),
    devicesByType: getDevicesByType(),
    recentActiveDevices: getRecentActiveDevices(),
    refetch: fetchDevices,
  }
}
