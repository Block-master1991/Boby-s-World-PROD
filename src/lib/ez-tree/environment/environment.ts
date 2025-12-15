import * as THREE from 'three';
import { Skybox } from './skybox';
import { Ground } from './ground';
import { Grass, GrassOptions } from './grass';
import { Rocks, RockOptions } from './rocks';
import { Trees, TreesOptions } from './trees'; // Import Trees
import { Flowers, FlowerOptions } from './flowers'; // Import Flowers
import { ChunkManager } from '../../chunk/ChunkManager';
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
    this.chunkManager.updateModern(elapsedTime); // Pass elapsedTime to chunkManager
  }
}
