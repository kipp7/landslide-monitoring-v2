import { apiGetJson, apiPutJson, type ApiSuccessResponse } from '../v2Api'

export type ConfigRow = {
  key: string
  value: string
  type: string
  description: string
  updatedAt: string
}

export type SystemConfigsResponse = { list: ConfigRow[] }

export async function getSystemConfigs(): Promise<ApiSuccessResponse<SystemConfigsResponse>> {
  return apiGetJson<ApiSuccessResponse<SystemConfigsResponse>>('/api/v1/system/configs')
}

export async function putSystemConfigs(configs: Array<{ key: string; value: string }>): Promise<ApiSuccessResponse<unknown>> {
  return apiPutJson<ApiSuccessResponse<unknown>>('/api/v1/system/configs', { configs })
}

export type ApiStatsResponse = {
  since: string
  total: number
  byStatus: Record<'2xx' | '3xx' | '4xx' | '5xx', number>
  avgResponseTimeMs: number | null
  topPaths: Array<{ method: string; path: string; count: number; p95ResponseTimeMs: number | null }>
}

export async function getApiStats(): Promise<ApiSuccessResponse<ApiStatsResponse>> {
  return apiGetJson<ApiSuccessResponse<ApiStatsResponse>>('/api/v1/system/logs/api-stats')
}

export type OperationLogRow = {
  id: string
  userId: string | null
  username: string
  module: string
  action: string
  targetType: string
  targetId: string
  description: string
  requestData: unknown
  responseData: unknown
  ipAddress: string
  userAgent: string
  status: string
  errorMessage: string
  createdAt: string
}

export type OperationLogsResponse = {
  page: number
  pageSize: number
  total: number
  list: OperationLogRow[]
}

export type OperationLogsQuery = {
  page: number
  pageSize: number
  userId?: string
  module?: string
  action?: string
  startTime: string
  endTime: string
}

export async function getOperationLogs(query: OperationLogsQuery): Promise<ApiSuccessResponse<OperationLogsResponse>> {
  const params = new URLSearchParams()
  params.set('page', String(query.page))
  params.set('pageSize', String(query.pageSize))
  if (query.userId && query.userId.trim()) params.set('userId', query.userId.trim())
  if (query.module && query.module.trim()) params.set('module', query.module.trim())
  if (query.action && query.action.trim()) params.set('action', query.action.trim())
  params.set('startTime', query.startTime)
  params.set('endTime', query.endTime)
  return apiGetJson<ApiSuccessResponse<OperationLogsResponse>>(`/api/v1/system/logs/operation?${params.toString()}`)
}

