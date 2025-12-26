// 优化的数据验证和错误处理工具

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  data?: any;
}

export interface ErrorContext {
  component: string;
  action: string;
  deviceId?: string;
  timestamp: string;
  userId?: string;
}

// 设备ID验证
export function validateDeviceId(deviceId: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!deviceId) {
    errors.push('设备ID不能为空');
  } else if (typeof deviceId !== 'string') {
    errors.push('设备ID必须是字符串类型');
  } else if (!/^device_[1-3]$/.test(deviceId)) {
    errors.push('设备ID格式不正确，应为 device_1, device_2, 或 device_3');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

// GPS坐标验证
export function validateGPSCoordinates(lat: number, lng: number): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (typeof lat !== 'number' || typeof lng !== 'number') {
    errors.push('经纬度必须是数字类型');
  } else {
    if (Math.abs(lat) > 90) {
      errors.push('纬度必须在 -90 到 90 之间');
    }
    if (Math.abs(lng) > 180) {
      errors.push('经度必须在 -180 到 180 之间');
    }
    
    // 检查是否在合理的监测区域范围内 (广西防城港附近)
    if (lat < 20 || lat > 25 || lng < 105 || lng > 115) {
      warnings.push('坐标位置超出预期监测区域范围');
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

// 时间范围验证
export function validateTimeRange(timeRange: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const validRanges = ['1h', '6h', '24h', '7d', '30d'];

  if (!timeRange) {
    errors.push('时间范围不能为空');
  } else if (!validRanges.includes(timeRange)) {
    errors.push(`无效的时间范围: ${timeRange}，支持的范围: ${validRanges.join(', ')}`);
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

// 聚合请求验证
export function validateAggregationRequest(request: any): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!request.type) {
    errors.push('聚合类型不能为空');
  } else {
    const validTypes = ['hierarchy_stats', 'network_stats', 'device_summary', 'real_time_dashboard'];
    if (!validTypes.includes(request.type)) {
      errors.push(`无效的聚合类型: ${request.type}`);
    }
  }

  if (request.devices && Array.isArray(request.devices)) {
    request.devices.forEach((deviceId: string, index: number) => {
      const deviceValidation = validateDeviceId(deviceId);
      if (!deviceValidation.isValid) {
        errors.push(`设备列表[${index}]: ${deviceValidation.errors.join(', ')}`);
      }
    });
  }

  if (request.timeRange) {
    const timeValidation = validateTimeRange(request.timeRange);
    if (!timeValidation.isValid) {
      errors.push(...timeValidation.errors);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

// 设备数据验证
export function validateDeviceData(data: any): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!data) {
    errors.push('设备数据不能为空');
    return { isValid: false, errors, warnings };
  }

  // 必填字段检查
  const requiredFields = ['device_id', 'status'];
  requiredFields.forEach(field => {
    if (!data[field]) {
      errors.push(`缺少必填字段: ${field}`);
    }
  });

  // 状态验证
  if (data.status && !['online', 'offline', 'maintenance'].includes(data.status)) {
    errors.push('设备状态必须是 online, offline, 或 maintenance');
  }

  // 健康度验证
  if (data.health_score !== undefined) {
    if (typeof data.health_score !== 'number' || data.health_score < 0 || data.health_score > 100) {
      errors.push('健康度必须是 0-100 之间的数字');
    } else if (data.health_score < 20) {
      warnings.push('设备健康度过低，建议进行维护');
    }
  }

  // 电池电量验证
  if (data.battery_level !== undefined) {
    if (typeof data.battery_level !== 'number' || data.battery_level < 0 || data.battery_level > 100) {
      errors.push('电池电量必须是 0-100 之间的数字');
    } else if (data.battery_level < 20) {
      warnings.push('设备电池电量低，建议及时充电');
    }
  }

  // 温湿度验证
  if (data.temperature !== undefined && typeof data.temperature === 'number') {
    if (data.temperature < -40 || data.temperature > 80) {
      warnings.push('温度读数异常，请检查传感器');
    }
  }

  if (data.humidity !== undefined && typeof data.humidity === 'number') {
    if (data.humidity < 0 || data.humidity > 100) {
      errors.push('湿度必须在 0-100% 之间');
    }
  }

  // GPS坐标验证
  if (data.coordinates) {
    const gpsValidation = validateGPSCoordinates(data.coordinates.lat, data.coordinates.lng);
    errors.push(...gpsValidation.errors);
    warnings.push(...gpsValidation.warnings);
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    data: data
  };
}

// 错误日志记录
export class OptimizedErrorLogger {
  private static logs: Array<{
    timestamp: string;
    level: 'error' | 'warning' | 'info';
    context: ErrorContext;
    message: string;
    details?: any;
  }> = [];

  static log(
    level: 'error' | 'warning' | 'info',
    message: string,
    context: ErrorContext,
    details?: any
  ) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      context,
      message,
      details
    };

    this.logs.push(logEntry);

    // 控制台输出
    const prefix = `[${level.toUpperCase()}] ${context.component}::${context.action}`;
    switch (level) {
      case 'error':
        console.error(`${prefix}: ${message}`, details);
        break;
      case 'warning':
        console.warn(`${prefix}: ${message}`, details);
        break;
      case 'info':
        console.info(`${prefix}: ${message}`, details);
        break;
    }

    // 保持日志大小
    if (this.logs.length > 1000) {
      this.logs = this.logs.slice(-500);
    }

    // 严重错误时可以发送到监控服务
    if (level === 'error') {
      this.sendToMonitoring(logEntry);
    }
  }

  static getLogs(level?: 'error' | 'warning' | 'info') {
    return level 
      ? this.logs.filter(log => log.level === level)
      : this.logs;
  }

  static getRecentErrors(hours = 24) {
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
    return this.logs.filter(log => 
      log.level === 'error' && new Date(log.timestamp) > cutoff
    );
  }

  private static sendToMonitoring(logEntry: any) {
    // 这里可以集成监控服务，如 Sentry, DataDog 等
    // 目前只是示例实现
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const existingLogs = JSON.parse(
          window.localStorage.getItem('error_monitoring') || '[]'
        );
        existingLogs.push(logEntry);
        
        // 只保留最近的错误
        const recentLogs = existingLogs.slice(-50);
        window.localStorage.setItem('error_monitoring', JSON.stringify(recentLogs));
      } catch (error) {
        console.error('保存错误日志失败:', error);
      }
    }
  }

  static clearLogs() {
    this.logs = [];
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem('error_monitoring');
    }
  }
}

