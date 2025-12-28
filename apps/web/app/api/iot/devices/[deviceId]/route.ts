import { proxyLegacyApiRequest } from '@/app/api/_proxy'
import { NextRequest, NextResponse } from 'next/server'

export const POST = proxyLegacyApiRequest
export const PUT = proxyLegacyApiRequest
export const PATCH = proxyLegacyApiRequest
export const DELETE = proxyLegacyApiRequest
export const OPTIONS = proxyLegacyApiRequest

const FALLBACK_DEVICES: Record<string, Record<string, unknown>> = {
  device_1: {
    simple_id: 'device_1',
    actual_device_id: 'hangbishan_device_001',
    device_name: '挂壁山中心监测站',
    location_name: '玉林师范学院东校区挂壁山中心点',
    device_type: 'rk2206',
    latitude: 22.6847,
    longitude: 110.1893,
    status: 'active',
    description: '挂壁山核心监测区域的主要传感器节点',
    install_date: '2024-05-15T00:00:00Z',
    last_data_time: new Date().toISOString(),
    online_status: 'online',
    sensor_types: ['temperature', 'humidity', 'acceleration', 'illumination', 'gps'],
    risk_level: 'medium',
  },
  device_2: {
    simple_id: 'device_2',
    actual_device_id: 'hangbishan_device_002',
    device_name: '坡顶监测站',
    location_name: '玉林师范学院东校区挂壁山坡顶',
    device_type: 'rk2206',
    latitude: 22.685,
    longitude: 110.189,
    status: 'active',
    description: '挂壁山坡顶位置的监测设备',
    install_date: '2024-05-15T00:00:00Z',
    last_data_time: new Date().toISOString(),
    online_status: 'online',
    sensor_types: ['temperature', 'humidity', 'gyroscope', 'vibration', 'gps'],
    risk_level: 'high',
  },
  device_3: {
    simple_id: 'device_3',
    actual_device_id: 'hangbishan_device_003',
    device_name: '坡脚监测站',
    location_name: '玉林师范学院东校区挂壁山坡脚',
    device_type: 'rk2206',
    latitude: 22.6844,
    longitude: 110.1896,
    status: 'active',
    description: '挂壁山坡脚位置的监测设备',
    install_date: '2024-05-15T00:00:00Z',
    last_data_time: new Date().toISOString(),
    online_status: 'online',
    sensor_types: ['temperature', 'acceleration', 'illumination', 'gps', 'vibration'],
    risk_level: 'low',
  },
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ deviceId: string }> }
): Promise<Response> {
  const { deviceId } = await params

  try {
    const resp = await proxyLegacyApiRequest(request)
    if (resp.ok) return resp

    const fallback = FALLBACK_DEVICES[deviceId]
    if (fallback) {
      return NextResponse.json({
        success: true,
        data: fallback,
        message: '使用 fallback 设备详情（上游服务不可用）',
        upstream_status: resp.status,
      })
    }

    return NextResponse.json(
      { success: false, error: '设备不存在' },
      { status: 404 }
    )
  } catch (error) {
    const fallback = FALLBACK_DEVICES[deviceId]
    if (fallback) {
      const msg = error instanceof Error ? error.message : String(error)
      return NextResponse.json({
        success: true,
        data: fallback,
        message: '使用 fallback 设备详情（API 错误）',
        error: msg,
      })
    }

    return NextResponse.json(
      { success: false, error: '设备不存在或服务不可用' },
      { status: 404 }
    )
  }
}
