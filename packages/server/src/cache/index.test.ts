import { describe, it, expect, beforeEach, vi } from "vitest";
import { Cache } from "./index.js";

describe("Cache", () => {
  let cache: Cache<string>;

  beforeEach(() => {
    cache = new Cache<string>({ ttl: 1000, maxEntries: 5 });
  });

  it("should store and retrieve values", () => {
    cache.set("key1", "value1");
    expect(cache.get("key1")).toBe("value1");
  });

  it("should return undefined for non-existent keys", () => {
    expect(cache.get("nonexistent")).toBeUndefined();
  });

  it("should expire entries after TTL", () => {
    cache.set("key1", "value1", 100);
    
    expect(cache.get("key1")).toBe("value1");
    
    vi.useFakeTimers();
    vi.advanceTimersByTime(150);
    
    expect(cache.get("key1")).toBeUndefined();
    
    vi.useRealTimers();
  });

  it("should check if key exists", () => {
    cache.set("key1", "value1");
    expect(cache.has("key1")).toBe(true);
    expect(cache.has("key2")).toBe(false);
  });

  it("should delete entries", () => {
    cache.set("key1", "value1");
    expect(cache.delete("key1")).toBe(true);
    expect(cache.get("key1")).toBeUndefined();
  });

  it("should clear all entries", () => {
    cache.set("key1", "value1");
    cache.set("key2", "value2");
    cache.clear();
    expect(cache.size()).toBe(0);
  });

  it("should enforce max entries limit", () => {
    cache.set("key1", "value1");
    cache.set("key2", "value2");
    cache.set("key3", "value3");
    cache.set("key4", "value4");
    cache.set("key5", "value5");
    cache.set("key6", "value6");
    
    expect(cache.size()).toBe(5);
  });

  it("should evict least recently used entries when limit reached", () => {
    cache.set("key1", "value1");
    cache.set("key2", "value2");
    cache.set("key3", "value3");
    cache.set("key4", "value4");
    cache.set("key5", "value5");
    
    cache.get("key1");
    cache.get("key2");
    
    cache.set("key6", "value6");
    
    expect(cache.has("key1")).toBe(true);
    expect(cache.has("key2")).toBe(true);
    expect(cache.has("key3")).toBe(false);
    
    cache.set("key7", "value7");
    
    expect(cache.has("key4")).toBe(false);
  });

  it("should provide cache stats", () => {
    cache.set("key1", "value1");
    cache.set("key2", "value2");
    
    const stats = cache.getStats();
    expect(stats.size).toBe(2);
    expect(stats.maxEntries).toBe(5);
    expect(stats.oldestKey).toBe("key1");
    expect(stats.newestKey).toBe("key2");
  });

  it("should support custom TTL for individual entries", () => {
    cache.set("key1", "value1", 5000);
    cache.set("key2", "value2", 100);
    
    vi.useFakeTimers();
    vi.advanceTimersByTime(150);
    
    expect(cache.get("key1")).toBe("value1");
    expect(cache.get("key2")).toBeUndefined();
    
    vi.useRealTimers();
  });
});