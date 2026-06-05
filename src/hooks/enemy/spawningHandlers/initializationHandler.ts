import type { Octree } from "@/lib/Octree";
import type { GameObject } from "@/types/game";
import { useCallback } from "react";
import * as THREE from "three";
import type { EnemyData } from "../types";
import { getNearKeys, parseKey } from "./chunkManager";

interface InitializationHandlerParams {
  sceneRef: React.MutableRefObject<THREE.Scene | null>;
  octreeRef: React.MutableRefObject<Octree<GameObject> | null>;
  enemyMeshesRef: React.MutableRefObject<EnemyData[]>;
  dogModelRef: React.MutableRefObject<THREE.Group | null>;
  preloadModels: () => Promise<void>;
  disposeModel: (m: THREE.Object3D) => void;
  loadChunk: (cx: number, cz: number) => Promise<void>;
  loaded: Set<string>;
}

export const createInitializationHandler = (params: InitializationHandlerParams) => {
  const {
    sceneRef,
    octreeRef,
    enemyMeshesRef,
    dogModelRef,
    preloadModels,
    disposeModel,
    loadChunk,
    loaded,
  } = params;

  const clearEnemies = useCallback(() => {
    enemyMeshesRef.current.forEach(e => {
      if (octreeRef.current) {
        // استخدام حدود يدوية بدلاً من setFromObject لتجنب أخطاء skeleton
        const ENEMY_SIZE = 2;
        const pos = e.lod.position;
        const enemyBox = new THREE.Box3(
          new THREE.Vector3(pos.x - ENEMY_SIZE, pos.y, pos.z - ENEMY_SIZE),
          new THREE.Vector3(pos.x + ENEMY_SIZE, pos.y + ENEMY_SIZE * 2, pos.z + ENEMY_SIZE)
        );
        octreeRef.current.remove({
          id: `enemy_${e.uuid}`,
          bounds: enemyBox,
          data: e as unknown as GameObject,
        });
      }
      e.mixer.stopAllAction();
      sceneRef.current?.remove(e.lod);
      disposeModel(e.lod);
    });

    enemyMeshesRef.current = [];
    loaded.clear();
  }, [sceneRef, octreeRef, enemyMeshesRef, disposeModel, loaded]);

  const initializeEnemies = useCallback(async () => {
    if (!sceneRef.current || !dogModelRef.current) return;

    await preloadModels();
    clearEnemies();

    const { chunkX, chunkZ } = getChunkCoordinates(
      dogModelRef.current.position.x,
      dogModelRef.current.position.z
    );
    const keys = getNearKeys(chunkX, chunkZ);

    // تحميل الأجزاء بالتوازي لتحسين الأداء
    const chunkPromises = Array.from(keys).map(k => {
      const { cx, cz } = parseKey(k);
      return loadChunk(cx, cz);
    });
    await Promise.all(chunkPromises);
  }, [sceneRef, dogModelRef, preloadModels, clearEnemies, loadChunk]);

  return {
    initializeEnemies,
    clearEnemies,
  };
};

const getChunkCoordinates = (x: number, z: number) => {
  const chunkSize = 100;
  return {
    chunkX: Math.floor(x / chunkSize),
    chunkZ: Math.floor(z / chunkSize),
  };
};
