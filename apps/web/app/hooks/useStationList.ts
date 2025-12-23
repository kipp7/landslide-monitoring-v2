'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { listStations, type StationRow } from '../../lib/api/stations'

export default function useStationList() {
  const [stations, setStations] = useState<StationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const fetchStations = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const json = await listStations(1, 500)
      setStations(json.data?.list ?? [])
    } catch (caught) {
      const err = caught instanceof Error ? caught : new Error(String(caught))
      setError(err)
      setStations([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStations()
  }, [fetchStations])

  const byId = useMemo(() => {
    const m = new Map<string, StationRow>()
    for (const s of stations) m.set(s.stationId, s)
    return m
  }, [stations])

  return { stations, byId, loading, error, refetch: fetchStations }
}

