import { logger } from '@/utils/logger';
export class IntelligentCacheManager {
    private cache = new Map<string, { data: unknown; timestamp: number; accessCount: number; size: number }>();
    private accessOrder = new Array<string>();
    private maxSize = 50 * 1024 * 1024; // 50MB max cache size
    private currentSize = 0;

    private stats = {
        hits: 0,
        misses: 0,
        evictions: 0,
        sizeReductions: 0
    };

    async get(key: string, fetcher: () => Promise<unknown>, sizeEstimator?: (data: unknown) => number): Promise<unknown> {
        const cached = this.cache.get(key);
        if (cached) {
            cached.accessCount++;
            cached.timestamp = Date.now();
            this.updateAccessOrder(key);
            this.stats.hits++;
            logger.log(`[CacheManager] Cache hit for ${key} (size: ${(cached.size / 1024).toFixed(1)}KB)`);
            return cached.data;
        }

        this.stats.misses++;
        try {
            const data = await fetcher();
            const estimatedSize = sizeEstimator ? sizeEstimator(data) : this.estimateSize(data);
            await this.store(key, data, estimatedSize);
            logger.log(`[CacheManager] Cache miss for ${key}, loaded and cached (${(estimatedSize / 1024).toFixed(1)}KB)`);
            return data;
        } catch (error) {
            logger.warn(`[CacheManager] Failed to load ${key}:`, error);
            throw error;
        }
    }

    private async store(key: string, data: unknown, size: number): Promise<void> {
        if (this.currentSize + size > this.maxSize) {
            await this.evictToFit(size);
        }

        this.cache.set(key, {
            data,
            timestamp: Date.now(),
            accessCount: 1,
            size
        });
        this.currentSize += size;
        this.updateAccessOrder(key);
        logger.log(`[CacheManager] Stored ${key} in cache. Total cached: ${this.cache.size} items, ${(this.currentSize / 1024 / 1024).toFixed(1)}MB`);
    }

    private updateAccessOrder(key: string): void {
        const index = this.accessOrder.indexOf(key);
        if (index > -1) {
            this.accessOrder.splice(index, 1);
        }
        this.accessOrder.push(key);
    }

    private async evictToFit(neededSpace: number): Promise<void> {
        const itemsToEvict: string[] = [];
        let spaceToFree = neededSpace;

        while (this.currentSize + spaceToFree > this.maxSize && this.cache.size > 0 && this.accessOrder.length > 0) {
            const keyToEvict = this.accessOrder.shift();
            if (keyToEvict) {
                itemsToEvict.push(keyToEvict);
                const evicted = this.cache.get(keyToEvict);
                if (evicted) {
                    spaceToFree -= evicted.size;
                }
            }
        }

        await Promise.all(itemsToEvict.map(async (key) => {
            const evicted = this.cache.get(key);
            if (evicted) {
                await this.safeDispose(evicted.data);
                this.currentSize -= evicted.size;
                this.cache.delete(key);
                this.stats.evictions++;
                logger.log(`[CacheManager] Evicted ${key} to free ${(evicted.size / 1024).toFixed(1)}KB`);
            }
        }));
    }

    private async safeDispose(data: unknown): Promise<void> {
        try {
            if (data && typeof data === 'object' && 'dispose' in data) {
                const disposable = data as { dispose: () => void | Promise<void> };
                if (typeof disposable.dispose === 'function') {
                    const result = disposable.dispose();
                    if (result instanceof Promise) {
                        await result;
                    }
                }
            }
        } catch (error) {
            logger.warn('[CacheManager] Error disposing cached data:', error);
        }
    }

    private estimateSize(data: unknown): number {
        if (data instanceof ArrayBuffer || data instanceof Uint8Array || data instanceof Uint16Array || data instanceof Float32Array) {
            return (data as { byteLength: number }).byteLength;
        }
        if (data && typeof data === 'object') {
            return JSON.stringify(data).length * 2;
        }
        return 1024;
    }

    async maintenanceCleanup(): Promise<void> {
        const now = Date.now();
        const maxAge = 10 * 60 * 1000;
        const itemsToRemove: string[] = [];

        for (const [key, value] of this.cache.entries()) {
            if (now - value.timestamp > maxAge) {
                itemsToRemove.push(key);
            }
        }

        await Promise.all(itemsToRemove.map(async (key) => {
            const item = this.cache.get(key);
            if (item) {
                await this.safeDispose(item.data);
                this.currentSize -= item.size;
                this.cache.delete(key);
                const index = this.accessOrder.indexOf(key);
                if (index > -1) this.accessOrder.splice(index, 1);
                this.stats.evictions++;
            }
        }));

        logger.log(`[CacheManager] Maintenance cleanup: removed ${itemsToRemove.length} items`);
    }

    getStats() {
        const hitRate = (this.stats.hits + this.stats.misses) > 0 ?
            (this.stats.hits / (this.stats.hits + this.stats.misses)) * 100 : 0;

        return {
            ...this.stats,
            hitRate: `${hitRate.toFixed(1)}%`,
            itemsCached: this.cache.size,
            currentSizeMB: (this.currentSize / 1024 / 1024).toFixed(2),
            maxSizeMB: (this.maxSize / 1024 / 1024).toFixed(2)
        };
    }

    clear(): Promise<void> {
        return new Promise((resolve) => {
            const disposePromises = Array.from(this.cache.values()).map(item =>
                this.safeDispose(item.data)
            );

            Promise.all(disposePromises).then(() => {
                this.cache.clear();
                this.accessOrder = [];
                this.currentSize = 0;
                this.stats = { hits: 0, misses: 0, evictions: 0, sizeReductions: 0 };
                logger.log('[CacheManager] Cache cleared');
                resolve();
            });
        });
    }
}
