import { proxyLegacyApiRequest } from '@/app/api/_proxy'
import { NextResponse } from 'next/server'

export const POST = proxyLegacyApiRequest
export const PUT = proxyLegacyApiRequest
export const PATCH = proxyLegacyApiRequest
export const DELETE = proxyLegacyApiRequest
export const OPTIONS = proxyLegacyApiRequest

const FALLBACK_MAPPINGS = [
  {
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
    online_status: 'online' as const,
  },
  {
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
    online_status: 'online' as const,
  },
  {
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
    online_status: 'online' as const,
  },
]

export async function GET(request: Request): Promise<Response> {
  try {
    const resp = await proxyLegacyApiRequest(request)
    if (resp.ok) return resp

    return NextResponse.json({
      success: true,
      data: FALLBACK_MAPPINGS,
      message: '使用 fallback 设备映射（上游服务不可用）',
      upstream_status: resp.status,
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    return NextResponse.json({
      success: true,
      data: FALLBACK_MAPPINGS,
      message: '使用 fallback 设备映射（API 错误）',
      error: msg,
    })
  }
}
