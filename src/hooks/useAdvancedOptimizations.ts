import * as THREE from 'three';
import { useCallback, useRef, useEffect } from 'react';

interface OptimizationOptions {
  batchSize?: number;
  delayBetweenBatches?: number;
  maxConcurrentLoads?: number;
  visibleDistance?: number;
  cleanupDistance?: number;
  maxInactiveTime?: number;
  lodDistances?: {
    high: number;
    medium: number;
    low: number;
  };
}

interface ChunkPriority {
  x: number;
  z: number;
  priority: number;
  lastAccessed: number;
}

interface StaticObjectInstance {
  mesh: THREE.InstancedMesh;
  instanceId: number;
  position: THREE.Vector3;
  modelPath: string;
  lastActive: number;
}

export const useAdvancedOptimizations = (options: OptimizationOptions = {}) => {
  const {
    batchSize = 2,
    delayBetweenBatches = 100,
    maxConcurrentLoads = 2,
    visibleDistance = 100,
    cleanupDistance = 150,
    maxInactiveTime = 30000,
    lodDistances = { high: 50, medium: 100, low: 200 }
  } = options;

  // المراجع للأنظمة المختلفة
  const chunkPrioritiesRef = useRef<Map<string, ChunkPriority>>(new Map());
  const staticObjectInstancesRef = useRef<StaticObjectInstance[]>([]);
  const dummy = new THREE.Object3D();
  const frameBudgetRef = useRef(16); // 60fps
  const lastFrameTimeRef = useRef(0);

  // 1. نظام الأولويات للتحميل
  const calculatePriority = useCallback((
    chunkX: number,
    chunkZ: number,
    playerPosition: {x: number, z: number}
  ): number => {
    const distance = Math.sqrt(
      Math.pow(chunkX - playerPosition.x, 2) + 
      Math.pow(chunkZ - playerPosition.z, 2)
    );
    
    const basePriority = 1 / (distance + 1);
    const timeDecay = 0.95;
    
    const chunkKey = `${chunkX},${chunkZ}`;
    const existingPriority = chunkPrioritiesRef.current.get(chunkKey);
    
    if (existingPriority) {
      const timeSinceLastAccess = Date.now() - existingPriority.lastAccessed;
      const timePriority = Math.pow(timeDecay, timeSinceLastAccess / 1000);
      return basePriority * timePriority;
    }
    
    return basePriority;
  }, []);

  const updatePriority = useCallback((
    chunkX: number,
    chunkZ: number,
    playerPosition: {x: number, z: number}
  ) => {
    const chunkKey = `${chunkX},${chunkZ}`;
    const priority = calculatePriority(chunkX, chunkZ, playerPosition);
    
    chunkPrioritiesRef.current.set(chunkKey, {
      x: chunkX,
      z: chunkZ,
      priority,
      lastAccessed: Date.now()
    });
  }, [calculatePriority]);

  const getSortedChunks = useCallback(() => {
    return Array.from(chunkPrioritiesRef.current.values())
      .sort((a, b) => b.priority - a.priority);
  }, []);

  // 2. نظام التحميل الدفعي مع التحكم في الأداء
  const loadChunksInBatches = useCallback(async <T>( // Make it generic
    chunks: Array<{x: number, z: number}>,
    loadChunkFunction: (x: number, z: number) => Promise<T> // Expect Promise<T>
  ) => {
    const loadingQueue = [...chunks];
    const activeLoads = new Set<Promise<void>>();

    const processBatch = async () => {
      if (loadingQueue.length === 0) return;

      const startTime = performance.now();
      const batch = loadingQueue.splice(0, batchSize);
      
      // التحقق من وقت الإطار
      const frameTime = performance.now() - lastFrameTimeRef.current;
      if (frameTime < frameBudgetRef.current) {
        const loadPromises = batch.map(chunk => loadChunkFunction(chunk.x, chunk.z));
        await Promise.all(loadPromises);
        
        // تحديث وقت الإطار الأخير
        lastFrameTimeRef.current = performance.now();
        
        // إعطاء فرصة للمتصفح للتنفس
        await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
      } else {
        // إذا تجاوزنا ميزانية الإطار، ننتظر الإطار التالي
        await new Promise(resolve => requestAnimationFrame(resolve));
      }
    };

    while (loadingQueue.length > 0 || activeLoads.size > 0) {
      while (activeLoads.size < maxConcurrentLoads && loadingQueue.length > 0) {
        const loadPromise = processBatch();
        activeLoads.add(loadPromise);
        loadPromise.finally(() => activeLoads.delete(loadPromise));
      }
      await Promise.race(Array.from(activeLoads));
    }
  }, [batchSize, delayBetweenBatches, maxConcurrentLoads]);

  // 3. نظام تنظيف الذاكرة المتقدم
  const cleanupDistantModels = useCallback((playerPosition: THREE.Vector3) => {
    const currentTime = Date.now();
    const inactiveModels: StaticObjectInstance[] = [];

    staticObjectInstancesRef.current.forEach(instance => {
      const distance = instance.position.distanceTo(playerPosition);
      const timeSinceActive = currentTime - instance.lastActive;
      
      if (distance > cleanupDistance || timeSinceActive > maxInactiveTime) {
        // نقل النموذج بعيداً بدلاً من إزالته
        dummy.position.set(10000, 10000, 10000);
        dummy.updateMatrix();
        instance.mesh.setMatrixAt(instance.instanceId, dummy.matrix);
        instance.mesh.instanceMatrix.needsUpdate = true;
        
        inactiveModels.push(instance);
      }
    });

    // تحديث المصفوفات دفعة واحدة
    if (inactiveModels.length > 0) {
      const uniqueMeshes = [...new Set(inactiveModels.map(m => m.mesh))];
      uniqueMeshes.forEach(mesh => {
        mesh.instanceMatrix.needsUpdate = true;
      });
    }

    return inactiveModels.length;
  }, [cleanupDistance, maxInactiveTime]);

  // 4. نظام LOD المتقدم
  const updateLOD = useCallback((
    mesh: THREE.InstancedMesh,
    instanceId: number,
    distance: number,
    basePath: string
  ) => {
    let newLOD: 'high' | 'medium' | 'low';
    
    if (distance < lodDistances.high) {
      newLOD = 'high';
    } else if (distance < lodDistances.medium) {
      newLOD = 'medium';
    } else {
      newLOD = 'low';
    }

    // تحديث النموذج بناءً على مستوى التفصيل
    // سيتم تنفيذ هذا الجزء مع نظام التحميل
    const instance = staticObjectInstancesRef.current.find(
      inst => inst.mesh === mesh && inst.instanceId === instanceId
    );
    
    if (instance) {
      instance.lastActive = Date.now();
    }
  }, [lodDistances]);

  // 5. نظام التحديث المتكامل
  const updateScene = useCallback((
    playerPosition: THREE.Vector3,
    camera: THREE.Camera
  ) => {
    const currentTime = performance.now();
    const deltaTime = currentTime - lastFrameTimeRef.current;
    
    // تحديث LOD للنماذج
    staticObjectInstancesRef.current.forEach(instance => {
      const distance = instance.position.distanceTo(playerPosition);
      updateLOD(instance.mesh, instance.instanceId, distance, instance.modelPath);
    });

    // تنظيف النماذج البعيدة
    if (deltaTime > frameBudgetRef.current) {
      cleanupDistantModels(playerPosition);
      lastFrameTimeRef.current = currentTime;
    }
  }, [updateLOD, cleanupDistantModels]);

  return {
    updatePriority,
    getSortedChunks,
    loadChunksInBatches,
    cleanupDistantModels,
    updateScene,
    staticObjectInstancesRef,
    frameBudgetRef
  };
};
