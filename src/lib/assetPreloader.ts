// Intelligent Asset Preloading System for Boby's World
import { logger } from 'utils/logger';
import { INITIAL_ASSETS, generateEnvironmentAssets } from './asset/manifest';
import type { AssetMetadata, PreloadZone } from './asset/types';
import { getModel, putModel } from './indexedDB';
import { isMobileDevice } from './utils';

class IntelligentAssetPreloader {
    private assets = new Map<string, AssetMetadata>();
    private loadedAssets = new Set<string>();
    private preloadedAssets = new Set<string>();
    private activePreloads = new Map<string, Promise<ArrayBuffer | null>>();
    private maxConcurrentLoads = isMobileDevice() ? 1 : 2;
    private preloadDistance = 50; 
    private cacheLimit = isMobileDevice() ? 30 * 1024 * 1024 : 100 * 1024 * 1024;
    private currentCacheSize = 0;

    constructor() {
        this.initializeAssetManifest();
        this.startBackgroundMaintenance();
    }

    private initializeAssetManifest() {
        INITIAL_ASSETS.forEach(a => this.registerAsset(a));
        generateEnvironmentAssets().forEach(a => this.registerAsset(a));
    }

    private registerAsset(metadata: Omit<AssetMetadata, 'lastAccessed'>) {
        this.assets.set(metadata.id, { ...metadata, lastAccessed: Date.now() });
    }

    async preloadForPosition(playerX: number, playerZ: number, velocity: { x: number; z: number }) {
        const zones = this.calculatePreloadZones(playerX, playerZ, velocity);
        const prioritized = this.prioritizeAssets(zones);
        await this.preloadAssets(prioritized.slice(0, this.maxConcurrentLoads));
        this.cleanupDistantAssets(playerX, playerZ);
    }

    private calculatePreloadZones(px: number, pz: number, v: { x: number; z: number }): PreloadZone[] {
        const zones: PreloadZone[] = [{ centerX: px, centerZ: pz, radius: 20, assets: [], priority: 10 }];
        const speed = Math.sqrt(v.x ** 2 + v.z ** 2);
        if (speed > 0.1) {
            zones.push({ centerX: px + (v.x / speed) * this.preloadDistance, centerZ: pz + (v.z / speed) * this.preloadDistance, radius: 30, assets: [], priority: 8 });
        }
        this.addPeripheralZones(zones, px, pz);
        return zones;
    }

    private addPeripheralZones(zones: PreloadZone[], px: number, pz: number) {
        const offsets = [[25, 0], [-25, 0], [0, 25], [0, -25]];
        offsets.forEach((offset) => {
            const dx = offset[0]!;
            const dz = offset[1]!;
            zones.push({ centerX: px + dx, centerZ: pz + dz, radius: 15, assets: [], priority: 5 });
        });
    }

    private prioritizeAssets(zones: PreloadZone[]): AssetMetadata[] {
        const scores = new Map<string, number>();
        for (const zone of zones) {
            for (const [id, asset] of this.assets) {
                if (this.isAssetInZone(asset, zone)) {
                    const dist = this.getDistanceToZone(asset, zone);
                    const score = zone.priority * (1 / (1 + dist)) * (1 / asset.estimatedSize);
                    scores.set(id, (scores.get(id) || 0) + score);
                }
            }
        }
        return Array.from(scores.entries())
            .filter(([id]) => !this.loadedAssets.has(id))
            .sort(([, a], [, b]) => b - a)
            .map(([id]) => this.assets.get(id)!);
    }

    private isAssetInZone(asset: AssetMetadata, zone: PreloadZone): boolean {
        if (!asset.chunkCoords) return asset.preloadDistance >= zone.radius;
        const d = Math.sqrt((asset.chunkCoords.x * 16 - zone.centerX) ** 2 + (asset.chunkCoords.z * 16 - zone.centerZ) ** 2);
        return d <= zone.radius + asset.preloadDistance;
    }

    private getDistanceToZone(asset: AssetMetadata, zone: PreloadZone): number {
        if (!asset.chunkCoords) return zone.radius;
        return Math.sqrt((asset.chunkCoords.x * 16 - zone.centerX) ** 2 + (asset.chunkCoords.z * 16 - zone.centerZ) ** 2);
    }

