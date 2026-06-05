import type { GameObject } from "@/types/game";
import type { MutableRefObject } from "react";
import { useCallback } from "react";
import * as THREE from "three";
import type { Octree } from "../../lib/Octree";
import type { DynamicLoadableObject } from "./constants";

export const useOctreeManagement = (octreeRef: MutableRefObject<Octree<GameObject> | null>) => {
  const addToOctree = useCallback(
    (object: DynamicLoadableObject) => {
      if (octreeRef.current && object.modelInstance) {
        octreeRef.current.insert({
          id: `${object.id}`,
          bounds: new THREE.Box3().setFromObject(object.modelInstance),
          data: object.modelInstance as unknown as GameObject,
        });
      }
    },
    [octreeRef]
  );

  const removeFromOctree = useCallback(
    (object: DynamicLoadableObject) => {
      if (octreeRef.current && object.modelInstance) {
        octreeRef.current.remove({
          id: `${object.id}`,
          bounds: new THREE.Box3().setFromObject(object.modelInstance),
          data: object.modelInstance as unknown as GameObject,
        });
      }
    },
    [octreeRef]
  );

  return { addToOctree, removeFromOctree };
};
