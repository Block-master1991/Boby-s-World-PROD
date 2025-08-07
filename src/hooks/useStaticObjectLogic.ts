import * as THREE from 'three';
import { useCallback, useRef, useEffect } from 'react';
import { useAdvancedOptimizations } from './useAdvancedOptimizations';
import { loadGLTF } from '../utils/modelLoader';
import { Octree } from '@/lib/Octree'; // Import Octree

export const useStaticObjectLogic = (
  { sceneRef, octreeRef }: {
    sceneRef: React.MutableRefObject<THREE.Scene | null>;
    octreeRef: React.MutableRefObject<Octree | null>;
  }
) => {
  const {
    loadChunksInBatches,
    updatePriority,
    getSortedChunks,
    updateScene,
    staticObjectInstancesRef,
    frameBudgetRef
  } = useAdvancedOptimizations();

  const instancedMeshesRef = useRef<Record<string, THREE.InstancedMesh[]>>({});
  const dummy = new THREE.Object3D();
  const loadingPromisesRef = useRef<Map<string, Promise<any[]>>>(new Map());

  const getAvailableInstanceIndex = useCallback((meshes: THREE.InstancedMesh[]) => {
    for (let i = 0; i < meshes.length; i++) {
      const mesh = meshes[i];
      for (let j = 0; j < mesh.count; j++) {
        const matrix = new THREE.Matrix4();
        mesh.getMatrixAt(j, matrix);
        const position = new THREE.Vector3();
        position.setFromMatrixPosition(matrix);
        
        if (position.x === 10000 && position.y === 10000 && position.z === 10000) {
          return { mesh, instanceIndex: j };
        }
      }
    }
    return null;
  }, []);

  const createInstancedMesh = useCallback(async (modelPath: string) => {
    const model = await loadGLTF(modelPath);
    const geometry = (model.children[0] as THREE.Mesh).geometry;
    const material = (model.children[0] as THREE.Mesh).material;
    
    const mesh = new THREE.InstancedMesh(
      geometry,
      material,
      2000 // الحد الأقصى لعدد النماذج
    );
    
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = true;
    
    return mesh;
  }, []);

  const addStaticObjectsForChunk = useCallback(async (chunkX: number, chunkZ: number) => {
    const chunkKey = `${chunkX},${chunkZ}`;
    
    // التحقق إذا كان الـ chunk قيد التحميل بالفعل
    if (loadingPromisesRef.current.has(chunkKey)) {
      return loadingPromisesRef.current.get(chunkKey)!; // Return the existing promise
    }

    const loadPromise = (async () => {
      const addedInstances: any[] = []; // Collect instances added in this call
      try {
        // تحديد النماذج التي يجب تحميلها لهذا الـ chunk
        const modelsToLoad = [
          { path: '/models/lands/statics/static_tree1.glb', positions: generateTreePositions(chunkX, chunkZ) },
          // أضف باقي النماذج هنا
        ];

        for (const { path, positions } of modelsToLoad) {
          if (!instancedMeshesRef.current[path]) {
            instancedMeshesRef.current[path] = [await createInstancedMesh(path)];
          }

          const meshes = instancedMeshesRef.current[path];
          
          for (const position of positions) {
            let availableInstance = getAvailableInstanceIndex(meshes);
            
            if (!availableInstance) {
              // إنشاء mesh جديد إذا لم يكن هناك مساحة
              const newMesh = await createInstancedMesh(path);
              meshes.push(newMesh);
              availableInstance = { mesh: newMesh, instanceIndex: 0 };
            }

            const { mesh, instanceIndex } = availableInstance;
            
            dummy.position.set(position.x, position.y, position.z);
            dummy.rotation.y = Math.random() * Math.PI * 2;
            dummy.scale.setScalar(0.8 + Math.random() * 0.4);
            dummy.updateMatrix();
            
            mesh.setMatrixAt(instanceIndex, dummy.matrix);
            mesh.instanceMatrix.needsUpdate = true;
            
            const newInstance = {
              mesh,
              instanceId: instanceIndex,
              position: dummy.position.clone(),
              modelPath: path,
              lastActive: Date.now()
            };
            // إضافة النموذج إلى قائمة النماذج النشطة
            staticObjectInstancesRef.current.push(newInstance);
            addedInstances.push(newInstance); // Add to the list for this chunk
          }
        }
      } catch (error) {
        console.error(`Error loading chunk ${chunkKey}:`, error);
      } finally {
        loadingPromisesRef.current.delete(chunkKey);
      }
      return addedInstances; // Return the instances added for this chunk
    })();

    loadingPromisesRef.current.set(chunkKey, loadPromise);
    return await loadPromise; // Return the promise's result
  }, [createInstancedMesh, getAvailableInstanceIndex]);

  const loadChunksWithOptimizations = useCallback(async (
    chunks: Array<{x: number, z: number}>,
    playerPosition: {x: number, z: number}
  ) => {
    // تحديث الأولويات
    chunks.forEach(chunk => {
      updatePriority(chunk.x, chunk.z, playerPosition);
    });

    // الحصول على الـ chunks مرتبة حسب الأولوية
    const sortedChunks = getSortedChunks();

    // تحميل الـ chunks باستخدام النظام المحسن
    await loadChunksInBatches(sortedChunks, addStaticObjectsForChunk);
  }, [updatePriority, getSortedChunks, loadChunksInBatches, addStaticObjectsForChunk]);

  const generateTreePositions = useCallback((chunkX: number, chunkZ: number) => {
    const positions: Array<{x: number, y: number, z: number}> = [];
    const treeCount = 50; // عدد الأشجار في كل chunk
    
    for (let i = 0; i < treeCount; i++) {
      positions.push({
        x: chunkX * 100 + Math.random() * 100,
        y: 0,
        z: chunkZ * 100 + Math.random() * 100
      });
    }
    
    return positions;
  }, []);

  const removeStaticObjectsForChunk = useCallback((staticObjects: any[]) => {
    staticObjects.forEach(instance => {
      if (instance.mesh && instance.instanceId !== undefined) {
        // Reset the instance's matrix to a "hidden" position
        dummy.position.set(10000, 10000, 10000); // Far away
        dummy.updateMatrix();
        instance.mesh.setMatrixAt(instance.instanceId, dummy.matrix);
        instance.mesh.instanceMatrix.needsUpdate = true;
      }
    });
    // Remove from active instances list
    staticObjectInstancesRef.current = staticObjectInstancesRef.current.filter(
      (inst) => !staticObjects.includes(inst)
    );
  }, []);

  return {
    addStaticObjectsForChunk,
    removeStaticObjectsForChunk,
    loadChunksWithOptimizations, // Keep this if it's used elsewhere
    updateScene, // Keep this if it's used elsewhere
    instancedMeshesRef,
    staticObjectInstancesRef
  };
};
