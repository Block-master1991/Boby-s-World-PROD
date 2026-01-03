import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { CHUNK_SIZE } from '../../chunkUtils';
import { simplex2d } from './noise';
import { appendWindShader } from '../shaders/windShaderUtils';
import { updateFlowerWindShaderUniforms } from '../shaders/windShaderUpdater';
import { getModel, putModel } from '../../indexedDB'; // Import IndexedDB utilities
import { logger } from 'utils/logger';

let loaded = false;
let _flowerBlueMesh: THREE.Mesh | null = null;
let _flowerWhiteMesh: THREE.Mesh | null = null;
let _flowerYellowMesh: THREE.Mesh | null = null;

export class FlowerOptions {
  public flowersCountPerChunk: number = 5; // Number of flowers per chunk
  public size: { x: number; y: number; z: number } = { x: 0.5, y: 0.5, z: 0.5 }; // Uniform size for the original model
  public sizeVariation: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 }; // No size variation
  public scale: number = 100.0; // Uniform scale
  public patchiness: number = 0.6;
  public windStrength: { x: number; y: number; z: number } = { x: 0.6, y: 0.6, z: 0.6 }; // Wind strength (multiplier)
  public windFrequency: number = 1.2; // Wind frequency (multiplier)
  public windScale: number = 500.0; // Wind scale
}

export class Flowers extends THREE.Group {
  public options: FlowerOptions;

  constructor(options: FlowerOptions = new FlowerOptions()) {
    super();
    this.options = options;
    this.name = 'Flowers';
  }

