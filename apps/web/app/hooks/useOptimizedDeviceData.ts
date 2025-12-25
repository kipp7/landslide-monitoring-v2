'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { message } from 'antd'
import { apiGetJson } from '../../lib/v2Api'
import { CacheUtils, deviceDataCache, gpsDataCache } from '../utils/advancedCache'

export type OptimizedDeviceData = {
  device_id: string
  display_name: string
  location: string
  coordinates: { lat: number | null; lng: number | null }
  status: 'online' | 'offline'
  health_score: number
  temperature: number | null
  humidity: number | null
  battery_level: number
  signal_strength: number
  data_count_today: number
  last_data_time: string
  baseline_established?: boolean
}

type LegacyDeviceManagementOk = {
  success: true
  data: OptimizedDeviceData
  timestamp?: string
}

type LegacyDeviceManagementError = {
  success: false
  message?: string
  error?: unknown
  timestamp?: string
}

type LegacyDeviceManagementResponse = LegacyDeviceManagementOk | LegacyDeviceManagementError

type LegacyDeviceGpsOk = {
  success: true
  data: any[]
  count: number
  deviceId: string
  hasBaseline?: boolean
  calculationMode?: string
  timestamp?: string
}

export type UseOptimizedDeviceDataOptions = {
  deviceId: string
  autoRefresh?: boolean
  refreshInterval?: number
  enableCache?: boolean
}

function healthBucket(score: number): 'excellent' | 'good' | 'fair' | 'poor' {
  if (score >= 90) return 'excellent'
  if (score >= 70) return 'good'
  if (score >= 50) return 'fair'
  return 'poor'
}

export function useOptimizedDeviceData({
  deviceId,
  autoRefresh = false,
  refreshInterval = 30_000,
  enableCache = true,
}: UseOptimizedDeviceDataOptions) {
  const [data, setData] = useState<OptimizedDeviceData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdateTime, setLastUpdateTime] = useState<string>('')

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const fetchDeviceData = useCallback(
    async (showMessage = false, useCache = enableCache) => {
      if (!deviceId || !deviceId.trim()) {
        setError('deviceId 不能为空')
        return
      }

      try {
        if (abortRef.current) abortRef.current.abort()
        abortRef.current = new AbortController()

        setLoading(true)
        setError(null)
        if (showMessage) message.loading('正在刷新设备数据...', 0.5)

        const cacheKey = CacheUtils.deviceKey(deviceId)
        if (useCache) {
          const cached = await deviceDataCache.get(cacheKey)
          if (cached) {
            setData(cached)
            setLastUpdateTime(new Date().toLocaleTimeString('zh-CN'))
            if (showMessage) message.success(`${cached.display_name || deviceId} 数据刷新成功（缓存）`)
            return
          }
        }

        const json = await apiGetJson<LegacyDeviceManagementResponse>(`/api/device-management?device_id=${encodeURIComponent(deviceId)}`, {
          signal: abortRef.current.signal,
        })

        if (!json || typeof json !== 'object') throw new Error('Unexpected API response')
        if ('success' in json && json.success === true) {
          setData(json.data)
          if (useCache) deviceDataCache.set(cacheKey, json.data, { priority: 2 })
          setLastUpdateTime(new Date().toLocaleTimeString('zh-CN'))
          if (showMessage) message.success(`${json.data.display_name || deviceId} 数据刷新成功`)
          return
        }

        const msg = 'message' in json && typeof json.message === 'string' ? json.message : '获取数据失败'
        throw new Error(msg)
      } catch (caught) {
        const err = caught as any
        if (err?.name === 'AbortError') return
        const msg = caught instanceof Error ? caught.message : '获取设备数据失败'
        setError(msg)
        if (showMessage) message.error(msg)
      } finally {
        setLoading(false)
      }
    },
    [deviceId, enableCache],
  )

  const refresh = useCallback(
    async (showMessage = false) => {
      await fetchDeviceData(showMessage)
    },
    [fetchDeviceData],
  )

  const fetchGPSData = useCallback(
    async (limit = 50) => {
      const cacheKey = CacheUtils.gpsKey(deviceId, 'latest', limit)
      if (enableCache) {
        const cached = await gpsDataCache.get(cacheKey)
        if (cached) return cached
      }

      const json = await apiGetJson<LegacyDeviceGpsOk>(
        `/api/device-management?device_id=${encodeURIComponent(deviceId)}&data_only=true&limit=${encodeURIComponent(String(limit))}`,
      )
      if (!json?.success) throw new Error('获取 GPS 数据失败')
      const rows = json.data ?? []
      if (enableCache) gpsDataCache.set(cacheKey, rows, { priority: 1 })
      return rows
    },
    [deviceId, enableCache],
  )

  const performHealthCheck = useCallback(
    async (devices: string[] = [deviceId]) => {
      const out: Array<{ device_id: string; status: string; health_score: number; battery_level?: number; signal_strength?: number }> = []
      for (const id of devices) {
        try {
          const json = await apiGetJson<LegacyDeviceManagementResponse>(`/api/device-management?device_id=${encodeURIComponent(id)}`)
          if (json && typeof json === 'object' && 'success' in json && json.success === true) {
            out.push({
              device_id: id,
              status: json.data.status,
              health_score: json.data.health_score,
              battery_level: json.data.battery_level,
              signal_strength: json.data.signal_strength,
            })
          } else {
            out.push({ device_id: id, status: 'unknown', health_score: 0 })
          }
        } catch {
          out.push({ device_id: id, status: 'error', health_score: 0 })
        }
      }
      return out
    },
    [deviceId],
  )

  const clearCache = useCallback(async () => {
    deviceDataCache.delete(CacheUtils.deviceKey(deviceId))
    gpsDataCache.invalidatePattern(/^gps:/)
    setData(null)
    setLastUpdateTime('')
    message.success('缓存已清理')
    await refresh(false)
  }, [deviceId, refresh])

  useEffect(() => {
    void fetchDeviceData(false, true)
  }, [fetchDeviceData])

  useEffect(() => {
    if (!autoRefresh || refreshInterval <= 0) return
    intervalRef.current = setInterval(() => void fetchDeviceData(false, true), refreshInterval)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [autoRefresh, fetchDeviceData, refreshInterval])

  const isOnline = data?.status === 'online'
  const healthStatus = useMemo(() => healthBucket(data?.health_score ?? 0), [data?.health_score])

  return {
    data,
    loading,
    error,
    lastUpdateTime,

    refresh,
    fetchGPSData,
    performHealthCheck,
    clearCache,

    isOnline,
    healthStatus,
  }
}

