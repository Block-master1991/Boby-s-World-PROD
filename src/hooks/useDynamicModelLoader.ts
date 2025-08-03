'use client';

import * as THREE from 'three';
import { GLTFLoader, GLTF } from 'three/examples/jsm/loaders/GLTFLoader';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader';
import { useEffect, useRef, useCallback, MutableRefObject } from 'react';
import { getModel, putModel } from '../lib/indexedDB';
import { Octree } from '../lib/Octree';

// Define a generic interface for objects that need dynamic loading
export interface DynamicLoadableObject { // Export the interface
  id: number | string;
  modelPath: string;
  logicalPosition: THREE.Vector3; // The object's logical position in the world
  modelInstance: THREE.Group | null; // The actual THREE.Group instance
  isModelInstantiated: boolean; // Flag to track if the model is currently in the scene
  // Add any other properties needed for model setup (e.g., scale, rotation)
  scale?: THREE.Vector3;
  rotationY?: number;
  // For enemies, we'll also need animation data
  animations?: THREE.AnimationClip[];
  mixer?: THREE.AnimationMixer | null;
  currentAction?: THREE.AnimationAction | null;
  actions?: { [key: string]: THREE.AnimationAction };
  enemyType?: 'carnivore' | 'herbivore'; // Specific to enemies
  // New property for pooling
  isPooled?: boolean;
  lastPooledTime?: number; // New: Timestamp when the model was last pooled
}

// Define a type for the model pool
type ModelPool = {
  [modelPath: string]: {
    geometry: THREE.BufferGeometry | null;
    materials: THREE.Material[];
    animations: THREE.AnimationClip[];
    instances: (THREE.Group & { lastPooledTime?: number })[]; // Add lastPooledTime to instances
  };
};

interface UseDynamicModelLoaderProps {
  cameraRef: MutableRefObject<THREE.PerspectiveCamera | null>;
  sceneRef: MutableRefObject<THREE.Scene | null>;
  octreeRef: MutableRefObject<Octree | null>;
  objectsToManage: DynamicLoadableObject[]; // Array of objects whose models need to be managed
  // Optional: A callback for when a model is loaded and added to the scene
  onModelLoaded?: (object: DynamicLoadableObject, model: THREE.Group) => void;
  // Optional: A callback for when a model is unloaded and removed from the scene
  onModelUnloaded?: (object: DynamicLoadableObject, model: THREE.Group) => void;
}

const DRACO_DECODER_PATH = '/libs/draco/gltf/';

