// src/lib/indexedDB/index.ts - Main barrel export for backward compatibility

// Re-export types
export * from './types';

// Re-export core functionality
export { isAvailable } from './core';

// Re-export operations
export {
    batchPut,
    cleanExpiredAssets, clearAssets, deleteAsset, getAllAssets, getAsset, putAsset
} from './operations';

// Re-export legacy functions
export { clearModels, getModel, putModel } from './legacy';

// Re-export export/import functions
export { exportData, getCacheStats, importData } from './export';

// Re-export utilities
export { formatBytes } from './utils';
