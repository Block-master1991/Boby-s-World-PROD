import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { simplex2d } from './noise';
import { CHUNK_SIZE } from '../../chunkUtils';
import { appendWindShader } from '../shaders/windShaderUtils'; // Import the new utility and WindOptions
import { updateFlowerWindShaderUniforms } from '../shaders/windShaderUpdater';
import { getModel, putModel } from '../../indexedDB'; // Import IndexedDB utilities

let loaded = false;
let _grassMesh: THREE.Mesh | null = null;

export class GrassOptions {
  public instanceCountPerChunk: number = 2000; // Number of grass instances per chunk
  public scale: number = 100;
  public patchiness: number = 0.7;
  public size: { x: number; y: number; z: number } = { x: 0.2, y: 0.2, z: 0.2 };
  public sizeVariation: { x: number; y: number; z: number } = { x: 0.05, y: 0.05, z: 0.05 };
  public windStrength: { x: number; y: number; z: number } = { x: 0.6, y: 0.6, z: 0.6 }; // تطبيق نفس قوة الرياح المستخدمة في الأزهار
  public windFrequency: number = 1.2; // تطبيق نفس تردد الرياح المستخدم في الأزهار
  public windScale: number = 500.0; // تطبيق نفس مقياس الرياح المستخدم في الأزهار
}

export class Grass extends THREE.Object3D {
  public options: GrassOptions;
  private grassMaterial: THREE.Material | THREE.Material[];

  constructor(options: GrassOptions = new GrassOptions()) {
    super();
    this.options = options;
    this.name = 'Grass';

    // Initialize a dummy material, will be replaced after assets are fetched
    this.grassMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
  }

  /**
   * تحديث تأثير الرياح على العشب
   * @param time الوقت الحالي
   */
  public updateWindEffect(time: number): void {
    this.traverse((child) => {
      if (child instanceof THREE.InstancedMesh && child.material) {
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach(material => {
          // تحويل GrassOptions إلى FlowerOptions لاستخدامها مع updateFlowerWindShaderUniforms
          const flowerOptions = {
            windStrength: this.options.windStrength,
            windFrequency: this.options.windFrequency,
            windScale: this.options.windScale,
            flowersCountPerChunk: 0,
            size: { x: 0, y: 0, z: 0 },
            sizeVariation: { x: 0, y: 0, z: 0 },
            scale: 0,
            patchiness: 0
          };
          updateFlowerWindShaderUniforms(material, flowerOptions, time);
        });
      }
    });
  }

  public static async fetchAssets(): Promise<void> {
    if (loaded) return;

    const gltfLoader = new GLTFLoader();

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

    const modelPath = '/models/grass.glb';
    const modelName = 'grass_model';

    const loadModel = async (): Promise<THREE.Group> => {
      try {
        // Try to load from IndexedDB first
        const cachedData = await getModel(modelName);
        if (cachedData) {
          console.log(`[Grass] Loading grass model from IndexedDB: ${modelName}`);
          const gltf = await gltfLoader.parseAsync(cachedData, '');
          return gltf.scene;
        } else {
          console.log(`[Grass] Fetching grass model from network: ${modelPath}`);
          const response = await fetch(modelPath);
          if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
          const arrayBuffer = await response.arrayBuffer();
          await putModel(modelName, arrayBuffer); // Store in IndexedDB
          const gltf = await gltfLoader.parseAsync(arrayBuffer, '');
          return gltf.scene;
        }
      } catch (error) {
        console.error(`[Grass] Error loading or caching model ${modelName}:`, error);
        // Fallback to direct network load if IndexedDB fails
        console.log(`[Grass] Falling back to direct network load for: ${modelPath}`);
        const gltf = await gltfLoader.loadAsync(modelPath);
        return gltf.scene;
      }
    };

    const grassScene = await loadModel();
    _grassMesh = findMesh(grassScene);

    loaded = true;
  }

