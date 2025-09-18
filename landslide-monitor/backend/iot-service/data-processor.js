const { createClient } = require('@supabase/supabase-js');
const { getAnomalyConfig, validateSensorData } = require('./anomaly-config');
const { createDeviceRegistration, createDeviceLocation, getDeviceDisplayName } = require('./device-registry');
const { deviceMapper } = require('./device-mapper');

// Supabase 配置
const SUPABASE_URL = 'https://sdssoyyjhunltmcjoxtg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNkc3NveXlqaHVubHRtY2pveHRnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDE0MzY3NTIsImV4cCI6MjA1NzAxMjc1Mn0.FisL8HivC_g-cnq4o7BNqHQ8vKDUpgfW3lUINfDXMSA';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * 数据处理器 - 基于iot_data生成其他表的数据
 */
class DataProcessor {
  constructor() {
    this.isProcessing = false;
    this.lastProcessedId = 0;
  }

  /**
   * 启动数据处理
   */
  async start() {
    console.log('启动数据处理器...');
    
    // 初始化设备信息
    await this.initializeDevices();
    
    // 启动实时处理
    this.startRealtimeProcessing();
    
    // 暂时禁用历史数据处理，避免重复处理旧数据
    // setInterval(() => {
    //   this.processHistoricalData();
    // }, 60000); // 每分钟处理一次

    // 定期检查设备离线状态
    setInterval(() => {
      this.checkDeviceOfflineStatus();
    }, 300000); // 每5分钟检查一次
  }

  /**
   * 初始化设备信息
   */
  async initializeDevices() {
    try {
      console.log('初始化设备信息...');
      
      // 获取所有唯一的设备ID
      const { data: devices, error } = await supabase
        .from('iot_data')
        .select('device_id, latitude, longitude')
        .not('device_id', 'is', null)
        .order('event_time', { ascending: false });

      if (error) {
        console.error('获取设备数据失败:', error);
        return;
      }

      // 按设备ID分组，获取最新位置信息
      const deviceMap = new Map();
      devices.forEach(record => {
        if (!deviceMap.has(record.device_id)) {
          deviceMap.set(record.device_id, record);
        }
      });

      // 插入或更新设备信息
      for (const [deviceId, deviceData] of deviceMap) {
        await this.upsertDevice(deviceId, deviceData);
        await this.upsertDeviceLocation(deviceId, deviceData);
      }

      console.log(`初始化了 ${deviceMap.size} 个设备`);
    } catch (error) {
      console.error('初始化设备信息失败:', error);
    }
  }

  /**
   * 插入或更新设备信息 - 使用友好名称
   */
  async upsertDevice(deviceId, deviceData) {
    try {
      // 使用设备注册系统生成友好信息
      const deviceRegistration = createDeviceRegistration(deviceId, {
        last_active: new Date().toISOString(),
        gateway_id: null
      });

      const { error } = await supabase
        .from('iot_devices')
        .upsert([deviceRegistration], { onConflict: 'device_id' });

      if (error) {
        console.error(`更新设备 ${getDeviceDisplayName(deviceId)} 失败:`, error);
      } else {
        console.log(`设备注册成功: ${getDeviceDisplayName(deviceId)}`);
      }
    } catch (error) {
      console.error(`处理设备 ${deviceId} 失败:`, error);
    }
  }

  /**
   * 插入或更新设备位置信息 - 使用友好名称
   */
  async upsertDeviceLocation(deviceId, deviceData) {
    try {
      if (!deviceData.latitude || !deviceData.longitude) return;

      // 使用设备注册系统生成位置信息
      const locationInfo = createDeviceLocation(deviceId, deviceData.latitude, deviceData.longitude);

      const { error } = await supabase
        .from('iot_device_locations')
        .upsert([locationInfo], { onConflict: 'device_id' });

      if (error) {
        console.error(` 更新设备位置 ${getDeviceDisplayName(deviceId)} 失败:`, error);
      } else {
        console.log(` 设备位置更新: ${getDeviceDisplayName(deviceId)} (${deviceData.latitude}, ${deviceData.longitude})`);
      }
    } catch (error) {
      console.error(` 处理设备位置 ${deviceId} 失败:`, error);
    }
  }

