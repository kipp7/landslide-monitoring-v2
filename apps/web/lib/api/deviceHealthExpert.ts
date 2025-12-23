import { apiGetJson, apiJson, type ApiSuccessResponse } from '../v2Api'

export type DeviceHealthExpertMetric = 'all' | 'battery' | 'health' | 'signal'

export type DeviceHealthExpertBattery = {
  soc: number
  voltage: number | null
  temperatureC: number | null
  confidence: number
  warnings: string[]
}

export type DeviceHealthExpertSignal = {
  rssi: number | null
  strength: number
  confidence: number
  warnings: string[]
}

export type DeviceHealthExpertHealth = {
  score: number
  level: 'good' | 'warn' | 'bad'
  components: { batteryScore: number; signalScore: number; dataFreshnessScore: number }
  warnings: string[]
}

export type DeviceHealthExpertResult = {
  deviceId: string
  timestamp: string
  analysisType: string
  battery?: DeviceHealthExpertBattery
  signal?: DeviceHealthExpertSignal
  health?: DeviceHealthExpertHealth
  metadata: { apiVersion: string; analysisMethod: string; calculationTime: string; cacheUsed: boolean }
}

export type DeviceHealthExpertAssessment = {
  deviceId: string
  metric: DeviceHealthExpertMetric
  runId: string
  cachedAt?: string
  result: DeviceHealthExpertResult
}

export async function getDeviceHealthExpertAssessment(
  deviceId: string,
  query?: { metric?: DeviceHealthExpertMetric; forceRefresh?: boolean },
): Promise<ApiSuccessResponse<DeviceHealthExpertAssessment>> {
  const params = new URLSearchParams()
  if (query?.metric) params.set('metric', query.metric)
  if (query?.forceRefresh != null) params.set('forceRefresh', String(query.forceRefresh))
  const qs = params.toString()
  return apiGetJson<ApiSuccessResponse<DeviceHealthExpertAssessment>>(
    `/api/v1/devices/${encodeURIComponent(deviceId)}/health/expert${qs ? `?${qs}` : ''}`,
  )
}

export type DeviceHealthExpertHistoryItem = {
  runId: string
  metric: DeviceHealthExpertMetric
  createdAt: string
  result: DeviceHealthExpertResult
}

export type DeviceHealthExpertHistory = { deviceId: string; list: DeviceHealthExpertHistoryItem[] }

export async function getDeviceHealthExpertHistory(
  deviceId: string,
  query?: { metric?: DeviceHealthExpertMetric; limit?: number },
): Promise<ApiSuccessResponse<DeviceHealthExpertHistory>> {
  const params = new URLSearchParams()
  if (query?.metric) params.set('metric', query.metric)
  if (query?.limit != null) params.set('limit', String(query.limit))
  const qs = params.toString()
  return apiGetJson<ApiSuccessResponse<DeviceHealthExpertHistory>>(
    `/api/v1/devices/${encodeURIComponent(deviceId)}/health/expert/history${qs ? `?${qs}` : ''}`,
  )
}

export type DeviceHealthExpertAction = 'recalibrate' | 'reset_baseline' | 'update_config'

export type DeviceHealthExpertActionRequest = { action: DeviceHealthExpertAction; parameters?: Record<string, unknown> }

export type DeviceHealthExpertActionResponse = {
  deviceId: string
  action: DeviceHealthExpertAction
  actionId: string
  parameters: Record<string, unknown>
  message: string
}

export async function postDeviceHealthExpertAction(
  deviceId: string,
  body: DeviceHealthExpertActionRequest,
): Promise<ApiSuccessResponse<DeviceHealthExpertActionResponse>> {
  return apiJson<ApiSuccessResponse<DeviceHealthExpertActionResponse>>(
    `/api/v1/devices/${encodeURIComponent(deviceId)}/health/expert`,
    body,
  )
}

