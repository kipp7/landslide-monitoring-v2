'use client';

import { useState, useEffect, useCallback } from 'react';

export interface Device {
  simple_id: string;
  actual_device_id: string;
  device_name: string;
  location_name: string;
  device_type: string;
  latitude: number;
  longitude: number;
  status: string;
  online_status: 'online' | 'offline' | 'maintenance';
  last_data_time: string;
  install_date: string;
  description?: string;
}

export interface DeviceRegion {
  id: string;
  name: string;
  devices: Device[];
  total_devices: number;
  online_devices: number;
  offline_devices: number;
}

export interface HierarchicalDevicesData {
  regions: DeviceRegion[];
  allDevices: Device[];
  totalDevices: number;
  onlineDevices: number;
  offlineDevices: number;
}

export function useHierarchicalDevices() {
  const [data, setData] = useState<HierarchicalDevicesData>({
    regions: [],
    allDevices: [],
    totalDevices: 0,
    onlineDevices: 0,
    offlineDevices: 0
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchHierarchicalDevices = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      // 使用真实的数据库设备管理API
      const response = await fetch('/api/device-management-real-db?mode=all');
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const result = await response.json();
      
      if (result.success) {
        console.log('✅ 成功获取真实设备数据:', result.data);
        setData(result.data);
      } else {
        throw new Error(result.error || '获取分层设备数据失败');
      }
    } catch (err) {
      console.error('获取分层设备数据错误:', err);
      setError(err instanceof Error ? err.message : '获取数据失败');
      
      // 如果API失败，尝试使用摘要API作为fallback
      try {
        console.log('🔄 尝试使用摘要API作为fallback...');
        const fallbackResponse = await fetch('/api/device-management-real-db?mode=summary');
        const fallbackResult = await fallbackResponse.json();
        
        if (fallbackResult.success) {
          // 转换摘要数据为期望格式
          const devices = fallbackResult.data;
          setData({
            regions: [
              {
                id: 'gbs',
                name: '挂傍山监测区域',
                devices: devices,
                total_devices: devices.length,
                online_devices: devices.filter((d: any) => d.online_status === 'online').length,
                offline_devices: devices.filter((d: any) => d.online_status === 'offline').length
              }
            ],
            allDevices: devices,
            totalDevices: devices.length,
            onlineDevices: devices.filter((d: any) => d.online_status === 'online').length,
            offlineDevices: devices.filter((d: any) => d.online_status === 'offline').length
          });
          console.log('✅ Fallback API成功');
        }
      } catch (fallbackErr) {
        console.error('❌ Fallback也失败了:', fallbackErr);
        // 最后的兜底数据
        setData({
          regions: [],
          allDevices: [],
          totalDevices: 0,
          onlineDevices: 0,
          offlineDevices: 0
        });
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHierarchicalDevices();
  }, [fetchHierarchicalDevices]);

  const getDeviceBySimpleId = useCallback((simpleId: string): Device | null => {
    for (const region of data.regions) {
      const device = region.devices.find(d => d.simple_id === simpleId);
      if (device) return device;
    }
    return null;
  }, [data.regions]);

  const getDevicesByRegion = useCallback((regionId: string): Device[] => {
    const region = data.regions.find(r => r.id === regionId);
    return region ? region.devices : [];
  }, [data.regions]);

  return {
    data,
    loading,
    error,
    fetchHierarchicalDevices,
    getDeviceBySimpleId,
    getDevicesByRegion
  };
}
