// src/lib/indexedDB/state.ts - State management and statistics
import { isMobileDevice } from '../utils';
import { CACHE_LIMITS, DB_CONFIG } from './config';
import type { CacheStats } from './types';

// Statistics tracking with mutex for thread safety
// Initialize with safe defaults, update actual limits on first access
let cacheStats: CacheStats = {
  totalItems: 0,
  totalSize: 0,
  maxSize: CACHE_LIMITS.desktop.maxSize, // Default to desktop size, will adjust if mobile
  hitRate: 0,
  missRate: 0,
  evictions: 0,
  lastCleanup: Date.now()
};

// Lazy update of limits
if (typeof window !== 'undefined') {
  setTimeout(() => {
    if (isMobileDevice()) {
      cacheStats.maxSize = CACHE_LIMITS.mobile.maxSize;
    }
  }, 0);
}

let accessCount = 0;
let hitCount = 0;

// Mutex for cache stats updates to prevent race conditions
let statsMutex: Promise<void> | null = null;

/**
 * Get current cache statistics (synchronous)
 */
export function getCacheStatsSync(): CacheStats {
  return { ...cacheStats };
}

/**
 * Increment access counter
 */
export function incrementAccessCount(): void {
  accessCount++;
}

/**
 * Increment hit counter
 */
export function incrementHitCount(): void {
  hitCount++;
}

/**
 * Atomically update cache statistics using mutex to prevent race conditions
 */
export async function updateCacheStatsInternal(updates: Partial<CacheStats>): Promise<void> {
  if (statsMutex) {
    await statsMutex;
  }

  statsMutex = ((() => {
    try {
      cacheStats = { ...cacheStats, ...updates };
    } finally {
      statsMutex = null;
    }
  })() as unknown as Promise<void>);

  return statsMutex;
}

/**
 * Save statistics to IndexedDB
 */
export function saveStatsToDb(db: IDBDatabase): Promise<void> {
  return new Promise((resolve) => {
    const transaction = db.transaction([DB_CONFIG.stores.stats], 'readwrite');
    const store = transaction.objectStore(DB_CONFIG.stores.stats);

    const statsData = {
      key: 'cache_stats',
      ...cacheStats,
      hitRate: accessCount > 0 ? hitCount / accessCount : 0,
      missRate: accessCount > 0 ? (accessCount - hitCount) / accessCount : 0
    };

    store.put(statsData).onsuccess = () => resolve();
  });
}

/**
 * Load statistics from IndexedDB
 */
export function loadStatsFromDb(db: IDBDatabase): Promise<void> {
  return new Promise((resolve) => {
    const transaction = db.transaction([DB_CONFIG.stores.stats], 'readonly');
    const store = transaction.objectStore(DB_CONFIG.stores.stats);
    const request = store.get('cache_stats');

    request.onsuccess = () => {
      const stats = request.result;
      if (stats) {
        cacheStats = { ...cacheStats, ...stats };
      }
      resolve();
    };

    request.onerror = () => resolve();
  });
}
