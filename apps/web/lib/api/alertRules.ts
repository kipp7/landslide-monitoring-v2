import { apiGetJson, apiJson, apiPutJson, type ApiSuccessResponse } from '../v2Api'

export type AlertRuleScope =
  | { type: 'device'; deviceId: string }
  | { type: 'station'; stationId: string }
  | { type: 'global' }

export type AlertRuleRow = {
  ruleId: string
  ruleName: string
  scope: 'device' | 'station' | 'global'
  deviceId: string | null
  stationId: string | null
  isActive: boolean
  currentVersion: number
  updatedAt: string
}

export type AlertRuleListResponse = { list: AlertRuleRow[] }

export type ListAlertRulesQuery = {
  isActive?: boolean
  scope?: 'device' | 'station' | 'global'
  deviceId?: string
  stationId?: string
}

export async function listAlertRules(query: ListAlertRulesQuery): Promise<ApiSuccessResponse<AlertRuleListResponse>> {
  const params = new URLSearchParams()
  if (query.isActive !== undefined) params.set('isActive', query.isActive ? 'true' : 'false')
  if (query.scope) params.set('scope', query.scope)
  if (query.deviceId) params.set('deviceId', query.deviceId)
  if (query.stationId) params.set('stationId', query.stationId)
  const qs = params.toString()
  return apiGetJson<ApiSuccessResponse<AlertRuleListResponse>>(`/api/v1/alert-rules${qs ? `?${qs}` : ''}`)
}

export type AlertRuleDetail = {
  ruleId: string
  ruleName: string
  description: string
  scope: AlertRuleScope
  isActive: boolean
  currentVersion: number
  updatedAt: string
}

export type AlertRuleCurrentVersion = { version: number; createdAt: string; dsl: Record<string, unknown> }

export type GetAlertRuleResponse = { rule: AlertRuleDetail; currentVersion: AlertRuleCurrentVersion | null }

export async function getAlertRule(ruleId: string): Promise<ApiSuccessResponse<GetAlertRuleResponse>> {
  return apiGetJson<ApiSuccessResponse<GetAlertRuleResponse>>(`/api/v1/alert-rules/${encodeURIComponent(ruleId)}`)
}

export type CreateAlertRuleRequest = {
  rule: {
    ruleName: string
    description?: string
    scope: AlertRuleScope
    isActive: boolean
  }
  dsl: Record<string, unknown>
}

export type CreateAlertRuleResponse = { ruleId: string; ruleVersion: number }

export async function createAlertRule(body: CreateAlertRuleRequest): Promise<ApiSuccessResponse<CreateAlertRuleResponse>> {
  return apiJson<ApiSuccessResponse<CreateAlertRuleResponse>>('/api/v1/alert-rules', body)
}

export type UpdateAlertRuleRequest = { isActive?: boolean }
export type UpdateAlertRuleResponse = { ruleId: string; isActive: boolean; updatedAt: string }

export async function updateAlertRule(
  ruleId: string,
  body: UpdateAlertRuleRequest
): Promise<ApiSuccessResponse<UpdateAlertRuleResponse>> {
  return apiPutJson<ApiSuccessResponse<UpdateAlertRuleResponse>>(`/api/v1/alert-rules/${encodeURIComponent(ruleId)}`, body)
}

export type AlertRuleVersionRow = { version: number; createdAt: string; createdBy: string }
export type ListAlertRuleVersionsResponse = { ruleId: string; list: AlertRuleVersionRow[] }

export async function listAlertRuleVersions(ruleId: string): Promise<ApiSuccessResponse<ListAlertRuleVersionsResponse>> {
  return apiGetJson<ApiSuccessResponse<ListAlertRuleVersionsResponse>>(
    `/api/v1/alert-rules/${encodeURIComponent(ruleId)}/versions`
  )
}

export type GetAlertRuleVersionResponse = { ruleId: string; version: number; createdAt: string; dsl: Record<string, unknown> }

export async function getAlertRuleVersion(
  ruleId: string,
  version: number
): Promise<ApiSuccessResponse<GetAlertRuleVersionResponse>> {
  return apiGetJson<ApiSuccessResponse<GetAlertRuleVersionResponse>>(
    `/api/v1/alert-rules/${encodeURIComponent(ruleId)}/versions/${encodeURIComponent(String(version))}`
  )
}

export type PublishAlertRuleVersionResponse = { ruleId: string; ruleVersion: number }

export async function publishAlertRuleVersion(
  ruleId: string,
  dsl: Record<string, unknown>
): Promise<ApiSuccessResponse<PublishAlertRuleVersionResponse>> {
  return apiJson<ApiSuccessResponse<PublishAlertRuleVersionResponse>>(
    `/api/v1/alert-rules/${encodeURIComponent(ruleId)}/versions`,
    { dsl }
  )
}

export type ReplayAlertRuleRequest = { startTime: string; endTime: string; deviceIds?: string[] }

export type ReplayAlertRuleDeviceResult = {
  deviceId: string
  points: number
  events: Array<{ eventType: string; ts: string; evidence?: Record<string, unknown>; explain?: string }>
}

export type ReplayAlertRuleResponse = {
  ruleId: string
  version: number
  startTime: string
  endTime: string
  sensorKeys: string[]
  devices: ReplayAlertRuleDeviceResult[]
  totals: { rows: number; points: number; events: number }
}

export async function replayAlertRule(
  ruleId: string,
  version: number,
  body: ReplayAlertRuleRequest
): Promise<ApiSuccessResponse<ReplayAlertRuleResponse>> {
  return apiJson<ApiSuccessResponse<ReplayAlertRuleResponse>>(
    `/api/v1/alert-rules/${encodeURIComponent(ruleId)}/versions/${encodeURIComponent(String(version))}/replay`,
    body
  )
}

