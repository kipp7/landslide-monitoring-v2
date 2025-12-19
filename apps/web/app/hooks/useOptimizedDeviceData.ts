import { useState, useEffect, useCallback, useRef } from 'react';
import { message } from 'antd';
import { 
  validateDeviceId, 
  validateDeviceData, 
  validateAPIResponse,
  OptimizedErrorLogger,
  handleNetworkError,
  withRetry
} from '../utils/optimizedValidation';

interface OptimizedDeviceData {
  device_id: string;
  display_name: string;
  location: string;
  coordinates: { lat: number; lng: number };
  status: 'online' | 'offline';
  health_score: number;
  temperature: number;
  humidity: number;
  battery_level: number;
  signal_strength: number;
  data_count_today: number;
  last_data_time: string;
  deformation_data?: any;
}

interface UseOptimizedDeviceDataOptions {
  deviceId: string;
  autoRefresh?: boolean;
  refreshInterval?: number;
  enableCache?: boolean;
}

export function useOptimizedDeviceData({
  deviceId,
  autoRefresh = false,
  refreshInterval = 30000, // 30秒
  enableCache = true
}: UseOptimizedDeviceDataOptions) {
  const [data, setData] = useState<OptimizedDeviceData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdateTime, setLastUpdateTime] = useState<string>('');
  
  // 用于管理自动刷新的引用
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // 获取设备数据的核心函数
  const fetchDeviceData = useCallback(async (showMessage = false, useCache = enableCache) => {
    const errorContext = {
      component: 'useOptimizedDeviceData',
      action: 'fetchDeviceData',
      deviceId,
      timestamp: new Date().toISOString()
    };

    // 验证设备ID
    const deviceValidation = validateDeviceId(deviceId);
    if (!deviceValidation.isValid) {
      const errorMsg = deviceValidation.errors.join(', ');
      setError(errorMsg);
      OptimizedErrorLogger.log('error', `设备ID验证失败: ${errorMsg}`, errorContext);
      if (showMessage) {
        message.error(errorMsg);
      }
      return;
    }

    try {
      // 取消之前的请求
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      
      abortControllerRef.current = new AbortController();
      
      setLoading(true);
      setError(null);

      if (showMessage) {
        message.loading('正在刷新设备数据...', 0.5);
      }

      OptimizedErrorLogger.log('info', `使用优化API获取设备数据: ${deviceId}`, errorContext);

      // 调用优化后的设备管理API
      const response = await fetch(
        `/api/device-management-optimized?device_id=${deviceId}&cache=${useCache}`,
        {
          signal: abortControllerRef.current.signal,
          headers: {
            'Cache-Control': useCache ? 'max-age=300' : 'no-cache'
          }
        }
      );

      if (!response.ok) {
        throw new Error(`API请求失败: ${response.status}`);
      }

      const result = await response.json();

      // 验证API响应
      const responseValidation = validateAPIResponse(result, ['success', 'data']);
      if (responseValidation.warnings.length > 0) {
        OptimizedErrorLogger.log('warning', `API响应警告: ${responseValidation.warnings.join(', ')}`, errorContext);
      }

      if (result.success) {
        // 验证设备数据
        const dataValidation = validateDeviceData(result.data);
        if (!dataValidation.isValid) {
          OptimizedErrorLogger.log('error', `设备数据验证失败: ${dataValidation.errors.join(', ')}`, errorContext);
          throw new Error(`数据验证失败: ${dataValidation.errors.join(', ')}`);
        }

        if (dataValidation.warnings.length > 0) {
          OptimizedErrorLogger.log('warning', `设备数据警告: ${dataValidation.warnings.join(', ')}`, errorContext);
        }

        setData(result.data);
        setLastUpdateTime(new Date().toLocaleTimeString('zh-CN'));
        
        OptimizedErrorLogger.log('info', `${deviceId} 数据获取成功 (${result.optimization?.method || '标准模式'})`, errorContext);
        
        if (result.fromCache) {
          OptimizedErrorLogger.log('info', '使用缓存数据', errorContext);
        }

        if (showMessage) {
          message.success(`${result.data.display_name} 数据刷新成功`);
        }
      } else {
        throw new Error(result.error || '获取数据失败');
      }

    } catch (error: any) {
      if (error.name === 'AbortError') {
        OptimizedErrorLogger.log('info', '请求被取消', errorContext);
        return;
      }

      const errorMessage = handleNetworkError(error, errorContext);
      setError(errorMessage);

      if (showMessage) {
        message.error(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  }, [deviceId, enableCache]);

  // 获取GPS实时数据
  const fetchGPSData = useCallback(async (limit = 50) => {
    try {
      setLoading(true);
      
      console.log(`📍 获取 ${deviceId} GPS实时数据`);

      const response = await fetch(
        `/api/device-management-optimized?device_id=${deviceId}&data_only=true&limit=${limit}&cache=${enableCache}`
      );

      if (!response.ok) {
        throw new Error(`GPS数据请求失败: ${response.status}`);
      }

      const result = await response.json();

      if (result.success) {
        console.log(`✅ ${deviceId} GPS数据获取成功: ${result.count}条记录`);
        return result.data;
      } else {
        throw new Error(result.error || '获取GPS数据失败');
      }

    } catch (error: any) {
      console.error(`❌ ${deviceId} GPS数据获取失败:`, error);
      message.error(error.message || '获取GPS数据失败');
      throw error;
    } finally {
      setLoading(false);
    }
  }, [deviceId, enableCache]);

  // 批量健康检查
  const performHealthCheck = useCallback(async (devices: string[] = [deviceId]) => {
    try {
      setLoading(true);
      
      console.log('🔍 执行设备健康检查:', devices);

      const response = await fetch('/api/device-management-optimized', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: 'health_check',
          devices
        })
      });

      if (!response.ok) {
        throw new Error(`健康检查失败: ${response.status}`);
      }

      const result = await response.json();

      if (result.success) {
        console.log('✅ 健康检查完成:', result.results);
        return result.results;
      } else {
        throw new Error(result.error || '健康检查失败');
      }

    } catch (error: any) {
      console.error('❌ 健康检查失败:', error);
      message.error(error.message || '健康检查失败');
      throw error;
    } finally {
      setLoading(false);
    }
  }, [deviceId]);

  // 清理缓存
  const clearCache = useCallback(async () => {
    try {
      const response = await fetch('/api/device-management-optimized', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: 'cache_clear'
        })
      });

      if (response.ok) {
        console.log('🗑️ 设备数据缓存已清理');
        message.success('缓存已清理');
        // 清理缓存后重新获取数据
        await fetchDeviceData(false, false);
      }
    } catch (error) {
      console.error('清理缓存失败:', error);
      message.error('清理缓存失败');
    }
  }, [fetchDeviceData]);

  // 管理自动刷新
  useEffect(() => {
    if (autoRefresh && refreshInterval > 0) {
      intervalRef.current = setInterval(() => {
        fetchDeviceData(false, true);
      }, refreshInterval);

      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
        }
      };
    }
  }, [autoRefresh, refreshInterval, fetchDeviceData]);

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // 设备ID变化时重新获取数据
  useEffect(() => {
    if (deviceId) {
      fetchDeviceData(false, enableCache);
    }
  }, [deviceId, fetchDeviceData, enableCache]);

  return {
    // 数据状态
    data,
    loading,
    error,
    lastUpdateTime,
    
    // 操作函数
    refresh: (showMessage = true) => fetchDeviceData(showMessage, false),
    fetchGPSData,
    performHealthCheck,
    clearCache,
    
    // 工具函数
    isOnline: data?.status === 'online',
    healthStatus: data?.health_score 
      ? data.health_score >= 80 ? 'excellent' 
      : data.health_score >= 60 ? 'good' 
      : data.health_score >= 40 ? 'fair' 
      : 'poor'
      : 'unknown'
  };
}
