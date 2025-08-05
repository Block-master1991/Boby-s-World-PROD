import { useCallback, MutableRefObject } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader';
import { Octree } from '@/lib/Octree';
import { getModel, putModel } from '@/lib/indexedDB';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils'; // Corrected: Import as namespace

interface UseTreeLogicProps {
  sceneRef: MutableRefObject<THREE.Scene | null>;
  octreeRef: MutableRefObject<Octree | null>;
}

import { useRef } from 'react'; // Import useRef
export const useTreeLogic = ({ sceneRef, octreeRef }: UseTreeLogicProps) => {
  const mixersRef = useRef<THREE.AnimationMixer[]>([]); // Ref to store animation mixers

  const initializeTrees = useCallback(async (onProgress?: (url: string, loaded: number, total: number) => void) => {
    if (!sceneRef.current) {
      console.error("Scene is not initialized for tree loading.");
      return;
    }

    const loader = new GLTFLoader();
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('/libs/draco/gltf/');
    loader.setDRACOLoader(dracoLoader);

    const modelPath = '/models/lands/Tree1.glb'; // Corrected path
    const modelName = 'Tree1';
    const numberOfTrees = 5; // Number of trees to generate
    const spawnRange = 100; // Range for random X and Z positions

    try {
      let gltf: any;
      let modelData: ArrayBuffer | undefined;

      // Try to load from IndexedDB first
      console.log(`Attempting to load ${modelName} from IndexedDB...`);
      modelData = await getModel(modelName);

      if (modelData) {
        console.log(`${modelName} loaded from IndexedDB.`);
        const blob = new Blob([modelData], { type: 'model/gltf-binary' });
        const url = URL.createObjectURL(blob);
        gltf = await new Promise<any>((resolve, reject) => {
          loader.load(url, resolve, undefined, reject);
        });
        URL.revokeObjectURL(url); // Clean up the object URL
      } else {
        // If not in IndexedDB, load from network
        console.log(`${modelName} not found in IndexedDB. Loading from network...`);
        gltf = await new Promise<any>((resolve, reject) => {
          loader.load(
            modelPath,
            (gltf) => {
              // After successful network load, save to IndexedDB
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

      // Clear previous mixers
      mixersRef.current = [];

      // Log available animations for debugging
      if (gltf.animations && gltf.animations.length > 0) {
        console.log(`[${modelName}] Available animations:`, gltf.animations.map((clip: THREE.AnimationClip) => clip.name));
      } else {
        console.log(`[${modelName}] No animations found in the model.`);
      }

      // Log the structure of the loaded GLTF scene for debugging missing branches
      console.log(`[${modelName}] GLTF Scene structure:`, gltf.scene);
      gltf.scene.traverse((child: THREE.Object3D) => {
        if (child instanceof THREE.Mesh) {
          console.log(`  Mesh: ${child.name || 'Unnamed Mesh'}, Geometry: ${child.geometry.type}, Material: ${child.material.type}`);
        }
      });

      for (let i = 0; i < numberOfTrees; i++) {
        const treeInstance = SkeletonUtils.clone(gltf.scene); // Use SkeletonUtils.clone for proper animation cloning

        // Ensure materials are unique for each instance to prevent rendering issues
        treeInstance.traverse((child: THREE.Object3D) => {
          if (child instanceof THREE.Mesh) {
            child.material = child.material.clone();
          }
        });

        treeInstance.scale.set(5, 5, 5); // Increase scale to 5

        // Random position within a range
        const x = (Math.random() - 0.5) * spawnRange * 2;
        const z = (Math.random() - 0.5) * spawnRange * 2;
        
        // Get ground height from Octree for correct Y position
        let y = 0;
        if (octreeRef.current) {
          y = octreeRef.current.getGroundHeightAt(x, z);
        }
        treeInstance.position.set(x, y, z); // Set Y position based on ground height

        treeInstance.name = `${modelName}_${i}`; // Give each instance a unique name

        sceneRef.current.add(treeInstance);

        // Add tree to Octree for collision detection if needed
        if (octreeRef.current) {
          octreeRef.current.addThreeMesh(treeInstance, treeInstance.name);
        }

        // Debugging: Inspect the cloned tree instance for animation properties
        console.log(`[${modelName}] Tree instance ${i} structure for animation:`, treeInstance);
        treeInstance.traverse((child: THREE.Object3D) => {
          if ((child as any).isSkinnedMesh) {
            console.log(`  SkinnedMesh found: ${child.name}`);
          }
          if ((child as any).skeleton) {
            console.log(`  Object with skeleton found: ${child.name}`);
          }
        });

        // Setup animation for each tree instance
        if (gltf.animations && gltf.animations.length > 0) {
          const mixer = new THREE.AnimationMixer(treeInstance); // Use the cloned instance as the root
          mixersRef.current.push(mixer);

          const clip = THREE.AnimationClip.findByName(gltf.animations, 'treeArm|Scene');
          if (clip) {
            const action = mixer.clipAction(clip);
            action.play();
            action.setEffectiveTimeScale(0.5); // Reduce animation speed
          } else {
            console.warn(`Animation clip 'treeArm|Scene' not found for ${modelName}.`);
          }
        }
      }

      console.log(`${numberOfTrees} instances of ${modelName} loaded and added to scene.`);
    } catch (error) {
      console.error(`Failed to load ${modelName}:`, error);
      throw error;
    }
  }, [sceneRef, octreeRef]);

  const updateTreeAnimations = useCallback((delta: number) => {
    mixersRef.current.forEach(mixer => mixer.update(delta));
  }, []);

  return { initializeTrees, updateTreeAnimations };
};
