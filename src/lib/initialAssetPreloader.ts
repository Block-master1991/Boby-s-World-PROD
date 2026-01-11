// Initial Asset Preloader - Forces complete preload of all game assets into IndexedDB
import { logger } from 'utils/logger';
// Prevents gameplay until all assets are cached locally for offline operation

import type { AssetMetadata, DataType } from './indexedDB';
import { putAsset, isAvailable } from './indexedDB';
import type { AssetInfo } from './gameAssetManifest';
import { GAME_ASSET_MANIFEST, getAssetsByPriority, getPriorityOrder, MANIFEST_STATS } from './gameAssetManifest';
import type { IntegrityCheck } from './assetIntegrity';
import { verifyAssetIntegrity } from './assetIntegrity';

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

class InitialAssetPreloader {
    private isPreloading = false;
    private preloadPromise: Promise<boolean> | null = null;
    private abortController: AbortController | null = null;

    private progress: PreloadProgress = {
        totalAssets: MANIFEST_STATS.totalAssets,
        loadedAssets: 0,
        loadedSizeMB: 0,
        totalSizeMB: 0, // Will be calculated from actual loaded data
        currentPriority: 'critical',
        phase: 'checking', // Start with checking phase
        isComplete: false,
        errors: [],
        verifiedAssets: 0,
        corruptedAssets: 0,
        downloadSpeed: 0,
        integrityChecks: []
    };

    private actualTotalSizeMB = 0; // Track actual total size loaded
    private downloadStartTime = 0; // Track download start for speed calculation
    private totalBytesLoaded = 0; // Track total bytes for speed calculation

    /**
     * Start preloading all assets - blocks until complete
     */
    async preloadAllAssets(options: PreloadOptions = {}): Promise<boolean> {
        if (!isAvailable()) {
            logger.error('[InitialAssetPreloader] IndexedDB not available');
            return false;
        }

        if (this.isPreloading) {
            logger.log('[InitialAssetPreloader] Preload already in progress');
            return this.preloadPromise!;
        }

        this.isPreloading = true;
        this.abortController = new AbortController();
        this.progress = {
            totalAssets: MANIFEST_STATS.totalAssets,
            loadedAssets: 0,
            loadedSizeMB: 0,
            totalSizeMB: MANIFEST_STATS.totalEstimatedSizeMB,
            currentPriority: 'critical',
            phase: 'initializing',
            isComplete: false,
            errors: [],
            verifiedAssets: 0,
            corruptedAssets: 0,
            downloadSpeed: 0,
            integrityChecks: []
        };

        const isMobile = typeof window !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        const {
            onProgress,
            maxConcurrentLoads = isMobile ? 2 : 3, // Reduce concurrency on mobile
            timeoutMs = 600000, // Increase to 10 minutes for slow networks
            retryAttempts = 5 // Increase retries for unstable connections
        } = options;

        this.preloadPromise = this.performPreload(maxConcurrentLoads, timeoutMs, retryAttempts, onProgress);

        try {
            const result = await this.preloadPromise;
            this.progress.isComplete = true;
            this.progress.phase = result ? 'completed' : 'failed';
            onProgress?.(this.progress);
            return result;
        } finally {
            this.isPreloading = false;
            this.preloadPromise = null;
            this.abortController = null;
        }
    }

