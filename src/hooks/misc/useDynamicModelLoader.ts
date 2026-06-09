"use client";

import { type GameObject } from "@/types/game";
import { useCallback, useEffect, type MutableRefObject } from "react";
import * as THREE from "three";
import { type Octree } from "../../lib/Octree";
import { type DynamicLoadableObject } from "../dynamic-loader/constants";
import { useModelLoaderCleanup } from "../dynamic-loader/useModelCleanup";
import { useModelLoaders } from "../dynamic-loader/useModelLoaders";
import { useModelOps } from "../dynamic-loader/useModelOps";
import { useModelPool } from "../dynamic-loader/useModelPool";

interface UseDynamicModelLoaderProps {
  cameraRef: MutableRefObject<THREE.PerspectiveCamera | null>;
  sceneRef: MutableRefObject<THREE.Scene | null>;
  octreeRef: MutableRefObject<Octree<GameObject> | null>;
  objectsToManage: DynamicLoadableObject[];
  onModelLoaded?: (object: DynamicLoadableObject, model: THREE.Group) => void;
  onModelUnloaded?: (object: DynamicLoadableObject, model: THREE.Group) => void;
}

export const useDynamicModelLoader = ({
  cameraRef,
  sceneRef,
  octreeRef,
  objectsToManage,
  onModelLoaded,
  onModelUnloaded,
}: UseDynamicModelLoaderProps) => {
  const { gltfLoaderRef } = useModelLoaders();
  const { modelPoolRef, cleanupModelPool } = useModelPool();
  const { loadAndInstantiateModel, unloadModel } = useModelOps({
    sceneRef,
    octreeRef,
    modelPoolRef,
    gltfLoaderRef,
    onModelLoaded,
    onModelUnloaded,
  });

  useModelLoaderCleanup(modelPoolRef, objectsToManage, unloadModel);

  const updateDynamicModels = useCallback(() => {
    const cam = cameraRef.current;
    if (!cam || !sceneRef.current) return;
    const frustum = new THREE.Frustum();
    const mat = new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    frustum.setFromProjectionMatrix(mat);

    objectsToManage.forEach(object => {
      const pos = object.modelInstance ? object.modelInstance.position : object.logicalPosition;
      const inFrustum = frustum.intersectsSphere(new THREE.Sphere(pos, 1));
      if (inFrustum && !object.isModelInstantiated) loadAndInstantiateModel(object);
      else if (!inFrustum && object.isModelInstantiated) unloadModel(object);
    });
  }, [cameraRef, sceneRef, objectsToManage, loadAndInstantiateModel, unloadModel]);

  useEffect(() => {
    updateDynamicModels();
  }, [objectsToManage, updateDynamicModels]);

  return { updateDynamicModels, cleanupModelPool };
};
export { type DynamicLoadableObject };
