import { useCallback } from "react";
import type * as THREE from "three";
import type { EnemyData } from "../types";
import { getChunkManager } from "./chunkManager";

interface ChunkManagerHandlerParams {
  sceneRef: React.MutableRefObject<THREE.Scene | null>;
  enemyMeshesRef: React.MutableRefObject<EnemyData[]>;
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

export const createChunkManagerHandler = (params: ChunkManagerHandlerParams) => {
  const { sceneRef, enemyMeshesRef, disposeModel } = params;
  const loaded = new Set<string>();

  const unload = useCallback(
    (near: Set<string>) => {
      for (const k of loaded) {
        if (!near.has(k)) {
          enemyMeshesRef.current
            .filter(e => e.chunkKey === k)
            .forEach(e => {
              sceneRef.current?.remove(e.lod);
              disposeModel(e.lod);
            });
          enemyMeshesRef.current = enemyMeshesRef.current.filter(e => e.chunkKey !== k);
          loaded.delete(k);
        }
      }
    },
    [sceneRef, disposeModel, enemyMeshesRef]
  );

  const loadChunkHandler = useCallback(
    (cx: number, cz: number) => {
      const k = `${cx},${cz}`;
      if (loaded.has(k)) return;
      loaded.add(k);
    },
    [loaded]
  );

  const setupChunkListeners = useCallback(
    (onChunkLoad: (chunkKey: string) => void) => {
      const mgr = getChunkManager(sceneRef.current);
      if (!mgr) return;

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
    loadChunkHandler,
    setupChunkListeners,
  };
};
