import * as THREE from "three";
import { logger } from "utils/logger";
import { CHUNK_SIZE } from "../../chunkUtils";
import { DOG_SPAWN_PROTECTION_RADIUS } from "../../constants";
import TreeOptions from "../options";
import { TreePreset, loadPreset } from "../presets";
import { Tree } from "../tree";

export class TreesOptions {
  public treeCountPerChunk: number = 1;
  public scale: number = 100;
  public patchiness: number = 0.7;
  public windStrength: { x: number; y: number; z: number } = { x: 0.05, y: 0.02, z: 0.05 };
  public windFrequency: number = 0.2;
  public windScale: number = 800.0;
}

export class Trees extends THREE.Object3D {
  public options: TreesOptions;
  private loadedPresets: Map<string, TreeOptions> = new Map();
  private treeInstanceCache: Map<string, Tree> = new Map();

  constructor(options: TreesOptions = new TreesOptions()) {
    super();
    this.options = options;
    this.name = "Trees";
  }

  /**
   * Synchronously loads all available tree presets.
   */
  public fetchAssets(): void {
    const presetNames = Object.keys(TreePreset);
    for (const name of presetNames) {
      const preset = loadPreset(name);
      this.loadedPresets.set(name, preset);
    }
  }

  /**
   * Helper to create a single tree instance from a preset.
   * Uses caching to avoid repeated procedural generation.
   */
  private createTreeInstance(presetName: string, position: THREE.Vector3): Tree | null {
    const treeOptions = this.loadedPresets.get(presetName);
    if (!treeOptions) return null;

    let cachedTree = this.treeInstanceCache.get(presetName);

    if (!cachedTree) {
      const treeInstanceOptions = new TreeOptions();
      treeInstanceOptions.copy(treeOptions);
      // Fixed seed for cached geometry to maintain consistency per preset
      treeInstanceOptions.seed = 42;

      cachedTree = new Tree(treeInstanceOptions);
      cachedTree.generate();
      this.applyShadows(cachedTree);
      this.treeInstanceCache.set(presetName, cachedTree);
    }

    // Clone the cached tree
    const tree = cachedTree.clone() as Tree;
    tree.position.copy(position);

    // Default rotation and scale for new trees
    tree.rotation.set(0, 2 * Math.PI * Math.random(), 0);
    const scale = 0.05;
    tree.scale.set(scale, scale, scale);

    return tree;
  }

  /**
   * Helper to apply shadows recursively to a tree.
   */
  private applyShadows(object: THREE.Object3D): void {
    object.traverse(child => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
  }

  public generateTreesForChunk(chunkX: number, chunkZ: number): THREE.Group | null {
    if (this.loadedPresets.size === 0) {
      this.handleMissingAssets();
      return null;
    }

    const treesGroup = new THREE.Group();
    treesGroup.name = "trees";
    const presetNames = Array.from(this.loadedPresets.keys());
    const chunkStart = { x: chunkX * CHUNK_SIZE, z: chunkZ * CHUNK_SIZE };

    for (let i = 0; i < this.options.treeCountPerChunk; i++) {
      const worldPos = new THREE.Vector3(
        chunkStart.x + Math.random() * CHUNK_SIZE,
        0,
        chunkStart.z + Math.random() * CHUNK_SIZE
      );

      if (worldPos.length() < DOG_SPAWN_PROTECTION_RADIUS) continue;
      if (Math.random() > this.options.patchiness) continue;

      const randomName = presetNames[Math.floor(Math.random() * presetNames.length)];
      if (!randomName) continue; // Resolve TS2345

      const tree = this.createTreeInstance(randomName, worldPos);
      if (tree) treesGroup.add(tree);
    }

    return treesGroup;
  }

  public generateTreesFromData(data: {
    positions: number[];
    scales: number[];
    quaternions: number[];
    colors: number[];
  }): THREE.Group | null {
    if (this.loadedPresets.size === 0 || !data) return null;

    const treesGroup = new THREE.Group();
    treesGroup.name = "trees";
    const presetNames = Array.from(this.loadedPresets.keys());
    const { positions, scales, quaternions } = data;
    const count = positions.length / 3;

    for (let i = 0; i < count; i++) {
      const pos = new THREE.Vector3().fromArray(positions, i * 3);
      if (pos.length() < DOG_SPAWN_PROTECTION_RADIUS) continue;

      const randomName = presetNames[Math.floor(Math.random() * presetNames.length)];
      if (!randomName) continue; // Resolve TS2345

      const tree = this.createTreeInstance(randomName, pos);
      if (tree) {
        // Override with specific data
        tree.scale.fromArray(scales, i * 3);
        tree.quaternion.fromArray(quaternions, i * 4);
        treesGroup.add(tree);
      }
    }
    return treesGroup;
  }

  private handleMissingAssets(): void {
    logger.warn("Trees: No presets loaded. Attempting to fetch now...");
    try {
      this.fetchAssets();
      logger.log(`Trees: Assets loaded, ${this.loadedPresets.size} presets ready`);
    } catch (error) {
      logger.error("Trees: Failed to fetch assets:", error);
    }
  }

  public update(elapsedTime: number): void {
    // Only update the cached tree instances for wind animation.
    // Since all scene trees share materials with these cached instances,
    // updating the cache updates wind animation efficiently.
    this.treeInstanceCache.forEach(tree => {
      tree.update(elapsedTime);
    });
  }

  public disposeChunk(chunkGroup: THREE.Group): void {
    chunkGroup.children.forEach(child => {
      child.traverse(obj => {
        if (obj instanceof THREE.Mesh) {
          // IMPORTANT: Do NOT dispose geometry or material here because they are SHARED
          // from the treeInstanceCache. Only remove from scene.
        }
      });
    });
    chunkGroup.clear();
  }

  public dispose(): void {
    // Dispose cached tree instances and their resources
    this.treeInstanceCache.forEach(tree => {
      tree.traverse(obj => {
        if (obj instanceof THREE.Mesh) {
          if (obj.geometry) obj.geometry.dispose();
          if (obj.material) {
            if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
            else obj.material.dispose();
          }
        }
      });
    });
    this.treeInstanceCache.clear();
    this.clear();
  }
}
