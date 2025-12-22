import { apiGetJson, apiPutJson, type ApiSuccessResponse } from '../v2Api'

export type DeviceRow = {
  deviceId: string
  deviceName?: string
  deviceType?: string
  stationId?: string | null
  status: 'inactive' | 'active' | 'revoked'
  lastSeenAt?: string | null
  createdAt: string
  metadata?: Record<string, unknown>
}

export type PaginatedDevices = {
  list: DeviceRow[]
  pagination: { page: number; pageSize: number; total: number; totalPages: number }
}

export type ListDevicesQuery = {
  page: number
  pageSize: number
  keyword?: string
  status?: string
  stationId?: string
  deviceType?: string
}

export async function listDevices(query: ListDevicesQuery): Promise<ApiSuccessResponse<PaginatedDevices>> {
  const params = new URLSearchParams()
  params.set('page', String(query.page))
  params.set('pageSize', String(query.pageSize))
  if (query.keyword && query.keyword.trim()) params.set('keyword', query.keyword.trim())
  if (query.status && query.status.trim()) params.set('status', query.status.trim())
  if (query.stationId && query.stationId.trim()) params.set('stationId', query.stationId.trim())
  if (query.deviceType && query.deviceType.trim()) params.set('deviceType', query.deviceType.trim())
  return apiGetJson<ApiSuccessResponse<PaginatedDevices>>(`/api/v1/devices?${params.toString()}`)
}

export type DeviceStateResponse = {
  deviceId: string
  updatedAt: string
  state: { metrics: Record<string, unknown>; meta?: Record<string, unknown> }
}

export async function getDeviceState(deviceId: string): Promise<ApiSuccessResponse<DeviceStateResponse>> {
  return apiGetJson<ApiSuccessResponse<DeviceStateResponse>>(`/api/v1/data/state/${encodeURIComponent(deviceId)}`)
}

export async function putDeviceSensors(
  deviceId: string,
  sensors: Array<{ sensorKey: string; status: 'enabled' | 'disabled' | 'missing' }>
): Promise<ApiSuccessResponse<unknown>> {
  return apiPutJson<ApiSuccessResponse<unknown>>(`/api/v1/devices/${encodeURIComponent(deviceId)}/sensors`, { sensors })
}

export type DeviceSensorsResponse = {
  deviceId: string
  list: Array<{
    sensorKey: string
    status: 'enabled' | 'disabled' | 'missing'
    displayName: string
    unit: string
    dataType: 'float' | 'int' | 'bool' | 'string'
  }>
}

export async function getDeviceSensors(deviceId: string): Promise<ApiSuccessResponse<DeviceSensorsResponse>> {
  return apiGetJson<ApiSuccessResponse<DeviceSensorsResponse>>(`/api/v1/devices/${encodeURIComponent(deviceId)}/sensors`)
}
