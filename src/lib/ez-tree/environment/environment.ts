import * as THREE from 'three';
import { logger } from 'utils/logger';
import { ChunkManager } from '../../chunk/ChunkManager';
import { CHUNK_SIZE, RENDER_DISTANCE_CHUNKS } from '../../chunkUtils';
import { getDevicePerformanceConfig } from '../../utils';
import { FlowerOptions, Flowers } from './flowers';
import { Grass, GrassOptions } from './grass';
import { Ground } from './ground';
import { RockOptions, Rocks } from './rocks';
import { Skybox } from './skybox';
import { Trees, TreesOptions } from './trees';

export class Environment extends THREE.Object3D {
  public ground: Ground;
  public skybox: Skybox;
  public chunkManager: ChunkManager;
  private grassInstance: Grass;
  private rocksInstance: Rocks;
  private treesInstance: Trees;
  private flowersInstance: Flowers;

  constructor(renderer?: THREE.WebGLRenderer) {
    super();

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
    grassOpts.instanceCountPerChunk = Math.floor(grassOpts.instanceCountPerChunk * perfConfig.environmentDensity.grassMultiplier);
    
    const rockOpts = new RockOptions();
    rockOpts.rockCountPerChunk = Math.floor(rockOpts.rockCountPerChunk * perfConfig.environmentDensity.rocksMultiplier);
    
    const treeOpts = new TreesOptions();
    treeOpts.treeCountPerChunk = Math.floor(treeOpts.treeCountPerChunk * perfConfig.environmentDensity.treeMultiplier);
    
    const flowerOpts = new FlowerOptions();
    flowerOpts.flowersCountPerChunk = Math.floor(flowerOpts.flowersCountPerChunk * perfConfig.environmentDensity.flowersMultiplier);

    const grass = new Grass(grassOpts);
    const rocks = new Rocks(rockOpts);
    const trees = new Trees(treeOpts);
    const flowers = new Flowers(flowerOpts);

    logger.log(`[Environment] Adjusted density for ${perfConfig.isMobile ? 'mobile' : 'desktop'}`);

    return { grass, rocks, trees, flowers };
  }

  private async loadAssetsWithRetry(maxAttempts: number = 20): Promise<void> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        /* eslint-disable no-await-in-loop */
        await Promise.all([
          Grass.fetchAssets(),
          Rocks.fetchAssets(),
          this.treesInstance.fetchAssets(),
          Flowers.fetchAssets()
        ]);
        /* eslint-enable no-await-in-loop */

        logger.log(`[Environment] All assets loaded successfully on attempt ${attempt}`);
        this.chunkManager.setGeneratorsReady();
        return;
      } catch (error) {
        logger.warn(`[Environment] Asset loading failed (attempt ${attempt}):`, error);

        if (attempt < maxAttempts) {
          const delay = Math.min(2000 * Math.pow(1.2, attempt - 1), 15000);
          /* eslint-disable no-await-in-loop */
          await new Promise(resolve => setTimeout(resolve, delay));
          /* eslint-enable no-await-in-loop */
        } else {
          logger.error("[Environment] Forcing success with fallbacks after exhaustion");
          this.chunkManager.setGeneratorsReady();
        }
      }
    }
  }

  public update(elapsedTime: number, cameraPosition: THREE.Vector3): void {
    if (cameraPosition) {
      this.skybox.position.copy(cameraPosition);
      this.ground.position.set(cameraPosition.x, 0, cameraPosition.z);
    }
    this.skybox.update(elapsedTime);
    this.chunkManager.updateModern(elapsedTime);
  }

  public async preloadInitialScene(centerPosition: THREE.Vector3): Promise<void> {
    logger.log(`[Environment] Preloading scene around ${centerPosition.x.toFixed(1)}, ${centerPosition.z.toFixed(1)}`);

    const chunks = this.generateChunkCoordsAround(centerPosition);
    const generationPromises = chunks.map(c => this.chunkManager.generateChunkAsync(c.x, c.z));

    try {
      const results = await Promise.allSettled(generationPromises);
      const succeeded = results.filter(r => r.status === 'fulfilled').length;
      logger.log(`[Environment] Preloading complete: ${succeeded}/${chunks.length} succeeded`);
    } catch (error) {
      logger.error('[Environment] Unexpected error in preload:', error);
    }
  }

  private generateChunkCoordsAround(pos: THREE.Vector3): { x: number; z: number }[] {
    const chunks: { x: number; z: number }[] = [];
    const size = 50;

    for (let dx = -RENDER_DISTANCE_CHUNKS; dx <= RENDER_DISTANCE_CHUNKS; dx++) {
      for (let dz = -RENDER_DISTANCE_CHUNKS; dz <= RENDER_DISTANCE_CHUNKS; dz++) {
        chunks.push({ 
          x: Math.floor((pos.x + dx * size) / size), 
          z: Math.floor((pos.z + dz * size) / size) 
        });
      }
    }
    return chunks;
  }
}
