'use client'

import { useCallback, useEffect, useState } from 'react'

export interface DeviceShadowData {
  device_id?: string
  properties?: {
    risk_level?: number
    temperature?: number
    humidity?: number
    illumination?: number
    acceleration_x?: number
    acceleration_y?: number
    acceleration_z?: number
    gyroscope_x?: number
    gyroscope_y?: number
    gyroscope_z?: number
    mpu_temperature?: number
    latitude?: number
    longitude?: number
    vibration?: number
    alarm_active?: boolean
    [key: string]: any
  }
  event_time?: string
  version?: number
}

export interface UseDeviceShadowResult {
  data: DeviceShadowData | null
  loading: boolean
  error: string | null
  refreshShadow: () => Promise<void>
}

type ApiSuccessResponse<T> = {
  success: true
  code: number
  message: string
  data: T
  timestamp: string
  traceId: string
}

type DeviceStateResponse = {
  deviceId: string
  updatedAt: string
  state: {
    metrics: Record<string, unknown>
    meta?: Record<string, unknown>
  }
}

function getApiBaseUrl(): string {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL
  return base ? base.replace(/\/+$/, '') : ''
}

function buildApiUrl(path: string): string {
  const base = getApiBaseUrl()
  if (!base) return path
  return `${base}${path.startsWith('/') ? '' : '/'}${path}`
}

function toNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const num = Number(value)
    if (Number.isFinite(num)) return num
  }
  return undefined
}

function computeRiskLevel(metrics: Record<string, unknown>): number {
  const temperature = toNumber(metrics.temperature) ?? toNumber(metrics.temp) ?? 0
  const humidity = toNumber(metrics.humidity) ?? 0
  const vibration =
    toNumber(metrics.vibration) ??
    toNumber(metrics.acceleration_total) ??
    toNumber(metrics.accTotal) ??
    0

  let riskLevel = 0
  if (temperature < 0 || temperature > 50) riskLevel = Math.max(riskLevel, 2)
  if (humidity > 90) riskLevel = Math.max(riskLevel, 1)
  if (vibration > 2000) riskLevel = Math.max(riskLevel, 3)

  return Math.min(riskLevel, 4)
}

export default function useDeviceShadow(
  deviceId: string = '6815a14f9314d118511807c6_rk2206',
  refreshInterval: number = 5000
): UseDeviceShadowResult {
  const [data, setData] = useState<DeviceShadowData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchShadowData = useCallback(async () => {
    try {
      setError(null)

      const url = buildApiUrl(`/api/v1/data/state/${encodeURIComponent(deviceId)}`)
      const resp = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      })

      if (!resp.ok) throw new Error(`HTTP ${resp.status} ${resp.statusText}`)

      const json = (await resp.json()) as ApiSuccessResponse<DeviceStateResponse>
      if (!json?.success) throw new Error('Unexpected API response')

      const metrics = json.data.state.metrics ?? {}
      const riskLevel = computeRiskLevel(metrics)

      setData({
        device_id: json.data.deviceId,
        properties: {
          risk_level: riskLevel,
          temperature: toNumber(metrics.temperature) ?? toNumber(metrics.temp) ?? 0,
          humidity: toNumber(metrics.humidity) ?? 0,
          illumination: toNumber(metrics.illumination) ?? 0,
          acceleration_x: toNumber(metrics.acceleration_x) ?? toNumber(metrics.accX) ?? 0,
          acceleration_y: toNumber(metrics.acceleration_y) ?? toNumber(metrics.accY) ?? 0,
          acceleration_z: toNumber(metrics.acceleration_z) ?? toNumber(metrics.accZ) ?? 0,
          gyroscope_x: toNumber(metrics.gyroscope_x) ?? toNumber(metrics.gyroX) ?? 0,
          gyroscope_y: toNumber(metrics.gyroscope_y) ?? toNumber(metrics.gyroY) ?? 0,
          gyroscope_z: toNumber(metrics.gyroscope_z) ?? toNumber(metrics.gyroZ) ?? 0,
          mpu_temperature: toNumber(metrics.mpu_temperature) ?? 0,
          latitude: toNumber(metrics.latitude) ?? 0,
          longitude: toNumber(metrics.longitude) ?? 0,
          vibration: toNumber(metrics.vibration) ?? 0,
          alarm_active: riskLevel >= 2,
          ...Object.fromEntries(
            Object.entries(metrics).filter(([key]) => !key.startsWith('_'))
          ),
        },
        event_time: json.data.updatedAt,
        version: 1,
      })
    } catch (caught: unknown) {
      const message = caught instanceof Error ? caught.message : String(caught)
      setError(message)
      setData({
        device_id: deviceId,
        properties: { risk_level: 0, alarm_active: false },
        event_time: new Date().toISOString(),
        version: 1,
      })
    } finally {
      setLoading(false)
    }
  }, [deviceId])

  const refreshShadow = useCallback(async () => {
    setLoading(true)
    await fetchShadowData()
  }, [fetchShadowData])

  useEffect(() => {
    fetchShadowData()

    if (refreshInterval > 0) {
      const interval = setInterval(fetchShadowData, refreshInterval)
      return () => clearInterval(interval)
    }
  }, [fetchShadowData, refreshInterval])

  return { data, loading, error, refreshShadow }
}

