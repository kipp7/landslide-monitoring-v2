import { apiGetJson, apiJson, apiPut, apiPutJson, type ApiSuccessResponse } from '../v2Api'

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

export type CreateDeviceRequest = {
  deviceName?: string
  deviceType?: string
  stationId?: string | null
  metadata?: Record<string, unknown>
}

export type CreateDeviceResponse = {
  deviceId: string
  deviceSecret: string
  schemaVersion: number
  credVersion: number
}

export async function createDevice(body: CreateDeviceRequest): Promise<ApiSuccessResponse<CreateDeviceResponse>> {
  return apiJson<ApiSuccessResponse<CreateDeviceResponse>>('/api/v1/devices', body)
}

export async function revokeDevice(deviceId: string): Promise<ApiSuccessResponse<unknown>> {
  return apiPut<ApiSuccessResponse<unknown>>(`/api/v1/devices/${encodeURIComponent(deviceId)}/revoke`)
}

export type DeviceCommand = {
  commandId: string
  deviceId: string
  commandType: string
  payload: Record<string, unknown>
  status: 'queued' | 'sent' | 'acked' | 'failed' | 'timeout' | 'canceled'
  sentAt?: string | null
  ackedAt?: string | null
  result?: Record<string, unknown>
  errorMessage?: string
  createdAt: string
  updatedAt: string
}

export type PaginatedDeviceCommands = {
  list: DeviceCommand[]
  pagination: { page: number; pageSize: number; total: number; totalPages: number }
}

export type ListDeviceCommandsQuery = {
  page: number
  pageSize: number
  status?: DeviceCommand['status']
}

export async function listDeviceCommands(
  deviceId: string,
  query: ListDeviceCommandsQuery
): Promise<ApiSuccessResponse<PaginatedDeviceCommands>> {
  const params = new URLSearchParams()
  params.set('page', String(query.page))
  params.set('pageSize', String(query.pageSize))
  if (query.status) params.set('status', query.status)
  return apiGetJson<ApiSuccessResponse<PaginatedDeviceCommands>>(
    `/api/v1/devices/${encodeURIComponent(deviceId)}/commands?${params.toString()}`
  )
}

export type CreateDeviceCommandRequest = {
  commandType: string
  payload: Record<string, unknown>
}

export type CreateDeviceCommandResponse = {
  commandId: string
  status: 'queued' | 'sent' | 'acked' | 'failed' | 'timeout'
}

export async function createDeviceCommand(
  deviceId: string,
  body: CreateDeviceCommandRequest
): Promise<ApiSuccessResponse<CreateDeviceCommandResponse>> {
  return apiJson<ApiSuccessResponse<CreateDeviceCommandResponse>>(
    `/api/v1/devices/${encodeURIComponent(deviceId)}/commands`,
    body
  )
}

type DeviceCommandEvent = {
  eventId: string
  eventType: 'COMMAND_SENT' | 'COMMAND_ACKED' | 'COMMAND_FAILED' | 'COMMAND_TIMEOUT'
  commandId: string
  deviceId: string
  status: 'queued' | 'sent' | 'acked' | 'failed' | 'timeout' | 'canceled'
  detail?: string
  result?: Record<string, unknown>
  createdAt: string
  ingestedAt: string
}

type PaginatedDeviceCommandEvents = {
  list: DeviceCommandEvent[]
  pagination: { page: number; pageSize: number; total: number; totalPages: number }
}

export type CommandAuditEventRow = {
  eventId: string
  commandId: string
  eventType: 'COMMAND_SENT' | 'COMMAND_ACKED' | 'COMMAND_FAILED' | 'COMMAND_TIMEOUT'
  createdAt: string
  reasonCode?: string | null
  message?: string | null
  payload?: Record<string, unknown>
}

export type PaginatedCommandAuditEvents = {
  list: CommandAuditEventRow[]
  pagination: { page: number; pageSize: number; total: number; totalPages: number }
}

export type ListDeviceCommandEventsQuery = {
  page: number
  pageSize: number
  commandId?: string
}

