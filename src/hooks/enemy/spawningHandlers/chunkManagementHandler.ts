import type { CoinData } from "@/hooks/useCoinLogic";
import type { Octree } from "@/lib/Octree";
import type { GameObject } from "@/types/game";
import { useCallback } from "react";
import * as THREE from "three";
import type { EnemyData } from "../types";
import { getChunkManager } from "./chunkManager";

interface ChunkManagementHandlerParams {
  sceneRef: React.MutableRefObject<THREE.Scene | null>;
  octreeRef: React.MutableRefObject<Octree<GameObject> | null>;
  enemyMeshesRef: React.MutableRefObject<EnemyData[]>;
  coinMeshesRef: React.MutableRefObject<CoinData[]>;
  loadedCoinChunks: React.MutableRefObject<Set<string>>;
  spawn: (coin: CoinData, chunk: string) => Promise<void>;
  disposeModel: (m: THREE.Object3D) => void;
}

// تعريف واجهة مخصصة للأحداث المستخدمة في ChunkManager
interface ChunkManagerEventMap {
  "chunk-loaded": { checkChunkKey?: string };
}

// تعريف واجهة ChunkManager مع تجنب التوسيع المباشر لـ Object3D
interface ChunkManagerWithEvents {
  // خصائص Object3D الأساسية
  name: string;
  type: string;
  visible: boolean;
  parent: THREE.Object3D | null;
  children: THREE.Object3D[];
  position: THREE.Vector3;
  rotation: THREE.Euler;
  scale: THREE.Vector3;

  // طرق Object3D الأساسية
  add: (...object: THREE.Object3D[]) => this;
  remove: (...object: THREE.Object3D[]) => this;
  getObjectByName: (name: string) => THREE.Object3D | null;

  // طرق الأحداث المخصصة
  addEventListener: <T extends keyof ChunkManagerEventMap>(
    type: T,
    listener: (event: ChunkManagerEventMap[T] & Event) => void
  ) => void;
  removeEventListener: <T extends keyof ChunkManagerEventMap>(
    type: T,
    listener: (event: ChunkManagerEventMap[T] & Event) => void
  ) => void;
}

export const createChunkManagementHandler = (params: ChunkManagementHandlerParams) => {
  const { sceneRef, enemyMeshesRef, coinMeshesRef, loadedCoinChunks, spawn, disposeModel } = params;
  const loaded = new Set<string>();

  const unload = useCallback(
    (near: Set<string>) => {
      for (const k of loaded) {
        if (!near.has(k)) {
          enemyMeshesRef.current
            .filter(e => e.chunkKey === k)
            .forEach(e => {
              sceneRef.current?.remove(e.lod);
              if (params.octreeRef.current) {
                params.octreeRef.current.remove({
                  id: `enemy_${e.uuid}`,
                  bounds: new THREE.Box3().setFromObject(e.lod),
                  data: e as unknown as GameObject,
                });
              }
              disposeModel(e.lod);
            });
          enemyMeshesRef.current = enemyMeshesRef.current.filter(e => e.chunkKey !== k);
          loaded.delete(k);
        }
      }
    },
    [sceneRef, disposeModel, enemyMeshesRef]
  );

  const loadChunk = useCallback(
    async (cx: number, cz: number) => {
      const k = `${cx},${cz}`;
      if (loaded.has(k) || !loadedCoinChunks.current.has(k)) return;
      loaded.add(k);

      const coins = coinMeshesRef.current.filter(
        c =>
          (c.chunkKey ?? "") === k &&
          !c.collected &&
          !enemyMeshesRef.current.some(e => e.targetCoinId === c.uuid)
      );

      await Promise.all(coins.map(c => spawn(c, k)));
    },
    [loaded, coinMeshesRef, enemyMeshesRef, spawn]
  );

  const setupChunkListeners = useCallback(
    (onChunkLoad: (chunkKey: string) => void) => {
      const mgr = getChunkManager(sceneRef.current);
      if (!mgr) return () => {};

      const onLoad = (event: { checkChunkKey?: string } & Event) => {
        if (event.checkChunkKey) {
          onChunkLoad(event.checkChunkKey);
        }
      };

      const chunkManager = mgr as unknown as ChunkManagerWithEvents;
      chunkManager.addEventListener("chunk-loaded", onLoad);

      return () => {
        chunkManager.removeEventListener("chunk-loaded", onLoad);
      };
    },
    [sceneRef]
  );

  return {
    loaded,
    unload,
    loadChunk,
    setupChunkListeners,
  };
};
