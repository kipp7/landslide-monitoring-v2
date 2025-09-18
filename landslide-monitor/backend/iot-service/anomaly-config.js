/**
 * 异常检测配置文件
 * 可以根据实际环境和需求调整阈值
 */

const ANOMALY_THRESHOLDS = {
    // 温度异常阈值 (°C)
    temperature: {
      max: 50,    // 最高温度
      min: -20,   // 最低温度
      description: '户外环境温度异常检测'
    },
  
    // 湿度异常阈值 (%)
    humidity: {
      max: 100,   // 传感器最大值
      min: 0,     // 传感器最小值
      description: '湿度传感器故障检测'
    },
  
    // 加速度异常阈值 (mg, 1g = 1000mg)
    acceleration: {
      total_max: 20000,  // 总加速度超过20g认为异常（调整为更合理的阈值）
      description: '检测剧烈震动或设备移动'
    },
  
    // 陀螺仪异常阈值 (°/s)
    gyroscope: {
      total_max: 1000,  // 总角速度超过1000°/s认为异常
      description: '检测设备倾斜或旋转'
    },
  
    // 风险等级异常阈值 (0-1)
    risk_level: {
      critical: 0.8,    // 临界风险
      high: 0.6,        // 高风险
      medium: 0.3,      // 中等风险
      description: '滑坡风险等级评估'
    },
  
    // 振动异常阈值
    vibration: {
      max: 5.0,         // 振动强度超过5.0认为异常
      description: '检测异常振动'
    },
  
    // 设备离线检测 (毫秒)
    offline: {
      timeout: 300000,  // 5分钟没有数据认为离线
      description: '设备离线检测'
    }
  };
  
  /**
   * 风险评估权重配置
   */
  const RISK_WEIGHTS = {
    acceleration: 0.3,    // 加速度权重
    gyroscope: 0.2,       // 陀螺仪权重
    vibration: 0.2,       // 振动权重
    humidity: 0.1,        // 湿度权重
    temperature: 0.1,     // 温度权重
    device_risk: 1.0      // 设备自身风险等级权重
  };
  
  /**
   * 异常类型定义
   */
  const ANOMALY_TYPES = {
    TEMPERATURE_EXTREME: 'temperature_extreme',
    HUMIDITY_SENSOR_ERROR: 'humidity_sensor_error',
    ACCELERATION_HIGH: 'acceleration_high',
    GYROSCOPE_HIGH: 'gyroscope_high',
    RISK_CRITICAL: 'risk_critical',
    VIBRATION_HIGH: 'vibration_high',
    DEVICE_OFFLINE: 'device_offline'
  };
  
  /**
   * 风险等级定义
   */
  const RISK_LEVELS = {
    CRITICAL: 'critical_risk',
    HIGH: 'high_risk',
    MEDIUM: 'medium_risk',
    LOW: 'low_risk',
    NORMAL: 'normal'
  };
  
  /**
   * 获取异常检测配置
   */
  function getAnomalyConfig() {
    return {
      thresholds: ANOMALY_THRESHOLDS,
      weights: RISK_WEIGHTS,
      types: ANOMALY_TYPES,
      levels: RISK_LEVELS
    };
  }
  
  /**
   * 更新配置 (可以从环境变量或配置文件读取)
   */
  function updateConfig(newConfig) {
    if (newConfig.thresholds) {
      Object.assign(ANOMALY_THRESHOLDS, newConfig.thresholds);
    }
    if (newConfig.weights) {
      Object.assign(RISK_WEIGHTS, newConfig.weights);
    }
  }
  
  /**
   * 验证传感器数据是否在正常范围内
   */
  function validateSensorData(record) {
    const issues = [];
  
    // 检查温度范围
    if (record.temperature !== undefined) {
      if (record.temperature < -50 || record.temperature > 80) {
        issues.push(`温度值异常: ${record.temperature}°C`);
      }
    }
  
    // 检查湿度范围
    if (record.humidity !== undefined) {
      if (record.humidity < 0 || record.humidity > 100) {
        issues.push(`湿度值异常: ${record.humidity}%`);
      }
    }
  
    // 检查加速度范围
    if (record.acceleration_total !== undefined) {
      if (record.acceleration_total < 0 || record.acceleration_total > 50000) {
        issues.push(`加速度值异常: ${record.acceleration_total}mg`);
      }
    }
  
    return issues;
  }
  
  module.exports = {
    getAnomalyConfig,
    updateConfig,
    validateSensorData,
    ANOMALY_THRESHOLDS,
    RISK_WEIGHTS,
    ANOMALY_TYPES,
    RISK_LEVELS
  };
  