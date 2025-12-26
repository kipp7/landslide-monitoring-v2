import { getApiBaseUrl } from './v2Api'

const getIoTBaseUrl = (): string => {
  const base = getApiBaseUrl()
  if (base) return base

  if (typeof window !== 'undefined') return window.location.origin
  return 'http://localhost:8080'
}

export const API_CONFIG = {
  IOT_BASE_URL: getIoTBaseUrl(),
  ENDPOINTS: {
    DEVICE_COMMANDS: (deviceId: string) => `/huawei/devices/${deviceId}/commands`,
    DEVICE_MOTOR: (deviceId: string) => `/huawei/devices/${deviceId}/motor`,
    DEVICE_BUZZER: (deviceId: string) => `/huawei/devices/${deviceId}/buzzer`,
    DEVICE_REBOOT: (deviceId: string) => `/huawei/devices/${deviceId}/reboot`,
    DEVICE_SHADOW: (deviceId: string) => `/huawei/devices/${deviceId}/shadow`,
    HUAWEI_CONFIG: '/huawei/config',
    COMMAND_TEMPLATES: '/huawei/command-templates',
  },
}

export const getApiUrl = (endpoint: string): string => {
  const baseUrl = getIoTBaseUrl().replace(/\/+$/, '')
  const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`
  return `${baseUrl}${path}`
}

