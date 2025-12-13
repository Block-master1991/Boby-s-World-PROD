'use client';

import * as React from 'react';
import * as THREE from 'three';
import type { MutableRefObject } from 'react';
import { GLTFLoader, GLTF } from 'three/examples/jsm/loaders/GLTFLoader';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader';
import { Octree } from '@/lib/Octree';
import { getModel, putModel } from '../lib/indexedDB';
import { CHUNK_SIZE, RENDER_DISTANCE_CHUNKS, getChunkCoordinates, getChunkKey } from '../lib/chunkUtils';
import { WORLD_MIN_BOUND, WORLD_MAX_BOUND, ENEMY_PROTECTION_RADIUS_VAL, DOG_SPAWN_PROTECTION_RADIUS, ENEMY_COLLISION_PENALTY_USDT } from '../lib/constants'; // Import ENEMY_COLLISION_PENALTY_USDT
import { useDynamicModelLoader } from './useDynamicModelLoader'; // Import useDynamicModelLoader
import { CoinData } from './useCoinLogic'; // Import CoinData
import { GameObject, BaseGameObject } from '@/types/game';

// New: Enemy Model Cache
const EnemyModelCache: { [key: string]: { model: THREE.Group; animations: THREE.AnimationClip[] } } = {};

const ENEMY_SPEED = 0.03;
const ENEMY_GALLOP_SPEED_MULTIPLIER = 3;
const ENEMY_ATTACK_DISTANCE = 1.5;
const ENEMY_DEATH_TRIGGER_DISTANCE = 0.5;
const ENEMY_DEATH_DURATION = 1.5;
const ENEMY_SINKING_DELAY = 1.0; // Reduced to 1 second delay before sinking starts
const ENEMY_PROTECTION_RADIUS = 8;
const ENEMY_CHASE_RADIUS = 16;
const CROSSFADE_DURATION = 0.2;
const VISIBLE_ENEMY_DISTANCE = 150; // Matched to coin visibility
const ENEMIES_PER_COIN_CHUNK = 1;

const ENEMY_ANIMATION_NAMES = {
  CARNIVORE: {
    IDLE: ['Idle', 'Idle_2', 'Idle_2_HeadLow', 'Eating'],
    WALK: 'Walk',
    GALLOP: 'Gallop',
    ATTACK: 'Attack',
    DEATH: 'Death',
  },
  HERBIVORE: {
    IDLE: ['Idle', 'Idle_2', 'Idle_HeadLow', 'Eating'],
    WALK: 'Walk',
    GALLOP: 'Gallop',
    ATTACK: 'Attack_Kick',
    DEATH: 'Death',
  },
};

interface EnemyCustomData {
  targetCoinId: string; // New: Unique ID of the coin this enemy is protecting
  targetCoinPosition: THREE.Vector3; // Keep for initial positioning and patrol
  patrolCenter: THREE.Vector3;
  patrolTarget: THREE.Vector3;
  isIdling: boolean;
  idleTimer: number;
  idleDuration: number;
  isAttacking: boolean;
  isDying: boolean;
  deathTimer: number;
  hasAppliedDeathEffect: boolean;
  isSinking: boolean; // New: Flag for sinking animation
  sinkingTimer: number; // New: Timer for sinking delay
  initialDeathY: number; // New: Initial Y position when death animation finishes
  mixer: THREE.AnimationMixer;
  animations: THREE.AnimationClip[];
  enemyType: 'carnivore' | 'herbivore';
  currentAction: THREE.AnimationAction | null;
  actions: { [key: string]: THREE.AnimationAction };
  chunkKey: string;
  // Add a reference to the high-detail model within the LOD for mixer
  highDetailModel: THREE.Group;
}

interface EnemyData extends EnemyCustomData, BaseGameObject {
  lod: THREE.LOD; // The LOD object itself
  position: THREE.Vector3; // Position of the enemy
  visible: boolean; // Visibility state of the enemy
  lookAt: (target: THREE.Vector3) => void; // Method to make enemy look at target
  rotation: THREE.Euler; // Rotation of the enemy
  scale: THREE.Vector3; // Scale of the enemy
  type: string; // Type of the enemy
  isPooled: boolean; // Whether the enemy is pooled
  isModelInstantiated: boolean; // Whether the model is instantiated
}

