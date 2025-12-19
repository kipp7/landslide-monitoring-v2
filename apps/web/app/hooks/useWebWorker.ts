import { useRef, useCallback, useEffect } from 'react';

interface WebWorkerMessage {
  action: string;
  data: any;
  options?: any;
}

interface WebWorkerResponse {
  success: boolean;
  action: string;
  result?: any;
  error?: {
    message: string;
    stack?: string;
  };
  timestamp: string;
}

interface UseWebWorkerOptions {
  workerPath: string;
  maxRetries?: number;
  timeout?: number;
}

export function useWebWorker({ workerPath, maxRetries = 3, timeout = 30000 }: UseWebWorkerOptions) {
  const workerRef = useRef<Worker | null>(null);
  const pendingRequests = useRef<Map<string, {
    resolve: (value: any) => void;
    reject: (error: any) => void;
    timeout: NodeJS.Timeout;
    retryCount: number;
  }>>(new Map());

  // 生成唯一请求ID
  const generateRequestId = useCallback(() => {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }, []);

  // 初始化WebWorker
  const initWorker = useCallback(() => {
    if (typeof window === 'undefined') return null;

    try {
      const worker = new Worker(workerPath);
      
      worker.onmessage = (e: MessageEvent<WebWorkerResponse>) => {
        const { success, action, result, error, timestamp } = e.data;
        const requestId = action; // 简化版本，实际应该有更好的ID管理
        
        const pendingRequest = pendingRequests.current.get(requestId);
        if (pendingRequest) {
          clearTimeout(pendingRequest.timeout);
          pendingRequests.current.delete(requestId);
          
          if (success) {
            pendingRequest.resolve(result);
          } else {
            pendingRequest.reject(new Error(error?.message || 'WebWorker执行失败'));
          }
        }
      };

      worker.onerror = (error) => {
        console.error('WebWorker错误:', error);
        // 清理所有待处理的请求
        pendingRequests.current.forEach(({ reject, timeout }) => {
          clearTimeout(timeout);
          reject(new Error('WebWorker遇到错误'));
        });
        pendingRequests.current.clear();
      };

      return worker;
    } catch (error) {
      console.error('初始化WebWorker失败:', error);
      return null;
    }
  }, [workerPath]);

  // 发送消息到WebWorker
  const postMessage = useCallback(async <T = any>(message: WebWorkerMessage): Promise<T> => {
    return new Promise((resolve, reject) => {
      if (!workerRef.current) {
        workerRef.current = initWorker();
      }

      if (!workerRef.current) {
        reject(new Error('无法初始化WebWorker'));
        return;
      }

      const requestId = generateRequestId();
      
      // 设置超时
      const timeoutId = setTimeout(() => {
        const pendingRequest = pendingRequests.current.get(requestId);
        if (pendingRequest) {
          pendingRequests.current.delete(requestId);
          
          // 尝试重试
          if (pendingRequest.retryCount < maxRetries) {
            console.warn(`WebWorker请求超时，重试第${pendingRequest.retryCount + 1}次`);
            postMessage(message)
              .then(resolve)
              .catch(reject);
          } else {
            reject(new Error('WebWorker请求超时'));
          }
        }
      }, timeout);

      // 存储待处理的请求
      pendingRequests.current.set(requestId, {
        resolve,
        reject,
        timeout: timeoutId,
        retryCount: 0
      });

      // 发送消息（简化版本，实际应该包含requestId）
      workerRef.current.postMessage({
        ...message,
        requestId
      });
    });
  }, [initWorker, generateRequestId, maxRetries, timeout]);

  // 终止WebWorker
  const terminate = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }
    
    // 清理所有待处理的请求
    pendingRequests.current.forEach(({ reject, timeout }) => {
      clearTimeout(timeout);
      reject(new Error('WebWorker已终止'));
    });
    pendingRequests.current.clear();
  }, []);

  // 检查WebWorker是否可用
  const isWorkerSupported = useCallback(() => {
    return typeof window !== 'undefined' && typeof Worker !== 'undefined';
  }, []);

  // 获取WebWorker状态
  const getWorkerStatus = useCallback(() => {
    return {
      isSupported: isWorkerSupported(),
      isInitialized: !!workerRef.current,
      pendingRequests: pendingRequests.current.size
    };
  }, [isWorkerSupported]);

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      terminate();
    };
  }, [terminate]);

  return {
    postMessage,
    terminate,
    isWorkerSupported,
    getWorkerStatus
  };
}

// GPS计算专用WebWorker Hook
export function useGPSCalculationWorker() {
  const { postMessage, terminate, isWorkerSupported, getWorkerStatus } = useWebWorker({
    workerPath: '/workers/gps-calculation-worker.js',
    maxRetries: 2,
    timeout: 15000
  });

  // 批量GPS计算
  const calculateGPSBatch = useCallback(async (gpsDataList: any[], baseline: any) => {
    try {
      const result = await postMessage({
        action: 'calculateGPSBatch',
        data: { gpsDataList, baseline }
      });
      
      console.log(`✅ WebWorker批量计算完成: ${result.metadata.total_processed}条数据，耗时${result.metadata.processing_time_ms.toFixed(2)}ms`);
      
      return result;
    } catch (error) {
      console.error('WebWorker GPS批量计算失败:', error);
      throw error;
    }
  }, [postMessage]);

  // 时间序列分析
  const analyzeTimeSeries = useCallback(async (timeSeriesData: any[]) => {
    try {
      const result = await postMessage({
        action: 'analyzeTimeSeries',
        data: { timeSeriesData }
      });
      
      console.log('✅ WebWorker时间序列分析完成');
      
      return result;
    } catch (error) {
      console.error('WebWorker时间序列分析失败:', error);
      throw error;
    }
  }, [postMessage]);

  // 异常检测
  const detectAnomalies = useCallback(async (analysisData: any[], threshold: number = 3) => {
    try {
      const result = await postMessage({
        action: 'detectAnomalies',
        data: { analysisData },
        options: { threshold }
      });
      
      console.log(`✅ WebWorker异常检测完成: 发现${result.length}个异常点`);
      
      return result;
    } catch (error) {
      console.error('WebWorker异常检测失败:', error);
      throw error;
    }
  }, [postMessage]);

  // 单点GPS计算
  const calculateSingleGPS = useCallback(async (currentLat: number, currentLng: number, baseLat: number, baseLng: number) => {
    try {
      const result = await postMessage({
        action: 'calculateSingleGPS',
        data: { currentLat, currentLng, baseLat, baseLng }
      });
      
      return result;
    } catch (error) {
      console.error('WebWorker单点GPS计算失败:', error);
      throw error;
    }
  }, [postMessage]);

  return {
    // 计算函数
    calculateGPSBatch,
    analyzeTimeSeries,
    detectAnomalies,
    calculateSingleGPS,
    
    // 工具函数
    terminate,
    isWorkerSupported,
    getWorkerStatus
  };
}
