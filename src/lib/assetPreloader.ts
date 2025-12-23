// Intelligent Asset Preloading System for Boby's World
// Optimizes resource loading based on player position and movement patterns

interface AssetMetadata {
    id: string;
    url: string;
    type: 'model' | 'texture' | 'audio';
    priority: number;
    estimatedSize: number; // KB
    dependencies?: string[];
    chunkCoords?: { x: number; z: number };
    lastAccessed: number;
    preloadDistance: number; // How far ahead to preload
}

interface PreloadZone {
    centerX: number;
    centerZ: number;
    radius: number;
    assets: string[];
    priority: number;
}

class IntelligentAssetPreloader {
    private assets = new Map<string, AssetMetadata>();
    private loadedAssets = new Set<string>();
    private preloadedAssets = new Set<string>();
    private preloadZones = new Map<string, PreloadZone>();
    private activePreloads = new Map<string, Promise<any>>();
    private maxConcurrentLoads = 2;
    private preloadDistance = 50; // units ahead of player
    private cacheSize = 100 * 1024 * 1024; // 100MB cache
    private currentCacheSize = 0;

    constructor() {
        this.initializeAssetManifest();
        this.startBackgroundMaintenance();
    }

    private initializeAssetManifest() {
        // Register all game assets with their metadata
        this.registerAsset({
            id: 'dog-model',
            url: '/models/dog.glb',
            type: 'model',
            priority: 10,
            estimatedSize: 500,
            preloadDistance: 0, // Always keep loaded
        });

        this.registerAsset({
            id: 'coin-model',
            url: '/models/coin.glb',
            type: 'model',
            priority: 8,
            estimatedSize: 200,
            preloadDistance: 30,
        });

        // Register environment assets for different chunks
        for (let x = -10; x <= 10; x++) {
            for (let z = -10; z <= 10; z++) {
                const chunkId = `chunk_${x}_${z}`;
                this.registerAsset({
                    id: `grass_${x}_${z}`,
                    url: `/models/grass.glb?chunk=${chunkId}`,
                    type: 'model',
                    priority: 3,
                    estimatedSize: 150,
                    chunkCoords: { x, z },
                    preloadDistance: 40,
                });

                this.registerAsset({
                    id: `rocks_${x}_${z}`,
                    url: `/models/rocks.glb?chunk=${chunkId}`,
                    type: 'model',
                    priority: 4,
                    estimatedSize: 300,
                    chunkCoords: { x, z },
                    preloadDistance: 35,
                });
            }
        }
    }

    private registerAsset(metadata: Omit<AssetMetadata, 'lastAccessed'>) {
        this.assets.set(metadata.id, {
            ...metadata,
            lastAccessed: Date.now(),
        });
    }

    // Main preloading method called from game loop
    async preloadForPosition(playerX: number, playerZ: number, playerVelocity: { x: number; z: number }) {
        const preloadZones = this.calculatePreloadZones(playerX, playerZ, playerVelocity);

        // Prioritize assets based on zones
        const prioritizedAssets = this.prioritizeAssets(preloadZones);

        // Start preloading high-priority assets
        await this.preloadAssets(prioritizedAssets.slice(0, this.maxConcurrentLoads));

        // Clean up distant assets
        this.cleanupDistantAssets(playerX, playerZ);
    }

    private calculatePreloadZones(playerX: number, playerZ: number, velocity: { x: number; z: number }): PreloadZone[] {
        const zones: PreloadZone[] = [];

        // Current zone (immediate area)
        zones.push({
            centerX: playerX,
            centerZ: playerZ,
            radius: 20,
            assets: [],
            priority: 10,
        });

        // Forward zone (direction of movement)
        const speed = Math.sqrt(velocity.x ** 2 + velocity.z ** 2);
        if (speed > 0.1) {
            const forwardX = playerX + (velocity.x / speed) * this.preloadDistance;
            const forwardZ = playerZ + (velocity.z / speed) * this.preloadDistance;
            zones.push({
                centerX: forwardX,
                centerZ: forwardZ,
                radius: 30,
                assets: [],
                priority: 8,
            });
        }

        // Peripheral zones (sides)
        zones.push({
            centerX: playerX + 25,
            centerZ: playerZ,
            radius: 15,
            assets: [],
            priority: 5,
        });

        zones.push({
            centerX: playerX - 25,
            centerZ: playerZ,
            radius: 15,
            assets: [],
            priority: 5,
        });

        zones.push({
            centerX: playerX,
            centerZ: playerZ + 25,
            radius: 15,
            assets: [],
            priority: 5,
        });

        zones.push({
            centerX: playerX,
            centerZ: playerZ - 25,
            radius: 15,
            assets: [],
            priority: 5,
        });

        return zones;
    }

    private prioritizeAssets(zones: PreloadZone[]): AssetMetadata[] {
        const assetScores = new Map<string, number>();

        for (const zone of zones) {
            for (const [assetId, asset] of this.assets) {
                if (this.isAssetInZone(asset, zone)) {
                    const distance = this.getDistanceToZone(asset, zone);
                    const score = zone.priority * (1 / (1 + distance)) * (1 / asset.estimatedSize);
                    assetScores.set(assetId, (assetScores.get(assetId) || 0) + score);
                }
            }
        }

        return Array.from(assetScores.entries())
            .filter(([assetId]) => !this.loadedAssets.has(assetId))
            .sort(([, a], [, b]) => b - a)
            .map(([assetId]) => this.assets.get(assetId)!);
    }

