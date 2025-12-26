'use client'

import React, { useEffect, useMemo, useState } from 'react'
import useSensorData from '../hooks/useSensorData'

interface SensorData {
  name: string
  icon: string
  value: number
  unit: string
  status: 'normal' | 'warning' | 'danger'
}

interface NodeData {
  nodeId: string
  nodeName: string
  location: string
  sensors: SensorData[]
  lastUpdate: string
  isOnline: boolean
}

const RealtimeSensorStatus = () => {
  const { data } = useSensorData()
  const [currentNodeIndex, setCurrentNodeIndex] = useState(0)

  const fallbackStations = [
    {
      device_id: 'device_1',
      station_name: '挂傍山中心监测站',
      location_name: '玉林师范学院东校区挂傍山中心点',
      sensor_types: ['temperature', 'humidity', 'acceleration', 'illumination', 'gps'],
    },
    {
      device_id: 'device_2',
      station_name: '坡顶监测站',
      location_name: '玉林师范学院东校区挂傍山坡顶',
      sensor_types: ['temperature', 'humidity', 'gyroscope', 'vibration', 'gps'],
    },
    {
      device_id: 'device_3',
      station_name: '坡脚监测站',
      location_name: '玉林师范学院东校区挂傍山坡脚',
      sensor_types: ['temperature', 'acceleration', 'illumination', 'gps', 'vibration'],
    },
  ]

  const nodesData = useMemo(() => {
    const nodes: NodeData[] = []

    fallbackStations.forEach((station) => {
      const deviceId = station.device_id

      const nodeData = data
        .filter((record) => record.device_id === deviceId)
        .sort((a, b) => new Date(b.event_time).getTime() - new Date(a.event_time).getTime())
        .slice(0, 1)[0]

      const isOnline = nodeData && Date.now() - new Date(nodeData.event_time).getTime() < 5 * 60 * 1000

      const sensors: SensorData[] = []

      if (nodeData) {
        station.sensor_types.forEach((sensorType) => {
          switch (sensorType) {
            case 'temperature':
              sensors.push({
                name: '温度',
                icon: '🌡️',
                value: (nodeData.temperature as number) || 0,
                unit: '°C',
                status: getSensorStatus(Math.abs(((nodeData.temperature as number) || 25) - 25), 15, 25),
              })
              break
            case 'humidity':
              sensors.push({
                name: '湿度',
                icon: '💧',
                value: (nodeData.humidity as number) || 0,
                unit: '%',
                status: getSensorStatus((nodeData.humidity as number) || 0, 80, 90),
              })
              break
            case 'acceleration':
              const accValue =
                Math.sqrt(
                  Math.pow((nodeData.acceleration_x as number) || 0, 2) +
                    Math.pow((nodeData.acceleration_y as number) || 0, 2) +
                    Math.pow((nodeData.acceleration_z as number) || 0, 2),
                ) || ((nodeData.acceleration_total as number) || 0)
              sensors.push({
                name: '加速度',
                icon: '📳',
                value: accValue,
                unit: 'mg',
                status: getSensorStatus(accValue, 1500, 2500),
              })
              break
            case 'gyroscope':
              const gyroValue =
                Math.sqrt(
                  Math.pow((nodeData.gyroscope_x as number) || 0, 2) +
                    Math.pow((nodeData.gyroscope_y as number) || 0, 2) +
                    Math.pow((nodeData.gyroscope_z as number) || 0, 2),
                ) || ((nodeData.gyroscope_total as number) || 0)
              sensors.push({
                name: '陀螺仪',
                icon: '🎯',
                value: gyroValue,
                unit: '°/s',
                status: getSensorStatus(gyroValue, 50, 100),
              })
              break
            case 'illumination':
              sensors.push({
                name: '光照',
                icon: '💡',
                value: (nodeData.illumination as number) || 0,
                unit: 'lux',
                status: ((nodeData.illumination as number) || 0) < 100 ? 'warning' : 'normal',
              })
              break
            case 'vibration':
              const vibrationValue = parseFloat(nodeData.vibration_total?.toString() || '0') || 0
              sensors.push({
                name: '振动',
                icon: '〰️',
                value: vibrationValue,
                unit: 'Hz',
                status: getSensorStatus(vibrationValue, 5, 10),
              })
              break
            case 'gps':
              const gpsDeformation = (nodeData.deformation_distance_3d as number) || 0
              sensors.push({
                name: '地质形变',
                icon: '📍',
                value: gpsDeformation,
                unit: 'mm',
                status: getSensorStatus(gpsDeformation, 10, 50),
              })
              break
          }
        })
      }

      nodes.push({
        nodeId: deviceId,
        nodeName: station.station_name,
        location: station.location_name,
        sensors,
        lastUpdate: nodeData?.event_time || '',
        isOnline,
      })
    })

    return nodes
  }, [data])

  function getSensorStatus(value: number, warning: number, danger: number): 'normal' | 'warning' | 'danger' {
    if (value >= danger) return 'danger'
    if (value >= warning) return 'warning'
    return 'normal'
  }

  const currentNode = nodesData[currentNodeIndex] || null

  useEffect(() => {
    if (nodesData.length > 1) {
      const interval = setInterval(() => {
        setCurrentNodeIndex((prev) => (prev + 1) % nodesData.length)
      }, 4000)
      return () => clearInterval(interval)
    }
  }, [nodesData.length])

  if (!currentNode) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="text-cyan-400 text-sm font-bold mb-1">📡 所有节点离线</div>
          <div className="text-gray-400 text-xs">等待设备数据...</div>
        </div>
      </div>
    )
  }

  const getStatusInfo = (status: string) => {
    switch (status) {
      case 'danger':
        return {
          color: 'text-red-400',
          bg: 'bg-red-500/20',
          border: 'border-red-500/50',
          dot: 'bg-red-500',
          text: '危险',
          icon: '🔴',
        }
      case 'warning':
        return {
          color: 'text-orange-400',
          bg: 'bg-orange-500/20',
          border: 'border-orange-500/50',
          dot: 'bg-orange-500',
          text: '警告',
          icon: '🟡',
        }
      default:
        return {
          color: 'text-cyan-400',
          bg: 'bg-cyan-500/20',
          border: 'border-cyan-500/50',
          dot: 'bg-cyan-500',
          text: '正常',
          icon: '🟢',
        }
    }
  }

  return (
    <div className="h-full bg-black/20 backdrop-blur-sm rounded-lg p-2 border border-cyan-500/30 flex flex-col min-h-0">
      <div className="text-center mb-0.5 flex-shrink-0">
        <div className="flex items-center justify-center gap-1 mb-0.5">
          <div className={`w-1 h-1 rounded-full ${currentNode.isOnline ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`} />
          <div className="text-cyan-400 font-bold text-xs truncate">{currentNode.nodeName}</div>
        </div>
        <div className="text-gray-400 text-xs mb-0.5 truncate">{currentNode.location}</div>
        <div className="text-gray-500 text-xs">{currentNode.lastUpdate ? new Date(currentNode.lastUpdate).toLocaleTimeString() : '无数据'}</div>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        <div className="h-full overflow-y-auto scrollbar-hide pr-1">
          <div className="grid grid-cols-2 gap-1">
            {currentNode.sensors.map((sensor, index) => {
              const statusInfo = getStatusInfo(sensor.status)
              return (
                <div
                  key={index}
                  className={`p-1 rounded ${statusInfo.bg} ${statusInfo.border} border flex items-center gap-1`}
                >
                  <div className="text-xs">{sensor.icon}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] text-gray-300 truncate">{sensor.name}</div>
                    <div className="flex items-baseline gap-1">
                      <span className={`text-xs font-bold ${statusInfo.color}`}>{sensor.value.toFixed(1)}</span>
                      <span className="text-[10px] text-gray-400">{sensor.unit}</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-center gap-0.5">
                    <div className={`w-1.5 h-1.5 rounded-full ${statusInfo.dot}`} />
                    <div className="text-[8px] text-gray-400">{statusInfo.text}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {nodesData.length > 1 && (
        <div className="flex justify-center gap-1 mt-1 flex-shrink-0">
          {nodesData.map((_, idx) => (
            <div key={idx} className={`w-1 h-1 rounded-full ${idx === currentNodeIndex ? 'bg-cyan-400' : 'bg-gray-600'}`} />
          ))}
        </div>
      )}
    </div>
  )
}

export default RealtimeSensorStatus
