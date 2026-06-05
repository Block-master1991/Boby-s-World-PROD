// Initial Asset Preloader - Forces complete preload of all game assets into IndexedDB
import { logger } from "utils/logger";
import { verifyAssetIntegrity } from "./assetIntegrity";
import type { AssetInfo } from "./gameAssetManifest";
import { getAssetsByPriority, getPriorityOrder, MANIFEST_STATS } from "./gameAssetManifest";
import type { AssetMetadata } from "./indexedDB";
import { isAvailable, putAsset } from "./indexedDB";
import type { PreloadOptions, PreloadProgress } from "./preloadTypes";
import {
  fetchAsset,
  getAssetDataType,
  getInitialProgress,
  getMimeType,
  getPriorityNum,
  isMobile,
  retryDelay,
} from "./preloaderUtils";

// GLOBAL SCOPE EXTENSION
declare global {
  interface Window {
    __INITIAL_PRELOAD_ACTIVE__?: boolean;
  }
}

class InitialAssetPreloader {
  private isPreloading = false;
  private preloadPromise: Promise<boolean> | null = null;
  private abortController: AbortController | null = null;
  private progress: PreloadProgress = getInitialProgress();
  private actualTotalSizeMB = 0;
  private downloadStartTime = 0;
  private totalBytesLoaded = 0;

  async preloadAllAssets(options: PreloadOptions = {}): Promise<boolean> {
    if (!isAvailable()) return false;

    if (this.isPreloading && this.preloadPromise) {
      return this.preloadPromise;
    }

    this.initPreloadState();
    const {
      onProgress,
      maxConcurrentLoads = isMobile() ? 2 : 3,
      timeoutMs = 600000,
      retryAttempts = 5,
    } = options;

    this.preloadPromise = this.performPreload(
      maxConcurrentLoads,
      timeoutMs,
      retryAttempts,
      onProgress
    );

    try {
      const result = await this.preloadPromise;
      this.progress.isComplete = true;
      this.progress.phase = result ? "completed" : "failed";
      onProgress?.(this.progress);
      return result;
    } finally {
      this.cleanup();
    }
  }

  private initPreloadState() {
    this.isPreloading = true;
    this.abortController = new AbortController();
    this.progress = getInitialProgress();
  }

  private cleanup() {
    this.isPreloading = false;
    this.preloadPromise = null;
    this.abortController = null;
  }

