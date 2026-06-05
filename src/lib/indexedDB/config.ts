// src/lib/indexedDB/config.ts - Configuration constants

/**
 * IndexedDB database configuration
 */
export const DB_CONFIG = {
  name: "BobyGameAssets",
  version: 2,
  stores: {
    assets: "assets",
    metadata: "metadata",
    stats: "stats",
  },
} as const;

/**
 * Cache size limits (in bytes) - Increased for game assets
 */
export const CACHE_LIMITS = {
  mobile: {
    maxSize: 300 * 1024 * 1024, // 300MB - increased to fit actual assets (200.62MB)
    maxItems: 200,
  },
  desktop: {
    maxSize: 500 * 1024 * 1024, // 500MB - larger buffer for desktop
    maxItems: 1000,
  },
} as const;
