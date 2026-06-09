"use client";

import type { GameObject } from "@/types/game";
import type { MutableRefObject } from "react";
import { useCallback, useRef } from "react";
import * as THREE from "three";
import type { Octree } from "../../lib/Octree";
import { RENDER_DISTANCE_CHUNKS, getChunkCoordinates, getChunkKey } from "../../lib/chunkUtils";
import type { CoinData } from "./constants";
import { useCoinInteraction, type FloatingEffectOptions } from "./useCoinInteraction";
import { useCoinLoader } from "./useCoinLoader";
import { useCoinSpawning } from "./useCoinSpawning";
export type { CoinData };

interface UseCoinLogicProps {
  sceneRef: MutableRefObject<THREE.Scene | null>;
  dogModelRef: MutableRefObject<THREE.Group | null>;
  isCoinMagnetActiveRef: MutableRefObject<boolean>;
  COIN_MAGNET_RADIUS: number;
  COIN_COUNT: number;
  onCoinCollected: () => void;
  onRemainingCoinsUpdate: (remaining: number) => void;
  isPausedRef: MutableRefObject<boolean>;
  octreeRef: MutableRefObject<Octree<GameObject> | null>;
  addFloatingEffect: (options: FloatingEffectOptions) => void;
}

const clearCoins = (
  scene: THREE.Scene,
  coinMeshes: CoinData[],
  octree: Octree<GameObject> | null
) => {
  coinMeshes.forEach(coin => {
    scene.remove(coin);
    if (octree) {
      octree.remove({
        id: `coin_${coin.uuid}`,
        bounds: new THREE.Box3().setFromObject(coin),
        data: coin as unknown as GameObject,
      });
    }
  });
};

const manageChunks = (
  dogPos: THREE.Vector3,
  currentChunk: MutableRefObject<{ chunkX: number; chunkZ: number } | null>,
  loadedChunks: MutableRefObject<Set<string>>,
  actions: { load: (x: number, z: number) => void; unload: (x: number, z: number) => void }
) => {
  const { chunkX: cX, chunkZ: cZ } = getChunkCoordinates(dogPos.x, dogPos.z);
  if (
    !currentChunk.current ||
    cX !== currentChunk.current.chunkX ||
    cZ !== currentChunk.current.chunkZ
  ) {
    currentChunk.current = { chunkX: cX, chunkZ: cZ };
    const keep = new Set<string>();
    // Optimized: Match RENDER_DISTANCE_CHUNKS (2) exactly for 5x5 area (25 chunks)
    // This fits perfectly within ChunkManager's MAX_LOADED_CHUNKS (30)
    const range = RENDER_DISTANCE_CHUNKS;
    for (let x = -range; x <= range; x++) {
      for (let z = -range; z <= range; z++) keep.add(getChunkKey(cX + x, cZ + z));
    }
    loadedChunks.current.forEach(
      k => !keep.has(k) && actions.unload(...(k.split(",").map(Number) as [number, number]))
    );
    keep.forEach(
      k =>
        !loadedChunks.current.has(k) &&
        actions.load(...(k.split(",").map(Number) as [number, number]))
    );
  }
};

const resetSystem = (
  refs: {
    scene: THREE.Scene;
    dog: THREE.Group;
    octree: Octree<GameObject> | null;
    meshes: CoinData[];
    loaded: Set<string>;
    remaining: MutableRefObject<number>;
    chunkRef: MutableRefObject<{ chunkX: number; chunkZ: number } | null>;
    lastDogPos: MutableRefObject<THREE.Vector3>;
    collectedKeys: MutableRefObject<Set<string>>;
  },
  count: number,
  loader: (x: number, z: number) => void,
  updater: (n: number) => void
) => {
  clearCoins(refs.scene, refs.meshes, refs.octree);
  refs.meshes.length = 0;
  refs.loaded.clear();
  refs.remaining.current = count;
  refs.collectedKeys.current.clear(); // Clear persistent collection on reset

  const { chunkX, chunkZ } = getChunkCoordinates(refs.dog.position.x, refs.dog.position.z);
  refs.chunkRef.current = { chunkX, chunkZ };
  refs.lastDogPos.current.copy(refs.dog.position);

  const range = RENDER_DISTANCE_CHUNKS;
  for (let x = -range; x <= range; x++) {
    for (let z = -range; z <= range; z++) loader(chunkX + x, chunkZ + z);
  }
  updater(refs.remaining.current);
};

