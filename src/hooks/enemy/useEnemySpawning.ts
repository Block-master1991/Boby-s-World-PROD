import type { CoinData } from '@/hooks/useCoinLogic';
import { getChunkCoordinates } from '@/lib/chunkUtils';
import type { Octree } from '@/lib/Octree';
import type { GameObject } from '@/types/game';
import { logger } from '@/utils/logger';
import { useCallback, useEffect } from 'react';
import type * as THREE from 'three';
import { getNearKeys } from './spawningHandlers/chunkManager';
import { createEnemySpawningLogic } from './spawningHandlers/enemySpawningLogic';
import type { EnemyData } from './types';

interface Props {
  sceneRef: React.MutableRefObject<THREE.Scene | null>;
  octreeRef: React.MutableRefObject<Octree<GameObject> | null>;
  enemyMeshesRef: React.MutableRefObject<EnemyData[]>;
  coinMeshesRef: React.MutableRefObject<CoinData[]>;
  loadedCoinChunks: React.MutableRefObject<Set<string>>;
  cameraRef: React.MutableRefObject<THREE.PerspectiveCamera | null>;
  dogModelRef: React.MutableRefObject<THREE.Group | null>;
}

export const useEnemySpawning = ({
  sceneRef,
  octreeRef,
  enemyMeshesRef,
  coinMeshesRef,
  loadedCoinChunks,
  cameraRef,
  dogModelRef
}: Props) => {
  const {
    spawn,
    loaded,
    manageChunks,
    initializeEnemies,
    resetEnemies,
    forceLoadAreaEnemies,
    setupChunkListeners
  } = createEnemySpawningLogic({
    sceneRef,
    octreeRef,
    enemyMeshesRef,
    coinMeshesRef,
    loadedCoinChunks,
    cameraRef,
    dogModelRef
  });

  useEffect(() => {
    const cleanup = setupChunkListeners(async () => {
      await manageChunks();
    });

    const initializeChunks = async () => {
      const pos = dogModelRef.current?.position;
      if (pos) {
        const { chunkX, chunkZ } = getChunkCoordinates(pos.x, pos.z);
        // تحسين منطق تحميل الأجزاء للتأكد من تحميلها بشكل صحيح
        const nearKeys = Array.from(getNearKeys(chunkX, chunkZ));

        // تحميل الأجزاء بالتوازي لتحسين الأداء
        const chunkPromises = Array.from(nearKeys).map(() => manageChunks());
        await Promise.all(chunkPromises);
      }
    };

    initializeChunks();

    return cleanup;
  }, [setupChunkListeners, dogModelRef, manageChunks]);

  const forceLoadAreaEnemiesWithLogging = useCallback(async (cx: number, cz: number) => {
    const count = await forceLoadAreaEnemies(cx, cz);
    logger.log(`[useEnemySpawning] Force loaded ${count} chunks.`);
  }, [forceLoadAreaEnemies]);

  return {
    manageChunks,
    initializeEnemies,
    resetEnemies,
    forceLoadAreaEnemies: forceLoadAreaEnemiesWithLogging,
    loadedChunks: loaded,
    spawn
  };
};
