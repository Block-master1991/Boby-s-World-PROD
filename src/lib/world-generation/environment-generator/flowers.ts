import * as THREE from "three";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { logger } from "utils/logger";
import { CHUNK_SIZE } from "../../chunkUtils";
import { getModel, putModel } from "../../indexedDB"; // Import IndexedDB utilities
import { updateFlowerWindShaderUniforms } from "../shaders/windShaderUpdater";
import { appendWindShader } from "../shaders/windShaderUtils";
import { simplex2d } from "./noise";

let loaded = false;
let _flowerBlueMesh: THREE.Mesh | null = null;
let _flowerWhiteMesh: THREE.Mesh | null = null;
let _flowerYellowMesh: THREE.Mesh | null = null;

import { FlowerOptions } from "./environmentOptions";
export { FlowerOptions };

export class Flowers extends THREE.Group {
  public options: FlowerOptions;

  constructor(options: FlowerOptions = new FlowerOptions()) {
    super();
    this.options = options;
    this.name = "Flowers";
  }

  /**
   * Update wind effect on flowers
   * @param time Current time
   */
  public updateWindEffect(time: number): void {
    const templates = [_flowerBlueMesh, _flowerWhiteMesh, _flowerYellowMesh];
    templates.forEach(mesh => {
      if (mesh) {
        mesh.traverse(child => {
          if (child instanceof THREE.Mesh && child.material) {
            const materials = Array.isArray(child.material) ? child.material : [child.material];
            materials.forEach(material => {
              updateFlowerWindShaderUniforms(material, this.options, time);
            });
          }
        });
      }
    });
  }

  public static async fetchAssets(): Promise<void> {
    if (loaded) return;

    try {
      logger.log("[Flowers] Loading flower models...");
      const gltfLoader = new GLTFLoader();
      const dracoLoader = new DRACOLoader();
      dracoLoader.setDecoderPath("/libs/draco/");
      gltfLoader.setDRACOLoader(dracoLoader);

      const loadModelBound = this.loadModel.bind(this, gltfLoader);

      _flowerBlueMesh = await loadModelBound("/models/flower_blue.glb", "flower_blue_model");
      _flowerWhiteMesh = await loadModelBound("/models/flower_white.glb", "flower_white_model");
      _flowerYellowMesh = await loadModelBound("/models/flower_yellow.glb", "flower_yellow_model");

      this.processFlowerMaterials([_flowerWhiteMesh, _flowerBlueMesh, _flowerYellowMesh]);

      logger.log("[Flowers] All flower models loaded successfully");
    } catch (error) {
      logger.error("[Flowers] Error loading flower models:", error);
      this.createFallbackMeshes();
    }

    loaded = true;
  }

  private static async loadModel(
    loader: GLTFLoader,
    modelPath: string,
    modelName: string
  ): Promise<THREE.Mesh> {
    const scene = await this.fetchModelScene(loader, modelPath, modelName);
    const mesh = scene.children[0] as THREE.Mesh;
    if (!mesh) throw new Error(`Model ${modelName} has no mesh`);
    return mesh;
  }

  /* eslint-disable no-await-in-loop */
  private static async fetchModelScene(
    loader: GLTFLoader,
    modelPath: string,
    modelName: string,
    maxAttempts: number = 20
  ): Promise<THREE.Group> {
    for (let i = 1; i <= maxAttempts; i++) {
      try {
        const cachedData = await getModel(modelName);
        if (cachedData) {
          logger.log(`[Flowers] Loading ${modelName} from IndexedDB`);
          const gltf = await loader.parseAsync(cachedData, "");
          return gltf.scene;
        }

        logger.log(`[Flowers] Fetching ${modelName} from network (attempt ${i}): ${modelPath}`);
        const response = await fetch(modelPath);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const arrayBuffer = await response.arrayBuffer();
        await putModel(modelName, arrayBuffer);
        const gltf = await loader.parseAsync(arrayBuffer, "");
        return gltf.scene;
      } catch (error) {
        logger.warn(`[Flowers] Attempt ${i} failed for ${modelName}:`, error);
        if (i === maxAttempts) {
          logger.error(
            `[Flowers] Persistent failure for ${modelName}. Falling back to direct load.`
          );
          const gltf = await loader.loadAsync(modelPath);
          return gltf.scene;
        }
        const delay = Math.min(1000 * Math.pow(1.5, i - 1), 10000);
        await new Promise(r => setTimeout(r, delay));
      }
    }
    throw new Error(`Failed to load flower model ${modelName}`);
  }
  /* eslint-enable no-await-in-loop */

  private static processFlowerMaterials(meshes: (THREE.Mesh | null)[]): void {
    meshes.forEach(mesh => {
      if (!mesh) return;
      mesh.traverse(o => {
        if (o instanceof THREE.Mesh && o.material) {
          if ((o.material as THREE.MeshStandardMaterial).map) {
            o.material = new THREE.MeshPhongMaterial({
              map: (o.material as THREE.MeshStandardMaterial).map,
            });
          }
          appendWindShader(o.material, { ...new FlowerOptions(), instanced: false });
        }
      });
    });
  }

  private static createFallbackMeshes(): void {
    _flowerBlueMesh = this.createFallbackFlower(0x3498db);
    _flowerWhiteMesh = this.createFallbackFlower(0xffffff);
    _flowerYellowMesh = this.createFallbackFlower(0xf1c40f);
  }

