import * as THREE from 'three';
import { Skybox } from './skybox';
import { Ground } from './ground';
import { Grass, GrassOptions } from './grass';
import { Rocks, RockOptions } from './rocks';
import { Trees, TreesOptions } from './trees'; // Import Trees
import { Flowers, FlowerOptions } from './flowers'; // Import Flowers
import { ChunkManager } from '../../chunk/ChunkManager';
import { RENDER_DISTANCE_CHUNKS } from '../../chunkUtils';
import { getDevicePerformanceConfig } from '../../utils';

export class Environment extends THREE.Object3D {
  public ground: Ground;
  public skybox: Skybox;
  public chunkManager: ChunkManager;
  private grassInstance: Grass;
  private rocksInstance: Rocks;
  private treesInstance: Trees; // Add treesInstance
  private flowersInstance: Flowers; // Add flowersInstance

  constructor() {
    super();

    this.ground = new Ground();
    this.add(this.ground);

    this.skybox = new Skybox();
    this.add(this.skybox);

    // Get performance config for density adjustment
    const perfConfig = getDevicePerformanceConfig();

    // Initialize草 Grass, Rocks, Trees, and Flowers instances with adjusted options for performance
    const grassOptions = new GrassOptions();
    grassOptions.instanceCountPerChunk = Math.floor(grassOptions.instanceCountPerChunk * perfConfig.environmentDensity.grassMultiplier);

    const rockOptions = new RockOptions();
    rockOptions.rockCountPerChunk = Math.floor(rockOptions.rockCountPerChunk * perfConfig.environmentDensity.rocksMultiplier);

    const treeOptions = new TreesOptions();
    treeOptions.treeCountPerChunk = Math.floor(treeOptions.treeCountPerChunk * perfConfig.environmentDensity.treeMultiplier);

    const flowerOptions = new FlowerOptions();
    flowerOptions.flowersCountPerChunk = Math.floor(flowerOptions.flowersCountPerChunk * perfConfig.environmentDensity.flowersMultiplier);

    this.grassInstance = new Grass(grassOptions);
    this.rocksInstance = new Rocks(rockOptions);
    this.treesInstance = new Trees(treeOptions);
    this.flowersInstance = new Flowers(flowerOptions);

    console.log(`[Environment] Adjusted density for ${perfConfig.isMobile ? 'mobile' : 'desktop'}:`, {
      grass: grassOptions.instanceCountPerChunk,
      rocks: rockOptions.rockCountPerChunk,
      trees: treeOptions.treeCountPerChunk,
      flowers: flowerOptions.flowersCountPerChunk
    });

    // Create ChunkManager and pass the object generators
    this.chunkManager = new ChunkManager(this.grassInstance, this.rocksInstance, this.treesInstance, this.flowersInstance);
    this.add(this.chunkManager);

    // Note: Assets are preloaded in useGameAssetLoader, so fetchAssets will use cached data
    // If not preloaded, they will be loaded on-demand (though not recommended)
    console.log("Environment: Fetching/caching assets for world objects...");

    Promise.all([
      Grass.fetchAssets(),
      Rocks.fetchAssets(),
      this.treesInstance.fetchAssets(),
      Flowers.fetchAssets()
    ]).then(() => {
      console.log("Environment: All assets loaded successfully");
      this.chunkManager.setGeneratorsReady();
    }).catch(error => {
      console.error("Environment: Failed to load assets:", error);
    });
  }

  public update(elapsedTime: number, cameraPosition: THREE.Vector3): void {
    if (cameraPosition) {
      this.skybox.position.copy(cameraPosition); // Make skybox follow camera
      this.ground.position.set(cameraPosition.x, 0, cameraPosition.z); // Make ground follow camera
    }
    this.skybox.update(elapsedTime); // Update sky rotation
    this.chunkManager.updateModern(elapsedTime); // Pass elapsedTime to chunkManager
  }

  /**
   * Preload initial scene chunks around a center position for instant rendering on game start
   * Generates all visible chunks asynchronously without blocking the main thread
   * Forces completion even if some chunks fail to ensure game starts
   */
  public async preloadInitialScene(centerPosition: THREE.Vector3): Promise<void> {
    console.log(`[Environment] Preloading initial scene around ${centerPosition.x.toFixed(1)}, ${centerPosition.z.toFixed(1)}...`);

    const chunks = this.generateChunkCoordsAround(centerPosition);
    const generationPromises: Promise<void>[] = [];

    // Generate chunks asynchronously with yield to avoid blocking
    for (const chunk of chunks) {
      generationPromises.push(this.chunkManager.generateChunkAsync(chunk.x, chunk.z));
    }

    // Use allSettled to ensure we don't hang on failures, but still wait for success
    console.log(`[Environment] Waiting for ${chunks.length} chunks to generate...`);

    try {
      // Wait for all chunks to settle (succeed or fail)
      const results = await Promise.allSettled(generationPromises);
      const succeeded = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;

      console.log(`[Environment] Chunk preloading complete: ${succeeded} succeeded, ${failed} failed`);
      console.log(`[Environment] World ready for gameplay!`);
    } catch (error) {
      console.error('[Environment] Unexpected error in preload:', error);
    }

    // Explicit return to ensure promise resolves
    return;
  }

  /**
   * Generate chunk coordinates around a center position matching RENDER_DISTANCE_CHUNKS
   */
  private generateChunkCoordsAround(pos: THREE.Vector3): { x: number; z: number }[] {
    const chunks: { x: number; z: number }[] = [];
    const CHUNK_SIZE = 50;

    // Use RENDER_DISTANCE_CHUNKS for initial view area (currently 3 = ±3 = 7x7 grid)
    for (let dx = -RENDER_DISTANCE_CHUNKS; dx <= RENDER_DISTANCE_CHUNKS; dx++) {
      for (let dz = -RENDER_DISTANCE_CHUNKS; dz <= RENDER_DISTANCE_CHUNKS; dz++) {
        const worldX = pos.x + dx * CHUNK_SIZE;
        const worldZ = pos.z + dz * CHUNK_SIZE;
        const chunkX = Math.floor(worldX / CHUNK_SIZE);
        const chunkZ = Math.floor(worldZ / CHUNK_SIZE);
        chunks.push({ x: chunkX, z: chunkZ });
      }
    }

    return chunks;
  }
}
