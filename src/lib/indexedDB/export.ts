// src/lib/indexedDB/export.ts - Data export/import functionality
/* eslint-disable @typescript-eslint/no-explicit-any */
import { logger } from 'utils/logger';
import { DB_CONFIG } from './config';
import { getDatabase } from './core';
import { clearAssets, getAllAssets } from './operations';
import { getCacheStatsSync, loadStatsFromDb } from './state';
import { IndexedDBError, type CacheStats } from './types';

/**
 * Get cache statistics
 */
export async function getCacheStats(): Promise<CacheStats> {
  const db = await getDatabase();
  await loadStatsFromDb(db);
  return getCacheStatsSync();
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
}
