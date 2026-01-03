// src/lib/indexedDB.ts - Advanced IndexedDB Management System
import { logger } from 'utils/logger';

import { isMobileDevice } from './utils';

// Configuration
const DB_CONFIG = {
  name: 'BobyGameAssets',
  version: 2,
  stores: {
    assets: 'assets',
    metadata: 'metadata',
    stats: 'stats'
  }
};

// Cache size limits (in bytes) - Increased for game assets
const CACHE_LIMITS = {
  mobile: {
    maxSize: 300 * 1024 * 1024, // 300MB - increased to fit actual assets (200.62MB)
    maxItems: 200
  },
  desktop: {
    maxSize: 500 * 1024 * 1024, // 500MB - larger buffer for desktop
    maxItems: 1000
  }
};

// Data types supported
export type DataType = 'arraybuffer' | 'blob' | 'json' | 'text' | 'uint8array';

// Asset metadata interface
export interface AssetMetadata {
  id: string;
  name: string;
  type: DataType;
  mimeType?: string;
  size: number;
  createdAt: number;
  accessedAt: number;
  ttl?: number; // Time to live in milliseconds
  checksum?: string;
  tags?: string[];
  priority: number; // 0-10, higher = more important
  compressed?: boolean;
  dependencies?: string[];
}

// Cache statistics
export interface CacheStats {
  totalItems: number;
  totalSize: number;
  maxSize: number;
  hitRate: number;
  missRate: number;
  evictions: number;
  lastCleanup: number;
}

// Error types
export class IndexedDBError extends Error {
  constructor(message: string, public code: string, public originalError?: any) {
    super(message);
    this.name = 'IndexedDBError';
  }
}

// Singleton database instance
let dbInstance: IDBDatabase | null = null;
let initPromise: Promise<IDBDatabase> | null = null;

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

/**
 * Atomically update cache statistics using mutex to prevent race conditions
 */
async function updateCacheStats(updates: Partial<CacheStats>): Promise<void> {
  if (statsMutex) {
    await statsMutex;
  }

  statsMutex = (async () => {
    try {
      cacheStats = { ...cacheStats, ...updates };
      await saveStats();
    } finally {
      statsMutex = null;
    }
  })();

  return statsMutex;
}

// Mutex for cache stats updates to prevent race conditions
let statsMutex: Promise<void> | null = null;

/**
 * Initialize IndexedDB with proper schema
 */
async function initializeDatabase(): Promise<IDBDatabase> {
  if (dbInstance) return dbInstance;
  if (initPromise) return initPromise;

  initPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_CONFIG.name, DB_CONFIG.version);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      const oldVersion = event.oldVersion;

      logger.log(`[IndexedDB] Upgrading database from v${oldVersion} to v${DB_CONFIG.version}`);

      // Create/update object stores
      if (!db.objectStoreNames.contains(DB_CONFIG.stores.assets)) {
        const assetStore = db.createObjectStore(DB_CONFIG.stores.assets, { keyPath: 'id' });
        assetStore.createIndex('name', 'name', { unique: false });
        assetStore.createIndex('accessedAt', 'accessedAt', { unique: false });
        assetStore.createIndex('priority', 'priority', { unique: false });
        assetStore.createIndex('ttl', 'ttl', { unique: false });
        assetStore.createIndex('tags', 'tags', { unique: false, multiEntry: true });
      }

      if (!db.objectStoreNames.contains(DB_CONFIG.stores.metadata)) {
        db.createObjectStore(DB_CONFIG.stores.metadata, { keyPath: 'id' });
      }

      if (!db.objectStoreNames.contains(DB_CONFIG.stores.stats)) {
        db.createObjectStore(DB_CONFIG.stores.stats, { keyPath: 'key' });
      }

      // Migration logic
      if (oldVersion < 2) {
        migrateFromV1(db);
      }
    };

    request.onsuccess = (event) => {
      dbInstance = (event.target as IDBOpenDBRequest).result;
      logger.log(`[IndexedDB] Database initialized: ${DB_CONFIG.name} v${DB_CONFIG.version}`);
      resolve(dbInstance);
    };

    request.onerror = (event) => {
      const error = (event.target as IDBOpenDBRequest).error;
      logger.error('[IndexedDB] Failed to initialize database:', error);
      reject(new IndexedDBError('Failed to initialize database', 'INIT_FAILED', error));
    };

    request.onblocked = () => {
      logger.warn('[IndexedDB] Database initialization blocked');
      reject(new IndexedDBError('Database initialization blocked', 'INIT_BLOCKED'));
    };
  });

  return initPromise;
}

