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

export const fetchModel = async (path: string, name: string) => {
  const cached = await getModel(name);
  if (cached) return cached;
  const resp = await fetch(path);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const buf = await resp.arrayBuffer();
  await putModel(name, buf);
  return buf;
};

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
