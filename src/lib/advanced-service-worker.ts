// Advanced Service Worker with Intelligent Caching Strategies
import { logger } from 'utils/logger';
// Optimized for Boby's World performance and offline capabilities

interface CacheConfig {
    name: string;
    maxAge: number; // seconds
    maxEntries: number;
    strategy: 'cache-first' | 'network-first' | 'stale-while-revalidate';
    priority: number; // Higher priority = more important
}

interface CacheEntry {
    url: string;
    response: Response;
    timestamp: number;
    accessCount: number;
    size: number; // bytes
}

class AdvancedCacheManager {
    private caches = new Map<string, CacheConfig>();
    private cacheEntries = new Map<string, Map<string, CacheEntry>>();
    private totalCacheSize = 0;
    private maxTotalSize = 100 * 1024 * 1024; // 100MB total cache limit

    constructor() {
        this.initializeCacheConfigs();
    }

    private initializeCacheConfigs(): void {
        // Critical assets - cached aggressively
        this.addCache('critical', {
            name: 'boby-critical-v1',
            maxAge: 60 * 60 * 24 * 30, // 30 days
            maxEntries: 50,
            strategy: 'cache-first',
            priority: 10,
        });

        // Game assets - balanced caching
        this.addCache('assets', {
            name: 'boby-assets-v1',
            maxAge: 60 * 60 * 24 * 7, // 7 days
            maxEntries: 200,
            strategy: 'stale-while-revalidate',
            priority: 7,
        });

        // API responses - short-lived
        this.addCache('api', {
            name: 'boby-api-v1',
            maxAge: 60 * 5, // 5 minutes
            maxEntries: 100,
            strategy: 'network-first',
            priority: 3,
        });

        // Static resources - long-term
        this.addCache('static', {
            name: 'boby-static-v1',
            maxAge: 60 * 60 * 24 * 90, // 90 days
            maxEntries: 300,
            strategy: 'cache-first',
            priority: 5,
        });
    }

    private addCache(type: string, config: CacheConfig): void {
        this.caches.set(type, config);
        this.cacheEntries.set(type, new Map());
    }

    // Determine cache type based on URL
    private getCacheType(url: string): string {
        if (url.includes('/api/')) return 'api';
        if (url.includes('/models/') || url.includes('/textures/') || url.includes('/audio/')) return 'assets';
        if (url.includes('/libs/') || url.includes('.js') || url.includes('.css')) return 'critical';
        if (url.includes('.png') || url.includes('.jpg') || url.includes('.webp')) return 'static';

        return 'assets'; // default
    }

    // Intelligent caching based on request patterns
    async handleRequest(request: Request): Promise<Response | null> {
        const url = request.url;
        const cacheType = this.getCacheType(url);
        const config = this.caches.get(cacheType);

        if (!config) return null;

        if (typeof window === 'undefined') return null;
        const cache = await caches.open(config.name);
        const cacheKey = this.getCacheKey(request);

        // Check cache first
        const cachedResponse = await cache.match(request);
        const now = Date.now();

        // Handle different caching strategies
        switch (config.strategy) {
            case 'cache-first':
                if (cachedResponse) {
                    const entry = this.cacheEntries.get(cacheType)?.get(cacheKey);
                    if (entry && !this.isExpired(entry, config.maxAge)) {
                        this.updateAccessStats(cacheType, cacheKey);
                        return cachedResponse;
                    }
                }
                // Fall through to network
                break;

            case 'network-first':
                try {
                    const networkResponse = await fetch(request);
                    if (networkResponse.ok) {
                        await this.storeInCache(cacheType, cacheKey, networkResponse.clone());
                        return networkResponse;
                    }
                } catch (error) {
                    // Network failed, try cache as fallback
                    if (cachedResponse) {
                        return cachedResponse;
                    }
                }
                break;

            case 'stale-while-revalidate':
                if (cachedResponse) {
                    // Return cached version immediately
                    const entry = this.cacheEntries.get(cacheType)?.get(cacheKey);
                    if (entry && !this.isExpired(entry, config.maxAge)) {
                        this.updateAccessStats(cacheType, cacheKey);

                        // Revalidate in background
                        fetch(request).then(async (freshResponse) => {
                            if (freshResponse.ok) {
                                await this.storeInCache(cacheType, cacheKey, freshResponse);
                            }
                        }).catch(() => {
                            // Background revalidation failed, ignore
                        });

                        return cachedResponse;
                    }
                }
                // Fall through to network
                break;
        }

        // Network request
        try {
            const response = await fetch(request);
            if (response.ok) {
                await this.storeInCache(cacheType, cacheKey, response.clone());
                return response;
            }
        } catch (error) {
            // Network failed, try cache as last resort
            if (cachedResponse) {
                return cachedResponse;
            }
        }

        return null;
    }

