'use client'

import { useCallback, useRef, useState } from 'react'
import { message } from 'antd'
import { apiJson } from '../../lib/v2Api'
import { listLegacyDeviceMappings } from '../../lib/api/legacyDeviceMappings'
import { CacheUtils, globalCache } from '../utils/advancedCache'

export type AggregationType = 'hierarchy_stats' | 'network_stats' | 'device_summary' | 'real_time_dashboard'
export type TimeRange = '1h' | '6h' | '24h' | '7d' | '30d'

export type AggregationRequest = {
  type: AggregationType
  devices?: string[]
  timeRange?: TimeRange
  includeBaselines?: boolean
  includeAnomalies?: boolean
}

export type AggregationResult = {
  success: boolean
  type: AggregationType
  data: any
  generatedAt: string
  source: string
  fromCache?: boolean
  timestamp?: string
  message?: string
}

function looksLikeUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export function useDataAggregation() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<Record<string, AggregationResult>>({})

  const abortControllerRef = useRef<AbortController | null>(null)

  const mappingRef = useRef<Map<string, string> | null>(null)
  const mappingPromiseRef = useRef<Promise<Map<string, string>> | null>(null)

  const ensureDeviceIdMap = useCallback(async (): Promise<Map<string, string>> => {
    if (mappingRef.current) return mappingRef.current
    if (mappingPromiseRef.current) return mappingPromiseRef.current

    mappingPromiseRef.current = (async () => {
      try {
        const resp = await listLegacyDeviceMappings()
        if (!resp || typeof resp !== 'object' || resp.success !== true) return new Map()
        const map = new Map<string, string>()
        for (const row of resp.data ?? []) {
          if (row.simple_id && row.actual_device_id) {
            map.set(row.simple_id, row.actual_device_id)
            map.set(row.actual_device_id, row.actual_device_id)
          }
        }
        mappingRef.current = map
        return map
      } finally {
        mappingPromiseRef.current = null
      }
    })()

    return mappingPromiseRef.current
  }, [])

  const resolveDevices = useCallback(
    async (devices: string[] | undefined): Promise<string[] | undefined> => {
      if (!devices || devices.length === 0) return devices
      const map = await ensureDeviceIdMap()
      const out: string[] = []
      for (const input of devices) {
        const mapped = map.get(input)
        if (mapped) out.push(mapped)
        else if (looksLikeUuid(input)) out.push(input)
      }
      return out.length > 0 ? out : undefined
    },
    [ensureDeviceIdMap],
  )

  const aggregate = useCallback(
    async (request: AggregationRequest, showMessage = false): Promise<AggregationResult | null> => {
      try {
        if (abortControllerRef.current) abortControllerRef.current.abort()
        abortControllerRef.current = new AbortController()

        setLoading(true)
        setError(null)

        if (showMessage) message.loading(`正在聚合 ${request.type} 数据...`, 0.5)

        const resolvedDevices = await resolveDevices(request.devices)
        const payload = { ...request, ...(resolvedDevices ? { devices: resolvedDevices } : {}) }

        const cacheKey = CacheUtils.aggregationKey(request.type, JSON.stringify(payload))
        const cached = await globalCache.get(cacheKey)
        if (cached) {
          const resultKey = `${request.type}_${JSON.stringify(payload)}`
          setResults((prev) => ({ ...prev, [resultKey]: cached }))
          if (showMessage) message.success(`${request.type} 数据聚合完成（本地缓存）`)
          return cached
        }

        const result = await apiJson<AggregationResult>('/api/data-aggregation', payload, {
          signal: abortControllerRef.current.signal,
        })

        if (result && result.success) {
          globalCache.set(cacheKey, result, { priority: 1 })
          const resultKey = `${request.type}_${JSON.stringify(payload)}`
          setResults((prev) => ({ ...prev, [resultKey]: result }))
          if (showMessage) message.success(`${request.type} 数据聚合完成`)
          return result
        }

        throw new Error('聚合处理失败')
      } catch (caught) {
        const err = caught as any
        if (err?.name === 'AbortError') return null
        const msg = caught instanceof Error ? caught.message : '数据聚合失败'
        setError(msg)
        if (showMessage) message.error(msg)
        return null
      } finally {
        setLoading(false)
      }
    },
    [resolveDevices],
  )

  const getHierarchyStats = useCallback((showMessage = false) => aggregate({ type: 'hierarchy_stats' }, showMessage), [aggregate])

  const getNetworkStats = useCallback(
    (devices: string[] = [], showMessage = false) => aggregate({ type: 'network_stats', devices }, showMessage),
    [aggregate],
  )

  const getDeviceSummary = useCallback(
    (devices: string[] = [], timeRange: TimeRange = '24h', showMessage = false) =>
      aggregate({ type: 'device_summary', devices, timeRange }, showMessage),
    [aggregate],
  )

  const getRealTimeDashboard = useCallback(
    (timeRange: TimeRange = '24h', includeBaselines = true, includeAnomalies = true, showMessage = false) =>
      aggregate({ type: 'real_time_dashboard', timeRange, includeBaselines, includeAnomalies }, showMessage),
    [aggregate],
  )

  const clearAggregationCache = useCallback(async () => {
    setResults({})
    globalCache.invalidatePattern(/^aggregation:/)
    message.success('聚合缓存已清理')
  }, [])

  const batchAggregate = useCallback(
    async (requests: AggregationRequest[], showMessage = false): Promise<AggregationResult[]> => {
      try {
        setLoading(true)
        setError(null)

        if (showMessage) message.loading(`正在批量聚合 ${requests.length} 项数据...`, 1)

        const settled = await Promise.allSettled(requests.map((req) => aggregate(req, false)))
        const ok: AggregationResult[] = []
        const failed: string[] = []

        settled.forEach((r, idx) => {
          if (r.status === 'fulfilled' && r.value) ok.push(r.value)
          else failed.push(requests[idx]?.type ?? 'unknown')
        })

        if (showMessage) {
          if (failed.length === 0) message.success(`批量聚合完成：${ok.length} 项`)
          else message.warning(`部分聚合失败：${failed.join(', ')}`)
        }

        return ok
      } catch (caught) {
        const msg = caught instanceof Error ? caught.message : '批量聚合失败'
        setError(msg)
        if (showMessage) message.error(msg)
        return []
      } finally {
        setLoading(false)
      }
    },
    [aggregate],
  )

  const getCachedResult = useCallback(
    (type: AggregationType, request?: Partial<AggregationRequest>) => {
      const resultKey = `${type}_${JSON.stringify({ type, ...request })}`
      return results[resultKey] || null
    },
    [results],
  )

  const cleanup = useCallback(() => {
    if (abortControllerRef.current) abortControllerRef.current.abort()
  }, [])

  return {
    loading,
    error,
    results,

    aggregate,
    clearAggregationCache,
    batchAggregate,

    getHierarchyStats,
    getNetworkStats,
    getDeviceSummary,
    getRealTimeDashboard,

    getCachedResult,
    cleanup,

    hasResults: Object.keys(results).length > 0,
    resultCount: Object.keys(results).length,
  }
}

