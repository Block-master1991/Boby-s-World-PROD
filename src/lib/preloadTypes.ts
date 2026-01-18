import type { IntegrityCheck } from './assetIntegrity';

export interface PreloadProgress {
    totalAssets: number;
    loadedAssets: number;
    currentAsset?: string;
    loadedSizeMB: number;
    totalSizeMB: number;
    currentPriority: 'critical' | 'high' | 'medium' | 'low';
    phase: string;
    isComplete: boolean;
    errors: string[];
    // ✨ Enhanced fields
    verifiedAssets: number;      // Number of verified files
    corruptedAssets: number;     // Number of corrupted files
    downloadSpeed: number;       // Download speed MB/s
    integrityChecks: IntegrityCheck[];  // Integrity check results
}

export interface PreloadOptions {
    onProgress?: (progress: PreloadProgress) => void;
    maxConcurrentLoads?: number;
    timeoutMs?: number;
    retryAttempts?: number;
}
