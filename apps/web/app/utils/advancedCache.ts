'use client'

import { buildApiUrl, getApiAuthHeaders } from '../../lib/v2Api'

export type CacheOptions = {
  ttl?: number
  priority?: number
  dependencies?: string[]
  validator?: () => Promise<boolean>
}

type CacheItem<T> = {
  data: T
  timestamp: number
  ttl: number
  accessCount: number
  lastAccess: number
  priority: number
  dependencies?: string[]
  validator?: () => Promise<boolean>
}

type CacheConfig = {
  maxSize: number
  defaultTTL: number
  cleanupInterval: number
  preloadFactor: number
  compressionThreshold: number
}

class AdvancedCache<T = any> {
  private cache = new Map<string, CacheItem<T>>()
  private accessOrder: string[] = []
  private config: CacheConfig
  private cleanupTimer: ReturnType<typeof setInterval> | null = null
  private preloadQueue = new Set<string>()
  private stats = { hits: 0, misses: 0, evictions: 0, preloads: 0, compressions: 0 }

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = {
      maxSize: 1000,
      defaultTTL: 5 * 60 * 1000,
      cleanupInterval: 60 * 1000,
      preloadFactor: 0.8,
      compressionThreshold: 50 * 1024,
      ...config,
    }

    this.startCleanupTimer()
  }

  set(key: string, data: T, options: CacheOptions = {}): void {
    const now = Date.now()
    const ttl = options.ttl || this.config.defaultTTL

    let processedData = data
    const dataSize = this.getDataSize(data)
    if (dataSize > this.config.compressionThreshold) {
      processedData = this.compressData(data)
      this.stats.compressions += 1
    }

    const item: CacheItem<T> = {
      data: processedData,
      timestamp: now,
      ttl,
      accessCount: 0,
      lastAccess: now,
      priority: options.priority || 1,
      dependencies: options.dependencies,
      validator: options.validator,
    }

    if (this.cache.size >= this.config.maxSize && !this.cache.has(key)) {
      this.evictLRU()
    }

    this.cache.set(key, item)
    this.updateAccessOrder(key)
  }

  async get(key: string): Promise<T | null> {
    const item = this.cache.get(key)
    if (!item) {
      this.stats.misses += 1
      return null
    }

    const now = Date.now()
    if (now - item.timestamp > item.ttl) {
      this.cache.delete(key)
      this.removeFromAccessOrder(key)
      this.stats.misses += 1
      return null
    }

    if (item.dependencies) {
      const hasInvalidDependency = item.dependencies.some((dep) => !this.cache.has(dep))
      if (hasInvalidDependency) {
        this.invalidate(key)
        this.stats.misses += 1
        return null
      }
    }

    if (item.validator) {
      try {
        const isValid = await item.validator()
        if (!isValid) {
          this.invalidate(key)
          this.stats.misses += 1
          return null
        }
      } catch {
        this.invalidate(key)
        this.stats.misses += 1
        return null
      }
    }

    item.accessCount += 1
    item.lastAccess = now
    this.updateAccessOrder(key)

    const timeToExpiry = item.ttl - (now - item.timestamp)
    const preloadThreshold = item.ttl * this.config.preloadFactor
    if (timeToExpiry < preloadThreshold && !this.preloadQueue.has(key)) {
      this.schedulePreload(key)
    }

    this.stats.hits += 1
    const data = this.isCompressed(item.data) ? this.decompressData(item.data) : item.data
    return data
  }

  delete(key: string): boolean {
    const deleted = this.cache.delete(key)
    if (deleted) {
      this.removeFromAccessOrder(key)
      this.preloadQueue.delete(key)
    }
    return deleted
  }

  invalidate(key: string): void {
    this.delete(key)
    for (const [cacheKey, item] of this.cache) {
      if (item.dependencies?.includes(key)) this.invalidate(cacheKey)
    }
  }

  invalidatePattern(pattern: RegExp): number {
    let count = 0
    for (const key of this.cache.keys()) {
      if (pattern.test(key)) {
        this.invalidate(key)
        count += 1
      }
    }
    return count
  }

  async preload(key: string, dataLoader: () => Promise<T>, options: CacheOptions = {}): Promise<void> {
    try {
      const data = await dataLoader()
      this.set(key, data, options)
      this.stats.preloads += 1
      this.preloadQueue.delete(key)
    } catch {
      this.preloadQueue.delete(key)
    }
  }

  async preloadBatch(items: Array<{ key: string; loader: () => Promise<T>; options?: CacheOptions }>): Promise<void> {
    const promises = items.map(async ({ key, loader, options }) => {
      try {
        const data = await loader()
        this.set(key, data, options ?? {})
        this.stats.preloads += 1
      } catch {
        // ignore
      }
    })

    await Promise.allSettled(promises)
  }

  async getOrSet(key: string, dataLoader: () => Promise<T>, options: CacheOptions = {}): Promise<T> {
    let data = await this.get(key)
    if (data === null) {
      data = await dataLoader()
      this.set(key, data, options)
    }
    return data
  }

  update(key: string, data: T): boolean {
    const item = this.cache.get(key)
    if (!item) return false

    item.data = this.getDataSize(data) > this.config.compressionThreshold ? this.compressData(data) : data
    item.lastAccess = Date.now()
    this.updateAccessOrder(key)
    return true
  }

  getStats() {
    const total = this.stats.hits + this.stats.misses
    const hitRate = total > 0 ? ((this.stats.hits / total) * 100).toFixed(2) : '0.00'
    return {
      ...this.stats,
      hitRate: `${hitRate}%`,
      size: this.cache.size,
      maxSize: this.config.maxSize,
      usage: `${((this.cache.size / this.config.maxSize) * 100).toFixed(1)}%`,
      preloadQueueSize: this.preloadQueue.size,
    }
  }

  clear(): void {
    this.cache.clear()
    this.accessOrder.length = 0
    this.preloadQueue.clear()
  }

  cleanup(): number {
    const now = Date.now()
    let cleaned = 0

    for (const [key, item] of this.cache) {
      if (now - item.timestamp > item.ttl) {
        this.cache.delete(key)
        this.removeFromAccessOrder(key)
        this.preloadQueue.delete(key)
        cleaned += 1
      }
    }

    return cleaned
  }

  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = null
    }
    this.clear()
  }

  private evictLRU(): void {
    if (this.accessOrder.length === 0) return

    const sortedKeys = [...this.accessOrder].sort((a, b) => {
      const itemA = this.cache.get(a)!
      const itemB = this.cache.get(b)!
      if (itemA.priority !== itemB.priority) return itemA.priority - itemB.priority
      return itemA.lastAccess - itemB.lastAccess
    })

    const keyToEvict = sortedKeys[0]
    this.cache.delete(keyToEvict)
    this.removeFromAccessOrder(keyToEvict)
    this.preloadQueue.delete(keyToEvict)
    this.stats.evictions += 1
  }

  private updateAccessOrder(key: string): void {
    const index = this.accessOrder.indexOf(key)
    if (index > -1) this.accessOrder.splice(index, 1)
    this.accessOrder.push(key)
  }

  private removeFromAccessOrder(key: string): void {
    const index = this.accessOrder.indexOf(key)
    if (index > -1) this.accessOrder.splice(index, 1)
  }

  private schedulePreload(key: string): void {
    this.preloadQueue.add(key)
  }

  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup()
    }, this.config.cleanupInterval)
  }

  private getDataSize(data: any): number {
    try {
      return JSON.stringify(data).length
    } catch {
      return 0
    }
  }

  private compressData(data: T): any {
    try {
      return { __compressed: true, data: JSON.stringify(data), originalSize: this.getDataSize(data) }
    } catch {
      return data
    }
  }

  private decompressData(compressedData: any): T {
    try {
      if (this.isCompressed(compressedData)) return JSON.parse(compressedData.data)
      return compressedData
    } catch {
      return compressedData
    }
  }

  private isCompressed(data: any): boolean {
    return data && typeof data === 'object' && data.__compressed === true
  }
}

