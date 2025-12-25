'use client'

import dynamic from 'next/dynamic'
import { Spin } from 'antd'
import type React from 'react'

const LoadingSpinner = () => (
  <div className="flex h-full min-h-[200px] items-center justify-center">
    <Spin size="large" />
  </div>
)

export const LazyTemperatureChart = dynamic(() => import('./TemperatureChart'), { loading: LoadingSpinner, ssr: false })
export const LazyHumidityChart = dynamic(() => import('./HumidityChart'), { loading: LoadingSpinner, ssr: false })
export const LazyAccelerationChart = dynamic(() => import('./AccelerationChart'), { loading: LoadingSpinner, ssr: false })
export const LazyGyroscopeChart = dynamic(() => import('./GyroscopeChart'), { loading: LoadingSpinner, ssr: false })

export const LazyMapContainer = dynamic(() => import('./MapContainer'), { loading: LoadingSpinner, ssr: false }) as React.ComponentType<{
  mode: '2D' | '卫星图'
  devices?: Array<{
    device_id: string
    name: string
    coord: [number, number]
    temp: number
    hum: number
    status: 'online' | 'offline' | 'maintenance'
    risk?: number
    location?: string
  }>
  center?: [number, number]
  zoom?: number
}>

export const LazyMap3DContainer = dynamic(() => import('./Map3DContainer'), { loading: LoadingSpinner, ssr: false })
export const LazyBarChart = dynamic(() => import('./BarChart'), { loading: LoadingSpinner, ssr: false })
export const LazyLiquidFillChart = dynamic(() => import('./LiquidFillChart'), { loading: LoadingSpinner, ssr: false })
export const LazyDeviceErrorChart = dynamic(() => import('./DeviceErrorChart'), { loading: LoadingSpinner, ssr: false })
export const LazyRealtimeSensorStatus = dynamic(() => import('./RealtimeSensorStatus'), { loading: LoadingSpinner, ssr: false })
export const LazyAnomalyTypeChart = dynamic(() => import('./AnomalyTypeChart'), { loading: LoadingSpinner, ssr: false })
export const LazyExceptionStatsChart = dynamic(() => import('./ExceptionStatsChart'), { loading: LoadingSpinner, ssr: false })
export const LazyAIPredictionComponent = dynamic(() => import('./AIPredictionComponent'), { loading: LoadingSpinner, ssr: false })
export const LazyRealtimeAnomalyTable = dynamic(() => import('./RealtimeAnomalyTable'), { loading: LoadingSpinner, ssr: false })
