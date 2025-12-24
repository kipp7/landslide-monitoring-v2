import { apiGetJson, type ApiSuccessResponse } from '../v2Api'

export type AnomalyAssessmentItem = {
  anomaly_type: string
  count: number
  severity: 'red' | 'orange' | 'yellow' | 'blue' | 'normal'
  priority: number
  latest_time: string
  color: string
  display_name: string
  recommended_action: string
}

export type AnomalyAssessmentResponse = {
  data: AnomalyAssessmentItem[]
  stats: { total: number; red: number; orange: number; yellow: number; blue: number }
  time_window: number
  processed_at: string
  source: string
}

export async function getAnomalyAssessment(
  timeWindowHours = 24
): Promise<ApiSuccessResponse<AnomalyAssessmentResponse>> {
  const params = new URLSearchParams()
  params.set('timeWindow', String(timeWindowHours))
  return apiGetJson<ApiSuccessResponse<AnomalyAssessmentResponse>>(`/anomaly-assessment?${params.toString()}`)
}

