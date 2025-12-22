import { apiDeleteJson, apiGetJson, apiPutJson, type ApiSuccessResponse } from '../v2Api'

export type GpsBaselinePayload = {
  latitude: number
  longitude: number
  altitude?: number
  positionAccuracyMeters?: number
  satelliteCount?: number
  notes?: string
}

export type GpsBaselineRow = {
  deviceId: string
  deviceName: string
  stationId: string | null
  method: 'auto' | 'manual'
  pointsCount: number | null
  baseline: GpsBaselinePayload
  computedAt: string
  updatedAt: string
}

export type PaginatedGpsBaselines = {
  list: GpsBaselineRow[]
  pagination: { page: number; pageSize: number; total: number; totalPages: number }
}

export type ListGpsBaselinesQuery = { page: number; pageSize: number; keyword?: string }

export async function listGpsBaselines(query: ListGpsBaselinesQuery): Promise<ApiSuccessResponse<PaginatedGpsBaselines>> {
  const params = new URLSearchParams()
  params.set('page', String(query.page))
  params.set('pageSize', String(query.pageSize))
  if (query.keyword && query.keyword.trim()) params.set('keyword', query.keyword.trim())
  return apiGetJson<ApiSuccessResponse<PaginatedGpsBaselines>>(`/api/v1/gps/baselines?${params.toString()}`)
}

export async function getGpsBaseline(deviceId: string): Promise<ApiSuccessResponse<GpsBaselineRow>> {
  return apiGetJson<ApiSuccessResponse<GpsBaselineRow>>(`/api/v1/gps/baselines/${encodeURIComponent(deviceId)}`)
}

export type UpsertGpsBaselineRequest = {
  method?: 'auto' | 'manual'
  pointsCount?: number
  baseline: GpsBaselinePayload
}

export async function upsertGpsBaseline(
  deviceId: string,
  body: UpsertGpsBaselineRequest,
): Promise<ApiSuccessResponse<{ deviceId: string }>> {
  return apiPutJson<ApiSuccessResponse<{ deviceId: string }>>(`/api/v1/gps/baselines/${encodeURIComponent(deviceId)}`, body)
}

export async function deleteGpsBaseline(deviceId: string): Promise<ApiSuccessResponse<{ deviceId: string }>> {
  return apiDeleteJson<ApiSuccessResponse<{ deviceId: string }>>(`/api/v1/gps/baselines/${encodeURIComponent(deviceId)}`)
}
