import common from '@ohos.app.ability.common';
import preferences from '@ohos.data.preferences';

export interface CacheRead<T> {
  value: T;
  savedAt: number;
  fresh: boolean;
}

interface CacheEntry {
  value: string;
  savedAt: number;
}

export class CacheManager {
  private context: common.UIAbilityContext;
  private namespace: string;
  private memory: Map<string, CacheEntry> = new Map<string, CacheEntry>();
  private prefs: preferences.Preferences | null = null;

  constructor(context: common.UIAbilityContext, apiBaseUrl: string, userId: string) {
    this.context = context;
    this.namespace = `${apiBaseUrl}|${userId}`;
  }

  key(path: string, query: string = ''): string {
    return `${this.namespace}|${path}|${query}`;
  }

  async read<T>(key: string, ttlMs: number): Promise<CacheRead<T> | null> {
    const memoryEntry = this.memory.get(key);
    if (memoryEntry) {
      try {
        return {
          value: JSON.parse(memoryEntry.value) as T,
          savedAt: memoryEntry.savedAt,
          fresh: Date.now() - memoryEntry.savedAt <= ttlMs
        };
      } catch {
        this.memory.delete(key);
      }
    }

    try {
      const store = await this.preferences();
      const raw = await store.get(this.storageKey(key), '');
      if (typeof raw !== 'string' || raw.length === 0) return null;
      const entry = JSON.parse(raw) as CacheEntry;
      const value = JSON.parse(entry.value) as T;
      this.memory.set(key, entry);
      return {
        value,
        savedAt: entry.savedAt,
        fresh: Date.now() - entry.savedAt <= ttlMs
      };
    } catch {
      return null;
    }
  }

  async write<T>(key: string, value: T, persist: boolean = true): Promise<void> {
    const entry: CacheEntry = {
      value: JSON.stringify(value),
      savedAt: Date.now()
    };
    this.memory.set(key, entry);
    if (!persist) return;
    try {
      const store = await this.preferences();
      await store.put(this.storageKey(key), JSON.stringify(entry));
      await this.rememberKey(store, this.storageKey(key));
      await store.flush();
    } catch {
      // The in-memory cache remains valid when local snapshot persistence is unavailable.
    }
  }

  async clear(): Promise<void> {
    this.memory.clear();
    try {
      const store = await this.preferences();
      const keys = await this.readKeys(store);
      for (const key of keys) await store.delete(key);
      await store.delete('__cache_keys__');
      await store.flush();
    } catch {
      // Cache cleanup must not prevent logout or changing servers.
    }
  }

  private storageKey(key: string): string {
    return `cache_${this.hash(key)}`;
  }

  private hash(value: string): string {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return Math.abs(hash).toString(16);
  }

  private async preferences(): Promise<preferences.Preferences> {
    if (this.prefs) return this.prefs;
    this.prefs = await preferences.getPreferences(this.context, { name: 'landslide_monitor_cache_v1' });
    return this.prefs;
  }

  private async readKeys(store: preferences.Preferences): Promise<Array<string>> {
    const raw = await store.get('__cache_keys__', '[]');
    if (typeof raw !== 'string') return [];
    try {
      const parsed: Object = JSON.parse(raw) as Object;
      return Array.isArray(parsed) ? parsed as Array<string> : [];
    } catch {
      return [];
    }
  }

  private async rememberKey(store: preferences.Preferences, key: string): Promise<void> {
    const keys = await this.readKeys(store);
    if (!keys.includes(key)) {
      keys.push(key);
      await store.put('__cache_keys__', JSON.stringify(keys.slice(-100)));
    }
  }
}
