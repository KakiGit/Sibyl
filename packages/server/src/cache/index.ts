export interface CacheOptions {
  ttl?: number;
  maxEntries?: number;
}

export interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  lastAccessed: number;
}

export class Cache<T> {
  private cache: Map<string, CacheEntry<T>> = new Map();
  private ttl: number;
  private maxEntries: number;
  private accessOrder: string[] = [];

  constructor(options: CacheOptions = {}) {
    this.ttl = options.ttl || 3600000;
    this.maxEntries = options.maxEntries || 100;
  }

  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.removeFromAccessOrder(key);
      return undefined;
    }
    
    entry.lastAccessed = Date.now();
    this.updateAccessOrder(key);
    
    return entry.value;
  }

  set(key: string, value: T, ttl?: number): void {
    if (this.cache.has(key)) {
      this.removeFromAccessOrder(key);
    } else if (this.cache.size >= this.maxEntries) {
      this.evictLRU();
    }
    
    const now = Date.now();
    const expiresAt = now + (ttl || this.ttl);
    this.cache.set(key, { value, expiresAt, lastAccessed: now });
    this.accessOrder.push(key);
  }

  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.removeFromAccessOrder(key);
      return false;
    }
    
    return true;
  }

  delete(key: string): boolean {
    this.removeFromAccessOrder(key);
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
    this.accessOrder = [];
  }

  size(): number {
    return this.cache.size;
  }

  getStats(): { size: number; maxEntries: number; oldestKey: string | null; newestKey: string | null } {
    this.cleanupExpired();
    
    return {
      size: this.cache.size,
      maxEntries: this.maxEntries,
      oldestKey: this.accessOrder[0] || null,
      newestKey: this.accessOrder[this.accessOrder.length - 1] || null,
    };
  }

  private updateAccessOrder(key: string): void {
    this.removeFromAccessOrder(key);
    this.accessOrder.push(key);
  }

  private removeFromAccessOrder(key: string): void {
    const index = this.accessOrder.indexOf(key);
    if (index !== -1) {
      this.accessOrder.splice(index, 1);
    }
  }

  private evictLRU(): void {
    this.cleanupExpired();
    
    if (this.cache.size >= this.maxEntries && this.accessOrder.length > 0) {
      const lruKey = this.accessOrder[0];
      this.cache.delete(lruKey);
      this.accessOrder.shift();
    }
  }

  private cleanupExpired(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];
    
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        expiredKeys.push(key);
      }
    }
    
    for (const key of expiredKeys) {
      this.cache.delete(key);
      this.removeFromAccessOrder(key);
    }
  }
}

export const wikiStatsCache = new Cache({ ttl: 300000, maxEntries: 20 });
export const searchCache = new Cache({ ttl: 60000, maxEntries: 50 });
export const synthesisCache = new Cache({ ttl: 3600000, maxEntries: 30 });