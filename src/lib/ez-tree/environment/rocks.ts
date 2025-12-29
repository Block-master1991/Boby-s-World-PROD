import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { CHUNK_SIZE } from '../../chunkUtils';
import { simplex2d } from './noise';
import { getModel, putModel } from '../../indexedDB'; // Import IndexedDB utilities

let loaded = false;
let _rock1Mesh: THREE.Mesh | null = null;
let _rock2Mesh: THREE.Mesh | null = null;
let _rock3Mesh: THREE.Mesh | null = null;

export class RockOptions {
  public rockCountPerChunk: number = 5; // Number of rocks per chunk
  public size: { x: number; y: number; z: number } = { x: 0.2, y: 0.2, z: 0.2 };
  public sizeVariation: { x: number; y: number; z: number } = { x: 0.3, y: 0.3, z: 0.3 };
  public scale: number = 100;
  public patchiness: number = 0.7;
}

export class Rocks extends THREE.Group {
  public options: RockOptions;

  constructor(options: RockOptions = new RockOptions()) {
    super();
    this.options = options;
    this.name = 'Rocks';
  }

  public static async fetchAssets(): Promise<void> {
    if (loaded) return;

    const gltfLoader = new GLTFLoader();

    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('/libs/draco/');
    gltfLoader.setDRACOLoader(dracoLoader);

    // Helper function to find the first mesh in a GLTF scene
    const findMesh = (scene: THREE.Group): THREE.Mesh | null => {
      let mesh: THREE.Mesh | null = null;
      scene.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          mesh = child;
        }
      });
      return mesh;
    };

    const loadModel = async (modelPath: string, modelName: string): Promise<THREE.Group> => {
      try {
        // Try to load from IndexedDB first
        const cachedData = await getModel(modelName);
        if (cachedData) {
          console.log(`[Rocks] Loading ${modelName} from IndexedDB`);
          const gltf = await gltfLoader.parseAsync(cachedData, '');
          return gltf.scene;
        } else {
          console.log(`[Rocks] Fetching ${modelName} from network: ${modelPath}`);
          const response = await fetch(modelPath);
          if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
          const arrayBuffer = await response.arrayBuffer();
          await putModel(modelName, arrayBuffer); // Store in IndexedDB
          const gltf = await gltfLoader.parseAsync(arrayBuffer, '');
          return gltf.scene;
        }
      } catch (error) {
        console.error(`[Rocks] Error loading or caching model ${modelName}:`, error);
        // Fallback to direct network load if IndexedDB fails
        console.log(`[Rocks] Falling back to direct network load for: ${modelPath}`);
        const gltf = await gltfLoader.loadAsync(modelPath);
        return gltf.scene;
      }
    };

    const rock1Scene = await loadModel('/models/rock1.glb', 'rock1_model');
    const rock2Scene = await loadModel('/models/rock2.glb', 'rock2_model');
    const rock3Scene = await loadModel('/models/rock3.glb', 'rock3_model');

    _rock1Mesh = findMesh(rock1Scene);
    _rock2Mesh = findMesh(rock2Scene);
    _rock3Mesh = findMesh(rock3Scene);

    loaded = true;
  }

  public generateRocksForChunk(chunkX: number, chunkZ: number): THREE.Group | null {
    if (!_rock1Mesh || !_rock2Mesh || !_rock3Mesh) {
      console.warn("Rocks: No meshes loaded. Call fetchAssets() first.");
      console.log("Rocks: Attempting to fetch assets now...");
      Rocks.fetchAssets().then(() => {
        console.log("Rocks: Assets loaded successfully");
      }).catch(error => {
        console.error("Rocks: Failed to fetch assets:", error);
      });
      return null;
    }

    const rocksGroup = new THREE.Group();
    rocksGroup.name = 'rocks';
    const rockMeshes = [_rock1Mesh, _rock2Mesh, _rock3Mesh];

    const chunkWorldStartX = chunkX * CHUNK_SIZE;
    const chunkWorldStartZ = chunkZ * CHUNK_SIZE;

    console.log(`[Rocks] Generating ${this.options.rockCountPerChunk} rocks for chunk ${chunkX},${chunkZ}`);

    for (let i = 0; i < this.options.rockCountPerChunk; i++) {
      const localX = Math.random() * CHUNK_SIZE;
      const localZ = Math.random() * CHUNK_SIZE;

      const worldX = chunkWorldStartX + localX;
      const worldZ = chunkWorldStartZ + localZ;

      const p = new THREE.Vector3(
        worldX,
        0.0,
        worldZ
      );

      const n = 0.5 + 0.5 * simplex2d(new THREE.Vector2(
        p.x / this.options.scale,
        p.z / this.options.scale
      ));

      if (n < this.options.patchiness && Math.random() + 0.7 > this.options.patchiness) { continue; }

      const rockMesh = rockMeshes[Math.floor(Math.random() * rockMeshes.length)];
      const rock = rockMesh.clone();
      rock.position.copy(p);
      rock.rotation.set(
        0,
        2 * Math.PI * Math.random(),
        0
      );

      const scale = this.options.size.x + this.options.sizeVariation.x * Math.random();
      rock.scale.set(scale, scale, scale);

      rock.castShadow = true;
      rock.receiveShadow = true;
      rock.frustumCulled = true;

      rocksGroup.add(rock);
    }

    console.log(`[Rocks] Generated ${rocksGroup.children.length} rocks for chunk ${chunkX},${chunkZ}`);
    return rocksGroup;
  }

  public generateRocksFromData(data: { positions: number[]; scales: number[]; quaternions: number[]; colors: number[] }): THREE.Group | null {
    if (!_rock1Mesh || !_rock2Mesh || !_rock3Mesh || !data) return null;

    const rocksGroup = new THREE.Group();
    const rockMeshes = [_rock1Mesh, _rock2Mesh, _rock3Mesh];
    const { positions, scales, quaternions } = data;
    const count = positions.length / 3;

    for (let i = 0; i < count; i++) {
      const rockMesh = rockMeshes[Math.floor(Math.random() * rockMeshes.length)];
      const rock = rockMesh.clone();

      rock.position.fromArray(positions, i * 3);
      rock.scale.fromArray(scales, i * 3);
      rock.quaternion.fromArray(quaternions, i * 4);

      rocksGroup.add(rock);
    }
    return rocksGroup;
  }

  public disposeChunk(chunkGroup: THREE.Group): void {
    chunkGroup.children.forEach(child => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
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
    chunkGroup.clear(); // Remove all children from the group
  }
}