// API响应验证
export function validateAPIResponse(response: any, expectedFields: string[] = []): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!response) {
    errors.push('API响应为空');
    return { isValid: false, errors, warnings };
  }

  if (typeof response !== 'object') {
    errors.push('API响应格式错误');
    return { isValid: false, errors, warnings };
  }

  // 检查标准响应结构
  if (!response.hasOwnProperty('success')) {
    warnings.push('响应缺少 success 字段');
  }

  if (response.success === false && !response.error) {
    warnings.push('失败响应缺少错误信息');
  }

  // 检查期望的字段
  expectedFields.forEach(field => {
    if (!response.hasOwnProperty(field)) {
      warnings.push(`响应缺少期望字段: ${field}`);
    }
  });

  // 检查数据时间戳
  if (response.timestamp) {
    const responseTime = new Date(response.timestamp);
    const now = new Date();
    const ageMinutes = (now.getTime() - responseTime.getTime()) / (1000 * 60);
    
    if (ageMinutes > 30) {
      warnings.push(`响应数据较旧 (${Math.round(ageMinutes)} 分钟前)`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    data: response
  };
}

// 网络请求错误处理
export function handleNetworkError(error: any, context: ErrorContext): string {
  let errorMessage = '网络请求失败';

  if (error.name === 'AbortError') {
    errorMessage = '请求被取消';
    OptimizedErrorLogger.log('info', errorMessage, context);
  } else if (error.message?.includes('fetch')) {
    errorMessage = '网络连接失败，请检查网络状态';
    OptimizedErrorLogger.log('error', errorMessage, context, error);
  } else if (error.message?.includes('timeout')) {
    errorMessage = '请求超时，请稍后重试';
    OptimizedErrorLogger.log('warning', errorMessage, context, error);
  } else if (error.status) {
    switch (error.status) {
      case 400:
        errorMessage = '请求参数错误';
        break;
      case 401:
        errorMessage = '认证失败，请重新登录';
        break;
      case 403:
        errorMessage = '权限不足';
        break;
      case 404:
        errorMessage = '请求的资源不存在';
        break;
      case 500:
        errorMessage = '服务器内部错误';
        break;
      case 502:
        errorMessage = '网关错误';
        break;
      case 503:
        errorMessage = '服务暂时不可用';
        break;
      default:
        errorMessage = `请求失败 (状态码: ${error.status})`;
    }
    OptimizedErrorLogger.log('error', errorMessage, context, error);
  } else {
    OptimizedErrorLogger.log('error', errorMessage, context, error);
  }

  return errorMessage;
}

// 重试机制
export async function withRetry<T>(
  fn: () => Promise<T>,
  context: ErrorContext,
  maxRetries = 3,
  retryDelay = 1000
): Promise<T> {
  let lastError: any;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      if (attempt === maxRetries) {
        OptimizedErrorLogger.log(
          'error',
          `重试${maxRetries}次后仍然失败`,
          context,
          error
        );
        throw error;
      }

      OptimizedErrorLogger.log(
        'warning',
        `第${attempt}次尝试失败，${retryDelay}ms后重试`,
        context,
        error
      );

      await new Promise(resolve => setTimeout(resolve, retryDelay));
      retryDelay *= 2; // 指数退避
    }
  }

  throw lastError;
}
