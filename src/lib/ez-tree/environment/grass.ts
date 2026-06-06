import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { logger } from "utils/logger";
import { CHUNK_SIZE } from "../../chunkUtils";
import { getModel, putModel } from "../../indexedDB"; // Import IndexedDB utilities
import { updateFlowerWindShaderUniforms } from "../shaders/windShaderUpdater";
import { appendWindShader } from "../shaders/windShaderUtils"; // Import the new utility and WindOptions
import { simplex2d } from "./noise";

let loaded = false;
let _grassMesh: THREE.Mesh | null = null;

export class GrassOptions {
  public instanceCountPerChunk: number = 2000; // Number of grass instances per chunk
  public scale: number = 100;
  public patchiness: number = 0.8; // Increased from 0.7 to 0.8 to reduce density for mobile
  public size: { x: number; y: number; z: number } = { x: 0.2, y: 0.2, z: 0.2 };
  public sizeVariation: { x: number; y: number; z: number } = { x: 0.05, y: 0.05, z: 0.05 };
  public windStrength: { x: number; y: number; z: number } = { x: 0.6, y: 0.6, z: 0.6 }; // Apply same wind strength used in flowers
  public windFrequency: number = 1.2; // Apply same wind frequency used in flowers
  public windScale: number = 500.0; // Apply same wind scale used in flowers
}

export class Grass extends THREE.Object3D {
  public options: GrassOptions;
  private sharedMaterial: THREE.MeshPhongMaterial | null = null;

  constructor(options: GrassOptions = new GrassOptions()) {
    super();
    this.options = options;
    this.name = "Grass";
  }

