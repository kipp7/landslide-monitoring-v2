'use client'

import { useEffect, useState } from 'react'
import { listAlerts } from '../../../../lib/api/alerts'

export interface RealtimeAnomaly {
  id: number
  event_time: string
  device_id: string
  anomaly_type: string
  value: number
}

function severityToValue(sev: string | null | undefined): number {
  const s = (sev ?? '').toLowerCase()
  if (s === 'critical') return 4
  if (s === 'high') return 3
  if (s === 'medium') return 2
  if (s === 'low') return 1
  return 0
}

export default function useRealtimeAnomalies(limit = 30, refreshInterval = 30_000) {
  const [data, setData] = useState<RealtimeAnomaly[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    let cancelled = false

    const fetchData = async () => {
      try {
        const endTime = new Date()
        const startTime = new Date(endTime.getTime() - 24 * 60 * 60 * 1000)

        const res = await listAlerts({
          page: 1,
          pageSize: Math.max(1, limit),
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
        })

        if (!res?.success) throw new Error('API返回失败')

        const list = Array.isArray(res.data.list) ? res.data.list : []
        const mapped: RealtimeAnomaly[] = list.map((row, idx) => ({
          id: idx + 1,
          event_time: row.lastEventAt,
          device_id: row.deviceId || '未知设备',
          anomaly_type: row.title || row.severity || 'unknown',
          value: severityToValue(row.severity),
        }))

        if (!cancelled) {
          setData(mapped)
          setError(null)
          setLoading(false)
        }
      } catch (caught) {
        if (!cancelled) {
          const next = caught instanceof Error ? caught : new Error(String(caught))
          setError(next)
          setLoading(false)
        }
      }
    }

    void fetchData()

    if (refreshInterval > 0) {
      const interval = setInterval(() => void fetchData(), refreshInterval)
      return () => {
        cancelled = true
        clearInterval(interval)
      }
    }

    return () => {
      cancelled = true
    }
  }, [limit, refreshInterval])

  return { data, loading, error }
}
