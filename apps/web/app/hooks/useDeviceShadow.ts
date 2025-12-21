'use client'

import { useCallback, useEffect, useState } from 'react'
import { getDeviceState } from '../../lib/api/devices'

export interface DeviceShadowData {
  deviceId: string
  updatedAt: string
  metrics: Record<string, unknown>
  meta?: Record<string, unknown>
}

export interface UseDeviceShadowResult {
  data: DeviceShadowData | null
  loading: boolean
  error: string | null
  refreshShadow: () => Promise<void>
}

export default function useDeviceShadow(
  deviceId?: string,
  refreshInterval: number = 5000
): UseDeviceShadowResult {
  const [data, setData] = useState<DeviceShadowData | null>(null)
  const [loading, setLoading] = useState(Boolean(deviceId))
  const [error, setError] = useState<string | null>(null)

  const fetchShadowData = useCallback(async () => {
    if (!deviceId) {
      setData(null)
      setError(null)
      setLoading(false)
      return
    }

    try {
      setError(null)

      const json = await getDeviceState(deviceId)
      if (!json?.success) throw new Error('Unexpected API response')

      setData({
        deviceId: json.data.deviceId,
        updatedAt: json.data.updatedAt,
        metrics: json.data.state.metrics ?? {},
        meta: json.data.state.meta ?? {},
      })
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : String(caught))
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [deviceId])

  const refreshShadow = useCallback(async () => {
    if (!deviceId) return
    setLoading(true)
    await fetchShadowData()
  }, [deviceId, fetchShadowData])

  useEffect(() => {
    void fetchShadowData()

    if (refreshInterval > 0) {
      const interval = setInterval(fetchShadowData, refreshInterval)
      return () => clearInterval(interval)
    }
  }, [fetchShadowData, refreshInterval])

  useEffect(() => {
    setLoading(Boolean(deviceId))
  }, [deviceId])

  return { data, loading, error, refreshShadow }
}
