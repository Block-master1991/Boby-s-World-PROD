import type { PerspectiveCamera, WebGLRenderer } from "@/lib/three-chunk";
import { logger } from "@/utils/logger";
import { modelLoader } from "@/utils/modelLoader";

export enum AssetPriority {
  CRITICAL = 0,
  HIGH = 1,
  MEDIUM = 2,
  LOW = 3,
}

export interface AssetManifestEntry {
  id: string;
  name: string;
  url?: string;
  type: "model" | "audio" | "texture" | "other";
  priority: AssetPriority;
  dependencies?: string[];
  estimatedSize?: number;
  loadFunction: () => Promise<void>;
}

export interface LoadingProgressData {
  progress: number;
  phase: string;
  currentAsset?: string;
  loadedAssets?: number;
  totalAssets?: number;
}

export type LoadingProgressCallback = (data: LoadingProgressData) => void;

export class PriorityAssetLoader {
  private manifest: AssetManifestEntry[] = [];
  private loadedAssets: Set<string> = new Set();

  constructor(
    private params: {
      rendererRef: React.MutableRefObject<WebGLRenderer | null>;
      cameraRef: React.MutableRefObject<PerspectiveCamera | null>;
      initializeDog: () => Promise<void>;
      initializeCoins: () => Promise<void>;
      initializeEnemies: () => Promise<void>;
    }
  ) {
    this.initializeAssetManifest();
  }

  private initializeAssetManifest() {
    this.manifest = [
      ...this.getCriticalAssets(),
      ...this.getHighPriorityAssets(),
      ...this.getMediumPriorityAssets(),
      ...this.getLowPriorityAssets(),
    ];
  }

  private getCriticalAssets(): AssetManifestEntry[] {
    return [
      {
        id: "modelLoader",
        name: "3D Engine System",
        type: "other",
        priority: AssetPriority.CRITICAL,
        estimatedSize: 50,
        loadFunction: () => this.loadModelLoader(),
      },
      {
        id: "dog",
        name: "Player Character",
        type: "model",
        priority: AssetPriority.CRITICAL,
        dependencies: ["modelLoader"],
        estimatedSize: 500,
        loadFunction: () => this.params.initializeDog(),
      },
      {
        id: "skyboxHDR",
        name: "Atmospheric HDR Sky",
        type: "texture",
        priority: AssetPriority.CRITICAL,
        estimatedSize: 2000,
        loadFunction: () => Promise.resolve(),
      },
    ];
  }

  private getHighPriorityAssets(): AssetManifestEntry[] {
    return [
      {
        id: "coin",
        name: "Coin Objects",
        type: "model",
        priority: AssetPriority.HIGH,
        dependencies: ["modelLoader"],
        estimatedSize: 200,
        loadFunction: () => this.params.initializeCoins(),
      },
      {
        id: "basicEnemies",
        name: "Core Enemy Types",
        type: "model",
        priority: AssetPriority.HIGH,
        dependencies: ["modelLoader"],
        estimatedSize: 800,
        loadFunction: () => this.params.initializeEnemies(),
      },
    ];
  }

  private getMediumPriorityAssets(): AssetManifestEntry[] {
    return [
      {
        id: "audio",
        name: "Audio System",
        type: "audio",
        priority: AssetPriority.MEDIUM,
        estimatedSize: 100,
        loadFunction: () => this.loadAudioSystem(),
      },
      {
        id: "additionalEnemies",
        name: "Additional Enemy Types",
        type: "model",
        priority: AssetPriority.MEDIUM,
        dependencies: ["modelLoader"],
        estimatedSize: 600,
        loadFunction: () => new Promise(resolve => setTimeout(resolve, 100)),
      },
    ];
  }

  private getLowPriorityAssets(): AssetManifestEntry[] {
    return [
      {
        id: "worldEnvironment",
        name: "World Environment",
        type: "other",
        priority: AssetPriority.LOW,
        dependencies: ["modelLoader"],
        estimatedSize: 1000,
        loadFunction: () => new Promise(resolve => setTimeout(resolve, 200)),
      },
    ];
  }

  private async loadModelLoader(): Promise<void> {
    if (!this.params.rendererRef.current || !this.params.cameraRef.current) {
      throw new Error("Renderer or Camera not available");
    }
    await modelLoader.initialize(this.params.rendererRef.current, this.params.cameraRef.current);
  }