  public generateFlowersForChunk(
    chunkX: number,
    chunkZ: number,
    getHeightAt?: (x: number, z: number) => number
  ): THREE.Group | null {
    if (!_flowerBlueMesh || !_flowerWhiteMesh || !_flowerYellowMesh) {
      logger.warn("Flowers: No meshes loaded. Call fetchAssets() first.");
      return null;
    }

    const flowersGroup = new THREE.Group();
    flowersGroup.name = "flowers";
    const flowerMeshes = [_flowerBlueMesh, _flowerWhiteMesh, _flowerYellowMesh];

    const chunkWorldStartX = chunkX * CHUNK_SIZE;
    const chunkWorldStartZ = chunkZ * CHUNK_SIZE;

    for (let i = 0; i < this.options.flowersCountPerChunk; i++) {
      const pos = this.getRandomFlowerPosition(chunkWorldStartX, chunkWorldStartZ, getHeightAt);
      if (!pos) continue;

      const flowerMesh = flowerMeshes[Math.floor(Math.random() * flowerMeshes.length)];
      if (flowerMesh) {
        this.addFlowerToGroup(flowersGroup, flowerMesh, pos);
      }
    }
    return flowersGroup;
  }

  private getRandomFlowerPosition(
    startX: number,
    startZ: number,
    getHeightAt?: (x: number, z: number) => number
  ): THREE.Vector3 | null {
    const r = 10 + Math.random() * 200;
    const theta = Math.random() * 2.0 * Math.PI;
    const worldX = startX + r * Math.cos(theta);
    const worldZ = startZ + r * Math.sin(theta);

    const n =
      0.5 +
      0.5 * simplex2d(new THREE.Vector2(worldX / this.options.scale, worldZ / this.options.scale));
    if (n > this.options.patchiness && Math.random() + 0.8 > this.options.patchiness) return null;

    const height = getHeightAt ? getHeightAt(worldX, worldZ) : 0;
    return new THREE.Vector3(worldX, height, worldZ);
  }

  private addFlowerToGroup(group: THREE.Group, flowerMesh: THREE.Mesh, pos: THREE.Vector3): void {
    const flower = flowerMesh.clone();
    flower.position.copy(pos);
    flower.rotation.set(0, 2 * Math.PI * Math.random(), 0);

    const scale = (0.02 + 0.03 * Math.random()) / 7;
    flower.scale.set(scale, scale, scale);

    flower.castShadow = true;
    flower.receiveShadow = true;
    flower.frustumCulled = true;

    appendWindShader(flower.material, { ...this.options, instanced: false });
    group.add(flower);
  }

  public generateFlowersFromData(
    data: { positions: number[] },
    getHeightAt?: (x: number, z: number) => number
  ): THREE.Group | null {
    if (!_flowerBlueMesh || !_flowerWhiteMesh || !_flowerYellowMesh || !data) return null;

    const flowersGroup = new THREE.Group();
    const flowerMeshes = [_flowerBlueMesh, _flowerWhiteMesh, _flowerYellowMesh];
    const { positions } = data;
    const count = positions.length / 3;

    // Removed verbose log: logger.log(`[Flowers] Generating ${count} flowers from data`)

    for (let i = 0; i < count; i++) {
      const idx = i * 3;
      const x = positions[idx] as number;
      const y = positions[idx + 1] as number;
      const z = positions[idx + 2] as number;

      const height = getHeightAt ? getHeightAt(x, z) : y;
      const flowerMesh = flowerMeshes[Math.floor(Math.random() * flowerMeshes.length)];
      if (flowerMesh) {
        this.addFlowerToGroup(flowersGroup, flowerMesh, new THREE.Vector3(x, height, z));
      }
    }
    return flowersGroup;
  }

  // Function to create fallback flower model in case of original model loading failure
  private static createFallbackFlower(color: number): THREE.Mesh {
    const stemMaterial = new THREE.MeshBasicMaterial({ color: 0x2ecc71 });
    const headMaterial = new THREE.MeshBasicMaterial({ color });

    const stemGeometry = new THREE.CylinderGeometry(0.02, 0.02, 0.3, 8);
    stemGeometry.translate(0, 0.15, 0);

    const headGeometry = new THREE.SphereGeometry(0.1, 8, 6);
    headGeometry.translate(0, 0.3, 0);

    const mergedGeometry = this.mergeGeometries([stemGeometry, headGeometry]);
    return new THREE.Mesh(mergedGeometry, [stemMaterial, headMaterial]);
  }

  private static mergeGeometries(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
    const mergedGeometry = new THREE.BufferGeometry();
    let totalVertexCount = 0;
    const positions: number[] = [];
    const indices: number[] = [];

    for (const geometry of geometries) {
      const posAttr = geometry.getAttribute("position");
      if (!posAttr) continue;

      const posArray = posAttr.array;
      for (let i = 0; i < posArray.length; i++) {
        const val = posArray[i];
        if (typeof val === "number") {
          positions.push(val);
        }
      }

      const indexAttr = geometry.index;
      if (indexAttr) {
        const indexArray = indexAttr.array;
        for (let i = 0; i < indexArray.length; i++) {
          const val = indexArray[i];
          if (typeof val === "number") {
            indices.push(val + totalVertexCount);
          }
        }
      }
      totalVertexCount += posAttr.count;
    }

    mergedGeometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    mergedGeometry.setIndex(indices);
    return mergedGeometry;
  }

  public disposeChunk(chunkGroup: THREE.Group): void {
    chunkGroup.children.forEach(child => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        // Do NOT dispose geometry/material here as they are shared via clone()
        // form the original loaded assets.
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
