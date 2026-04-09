'use client'

import { useCallback, useEffect, useState } from 'react'
import { loadDeviceSnapshotView, type DeviceSnapshotView } from '../../../../lib/api/deviceStateView'
import { listDevices, type DeviceRow as ApiDeviceRow } from '../../../../lib/api/devices'
import {
  listLegacyDeviceMappings,
  type LegacyDeviceMappingRow,
  type LegacyErrorResponse,
  type LegacyOkResponse,
} from '../../../../lib/api/legacyDeviceMappings'

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

const SNAPSHOT_OFFLINE_FALLBACK = 'offline' as const
const DEFAULT_PAGE_SIZE = 200

function slugifyRegionName(name: string): string {
  const normalized = name.trim().toLowerCase()
  const ascii = normalized
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return ascii || 'unassigned'
}

function parseInstallDate(value?: string | null): string {
  if (typeof value === 'string' && value.trim()) return value
  return new Date(0).toISOString()
}

function parseLastDataTime(input: {
  snapshot?: DeviceSnapshotView | null
  mapping?: LegacyDeviceMappingRow
  device?: ApiDeviceRow
}): string {
  if (input.snapshot?.last_data_time) return input.snapshot.last_data_time
  if (input.mapping?.last_data_time) return input.mapping.last_data_time
  if (input.device?.lastSeenAt) return input.device.lastSeenAt
  return input.device?.createdAt || new Date(0).toISOString()
}

function deriveOnlineStatus(input: {
  snapshot?: DeviceSnapshotView | null
  mapping?: LegacyDeviceMappingRow
  device?: ApiDeviceRow
}): DeviceRow['online_status'] {
  if (input.snapshot?.status === 'online') return 'online'
  if (input.snapshot?.status === 'offline') return 'offline'
  if (input.mapping?.online_status === 'online') return 'online'
  if (input.mapping?.online_status === 'maintenance') return 'maintenance'
  if (input.device?.status === 'active' && input.device.lastSeenAt) return 'online'
  return 'offline'
}

async function loadAllDevices(): Promise<ApiDeviceRow[]> {
  const firstPage = await listDevices({ page: 1, pageSize: DEFAULT_PAGE_SIZE })
  const list = [...(firstPage.data?.list ?? [])]
  const totalPages = firstPage.data?.pagination?.totalPages ?? 1

  for (let page = 2; page <= totalPages; page += 1) {
    const nextPage = await listDevices({ page, pageSize: DEFAULT_PAGE_SIZE })
    list.push(...(nextPage.data?.list ?? []))
  }

  return list
}

async function loadLegacyMappings(): Promise<LegacyDeviceMappingRow[]> {
  const result = (await listLegacyDeviceMappings()) as
    | LegacyOkResponse<LegacyDeviceMappingRow[]>
    | LegacyErrorResponse

  if (result && typeof result === 'object' && 'success' in result && result.success === true) {
    return Array.isArray(result.data) ? result.data : []
  }

  const message =
    result && typeof result === 'object' && 'message' in result && typeof result.message === 'string'
      ? result.message
      : '获取设备映射失败'
  throw new Error(message)
}

function toSyntheticMapping(device: ApiDeviceRow): LegacyDeviceMappingRow {
  return {
    simple_id: device.deviceId,
    actual_device_id: device.deviceId,
    device_name: device.deviceName || device.deviceId,
    location_name: device.stationId || '未分组区域',
    device_type: device.deviceType || '监测设备',
    latitude: null,
    longitude: null,
    status: device.status,
    install_date: device.createdAt,
    last_data_time: device.lastSeenAt || device.createdAt,
    online_status: device.lastSeenAt ? 'online' : 'offline',
  }
}

async function buildHierarchicalDevices(): Promise<HierarchicalDevicesData> {
  const [devices, mappings] = await Promise.all([loadAllDevices(), loadLegacyMappings()])
  const deviceMap = new Map(devices.map((device) => [device.deviceId, device]))
  const mappingRows = mappings.length > 0 ? mappings : devices.map(toSyntheticMapping)

  const snapshots = await Promise.all(
    mappingRows.map(async (mapping) => {
      try {
        const snapshot = await loadDeviceSnapshotView(mapping.simple_id || mapping.actual_device_id)
        return [mapping.actual_device_id, snapshot] as const
      } catch {
        return [mapping.actual_device_id, null] as const
      }
    }),
  )
  const snapshotMap = new Map<string, DeviceSnapshotView | null>(snapshots)

  const allDevices = mappingRows
    .map((mapping) => {
      const actualDeviceId = mapping.actual_device_id || mapping.simple_id
      const device = deviceMap.get(actualDeviceId)
      const snapshot = snapshotMap.get(actualDeviceId)
      const onlineStatus = deriveOnlineStatus({ snapshot, mapping, device })
      const lastDataTime = parseLastDataTime({ snapshot, mapping, device })

      return {
        simple_id: mapping.simple_id || actualDeviceId,
        actual_device_id: actualDeviceId,
        device_name: mapping.device_name || device?.deviceName || actualDeviceId,
        location_name: mapping.location_name || device?.stationId || '未分组区域',
        device_type: mapping.device_type || device?.deviceType || '监测设备',
        latitude: snapshot?.coordinates.lat ?? mapping.latitude ?? null,
        longitude: snapshot?.coordinates.lng ?? mapping.longitude ?? null,
        status: device?.status || mapping.status || onlineStatus,
        online_status: snapshot?.status || onlineStatus || SNAPSHOT_OFFLINE_FALLBACK,
        last_data_time: lastDataTime,
        install_date: parseInstallDate(mapping.install_date || device?.createdAt || null),
        description: mapping.description,
        today_data_count: snapshot?.data_count_today ?? 0,
        baseline_established: snapshot?.baseline_established ?? false,
        health_score: snapshot?.health_score ?? 0,
        battery_level: snapshot?.battery_level ?? 0,
        signal_strength: snapshot?.signal_strength ?? 0,
      } satisfies DeviceRow
    })
    .sort((left, right) => left.simple_id.localeCompare(right.simple_id, 'zh-CN'))

  const regionMap = new Map<string, DeviceRegion>()
  for (const device of allDevices) {
    const regionName = device.location_name || '未分组区域'
    const regionId = slugifyRegionName(regionName)
    const existing = regionMap.get(regionId)
    if (existing) {
      existing.devices.push(device)
      existing.total_devices += 1
      if (device.online_status === 'online') existing.online_devices += 1
      else existing.offline_devices += 1
      continue
    }

    regionMap.set(regionId, {
      id: regionId,
      name: regionName,
      devices: [device],
      total_devices: 1,
      online_devices: device.online_status === 'online' ? 1 : 0,
      offline_devices: device.online_status === 'online' ? 0 : 1,
    })
  }

  const regions = Array.from(regionMap.values()).sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'))
  return {
    regions,
    allDevices: allDevices,
    totalDevices: allDevices.length,
    onlineDevices: allDevices.filter((device) => device.online_status === 'online').length,
    offlineDevices: allDevices.filter((device) => device.online_status !== 'online').length,
  }
}

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
      setData(await buildHierarchicalDevices())
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