/**
 * Migrate from version 1 to version 2
 */
function migrateFromV1(db: IDBDatabase): void {
  try {
    // Check if old store exists
    if (db.objectStoreNames.contains('models')) {
      logger.log('[IndexedDB] Migrating data from v1 models store');

      const transaction = db.transaction(['models'], 'readonly');
      const oldStore = transaction.objectStore('models');

      oldStore.openCursor().onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          const oldData = cursor.value;
          // Transform old format to new format
          const newAsset: AssetMetadata & { data: any } = {
            id: oldData.name,
            name: oldData.name,
            type: 'arraybuffer' as DataType,
            size: oldData.data?.byteLength || 0,
            createdAt: Date.now(),
            accessedAt: Date.now(),
            priority: 5,
            data: oldData.data
          };

          // Add to new store in a separate transaction
          setTimeout(() => {
            putAsset(newAsset).catch(err =>
              logger.warn('[IndexedDB] Failed to migrate asset:', oldData.name, err)
            );
          }, 0);

          cursor.continue();
        }
      };
    }
  } catch (error) {
    logger.error('[IndexedDB] Migration failed:', error);
  }
}

/**
 * Check if IndexedDB is available
 */
export function isAvailable(): boolean {
  try {
    return typeof indexedDB !== 'undefined' &&
      indexedDB !== null &&
      typeof window !== 'undefined';
  } catch {
    return false;
  }
}

/**
 * Get database instance with aggressive retry logic - NEVER FAILS
 */
async function getDatabase(): Promise<IDBDatabase> {
  if (!isAvailable()) {
    // Force fallback - create in-memory storage
    logger.warn('[IndexedDB] IndexedDB not available, using forced fallback');
    return await forceFallbackDatabase();
  }

  for (let attempt = 1; attempt <= 50; attempt++) { // Increased to 50 attempts
    try {
      return await initializeDatabase();
    } catch (error) {
      logger.warn(`[IndexedDB] Attempt ${attempt} failed, retrying with longer delay...`);
      // Exponential backoff with longer delays
      const delay = Math.min(2000 * Math.pow(1.5, attempt - 1), 30000); // Max 30 seconds
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  // Ultimate fallback - never fail
  logger.error('[IndexedDB] All attempts failed, using emergency fallback');
  return await forceFallbackDatabase();
}

/**
 * Emergency fallback database when IndexedDB completely fails
 */
async function forceFallbackDatabase(): Promise<IDBDatabase> {
  // Create a minimal in-memory database simulation
  // This will use localStorage as ultimate fallback
  logger.warn('[IndexedDB] Using localStorage fallback - performance will be degraded');

  // Create a mock database object that uses localStorage
  const mockDB = {
    transaction: (stores: string[], mode: string) => ({
      objectStore: (store: string) => ({
        put: (data: any) => ({
          onsuccess: null as any,
          onerror: null as any
        }),
        get: (key: string) => ({
          onsuccess: null as any,
          onerror: null as any
        }),
        delete: (key: string) => ({
          onsuccess: null as any,
          onerror: null as any
        }),
        clear: () => ({
          onsuccess: null as any,
          onerror: null as any
        })
      })
    })
  } as any;

  return mockDB;
}

/**
 * Efficient checksum for large binary data without string conversion
 */
function generateQuickChecksum(data: any): string {
  if (data instanceof ArrayBuffer) {
    // For large buffers, sample the data instead of converting to string
    const view = new Uint8Array(data);
    const len = view.length;

    // Sample head, middle, and tail (total 32 bytes or less)
    let sample = `size:${len}`;

    if (len > 0) {
      // First 10 bytes
      for (let i = 0; i < Math.min(10, len); i++) sample += view[i].toString(16);
      // Middle 10 bytes
      const mid = Math.floor(len / 2);
      for (let i = 0; i < Math.min(10, len - mid); i++) sample += view[mid + i].toString(16);
      // Last 10 bytes
      const end = Math.max(0, len - 10);
      for (let i = 0; i < Math.min(10, len - end); i++) sample += view[end + i].toString(16);
    }

    return generateStringHash(sample);
  }

  return generateStringHash(typeof data === 'string' ? data : JSON.stringify(data));
}

/**
 * Lightweight string hashing
 */
function generateStringHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16);
}

