import { useCallback, MutableRefObject, useRef, useEffect } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader';
import { Octree, OctreeObject } from '@/lib/Octree'; // Import OctreeObject
import { getModel, putModel } from '@/lib/indexedDB';
import { CHUNK_SIZE } from '@/lib/chunkUtils';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils'; // Import BufferGeometryUtils

interface StaticObjectInstance {
  instanceId: number;
  modelPath: string;
  chunkKey: string;
  octreeObject: OctreeObject; // Store the full OctreeObject
}

interface UseStaticObjectLogicProps {
  sceneRef: MutableRefObject<THREE.Scene | null>;
  octreeRef: MutableRefObject<Octree | null>;
}

// Define a type for the loaded GLTF scene and its materials/geometries
interface LoadedModel {
  geometry: THREE.BufferGeometry;
  material: THREE.Material | THREE.Material[];
}

export const useStaticObjectLogic = ({ sceneRef, octreeRef }: UseStaticObjectLogicProps) => {
  const instancedMeshesRef = useRef<Map<string, THREE.InstancedMesh>>(new Map());
  const loadedGeometriesRef = useRef<Map<string, LoadedModel>>(new Map());
  const staticObjectInstancesRef = useRef<StaticObjectInstance[]>([]);
  const availableInstanceIdsRef = useRef<Map<string, Set<number>>>(new Map()); // New: To track available instance IDs
  const dummy = new THREE.Object3D();

  const modelPaths = useRef([
    '/models/lands/statics/static_tree1.glb',
    '/models/lands/statics/static_tree_low.glb',
    '/models/lands/statics/static_tree_trunk_high.glb',
    '/models/lands/statics/static_tree_trunk_low_med.glb',
    '/models/lands/statics/static_island_tree_02_1k-v1.glb',
  ]);

  const MAX_INSTANCES_PER_MODEL = 1000; // Define maxInstances globally within the hook

  const loadModelAndPrepareInstancedMesh = useCallback(async (path: string, onProgress?: (url: string, loaded: number, total: number) => void) => {
    const name = path.split('/').pop()?.split('.')[0] || path;
    let gltf: any;
    let modelData: ArrayBuffer | undefined;

    console.log(`[StaticObjectLogic] Attempting to load ${name} from IndexedDB...`);
    modelData = await getModel(name);

    const loader = new GLTFLoader();
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('/libs/draco/gltf/');
    loader.setDRACOLoader(dracoLoader);

    if (modelData) {
      console.log(`[StaticObjectLogic] ${name} loaded from IndexedDB.`);
      const blob = new Blob([modelData], { type: 'model/gltf-binary' });
      const url = URL.createObjectURL(blob);
      gltf = await new Promise<any>((resolve, reject) => {
        loader.load(url, resolve, undefined, reject);
      });
      URL.revokeObjectURL(url);
    } else {
      console.log(`[StaticObjectLogic] ${name} not found in IndexedDB. Loading from network...`);
      gltf = await new Promise<any>((resolve, reject) => {
        loader.load(
          path,
          (gltf) => {
            fetch(path)
              .then(response => response.arrayBuffer())
              .then(buffer => putModel(name, buffer))
              .then(() => console.log(`[StaticObjectLogic] ${name} saved to IndexedDB.`))
              .catch(e => console.error(`[StaticObjectLogic] Failed to save ${name} to IndexedDB:`, e));
            resolve(gltf);
          },
          (xhr) => {
            if (onProgress) {
              onProgress(path, xhr.loaded, xhr.total);
            }
          },
          (error) => {
            console.error(`[StaticObjectLogic] Error loading ${name} from network:`, error);
            reject(error);
          }
        );
      });
    }

    const geometries: THREE.BufferGeometry[] = [];
    const materials: THREE.Material[] = [];

    gltf.scene.traverse((child: THREE.Object3D) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        if (mesh.geometry) {
          // Apply the mesh's world transform to its geometry
          mesh.geometry.applyMatrix4(mesh.matrixWorld);
          geometries.push(mesh.geometry.clone());
        }
        if (mesh.material) {
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach(m => {
              if (!materials.includes(m)) {
                materials.push(m.clone());
              }
            });
          } else {
            if (!materials.includes(mesh.material)) {
              materials.push((mesh.material as THREE.Material).clone());
            }
          }
        }
      }
    });

    if (geometries.length === 0 || materials.length === 0) {
      console.error(`[StaticObjectLogic] Could not extract geometry or material from ${path}`);
      return null;
    }

    // Merge all geometries into a single one
    const mergedGeometry = BufferGeometryUtils.mergeGeometries(geometries, true);
    if (!mergedGeometry) {
      console.error(`[StaticObjectLogic] Failed to merge geometries for ${path}`);
      return null;
    }
    console.log(`[StaticObjectLogic] Merged geometry for ${name}. Vertices: ${mergedGeometry.attributes.position.count}`);

    const finalMaterial = materials.length === 1 ? materials[0] : materials;
    console.log(`[StaticObjectLogic] Extracted ${materials.length} unique material(s) for ${name}.`);

    loadedGeometriesRef.current.set(path, { geometry: mergedGeometry, material: finalMaterial });

    // Create InstancedMesh for this model type
    const instancedMesh = new THREE.InstancedMesh(mergedGeometry, finalMaterial, MAX_INSTANCES_PER_MODEL);
    instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); // Will be updated frequently
    instancedMesh.name = `InstancedStaticMesh_${name}`;
    instancedMeshesRef.current.set(path, instancedMesh); // Store it first

    // Initialize available instance IDs for this model
    const ids = new Set<number>();
    for (let i = 0; i < MAX_INSTANCES_PER_MODEL; i++) {
      ids.add(i);
      dummy.position.set(10000, 10000, 10000); // Far away
      dummy.updateMatrix();
      instancedMesh.setMatrixAt(i, dummy.matrix);
    }
    instancedMesh.instanceMatrix.needsUpdate = true;
    instancedMesh.count = 0; // Initially no active instances
    availableInstanceIdsRef.current.set(path, ids); // Store the set of available IDs

    console.log(`[StaticObjectLogic] InstancedMesh created for ${name}. Initial count: ${instancedMesh.count}`);

    return { geometry: mergedGeometry, material: finalMaterial, instancedMesh };
  }, []);

  useEffect(() => {
    const initializeStaticObjects = async () => {
      if (!sceneRef.current) {
        console.log("[StaticObjectLogic] Scene not ready yet for initial static object setup.");
        return;
      }

      console.log("[StaticObjectLogic] Initializing static objects: Preloading models and adding to scene.");
      for (const path of modelPaths.current) {
        if (!instancedMeshesRef.current.has(path)) {
          await loadModelAndPrepareInstancedMesh(path);
        }
        const mesh = instancedMeshesRef.current.get(path);
        if (mesh && sceneRef.current && !sceneRef.current.getObjectByName(mesh.name)) {
          sceneRef.current.add(mesh);
          console.log(`[StaticObjectLogic] Added or re-added ${mesh.name} to scene during initial setup.`);
        }
      }
      console.log("[StaticObjectLogic] All static models initialized and added to scene.");
    };

    initializeStaticObjects();

    return () => {
      console.log("[StaticObjectLogic] Cleaning up InstancedMeshes and geometries...");
      instancedMeshesRef.current.forEach(mesh => {
        sceneRef.current?.remove(mesh);
        mesh.geometry.dispose();
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach(m => m.dispose());
        } else {
          (mesh.material as THREE.Material).dispose();
        }
      });
      instancedMeshesRef.current.clear();
      availableInstanceIdsRef.current.clear(); // Clear available IDs on cleanup

      loadedGeometriesRef.current.forEach(model => {
        model.geometry.dispose();
        if (Array.isArray(model.material)) {
          model.material.forEach(m => m.dispose());
        } else {
          (model.material as THREE.Material).dispose();
        }
      });
      loadedGeometriesRef.current.clear();
      console.log("[StaticObjectLogic] Cleanup complete.");
    };
  }, [loadModelAndPrepareInstancedMesh, sceneRef.current]);


  const addStaticObjectsForChunk = async (chunkX: number, chunkZ: number): Promise<StaticObjectInstance[]> => {
    if (!sceneRef.current) {
      console.error("[StaticObjectLogic] Scene is not initialized for static object loading.");
      return [];
    }

    const newStaticObjectInstances: StaticObjectInstance[] = [];
    const chunkKey = `${chunkX},${chunkZ}`;

    const chunkMinX = chunkX * CHUNK_SIZE;
    const chunkMaxX = (chunkX + 1) * CHUNK_SIZE;
    const chunkMinZ = chunkZ * CHUNK_SIZE;
    const chunkMaxZ = (chunkZ + 1) * CHUNK_SIZE;

    const numberOfStaticObjectsPerChunk = 2; // Generate a few static objects per chunk

    console.log(`[StaticObjectLogic] Adding ${numberOfStaticObjectsPerChunk} static objects for chunk [${chunkX}, ${chunkZ}]`);

    for (let i = 0; i < numberOfStaticObjectsPerChunk; i++) {
      const randomModelPath = modelPaths.current[Math.floor(Math.random() * modelPaths.current.length)];
      let instancedMesh = instancedMeshesRef.current.get(randomModelPath);
      let availableIds = availableInstanceIdsRef.current.get(randomModelPath);

      if (!instancedMesh || !availableIds) {
        console.log(`[StaticObjectLogic] InstancedMesh or available IDs for ${randomModelPath} not found, attempting to load it now.`);
        const loadedResult = await loadModelAndPrepareInstancedMesh(randomModelPath);
        if (loadedResult) {
          instancedMesh = loadedResult.instancedMesh;
          availableIds = availableInstanceIdsRef.current.get(randomModelPath);
        } else {
          console.error(`[StaticObjectLogic] Failed to load or prepare InstancedMesh for ${randomModelPath}. Skipping instance.`);
          continue;
        }
      }

      if (!availableIds || availableIds.size === 0) {
        console.warn(`[StaticObjectLogic] No available instance ID for ${randomModelPath}. Consider increasing MAX_INSTANCES_PER_MODEL.`);
        continue;
      }

      // Get an available instance ID
      const instanceId = availableIds.values().next().value;
      if (instanceId === undefined) {
        console.warn(`[StaticObjectLogic] Failed to get an available instance ID for ${randomModelPath}.`);
        continue;
      }
      availableIds.delete(instanceId); // Mark as used

      const x = chunkMinX + Math.random() * CHUNK_SIZE;
      const z = chunkMinZ + Math.random() * CHUNK_SIZE;
      
      let y = 0;
      if (octreeRef.current) {
        y = octreeRef.current.getGroundHeightAt(x, z);
      }

      dummy.position.set(x, y, z);
      dummy.scale.set(3, 3, 3); // Adjust scale as needed
      dummy.updateMatrix();

      console.log(`[StaticObjectLogic] Instance ${instanceId} for ${randomModelPath} position: (${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)})`);
      instancedMesh.setMatrixAt(instanceId, dummy.matrix);
      instancedMesh.instanceMatrix.needsUpdate = true;

      // Update the count if this instanceId is higher than or equal to the current count
      if (instanceId >= instancedMesh.count) {
        instancedMesh.count = instanceId + 1;
        console.log(`[StaticObjectLogic] Updated instancedMesh.count to: ${instancedMesh.count}`);
      }

      // Calculate bounds for Octree
      const tempBox = new THREE.Box3();
      instancedMesh.geometry.computeBoundingBox();
      tempBox.copy(instancedMesh.geometry.boundingBox!);
      tempBox.applyMatrix4(dummy.matrix); // Apply instance's matrix to bounds

      const octreeId = `StaticObject_chunk_${chunkX}_${chunkZ}_${i}_${randomModelPath.split('/').pop()?.split('.')[0]}_${instanceId}`;
      
      const octreeObject: OctreeObject = {
        id: octreeId,
        bounds: tempBox,
        data: {
          position: dummy.position.clone(),
          scale: dummy.scale.clone(),
          modelPath: randomModelPath,
          instanceId: instanceId,
          chunkKey: chunkKey,
        }
      };

      if (octreeRef.current) {
        octreeRef.current.insert(octreeObject); // Use insert method
        console.log(`[StaticObjectLogic] Added object to Octree: ${octreeId}`);
      }

      console.log(`[StaticObjectLogic] Before push: newStaticObjectInstances.length = ${newStaticObjectInstances.length}`);
      newStaticObjectInstances.push({ instanceId, modelPath: randomModelPath, chunkKey, octreeObject });
      console.log(`[StaticObjectLogic] After push: newStaticObjectInstances.length = ${newStaticObjectInstances.length}`);
    }

    console.log(`[StaticObjectLogic] After loop, final newStaticObjectInstances.length: ${newStaticObjectInstances.length}`);
    console.log(`[StaticObjectLogic] Finished adding static objects for chunk [${chunkX}, ${chunkZ}]. Total new instances: ${newStaticObjectInstances.length}`);
    return newStaticObjectInstances;
  };

  const removeStaticObjectsForChunk = useCallback((objectsToRemove: StaticObjectInstance[]) => {
    if (!sceneRef.current) return;

    console.log(`[StaticObjectLogic] Removing ${objectsToRemove.length} static object instances.`);

    objectsToRemove.forEach(objectInstance => {
      const { instanceId, modelPath, octreeObject } = objectInstance;
      const instancedMesh = instancedMeshesRef.current.get(modelPath);
      const availableIds = availableInstanceIdsRef.current.get(modelPath);

      if (instancedMesh && instanceId !== -1 && availableIds) {
        // Hide the instance by moving it far away
        dummy.position.set(10000, 10000, 10000);
        dummy.updateMatrix();
        instancedMesh.setMatrixAt(instanceId, dummy.matrix);
        instancedMesh.instanceMatrix.needsUpdate = true;
        console.log(`[StaticObjectLogic] Hiding instance ${instanceId} for ${modelPath}.`);

        // Return the instance ID to the available set
        availableIds.add(instanceId);

        // If the removed instance was the last active one, reduce count
        if (instanceId === instancedMesh.count - 1) {
          let newCount = 0;
          for (let i = instanceId - 1; i >= 0; i--) {
            if (!availableIds.has(i)) {
              newCount = i + 1;
              break;
            }
          }
          instancedMesh.count = newCount;
          console.log(`[StaticObjectLogic] Reduced instancedMesh.count to: ${instancedMesh.count}`);
        }

        // Remove from Octree
        if (octreeRef.current) {
          octreeRef.current.remove(octreeObject); // Pass the stored OctreeObject
          console.log(`[StaticObjectLogic] Removed object from Octree: ${octreeObject.id}`);
        }
      }
    });
    console.log(`[StaticObjectLogic] Finished removing static object instances.`);
  }, [sceneRef, octreeRef]);

  return { addStaticObjectsForChunk, removeStaticObjectsForChunk };
};
