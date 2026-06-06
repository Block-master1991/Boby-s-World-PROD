import { logger } from "@/utils/logger";
import type { MutableRefObject } from "react";
import { useCallback } from "react";
import * as THREE from "three";
import type { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DOG_MODEL_SCALE, type DogTransform } from "./constants";
import { loadDogData } from "./utils";

interface InitializationProps {
  sceneRef: MutableRefObject<THREE.Scene | null>;
  dogModelRef: MutableRefObject<THREE.Group | null>;
  gltfLoaderRef: MutableRefObject<GLTFLoader | null>;
  lastDogTransformRef: MutableRefObject<DogTransform | null>;
  setupModel: (scene: THREE.Group) => void;
  initAnimations: (gltf: { animations: THREE.AnimationClip[] }, model: THREE.Group) => void;
}

export const useDogInitialization = (props: InitializationProps) => {
  const { sceneRef, dogModelRef, gltfLoaderRef, lastDogTransformRef, setupModel, initAnimations } =
    props;

  const handleFallback = useCallback(
    (scene: THREE.Scene) => {
      const fb = new THREE.Mesh(
        new THREE.BoxGeometry(DOG_MODEL_SCALE, DOG_MODEL_SCALE, DOG_MODEL_SCALE),
        new THREE.MeshStandardMaterial({ color: 0xa0522d })
      );
      fb.position.set(0, DOG_MODEL_SCALE / 2, 0);
      dogModelRef.current = fb as unknown as THREE.Group;
      scene.add(fb);
      lastDogTransformRef.current = { position: fb.position.clone(), rotationY: fb.rotation.y };
    },
    [dogModelRef, lastDogTransformRef]
  );

  const initializeDog = useCallback(async () => {
    const loader = gltfLoaderRef.current;
    const scene = sceneRef.current;
    if (!scene || !loader) return;
    try {
      const data = await loadDogData("dog_model", "/models/dog.glb");
      const gltf = await loader.parseAsync(data, "");
      setupModel(gltf.scene);
      initAnimations(gltf, gltf.scene);
      if (dogModelRef.current) {
        lastDogTransformRef.current = {
          position: dogModelRef.current.position.clone(),
          rotationY: dogModelRef.current.rotation.y,
        };
      }
    } catch (error) {
      logger.error("[useDogInitialization] Error:", error);
      handleFallback(scene);
    }
  }, [
    sceneRef,
    gltfLoaderRef,
    setupModel,
    initAnimations,
    dogModelRef,
    lastDogTransformRef,
    handleFallback,
  ]);

  return { initializeDog };
};
