'use client';

import React, { useCallback, useRef } from 'react';
import * as THREE from 'three';
import type { MutableRefObject } from 'react';
import { Octree, OctreeObject } from '../lib/Octree';
import { CHUNK_SIZE, RENDER_DISTANCE_CHUNKS, getChunkCoordinates, getChunkKey } from '../lib/chunkUtils';


const COIN_RADIUS = 0.4;
const COIN_HEIGHT = 0.08;
const COIN_COLOR = 0xFFD700;
const COIN_EMISSIVE_COLOR = 0xccac00;
const COIN_ROTATION_SPEED = 0.02;
const COLLECTION_THRESHOLD_BASE = 0.5;
const COLLECTION_THRESHOLD = COLLECTION_THRESHOLD_BASE + COIN_RADIUS;
const VISIBLE_COIN_DISTANCE = 75;
const COINS_PER_CHUNK = 10;


interface UseCoinLogicProps {
  sceneRef: MutableRefObject<THREE.Scene | null>;
  dogModelRef: MutableRefObject<THREE.Group | null>;
  isCoinMagnetActiveRef: MutableRefObject<boolean>;
  COIN_MAGNET_RADIUS: number;
  COIN_COUNT: number;
  onCoinCollected: () => void;
  onRemainingCoinsUpdate: (remaining: number) => void;
  isPausedRef: MutableRefObject<boolean>;
  octreeRef: MutableRefObject<Octree | null>;
}

