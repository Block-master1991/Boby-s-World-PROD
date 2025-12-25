'use client';

import React, { useEffect, useRef, useCallback } from 'react';
import type { PublicKey } from '@solana/web3.js';
import {
    THREE,
    Scene,
    PerspectiveCamera,
    WebGLRenderer,
    Clock,
    Vector3,
    AnimationMixer,
    Mesh,
    Group,
    Object3D,
    BoxGeometry,
    MeshStandardMaterial,
    Color,
} from '@/lib/three-chunk';

import { Octree } from '@/lib/Octree'; // Import Octree
import { GameObject } from '@/types/game';

import { useDogLogic } from '@/hooks/useDogLogic';
import { useCoinLogic } from '@/hooks/useCoinLogic';
import { useEnemyLogic } from '@/hooks/useEnemyLogic';
import { useCameraLogic } from '@/hooks/useCameraLogic';
import { useSceneSetup } from '@/hooks/useSceneSetup';
import { useDynamicModelLoader } from '@/hooks/useDynamicModelLoader';

// Priority System Implementation
enum AssetPriority {
    CRITICAL = 0,    // Game can't start without these
    HIGH = 1,        // Important but can wait
    MEDIUM = 2,      // Nice to have
    LOW = 3          // Background loading
}

// Intelligent Cache System
class IntelligentCacheManager {
    private cache = new Map<string, { data: any; timestamp: number; accessCount: number; size: number }>();
    private accessOrder = new Array<string>();
    private maxSize = 50 * 1024 * 1024; // 50MB max cache size
    private currentSize = 0;

    // Cache hit/miss statistics
    private stats = {
        hits: 0,
        misses: 0,
        evictions: 0,
        sizeReductions: 0
    };

    async get(key: string, fetcher: () => Promise<any>, sizeEstimator?: (data: any) => number): Promise<any> {
        // Check cache first
        const cached = this.cache.get(key);
        if (cached) {
            // Cache hit - update access statistics
            cached.accessCount++;
            cached.timestamp = Date.now();

            // Move to end of access order (most recently used)
            this.updateAccessOrder(key);

            this.stats.hits++;
            console.log(`[CacheManager] Cache hit for ${key} (size: ${(cached.size / 1024).toFixed(1)}KB)`);
            return cached.data;
        }

        // Cache miss
        this.stats.misses++;

        try {
            // Fetch the data
            const data = await fetcher();

            // Estimate size if not provided
            const estimatedSize = sizeEstimator ? sizeEstimator(data) : this.estimateSize(data);

            // Store in cache if we have space
            await this.store(key, data, estimatedSize);

            console.log(`[CacheManager] Cache miss for ${key}, loaded and cached (${(estimatedSize / 1024).toFixed(1)}KB)`);
            return data;

        } catch (error) {
            console.warn(`[CacheManager] Failed to load ${key}:`, error);
            throw error;
        }
    }

    private async store(key: string, data: any, size: number): Promise<void> {
        // Evict if necessary
        if (this.currentSize + size > this.maxSize) {
            await this.evictToFit(size);
        }

        // Store the data
        this.cache.set(key, {
            data,
            timestamp: Date.now(),
            accessCount: 1,
            size
        });
        this.currentSize += size;
        this.updateAccessOrder(key);

        console.log(`[CacheManager] Stored ${key} in cache. Total cached: ${this.cache.size} items, ${(this.currentSize / 1024 / 1024).toFixed(1)}MB`);
    }

    private updateAccessOrder(key: string): void {
        // Remove from current position
        const index = this.accessOrder.indexOf(key);
        if (index > -1) {
            this.accessOrder.splice(index, 1);
        }

        // Add to end (most recently used)
        this.accessOrder.push(key);
    }

    private async evictToFit(neededSpace: number): Promise<void> {
        while (this.currentSize + neededSpace > this.maxSize && this.cache.size > 0) {
            // Evict least recently used item
            const keyToEvict = this.accessOrder.shift();
            if (keyToEvict) {
                const evicted = this.cache.get(keyToEvict);
                if (evicted) {
                    // Dispose of the data if it has a dispose method
                    await this.safeDispose(evicted.data);

                    this.currentSize -= evicted.size;
                    this.cache.delete(keyToEvict);
                    this.stats.evictions++;

                    console.log(`[CacheManager] Evicted ${keyToEvict} to free ${(evicted.size / 1024).toFixed(1)}KB`);
                }
            }
        }
    }

    private async safeDispose(data: any): Promise<void> {
        try {
            if (data && typeof data.dispose === 'function') {
                data.dispose();
            }
        } catch (error) {
            console.warn('[CacheManager] Error disposing cached data:', error);
        }
    }

    private estimateSize(data: any): number {
        if (data instanceof ArrayBuffer) {
            return data.byteLength;
        }
        if (data instanceof Uint8Array || data instanceof Uint16Array || data instanceof Float32Array) {
            return data.byteLength;
        }
        if (data && typeof data === 'object') {
            // Rough estimation for objects
            return JSON.stringify(data).length * 2; // Assume 2 bytes per character
        }
        return 1024; // 1KB default
    }

    // Periodic cleanup and cache maintenance
    async maintenanceCleanup(): Promise<void> {
        const now = Date.now();
        const maxAge = 10 * 60 * 1000; // 10 minutes
        const itemsToRemove: string[] = [];

        // Find old items
        for (const [key, value] of this.cache.entries()) {
            if (now - value.timestamp > maxAge) {
                itemsToRemove.push(key);
            }
        }

        // Remove old items
        for (const key of itemsToRemove) {
            const item = this.cache.get(key);
            if (item) {
                await this.safeDispose(item.data);
                this.currentSize -= item.size;
                this.cache.delete(key);

                const index = this.accessOrder.indexOf(key);
                if (index > -1) {
                    this.accessOrder.splice(index, 1);
                }

                this.stats.evictions++;
            }
        }

        console.log(`[CacheManager] Maintenance cleanup: removed ${itemsToRemove.length} old items`);
    }

    getStats() {
        const hitRate = (this.stats.hits + this.stats.misses) > 0 ?
            (this.stats.hits / (this.stats.hits + this.stats.misses)) * 100 : 0;

        return {
            ...this.stats,
            hitRate: hitRate.toFixed(1) + '%',
            itemsCached: this.cache.size,
            currentSizeMB: (this.currentSize / 1024 / 1024).toFixed(2),
            maxSizeMB: (this.maxSize / 1024 / 1024).toFixed(2)
        };
    }

    clear(): Promise<void> {
        return new Promise((resolve) => {
            // Dispose all cached items
            const disposePromises = Array.from(this.cache.values()).map(item =>
                this.safeDispose(item.data)
            );

            Promise.all(disposePromises).then(() => {
                this.cache.clear();
                this.accessOrder = [];
                this.currentSize = 0;
                this.stats = { hits: 0, misses: 0, evictions: 0, sizeReductions: 0 };
                console.log('[CacheManager] Cache cleared');
                resolve();
            });
        });
    }
}

