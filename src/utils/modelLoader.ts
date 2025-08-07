// src/utils/modelLoader.ts
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';

const modelCache = new Map<string, {
  model: THREE.Group;
  lastAccessed: number;
}>();

const MAX_CACHE_SIZE = 50; // الحد الأقصى لحجم التخزين المؤقت
const CACHE_CLEANUP_INTERVAL = 60000; // تنظيف التخزين المؤقت كل دقيقة

export const loadGLTF = async (
  path: string,
  compress: boolean = true
): Promise<THREE.Group> => {
  // التحقق من التخزين المؤقت
  const cached = modelCache.get(path);
  if (cached) {
    cached.lastAccessed = Date.now();
    return cached.model;
  }

  const loader = new GLTFLoader();
  
  try {
    const gltf = await new Promise<any>((resolve, reject) => {
      loader.load(path, resolve, undefined, reject);
    });

    // تطبيق التحسينات على النموذج
    const model = gltf.scene;
    
    // تحسين الأداء
    model.traverse((child: THREE.Object3D) => {
      if (child instanceof THREE.Mesh) {
        // تفعيل Frustum Culling
        child.frustumCulled = true;
        
        // تحسين الذاكرة
        child.geometry.computeBoundingBox();
        child.geometry.computeBoundingSphere();
        
        // ضغط البيانات إذا كان ممكناً
        if (compress) {
          compressGeometry(child.geometry);
        }
      }
    });

    // إضافة النموذج إلى التخزين المؤقت
    modelCache.set(path, {
      model,
      lastAccessed: Date.now()
    });

    // تنظيف التخزين المؤقت إذا لزم الأمر
    cleanupCache();

    return model;
  } catch (error) {
    console.error('Error loading model:', error);
    throw error;
  }
};

const compressGeometry = (geometry: THREE.BufferGeometry) => {
  // ضغط إحداثيات الرؤوس
  const positionAttribute = geometry.getAttribute('position');
  if (positionAttribute) {
    const array = positionAttribute.array as Float32Array;
    for (let i = 0; i < array.length; i++) {
      // تقريب القيم لتقليل الدقة المطلوبة
      array[i] = Math.round(array[i] * 100) / 100;
    }
    positionAttribute.needsUpdate = true;
  }

  // ضغط إحداثيات الملمس
  const uvAttribute = geometry.getAttribute('uv');
  if (uvAttribute) {
    const array = uvAttribute.array as Float32Array;
    for (let i = 0; i < array.length; i++) {
      array[i] = Math.round(array[i] * 1000) / 1000;
    }
    uvAttribute.needsUpdate = true;
  }
};

const cleanupCache = () => {
  const now = Date.now();
  const entries = Array.from(modelCache.entries());
  
  // حذف النماذج القديمة
  entries.forEach(([path, data]) => {
    if (now - data.lastAccessed > CACHE_CLEANUP_INTERVAL) {
      modelCache.delete(path);
    }
  });

  // إذا كان التخزين المؤقت لا يزال كبيراً، حذف أقدم النماذج
  if (modelCache.size > MAX_CACHE_SIZE) {
    const sortedEntries = entries.sort((a, b) => a[1].lastAccessed - b[1].lastAccessed);
    const entriesToRemove = sortedEntries.slice(0, modelCache.size - MAX_CACHE_SIZE);
    
    entriesToRemove.forEach(([path]) => {
      modelCache.delete(path);
    });
  }
};
