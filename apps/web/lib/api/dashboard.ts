import { apiGetJson, type ApiSuccessResponse } from '../v2Api'

export type DashboardSummary = {
  todayDataCount: number
  onlineDevices: number
  offlineDevices: number
  pendingAlerts: number
  alertsBySeverity: Record<'low' | 'medium' | 'high' | 'critical', number>
  stations: number
  lastUpdatedAt: string
}

export async function getDashboard(): Promise<ApiSuccessResponse<DashboardSummary>> {
  return apiGetJson<ApiSuccessResponse<DashboardSummary>>('/api/v1/dashboard')
}

export type SystemCheck = { status: string; error?: string }

export type SystemStatus = {
  uptimeS: number
  postgres: SystemCheck
  clickhouse: SystemCheck
  kafka: SystemCheck
  emqx: { status: string }
}

export async function getSystemStatus(): Promise<ApiSuccessResponse<SystemStatus>> {
  return apiGetJson<ApiSuccessResponse<SystemStatus>>('/api/v1/system/status')
}