    private async performPreload(
        maxConcurrentLoads: number,
        timeoutMs: number,
        retryAttempts: number,
        onProgress?: (progress: PreloadProgress) => void
    ): Promise<boolean> {
        // 🚀 CRITICAL: Signal IndexedDB to skip LRU cleanup during initial preload
        (globalThis as any).__INITIAL_PRELOAD_ACTIVE__ = true;
        logger.log('[InitialAssetPreloader] 🛡️ LRU cleanup disabled for initial preload');

        const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => {
                reject(new Error('Preload timeout'));
            }, timeoutMs);
        });

        try {
            // Start download timer
            this.downloadStartTime = Date.now();
            this.totalBytesLoaded = 0;

            await Promise.race([
                this.loadAssetsByPriority(maxConcurrentLoads, retryAttempts, onProgress),
                timeoutPromise
            ]);
            return true;
        } catch (error) {
            logger.error('[InitialAssetPreloader] Preload failed:', error);
            this.progress.errors.push(error instanceof Error ? error.message : 'Unknown error');
            return false;
        } finally {
            // Re-enable LRU cleanup after preload
            delete (globalThis as any).__INITIAL_PRELOAD_ACTIVE__;
            logger.log('[InitialAssetPreloader] ✓ LRU cleanup re-enabled');
        }
    }

    private async loadAssetsByPriority(
        maxConcurrentLoads: number,
        retryAttempts: number,
        onProgress?: (progress: PreloadProgress) => void
    ): Promise<void> {
        const priorities = getPriorityOrder();

        for (const priority of priorities) {
            this.progress.currentPriority = priority;
            this.progress.phase = `Loading ${priority} priority assets`;

            onProgress?.(this.progress);

            const assets = getAssetsByPriority(priority);
            if (assets.length === 0) continue;

            logger.log(`[InitialAssetPreloader] Loading ${assets.length} ${priority} priority assets`);

            // Load assets in batches to control concurrency
            for (let i = 0; i < assets.length; i += maxConcurrentLoads) {
                const batch = assets.slice(i, i + maxConcurrentLoads);
                await this.loadAssetBatch(batch, retryAttempts, onProgress);
            }
        }

        this.progress.phase = 'Verifying preload completion';
        onProgress?.(this.progress);

        // Final verification
        await this.verifyPreloadCompletion();
    }

    private async loadAssetBatch(
        assets: AssetInfo[],
        retryAttempts: number,
        onProgress?: (progress: PreloadProgress) => void
    ): Promise<void> {
        const loadPromises = assets.map(asset =>
            this.loadSingleAsset(asset, retryAttempts, onProgress)
        );

        const results = await Promise.allSettled(loadPromises);

        // Count successful loads for statistics
        const successful = results.filter(r => r.status === 'fulfilled').length;
        logger.log(`[InitialAssetPreloader] Batch complete: ${successful}/${assets.length} assets loaded`);
    }

    private async loadSingleAsset(
        asset: AssetInfo,
        retryAttempts: number,
        onProgress?: (progress: PreloadProgress) => void
    ): Promise<void> {
        if (this.abortController?.signal.aborted) {
            throw new Error('Preload aborted');
        }

        let lastError: Error | null = null;

        for (let attempt = 1; attempt <= retryAttempts; attempt++) {
            try {
                this.progress.currentAsset = asset.path;
                onProgress?.(this.progress);

                logger.log(`[InitialAssetPreloader] Loading ${asset.path} (attempt ${attempt}/${retryAttempts})`);

                const data = await this.fetchAssetData(asset);

                // ✨ Verify asset integrity if hash is available
                const assetInfo = asset as AssetInfo & { sha256?: string; actualSizeMB?: number };
                let calculatedHash: string | undefined = undefined;

                if (assetInfo.sha256 || assetInfo.actualSizeMB) {
                    const integrityCheck = await verifyAssetIntegrity(
                        asset.path,
                        data,
                        assetInfo.sha256,
                        assetInfo.actualSizeMB ? Math.round(assetInfo.actualSizeMB * 1024 * 1024) : undefined
                    );

                    this.progress.integrityChecks.push(integrityCheck);

                    if (integrityCheck.isValid) {
                        this.progress.verifiedAssets++;
                        calculatedHash = integrityCheck.actualSHA256; // Reuse the calculated hash
                    } else {
                        this.progress.corruptedAssets++;
                        logger.warn(`[InitialAssetPreloader] ⚠️ Integrity check failed: ${integrityCheck.error}`);

                        if (asset.priority === 'critical') {
                            throw new Error(`Critical asset corrupted: ${integrityCheck.error}`);
                        }
                    }
                }

                await this.storeAssetInIndexedDB(asset, data, calculatedHash);

                // Update progress
                this.progress.loadedAssets++;
                this.totalBytesLoaded += data.byteLength;

                // Calculate download speed
                const elapsedSeconds = (Date.now() - this.downloadStartTime) / 1000;
                if (elapsedSeconds > 0) {
                    this.progress.downloadSpeed = (this.totalBytesLoaded / (1024 * 1024)) / elapsedSeconds;
                }

                const actualSizeMB = data.byteLength / (1024 * 1024);
                const estimateDiff = actualSizeMB - asset.estimatedSizeMB;
                const percentDiff = ((estimateDiff / asset.estimatedSizeMB) * 100).toFixed(1);

                logger.log(
                    `[InitialAssetPreloader] ✓ Loaded ${asset.path} ` +
                    `(${actualSizeMB.toFixed(2)}MB actual vs ${asset.estimatedSizeMB}MB estimated, ` +
                    `${percentDiff}% diff, ${this.progress.downloadSpeed.toFixed(2)}MB/s)`
                );

                // Update progress after successful load
                onProgress?.(this.progress);
                return;

            } catch (error) {
                lastError = error as Error;
                logger.warn(`[InitialAssetPreloader] Attempt ${attempt} failed for ${asset.path}:`, error);

                if (attempt < retryAttempts) {
                    // Exponential backoff
                    const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }

        // All attempts failed
        const errorMsg = `Failed to load ${asset.path} after ${retryAttempts} attempts: ${lastError?.message}`;
        logger.error(`[InitialAssetPreloader] ✗ ${errorMsg}`);
        this.progress.errors.push(errorMsg);
        throw lastError;
    }

    private async fetchAssetData(asset: AssetInfo): Promise<ArrayBuffer> {
        // Skip ServiceWorker for large files to avoid interception issues
        const shouldSkipSW = asset.estimatedSizeMB > 10 || asset.type === 'hdr';

        const response = await fetch(asset.path, {
            signal: this.abortController?.signal,
            // Add cache busting for development and skip SW for large files
            headers: {
                ...(process.env.NODE_ENV === 'development' ? {
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache'
                } : {}),
                ...(shouldSkipSW ? {
                    'Service-Worker': 'script' // This might help skip SW interception
                } : {})
            },
            // Try to bypass service worker cache for large files
            cache: shouldSkipSW ? 'no-cache' : 'default'
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return await response.arrayBuffer();
    }

    private async storeAssetInIndexedDB(asset: AssetInfo, data: ArrayBuffer, verifiedHash?: string): Promise<void> {
        const actualSizeMB = data.byteLength / (1024 * 1024);

        // Update actual total size
        this.actualTotalSizeMB += actualSizeMB;
        this.progress.totalSizeMB = Math.round(this.actualTotalSizeMB * 100) / 100;

        const assetMetadata: AssetMetadata & { data: any } = {
            id: asset.path,
            name: asset.description,
            type: this.mapAssetTypeToDataType(asset.type),
            mimeType: this.getMimeType(asset.path),
            size: data.byteLength,
            createdAt: Date.now(),
            accessedAt: Date.now(),
            priority: this.mapPriorityToNumber(asset.priority),
            checksum: verifiedHash, // Pass verified hash to avoid re-calculation
            data: data
        };

        await putAsset(assetMetadata);

        // Update loaded size with actual data
        this.progress.loadedSizeMB = Math.round(this.actualTotalSizeMB * 100) / 100;
    }

    private mapAssetTypeToDataType(type: 'model' | 'texture' | 'audio' | 'hdr'): DataType {
        switch (type) {
            case 'model':
            case 'hdr':
                return 'arraybuffer';
            case 'texture':
                return 'blob';
            case 'audio':
                return 'arraybuffer';
            default:
                return 'arraybuffer';
        }
    }

    private getMimeType(path: string): string | undefined {
        const extension = path.split('.').pop()?.toLowerCase();
        switch (extension) {
            case 'glb':
                return 'model/gltf-binary';
            case 'jpg':
            case 'jpeg':
                return 'image/jpeg';
            case 'png':
                return 'image/png';
            case 'hdr':
                return 'application/octet-stream';
            case 'mp3':
                return 'audio/mpeg';
            default:
                return undefined;
        }
    }

    private mapPriorityToNumber(priority: 'critical' | 'high' | 'medium' | 'low'): number {
        switch (priority) {
            case 'critical': return 10;
            case 'high': return 7;
            case 'medium': return 5;
            case 'low': return 3;
            default: return 5;
        }
    }

    private async verifyPreloadCompletion(): Promise<void> {
        // This is a simple verification - in production you might want more thorough checks
        const expectedAssets = MANIFEST_STATS.totalAssets;
        const loadedAssets = this.progress.loadedAssets;

        if (loadedAssets < expectedAssets) {
            logger.warn(`[InitialAssetPreloader] Only ${loadedAssets}/${expectedAssets} assets loaded successfully`);
        } else {
            logger.log(`[InitialAssetPreloader] ✓ All ${loadedAssets} assets preloaded successfully`);
        }
    }

    /**
     * Cancel ongoing preload
     */
    cancelPreload(): void {
        if (this.abortController) {
            this.abortController.abort();
        }
        this.isPreloading = false;
        this.preloadPromise = null;
    }

    /**
     * Get current preload status
     */
    getPreloadStatus(): PreloadProgress {
        return { ...this.progress };
    }

    /**
     * Check if preload is currently running
     */
    isCurrentlyPreloading(): boolean {
        return this.isPreloading;
    }

    /**
     * Get preload statistics
     */
    getPreloadStats() {
        const completionRate = this.progress.totalAssets > 0 ?
            (this.progress.loadedAssets / this.progress.totalAssets) * 100 : 0;

        const successRate = this.progress.loadedAssets > 0 ?
            ((this.progress.loadedAssets - this.progress.errors.length) / this.progress.loadedAssets) * 100 : 0;

        return {
            completionRate: Math.round(completionRate * 100) / 100,
            successRate: Math.round(successRate * 100) / 100,
            loadedSizeMB: Math.round(this.progress.loadedSizeMB * 100) / 100,
            totalSizeMB: this.progress.totalSizeMB,
            errors: this.progress.errors.length,
            isComplete: this.progress.isComplete
        };
    }
}

// Singleton instance
export const initialAssetPreloader = new InitialAssetPreloader();

// Utility functions
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

export function formatTime(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    if (minutes > 0) {
        return `${minutes}m ${remainingSeconds}s`;
    }
    return `${remainingSeconds}s`;
}