interface AssetManifestEntry {
    id: string;
    name: string;
    url?: string;
    type: 'model' | 'audio' | 'texture' | 'other';
    priority: AssetPriority;
    dependencies?: string[];
    estimatedSize?: number; // KB
    loadFunction: () => Promise<any>;
}

interface LoadingProgress {
    totalAssets: number;
    loadedAssets: number;
    currentPhase: string;
    priorityProgress: { [key in AssetPriority]: number };
}

class PriorityAssetLoader {
    private manifest: AssetManifestEntry[] = [];
    private loadedAssets: Set<string> = new Set();
    private loadingQueue: AssetManifestEntry[] = [];
    private activeLoads = new Map<string, Promise<any>>();
    private maxConcurrentLoads = 3; // Allow 3 parallel loads

    constructor(
        private rendererRef: React.MutableRefObject<THREE.WebGLRenderer | null>,
        private cameraRef: React.MutableRefObject<THREE.PerspectiveCamera | null>,
        private initializeDog: () => Promise<void>,
        private initializeCoins: () => Promise<void>,
        private initializeEnemies: () => Promise<void>
    ) {
        this.initializeAssetManifest();
    }

    private initializeAssetManifest() {
        this.manifest = [
            // CRITICAL ASSETS - Game cannot start without these
            {
                id: 'modelLoader',
                name: '3D Engine System',
                type: 'other' as const,
                priority: AssetPriority.CRITICAL,
                estimatedSize: 50,
                loadFunction: async () => this.loadModelLoader()
            },
            {
                id: 'dog',
                name: 'Player Character',
                type: 'model' as const,
                priority: AssetPriority.CRITICAL,
                dependencies: ['modelLoader'],
                estimatedSize: 500,
                loadFunction: async () => this.loadDog()
            },
            {
                id: 'skyboxHDR',
                name: 'Atmospheric HDR Sky',
                type: 'texture' as const,
                priority: AssetPriority.CRITICAL,
                estimatedSize: 2000, // 8K HDR is large
                loadFunction: async () => this.loadSkyboxHDR()
            },

            // HIGH PRIORITY ASSETS - Important for core gameplay
            {
                id: 'coin',
                name: 'Coin Objects',
                type: 'model' as const,
                priority: AssetPriority.HIGH,
                dependencies: ['modelLoader'],
                estimatedSize: 200,
                loadFunction: async () => this.loadCoin()
            },
            {
                id: 'basicEnemies',
                name: 'Core Enemy Types',
                type: 'model' as const,
                priority: AssetPriority.HIGH,
                dependencies: ['modelLoader'],
                estimatedSize: 800,
                loadFunction: async () => this.loadBasicEnemies()
            },

            // MEDIUM PRIORITY ASSETS - Enhanced gameplay features
            {
                id: 'audio',
                name: 'Audio System',
                type: 'audio' as const,
                priority: AssetPriority.MEDIUM,
                estimatedSize: 100,
                loadFunction: async () => this.loadAudioSystem()
            },
            {
                id: 'additionalEnemies',
                name: 'Additional Enemy Types',
                type: 'model' as const,
                priority: AssetPriority.MEDIUM,
                dependencies: ['modelLoader'],
                estimatedSize: 600,
                loadFunction: async () => this.loadAdditionalEnemies()
            },

            // LOW PRIORITY ASSETS - Background enhancements
            {
                id: 'worldEnvironment',
                name: 'World Environment',
                type: 'other' as const,
                priority: AssetPriority.LOW,
                dependencies: ['modelLoader'],
                estimatedSize: 1000,
                loadFunction: async () => this.loadWorldEnvironment()
            }
        ];
    }

    private async loadModelLoader(): Promise<void> {
        if (!this.rendererRef.current || !this.cameraRef.current) {
            throw new Error("Renderer or Camera not available");
        }
        await modelLoader.initialize(this.rendererRef.current, this.cameraRef.current);
    }

    private async loadDog(): Promise<void> {
        await this.initializeDog();
    }

    private async loadSkyboxHDR(): Promise<void> {
        // This is a placeholder since the actual loading happens in Environment initialization
        // We will wait for it in the setupGameWorldAndComplete function
        return Promise.resolve();
    }

    private async loadCoin(): Promise<void> {
        await this.initializeCoins();
    }

    private async loadBasicEnemies(): Promise<void> {
        // Only load essential enemy types for now
        await this.initializeEnemies();
    }

    private async loadAudioSystem(): Promise<void> {
        // Simulate audio system loading
        await new Promise(resolve => setTimeout(resolve, 200));
    }

    private async loadAdditionalEnemies(): Promise<void> {
        // Additional enemy types can be loaded here later
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    private async loadWorldEnvironment(): Promise<void> {
        // World environment preparation
        await new Promise(resolve => setTimeout(resolve, 200));
    }

    // Smart Dependency Resolution System
    private async resolveDependencies(entry: AssetManifestEntry, loadingStack: Set<string> = new Set()): Promise<void> {
        if (loadingStack.has(entry.id)) {
            throw new Error(`Circular dependency detected: ${entry.id}`);
        }

        if (!entry.dependencies || entry.dependencies.length === 0) {
            return;
        }

        loadingStack.add(entry.id);

        for (const depId of entry.dependencies) {
            if (!this.loadedAssets.has(depId)) {
                const depEntry = this.manifest.find(asset => asset.id === depId);
                if (!depEntry) {
                    throw new Error(`Dependency ${depId} not found in manifest`);
                }

                console.log(`[DependencyManager] Loading dependency ${depId} for ${entry.id}`);

                // Recursively resolve dependencies of the dependency
                await this.resolveDependencies(depEntry, loadingStack);

                // Load the dependency
                await this.loadAsset(depEntry);
            }
        }

        loadingStack.delete(entry.id);
    }

    // Intelligent Retry System
    private async loadAssetWithRetry(
        asset: AssetManifestEntry,
        maxRetries: number = 3,
        onProgress?: (progress: number, phase: string, currentAsset?: string, loadedAssets?: number, totalAssets?: number) => void
    ): Promise<void> {
        let lastError: Error | null = null;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                // Resolve dependencies first
                await this.resolveDependencies(asset);

                // Attempt to load
                await asset.loadFunction();

                // Success
                this.loadedAssets.add(asset.id);
                return;

            } catch (error) {
                lastError = error as Error;
                console.warn(`[RetryLogic] Attempt ${attempt} failed for ${asset.id}:`, error);

                // Wait with exponential backoff
                if (attempt < maxRetries) {
                    const backoffMs = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
                    await new Promise(resolve => setTimeout(resolve, backoffMs));
                }
            }
        }

