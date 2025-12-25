'use client'

import { useEffect, useMemo, useState } from 'react'
import { toNumber } from '../../../../lib/v2Api'
import { useRealtimeStream } from '../../../hooks/useRealtimeStream'
import useDeviceMappings from './useDeviceMappings'

export type LegacyRealtimeAnomalyRow = {
  id: string
  event_time: string
  device_id: string
  anomaly_type: string
  value: number
  severity?: string
  raw?: unknown
}

function toRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : null
}

function parseAnomalyType(payload: unknown): string {
  const rec = toRecord(payload)
  const fromPayload =
    (rec && typeof rec.anomaly_type === 'string' && rec.anomaly_type.trim()) ||
    (rec && typeof rec.type === 'string' && rec.type.trim()) ||
    (rec && typeof rec.title === 'string' && rec.title.trim())
  return fromPayload || 'anomaly_alert'
}

function parseAnomalyValue(payload: unknown): number {
  const rec = toRecord(payload)
  const candidates: unknown[] = rec ? [rec.value, rec.metric_value, rec.anomaly_value, rec.score, rec.level] : []
  for (const c of candidates) {
    const n = toNumber(c)
    if (n !== undefined) return n
  }
  return 0
}

export default function useRealtimeAnomalies(limit = 30): { data: LegacyRealtimeAnomalyRow[] } {
  const { getMapping } = useDeviceMappings()
  const [data, setData] = useState<LegacyRealtimeAnomalyRow[]>([])

  const realtime = useRealtimeStream({ deviceId: 'all' })
  const { connect, disconnect, lastMessage } = realtime

  useEffect(() => {
    connect()
    return () => disconnect()
  }, [connect, disconnect])

  useEffect(() => {
    const msg = lastMessage
    if (!msg || msg.type !== 'anomaly_alert') return

    const mapping = getMapping(msg.deviceId)
    const simpleId = mapping?.simple_id || msg.deviceId

    setData((prev) => {
      const next: LegacyRealtimeAnomalyRow = {
        id: msg.alertId ?? `${msg.deviceId}:${msg.timestamp}`,
        event_time: msg.timestamp,
        device_id: simpleId,
        anomaly_type: parseAnomalyType(msg.data),
        value: parseAnomalyValue(msg.data),
        severity: msg.severity,
        raw: msg.data,
      }

      const merged = [next, ...prev]
      const seen = new Set<string>()
      const deduped: LegacyRealtimeAnomalyRow[] = []
      for (const row of merged) {
        if (seen.has(row.id)) continue
        seen.add(row.id)
        deduped.push(row)
        if (deduped.length >= limit) break
      }
      return deduped
    })
  }, [getMapping, lastMessage, limit])

  const sorted = useMemo(() => {
    const copy = data.slice()
    copy.sort((a, b) => b.event_time.localeCompare(a.event_time))
    return copy
  }, [data])

  return { data: sorted }
}

