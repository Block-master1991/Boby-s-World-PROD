import * as THREE from "three";
import { logger } from "utils/logger";
import { ChunkManager } from "../../chunk/ChunkManager";
import { CHUNK_SIZE, RENDER_DISTANCE_CHUNKS } from "../../chunkUtils";
import type { LODManager } from "../../lod/lod-manager";
import { initializeLODManager } from "../../lod/lod-manager";
import { getDevicePerformanceConfig } from "../../utils";
import { FlowerOptions, Flowers } from "./flowers";
import { Grass, GrassOptions } from "./grass";
import { Ground } from "./ground";
import { RockOptions, Rocks } from "./rocks";
import { Skybox } from "./skybox";
import { Trees, TreesOptions } from "./trees";

export class Environment extends THREE.Object3D {
  public ground: Ground;
  public skybox: Skybox;
  public chunkManager: ChunkManager;
  private grassInstance: Grass;
  private rocksInstance: Rocks;
  private treesInstance: Trees;
  private flowersInstance: Flowers;
  private lodManager: LODManager;
  private lastTime: number = 0;

  public loadingPromise: Promise<void>;
  private resolveLoading!: () => void;

  constructor(renderer?: THREE.WebGLRenderer) {
    super();

    // Initialize LOD Manager
    this.lodManager = initializeLODManager();

    this.loadingPromise = new Promise(resolve => {
      this.resolveLoading = resolve;
    });

    // 1. Initialize core visual components and assign to properties
    const { ground, skybox } = this.createCoreComponents(renderer);
    this.ground = ground;
    this.skybox = skybox;
    this.add(this.ground);
    this.add(this.skybox);

    // 2. Initialize world object generators and assign to properties
    const { grass, rocks, trees, flowers } = this.createGenerators();
    this.grassInstance = grass;
    this.rocksInstance = rocks;
    this.treesInstance = trees;
    this.flowersInstance = flowers;

    // 3. Setup Chunk Management using definitely assigned properties
    this.chunkManager = new ChunkManager(
      this.grassInstance,
      this.rocksInstance,
      this.treesInstance,
      this.flowersInstance
    );
    this.add(this.chunkManager);

    // 4. Load assets with sequential retry fallback
    this.loadAssetsWithRetry();
  }

  private createCoreComponents(renderer?: THREE.WebGLRenderer) {
    const groundSize = Math.ceil((RENDER_DISTANCE_CHUNKS * 2 + 1) * CHUNK_SIZE * 1.2);
    logger.log(`[Environment] Creating ground with dynamic size: ${groundSize}x${groundSize}`);

    const ground = new Ground(new GrassOptions(), groundSize, groundSize);
    const skybox = new Skybox(renderer);

    return { ground, skybox };
  }

  private createGenerators() {
    const perfConfig = getDevicePerformanceConfig();

    const grassOpts = new GrassOptions();
    // Reduce grass density significantly for performance (from ~2000 to ~500-600 per chunk)
    grassOpts.instanceCountPerChunk = Math.floor(
      grassOpts.instanceCountPerChunk * perfConfig.environmentDensity.grassMultiplier * 0.3
    );

    const rockOpts = new RockOptions();
    rockOpts.rockCountPerChunk = Math.floor(
      rockOpts.rockCountPerChunk * perfConfig.environmentDensity.rocksMultiplier
    );

    const treeOpts = new TreesOptions();
    treeOpts.treeCountPerChunk = Math.floor(
      treeOpts.treeCountPerChunk * perfConfig.environmentDensity.treeMultiplier
    );

    const flowerOpts = new FlowerOptions();
    flowerOpts.flowersCountPerChunk = Math.floor(
      flowerOpts.flowersCountPerChunk * perfConfig.environmentDensity.flowersMultiplier
    );

    const grass = new Grass(grassOpts);
    const rocks = new Rocks(rockOpts);
    const trees = new Trees(treeOpts);
    const flowers = new Flowers(flowerOpts);

    logger.log(`[Environment] Adjusted density for ${perfConfig.isMobile ? "mobile" : "desktop"}`);

    return { grass, rocks, trees, flowers };
  }

