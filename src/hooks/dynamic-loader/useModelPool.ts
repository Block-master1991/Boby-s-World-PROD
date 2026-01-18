import { logger } from '@/utils/logger';
import { useCallback, useRef } from 'react';
import type * as THREE from 'three';
import type { ModelPool } from './constants';
import { disposeModelResources } from './utils';

export type PooledInstance = THREE.Group & { lastPooledTime?: number };

export const useModelPool = () => {
  const modelPoolRef = useRef<ModelPool>({});

  const cleanupModelPool = useCallback((idleTimeThresholdMs = 60000, maxPoolSizePerModel = 5) => {
    const now = Date.now();
    for (const path in modelPoolRef.current) {
      const entry = modelPoolRef.current[path];
      if (!entry) continue;

      const keep: PooledInstance[] = [];
      const disposeList: PooledInstance[] = [];

      entry.instances.forEach(inst => {
        const isIdle = inst.lastPooledTime && (now - inst.lastPooledTime > idleTimeThresholdMs);
        if (isIdle) disposeList.push(inst);
        else keep.push(inst);
      });

      while (keep.length > maxPoolSizePerModel) {
        const oldest = keep.shift();
        if (oldest) disposeList.push(oldest);
      }

      disposeList.forEach(inst => {
        disposeModelResources(inst);
        logger.log(`[useDynamicModelLoader] Disposed model: ${path.split('/').pop()}`);
      });
      entry.instances = keep;
    }
  }, []);

  return { modelPoolRef, cleanupModelPool };
};
export { disposeModelResources };
