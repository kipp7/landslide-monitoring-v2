'use client';

import { useEffect, useState } from 'react';
import useDeviceMappings from './useDeviceMappings';

export interface DeviceNameMapping {
  device_id: string;
  friendly_name: string;
  display_name: string;
  short_name: string;
  device_type: string;
}

/**
 * 设备名称映射Hook
 * 使用设备映射系统获取友好名称
 */
export default function useDeviceNames() {
  const { mappings, loading, error, getDeviceName } = useDeviceMappings();
  const [deviceNames, setDeviceNames] = useState<Record<string, DeviceNameMapping>>({});

  useEffect(() => {
    // 从设备映射构建名称映射
    const nameMap: Record<string, DeviceNameMapping> = {};
    mappings.forEach(mapping => {
      nameMap[mapping.simple_id] = {
        device_id: mapping.simple_id,
        friendly_name: mapping.device_name,
        display_name: `${mapping.device_name} (${mapping.simple_id})`,
        short_name: mapping.device_name,
        device_type: mapping.device_type
      };
    });
    setDeviceNames(nameMap);
  }, [mappings]);

  /**
   * 获取设备的友好名称
   */
  const getFriendlyName = (deviceId: string): string => {
    return deviceNames[deviceId]?.friendly_name || getDeviceName(deviceId) || generateFallbackName(deviceId);
  };

  /**
   * 获取设备的显示名称
   */
  const getDisplayName = (deviceId: string): string => {
    return deviceNames[deviceId]?.display_name || generateFallbackName(deviceId);
  };

  /**
   * 获取设备的简短名称
   */
  const getShortName = (deviceId: string): string => {
    return deviceNames[deviceId]?.short_name || generateFallbackName(deviceId);
  };

  /**
   * 生成备用名称（当数据库中没有记录时）
   */
  const generateFallbackName = (deviceId: string): string => {
    if (!deviceId) return '未知设备';
    
    // 如果是你的设备ID格式
    if (deviceId.includes('_rk2206')) {
      return `滑坡监测站-${deviceId.slice(-6)}`;
    }
    
    // 其他设备
    if (deviceId.includes('_')) {
      const parts = deviceId.split('_');
      return `传感器-${parts[parts.length - 1]}`;
    }
    
    // 简化长ID
    if (deviceId.length > 10) {
      return `设备-${deviceId.slice(-6)}`;
    }
    
    return deviceId;
  };

  /**
   * 批量转换设备ID为友好名称
   */
  const mapDeviceNames = (deviceIds: string[]): Record<string, string> => {
    const result: Record<string, string> = {};
    deviceIds.forEach(id => {
      result[id] = getFriendlyName(id);
    });
    return result;
  };

  /**
   * 获取设备类型
   */
  const getDeviceType = (deviceId: string): string => {
    return deviceNames[deviceId]?.device_type || 'sensor';
  };

  return {
    deviceNames,
    loading,
    error,
    getFriendlyName,
    getDisplayName,
    getShortName,
    getDeviceType,
    mapDeviceNames,
    refetch: () => {}, // 通过useDeviceMappings的refetch来刷新
    // 为了向后兼容，添加data属性
    data: Object.values(deviceNames)
  };
}
