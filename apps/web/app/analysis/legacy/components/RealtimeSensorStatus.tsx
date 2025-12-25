'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { toNumber } from '../../../../lib/v2Api'
import useDeviceMappings from '../hooks/useDeviceMappings'
import type { LegacyRealtimeRow } from '../hooks/useRealtimeData'
import useRealtimeData from '../hooks/useRealtimeData'

type SensorStatus = 'normal' | 'warning' | 'danger'

type SensorData = {
  name: string
  value: number
  unit: string
  status: SensorStatus
}

type NodeData = {
  nodeId: string
  nodeName: string
  location: string
  sensors: SensorData[]
  lastUpdate: string
  isOnline: boolean
}

function getSensorStatus(value: number, warning: number, danger: number): SensorStatus {
  if (value >= danger) return 'danger'
  if (value >= warning) return 'warning'
  return 'normal'
}

function toMetricsRecord(metrics: unknown): Record<string, unknown> | null {
  return metrics && typeof metrics === 'object' ? (metrics as Record<string, unknown>) : null
}

function metricNumber(metrics: Record<string, unknown> | null, candidates: string[]): number | undefined {
  if (!metrics) return undefined
  for (const key of candidates) {
    if (!(key in metrics)) continue
    const n = toNumber(metrics[key])
    if (n !== undefined) return n
  }
  return undefined
}

function magnitude3(
  metrics: Record<string, unknown> | null,
  xKeys: string[],
  yKeys: string[],
  zKeys: string[],
): number | undefined {
  const x = metricNumber(metrics, xKeys) ?? 0
  const y = metricNumber(metrics, yKeys) ?? 0
  const z = metricNumber(metrics, zKeys) ?? 0
  if (!Number.isFinite(x) && !Number.isFinite(y) && !Number.isFinite(z)) return undefined
  return Math.sqrt(x * x + y * y + z * z)
}

function buildSensors(row: LegacyRealtimeRow | undefined, sensorTypes: string[]): SensorData[] {
  if (!row) return []
  const metrics = toMetricsRecord(row.metrics)

  const sensors: SensorData[] = []
  for (const sensorType of sensorTypes) {
    if (sensorType === 'temperature') {
      const temp = toNumber(row.temperature) ?? metricNumber(metrics, ['temperature', 'temp']) ?? 0
      sensors.push({
        name: '温度',
        value: temp,
        unit: '°C',
        status: getSensorStatus(Math.abs(temp - 25), 15, 25),
      })
      continue
    }

    if (sensorType === 'humidity') {
      const hum = toNumber(row.humidity) ?? metricNumber(metrics, ['humidity', 'hum']) ?? 0
      sensors.push({
        name: '湿度',
        value: hum,
        unit: '%',
        status: getSensorStatus(hum, 80, 90),
      })
      continue
    }

    if (sensorType === 'acceleration') {
      const total =
        metricNumber(metrics, ['acceleration_total', 'acceleration', 'accel']) ??
        magnitude3(metrics, ['acceleration_x', 'accel_x'], ['acceleration_y', 'accel_y'], ['acceleration_z', 'accel_z']) ??
        0
      sensors.push({
        name: '加速度',
        value: total,
        unit: 'mg',
        status: getSensorStatus(total, 1500, 2500),
      })
      continue
    }

    if (sensorType === 'gyroscope') {
      const total =
        metricNumber(metrics, ['gyroscope_total', 'gyroscope', 'gyro']) ??
        magnitude3(metrics, ['gyroscope_x', 'gyro_x'], ['gyroscope_y', 'gyro_y'], ['gyroscope_z', 'gyro_z']) ??
        0
      sensors.push({
        name: '陀螺仪',
        value: total,
        unit: '°/s',
        status: getSensorStatus(total, 50, 100),
      })
      continue
    }

    if (sensorType === 'illumination') {
      const lux = metricNumber(metrics, ['illumination', 'lux']) ?? 0
      sensors.push({
        name: '光照',
        value: lux,
        unit: 'lux',
        status: lux < 100 ? 'warning' : 'normal',
      })
      continue
    }

    if (sensorType === 'vibration') {
      const vib = metricNumber(metrics, ['vibration_total', 'vibration']) ?? 0
      sensors.push({
        name: '振动',
        value: vib,
        unit: 'Hz',
        status: getSensorStatus(vib, 5, 10),
      })
      continue
    }

    if (sensorType === 'gps') {
      const deform =
        metricNumber(metrics, ['deformation_distance_3d', 'deformation_3d', 'deformation', 'gps_deformation']) ?? 0
      sensors.push({
        name: '地质形变',
        value: deform,
        unit: 'mm',
        status: getSensorStatus(deform, 10, 50),
      })
    }
  }

  return sensors
}

