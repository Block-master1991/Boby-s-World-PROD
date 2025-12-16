'use client';

import { useCallback, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import type { MutableRefObject } from 'react';
import { Octree } from '../lib/Octree';
import { CHUNK_SIZE, RENDER_DISTANCE_CHUNKS, getChunkCoordinates, getChunkKey } from '../lib/chunkUtils';
import { WORLD_MIN_BOUND, WORLD_MAX_BOUND, ENEMY_PROTECTION_RADIUS_VAL, DOG_SPAWN_PROTECTION_RADIUS, ENEMY_COLLISION_PENALTY_USDT } from '../lib/constants';
import { GameObject, BaseGameObject } from '@/types/game';
// import FloatingEffect from '@/components/game/FloatingEffect'; // Import FloatingEffect for type hinting
// import { useFloatingEffects } from './useFloatingEffects'; // Import useFloatingEffects hook



const COIN_RADIUS = 0.4;
const COIN_EMISSIVE_INTENSITY = 0.8; // زيادة شدة الإضاءة المنبعثة مع الحفاظ على المظهر الطبيعي
const COIN_ROTATION_SPEED = 0.03;
const COIN_VALUE = ENEMY_COLLISION_PENALTY_USDT; // Use the same value as the penalty for consistency
const COLLECTION_THRESHOLD_BASE = 0.5;
const COLLECTION_THRESHOLD = COLLECTION_THRESHOLD_BASE + COIN_RADIUS;
const VISIBLE_COIN_DISTANCE = 150; // Increased to ensure coins are visible in new chunks
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

  // Load the coin model
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

        const gltf = await gltfLoaderRef.current.loadAsync(COIN_MODEL_PATH);
        coinModelRef.current = gltf.scene;
        isCoinModelLoadedRef.current = true;
        console.log('[CoinLogic] Coin model loaded successfully (Singleton)');
      } catch (error) {
        console.error('[CoinLogic] Error loading coin model:', error);
        coinModelPromiseRef.current = null; // Reset on failure so we can try again
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
        // تعديل اتجاه العملة لتكون واقفة بشكل صحيح
        coinMesh.rotation.x = 0; // إلغاء أي تدوير حول المحور السيني
        coinMesh.rotation.z = 0; // إلغاء أي تدوير حول المحور الزيتي
        coinMesh.rotation.y = 0; // إلغاء أي تدوير حول المحور الصادي
        coinMesh.castShadow = true;
        // تعديل مقياس العملة ليبدو مناسبًا
        coinMesh.scale.set(2.5, 2.5, 2.5);

        // تطبيق إعدادات الإضاءة على العملة مع الحفاظ على اللون الأصلي للنموذج
        coinMesh.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            // استخدام اللون الأصلي للنموذج للإضاءة المنبعثة
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
      console.log(`[CoinLogic] Chunk ${chunkKey} marked as LOADED. Total Loaded: ${loadedCoinChunks.current.size}`);
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

        // زيادة مسافة الجمع عند تفعيل المغناطيس لضمان جمع العملة وعدم بقائها عالقة
        // Increase collection threshold when magnet is active to ensure collection
        const effectiveThreshold = isCoinMagnetActiveRef.current ? COLLECTION_THRESHOLD * 2.0 : COLLECTION_THRESHOLD;

        if (distanceToDog < effectiveThreshold) {
          // If magnet is active, play the cool animation
          // إذا كان المغناطيس مفعل، شغل الأنيميشن الجذاب
          if (isCoinMagnetActiveRef.current && !coin.userData.isAnimatingCollection) {
            coin.userData.isAnimatingCollection = true;
            coin.userData.collectionStartTime = performance.now();

            // IMMEDIATE CREDIT LOGIC (Moved to where Attraction starts for guaranteed pickup)
            // We give the reward NOW so it feels instant.
            // نمنح الجائزة فوراً ليشعر اللاعب بالاستجابة
            // NOTE: Credit is now handled when attraction BEGINS (below).
            // But if for some reason it wasn't, we do it here as backup.
            if (!coin.userData.isCredited) {
              coin.userData.isCredited = true;
              onCoinCollected();             // Add score/money
              remainingCoinsRef.current--;   // Update count
              onRemainingCoinsUpdate(remainingCoinsRef.current);
            }

            // Trigger effect immediately
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
          // If NOT magnet (normal pickup), OR if it's normal logic
          else if (!isCoinMagnetActiveRef.current) {
            coin.collected = true;
            collectedThisFrame = true;
            // Standard pickup effect
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
        } else if (isCoinMagnetActiveRef.current && distanceToDog < COIN_MAGNET_RADIUS && !coin.userData.isAttracted && !coin.userData.isAnimatingCollection) {
          // If magnet is active, apply attraction directly to the coin model
          coin.userData.isAttracted = true; // Mark coin as being attracted

          // IMMEDIATE CREDIT ON ATTRACTION START
          // This guarantees "No Coin Left Behind" even if player runs away fast.
          if (!coin.userData.isCredited) {
            coin.userData.isCredited = true;
            onCoinCollected();
            remainingCoinsRef.current--;
            onRemainingCoinsUpdate(remainingCoinsRef.current);
          }

          coin.userData.originalRotationSpeed = coin.rotationSpeed || COIN_ROTATION_SPEED;
          coin.rotationSpeed = COIN_ROTATION_SPEED * 3; // Increase rotation speed when attracted
          // Don't mark as collected yet, let the animation complete first
        }
      }

      if (collectedThisFrame) {
        // Coin collected, perform actions
        coin.visible = false; // Mark as invisible
        onCoinCollected(); // Trigger the collection callback
        remainingCoinsRef.current--; // Decrement the remaining count
        onRemainingCoinsUpdate(remainingCoinsRef.current); // Update UI
        if (sceneRef.current) { // Add null check
          sceneRef.current.remove(coin); // Remove from Three.js scene
        }
        if (octreeRef.current) {
          const coinBox = new THREE.Box3().setFromObject(coin);
          octreeRef.current.remove({ id: `coin_${coin.uuid}`, bounds: coinBox, data: coin }); // Use coin.uuid
        }
        // Do NOT add this coin to coinsToKeep, effectively removing it
      } else {
        // This coin was NOT collected this frame
        // Update its visibility based on distance if it's not already collected
        // Always check visibility against distance
        coin.visible = dogPosition.distanceTo(coin.position) < VISIBLE_COIN_DISTANCE;
        if (coin.visible) {
          // تدوير العملة حول محورها العمودي بشكل احترافي
          coin.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), COIN_ROTATION_SPEED);
        }

        // تحديث حركة العملة إذا كانت في حالة جذب
        // Update magnet attraction / animation
        if (coin.userData.isAnimatingCollection) {
          // HANDLE ANIMATION STATE
          const startTime = coin.userData.collectionStartTime || performance.now();
          const elapsed = performance.now() - startTime;
          const duration = 200; // Fast 200ms animation
          const progress = Math.min(1, elapsed / duration);

          // Shrink
          const scale = Math.max(0.1, 2.5 * (1 - progress)); // From 2.5 down to 0.1
          coin.scale.set(scale, scale, scale);

          // Super spin
          coin.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), 0.5);

          // Move to head
          const headPos = dogPosition.clone();
          headPos.y += 1.0;
          coin.position.lerp(headPos, 0.3);

          if (progress >= 1) {
            coin.collected = true;
            collectedThisFrame = true;
            // Note: Effect was already triggered at start
          }

        } else if (coin.userData.isAttracted) {
          // Standard attraction logic (move towards dog)
          const targetPosition = dogPosition.clone();
          targetPosition.y += 0.5;

          const distanceToDog = dogPosition.distanceTo(coin.position);
          // SLOWER SPEED: Reduced max speed from 0.25 to 0.12 for smoother feel
          const speed = Math.min(0.12, 0.02 + (COIN_MAGNET_RADIUS - distanceToDog) / COIN_MAGNET_RADIUS * 0.1);
          coin.position.lerp(targetPosition, speed);

          coin.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), coin.rotationSpeed || COIN_ROTATION_SPEED);
        }
      }
      if (!collectedThisFrame) {
        coinsToKeep.push(coin); // Add to the list of coins to keep
      }
    }
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
    console.log(`[CoinLogic] Force loaded coins for ${chunksToLoad.size} chunks around ${centerX}, ${centerZ}`);
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