export const useCoinLogic = ({
  sceneRef,
  dogModelRef,
  isCoinMagnetActiveRef,
  COIN_MAGNET_RADIUS,
  COIN_COUNT,
  onCoinCollected,
  onRemainingCoinsUpdate,
  isPausedRef,
  octreeRef,
}: UseCoinLogicProps) => {
  const coinMeshesRef = useRef<THREE.Mesh[]>([]);
  const remainingCoinsRef = useRef<number>(COIN_COUNT);
  const loadedCoinChunks = useRef<Set<string>>(new Set());
  const currentDogChunk = useRef<{ chunkX: number; chunkZ: number } | null>(null);

  const coinGeometry = useRef(new THREE.CylinderGeometry(COIN_RADIUS, COIN_RADIUS, COIN_HEIGHT, 32));
  const coinMaterial = useRef(new THREE.MeshStandardMaterial({
    color: COIN_COLOR,
    emissive: COIN_EMISSIVE_COLOR,
    metalness: 0.8,
    roughness: 0.2,
  }));

  const loadCoinsForChunk = useCallback((chunkX: number, chunkZ: number) => {
    if (!sceneRef.current || loadedCoinChunks.current.has(getChunkKey(chunkX, chunkZ))) {
      return;
    }

    const scene = sceneRef.current;
    const chunkMinX = chunkX * CHUNK_SIZE;
    const chunkMinZ = chunkZ * CHUNK_SIZE;

    for (let i = 0; i < COINS_PER_CHUNK; i++) {
      const coinMesh = new THREE.Mesh(coinGeometry.current, coinMaterial.current);
      const coinX = chunkMinX + Math.random() * CHUNK_SIZE;
      const coinZ = chunkMinZ + Math.random() * CHUNK_SIZE;
      const coinY = COIN_RADIUS;
      coinMesh.position.set(coinX, coinY, coinZ);
      coinMesh.rotation.x = Math.PI / 2;
      coinMesh.castShadow = true;
      coinMeshesRef.current.push(coinMesh);
      scene.add(coinMesh);

      if (octreeRef.current) {
        const coinBox = new THREE.Box3().setFromObject(coinMesh);
        octreeRef.current.insert({
          id: `coin_${coinMesh.id}`,
          bounds: coinBox,
          data: coinMesh
        });
      }
      remainingCoinsRef.current++;
    }
    loadedCoinChunks.current.add(getChunkKey(chunkX, chunkZ));
    onRemainingCoinsUpdate(remainingCoinsRef.current);
  }, [sceneRef, octreeRef, onRemainingCoinsUpdate]);

  const unloadCoinsFromChunk = useCallback((chunkX: number, chunkZ: number) => {
    if (!sceneRef.current || !loadedCoinChunks.current.has(getChunkKey(chunkX, chunkZ))) {
      return;
    }

    const scene = sceneRef.current;
    const chunkMinX = chunkX * CHUNK_SIZE;
    const chunkMinZ = chunkZ * CHUNK_SIZE;
    const chunkMaxX = chunkMinX + CHUNK_SIZE;
    const chunkMaxZ = chunkMinZ + CHUNK_SIZE;

    coinMeshesRef.current = coinMeshesRef.current.filter(coin => {
      const coinX = coin.position.x;
      const coinZ = coin.position.z;

      if (coinX >= chunkMinX && coinX < chunkMaxX && coinZ >= chunkMinZ && coinZ < chunkMaxZ) {
        scene.remove(coin);
        if (octreeRef.current) {
          const coinBox = new THREE.Box3().setFromObject(coin);
          octreeRef.current.remove({ id: `coin_${coin.id}`, bounds: coinBox, data: coin });
        }
        remainingCoinsRef.current--;
        return false;
      }
      return true;
    });
    loadedCoinChunks.current.delete(getChunkKey(chunkX, chunkZ));
    onRemainingCoinsUpdate(remainingCoinsRef.current);
  }, [sceneRef, octreeRef, onRemainingCoinsUpdate]);


  const initializeCoins = useCallback(() => {
    if (!sceneRef.current || !dogModelRef.current) return;
    const scene = sceneRef.current;

    coinMeshesRef.current.forEach(coin => {
      scene.remove(coin);
      if (octreeRef.current) {
        const coinBox = new THREE.Box3().setFromObject(coin);
        octreeRef.current.remove({ id: `coin_${coin.id}`, bounds: coinBox, data: coin });
      }
    });
    coinMeshesRef.current = [];
    loadedCoinChunks.current.clear();
    remainingCoinsRef.current = 0;

    const dogPosition = dogModelRef.current.position;
    const { chunkX: initialChunkX, chunkZ: initialChunkZ } = getChunkCoordinates(dogPosition.x, dogPosition.z);
    currentDogChunk.current = { chunkX: initialChunkX, chunkZ: initialChunkZ };

    for (let x = -RENDER_DISTANCE_CHUNKS; x <= RENDER_DISTANCE_CHUNKS; x++) {
      for (let z = -RENDER_DISTANCE_CHUNKS; z <= RENDER_DISTANCE_CHUNKS; z++) {
        loadCoinsForChunk(initialChunkX + x, initialChunkZ + z);
      }
    }
    onRemainingCoinsUpdate(remainingCoinsRef.current);
  }, [sceneRef, dogModelRef, octreeRef, loadCoinsForChunk, onRemainingCoinsUpdate]);


  const updateCoins = useCallback(() => {
    if (isPausedRef.current || !dogModelRef.current) return;

    const dog = dogModelRef.current;
    const dogPosition = dog.position;

    const { chunkX: currentX, chunkZ: currentZ } = getChunkCoordinates(dogPosition.x, dogPosition.z);

    if (!currentDogChunk.current || currentX !== currentDogChunk.current.chunkX || currentZ !== currentDogChunk.current.chunkZ) {
      currentDogChunk.current = { chunkX: currentX, chunkZ: currentZ };

      const chunksToLoad = new Set<string>();
      for (let x = -RENDER_DISTANCE_CHUNKS; x <= RENDER_DISTANCE_CHUNKS; x++) {
        for (let z = -RENDER_DISTANCE_CHUNKS; z <= RENDER_DISTANCE_CHUNKS; z++) {
          chunksToLoad.add(getChunkKey(currentX + x, currentZ + z));
        }
      }

      loadedCoinChunks.current.forEach(chunkKey => {
        if (!chunksToLoad.has(chunkKey)) {
          const [cx, cz] = chunkKey.split(',').map(Number);
          unloadCoinsFromChunk(cx, cz);
        }
      });

      chunksToLoad.forEach(chunkKey => {
        if (!loadedCoinChunks.current.has(chunkKey)) {
          const [cx, cz] = chunkKey.split(',').map(Number);
          loadCoinsForChunk(cx, cz);
        }
      });
    }

    coinMeshesRef.current.forEach(coin => {
      if (coin.visible) {
        let collectedThisFrame = false;
        const distanceToDog = dogPosition.distanceTo(coin.position);

        if (distanceToDog < COLLECTION_THRESHOLD) {
          collectedThisFrame = true;
        } else if (isCoinMagnetActiveRef.current && distanceToDog < COIN_MAGNET_RADIUS) {
          collectedThisFrame = true;
        }

        if (collectedThisFrame) {
          coin.visible = false;
          onCoinCollected();
          remainingCoinsRef.current--;
          onRemainingCoinsUpdate(remainingCoinsRef.current);
          sceneRef.current?.remove(coin);
          if (octreeRef.current) {
            const coinBox = new THREE.Box3().setFromObject(coin);
            octreeRef.current.remove({ id: `coin_${coin.id}`, bounds: coinBox, data: coin });
          }
          coinMeshesRef.current = coinMeshesRef.current.filter(m => m.id !== coin.id);
        } else {
          coin.visible = distanceToDog < VISIBLE_COIN_DISTANCE;

          if (coin.visible) {
            const worldYAxis = new THREE.Vector3(0, 1, 0);
            coin.rotateOnWorldAxis(worldYAxis, COIN_ROTATION_SPEED);
          }
        }
      }
    });
  }, [
    dogModelRef,
    isCoinMagnetActiveRef,
    COIN_MAGNET_RADIUS,
    onCoinCollected,
    onRemainingCoinsUpdate,
    isPausedRef,
    loadCoinsForChunk,
    unloadCoinsFromChunk,
    sceneRef,
    octreeRef,
  ]);

  const resetCoins = useCallback(() => {
    initializeCoins();
  }, [initializeCoins]);

  return {
    initializeCoins,
    updateCoins,
    resetCoins,
    coinMeshesRef,
    remainingCoinsRef,
  };
};
