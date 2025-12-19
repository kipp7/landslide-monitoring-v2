// 高级缓存系统 - 支持多层缓存、LRU策略、数据预取和智能失效

interface CacheItem<T> {
  data: T;
  timestamp: number;
  ttl: number;
  accessCount: number;
  lastAccess: number;
  priority: number;
  dependencies?: string[];
  validator?: () => Promise<boolean>;
}

interface CacheConfig {
  maxSize: number;
  defaultTTL: number;
  cleanupInterval: number;
  preloadFactor: number; // 在数据过期前多长时间开始预加载 (0-1)
  compressionThreshold: number; // 数据大小超过此值时启用压缩
}

type CacheSetOptions = {
  ttl?: number;
  priority?: number;
  dependencies?: string[];
  validator?: () => Promise<boolean>;
};

class AdvancedCache<T = any> {
  private cache = new Map<string, CacheItem<T>>();
  private accessOrder: string[] = []; // LRU顺序
  private config: CacheConfig;
  private cleanupTimer: NodeJS.Timeout | null = null;
  private preloadQueue = new Set<string>();
  private stats = {
    hits: 0,
    misses: 0,
    evictions: 0,
    preloads: 0,
    compressions: 0
  };

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = {
      maxSize: 1000,
      defaultTTL: 5 * 60 * 1000, // 5分钟
      cleanupInterval: 60 * 1000, // 1分钟
      preloadFactor: 0.8, // 在过期前20%的时间开始预加载
      compressionThreshold: 50 * 1024, // 50KB
      ...config
    };