        // All retries failed
        throw new Error(`Failed to load ${asset.id} after ${maxRetries} attempts: ${lastError?.message}`);
    }

    // Helper functions to make non-async functions async
    private makeAsync(fn: () => void): () => Promise<void> {
        return async () => fn();
    }

    async loadAssetsByPriority(
        onProgress: (progress: number, phase: string, currentAsset?: string, loadedAssets?: number, totalAssets?: number) => void
    ): Promise<void> {
        const assetsByPriority = this.groupAssetsByPriority();
        const totalAssets = this.manifest.length;
        let loadedCount = 0;

        // Load CRITICAL assets first (sequential, blocking)
        if (assetsByPriority[AssetPriority.CRITICAL]) {
            onProgress(5, 'system');
            for (const asset of assetsByPriority[AssetPriority.CRITICAL]) {
                await this.loadAsset(asset, onProgress);
                loadedCount++;
                const progress = Math.round((loadedCount / totalAssets) * 25); // 0-25%
                onProgress(progress, 'system', undefined, loadedCount, totalAssets);
            }
        }

        // Load HIGH priority assets in parallel
        if (assetsByPriority[AssetPriority.HIGH]) {
            onProgress(25, 'graphics');
            await Promise.all(
                assetsByPriority[AssetPriority.HIGH].map(asset => this.loadAsset(asset, onProgress))
            );
            loadedCount += assetsByPriority[AssetPriority.HIGH].length;
            const progress = Math.round((loadedCount / totalAssets) * 50); // 25-50%
            onProgress(progress, 'graphics', undefined, loadedCount, totalAssets);
        }

        // Load MEDIUM priority assets
        if (assetsByPriority[AssetPriority.MEDIUM]) {
            onProgress(50, 'audio');
            await Promise.all(
                assetsByPriority[AssetPriority.MEDIUM].map(asset => this.loadAsset(asset, onProgress))
            );
            loadedCount += assetsByPriority[AssetPriority.MEDIUM].length;
            const progress = Math.round((loadedCount / totalAssets) * 75); // 50-75%
            onProgress(progress, 'audio', undefined, loadedCount, totalAssets);
        }

        // Load LOW priority assets in background (no progress updates to avoid conflicts)
        if (assetsByPriority[AssetPriority.LOW]) {
            // Don't await - these can load in background and don't affect progress
            Promise.all(
                assetsByPriority[AssetPriority.LOW].map(asset => this.loadAsset(asset, onProgress))
            ).then(() => {
                loadedCount += assetsByPriority[AssetPriority.LOW].length;
                // Don't send progress update to avoid conflicts with main loading
            }).catch(console.error);
        }
    }

    private groupAssetsByPriority(): { [key in AssetPriority]: AssetManifestEntry[] } {
        const grouped: { [key in AssetPriority]: AssetManifestEntry[] } = {
            [AssetPriority.CRITICAL]: [],
            [AssetPriority.HIGH]: [],
            [AssetPriority.MEDIUM]: [],
            [AssetPriority.LOW]: []
        };

        this.manifest.forEach(asset => {
            grouped[asset.priority].push(asset);
        });

        return grouped;
    }

    private async loadAsset(asset: AssetManifestEntry, onProgress?: (progress: number, phase: string, currentAsset?: string, loadedAssets?: number, totalAssets?: number) => void): Promise<void> {
        if (this.loadedAssets.has(asset.id)) {
            return; // Already loaded
        }

        try {
            // Check dependencies
            if (asset.dependencies) {
                for (const dep of asset.dependencies) {
                    if (!this.loadedAssets.has(dep)) {
                        console.warn(`[PriorityAssetLoader] Dependency ${dep} not loaded for ${asset.id}, loading it first`);
                        const depAsset = this.manifest.find(a => a.id === dep);
                        if (depAsset) {
                            await this.loadAsset(depAsset, onProgress);
                        }
                    }
                }
            }

            console.log(`[PriorityAssetLoader] Loading ${asset.name} (${asset.type})`);
            await asset.loadFunction();
            this.loadedAssets.add(asset.id);

        } catch (error) {
            console.error(`[PriorityAssetLoader] Failed to load asset ${asset.id}:`, error);
            // Continue with other assets instead of failing completely
        }
    }

    isAssetLoaded(assetId: string): boolean {
        return this.loadedAssets.has(assetId);
    }

    getLoadedCount(): number {
        return this.loadedAssets.size;
    }
}
import { useFloatingEffects } from '@/hooks/useFloatingEffects'; // New import
import { useDogParticles } from '@/hooks/useDogParticles'; // New import
import { useAnalytics } from '@/hooks/useAnalytics'; // Analytics integration
import DogSpeedBeam from '@/components/game/DogSpeedBeam'; // New import
import DogShieldEffect from '@/components/game/DogShieldEffect'; // New import
import { assetPreloader } from '@/lib/assetPreloader'; // Asset preloader
import { initializeGPUInstancing, getGPUInstancingManager } from '@/lib/gpu-instancing'; // GPU instancing
import { initializeLODManager, getLODManager } from '@/lib/lod-manager'; // LOD manager
import { initializeObjectPooling, getMemoryMonitor, getObjectPoolingStats } from '@/lib/object-pooling'; // Object pooling
// CDN Integration System
class CDNManager {
    private userRegion: string = 'US';

    constructor() {
        this.detectUserRegion();
    }

