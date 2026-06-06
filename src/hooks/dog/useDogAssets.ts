import type { MutableRefObject } from "react";
import { useCallback, useEffect, useRef } from "react";
import type * as THREE from "three";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DOG_MODEL_SCALE } from "./constants";

export const useDogAssets = (sceneRef: MutableRefObject<THREE.Scene | null>) => {
  const dogModelRef = useRef<THREE.Group | null>(null);
  const gltfLoaderRef = useRef<GLTFLoader | null>(null);
  const dracoLoaderRef = useRef<DRACOLoader | null>(null);

  useEffect(() => {
    dracoLoaderRef.current = new DRACOLoader();
    dracoLoaderRef.current.setDecoderPath("/libs/draco/gltf/");
    gltfLoaderRef.current = new GLTFLoader();
    gltfLoaderRef.current.setDRACOLoader(dracoLoaderRef.current);

    return () => {
      dracoLoaderRef.current?.dispose();
      gltfLoaderRef.current = null;
      dracoLoaderRef.current = null;
    };
  }, []);

  const setupModel = useCallback(
    (gltfScene: THREE.Group) => {
      const scene = sceneRef.current;
      if (!scene) return;

      dogModelRef.current = gltfScene;
      dogModelRef.current.scale.set(DOG_MODEL_SCALE, DOG_MODEL_SCALE, DOG_MODEL_SCALE);
      dogModelRef.current.position.set(0, 0, 0);
      dogModelRef.current.rotation.y = Math.PI;

      dogModelRef.current.traverse(child => {
        if ((child as THREE.Mesh).isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
      scene.add(dogModelRef.current);
    },
    [sceneRef]
  );

  return { dogModelRef, gltfLoaderRef, setupModel };
};
