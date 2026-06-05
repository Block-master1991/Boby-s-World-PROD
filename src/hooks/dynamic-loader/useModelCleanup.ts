"use client";

import type { MutableRefObject } from "react";
import { useEffect } from "react";
import type { DynamicLoadableObject, ModelPool } from "./constants";
import { disposeModelResources } from "./useModelPool";

export const useModelLoaderCleanup = (
  modelPoolRef: MutableRefObject<ModelPool>,
  objectsToManage: DynamicLoadableObject[],
  unloadModel: (obj: DynamicLoadableObject) => void
) => {
  useEffect(() => {
    return () => {
      const pool = modelPoolRef.current;
      for (const path in pool) {
        pool[path]?.instances.forEach(disposeModelResources);
      }
      modelPoolRef.current = {};
    };
  }, [modelPoolRef]);

  useEffect(() => {
    return () => {
      objectsToManage.forEach(object => unloadModel(object));
    };
  }, [objectsToManage, unloadModel]);
};
