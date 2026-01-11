'use client';

import { useCallback, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import type { MutableRefObject } from 'react';
import type { Octree } from '../lib/Octree';
import { CHUNK_SIZE, RENDER_DISTANCE_CHUNKS, getChunkCoordinates, getChunkKey } from '../lib/chunkUtils';
import { WORLD_MIN_BOUND, WORLD_MAX_BOUND, ENEMY_PROTECTION_RADIUS_VAL, DOG_SPAWN_PROTECTION_RADIUS, ENEMY_COLLISION_PENALTY_USDT } from '../lib/constants';
import type { GameObject, BaseGameObject } from '@/types/game';
import { getModel, putModel } from '../lib/indexedDB'; // Import IndexedDB utilities
import { logger } from '@/utils/logger';
// import FloatingEffect from '@/components/game/FloatingEffect'; // Import FloatingEffect for type hinting
// import { useFloatingEffects } from './useFloatingEffects'; // Import useFloatingEffects hook



const COIN_RADIUS = 0.4;
const COIN_EMISSIVE_INTENSITY = 0.8; // Increased emissive intensity while maintaining natural appearance
const COIN_ROTATION_SPEED = 0.03;
const COIN_VALUE = ENEMY_COLLISION_PENALTY_USDT; // Use the same value as the penalty for consistency
const COLLECTION_THRESHOLD_BASE = 0.5;
const COLLECTION_THRESHOLD = COLLECTION_THRESHOLD_BASE + COIN_RADIUS;
const VISIBLE_COIN_DISTANCE = 220; // Increased to 220 to maximize visibility within loaded chunks
const COIN_MODEL_PATH = '/models/coin.glb'; // Path to the coin model

// Define CoinData interface
// Leveraging THREE.Mesh's existing 'uuid' property for unique identification.
// No need to add a custom 'id' property that conflicts with THREE.Mesh.id (number).
export interface CoinData extends THREE.Group, BaseGameObject {
  collected: boolean;
  value?: number;
  rotationSpeed?: number;
  type: 'item';
  // The 'uuid' property from THREE.Object3D (which THREE.Group extends) is already a string UUID.
  // We can use this directly for unique identification.

  // Custom properties for magnet logic
  userData: {
    isAttracted?: boolean;
    originalRotationSpeed?: number;
    isAnimatingCollection?: boolean;
    collectionStartTime?: number;
    isCredited?: boolean; // Flag to track if the coin has already been credited to balance
    [key: string]: any;
  };
}

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
  addFloatingEffect: (
    position: THREE.Vector3,
    effectType: 'coin' | 'Bottle' | 'item' | 'penalty' | 'score',
    value: number,
    animationType?: 'floatUp' | 'attractToTarget' | 'followTarget',
    is3DModel?: boolean,
    targetPosition?: THREE.Vector3,
    targetMesh?: THREE.Object3D, // Add targetMesh to the type definition
  ) => void;
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
  addFloatingEffect, // Destructure addFloatingEffect
}: UseCoinLogicProps) => {
  const coinMeshesRef = useRef<CoinData[]>([]); // Changed to CoinData[]
  const remainingCoinsRef = useRef<number>(COIN_COUNT);
  const loadedCoinChunks = useRef<Set<string>>(new Set());
  const currentDogChunk = useRef<{ chunkX: number; chunkZ: number } | null>(null);
  const coinModelRef = useRef<THREE.Group | null>(null);
  const gltfLoaderRef = useRef<GLTFLoader | null>(null);
  const isCoinModelLoadedRef = useRef<boolean>(false);

  const loadingCoinChunks = useRef<Set<string>>(new Set());

  const coinModelPromiseRef = useRef<Promise<void> | null>(null);

  const lastDogPositionRef = useRef<THREE.Vector3>(new THREE.Vector3());

  // Load the coin model with IndexedDB caching
  const loadCoinModel = useCallback(async () => {
    if (isCoinModelLoadedRef.current || !sceneRef.current) return;

    // If a load is already in progress, wait for it
    if (coinModelPromiseRef.current) {
      return coinModelPromiseRef.current;
    }

    coinModelPromiseRef.current = (async () => {
      try {
        if (!gltfLoaderRef.current) {
          gltfLoaderRef.current = new GLTFLoader();
        }

        const modelName = 'coin-model';

        // Ensure gltfLoader is initialized
        if (!gltfLoaderRef.current) {
          gltfLoaderRef.current = new GLTFLoader();
        }

        // Try to load from IndexedDB first
        const cachedData = await getModel(modelName);
        if (cachedData) {
          logger.log(`[CoinLogic] Loading coin model from IndexedDB: ${modelName}`);
          const gltf = await gltfLoaderRef.current.parseAsync(cachedData, '');
          coinModelRef.current = gltf.scene;
          isCoinModelLoadedRef.current = true;
          logger.log('[CoinLogic] Coin model loaded successfully from IndexedDB (Singleton)');
        } else {
          logger.log(`[CoinLogic] Fetching coin model from network: ${COIN_MODEL_PATH}`);
          const response = await fetch(COIN_MODEL_PATH);
          if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
          const arrayBuffer = await response.arrayBuffer();
          await putModel(modelName, arrayBuffer); // Store in IndexedDB
          const gltf = await gltfLoaderRef.current.parseAsync(arrayBuffer, '');
          coinModelRef.current = gltf.scene;
          isCoinModelLoadedRef.current = true;
          logger.log('[CoinLogic] Coin model loaded successfully from network and cached (Singleton)');
        }
      } catch (error) {
        logger.error(`[CoinLogic] Error loading or caching coin model:`, error);
        // Fallback to direct network load if IndexedDB fails
        logger.log(`[CoinLogic] Falling back to direct network load for: ${COIN_MODEL_PATH}`);
        try {
          if (gltfLoaderRef.current) {
            const gltf = await gltfLoaderRef.current.loadAsync(COIN_MODEL_PATH);
            coinModelRef.current = gltf.scene;
            isCoinModelLoadedRef.current = true;
            logger.log('[CoinLogic] Coin model loaded successfully via fallback (Singleton)');
          }
        } catch (fallbackError) {
          logger.error('[CoinLogic] Fallback load also failed:', fallbackError);
          coinModelPromiseRef.current = null; // Reset on failure so we can try again
        }
      }
    })();

    await coinModelPromiseRef.current;
  }, [sceneRef]);

  const loadCoinsForChunk = useCallback(async (chunkX: number, chunkZ: number) => {
    const chunkKey = getChunkKey(chunkX, chunkZ);
    if (!sceneRef.current || loadedCoinChunks.current.has(chunkKey) || loadingCoinChunks.current.has(chunkKey)) {
      return;
    }

    loadingCoinChunks.current.add(chunkKey);

    try {
      // Ensure coin model is loaded
      if (!isCoinModelLoadedRef.current) {
        await loadCoinModel();
      }

      if (!coinModelRef.current) return;

      const scene = sceneRef.current;
      const chunkMinX = chunkX * CHUNK_SIZE;
      const chunkMinZ = chunkZ * CHUNK_SIZE;

      const dogPosition = dogModelRef.current?.position || new THREE.Vector3(0, 0, 0); // Get dog's initial position

      // Get spawn points from ChunkManager (Worker-calculated)
      const chunkManager = scene.getObjectByName('ChunkManager') as any;
      if (!chunkManager) return;

      const gameplayData = chunkManager.getGameplaySpawns(chunkKey);
      if (!gameplayData) {
        // Terrain not ready yet, retry next frame
        return;
      }

      const coinSpawns = gameplayData.coinSpawns;

      for (const spawn of coinSpawns) {
        const coinMesh = coinModelRef.current.clone() as CoinData; // Clone the coin model
        coinMesh.collected = false;
        coinMesh.value = COIN_VALUE;
        coinMesh.rotationSpeed = COIN_ROTATION_SPEED;

        const coinX = spawn.position[0];
        const coinZ = spawn.position[2];

        // Ensure we respect the calculated position
        // ... coordinates are already valid from worker ...

        let coinY = COIN_RADIUS;
        if (octreeRef.current) {
          coinY = octreeRef.current.getGroundHeightAt(coinX, coinZ) + COIN_RADIUS;
        }
        coinMesh.position.set(coinX, coinY, coinZ);
        // Adjust coin orientation to stand correctly
        coinMesh.rotation.x = 0; // Cancel any rotation around x-axis
        coinMesh.rotation.z = 0; // Cancel any rotation around z-axis
        coinMesh.rotation.y = 0; // Cancel any rotation around y-axis
        coinMesh.castShadow = true;
        // Adjust coin scale to look appropriate
        coinMesh.scale.set(2.5, 2.5, 2.5);

        // Apply lighting settings to the coin while preserving original model color
        coinMesh.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            // Use original model color for emissive lighting
            const originalColor = child.material.color.clone();
            child.material.emissive = originalColor;
            child.material.emissiveIntensity = COIN_EMISSIVE_INTENSITY;
          }
        });
        coinMeshesRef.current.push(coinMesh);
        scene.add(coinMesh);

        if (octreeRef.current) {
          const coinBox = new THREE.Box3().setFromObject(coinMesh);
          octreeRef.current.insert({
            id: `coin_${coinMesh.uuid}`,
            bounds: coinBox,
            data: coinMesh as unknown as GameObject
          });
        }
      }
      loadedCoinChunks.current.add(chunkKey);
      logger.log(`[CoinLogic] Chunk ${chunkKey} marked as LOADED. Total Loaded: ${loadedCoinChunks.current.size}`);
      onRemainingCoinsUpdate(remainingCoinsRef.current);
    } finally {
      loadingCoinChunks.current.delete(chunkKey);
    }
  }, [sceneRef, octreeRef, onRemainingCoinsUpdate, dogModelRef, loadCoinModel]);

  const unloadCoinsFromChunk = useCallback((chunkX: number, chunkZ: number) => {
    if (!sceneRef.current || !loadedCoinChunks.current.has(getChunkKey(chunkX, chunkZ))) {
      return;
    }

    const scene = sceneRef.current;
    const chunkMinX = chunkX * CHUNK_SIZE;
    const chunkMinZ = chunkZ * CHUNK_SIZE;
    const chunkMaxX = chunkMinX + CHUNK_SIZE;
    const chunkMaxZ = chunkMinZ + CHUNK_SIZE;

    coinMeshesRef.current = coinMeshesRef.current.filter((coin: CoinData) => { // Specify CoinData type
      const coinX = coin.position.x;
      const coinZ = coin.position.z;

      if (coinX >= chunkMinX && coinX < chunkMaxX && coinZ >= chunkMinZ && coinZ < chunkMaxZ) {
        scene.remove(coin);
        if (octreeRef.current) {
          const coinBox = new THREE.Box3().setFromObject(coin);
          octreeRef.current.remove({ id: `coin_${coin.uuid}`, bounds: coinBox, data: coin }); // Use coin.uuid
        }
        // Do NOT decrement remainingCoinsRef.current here, as these coins are not "collected"
        return false;
      }
      return true;
    });
    loadedCoinChunks.current.delete(getChunkKey(chunkX, chunkZ));
    // No need to call onRemainingCoinsUpdate here, as the total count doesn't change when coins are unloaded
  }, [sceneRef, octreeRef]); // Removed onRemainingCoinsUpdate from dependencies as it's not called


  const initializeCoins = useCallback(() => {
    if (!sceneRef.current || !dogModelRef.current) return;
    const scene = sceneRef.current;

    coinMeshesRef.current.forEach((coin: CoinData) => { // Specify CoinData type
      scene.remove(coin);
      if (octreeRef.current) {
        const coinBox = new THREE.Box3().setFromObject(coin);
        octreeRef.current.remove({ id: `coin_${coin.uuid}`, bounds: coinBox, data: coin }); // Use coin.uuid
      }
    });
    coinMeshesRef.current = [];
    loadedCoinChunks.current.clear();
    remainingCoinsRef.current = COIN_COUNT; // Initialize with the total coin count

    const dogPosition = dogModelRef.current.position;
    const { chunkX: initialChunkX, chunkZ: initialChunkZ } = getChunkCoordinates(dogPosition.x, dogPosition.z);
    currentDogChunk.current = { chunkX: initialChunkX, chunkZ: initialChunkZ };

    for (let x = -RENDER_DISTANCE_CHUNKS; x <= RENDER_DISTANCE_CHUNKS; x++) {
      for (let z = -RENDER_DISTANCE_CHUNKS; z <= RENDER_DISTANCE_CHUNKS; z++) {
        loadCoinsForChunk(initialChunkX + x, initialChunkZ + z);
      }
    }
    onRemainingCoinsUpdate(remainingCoinsRef.current);
  }, [sceneRef, dogModelRef, octreeRef, loadCoinsForChunk, onRemainingCoinsUpdate, COIN_COUNT]);


  const updateCoins = useCallback(() => {
    if (isPausedRef.current || !dogModelRef.current) return;

    const dog = dogModelRef.current;
    const dogPosition = dog.position;

    // Track displacement to help attracted coins keep pace
    const displacement = dogPosition.clone().sub(lastDogPositionRef.current);

    const { chunkX: currentX, chunkZ: currentZ } = getChunkCoordinates(dogPosition.x, dogPosition.z);

    // This logic now only handles unloading chunks that are out of range
    if (!currentDogChunk.current || currentX !== currentDogChunk.current.chunkX || currentZ !== currentDogChunk.current.chunkZ) {
      currentDogChunk.current = { chunkX: currentX, chunkZ: currentZ };

      const chunksToKeepLoaded = new Set<string>();
      for (let x = -RENDER_DISTANCE_CHUNKS; x <= RENDER_DISTANCE_CHUNKS; x++) {
        for (let z = -RENDER_DISTANCE_CHUNKS; z <= RENDER_DISTANCE_CHUNKS; z++) {
          chunksToKeepLoaded.add(getChunkKey(currentX + x, currentZ + z));
        }
      }

      loadedCoinChunks.current.forEach((chunkKey: string) => {
        if (!chunksToKeepLoaded.has(chunkKey)) {
          const [cx, cz] = chunkKey.split(',').map(Number);
          unloadCoinsFromChunk(cx, cz);
        }
      });

      chunksToKeepLoaded.forEach((chunkKey: string) => {
        if (!loadedCoinChunks.current.has(chunkKey)) {
          const [cx, cz] = chunkKey.split(',').map(Number);
          loadCoinsForChunk(cx, cz);
        }
      });
    }

    const coinsToKeep: CoinData[] = []; // Array to hold coins that are not collected this frame, changed to CoinData[]

    for (const coin of coinMeshesRef.current) {
      if (coin.collected) {
        continue;
      }

      let collectedThisFrame = false;

      // Only check for collection if the coin is currently visible
      if (coin.visible) {
        const distanceToDog = dogPosition.distanceTo(coin.position);

        // Increase collection threshold when magnet is active to ensure collection
        const effectiveThreshold = isCoinMagnetActiveRef.current ? COLLECTION_THRESHOLD * 2.0 : COLLECTION_THRESHOLD;

        // 1. CHECK FOR COLLECTION (Standard or Magnet Attraction Finish)
        if (distanceToDog < effectiveThreshold) {
          // --- CONSOLIDATED CREDIT BLOCK ---
          if (!coin.userData.isCredited) {
            coin.userData.isCredited = true;
            onCoinCollected();             // Add score/money
            remainingCoinsRef.current--;   // Update count
            onRemainingCoinsUpdate(remainingCoinsRef.current);
          }

          if (isCoinMagnetActiveRef.current) {
            // Magnet collection animation
            if (!coin.userData.isAnimatingCollection) {
              coin.userData.isAnimatingCollection = true;
              coin.userData.collectionStartTime = performance.now();
              
              addFloatingEffect(
                coin.position.clone(),
                'coin',
                coin.value || 0.001,
                'followTarget',
                true,
                undefined,
                dogModelRef.current
              );
            }
          } else {
            // Standard pickup
            coin.collected = true;
            collectedThisFrame = true;
            
            addFloatingEffect(
              coin.position.clone(),
              'coin',
              coin.value || 0.001,
              'followTarget',
              true,
              undefined,
              dogModelRef.current
            );
          }
        } 
        // 2. CHECK FOR MAGNET ATTRACTION START
        else if (isCoinMagnetActiveRef.current && distanceToDog < COIN_MAGNET_RADIUS && !coin.userData.isAttracted && !coin.userData.isAnimatingCollection) {
          coin.userData.isAttracted = true;

          // --- CONSOLIDATED CREDIT BLOCK (ON ATTRACTION START) ---
          if (!coin.userData.isCredited) {
            coin.userData.isCredited = true;
            onCoinCollected();
            remainingCoinsRef.current--;
            onRemainingCoinsUpdate(remainingCoinsRef.current);
          }

          coin.userData.originalRotationSpeed = coin.rotationSpeed || COIN_ROTATION_SPEED;
          coin.rotationSpeed = COIN_ROTATION_SPEED * 3;
        }
      }

      if (collectedThisFrame) {
        // Final cleanup for a fully collected coin (standard pickup)
        coin.visible = false;
        if (sceneRef.current) {
          sceneRef.current.remove(coin);
        }
        if (octreeRef.current) {
          const coinBox = new THREE.Box3().setFromObject(coin);
          octreeRef.current.remove({ id: `coin_${coin.uuid}`, bounds: coinBox, data: coin });
        }
      } else {
        // Update its visibility and animation if it's not already removed from scene
        const dist = dogPosition.distanceTo(coin.position);
        coin.visible = dist < VISIBLE_COIN_DISTANCE;
        
        if (coin.visible) {
          // Optimization: Only rotate coins if they are within standard visibility range (150) or attracted
          // Distant coins (150-220) remain static to save CPU
          if (dist < 150 || coin.userData.isAttracted || coin.userData.isAnimatingCollection) {
            coin.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), COIN_ROTATION_SPEED);
          }
        }

        // Update magnet attraction / animation
        if (coin.userData.isAnimatingCollection) {
          const startTime = coin.userData.collectionStartTime || performance.now();
          const elapsed = performance.now() - startTime;
          const duration = 200;
          const progress = Math.min(1, elapsed / duration);

          const scale = Math.max(0.1, 2.5 * (1 - progress));
          coin.scale.set(scale, scale, scale);
          coin.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), 0.5);

          const headPos = dogPosition.clone();
          headPos.y += 1.0;
          coin.position.lerp(headPos, 0.4); // Aggressive lerp to head

          if (progress >= 1) {
            coin.collected = true;
            // Removal will happen on next frame or we can do it here
            coin.visible = false;
            if (sceneRef.current) sceneRef.current.remove(coin);
            if (octreeRef.current) {
              const coinBox = new THREE.Box3().setFromObject(coin);
              octreeRef.current.remove({ id: `coin_${coin.uuid}`, bounds: coinBox, data: coin });
            }
          }
        } else if (coin.userData.isAttracted) {
          // APPLY DISPLACEMENT: Keep pace with the player
          coin.position.add(displacement);

          const targetPosition = dogPosition.clone();
          targetPosition.y += 0.5;
          const distanceToDog = dogPosition.distanceTo(coin.position);
          
          // DYNAMIC LERP SPEED: Up to 0.4 for very fast catch-up
          const speed = Math.min(0.4, 0.05 + (COIN_MAGNET_RADIUS - distanceToDog) / COIN_MAGNET_RADIUS * 0.35);
          coin.position.lerp(targetPosition, speed);
          
          coin.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), coin.rotationSpeed || COIN_ROTATION_SPEED);
        }
      }

      if (!coin.collected || (coin.collected && coin.visible)) {
        coinsToKeep.push(coin);
      }
    }
    
    // Update last position for next frame displacement calculation
    lastDogPositionRef.current.copy(dogPosition);
    coinMeshesRef.current = coinsToKeep; // Update the ref with only the coins that were not collected
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
    addFloatingEffect, // Add addFloatingEffect to dependencies
  ]);

  const resetCoins = useCallback(() => {
    initializeCoins();
  }, [initializeCoins]);

  const forceLoadAreaCoins = useCallback(async (centerX: number, centerZ: number) => {
    if (!sceneRef.current) return;

    const chunksToLoad = new Set<string>();
    for (let x = -RENDER_DISTANCE_CHUNKS; x <= RENDER_DISTANCE_CHUNKS; x++) {
      for (let z = -RENDER_DISTANCE_CHUNKS; z <= RENDER_DISTANCE_CHUNKS; z++) {
        chunksToLoad.add(getChunkKey(centerX + x, centerZ + z));
      }
    }

    const loadPromises = Array.from(chunksToLoad).map(async (chunkKey) => {
      if (!loadedCoinChunks.current.has(chunkKey)) {
        const [cx, cz] = chunkKey.split(',').map(Number);
        await loadCoinsForChunk(cx, cz);
      }
    });

    await Promise.all(loadPromises);
    logger.log(`[CoinLogic] Force loaded coins for ${chunksToLoad.size} chunks around ${centerX}, ${centerZ}`);
  }, [sceneRef, loadCoinsForChunk]);

  return {
    initializeCoins,
    updateCoins, // Restore updateCoins
    resetCoins,
    forceLoadAreaCoins, // Expose force load function
    coinMeshesRef,
    remainingCoinsRef,
    loadedCoinChunks, // Expose loadedCoinChunks
  };
};