    private async detectUserRegion() {
        try {
            // Try to detect user's region via Cloudflare's geo service or similar
            // Added timeout to prevent hanging indefinitely
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

            const response = await fetch('https://www.cloudflare.com/cdn-cgi/trace', {
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            const text = await response.text();
            const matched = text.match(/loc=([A-Z]{2})/);
            if (matched) {
                this.userRegion = matched[1];
            }
        } catch (error) {
            // Fallback to US
            console.log('[CDNManager] Could not detect user region, using fallback');
        }
    }

    getOptimalAssetUrl(assetPath: string): string {
        if (!CDN_CONFIG.enabled) {
            return assetPath; // Use local assets
        }

        // Use geo-based routing
        let regionUrl = CDN_CONFIG.cloudflare.baseUrl;

        // Map region codes to continents
        const continentMap: { [key: string]: 'EU' | 'AS' | 'default' } = {
            'AT': 'EU', 'BE': 'EU', 'BG': 'EU', 'HR': 'EU', 'CY': 'EU',
            'CZ': 'EU', 'DK': 'EU', 'EE': 'EU', 'FI': 'EU', 'FR': 'EU',
            'DE': 'EU', 'GR': 'EU', 'HU': 'EU', 'IS': 'EU', 'IE': 'EU',
            'IT': 'EU', 'LV': 'EU', 'LI': 'EU', 'LT': 'EU', 'LU': 'EU',
            'MT': 'EU', 'NL': 'EU', 'NO': 'EU', 'PL': 'EU', 'PT': 'EU',
            'RO': 'EU', 'SK': 'EU', 'SI': 'EU', 'ES': 'EU', 'SE': 'EU',
            'CH': 'EU', 'GB': 'EU', 'GI': 'EU',

            'CN': 'AS', 'JP': 'AS', 'KR': 'AS', 'SG': 'AS', 'HK': 'AS',
            'TW': 'AS', 'TH': 'AS', 'VN': 'AS', 'MY': 'AS', 'ID': 'AS',
            'PH': 'AS', 'IN': 'AS', 'PK': 'AS', 'BD': 'AS', 'LK': 'AS',
            'NP': 'AS', 'MM': 'AS', 'KH': 'AS', 'LA': 'AS'
        };

        const continent = continentMap[this.userRegion] || 'default';

        // Build full CDN URL with cache-busting for development
        const cacheBuster = process.env.NODE_ENV === 'development' ? `?v=${Date.now()}` : '';
        const fullUrl = `${regionUrl}${assetPath}${cacheBuster}`;

        console.log(`[CDNManager] Serving asset from ${continent} region: ${fullUrl}`);
        return fullUrl;
    }

    preloadRegionalAssets(): void {
        if (!CDN_CONFIG.enabled) return;

        const continentMap: { [key: string]: 'EU' | 'AS' | 'default' } = {
            'AT': 'EU', 'BE': 'EU', 'BG': 'EU', 'HR': 'EU', 'CY': 'EU',
            'CZ': 'EU', 'DK': 'EU', 'EE': 'EU', 'FI': 'EU', 'FR': 'EU',
            'DE': 'EU', 'GR': 'EU', 'HU': 'EU', 'IS': 'EU', 'IE': 'EU',
            'IT': 'EU', 'LV': 'EU', 'LI': 'EU', 'LT': 'EU', 'LU': 'EU',
            'MT': 'EU', 'NL': 'EU', 'NO': 'EU', 'PL': 'EU', 'PT': 'EU',
            'RO': 'EU', 'SK': 'EU', 'SI': 'EU', 'ES': 'EU', 'SE': 'EU',
            'CH': 'EU', 'GB': 'EU', 'GI': 'EU',

            'CN': 'AS', 'JP': 'AS', 'KR': 'AS', 'SG': 'AS', 'HK': 'AS',
            'TW': 'AS', 'TH': 'AS', 'VN': 'AS', 'MY': 'AS', 'ID': 'AS',
            'PH': 'AS', 'IN': 'AS', 'PK': 'AS', 'BD': 'AS', 'LK': 'AS',
            'NP': 'AS', 'MM': 'AS', 'KH': 'AS', 'LA': 'AS'
        };

        const continent = continentMap[this.userRegion] || 'default';
        const regionalAssets = CDN_CONFIG.regionalPreload[continent] || CDN_CONFIG.regionalPreload['default'];

        // Preload regional manifest
        regionalAssets.forEach(assetPath => {
            const preloadLink = document.createElement('link');
            preloadLink.rel = 'preload';
            preloadLink.href = this.getOptimalAssetUrl(assetPath);
            preloadLink.as = 'fetch';
            document.head.appendChild(preloadLink);
        });
    }
}

import { ASSET_COMPRESSION_CONFIG, CDN_CONFIG } from '@/lib/constants';

import { getChunkCoordinates } from '@/lib/chunkUtils'; // Import chunk utilities
import { modelLoader } from '@/utils/modelLoader'; // Import modelLoader
import { Environment } from '@/lib/ez-tree/environment/environment'; // Import ez-tree Environment
import { getDevicePerformanceConfig } from '@/lib/utils'; // Import performance config
// Removed unused import ChunkManager
// Removed ez-tree specific imports as they are now managed by Environment
// import { Tree } from '@/lib/ez-tree/tree';
// import { TreePreset } from '@/lib/ez-tree/presets';
// import { GrassOptions, Grass } from '@/lib/ez-tree/environment/grass';
// import { RockOptions as RocksOptions, Rocks } from '@/lib/ez-tree/environment/rocks';
// import { TreesOptions, Trees } from '@/lib/ez-tree/environment/trees';
interface GameCanvasProps {
    sessionPublicKey: PublicKey | null;
    isSpeedBoostActive: boolean;
    isShieldActive: boolean;
    isCoinMagnetActive: boolean;
    COIN_MAGNET_RADIUS: number;
    onCoinCollected: () => void;
    onRemainingCoinsUpdate: (remaining: number) => void;
    isPaused: boolean;
    joystickInput: { x: number; y: number } | null;
    onCanvasTouchStart: (screenX: number, screenY: number) => void;
    onCanvasTouchMove: (deltaX: number, deltaY: number) => void;
    onCanvasTouchEnd: () => void;
    protectionBottleCount: number;
    onConsumeProtectionBottle: () => void;
    onEnemyCollisionPenalty: () => void;
    COIN_COUNT: number;
    octreeRef: React.MutableRefObject<Octree<GameObject> | null>; // Added Octree ref
    onLoadStart: () => void;
    onLoadProgress: (progress: number, phase?: string) => void;
    onLoadComplete: (success: boolean) => void;
}

const GameCanvas: React.FC<GameCanvasProps> = ({
    sessionPublicKey,
    isSpeedBoostActive,
    isShieldActive,
    isCoinMagnetActive,
    COIN_MAGNET_RADIUS,
    onCoinCollected: onCoinCollectedProp,
    onRemainingCoinsUpdate: onRemainingCoinsUpdateProp,
    isPaused,
    joystickInput: joystickInputFromUI,
    onCanvasTouchStart: onCanvasTouchStartProp,
    onCanvasTouchMove: onCanvasTouchMoveProp,
    onCanvasTouchEnd: onCanvasTouchEndProp,
    protectionBottleCount,
    onConsumeProtectionBottle: onConsumeProtectionBottleProp,
    onEnemyCollisionPenalty: onEnemyCollisionPenaltyProp,
    COIN_COUNT,
    octreeRef, // Destructure octreeRef
    onLoadStart,
    onLoadProgress,
    onLoadComplete,
}) => {
    const mountRef = useRef<HTMLDivElement>(null);
    const animationFrameId = useRef<number | null>(null);

    const sceneRef = useRef<THREE.Scene | null>(null);
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    // controlsRef is no longer needed
    // import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

    const clockRef = useRef(new THREE.Clock());
    const keysPressedRef = useRef<{ [key: string]: boolean }>({});
    const dogMeshRef = useRef<THREE.Object3D | null>(null); // Ref for the dog's 3D model

    // FPS limiter for performance optimization
    const lastFrameTimeRef = useRef<number>(0);

    // Asset preloading timing
    const lastPreloadTimeRef = useRef<number>(0);
    const preloadIntervalRef = useRef<number>(1000); // Preload every 1 second

    const handleKeyDownCbRef = useRef<((event: KeyboardEvent) => void) | null>(null);
    const handleKeyUpCbRef = useRef<((event: KeyboardEvent) => void) | null>(null);

    const speedBeamRef = useRef<DogSpeedBeam | null>(null); // Ref for speed beam instance
    const shieldEffectRef = useRef<DogShieldEffect | null>(null); // Ref for shield effect instance

    const isSpeedBoostActiveRef = useRef(isSpeedBoostActive);
    const isShieldActiveRef = useRef(isShieldActive);
    const isCoinMagnetActiveRef = useRef(isCoinMagnetActive);
    const isPausedRef = useRef(isPaused);
    const joystickInputRef = useRef(joystickInputFromUI);
    const protectionBottleCountRef = useRef(protectionBottleCount);
    const isJoystickInteractionActiveRef = useRef(false);

    const prevSessionPublicKeyRef = useRef<PublicKey | null>(null);
    const initialTouchPointRef = useRef<{ x: number, y: number, id: number } | null>(null);

    // --- Prop to Ref synchronization ---
    useEffect(() => { isSpeedBoostActiveRef.current = isSpeedBoostActive; }, [isSpeedBoostActive]);
    useEffect(() => { isShieldActiveRef.current = isShieldActive; }, [isShieldActive]);
    useEffect(() => { isCoinMagnetActiveRef.current = isCoinMagnetActive; }, [isCoinMagnetActive]);
    useEffect(() => { protectionBottleCountRef.current = protectionBottleCount; }, [protectionBottleCount]);
    useEffect(() => {
        isPausedRef.current = isPaused;
        if (isPaused && isJoystickInteractionActiveRef.current) {
            onCanvasTouchEndProp();
            isJoystickInteractionActiveRef.current = false;
            initialTouchPointRef.current = null;
        }
        if (isPaused) keysPressedRef.current = {};
    }, [isPaused, onCanvasTouchEndProp]);
    useEffect(() => { joystickInputRef.current = joystickInputFromUI; }, [joystickInputFromUI]);

    // --- Callback Refs for Stable Callbacks from Props ---
    const onCoinCollectedCallbackRef = useRef(onCoinCollectedProp);
    const onRemainingCoinsUpdateCallbackRef = useRef(onRemainingCoinsUpdateProp);
    const onConsumeProtectionBottleCallbackRef = useRef(onConsumeProtectionBottleProp);
    const onEnemyCollisionPenaltyCallbackRef = useRef(onEnemyCollisionPenaltyProp);
    const onAttackAnimationFinishedCallbackRef = useRef((event: THREE.Event) => {
        // This function will be called when an enemy's attack animation finishes
        // You can add any specific logic here if needed, e.g., triggering enemy death
        // For now, it just logs the event.
        console.log("Enemy attack animation finished:", event);
    });

    useEffect(() => { onCoinCollectedCallbackRef.current = onCoinCollectedProp; }, [onCoinCollectedProp]);
    useEffect(() => { onRemainingCoinsUpdateCallbackRef.current = onRemainingCoinsUpdateProp; }, [onRemainingCoinsUpdateProp]);
    useEffect(() => { onConsumeProtectionBottleCallbackRef.current = onConsumeProtectionBottleProp; }, [onConsumeProtectionBottleProp]);
    useEffect(() => { onEnemyCollisionPenaltyCallbackRef.current = onEnemyCollisionPenaltyProp; }, [onEnemyCollisionPenaltyProp]);


    // --- Custom Hooks ---
    const { dogModelRef, lastDogTransformRef, initializeDog, updateDog, resetDogState, dogSpeed, isRunning } = useDogLogic({ // Added dogSpeed, isRunning
        sceneRef, clockRef, keysPressedRef, joystickInputRef, isPausedRef,
        isSpeedBoostActiveRef, isShieldActiveRef, isJoystickInteractionActiveRef,
        octreeRef, // Pass octreeRef
    });

    const { addFloatingEffect, updateFloatingEffects, cleanupFloatingEffects } = useFloatingEffects({ // Added new states
        sceneRef, cameraRef, dogMeshRef // Pass dogMeshRef
    });

    const { updateParticles } = useDogParticles({ // New hook for dust particles
        sceneRef, dogMeshRef, dogSpeed, isRunning // Pass dog's speed and running state
    });

    const { trackPerformance, trackGameEvent, trackUserAction, trackError } = useAnalytics();

    // Performance tracking
    const lastPerformanceUpdateRef = useRef<number>(0);
    const frameCountRef = useRef<number>(0);

    const { initializeCoins, updateCoins, coinMeshesRef, loadedCoinChunks, forceLoadAreaCoins } = useCoinLogic({ // Capture coinMeshesRef and loadedCoinChunks
        sceneRef, dogModelRef, isCoinMagnetActiveRef, COIN_MAGNET_RADIUS, COIN_COUNT,
        onCoinCollected: () => onCoinCollectedCallbackRef.current(),
        onRemainingCoinsUpdate: (remaining) => onRemainingCoinsUpdateCallbackRef.current(remaining),
        isPausedRef, octreeRef,
        addFloatingEffect, // Pass addFloatingEffect to useCoinLogic
    });

    const { initializeEnemies, updateEnemies, forceLoadAreaEnemies } = useEnemyLogic({
        sceneRef, dogModelRef, isShieldActiveRef, protectionBottleCountRef,
        onConsumeProtectionBottle: () => onConsumeProtectionBottleCallbackRef.current(),
        onEnemyCollisionPenalty: () => onEnemyCollisionPenaltyCallbackRef.current(),
        isPausedRef,
        coinMeshesRef, // Pass coinMeshesRef to useEnemyLogic
        loadedCoinChunks, // Pass loadedCoinChunks to useEnemyLogic
        onCoinCollected: () => onCoinCollectedCallbackRef.current(), // Pass onCoinCollected to useEnemyLogic
        onAttackAnimationFinished: onAttackAnimationFinishedCallbackRef.current, // Pass the new callback
        octreeRef,
        cameraRef,
        addFloatingEffect, // Pass addFloatingEffect to useEnemyLogic for penalties
    });

    const currentDogChunkRef = useRef<{ chunkX: number; chunkZ: number } | null>(null);

    const environmentRef = useRef<Environment | null>(null); // Ref for ez-tree Environment
    const lastDogPositionRef = useRef<{ x: number; z: number }>({ x: 0, z: 0 }); // Track last dog position for performance optimization

    // Destructure updateDynamicModels and cleanupModelPool from useDynamicModelLoader
    const { cleanupModelPool } = useDynamicModelLoader({
        cameraRef,
        sceneRef,
        octreeRef,
        objectsToManage: [], // This hook is used for dynamic loading, but we'll use cleanupModelPool directly
    });

    const { initializeCamera, setupInitialCameraPosition, updateCamera, resetCamera } = useCameraLogic({
        cameraRef,
        // controlsRef, // Removed
        dogModelRef,
        mountRef,
    });

    const { initializeScene, handleResize, cleanupScene: baseCleanupScene } = useSceneSetup({ // updateControlsState removed
        mountRef,
        sceneRef,
        cameraRef,
        rendererRef,
        octreeRef, // Pass octreeRef
        // controlsRef, // Removed
        isPausedRef,
        isJoystickInteractionActiveRef,
    });

    const cleanupScene = useCallback(() => {
        baseCleanupScene();
        if (environmentRef.current && sceneRef.current) {
            sceneRef.current.remove(environmentRef.current);
            // Dispose of environment resources if necessary
            // environmentRef.current.dispose(); // Assuming Environment has a dispose method
            environmentRef.current = null;
        }
        // Cleanup ChunkManager (now managed by Environment)
        if (environmentRef.current && environmentRef.current.chunkManager) {
            environmentRef.current.chunkManager.dispose();
        }
    }, [baseCleanupScene]);

    const animate = useCallback(() => {
        if (!rendererRef.current || !sceneRef.current || !cameraRef.current || !sessionPublicKey) {
            if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
            animationFrameId.current = null;
            return;
        }

        // FPS limiter for mobile devices
        const perfConfig = getDevicePerformanceConfig();
        const currentTime = performance.now();
        const frameInterval = 1000 / perfConfig.game.fpsLimit;
        const elapsed = currentTime - lastFrameTimeRef.current;

        if (perfConfig.isMobile && elapsed < frameInterval) {
            // Skip frame if not enough time has passed
            animationFrameId.current = requestAnimationFrame(animate);
            return;
        }
        lastFrameTimeRef.current = currentTime;

        // Performance tracking
        frameCountRef.current++;
        if (currentTime - lastPerformanceUpdateRef.current > 5000) { // Every 5 seconds
            const fps = frameCountRef.current / ((currentTime - lastPerformanceUpdateRef.current) / 1000);
            frameCountRef.current = 0;
            lastPerformanceUpdateRef.current = currentTime;

            // Track performance metrics
            if (rendererRef.current?.info) {
                trackPerformance({
                    fps: Math.round(fps),
                    memoryUsage: (performance as any).memory?.usedJSHeapSize || 0,
                    drawCalls: rendererRef.current.info.render.calls,
                });
            }
        }

        animationFrameId.current = requestAnimationFrame(animate);

        // updateControlsState(); // Removed

        const rawDelta = clockRef.current.getDelta(); // Get delta time
        const clampedDelta = Math.min(rawDelta, 1 / 30); // Clamp to minimum 30fps equivalent to prevent jitter
        if (dogModelRef.current && !isPausedRef.current) {
            // Update dog's mesh ref for other hooks
            dogMeshRef.current = dogModelRef.current;

            updateDog(clampedDelta); // Pass clamped delta
            updateCoins();
            updateEnemies(clampedDelta); // Pass clamped delta
            updateCamera(clampedDelta);
            updateFloatingEffects(); // Update floating effects
            updateParticles(); // Update dust particles

            // Update performance systems
            if (cameraRef.current) {
                // Update LOD manager with camera position
                const lodManager = getLODManager();
                if (lodManager) {
                    lodManager.updateCameraPosition(cameraRef.current.position);
                    lodManager.update(clampedDelta);
                }

                // Update GPU instancing
                const gpuInstancing = getGPUInstancingManager();
                if (gpuInstancing) {
                    gpuInstancing.updateInstances();
                }

                // Record memory usage for monitoring - Throttled to once every 120 frames (approx 2s at 60fps)
                const memoryMonitor = getMemoryMonitor();
                if (memoryMonitor && Math.floor(performance.now() / 16.6) % 120 === 0) {
                    memoryMonitor.recordMemoryUsage();
                }
            }

            // Update continuous effects (Speed Beam, Shield)
            if (speedBeamRef.current) {
                speedBeamRef.current.update(isSpeedBoostActiveRef.current, dogModelRef.current.position, dogModelRef.current.rotation);
            }
            if (shieldEffectRef.current) {
                shieldEffectRef.current.update(isShieldActiveRef.current, dogModelRef.current.position);
            }

            // Update ez-tree environment
            try {
                if (environmentRef.current && dogModelRef.current && cameraRef.current) {
                    const currentDogPos = dogModelRef.current.position;
                    // Update environment continuously, passing DOG position for stable shadows
                    environmentRef.current.update(clockRef.current.getElapsedTime(), currentDogPos);

                    // Update last position for chunk management, not for wind animation
                    lastDogPositionRef.current = { x: currentDogPos.x, z: currentDogPos.z };
                }
            } catch (error) {
                console.error("[GameCanvas] Error updating ez-tree environment:", error);
            }

            // Chunk management for trees and grass
            const dogPos = dogModelRef.current.position;
            const { chunkX: newChunkX, chunkZ: newChunkZ } = getChunkCoordinates(dogPos.x, dogPos.z);

            if (!currentDogChunkRef.current || newChunkX !== currentDogChunkRef.current.chunkX || newChunkZ !== currentDogChunkRef.current.chunkZ) {
                console.log(`[GameCanvas] Dog moved to new chunk: [${newChunkX}, ${newChunkZ}]`);
                currentDogChunkRef.current = { chunkX: newChunkX, chunkZ: newChunkZ };
                // Update ChunkManager via Environment
                if (environmentRef.current && environmentRef.current.chunkManager) {
                    environmentRef.current.chunkManager.updatePlayerPosition(dogPos);
                }
            }

            // Call cleanupModelPool periodically
            cleanupModelPool(60000, 5); // Clean up models idle for 60s or if pool size > 5

            // Intelligent asset preloading based on player position and movement
            const currentTime = performance.now();
            if (currentTime - lastPreloadTimeRef.current > preloadIntervalRef.current) {
                lastPreloadTimeRef.current = currentTime;

                // Calculate player velocity for predictive loading
                const velocity = {
                    x: (dogModelRef.current.position.x - lastDogPositionRef.current.x) / clampedDelta,
                    z: (dogModelRef.current.position.z - lastDogPositionRef.current.z) / clampedDelta,
                };

                // Preload assets for current position and predicted movement
                assetPreloader.preloadForPosition(
                    dogModelRef.current.position.x,
                    dogModelRef.current.position.z,
                    velocity
                ).catch(console.warn); // Don't let preloading errors break the game
            }
        }

        try {
            if (rendererRef.current && sceneRef.current && cameraRef.current) {
                rendererRef.current.render(sceneRef.current, cameraRef.current);
            }
        } catch (error) {
            console.error("[GameCanvas] Error rendering scene:", error);
            if (error instanceof Error) {
                console.error("Error Name:", error.name);
                console.error("Error Message:", error.message);
                console.error("Error Stack:", error.stack);
            }
            if (animationFrameId.current) {
                cancelAnimationFrame(animationFrameId.current);
                animationFrameId.current = null;
            }
        }
    }, [sessionPublicKey, updateDog, updateCoins, updateEnemies, updateCamera, dogModelRef, cleanupModelPool, updateFloatingEffects, updateParticles]);


    // Initialize performance systems
    useEffect(() => {
        if (cameraRef.current) {
            // Initialize GPU instancing
            initializeGPUInstancing(cameraRef.current);
            console.log('[GameCanvas] GPU Instancing initialized');

            // Initialize LOD manager
            initializeLODManager();
            console.log('[GameCanvas] LOD Manager initialized');

            // Initialize object pooling
            initializeObjectPooling();
            console.log('[GameCanvas] Object Pooling initialized');
        }
    }, []);

    // Main useEffect for initialization and re-initialization on session change
    useEffect(() => {
        if (!mountRef.current || !sessionPublicKey) {
            if (animationFrameId.current) { cancelAnimationFrame(animationFrameId.current); animationFrameId.current = null; }
            return;
        }

        const isNewSession = !prevSessionPublicKeyRef.current ||
            (sessionPublicKey && prevSessionPublicKeyRef.current && !sessionPublicKey.equals(prevSessionPublicKeyRef.current)) ||
            !rendererRef.current;

        // Initialize continuous effects classes
        if (sceneRef.current && dogModelRef.current && !speedBeamRef.current) {
            speedBeamRef.current = new DogSpeedBeam({
                scene: sceneRef.current,
                dogPosition: dogModelRef.current.position,
                dogRotation: dogModelRef.current.rotation,
            });
        }
        if (sceneRef.current && dogModelRef.current && !shieldEffectRef.current) {
            shieldEffectRef.current = new DogShieldEffect({
                scene: sceneRef.current,
                dogPosition: dogModelRef.current.position,
            });
        }

        const loadAllGameAssets = async () => {
            onLoadStart();

            try {
                // Create PriorityAssetLoader instance with required dependencies
                const assetLoader = new PriorityAssetLoader(
                    rendererRef,
                    cameraRef,
                    async () => initializeDog(),
                    async () => initializeCoins(),
                    async () => initializeEnemies()
                );

                // Load assets using priority system
                await assetLoader.loadAssetsByPriority(onLoadProgress);

                // After priority loading, continue with world preparation
                onLoadProgress(85, 'world');
                console.log("[GameCanvas] Starting World Environment preparation...");

                // After all assets are loaded, set up camera and chunks and preload world
                const setupGameWorldAndComplete = async () => {
                    // 🌌 Wait for 8K HDR Skybox to complete loading if environment exists
                    if (environmentRef.current?.skybox.loadingPromise) {
                        console.log("[GameCanvas] 🌌 Waiting for 8K HDR Skybox to complete loading...");
                        await environmentRef.current.skybox.loadingPromise;
                        console.log("[GameCanvas] 🌌 8K HDR Skybox READY.");
                    }

                    if (dogModelRef.current) {
                        console.log("[GameCanvas] 🐶 Dog model available, setting up game world...");

                        const dogPos = dogModelRef.current.position;
                        const { chunkX, chunkZ } = getChunkCoordinates(dogPos.x, dogPos.z);
                        currentDogChunkRef.current = { chunkX, chunkZ };

                        console.log(`[GameCanvas] 📍 Dog positioned at: ${dogPos.x.toFixed(1)}, ${dogPos.y.toFixed(1)}, ${dogPos.z.toFixed(1)}`);
                        console.log(`[GameCanvas] 🎯 Current chunk: ${chunkX}, ${chunkZ}`);

                        // Final step: ensure world is preloaded before showing game - wait for complete world preload
                        console.log("[GameCanvas] 🏗️ Starting complete world preload...");
                        if (environmentRef.current) {
                            try {
                                // Professional solution: Simplified approach using timeout with proper interval cleanup
                                const preloadTimeoutPromise = new Promise<boolean>((resolve) => {
                                    // Start the preload with a catch to prevent unhandled rejection errors
                                    const preloadPromise = environmentRef.current!.preloadInitialScene(dogPos).catch(err => {
                                        console.warn("[GameCanvas] ⚠️ Initial scene preload had errors, but continuing game start:", err);
                                        return; // Ensure it resolves even on error
                                    });

                                    // Use a professional timeout-based approach (increased for 8K HDR stability)
                                    setTimeout(() => {
                                        resolve(true);
                                    }, 20000);
                                });

                                // Smooth progress during preload
                                let progress = 85;
                                let intervalCleared = false;
                                const progressInterval = setInterval(() => {
                                    // Safety check - don't continue if already cleared
                                    if (intervalCleared) {
                                        clearInterval(progressInterval);
                                        return;
                                    }

                                    progress = Math.min(90, progress + 1);
                                    onLoadProgress(progress, 'world');
                                }, 1200);

                                onLoadProgress(90, 'optimizing');

                                // Wait for timeout to complete, then clear interval
                                await preloadTimeoutPromise.finally(() => {
                                    // Always clear the progress interval
                                    intervalCleared = true;
                                    clearInterval(progressInterval);
                                });

                                onLoadProgress(95, 'finalizing');

                                // Force load coins and enemies for the initial area to ensure everything is ready
                                const { chunkX: centerX, chunkZ: centerZ } = getChunkCoordinates(dogPos.x, dogPos.z);
                                console.log(`[GameCanvas] 🔄 Force loading game objects for initial area around chunk ${centerX}, ${centerZ}`);

                                await Promise.all([
                                    forceLoadAreaCoins(centerX, centerZ),
                                    forceLoadAreaEnemies(centerX, centerZ)
                                ]);

                                onLoadProgress(100, 'optimizing');

                                // Setup camera position after the timeout (camera zoom animation)
                                setupInitialCameraPosition();

                                console.log("[GameCanvas] 🎮 Starting game after 100% progress completion...");
                                onLoadComplete(true);
                            } catch (error) {
                                console.error("[GameCanvas] ❌ World preload failed critically:", error);
                                const err = error as Error;
                                console.error("❌ Preload error details:", err.message, err.stack);

                                // Even on failure, force success after progress is 100%
                                console.log("[GameCanvas] 🔄 Force success on error (progress reached 100%)");
                                onLoadComplete(true);
                            }
                        } else {
                            console.error("[GameCanvas] ❌ Environment not available for preload");
                            onLoadComplete(false);
                        }
                    } else {
                        console.log("[GameCanvas] ⏳ Waiting for dog model and skybox to be ready...");
                        setTimeout(setupGameWorldAndComplete, 100);
                    }
                };

                await setupGameWorldAndComplete();

            } catch (error) {
                console.error("[GameCanvas] Critical error during asset loading:", error);
                onLoadComplete(false); // Signal failure
            }
        };

        if (isNewSession) {
            console.log("[GameCanvas] New session or first load. Initializing scene elements.");

            if (rendererRef.current) cleanupScene();

            resetDogState();
            resetCamera();
            // loadedEzTreeChunksRef.current.clear(); // Clear ez-tree chunks - now managed by Environment

            initializeCamera();
            const sceneInitialized = initializeScene();

            if (sceneInitialized && cameraRef.current && rendererRef.current && sceneRef.current) {
                // Initialize ez-tree environment
                try {
                    environmentRef.current = new Environment();
                    sceneRef.current.add(environmentRef.current);
                    console.log("[GameCanvas] ez-tree Environment Initialized.");
                } catch (error) {
                    console.error("[GameCanvas] Error initializing ez-tree environment:", error);
                    environmentRef.current = null;
                }

                // Update environment with new chunk options (now handled internally by Environment)
                if (environmentRef.current && dogModelRef.current) {
                    const dogPos = dogModelRef.current.position;
                    environmentRef.current.chunkManager.updatePlayerPosition(dogPos);
                }

                try {
                    loadAllGameAssets();
                } catch (err) {
                    console.error("[GameCanvas] Failed to initialize scene, camera, or renderer. Aborting further setup.", err);
                    onLoadComplete(false);
                    return;
                }
            }
        } else if (dogModelRef.current && lastDogTransformRef.current && sessionPublicKey && !isNewSession && !isPaused) {
            dogModelRef.current.position.copy(lastDogTransformRef.current.position);
            dogModelRef.current.rotation.y = lastDogTransformRef.current.rotationY;
            if (cameraRef.current) {
                setupInitialCameraPosition();
            }
        }

        prevSessionPublicKeyRef.current = sessionPublicKey;

        if (!animationFrameId.current && rendererRef.current && sceneRef.current && cameraRef.current) {
            animate();
        }

    }, [
        sessionPublicKey,
        initializeDog, resetDogState, initializeCoins, initializeEnemies, initializeCamera, setupInitialCameraPosition, resetCamera,
        initializeScene, cleanupScene,
        dogModelRef, lastDogTransformRef,
        cameraRef, rendererRef,
        onLoadStart, onLoadProgress, onLoadComplete,
        addFloatingEffect, updateFloatingEffects, cleanupFloatingEffects,
        updateParticles,
        isSpeedBoostActive, isShieldActive,
        isPaused,
        animate,
        handleResize,
        onCanvasTouchStartProp, onCanvasTouchMoveProp, onCanvasTouchEndProp,
        isPausedRef, isJoystickInteractionActiveRef,
        handleKeyDownCbRef, handleKeyUpCbRef, keysPressedRef,
        mountRef, speedBeamRef, shieldEffectRef
    ]);

    // Effect for handling resize
    useEffect(() => {
        window.addEventListener('resize', handleResize);
        handleResize();
        return () => {
            window.removeEventListener('resize', handleResize);
        };
    }, [handleResize]);

    // Effect for handling global unhandled rejections for better debugging
    useEffect(() => {
        const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
            console.error('[GameCanvas] Unhandled Promise Rejection:', event.reason);
            const error = event.reason instanceof Error ? event.reason : new Error(String(event.reason));
            trackError(error, { type: 'unhandled_rejection' });
        };

        window.addEventListener('unhandledrejection', handleUnhandledRejection);
        return () => {
            window.removeEventListener('unhandledrejection', handleUnhandledRejection);
        };
    }, [trackError]);

    // Effect for full cleanup on component unmount
    useEffect(() => {
        return () => {
            console.log("[GameCanvas] Component unmounting. Full cleanup.");
            if (animationFrameId.current) {
                cancelAnimationFrame(animationFrameId.current);
                animationFrameId.current = null;
            }
            cleanupScene(); // Use the custom cleanupScene
            cleanupFloatingEffects(); // Cleanup floating effects
            if (speedBeamRef.current) speedBeamRef.current.dispose(); // Dispose speed beam
            if (shieldEffectRef.current) shieldEffectRef.current.dispose(); // Dispose shield effect
        };
    }, [cleanupScene, cleanupFloatingEffects, animationFrameId, speedBeamRef, shieldEffectRef]);

    // Touch handling for joystick
    useEffect(() => {
        const currentMount = mountRef.current;
        if (!currentMount || !sessionPublicKey) return;

        const handleTouchStartInternal = (event: TouchEvent) => {
            if (event.touches.length === 1 && !isPausedRef.current && sessionPublicKey) {
                const touch = event.touches[0];
                isJoystickInteractionActiveRef.current = true;
                initialTouchPointRef.current = { x: touch.clientX, y: touch.clientY, id: touch.identifier };
                onCanvasTouchStartProp(touch.clientX, touch.clientY);
            }
        };
        const handleTouchMoveInternal = (event: TouchEvent) => {
            if (isJoystickInteractionActiveRef.current && initialTouchPointRef.current !== null) {
                let touch = null;
                for (let i = 0; i < event.touches.length; i++) { if (event.touches[i].identifier === initialTouchPointRef.current.id) { touch = event.touches[i]; break; } }
                if (touch) {
                    if (event.cancelable) event.preventDefault();
                    const deltaX = touch.clientX - initialTouchPointRef.current.x;
                    const deltaY = touch.clientY - initialTouchPointRef.current.y;
                    onCanvasTouchMoveProp(deltaX, deltaY);
                }
            }
        };
        const handleTouchEndInternal = (event: TouchEvent) => {
            let touchEnded = false;
            if (initialTouchPointRef.current !== null) {
                let stillTouchingWithSameId = false;
                for (let i = 0; i < event.touches.length; i++) { if (event.touches[i].identifier === initialTouchPointRef.current.id) { stillTouchingWithSameId = true; break; } }
                if (!stillTouchingWithSameId) { touchEnded = true; }
            }

            if (isJoystickInteractionActiveRef.current && touchEnded) {
                isJoystickInteractionActiveRef.current = false;
                initialTouchPointRef.current = null;
                onCanvasTouchEndProp();
            }
        };

        currentMount.addEventListener('touchstart', handleTouchStartInternal, { passive: false });
        currentMount.addEventListener('touchmove', handleTouchMoveInternal, { passive: false });
        currentMount.addEventListener('touchend', handleTouchEndInternal);
        currentMount.addEventListener('touchcancel', handleTouchEndInternal);

        return () => {
            currentMount.removeEventListener('touchstart', handleTouchStartInternal);
            currentMount.removeEventListener('touchmove', handleTouchMoveInternal);
            currentMount.removeEventListener('touchend', handleTouchEndInternal);
            currentMount.removeEventListener('touchcancel', handleTouchEndInternal);
        };
    }, [sessionPublicKey, onCanvasTouchStartProp, onCanvasTouchMoveProp, onCanvasTouchEndProp, isPausedRef, isJoystickInteractionActiveRef, initialTouchPointRef, mountRef]);

    // Keyboard event handling
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (isPausedRef.current) return;
            if (document.activeElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;

            const gameControlCodes = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft', 'ShiftRight'];
            if (gameControlCodes.includes(event.code)) {
                event.preventDefault();
            }
            keysPressedRef.current[event.code] = true;
        };

        const handleKeyUp = (event: KeyboardEvent) => {
            keysPressedRef.current[event.code] = false;
        };

        if (!sessionPublicKey) {
            if (handleKeyDownCbRef.current) {
                window.removeEventListener('keydown', handleKeyDownCbRef.current);
                handleKeyDownCbRef.current = null;
            }
            if (handleKeyUpCbRef.current) {
                window.removeEventListener('keyup', handleKeyUpCbRef.current);
                handleKeyUpCbRef.current = null;
            }
            keysPressedRef.current = {};
            return;
        }

        handleKeyDownCbRef.current = handleKeyDown;
        handleKeyUpCbRef.current = handleKeyUp;

        window.addEventListener('keydown', handleKeyDownCbRef.current);
        window.addEventListener('keyup', handleKeyUpCbRef.current);

        return () => {
            if (handleKeyDownCbRef.current) {
                window.removeEventListener('keydown', handleKeyDownCbRef.current);
            }
            if (handleKeyUpCbRef.current) {
                window.removeEventListener('keyup', handleKeyUpCbRef.current);
            }
            keysPressedRef.current = {};
        };
    }, [sessionPublicKey, isPausedRef, keysPressedRef, handleKeyDownCbRef, handleKeyUpCbRef]);

    return (
        <>
            <div ref={mountRef} className="w-full h-full absolute inset-0 z-0" />
            {/* OptimizedStaticObjectManager removed */}
        </>
    );
};
export default GameCanvas;
