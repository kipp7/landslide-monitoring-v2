import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Supabase 客户端
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://sdssoyyjhunltmcjoxtg.supabase.co',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'REDACTED_JWT'
);

// 客户端连接管理
const clients = new Map<string, ReadableStreamDefaultController>();
const clientMetadata = new Map<string, {
  deviceId?: string;
  lastPing: number;
  subscriptions: string[];
  startTime: number;
}>();

// 数据缓存
const latestData = new Map<string, any>();
const lastBroadcast = new Map<string, number>();

// Server-Sent Events 流式数据推送
export async function GET(request: NextRequest) {
  console.log('🔄 新的SSE连接请求');
  
  const { searchParams } = new URL(request.url);
  const deviceId = searchParams.get('device_id') || 'all';
  const clientId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  // 创建SSE流
  const stream = new ReadableStream({
    start(controller) {
      console.log(`✅ SSE客户端连接: ${clientId}, 设备: ${deviceId}`);
      
      // 存储客户端连接
      clients.set(clientId, controller);
      clientMetadata.set(clientId, {
        deviceId: deviceId !== 'all' ? deviceId : undefined,
        lastPing: Date.now(),
        subscriptions: [deviceId],
        startTime: Date.now()
      });

      // 发送连接确认
      controller.enqueue(new TextEncoder().encode(
        `data: ${JSON.stringify({
          type: 'connection',
          clientId,
          timestamp: new Date().toISOString(),
          message: '实时数据流连接成功'
        })}\n\n`
      ));

      // 发送最新数据
      if (latestData.has(deviceId)) {
        controller.enqueue(new TextEncoder().encode(
          `data: ${JSON.stringify({
            type: 'initial_data',
            deviceId,
            data: latestData.get(deviceId),
            timestamp: new Date().toISOString()
          })}\n\n`
        ));
      }

      // 设置心跳检测
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(new TextEncoder().encode(
            `data: ${JSON.stringify({
              type: 'heartbeat',
              timestamp: new Date().toISOString(),
              connectedClients: clients.size
            })}\n\n`
          ));
          
          // 更新最后ping时间
          const metadata = clientMetadata.get(clientId);
          if (metadata) {
            metadata.lastPing = Date.now();
          }
        } catch (error) {
          console.log(`💔 客户端 ${clientId} 连接断开`);
          clearInterval(heartbeat);
          cleanup();
        }
      }, 30000); // 30秒心跳

      // 清理函数
      const cleanup = () => {
        clearInterval(heartbeat);
        clients.delete(clientId);
        clientMetadata.delete(clientId);
        console.log(`🧹 清理客户端 ${clientId}`);
      };

      // 监听关闭事件
      request.signal?.addEventListener('abort', cleanup);
    },

    cancel() {
      console.log(`🚫 SSE流被取消: ${clientId}`);
      clients.delete(clientId);
      clientMetadata.delete(clientId);
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET',
      'Access-Control-Allow-Headers': 'Cache-Control',
    },
  });
}

// WebSocket样式的POST端点用于数据推送
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, deviceId, data, options = {} } = body;

    console.log(`📤 收到数据推送请求: ${action}, 设备: ${deviceId}`);

    switch (action) {
      case 'broadcast_device_data':
        await broadcastDeviceData(deviceId, data);
        break;
      
      case 'broadcast_anomaly':
        await broadcastAnomaly(deviceId, data);
        break;
      
      case 'broadcast_system_status':
        await broadcastSystemStatus(data);
        break;
      
      case 'get_client_stats':
        return Response.json(getClientStats());
      
      case 'cleanup_inactive_clients':
        cleanupInactiveClients();
        break;
      
      default:
        return Response.json({
          success: false,
          error: '不支持的操作类型'
        }, { status: 400 });
    }

    return Response.json({
      success: true,
      action,
      timestamp: new Date().toISOString(),
      activeClients: clients.size
    });

  } catch (error) {
    console.error('实时数据推送错误:', error);
    return Response.json({
      success: false,
      error: '数据推送失败'
    }, { status: 500 });
  }
}

// 广播设备数据
async function broadcastDeviceData(deviceId: string, data: any) {
  console.log(`📡 广播设备数据: ${deviceId}`);
  
  // 更新缓存
  latestData.set(deviceId, data);
  latestData.set('all', { ...latestData.get('all'), [deviceId]: data });

  const message = {
    type: 'device_data',
    deviceId,
    data,
    timestamp: new Date().toISOString(),
    sequence: Date.now()
  };

  // 广播给相关客户端
  for (const [clientId, controller] of clients) {
    const metadata = clientMetadata.get(clientId);
    if (metadata && (
      metadata.deviceId === deviceId || 
      metadata.deviceId === undefined || 
      metadata.subscriptions.includes(deviceId) ||
      metadata.subscriptions.includes('all')
    )) {
      try {
        controller.enqueue(new TextEncoder().encode(
          `data: ${JSON.stringify(message)}\n\n`
        ));
      } catch (error) {
        console.log(`💥 广播失败，移除客户端: ${clientId}`);
        clients.delete(clientId);
        clientMetadata.delete(clientId);
      }
    }
  }
}

