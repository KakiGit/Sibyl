export interface CacheOptions {
  ttl?: number;
  maxEntries?: number;
}

export interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class Cache<T> {
  private cache: Map<string, CacheEntry<T>> = new Map();
  private ttl: number;
  private maxEntries: number;

  constructor(options: CacheOptions = {}) {
    this.ttl = options.ttl || 3600000;
    this.maxEntries = options.maxEntries || 100;
  }

  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }
    
    return entry.value;
  }

  set(key: string, value: T, ttl?: number): void {
    if (this.cache.size >= this.maxEntries) {
      this.evictOldest();
    }
    
    const expiresAt = Date.now() + (ttl || this.ttl);
    this.cache.set(key, { value, expiresAt });
  }

  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return false;
    }
    
    return true;
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }

  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestExpiry = Infinity;
    
    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt < oldestExpiry) {
        oldestExpiry = entry.expiresAt;
        oldestKey = key;
      }
    }
    
    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }
}

export const wikiStatsCache = new Cache({ ttl: 300000, maxEntries: 20 });
export const searchCache = new Cache({ ttl: 60000, maxEntries: 50 });
export const synthesisCache = new Cache({ ttl: 3600000, maxEntries: 30 });