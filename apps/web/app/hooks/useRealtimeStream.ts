import { useState, useEffect, useCallback, useRef } from 'react';
import { message } from 'antd';

interface RealtimeMessage {
  type: 'connection' | 'device_data' | 'anomaly_alert' | 'system_status' | 'heartbeat' | 'initial_data';
  deviceId?: string;
  data?: any;
  timestamp: string;
  clientId?: string;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  alertId?: string;
  sequence?: number;
}

interface UseRealtimeStreamOptions {
  deviceId?: string;
  enableAnomalyAlerts?: boolean;
  enableSystemStatus?: boolean;
  autoReconnect?: boolean;
  reconnectDelay?: number;
  maxReconnectAttempts?: number;
}

export function useRealtimeStream({
  deviceId = 'all',
  enableAnomalyAlerts = true,
  enableSystemStatus = true,
  autoReconnect = true,
  reconnectDelay = 5000,
  maxReconnectAttempts = 5
}: UseRealtimeStreamOptions = {}) {
  
  // 状态管理
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [lastMessage, setLastMessage] = useState<RealtimeMessage | null>(null);
  const [deviceData, setDeviceData] = useState<Map<string, any>>(new Map());
  const [anomalies, setAnomalies] = useState<RealtimeMessage[]>([]);
  const [systemStatus, setSystemStatus] = useState<any>(null);
  const [connectionStats, setConnectionStats] = useState<{
    connectedAt?: string;
    reconnectCount: number;
    messagesReceived: number;
    lastHeartbeat?: string;
  }>({
    reconnectCount: 0,
    messagesReceived: 0
  });

  // 引用管理
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);
  const messageHandlers = useRef<Map<string, (message: RealtimeMessage) => void>>(new Map());

  // 建立SSE连接
  const connect = useCallback(() => {
    if (eventSourceRef.current?.readyState === EventSource.OPEN) {
      console.log('🔗 SSE连接已存在');
      return;
    }

    setIsConnecting(true);
    setConnectionError(null);

    try {
      const url = `/api/realtime-stream?device_id=${encodeURIComponent(deviceId)}`;
      console.log(`🔄 建立SSE连接: ${url}`);
      
      const eventSource = new EventSource(url);
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        console.log('✅ SSE连接成功');
        setIsConnected(true);
        setIsConnecting(false);
        setConnectionError(null);
        reconnectAttempts.current = 0;
        
        setConnectionStats(prev => ({
          ...prev,
          connectedAt: new Date().toISOString(),
          reconnectCount: prev.reconnectCount + (prev.connectedAt ? 1 : 0)
        }));
      };

      eventSource.onmessage = (event) => {
        try {
          const message: RealtimeMessage = JSON.parse(event.data);
          setLastMessage(message);
          
          setConnectionStats(prev => ({
            ...prev,
            messagesReceived: prev.messagesReceived + 1,
            lastHeartbeat: message.type === 'heartbeat' ? message.timestamp : prev.lastHeartbeat
          }));

          // 处理不同类型的消息
          handleMessage(message);
          
        } catch (error) {
          console.error('🚫 解析SSE消息失败:', error, event.data);
        }
      };

      eventSource.onerror = (error) => {
        console.error('💥 SSE连接错误:', error);
        setIsConnected(false);
        setIsConnecting(false);
        setConnectionError('连接中断');

        // 自动重连
        if (autoReconnect && reconnectAttempts.current < maxReconnectAttempts) {
          reconnectAttempts.current++;
          console.log(`🔁 ${reconnectDelay}ms后尝试重连 (${reconnectAttempts.current}/${maxReconnectAttempts})`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, reconnectDelay);
        } else {
          setConnectionError('连接失败，已达到最大重试次数');
          message.error('实时数据连接失败');
        }
      };

    } catch (error) {
      console.error('🚫 创建SSE连接失败:', error);
      setIsConnecting(false);
      setConnectionError('无法创建连接');
    }
  }, [deviceId, autoReconnect, reconnectDelay, maxReconnectAttempts]);

  // 断开连接
  const disconnect = useCallback(() => {
    console.log('🔌 主动断开SSE连接');
    
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    setIsConnected(false);
    setIsConnecting(false);
    setConnectionError(null);
  }, []);

  // 处理消息
  const handleMessage = useCallback((msg: RealtimeMessage) => {
    console.log(`📨 收到实时消息: ${msg.type}`, msg);

    switch (msg.type) {
      case 'connection':
        console.log('🎉 连接确认:', msg.clientId);
        break;

      case 'initial_data':
        if (msg.deviceId && msg.data) {
          setDeviceData(prev => new Map(prev.set(msg.deviceId!, msg.data)));
        }
        break;

      case 'device_data':
        if (msg.deviceId && msg.data) {
          setDeviceData(prev => new Map(prev.set(msg.deviceId!, msg.data)));
          
          // 触发自定义处理器
          const handler = messageHandlers.current.get('device_data');
          if (handler) handler(msg);
        }
        break;

      case 'anomaly_alert':
        if (enableAnomalyAlerts) {
          setAnomalies(prev => [msg, ...prev.slice(0, 49)]); // 保留最近50条异常
          
          // 显示异常通知
          const severity = msg.severity || 'medium';
          const title = `设备${msg.deviceId}异常警报`;
          
          if (severity === 'critical' || severity === 'high') {
            message.error({
              content: title,
              duration: 10 // 重要异常显示10秒
            });
          } else {
            message.warning({
              content: title,
              duration: 5
            });
          }
          
          // 触发自定义处理器
          const handler = messageHandlers.current.get('anomaly_alert');
          if (handler) handler(msg);
        }
        break;

      case 'system_status':
        if (enableSystemStatus) {
          setSystemStatus(msg.data);
          
          // 触发自定义处理器
          const handler = messageHandlers.current.get('system_status');
          if (handler) handler(msg);
        }
        break;

      case 'heartbeat':
        // 心跳消息保持连接活跃
        console.log('💓 心跳:', msg.timestamp);
        break;

      default:
        console.log('❓ 未知消息类型:', msg.type);
    }
  }, [enableAnomalyAlerts, enableSystemStatus]);

  // 注册消息处理器
  const onMessage = useCallback((type: string, handler: (message: RealtimeMessage) => void) => {
    messageHandlers.current.set(type, handler);
    
    return () => {
      messageHandlers.current.delete(type);
    };
  }, []);

  // 发送数据到服务器
  const sendData = useCallback(async (action: string, data: any) => {
    try {
      const response = await fetch('/api/realtime-stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action,
          deviceId,
          data
        })
      });

      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || '发送数据失败');
      }

      return result;
    } catch (error) {
      console.error('📤 发送数据失败:', error);
      throw error;
    }
  }, [deviceId]);

  // 获取客户端统计
  const getClientStats = useCallback(async () => {
    try {
      return await sendData('get_client_stats', {});
    } catch (error) {
      console.error('📊 获取客户端统计失败:', error);
      return null;
    }
  }, [sendData]);

  // 广播设备数据
  const broadcastDeviceData = useCallback(async (targetDeviceId: string, data: any) => {
    try {
      return await sendData('broadcast_device_data', {
        deviceId: targetDeviceId,
        data
      });
    } catch (error) {
      console.error('📡 广播设备数据失败:', error);
      throw error;
    }
  }, [sendData]);

  // 组件挂载时连接
  useEffect(() => {
    connect();
    
    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  // 设备ID变化时重连
  useEffect(() => {
    if (isConnected) {
      console.log('🔄 设备ID变化，重新连接');
      disconnect();
      setTimeout(connect, 1000);
    }
  }, [deviceId]);

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    // 连接状态
    isConnected,
    isConnecting,
    connectionError,
    connectionStats,
    
    // 数据状态
    lastMessage,
    deviceData,
    anomalies,
    systemStatus,
    
    // 操作函数
    connect,
    disconnect,
    onMessage,
    sendData,
    getClientStats,
    broadcastDeviceData,
    
    // 工具函数
    getDeviceData: (deviceId: string) => deviceData.get(deviceId),
    getLatestAnomalies: (count = 10) => anomalies.slice(0, count),
    clearAnomalies: () => setAnomalies([]),
    
    // 状态检查
    isDeviceOnline: (deviceId: string) => {
      const data = deviceData.get(deviceId);
      return data && data.timestamp && 
        (Date.now() - new Date(data.timestamp).getTime()) < 5 * 60 * 1000;
    }
  };
}
