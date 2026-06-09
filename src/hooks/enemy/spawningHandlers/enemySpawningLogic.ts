import type { CoinData } from "@/hooks/coin/useCoinLogic";
import { getChunkCoordinates } from "@/lib/chunkUtils";
import type { Octree } from "@/lib/Octree";
import type { GameObject } from "@/types/game";
import { useCallback } from "react";
import type * as THREE from "three";
import type { EnemyData } from "../types";
import { useEnemyLoader } from "../useEnemyLoader";
import { createChunkManagementHandler } from "./chunkManagementHandler";
import { getNearKeys, parseKey } from "./chunkManager";
import { createInitializationHandler } from "./initializationHandler";
import { createQueueHandler } from "./queueHandler";
import { createSpawnHandler } from "./spawnHandler";

interface EnemySpawningLogicParams {
  sceneRef: React.MutableRefObject<THREE.Scene | null>;
  octreeRef: React.MutableRefObject<Octree<GameObject> | null>;
  enemyMeshesRef: React.MutableRefObject<EnemyData[]>;
  coinMeshesRef: React.MutableRefObject<CoinData[]>;
  loadedCoinChunks: React.MutableRefObject<Set<string>>;
  cameraRef: React.MutableRefObject<THREE.PerspectiveCamera | null>;
  dogModelRef: React.MutableRefObject<THREE.Group | null>;
}

export const createEnemySpawningLogic = (params: EnemySpawningLogicParams) => {
  const {
    sceneRef,
    octreeRef,
    enemyMeshesRef,
    coinMeshesRef,
    loadedCoinChunks,
    cameraRef,
    dogModelRef,
  } = params;
  const { loadEnemyModel, disposeModel, preloadModels } = useEnemyLoader();

  // إنشاء معالجات الإنجاب
  const { spawn, pending } = createSpawnHandler({
    sceneRef,
    octreeRef,
    enemyMeshesRef,
    loadEnemyModel,
  });

  // إنشاء معالج القائمة
  const { queueSpawns, process } = createQueueHandler({
    coinMeshesRef,
    enemyMeshesRef,
    pending,
  });

  // إنشاء معالج الأجزاء
  const { loaded, unload, loadChunk, setupChunkListeners } = createChunkManagementHandler({
    sceneRef,
    octreeRef,
    enemyMeshesRef,
    coinMeshesRef,
    loadedCoinChunks,
    spawn,
    disposeModel,
  });

  // إنشاء معالج التهيئة
  const { initializeEnemies } = createInitializationHandler({
    sceneRef,
    octreeRef,
    enemyMeshesRef,
    dogModelRef,
    preloadModels,
    disposeModel,
    loadChunk,
    loaded,
  });

  const manageChunks = useCallback(() => {
    if (!cameraRef.current) return;

    const { chunkX, chunkZ } = getChunkCoordinates(
      cameraRef.current.position.x,
      cameraRef.current.position.z
    );
    const near = getNearKeys(chunkX, chunkZ);

    unload(near);
    queueSpawns(near);
    near.forEach(k => loaded.add(k));
    process();
  }, [cameraRef, unload, queueSpawns, loaded, process]);

  const resetEnemies = useCallback(() => {
    initializeEnemies();
  }, [initializeEnemies]);

  const forceLoadAreaEnemies = useCallback(
    async (cx: number, cz: number) => {
      if (!sceneRef.current) return;

      const keys = getNearKeys(cx, cz);
      await Promise.all(
        Array.from(keys)
          .filter(k => !loaded.has(k))
          .map(k => {
            const { cx: x, cz: z } = parseKey(k);
            return loadChunk(x, z);
          })
      );

      return keys.size;
    },
    [sceneRef, loadChunk, loaded]
  );

  return {
    spawn,
    loaded,
    manageChunks,
    initializeEnemies,
    resetEnemies,
    forceLoadAreaEnemies,
    setupChunkListeners,
  };
};