    private async storeInCache(cacheType: string, cacheKey: string, response: Response): Promise<void> {
        const config = this.caches.get(cacheType);
        if (!config) return;

        if (typeof window === 'undefined') return;
        const cache = await caches.open(config.name);
        const entries = this.cacheEntries.get(cacheType)!;

        // Calculate response size (approximation)
        const contentLength = response.headers.get('content-length');
        const size = contentLength ? parseInt(contentLength, 10) : 1024; // Default 1KB

        // Check cache limits
        await this.enforceCacheLimits(cacheType);

        // Store in cache
        const entry: CacheEntry = {
            url: cacheKey,
            response: response.clone(),
            timestamp: Date.now(),
            accessCount: 1,
            size,
        };

        entries.set(cacheKey, entry);
        this.totalCacheSize += size;

        await cache.put(cacheKey, response);
    }

    private async enforceCacheLimits(cacheType: string): Promise<void> {
        const config = this.caches.get(cacheType);
        if (!config) return;

        const entries = this.cacheEntries.get(cacheType)!;
        if (typeof window === 'undefined') return;
        const cache = await caches.open(config.name);

        // Remove expired entries
        const now = Date.now();
        const expiredKeys: string[] = [];

        for (const [key, entry] of entries) {
            if (this.isExpired(entry, config.maxAge)) {
                expiredKeys.push(key);
            }
        }

        for (const key of expiredKeys) {
            const entry = entries.get(key);
            if (entry) {
                this.totalCacheSize -= entry.size;
                entries.delete(key);
                await cache.delete(key);
            }
        }

        // Enforce max entries limit (LRU eviction)
        while (entries.size >= config.maxEntries) {
            const lruKey = this.getLeastRecentlyUsed(entries);
            if (lruKey) {
                const entry = entries.get(lruKey);
                if (entry) {
                    this.totalCacheSize -= entry.size;
                    entries.delete(lruKey);
                    await cache.delete(lruKey);
                }
            }
        }

        // Enforce total cache size limit
        while (this.totalCacheSize >= this.maxTotalSize) {
            const evictedKey = this.getGlobalLRUKey();
            if (evictedKey) {
                const [type, key] = evictedKey.split(':', 2);
                const typeEntries = this.cacheEntries.get(type);
                const entry = typeEntries?.get(key);

                if (entry) {
                    this.totalCacheSize -= entry.size;
                    typeEntries!.delete(key);
                    const typeConfig = this.caches.get(type);
                    if (typeConfig) {
                        if (typeof window === 'undefined') break;
                        const cache = await caches.open(typeConfig.name);
                        await cache.delete(key);
                    }
                }
            } else {
                break;
            }
        }
    }

    private isExpired(entry: CacheEntry, maxAge: number): boolean {
        return (Date.now() - entry.timestamp) > (maxAge * 1000);
    }

    private updateAccessStats(cacheType: string, cacheKey: string): void {
        const entries = this.cacheEntries.get(cacheType);
        const entry = entries?.get(cacheKey);

        if (entry) {
            entry.accessCount++;
            entry.timestamp = Date.now();
        }
    }

    private getLeastRecentlyUsed(entries: Map<string, CacheEntry>): string | null {
        let lruKey: string | null = null;
        let oldestAccess = Date.now();

        for (const [key, entry] of entries) {
            if (entry.timestamp < oldestAccess) {
                oldestAccess = entry.timestamp;
                lruKey = key;
            }
        }

        return lruKey;
    }

