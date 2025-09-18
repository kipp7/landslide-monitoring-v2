const { createClient } = require('@supabase/supabase-js');

// Supabase 配置
const SUPABASE_URL = 'https://sdssoyyjhunltmcjoxtg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNkc3NveXlqaHVubHRtY2pveHRnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDE0MzY3NTIsImV4cCI6MjA1NzAxMjc1Mn0.FisL8HivC_g-cnq4o7BNqHQ8vKDUpgfW3lUINfDXMSA';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * 设备映射管理器
 * 管理简洁ID（device_1, device_2）与实际设备ID的映射关系
 */
class DeviceMapper {
  constructor() {
    this.mappingCache = new Map(); // 缓存映射关系
    this.reverseMappingCache = new Map(); // 反向映射缓存
  }

  /**
   * 初始化映射缓存
   */
  async initializeCache() {
    try {
      const { data, error } = await supabase
        .from('device_mapping')
        .select('*')
        .eq('status', 'active');

      if (error) {
        console.error(' 初始化设备映射缓存失败:', error);
        return;
      }

      // 构建双向映射缓存
      this.mappingCache.clear();
      this.reverseMappingCache.clear();

      data.forEach(mapping => {
        this.mappingCache.set(mapping.actual_device_id, mapping);
        this.reverseMappingCache.set(mapping.simple_id, mapping);
      });

      console.log(` 设备映射缓存初始化完成，加载了 ${data.length} 个设备映射`);
    } catch (error) {
      console.error(' 初始化设备映射缓存异常:', error);
    }
  }

  /**
   * 获取或创建设备的简洁ID
   */
  async getSimpleId(actualDeviceId, deviceInfo = {}) {
    try {
      // 先从缓存查找
      if (this.mappingCache.has(actualDeviceId)) {
        return this.mappingCache.get(actualDeviceId).simple_id;
      }

      // 缓存中没有，查询数据库
      const { data, error } = await supabase
        .from('device_mapping')
        .select('simple_id')
        .eq('actual_device_id', actualDeviceId)
        .eq('status', 'active')
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 是没有找到记录的错误
        console.error(' 查询设备映射失败:', error);
        return actualDeviceId; // 返回原始ID作为备用
      }

      if (data) {
        // 找到了映射，更新缓存
        const fullMapping = await this.getFullMapping(actualDeviceId);
        if (fullMapping) {
          this.mappingCache.set(actualDeviceId, fullMapping);
          this.reverseMappingCache.set(fullMapping.simple_id, fullMapping);
        }
        return data.simple_id;
      }

      // 没有找到映射，自动创建新的
      return await this.createNewMapping(actualDeviceId, deviceInfo);

    } catch (error) {
      console.error(' 获取简洁设备ID失败:', error);
      return actualDeviceId; // 返回原始ID作为备用
    }
  }

  /**
   * 创建新的设备映射
   */
  async createNewMapping(actualDeviceId, deviceInfo = {}) {
    try {
      console.log(`🆕 为设备 ${actualDeviceId} 创建新的映射...`);

      // 调用数据库函数自动注册设备
      const { data, error } = await supabase.rpc('auto_register_device', {
        p_actual_device_id: actualDeviceId,
        p_device_name: deviceInfo.device_name,
        p_location_name: deviceInfo.location_name,
        p_latitude: deviceInfo.latitude,
        p_longitude: deviceInfo.longitude
      });

      if (error) {
        console.error(' 自动注册设备失败:', error);
        return actualDeviceId;
      }

      const simpleId = data;
      console.log(` 设备 ${actualDeviceId} 映射为 ${simpleId}`);

      // 更新缓存
      await this.refreshCacheForDevice(actualDeviceId);

      return simpleId;

    } catch (error) {
      console.error(' 创建设备映射失败:', error);
      return actualDeviceId;
    }
  }

  /**
   * 获取完整的映射信息
   */
  async getFullMapping(actualDeviceId) {
    try {
      const { data, error } = await supabase
        .from('device_mapping')
        .select('*')
        .eq('actual_device_id', actualDeviceId)
        .eq('status', 'active')
        .single();

      if (error) {
        console.error(' 获取完整映射信息失败:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error(' 获取完整映射信息异常:', error);
      return null;
    }
  }

  /**
   * 刷新特定设备的缓存
   */
  async refreshCacheForDevice(actualDeviceId) {
    const fullMapping = await this.getFullMapping(actualDeviceId);
    if (fullMapping) {
      this.mappingCache.set(actualDeviceId, fullMapping);
      this.reverseMappingCache.set(fullMapping.simple_id, fullMapping);
    }
  }

  /**
   * 根据简洁ID获取实际设备ID
   */
  getActualDeviceId(simpleId) {
    if (this.reverseMappingCache.has(simpleId)) {
      return this.reverseMappingCache.get(simpleId).actual_device_id;
    }
    return simpleId; // 如果没有映射，返回原始ID
  }

  /**
   * 获取设备的友好名称
   */
  getDeviceName(deviceId) {
    // 先尝试作为实际设备ID查找
    if (this.mappingCache.has(deviceId)) {
      return this.mappingCache.get(deviceId).device_name;
    }
    
    // 再尝试作为简洁ID查找
    if (this.reverseMappingCache.has(deviceId)) {
      return this.reverseMappingCache.get(deviceId).device_name;
    }
    
    return deviceId; // 没有找到映射，返回原始ID
  }

  /**
   * 获取设备的位置信息
   */
  getDeviceLocation(deviceId) {
    let mapping = null;
    
    // 先尝试作为实际设备ID查找
    if (this.mappingCache.has(deviceId)) {
      mapping = this.mappingCache.get(deviceId);
    } else if (this.reverseMappingCache.has(deviceId)) {
      // 再尝试作为简洁ID查找
      mapping = this.reverseMappingCache.get(deviceId);
    }
    
    if (mapping) {
      return {
        location_name: mapping.location_name,
        latitude: mapping.latitude,
        longitude: mapping.longitude,
        device_type: mapping.device_type
      };
    }
    
    return null;
  }

  /**
   * 获取所有设备映射
   */
  async getAllMappings() {
    try {
      const { data, error } = await supabase
        .from('device_mapping_view')
        .select('*')
        .order('simple_id');

      if (error) {
        console.error(' 获取所有设备映射失败:', error);
        return [];
      }

      return data;
    } catch (error) {
      console.error(' 获取所有设备映射异常:', error);
      return [];
    }
  }

  /**
   * 更新设备信息
   */
  async updateDeviceInfo(simpleId, updates) {
    try {
      const { error } = await supabase
        .from('device_mapping')
        .update(updates)
        .eq('simple_id', simpleId);

      if (error) {
        console.error(' 更新设备信息失败:', error);
        return false;
      }

      // 刷新缓存
      const mapping = this.reverseMappingCache.get(simpleId);
      if (mapping) {
        await this.refreshCacheForDevice(mapping.actual_device_id);
      }

      console.log(` 设备 ${simpleId} 信息更新成功`);
      return true;
    } catch (error) {
      console.error(' 更新设备信息异常:', error);
      return false;
    }
  }

  /**
   * 批量转换设备ID（用于前端数据处理）
   */
  async batchConvertToSimpleIds(actualDeviceIds) {
    const result = {};
    
    for (const actualId of actualDeviceIds) {
      const simpleId = await this.getSimpleId(actualId);
      result[actualId] = simpleId;
    }
    
    return result;
  }
}

module.exports = DeviceMapper;
