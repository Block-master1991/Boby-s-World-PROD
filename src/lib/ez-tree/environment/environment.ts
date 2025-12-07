import * as THREE from 'three';
import { Skybox } from './skybox';
import { Ground } from './ground';
import { Grass } from './grass';
import { Rocks } from './rocks';
import { Trees } from './trees'; // Import Trees
import { Flowers } from './flowers'; // Import Flowers
import { ChunkManager } from '../../chunk/ChunkManager';

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


    // Initialize Grass, Rocks, Trees, and Flowers instances (they won't generate content yet)
    this.grassInstance = new Grass();
    this.rocksInstance = new Rocks();
    this.treesInstance = new Trees(); // Instantiate Trees
    this.flowersInstance = new Flowers(); // Instantiate Flowers

    // Create ChunkManager and pass the object generators
    this.chunkManager = new ChunkManager(this.grassInstance, this.rocksInstance, this.treesInstance, this.flowersInstance);
    this.add(this.chunkManager);

    // Fetch assets for Grass, Rocks, Trees, and Flowers once
    console.log("Environment: Fetching assets for world objects...");

    Promise.all([
      Grass.fetchAssets(),
      Rocks.fetchAssets(),
      this.treesInstance.fetchAssets(), // Use instance fetchAssets for Trees
      Flowers.fetchAssets() // Fetch assets for Flowers
    ]).then(() => {
      console.log("Environment: All assets loaded successfully");
      this.chunkManager.setGeneratorsReady(); // Notify ChunkManager that generators are ready
    }).catch(error => {
      console.error("Environment: Failed to load assets:", error);
    });
  }

  public update(elapsedTime: number, cameraPosition: THREE.Vector3): void {
    this.chunkManager.updateModern(elapsedTime); // Pass elapsedTime to chunkManager
  }
}