    private getGlobalLRUKey(): string | null {
        let lruKey: string | null = null;
        let oldestAccess = Date.now();

        for (const [type, entries] of this.cacheEntries) {
            for (const [key, entry] of entries) {
                if (entry.timestamp < oldestAccess) {
                    oldestAccess = entry.timestamp;
                    lruKey = `${type}:${key}`;
                }
            }
        }

        return lruKey;
    }

    private getCacheKey(request: Request): string {
        // Create a unique key based on URL and important headers
        return request.url;
    }

    // Get cache statistics
    getCacheStats() {
        const stats: any = {
            totalSize: this.totalCacheSize,
            maxTotalSize: this.maxTotalSize,
        };

        for (const [type, config] of this.caches) {
            const entries = this.cacheEntries.get(type);
            stats[type] = {
                config,
                entries: entries?.size || 0,
                size: Array.from(entries?.values() || []).reduce((sum, entry) => sum + entry.size, 0),
            };
        }

        return stats;
    }

    // Clear all caches
    async clearAllCaches(): Promise<void> {
        if (typeof window === 'undefined') return;
        const clearPromises: Promise<boolean>[] = [];

        for (const config of this.caches.values()) {
            clearPromises.push(caches.delete(config.name));
        }

        await Promise.all(clearPromises);

        // Reset internal state
        this.cacheEntries.clear();
        this.totalCacheSize = 0;

        for (const [type] of this.caches) {
            this.cacheEntries.set(type, new Map());
        }

        logger.log('[AdvancedCacheManager] All caches cleared');
    }
}

// Background sync manager for offline operations
class BackgroundSyncManager {
    private pendingOperations: Array<{
        id: string;
        operation: () => Promise<void>;
        priority: number;
        timestamp: number;
    }> = [];

    constructor() {
        this.initializeBackgroundSync();
    }

    private initializeBackgroundSync(): void {
        // Only run on client-side
        if (typeof window === 'undefined' || typeof navigator === 'undefined') return;

        // Register background sync if available
        if ('serviceWorker' in navigator && 'sync' in (window as any).ServiceWorkerRegistration?.prototype) {
            navigator.serviceWorker.ready.then((registration: ServiceWorkerRegistration) => {
                // Register sync for game data
                const syncManager = (registration as any).sync;
                if (syncManager) {
                    syncManager.register('game-data-sync').catch((err: unknown) => {
                        logger.log('[BackgroundSync] Sync registration failed:', err);
                    });
                }
            });
        }

        // Periodic cleanup of old operations
        if (typeof window !== 'undefined') {
            setInterval(() => {
                this.cleanupOldOperations();
            }, 30000); // Every 30 seconds
        }
    }

    // Add operation to background sync queue
    addOperation(operation: () => Promise<void>, priority: number = 1): string {
        const id = `op_${Date.now()}_${Math.random()}`;
        this.pendingOperations.push({
            id,
            operation,
            priority,
            timestamp: Date.now(),
        });

        // Sort by priority (higher first)
        this.pendingOperations.sort((a, b) => b.priority - a.priority);

        logger.log(`[BackgroundSync] Added operation ${id} with priority ${priority}`);
        return id;
    }

    // Process pending operations
    async processOperations(): Promise<void> {
        if (this.pendingOperations.length === 0) return;

        logger.log(`[BackgroundSync] Processing ${this.pendingOperations.length} operations`);

        const operationsToProcess = [...this.pendingOperations];
        this.pendingOperations = [];

        for (const op of operationsToProcess) {
            try {
                await op.operation();
                logger.log(`[BackgroundSync] Operation ${op.id} completed successfully`);
            } catch (error) {
                logger.error(`[BackgroundSync] Operation ${op.id} failed:`, error);

                // Re-queue failed operations with lower priority
                this.pendingOperations.push({
                    ...op,
                    priority: Math.max(0, op.priority - 1),
                    timestamp: Date.now(),
                });
            }
        }
    }

    private cleanupOldOperations(): void {
        const maxAge = 5 * 60 * 1000; // 5 minutes
        const now = Date.now();

        const oldOps = this.pendingOperations.filter(op => (now - op.timestamp) > maxAge);

        if (oldOps.length > 0) {
            logger.log(`[BackgroundSync] Cleaning up ${oldOps.length} old operations`);
            this.pendingOperations = this.pendingOperations.filter(op => (now - op.timestamp) <= maxAge);
        }
    }

