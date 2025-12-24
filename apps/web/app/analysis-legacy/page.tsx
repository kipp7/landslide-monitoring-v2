'use client'

import { Alert, Spin } from 'antd'
import { Suspense, useEffect, useMemo, useState } from 'react'
import BaseCard from '../analysis/legacy/components/BaseCard'
import HoverSidebar from '../analysis/legacy/components/HoverSidebar'
import { type LegacyMapType } from '../analysis/legacy/components/MapSwitchPanel'
import MapSwitchPanel from '../analysis/legacy/components/MapSwitchPanel'
import {
  LazyAIPredictionComponent,
  LazyAccelerationChart,
  LazyAnomalyTypeChart,
  LazyBarChart,
  LazyGyroscopeChart,
  LazyHumidityChart,
  LazyMap3DContainer,
  LazyMapContainer,
  LazyRealtimeAnomalyTable,
  LazyRealtimeSensorStatus,
  LazyTemperatureChart,
} from '../analysis/legacy/components/LazyComponents'
import useDeviceShadow from '../analysis/legacy/hooks/useDeviceShadow'
import usePerformanceMonitor from '../analysis/legacy/hooks/usePerformanceMonitor'
import useRealtimeData from '../analysis/legacy/hooks/useRealtimeData'
import { generateDeviceName, getDetailedLocationInfo, getRiskByLocation } from '../analysis/legacy/utils/location-naming'

