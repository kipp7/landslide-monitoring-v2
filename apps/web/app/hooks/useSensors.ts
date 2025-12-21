'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { listSensors, type SensorRow } from '../../lib/api/sensors'

export type SensorDictionaryItem = SensorRow

let cache: { list: SensorDictionaryItem[]; fetchedAtMs: number } | null = null

export default function useSensors() {
  const [list, setList] = useState<SensorDictionaryItem[]>(() => cache?.list ?? [])
  const [loading, setLoading] = useState<boolean>(() => !cache)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const json = await listSensors()
      const next = json.data?.list ?? []
      cache = { list: next, fetchedAtMs: Date.now() }
      setList(next)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (cache && Date.now() - cache.fetchedAtMs < 30_000) {
      setLoading(false)
      return
    }
    void refresh()
  }, [refresh])

  const byKey = useMemo(() => {
    const map = new Map<string, SensorDictionaryItem>()
    for (const s of list) map.set(s.sensorKey, s)
    return map
  }, [list])

  return { list, byKey, loading, error, refresh }
}
