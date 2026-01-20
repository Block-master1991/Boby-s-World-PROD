import { logger } from '@/utils/logger';
import type * as THREE from 'three';
import { getModel, putModel } from '../../lib/indexedDB';
import type { ModelPool } from './constants';

export const disposeModelResources = (model: THREE.Group) => {
  model.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      if (mesh.material) {
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        materials.forEach(m => m.dispose());
      }
    }
  });
  logger.log(`[useDynamicModelLoader] Disposed of model resources.`);
};

/* eslint-disable no-await-in-loop */
export const fetchModel = async (path: string, name: string, maxAttempts: number = 20) => {
  const cached = await getModel(name);
  if (cached) return cached;

  for (let i = 1; i <= maxAttempts; i++) {
    try {
      logger.log(`[DynamicLoader] Fetching ${name} from network (attempt ${i}/${maxAttempts})`);
      const resp = await fetch(path);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const buf = await resp.arrayBuffer();
      await putModel(name, buf);
      return buf;
    } catch (err) {
      logger.warn(`[DynamicLoader] Attempt ${i} failed for ${name}:`, err);
      if (i === maxAttempts) throw err;
      const delay = Math.min(1000 * Math.pow(1.5, i - 1), 10000);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw new Error(`Failed to load model ${name} after ${maxAttempts} attempts`);
};
/* eslint-enable no-await-in-loop */

export const initPool = (path: string, model: THREE.Group, animations: THREE.AnimationClip[], pool: ModelPool) => {
  if (pool[path]) return;
  const entry: ModelPool[string] = { geometry: null, materials: [], animations, instances: [] };
  model.traverse(c => {
    if ((c as THREE.Mesh).isMesh) {
      const m = c as THREE.Mesh;
      if (!entry.geometry) entry.geometry = m.geometry;
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      mats.forEach(mat => entry.materials.push(mat as THREE.Material));
    }
  });
  pool[path] = entry;
};