  public update(elapsedTime: number): void {
    this.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && (o as THREE.Mesh).material) {
        const materials = (Array.isArray((o as THREE.Mesh).material) ? (o as THREE.Mesh).material : [(o as THREE.Mesh).material]) as THREE.Material[];
        materials.forEach((mat: THREE.Material) => {
          if ((mat as THREE.MeshPhongMaterial).userData?.shader) {
            ((mat as THREE.MeshPhongMaterial).userData.shader as { uniforms: { uTime: { value: number } } }).uniforms.uTime.value = elapsedTime;
          }
        });
      }
    });
  }

  public generateGrassForChunk(chunkX: number, chunkZ: number): THREE.InstancedMesh | null {
    if (!_grassMesh) {
      console.warn("Grass: No mesh loaded. Call fetchAssets() first.");
      console.log("Grass: Attempting to fetch assets now...");
      Grass.fetchAssets().then(() => {
        console.log("Grass: Assets loaded successfully");
      }).catch(error => {
        console.error("Grass: Failed to fetch assets:", error);
      });
      return null;
    }

    let grassBaseMaterial = _grassMesh.material;
    if (Array.isArray(grassBaseMaterial)) {
      grassBaseMaterial = grassBaseMaterial[0];
    }
    const grassStandardMaterial = grassBaseMaterial as THREE.MeshStandardMaterial;

    const grassMaterial = new THREE.MeshPhongMaterial({
      map: grassStandardMaterial.map || null,
      emissive: new THREE.Color(0x308040),
      emissiveIntensity: 0.05,
      transparent: false,
      alphaTest: 0.5,
      depthTest: true,
      depthWrite: true,
      side: THREE.DoubleSide
    });

    // Pass the instance's options when applying the wind shader for grass generation
    appendWindShader(grassMaterial, this.options, true);
    grassMaterial.color.multiplyScalar(0.6);

    // Force update of the material
    grassMaterial.needsUpdate = true;

    const materialForMesh = Array.isArray(grassMaterial) ? grassMaterial[0] : grassMaterial;

    const instancedGrass = new THREE.InstancedMesh(
      _grassMesh.geometry,
      materialForMesh,
      this.options.instanceCountPerChunk
    );

    instancedGrass.name = 'grass';

    const dummy = new THREE.Object3D();
    let count = 0;

    const chunkWorldStartX = chunkX * CHUNK_SIZE;
    const chunkWorldStartZ = chunkZ * CHUNK_SIZE;

    console.log(`[Grass] Generating up to ${this.options.instanceCountPerChunk} grass instances for chunk ${chunkX},${chunkZ}`);

    for (let i = 0; i < this.options.instanceCountPerChunk; i++) {
      const localX = Math.random() * CHUNK_SIZE;
      const localZ = Math.random() * CHUNK_SIZE;

      const worldX = chunkWorldStartX + localX;
      const worldZ = chunkWorldStartZ + localZ;

      const p = new THREE.Vector3(worldX, 0, worldZ);

      const n = 0.5 + 0.5 * simplex2d(new THREE.Vector2(
        p.x / this.options.scale,
        p.z / this.options.scale
      ));

      if (n > this.options.patchiness && Math.random() + 0.4 > this.options.patchiness) { continue; }

      dummy.position.copy(p);

      dummy.rotation.set(
        0,
        2 * Math.PI * Math.random(),
        0
      );

      dummy.scale.set(
        this.options.sizeVariation.x * Math.random() + this.options.size.x,
        this.options.sizeVariation.y * Math.random() + this.options.size.y,
        this.options.sizeVariation.z * Math.random() + this.options.size.z
      );

      dummy.updateMatrix();

      const color = new THREE.Color(
        0.25 + Math.random() * 0.1,
        0.3 + Math.random() * 0.3,
        0.1);

      instancedGrass.setMatrixAt(count, dummy.matrix);
      instancedGrass.setColorAt(count, color);
      count++;
    }

    instancedGrass.count = count; // Set actual count of instances generated
    instancedGrass.receiveShadow = true;
    instancedGrass.castShadow = true;
    instancedGrass.frustumCulled = true;
    instancedGrass.instanceMatrix.needsUpdate = true;
    if (instancedGrass.instanceColor) {
      instancedGrass.instanceColor.needsUpdate = true;
    }

    console.log(`[Grass] Generated ${count} grass instances for chunk ${chunkX},${chunkZ}`);

    return instancedGrass;
  }

  public generateGrassFromData(data: { positions: number[]; scales: number[]; quaternions: number[]; colors: number[] }): THREE.InstancedMesh | null {
    if (!_grassMesh || !data) return null;

    const { positions, scales, quaternions, colors } = data;
    const count = positions.length / 3;

    let grassBaseMaterial = _grassMesh.material;
    if (Array.isArray(grassBaseMaterial)) {
      grassBaseMaterial = grassBaseMaterial[0];
    }
    const grassStandardMaterial = grassBaseMaterial as THREE.MeshStandardMaterial;

    const grassMaterial = new THREE.MeshPhongMaterial({
      map: grassStandardMaterial.map || null,
      emissive: new THREE.Color(0x308040),
      emissiveIntensity: 0.05,
      transparent: false,
      alphaTest: 0.5,
      depthTest: true,
      depthWrite: true,
      side: THREE.DoubleSide
    });

    appendWindShader(grassMaterial, this.options, true);
    grassMaterial.color.multiplyScalar(0.6);

    const materialForMesh = Array.isArray(grassMaterial) ? grassMaterial[0] : grassMaterial;

    const instancedGrass = new THREE.InstancedMesh(
      _grassMesh.geometry,
      materialForMesh,
      count
    );

    const dummy = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      dummy.position.fromArray(positions, i * 3);
      dummy.scale.fromArray(scales, i * 3);
      dummy.quaternion.fromArray(quaternions, i * 4);
      dummy.updateMatrix();
      instancedGrass.setMatrixAt(i, dummy.matrix);
      const color = new THREE.Color().fromArray(colors, i * 3);
      instancedGrass.setColorAt(i, color);
    }

    instancedGrass.instanceMatrix.needsUpdate = true;
    if (instancedGrass.instanceColor) {
      instancedGrass.instanceColor.needsUpdate = true;
    }
    instancedGrass.count = count;
    instancedGrass.receiveShadow = true;
    instancedGrass.castShadow = true;

    return instancedGrass;
  }
}
