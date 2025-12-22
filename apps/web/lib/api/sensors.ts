import { apiGetJson, type ApiSuccessResponse } from '../v2Api'

export type SensorRow = {
  sensorKey: string
  displayName: string
  unit: string
  dataType: 'float' | 'int' | 'bool' | 'string'
  description?: string
}

export type SensorsResponse = { list: SensorRow[] }

export async function listSensors(): Promise<ApiSuccessResponse<SensorsResponse>> {
  return apiGetJson<ApiSuccessResponse<SensorsResponse>>('/api/v1/sensors')
}