export async function listDeviceCommandEvents(
  deviceId: string,
  query: ListDeviceCommandEventsQuery
): Promise<ApiSuccessResponse<PaginatedCommandAuditEvents>> {
  const params = new URLSearchParams()
  params.set('page', String(query.page))
  params.set('pageSize', String(query.pageSize))
  if (query.commandId && query.commandId.trim()) params.set('commandId', query.commandId.trim())

  const json = await apiGetJson<ApiSuccessResponse<PaginatedDeviceCommandEvents>>(
    `/api/v1/devices/${encodeURIComponent(deviceId)}/command-events?${params.toString()}`
  )

  return {
    ...json,
    data: {
      list: (json.data?.list ?? []).map((e) => ({
        eventId: e.eventId,
        commandId: e.commandId,
        eventType: e.eventType,
        createdAt: e.createdAt,
        reasonCode: null,
        message: e.detail ?? null,
        payload: e.result ?? undefined,
      })),
      pagination: json.data?.pagination ?? { page: query.page, pageSize: query.pageSize, total: 0, totalPages: 0 },
    },
  }
}

type DeviceCommandNotification = {
  notificationId: string
  eventId: string
  eventType: 'COMMAND_SENT' | 'COMMAND_ACKED' | 'COMMAND_FAILED' | 'COMMAND_TIMEOUT'
  commandId: string
  deviceId: string
  notifyType: 'app' | 'sms' | 'email' | 'wechat'
  status: 'pending' | 'sent' | 'delivered' | 'failed'
  title: string
  content: string
  errorMessage: string
  createdAt: string
  sentAt?: string | null
  deliveredAt?: string | null
  readAt?: string | null
}

type PaginatedDeviceCommandNotifications = {
  list: DeviceCommandNotification[]
  pagination: { page: number; pageSize: number; total: number; totalPages: number }
}

export type CommandAuditNotificationRow = {
  notificationId: string
  commandId: string
  eventType: 'COMMAND_SENT' | 'COMMAND_ACKED' | 'COMMAND_FAILED' | 'COMMAND_TIMEOUT'
  notifyType: 'app' | 'sms' | 'email' | 'wechat'
  status: 'pending' | 'sent' | 'delivered' | 'failed'
  isRead: boolean
  createdAt: string
  updatedAt: string
  payload?: Record<string, unknown>
}

export type PaginatedCommandAuditNotifications = {
  list: CommandAuditNotificationRow[]
  pagination: { page: number; pageSize: number; total: number; totalPages: number }
}

export type ListDeviceCommandNotificationsQuery = {
  page: number
  pageSize: number
  commandId?: string
}

export async function listDeviceCommandNotifications(
  deviceId: string,
  query: ListDeviceCommandNotificationsQuery
): Promise<ApiSuccessResponse<PaginatedCommandAuditNotifications>> {
  const params = new URLSearchParams()
  params.set('page', String(query.page))
  params.set('pageSize', String(query.pageSize))
  if (query.commandId && query.commandId.trim()) params.set('commandId', query.commandId.trim())

  const json = await apiGetJson<ApiSuccessResponse<PaginatedDeviceCommandNotifications>>(
    `/api/v1/devices/${encodeURIComponent(deviceId)}/command-notifications?${params.toString()}`
  )

  return {
    ...json,
    data: {
      list: (json.data?.list ?? []).map((n) => ({
        notificationId: n.notificationId,
        commandId: n.commandId,
        eventType: n.eventType,
        notifyType: n.notifyType,
        status: n.status,
        isRead: Boolean(n.readAt),
        createdAt: n.createdAt,
        updatedAt: n.sentAt ?? n.createdAt,
        payload: { title: n.title, content: n.content, errorMessage: n.errorMessage },
      })),
      pagination: json.data?.pagination ?? { page: query.page, pageSize: query.pageSize, total: 0, totalPages: 0 },
    },
  }
}

export type MarkNotificationReadResponse = { notificationId: string; readAt: string }

export async function markDeviceCommandNotificationRead(
  deviceId: string,
  notificationId: string
): Promise<ApiSuccessResponse<MarkNotificationReadResponse>> {
  return apiPut<ApiSuccessResponse<MarkNotificationReadResponse>>(
    `/api/v1/devices/${encodeURIComponent(deviceId)}/command-notifications/${encodeURIComponent(notificationId)}/read`
  )
}