  /**
   * 启动实时数据处理
   */
  startRealtimeProcessing() {
    console.log(' 启动实时数据处理...');
    
    const channel = supabase
      .channel('iot_data_processor')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'iot_data'
        },
        async (payload) => {
          console.log('📨 收到新的IoT数据，开始处理...');
          await this.processNewData(payload.new);
        }
      )
      .subscribe();

    return channel;
  }

  /**
   * 处理新插入的数据
   */
  async processNewData(record) {
    try {
      // 更新设备最后活跃时间
      await this.updateDeviceActivity(record.device_id);
      
      // 暂时禁用异常检测，避免误报
      // await this.detectAnomalies(record);
      
      // 更新风险趋势
      await this.updateRiskTrends(record);
      
    } catch (error) {
      console.error(' 处理新数据失败:', error);
    }
  }

  /**
   * 更新设备活跃时间
   */
  async updateDeviceActivity(deviceId) {
    try {
      const { error } = await supabase
        .from('iot_devices')
        .update({ last_active: new Date().toISOString() })
        .eq('device_id', deviceId);

      if (error) {
        console.error(` 更新设备活跃时间失败:`, error);
      }
    } catch (error) {
      console.error(' 更新设备活跃时间失败:', error);
    }
  }

  /**
   * 异常检测 - 基于配置文件的智能检测
   */
  async detectAnomalies(record) {
    try {
      const config = getAnomalyConfig();
      const thresholds = config.thresholds;
      const anomalies = [];

      // 首先验证数据有效性
      const validationIssues = validateSensorData(record);
      if (validationIssues.length > 0) {
        console.warn(`  数据验证警告 ${record.device_id}:`, validationIssues);
      }

      // 温度异常检测
      if (record.temperature !== undefined &&
          (record.temperature > thresholds.temperature.max ||
           record.temperature < thresholds.temperature.min)) {
        anomalies.push({
          device_id: record.device_id,
          anomaly_type: config.types.TEMPERATURE_EXTREME,
          value: record.temperature,
          raw_data: record
        });
      }

      // 湿度异常检测 - 主要检测传感器故障
      if (record.humidity !== undefined &&
          (record.humidity > thresholds.humidity.max ||
           record.humidity < thresholds.humidity.min)) {
        anomalies.push({
          device_id: record.device_id,
          anomaly_type: config.types.HUMIDITY_SENSOR_ERROR,
          value: record.humidity,
          raw_data: record
        });
      }

      // 加速度异常检测 - 检测剧烈震动
      if (record.acceleration_total !== undefined &&
          record.acceleration_total > thresholds.acceleration.total_max) {
        anomalies.push({
          device_id: record.device_id,
          anomaly_type: config.types.ACCELERATION_HIGH,
          value: record.acceleration_total,
          raw_data: record
        });
      }

      // 陀螺仪异常检测 - 检测设备旋转
      if (record.gyroscope_total !== undefined &&
          record.gyroscope_total > thresholds.gyroscope.total_max) {
        anomalies.push({
          device_id: record.device_id,
          anomaly_type: config.types.GYROSCOPE_HIGH,
          value: record.gyroscope_total,
          raw_data: record
        });
      }

      // 风险等级异常检测
      if (record.risk_level !== undefined &&
          record.risk_level > thresholds.risk_level.critical) {
        anomalies.push({
          device_id: record.device_id,
          anomaly_type: config.types.RISK_CRITICAL,
          value: record.risk_level,
          raw_data: record
        });
      }

      // 振动异常检测
      if (record.vibration !== undefined &&
          record.vibration > thresholds.vibration.max) {
        anomalies.push({
          device_id: record.device_id,
          anomaly_type: config.types.VIBRATION_HIGH,
          value: record.vibration,
          raw_data: record
        });
      }

      // 注意：设备离线检测不在这里进行，因为这里处理的是实时数据
      // 设备离线检测应该通过定期检查设备最后活跃时间来实现

      // 插入异常记录
      if (anomalies.length > 0) {
        const { error } = await supabase
          .from('iot_anomalies')
          .insert(anomalies);

        if (error) {
          console.error(' 插入异常记录失败:', error);
        } else {
          console.log(` 检测到 ${anomalies.length} 个异常`);
        }
      }

    } catch (error) {
      console.error(' 异常检测失败:', error);
    }
  }

  /**
   * 更新风险趋势 - 基于多个因素综合评估
   */
  async updateRiskTrends(record) {
    try {
      // 计算综合风险等级
      let calculatedRisk = 0;
      let anomalyType = 'normal';

      // 基于传感器数据计算风险
      if (record.acceleration_total && record.acceleration_total > 1500) {
        calculatedRisk += 0.3; // 高加速度增加风险
      }

      if (record.gyroscope_total && record.gyroscope_total > 800) {
        calculatedRisk += 0.2; // 高角速度增加风险
      }

      if (record.vibration && record.vibration > 3.0) {
        calculatedRisk += 0.2; // 高振动增加风险
      }

      if (record.humidity && record.humidity > 90) {
        calculatedRisk += 0.1; // 高湿度增加风险
      }

      // 如果设备本身提供了风险等级，也考虑进去
      if (record.risk_level !== undefined) {
        calculatedRisk = Math.max(calculatedRisk, record.risk_level);
      }

      // 确保风险等级在0-1之间
      calculatedRisk = Math.min(1.0, calculatedRisk);

      // 确定异常类型
      if (calculatedRisk > 0.8) {
        anomalyType = 'critical_risk';
      } else if (calculatedRisk > 0.6) {
        anomalyType = 'high_risk';
      } else if (calculatedRisk > 0.3) {
        anomalyType = 'medium_risk';
      } else {
        anomalyType = 'low_risk';
      }

      // 只有当风险等级有意义时才更新
      if (calculatedRisk > 0 || record.latitude || record.longitude) {
        const trendData = {
          device_id: record.device_id,
          anomaly_type: anomalyType,
          risk_level: calculatedRisk,
          latitude: record.latitude,
          longitude: record.longitude,
          province: '广西壮族自治区',
          city: '防城港市',
          district: '防城区',
          township: '华石镇'
        };

        const { error } = await supabase
          .from('iot_anomaly_trends')
          .upsert([trendData], { onConflict: 'device_id' });

        if (error) {
          console.error(' 更新风险趋势失败:', error);
        } else if (calculatedRisk > 0.5) {
          console.log(`  设备 ${record.device_id} 风险等级: ${calculatedRisk.toFixed(2)} (${anomalyType})`);
        }
      }

    } catch (error) {
      console.error(' 更新风险趋势失败:', error);
    }
  }

  /**
   * 处理历史数据
   */
  async processHistoricalData() {
    if (this.isProcessing) return;
    
    this.isProcessing = true;
    
    try {
      // 获取未处理的数据
      const { data: records, error } = await supabase
        .from('iot_data')
        .select('*')
        .gt('id', this.lastProcessedId)
        .order('id', { ascending: true })
        .limit(100);

      if (error) {
        console.error(' 获取历史数据失败:', error);
        return;
      }

      if (records && records.length > 0) {
        console.log(` 处理 ${records.length} 条历史数据...`);
        
        for (const record of records) {
          await this.processNewData(record);
          this.lastProcessedId = record.id;
        }
        
        console.log(` 历史数据处理完成，最新ID: ${this.lastProcessedId}`);
      }

    } catch (error) {
      console.error(' 处理历史数据失败:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * 检查设备离线状态
   */
  async checkDeviceOfflineStatus() {
    try {
      console.log(' 检查设备离线状态...');

      const config = getAnomalyConfig();
      const offlineThreshold = new Date(Date.now() - config.thresholds.offline.timeout);

      // 查找超过阈值时间没有活跃的设备
      const { data: offlineDevices, error } = await supabase
        .from('iot_devices')
        .select('device_id, friendly_name, last_active')
        .lt('last_active', offlineThreshold.toISOString());

      if (error) {
        console.error(' 查询离线设备失败:', error);
        return;
      }

      if (offlineDevices && offlineDevices.length > 0) {
        console.log(`  发现 ${offlineDevices.length} 个离线设备`);

        // 为每个离线设备创建异常记录
        const offlineAnomalies = offlineDevices.map(device => ({
          device_id: device.device_id,
          anomaly_type: 'device_offline',
          value: Math.floor((Date.now() - new Date(device.last_active).getTime()) / 1000), // 离线时长(秒)
          raw_data: {
            device_id: device.device_id,
            friendly_name: device.friendly_name,
            last_active: device.last_active,
            offline_duration: Math.floor((Date.now() - new Date(device.last_active).getTime()) / 1000)
          }
        }));

        // 插入离线异常记录
        const { error: insertError } = await supabase
          .from('iot_anomalies')
          .insert(offlineAnomalies);

        if (insertError) {
          console.error(' 插入离线异常记录失败:', insertError);
        } else {
          offlineDevices.forEach(device => {
            const displayName = device.friendly_name || getDeviceDisplayName(device.device_id);
            const offlineMinutes = Math.floor((Date.now() - new Date(device.last_active).getTime()) / 60000);
            console.log(` 设备离线: ${displayName} (${offlineMinutes}分钟)`);
          });
        }
      } else {
        console.log(' 所有设备在线');
      }

    } catch (error) {
      console.error(' 检查设备离线状态失败:', error);
    }
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  const processor = new DataProcessor();
  processor.start().then(() => {
    console.log(' 数据处理器启动成功');
    
    // 优雅关闭
    process.on('SIGINT', () => {
      console.log('\n 正在停止数据处理器...');
      process.exit(0);
    });
  }).catch(error => {
    console.error(' 数据处理器启动失败:', error);
    process.exit(1);
  });
}

module.exports = DataProcessor;