interface UseEnemyLogicProps {
  sceneRef: MutableRefObject<THREE.Scene | null>;
  dogModelRef: MutableRefObject<THREE.Group | null>;
  isShieldActiveRef: MutableRefObject<boolean>;
  protectionBottleCountRef: MutableRefObject<number>;
  onConsumeProtectionBottle: () => void;
  onEnemyCollisionPenalty: () => void;
  isPausedRef: MutableRefObject<boolean>;
  coinMeshesRef: MutableRefObject<CoinData[]>;
  loadedCoinChunks: MutableRefObject<Set<string>>; // New prop
  onCoinCollected: () => void;
  onAttackAnimationFinished: (event: THREE.Event) => void;
  octreeRef: MutableRefObject<Octree<GameObject> | null>;
  cameraRef: MutableRefObject<THREE.PerspectiveCamera | null>;
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

export const useEnemyLogic = ({
  sceneRef,
  dogModelRef,
  isShieldActiveRef,
  protectionBottleCountRef,
  onConsumeProtectionBottle,
  onEnemyCollisionPenalty,
  isPausedRef,
  coinMeshesRef,
  loadedCoinChunks, // Destructure new prop
  octreeRef,
  onCoinCollected,
  onAttackAnimationFinished,
  cameraRef,
  addFloatingEffect, // Destructure addFloatingEffect
}: UseEnemyLogicProps) => {
  const enemyMeshesRef = React.useRef<EnemyData[]>([]);
  const gltfLoader = React.useRef<GLTFLoader | null>(null);
  const loadedEnemyChunks = React.useRef<Set<string>>(new Set());
  const loadingEnemyChunks = React.useRef<Set<string>>(new Set()); // New loading state
  const currentDogChunk = React.useRef<{ chunkX: number; chunkZ: number } | null>(null);
  const areModelsPreloaded = React.useRef(false);

  // Get disposeModelResources from useDynamicModelLoader
  const { cleanupModelPool } = useDynamicModelLoader({
    cameraRef,
    sceneRef,
    octreeRef,
    objectsToManage: [], // Not managing objects here, just need the dispose function
  });

  // Helper to dispose of a single model's resources (re-defined for direct use in this hook)
  const disposeEnemyModelResources = React.useCallback((model: THREE.Object3D) => { // Change type to Object3D
    model.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        if ((child as THREE.Mesh).geometry) {
          (child as THREE.Mesh).geometry.dispose();
        }
        if ((child as THREE.Mesh).material) {
          const material = (child as THREE.Mesh).material;
          if (Array.isArray(material)) {
            material.forEach(m => m.dispose());
          } else {
            (material as THREE.Material).dispose();
          }
        }
      }
    });
    console.log(`[useEnemyLogic] Disposed of enemy model resources.`);
  }, []);

  React.useEffect(() => {
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('/libs/draco/gltf/');
    gltfLoader.current = new GLTFLoader();
    gltfLoader.current.setDRACOLoader(dracoLoader);

    return () => {
      dracoLoader.dispose();
      gltfLoader.current = null;
    };
  }, []);

  const loadEnemyModel = React.useCallback(async (type: 'carnivore' | 'herbivore', modelFileName?: string) => {
    const models = type === 'carnivore'
      ? ['Fox.glb', 'Husky.glb', 'ShibaInu.glb', 'Wolf.glb']
      : ['Alpaca.glb', 'Bull.glb', 'Cow.glb', 'Deer.glb', 'Donkey.glb', 'Horse_White.glb', 'Horse.glb', 'Stag.glb'];

    const randomModel = modelFileName || models[Math.floor(Math.random() * models.length)];
    const modelPath = `/models/Enemies-Animals/${type === 'carnivore' ? 'Carnivores' : 'Herbivores'}/${randomModel}`;
    const modelName = `enemy_${randomModel}`;

    try {
      const cachedData = await getModel(modelName);
      if (cachedData) {
        console.log(`[useEnemyLogic] Loading enemy model from IndexedDB: ${modelName}`);
        const gltf = await gltfLoader.current!.parseAsync(cachedData, modelPath);
        return { model: gltf.scene, animations: gltf.animations };
      } else {
        console.log(`[useEnemyLogic] Fetching enemy model from network: ${modelPath}`);
        const response = await fetch(modelPath);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const arrayBuffer = await response.arrayBuffer();
        await putModel(modelName, arrayBuffer);
        const gltf = await gltfLoader.current!.parseAsync(arrayBuffer, '');
        return { model: gltf.scene, animations: gltf.animations };
      }
    } catch (error) {
      console.error(`[useEnemyLogic] Error loading or caching model ${modelName}:`, error);
      console.log(`[useEnemyLogic] Falling back to placeholder.`);

      // Return a placeholder model (Red Box) to ensure guardian exists
      const placeholder = new THREE.Group();
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.5, 0.5),
        new THREE.MeshStandardMaterial({ color: 0xff0000 })
      );
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      placeholder.add(mesh);
      return { model: placeholder, animations: [] };
    }
  }, []);

  const preloadEnemyModels = React.useCallback(async () => {
    if (areModelsPreloaded.current) return;

    const carnivoreModels = ['Fox.glb', 'Husky.glb', 'ShibaInu.glb', 'Wolf.glb'];
    const herbivoreModels = ['Alpaca.glb', 'Bull.glb', 'Cow.glb', 'Deer.glb', 'Donkey.glb', 'Horse_White.glb', 'Horse.glb', 'Stag.glb'];

    const allModels = [
      ...carnivoreModels.map(m => ({ type: 'carnivore', name: m })),
      ...herbivoreModels.map(m => ({ type: 'herbivore', name: m }))
    ];

    for (const { type, name } of allModels) {
      const modelPath = `/models/Enemies-Animals/${type === 'carnivore' ? 'Carnivores' : 'Herbivores'}/${name}`;
      const modelName = `enemy_${name}`;
      if (!EnemyModelCache[modelName]) {
        try {
          console.log(`[useEnemyLogic] Preloading enemy model from: ${modelPath}`);
          const { model, animations } = await loadEnemyModel(type as 'carnivore' | 'herbivore', name);
          if (model) {
            EnemyModelCache[modelName] = { model, animations };
            console.log(`[useEnemyLogic] Successfully preloaded model: ${modelName}`);
          }
        } catch (error) {
          console.error(`[useEnemyLogic] Failed to preload model ${name} from ${modelPath}:`, error);
        }
      }
    }
    areModelsPreloaded.current = true;
  }, [loadEnemyModel]);

  const playAnimation = React.useCallback((enemy: EnemyData, newActionName: string) => {
    const newAction = enemy.actions[newActionName];
    const oldAction = enemy.currentAction;

    if (newAction && oldAction !== newAction) {
      if (oldAction) oldAction.fadeOut(CROSSFADE_DURATION);
      newAction.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).fadeIn(CROSSFADE_DURATION).play();
      enemy.currentAction = newAction;
    } else if (newAction && !oldAction) {
      newAction.reset().play();
      enemy.currentAction = newAction;
    }
  }, []);

  const loadEnemiesForChunk = React.useCallback(async (chunkX: number, chunkZ: number) => {
    const chunkKey = getChunkKey(chunkX, chunkZ);
    if (!sceneRef.current || loadedEnemyChunks.current.has(chunkKey) || loadingEnemyChunks.current.has(chunkKey)) {
      return;
    }

    loadingEnemyChunks.current.add(chunkKey);

    try {
      const scene = sceneRef.current;
      const chunkMinX = chunkX * CHUNK_SIZE;
      const chunkMinZ = chunkZ * CHUNK_SIZE;
      const chunkMaxX = chunkMinX + CHUNK_SIZE;
      const chunkMaxZ = chunkMinZ + CHUNK_SIZE;

      const coinsInChunk = coinMeshesRef.current.filter(coin => {
        const coinX = coin.position.x;
        const coinZ = coin.position.z;
        return coinX >= chunkMinX && coinX < chunkMaxX && coinZ >= chunkMinZ && coinZ < chunkMaxZ;
      });

      console.log(`[EnemyLogic] Loading enemies for chunk ${chunkKey}. Coins found: ${coinsInChunk.length}`);

      for (const coin of coinsInChunk) {
        for (let i = 0; i < ENEMIES_PER_COIN_CHUNK; i++) {
          const enemyType: 'carnivore' | 'herbivore' = Math.random() < 0.5 ? 'carnivore' : 'herbivore';
          try {
            const { model: loadedModel, animations: loadedAnimations } = await loadEnemyModel(enemyType);
            if (loadedModel) {
              // console.log(`[EnemyLogic] Spawning enemy for coin ${coin.uuid}`);
              const lod = new THREE.LOD();
              const enemyInstanceModel = loadedModel; // Use the loaded model as the high-detail model

              enemyInstanceModel.traverse((child: THREE.Object3D) => {
                if ((child as THREE.Mesh).isMesh) {
                  child.castShadow = true;
                  child.receiveShadow = true;
                }
              });

              enemyInstanceModel.scale.set(0.5, 0.5, 0.5); // Apply initial scale to the high-detail model
              lod.addLevel(enemyInstanceModel, 25); // Add high-detail model at distance 25

              // Placeholder for a lower detail model (e.g., a simple box or sphere)
              const lowDetailModel = new THREE.Mesh(
                new THREE.BoxGeometry(0.0001, 0.0001, 0.0001),
                new THREE.MeshBasicMaterial({ color: 0xff0000 })
              );
              lowDetailModel.scale.set(0.5, 0.5, 0.5); // Match scale
              lod.addLevel(lowDetailModel, 50); // Add low-detail model at 50 units distance

              const mixer = new THREE.AnimationMixer(enemyInstanceModel); // Mixer is tied to the high-detail model

              const actions: { [key: string]: THREE.AnimationAction } = {};
              loadedAnimations.forEach((clip: THREE.AnimationClip) => {
                const action = mixer.clipAction(clip);
                actions[clip.name] = action;

                const isIdleAnimation = ENEMY_ANIMATION_NAMES[enemyType.toUpperCase() as 'CARNIVORE' | 'HERBIVORE'].IDLE.includes(clip.name);
                if (clip.name === ENEMY_ANIMATION_NAMES[enemyType.toUpperCase() as 'CARNIVORE' | 'HERBIVORE'].WALK ||
                  clip.name === ENEMY_ANIMATION_NAMES[enemyType.toUpperCase() as 'CARNIVORE' | 'HERBIVORE'].GALLOP ||
                  isIdleAnimation) {
                  action.setLoop(THREE.LoopRepeat, Infinity);
                } else {
                  action.setLoop(THREE.LoopOnce, 1);
                  action.clampWhenFinished = true;
                }
              });
              Object.values(actions).forEach(action => action.stop());

              const enemyData: EnemyData = {
                uuid: THREE.MathUtils.generateUUID(), // Generate a unique ID for the enemy
                lod: lod,
                targetCoinId: coin.uuid,
                targetCoinPosition: coin.position.clone(),
                patrolCenter: coin.position.clone(),
                patrolTarget: new THREE.Vector3(),
                isIdling: false,
                idleTimer: 0,
                idleDuration: 0,
                isAttacking: false,
                isDying: false,
                deathTimer: 0,
                hasAppliedDeathEffect: false,
                isSinking: false,
                sinkingTimer: 0,
                initialDeathY: 0,
                mixer: mixer,
                animations: loadedAnimations,
                enemyType: enemyType,
                currentAction: null,
                actions: actions,
                chunkKey: getChunkKey(chunkX, chunkZ),
                highDetailModel: enemyInstanceModel,
                position: new THREE.Vector3(), // Initialize position
                rotation: new THREE.Euler(), // Initialize rotation
                scale: new THREE.Vector3(0.5, 0.5, 0.5), // Initialize scale
                type: 'enemy', // Set type
                visible: false, // Start invisible to prevent flickering (pop-in). Sync logic will enable it.
                isPooled: false, // Initialize isPooled
                isModelInstantiated: true, // Initialize isModelInstantiated
                lookAt: (target: THREE.Vector3) => {
                  // Delegate to the LOD object's lookAt method
                  lod.lookAt(target);
                },
              };

              // Force strict proximity (6.0 units offset - doubled from 1.5)
              const initialPatrolX = coin.position.x + 6.0;
              const initialPatrolZ = coin.position.z;

              enemyData.patrolTarget.set(initialPatrolX, coin.position.y, initialPatrolZ);

              // Force spawn exactly at the calculated patrol start position
              let enemyX = initialPatrolX;
              let enemyZ = initialPatrolZ;

              console.log(`[EnemyLogic] SPAWN: Enemy (${enemyX.toFixed(2)}, ${enemyZ.toFixed(2)}) linked to Coin (${coin.position.x.toFixed(2)}, ${coin.position.z.toFixed(2)})`);

              // Clamp to world bounds just in case, but keep relative position if possible
              const minSpawnX = WORLD_MIN_BOUND + ENEMY_PROTECTION_RADIUS_VAL;
              const maxSpawnX = WORLD_MAX_BOUND - ENEMY_PROTECTION_RADIUS_VAL;
              const minSpawnZ = WORLD_MIN_BOUND + ENEMY_PROTECTION_RADIUS_VAL;
              const maxSpawnZ = WORLD_MAX_BOUND - ENEMY_PROTECTION_RADIUS_VAL;

              enemyX = Math.max(minSpawnX, Math.min(maxSpawnX, enemyX));
              enemyZ = Math.max(minSpawnZ, Math.min(maxSpawnZ, enemyZ));

              let enemyY = 0;
              if (octreeRef.current) {
                enemyY = octreeRef.current.getGroundHeightAt(enemyX, enemyZ);
              }
              enemyData.lod.position.set(enemyX, enemyY, enemyZ); // Use enemyData.lod.position
              enemyData.position.copy(enemyData.lod.position); // Update the position property of EnemyData

              if (octreeRef.current) {
                const enemyBox = new THREE.Box3().setFromObject(enemyData.lod); // Use enemyData.lod for bounds
                octreeRef.current.insert({
                  id: `enemy_${enemyData.uuid}`, // Use uuid for id
                  bounds: enemyBox,
                  data: enemyData as unknown as GameObject
                });
              }
              enemyMeshesRef.current.push(enemyData);
              scene.add(enemyData.lod); // Add enemyData.lod to the scene

              const idleAnimations = ENEMY_ANIMATION_NAMES[enemyType.toUpperCase() as 'CARNIVORE' | 'HERBIVORE'].IDLE;
              const initialIdleActionName = idleAnimations[Math.floor(Math.random() * idleAnimations.length)];
              if (enemyData.actions[initialIdleActionName]) {
                enemyData.currentAction = enemyData.actions[initialIdleActionName];
                enemyData.currentAction.play();
              }
            }
          } catch (error) {
            console.error('Error loading enemy model:', error);
            continue;
          }
        }
      }
    } catch (error) {
      console.error(`[EnemyLogic] Critical error loading enemies for chunk ${chunkKey}:`, error);
    } finally {
      // CRITICAL: Always mark chunk as loaded to prevent infinite retry loops and duplicates
      // Even if it failed, we don't want to spam spawn requests.
      loadedEnemyChunks.current.add(chunkKey);
      loadingEnemyChunks.current.delete(chunkKey);
    }
  }, [sceneRef, coinMeshesRef, loadEnemyModel, octreeRef, dogModelRef]);

  const unloadEnemiesFromChunk = React.useCallback((chunkX: number, chunkZ: number) => {
    if (!sceneRef.current || !loadedEnemyChunks.current.has(getChunkKey(chunkX, chunkZ))) {
      return;
    }

    const scene = sceneRef.current;
    const chunkMinX = chunkX * CHUNK_SIZE;
    const chunkMinZ = chunkZ * CHUNK_SIZE;
    const chunkMaxX = chunkMinX + CHUNK_SIZE;
    const chunkMaxZ = chunkMinZ + CHUNK_SIZE;

    enemyMeshesRef.current = enemyMeshesRef.current.filter(enemy => {
      const enemyX = enemy.lod.position.x;
      const enemyZ = enemy.lod.position.z;

      if (enemyX >= chunkMinX && enemyX < chunkMaxX && enemyZ >= chunkMinZ && enemyZ < chunkMaxZ) {
        if (octreeRef.current) {
          const enemyBox = new THREE.Box3().setFromObject(enemy.lod);
          octreeRef.current.remove({
            id: `enemy_${enemy.uuid}`,
            bounds: enemyBox,
            data: enemy as unknown as GameObject
          });
        }
        enemy.mixer.stopAllAction();
        scene.remove(enemy.lod);
        // Dispose all models within the LOD
        enemy.lod.children.forEach(child => disposeEnemyModelResources(child));
        return false;
      }
      return true;
    });
    loadedEnemyChunks.current.delete(getChunkKey(chunkX, chunkZ));
    cleanupModelPool();
  }, [sceneRef, octreeRef, disposeEnemyModelResources, cleanupModelPool]);

  const initializeEnemies = React.useCallback(async () => {
    if (!sceneRef.current || !dogModelRef.current) return;

    if (!areModelsPreloaded.current) {
      await preloadEnemyModels();
    }

    const scene = sceneRef.current;

    enemyMeshesRef.current.forEach(enemy => {
      if (octreeRef.current) {
        const enemyBox = new THREE.Box3().setFromObject(enemy.lod);
        octreeRef.current.remove({ id: `enemy_${enemy.uuid}`, bounds: enemyBox, data: enemy as unknown as GameObject });
      }
      enemy.mixer.stopAllAction();
      scene.remove(enemy.lod);
      // Dispose all models within the LOD
      enemy.lod.children.forEach(child => disposeEnemyModelResources(child));
    });
    enemyMeshesRef.current = [];
    loadedEnemyChunks.current.clear();
    loadingEnemyChunks.current.clear(); // Clear loading state on reset

    const dogPosition = dogModelRef.current.position;
    const { chunkX: initialChunkX, chunkZ: initialChunkZ } = getChunkCoordinates(dogPosition.x, dogPosition.z);
    currentDogChunk.current = { chunkX: initialChunkX, chunkZ: initialChunkZ };

    for (let x = -RENDER_DISTANCE_CHUNKS; x <= RENDER_DISTANCE_CHUNKS; x++) {
      for (let z = -RENDER_DISTANCE_CHUNKS; z <= RENDER_DISTANCE_CHUNKS; z++) {
        await loadEnemiesForChunk(initialChunkX + x, initialChunkZ + z);
      }
    }
  }, [sceneRef, dogModelRef, octreeRef, loadEnemiesForChunk, disposeEnemyModelResources, preloadEnemyModels]);


  const updateEnemies = React.useCallback((delta: number) => {
    if (isPausedRef.current || !dogModelRef.current || !sceneRef.current || !cameraRef.current) return;

    const dog = dogModelRef.current;
    const dogPosition = dog.position;
    const camera = cameraRef.current;

    const { chunkX: currentX, chunkZ: currentZ } = getChunkCoordinates(dogPosition.x, dogPosition.z);

    // Debug logging for sync issues
    if (Math.random() < 0.01) { // Occasional log
      console.log(`[EnemyLogic] updateEnemies running. Loaded Coin Chunks: ${loadedCoinChunks.current.size}, Loaded Enemy Chunks: ${loadedEnemyChunks.current.size}`);
    }

    if (!currentDogChunk.current || currentX !== currentDogChunk.current.chunkX || currentZ !== currentDogChunk.current.chunkZ) {
      currentDogChunk.current = { chunkX: currentX, chunkZ: currentZ };

      const chunksToLoad = new Set<string>();
      for (let x = -RENDER_DISTANCE_CHUNKS; x <= RENDER_DISTANCE_CHUNKS; x++) {
        for (let z = -RENDER_DISTANCE_CHUNKS; z <= RENDER_DISTANCE_CHUNKS; z++) {
          chunksToLoad.add(getChunkKey(currentX + x, currentZ + z));
        }
      }

      loadedEnemyChunks.current.forEach(chunkKey => {
        if (!chunksToLoad.has(chunkKey)) {
          const [cx, cz] = chunkKey.split(',').map(Number);
          unloadEnemiesFromChunk(cx, cz);
        }
      });

      chunksToLoad.forEach(chunkKey => {
        // Log if we *should* load but can't because coins aren't ready
        if (!loadedEnemyChunks.current.has(chunkKey) && !loadedCoinChunks.current.has(chunkKey)) {
          // console.log(`[EnemyLogic] Waiting for coins in chunk ${chunkKey} before spawning enemies.`);
        }

        if (!loadedEnemyChunks.current.has(chunkKey) && loadedCoinChunks.current.has(chunkKey)) {
          const [cx, cz] = chunkKey.split(',').map(Number);
          console.log(`[EnemyLogic] Triggering enemy load for chunk ${chunkKey}`);
          loadEnemiesForChunk(cx, cz);
        }
      });
    } else {
      // Even if dog didn't move chunks, we must check if pending coin chunks finished loading!
      // The previous logic ONLY checked on chunk change. This is a BUG.
      // We need to continuously check local area for newly loaded coins.
      const chunksToLoad = new Set<string>();
      for (let x = -RENDER_DISTANCE_CHUNKS; x <= RENDER_DISTANCE_CHUNKS; x++) {
        for (let z = -RENDER_DISTANCE_CHUNKS; z <= RENDER_DISTANCE_CHUNKS; z++) {
          chunksToLoad.add(getChunkKey(currentX + x, currentZ + z));
        }
      }
      chunksToLoad.forEach(chunkKey => {
        if (!loadedEnemyChunks.current.has(chunkKey) && loadedCoinChunks.current.has(chunkKey)) {
          const [cx, cz] = chunkKey.split(',').map(Number);
          console.log(`[EnemyLogic] Triggering enemy load for chunk ${chunkKey} (Late Update)`);
          loadEnemiesForChunk(cx, cz);
        }
      });
    }

    camera.updateMatrixWorld();
    const frustum = new THREE.Frustum();
    const viewProjection = new THREE.Matrix4().multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse
    );
    frustum.setFromProjectionMatrix(viewProjection);

    let visibleEnemies = enemyMeshesRef.current;
    if (octreeRef.current) {
      const cameraBox = new THREE.Box3().setFromCenterAndSize(camera.position, new THREE.Vector3(50, 50, 50));
      visibleEnemies = octreeRef.current.query(cameraBox).map(obj => obj.data as unknown as EnemyData);
    }

    // Filter out enemies that have sunk and been disposed
    enemyMeshesRef.current = enemyMeshesRef.current.filter(enemy => {
      // If sinking and sunk far enough, filter it out
      if (enemy.isSinking && enemy.sinkingTimer <= 0 && enemy.lod.position.y < enemy.initialDeathY - 5) {
        return false; // Remove from the active enemy list
      }
      return true;
    });

    visibleEnemies.forEach(enemy => {
      // Defensive check for mixer
      if (!enemy.mixer) {
        //console.warn(`[useEnemyLogic] Skipping update for enemy ${enemy.uuid} because mixer is undefined.`);
        return;
      }
      enemy.mixer.update(delta);
      const enemyY = enemy.lod.position.y;

      // Strict Visibility Sync: Enemy is visible ONLY if its linked coin is visible
      const linkedCoin = coinMeshesRef.current.find(c => c.uuid === enemy.targetCoinId);

      if (linkedCoin) {
        // Inherit visibility from the guarded coin (handles distance culling and collection status)
        enemy.lod.visible = linkedCoin.visible;
      } else {
        // If no linked coin found (shouldn't happen, but safety net), hide enemy
        enemy.lod.visible = false;
      }

      enemy.visible = enemy.lod.visible; // Keep the EnemyData.visible property in sync

      // Handle sinking animation
      if (enemy.isSinking) {
        enemy.sinkingTimer -= delta;
        if (enemy.sinkingTimer <= 0) {
          // Start sinking animation
          const sinkSpeed = 0.5; // Units per second
          enemy.lod.position.y -= sinkSpeed * delta;
          enemy.position.copy(enemy.lod.position); // Keep EnemyData.position in sync
        }
        return; // Do not process other logic if sinking
      }

      if (enemy.isDying) {
        enemy.deathTimer -= delta;
        const deathAnimationName = ENEMY_ANIMATION_NAMES[enemy.enemyType.toUpperCase() as 'CARNIVORE' | 'HERBIVORE'].DEATH;
        if (enemy.currentAction?.getClip().name !== deathAnimationName && enemy.actions[deathAnimationName]) {
          playAnimation(enemy, deathAnimationName);
        }
        if (enemy.deathTimer <= 0 && !enemy.isSinking) {
          // Death animation finished, start sinking delay
          enemy.isSinking = true;
          enemy.sinkingTimer = ENEMY_SINKING_DELAY;
          enemy.initialDeathY = enemy.lod.position.y;
          enemy.lod.visible = true; // Keep visible during sinking delay
          enemy.visible = true; // Keep EnemyData.visible in sync
        }
        return; // Do not process other logic if dying
      }

      if (!enemy.lod.visible) { // Check enemy.lod.visible
        return;
      }

      const distanceToDog = dogPosition.distanceTo(enemy.lod.position); // Use enemy.lod.position
      const distanceToCoin = dogPosition.distanceTo(enemy.targetCoinPosition);

      // Find the protected coin by its unique ID
      const protectedCoin = coinMeshesRef.current.find((coin: CoinData) => coin.uuid === enemy.targetCoinId);

      // Enemy dies if its target coin has been collected (i.e., no longer exists in coinMeshesRef)
      if (!protectedCoin) {
        if (!enemy.isDying) {
          enemy.isDying = true;
          enemy.deathTimer = ENEMY_DEATH_DURATION;
          const deathAnimationName = ENEMY_ANIMATION_NAMES[enemy.enemyType.toUpperCase() as 'CARNIVORE' | 'HERBIVORE'].DEATH;
          if (enemy.actions[deathAnimationName]) {
            playAnimation(enemy, deathAnimationName);
          }
          onCoinCollected(); // Call the callback when the enemy's coin is collected
        }
      }

      let targetPosition = new THREE.Vector3();
      let currentAnimation = '';

      if (enemy.isAttacking) {
        currentAnimation = enemy.currentAction?.getClip().name || (enemy.enemyType === 'carnivore' ? 'Attack' : 'Attack_Kick');
      }

      if (!enemy.isDying && !enemy.isAttacking) {
        targetPosition = new THREE.Vector3();
        let isMoving = false;

        if (distanceToDog < ENEMY_ATTACK_DISTANCE) {
          targetPosition.copy(enemy.lod.position); // Use enemy.lod.position
          currentAnimation = enemy.enemyType === 'carnivore' ? 'Attack' : 'Attack_Kick';
          enemy.isAttacking = true;
          enemy.isIdling = false;
        } else if (distanceToCoin < ENEMY_CHASE_RADIUS) {
          targetPosition.copy(dogPosition);
          isMoving = true;
          currentAnimation = 'Gallop';
          enemy.isIdling = false;
        } else {
          if (enemy.isIdling) {
            enemy.idleTimer -= delta;
            if (enemy.idleTimer <= 0) {
              enemy.isIdling = false;
              const angle = Math.random() * Math.PI * 2;
              const radius = Math.random() * ENEMY_PROTECTION_RADIUS;
              const newPatrolX = enemy.patrolCenter.x + Math.cos(angle) * radius;
              const newPatrolZ = enemy.patrolTarget.z + Math.sin(angle) * radius;
              enemy.patrolTarget.set(newPatrolX, enemy.lod.position.y, newPatrolZ); // Use enemy.lod.position.y
              isMoving = true;
              currentAnimation = 'Walk';
            } else {
              currentAnimation = enemy.currentAction?.getClip().name || 'Idle';
            }
          } else if (enemy.lod.position.distanceTo(enemy.patrolTarget) < 1.0 || enemy.patrolTarget.lengthSq() === 0) { // Use enemy.lod.position
            enemy.isIdling = true;
            enemy.idleDuration = Math.random() * 5 + 3;
            enemy.idleTimer = enemy.idleDuration;
            const idleAnimations = ENEMY_ANIMATION_NAMES[enemy.enemyType.toUpperCase() as 'CARNIVORE' | 'HERBIVORE'].IDLE;
            currentAnimation = idleAnimations[Math.floor(Math.random() * idleAnimations.length)];
            isMoving = false;
          } else {
            targetPosition.copy(enemy.patrolTarget);
            isMoving = true;
            currentAnimation = 'Walk';
          }
        }

        const direction = new THREE.Vector3().subVectors(targetPosition, enemy.lod.position); // Use enemy.lod.position
        direction.y = 0;
        const movementThreshold = 0.001;

        if (isMoving && direction.lengthSq() > movementThreshold) {
          direction.normalize();
          const currentSpeed = currentAnimation === 'Gallop' ? ENEMY_SPEED * ENEMY_GALLOP_SPEED_MULTIPLIER : ENEMY_SPEED;
          enemy.lod.position.addScaledVector(direction, currentSpeed); // Use enemy.lod.position
          enemy.position.copy(enemy.lod.position); // Keep EnemyData.position in sync
          const lookAtTarget = new THREE.Vector3(targetPosition.x, enemyY, targetPosition.z);
          enemy.lod.lookAt(lookAtTarget); // Use enemy.lod.lookAt
        } else if (isMoving && direction.lengthSq() <= movementThreshold) {
          enemy.isIdling = true;
          enemy.idleDuration = Math.random() * 5 + 3;
          enemy.idleTimer = enemy.idleDuration;
          const idleAnimations = ENEMY_ANIMATION_NAMES[enemy.enemyType.toUpperCase() as 'CARNIVORE' | 'HERBIVORE'].IDLE;
          currentAnimation = idleAnimations[Math.floor(Math.random() * idleAnimations.length)];
        } else if (!isMoving) {
          const idleAnimations = ENEMY_ANIMATION_NAMES[enemy.enemyType.toUpperCase() as 'CARNIVORE' | 'HERBIVORE'].IDLE;
          if (!idleAnimations.includes(currentAnimation)) {
            currentAnimation = idleAnimations[Math.floor(Math.random() * idleAnimations.length)];
          }
        }
      }

      if (enemy.currentAction?.getClip().name !== currentAnimation && enemy.actions[currentAnimation]) {
        playAnimation(enemy, currentAnimation);
      }

      enemy.lod.position.y = enemyY; // Use enemy.lod.position.y
      enemy.position.copy(enemy.lod.position); // Keep EnemyData.position in sync

      const dogXZ = new THREE.Vector3(dog.position.x, 0, dog.position.z);
      const enemyXZ = new THREE.Vector3(enemy.lod.position.x, 0, enemy.lod.position.z); // Use enemy.lod.position
      const distanceXZToDog = dogXZ.distanceTo(enemyXZ);

      // Update LOD levels based on distance to camera
      enemy.lod.update(camera); // Use enemy.lod.update

      if (distanceXZToDog < ENEMY_DEATH_TRIGGER_DISTANCE && !enemy.isDying) {
        enemy.isDying = true;
        enemy.deathTimer = ENEMY_DEATH_DURATION;
        currentAnimation = ENEMY_ANIMATION_NAMES[enemy.enemyType.toUpperCase() as 'CARNIVORE' | 'HERBIVORE'].DEATH;
        if (enemy.actions[currentAnimation]) {
          playAnimation(enemy, currentAnimation);
        }
        if (!enemy.hasAppliedDeathEffect) {
          if (isShieldActiveRef.current) {
          } else if (protectionBottleCountRef.current > 0) {
            protectionBottleCountRef.current--;
            onConsumeProtectionBottle();
            if (dogModelRef.current) {
              addFloatingEffect(
                dogModelRef.current.position.clone(),
                'Bottle',
                -1, // Assuming a penalty of -1 Bottle
                'followTarget',
                true, // Use 3D model for Bottle
                undefined, // targetPosition is not needed for 'followTarget'
                dogModelRef.current // Pass the dog's mesh as targetMesh
              );
            }
          } else {
            onEnemyCollisionPenalty();
            if (dogModelRef.current) {
              addFloatingEffect(
                dogModelRef.current.position.clone(),
                'penalty', // Change effectType to 'penalty'
                -ENEMY_COLLISION_PENALTY_USDT, // Pass the actual penalty amount as negative
                'followTarget',
                false, // Use 2D text for penalty, not 3D model
                undefined, // targetPosition is not needed for 'followTarget'
                dogModelRef.current // Pass the dog's mesh as targetMesh
              );
            }
          }
          enemy.hasAppliedDeathEffect = true;
        }
      } else if (distanceXZToDog < ENEMY_ATTACK_DISTANCE && !enemy.isAttacking && !enemy.isDying) {
        targetPosition.copy(enemy.lod.position);
        enemy.isAttacking = true;
        enemy.isIdling = false;

        if (enemy.enemyType === 'herbivore') {
          const lookAtTarget = new THREE.Vector3(dogPosition.x, enemyY, dogPosition.z);
          enemy.lod.lookAt(lookAtTarget);
          enemy.lod.rotation.y += Math.PI;
          currentAnimation = 'Attack_Kick';
        } else {
          currentAnimation = 'Attack';
        }

        if (enemy.actions[currentAnimation]) {
          playAnimation(enemy, currentAnimation);

          enemy.mixer.removeEventListener('finished', onAttackAnimationFinished);
          enemy.mixer.addEventListener('finished', (e) => {
            const finishedClipName = e.action.getClip().name;
            const attackAnimationName = enemy.enemyType === 'carnivore' ? 'Attack' : 'Attack_Kick';

            if (finishedClipName === attackAnimationName) {
              enemy.isDying = true;
              enemy.deathTimer = ENEMY_DEATH_DURATION;
              playAnimation(enemy, ENEMY_ANIMATION_NAMES[enemy.enemyType.toUpperCase() as 'CARNIVORE' | 'HERBIVORE'].DEATH);
              enemy.isAttacking = false;
              enemy.isSinking = false; // Ensure sinking is false when death animation starts
              enemy.sinkingTimer = 0; // Reset sinking timer
              enemy.initialDeathY = 0; // Reset initial death Y

              if (!enemy.hasAppliedDeathEffect) {
                if (isShieldActiveRef.current) {
                } else if (protectionBottleCountRef.current > 0) {
                  protectionBottleCountRef.current--;
                  onConsumeProtectionBottle();
                  if (dogModelRef.current) {
                    addFloatingEffect(
                      dogModelRef.current.position.clone(),
                      'Bottle',
                      -1, // Assuming a penalty of -1 Bottle
                      'followTarget',
                      true, // Use 3D model for Bottle
                      undefined, // targetPosition is not needed for 'followTarget'
                      dogModelRef.current // Pass the dog's mesh as targetMesh
                    );
                  }
                } else {
                  onEnemyCollisionPenalty();
                  if (dogModelRef.current) {
                    addFloatingEffect(
                      dogModelRef.current.position.clone(),
                      'penalty', // Change effectType to 'penalty'
                      -ENEMY_COLLISION_PENALTY_USDT, // Pass the actual penalty amount as negative
                      'followTarget',
                      false, // Use 2D text for penalty, not 3D model
                      undefined, // targetPosition is not needed for 'followTarget'
                      dogModelRef.current // Pass the dog's mesh as targetMesh
                    );
                  }
                }
                enemy.hasAppliedDeathEffect = true;
              }
            }
          });
        }
      }
    });
  }, [
    dogModelRef,
    isShieldActiveRef,
    onConsumeProtectionBottle,
    onEnemyCollisionPenalty,
    isPausedRef,
    coinMeshesRef,
    onAttackAnimationFinished,
    playAnimation,
    cameraRef,
    octreeRef,
    sceneRef,
    loadEnemiesForChunk,
    unloadEnemiesFromChunk,
    addFloatingEffect,
    onCoinCollected,
    protectionBottleCountRef
  ]);

  const resetEnemies = React.useCallback(() => {
    initializeEnemies();
  }, [initializeEnemies]);

  return {
    initializeEnemies,
    updateEnemies,
    resetEnemies,
    enemyMeshesRef,
  };
};