  private async performPreload(
    maxConcurrent: number,
    timeout: number,
    retries: number,
    onProgress?: (p: PreloadProgress) => void
  ): Promise<boolean> {
    if (typeof window !== "undefined") window.__INITIAL_PRELOAD_ACTIVE__ = true;
    logger.log("[InitialAssetPreloader] 🛡️ LRU cleanup disabled");

    try {
      this.downloadStartTime = Date.now();
      this.totalBytesLoaded = 0;
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("Preload timeout")), timeout);
      });

      await Promise.race([
        this.loadActiveAssets(maxConcurrent, retries, onProgress),
        timeoutPromise,
      ]);
      return true;
    } catch (error) {
      logger.error("[InitialAssetPreloader] Failed:", error);
      this.progress.errors.push(error instanceof Error ? error.message : "Unknown");
      return false;
    } finally {
      if (typeof window !== "undefined") delete window.__INITIAL_PRELOAD_ACTIVE__;
      logger.log("[InitialAssetPreloader] ✓ LRU cleanup re-enabled");
    }
  }

  private async loadActiveAssets(
    maxConcurrent: number,
    retries: number,
    onProgress?: (p: PreloadProgress) => void
  ): Promise<void> {
    for (const priority of getPriorityOrder()) {
      this.progress.currentPriority = priority;
      this.progress.phase = `Loading ${priority} assets`;
      onProgress?.(this.progress);

      const assets = getAssetsByPriority(priority);
      if (!assets.length) continue;

      logger.log(`[Preload] Loading ${assets.length} ${priority} assets`);

      // Batch processing

      for (let i = 0; i < assets.length; i += maxConcurrent) {
        const batch = assets.slice(i, i + maxConcurrent);
        // eslint-disable-next-line no-await-in-loop
        await Promise.all(batch.map(a => this.loadSingleAsset(a, retries, onProgress)));
        logger.log(
          `[Preload] ${priority}: ${Math.min(assets.length, i + maxConcurrent)}/${assets.length}`
        );
      }
    }
    this.progress.phase = "Verifying";
    onProgress?.(this.progress);
    this.verifyCompletion();
  }

  private async loadSingleAsset(
    asset: AssetInfo,
    retries: number,
    onProgress?: (p: PreloadProgress) => void
  ): Promise<void> {
    if (this.abortController?.signal.aborted) throw new Error("Aborted");
    let lastErr: Error | null = null;

    for (let i = 1; i <= retries; i++) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await this.attemptLoad(asset, i, retries, onProgress);
        return;
      } catch (err) {
        lastErr = err as Error;
        // eslint-disable-next-line no-await-in-loop
        if (i < retries) await retryDelay(i, asset.path, lastErr);
      }
    }
    this.failLoad(asset, retries, lastErr);
  }

  private async attemptLoad(
    asset: AssetInfo,
    attempt: number,
    total: number,
    onProgress?: (p: PreloadProgress) => void
  ): Promise<void> {
    this.progress.currentAsset = asset.path;
    onProgress?.(this.progress);
    logger.log(`[Preload] ${asset.path} (${attempt}/${total})`);

    const data = await fetchAsset(
      asset.path,
      asset.estimatedSizeMB,
      asset.type,
      this.abortController?.signal ?? null
    );
    const hash = await this.checkIntegrity(asset, data);
    await this.storeAsset(asset, data, hash);
    this.updateStats(asset, data);
    onProgress?.(this.progress);
  }

  private async checkIntegrity(asset: AssetInfo, data: ArrayBuffer): Promise<string | undefined> {
    const info = asset as AssetInfo & { sha256?: string; actualSizeMB?: number };
    if (!info.sha256 && !info.actualSizeMB) return undefined;

    const check = await verifyAssetIntegrity(
      asset.path,
      data,
      info.sha256,
      info.actualSizeMB ? Math.round(info.actualSizeMB * 1024 * 1024) : undefined
    );
    this.progress.integrityChecks.push(check);

    if (check.isValid) {
      this.progress.verifiedAssets++;
      return check.actualSHA256;
    }
    this.progress.corruptedAssets++;
    logger.warn(`[Preload] Integrity failed: ${check.error}`);
    if (asset.priority === "critical") throw new Error(`Critical corruption: ${check.error}`);
    return undefined;
  }

  private updateStats(asset: AssetInfo, data: ArrayBuffer): void {
    this.progress.loadedAssets++;
    this.totalBytesLoaded += data.byteLength;
    const elapsed = (Date.now() - this.downloadStartTime) / 1000;
    if (elapsed > 0) this.progress.downloadSpeed = this.totalBytesLoaded / 1048576 / elapsed;

    const sizeMB = data.byteLength / 1048576;
    logger.log(
      `[Preload] ✓ ${asset.path} (${sizeMB.toFixed(2)}MB, ` +
        `${this.progress.downloadSpeed.toFixed(2)}MB/s)`
    );
  }

  private failLoad(asset: AssetInfo, attempts: number, err: Error | null): never {
    const msg = `Failed ${asset.path} after ${attempts}: ${err?.message}`;
    logger.error(`[Preload] ✗ ${msg}`);
    this.progress.errors.push(msg);
    throw err || new Error(msg);
  }

  private async storeAsset(asset: AssetInfo, data: ArrayBuffer, hash?: string): Promise<void> {
    const sizeMB = data.byteLength / 1048576;
    this.actualTotalSizeMB += sizeMB;
    this.progress.totalSizeMB = Math.round(this.actualTotalSizeMB * 100) / 100;

    // Cast to 'any' to satisfy strict AssetMetadata & { data: any } requirement
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const meta: any = {
      id: asset.path,
      name: asset.description,
      type: getAssetDataType(asset.type),
      mimeType: getMimeType(asset.path),
      size: data.byteLength,
      createdAt: Date.now(),
      accessedAt: Date.now(),
      priority: getPriorityNum(asset.priority),
      checksum: hash,
      data,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await putAsset(meta as AssetMetadata & { data: any });
    // Update loadedSizeMB after successful storage
    this.progress.loadedSizeMB = Math.round(this.actualTotalSizeMB * 100) / 100;
  }

  private verifyCompletion(): void {
    const { loadedAssets: loaded } = this.progress;
    const total = MANIFEST_STATS.totalAssets;
    if (loaded < total) {
      logger.warn(`[Preload] Incomplete: ${loaded}/${total}`);
    } else {
      logger.log(`[Preload] ✓ Complete: ${loaded}`);
    }
  }

  cancelPreload(): void {
    this.abortController?.abort();
    this.isPreloading = false;
    this.preloadPromise = null;
  }

  getPreloadStatus(): PreloadProgress {
    return { ...this.progress };
  }
  isCurrentlyPreloading(): boolean {
    return this.isPreloading;
  }

  getPreloadStats() {
    const p = this.progress;
    return {
      completionRate: p.totalAssets > 0 ? (p.loadedAssets / p.totalAssets) * 100 : 0,
      successRate:
        p.loadedAssets > 0 ? ((p.loadedAssets - p.errors.length) / p.loadedAssets) * 100 : 0,
      loadedSizeMB: Math.round(p.loadedSizeMB * 100) / 100,
      totalSizeMB: p.totalSizeMB,
      errors: p.errors.length,
      isComplete: p.isComplete,
    };
  }
}

export const initialAssetPreloader = new InitialAssetPreloader();
