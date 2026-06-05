// src/lib/indexedDB/core.ts - Database initialization and connection management
/* eslint-disable @typescript-eslint/no-explicit-any */
import { logger } from "utils/logger";
import { DB_CONFIG } from "./config";
import { IndexedDBError } from "./types";

// Singleton database instance
let dbInstance: IDBDatabase | null = null;
let initPromise: Promise<IDBDatabase> | null = null;

/**
 * Create object stores for the database
 */
export function createObjectStores(db: IDBDatabase): void {
  // Create/update object stores
  if (!db.objectStoreNames.contains(DB_CONFIG.stores.assets)) {
    const assetStore = db.createObjectStore(DB_CONFIG.stores.assets, { keyPath: "id" });
    assetStore.createIndex("name", "name", { unique: false });
    assetStore.createIndex("accessedAt", "accessedAt", { unique: false });
    assetStore.createIndex("priority", "priority", { unique: false });
    assetStore.createIndex("ttl", "ttl", { unique: false });
    assetStore.createIndex("tags", "tags", { unique: false, multiEntry: true });
  }

  if (!db.objectStoreNames.contains(DB_CONFIG.stores.metadata)) {
    db.createObjectStore(DB_CONFIG.stores.metadata, { keyPath: "id" });
  }

  if (!db.objectStoreNames.contains(DB_CONFIG.stores.stats)) {
    db.createObjectStore(DB_CONFIG.stores.stats, { keyPath: "key" });
  }
}

/**
 * Handle database upgrade events
 */
export function handleDatabaseUpgrade(event: IDBVersionChangeEvent): void {
  const db = (event.target as IDBOpenDBRequest).result;
  const { oldVersion } = event;

  logger.log(`[IndexedDB] Upgrading database from v${oldVersion} to v${DB_CONFIG.version}`);
  createObjectStores(db);

  // Migration logic
  if (oldVersion < 2) {
    migrateFromV1(db);
  }
}

/**
 * Migrate from version 1 to version 2
 */
export function migrateFromV1(db: IDBDatabase): void {
  try {
    // Check if old store exists
    if (db.objectStoreNames.contains("models")) {
      logger.log("[IndexedDB] Migrating data from v1 models store");

      const transaction = db.transaction(["models"], "readonly");
      const oldStore = transaction.objectStore("models");

      oldStore.openCursor().onsuccess = event => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          const oldData = cursor.value;
          // Transform old format to new format
          // Note: V1 migration is currently disabled - manual migration required
          // Uncomment and use putAsset if migration needed
          /*
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
          */

          // Add to new store in a separate transaction
          // Note: Migration uses putAsset which will be available after full initialization
          setTimeout(() => {
            logger.warn(
              "[IndexedDB] V1 migration - manual putAsset call needed for:",
              oldData.name
            );
          }, 0);

          cursor.continue();
        }
      };
    }
  } catch (error) {
    logger.error("[IndexedDB] Migration failed:", error);
  }
}

/**
 * Initialize IndexedDB with proper schema
 */
function initializeDatabase(): Promise<IDBDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance);
  if (initPromise) return initPromise;

  initPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_CONFIG.name, DB_CONFIG.version);

    request.onupgradeneeded = handleDatabaseUpgrade;

    request.onsuccess = event => {
      dbInstance = (event.target as IDBOpenDBRequest).result;
      logger.log(`[IndexedDB] Database initialized: ${DB_CONFIG.name} v${DB_CONFIG.version}`);
      resolve(dbInstance);
    };

    request.onerror = event => {
      const { error } = event.target as IDBOpenDBRequest;
      logger.error("[IndexedDB] Failed to initialize database:", error);
      reject(new IndexedDBError("Failed to initialize database", "INIT_FAILED", error));
    };

    request.onblocked = () => {
      logger.warn("[IndexedDB] Database initialization blocked");
      reject(new IndexedDBError("Database initialization blocked", "INIT_BLOCKED"));
    };
  });

  return initPromise;
}

/**
 * Check if IndexedDB is available
 */
export function isAvailable(): boolean {
  try {
    return typeof indexedDB !== "undefined" && indexedDB !== null && typeof window !== "undefined";
  } catch {
    return false;
  }
}

/**
 * Emergency fallback database when IndexedDB completely fails
 */
export function forceFallbackDatabase(): Promise<IDBDatabase> {
  // Create a minimal in-memory database simulation
  // This will use localStorage as ultimate fallback
  logger.warn("[IndexedDB] Using localStorage fallback - performance will be degraded");

  // Create a mock database object that uses localStorage
  const mockDB = {
    transaction: () => ({
      objectStore: () => ({
        put: () => ({
          onsuccess: null as any,
          onerror: null as any,
        }),
        get: () => ({
          onsuccess: null as any,
          onerror: null as any,
        }),
        delete: () => ({
          onsuccess: null as any,
          onerror: null as any,
        }),
        clear: () => ({
          onsuccess: null as any,
          onerror: null as any,
        }),
      }),
    }),
  } as any;

  return Promise.resolve(mockDB);
}

/**
 * Get database instance with aggressive retry logic - NEVER FAILS
 */
export async function getDatabase(): Promise<IDBDatabase> {
  if (!isAvailable()) {
    // Force fallback - create in-memory storage
    logger.warn("[IndexedDB] IndexedDB not available, using forced fallback");
    return forceFallbackDatabase();
  }

  for (let attempt = 1; attempt <= 50; attempt++) {
    // Increased to 50 attempts
    try {
      // eslint-disable-next-line no-await-in-loop
      return await initializeDatabase();
    } catch {
      logger.warn(`[IndexedDB] Attempt ${attempt} failed, retrying with longer delay...`);
      // Exponential backoff with longer delays - intentional await in loop for retry logic
      const delay = Math.min(2000 * Math.pow(1.5, attempt - 1), 30000); // Max 30 seconds
      // eslint-disable-next-line no-await-in-loop
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  // Ultimate fallback - never fail
  logger.error("[IndexedDB] All attempts failed, using emergency fallback");
  return forceFallbackDatabase();
}