export const useCoinLogic = (props: UseCoinLogicProps) => {
  const coinMeshesRef = useRef<CoinData[]>([]);
  const remainingCoinsRef = useRef<number>(props.COIN_COUNT);
  const currentDogChunk = useRef<{ chunkX: number; chunkZ: number } | null>(null);
  const collectedSpawnKeysRef = useRef<Set<string>>(new Set());

  const { coinModelRef, isCoinModelLoadedRef, loadCoinModel } = useCoinLoader(props.sceneRef);
  const { loadedCoinChunks, loadCoinsForChunk, unloadCoinsFromChunk } = useCoinSpawning({
    ...props,
    coinMeshesRef,
    remainingCoinsRef,
    coinModelRef,
    isCoinModelLoadedRef,
    loadCoinModel,
    collectedSpawnKeysRef,
  });
  const { updateCoinPhysics, lastDogPositionRef } = useCoinInteraction({
    ...props,
    coinMeshesRef,
    remainingCoinsRef,
    collectedSpawnKeysRef,
  });

  const initializeCoins = useCallback(() => {
    if (!props.sceneRef.current || !props.dogModelRef.current) return;
    resetSystem(
      {
        scene: props.sceneRef.current,
        dog: props.dogModelRef.current,
        octree: props.octreeRef.current,
        meshes: coinMeshesRef.current,
        loaded: loadedCoinChunks.current,
        remaining: remainingCoinsRef,
        chunkRef: currentDogChunk,
        lastDogPos: lastDogPositionRef,
        collectedKeys: collectedSpawnKeysRef,
      },
      props.COIN_COUNT,
      loadCoinsForChunk,
      props.onRemainingCoinsUpdate
    );
  }, [
    props.sceneRef,
    props.dogModelRef,
    props.octreeRef,
    loadCoinsForChunk,
    props.onRemainingCoinsUpdate,
    props.COIN_COUNT,
    lastDogPositionRef,
    loadedCoinChunks,
  ]);

  const updateCoins = useCallback(() => {
    if (props.isPausedRef.current || !props.dogModelRef.current) return;
    manageChunks(props.dogModelRef.current.position, currentDogChunk, loadedCoinChunks, {
      load: loadCoinsForChunk,
      unload: unloadCoinsFromChunk,
    });
    updateCoinPhysics();
  }, [
    props.isPausedRef,
    props.dogModelRef,
    loadedCoinChunks,
    loadCoinsForChunk,
    unloadCoinsFromChunk,
    updateCoinPhysics,
  ]);

  const forceLoadAreaCoins = useCallback(
    async (cX: number, cZ: number): Promise<void> => {
      if (!props.sceneRef.current) return;
      const tasks: Promise<void>[] = [];
      const range = RENDER_DISTANCE_CHUNKS;
      for (let x = -range; x <= range; x++) {
        for (let z = -range; z <= range; z++) {
          if (!loadedCoinChunks.current.has(getChunkKey(cX + x, cZ + z)))
            tasks.push(loadCoinsForChunk(cX + x, cZ + z));
        }
      }
      await Promise.all(tasks);
    },
    [props.sceneRef, loadCoinsForChunk, loadedCoinChunks]
  );

  return {
    initializeCoins,
    updateCoins,
    resetCoins: initializeCoins,
    forceLoadAreaCoins,
    coinMeshesRef,
    remainingCoinsRef,
    loadedCoinChunks,
    coinModelRef,
  };
};
