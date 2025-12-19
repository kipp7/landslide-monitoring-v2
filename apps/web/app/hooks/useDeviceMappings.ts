'use client';

import { useEffect, useState } from 'react';

export interface DeviceMapping {
  simple_id: string;           // device_1, device_2
  actual_device_id: string;    // 实际的华为IoT设备ID
  device_name: string;         // 友好名称
  location_name: string;       // 位置名称
  device_type: string;         // 设备类型
  latitude: number;            // 纬度
  longitude: number;           // 经度
  status: string;              // 状态
  description: string;         // 描述
  install_date: string;        // 安装日期
  last_data_time: string;      // 最后数据时间
  online_status: 'online' | 'offline' | 'maintenance'; // 在线状态
}

/**
 * 设备映射Hook
 * 获取设备的简洁ID与实际ID的映射关系
 */
export default function useDeviceMappings() {
  const [mappings, setMappings] = useState<DeviceMapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchMappings = async () => {
    try {
      // 使用环境变量或相对路径，支持服务器部署
      const apiBase = process.env.NEXT_PUBLIC_IOT_API_BASE ||
                     (typeof window !== 'undefined' ? `${window.location.protocol}//${window.location.host}` : '') +
                     '/iot';
      const response = await fetch(`${apiBase}/devices/mappings`);
      const result = await response.json();

      if (result.success) {
        setMappings(result.data);
      } else {
        setError(new Error(result.error || '获取设备映射失败'));
      }
    } catch (err) {
      console.error('获取设备映射失败:', err);
      // 如果API不可用，使用默认映射
      const defaultMappings: DeviceMapping[] = [
        {
          simple_id: 'device_1',
          actual_device_id: '6815a14f9314d118511807c6_rk2206',
          device_name: '龙门滑坡监测站',
          location_name: '防城港华石镇龙门村',
          device_type: 'rk2206',
          latitude: 22.817,
          longitude: 108.3669,
          status: 'active',
          description: 'RK2206滑坡监测站',
          install_date: new Date().toISOString(),
          last_data_time: new Date().toISOString(),
          online_status: 'online'
        }
      ];
      setMappings(defaultMappings);
      setError(null); // 清除错误，使用默认数据
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMappings();
  }, []);

  /**
   * 根据简洁ID获取设备信息
   */
  const getDeviceBySimpleId = (simpleId: string): DeviceMapping | undefined => {
    return mappings.find(mapping => mapping.simple_id === simpleId);
  };

  /**
   * 根据实际设备ID获取设备信息
   */
  const getDeviceByActualId = (actualId: string): DeviceMapping | undefined => {
    return mappings.find(mapping => mapping.actual_device_id === actualId);
  };

  /**
   * 获取设备的友好名称
   */
  const getDeviceName = (deviceId: string): string => {
    // 先尝试作为简洁ID查找
    let device = getDeviceBySimpleId(deviceId);
    if (device) return device.device_name;

    // 再尝试作为实际ID查找
    device = getDeviceByActualId(deviceId);
    if (device) return device.device_name;

    // 都没找到，返回原始ID
    return deviceId;
  };

  /**
   * 获取设备的位置信息
   */
  const getDeviceLocation = (deviceId: string) => {
    const device = getDeviceBySimpleId(deviceId) || getDeviceByActualId(deviceId);
    
    if (device) {
      return {
        location_name: device.location_name,
        latitude: device.latitude,
        longitude: device.longitude,
        device_type: device.device_type
      };
    }
    
    return null;
  };

  /**
   * 获取在线设备数量
   */
  const getOnlineDeviceCount = (): number => {
    return mappings.filter(device => device.online_status === 'online').length;
  };

  /**
   * 获取设备统计信息
   */
  const getDeviceStats = () => {
    const total = mappings.length;
    const online = mappings.filter(d => d.online_status === 'online').length;
    const offline = mappings.filter(d => d.online_status === 'offline').length;
    const maintenance = mappings.filter(d => d.online_status === 'maintenance').length;
    
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
    const grouped: Record<string, DeviceMapping[]> = {};
    mappings.forEach(device => {
      if (!grouped[device.device_type]) {
        grouped[device.device_type] = [];
      }
      grouped[device.device_type].push(device);
    });
    return grouped;
  };

  /**
   * 获取最近活跃的设备
   */
  const getRecentActiveDevices = (limit = 5) => {
    return [...mappings]
      .filter(device => device.last_data_time)
      .sort((a, b) => new Date(b.last_data_time).getTime() - new Date(a.last_data_time).getTime())
      .slice(0, limit);
  };

  /**
   * 创建简洁ID到友好名称的映射对象
   */
  const createNameMapping = (): Record<string, string> => {
    const nameMap: Record<string, string> = {};
    mappings.forEach(device => {
      nameMap[device.simple_id] = device.device_name;
    });
    return nameMap;
  };

  /**
   * 获取设备详细信息
   */
  const getDeviceDetails = async (simpleId: string) => {
    try {
      // 使用环境变量或相对路径，支持服务器部署
      const apiBase = process.env.NEXT_PUBLIC_IOT_API_BASE ||
                     (typeof window !== 'undefined' ? `${window.location.protocol}//${window.location.host}` : '') +
                     '/iot';
      const response = await fetch(`${apiBase}/devices/${simpleId}`);
      const result = await response.json();
      
      if (result.success) {
        return result.data;
      } else {
        throw new Error(result.error || '获取设备详情失败');
      }
    } catch (err) {
      console.error('获取设备详情失败:', err);
      throw err;
    }
  };

  return {
    mappings,
    loading,
    error,
    
    // 查询函数
    getDeviceBySimpleId,
    getDeviceByActualId,
    getDeviceName,
    getDeviceLocation,
    getDeviceDetails,
    
    // 统计函数
    getOnlineDeviceCount,
    getDeviceStats,
    getDevicesByType,
    getRecentActiveDevices,
    
    // 工具函数
    createNameMapping,
    refetch: fetchMappings
  };
}
