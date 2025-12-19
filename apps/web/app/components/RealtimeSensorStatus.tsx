'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { useIotDataStore } from '../../lib/useIotDataStore'

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
  const { data } = useIotDataStore()
  const [currentNodeIndex, setCurrentNodeIndex] = useState(0)
  
  // 定义fallback监测站配置，如果Hook失败则使用
  const fallbackStations = [
    {
      device_id: 'device_1',
      station_name: '挂傍山中心监测站',
      location_name: '玉林师范学院东校区挂傍山中心点',
      sensor_types: ['temperature', 'humidity', 'acceleration', 'illumination', 'gps']
    },
    {
      device_id: 'device_2',
      station_name: '坡顶监测站',
      location_name: '玉林师范学院东校区挂傍山坡顶',
      sensor_types: ['temperature', 'humidity', 'gyroscope', 'vibration', 'gps']
    },
    {
      device_id: 'device_3',
      station_name: '坡脚监测站',
      location_name: '玉林师范学院东校区挂傍山坡脚',
      sensor_types: ['temperature', 'acceleration', 'illumination', 'gps', 'vibration']
    }
  ]

  // 处理多节点数据
  const nodesData = useMemo(() => {
    const nodes: NodeData[] = []
    
    fallbackStations.forEach(station => {
      const deviceId = station.device_id;
      
      // 获取该节点的最新数据
      const nodeData = data
        .filter(record => record.device_id === deviceId)
        .sort((a, b) => new Date(b.event_time).getTime() - new Date(a.event_time).getTime())
        .slice(0, 1)[0]

      const isOnline = nodeData && 
        (Date.now() - new Date(nodeData.event_time).getTime()) < 5 * 60 * 1000 // 5分钟内有数据

      const sensors: SensorData[] = []
      
      if (nodeData) {
        // 根据监测站配置的传感器类型生成传感器数据
        station.sensor_types.forEach(sensorType => {
          switch (sensorType) {
            case 'temperature':
              sensors.push({
                name: '温度',
                icon: '🌡️',
                value: nodeData.temperature || 0,
                unit: '°C',
                status: getSensorStatus(Math.abs((nodeData.temperature || 25) - 25), 15, 25)
              })
              break
            case 'humidity':
              sensors.push({
                name: '湿度',
                icon: '💧',
                value: nodeData.humidity || 0,
                unit: '%',
                status: getSensorStatus(nodeData.humidity || 0, 80, 90)
              })
              break
            case 'acceleration':
              const accValue = Math.sqrt(
                Math.pow(nodeData.acceleration_x || 0, 2) +
                Math.pow(nodeData.acceleration_y || 0, 2) +
                Math.pow(nodeData.acceleration_z || 0, 2)
              )
              sensors.push({
                name: '加速度',
                icon: '📳',
                value: accValue,
                unit: 'mg',
                status: getSensorStatus(accValue, 1500, 2500)
              })
              break
            case 'gyroscope':
              const gyroValue = Math.sqrt(
                Math.pow(nodeData.gyroscope_x || 0, 2) +
                Math.pow(nodeData.gyroscope_y || 0, 2) +
                Math.pow(nodeData.gyroscope_z || 0, 2)
              )
              sensors.push({
                name: '陀螺仪',
                icon: '🎯',
                value: gyroValue,
                unit: '°/s',
                status: getSensorStatus(gyroValue, 50, 100)
              })
              break
            case 'illumination':
              sensors.push({
                name: '光照',
                icon: '💡',
                value: nodeData.illumination || 0,
                unit: 'lux',
                status: (nodeData.illumination || 0) < 100 ? 'warning' : 'normal'
              })
              break
            case 'vibration':
              const vibrationValue = parseFloat(nodeData.vibration_total?.toString() || '0') || 0
              sensors.push({
                name: '振动',
                icon: '〰️',
                value: vibrationValue,
                unit: 'Hz',
                status: getSensorStatus(vibrationValue, 5, 10)
              })
              break
            case 'gps':
              const gpsDeformation = nodeData.deformation_distance_3d || 0
              sensors.push({
                name: '地质形变',
                icon: '📍',
                value: gpsDeformation,
                unit: 'mm',
                status: getSensorStatus(gpsDeformation, 10, 50)
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
        isOnline
      })
    })

    return nodes
  }, [data])

  // 计算传感器状态
  function getSensorStatus(value: number, warning: number, danger: number): 'normal' | 'warning' | 'danger' {
    if (value >= danger) return 'danger'
    if (value >= warning) return 'warning'
    return 'normal'
  }

  // 当前显示的节点
  const currentNode = nodesData[currentNodeIndex] || null

  // 自动节点轮播
  useEffect(() => {
    if (nodesData.length > 1) {
      const interval = setInterval(() => {
        setCurrentNodeIndex((prev) => (prev + 1) % nodesData.length)
      }, 4000) // 4秒切换一次节点
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

  // 简化显示，不再需要传感器分页

  // 获取状态颜色和图标
  const getStatusInfo = (status: string) => {
    switch (status) {
      case 'danger': 
        return { 
          color: 'text-red-400', 
          bg: 'bg-red-500/20', 
          border: 'border-red-500/50',
          dot: 'bg-red-500',
          text: '危险',
          icon: '🔴'
        }
      case 'warning': 
        return { 
          color: 'text-orange-400', 
          bg: 'bg-orange-500/20', 
          border: 'border-orange-500/50',
          dot: 'bg-orange-500',
          text: '警告',
          icon: '🟡'
        }
      default: 
        return { 
          color: 'text-cyan-400', 
          bg: 'bg-cyan-500/20', 
          border: 'border-cyan-500/50',
          dot: 'bg-cyan-500',
          text: '正常',
          icon: '🟢'
        }
    }
  }

  return (
    <div className="h-full bg-black/20 backdrop-blur-sm rounded-lg p-2 border border-cyan-500/30 flex flex-col min-h-0">
      {/* 节点信息区域 - 最小化高度 */}
      <div className="text-center mb-0.5 flex-shrink-0">
        <div className="flex items-center justify-center gap-1 mb-0.5">
          <div className={`w-1 h-1 rounded-full ${currentNode.isOnline ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`} />
          <div className="text-cyan-400 font-bold text-xs truncate">{currentNode.nodeName}</div>
        </div>
        <div className="text-gray-400 text-xs mb-0.5 truncate">{currentNode.location}</div>
        <div className="text-gray-500 text-xs">
          {currentNode.lastUpdate ? new Date(currentNode.lastUpdate).toLocaleTimeString() : '无数据'}
        </div>
        
        {/* 指示器区域 - 最小化高度 */}
        <div className="flex flex-col items-center gap-0.5 mt-0.5">
          {/* 节点切换指示器 */}
          {nodesData.length > 1 && (
            <div className="flex justify-center gap-0.5">
              {nodesData.map((_, i) => (
                <div
                  key={i}
                  className={`w-1 h-1 rounded-full transition-all duration-300 ${
                    i === currentNodeIndex ? 'bg-cyan-400' : 'bg-gray-600'
                  }`}
                />
              ))}
            </div>
          )}
          
          {/* 简化显示，不再需要传感器分页指示器 */}
        </div>
      </div>

      {/* 传感器状态统计 - 简化显示 */}
      <div className="flex-1 flex flex-col justify-center">
        {/* 当前节点传感器统计 */}
        <div className="text-center mb-3">
          <div className="text-white text-sm font-medium mb-2">传感器状态</div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="bg-green-500/20 border border-green-500/50 rounded p-2">
              <div className="text-green-400 text-lg font-bold">
                {currentNode.sensors.filter(s => s.status === 'normal').length}
              </div>
              <div className="text-green-400">正常</div>
            </div>
            <div className="bg-orange-500/20 border border-orange-500/50 rounded p-2">
              <div className="text-orange-400 text-lg font-bold">
                {currentNode.sensors.filter(s => s.status === 'warning').length}
              </div>
              <div className="text-orange-400">警告</div>
            </div>
            <div className="bg-red-500/20 border border-red-500/50 rounded p-2">
              <div className="text-red-400 text-lg font-bold">
                {currentNode.sensors.filter(s => s.status === 'danger').length}
              </div>
              <div className="text-red-400">异常</div>
            </div>
          </div>
        </div>

        {/* 传感器类型图标已完全删除 */}
      </div>

      {/* 全网络状态概览已删除 */}
    </div>
  )
}

export default RealtimeSensorStatus
