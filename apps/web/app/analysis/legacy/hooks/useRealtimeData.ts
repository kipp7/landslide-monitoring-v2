'use client'

import { useMemo } from 'react'

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

export default function useRealtimeData(): {
  loading: boolean
  error: string | null
  deviceStats: LegacyDeviceStats
  data: LegacyRealtimeRow[]
} {
  const deviceStats = useMemo<LegacyDeviceStats>(() => ({ lastUpdateTime: null }), [])
  return { loading: false, error: null, deviceStats, data: [] }
}

