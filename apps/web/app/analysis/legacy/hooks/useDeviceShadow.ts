'use client'

import { useEffect, useState } from 'react'
import { getAnomalyAssessment } from '../../../../lib/api/anomalyAssessment'

export type LegacyShadowRow = {
  device_id?: string
  event_time?: string
  properties?: { risk_level?: number | null }
}

function calculateRiskLevel(stats: { red: number; orange: number; yellow: number }): number {
  if (stats.red > 3) return 4
  if (stats.red > 0) return 3
  if (stats.orange > 0) return 2
  if (stats.yellow > 0) return 1
  return 0
}

export default function useDeviceShadow(
  refreshInterval = 30_000,
): { data: LegacyShadowRow | null; loading: boolean; error: string | null } {
  const [data, setData] = useState<LegacyShadowRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const fetchShadow = async () => {
      try {
        setError(null)
        const json = await getAnomalyAssessment(24)
        if (!json?.success) throw new Error('Failed to load anomaly assessment')

        const stats = json.data.stats
        const riskLevel = calculateRiskLevel({ red: stats.red, orange: stats.orange, yellow: stats.yellow })

        if (!cancelled) {
          setData({ event_time: json.data.processed_at, properties: { risk_level: riskLevel } })
          setLoading(false)
        }
      } catch (caught) {
        if (!cancelled) {
          setData(null)
          setError(caught instanceof Error ? caught.message : String(caught))
          setLoading(false)
        }
      }
    }

    void fetchShadow()

    if (refreshInterval > 0) {
      const interval = setInterval(() => void fetchShadow(), refreshInterval)
      return () => {
        cancelled = true
        clearInterval(interval)
      }
    }

    return () => {
      cancelled = true
    }
  }, [refreshInterval])

  return { data, loading, error }
}
