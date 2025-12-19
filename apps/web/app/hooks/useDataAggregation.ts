import { useState, useCallback, useRef } from 'react';
import { message } from 'antd';

export type AggregationType = 'hierarchy_stats' | 'network_stats' | 'device_summary' | 'real_time_dashboard';
export type TimeRange = '1h' | '6h' | '24h' | '7d' | '30d';

interface AggregationRequest {
  type: AggregationType;
  devices?: string[];
  timeRange?: TimeRange;
  includeBaselines?: boolean;
  includeAnomalies?: boolean;
}

interface AggregationResult {
  success: boolean;
  type: AggregationType;
  data: any;
  generatedAt: string;
  source: string;
  fromCache?: boolean;
}

export function useDataAggregation() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, AggregationResult>>({});
  
  const abortControllerRef = useRef<AbortController | null>(null);

  // 执行数据聚合
  const aggregate = useCallback(async (request: AggregationRequest, showMessage = false): Promise<AggregationResult | null> => {
    try {
      // 取消之前的请求
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      
      abortControllerRef.current = new AbortController();
      
      setLoading(true);
      setError(null);

      if (showMessage) {
        message.loading(`正在聚合${request.type}数据...`, 0.5);
      }

      console.log('📊 执行数据聚合:', request);

      const response = await fetch('/api/data-aggregation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(request),
        signal: abortControllerRef.current.signal
      });

      if (!response.ok) {
        throw new Error(`聚合请求失败: ${response.status}`);
      }

      const result: AggregationResult = await response.json();

      if (result.success) {
        // 保存结果到状态中
        const resultKey = `${request.type}_${JSON.stringify(request)}`;
        setResults(prev => ({
          ...prev,
          [resultKey]: result
        }));

        console.log(`✅ ${request.type} 聚合完成 (${result.source})`);
        
        if (result.fromCache) {
          console.log('💾 使用聚合缓存');
        }

        if (showMessage) {
          message.success(`${request.type} 数据聚合完成`);
        }

        return result;
      } else {
        throw new Error('聚合处理失败');
      }

    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log('聚合请求被取消');
        return null;
      }

      const errorMessage = error.message || '数据聚合失败';
      setError(errorMessage);
      console.error('❌ 数据聚合失败:', error);

      if (showMessage) {
        message.error(errorMessage);
      }
      
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  // 获取层级统计 - 替代 monitoring_hierarchy_stats 视图
  const getHierarchyStats = useCallback(async (showMessage = false) => {
    return await aggregate({
      type: 'hierarchy_stats'
    }, showMessage);
  }, [aggregate]);

  // 获取网络统计 - 替代 network_management_stats 视图
  const getNetworkStats = useCallback(async (devices: string[] = [], showMessage = false) => {
    return await aggregate({
      type: 'network_stats',
      devices
    }, showMessage);
  }, [aggregate]);

  // 获取设备摘要
  const getDeviceSummary = useCallback(async (
    devices: string[] = [], 
    timeRange: TimeRange = '24h', 
    showMessage = false
  ) => {
    return await aggregate({
      type: 'device_summary',
      devices,
      timeRange
    }, showMessage);
  }, [aggregate]);

  // 获取实时仪表板数据
  const getRealTimeDashboard = useCallback(async (
    timeRange: TimeRange = '24h',
    includeBaselines = true,
    includeAnomalies = true,
    showMessage = false
  ) => {
    return await aggregate({
      type: 'real_time_dashboard',
      timeRange,
      includeBaselines,
      includeAnomalies
    }, showMessage);
  }, [aggregate]);

  // 清理聚合缓存
  const clearAggregationCache = useCallback(async () => {
    try {
      const response = await fetch('/api/data-aggregation?action=clear_cache', {
        method: 'DELETE'
      });

      if (response.ok) {
        console.log('🗑️ 聚合缓存已清理');
        setResults({});
        message.success('聚合缓存已清理');
      }
    } catch (error) {
      console.error('清理聚合缓存失败:', error);
      message.error('清理聚合缓存失败');
    }
  }, []);

  // 批量聚合 - 一次性获取多种数据
  const batchAggregate = useCallback(async (
    requests: AggregationRequest[], 
    showMessage = false
  ): Promise<AggregationResult[]> => {
    try {
      setLoading(true);
      setError(null);

      if (showMessage) {
        message.loading(`正在批量聚合${requests.length}种数据...`, 1);
      }

      console.log('📊 执行批量数据聚合:', requests.map(r => r.type));

      const results = await Promise.allSettled(
        requests.map(request => aggregate(request, false))
      );

      const successfulResults: AggregationResult[] = [];
      const failedRequests: string[] = [];

      results.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value) {
          successfulResults.push(result.value);
        } else {
          failedRequests.push(requests[index].type);
        }
      });

      if (showMessage) {
        if (failedRequests.length === 0) {
          message.success(`批量聚合完成: ${successfulResults.length}种数据`);
        } else {
          message.warning(`部分聚合失败: ${failedRequests.join(', ')}`);
        }
      }

      console.log(`✅ 批量聚合完成: ${successfulResults.length}/${requests.length}`);
      
      return successfulResults;

    } catch (error: any) {
      const errorMessage = error.message || '批量聚合失败';
      setError(errorMessage);
      console.error('❌ 批量聚合失败:', error);

      if (showMessage) {
        message.error(errorMessage);
      }
      
      return [];
    } finally {
      setLoading(false);
    }
  }, [aggregate]);

  // 获取缓存的结果
  const getCachedResult = useCallback((type: AggregationType, request?: Partial<AggregationRequest>) => {
    const resultKey = `${type}_${JSON.stringify({ type, ...request })}`;
    return results[resultKey] || null;
  }, [results]);

  // 组件卸载时清理
  const cleanup = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);

  return {
    // 状态
    loading,
    error,
    results,
    
    // 基础操作
    aggregate,
    clearAggregationCache,
    batchAggregate,
    
    // 专用聚合函数
    getHierarchyStats,
    getNetworkStats,
    getDeviceSummary,
    getRealTimeDashboard,
    
    // 工具函数
    getCachedResult,
    cleanup,
    
    // 便捷状态
    hasResults: Object.keys(results).length > 0,
    resultCount: Object.keys(results).length
  };
}
