'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getDeviceState } from '../../../../lib/api/devices'
import { toNumber } from '../../../../lib/v2Api'
import useSensors from '../../../hooks/useSensors'
import { useRealtimeStream } from '../../../hooks/useRealtimeStream'
import useDeviceMappings from './useDeviceMappings'

export type LegacyRealtimeRow = {
  device_id: string
  event_time: string
  latitude?: string | number | null
  longitude?: string | number | null
  temperature?: string | number | null
  humidity?: string | number | null
  metrics?: Record<string, unknown> | null
}

export type LegacyDeviceStats = {
  lastUpdateTime: string | null
}

type TrackedDevice = {
  simpleId: string
  actualId: string
  latitude: number | null
  longitude: number | null
}

function firstAvailableKey(byKey: Map<string, unknown>, candidates: string[]): string | null {
  for (const key of candidates) {
    if (byKey.has(key)) return key
  }
  return null
}

function parseSimpleIdIndex(id: string): number | null {
  const m = /^device_(\d+)$/.exec(id)
  if (!m) return null
  const n = Number(m[1])
  return Number.isFinite(n) ? n : null
}

function sortSimpleId(a: string, b: string): number {
  const ai = parseSimpleIdIndex(a)
  const bi = parseSimpleIdIndex(b)
  if (ai != null && bi != null) return ai - bi
  if (ai != null) return -1
  if (bi != null) return 1
  return a.localeCompare(b)
}

function toRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : null
}

function extractDeviceState(payload: unknown): { updatedAt?: string; metrics?: Record<string, unknown> } {
  const rec = toRecord(payload)
  if (!rec) return {}

  const updatedAt = typeof rec.updatedAt === 'string' ? rec.updatedAt : undefined

  const state = toRecord(rec.state)
  const stateMetrics = state ? toRecord(state.metrics) : null
  if (stateMetrics) return { updatedAt, metrics: stateMetrics }

  const metrics = toRecord(rec.metrics)
  if (metrics) return { updatedAt, metrics }

  return { updatedAt }
}

function upsertLatestRow(prev: LegacyRealtimeRow[], next: LegacyRealtimeRow): LegacyRealtimeRow[] {
  const idx = prev.findIndex((r) => r.device_id === next.device_id)
  if (idx < 0) {
    const out = [...prev, next]
    out.sort((a, b) => sortSimpleId(a.device_id, b.device_id))
    return out
  }

  const existing = prev[idx]!
  const existingMs = Date.parse(existing.event_time)
  const nextMs = Date.parse(next.event_time)
  const isNextNewer = Number.isFinite(nextMs) && (!Number.isFinite(existingMs) || nextMs >= existingMs)

  const merged: LegacyRealtimeRow = isNextNewer
    ? { ...existing, ...next }
    : {
        ...existing,
        latitude: existing.latitude ?? next.latitude,
        longitude: existing.longitude ?? next.longitude,
        temperature: existing.temperature ?? next.temperature,
        humidity: existing.humidity ?? next.humidity,
        metrics: existing.metrics ?? next.metrics,
      }

  const out = prev.slice()
  out[idx] = merged
  return out
}