// 广播异常数据
async function broadcastAnomaly(deviceId: string, anomalyData: any) {
  console.log(`🚨 广播异常数据: ${deviceId}`);
  
  const message = {
    type: 'anomaly_alert',
    deviceId,
    data: anomalyData,
    severity: anomalyData.severity || 'medium',
    timestamp: new Date().toISOString(),
    alertId: `alert_${Date.now()}`
  };

  // 广播给所有客户端（异常数据优先级高）
  for (const [clientId, controller] of clients) {
    try {
      controller.enqueue(new TextEncoder().encode(
        `data: ${JSON.stringify(message)}\n\n`
      ));
    } catch (error) {
      console.log(`💥 异常广播失败，移除客户端: ${clientId}`);
      clients.delete(clientId);
      clientMetadata.delete(clientId);
    }
  }
}

// 广播系统状态
async function broadcastSystemStatus(statusData: any) {
  console.log('📊 广播系统状态');
  
  const message = {
    type: 'system_status',
    data: statusData,
    timestamp: new Date().toISOString(),
    connectedDevices: Array.from(latestData.keys()).filter(k => k !== 'all'),
    activeClients: clients.size
  };

  // 广播给所有客户端
  for (const [clientId, controller] of clients) {
    try {
      controller.enqueue(new TextEncoder().encode(
        `data: ${JSON.stringify(message)}\n\n`
      ));
    } catch (error) {
      console.log(`💥 状态广播失败，移除客户端: ${clientId}`);
      clients.delete(clientId);
      clientMetadata.delete(clientId);
    }
  }
}

// 获取客户端统计
function getClientStats() {
  const now = Date.now();
  const stats = {
    totalClients: clients.size,
    clientDetails: Array.from(clientMetadata.entries()).map(([clientId, metadata]) => ({
      clientId,
      deviceId: metadata.deviceId,
      connectedTime: now - metadata.startTime,
      lastPing: now - metadata.lastPing,
      subscriptions: metadata.subscriptions
    })),
    dataCache: {
      totalDevices: latestData.size,
      devices: Array.from(latestData.keys())
    },
    performance: {
      memoryUsage: process.memoryUsage ? process.memoryUsage() : null,
      uptime: process.uptime ? process.uptime() : null
    }
  };

  return {
    success: true,
    stats,
    timestamp: new Date().toISOString()
  };
}

// 清理不活跃的客户端
function cleanupInactiveClients() {
  const now = Date.now();
  const INACTIVE_THRESHOLD = 2 * 60 * 1000; // 2分钟

  let cleanedCount = 0;
  
  for (const [clientId, metadata] of clientMetadata) {
    if (now - metadata.lastPing > INACTIVE_THRESHOLD) {
      console.log(`🧹 清理不活跃客户端: ${clientId}`);
      clients.delete(clientId);
      clientMetadata.delete(clientId);
      cleanedCount++;
    }
  }

  console.log(`✅ 清理了 ${cleanedCount} 个不活跃客户端`);
  return cleanedCount;
}

// 定期清理任务
setInterval(() => {
  cleanupInactiveClients();
}, 5 * 60 * 1000); // 每5分钟清理一次

// Supabase 实时订阅集成
let supabaseSubscription: any = null;

async function setupSupabaseRealtime() {
  try {
    console.log('🔗 设置Supabase实时订阅');
    
    // 订阅iot_data表变化
    supabaseSubscription = supabase
      .channel('iot_data_changes')
      .on('postgres_changes', 
        { 
          event: 'INSERT', 
          schema: 'public', 
          table: 'iot_data' 
        }, 
        (payload) => {
          console.log('🆕 检测到新的IoT数据:', payload.new);
          
          // 广播新数据到所有SSE客户端
          if (payload.new && payload.new.device_id) {
            broadcastDeviceData(payload.new.device_id, {
              type: 'new_iot_data',
              data: payload.new,
              source: 'supabase_realtime'
            });
          }
        }
      )
      .on('postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'iot_anomalies'
        },
        (payload) => {
          console.log('🚨 检测到新的异常:', payload.new);
          
          // 广播异常到所有客户端
          if (payload.new && payload.new.device_id) {
            broadcastAnomaly(payload.new.device_id, {
              type: 'new_anomaly',
              data: payload.new,
              source: 'supabase_realtime'
            });
          }
        }
      )
      .subscribe();

    console.log('✅ Supabase实时订阅设置完成');
  } catch (error) {
    console.error('❌ Supabase实时订阅设置失败:', error);
  }
}

// 启动时设置实时订阅
if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'development') {
  setupSupabaseRealtime();
}
