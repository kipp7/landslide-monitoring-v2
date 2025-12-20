// API配置管理
// 动态获取IoT后端服务地址
const getIoTBaseUrl = (): string => {
  // 只在客户端执行
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;

    // 如果是服务器域名，使用nginx代理路径
    if (hostname === 'ylsf.chat') {
      return 'http://ylsf.chat:1020/iot';
    }

    // 如果是localhost，使用本地IoT服务
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'http://localhost:5100';
    }

    // 其他情况，尝试使用当前域名的5100端口
    return `http://${hostname}:5100`;
  }

  // 服务端渲染时的默认值
  return 'http://localhost:5100';
};

export const API_CONFIG = {
  // IoT后端服务地址
  IOT_BASE_URL: getIoTBaseUrl(),

  // API端点
  ENDPOINTS: {
    DEVICE_COMMANDS: (deviceId: string) => `/huawei/devices/${deviceId}/commands`,
    DEVICE_MOTOR: (deviceId: string) => `/huawei/devices/${deviceId}/motor`,
    DEVICE_BUZZER: (deviceId: string) => `/huawei/devices/${deviceId}/buzzer`,
    DEVICE_REBOOT: (deviceId: string) => `/huawei/devices/${deviceId}/reboot`,
    DEVICE_SHADOW: (deviceId: string) => `/huawei/devices/${deviceId}/shadow`,
    HUAWEI_CONFIG: '/huawei/config',
    COMMAND_TEMPLATES: '/huawei/command-templates'
  }
};

// 获取完整的API URL
export const getApiUrl = (endpoint: string): string => {
  const baseUrl = getIoTBaseUrl();
  const fullUrl = `${baseUrl}${endpoint}`;

  // 调试信息
  if (typeof window !== 'undefined') {
    console.log('API调用:', {
      hostname: window.location.hostname,
      baseUrl: baseUrl,
      endpoint: endpoint,
      fullUrl: fullUrl
    });
  }

  return fullUrl;
};
