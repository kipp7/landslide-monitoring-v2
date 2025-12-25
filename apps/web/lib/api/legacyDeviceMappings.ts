import { apiGetJson } from '../v2Api'

export type LegacyOkResponse<T> = {
  success: true
  data: T
  message?: string
  timestamp?: string
}

export type LegacyErrorResponse = {
  success: false
  message: string
  error?: unknown
  timestamp?: string
}

export type LegacyDeviceMappingRow = {
  simple_id: string
  actual_device_id: string
  device_name: string
  location_name: string
  device_type: string
  latitude: number | null
  longitude: number | null
  status?: string
  description?: string
  install_date?: string
  last_data_time?: string
  online_status?: string
}

export async function listLegacyDeviceMappings(): Promise<
  LegacyOkResponse<LegacyDeviceMappingRow[]> | LegacyErrorResponse
> {
  return apiGetJson<LegacyOkResponse<LegacyDeviceMappingRow[]> | LegacyErrorResponse>('/api/iot/devices/mappings')
}