  private async loadAssetsWithRetry(maxAttempts: number = 30): Promise<void> {
    logger.log(
      `[Environment] Starting mandatory asset loading sequence (max attempts: ${maxAttempts})`
    );

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        // Enforce sequential or parallel loading with high priority
        /* eslint-disable no-await-in-loop */
        await Promise.all([
          Grass.fetchAssets(),
          Rocks.fetchAssets(),
          this.treesInstance.fetchAssets(),
          Flowers.fetchAssets(),
          Ground.fetchAssets(), // Added Ground assets verification
        ]);
        /* eslint-enable no-await-in-loop */

        logger.log(
          `[Environment] ✅ All assets loaded and verified in IndexedDB on attempt ${attempt}`
        );
        this.chunkManager.setGeneratorsReady();

        // Trigger initial chunk loading from origin (0,0,0)
        // This is necessary because updatePlayerPosition() won't be called until
        // the render loop starts, which is blocked by loadingPromise - a deadlock.
        // By seeding the initial position here, chunks begin loading immediately.
        this.chunkManager.updatePlayerPosition(new THREE.Vector3(0, 0, 0));

        // Wait for initial chunks to load before signaling ready (with timeout safety)
        logger.log("[Environment] Waiting for initial 25 chunks to load...");
        // eslint-disable-next-line no-await-in-loop -- Intentional: must wait for chunks before signaling ready
        await this.chunkManager.waitForInitialChunks(25);
        logger.log("[Environment] ✅ Initial chunks loaded. World is ready!");

        if (this.resolveLoading) this.resolveLoading();
        return;
      } catch (error) {
        logger.error(
          `[Environment] ❌ Asset loading failed (attempt ${attempt}/${maxAttempts}):`,
          error
        );

        if (attempt < maxAttempts) {
          const delay = Math.min(1000 * Math.pow(1.5, attempt - 1), 10000);
          /* eslint-disable no-await-in-loop */
          await new Promise(resolve => setTimeout(resolve, delay));
          /* eslint-enable no-await-in-loop */
        } else {
          logger.error(
            "[Environment] 🚨 FATAL: All asset loading attempts exhausted. The world may be incomplete."
          );
          // Still set ready but it's a critical failure state
          this.chunkManager.setGeneratorsReady();
          if (this.resolveLoading) this.resolveLoading();
        }
      }
    }
  }

  public update(elapsedTime: number, camera: THREE.Camera): void {
    // Calculate deltaTime in seconds
    const deltaTime = this.lastTime === 0 ? 0 : elapsedTime - this.lastTime;
    this.lastTime = elapsedTime;

    if (camera) {
      const cameraPosition = camera.position;
      this.skybox.position.copy(cameraPosition);
      this.ground.position.set(cameraPosition.x, 0, cameraPosition.z);
      this.chunkManager.updatePlayerPosition(cameraPosition);

      // Update LOD manager with camera position
      this.lodManager?.updateCameraPosition(cameraPosition);
    }
    this.skybox.update(elapsedTime);
    this.chunkManager.updateModern(elapsedTime, camera);

    // Update LOD state with deltaTime
    this.lodManager?.update(deltaTime);
  }

  // Optimization: Track last preloaded position to avoid redundant checks
  private lastPreloadPos = new THREE.Vector3(Infinity, Infinity, Infinity);

  public async preloadInitialScene(centerPosition: THREE.Vector3): Promise<void> {
    // Only preload if moved significantly (> 16m ~ one chunk width approx is 16, but let's say 8m)
    if (centerPosition.distanceTo(this.lastPreloadPos) < 8) return;
    this.lastPreloadPos.copy(centerPosition);

    // logger.log(`[Environment] Preloading scene around ${centerPosition.x.toFixed(1)}, ${centerPosition.z.toFixed(1)}`);

    const chunks = this.generateChunkCoordsAround(centerPosition);

    // Load sequentially to avoid main thread bottlenecks
    for (const chunk of chunks) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await this.chunkManager.generateChunkAsync(chunk.x, chunk.z);
      } catch (error) {
        logger.error(`[Environment] Chunk preloading failed for ${chunk.x},${chunk.z}:`, error);
      }
    }

    // logger.log(`[Environment] Preloading complete: ${succeeded}/${chunks.length} succeeded`);
  }

  private generateChunkCoordsAround(pos: THREE.Vector3): { x: number; z: number }[] {
    const chunks: { x: number; z: number }[] = [];
    const size = 50;

    for (let dx = -RENDER_DISTANCE_CHUNKS; dx <= RENDER_DISTANCE_CHUNKS; dx++) {
      for (let dz = -RENDER_DISTANCE_CHUNKS; dz <= RENDER_DISTANCE_CHUNKS; dz++) {
        chunks.push({
          x: Math.floor((pos.x + dx * size) / size),
          z: Math.floor((pos.z + dz * size) / size),
        });
      }
    }
    return chunks;
  }
}