  /**
   * Update wind effect on grass
   * @param time Current time
   */
  public updateWindEffect(time: number): void {
    if (this.sharedMaterial) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      updateFlowerWindShaderUniforms(this.sharedMaterial, this.options as any, time);
    }
  }

  public static async fetchAssets(): Promise<void> {
    if (loaded) return;

    try {
      const gltfLoader = new GLTFLoader();
      _grassMesh = await this.loadGrassMesh(gltfLoader);
      loaded = true;
    } catch (error) {
      logger.error("[Grass] Failed to fetch assets:", error);
    }
  }

  /* eslint-disable no-await-in-loop */
  private static async loadGrassMesh(
    loader: GLTFLoader,
    maxAttempts: number = 20
  ): Promise<THREE.Mesh> {
    const modelPath = "/models/grass.glb";
    const modelName = "grass_model";

    for (let i = 1; i <= maxAttempts; i++) {
      try {
        const cachedData = await getModel(modelName);
        if (cachedData) {
          logger.log(`[Grass] Loading grass model from IndexedDB: ${modelName}`);
          const gltf = await loader.parseAsync(cachedData, "");
          return this.findFirstMesh(gltf.scene);
        }

        logger.log(`[Grass] Fetching grass model from network (attempt ${i}): ${modelPath}`);
        const response = await fetch(modelPath);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const arrayBuffer = await response.arrayBuffer();
        await putModel(modelName, arrayBuffer);
        const gltf = await loader.parseAsync(arrayBuffer, "");
        return this.findFirstMesh(gltf.scene);
      } catch (error) {
        logger.warn(`[Grass] Attempt ${i} failed:`, error);
        if (i === maxAttempts) {
          logger.error(
            `[Grass] Persistent failure after ${maxAttempts} attempts. Falling back to direct load.`
          );
          const gltf = await loader.loadAsync(modelPath);
          return this.findFirstMesh(gltf.scene);
        }
        const delay = Math.min(1000 * Math.pow(1.5, i - 1), 10000);
        await new Promise(r => setTimeout(r, delay));
      }
    }
    throw new Error("Failed to load grass mesh");
  }
  /* eslint-enable no-await-in-loop */

  private static findFirstMesh(scene: THREE.Group): THREE.Mesh {
    let mesh: THREE.Mesh | null = null;
    scene.traverse(child => {
      if (!mesh && child instanceof THREE.Mesh) {
        mesh = child;
      }
    });
    if (!mesh) throw new Error("No mesh found in grass model");
    return mesh;
  }

  public update(elapsedTime: number): void {
    this.traverse(o => {
      if ((o as THREE.Mesh).isMesh && (o as THREE.Mesh).material) {
        const { material } = o as THREE.Mesh;
        const materials = Array.isArray(material) ? material : [material];
        materials.forEach((mat: THREE.Material) => {
          const shader = mat.userData["shader"] as
            | { uniforms: { uTime: { value: number } } }
            | undefined;
          if (shader) {
            shader.uniforms.uTime.value = elapsedTime;
          }
        });
      }
    });
  }

  public generateGrassForChunk(chunkX: number, chunkZ: number): THREE.InstancedMesh | null {
    if (!_grassMesh) {
      logger.warn("Grass: No mesh loaded. Call fetchAssets() first.");
      return null;
    }

    if (!this.sharedMaterial) {
      this.sharedMaterial = this.createGrassMaterial(_grassMesh);
    }
    const instancedGrass = new THREE.InstancedMesh(
      _grassMesh.geometry,
      this.sharedMaterial,
      this.options.instanceCountPerChunk
    );

    instancedGrass.name = "grass";
    const count = this.populateInstancedMesh(instancedGrass, chunkX, chunkZ);

    instancedGrass.count = count;
    instancedGrass.receiveShadow = false; // Optimized: Grass shadows are too expensive
    instancedGrass.castShadow = false; // Optimized: Grass shadows are too expensive
    instancedGrass.frustumCulled = true;
    instancedGrass.instanceMatrix.needsUpdate = true;
    if (instancedGrass.instanceColor) instancedGrass.instanceColor.needsUpdate = true;

    logger.log(`[Grass] Generated ${count} grass instances`);
    return instancedGrass;
  }

  private createGrassMaterial(sourceMesh: THREE.Mesh): THREE.MeshPhongMaterial {
    const baseMat = Array.isArray(sourceMesh.material)
      ? sourceMesh.material[0]
      : sourceMesh.material;
    const standardMat = baseMat as THREE.MeshStandardMaterial;

    const grassMaterial = new THREE.MeshPhongMaterial({
      map: standardMat?.map || null,
      emissive: new THREE.Color(0x308040),
      emissiveIntensity: 0.05,
      transparent: false,
      alphaTest: 0.5,
      depthTest: true,
      depthWrite: true,
      side: THREE.DoubleSide,
    });

    appendWindShader(grassMaterial, { ...this.options, instanced: true });
    grassMaterial.color.multiplyScalar(0.6);
    grassMaterial.needsUpdate = true;

    return grassMaterial;
  }

  private populateInstancedMesh(mesh: THREE.InstancedMesh, chunkX: number, chunkZ: number): number {
    const dummy = new THREE.Object3D();
    const chunkStartX = chunkX * CHUNK_SIZE;
    const chunkStartZ = chunkZ * CHUNK_SIZE;
    let count = 0;

    for (let i = 0; i < this.options.instanceCountPerChunk; i++) {
      const worldX = chunkStartX + Math.random() * CHUNK_SIZE;
      const worldZ = chunkStartZ + Math.random() * CHUNK_SIZE;

      const n =
        0.5 +
        0.5 *
          simplex2d(new THREE.Vector2(worldX / this.options.scale, worldZ / this.options.scale));
      if (n > this.options.patchiness && Math.random() + 0.4 > this.options.patchiness) continue;

      dummy.position.set(worldX, 0, worldZ);
      dummy.rotation.set(0, 2 * Math.PI * Math.random(), 0);
      dummy.scale.set(
        this.options.sizeVariation.x * Math.random() + this.options.size.x,
        this.options.sizeVariation.y * Math.random() + this.options.size.y,
        this.options.sizeVariation.z * Math.random() + this.options.size.z
      );
      dummy.updateMatrix();

      const color = new THREE.Color(0.25 + Math.random() * 0.1, 0.3 + Math.random() * 0.3, 0.1);
      mesh.setMatrixAt(count, dummy.matrix);
      mesh.setColorAt(count, color);
      count++;
    }
    return count;
  }

  public generateGrassFromData(data: {
    positions: number[];
    scales: number[];
    quaternions: number[];
    colors: number[];
  }): THREE.InstancedMesh | null {
    if (!_grassMesh || !data) return null;

    const { positions, scales, quaternions, colors } = data;
    const count = positions.length / 3;

    if (!this.sharedMaterial) {
      this.sharedMaterial = this.createGrassMaterial(_grassMesh);
    }
    const instancedGrass = new THREE.InstancedMesh(_grassMesh.geometry, this.sharedMaterial, count);

    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    for (let i = 0; i < count; i++) {
      dummy.position.fromArray(positions, i * 3);
      dummy.scale.fromArray(scales, i * 3);
      dummy.quaternion.fromArray(quaternions, i * 4);
      dummy.updateMatrix();
      instancedGrass.setMatrixAt(i, dummy.matrix);

      color.fromArray(colors, i * 3);
      instancedGrass.setColorAt(i, color);
    }

    instancedGrass.instanceMatrix.needsUpdate = true;
    if (instancedGrass.instanceColor) instancedGrass.instanceColor.needsUpdate = true;
    instancedGrass.count = count;
    instancedGrass.receiveShadow = false; // Optimized
    instancedGrass.castShadow = false; // Optimized

    return instancedGrass;
  }
}
