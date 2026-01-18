// src/lib/indexedDB/types.ts - Type definitions and interfaces
/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Data types supported by IndexedDB storage
 */
export type DataType = 'arraybuffer' | 'blob' | 'json' | 'text' | 'uint8array';

/**
 * Asset metadata interface
 * Represents metadata for cached game assets
 */
export interface AssetMetadata {
  id: string;
  name: string;
  type: DataType;
  mimeType?: string | undefined;
  size: number;
  createdAt: number;
  accessedAt: number;
  ttl?: number | undefined; // Time to live in milliseconds
  checksum?: string | undefined;
  tags?: string[] | undefined;
  priority: number; // 0-10, higher = more important
  compressed?: boolean | undefined;
  dependencies?: string[] | undefined;
}

/**
 * Cache statistics interface
 * Tracks performance and usage metrics
 */
export interface CacheStats {
  totalItems: number;
  totalSize: number;
  maxSize: number;
  hitRate: number;
  missRate: number;
  evictions: number;
  lastCleanup: number;
}

/**
 * Custom error class for IndexedDB operations
 */
export class IndexedDBError extends Error {
  constructor(message: string, public code: string, public originalError?: any) {
    super(message);
    this.name = 'IndexedDBError';
  }
}
