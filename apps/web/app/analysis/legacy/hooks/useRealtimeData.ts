'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { getDeviceState } from '../../../../lib/api/devices'
import { toNumber } from '../../../../lib/v2Api'
import useDeviceMappings from './useDeviceMappings'

export type LegacyRealtimeRow = {
  device_id: string
  event_time: string
  latitude?: string | number | null
  longitude?: string | number | null
  temperature?: string | number | null
  humidity?: string | number | null
}

export type LegacyDeviceStats = {
  lastUpdateTime: string | null
}

function firstMetricValue(metrics: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) {
    if (k in metrics) return metrics[k]
  }
  return undefined
}

function firstMetricNumber(metrics: Record<string, unknown>, keys: string[]): number | null {
  const value = firstMetricValue(metrics, keys)
  const num = toNumber(value)
  return num === undefined ? null : num
}

export default function useRealtimeData(refreshInterval = 30_000): {
  loading: boolean
  error: string | null
  deviceStats: LegacyDeviceStats
  data: LegacyRealtimeRow[]
} {
  const { mappings, loading: mappingsLoading, error: mappingsError } = useDeviceMappings()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<LegacyRealtimeRow[]>([])

  const targets = useMemo(() => {
    const list = mappings.filter((m) => m.actual_device_id && m.simple_id)
    list.sort((a, b) => a.simple_id.localeCompare(b.simple_id))
    return list
  }, [mappings])

  const fetchStates = useCallback(async () => {
    try {
      setError(null)

      const settled = await Promise.allSettled(
        targets.map(async (m) => {
          const state = await getDeviceState(m.actual_device_id)
          if (!state?.success) throw new Error('Failed to load device state')

          const metrics = state.data.state?.metrics
          const safeMetrics: Record<string, unknown> = metrics && typeof metrics === 'object' ? (metrics as Record<string, unknown>) : {}

          const latitude =
            firstMetricNumber(safeMetrics, ['latitude', 'lat', 'gps_latitude', 'gps_lat']) ?? (m.latitude ?? null)
          const longitude =
            firstMetricNumber(safeMetrics, ['longitude', 'lon', 'lng', 'gps_longitude', 'gps_lon']) ?? (m.longitude ?? null)

          const temperature = firstMetricNumber(safeMetrics, ['temperature', 'temp', 'temp_c'])
          const humidity = firstMetricNumber(safeMetrics, ['humidity', 'hum'])

          const eventTime =
            typeof state.data.updatedAt === 'string' && state.data.updatedAt.trim()
              ? state.data.updatedAt
              : m.last_data_time || new Date().toISOString()

          const row: LegacyRealtimeRow = {
            device_id: m.simple_id,
            event_time: eventTime,
            latitude,
            longitude,
            temperature,
            humidity,
          }
          return row
        }),
      )

      const rows: LegacyRealtimeRow[] = []
      const errors: string[] = []

      for (const r of settled) {
        if (r.status === 'fulfilled') rows.push(r.value)
        else errors.push(r.reason instanceof Error ? r.reason.message : String(r.reason))
      }

      rows.sort((a, b) => new Date(b.event_time).getTime() - new Date(a.event_time).getTime())

      setData(rows)
      if (errors.length > 0 && rows.length === 0) setError(errors[0] ?? 'Failed to load realtime data')
    } catch (caught) {
      setData([])
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setLoading(false)
    }
  }, [targets])

  useEffect(() => {
    if (mappingsLoading) return
    void fetchStates()
    if (refreshInterval > 0) {
      const interval = setInterval(() => void fetchStates(), refreshInterval)
      return () => clearInterval(interval)
    }
  }, [fetchStates, mappingsLoading, refreshInterval])

  const effectiveError = mappingsError?.message ?? error

  const deviceStats = useMemo<LegacyDeviceStats>(() => ({ lastUpdateTime: data[0]?.event_time ?? null }), [data])

  return { loading: mappingsLoading || loading, error: effectiveError, deviceStats, data }
}
