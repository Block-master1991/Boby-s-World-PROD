import * as THREE from 'three';
import { Tree } from '../tree';
import TreeOptions from '../options';
import { TreePreset, loadPreset } from '../presets';
import { CHUNK_SIZE } from '../../chunkUtils';

export class TreesOptions {
  public treeCountPerChunk: number = 2; // Number of trees per chunk
  public scale: number = 100;
  public patchiness: number = 0.7;
  public windStrength: { x: number; y: number; z: number } = { x: 0.05, y: 0.02, z: 0.05 }; // Much less than grass
  public windFrequency: number = 0.2; // Much slower frequency for trees
  public windScale: number = 800.0; // Larger scale for trees
}

export class Trees extends THREE.Object3D {
  public options: TreesOptions;
  private loadedPresets: Map<string, TreeOptions> = new Map();

  constructor(options: TreesOptions = new TreesOptions()) {
    super();
    this.options = options;
    this.name = 'Trees';
  }

  public async fetchAssets(): Promise<void> {
    // For procedural trees, assets might be presets or textures.
    // Here, we'll load all available presets once.
    const presetNames = Object.keys(TreePreset);
    for (const name of presetNames) {
      const preset = loadPreset(name);
      this.loadedPresets.set(name, preset);
    }
  }

  public generateTreesForChunk(chunkX: number, chunkZ: number): THREE.Group | null {
    if (this.loadedPresets.size === 0) {
      console.warn("Trees: No presets loaded. Call fetchAssets() first.");
      console.log("Trees: Attempting to fetch assets now...");
      this.fetchAssets().then(() => {
        console.log(`Trees: Assets loaded, ${this.loadedPresets.size} presets available`);
      }).catch(error => {
        console.error("Trees: Failed to fetch assets:", error);
      });
      return null;
    }

    const treesGroup = new THREE.Group();
    treesGroup.name = 'trees';
    const presetNames = Array.from(this.loadedPresets.keys());

    const chunkWorldStartX = chunkX * CHUNK_SIZE;
    const chunkWorldStartZ = chunkZ * CHUNK_SIZE;

    console.log(`[Trees] Generating ${this.options.treeCountPerChunk} trees for chunk ${chunkX},${chunkZ}`);

    for (let i = 0; i < this.options.treeCountPerChunk; i++) {
      const localX = Math.random() * CHUNK_SIZE;
      const localZ = Math.random() * CHUNK_SIZE;

      const worldX = chunkWorldStartX + localX;
      const worldZ = chunkWorldStartZ + localZ;

      const p = new THREE.Vector3(worldX, 0, worldZ);

      // Simple patchiness check, can be improved with noise
      if (Math.random() > this.options.patchiness) { continue; }

      const randomPresetName = presetNames[Math.floor(Math.random() * presetNames.length)];
      const treeOptions = this.loadedPresets.get(randomPresetName);

      if (treeOptions) {
        // Create a new TreeOptions instance and copy properties, including wind
        const treeInstanceOptions = new TreeOptions();
        treeInstanceOptions.copy(treeOptions);
        treeInstanceOptions.seed = Math.random() * 65536; // Randomize seed for variety

        const tree = new Tree(treeInstanceOptions);
        tree.generate();

        tree.position.copy(p);
        tree.rotation.set(0, 2 * Math.PI * Math.random(), 0);
        const scale = 0.05; // استخدام الحجم الفعلي من الإعداد المسبق
        tree.scale.set(scale, scale, scale);

        // Enable shadows for trees
        tree.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });

        treesGroup.add(tree);
      }
    }

    console.log(`[Trees] Generated ${treesGroup.children.length} trees for chunk ${chunkX},${chunkZ}`);
    return treesGroup;
  }

  public generateTreesFromData(data: { positions: number[]; scales: number[]; quaternions: number[]; colors: number[] }): THREE.Group | null {
    if (this.loadedPresets.size === 0 || !data) {
      console.warn("Trees: No presets loaded or no data. Call fetchAssets() first.");
      return null;
    }

    const treesGroup = new THREE.Group();
    const presetNames = Array.from(this.loadedPresets.keys());
    const { positions, scales, quaternions } = data;
    const count = positions.length / 3;

    for (let i = 0; i < count; i++) {
      const randomPresetName = presetNames[Math.floor(Math.random() * presetNames.length)];
      const treeOptions = this.loadedPresets.get(randomPresetName);

      if (treeOptions) {
        // Create a new TreeOptions instance and copy properties, including wind
        const treeInstanceOptions = new TreeOptions();
        treeInstanceOptions.copy(treeOptions);
        treeInstanceOptions.seed = Math.random() * 100000; // Randomize seed for variety

        const tree = new Tree(treeInstanceOptions);
        tree.generate();

        tree.position.fromArray(positions, i * 3);
        tree.scale.fromArray(scales, i * 3);
        tree.quaternion.fromArray(quaternions, i * 4);

        treesGroup.add(tree);
      }
    }
    return treesGroup;
  }

  public update(elapsedTime: number): void {
    this.traverse((o) => {
      if (o instanceof Tree) {
        o.update(elapsedTime);
      }
    });
  }

  public disposeChunk(chunkGroup: THREE.Group): void {
    chunkGroup.children.forEach(child => {
      if (child instanceof Tree) {
        // Dispose of tree's internal geometries and materials
        // Assuming Tree class has a dispose method or similar cleanup
        // For now, we'll just remove it from the group
        child.traverse((obj) => {
          if ((obj as THREE.Mesh).isMesh) {
            const mesh = obj as THREE.Mesh;
            if (mesh.geometry) mesh.geometry.dispose();
            if (mesh.material) {
              if (Array.isArray(mesh.material)) {
                mesh.material.forEach(mat => mat.dispose());
              } else {
                mesh.material.dispose();
              }
            }
          }
        });
      }
    });
    chunkGroup.clear(); // Remove all children from the group
  }
}
