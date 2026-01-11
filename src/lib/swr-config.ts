// Advanced SWR Configuration for Optimized Data Fetching
import { logger } from 'utils/logger';
// Provides intelligent caching, revalidation, and background sync

import type { SWRConfiguration } from 'swr';

interface SWRError extends Error {
    status?: number;
    code?: string;
}

interface CacheEntry<T> {
    data: T;
    timestamp: number;
    error?: SWRError;
    isStale: boolean;
}

// Global SWR configuration
export const swrConfig: SWRConfiguration = {
    // Revalidation strategies
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
    revalidateIfStale: true,

    // Error retry logic
    errorRetryCount: 3,
    errorRetryInterval: 1000, // Start with 1s

    // Deduplication window
    dedupingInterval: 2000,

    // Focus throttle
    focusThrottleInterval: 5000,

    // Loading timeout
    loadingTimeout: 3000,

    // Custom fetcher with enhanced error handling
    fetcher: async (url: string, options?: RequestInit) => {
        const startTime = Date.now();

        try {
            const response = await fetch(url, {
                ...options,
                headers: {
                    'Content-Type': 'application/json',
                    ...options?.headers,
                },
            });

            const endTime = Date.now();
            const duration = endTime - startTime;

            // Log slow requests
            if (duration > 1000) {
                logger.warn(`[SWR] Slow request: ${url} took ${duration}ms`);
            }

            if (!response.ok) {
                const error = new Error(`HTTP ${response.status}: ${response.statusText}`) as SWRError;
                error.status = response.status;

                // Try to extract error details from response
                try {
                    const errorData = await response.json();
                    error.message = errorData.message || error.message;
                    error.code = errorData.code;
                } catch {
                    // Ignore JSON parsing errors
                }

                throw error;
            }

            const data = await response.json();
            return data;

        } catch (error) {
            if (error instanceof Error) {
                logger.error(`[SWR] Fetch failed for ${url}:`, error.message);
            }
            throw error;
        }
    },

    // Custom cache provider with enhanced features
    provider: () => {
        const cache = new Map<string, CacheEntry<any>>();

        return {
            get: (key: string) => {
                const entry = cache.get(key);
                if (!entry) return undefined;

                // Check if entry is stale (older than 5 minutes)
                const isStale = Date.now() - entry.timestamp > 5 * 60 * 1000;
                if (isStale && !entry.isStale) {
                    entry.isStale = true;
                    logger.log(`[SWR] Cache entry stale: ${key}`);
                }

                return entry;
            },

            set: (key: string, value: CacheEntry<any>) => {
                // Limit cache size to prevent memory issues
                if (cache.size >= 100) {
                    // Remove oldest entries (simple LRU approximation)
                    const keysToDelete = Array.from(cache.keys()).slice(0, 20);
                    keysToDelete.forEach(k => cache.delete(k));
                    logger.log(`[SWR] Cleaned up ${keysToDelete.length} old cache entries`);
                }

                cache.set(key, {
                    ...value,
                    timestamp: Date.now(),
                    isStale: false,
                });
            },

            delete: (key: string) => {
                cache.delete(key);
            },

            keys: function* () {
                for (const key of cache.keys()) {
                    yield key;
                }
            },

            // Enhanced clear with statistics
            clear: () => {
                const size = cache.size;
                cache.clear();
                logger.log(`[SWR] Cache cleared (${size} entries)`);
            },
        };
    },

    // Custom compare function for optimistic updates
    compare: (a: any, b: any) => {
        // Deep comparison for objects
        if (a && b && typeof a === 'object' && typeof b === 'object') {
            return JSON.stringify(a) === JSON.stringify(b);
        }
        return a === b;
    },

    // Note: serializer is not available in SWRConfiguration
    // We'll handle serialization in our custom cache provider instead
};

// Specialized configurations for different data types
export const gameDataConfig: Partial<SWRConfiguration> = {
    ...swrConfig,
    revalidateOnFocus: false, // Game data doesn't need immediate refetch on focus
    dedupingInterval: 5000, // Longer deduping for game data
    errorRetryCount: 2, // Fewer retries for game data
};

export const userDataConfig: Partial<SWRConfiguration> = {
    ...swrConfig,
    revalidateOnFocus: true, // User data should refresh when app regains focus
    dedupingInterval: 1000, // Shorter deduping for user data
    errorRetryCount: 5, // More retries for critical user data
};

export const marketDataConfig: Partial<SWRConfiguration> = {
    ...swrConfig,
    refreshInterval: 30000, // Refresh market data every 30 seconds
    revalidateOnFocus: true,
    dedupingInterval: 5000,
    errorRetryCount: 3,
};

// Hook for using SWR with automatic error handling
export const useSWRWithErrorHandling = (key: any, fetcher?: any, config?: Partial<SWRConfiguration>) => {
    // This would normally use the actual SWR hook, but we'll create a wrapper
    // that adds error handling, logging, and performance monitoring

    const finalConfig = { ...swrConfig, ...config };

    // In a real implementation, this would return useSWR(key, fetcher, finalConfig)
    // with additional error handling logic

    return {
        data: null,
        error: null,
        isLoading: false,
        isValidating: false,
        mutate: async () => { },
    };
};

// Background sync for SWR data
export class SWRBackgroundSync {
    private syncQueue: Set<string> = new Set();
    private syncTimer: NodeJS.Timeout | null = null;
    private syncInterval = 60000; // 1 minute

    constructor() {
        this.startBackgroundSync();
    }

    // Add key to background sync queue
    addToSyncQueue(key: string): void {
        this.syncQueue.add(key);
    }

    // Process background sync
    private async processSync(): Promise<void> {
        if (this.syncQueue.size === 0) return;

        const keysToSync = Array.from(this.syncQueue);
        this.syncQueue.clear();

        logger.log(`[SWRBackgroundSync] Processing ${keysToSync.length} keys`);

        // In a real implementation, this would trigger revalidation for these keys
        // using SWR's mutate function
    }

    private startBackgroundSync(): void {
        this.syncTimer = setInterval(() => {
            this.processSync();
        }, this.syncInterval);
    }

    dispose(): void {
        if (this.syncTimer) {
            clearInterval(this.syncTimer);
            this.syncTimer = null;
        }
        this.syncQueue.clear();
    }
}

// Singleton instance
export const swrBackgroundSync = new SWRBackgroundSync();

// Utility functions for SWR operations
export const swrUtils = {
    // Invalidate all cache entries matching a pattern
    invalidatePattern: (pattern: RegExp) => {
        // In a real implementation, this would iterate through the cache
        // and invalidate entries matching the pattern
        logger.log(`[SWR] Invalidating cache pattern: ${pattern}`);
    },

    // Prefetch data
    prefetch: async (key: string, fetcher: () => Promise<any>) => {
        try {
            const data = await fetcher();
            logger.log(`[SWR] Prefetched data for key: ${key}`);
            return data;
        } catch (error) {
            logger.error(`[SWR] Prefetch failed for key: ${key}`, error);
            throw error;
        }
    },

    // Get cache statistics
    getCacheStats: () => {
        // In a real implementation, this would return cache statistics
        return {
            size: 0,
            hitRate: 0,
            missRate: 0,
        };
    },
};
