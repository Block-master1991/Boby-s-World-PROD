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
const COIN_HEIGHT = 0.08;
const COIN_COLOR = 0xFFD700;
const COIN_EMISSIVE_COLOR = 0xFFD700; // استخدام اللون الأصلي للعملة للإضاءة المنبعثة
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

  // Load the coin model
  const loadCoinModel = useCallback(async () => {
    if (isCoinModelLoadedRef.current || !sceneRef.current) return;
    
    try {
      if (!gltfLoaderRef.current) {
        gltfLoaderRef.current = new GLTFLoader();
      }
      
      const gltf = await gltfLoaderRef.current.loadAsync(COIN_MODEL_PATH);
      coinModelRef.current = gltf.scene;
      isCoinModelLoadedRef.current = true;
      console.log('[CoinLogic] Coin model loaded successfully');
    } catch (error) {
      console.error('[CoinLogic] Error loading coin model:', error);
    }
  }, [sceneRef]);

  const loadCoinsForChunk = useCallback(async (chunkX: number, chunkZ: number) => {
    if (!sceneRef.current || loadedCoinChunks.current.has(getChunkKey(chunkX, chunkZ))) {
      return;
    }
    
    // Ensure coin model is loaded
    if (!isCoinModelLoadedRef.current) {
      await loadCoinModel();
    }
    
    if (!coinModelRef.current) return;

    const scene = sceneRef.current;
    const chunkMinX = chunkX * CHUNK_SIZE;
    const chunkMinZ = chunkZ * CHUNK_SIZE;

    const dogPosition = dogModelRef.current?.position || new THREE.Vector3(0, 0, 0); // Get dog's initial position

    const numCoinsToGenerate = (Math.random() < 0.625) ? 1 : 0; // Distribute approximately 1000 coins across 1600 chunks (0.625 coins/chunk average)
    for (let i = 0; i < numCoinsToGenerate; i++) {
      const coinMesh = coinModelRef.current.clone() as CoinData; // Clone the coin model
      coinMesh.collected = false;
      coinMesh.value = COIN_VALUE;
      coinMesh.rotationSpeed = COIN_ROTATION_SPEED;
      let coinX, coinZ;
      let attempts = 0;
      const MAX_ATTEMPTS = 100; // Prevent infinite loops

      do {
        coinX = chunkMinX + Math.random() * CHUNK_SIZE;
        coinZ = chunkMinZ + Math.random() * CHUNK_SIZE;

        // Clamp coin positions to world boundaries, accounting for enemy patrol radius
        const minSpawnX = WORLD_MIN_BOUND + ENEMY_PROTECTION_RADIUS_VAL;
        const maxSpawnX = WORLD_MAX_BOUND - ENEMY_PROTECTION_RADIUS_VAL;
        const minSpawnZ = WORLD_MIN_BOUND + ENEMY_PROTECTION_RADIUS_VAL;
        const maxSpawnZ = WORLD_MAX_BOUND - ENEMY_PROTECTION_RADIUS_VAL;

        coinX = Math.max(minSpawnX, Math.min(maxSpawnX, coinX));
        coinZ = Math.max(minSpawnZ, Math.min(maxSpawnZ, coinZ));
        
        // إضافة انحراف عشوائي صغير بعد التقييد
        const randomOffset = (Math.random() - 0.5) * 2; // قيمة بين -0.25 و 0.25
        coinX += randomOffset;
        coinZ += randomOffset;

        attempts++;
        if (attempts > MAX_ATTEMPTS) {
          console.warn("Max attempts reached for coin spawning, placing coin without protection.");
          break;
        }
      } while (dogPosition.distanceTo(new THREE.Vector3(coinX, dogPosition.y, coinZ)) < DOG_SPAWN_PROTECTION_RADIUS);

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
    loadedCoinChunks.current.add(getChunkKey(chunkX, chunkZ));
    onRemainingCoinsUpdate(remainingCoinsRef.current);
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

    const coinsToKeep: CoinData[] = []; // Array to hold coins that are not collected this frame, changed to CoinData[]

    for (const coin of coinMeshesRef.current) {
      if (coin.collected) {
    continue;
  }
      let collectedThisFrame = false;
      // Only check for collection if the coin is currently visible
      if (coin.visible) {
        const distanceToDog = dogPosition.distanceTo(coin.position);

        if (distanceToDog < COLLECTION_THRESHOLD) {
          coin.collected = true;
          collectedThisFrame = true;
          // Add floating effect for normal coin collection
          addFloatingEffect(
            coin.position.clone(),
            'coin',
            coin.value || 0.001, // Use the actual coin value
            'followTarget', // Make it follow the dog's head
            true, // Use 3D model for coin
            undefined, // targetPosition is not needed for 'followTarget'
            dogModelRef.current // Pass the dog's mesh as targetMesh
          );
        } else if (isCoinMagnetActiveRef.current && distanceToDog < COIN_MAGNET_RADIUS && !coin.userData.isAttracted) {
          // If magnet is active, apply attraction directly to the coin model
          coin.userData.isAttracted = true; // Mark coin as being attracted
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
        if (coin.visible) { // Only update rotation if it's still visible and not collected
          coin.visible = dogPosition.distanceTo(coin.position) < VISIBLE_COIN_DISTANCE;
          if (coin.visible) {
            // تدوير العملة حول محورها العمودي بشكل احترافي
            coin.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), COIN_ROTATION_SPEED);
          }
          
          // تحديث حركة العملة إذا كانت في حالة جذب
          if (coin.userData.isAttracted) {
            // تحديث موضع الهدف دائمًا ليتبع الكلب
            const targetPosition = dogPosition.clone();
            targetPosition.y += 1; // ارتفاع مستهدف فوق الكلب
            
            // تحريك العملة نحو الهدف (الكلب) بسرعة متزايدة كلما اقتربت
            const distanceToDog = dogPosition.distanceTo(coin.position);
            const speed = Math.min(0.15, 0.05 + (COIN_MAGNET_RADIUS - distanceToDog) / COIN_MAGNET_RADIUS * 0.1);
            coin.position.lerp(targetPosition, speed);
            
            // تدوير العملة بشكل أسرع وهي تقترب
            coin.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), coin.rotationSpeed || COIN_ROTATION_SPEED);
            
            // التعامل مع عملية الاختفاء التدريجي
            if (coin.userData.isDisappearing) {
              const elapsed = performance.now() - coin.userData.disappearStartTime;
              const progress = Math.min(1, elapsed / coin.userData.disappearDuration);
              
              // تصغير حجم العملة تدريجياً
              const scale = 1 - progress;
              coin.scale.set(scale, scale, scale);
              
              // زيادة سرعة الدوران أثناء الاختفاء
              coin.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), COIN_ROTATION_SPEED * 5 * progress);
              
              // رفع العملة للأعلى أثناء الاختفاء
              coin.position.y += 0.02 * progress;
              
              // عند اكتمال الاختفاء
              if (progress >= 1) {
                coin.collected = true;
                collectedThisFrame = true;
              }
            }
            
            // التحقق من وصول العملة إلى الكلب فقط إذا لم تكن تختفي بالفعل
            if (distanceToDog < COLLECTION_THRESHOLD) {
              // بدء عملية الاختفاء التدريجي للعملة
              coin.userData.isDisappearing = true;
              coin.userData.disappearStartTime = performance.now();
              coin.userData.disappearDuration = 300; // مدة الاختفاء بالميلي ثانية
              
              // Add floating effect for coin collection
              addFloatingEffect(
                coin.position.clone(),
                'coin',
                coin.value || 0.001, // Use the actual coin value
                'followTarget', // Make it follow the dog's head
                true, // Use 3D model for coin
                undefined, // targetPosition is not needed for 'followTarget'
                dogModelRef.current // Pass the dog's mesh as targetMesh
              );
            }
          }
        }
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

  return {
    initializeCoins,
    updateCoins,
    resetCoins,
    coinMeshesRef,
    remainingCoinsRef,
  };
};
