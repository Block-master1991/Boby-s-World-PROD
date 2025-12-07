import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { CHUNK_SIZE } from '../../chunkUtils';
import { simplex2d } from './noise';
import { appendWindShader } from '../shaders/windShaderUtils';
import { updateFlowerWindShaderUniforms } from '../shaders/windShaderUpdater';

let loaded = false;
let _flowerBlueMesh: THREE.Mesh | null = null;
let _flowerWhiteMesh: THREE.Mesh | null = null;
let _flowerYellowMesh: THREE.Mesh | null = null;

export class FlowerOptions {
  public flowersCountPerChunk: number = 5; // Number of flowers per chunk
  public size: { x: number; y: number; z: number } = { x: 0.5, y: 0.5, z: 0.5 }; // حجم موحد للنموذج الأصلي
  public sizeVariation: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 }; // لا تباين في الحجم
  public scale: number = 1.0; // مقياس موحد
  public patchiness: number = 0.6;
  public windStrength: { x: number; y: number; z: number } = { x: 0.6, y: 0.6, z: 0.6 }; // قوة الرياح (مضاعفة)
  public windFrequency: number = 1.2; // تردد الرياح (مضاعفة)
  public windScale: number = 500.0; // مقياس الرياح
}

export class Flowers extends THREE.Group {
  public options: FlowerOptions;

  constructor(options: FlowerOptions = new FlowerOptions()) {
    super();
    this.options = options;
    this.name = 'Flowers';
  }