export const useDynamicModelLoader = ({
  cameraRef,
  sceneRef,
  octreeRef,
  objectsToManage,
  onModelLoaded,
  onModelUnloaded,
}: UseDynamicModelLoaderProps) => {
  const gltfLoaderRef = useRef<GLTFLoader | null>(null);
  const dracoLoaderRef = useRef<DRACOLoader | null>(null);
  const modelPoolRef = useRef<ModelPool>({}); // Object pool for models

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
    console.log(`[useDynamicModelLoader] Disposed of model resources.`);
  }, []);

  // Initialize loaders once
  useEffect(() => {
    dracoLoaderRef.current = new DRACOLoader();
    dracoLoaderRef.current.setDecoderPath(DRACO_DECODER_PATH);
    gltfLoaderRef.current = new GLTFLoader();
    gltfLoaderRef.current.setDRACOLoader(dracoLoaderRef.current);

    return () => {
      dracoLoaderRef.current?.dispose();
      gltfLoaderRef.current = null;
      dracoLoaderRef.current = null;
      // Dispose of all pooled models when component unmounts
      for (const modelPath in modelPoolRef.current) {
        const poolEntry = modelPoolRef.current[modelPath];
        poolEntry.instances.forEach(instance => {
          disposeModelResources(instance); // Use the helper for disposal
        });
        // The geometry and materials stored directly in the poolEntry are likely references
        // to the first loaded model's resources. If we dispose instances, these might already be disposed.
        // We should ensure we don't double dispose.
        // For now, rely on instance disposal. If issues arise, re-evaluate.
        // if (poolEntry.geometry) poolEntry.geometry.dispose(); // This might be redundant
        // poolEntry.materials.forEach(m => m.dispose()); // This might be redundant
      }
      modelPoolRef.current = {};
    };
  }, [disposeModelResources]); // Add disposeModelResources to dependencies

  const loadAndInstantiateModel = useCallback(async (object: DynamicLoadableObject) => {
    if (!gltfLoaderRef.current || !sceneRef.current) return;

    const modelName = object.modelPath.split('/').pop();
    if (!modelName) {
      console.error(`Invalid modelPath for object ${object.id}: ${object.modelPath}`);
      return;
    }

    let modelInstance: THREE.Group | null = null;
    let animations: THREE.AnimationClip[] = [];

    // Try to get from pool first
    if (modelPoolRef.current[object.modelPath] && modelPoolRef.current[object.modelPath].instances.length > 0) {
      modelInstance = modelPoolRef.current[object.modelPath].instances.pop()!;
      animations = modelPoolRef.current[object.modelPath].animations;
      console.log(`[useDynamicModelLoader] Reusing model from pool: ${modelName}`);
      // Reset state of reused model
      modelInstance.position.set(0, 0, 0);
      modelInstance.rotation.set(0, 0, 0);
      modelInstance.scale.set(1, 1, 1);
      modelInstance.visible = true;
      object.isPooled = false; // Mark as no longer pooled
    } else {
      try {
        let gltf: GLTF;
        const cachedData = await getModel(modelName);

        if (cachedData) {
          console.log(`[useDynamicModelLoader] Loading model from IndexedDB: ${modelName}`);
          gltf = await gltfLoaderRef.current.parseAsync(cachedData, '');
        } else {
          console.log(`[useDynamicModelLoader] Fetching model from network: ${object.modelPath}`);
          const response = await fetch(object.modelPath);
          if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
          const arrayBuffer = await response.arrayBuffer();
          await putModel(modelName, arrayBuffer);
          gltf = await gltfLoaderRef.current.parseAsync(arrayBuffer, '');
        }

        modelInstance = gltf.scene;
        animations = gltf.animations;

        // Store geometry and materials in pool for future reference if needed for disposal
        if (!modelPoolRef.current[object.modelPath]) {
          modelPoolRef.current[object.modelPath] = {
            geometry: null, // We'll extract geometry from the first mesh found
            materials: [],
            animations: animations,
            instances: []
          };
          modelInstance.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
              if (!modelPoolRef.current[object.modelPath].geometry) {
                modelPoolRef.current[object.modelPath].geometry = (child as THREE.Mesh).geometry;
              }
              const material = (child as THREE.Mesh).material;
              if (Array.isArray(material)) {
                material.forEach(m => modelPoolRef.current[object.modelPath].materials.push(m));
              } else {
                modelPoolRef.current[object.modelPath].materials.push(material as THREE.Material);
              }
            }
          });
        }
        console.log(`[useDynamicModelLoader] Created new model instance: ${modelName}`);

      } catch (error) {
        console.error(`[useDynamicModelLoader] Error loading or instantiating model ${modelName}:`, error);
        object.isModelInstantiated = false; // Mark as failed to instantiate
        object.modelInstance = null;
        object.mixer = null;
        object.currentAction = null;
        object.actions = {};
        return;
      }
    }

    object.modelInstance = modelInstance;
    object.modelInstance.position.copy(object.logicalPosition);
    if (object.scale) object.modelInstance.scale.copy(object.scale);
    if (object.rotationY !== undefined) object.modelInstance.rotation.y = object.rotationY;

    object.modelInstance.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    sceneRef.current.add(object.modelInstance);
    object.isModelInstantiated = true;

    // If the object has animations, initialize the mixer and actions
    if (animations && animations.length && object.modelInstance) {
      // Dispose of old mixer if reusing an object
      if (object.mixer) {
        object.mixer.stopAllAction();
        object.mixer.uncacheRoot(object.mixer.getRoot());
      }
      object.mixer = new THREE.AnimationMixer(object.modelInstance);
      object.animations = animations;
      object.actions = {};
      animations.forEach((clip: THREE.AnimationClip) => {
        const action = object.mixer!.clipAction(clip);
        object.actions![clip.name] = action;
        // Assuming animation names are consistent for enemies
        if (object.enemyType) {
          // Import ENEMY_ANIMATION_NAMES from useEnemyLogic.ts
          // For now, re-define locally to resolve the error.
          const ENEMY_ANIMATION_NAMES_LOCAL = {
              CARNIVORE: { IDLE: ['Idle', 'Idle_2', 'Idle_2_HeadLow', 'Eating'], WALK: 'Walk', GALLOP: 'Gallop', ATTACK: 'Attack', DEATH: 'Death' },
              HERBIVORE: { IDLE: ['Idle', 'Idle_2', 'Idle_HeadLow', 'Eating'], WALK: 'Walk', GALLOP: 'Gallop', ATTACK: 'Attack_Kick', DEATH: 'Death' },
          };
          const isIdleAnimation = ENEMY_ANIMATION_NAMES_LOCAL[object.enemyType.toUpperCase() as 'CARNIVORE' | 'HERBIVORE'].IDLE.includes(clip.name);
          if (clip.name === ENEMY_ANIMATION_NAMES_LOCAL[object.enemyType.toUpperCase() as 'CARNIVORE' | 'HERBIVORE'].WALK ||
              clip.name === ENEMY_ANIMATION_NAMES_LOCAL[object.enemyType.toUpperCase() as 'CARNIVORE' | 'HERBIVORE'].GALLOP ||
              isIdleAnimation) {
            action.setLoop(THREE.LoopRepeat, Infinity);
          } else {
            action.setLoop(THREE.LoopOnce, 1);
            action.clampWhenFinished = true;
          }
        }
      });
      Object.values(object.actions!).forEach(action => action.stop());

      // Play initial idle animation if applicable
      if (object.enemyType) {
          const ENEMY_ANIMATION_NAMES_LOCAL = { // Re-define locally for this block too
              CARNIVORE: { IDLE: ['Idle', 'Idle_2', 'Idle_2_HeadLow', 'Eating'], WALK: 'Walk', GALLOP: 'Gallop', ATTACK: 'Attack', DEATH: 'Death' },
              HERBIVORE: { IDLE: ['Idle', 'Idle_2', 'Idle_HeadLow', 'Eating'], WALK: 'Walk', GALLOP: 'Gallop', ATTACK: 'Attack_Kick', DEATH: 'Death' },
          };
          const idleAnimations = ENEMY_ANIMATION_NAMES_LOCAL[object.enemyType.toUpperCase() as 'CARNIVORE' | 'HERBIVORE'].IDLE;
          const initialIdleActionName = idleAnimations[Math.floor(Math.random() * idleAnimations.length)];
          if (object.actions[initialIdleActionName]) {
              object.currentAction = object.actions[initialIdleActionName];
              object.currentAction.play();
          }
      }
    }

    // Add to Octree
    if (octreeRef.current) {
      const objectBox = new THREE.Box3().setFromObject(object.modelInstance);
      octreeRef.current.insert({
        id: `${object.id}`, // Use object's ID directly
        bounds: objectBox,
        data: object.modelInstance // Store the actual THREE.Group
      });
    }

    onModelLoaded?.(object, object.modelInstance);

  }, [gltfLoaderRef, sceneRef, octreeRef, onModelLoaded]);

  const unloadModel = useCallback((object: DynamicLoadableObject) => {
    if (object.modelInstance && sceneRef.current) {
      const modelToUnload = object.modelInstance;
      if (octreeRef.current) {
        const objectBox = new THREE.Box3().setFromObject(modelToUnload);
        octreeRef.current.remove({
          id: `${object.id}`,
          bounds: objectBox,
          data: modelToUnload
        });
      }
      object.mixer?.stopAllAction();
      sceneRef.current.remove(modelToUnload);
      
      // Return to pool instead of disposing
      if (!modelPoolRef.current[object.modelPath]) {
        modelPoolRef.current[object.modelPath] = {
          geometry: null, materials: [], animations: [], instances: []
        };
      }
      // Mark the instance with a timestamp before pushing to pool
      (modelToUnload as THREE.Group & { lastPooledTime?: number }).lastPooledTime = Date.now();
      modelPoolRef.current[object.modelPath].instances.push(modelToUnload as THREE.Group & { lastPooledTime?: number });
      object.isPooled = true; // Mark as pooled
      console.log(`[useDynamicModelLoader] Returned model to pool: ${object.modelPath.split('/').pop()}`);

      object.modelInstance = null;
      object.isModelInstantiated = false;
      object.mixer = null;
      object.currentAction = null;
      object.actions = {};
      onModelUnloaded?.(object, modelToUnload);
    }
  }, [sceneRef, octreeRef, onModelUnloaded]);

  // New function to clean up the model pool
  const cleanupModelPool = useCallback((idleTimeThresholdMs: number = 60000, maxPoolSizePerModel: number = 5) => {
    const now = Date.now();
    for (const modelPath in modelPoolRef.current) {
      const poolEntry = modelPoolRef.current[modelPath];
      const instancesToKeep: (THREE.Group & { lastPooledTime?: number })[] = [];
      const instancesToDispose: (THREE.Group & { lastPooledTime?: number })[] = [];

      // Separate instances based on idle time
      poolEntry.instances.forEach(instance => {
        if (instance.lastPooledTime && (now - instance.lastPooledTime > idleTimeThresholdMs)) {
          instancesToDispose.push(instance);
        } else {
          instancesToKeep.push(instance);
        }
      });

      // If there are too many instances, dispose the oldest ones
      while (instancesToKeep.length > maxPoolSizePerModel) {
        const oldestInstance = instancesToKeep.shift(); // Remove from the beginning (oldest)
        if (oldestInstance) {
          instancesToDispose.push(oldestInstance);
        }
      }

      // Dispose of marked instances
      instancesToDispose.forEach(instance => {
        disposeModelResources(instance);
        console.log(`[useDynamicModelLoader] Disposed of idle/excess model from pool: ${modelPath.split('/').pop()}`);
      });

      // Update the pool with remaining instances
      poolEntry.instances = instancesToKeep;
    }
  }, [disposeModelResources]);

  // Main effect to manage model loading/unloading based on frustum
  useEffect(() => {
    if (!cameraRef.current || !sceneRef.current) return;

    const camera = cameraRef.current;
    const frustum = new THREE.Frustum();
    const viewProjectionMatrix = new THREE.Matrix4();

    const updateVisibility = () => {
      if (!cameraRef.current) return;
      cameraRef.current.updateMatrixWorld();
      viewProjectionMatrix.multiplyMatrices(cameraRef.current.projectionMatrix, cameraRef.current.matrixWorldInverse);
      frustum.setFromProjectionMatrix(viewProjectionMatrix);

      objectsToManage.forEach((object) => {
        // Use logical position for frustum check if model not yet instantiated
        const checkPosition = object.modelInstance ? object.modelInstance.position : object.logicalPosition;
        const boundingSphere = new THREE.Sphere(checkPosition, 1); // Approximate bounding sphere

        const isInFrustum = frustum.intersectsSphere(boundingSphere);

        if (isInFrustum && !object.isModelInstantiated) {
          loadAndInstantiateModel(object);
        } else if (!isInFrustum && object.isModelInstantiated) {
          // Optional: Unload models that move out of view
          unloadModel(object);
        }
      });
    };

    // This needs to be called frequently, e.g., in the main animation loop
    // We'll expose a function for the parent component (GameCanvas or useEnemyLogic) to call this.
    // For now, we'll just define it.
    return () => {
      // Cleanup: unload all models when the component unmounts
      objectsToManage.forEach(object => unloadModel(object));
    };
  }, [cameraRef, sceneRef, objectsToManage, loadAndInstantiateModel, unloadModel]);

  // Expose a function to be called in the main game loop to update visibility
  const updateDynamicModels = useCallback(() => {
    if (!cameraRef.current || !sceneRef.current) return;

    const camera = cameraRef.current;
    const frustum = new THREE.Frustum();
    const viewProjectionMatrix = new THREE.Matrix4();

    camera.updateMatrixWorld();
    viewProjectionMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(viewProjectionMatrix);

    objectsToManage.forEach((object) => {
      const checkPosition = object.modelInstance ? object.modelInstance.position : object.logicalPosition;
      const boundingSphere = new THREE.Sphere(checkPosition, 1); // Approximate bounding sphere

      const isInFrustum = frustum.intersectsSphere(boundingSphere);

      if (isInFrustum && !object.isModelInstantiated) {
        loadAndInstantiateModel(object);
      } else if (!isInFrustum && object.isModelInstantiated) {
        unloadModel(object);
      }
    });
  }, [cameraRef, sceneRef, objectsToManage, loadAndInstantiateModel, unloadModel]);

  return { updateDynamicModels, cleanupModelPool };
};
