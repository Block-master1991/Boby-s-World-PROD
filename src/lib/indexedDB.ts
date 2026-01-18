// src/lib/indexedDB.ts - Main barrel export for backward compatibility

// Re-export types
export * from './indexedDB/types';

// Re-export core functionality
export { isAvailable } from './indexedDB/core';

// Re-export operations
export {
  batchPut,
  cleanExpiredAssets, clearAssets, deleteAsset, getAllAssets, getAsset, putAsset
} from './indexedDB/operations';

// Re-export legacy functions
export { clearModels, getModel, putModel } from './indexedDB/legacy';

// Re-export export/import functions
export { exportData, getCacheStats, importData } from './indexedDB/export';

// Re-export utilities
export { formatBytes } from './indexedDB/utils';
