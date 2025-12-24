import { apiGetJson, apiJson, type ApiSuccessResponse } from '../v2Api'

export type GpsBaselinesAvailableDevicesQuery = {
  lookbackDays?: number
  latKey?: string
  lonKey?: string
  limit?: number
}

export type GpsBaselinesAvailableDevicesResponse = {
  availableDevices: string[]
  totalGpsDevices: number
  devicesWithBaseline: number
  devicesNeedingBaseline: number
  lookbackDays: number
}

export async function getGpsBaselinesAvailableDevices(
  query: GpsBaselinesAvailableDevicesQuery = {},
): Promise<ApiSuccessResponse<GpsBaselinesAvailableDevicesResponse>> {
  const params = new URLSearchParams()
  if (query.lookbackDays) params.set('lookbackDays', String(query.lookbackDays))
  if (query.latKey) params.set('latKey', query.latKey)
  if (query.lonKey) params.set('lonKey', query.lonKey)
  if (query.limit) params.set('limit', String(query.limit))
  return apiGetJson<ApiSuccessResponse<GpsBaselinesAvailableDevicesResponse>>(`/gps/baselines/available-devices?${params.toString()}`)
}

export type GpsBaselinesAutoEstablishRequest = {
  pointsCount?: number
  lookbackDays?: number
  latKey?: string
  lonKey?: string
  altKey?: string
}

export type GpsBaselinesAutoEstablishResponse = {
  deviceId: string
  pointsUsed: number
  lookbackDays: number
  keys: { latKey: string; lonKey: string; altKey: string | null }
  baseline: { latitude: number; longitude: number; altitude?: number; positionAccuracyMeters?: number; notes?: string }
  statistics: {
    latStdDeg: number
    lonStdDeg: number
    positionAccuracyMeters: number
    timeRange: { start: string | null; end: string | null }
  }
}

export async function autoEstablishGpsBaseline(
  deviceId: string,
  body: GpsBaselinesAutoEstablishRequest,
): Promise<ApiSuccessResponse<GpsBaselinesAutoEstablishResponse>> {
  return apiJson<ApiSuccessResponse<GpsBaselinesAutoEstablishResponse>>(
    `/gps/baselines/${encodeURIComponent(deviceId)}/auto-establish`,
    body ?? {},
  )
}

export type GpsBaselineQualityCheckQuery = {
  pointsCount?: number
  lookbackDays?: number
  latKey?: string
  lonKey?: string
  altKey?: string
}

export type GpsBaselineQualityCheckResponse = {
  deviceId: string
  lookbackDays: number
  keys: { latKey: string; lonKey: string; altKey: string | null }
  baseline: {
    latitude: number
    longitude: number
    altitude?: number
    positionAccuracyMeters?: number
    satelliteCount?: number
    notes?: string
    method: 'auto' | 'manual'
    pointsCount: number | null
    computedAt: string
  }
  sample: { pointsUsed: number; timeRange: { start: string | null; end: string | null } }
  driftMeters: { mean: number; std: number; p95: number; max: number }
  recommendation: { level: 'good' | 'warn' | 'bad'; thresholds: { goodP95Meters: number; warnP95Meters: number } }
  baselineAgeHours: number
}

export async function qualityCheckGpsBaseline(
  deviceId: string,
  query: GpsBaselineQualityCheckQuery = {},
): Promise<ApiSuccessResponse<GpsBaselineQualityCheckResponse>> {
  const params = new URLSearchParams()
  if (query.pointsCount) params.set('pointsCount', String(query.pointsCount))
  if (query.lookbackDays) params.set('lookbackDays', String(query.lookbackDays))
  if (query.latKey) params.set('latKey', query.latKey)
  if (query.lonKey) params.set('lonKey', query.lonKey)
  if (query.altKey) params.set('altKey', query.altKey)
  return apiGetJson<ApiSuccessResponse<GpsBaselineQualityCheckResponse>>(
    `/gps/baselines/${encodeURIComponent(deviceId)}/quality-check?${params.toString()}`,
  )
}

