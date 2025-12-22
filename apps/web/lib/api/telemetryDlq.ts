import { apiGetJson, type ApiSuccessResponse } from '../v2Api'

export type TelemetryDlqKafkaRef = {
  topic: string
  partition: number
  offset: string
  key: string
}

export type TelemetryDlqMessageRow = {
  messageId: string
  receivedAt: string
  deviceId: string
  reasonCode: string
  reasonDetail: string
  rawPayloadPreview: string
  kafka: TelemetryDlqKafkaRef
  createdAt: string
}

export type PaginatedTelemetryDlq = {
  list: TelemetryDlqMessageRow[]
  pagination: { page: number; pageSize: number; total: number; totalPages: number }
}

export type ListTelemetryDlqQuery = {
  page: number
  pageSize: number
  reasonCode?: string
  deviceId?: string
  startTime?: string
  endTime?: string
}

export async function listTelemetryDlq(query: ListTelemetryDlqQuery): Promise<ApiSuccessResponse<PaginatedTelemetryDlq>> {
  const params = new URLSearchParams()
  params.set('page', String(query.page))
  params.set('pageSize', String(query.pageSize))
  if (query.reasonCode && query.reasonCode.trim()) params.set('reasonCode', query.reasonCode.trim())
  if (query.deviceId && query.deviceId.trim()) params.set('deviceId', query.deviceId.trim())
  if (query.startTime && query.endTime) {
    params.set('startTime', query.startTime)
    params.set('endTime', query.endTime)
  }
  return apiGetJson<ApiSuccessResponse<PaginatedTelemetryDlq>>(`/api/v1/telemetry/dlq?${params.toString()}`)
}

export type TelemetryDlqMessageDetail = {
  messageId: string
  receivedAt: string
  deviceId: string
  reasonCode: string
  reasonDetail: string
  rawPayload: string
  kafka: TelemetryDlqKafkaRef
  createdAt: string
}

export async function getTelemetryDlqMessage(
  messageId: string,
): Promise<ApiSuccessResponse<TelemetryDlqMessageDetail>> {
  return apiGetJson<ApiSuccessResponse<TelemetryDlqMessageDetail>>(`/api/v1/telemetry/dlq/${encodeURIComponent(messageId)}`)
}

export type TelemetryDlqStatsResponse = {
  window: { startTime: string; endTime: string } | null
  deviceId: string
  totals: { total: number }
  byReasonCode: Array<{ reasonCode: string; count: number }>
}

export type GetTelemetryDlqStatsQuery = {
  deviceId?: string
  startTime?: string
  endTime?: string
}

export async function getTelemetryDlqStats(
  query: GetTelemetryDlqStatsQuery,
): Promise<ApiSuccessResponse<TelemetryDlqStatsResponse>> {
  const params = new URLSearchParams()
  if (query.deviceId && query.deviceId.trim()) params.set('deviceId', query.deviceId.trim())
  if (query.startTime && query.endTime) {
    params.set('startTime', query.startTime)
    params.set('endTime', query.endTime)
  }
  const qs = params.toString()
  return apiGetJson<ApiSuccessResponse<TelemetryDlqStatsResponse>>(`/api/v1/telemetry/dlq/stats${qs ? `?${qs}` : ''}`)
}

