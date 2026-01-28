import { getModel, putModel } from '@/lib/indexedDB';
import { logger } from '@/utils/logger';
import { useCallback, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';

import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils';

type R = { model: THREE.Group; animations: THREE.AnimationClip[] };
const cache: Record<string, R> = {};
const loading: Record<string, Promise<R>> = {};
let preloaded = false;

const CARN = ['Fox.glb', 'Husky.glb', 'ShibaInu.glb', 'Wolf.glb'];
const HERB = ['Alpaca.glb', 'Bull.glb', 'Cow.glb', 'Deer.glb', 'Donkey.glb', 'Horse_White.glb', 'Horse.glb', 'Stag.glb'];

const placeholder = (): R => { const g = new THREE.Group(); g.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), new THREE.MeshStandardMaterial({ color: 0xff0000 }))); return { model: g, animations: [] }; };

const load = async (l: GLTFLoader, p: string, n: string): Promise<R> => {
  const d = await getModel(n);
  const g = d ? await l.parseAsync(d, p) : await (async () => { const r = await fetch(p); if (!r.ok) throw new Error(`HTTP ${r.status}`); const b = await r.arrayBuffer(); await putModel(n, b); return l.parseAsync(b, ''); })();
  return { model: g.scene, animations: g.animations };
};

export const useEnemyLoader = () => {
  const loader = useRef<GLTFLoader | null>(null);

  useEffect(() => { const d = new DRACOLoader(); d.setDecoderPath('/libs/draco/gltf/'); loader.current = new GLTFLoader(); loader.current.setDRACOLoader(d); return () => { d.dispose(); loader.current = null; }; }, []);

  const loadEnemyModel = useCallback(async (t: 'carnivore' | 'herbivore', f?: string): Promise<R> => {
    const m = t === 'carnivore' ? CARN : HERB;
    const r = f ?? m[Math.floor(Math.random() * m.length)];
    const n = `enemy_${r}`;
    
    if (cache[n]) {
      // Use SkeletonUtils.clone for cached models
      const clonedModel = SkeletonUtils.clone(cache[n].model) as THREE.Group;
      return { model: clonedModel, animations: cache[n].animations };
    }
    
    if (loading[n]) { 
      const x = await loading[n]; 
      const clonedModel = SkeletonUtils.clone(x.model) as THREE.Group;
      return { model: clonedModel, animations: x.animations }; 
    }
    
    const p = (async () => {
      try { 
        if (!loader.current) throw new Error('No loader'); 
        const x = await load(loader.current, `/models/Enemies-Animals/${t === 'carnivore' ? 'Carnivores' : 'Herbivores'}/${r}`, n); 
        
        // Ensure matrices are updated before caching/cloning
        x.model.updateMatrixWorld(true);
        
        // Cache the original
        cache[n] = { model: x.model, animations: x.animations }; 
        
        // Return a clone
        const clonedModel = SkeletonUtils.clone(x.model) as THREE.Group;
        return { model: clonedModel, animations: x.animations }; 
      }
      catch (e) { 
        logger.error(`[useEnemyLoader] ${n}:`, e); 
        return placeholder(); 
      }
      finally { delete loading[n]; }
    })();
    
    loading[n] = p;
    const res = await p;
    // The promise already returns a clone, but if we await it here we might get the cached struct.
    // The load function above returns a clone for the first caller.
    return res; 
  }, []);

  const preloadModels = useCallback(async () => { if (preloaded) return; logger.log('[useEnemyLoader] Preloading...'); await Promise.all([...CARN.map(n => loadEnemyModel('carnivore', n)), ...HERB.map(n => loadEnemyModel('herbivore', n))]); preloaded = true; logger.log('[useEnemyLoader] Done.'); }, [loadEnemyModel]);

  const getPreloadableModels = useCallback(() => {
    return Object.values(cache).map(r => r.model);
  }, []);

  const disposeModel = useCallback((m: THREE.Object3D) => { m.traverse(c => { const x = c as THREE.Mesh; if (x.isMesh) { x.geometry?.dispose(); const mt = x.material; if (Array.isArray(mt)) mt.forEach(z => z.dispose()); else (mt as THREE.Material)?.dispose(); } }); }, []);

  return { loadEnemyModel, preloadModels, getPreloadableModels, disposeModel };
};