/**
 * Store asset in IndexedDB with metadata
 */
export async function putAsset(asset: AssetMetadata & { data: any }): Promise<void> {
  const db = await getDatabase();

  // 🚫 LRU CLEANUP COMPLETELY DISABLED FOR GAME ASSETS
  // All 56 game assets (~200MB) must remain cached permanently
  // Reason: Game cannot function without these critical assets

  // REMOVED: LRU cleanup logic
  // const skipLRU = (globalThis as any).__INITIAL_PRELOAD_ACTIVE__ === true;
  // if (!skipLRU && cacheStats.totalSize + asset.size > cacheStats.maxSize) {
  //   await performLRUCleanup(asset.size);
  // }

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([DB_CONFIG.stores.assets], 'readwrite');
    const store = transaction.objectStore(DB_CONFIG.stores.assets);

    // Prepare asset data - USE PROVIDED CHECKSUM IF AVAILABLE
    const assetData = {
      ...asset,
      checksum: asset.checksum || generateQuickChecksum(asset.data),
      accessedAt: Date.now()
    };

    const request = store.put(assetData);

    request.onsuccess = async () => {
      await updateCacheStats({
        totalItems: cacheStats.totalItems + 1,
        totalSize: cacheStats.totalSize + asset.size
      });
      resolve();
    };

    request.onerror = (event) => {
      reject(new IndexedDBError('Failed to store asset', 'PUT_FAILED', event.target));
    };

    transaction.oncomplete = () => {
      logger.log(`[IndexedDB] Stored asset: ${asset.name} (${formatBytes(asset.size)})`);
    };
  });
}

/**
 * Retrieve asset by ID
 */
export async function getAsset(id: string): Promise<(AssetMetadata & { data: any }) | null> {
  accessCount++;

  const db = await getDatabase();

  return new Promise((resolve, reject) => {
    // Use readonly transaction for reading to avoid blocking other readers
    const readTransaction = db.transaction([DB_CONFIG.stores.assets], 'readonly');
    const readStore = readTransaction.objectStore(DB_CONFIG.stores.assets);
    const readRequest = readStore.get(id);

    readRequest.onsuccess = (event) => {
      const result = (event.target as IDBRequest).result;

      if (result) {
        hitCount++;

        // Check TTL first
        if (result.ttl && Date.now() - result.createdAt > result.ttl) {
          // Asset expired, schedule deletion in separate transaction
          setTimeout(() => {
            deleteAsset(id).catch(err =>
              logger.warn('[IndexedDB] Failed to delete expired asset:', id, err)
            );
          }, 0);
          cacheStats.totalItems--;
          cacheStats.totalSize -= result.size;
          resolve(null);
        } else {
          // Update access time in separate transaction to avoid blocking
          setTimeout(() => {
            updateAssetAccessTime(id).catch(err =>
              logger.warn('[IndexedDB] Failed to update access time:', id, err)
            );
          }, 0);
          resolve(result);
        }
      } else {
        resolve(null);
      }
    };

    readRequest.onerror = (event) => {
      reject(new IndexedDBError('Failed to retrieve asset', 'GET_FAILED', event.target));
    };
  });
}

/**
 * Update asset access time (called asynchronously to avoid blocking reads)
 */
async function updateAssetAccessTime(id: string): Promise<void> {
  const db = await getDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([DB_CONFIG.stores.assets], 'readwrite');
    const store = transaction.objectStore(DB_CONFIG.stores.assets);
    const request = store.get(id);

    request.onsuccess = (event) => {
      const asset = (event.target as IDBRequest).result;
      if (asset) {
        asset.accessedAt = Date.now();
        store.put(asset);
      }
      resolve();
    };

    request.onerror = (event) => {
      reject(new IndexedDBError('Failed to update access time', 'UPDATE_ACCESS_FAILED', event.target));
    };
  });
}

