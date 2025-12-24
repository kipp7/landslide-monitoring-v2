'use client'

import { useEffect, useMemo, useState } from 'react'
import useDeviceList from '../../../hooks/useDeviceList'
import useSensors from '../../../hooks/useSensors'
import { getDeviceSeries, type DataSeriesPointRow, type DataSeriesRow } from '../../../../lib/api/data'
import { toNumber } from '../../../../lib/v2Api'

export interface SensorRecord {
  id: number
  event_time: string
  temperature: number
  humidity: number
  acceleration_total: number
  gyroscope_total: number
  device_id?: string
  [key: string]: string | number | undefined
}

function firstAvailableKey(byKey: Map<string, unknown>, candidates: string[]): string | null {
  for (const key of candidates) {
    if (byKey.has(key)) return key
  }
  return null
}

function seriesByKey(series: DataSeriesRow[]): Map<string, DataSeriesPointRow[]> {
  return new Map(series.map((s) => [s.sensorKey, s.points] as const))
}

function normalizePoints(points: DataSeriesPointRow[]): Array<{ ts: string; value: number }> {
  const out: Array<{ ts: string; value: number }> = []
  for (const p of points) {
    const v = toNumber(p.value)
    if (v === undefined) continue
    out.push({ ts: p.ts, value: v })
  }
  out.sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime())
  return out
}

function unionTimestamps(...series: Array<Array<{ ts: string; value: number }>>): string[] {
  const set = new Set<string>()
  for (const s of series) {
    for (const p of s) set.add(p.ts)
  }
  return Array.from(set).sort((a, b) => new Date(a).getTime() - new Date(b).getTime())
}

export default function useSensorData(refreshInterval = 30_000) {
  const { devices } = useDeviceList()
  const { byKey: sensorsByKey } = useSensors()

  const [data, setData] = useState<SensorRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const selectedDevices = useMemo(() => {
    const copy = [...devices]
    copy.sort((a, b) => a.device_id.localeCompare(b.device_id))
    return copy.slice(0, 3).map((d, idx) => ({ deviceId: d.device_id, pseudoId: `device_${idx + 1}` }))
  }, [devices])

  const keys = useMemo(() => {
    const temperatureKey = firstAvailableKey(sensorsByKey as unknown as Map<string, unknown>, ['temperature', 'temp'])
    const humidityKey = firstAvailableKey(sensorsByKey as unknown as Map<string, unknown>, ['humidity', 'hum'])
    const accelerationKey = firstAvailableKey(sensorsByKey as unknown as Map<string, unknown>, [
      'acceleration_total',
      'accel',
      'acceleration',
    ])
    const gyroscopeKey = firstAvailableKey(sensorsByKey as unknown as Map<string, unknown>, ['gyroscope_total', 'gyro', 'gyroscope'])

    return { temperatureKey, humidityKey, accelerationKey, gyroscopeKey }
  }, [sensorsByKey])

  useEffect(() => {
    let cancelled = false

    const fetchData = async () => {
      try {
        setError(null)

        if (
          selectedDevices.length === 0 ||
          !keys.temperatureKey ||
          !keys.humidityKey ||
          !keys.accelerationKey ||
          !keys.gyroscopeKey
        ) {
          if (!cancelled) {
            setData([])
            setLoading(false)
          }
          return
        }

        const end = new Date()
        const start = new Date(end.getTime() - 6 * 60 * 60 * 1000)
        const sensorKeys = [keys.temperatureKey, keys.humidityKey, keys.accelerationKey, keys.gyroscopeKey]

        const all: SensorRecord[] = []
        let id = 1

        for (const d of selectedDevices) {
          const json = await getDeviceSeries({
            deviceId: d.deviceId,
            startTime: start.toISOString(),
            endTime: end.toISOString(),
            sensorKeys,
            interval: 'raw',
            timeField: 'event',
          })

          const by = seriesByKey(json.data?.series ?? [])
          const tPoints = normalizePoints(by.get(keys.temperatureKey) ?? [])
          const hPoints = normalizePoints(by.get(keys.humidityKey) ?? [])
          const aPoints = normalizePoints(by.get(keys.accelerationKey) ?? [])
          const gPoints = normalizePoints(by.get(keys.gyroscopeKey) ?? [])

          const timeline = unionTimestamps(tPoints, hPoints, aPoints, gPoints)

          let ti = 0
          let hi = 0
          let ai = 0
          let gi = 0

          let tVal: number | null = null
          let hVal: number | null = null
          let aVal: number | null = null
          let gVal: number | null = null

          for (const ts of timeline) {
            while (ti < tPoints.length && tPoints[ti]!.ts <= ts) {
              tVal = tPoints[ti]!.value
              ti++
            }
            while (hi < hPoints.length && hPoints[hi]!.ts <= ts) {
              hVal = hPoints[hi]!.value
              hi++
            }
            while (ai < aPoints.length && aPoints[ai]!.ts <= ts) {
              aVal = aPoints[ai]!.value
              ai++
            }
            while (gi < gPoints.length && gPoints[gi]!.ts <= ts) {
              gVal = gPoints[gi]!.value
              gi++
            }

            if (tVal === null || hVal === null || aVal === null || gVal === null) continue

            all.push({
              id: id++,
              device_id: d.pseudoId,
              event_time: ts,
              temperature: tVal,
              humidity: hVal,
              acceleration_total: aVal,
              gyroscope_total: gVal,
            })
          }
        }

        all.sort((a, b) => new Date(a.event_time).getTime() - new Date(b.event_time).getTime())

        if (!cancelled) {
          setData(all.slice(-500))
          setLoading(false)
        }
      } catch (caught) {
        if (!cancelled) {
          setError(caught instanceof Error ? caught : new Error(String(caught)))
          setLoading(false)
        }
      }
    }

    void fetchData()
    const interval = setInterval(() => void fetchData(), refreshInterval)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [keys.accelerationKey, keys.gyroscopeKey, keys.humidityKey, keys.temperatureKey, refreshInterval, selectedDevices])

  return { data, loading, error }
}
