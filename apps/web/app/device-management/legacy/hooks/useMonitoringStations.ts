// 监测站管理Hook - 统一管理所有监测站相关状态和操作
'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { apiGetJson, apiJson, apiPutJson } from '../../../../lib/v2Api';

export interface MonitoringStation {
  device_id: string;
  station_name: string;
  location_name: string;
  latitude: number;
  longitude: number;
  altitude?: number;
  sensor_types: string[];
  chart_legend_name: string;
  description?: string;
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  status: 'active' | 'inactive' | 'maintenance';
  install_date?: string;
  is_online?: boolean;
  last_data_time?: string;
  created_at?: string;
  updated_at?: string;
}

export interface ChartConfig {
  chartType: string;
  title: string;
  unit: string;
  yAxisName: string;
  deviceLegends: {
    [deviceId: string]: string;
  };
}

interface UseMonitoringStationsOptions {
  autoRefresh?: boolean;
  refreshInterval?: number;
  enableCache?: boolean;
}

const CACHE_KEY = 'monitoring_stations_cache';
const CACHE_DURATION = 5 * 60 * 1000; // 5分钟缓存

type LegacyOkResponse<T> = { success: true; data: T; message?: string; timestamp?: string };
type LegacyErrorResponse = { success: false; message: string; error?: unknown; timestamp?: string };

function normalizeStation(row: any): MonitoringStation {
  const deviceId = typeof row?.device_id === 'string' ? row.device_id : '';
  const stationName =
    typeof row?.station_name === 'string' && row.station_name.trim() ? row.station_name : deviceId || 'unknown';
  const locationName = typeof row?.location_name === 'string' ? row.location_name : '';

  const statusRaw = typeof row?.status === 'string' ? row.status : 'active';
  const status: MonitoringStation['status'] =
    statusRaw === 'inactive' || statusRaw === 'maintenance' ? statusRaw : 'active';

  const riskRaw = typeof row?.risk_level === 'string' ? row.risk_level : 'medium';
  const risk: MonitoringStation['risk_level'] =
    riskRaw === 'low' || riskRaw === 'high' || riskRaw === 'critical' ? riskRaw : 'medium';

  const sensorTypes = Array.isArray(row?.sensor_types) ? row.sensor_types.filter((v: any) => typeof v === 'string') : [];
  const legendName =
    typeof row?.chart_legend_name === 'string' && row.chart_legend_name.trim() ? row.chart_legend_name : stationName;

  return {
    device_id: deviceId,
    station_name: stationName,
    location_name: locationName,
    latitude: typeof row?.latitude === 'number' ? row.latitude : 0,
    longitude: typeof row?.longitude === 'number' ? row.longitude : 0,
    altitude: typeof row?.altitude === 'number' ? row.altitude : undefined,
    sensor_types: sensorTypes,
    chart_legend_name: legendName,
    description: typeof row?.description === 'string' ? row.description : undefined,
    risk_level: risk,
    status,
    install_date: typeof row?.install_date === 'string' ? row.install_date : undefined,
    is_online: typeof row?.is_online === 'boolean' ? row.is_online : undefined,
    last_data_time: typeof row?.last_data_time === 'string' ? row.last_data_time : undefined,
    created_at: typeof row?.created_at === 'string' ? row.created_at : undefined,
    updated_at: typeof row?.updated_at === 'string' ? row.updated_at : undefined
  };
}