  private async loadAudioSystem(): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  private async resolveDependencies(
    entry: AssetManifestEntry,
    loadingStack: Set<string> = new Set()
  ): Promise<void> {
    if (loadingStack.has(entry.id)) {
      throw new Error(`Circular dependency detected: ${entry.id}`);
    }
    if (!entry.dependencies || entry.dependencies.length === 0) return;

    loadingStack.add(entry.id);
    await Promise.all(
      entry.dependencies.map(async depId => {
        if (!this.loadedAssets.has(depId)) {
          const depEntry = this.manifest.find(asset => asset.id === depId);
          if (!depEntry) throw new Error(`Dependency ${depId} not found`);
          await this.resolveDependencies(depEntry, loadingStack);
          await this.loadAsset(depEntry);
        }
      })
    );
    loadingStack.delete(entry.id);
  }

  private async loadAssetsInParallel(params: {
    assets: AssetManifestEntry[];
    onProgress: LoadingProgressCallback;
    phase: string;
    startRange: number;
    endRange: number;
    totalAssets: number;
    currentLoaded: number;
  }): Promise<number> {
    const { assets, onProgress, phase, startRange, endRange, totalAssets, currentLoaded } = params;
    onProgress({ progress: startRange, phase });
    await Promise.all(assets.map(asset => this.loadAsset(asset, onProgress)));
    const newLoaded = currentLoaded + assets.length;
    const progress = Math.round((newLoaded / totalAssets) * (endRange - startRange) + startRange);
    onProgress({ progress, phase, loadedAssets: newLoaded, totalAssets });
    return newLoaded;
  }

  async loadAssetsByPriority(onProgress: LoadingProgressCallback): Promise<void> {
    const assetsByPriority = this.groupAssetsByPriority();
    const totalAssets = this.manifest.length;
    let loadedCount = 0;

    if (assetsByPriority[AssetPriority.CRITICAL]) {
      onProgress({ progress: 5, phase: "system" });
      for (const asset of assetsByPriority[AssetPriority.CRITICAL]) {
        /* eslint-disable-next-line no-await-in-loop */
        await this.loadAsset(asset, onProgress);
        loadedCount++;
        const progress = Math.round((loadedCount / totalAssets) * 25);
        onProgress({ progress, phase: "system", loadedAssets: loadedCount, totalAssets });
      }
    }

    if (assetsByPriority[AssetPriority.HIGH]) {
      loadedCount = await this.loadAssetsInParallel({
        assets: assetsByPriority[AssetPriority.HIGH],
        onProgress,
        phase: "graphics",
        startRange: 25,
        endRange: 50,
        totalAssets,
        currentLoaded: loadedCount,
      });
    }

    if (assetsByPriority[AssetPriority.MEDIUM]) {
      loadedCount = await this.loadAssetsInParallel({
        assets: assetsByPriority[AssetPriority.MEDIUM],
        onProgress,
        phase: "audio",
        startRange: 50,
        endRange: 75,
        totalAssets,
        currentLoaded: loadedCount,
      });
    }

    if (assetsByPriority[AssetPriority.LOW]) {
      Promise.all(
        assetsByPriority[AssetPriority.LOW].map(asset => this.loadAsset(asset, onProgress))
      ).catch(logger.error);
    }
  }

  private groupAssetsByPriority(): { [key in AssetPriority]: AssetManifestEntry[] } {
    const grouped: { [key in AssetPriority]: AssetManifestEntry[] } = {
      [AssetPriority.CRITICAL]: [],
      [AssetPriority.HIGH]: [],
      [AssetPriority.MEDIUM]: [],
      [AssetPriority.LOW]: [],
    };
    this.manifest.forEach(asset => grouped[asset.priority].push(asset));
    return grouped;
  }

  private async loadAsset(
    asset: AssetManifestEntry,
    _onProgress?: LoadingProgressCallback
  ): Promise<void> {
    if (this.loadedAssets.has(asset.id)) return;
    try {
      if (asset.dependencies) {
        await Promise.all(
          asset.dependencies.map(async dep => {
            if (!this.loadedAssets.has(dep)) {
              const depAsset = this.manifest.find(a => a.id === dep);
              if (depAsset) await this.loadAsset(depAsset, _onProgress);
            }
          })
        );
      }
      logger.log(`[PriorityAssetLoader] Loading ${asset.name}`);
      await asset.loadFunction();
      this.loadedAssets.add(asset.id);
    } catch (error) {
      logger.error(`[PriorityAssetLoader] Failed to load ${asset.id}:`, error);
    }
  }

  isAssetLoaded(assetId: string): boolean {
    return this.loadedAssets.has(assetId);
  }
}