    getStats() {
        return {
            pendingOperations: this.pendingOperations.length,
            operationsByPriority: this.pendingOperations.reduce((acc, op) => {
                acc[op.priority] = (acc[op.priority] || 0) + 1;
                return acc;
            }, {} as Record<number, number>),
        };
    }
}

// Performance monitoring and analytics
class PerformanceMonitor {
    private metrics = {
        loadTimes: [] as number[],
        cacheHits: 0,
        cacheMisses: 0,
        networkRequests: 0,
        errors: 0,
    };

    recordLoadTime(time: number): void {
        this.metrics.loadTimes.push(time);
        if (this.metrics.loadTimes.length > 100) {
            this.metrics.loadTimes.shift(); // Keep last 100 measurements
        }
    }

    recordCacheHit(): void {
        this.metrics.cacheHits++;
    }

    recordCacheMiss(): void {
        this.metrics.cacheMisses++;
    }

    recordNetworkRequest(): void {
        this.metrics.networkRequests++;
    }

    recordError(): void {
        this.metrics.errors++;
    }

    getPerformanceStats() {
        const avgLoadTime = this.metrics.loadTimes.length > 0 ?
            this.metrics.loadTimes.reduce((a, b) => a + b, 0) / this.metrics.loadTimes.length : 0;

        const cacheHitRate = (this.metrics.cacheHits + this.metrics.cacheMisses) > 0 ?
            (this.metrics.cacheHits / (this.metrics.cacheHits + this.metrics.cacheMisses)) * 100 : 0;

        return {
            averageLoadTime: avgLoadTime.toFixed(2) + 'ms',
            cacheHitRate: cacheHitRate.toFixed(1) + '%',
            totalRequests: this.metrics.networkRequests,
            totalErrors: this.metrics.errors,
            samples: this.metrics.loadTimes.length,
        };
    }
}

// Lazy singleton instances to avoid SSR issues
let _cacheManager: AdvancedCacheManager | null = null;
let _backgroundSync: BackgroundSyncManager | null = null;
let _performanceMonitor: PerformanceMonitor | null = null;

// Lazy getters to prevent window access during SSR
const getCacheManager = (): AdvancedCacheManager => {
    if (!_cacheManager) {
        _cacheManager = new AdvancedCacheManager();
    }
    return _cacheManager;
};

const getBackgroundSync = (): BackgroundSyncManager => {
    if (!_backgroundSync) {
        _backgroundSync = new BackgroundSyncManager();
    }
    return _backgroundSync;
};

const getPerformanceMonitor = (): PerformanceMonitor => {
    if (!_performanceMonitor) {
        _performanceMonitor = new PerformanceMonitor();
    }
    return _performanceMonitor;
};

// Proxy objects that lazily initialize the actual instances
// This prevents "window is not defined" errors during SSR/prerendering
const cacheManager = new Proxy({} as AdvancedCacheManager, {
    get(_, prop) {
        if (typeof window === 'undefined') {
            // Return no-op functions for SSR
            if (typeof getCacheManager.prototype?.[prop as keyof AdvancedCacheManager] === 'function') {
                return () => Promise.resolve(null);
            }
            return undefined;
        }
        const instance = getCacheManager();
        const value = instance[prop as keyof AdvancedCacheManager];
        return typeof value === 'function' ? value.bind(instance) : value;
    }
});

const backgroundSync = new Proxy({} as BackgroundSyncManager, {
    get(_, prop) {
        if (typeof window === 'undefined') {
            // Return no-op functions for SSR
            return () => { };
        }
        const instance = getBackgroundSync();
        const value = instance[prop as keyof BackgroundSyncManager];
        return typeof value === 'function' ? value.bind(instance) : value;
    }
});

const performanceMonitor = new Proxy({} as PerformanceMonitor, {
    get(_, prop) {
        if (typeof window === 'undefined') {
            // Return no-op functions for SSR
            return () => { };
        }
        const instance = getPerformanceMonitor();
        const value = instance[prop as keyof PerformanceMonitor];
        return typeof value === 'function' ? value.bind(instance) : value;
    }
});

// Export for use in service worker
export { cacheManager, backgroundSync, performanceMonitor };
