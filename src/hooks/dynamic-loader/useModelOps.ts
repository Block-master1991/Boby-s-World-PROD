import type { GameObject } from "@/types/game";
import { logger } from "@/utils/logger";
import type { MutableRefObject } from "react";
import { useCallback } from "react";
import type * as THREE from "three";
import type { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import type { Octree } from "../../lib/Octree";
import type { DynamicLoadableObject, ModelPool } from "./constants";
import { useModelAnimations } from "./useModelLifecycle";
import type { PooledInstance } from "./useModelPool";
import { useOctreeManagement } from "./useOctreeManagement";
import { fetchModel, initPool } from "./utils";

interface ModelLoaderOptions {
  sceneRef: MutableRefObject<THREE.Scene | null>;
  octreeRef: MutableRefObject<Octree<GameObject> | null>;
  modelPoolRef: MutableRefObject<ModelPool>;
  gltfLoaderRef: MutableRefObject<GLTFLoader | null>;
  onModelLoaded: ((obj: DynamicLoadableObject, m: THREE.Group) => void) | undefined;
}

export const useModelInstanceLoader = ({
  sceneRef,
  octreeRef,
  modelPoolRef,
  gltfLoaderRef,
  onModelLoaded,
}: ModelLoaderOptions) => {
  const { setupAnimations } = useModelAnimations();
  const { addToOctree } = useOctreeManagement(octreeRef);

  return useCallback(
    async (object: DynamicLoadableObject) => {
      const loader = gltfLoaderRef.current;
      const scene = sceneRef.current;
      if (!loader || !scene) return;
      const modelName = object.modelPath.split("/").pop();
      if (!modelName) return;

      let modelInstance: THREE.Group;
      let animations: THREE.AnimationClip[];

      const poolEntry = modelPoolRef.current[object.modelPath];
      if (poolEntry?.instances?.length) {
        const { instances, animations: pooledAnimations } = poolEntry;
        modelInstance = instances.pop()!;
        animations = pooledAnimations;
        modelInstance.position.set(0, 0, 0);
        modelInstance.rotation.set(0, 0, 0);
        modelInstance.scale.set(1, 1, 1);
        modelInstance.visible = true;
        object.isPooled = false;
      } else {
        try {
          const data = await fetchModel(object.modelPath, modelName);
          const gltf = await loader.parseAsync(data, "");
          ({ scene: modelInstance, animations } = gltf);
          initPool(object.modelPath, modelInstance, animations, modelPoolRef.current);
        } catch (e) {
          return logger.error(`Load error ${modelName}:`, e);
        }
      }

      object.modelInstance = modelInstance;
      object.modelInstance.position.copy(object.logicalPosition);
      if (object.scale) object.modelInstance.scale.copy(object.scale);
      if (object.rotationY !== undefined) object.modelInstance.rotation.y = object.rotationY;
      object.modelInstance.traverse(c => {
        if ((c as THREE.Mesh).isMesh) {
          c.castShadow = true;
          c.receiveShadow = true;
        }
      });

      scene.add(object.modelInstance);
      object.isModelInstantiated = true;
      setupAnimations(object, animations);
      addToOctree(object);
      onModelLoaded?.(object, object.modelInstance);
    },
    [gltfLoaderRef, sceneRef, modelPoolRef, setupAnimations, addToOctree, onModelLoaded]
  );
};

interface ModelOpsOptions extends ModelLoaderOptions {
  onModelUnloaded: ((obj: DynamicLoadableObject, m: THREE.Group) => void) | undefined;
}

export const useModelOps = (options: ModelOpsOptions) => {
  const { sceneRef, modelPoolRef, octreeRef, onModelUnloaded } = options;
  const loadAndInstantiateModel = useModelInstanceLoader(options);
  const { removeFromOctree } = useOctreeManagement(octreeRef);

  const unloadModel = useCallback(
    (object: DynamicLoadableObject) => {
      const scene = sceneRef.current;
      const m = object.modelInstance;
      if (!scene || !m) return;
      removeFromOctree(object);
      object.mixer?.stopAllAction();
      scene.remove(m);
      if (!modelPoolRef.current[object.modelPath]) {
        modelPoolRef.current[object.modelPath] = {
          geometry: null,
          materials: [],
          animations: [],
          instances: [],
        };
      }
      const entry = modelPoolRef.current[object.modelPath];
      if (entry) {
        const pm = m as PooledInstance;
        pm.lastPooledTime = Date.now();
        entry.instances.push(pm);
      }
      object.isPooled = true;
      object.modelInstance = null;
      object.isModelInstantiated = false;
      onModelUnloaded?.(object, m);
    },
    [sceneRef, modelPoolRef, removeFromOctree, onModelUnloaded]
  );

  return { loadAndInstantiateModel, unloadModel };
};
