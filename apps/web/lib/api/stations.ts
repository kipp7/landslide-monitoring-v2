import { apiDeleteJson, apiGetJson, apiJson, apiPutJson, type ApiSuccessResponse } from '../v2Api'

export type StationRow = {
  stationId: string
  stationCode: string
  stationName: string
  status: 'active' | 'inactive' | 'maintenance'
  latitude: number | null
  longitude: number | null
  altitude: number | null
  createdAt: string
  updatedAt: string
  metadata?: Record<string, unknown>
}

export type StationListResponse = {
  list: StationRow[]
  pagination: { page: number; pageSize: number; total: number; totalPages: number }
}

export type StationDetailResponse = StationRow

export type CreateStationRequest = {
  stationCode: string
  stationName: string
  latitude?: number
  longitude?: number
  metadata?: Record<string, unknown>
}

export type UpdateStationRequest = {
  stationName?: string
  status?: StationRow['status']
  latitude?: number | null
  longitude?: number | null
  metadata?: Record<string, unknown>
}

export async function listStations(page = 1, pageSize = 200): Promise<ApiSuccessResponse<StationListResponse>> {
  return apiGetJson<ApiSuccessResponse<StationListResponse>>(`/api/v1/stations?page=${page}&pageSize=${pageSize}`)
}

export async function getStationDetail(stationId: string): Promise<ApiSuccessResponse<StationDetailResponse>> {
  return apiGetJson<ApiSuccessResponse<StationDetailResponse>>(`/api/v1/stations/${encodeURIComponent(stationId)}`)
}

export async function createStation(body: CreateStationRequest): Promise<ApiSuccessResponse<unknown>> {
  return apiJson<ApiSuccessResponse<unknown>>('/api/v1/stations', body)
}

export async function updateStation(stationId: string, body: UpdateStationRequest): Promise<ApiSuccessResponse<unknown>> {
  return apiPutJson<ApiSuccessResponse<unknown>>(`/api/v1/stations/${encodeURIComponent(stationId)}`, body)
}

export async function deleteStation(stationId: string): Promise<ApiSuccessResponse<unknown>> {
  return apiDeleteJson<ApiSuccessResponse<unknown>>(`/api/v1/stations/${encodeURIComponent(stationId)}`)
}

