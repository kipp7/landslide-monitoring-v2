// 更新版本的实时传感器状态组件 - 使用统一的监测站配置
'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { useIotDataStore } from '../../lib/useIotDataStore'
import { MONITORING_STATIONS, getStationInfo } from '../config/monitoring-stations'

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

const RealtimeSensorStatusUpdated = () => {
  const { data } = useIotDataStore()
  const [currentNodeIndex, setCurrentNodeIndex] = useState(0)
  
  // 处理多节点数据 - 使用统一配置
  const nodesData = useMemo(() => {
    const nodes: NodeData[] = []
    
    // 基于监测站配置获取节点信息
    Object.entries(MONITORING_STATIONS).forEach(([deviceId, stationConfig]) => {
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
        stationConfig.sensorTypes.forEach(sensorType => {
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
        nodeName: stationConfig.stationName, // 使用配置文件中的站点名称
        location: stationConfig.location, // 使用配置文件中的位置描述
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

  // 获取当前监测站的风险等级指示
  const stationInfo = getStationInfo(currentNode.nodeId)
  const riskLevelColor = stationInfo?.riskLevel === 'high' ? 'text-red-400' : 
                        stationInfo?.riskLevel === 'medium' ? 'text-orange-400' : 'text-green-400'

  return (
    <div className="h-full bg-black/20 backdrop-blur-sm rounded-lg p-2 border border-cyan-500/30 flex flex-col min-h-0">
      {/* 节点信息区域 */}
      <div className="text-center mb-0.5 flex-shrink-0">
        <div className="flex items-center justify-center gap-1 mb-0.5">
          <div className={`w-1 h-1 rounded-full ${currentNode.isOnline ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`} />
          <div className="text-cyan-400 font-bold text-xs truncate">{currentNode.nodeName}</div>
          {/* 风险等级指示 */}
          <div className={`text-xs ${riskLevelColor} ml-1`}>
            {stationInfo?.riskLevel === 'high' ? '⚠️' : stationInfo?.riskLevel === 'medium' ? '⚡' : '✅'}
          </div>
        </div>
        <div className="text-gray-400 text-xs mb-0.5 truncate">{currentNode.location}</div>
        <div className="text-gray-500 text-xs">
          {currentNode.lastUpdate ? new Date(currentNode.lastUpdate).toLocaleTimeString() : '无数据'}
        </div>
        
        {/* 坐标信息（可选显示） */}
        {stationInfo && (
          <div className="text-gray-500 text-xs mt-0.5">
            {stationInfo.coordinates.latitude.toFixed(4)}, {stationInfo.coordinates.longitude.toFixed(4)}
            {stationInfo.coordinates.altitude && ` (${Math.round(stationInfo.coordinates.altitude)}m)`}
          </div>
        )}
        
        {/* 指示器区域 */}
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
        </div>
      </div>

      {/* 传感器状态统计 */}
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

        {/* 传感器详细信息（可选显示前3个传感器） */}
        {currentNode.sensors.length > 0 && (
          <div className="text-xs space-y-1">
            {currentNode.sensors.slice(0, 3).map((sensor, index) => {
              const statusInfo = getStatusInfo(sensor.status)
              return (
                <div key={index} className="flex items-center justify-between bg-black/20 rounded px-1 py-0.5">
                  <div className="flex items-center gap-1">
                    <span className="text-xs">{sensor.icon}</span>
                    <span className="text-gray-300">{sensor.name}</span>
                  </div>
                  <div className={`${statusInfo.color} font-medium`}>
                    {sensor.value.toFixed(1)}{sensor.unit}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export default RealtimeSensorStatusUpdated