export default function RealtimeSensorStatus() {
  const { data } = useRealtimeData()
  const { getMapping } = useDeviceMappings()
  const [currentNodeIndex, setCurrentNodeIndex] = useState(0)

  const stationConfigs = useMemo(() => {
    const base = [
      { device_id: 'device_1', sensor_types: ['temperature', 'humidity', 'acceleration', 'illumination', 'gps'] },
      { device_id: 'device_2', sensor_types: ['temperature', 'humidity', 'gyroscope', 'vibration', 'gps'] },
      { device_id: 'device_3', sensor_types: ['temperature', 'acceleration', 'illumination', 'gps', 'vibration'] },
    ]

    return base.map((cfg) => {
      const m = getMapping(cfg.device_id)
      const stationName = m?.device_name || m?.location_name || cfg.device_id
      const locationName = m?.location_name || m?.device_name || ''
      return { ...cfg, station_name: stationName, location_name: locationName }
    })
  }, [getMapping])

  const nodesData = useMemo<NodeData[]>(() => {
    return stationConfigs.map((station) => {
      const node = data.find((row) => row.device_id === station.device_id)
      const lastUpdate = node?.event_time ?? ''
      const isOnline = lastUpdate ? Date.now() - new Date(lastUpdate).getTime() < 5 * 60 * 1000 : false

      return {
        nodeId: station.device_id,
        nodeName: station.station_name,
        location: station.location_name,
        sensors: buildSensors(node, station.sensor_types),
        lastUpdate,
        isOnline,
      }
    })
  }, [data, stationConfigs])

  useEffect(() => {
    if (currentNodeIndex >= nodesData.length) setCurrentNodeIndex(0)
  }, [currentNodeIndex, nodesData.length])

  useEffect(() => {
    if (nodesData.length <= 1) return
    const interval = setInterval(() => {
      setCurrentNodeIndex((prev) => (prev + 1) % nodesData.length)
    }, 4000)
    return () => clearInterval(interval)
  }, [nodesData.length])

  const currentNode = nodesData[currentNodeIndex] || null

  if (!currentNode) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <div className="mb-1 text-sm font-bold text-cyan-400">所有节点离线</div>
          <div className="text-xs text-gray-400">等待设备数据...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col rounded-lg border border-cyan-500/30 bg-black/20 p-2 backdrop-blur-sm">
      <div className="mb-0.5 flex-shrink-0 text-center">
        <div className="mb-0.5 flex items-center justify-center gap-1">
          <div className={`h-1 w-1 rounded-full ${currentNode.isOnline ? 'animate-pulse bg-green-400' : 'bg-red-400'}`} />
          <div className="truncate text-xs font-bold text-cyan-400">{currentNode.nodeName}</div>
        </div>
        <div className="mb-0.5 truncate text-xs text-gray-400">{currentNode.location}</div>
        <div className="text-xs text-gray-500">
          {currentNode.lastUpdate ? new Date(currentNode.lastUpdate).toLocaleTimeString() : '无数据'}
        </div>

        {nodesData.length > 1 ? (
          <div className="mt-0.5 flex justify-center gap-0.5">
            {nodesData.map((_, i) => (
              <div
                key={i}
                className={`h-1 w-1 rounded-full transition-all duration-300 ${
                  i === currentNodeIndex ? 'bg-cyan-400' : 'bg-gray-600'
                }`}
              />
            ))}
          </div>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col justify-center">
        <div className="mb-3 text-center">
          <div className="mb-2 text-sm font-medium text-white">传感器状态</div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="rounded border border-green-500/50 bg-green-500/20 p-2">
              <div className="text-lg font-bold text-green-400">{currentNode.sensors.filter((s) => s.status === 'normal').length}</div>
              <div className="text-green-400">正常</div>
            </div>
            <div className="rounded border border-orange-500/50 bg-orange-500/20 p-2">
              <div className="text-lg font-bold text-orange-400">{currentNode.sensors.filter((s) => s.status === 'warning').length}</div>
              <div className="text-orange-400">警告</div>
            </div>
            <div className="rounded border border-red-500/50 bg-red-500/20 p-2">
              <div className="text-lg font-bold text-red-400">{currentNode.sensors.filter((s) => s.status === 'danger').length}</div>
              <div className="text-red-400">异常</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

