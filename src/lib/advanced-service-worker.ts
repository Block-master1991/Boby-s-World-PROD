/**
 * Advanced Service Worker - Intelligent Caching and Background Sync
 * Modularized for Boby's World performance
 */

import { AdvancedCacheManager } from './service-worker/CacheManager';
import { PerformanceMonitor } from './service-worker/Monitor';
import { BackgroundSyncManager } from './service-worker/SyncManager';

// Private instances for lazy initialization
let _cacheManager: AdvancedCacheManager | null = null;
let _backgroundSync: BackgroundSyncManager | null = null;
let _performanceMonitor: PerformanceMonitor | null = null;

/**
 * Lazy getters to prevent window access during SSR/prerendering
 */
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

/**
 * Proxy objects that lazily initialize the actual instances
 * This prevents "window is not defined" errors during SSR
 */
export const cacheManager = new Proxy({} as AdvancedCacheManager, {
    get(_, prop) {
        if (typeof window === 'undefined') {
            // Return no-op/fallback for SSR
            if (prop === 'handleRequest') return () => Promise.resolve(null);
            if (prop === 'clearAllCaches') return () => Promise.resolve();
            return undefined;
        }
        const instance = getCacheManager();
        const value = instance[prop as keyof AdvancedCacheManager];
        return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(instance) : value;
    }
});

export const backgroundSync = new Proxy({} as BackgroundSyncManager, {
    get(_, prop) {
        if (typeof window === 'undefined') {
            return () => {}; // No-op for SSR
        }
        const instance = getBackgroundSync();
        const value = instance[prop as keyof BackgroundSyncManager];
        return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(instance) : value;
    }
});

export const performanceMonitor = new Proxy({} as PerformanceMonitor, {
    get(_, prop) {
        if (typeof window === 'undefined') {
            return () => {}; // No-op for SSR
        }
        const instance = getPerformanceMonitor();
        const value = instance[prop as keyof PerformanceMonitor];
        return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(instance) : value;
    }
});
