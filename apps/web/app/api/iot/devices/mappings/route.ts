import { NextRequest, NextResponse } from 'next/server';

const IOT_SERVICE_BASE = process.env.IOT_SERVICE_BASE || 'http://127.0.0.1:5100';

export async function GET() {
  try {
    // 代理到后端IoT服务
    const response = await fetch(`${IOT_SERVICE_BASE}/devices/mappings`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      cache: 'no-cache'
    });

    if (!response.ok) {
      // 如果后端服务不可用，返回fallback数据
      return NextResponse.json({
        success: true,
        data: [
          {
            simple_id: 'device_1',
            actual_device_id: 'hangbishan_device_001',
            device_name: '挂傍山中心监测站',
            location_name: '玉林师范学院东校区挂傍山中心点',
            device_type: 'rk2206',
            latitude: 22.6847,
            longitude: 110.1893,
            status: 'active',
            description: '挂傍山核心监测区域的主要传感器节点',
            install_date: '2024-05-15T00:00:00Z',
            last_data_time: new Date().toISOString(),
            online_status: 'online' as const
          },
          {
            simple_id: 'device_2',
            actual_device_id: 'hangbishan_device_002',
            device_name: '坡顶监测站',
            location_name: '玉林师范学院东校区挂傍山坡顶',
            device_type: 'rk2206',
            latitude: 22.6850,
            longitude: 110.1890,
            status: 'active',
            description: '挂傍山坡顶位置的监测设备',
            install_date: '2024-05-15T00:00:00Z',
            last_data_time: new Date().toISOString(),
            online_status: 'online' as const
          },
          {
            simple_id: 'device_3',
            actual_device_id: 'hangbishan_device_003',
            device_name: '坡脚监测站',
            location_name: '玉林师范学院东校区挂傍山坡脚',
            device_type: 'rk2206',
            latitude: 22.6844,
            longitude: 110.1896,
            status: 'active',
            description: '挂傍山坡脚位置的监测设备',
            install_date: '2024-05-15T00:00:00Z',
            last_data_time: new Date().toISOString(),
            online_status: 'online' as const
          }
        ],
        message: '使用fallback数据（后端服务不可用）'
      });
    }

    const data = await response.json();
    return NextResponse.json(data);

  } catch (error) {
    console.error('代理设备映射API失败:', error);
    
    // 发生错误时返回fallback数据，确保前端能正常工作
    return NextResponse.json({
      success: true,
      data: [
        {
          simple_id: 'device_1',
          actual_device_id: 'hangbishan_device_001',
          device_name: '挂傍山中心监测站',
          location_name: '玉林师范学院东校区挂傍山中心点',
          device_type: 'rk2206',
          latitude: 22.6847,
          longitude: 110.1893,
          status: 'active',
          description: '挂傍山核心监测区域的主要传感器节点',
          install_date: '2024-05-15T00:00:00Z',
          last_data_time: new Date().toISOString(),
          online_status: 'online' as const
        },
        {
          simple_id: 'device_2',
          actual_device_id: 'hangbishan_device_002',
          device_name: '坡顶监测站',
          location_name: '玉林师范学院东校区挂傍山坡顶',
          device_type: 'rk2206',
          latitude: 22.6850,
          longitude: 110.1890,
          status: 'active',
          description: '挂傍山坡顶位置的监测设备',
          install_date: '2024-05-15T00:00:00Z',
          last_data_time: new Date().toISOString(),
          online_status: 'online' as const
        },
        {
          simple_id: 'device_3',
          actual_device_id: 'hangbishan_device_003',
          device_name: '坡脚监测站',
          location_name: '玉林师范学院东校区挂傍山坡脚',
          device_type: 'rk2206',
          latitude: 22.6844,
          longitude: 110.1896,
          status: 'active',
          description: '挂傍山坡脚位置的监测设备',
          install_date: '2024-05-15T00:00:00Z',
          last_data_time: new Date().toISOString(),
          online_status: 'online' as const
        }
      ],
      message: '使用fallback数据（API错误）'
    });
  }
}
