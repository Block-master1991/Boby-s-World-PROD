import { useCallback, MutableRefObject, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader';
import { Octree } from '@/lib/Octree';
import { getModel, putModel } from '@/lib/indexedDB';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils';
import { CHUNK_SIZE } from '@/lib/chunkUtils'; // Import CHUNK_SIZE

interface TreeInstance {
  lod: THREE.LOD;
  mixer: THREE.AnimationMixer;
}

interface UseTreeLogicProps {
  sceneRef: MutableRefObject<THREE.Scene | null>;
  octreeRef: MutableRefObject<Octree | null>;
}

export const useTreeLogic = ({ sceneRef, octreeRef }: UseTreeLogicProps) => {
  const treeInstancesRef = useRef<TreeInstance[]>([]); // Ref to store all active tree instances

  // Helper to dispose of a single model's resources
  const disposeModelResources = useCallback((model: THREE.Object3D) => {
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

    // Only add a tree every 3x3 chunks to reduce density
    if (chunkX % 3 !== 0 || chunkZ % 3 !== 0) {
      return [];
    }

    const loader = new GLTFLoader();
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('/libs/draco/gltf/');
    loader.setDRACOLoader(dracoLoader);

    const modelPaths = {
      high: '/models/lands/Tree1.glb',
      medium: '/models/lands/Tree1_medium.glb',
      low: '/models/lands/Tree1_low.glb',
    };
    const modelNames = {
      high: 'Tree1_high',
      medium: 'Tree1_medium',
      low: 'Tree1_low',
    };
    const numberOfTreesPerChunk = 1; // Number of trees to generate per chunk

    const newTreeInstances: TreeInstance[] = [];

    try {
      // Function to load a model from IndexedDB or network
      const loadModel = async (path: string, name: string) => {
        let gltf: any;
        let modelData: ArrayBuffer | undefined;

        console.log(`Attempting to load ${name} from IndexedDB...`);
        modelData = await getModel(name);

        if (modelData) {
          console.log(`${name} loaded from IndexedDB.`);
          const blob = new Blob([modelData], { type: 'model/gltf-binary' });
          const url = URL.createObjectURL(blob);
          gltf = await new Promise<any>((resolve, reject) => {
            loader.load(url, resolve, undefined, reject);
          });
          URL.revokeObjectURL(url);
        } else {
          console.log(`${name} not found in IndexedDB. Loading from network...`);
          gltf = await new Promise<any>((resolve, reject) => {
            loader.load(
              path,
              (gltf) => {
                fetch(path)
                  .then(response => response.arrayBuffer())
                  .then(buffer => putModel(name, buffer))
                  .then(() => console.log(`${name} saved to IndexedDB.`))
                  .catch(e => console.error(`Failed to save ${name} to IndexedDB:`, e));
                resolve(gltf);
              },
              (xhr) => {
                if (onProgress) {
                  onProgress(path, xhr.loaded, xhr.total);
                }
              },
              (error) => {
                console.error(`Error loading ${name} from network:`, error);
                reject(error);
              }
            );
          });
        }
        return gltf;
      };

      const gltfHigh = await loadModel(modelPaths.high, modelNames.high);
      const gltfMedium = await loadModel(modelPaths.medium, modelNames.medium);
      const gltfLow = await loadModel(modelPaths.low, modelNames.low);

      const chunkMinX = chunkX * CHUNK_SIZE;
      const chunkMaxX = (chunkX + 1) * CHUNK_SIZE;
      const chunkMinZ = chunkZ * CHUNK_SIZE;
      const chunkMaxZ = (chunkZ + 1) * CHUNK_SIZE;

      for (let i = 0; i < numberOfTreesPerChunk; i++) {
        const lod = new THREE.LOD();

        // High detail model
        const highDetailModel = SkeletonUtils.clone(gltfHigh.scene);
        highDetailModel.traverse((child: THREE.Object3D) => {
          if (child instanceof THREE.Mesh) {
            child.material = (child.material as THREE.Material).clone();
          }
        });
        highDetailModel.scale.set(3, 3, 3);
        lod.addLevel(highDetailModel, 25); // Show high detail at 25 units distance

        // Medium detail model
        const mediumDetailModel = SkeletonUtils.clone(gltfMedium.scene);
        mediumDetailModel.traverse((child: THREE.Object3D) => {
          if (child instanceof THREE.Mesh) {
            child.material = (child.material as THREE.Material).clone();
          }
        });
        mediumDetailModel.scale.set(3, 3, 3);
        lod.addLevel(mediumDetailModel, 50); // Show medium detail at 50 units distance

        // Low detail model
        const lowDetailModel = SkeletonUtils.clone(gltfLow.scene);
        lowDetailModel.traverse((child: THREE.Object3D) => {
          if (child instanceof THREE.Mesh) {
            child.material = (child.material as THREE.Material).clone();
          }
        });
        lowDetailModel.scale.set(3, 3, 3);
        lod.addLevel(lowDetailModel, 100); // Show low detail at 100 units distance

        // Random position within the current chunk
        const x = chunkMinX + Math.random() * CHUNK_SIZE;
        const z = chunkMinZ + Math.random() * CHUNK_SIZE;
        
        let y = 0;
        if (octreeRef.current) {
          y = octreeRef.current.getGroundHeightAt(x, z);
        }
        lod.position.set(x, y, z);
        lod.name = `Tree_chunk_${chunkX}_${chunkZ}_${i}`;

        sceneRef.current.add(lod);

        if (octreeRef.current) {
          octreeRef.current.addThreeMesh(lod, lod.name);
        }

        let mixer: THREE.AnimationMixer | null = null;
        if (gltfHigh.animations && gltfHigh.animations.length > 0) {
          mixer = new THREE.AnimationMixer(highDetailModel); // Mixer is tied to the high-detail model
          const clip = THREE.AnimationClip.findByName(gltfHigh.animations, 'treeArm|Scene');
          if (clip) {
            const action = mixer.clipAction(clip);
            action.play();
            action.setEffectiveTimeScale(0.5);
          } else {
            console.warn(`Animation clip 'treeArm|Scene' not found for high detail tree model.`);
          }
        }

        if (mixer) {
          const newTreeInstance: TreeInstance = { lod: lod, mixer: mixer };
          treeInstancesRef.current.push(newTreeInstance);
          newTreeInstances.push(newTreeInstance);
        }
      }

      console.log(`${numberOfTreesPerChunk} instances of trees loaded and added to scene for chunk [${chunkX}, ${chunkZ}].`);
      return newTreeInstances;
    } catch (error) {
      console.error(`Failed to load tree models for chunk [${chunkX}, ${chunkZ}]:`, error);
      return [];
    }
  }, [sceneRef, octreeRef, disposeModelResources]);

  const removeTreesForChunk = useCallback((treesToRemove: TreeInstance[]) => {
    if (!sceneRef.current || !octreeRef.current) return;

    treesToRemove.forEach(treeInstance => {
      const { lod, mixer } = treeInstance;

      // Remove from scene
      sceneRef.current!.remove(lod as THREE.Object3D);

      // Remove from Octree
      const treeBounds = new THREE.Box3().setFromObject(lod); // Use LOD for bounds
      octreeRef.current!.remove({ id: lod.name, bounds: treeBounds, data: lod });

      // Dispose mixer
      if (mixer) { // Ensure mixer exists before disposing
        mixer.stopAllAction();
        mixer.uncacheRoot(mixer.getRoot());
      }

      // Dispose model resources (iterate through LOD levels)
      lod.children.forEach(child => disposeModelResources(child));

      // Remove from the global list of tree instances
      treeInstancesRef.current = treeInstancesRef.current.filter(
        (instance) => instance.lod.uuid !== lod.uuid
      );
    });
    console.log(`Removed ${treesToRemove.length} tree instances.`);
  }, [sceneRef, octreeRef, disposeModelResources]);

  const updateTreeAnimations = useCallback((delta: number) => {
    treeInstancesRef.current.forEach(treeInstance => treeInstance.mixer.update(delta));
  }, []);

  return { addTreesForChunk, removeTreesForChunk, updateTreeAnimations };
};