    this.startCleanupTimer();
  }

  // 设置缓存项
  set(
    key: string, 
    data: T, 
    options: CacheSetOptions = {}
  ): void {
    const now = Date.now();
    const ttl = options.ttl || this.config.defaultTTL;
    
    // 检查是否需要压缩
    let processedData = data;
    const dataSize = this.getDataSize(data);
    if (dataSize > this.config.compressionThreshold) {
      processedData = this.compressData(data);
      this.stats.compressions++;
    }

    const item: CacheItem<T> = {
      data: processedData,
      timestamp: now,
      ttl,
      accessCount: 0,
      lastAccess: now,
      priority: options.priority || 1,
      dependencies: options.dependencies,
      validator: options.validator
    };

    // 如果缓存已满，执行LRU清理
    if (this.cache.size >= this.config.maxSize && !this.cache.has(key)) {
      this.evictLRU();
    }

    this.cache.set(key, item);
    this.updateAccessOrder(key);

    console.log(`💾 缓存设置: ${key} (TTL: ${ttl}ms, 优先级: ${item.priority})`);
  }

  // 获取缓存项
  async get(key: string): Promise<T | null> {
    const item = this.cache.get(key);
    
    if (!item) {
      this.stats.misses++;
      return null;
    }

    const now = Date.now();
    
    // 检查是否过期
    if (now - item.timestamp > item.ttl) {
      this.cache.delete(key);
      this.removeFromAccessOrder(key);
      this.stats.misses++;
      return null;
    }

    // 检查依赖项是否有效
    if (item.dependencies) {
      const hasInvalidDependency = item.dependencies.some(dep => !this.cache.has(dep));
      if (hasInvalidDependency) {
        this.invalidate(key);
        this.stats.misses++;
        return null;
      }
    }

    // 验证数据有效性
    if (item.validator) {
      try {
        const isValid = await item.validator();
        if (!isValid) {
          this.invalidate(key);
          this.stats.misses++;
          return null;
        }
      } catch (error) {
        console.warn(`缓存验证失败: ${key}`, error);
        this.invalidate(key);
        this.stats.misses++;
        return null;
      }
    }

    // 更新访问统计
    item.accessCount++;
    item.lastAccess = now;
    this.updateAccessOrder(key);

    // 检查是否需要预加载
    const timeToExpiry = item.ttl - (now - item.timestamp);
    const preloadThreshold = item.ttl * this.config.preloadFactor;
    
    if (timeToExpiry < preloadThreshold && !this.preloadQueue.has(key)) {
      this.schedulePreload(key);
    }

    this.stats.hits++;
    
    // 解压数据（如果需要）
    const data = this.isCompressed(item.data) ? this.decompressData(item.data) : item.data;
    return data;
  }

  // 删除缓存项
  delete(key: string): boolean {
    const deleted = this.cache.delete(key);
    if (deleted) {
      this.removeFromAccessOrder(key);
      this.preloadQueue.delete(key);
      console.log(`🗑️ 缓存删除: ${key}`);
    }
    return deleted;
  }

  // 使缓存项失效
  invalidate(key: string): void {
    this.delete(key);
    
    // 查找并使依赖此项的其他缓存项失效
    for (const [cacheKey, item] of this.cache) {
      if (item.dependencies?.includes(key)) {
        this.invalidate(cacheKey);
      }
    }
  }

  // 批量使缓存失效
  invalidatePattern(pattern: RegExp): number {
    let count = 0;
    for (const key of this.cache.keys()) {
      if (pattern.test(key)) {
        this.invalidate(key);
        count++;
      }
    }
    console.log(`🔄 批量失效缓存: ${count}个项目`);
    return count;
  }

  // 预加载数据
  async preload(
    key: string, 
    dataLoader: () => Promise<T>,
    options: CacheSetOptions = {}
  ): Promise<void> {
    try {
      console.log(`⚡ 预加载缓存: ${key}`);
      const data = await dataLoader();
      this.set(key, data, options);
      this.stats.preloads++;
      this.preloadQueue.delete(key);
    } catch (error) {
      console.error(`预加载失败: ${key}`, error);
      this.preloadQueue.delete(key);
    }
  }

  // 批量预加载
  async preloadBatch(
    items: Array<{
      key: string;
      loader: () => Promise<T>;
      options?: CacheSetOptions;
    }>
  ): Promise<void> {
    console.log(`⚡ 批量预加载: ${items.length}个项目`);
    
    const promises = items.map(async ({ key, loader, options }) => {
      try {
        const data = await loader();
        this.set(key, data, options);
        this.stats.preloads++;
      } catch (error) {
        console.error(`批量预加载失败: ${key}`, error);
      }
    });

    await Promise.allSettled(promises);
  }

  // 获取或设置缓存项（常用模式）
  async getOrSet(
    key: string,
    dataLoader: () => Promise<T>,
    options: CacheSetOptions = {}
  ): Promise<T> {
    let data = await this.get(key);
    
    if (data === null) {
      console.log(`🔄 缓存未命中，加载数据: ${key}`);
      data = await dataLoader();
      this.set(key, data, options);
    }
    
    return data;
  }

  // 更新缓存项但保持TTL
  update(key: string, data: T): boolean {
    const item = this.cache.get(key);
    if (!item) return false;

    const now = Date.now();
    item.data = this.getDataSize(data) > this.config.compressionThreshold 
      ? this.compressData(data) 
      : data;
    item.lastAccess = now;
    this.updateAccessOrder(key);
    
    console.log(`🔄 缓存更新: ${key}`);
    return true;
  }

  // 获取缓存统计
  getStats() {
    const hitRate = this.stats.hits + this.stats.misses > 0 
      ? (this.stats.hits / (this.stats.hits + this.stats.misses) * 100).toFixed(2)
      : '0.00';

    return {
      ...this.stats,
      hitRate: `${hitRate}%`,
      size: this.cache.size,
      maxSize: this.config.maxSize,
      usage: `${((this.cache.size / this.config.maxSize) * 100).toFixed(1)}%`,
      preloadQueueSize: this.preloadQueue.size
    };
  }

  // 获取缓存项详情
  inspect(key: string) {
    const item = this.cache.get(key);
    if (!item) return null;

    const now = Date.now();
    return {
      key,
      size: this.getDataSize(item.data),
      age: now - item.timestamp,
      ttl: item.ttl,
      timeToExpiry: Math.max(0, item.ttl - (now - item.timestamp)),
      accessCount: item.accessCount,
      priority: item.priority,
      dependencies: item.dependencies,
      isCompressed: this.isCompressed(item.data),
      lastAccess: new Date(item.lastAccess).toISOString()
    };
  }

  // 清空缓存
  clear(): void {
    this.cache.clear();
    this.accessOrder.length = 0;
    this.preloadQueue.clear();
    console.log('🗑️ 缓存已清空');
  }

  // 手动清理过期项
  cleanup(): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, item] of this.cache) {
      if (now - item.timestamp > item.ttl) {
        this.cache.delete(key);
        this.removeFromAccessOrder(key);
        this.preloadQueue.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`🧹 清理过期缓存: ${cleaned}个项目`);
    }

    return cleaned;
  }

  // 销毁缓存实例
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.clear();
    console.log('💥 缓存实例已销毁');
  }

  // 私有方法：LRU清理
  private evictLRU(): void {
    if (this.accessOrder.length === 0) return;

    // 根据优先级和访问时间决定清理顺序
    const sortedKeys = [...this.accessOrder].sort((a, b) => {
      const itemA = this.cache.get(a)!;
      const itemB = this.cache.get(b)!;
      
      // 优先级低的先清理
      if (itemA.priority !== itemB.priority) {
        return itemA.priority - itemB.priority;
      }
      
      // 相同优先级下，最久未访问的先清理
      return itemA.lastAccess - itemB.lastAccess;
    });

    const keyToEvict = sortedKeys[0];
    this.cache.delete(keyToEvict);
    this.removeFromAccessOrder(keyToEvict);
    this.preloadQueue.delete(keyToEvict);
    this.stats.evictions++;
    
    console.log(`🗑️ LRU清理: ${keyToEvict}`);
  }

  // 私有方法：更新访问顺序
  private updateAccessOrder(key: string): void {
    const index = this.accessOrder.indexOf(key);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }
    this.accessOrder.push(key);
  }

  // 私有方法：从访问顺序中移除
  private removeFromAccessOrder(key: string): void {
    const index = this.accessOrder.indexOf(key);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }
  }

  // 私有方法：安排预加载
  private schedulePreload(key: string): void {
    if (!this.preloadQueue.has(key)) {
      this.preloadQueue.add(key);
      console.log(`⏰ 安排预加载: ${key}`);
    }
  }

  // 私有方法：启动清理定时器
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.config.cleanupInterval);
  }

  // 私有方法：获取数据大小
  private getDataSize(data: any): number {
    try {
      return JSON.stringify(data).length;
    } catch {
      return 0;
    }
  }

  // 私有方法：压缩数据（简化版本）
  private compressData(data: T): any {
    try {
      // 这里可以集成真正的压缩算法，例如 LZ4、gzip 等
      // 当前使用简化的 JSON 字符串化
      return {
        __compressed: true,
        data: JSON.stringify(data),
        originalSize: this.getDataSize(data)
      };
    } catch {
      return data;
    }
  }

  // 私有方法：解压数据
  private decompressData(compressedData: any): T {
    try {
      if (this.isCompressed(compressedData)) {
        return JSON.parse(compressedData.data);
      }
      return compressedData;
    } catch {
      return compressedData;
    }
  }

  // 私有方法：检查是否为压缩数据
  private isCompressed(data: any): boolean {
    return data && typeof data === 'object' && data.__compressed === true;
  }
}

