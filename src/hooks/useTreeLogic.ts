import { useCallback, MutableRefObject, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader';
import { Octree } from '@/lib/Octree';
import { getModel, putModel } from '@/lib/indexedDB';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils';
import { CHUNK_SIZE } from '@/lib/chunkUtils'; // Import CHUNK_SIZE

interface TreeInstance {
  model: THREE.Group;
  mixer: THREE.AnimationMixer;
}

interface UseTreeLogicProps {
  sceneRef: MutableRefObject<THREE.Scene | null>;
  octreeRef: MutableRefObject<Octree | null>;
}

export const useTreeLogic = ({ sceneRef, octreeRef }: UseTreeLogicProps) => {
  const treeInstancesRef = useRef<TreeInstance[]>([]); // Ref to store all active tree instances

  // Helper to dispose of a single model's resources
  const disposeModelResources = useCallback((model: THREE.Group) => {
    model.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        if ((child as THREE.Mesh).geometry) {
          (child as THREE.Mesh).geometry.dispose();
        }
        if ((child as THREE.Mesh).material) {
          const material = (child as THREE.Mesh).material;
          if (Array.isArray(material)) {
            material.forEach(m => m.dispose());
          } else {
            (material as THREE.Material).dispose();
          }
        }
      }
    });
    console.log(`[useTreeLogic] Disposed of tree model resources.`);
  }, []);

  const addTreesForChunk = useCallback(async (chunkX: number, chunkZ: number, onProgress?: (url: string, loaded: number, total: number) => void): Promise<TreeInstance[]> => {
    if (!sceneRef.current) {
      console.error("Scene is not initialized for tree loading.");
      return [];
    }

    const loader = new GLTFLoader();
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('/libs/draco/gltf/');
    loader.setDRACOLoader(dracoLoader);

    const modelPath = '/models/lands/Tree1.glb';
    const modelName = 'Tree1';
    const numberOfTreesPerChunk = 1; // Number of trees to generate per chunk

    const newTreeInstances: TreeInstance[] = [];

    try {
      let gltf: any;
      let modelData: ArrayBuffer | undefined;

      console.log(`Attempting to load ${modelName} from IndexedDB...`);
      modelData = await getModel(modelName);

      if (modelData) {
        console.log(`${modelName} loaded from IndexedDB.`);
        const blob = new Blob([modelData], { type: 'model/gltf-binary' });
        const url = URL.createObjectURL(blob);
        gltf = await new Promise<any>((resolve, reject) => {
          loader.load(url, resolve, undefined, reject);
        });
        URL.revokeObjectURL(url);
      } else {
        console.log(`${modelName} not found in IndexedDB. Loading from network...`);
        gltf = await new Promise<any>((resolve, reject) => {
          loader.load(
            modelPath,
            (gltf) => {
              fetch(modelPath)
                .then(response => response.arrayBuffer())
                .then(buffer => putModel(modelName, buffer))
                .then(() => console.log(`${modelName} saved to IndexedDB.`))
                .catch(e => console.error(`Failed to save ${modelName} to IndexedDB:`, e));
              resolve(gltf);
            },
            (xhr) => {
              if (onProgress) {
                onProgress(modelPath, xhr.loaded, xhr.total);
              }
            },
            (error) => {
              console.error(`Error loading ${modelName} from network:`, error);
              reject(error);
            }
          );
        });
      }

      const chunkMinX = chunkX * CHUNK_SIZE;
      const chunkMaxX = (chunkX + 1) * CHUNK_SIZE;
      const chunkMinZ = chunkZ * CHUNK_SIZE;
      const chunkMaxZ = (chunkZ + 1) * CHUNK_SIZE;

      for (let i = 0; i < numberOfTreesPerChunk; i++) {
        const treeInstanceModel = SkeletonUtils.clone(gltf.scene);

        treeInstanceModel.traverse((child: THREE.Object3D) => {
          if (child instanceof THREE.Mesh) {
            child.material = (child.material as THREE.Material).clone();
          }
        });

        treeInstanceModel.scale.set(3, 3, 3);

        // Random position within the current chunk
        const x = chunkMinX + Math.random() * CHUNK_SIZE;
        const z = chunkMinZ + Math.random() * CHUNK_SIZE;
        
        let y = 0;
        if (octreeRef.current) {
          y = octreeRef.current.getGroundHeightAt(x, z);
        }
        treeInstanceModel.position.set(x, y, z);
        treeInstanceModel.name = `${modelName}_chunk_${chunkX}_${chunkZ}_${i}`;

        sceneRef.current.add(treeInstanceModel);

        if (octreeRef.current) {
          octreeRef.current.addThreeMesh(treeInstanceModel, treeInstanceModel.name);
        }

        let mixer: THREE.AnimationMixer | null = null;
        if (gltf.animations && gltf.animations.length > 0) {
          mixer = new THREE.AnimationMixer(treeInstanceModel);
          const clip = THREE.AnimationClip.findByName(gltf.animations, 'treeArm|Scene');
          if (clip) {
            const action = mixer.clipAction(clip);
            action.play();
            action.setEffectiveTimeScale(0.5);
          } else {
            console.warn(`Animation clip 'treeArm|Scene' not found for ${modelName}.`);
          }
        }

        if (mixer) {
          const newTreeInstance: TreeInstance = { model: treeInstanceModel as THREE.Group, mixer: mixer };
          treeInstancesRef.current.push(newTreeInstance); // Add to global list of all tree instances
          newTreeInstances.push(newTreeInstance); // Add to list for this chunk
        }
      }

      console.log(`${numberOfTreesPerChunk} instances of ${modelName} loaded and added to scene for chunk [${chunkX}, ${chunkZ}].`);
      return newTreeInstances;
    } catch (error) {
      console.error(`Failed to load ${modelName} for chunk [${chunkX}, ${chunkZ}]:`, error);
      return [];
    }
  }, [sceneRef, octreeRef, disposeModelResources]);

  const removeTreesForChunk = useCallback((treesToRemove: TreeInstance[]) => {
    if (!sceneRef.current || !octreeRef.current) return;

    treesToRemove.forEach(treeInstance => {
      const { model, mixer } = treeInstance;

      // Remove from scene
      sceneRef.current!.remove(model as THREE.Object3D); // Re-add explicit cast

      // Remove from Octree
      const treeBounds = new THREE.Box3().setFromObject(model);
      octreeRef.current!.remove({ id: model.name, bounds: treeBounds, data: model }); // Add non-null assertion

      // Dispose mixer
      mixer.stopAllAction();
      mixer.uncacheRoot(mixer.getRoot());

      // Dispose model resources
      disposeModelResources(model);

      // Remove from the global list of tree instances
      treeInstancesRef.current = treeInstancesRef.current.filter(
        (instance) => instance.model.uuid !== model.uuid
      );
    });
    console.log(`Removed ${treesToRemove.length} tree instances.`);
  }, [sceneRef, octreeRef, disposeModelResources]);

  const updateTreeAnimations = useCallback((delta: number) => {
    treeInstancesRef.current.forEach(treeInstance => treeInstance.mixer.update(delta));
  }, []);

  return { addTreesForChunk, removeTreesForChunk, updateTreeAnimations };
};