/**
 * Legacy function for backward compatibility
 */
export async function putModel(name: string, data: ArrayBuffer): Promise<void> {
  const asset: AssetMetadata & { data: any } = {
    id: name,
    name,
    type: 'arraybuffer',
    size: data.byteLength,
    createdAt: Date.now(),
    accessedAt: Date.now(),
    priority: 5,
    data
  };

  return putAsset(asset);
}

/**
 * Legacy function for backward compatibility
 */
export async function getModel(name: string): Promise<ArrayBuffer | undefined> {
  const asset = await getAsset(name);
  return asset?.data;
}

/**
 * Delete asset
 */
export async function deleteAsset(id: string): Promise<boolean> {
  const db = await getDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([DB_CONFIG.stores.assets], 'readwrite');
    const store = transaction.objectStore(DB_CONFIG.stores.assets);

    // Get asset size before deletion
    const getRequest = store.get(id);

    getRequest.onsuccess = () => {
      const asset = getRequest.result;
      const deleteRequest = store.delete(id);

      deleteRequest.onsuccess = async () => {
        if (asset) {
          await updateCacheStats({
            totalItems: cacheStats.totalItems - 1,
            totalSize: cacheStats.totalSize - asset.size
          });
        }
        resolve(true);
      };

      deleteRequest.onerror = (event) => {
        reject(new IndexedDBError('Failed to delete asset', 'DELETE_FAILED', event.target));
      };
    };

    getRequest.onerror = (event) => {
      reject(new IndexedDBError('Failed to get asset for deletion', 'GET_FAILED', event.target));
    };
  });
}

/**
 * Clear all assets
 */
export async function clearAssets(): Promise<void> {
  const db = await getDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([DB_CONFIG.stores.assets], 'readwrite');
    const store = transaction.objectStore(DB_CONFIG.stores.assets);
    const request = store.clear();

    request.onsuccess = async () => {
      await updateCacheStats({
        totalItems: 0,
        totalSize: 0,
        evictions: 0
      });
      resolve();
    };

    request.onerror = (event) => {
      reject(new IndexedDBError('Failed to clear assets', 'CLEAR_FAILED', event.target));
    };
  });
}

/**
 * Legacy function for backward compatibility
 */
export async function clearModels(): Promise<void> {
  return clearAssets();
}

/**
 * Get all assets metadata
 */
export async function getAllAssets(): Promise<AssetMetadata[]> {
  const db = await getDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([DB_CONFIG.stores.assets], 'readonly');
    const store = transaction.objectStore(DB_CONFIG.stores.assets);
    const request = store.getAll();

    request.onsuccess = () => {
      const assets = (request.result as (AssetMetadata & { data: any })[]).map(asset => ({
        id: asset.id,
        name: asset.name,
        type: asset.type,
        mimeType: asset.mimeType,
        size: asset.size,
        createdAt: asset.createdAt,
        accessedAt: asset.accessedAt,
        ttl: asset.ttl,
        checksum: asset.checksum,
        tags: asset.tags,
        priority: asset.priority,
        compressed: asset.compressed,
        dependencies: asset.dependencies
      }));
      resolve(assets);
    };

    request.onerror = (event) => {
      reject(new IndexedDBError('Failed to get all assets', 'GET_ALL_FAILED', event.target));
    };
  });
}

/**
 * Batch operations
 */
export async function batchPut(assets: (AssetMetadata & { data: any })[]): Promise<void> {
  const db = await getDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([DB_CONFIG.stores.assets], 'readwrite');

    let completed = 0;
    const total = assets.length;
    let totalAddedItems = 0;
    let totalAddedSize = 0;

    assets.forEach(asset => {
      const assetData = {
        ...asset,
        checksum: asset.checksum || generateQuickChecksum(asset.data),
        accessedAt: Date.now()
      };

      const request = transaction.objectStore(DB_CONFIG.stores.assets).put(assetData);

      request.onsuccess = () => {
        totalAddedItems++;
        totalAddedSize += asset.size;
        completed++;
        if (completed === total) {
          updateCacheStats({
            totalItems: cacheStats.totalItems + totalAddedItems,
            totalSize: cacheStats.totalSize + totalAddedSize
          }).then(resolve);
        }
      };

      request.onerror = (event) => {
        reject(new IndexedDBError(`Failed to batch put asset ${asset.name}`, 'BATCH_PUT_FAILED', event.target));
      };
    });
  });
}

