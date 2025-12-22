import { apiGetJson, apiJson, type ApiSuccessResponse } from '../v2Api'

export type AlertRow = {
  alertId: string
  status: 'active' | 'acked' | 'resolved'
  severity: 'low' | 'medium' | 'high' | 'critical'
  title?: string | null
  deviceId?: string | null
  stationId?: string | null
  lastEventAt: string
}

export type AlertsListResponse = {
  list: AlertRow[]
  pagination: { page: number; pageSize: number; total: number; totalPages: number }
}

export type AlertsQuery = {
  page: number
  pageSize: number
  startTime: string
  endTime: string
  status?: AlertRow['status']
  severity?: AlertRow['severity']
}

export async function listAlerts(query: AlertsQuery): Promise<ApiSuccessResponse<AlertsListResponse>> {
  const params = new URLSearchParams()
  params.set('page', String(query.page))
  params.set('pageSize', String(query.pageSize))
  params.set('startTime', query.startTime)
  params.set('endTime', query.endTime)
  if (query.status) params.set('status', query.status)
  if (query.severity) params.set('severity', query.severity)
  return apiGetJson<ApiSuccessResponse<AlertsListResponse>>(`/api/v1/alerts?${params.toString()}`)
}

export type AlertEvent = {
  eventId: string
  eventType: 'ALERT_TRIGGER' | 'ALERT_UPDATE' | 'ALERT_RESOLVE' | 'ALERT_ACK'
  severity: 'low' | 'medium' | 'high' | 'critical'
  createdAt: string
  ruleId: string
  ruleVersion: number
  deviceId?: string | null
  stationId?: string | null
  evidence?: Record<string, unknown>
}

export type AlertEventsResponse = {
  alertId: string
  events: AlertEvent[]
}

export async function getAlertEvents(alertId: string): Promise<ApiSuccessResponse<AlertEventsResponse>> {
  return apiGetJson<ApiSuccessResponse<AlertEventsResponse>>(`/api/v1/alerts/${encodeURIComponent(alertId)}/events`)
}

export type AlertAction = 'ack' | 'resolve'

export async function actionAlert(
  alertId: string,
  action: AlertAction,
  body?: { notes?: string }
): Promise<ApiSuccessResponse<unknown>> {
  return apiJson<ApiSuccessResponse<unknown>>(`/api/v1/alerts/${encodeURIComponent(alertId)}/${action}`, body ?? {})
}
