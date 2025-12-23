import { apiDeleteJson, apiGetJson, apiJson, type ApiSuccessResponse } from '../v2Api'

export type CameraStats = {
  fps: number
  quality: number
  resolution: string
  uptime: number
  cpu_usage: number
  free_heap: number
  wifi_rssi: number
}

export type CameraDevice = {
  id: string
  ip: string
  name: string
  status: 'online' | 'offline' | 'error'
  lastSeen: number
  stats?: CameraStats
}

export type ListCameraDevicesResponse = { devices: CameraDevice[]; total: number; online: number }

export async function listCameraDevices(): Promise<ApiSuccessResponse<ListCameraDevicesResponse>> {
  return apiGetJson<ApiSuccessResponse<ListCameraDevicesResponse>>('/api/v1/camera/devices')
}

export async function getCameraStatus(
  cameraId: string,
  query?: { timeoutMs?: number },
): Promise<ApiSuccessResponse<CameraDevice>> {
  const params = new URLSearchParams()
  if (query?.timeoutMs != null) params.set('timeoutMs', String(query.timeoutMs))
  const qs = params.toString()
  return apiGetJson<ApiSuccessResponse<CameraDevice>>(
    `/api/v1/camera/devices/${encodeURIComponent(cameraId)}/status${qs ? `?${qs}` : ''}`,
  )
}

export async function addCameraDevice(body: { id: string; ip: string; name: string }): Promise<ApiSuccessResponse<CameraDevice>> {
  return apiJson<ApiSuccessResponse<CameraDevice>>('/api/v1/camera/devices', body)
}

export async function deleteCameraDevice(cameraId: string): Promise<ApiSuccessResponse<{ cameraId: string }>> {
  return apiDeleteJson<ApiSuccessResponse<{ cameraId: string }>>(`/api/v1/camera/devices/${encodeURIComponent(cameraId)}`)
}

