'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../lib/supabaseClient';

export interface DeviceInfo {
  id: string;
  name: string;
  type: string;
  manufacturer: string;
  serialNumber: string;
  firmwareVersion: string;
  installDate: string;
  lastCheck: string;
  status: 'online' | 'offline' | 'maintenance';
  device_id: string;
  friendly_name: string;
  display_name: string;
  model: string;
  last_active: string;
}

/**
 * 设备列表Hook
 * 从数据库获取真实的设备信息
 */
export default function useDeviceList() {
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchDevices = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('iot_devices')
        .select(`
          device_id,
          node_id,
          product_id,
          friendly_name,
          display_name,
          short_name,
          device_type,
          manufacturer,
          model,
          firmware_version,
          install_date,
          last_active,
          status
        `)
        .order('install_date', { ascending: false });

      if (error) {
        console.error('获取设备列表失败:', error);
        setError(error);
      } else if (data) {
        // 转换为前端需要的格式
        const deviceList: DeviceInfo[] = data.map(device => ({
          id: device.device_id,
          device_id: device.device_id,
          name: device.friendly_name || device.device_id,
          friendly_name: device.friendly_name || device.device_id,
          display_name: device.display_name || device.device_id,
          type: getDeviceTypeDisplay(device.device_type),
          manufacturer: device.manufacturer || '华为云IoT',
          model: device.model || '传感器节点',
          serialNumber: device.node_id || device.device_id.slice(-8),
          firmwareVersion: device.firmware_version || 'v1.0.0',
          installDate: formatDate(device.install_date),
          lastCheck: formatDate(device.last_active),
          last_active: device.last_active,
          status: determineDeviceStatus(device.last_active, device.status)
        }));

        setDevices(deviceList);
      }
    } catch (err) {
      console.error('获取设备列表异常:', err);
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDevices();
  }, [fetchDevices]);

  /**
   * 获取设备类型显示名称
   */
  const getDeviceTypeDisplay = (deviceType: string): string => {
    const typeMap: Record<string, string> = {
      'rk2206': 'RK2206滑坡监测站',
      'sensor': '传感器节点',
      'gateway': '网关设备',
      'default': '监测设备'
    };
    return typeMap[deviceType] || typeMap.default;
  };

  /**
   * 格式化日期
   */
  const formatDate = (dateString: string): string => {
    if (!dateString) return '未知';
    try {
      return new Date(dateString).toLocaleDateString('zh-CN');
    } catch {
      return '未知';
    }
  };

  /**
   * 确定设备状态
   */
  const determineDeviceStatus = (lastActive: string, status: string): 'online' | 'offline' | 'maintenance' => {
    if (status === 'maintenance') return 'maintenance';
    
    if (!lastActive) return 'offline';
    
    const lastActiveTime = new Date(lastActive).getTime();
    const now = Date.now();
    const timeDiff = now - lastActiveTime;
    
    // 5分钟内有活动认为在线
    if (timeDiff < 5 * 60 * 1000) {
      return 'online';
    } else {
      return 'offline';
    }
  };

  /**
   * 获取设备统计信息
   */
  const getDeviceStats = () => {
    const total = devices.length;
    const online = devices.filter(d => d.status === 'online').length;
    const offline = devices.filter(d => d.status === 'offline').length;
    const maintenance = devices.filter(d => d.status === 'maintenance').length;
    
    return {
      total,
      online,
      offline,
      maintenance,
      onlineRate: total > 0 ? Math.round((online / total) * 100) : 0
    };
  };

  /**
   * 按设备类型分组
   */
  const getDevicesByType = () => {
    const grouped: Record<string, DeviceInfo[]> = {};
    devices.forEach(device => {
      if (!grouped[device.type]) {
        grouped[device.type] = [];
      }
      grouped[device.type].push(device);
    });
    return grouped;
  };

  /**
   * 获取最近活跃的设备
   */
  const getRecentActiveDevices = (limit = 5) => {
    return [...devices]
      .sort((a, b) => new Date(b.last_active).getTime() - new Date(a.last_active).getTime())
      .slice(0, limit);
  };

  return {
    devices,
    loading,
    error,
    stats: getDeviceStats(),
    devicesByType: getDevicesByType(),
    recentActiveDevices: getRecentActiveDevices(),
    refetch: fetchDevices
  };
}
