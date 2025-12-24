'use client'

import { useEffect, useState } from 'react'

export interface DeviceErrorItem {
  device_id: string
  count: number
}

type AlertsListResponse = {
  success: boolean
  data?: {
    list: Array<{ deviceId?: string | null }>
    pagination?: unknown
  }
}

export default function useDeviceErrorData(refreshInterval = 30000) {
  const [data, setData] = useState<DeviceErrorItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const fetchData = async () => {
    try {
      const endTime = new Date()
      const startTime = new Date(endTime.getTime() - 24 * 60 * 60 * 1000)

      const params = new URLSearchParams()
      params.set('page', '1')
      params.set('pageSize', '500')
      params.set('startTime', startTime.toISOString())
      params.set('endTime', endTime.toISOString())

      const response = await fetch(`/api/v1/alerts?${params.toString()}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      })

      if (!response.ok) {
        throw new Error(`API请求失败: ${response.status}`)
      }

      const result = (await response.json()) as AlertsListResponse
      if (!result.success) {
        throw new Error('API返回失败')
      }

      const list = result.data?.list ?? []
      const grouped = list.reduce((acc: Record<string, number>, row) => {
        const id = row.deviceId || '未知设备'
        acc[id] = (acc[id] || 0) + 1
        return acc
      }, {})

      const formatted: DeviceErrorItem[] = Object.entries(grouped).map(([device_id, count]) => ({
        device_id,
        count,
      }))

      setData(formatted)
      setError(null)
    } catch (err) {
      const nextError = err instanceof Error ? err : new Error(String(err))
      setError(nextError)
      console.error('获取设备异常数据失败', nextError)
      setData([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, refreshInterval)
    return () => clearInterval(interval)
  }, [refreshInterval])

  return { data, loading, error }
}

