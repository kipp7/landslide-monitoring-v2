import { apiGetJson, apiJson, type ApiSuccessResponse } from '../v2Api'

export type DataSeriesPointRow = { ts: string; value: unknown }

export type DataSeriesRow = {
  sensorKey: string
  unit?: string
  dataType?: string
  points: DataSeriesPointRow[]
}

export type DataSeriesMissingRow = { sensorKey: string; reason: string }

export type GetDeviceSeriesQuery = {
  deviceId: string
  startTime: string
  endTime: string
  sensorKeys: string[]
  interval: 'raw' | '1m' | '5m' | '1h' | '1d'
  timeField: 'received' | 'event'
}

export type GetDeviceSeriesResponse = {
  deviceId: string
  startTime: string
  endTime: string
  interval: string
  series: DataSeriesRow[]
  missing: DataSeriesMissingRow[]
}

export async function getDeviceSeries(query: GetDeviceSeriesQuery): Promise<ApiSuccessResponse<GetDeviceSeriesResponse>> {
  const params = new URLSearchParams()
  params.set('startTime', query.startTime)
  params.set('endTime', query.endTime)
  params.set('sensorKeys', query.sensorKeys.join(','))
  params.set('interval', query.interval)
  params.set('timeField', query.timeField)

  return apiGetJson<ApiSuccessResponse<GetDeviceSeriesResponse>>(
    `/api/v1/data/series/${encodeURIComponent(query.deviceId)}?${params.toString()}`,
  )
}

export type RawPointRow = {
  receivedTs: string
  eventTs: string | null
  seq: number | null
  value: unknown
  quality: number | null
}

export type GetDeviceRawQuery = {
  deviceId: string
  startTime: string
  endTime: string
  sensorKey: string
  limit?: number
  order?: 'asc' | 'desc'
}

export type GetDeviceRawResponse = { deviceId: string; sensorKey: string; list: RawPointRow[] }

export async function getDeviceRaw(query: GetDeviceRawQuery): Promise<ApiSuccessResponse<GetDeviceRawResponse>> {
  const params = new URLSearchParams()
  params.set('startTime', query.startTime)
  params.set('endTime', query.endTime)
  params.set('sensorKey', query.sensorKey)
  if (query.limit) params.set('limit', String(query.limit))
  if (query.order) params.set('order', query.order)

  return apiGetJson<ApiSuccessResponse<GetDeviceRawResponse>>(
    `/api/v1/data/raw/${encodeURIComponent(query.deviceId)}?${params.toString()}`,
  )
}

export type ExportTelemetryRequest = {
  scope: 'device' | 'station'
  deviceId?: string
  stationId?: string
  startTime: string
  endTime: string
  sensorKeys: string[]
  format: 'csv' | 'json'
}

export type ExportTelemetryRow = { deviceId: string; sensorKey: string; receivedTs: string; value: unknown }

export type ExportTelemetryResponse =
  | { format: 'csv'; rows: number; data: string; limitHit?: boolean }
  | { format: 'json'; rows: number; data: ExportTelemetryRow[]; limitHit?: boolean }

export async function exportData(body: ExportTelemetryRequest): Promise<ApiSuccessResponse<ExportTelemetryResponse>> {
  return apiJson<ApiSuccessResponse<ExportTelemetryResponse>>('/api/v1/data/export', body)
}

