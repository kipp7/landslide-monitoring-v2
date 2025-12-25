'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { listLegacyDeviceMappings, type LegacyDeviceMappingRow } from '../../../../lib/api/legacyDeviceMappings'

export type UseDeviceMappingsResult = {
  mappings: LegacyDeviceMappingRow[]
  loading: boolean
  error: Error | null
  getMapping: (deviceId: string | null | undefined) => LegacyDeviceMappingRow | undefined
  getDeviceName: (deviceId: string | null | undefined) => string | undefined
  refetch: () => Promise<void>
}

export default function useDeviceMappings(refreshInterval = 5 * 60_000): UseDeviceMappingsResult {
  const [mappings, setMappings] = useState<LegacyDeviceMappingRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const fetchMappings = useCallback(async () => {
    try {
      setError(null)
      const json = await listLegacyDeviceMappings()
      if (!json || typeof json !== 'object') throw new Error('Unexpected API response')
      if (!('success' in json) || json.success !== true) {
        const message = 'message' in json && typeof json.message === 'string' ? json.message : 'Failed to load device mappings'
        throw new Error(message)
      }
      setMappings(Array.isArray(json.data) ? json.data : [])
    } catch (caught) {
      setError(caught instanceof Error ? caught : new Error(String(caught)))
      setMappings([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchMappings()

    if (refreshInterval > 0) {
      const interval = setInterval(() => void fetchMappings(), refreshInterval)
      return () => clearInterval(interval)
    }
  }, [fetchMappings, refreshInterval])

  const bySimpleId = useMemo(() => {
    const map = new Map<string, LegacyDeviceMappingRow>()
    for (const row of mappings) {
      if (row.simple_id) map.set(row.simple_id, row)
    }
    return map
  }, [mappings])

  const byActualId = useMemo(() => {
    const map = new Map<string, LegacyDeviceMappingRow>()
    for (const row of mappings) {
      if (row.actual_device_id) map.set(row.actual_device_id, row)
    }
    return map
  }, [mappings])

  const getMapping = useCallback(
    (deviceId: string | null | undefined) => {
      if (!deviceId) return undefined
      return bySimpleId.get(deviceId) ?? byActualId.get(deviceId)
    },
    [byActualId, bySimpleId]
  )

  const getDeviceName = useCallback(
    (deviceId: string | null | undefined) => {
      const m = getMapping(deviceId)
      return m?.device_name || m?.location_name || undefined
    },
    [getMapping]
  )

  return { mappings, loading, error, getMapping, getDeviceName, refetch: fetchMappings }
}