export default function useRealtimeData(): {
  loading: boolean
  error: string | null
  deviceStats: LegacyDeviceStats
  data: LegacyRealtimeRow[]
} {
  const { mappings, loading: mappingsLoading, error: mappingsError } = useDeviceMappings()
  const { byKey: sensorsByKey } = useSensors()

  const [data, setData] = useState<LegacyRealtimeRow[]>([])
  const [initialLoading, setInitialLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  const keys = useMemo(() => {
    const by = sensorsByKey as unknown as Map<string, unknown>
    const temperatureKey = firstAvailableKey(by, ['temperature', 'temp'])
    const humidityKey = firstAvailableKey(by, ['humidity', 'hum'])
    const latitudeKey = firstAvailableKey(by, ['latitude', 'lat'])
    const longitudeKey = firstAvailableKey(by, ['longitude', 'lng', 'lon'])
    return { temperatureKey, humidityKey, latitudeKey, longitudeKey }
  }, [sensorsByKey])

  const trackedDevices = useMemo<TrackedDevice[]>(() => {
    const list = mappings
      .filter((m) => m.simple_id && m.actual_device_id)
      .map((m) => ({
        simpleId: m.simple_id,
        actualId: m.actual_device_id,
        latitude: m.latitude ?? null,
        longitude: m.longitude ?? null,
      }))

    const preferred = list.filter((d) => parseSimpleIdIndex(d.simpleId) != null)
    const picked = preferred.length > 0 ? preferred : list
    picked.sort((a, b) => sortSimpleId(a.simpleId, b.simpleId))
    return picked.slice(0, 20)
  }, [mappings])

  const trackedByActualId = useMemo(() => {
    const map = new Map<string, TrackedDevice>()
    for (const d of trackedDevices) map.set(d.actualId, d)
    return map
  }, [trackedDevices])

  const realtime = useRealtimeStream({ deviceId: 'all' })
  const { connect, disconnect, lastMessage } = realtime

  const applyDeviceState = useCallback(
    (deviceId: string, payload: unknown, timestamp: string | undefined) => {
      const tracked = trackedByActualId.get(deviceId)
      const simpleId = tracked?.simpleId ?? deviceId

      const { updatedAt, metrics } = extractDeviceState(payload)
      const ts = updatedAt ?? timestamp ?? new Date().toISOString()

      const temperature = metrics
        ? toNumber(keys.temperatureKey ? metrics[keys.temperatureKey] : metrics.temperature ?? metrics.temp)
        : undefined
      const humidity = metrics
        ? toNumber(keys.humidityKey ? metrics[keys.humidityKey] : metrics.humidity ?? metrics.hum)
        : undefined

      const latFromMetrics = metrics
        ? toNumber(keys.latitudeKey ? metrics[keys.latitudeKey] : metrics.latitude ?? metrics.lat)
        : undefined
      const lonFromMetrics = metrics
        ? toNumber(keys.longitudeKey ? metrics[keys.longitudeKey] : metrics.longitude ?? metrics.lon ?? metrics.lng)
        : undefined

      const latitude = tracked?.latitude ?? latFromMetrics ?? null
      const longitude = tracked?.longitude ?? lonFromMetrics ?? null

      setData((prev) =>
        upsertLatestRow(prev, {
          device_id: simpleId,
          event_time: ts,
          latitude,
          longitude,
          temperature: temperature ?? null,
          humidity: humidity ?? null,
          metrics: metrics ?? null,
        }),
      )
    },
    [keys.humidityKey, keys.latitudeKey, keys.longitudeKey, keys.temperatureKey, trackedByActualId],
  )

  useEffect(() => {
    connect()
    return () => disconnect()
  }, [connect, disconnect])

  useEffect(() => {
    const msg = lastMessage
    if (!msg) return
    if (msg.type !== 'device_data' && msg.type !== 'initial_data') return

    if (msg.deviceId === 'all') {
      const rec = toRecord(msg.data)
      if (!rec) return
      for (const [deviceId, payload] of Object.entries(rec)) {
        applyDeviceState(deviceId, payload, msg.timestamp)
      }
      return
    }

    applyDeviceState(msg.deviceId, msg.data, msg.timestamp)
  }, [applyDeviceState, lastMessage])

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current)
      pollingRef.current = null
    }

    let cancelled = false
    let hasRunOnce = false

    const fetchOnce = async () => {
      if (trackedDevices.length === 0) {
        if (!hasRunOnce && !cancelled) {
          hasRunOnce = true
          setInitialLoading(false)
        }
        return
      }

      try {
        const results = await Promise.allSettled(trackedDevices.map((d) => getDeviceState(d.actualId)))
        let okCount = 0

        for (const r of results) {
          if (r.status !== 'fulfilled') continue
          okCount += 1
          const payload = r.value.data
          applyDeviceState(payload.deviceId, payload, payload.updatedAt)
        }

        if (!cancelled) {
          setFetchError(okCount > 0 ? null : 'Failed to load device state')
        }
      } catch (caught) {
        if (!cancelled) setFetchError(caught instanceof Error ? caught.message : String(caught))
      } finally {
        if (!hasRunOnce && !cancelled) {
          hasRunOnce = true
          setInitialLoading(false)
        }
      }
    }

    void fetchOnce()
    pollingRef.current = setInterval(() => void fetchOnce(), 30_000)

    return () => {
      cancelled = true
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
        pollingRef.current = null
      }
    }
  }, [applyDeviceState, trackedDevices])

  const deviceStats = useMemo<LegacyDeviceStats>(() => {
    let latest: string | null = null
    for (const row of data) {
      if (!row.event_time) continue
      if (!latest || row.event_time > latest) latest = row.event_time
    }
    return { lastUpdateTime: latest }
  }, [data])

  const error = useMemo(() => {
    if (data.length > 0) return null
    return fetchError ?? mappingsError?.message ?? null
  }, [data.length, fetchError, mappingsError?.message])

  const loading = initialLoading || (mappingsLoading && data.length === 0)
  return { loading, error, deviceStats, data }
}