export default function AnalysisLegacyPage() {
  const [mapType, setMapType] = useState<LegacyMapType>('卫星图')
  const [alert, setAlert] = useState(false)
  const [deviceMappings] = useState<Array<{ simple_id: string; device_name?: string; location_name?: string }>>([])

  const { loading, error, deviceStats, data } = useRealtimeData()
  const { data: shadowData, error: shadowError } = useDeviceShadow()
  const { warnings, isPerformanceGood } = usePerformanceMonitor()

  const getDevicesForMap = useMemo(() => {
    if (!data || data.length === 0) return []

    const deviceMap = new Map<string, (typeof data)[number]>()
    for (const record of data) {
      const deviceId = record.device_id
      const lat = record.latitude
      const lon = record.longitude
      if (!deviceId || lat == null || lon == null) continue
      const existing = deviceMap.get(deviceId)
      if (!existing || new Date(record.event_time) > new Date(existing.event_time)) deviceMap.set(deviceId, record)
    }

    return Array.from(deviceMap.values()).map((record) => {
      const lat = typeof record.latitude === 'string' ? parseFloat(record.latitude) : Number(record.latitude)
      const lng = typeof record.longitude === 'string' ? parseFloat(record.longitude) : Number(record.longitude)
      const locationInfo = getDetailedLocationInfo(lat, lng)
      const mapping = deviceMappings.find((m) => m.simple_id === record.device_id)
      const deviceName = mapping?.device_name || mapping?.location_name || generateDeviceName(lat, lng, record.device_id)
      return {
        device_id: record.device_id,
        name: deviceName,
        coord: [lng, lat] as [number, number],
        temp: typeof record.temperature === 'string' ? parseFloat(record.temperature) || 0 : Number(record.temperature ?? 0),
        hum: typeof record.humidity === 'string' ? parseFloat(record.humidity) || 0 : Number(record.humidity ?? 0),
        status: 'online' as const,
        risk: getRiskByLocation(lat, lng),
        location: locationInfo.description,
      }
    })
  }, [data, deviceMappings])

  const mapCenter = useMemo((): [number, number] => {
    if (getDevicesForMap.length === 0) return [110.1805, 22.6263]
    const totalLng = getDevicesForMap.reduce((sum, device) => sum + device.coord[0], 0)
    const totalLat = getDevicesForMap.reduce((sum, device) => sum + device.coord[1], 0)
    return [totalLng / getDevicesForMap.length, totalLat / getDevicesForMap.length]
  }, [getDevicesForMap])

  useEffect(() => {
    const riskLevel = shadowData?.properties?.risk_level ?? 0
    setAlert(riskLevel >= 1)
  }, [shadowData])

  useEffect(() => {
    if (!isPerformanceGood) {
      // 保留参考区行为入口（后续 WS-N.9 完整实现）
    }
  }, [isPerformanceGood])

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#001529]">
        <Alert message="数据加载失败" description={error} type="error" showIcon />
      </div>
    )
  }

  return (
    <div className="relative flex h-screen flex-col bg-[#001529]">
      <HoverSidebar />

      {alert ? (
        <div className="pointer-events-none absolute inset-0 z-50 animate-pulse">
          <div className="absolute left-0 top-0 h-4 w-full bg-red-500 blur-xl opacity-100" />
          <div className="absolute bottom-0 left-0 h-4 w-full bg-red-500 blur-xl opacity-100" />
          <div className="absolute left-0 top-0 h-full w-4 bg-red-500 blur-xl opacity-100" />
          <div className="absolute right-0 top-0 h-full w-4 bg-red-500 blur-xl opacity-100" />
        </div>
      ) : null}

      {warnings.length > 0 ? (
        <div className="absolute right-4 top-20 z-50">
          <Alert message="性能警告" description={warnings.join(', ')} type="warning" closable style={{ maxWidth: 300 }} />
        </div>
      ) : null}

      {loading ? (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black bg-opacity-50">
          <Spin size="large" />
        </div>
      ) : null}

      <div className="relative z-10 flex w-full items-center justify-center py-0">
        <div className="absolute h-[6px] w-[600px] rounded-full bg-cyan-400 blur-md opacity-30" />

        <div className="absolute left-8 top-1/2 z-20 flex -translate-y-1/2 space-x-6">
          <div className="cursor-pointer text-lg font-bold text-cyan-200 transition hover:text-white">首页</div>
          <div className="cursor-pointer text-lg font-bold text-cyan-200 transition hover:text-white">设备管理</div>
        </div>

        <div className="absolute right-8 top-1/2 z-20 flex -translate-y-1/2 space-x-6">
          <div className="cursor-pointer text-lg font-bold text-cyan-200 transition hover:text-white">地质形变监测</div>
          <div className="cursor-pointer text-lg font-bold text-cyan-200 transition hover:text-white">系统设置</div>
        </div>

        <div
          className="z-10 text-[35px] font-extrabold tracking-[10px] text-cyan-300"
          style={{
            textShadow: '0 0 10px rgba(0,255,255,0.7), 0 0 20px rgba(0,255,255,0.4)',
            letterSpacing: '0.25em',
          }}
        >
          山体滑坡数据监测大屏
        </div>
      </div>

      <div className="z-10 flex-1 overflow-hidden p-2">
        <div className="grid h-full grid-cols-4 grid-rows-4 gap-2">
          <div className="col-span-1 row-span-4 flex h-full flex-col gap-2">
            <BaseCard title="温度趋势图 ℃ - 挂傍山监测网络(3设备)">
              <Suspense fallback={<Spin />}>
                <LazyTemperatureChart />
              </Suspense>
            </BaseCard>
            <BaseCard title="湿度趋势图 % - 挂傍山监测网络(3设备)">
              <Suspense fallback={<Spin />}>
                <LazyHumidityChart />
              </Suspense>
            </BaseCard>
            <BaseCard title="加速度趋势图 mg - 挂傍山监测网络(3设备)">
              <Suspense fallback={<Spin />}>
                <LazyAccelerationChart />
              </Suspense>
            </BaseCard>
            <BaseCard title="陀螺仪趋势图 °/s - 挂傍山监测网络(3设备)">
              <Suspense fallback={<Spin />}>
                <LazyGyroscopeChart />
              </Suspense>
            </BaseCard>
          </div>

          <div className="col-span-2 col-start-2 row-span-4">
            <BaseCard
              title={`滑坡监测地图与预警(最新 ${deviceStats.lastUpdateTime ? new Date(deviceStats.lastUpdateTime).toLocaleTimeString() : '无数据'})`}
              extra={<MapSwitchPanel selected={mapType} onSelect={(t) => setMapType(t)} />}
            >
              <div className="flex h-full flex-col gap-2">
                <div className="basis-[65%] min-h-0">
                  <Suspense fallback={<Spin />}>
                    {mapType === '3D' ? (
                      <LazyMap3DContainer />
                    ) : mapType === '视频' ? (
                      <div className="flex h-full w-full items-center justify-center rounded-lg bg-black">
                        <img
                          src={`http://192.168.43.55/stream?t=${Date.now()}`}
                          className="max-h-full max-w-full object-contain"
                          alt="ESP32-CAM 实时视频流"
                          onError={(e) => {
                            console.error('ESP32-CAM视频流加载失败')
                            const target = e.target as HTMLImageElement
                            target.style.display = 'none'
                          }}
                          onLoad={() => {
                            console.log('ESP32-CAM视频流加载成功')
                          }}
                        />
                      </div>
                    ) : getDevicesForMap.length > 0 ? (
                      <LazyMapContainer mode={mapType === '卫星图' ? '卫星图' : '2D'} devices={getDevicesForMap} center={mapCenter} zoom={16} />
                    ) : (
                      <div className="flex h-full items-center justify-center rounded-lg bg-gray-50">
                        <div className="text-center text-gray-500">
                          <div className="mb-2 text-lg font-medium">暂无监测点数据</div>
                          <div className="text-sm">等待传感器数据上传中...</div>
                        </div>
                      </div>
                    )}
                  </Suspense>
                </div>
                <div className="basis-[35%] min-h-0 overflow-hidden">
                  <Suspense fallback={<Spin />}>
                    <LazyRealtimeAnomalyTable />
                  </Suspense>
                </div>
              </div>
            </BaseCard>
          </div>

          <div className="col-start-4 row-start-1">
            <BaseCard title="雨量图 ml">
              <Suspense fallback={<Spin />}>
                <LazyBarChart />
              </Suspense>
            </BaseCard>
          </div>

          <div className="col-start-4 row-span-2 row-start-2">
            <BaseCard title="AI 分析与预测">
              <Suspense fallback={<Spin />}>
                <LazyAIPredictionComponent />
              </Suspense>
            </BaseCard>
          </div>

          <div className="col-start-4 row-start-4">
            <BaseCard title="实时传感器状态与异常分析">
              <div className="flex h-full w-full flex-row items-stretch gap-3">
                <div className="h-full w-1/2">
                  <Suspense fallback={<Spin />}>
                    <LazyRealtimeSensorStatus />
                  </Suspense>
                </div>
                <div className="h-full w-1/2">
                  <Suspense fallback={<Spin />}>
                    <LazyAnomalyTypeChart />
                  </Suspense>
                </div>
              </div>
            </BaseCard>
          </div>
        </div>
      </div>

      {shadowError ? (
        <div className="absolute bottom-4 right-4 z-50 max-w-[380px]">
          <Alert type="warning" showIcon message="Shadow 数据不可用（已从 Supabase 迁移到 v2 API，待 WS-N.10 对齐）" description={shadowError} />
        </div>
      ) : null}
    </div>
  )
}
