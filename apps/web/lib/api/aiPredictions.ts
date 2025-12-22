import { apiGetJson, type ApiSuccessResponse } from '../v2Api'

export type AiPredictionRow = {
  predictionId: string
  deviceId: string
  stationId: string | null
  modelKey: string
  modelVersion: string | null
  horizonSeconds: number
  predictedTs: string
  riskScore: number
  riskLevel: 'low' | 'medium' | 'high' | null
  explain: string | null
  payload: Record<string, unknown>
  createdAt: string
}

export type PaginatedAiPredictions = {
  list: AiPredictionRow[]
  pagination: { page: number; pageSize: number; total: number; totalPages: number }
}

export type ListAiPredictionsQuery = {
  page: number
  pageSize: number
  deviceId?: string
  stationId?: string
  modelKey?: string
  startTime?: string
  endTime?: string
  order?: 'asc' | 'desc'
}

export async function listAiPredictions(query: ListAiPredictionsQuery): Promise<ApiSuccessResponse<PaginatedAiPredictions>> {
  const params = new URLSearchParams()
  params.set('page', String(query.page))
  params.set('pageSize', String(query.pageSize))
  if (query.deviceId && query.deviceId.trim()) params.set('deviceId', query.deviceId.trim())
  if (query.stationId && query.stationId.trim()) params.set('stationId', query.stationId.trim())
  if (query.modelKey && query.modelKey.trim()) params.set('modelKey', query.modelKey.trim())
  if (query.startTime && query.startTime.trim()) params.set('startTime', query.startTime.trim())
  if (query.endTime && query.endTime.trim()) params.set('endTime', query.endTime.trim())
  if (query.order) params.set('order', query.order)
  return apiGetJson<ApiSuccessResponse<PaginatedAiPredictions>>(`/api/v1/ai/predictions?${params.toString()}`)
}

export async function getAiPrediction(predictionId: string): Promise<ApiSuccessResponse<AiPredictionRow>> {
  return apiGetJson<ApiSuccessResponse<AiPredictionRow>>(`/api/v1/ai/predictions/${encodeURIComponent(predictionId)}`)
}

