/**
 * Advanced Service Worker Cache Manager
 */

import type { CacheConfig, CacheEntry } from "./types";

export class AdvancedCacheManager {
  private configs = new Map<string, CacheConfig>();
  private entries = new Map<string, Map<string, CacheEntry>>();
  private totalCacheSize = 0;
  private maxTotalSize = 100 * 1024 * 1024;

  constructor() {
    this.initializeCacheConfigs();
  }

  private initializeCacheConfigs(): void {
    this.addCache("critical", {
      name: "boby-critical-v1",
      maxAge: 2592000,
      maxEntries: 50,
      strategy: "cache-first",
      priority: 10,
    });
    this.addCache("assets", {
      name: "boby-assets-v1",
      maxAge: 604800,
      maxEntries: 200,
      strategy: "stale-while-revalidate",
      priority: 7,
    });
    this.addCache("api", {
      name: "boby-api-v1",
      maxAge: 300,
      maxEntries: 100,
      strategy: "network-first",
      priority: 3,
    });
    this.addCache("static", {
      name: "boby-static-v1",
      maxAge: 7776000,
      maxEntries: 300,
      strategy: "cache-first",
      priority: 5,
    });
  }

  private addCache(type: string, config: CacheConfig): void {
    this.configs.set(type, config);
    this.entries.set(type, new Map());
  }

  private getCacheType(url: string): string {
    // NEVER cache sensitive authentication or session endpoints
    if (
      url.includes("/api/auth/session") ||
      url.includes("/api/auth/logout") ||
      url.includes("/api/auth/csrf")
    )
      return "none";

    if (url.includes("/api/")) return "api";
    if (url.includes("/models/") || url.includes("/textures/") || url.includes("/audio/"))
      return "assets";
    if (url.includes("/libs/") || url.includes(".js") || url.includes(".css")) return "critical";
    if (url.includes(".png") || url.includes(".jpg") || url.includes(".webp")) return "static";
    return "assets";
  }

  public async handleRequest(request: Request): Promise<Response | null> {
    if (typeof window === "undefined") return null;

    const type = this.getCacheType(request.url);
    if (type === "none") return null;

    const config = this.configs.get(type);
    if (!config) return null;

    const cache = await caches.open(config.name);
    const key = request.url;
    const cached = await cache.match(request);

    const ctx = { req: request, cached, type, key, config };

    switch (config.strategy) {
      case "cache-first":
        return this.strategyCacheFirst(ctx);
      case "network-first":
        return this.strategyNetworkFirst(ctx);
      case "stale-while-revalidate":
        return this.strategySWR(ctx);
      default:
        return null;
    }
  }

  private strategyCacheFirst(ctx: {
    req: Request;
    cached: Response | undefined;
    type: string;
    key: string;
    config: CacheConfig;
  }): Promise<Response | null> {
    if (ctx.cached && !this.isEntryExpired(ctx.type, ctx.key, ctx.config.maxAge)) {
      this.updateAccessStats(ctx.type, ctx.key);
      return Promise.resolve(ctx.cached);
    }
    return this.fetchAndStore(ctx.req, ctx.type, ctx.key, ctx.cached);
  }

  private async strategyNetworkFirst(ctx: {
    req: Request;
    cached: Response | undefined;
    type: string;
    key: string;
  }): Promise<Response | null> {
    try {
      const net = await fetch(ctx.req);
      if (net.ok) {
        await this.storeInCache(ctx.type, ctx.key, net.clone());
        return net;
      }

      // SECURITY FIX: If server returns Unauthorized or Forbidden, DO NOT fall back to cache.
      // This prevents stale session loops.
      if (net.status === 401 || net.status === 403) {
        return net;
      }

      return ctx.cached || null;
    } catch {
      // Only fall back to cache on actual network failures (offline)
      return ctx.cached || null;
    }
  }

  private strategySWR(ctx: {
    req: Request;
    cached: Response | undefined;
    type: string;
    key: string;
    config: CacheConfig;
  }): Promise<Response | null> {
    if (ctx.cached && !this.isEntryExpired(ctx.type, ctx.key, ctx.config.maxAge)) {
      this.updateAccessStats(ctx.type, ctx.key);
      fetch(ctx.req)
        .then(async res => {
          if (res.ok) {
            await this.storeInCache(ctx.type, ctx.key, res);
          }
        })
        .catch(() => {});
      return Promise.resolve(ctx.cached);
    }
    return this.fetchAndStore(ctx.req, ctx.type, ctx.key, ctx.cached);
  }

  private async fetchAndStore(
    req: Request,
    type: string,
    key: string,
    fallback?: Response
  ): Promise<Response | null> {
    try {
      const res = await fetch(req);
      if (res.ok) {
        await this.storeInCache(type, key, res.clone());
        return res;
      }
      return fallback || null;
    } catch {
      return fallback || null;
    }
  }

