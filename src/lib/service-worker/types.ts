/**
 * Service Worker Type Definitions
 */

export interface CacheConfig {
  name: string;
  maxAge: number; // seconds
  maxEntries: number;
  strategy: "cache-first" | "network-first" | "stale-while-revalidate";
  priority: number;
}

export interface CacheEntry {
  url: string;
  response: Response;
  timestamp: number;
  accessCount: number;
  size: number; // bytes
}

export interface SyncOperation {
  id: string;
  operation: () => Promise<void>;
  priority: number;
  timestamp: number;
}

export interface PerformanceMetrics {
  loadTimes: number[];
  cacheHits: number;
  cacheMisses: number;
  networkRequests: number;
  errors: number;
}