    private async preloadAssets(assets: AssetMetadata[]): Promise<void> {
        await Promise.allSettled(assets.map(a => this.preloadAsset(a)));
    }

    private async preloadAsset(asset: AssetMetadata): Promise<void> {
        if (this.loadedAssets.has(asset.id) || this.activePreloads.has(asset.id)) return;
        const promise = this.loadAsset(asset);
        this.activePreloads.set(asset.id, promise);
        try {
            await promise;
            this.loadedAssets.add(asset.id);
            this.preloadedAssets.add(asset.id);
            asset.lastAccessed = Date.now();
            logger.log(`[AssetPreloader] Preloaded ${asset.id} (${asset.estimatedSize}KB)`);
        } catch (e) {
            logger.warn(`[AssetPreloader] Fail: ${asset.id}`, e);
        } finally {
            this.activePreloads.delete(asset.id);
        }
    }

    private async loadAsset(asset: AssetMetadata): Promise<ArrayBuffer | null> {
        try {
            const cached = await getModel(asset.id);
            if (cached) {
                logger.log(`[AssetPreloader] Loading ${asset.id} from IndexedDB`);
                return cached;
            }
        } catch (error) {
            logger.warn(`[AssetPreloader] Error loading ${asset.id} from IndexedDB:`, error);
        }

        if (process.env.NODE_ENV === 'development') {
            return this.emergencyLoad(asset);
        }
        throw new Error(`Asset not found: ${asset.id}`);
    }

    private async emergencyLoad(asset: AssetMetadata): Promise<ArrayBuffer> {
        logger.warn(`[AssetPreloader] Emergency load: ${asset.id}`);
        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), 15000);
        try {
            const resp = await fetch(asset.url, { signal: ctrl.signal });
            if (!resp.ok) throw new Error("Fetch failed");
            const data = await resp.arrayBuffer();
            await putModel(asset.id, data);
            this.currentCacheSize += asset.estimatedSize * 1024;
            return data;
        } finally {
            clearTimeout(tid);
        }
    }

    private cleanupDistantAssets(px: number, pz: number): void {
        const toUnload: string[] = [];
        for (const [id, asset] of this.assets) {
            if (!asset.chunkCoords) continue;
            const d = Math.sqrt((asset.chunkCoords.x * 16 - px) ** 2 + (asset.chunkCoords.z * 16 - pz) ** 2);
            if (d > 100 && this.loadedAssets.has(id)) toUnload.push(id);
        }
        toUnload.forEach(id => this.unloadAsset(id));
    }

    private unloadAsset(id: string): void {
        this.loadedAssets.delete(id);
        this.preloadedAssets.delete(id);
        const asset = this.assets.get(id);
        if (asset) this.currentCacheSize -= asset.estimatedSize * 1024;
    }

    private startBackgroundMaintenance(): void {
        setInterval(() => this.performMaintenance(), 30000);
    }

    private performMaintenance(): void {
        const now = Date.now();
        for (const id of this.preloadedAssets) {
            const a = this.assets.get(id);
            if (a && (now - a.lastAccessed) > 300000) this.unloadAsset(id);
        }
        if (this.currentCacheSize > this.cacheLimit) this.evictOldAssets();
    }

    private evictOldAssets(): void {
        const sorted = Array.from(this.loadedAssets).map(id => ({ id, a: this.assets.get(id)! })).sort((a, b) => a.a.lastAccessed - b.a.lastAccessed);
        let freed = 0;
        const target = this.cacheLimit * 0.8;
        for (const { id, a } of sorted) {
            if (this.currentCacheSize - freed <= target) break;
            this.unloadAsset(id);
            freed += a.estimatedSize * 1024;
        }
    }

    public getCacheStats() {
        return { loadedCount: this.loadedAssets.size, cacheSizeMB: (this.currentCacheSize / (1024 * 1024)).toFixed(2) };
    }
}

export const assetPreloader = new IntelligentAssetPreloader();