export function useMonitoringStations(options: UseMonitoringStationsOptions = {}) {
  const {
    autoRefresh = false,
    refreshInterval = 30000, // 30秒
    enableCache = true
  } = options;

  const [stations, setStations] = useState<MonitoringStation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastFetch, setLastFetch] = useState<number>(0);

  // 从缓存获取数据
  const getCachedData = useCallback(() => {
    if (!enableCache) return null;
    
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const { data, timestamp } = JSON.parse(cached);
        if (Date.now() - timestamp < CACHE_DURATION) {
          return data;
        }
      }
    } catch (error) {
      console.warn('获取缓存数据失败:', error);
    }
    return null;
  }, [enableCache]);

  // 缓存数据
  const setCachedData = useCallback((data: MonitoringStation[]) => {
    if (!enableCache) return;
    
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({
        data,
        timestamp: Date.now()
      }));
    } catch (error) {
      console.warn('缓存数据失败:', error);
    }
  }, [enableCache]);

  // 获取所有监测站数据
  const fetchStations = useCallback(async (useCache = enableCache) => {
    try {
      setLoading(true);
      setError(null);

      // 尝试使用缓存
      if (useCache) {
        const cachedData = getCachedData();
        if (cachedData) {
          setStations(cachedData);
          setLoading(false);
          setLastFetch(Date.now());
          return cachedData;
        }
      }

      const result = await apiGetJson<LegacyOkResponse<any> | LegacyErrorResponse>('/api/monitoring-stations');

      if (result && typeof result === 'object' && 'success' in result && result.success) {
        const list = Array.isArray((result as any).data) ? (result as any).data : [];
        const normalized = list.map(normalizeStation);
        setStations(normalized);
        setCachedData(normalized);
        setLastFetch(Date.now());
        return normalized;
      }

      throw new Error((result as any)?.message || '获取监测站数据失败');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '网络连接失败';

      // 如果API不存在，返回fallback数据而不是报错
      if (errorMessage.includes('HTTP 404')) {
        const fallbackData = [
          {
            device_id: 'device_1',
            station_name: '挂傍山中心监测站',
            location_name: '玉林师范学院东校区挂傍山中心点',
            chart_legend_name: '挂傍山中心监测站',
            latitude: 22.6847,
            longitude: 110.1893,
            sensor_types: ['temperature', 'humidity', 'acceleration', 'illumination', 'gps'],
            risk_level: 'medium',
            status: 'active',
            is_online: true
          },
          {
            device_id: 'device_2',
            station_name: '坡顶监测站',
            location_name: '玉林师范学院东校区挂傍山坡顶',
            chart_legend_name: '坡顶监测站',
            latitude: 22.6850,
            longitude: 110.1890,
            sensor_types: ['temperature', 'humidity', 'gyroscope', 'vibration', 'gps'],
            risk_level: 'high',
            status: 'active',
            is_online: true
          },
          {
            device_id: 'device_3',
            station_name: '坡脚监测站',
            location_name: '玉林师范学院东校区挂傍山坡脚',
            chart_legend_name: '坡脚监测站',
            latitude: 22.6844,
            longitude: 110.1896,
            sensor_types: ['temperature', 'acceleration', 'illumination', 'gps', 'vibration'],
            risk_level: 'low',
            status: 'active',
            is_online: true
          }
        ];
        console.log('API不存在，使用fallback数据');
        const normalized = fallbackData.map(normalizeStation);
        setStations(normalized);
        setCachedData(normalized);
        setLastFetch(Date.now());
        return normalized;
      }

      setError(errorMessage);
      
      // 网络失败时尝试使用缓存
      const cachedData = getCachedData();
      if (cachedData) {
        setStations(cachedData);
        console.warn('使用缓存数据:', errorMessage);
        return cachedData;
      } else {
        setStations([]);
        return [];
      }
    } finally {
      setLoading(false);
    }
  }, [enableCache, getCachedData, setCachedData]);

  // 更新监测站信息
  const updateStation = useCallback(async (
    deviceId: string, 
    updates: Partial<MonitoringStation>
  ): Promise<MonitoringStation> => {
    try {
      const result = await apiPutJson<LegacyOkResponse<any> | LegacyErrorResponse>(
        `/api/monitoring-stations?deviceId=${encodeURIComponent(deviceId)}`,
        updates
      );

      if (result && typeof result === 'object' && 'success' in result && result.success) {
        // 后端 compat 路由只返回 {updated:true}，这里直接 merge updates
        setStations((prev) =>
          prev.map((station) => (station.device_id === deviceId ? normalizeStation({ ...station, ...updates }) : station))
        );

        if (enableCache) {
          localStorage.removeItem(CACHE_KEY);
        }

        return normalizeStation({ device_id: deviceId, ...updates });
      }

      throw new Error((result as any)?.message || '更新监测站信息失败');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '更新失败';
      setError(errorMessage);
      throw err;
    }
  }, [enableCache]);

  // 批量更新图例配置
  const updateChartLegends = useCallback(async (
    chartType: string,
    deviceLegends: { [deviceId: string]: string }
  ): Promise<void> => {
    try {
      const result = await apiJson<LegacyOkResponse<any> | LegacyErrorResponse>('/api/monitoring-stations', {
        chartType,
        deviceLegends
      });

      if (result && typeof result === 'object' && 'success' in result && result.success) {
        // 更新本地状态中的图例名称
        setStations(prev => prev.map(station => ({
          ...station,
          chart_legend_name: deviceLegends[station.device_id] || station.chart_legend_name
        })));
        
        // 清除缓存
        if (enableCache) {
          localStorage.removeItem(CACHE_KEY);
        }
      } else {
        throw new Error((result as any)?.message || '更新图例配置失败');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '更新图例失败';
      setError(errorMessage);
      throw err;
    }
  }, [enableCache]);

  // 获取图表配置
  const getChartConfig = useCallback(async (chartType: string): Promise<ChartConfig> => {
    try {
      const result = await apiGetJson<LegacyOkResponse<ChartConfig> | LegacyErrorResponse>(
        `/api/monitoring-stations?chartType=${encodeURIComponent(chartType)}`
      );

      if (result && typeof result === 'object' && 'success' in result && result.success) {
        return (result as any).data;
      }

      throw new Error((result as any)?.message || '获取图表配置失败');
    } catch (err) {
      // 如果API失败，返回基于当前stations的配置
      const fallbackConfig: ChartConfig = {
        chartType,
        title: `${chartType}趋势图 - 挂傍山监测网络`,
        unit: '',
        yAxisName: chartType,
        deviceLegends: stations.reduce((acc, station) => {
          acc[station.device_id] = station.chart_legend_name || station.station_name;
          return acc;
        }, {} as { [deviceId: string]: string })
      };
      
      console.warn(`获取图表配置失败，使用fallback配置:`, err);
      return fallbackConfig;
    }
  }, [stations]);

  // 计算派生状态
  const stationsMap = useMemo(() => {
    return stations.reduce((map, station) => {
      map[station.device_id] = station;
      return map;
    }, {} as { [deviceId: string]: MonitoringStation });
  }, [stations]);

  const onlineStations = useMemo(() => {
    return stations.filter(station => station.is_online);
  }, [stations]);

  const offlineStations = useMemo(() => {
    return stations.filter(station => !station.is_online);
  }, [stations]);

  const stationsByRisk = useMemo(() => {
    return stations.reduce((groups, station) => {
      const risk = station.risk_level;
      if (!groups[risk]) groups[risk] = [];
      groups[risk].push(station);
      return groups;
    }, {} as { [risk: string]: MonitoringStation[] });
  }, [stations]);

  // 初始化加载
  useEffect(() => {
    fetchStations();
  }, [fetchStations]);

  // 自动刷新
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      fetchStations(false); // 自动刷新时不使用缓存
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, fetchStations]);

  // 获取监测站信息的便捷方法
  const getStation = useCallback((deviceId: string): MonitoringStation | null => {
    return stationsMap[deviceId] || null;
  }, [stationsMap]);

  // 获取图例名称的便捷方法
  const getStationLegendName = useCallback((deviceId: string): string => {
    const station = getStation(deviceId);
    return station?.chart_legend_name || station?.station_name || deviceId;
  }, [getStation]);

  // 获取监测站名称的便捷方法
  const getStationName = useCallback((deviceId: string): string => {
    const station = getStation(deviceId);
    return station?.station_name || deviceId;
  }, [getStation]);

  return {
    // 数据状态
    stations,
    loading,
    error,
    lastFetch,
    
    // 派生状态
    stationsMap,
    onlineStations,
    offlineStations,
    stationsByRisk,
    
    // 操作方法
    refresh: fetchStations,
    updateStation,
    updateChartLegends,
    getChartConfig,
    
    // 便捷方法
    getStation,
    getStationLegendName,
    getStationName,
    
    // 统计信息
    totalCount: stations.length,
    onlineCount: onlineStations.length,
    offlineCount: offlineStations.length
  };
}