  /**
   * تحديث تأثير الرياح على الأزهار
   * @param time الوقت الحالي
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

    try {
      console.log('[Flowers] Loading flower models...');
      
      // تحميل نماذج الأزهار كما في grass.js
      _flowerBlueMesh = (await gltfLoader.loadAsync('/models/flower_blue.glb')).scene.children[0] as THREE.Mesh;
      _flowerWhiteMesh = (await gltfLoader.loadAsync('/models/flower_white.glb')).scene.children[0] as THREE.Mesh;
      _flowerYellowMesh = (await gltfLoader.loadAsync('/models/flower_yellow.glb')).scene.children[0] as THREE.Mesh;
      
      // تطبيق نفس معالجة المواد كما في grass.js
      [_flowerWhiteMesh, _flowerBlueMesh, _flowerYellowMesh].forEach((mesh) => {
        if (mesh) {
          mesh.traverse((o) => {
            if (o instanceof THREE.Mesh && o.material) {
              if (o.material.map) {
                o.material = new THREE.MeshPhongMaterial({ map: o.material.map });
              }
              // تطبيق تظليل الرياح على الأزهار
              appendWindShader(o.material, new FlowerOptions(), false);
            }
          });
        }
      });
      
      console.log('[Flowers] All flower models loaded successfully');
    } catch (error) {
      console.error('[Flowers] Error loading flower models:', error);
      // إنشاء نماذج بديلة في حالة فشل التحميل
      _flowerBlueMesh = this.createFallbackFlower(0x3498db); // أزرق
      _flowerWhiteMesh = this.createFallbackFlower(0xffffff); // أبيض
      _flowerYellowMesh = this.createFallbackFlower(0xf1c40f); // أصفر
    }

    loaded = true;
  }

  public generateFlowersForChunk(chunkX: number, chunkZ: number, getHeightAt?: (x: number, z: number) => number): THREE.Group | null {
    if (!_flowerBlueMesh || !_flowerWhiteMesh || !_flowerYellowMesh) {
      console.warn("Flowers: No meshes loaded. Call fetchAssets() first.");
      return null;
    }

    const flowersGroup = new THREE.Group();
    flowersGroup.name = 'flowers';
    const flowerMeshes = [_flowerBlueMesh, _flowerWhiteMesh, _flowerYellowMesh];

    const chunkWorldStartX = chunkX * CHUNK_SIZE;
    const chunkWorldStartZ = chunkZ * CHUNK_SIZE;

    for (let i = 0; i < this.options.flowersCountPerChunk; i++) {
      // استخدام نفس طريقة تحديد المواقع كما في grass.js
      const r = 10 + Math.random() * 200;
      const theta = Math.random() * 2.0 * Math.PI;

      // Set position randomly
      const worldX = chunkWorldStartX + r * Math.cos(theta);
      const worldZ = chunkWorldStartZ + r * Math.sin(theta);

      // استخدام نفس طريقة حساب الضوضاء كما في grass.js
      const n = 0.5 + 0.5 * simplex2d(new THREE.Vector2(
        worldX / this.options.scale,
        worldZ / this.options.scale
      ));

      if (n > this.options.patchiness && Math.random() + 0.8 > this.options.patchiness) { continue; }

      // الحصول على ارتفاع التضاريس عند هذه النقطة
      const height = getHeightAt ? getHeightAt(worldX, worldZ) : 0;
      const p = new THREE.Vector3(worldX, height, worldZ);

      const flowerMesh = flowerMeshes[Math.floor(Math.random() * flowerMeshes.length)];
      // استنساخ النموذج كما في grass.js
      const flower = flowerMesh.clone();
      flower.position.copy(p);
      flower.rotation.set(0, 2 * Math.PI * Math.random(), 0);
      
      // تعيين حجم مصغر إلى ثلاثة أضعاف
      const scale = (0.02 + 0.03 * Math.random()) / 7;
      flower.scale.set(scale, scale, scale);

      flower.castShadow = true;
      flower.receiveShadow = true;
      flower.frustumCulled = true;
      
      // تطبيق تأثير الرياح على الزهرة
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

    console.log(`[Flowers] Generating ${count} flowers`);

    for (let i = 0; i < count; i++) {
      const flowerMesh = flowerMeshes[Math.floor(Math.random() * flowerMeshes.length)];
      
      // استنساخ النموذج كما في grass.js
      const flower = flowerMesh.clone();

      // استخراج الموضع الحالي
      const x = positions[i * 3];
      const z = positions[i * 3 + 2];

      // تحديد الارتفاع الصحيح للتضاريس
      const height = getHeightAt ? getHeightAt(x, z) : positions[i * 3 + 1];

      // تعيين الموضع الصحيح مع الارتفاع المحدد
      flower.position.set(x, height, z);
      flower.rotation.set(0, 2 * Math.PI * Math.random(), 0);
      
      // تعيين حجم مصغر إلى ثلاثة أضعاف
      const scale = (0.02 + 0.03 * Math.random()) / 7;
      flower.scale.set(scale, scale, scale);
      
      // التأكد من أن الزهرة تلقي وتستقبل الظلال
      flower.castShadow = true;
      flower.receiveShadow = true;
      flower.frustumCulled = true;
      
      // تطبيق تأثير الرياح على الزهرة
      if (flower.material) {
        appendWindShader(flower.material, this.options, false);
      }

      flowersGroup.add(flower);
    }
    return flowersGroup;
  }

  // دالة متقدمة لاستنساخ النماذج بشكل صحيح
  private cloneMeshAdvanced(original: THREE.Mesh): THREE.Mesh {
    // استنساخ الهندسة
    const geometry = original.geometry.clone();
    
    // استنساخ المواد
    let materials: THREE.Material | THREE.Material[];
    
    if (Array.isArray(original.material)) {
      // استنساخ مجموعة من المواد
      materials = original.material.map(mat => {
        if (mat instanceof THREE.Material) {
          return mat.clone();
        }
        return mat;
      });
    } else if (original.material) {
      // استنساخ مادة واحدة
      materials = original.material.clone();
    } else {
      // إنشاء مادة افتراضية إذا لم تكن هناك مادة
      materials = new THREE.MeshBasicMaterial({ color: 0xffffff });
    }
    
    // إنشاء النسخة الجديدة
    const clone = new THREE.Mesh(geometry, materials);
    
    // نسخ الخصائص الأخرى
    clone.position.copy(original.position);
    clone.rotation.copy(original.rotation);
    clone.scale.copy(original.scale);
    
    // نسخ خصائص الظل
    clone.castShadow = original.castShadow;
    clone.receiveShadow = original.receiveShadow;
    clone.frustumCulled = original.frustumCulled;
    
    return clone;
  }

  // دالة لإنشاء نموذج بديل للزهرة في حالة فشل تحميل النموذج الأصلي
  private static createFallbackFlower(color: number): THREE.Mesh {
    // إنشاء زهرة بسيطة من أشكال هندسية أساسية
    const flowerGroup = new THREE.Group();
    
    // ساق الزهرة
    const stemGeometry = new THREE.CylinderGeometry(0.02, 0.02, 0.3, 8);
    const stemMaterial = new THREE.MeshBasicMaterial({ color: 0x2ecc71 }); // أخضر
    const stem = new THREE.Mesh(stemGeometry, stemMaterial);
    stem.position.y = 0.15;
    flowerGroup.add(stem);
    
    // رأس الزهرة
    const headGeometry = new THREE.SphereGeometry(0.1, 8, 6);
    const headMaterial = new THREE.MeshBasicMaterial({ color });
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.y = 0.3;
    flowerGroup.add(head);
    
    // تحويل المجموعة إلى mesh واحد
    const mergedGeometry = new THREE.BufferGeometry();
    const geometries = [stem.geometry, head.geometry];
    
    // دمج الأشكال الهندسية
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
        // تحويل Uint32Array إلى Array<number>
        const indexArrayForSet = Array.from(newIndexArray);
        mergedGeometry.setIndex(indexArrayForSet);
      }
      
      vertexCount += positionAttribute.count;
    });
    
    // إنشاء mesh مدمج
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
