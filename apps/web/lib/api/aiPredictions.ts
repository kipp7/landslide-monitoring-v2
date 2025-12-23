import { apiGetJson, type ApiSuccessResponse } from '../v2Api'

export type AiPredictionRiskLevel = 'low' | 'medium' | 'high'

export type AiPredictionRow = {
  predictionId: string
  deviceId: string
  stationId: string | null
  modelKey: string
  modelVersion: string | null
  horizonSeconds: number
  predictedTs: string
  riskScore: number
  riskLevel: AiPredictionRiskLevel | null
  explain: string | null
  payload: unknown
  createdAt: string
}

export type AiPredictionListResponse = {
  page: number
  pageSize: number
  total: number
  list: AiPredictionRow[]
}

export async function listAiPredictions(query?: {
  page?: number
  pageSize?: number
  deviceId?: string
  stationId?: string
  modelKey?: string
  riskLevel?: AiPredictionRiskLevel
  startTime?: string
  endTime?: string
}): Promise<ApiSuccessResponse<AiPredictionListResponse>> {
  const params = new URLSearchParams()
  if (query?.page != null) params.set('page', String(query.page))
  if (query?.pageSize != null) params.set('pageSize', String(query.pageSize))
  if (query?.deviceId) params.set('deviceId', query.deviceId)
  if (query?.stationId) params.set('stationId', query.stationId)
  if (query?.modelKey) params.set('modelKey', query.modelKey)
  if (query?.riskLevel) params.set('riskLevel', query.riskLevel)
  if (query?.startTime) params.set('startTime', query.startTime)
  if (query?.endTime) params.set('endTime', query.endTime)
  const qs = params.toString()
  return apiGetJson<ApiSuccessResponse<AiPredictionListResponse>>(`/api/v1/ai/predictions${qs ? `?${qs}` : ''}`)
}

export async function getAiPrediction(predictionId: string): Promise<ApiSuccessResponse<AiPredictionRow>> {
  return apiGetJson<ApiSuccessResponse<AiPredictionRow>>(`/api/v1/ai/predictions/${encodeURIComponent(predictionId)}`)
}

