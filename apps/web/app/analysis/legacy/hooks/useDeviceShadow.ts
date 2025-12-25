'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { getDeviceState } from '../../../../lib/api/devices'
import { toNumber } from '../../../../lib/v2Api'
import useDeviceMappings from './useDeviceMappings'

export type LegacyShadowRow = {
  device_id?: string
  event_time?: string
  properties?: {
    risk_level?: number | null
    temperature?: number | null
    humidity?: number | null
    acceleration_total?: number | null
    alarm_active?: boolean | null
  }
}

function isUuid(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
}

function metricNumber(metrics: Record<string, unknown>, candidates: string[]): number | undefined {
  for (const key of candidates) {
    if (!(key in metrics)) continue
    const n = toNumber(metrics[key])
    if (n !== undefined) return n
  }
  return undefined
}

function magnitude3(
  metrics: Record<string, unknown>,
  xKeys: string[],
  yKeys: string[],
  zKeys: string[]
): number | undefined {
  const x = metricNumber(metrics, xKeys) ?? 0
  const y = metricNumber(metrics, yKeys) ?? 0
  const z = metricNumber(metrics, zKeys) ?? 0
  if (!Number.isFinite(x) && !Number.isFinite(y) && !Number.isFinite(z)) return undefined
  return Math.sqrt(x * x + y * y + z * z)
}

function computeRiskLevel({
  updatedAt,
  temperature,
  humidity,
  accelerationTotal,
}: {
  updatedAt?: string
  temperature?: number
  humidity?: number
  accelerationTotal?: number
}): number {
  let riskLevel = 0

  if (updatedAt) {
    const ageMs = Date.now() - new Date(updatedAt).getTime()
    const ageMinutes = ageMs / (1000 * 60)
    if (Number.isFinite(ageMinutes) && ageMinutes > 10) riskLevel = Math.max(riskLevel, 1)
  }

  if (temperature !== undefined && (temperature < 0 || temperature > 50)) riskLevel = Math.max(riskLevel, 2)
  if (humidity !== undefined && humidity > 90) riskLevel = Math.max(riskLevel, 1)
  if (accelerationTotal !== undefined && accelerationTotal > 2000) riskLevel = Math.max(riskLevel, 3)

  return Math.min(riskLevel, 4)
}

export default function useDeviceShadow(
  deviceId: string = 'device_1',
  refreshInterval = 5000
): { data: LegacyShadowRow | null; loading: boolean; error: string | null } {
  const { mappings, loading: mappingsLoading, error: mappingsError, getMapping } = useDeviceMappings()

  const [data, setData] = useState<LegacyShadowRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const selected = useMemo(() => {
    const desired = deviceId && deviceId.trim() ? deviceId.trim() : 'device_1'

    const mapping = getMapping(desired)
    if (mapping?.actual_device_id) {
      return { simpleId: mapping.simple_id || desired, actualId: mapping.actual_device_id }
    }

    if (isUuid(desired)) return { simpleId: desired, actualId: desired }

    const fallback = mappings.find((m) => m.simple_id === 'device_1') ?? mappings[0]
    if (fallback?.actual_device_id) return { simpleId: fallback.simple_id || 'device_1', actualId: fallback.actual_device_id }

    return null
  }, [deviceId, getMapping, mappings])

  const fetchShadowData = useCallback(async () => {
    if (!selected?.actualId) {
      setData(null)
      setError(mappingsError?.message ?? null)
      setLoading(false)
      return
    }

    try {
      setError(null)
      const json = await getDeviceState(selected.actualId)
      const metrics = json.data?.state?.metrics ?? {}
      const updatedAt = json.data?.updatedAt

      const temperature = metricNumber(metrics, ['temperature', 'temp'])
      const humidity = metricNumber(metrics, ['humidity', 'hum'])
      const accelerationTotal =
        metricNumber(metrics, ['acceleration_total', 'acceleration', 'accel']) ??
        magnitude3(metrics, ['acceleration_x', 'accel_x'], ['acceleration_y', 'accel_y'], ['acceleration_z', 'accel_z'])

      const riskLevel = computeRiskLevel({ updatedAt, temperature, humidity, accelerationTotal })

      setData({
        device_id: selected.simpleId,
        event_time: updatedAt,
        properties: {
          risk_level: riskLevel,
          temperature: temperature ?? null,
          humidity: humidity ?? null,
          acceleration_total: accelerationTotal ?? null,
          alarm_active: riskLevel >= 2,
        },
      })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [mappingsError?.message, selected])

  useEffect(() => {
    setLoading(Boolean(selected?.actualId) || mappingsLoading)
  }, [mappingsLoading, selected?.actualId])

  useEffect(() => {
    void fetchShadowData()

    if (refreshInterval > 0) {
      const interval = setInterval(() => void fetchShadowData(), refreshInterval)
      return () => clearInterval(interval)
    }
  }, [fetchShadowData, refreshInterval])

  return { data, loading, error }
}
