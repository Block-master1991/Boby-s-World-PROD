// src/lib/indexedDB/operations.ts - CRUD operations for assets
/* eslint-disable max-lines */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { logger } from 'utils/logger';
import { DB_CONFIG } from './config';
import { getDatabase } from './core';
import { getCacheStatsSync, incrementAccessCount, incrementHitCount, saveStatsToDb, updateCacheStatsInternal } from './state';
import { IndexedDBError, type AssetMetadata } from './types';
import { formatBytes, generateQuickChecksum } from './utils';

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
      const stats = getCacheStatsSync();
      await updateCacheStatsInternal({
        totalItems: stats.totalItems + 1,
        totalSize: stats.totalSize + asset.size
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
  incrementAccessCount();

  const db = await getDatabase();

  return new Promise((resolve, reject) => {
    // Use readonly transaction for reading to avoid blocking other readers
    const readTransaction = db.transaction([DB_CONFIG.stores.assets], 'readonly');
    const readStore = readTransaction.objectStore(DB_CONFIG.stores.assets);
    const readRequest = readStore.get(id);

    readRequest.onsuccess = (event) => {
      const {result} = (event.target as IDBRequest);

      if (result) {
        incrementHitCount();

        // Check TTL first
        if (result.ttl && Date.now() - result.createdAt > result.ttl) {
          // Asset expired, schedule deletion in separate transaction
          setTimeout(() => {
            deleteAsset(id).catch(err =>
              logger.warn('[IndexedDB] Failed to delete expired asset:', id, err)
            );
          }, 0);
          const stats = getCacheStatsSync();
          updateCacheStatsInternal({
            totalItems: stats.totalItems - 1,
            totalSize: stats.totalSize - result.size
          }).catch(err => logger.warn('[IndexedDB] Failed to update stats:', err));
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
          const stats = getCacheStatsSync();
          await updateCacheStatsInternal({
            totalItems: stats.totalItems - 1,
            totalSize: stats.totalSize - asset.size
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
      await updateCacheStatsInternal({
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
          const stats = getCacheStatsSync();
          updateCacheStatsInternal({
            totalItems: stats.totalItems + totalAddedItems,
            totalSize: stats.totalSize + totalAddedSize
          }).then(resolve).catch(reject);
        }
      };

      request.onerror = (event) => {
        reject(new IndexedDBError(`Failed to batch put asset ${asset.name}`, 'BATCH_PUT_FAILED', event.target));
      };
    });
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
          const stats = getCacheStatsSync();
          updateCacheStatsInternal({
            totalItems: stats.totalItems - 1,
            totalSize: stats.totalSize - asset.size,
            lastCleanup: Date.now()
          }).catch(err => logger.warn('[IndexedDB] Failed to update stats:', err));
          cleaned++;
          cursor.delete();
        }
        cursor.continue();
      } else {
        saveStatsToDb(db).then(() => resolve(cleaned)).catch(reject);
      }
    };

    request.onerror = (event) => {
      reject(new IndexedDBError('Failed to clean expired assets', 'CLEAN_FAILED', event.target));
    };
  });
}