    private isAssetInZone(asset: AssetMetadata, zone: PreloadZone): boolean {
        if (!asset.chunkCoords) return asset.preloadDistance >= zone.radius;

        const distance = Math.sqrt(
            (asset.chunkCoords.x * 16 - zone.centerX) ** 2 +
            (asset.chunkCoords.z * 16 - zone.centerZ) ** 2
        );

        return distance <= zone.radius + asset.preloadDistance;
    }

    private getDistanceToZone(asset: AssetMetadata, zone: PreloadZone): number {
        if (!asset.chunkCoords) return zone.radius;

        return Math.sqrt(
            (asset.chunkCoords.x * 16 - zone.centerX) ** 2 +
            (asset.chunkCoords.z * 16 - zone.centerZ) ** 2
        );
    }

    private async preloadAssets(assets: AssetMetadata[]): Promise<void> {
        const preloadPromises = assets.map(asset => this.preloadAsset(asset));
        await Promise.allSettled(preloadPromises);
    }

    private async preloadAsset(asset: AssetMetadata): Promise<void> {
        if (this.loadedAssets.has(asset.id) || this.activePreloads.has(asset.id)) {
            return;
        }

        const preloadPromise = this.loadAsset(asset);
        this.activePreloads.set(asset.id, preloadPromise);

        try {
            await preloadPromise;
            this.loadedAssets.add(asset.id);
            this.preloadedAssets.add(asset.id);
            asset.lastAccessed = Date.now();
            console.log(`[AssetPreloader] Preloaded ${asset.id} (${asset.estimatedSize}KB)`);
        } catch (error) {
            console.warn(`[AssetPreloader] Failed to preload ${asset.id}:`, error);
        } finally {
            this.activePreloads.delete(asset.id);
        }
    }

    private async loadAsset(asset: AssetMetadata): Promise<any> {
        // Check cache first
        const cached = await this.getCachedAsset(asset.id);
        if (cached) return cached;

        // Load from network
        const response = await fetch(asset.url);
        if (!response.ok) throw new Error(`Failed to load ${asset.url}`);

        const data = await response.arrayBuffer();

        // Cache the asset
        await this.cacheAsset(asset.id, data, asset.estimatedSize);

        return data;
    }

    private async getCachedAsset(assetId: string): Promise<any | null> {
        // Implement IndexedDB or memory cache lookup
        return null; // Placeholder
    }

    private async cacheAsset(assetId: string, data: ArrayBuffer, sizeKB: number): Promise<void> {
        // Implement caching logic
        this.currentCacheSize += sizeKB * 1024;
    }

    private cleanupDistantAssets(playerX: number, playerZ: number): void {
        const maxDistance = 100; // units
        const assetsToUnload: string[] = [];

        for (const [assetId, asset] of this.assets) {
            if (!asset.chunkCoords) continue;

            const distance = Math.sqrt(
                (asset.chunkCoords.x * 16 - playerX) ** 2 +
                (asset.chunkCoords.z * 16 - playerZ) ** 2
            );

            if (distance > maxDistance && this.loadedAssets.has(assetId)) {
                assetsToUnload.push(assetId);
            }
        }

        // Unload distant assets
        for (const assetId of assetsToUnload) {
            this.unloadAsset(assetId);
        }
    }

    private unloadAsset(assetId: string): void {
        this.loadedAssets.delete(assetId);
        this.preloadedAssets.delete(assetId);
        // Implement actual unloading (dispose resources, free memory)
        console.log(`[AssetPreloader] Unloaded distant asset: ${assetId}`);
    }

    private startBackgroundMaintenance(): void {
        // Periodic cleanup of old cached assets
        setInterval(() => {
            this.performMaintenance();
        }, 30000); // Every 30 seconds
    }

    private performMaintenance(): void {
        const now = Date.now();
        const maxAge = 5 * 60 * 1000; // 5 minutes

        // Clean up old preloaded assets that haven't been accessed
        for (const assetId of this.preloadedAssets) {
            const asset = this.assets.get(assetId);
            if (asset && (now - asset.lastAccessed) > maxAge) {
                this.unloadAsset(assetId);
            }
        }

        // Enforce cache size limits
        if (this.currentCacheSize > this.cacheSize) {
            this.evictOldAssets();
        }
    }

    private evictOldAssets(): void {
        // Implement LRU eviction
        const assetsByAge = Array.from(this.loadedAssets)
            .map(assetId => ({ id: assetId, asset: this.assets.get(assetId)! }))
            .sort((a, b) => a.asset.lastAccessed - b.asset.lastAccessed);

        let freedSpace = 0;
        const targetSize = this.cacheSize * 0.8; // Target 80% of max size

        for (const { id, asset } of assetsByAge) {
            if (this.currentCacheSize - freedSpace <= targetSize) break;
            this.unloadAsset(id);
            freedSpace += asset.estimatedSize * 1024;
        }

        console.log(`[AssetPreloader] Evicted ${(freedSpace / 1024 / 1024).toFixed(1)}MB of old assets`);
    }

    // Public API
    getLoadedAssets(): string[] {
        return Array.from(this.loadedAssets);
    }

    getPreloadedAssets(): string[] {
        return Array.from(this.preloadedAssets);
    }

    isAssetLoaded(assetId: string): boolean {
        return this.loadedAssets.has(assetId);
    }

    getCacheStats() {
        return {
            loadedCount: this.loadedAssets.size,
            preloadedCount: this.preloadedAssets.size,
            cacheSizeMB: (this.currentCacheSize / 1024 / 1024).toFixed(2),
            activePreloads: this.activePreloads.size,
        };
    }
}

// Singleton instance
export const assetPreloader = new IntelligentAssetPreloader();
