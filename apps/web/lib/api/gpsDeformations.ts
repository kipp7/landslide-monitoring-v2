import { apiGetJson, type ApiSuccessResponse } from '../v2Api'

export type GpsDeformationSeriesPoint = {
  ts: string
  latitude: number
  longitude: number
  altitude: number | null
  horizontalMeters: number
  verticalMeters: number | null
  distanceMeters: number
  counts: { lat: number; lon: number; alt: number }
}

export type GpsDeformationSeriesResponse = {
  deviceId: string
  interval: '1m' | '5m' | '1h' | '1d'
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
  range: { startTime: string; endTime: string }
  points: GpsDeformationSeriesPoint[]
}

export type GetGpsDeformationSeriesQuery = {
  deviceId: string
  startTime: string
  endTime: string
  interval?: '1m' | '5m' | '1h' | '1d'
  latKey?: string
  lonKey?: string
  altKey?: string
  limit?: number
}

export async function getGpsDeformationSeries(
  query: GetGpsDeformationSeriesQuery
): Promise<ApiSuccessResponse<GpsDeformationSeriesResponse>> {
  const params = new URLSearchParams()
  params.set('startTime', query.startTime)
  params.set('endTime', query.endTime)
  if (query.interval) params.set('interval', query.interval)
  if (query.latKey) params.set('latKey', query.latKey)
  if (query.lonKey) params.set('lonKey', query.lonKey)
  if (query.altKey) params.set('altKey', query.altKey)
  if (query.limit) params.set('limit', String(query.limit))

  return apiGetJson<ApiSuccessResponse<GpsDeformationSeriesResponse>>(
    `/api/v1/gps/deformations/${encodeURIComponent(query.deviceId)}/series?${params.toString()}`
  )
}