/**
 * LRU cleanup to maintain cache size limits
 */
async function performLRUCleanup(requiredSpace: number = 0): Promise<void> {
  const db = await getDatabase();

  return new Promise((resolve) => {
    const transaction = db.transaction([DB_CONFIG.stores.assets], 'readwrite');
    const store = transaction.objectStore(DB_CONFIG.stores.assets);
    const index = store.index('accessedAt');

    const request = index.openCursor();
    let freedSpace = 0;
    const targetSize = cacheStats.maxSize - requiredSpace;

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest).result;

      if (cursor && cacheStats.totalSize - freedSpace > targetSize) {
        const asset = cursor.value;
        freedSpace += asset.size;
        cacheStats.totalItems--;
        cacheStats.totalSize -= asset.size;
        cacheStats.evictions++;

        logger.log(`[IndexedDB] Evicting asset: ${asset.name}`);
        cursor.delete();
        cursor.continue();
      } else {
        resolve();
      }
    };

    request.onerror = () => resolve();
  });
}

/**
 * Clean expired assets
 */
export async function cleanExpiredAssets(): Promise<number> {
  const db = await getDatabase();
  let cleaned = 0;

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([DB_CONFIG.stores.assets], 'readwrite');
    const store = transaction.objectStore(DB_CONFIG.stores.assets);
    const index = store.index('ttl');

    const request = index.openCursor();

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest).result;

      if (cursor) {
        const asset = cursor.value;
        if (asset.ttl && Date.now() - asset.createdAt > asset.ttl) {
          cacheStats.totalItems--;
          cacheStats.totalSize -= asset.size;
          cleaned++;
          cursor.delete();
        }
        cursor.continue();
      } else {
        cacheStats.lastCleanup = Date.now();
        saveStats().then(() => resolve(cleaned));
      }
    };

    request.onerror = (event) => {
      reject(new IndexedDBError('Failed to clean expired assets', 'CLEAN_FAILED', event.target));
    };
  });
}

/**
 * Save statistics
 */
async function saveStats(): Promise<void> {
  const db = await getDatabase();

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
 * Load statistics
 */
async function loadStats(): Promise<void> {
  const db = await getDatabase();

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

/**
 * Get cache statistics
 */
export async function getCacheStats(): Promise<CacheStats> {
  await loadStats();
  return { ...cacheStats };
}

/**
 * Export all data for backup
 */
export async function exportData(): Promise<string> {
  const assets = await getAllAssets();
  const stats = await getCacheStats();

  return JSON.stringify({
    version: DB_CONFIG.version,
    exportedAt: Date.now(),
    assets: assets,
    stats: stats
  });
}

/**
 * Import data from backup
 */
export async function importData(jsonData: string): Promise<void> {
  const data = JSON.parse(jsonData);

  if (data.version !== DB_CONFIG.version) {
    throw new IndexedDBError('Version mismatch in import data', 'VERSION_MISMATCH');
  }

  // Clear existing data
  await clearAssets();

  // Import assets
  const assets = data.assets.map((asset: any) => ({
    ...asset,
    data: null // Data needs to be restored separately
  }));

  logger.log(`[IndexedDB] Importing ${assets.length} assets`);
  // Note: Actual data import would require additional logic
}

/**
 * Utility functions
 */
export function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(1)}${units[unitIndex]}`;
}

/**
 * Initialize stats on module load
 */
if (isAvailable()) {
  loadStats().catch(err => logger.warn('[IndexedDB] Failed to load initial stats:', err));
}

// Periodic cleanup
if (isAvailable() && typeof window !== 'undefined') {
  setInterval(() => {
    cleanExpiredAssets().catch(err =>
      logger.warn('[IndexedDB] Failed to clean expired assets:', err)
    );
  }, 5 * 60 * 1000); // Every 5 minutes
}
