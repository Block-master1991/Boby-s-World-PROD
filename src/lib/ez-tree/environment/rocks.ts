import * as THREE from "three";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { logger } from "utils/logger";
import { CHUNK_SIZE } from "../../chunkUtils";
import { getModel, putModel } from "../../indexedDB";
import { simplex2d } from "./noise";

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
    this.name = "Rocks";
  }

  public static async fetchAssets(): Promise<void> {
    if (loaded) return;

    const gltfLoader = new GLTFLoader();

    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath("/libs/draco/");
    gltfLoader.setDRACOLoader(dracoLoader);

    const rock1Scene = await loadRockModel(gltfLoader, "/models/rock1.glb", "rock1_model");
    const rock2Scene = await loadRockModel(gltfLoader, "/models/rock2.glb", "rock2_model");
    const rock3Scene = await loadRockModel(gltfLoader, "/models/rock3.glb", "rock3_model");

    _rock1Mesh = findRockMesh(rock1Scene);
    _rock2Mesh = findRockMesh(rock2Scene);
    _rock3Mesh = findRockMesh(rock3Scene);

    loaded = true;
  }

  public generateRocksForChunk(chunkX: number, chunkZ: number): THREE.Group | null {
    if (!_rock1Mesh || !_rock2Mesh || !_rock3Mesh) {
      this.handleMissingAssets();
      return null;
    }

    const rocksGroup = new THREE.Group();
    rocksGroup.name = "rocks";
    const rockMeshes = [_rock1Mesh, _rock2Mesh, _rock3Mesh];

    const chunkWorldStartX = chunkX * CHUNK_SIZE;
    const chunkWorldStartZ = chunkZ * CHUNK_SIZE;

    for (let i = 0; i < this.options.rockCountPerChunk; i++) {
      const rock = this.createRockInstance(rockMeshes, chunkWorldStartX, chunkWorldStartZ);
      if (rock) rocksGroup.add(rock);
    }

    return rocksGroup;
  }

  private handleMissingAssets(): void {
    logger.warn("Rocks: No meshes loaded. Call fetchAssets() first.");
    Rocks.fetchAssets().catch(error => logger.error("Rocks: Failed to fetch assets:", error));
  }

  private createRockInstance(
    meshes: THREE.Mesh[],
    worldStartX: number,
    worldStartZ: number
  ): THREE.Mesh | null {
    const worldX = worldStartX + Math.random() * CHUNK_SIZE;
    const worldZ = worldStartZ + Math.random() * CHUNK_SIZE;

    const noise =
      0.5 +
      0.5 * simplex2d(new THREE.Vector2(worldX / this.options.scale, worldZ / this.options.scale));
    if (noise < this.options.patchiness && Math.random() + 0.7 > this.options.patchiness)
      return null;

    const rockMesh = meshes[Math.floor(Math.random() * meshes.length)];
    if (!rockMesh) return null;

    const rock = rockMesh.clone();
    rock.position.set(worldX, 0, worldZ);
    rock.rotation.set(0, 2 * Math.PI * Math.random(), 0);
    const scale = this.options.size.x + this.options.sizeVariation.x * Math.random();
    rock.scale.set(scale, scale, scale);
    rock.castShadow = true;
    rock.receiveShadow = true;
    rock.frustumCulled = true;

    return rock;
  }

  public generateRocksFromData(data: {
    positions: number[];
    scales: number[];
    quaternions: number[];
    colors: number[];
  }): THREE.Group | null {
    if (!_rock1Mesh || !_rock2Mesh || !_rock3Mesh || !data) return null;

    const rocksGroup = new THREE.Group();
    const rockMeshes = [_rock1Mesh, _rock2Mesh, _rock3Mesh];
    const { positions, scales, quaternions } = data;
    const count = positions.length / 3;

    for (let i = 0; i < count; i++) {
      const rockMesh = rockMeshes[Math.floor(Math.random() * rockMeshes.length)];
      if (!rockMesh) continue;
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
        // Do NOT dispose geometry/material here as they are shared via clone()
        // form the original loaded assets (_rock1Mesh, etc).
        // Only break references.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mesh.geometry = null as any;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mesh.material = null as any;
      }
    });
    chunkGroup.clear();
  }
}

/* eslint-disable no-await-in-loop */
async function loadRockModel(
  loader: GLTFLoader,
  path: string,
  name: string,
  maxAttempts: number = 20
): Promise<THREE.Group> {
  for (let i = 1; i <= maxAttempts; i++) {
    try {
      const cached = await getModel(name);
      if (cached) {
        const gltf = await loader.parseAsync(cached, "");
        return gltf.scene;
      }
      logger.log(`[Rocks] Fetching ${name} from network (attempt ${i}): ${path}`);
      const response = await fetch(path);
      if (!response.ok) throw new Error(`HTTP error ${response.status}`);
      const buffer = await response.arrayBuffer();
      await putModel(name, buffer);
      const gltf = await loader.parseAsync(buffer, "");
      return gltf.scene;
    } catch (error) {
      logger.warn(`[Rocks] Attempt ${i} failed for ${name}:`, error);
      if (i === maxAttempts) {
        logger.error(`[Rocks] Persistent failure for ${name}. Falling back to direct load.`);
        const gltf = await loader.loadAsync(path);
        return gltf.scene;
      }
      const delay = Math.min(1000 * Math.pow(1.5, i - 1), 10000);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw new Error(`Failed to load rock model ${name}`);
}
/* eslint-enable no-await-in-loop */

function findRockMesh(scene: THREE.Group): THREE.Mesh | null {
  let mesh: THREE.Mesh | null = null;
  scene.traverse(child => {
    if (child instanceof THREE.Mesh) mesh = child;
  });
  return mesh;
}