  private async storeInCache(type: string, key: string, res: Response): Promise<void> {
    const config = this.configs.get(type);
    if (!config || typeof window === "undefined") return;

    const size = parseInt(res.headers.get("content-length") || "1024", 10);
    await this.enforceCacheLimits(type);

    const entries = this.entries.get(type)!;
    entries.set(key, {
      url: key,
      response: res.clone(),
      timestamp: Date.now(),
      accessCount: 1,
      size,
    });
    this.totalCacheSize += size;

    const cache = await caches.open(config.name);
    await cache.put(key, res);
  }

  private async enforceCacheLimits(type: string): Promise<void> {
    const config = this.configs.get(type);
    if (!config || typeof window === "undefined") return;

    await this.evictExpired(type, config.maxAge);
    await this.evictLRU(type, config.maxEntries);
    await this.evictGlobalLRU();
  }

  private async evictExpired(type: string, maxAge: number): Promise<void> {
    const entries = this.entries.get(type)!;
    const config = this.configs.get(type);
    if (!config) return;

    const cache = await caches.open(config.name);
    const now = Date.now();
    const toDelete: string[] = [];

    for (const [key, entry] of entries) {
      if (now - entry.timestamp > maxAge * 1000) {
        toDelete.push(key);
      }
    }

    const deletions = toDelete.map(async key => {
      const entry = entries.get(key);
      if (entry) {
        this.totalCacheSize -= entry.size;
        entries.delete(key);
        await cache.delete(key);
      }
    });

    await Promise.all(deletions);
  }

  private async evictLRU(type: string, max: number): Promise<void> {
    const entries = this.entries.get(type)!;
    const config = this.configs.get(type);
    if (!config || entries.size < max) return;

    const toEvict: string[] = [];
    const numToEvict = entries.size - max + 1;

    const sortedKeys = Array.from(entries.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp)
      .map(([key]) => key);

    for (let i = 0; i < numToEvict && i < sortedKeys.length; i++) {
      const key = sortedKeys[i];
      if (key) toEvict.push(key);
    }

    const cache = await caches.open(config.name);
    await Promise.all(
      toEvict.map(async key => {
        const entry = entries.get(key);
        if (entry) {
          this.totalCacheSize -= entry.size;
          entries.delete(key);
          await cache.delete(key);
        }
      })
    );
  }

  private async evictGlobalLRU(): Promise<void> {
    if (this.totalCacheSize < this.maxTotalSize) return;

    const allEntries: { type: string; key: string; size: number; timestamp: number }[] = [];
    for (const [type, entries] of this.entries) {
      for (const [key, entry] of entries) {
        allEntries.push({ type, key, size: entry.size, timestamp: entry.timestamp });
      }
    }

    allEntries.sort((a, b) => a.timestamp - b.timestamp);

    const toEvict: { type: string; key: string }[] = [];
    let projectedSize = this.totalCacheSize;
    let idx = 0;

    while (projectedSize >= this.maxTotalSize && idx < allEntries.length) {
      const item = allEntries[idx++];
      if (item) {
        toEvict.push({ type: item.type, key: item.key });
        projectedSize -= item.size;
      }
    }

    await Promise.all(
      toEvict.map(async ({ type, key }) => {
        const entries = this.entries.get(type);
        const entry = entries?.get(key);
        if (entry) {
          this.totalCacheSize -= entry.size;
          entries?.delete(key);
          const cacheName = this.configs.get(type)?.name;
          if (cacheName) {
            const cache = await caches.open(cacheName);
            await cache.delete(key);
          }
        }
      })
    );
  }

  private isEntryExpired(type: string, key: string, maxAge: number): boolean {
    const entry = this.entries.get(type)?.get(key);
    return entry ? Date.now() - entry.timestamp > maxAge * 1000 : true;
  }

  private updateAccessStats(type: string, key: string): void {
    const entry = this.entries.get(type)?.get(key);
    if (entry) {
      entry.accessCount++;
      entry.timestamp = Date.now();
    }
  }

  public getCacheStats() {
    const stats: Record<string, unknown> = {
      totalSize: this.totalCacheSize,
      maxTotalSize: this.maxTotalSize,
    };
    for (const [type, config] of this.configs) {
      const entries = this.entries.get(type);
      stats[type] = {
        config,
        entries: entries?.size || 0,
        size: Array.from(entries?.values() || []).reduce((s, e) => s + e.size, 0),
      };
    }
    return stats;
  }

  public async clearAllCaches(): Promise<void> {
    if (typeof window === "undefined") return;
    const configs = Array.from(this.configs.values());
    await Promise.all(configs.map(config => caches.delete(config.name)));

    this.entries.clear();
    this.totalCacheSize = 0;
    for (const type of this.configs.keys()) {
      this.entries.set(type, new Map());
    }
  }
}
