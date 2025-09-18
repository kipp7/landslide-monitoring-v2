// app/hooks/useDeviceShadow.ts - 修改为使用Supabase数据源
'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../lib/supabaseClient'

export interface DeviceShadowData {
  device_id?: string
  properties?: {
    risk_level?: number
    temperature?: number
    humidity?: number
    illumination?: number
    acceleration_x?: number
    acceleration_y?: number
    acceleration_z?: number
    gyroscope_x?: number
    gyroscope_y?: number
    gyroscope_z?: number
    mpu_temperature?: number
    latitude?: number
    longitude?: number
    vibration?: number
    alarm_active?: boolean
    [key: string]: any
  }
  event_time?: string
  version?: number
}

export interface UseDeviceShadowResult {
  data: DeviceShadowData | null
  loading: boolean
  error: string | null
  refreshShadow: () => Promise<void>
}

export default function useDeviceShadow(
  deviceId: string = '6815a14f9314d118511807c6_rk2206',
  refreshInterval: number = 5000 // 5秒刷新一次，获取最新设备状态
): UseDeviceShadowResult {
  const [data, setData] = useState<DeviceShadowData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchShadowData = useCallback(async () => {
    try {
      setError(null)
      
      console.log('📊 从Supabase获取设备数据:', deviceId)
      
      // 从Supabase iot_data表获取最新设备数据
      const { data: iotData, error: iotError } = await supabase
        .from('iot_data')
        .select('*')
        .eq('device_id', deviceId)
        .order('event_time', { ascending: false })
        .limit(1)

      if (iotError) {
        throw new Error(`Supabase查询失败: ${iotError.message}`)
      }

      const latestRecord = iotData?.[0]

      if (!latestRecord) {
        console.warn('⚠️ 未找到设备数据:', deviceId)
        throw new Error('未找到设备数据')
      }

      // 计算风险等级（基于数据时效性和传感器数值）
      const calculateRiskLevel = (record: any): number => {
        // 数据时效性检查
        const dataAge = Date.now() - new Date(record.event_time).getTime()
        const dataAgeMinutes = dataAge / (1000 * 60)
        
        // 如果数据超过10分钟，风险等级增加
        let riskLevel = dataAgeMinutes > 10 ? 1 : 0
        
        // 基于传感器数值评估风险
        const temp = parseFloat(record.temperature) || 0
        const humidity = parseFloat(record.humidity) || 0
        const accTotal = Math.sqrt(
          Math.pow(parseFloat(record.acceleration_total) || 0, 2)
        )
        
        // 温度异常 (< 0°C 或 > 50°C)
        if (temp < 0 || temp > 50) riskLevel = Math.max(riskLevel, 2)
        
        // 湿度异常 (> 90%)
        if (humidity > 90) riskLevel = Math.max(riskLevel, 1)
        
        // 加速度异常 (> 2000mg，表示剧烈震动)
        if (accTotal > 2000) riskLevel = Math.max(riskLevel, 3)
        
        return Math.min(riskLevel, 4) // 最高等级为4
      }

      const riskLevel = calculateRiskLevel(latestRecord)

      // 构建兼容原始结构的设备影子数据
      const shadowData: DeviceShadowData = {
        device_id: deviceId,
        properties: {
          risk_level: riskLevel,
          temperature: parseFloat(latestRecord.temperature) || 0,
          humidity: parseFloat(latestRecord.humidity) || 0,
          illumination: parseFloat(latestRecord.illumination) || 0,
          acceleration_x: parseFloat(latestRecord.acceleration_x) || 0,
          acceleration_y: parseFloat(latestRecord.acceleration_y) || 0,
          acceleration_z: parseFloat(latestRecord.acceleration_z) || 0,
          gyroscope_x: parseFloat(latestRecord.gyroscope_x) || 0,
          gyroscope_y: parseFloat(latestRecord.gyroscope_y) || 0,
          gyroscope_z: parseFloat(latestRecord.gyroscope_z) || 0,
          mpu_temperature: parseFloat(latestRecord.mpu_temperature) || 0,
          latitude: parseFloat(latestRecord.latitude) || 0,
          longitude: parseFloat(latestRecord.longitude) || 0,
          vibration: parseFloat(latestRecord.vibration_total) || 0,
          alarm_active: riskLevel >= 2, // 风险等级≥2时激活报警
        },
        event_time: latestRecord.event_time,
        version: 1
      }

      console.log('🔍 从Supabase解析的设备数据:', {
        deviceId,
        recordTime: latestRecord.event_time,
        riskLevel,
        dataAge: `${Math.round(dataAge / 1000 / 60)}分钟前`,
        properties: shadowData.properties
      })
      
      setData(shadowData)
      
      // 输出风险等级日志
      if (riskLevel > 0) {
        console.log(`🎯 设备风险等级: ${riskLevel} (0=正常, 1=注意, 2=警告, 3=危险, 4=严重)`)
      } else {
        console.log('✅ 设备状态正常，风险等级: 0')
      }

    } catch (error: any) {
      console.error('❌ 从Supabase获取设备数据失败:', error)
      setError(error.message || 'Supabase查询失败')
      
      // 设置默认的错误状态数据
      setData({
        device_id: deviceId,
        properties: {
          risk_level: 0,
          alarm_active: false
        },
        event_time: new Date().toISOString(),
        version: 1
      })
    } finally {
      setLoading(false)
    }
  }, [deviceId])

  // 手动刷新方法
  const refreshShadow = useCallback(async () => {
    setLoading(true)
    await fetchShadowData()
  }, [fetchShadowData])

  // 定期从Supabase获取设备数据（每5秒刷新）
  useEffect(() => {
    fetchShadowData()
    
    if (refreshInterval > 0) {
      const interval = setInterval(fetchShadowData, refreshInterval)
      return () => clearInterval(interval)
    }
  }, [fetchShadowData, refreshInterval])

  return { data, loading, error, refreshShadow }
}