'use client'

import { useEffect, useState } from 'react'
import { listAlerts } from '../../lib/api/alerts'

export interface RiskRecord {
  device_id: string
  event_time: string
  risk_level: number
}

function severityToRiskLevel(sev: string | null | undefined): number {
  const s = (sev ?? '').toLowerCase()
  if (s === 'critical') return 4
  if (s === 'high') return 3
  if (s === 'medium') return 2
  if (s === 'low') return 1
  return 0
}

export default function useLandslideRisk(refreshInterval = 30_000) {
  const [data, setData] = useState<RiskRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const fetchData = async () => {
    try {
      const endTime = new Date()
      const startTime = new Date(endTime.getTime() - 24 * 60 * 60 * 1000)

      const json = await listAlerts({
        page: 1,
        pageSize: 500,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
      })

      const list = json.data?.list ?? []
      const perDevice = new Map<string, RiskRecord>()

      for (const row of list) {
        const deviceId = row.deviceId || 'unknown'
        const risk = severityToRiskLevel(row.severity)
        const ts = row.lastEventAt
        const prev = perDevice.get(deviceId)
        if (!prev) {
          perDevice.set(deviceId, { device_id: deviceId, event_time: ts, risk_level: risk })
          continue
        }

        const prevTs = new Date(prev.event_time).getTime()
        const nextTs = new Date(ts).getTime()
        const newerTime = Number.isFinite(nextTs) && (Number.isNaN(prevTs) || nextTs > prevTs)

        if (risk > prev.risk_level || (risk === prev.risk_level && newerTime)) {
          perDevice.set(deviceId, { device_id: deviceId, event_time: ts, risk_level: risk })
        }
      }

      let highest: RiskRecord | null = null
      for (const item of perDevice.values()) {
        if (!highest) {
          highest = item
          continue
        }

        const highestTs = new Date(highest.event_time).getTime()
        const itemTs = new Date(item.event_time).getTime()
        const newerTime = Number.isFinite(itemTs) && (Number.isNaN(highestTs) || itemTs > highestTs)

        if (item.risk_level > highest.risk_level || (item.risk_level === highest.risk_level && newerTime)) {
          highest = item
        }
      }

      setData(highest)
      setError(null)
    } catch (caught) {
      setError(caught instanceof Error ? caught : new Error(String(caught)))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchData()
    const interval = setInterval(() => void fetchData(), refreshInterval)
    return () => clearInterval(interval)
  }, [refreshInterval])

  return { data, loading, error }
}

