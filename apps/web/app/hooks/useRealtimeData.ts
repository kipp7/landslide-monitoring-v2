// app/hooks/useRealtimeData.ts
'use client';

import { useEffect } from 'react';
import { useIotDataStore } from '../../lib/useIotDataStore';

/**
 * 统一的实时数据Hook
 * 使用Supabase实时订阅替代轮询，提升性能
 */
export default function useRealtimeData() {
  const { data, loading, error, fetchData, subscribeToRealtime } = useIotDataStore();

  useEffect(() => {
    // 初始数据加载
    fetchData();

    // 订阅实时更新
    const unsubscribe = subscribeToRealtime();

    // 清理订阅
    return unsubscribe;
  }, [fetchData, subscribeToRealtime]); // 移除 useMockData 依赖

  // 数据处理函数
  const getTemperatureData = () => {
    const grouped: Record<string, { time: string; value: number }[]> = {};
    
    data.forEach((record) => {
      const id = record.device_id || 'unknown';
      if (!grouped[id]) grouped[id] = [];
      grouped[id].push({
        time: record.event_time,
        value: record.temperature,
      });
    });

    // 确保每个设备的数据按时间升序排列
    Object.keys(grouped).forEach((key) => {
      grouped[key].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
    });

    return grouped;
  };

  const getHumidityData = () => {
    const grouped: Record<string, { time: string; value: number }[]> = {};
    
    data.forEach((record) => {
      const id = record.device_id || 'unknown';
      if (!grouped[id]) grouped[id] = [];
      grouped[id].push({
        time: record.event_time,
        value: record.humidity,
      });
    });

    Object.keys(grouped).forEach((key) => {
      grouped[key].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
    });

    return grouped;
  };

  const getAccelerationData = () => {
    const grouped: Record<string, { time: string; x: number; y: number; z: number }[]> = {};
    
    data.forEach((record) => {
      const id = record.device_id || 'unknown';
      if (!grouped[id]) grouped[id] = [];
      grouped[id].push({
        time: record.event_time,
        x: record.acceleration_x || 0,
        y: record.acceleration_y || 0,
        z: record.acceleration_z || 0,
      });
    });

    Object.keys(grouped).forEach((key) => {
      grouped[key].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
    });

    return grouped;
  };

  const getGyroscopeData = () => {
    const grouped: Record<string, { time: string; x: number; y: number; z: number }[]> = {};
    
    data.forEach((record) => {
      const id = record.device_id || 'unknown';
      if (!grouped[id]) grouped[id] = [];
      grouped[id].push({
        time: record.event_time,
        x: record.gyroscope_x || 0,
        y: record.gyroscope_y || 0,
        z: record.gyroscope_z || 0,
      });
    });

    Object.keys(grouped).forEach((key) => {
      grouped[key].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
    });

    return grouped;
  };

  const getLatestData = (limit = 10) => {
    return data.slice(0, limit);
  };

  const getDeviceStats = () => {
    const deviceCount = new Set(data.map(record => record.device_id)).size;
    const latestRecord = data[0];
    const dataCount = data.length;
    
    return {
      deviceCount,
      latestRecord,
      dataCount,
      lastUpdateTime: latestRecord?.event_time
    };
  };

  return {
    // 原始数据
    data,
    loading,
    error,
    
    // 处理后的数据
    temperatureData: getTemperatureData(),
    humidityData: getHumidityData(),
    accelerationData: getAccelerationData(),
    gyroscopeData: getGyroscopeData(),
    latestData: getLatestData(),
    deviceStats: getDeviceStats(),
    
    // 工具函数
    getLatestData,
    getDeviceStats,
    refetch: fetchData
  };
}
