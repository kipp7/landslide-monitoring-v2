'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { message } from 'antd'
import { loadDeviceSnapshotPoint, loadDeviceSnapshotView, type DeviceSnapshotView } from '../../../../lib/api/deviceStateView'

export type OptimizedDeviceData = DeviceSnapshotView

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

export function useOptimizedDeviceData({ deviceId, autoRefresh = false, refreshInterval = 30_000 }: UseOptimizedDeviceDataOptions) {
  const [data, setData] = useState<OptimizedDeviceData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdateTime, setLastUpdateTime] = useState<string>('')

  const intervalRef = useRef<number | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const fetchDeviceData = useCallback(
    async (showMessage = false) => {
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

        const snapshot = await loadDeviceSnapshotView(deviceId)
        if (!abortRef.current.signal.aborted) {
          setData(snapshot)
          setLastUpdateTime(new Date().toLocaleTimeString('zh-CN'))
          if (showMessage) message.success(`${snapshot.display_name || deviceId} 数据刷新成功`)
          return
        }
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
    [deviceId],
  )

  const refresh = useCallback(
    async (showMessage = false) => {
      await fetchDeviceData(showMessage)
    },
    [fetchDeviceData],
  )

  const fetchGPSData = useCallback(
    async (limit = 50) => {
      const latestPoint = await loadDeviceSnapshotPoint(deviceId)
      return [latestPoint].slice(0, Math.max(1, limit))
    },
    [deviceId],
  )

  const performHealthCheck = useCallback(
    async (devices: string[] = [deviceId]) => {
      const out: Array<{ device_id: string; status: string; health_score: number; battery_level?: number; signal_strength?: number }> = []
      for (const id of devices) {
        try {
          const snapshot = await loadDeviceSnapshotView(id)
          if (snapshot) {
            out.push({
              device_id: id,
              status: snapshot.status,
              health_score: snapshot.health_score,
              battery_level: snapshot.battery_level,
              signal_strength: snapshot.signal_strength,
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
    setData(null)
    setLastUpdateTime('')
    message.success('缓存已清理')
    await refresh(false)
  }, [refresh])

  useEffect(() => {
    void fetchDeviceData(false)
  }, [fetchDeviceData])

  useEffect(() => {
    if (!autoRefresh || refreshInterval <= 0) return
    intervalRef.current = window.setInterval(() => void fetchDeviceData(false), refreshInterval)
    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current)
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