// 创建全局缓存实例
export const globalCache = new AdvancedCache({
  maxSize: 2000,
  defaultTTL: 10 * 60 * 1000, // 10分钟
  cleanupInterval: 2 * 60 * 1000, // 2分钟清理
  preloadFactor: 0.75,
  compressionThreshold: 100 * 1024 // 100KB
});

// 设备数据专用缓存
export const deviceDataCache = new AdvancedCache({
  maxSize: 500,
  defaultTTL: 5 * 60 * 1000, // 5分钟
  cleanupInterval: 60 * 1000, // 1分钟清理
  preloadFactor: 0.8,
  compressionThreshold: 50 * 1024 // 50KB
});

// GPS数据专用缓存
export const gpsDataCache = new AdvancedCache({
  maxSize: 1000,
  defaultTTL: 3 * 60 * 1000, // 3分钟
  cleanupInterval: 30 * 1000, // 30秒清理
  preloadFactor: 0.9,
  compressionThreshold: 25 * 1024 // 25KB
});

// 缓存工具函数
export const CacheUtils = {
  // 生成缓存键
  generateKey(prefix: string, ...parts: (string | number)[]): string {
    return `${prefix}:${parts.join(':')}`;
  },

  // 生成设备数据缓存键
  deviceKey(deviceId: string, dataType: string = 'latest'): string {
    return this.generateKey('device', deviceId, dataType);
  },

  // 生成GPS数据缓存键
  gpsKey(deviceId: string, timeRange: string, limit: number = 50): string {
    return this.generateKey('gps', deviceId, timeRange, limit);
  },

  // 生成聚合数据缓存键
  aggregationKey(type: string, ...params: string[]): string {
    return this.generateKey('aggregation', type, ...params);
  },

  // 缓存预热
  async warmupDeviceCache(deviceIds: string[]): Promise<void> {
    console.log(`🔥 预热设备缓存: ${deviceIds.length}个设备`);
    
    const warmupTasks = deviceIds.map(deviceId => ({
      key: this.deviceKey(deviceId),
      loader: async () => {
        const response = await fetch(`/api/device-management-optimized?device_id=${deviceId}`);
        return response.json();
      },
      options: { priority: 2 } // 高优先级
    }));

    await deviceDataCache.preloadBatch(warmupTasks);
  },

  // 获取所有缓存统计
  getAllStats() {
    return {
      global: globalCache.getStats(),
      deviceData: deviceDataCache.getStats(),
      gpsData: gpsDataCache.getStats()
    };
  },

  // 清空所有缓存
  clearAll(): void {
    globalCache.clear();
    deviceDataCache.clear();
    gpsDataCache.clear();
    console.log('🗑️ 所有缓存已清空');
  }
};

export default AdvancedCache;
