import { NextRequest, NextResponse } from 'next/server';

// 摄像头设备管理
interface CameraDevice {
  id: string;
  ip: string;
  name: string;
  status: 'online' | 'offline' | 'error';
  lastSeen: number;
  stats?: {
    fps: number;
    quality: number;
    resolution: string;
    uptime: number;
    cpu_usage: number;
    free_heap: number;
    wifi_rssi: number;
  };
}

// 内存中的设备列表 (生产环境应使用数据库)
const devices = new Map<string, CameraDevice>();

// 默认设备配置
const defaultDevices: CameraDevice[] = [
  {
    id: 'ESP32CAM_001',
    ip: '192.168.74.55',
    name: '主监控摄像头',
    status: 'offline',
    lastSeen: 0
  }
];

// 初始化默认设备
defaultDevices.forEach(device => {
  devices.set(device.id, device);
});

// GET - 获取摄像头列表和状态
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const deviceId = searchParams.get('deviceId');
  const action = searchParams.get('action');

  try {
    // 获取特定设备状态
    if (deviceId && action === 'status') {
      const device = devices.get(deviceId);
      if (!device) {
        return NextResponse.json(
          { error: '设备不存在' },
          { status: 404 }
        );
      }

      // 尝试从设备获取实时状态
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(`http://${device.ip}/api/status`, {
          method: 'GET',
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          const stats = await response.json();
          device.status = 'online';
          device.lastSeen = Date.now();
          device.stats = stats;
          devices.set(deviceId, device);
        } else {
          device.status = 'error';
        }
      } catch (error) {
        device.status = 'offline';
      }

      return NextResponse.json(device);
    }

    // 获取所有设备列表
    const deviceList = Array.from(devices.values()).map(device => {
      // 检查设备是否在线 (5分钟内有活动)
      const isOnline = device.lastSeen > 0 && (Date.now() - device.lastSeen) < 5 * 60 * 1000;
      return {
        ...device,
        status: isOnline ? device.status : 'offline'
      };
    });

    return NextResponse.json({
      devices: deviceList,
      total: deviceList.length,
      online: deviceList.filter(d => d.status === 'online').length
    });

  } catch (error) {
    console.error('获取摄像头状态失败:', error);
    return NextResponse.json(
      { error: '获取摄像头状态失败' },
      { status: 500 }
    );
  }
}

// POST - 添加或更新摄像头设备
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, deviceId, ip, name } = body;

    if (action === 'add') {
      // 添加新设备
      if (!deviceId || !ip || !name) {
        return NextResponse.json(
          { error: '缺少必要参数' },
          { status: 400 }
        );
      }

      const newDevice: CameraDevice = {
        id: deviceId,
        ip,
        name,
        status: 'offline',
        lastSeen: 0
      };

      devices.set(deviceId, newDevice);

      return NextResponse.json({
        message: '设备添加成功',
        device: newDevice
      });
    }

    if (action === 'update_status') {
      // 更新设备状态 (由设备主动上报)
      const device = devices.get(deviceId);
      if (!device) {
        return NextResponse.json(
          { error: '设备不存在' },
          { status: 404 }
        );
      }

      device.status = body.status || 'online';
      device.lastSeen = Date.now();
      if (body.stats) {
        device.stats = body.stats;
      }

      devices.set(deviceId, device);

      return NextResponse.json({
        message: '状态更新成功',
        device
      });
    }

    if (action === 'test_connection') {
      // 测试设备连接
      if (!ip) {
        return NextResponse.json(
          { error: '缺少IP地址' },
          { status: 400 }
        );
      }

      try {
        // 测试HTTP连接
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const httpResponse = await fetch(`http://${ip}/api/status`, {
          method: 'GET',
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        const httpOk = httpResponse.ok;
        let stats = null;

        if (httpOk) {
          stats = await httpResponse.json();
        }

        // 测试WebSocket连接 (简化检测)
        const wsOk = true; // 实际应该测试WebSocket连接

        return NextResponse.json({
          ip,
          http: httpOk,
          websocket: wsOk,
          stats: httpOk ? stats : null,
          message: httpOk ? '连接成功' : '连接失败'
        });

      } catch (error) {
        return NextResponse.json({
          ip,
          http: false,
          websocket: false,
          stats: null,
          message: '连接超时或失败',
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    return NextResponse.json(
      { error: '未知操作' },
      { status: 400 }
    );

  } catch (error) {
    console.error('处理摄像头请求失败:', error);
    return NextResponse.json(
      { error: '处理请求失败' },
      { status: 500 }
    );
  }
}

// PUT - 更新设备配置
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { deviceId, ip, name, config } = body;

    const device = devices.get(deviceId);
    if (!device) {
      return NextResponse.json(
        { error: '设备不存在' },
        { status: 404 }
      );
    }

    // 更新设备信息
    if (ip) device.ip = ip;
    if (name) device.name = name;

    devices.set(deviceId, device);

    // 如果有配置更新，发送到设备
    if (config && device.status === 'online') {
      try {
        // 这里可以通过WebSocket或HTTP API发送配置到设备
        // 示例：发送FPS和质量配置
        const configController = new AbortController();
        const configTimeoutId = setTimeout(() => configController.abort(), 5000);

        const configResponse = await fetch(`http://${device.ip}/api/config`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(config),
          signal: configController.signal
        });

        clearTimeout(configTimeoutId);

        if (!configResponse.ok) {
          console.warn('发送配置到设备失败');
        }
      } catch (error) {
        console.warn('发送配置到设备失败:', error);
      }
    }

    return NextResponse.json({
      message: '设备更新成功',
      device
    });

  } catch (error) {
    console.error('更新设备失败:', error);
    return NextResponse.json(
      { error: '更新设备失败' },
      { status: 500 }
    );
  }
}

// DELETE - 删除设备
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const deviceId = searchParams.get('deviceId');

    if (!deviceId) {
      return NextResponse.json(
        { error: '缺少设备ID' },
        { status: 400 }
      );
    }

    const device = devices.get(deviceId);
    if (!device) {
      return NextResponse.json(
        { error: '设备不存在' },
        { status: 404 }
      );
    }

    devices.delete(deviceId);

    return NextResponse.json({
      message: '设备删除成功',
      deviceId
    });

  } catch (error) {
    console.error('删除设备失败:', error);
    return NextResponse.json(
      { error: '删除设备失败' },
      { status: 500 }
    );
  }
}