  /**
   * Update wind effect on flowers
   * @param time Current time
   */
  public updateWindEffect(time: number): void {
    this.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material) {
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach(material => {
          updateFlowerWindShaderUniforms(material, this.options, time);
        });
      }
    });
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
          logger.log(`[Flowers] Loading ${modelName} from IndexedDB`);
          const gltf = await gltfLoader.parseAsync(cachedData, '');
          return gltf.scene;
        } else {
          logger.log(`[Flowers] Fetching ${modelName} from network: ${modelPath}`);
          const response = await fetch(modelPath);
          if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
          const arrayBuffer = await response.arrayBuffer();
          await putModel(modelName, arrayBuffer); // Store in IndexedDB
          const gltf = await gltfLoader.parseAsync(arrayBuffer, '');
          return gltf.scene;
        }
      } catch (error) {
        logger.error(`[Flowers] Error loading or caching model ${modelName}:`, error);
        // Fallback to direct network load if IndexedDB fails
        logger.log(`[Flowers] Falling back to direct network load for: ${modelPath}`);
        const gltf = await gltfLoader.loadAsync(modelPath);
        return gltf.scene;
      }
    };

    try {
      logger.log('[Flowers] Loading flower models...');

      // Load flower models as in grass.js with IndexedDB caching
      _flowerBlueMesh = (await loadModel('/models/flower_blue.glb', 'flower_blue_model')).children[0] as THREE.Mesh;
      _flowerWhiteMesh = (await loadModel('/models/flower_white.glb', 'flower_white_model')).children[0] as THREE.Mesh;
      _flowerYellowMesh = (await loadModel('/models/flower_yellow.glb', 'flower_yellow_model')).children[0] as THREE.Mesh;

      // Apply same material processing as in grass.js
      [_flowerWhiteMesh, _flowerBlueMesh, _flowerYellowMesh].forEach((mesh) => {
        if (mesh) {
          mesh.traverse((o) => {
            if (o instanceof THREE.Mesh && o.material) {
              if (o.material.map) {
                o.material = new THREE.MeshPhongMaterial({ map: o.material.map });
              }
              // Apply wind shading to flowers
              appendWindShader(o.material, new FlowerOptions(), false);
            }
          });
        }
      });

      logger.log('[Flowers] All flower models loaded successfully');
    } catch (error) {
      logger.error('[Flowers] Error loading flower models:', error);
      // Create fallback models in case of loading failure
      _flowerBlueMesh = this.createFallbackFlower(0x3498db); // Blue
      _flowerWhiteMesh = this.createFallbackFlower(0xffffff); // White
      _flowerYellowMesh = this.createFallbackFlower(0xf1c40f); // Yellow
    }

    loaded = true;
  }

  public generateFlowersForChunk(chunkX: number, chunkZ: number, getHeightAt?: (x: number, z: number) => number): THREE.Group | null {
    if (!_flowerBlueMesh || !_flowerWhiteMesh || !_flowerYellowMesh) {
      logger.warn("Flowers: No meshes loaded. Call fetchAssets() first.");
      return null;
    }

    const flowersGroup = new THREE.Group();
    flowersGroup.name = 'flowers';
    const flowerMeshes = [_flowerBlueMesh, _flowerWhiteMesh, _flowerYellowMesh];

    const chunkWorldStartX = chunkX * CHUNK_SIZE;
    const chunkWorldStartZ = chunkZ * CHUNK_SIZE;

    for (let i = 0; i < this.options.flowersCountPerChunk; i++) {
      // Use same positioning method as in grass.js
      const r = 10 + Math.random() * 200;
      const theta = Math.random() * 2.0 * Math.PI;

      // Set position randomly
      const worldX = chunkWorldStartX + r * Math.cos(theta);
      const worldZ = chunkWorldStartZ + r * Math.sin(theta);

      // Use same noise calculation method as in grass.js
      const n = 0.5 + 0.5 * simplex2d(new THREE.Vector2(
        worldX / this.options.scale,
        worldZ / this.options.scale
      ));

      if (n > this.options.patchiness && Math.random() + 0.8 > this.options.patchiness) { continue; }

      // Get terrain height at this point
      const height = getHeightAt ? getHeightAt(worldX, worldZ) : 0;
      const p = new THREE.Vector3(worldX, height, worldZ);

      const flowerMesh = flowerMeshes[Math.floor(Math.random() * flowerMeshes.length)];
      // Clone the model as in grass.js
      const flower = flowerMesh.clone();
      flower.position.copy(p);
      flower.rotation.set(0, 2 * Math.PI * Math.random(), 0);

      // Set scaled size to three times smaller
      const scale = (0.02 + 0.03 * Math.random()) / 7;
      flower.scale.set(scale, scale, scale);

      flower.castShadow = true;
      flower.receiveShadow = true;
      flower.frustumCulled = true;

      // Apply wind effect to the flower
      if (flower.material) {
        appendWindShader(flower.material, this.options, false);
      }

      flowersGroup.add(flower);
    }
    return flowersGroup;
  }

  public generateFlowersFromData(data: { positions: number[]; scales: number[]; quaternions: number[]; colors: number[] }, getHeightAt?: (x: number, z: number) => number): THREE.Group | null {
    if (!_flowerBlueMesh || !_flowerWhiteMesh || !_flowerYellowMesh || !data) return null;

    const flowersGroup = new THREE.Group();
    const flowerMeshes = [_flowerBlueMesh, _flowerWhiteMesh, _flowerYellowMesh];
    const { positions, scales, quaternions } = data;
    const count = positions.length / 3;

    logger.log(`[Flowers] Generating ${count} flowers`);

    for (let i = 0; i < count; i++) {
      const flowerMesh = flowerMeshes[Math.floor(Math.random() * flowerMeshes.length)];

      // Clone the model as in grass.js
      const flower = flowerMesh.clone();

      // Extract current position
      const x = positions[i * 3];
      const z = positions[i * 3 + 2];

      // Determine correct terrain height
      const height = getHeightAt ? getHeightAt(x, z) : positions[i * 3 + 1];

      // Set correct position with determined height
      flower.position.set(x, height, z);
      flower.rotation.set(0, 2 * Math.PI * Math.random(), 0);

      // Set scaled size to three times smaller
      const scale = (0.02 + 0.03 * Math.random()) / 7;
      flower.scale.set(scale, scale, scale);

      // Ensure flower casts and receives shadows
      flower.castShadow = true;
      flower.receiveShadow = true;
      flower.frustumCulled = true;

      // Apply wind effect to the flower
      if (flower.material) {
        appendWindShader(flower.material, this.options, false);
      }

      flowersGroup.add(flower);
    }
    return flowersGroup;
  }

  // Advanced function for proper model cloning
  private cloneMeshAdvanced(original: THREE.Mesh): THREE.Mesh {
    // Clone geometry
    const geometry = original.geometry.clone();

    // Clone materials
    let materials: THREE.Material | THREE.Material[];

    if (Array.isArray(original.material)) {
      // Clone array of materials
      materials = original.material.map(mat => {
        if (mat instanceof THREE.Material) {
          return mat.clone();
        }
        return mat;
      });
    } else if (original.material) {
      // Clone single material
      materials = original.material.clone();
    } else {
      // Create default material if none exists
      materials = new THREE.MeshBasicMaterial({ color: 0xffffff });
    }

    // Create new clone
    const clone = new THREE.Mesh(geometry, materials);

    // Copy other properties
    clone.position.copy(original.position);
    clone.rotation.copy(original.rotation);
    clone.scale.copy(original.scale);

    // Copy shadow properties
    clone.castShadow = original.castShadow;
    clone.receiveShadow = original.receiveShadow;
    clone.frustumCulled = original.frustumCulled;

    return clone;
  }

  // Function to create fallback flower model in case of original model loading failure
  private static createFallbackFlower(color: number): THREE.Mesh {
    // Create simple flower from basic geometric shapes
    const flowerGroup = new THREE.Group();

    // Flower stem
    const stemGeometry = new THREE.CylinderGeometry(0.02, 0.02, 0.3, 8);
    const stemMaterial = new THREE.MeshBasicMaterial({ color: 0x2ecc71 }); // Green
    const stem = new THREE.Mesh(stemGeometry, stemMaterial);
    stem.position.y = 0.15;
    flowerGroup.add(stem);

    // Flower head
    const headGeometry = new THREE.SphereGeometry(0.1, 8, 6);
    const headMaterial = new THREE.MeshBasicMaterial({ color });
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.y = 0.3;
    flowerGroup.add(head);

    // Convert group to single mesh
    const mergedGeometry = new THREE.BufferGeometry();
    const geometries = [stem.geometry, head.geometry];

    // Merge geometries
    let vertexCount = 0;
    geometries.forEach(geometry => {
      const positionAttribute = geometry.getAttribute('position');
      mergedGeometry.setAttribute('position', new THREE.BufferAttribute(
        new Float32Array([...mergedGeometry.attributes.position?.array || [], ...positionAttribute.array]),
        3
      ));

      if (geometry.index) {
        const indexArray = geometry.index.array;
        const newIndexArray = new Uint32Array(indexArray.length);
        for (let i = 0; i < indexArray.length; i++) {
          newIndexArray[i] = indexArray[i] + vertexCount;
        }
        // Convert Uint32Array to Array<number>
        const indexArrayForSet = Array.from(newIndexArray);
        mergedGeometry.setIndex(indexArrayForSet);
      }

      vertexCount += positionAttribute.count;
    });

    // Create merged mesh
    const mergedMesh = new THREE.Mesh(mergedGeometry, [stemMaterial, headMaterial]);
    mergedMesh.position.copy(flowerGroup.position);
    mergedMesh.rotation.copy(flowerGroup.rotation);
    mergedMesh.scale.copy(flowerGroup.scale);

    return mergedMesh;
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
            (mesh.material as THREE.Material).dispose();
          }
        }
      }
    });
    chunkGroup.clear();
  }
}