export const globalCache = new AdvancedCache({
  maxSize: 2000,
  defaultTTL: 10 * 60 * 1000,
  cleanupInterval: 2 * 60 * 1000,
  preloadFactor: 0.75,
  compressionThreshold: 100 * 1024,
})

export const deviceDataCache = new AdvancedCache({
  maxSize: 500,
  defaultTTL: 5 * 60 * 1000,
  cleanupInterval: 60 * 1000,
  preloadFactor: 0.8,
  compressionThreshold: 50 * 1024,
})

export const gpsDataCache = new AdvancedCache({
  maxSize: 1000,
  defaultTTL: 3 * 60 * 1000,
  cleanupInterval: 30 * 1000,
  preloadFactor: 0.9,
  compressionThreshold: 25 * 1024,
})

export const CacheUtils = {
  generateKey(prefix: string, ...parts: (string | number)[]): string {
    return `${prefix}:${parts.join(':')}`
  },

  deviceKey(deviceId: string, dataType: string = 'latest'): string {
    return this.generateKey('device', deviceId, dataType)
  },

  gpsKey(deviceId: string, timeRange: string, limit: number = 50): string {
    return this.generateKey('gps', deviceId, timeRange, limit)
  },

  aggregationKey(type: string, ...params: string[]): string {
    return this.generateKey('aggregation', type, ...params)
  },

  async warmupDeviceCache(deviceIds: string[]): Promise<void> {
    const headers = { ...getApiAuthHeaders(), Accept: 'application/json' }
    await deviceDataCache.preloadBatch(
      deviceIds.map((deviceId) => ({
        key: this.deviceKey(deviceId),
        loader: async () => {
          const url = new URL(buildApiUrl('/api/device-management'), window.location.origin)
          url.searchParams.set('device_id', deviceId)
          const resp = await fetch(url.toString(), { headers, cache: 'no-store' })
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
          const json = (await resp.json()) as any
          return json?.data ?? json
        },
        options: { priority: 2 },
      })),
    )
  },

  getAllStats() {
    return {
      global: globalCache.getStats(),
      deviceData: deviceDataCache.getStats(),
      gpsData: gpsDataCache.getStats(),
    }
  },

  clearAll(): void {
    globalCache.clear()
    deviceDataCache.clear()
    gpsDataCache.clear()
  },
}

export default AdvancedCache

