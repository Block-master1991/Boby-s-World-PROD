'use client';

import * as React from 'react';
import * as THREE from 'three';
import type { MutableRefObject } from 'react';
import { GLTFLoader, GLTF } from 'three/examples/jsm/loaders/GLTFLoader';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils';
import type { Octree } from '@/lib/Octree';
import { getModel, putModel } from '../lib/indexedDB';
import { CHUNK_SIZE, RENDER_DISTANCE_CHUNKS, getChunkCoordinates, getChunkKey } from '../lib/chunkUtils';
import { WORLD_MIN_BOUND, WORLD_MAX_BOUND, ENEMY_PROTECTION_RADIUS_VAL, DOG_SPAWN_PROTECTION_RADIUS, ENEMY_COLLISION_PENALTY_USDT } from '../lib/constants'; // Import ENEMY_COLLISION_PENALTY_USDT
import { useDynamicModelLoader } from './useDynamicModelLoader'; // Import useDynamicModelLoader
import type { CoinData } from './useCoinLogic'; // Import CoinData
import type { GameObject, BaseGameObject } from '@/types/game';
import { getDevicePerformanceConfig } from '@/lib/utils';
import { logger } from '@/utils/logger';

// New: Enemy Model Cache with loading promises to prevent race conditions
const EnemyModelCache: { [key: string]: { model: THREE.Group; animations: THREE.AnimationClip[] } } = {};
const EnemyModelPromises: { [key: string]: Promise<{ model: THREE.Group; animations: THREE.AnimationClip[] } | undefined> } = {};
let areModelsPreloaded = false;

const ENEMY_SPEED = 1.0; // Units per second (Reduced for realistic patrol)
const ENEMY_GALLOP_SPEED_MULTIPLIER = 2; // Increased to maintain 4.5 chase speed
const ENEMY_ATTACK_DISTANCE = 1.5;
const ENEMY_DEATH_TRIGGER_DISTANCE = 0.5;
const ENEMY_DEATH_DURATION = 1.5;
const ENEMY_SINKING_DELAY = 1.0; // Reduced to 1 second delay before sinking starts
const ENEMY_PROTECTION_RADIUS = 8;
const ENEMY_CHASE_RADIUS = 16;
const CROSSFADE_DURATION = 0.2;
const VISIBLE_ENEMY_DISTANCE = 220; // Expanded to 220 to match coin visibility using existing chunks
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
  const pendingCoinIds = React.useRef<Set<string>>(new Set()); // New: Track coins currently being processed for spawns
  const reconciliationTimer = React.useRef<number>(0); // New: Timer for periodic reconciliation
  const frameCountRef = React.useRef<number>(0); // Target for animation throttling
  const currentDogChunk = React.useRef<{ chunkX: number; chunkZ: number } | null>(null);

  // SPAWN QUEUE: Throttled loading for distant enemies
  const spawnQueueRef = React.useRef<{ coin: CoinData; chunkKey: string; distanceToDog: number }[]>([]);

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
    // logger.log(`[useEnemyLogic] Disposed of enemy model resources.`);
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
        // logger.log(`[useEnemyLogic] Loading enemy model from IndexedDB: ${modelName}`);
        const gltf = await gltfLoader.current!.parseAsync(cachedData, modelPath);
        return { model: gltf.scene, animations: gltf.animations };
      } else {
        // logger.log(`[useEnemyLogic] Fetching enemy model from network: ${modelPath}`);
        const response = await fetch(modelPath);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const arrayBuffer = await response.arrayBuffer();
        await putModel(modelName, arrayBuffer);
        const gltf = await gltfLoader.current!.parseAsync(arrayBuffer, '');
        return { model: gltf.scene, animations: gltf.animations };
      }
    } catch (error) {
      logger.error(`[useEnemyLogic] Error loading or caching model ${modelName}:`, error);
      logger.log(`[useEnemyLogic] Falling back to placeholder.`);

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
    if (areModelsPreloaded) return;

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
          logger.log(`[useEnemyLogic] Preloading enemy model from: ${modelPath}`);
          const { model, animations } = await loadEnemyModel(type as 'carnivore' | 'herbivore', name);
          if (model) {
            // Update matrix world to ensure proper initialization before caching
            model.updateMatrixWorld(true);
            EnemyModelCache[modelName] = { model, animations };
            logger.log(`[useEnemyLogic] Successfully preloaded model: ${modelName}`);
          }
        } catch (error) {
          logger.error(`[useEnemyLogic] Failed to preload model ${name} from ${modelPath}:`, error);
        }
      }
    }
    areModelsPreloaded = true;
    logger.log('[useEnemyLogic] Preload completed! Cache now has', Object.keys(EnemyModelCache).length, 'models');
  }, [loadEnemyModel]);

  // Preload enemy models when component mounts
  React.useEffect(() => {
    logger.log('[useEnemyLogic] Component mounted, starting preload...');
    preloadEnemyModels();
  }, [preloadEnemyModels]);

  const handleNoPenalty = React.useCallback(() => {
    // --- NO PENALTY: Shield is active and protects the player ---
    logger.debug('[useEnemyLogic] Action intercepted: Shield is active. No penalty applied.');
  }, []);

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

  const spawnEnemyForCoin = React.useCallback(async (coin: CoinData, chunkKey: string) => {
    // Double check: if coin is already collected or guardian already exists/pending, skip
    if (coin.collected || pendingCoinIds.current.has(coin.uuid)) return;

    // Check if an enemy already exists for this coin
    const existingEnemy = enemyMeshesRef.current.find(e => e.targetCoinId === coin.uuid);
    if (existingEnemy) return;

    pendingCoinIds.current.add(coin.uuid);

    // We only spawn 1 enemy per coin as per requirement "with *each* coin an enemy"
    // (The previous code had a loop for ENEMIES_PER_COIN_CHUNK which was 1 anyway)

    const enemyType: 'carnivore' | 'herbivore' = Math.random() < 0.5 ? 'carnivore' : 'herbivore';

    try {
      const models = enemyType === 'carnivore'
        ? ['Fox.glb', 'Husky.glb', 'ShibaInu.glb', 'Wolf.glb']
        : ['Alpaca.glb', 'Bull.glb', 'Cow.glb', 'Deer.glb', 'Donkey.glb', 'Horse_White.glb', 'Horse.glb', 'Stag.glb'];
      const randomModel = models[Math.floor(Math.random() * models.length)];
      const modelName = `enemy_${randomModel}`;

      let loadedModel: THREE.Group | undefined = undefined;
      let loadedAnimations: THREE.AnimationClip[] | undefined = undefined;

      if (EnemyModelCache[modelName]) {
        try {
          loadedModel = SkeletonUtils.clone(EnemyModelCache[modelName].model) as THREE.Group;
          loadedModel.updateMatrixWorld(true);
          loadedAnimations = EnemyModelCache[modelName].animations;
        } catch (error) {
          const { model, animations } = await loadEnemyModel(enemyType, randomModel);
          loadedModel = model;
          loadedAnimations = animations;
        }
      } else {
        const { model, animations } = await loadEnemyModel(enemyType, randomModel);
        if (model) {
          // updateMatrixWorld is crucial for SkeletonUtils to work correctly
          model.updateMatrixWorld(true);

          // Cache the PRISTINE model
          EnemyModelCache[modelName] = { model: model, animations };

          // Use a proper Skeleton clone for the current instance
          loadedModel = SkeletonUtils.clone(model) as THREE.Group;
          loadedAnimations = animations;
        }
      }

      if (!loadedModel || !loadedAnimations) {
        logger.error(`[EnemyLogic] ❌ FAILED to spawn enemy for coin ${coin.uuid}`);
        return;
      }

      // --- Spawn Logic (Same as before) ---
      const lod = new THREE.LOD();
      const enemyInstanceModel = loadedModel;

      enemyInstanceModel.traverse((child: THREE.Object3D) => {
        if ((child as THREE.Mesh).isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });

      enemyInstanceModel.scale.set(0.5, 0.5, 0.5);
      lod.addLevel(enemyInstanceModel, 0); // High Detail from 0 to VISIBLE_ENEMY_DISTANCE

      const lowDetailModel = new THREE.Mesh(
        new THREE.BoxGeometry(0.0001, 0.0001, 0.0001),
        new THREE.MeshBasicMaterial({ color: 0xff0000 })
      );
      lowDetailModel.scale.set(0.5, 0.5, 0.5);
      lod.addLevel(lowDetailModel, VISIBLE_ENEMY_DISTANCE); // Invisible beyond this range

      const mixer = new THREE.AnimationMixer(enemyInstanceModel);
      const actions: { [key: string]: THREE.AnimationAction } = {};

      // ... Animation setup ...
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

      // CALCULATE SPAWN POSITION FROM WORKER DATA
      let enemyX = coin.position.x + 6.0; // Default fallback
      let enemyZ = coin.position.z;

      const chunkManager = sceneRef.current?.getObjectByName('ChunkManager') as any;
      if (chunkManager) {
        const gameplayData = chunkManager.getGameplaySpawns(chunkKey);
        if (gameplayData) {
          // Find which coin index this is
          // We compare positions with a small epsilon
          let coinIndex = -1;
          for (let i = 0; i < gameplayData.coinSpawns.length; i++) {
            const sp = gameplayData.coinSpawns[i].position;
            const dx = Math.abs(sp[0] - coin.position.x);
            const dz = Math.abs(sp[2] - coin.position.z);
            if (dx < 0.1 && dz < 0.1) {
              coinIndex = i;
              break;
            }
          }

          if (coinIndex !== -1) {
            // Find enemy spawn for this coin index
            const enemySpawn = gameplayData.enemySpawns.find((e: any) => e.coinIndex === coinIndex);
            if (enemySpawn) {
              enemyX = enemySpawn.position[0];
              enemyZ = enemySpawn.position[2];
              logger.log(`[EnemyLogic] Using worker spawn for enemy at ${enemyX.toFixed(2)}, ${enemyZ.toFixed(2)}`);
            }
          }
        }
      }

      const enemyData: EnemyData = {
        uuid: THREE.MathUtils.generateUUID(),
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
        chunkKey: chunkKey,
        highDetailModel: enemyInstanceModel,
        position: new THREE.Vector3(),
        rotation: new THREE.Euler(),
        scale: new THREE.Vector3(0.5, 0.5, 0.5),
        type: 'enemy',
        visible: true, // Visible by default if coin is visible
        isPooled: false,
        isModelInstantiated: true,
        lookAt: (target: THREE.Vector3) => {
          lod.lookAt(target);
        },
      };

      // Set initial patrol target to current spawn
      enemyData.patrolTarget.set(enemyX, coin.position.y, enemyZ);

      // Clamp (Double check bounds, though worker does this)
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
      enemyData.lod.position.set(enemyX, enemyY, enemyZ);
      enemyData.position.copy(enemyData.lod.position);

      if (octreeRef.current) {
        const enemyBox = new THREE.Box3().setFromObject(enemyData.lod);
        octreeRef.current.insert({
          id: `enemy_${enemyData.uuid}`,
          bounds: enemyBox,
          data: enemyData as unknown as GameObject
        });
      }

      enemyMeshesRef.current.push(enemyData);
      if (sceneRef.current) {
        sceneRef.current.add(enemyData.lod);
      }

      // Start idle animation
      const idleAnimations = ENEMY_ANIMATION_NAMES[enemyType.toUpperCase() as 'CARNIVORE' | 'HERBIVORE'].IDLE;
      const initialIdleActionName = idleAnimations[Math.floor(Math.random() * idleAnimations.length)];
      if (enemyData.actions[initialIdleActionName]) {
        enemyData.currentAction = enemyData.actions[initialIdleActionName];
        enemyData.currentAction.play();
      }
    } catch (error) {
      logger.error('Error spawning enemy:', error);
    } finally {
      pendingCoinIds.current.delete(coin.uuid);
    }
  }, [sceneRef, octreeRef, loadEnemyModel]);

  const loadEnemiesForChunk = React.useCallback(async (chunkX: number, chunkZ: number) => {
    const chunkKey = getChunkKey(chunkX, chunkZ);
    if (!sceneRef.current || loadedEnemyChunks.current.has(chunkKey) || loadingEnemyChunks.current.has(chunkKey)) {
      return;
    }

    loadingEnemyChunks.current.add(chunkKey);

    try {
      const chunkMinX = chunkX * CHUNK_SIZE;
      const chunkMinZ = chunkZ * CHUNK_SIZE;
      const chunkMaxX = chunkMinX + CHUNK_SIZE;
      const chunkMaxZ = chunkMinZ + CHUNK_SIZE;

      const coinsInChunk = coinMeshesRef.current.filter(coin => {
        const coinX = coin.position.x;
        const coinZ = coin.position.z;
        return coinX >= chunkMinX && coinX < chunkMaxX && coinZ >= chunkMinZ && coinZ < chunkMaxZ;
      });

      logger.log(`[EnemyLogic] Loading enemies for chunk ${chunkKey}. Coins found: ${coinsInChunk.length}`);

      const dogPosition = dogModelRef.current?.position || new THREE.Vector3(0, 0, 0);

      // QUEUE SYSTEM: Instead of spawning immediately, add to queue
      coinsInChunk.forEach(coin => {
        const distanceToDog = dogPosition.distanceTo(coin.position);
        spawnQueueRef.current.push({ coin, chunkKey, distanceToDog });
      });
      
      // Sort queue by distance (closest first) to ensure immediate threats appear first
      spawnQueueRef.current.sort((a, b) => a.distanceToDog - b.distanceToDog);

    } catch (error) {
      logger.error(`[EnemyLogic] Critical error loading enemies for chunk ${chunkKey}:`, error);
    } finally {
      loadedEnemyChunks.current.add(chunkKey);
      loadingEnemyChunks.current.delete(chunkKey);
    }
  }, [sceneRef, coinMeshesRef]); // Removed spawnEnemyForCoin dependency as it's not called directly anymore

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

    // Clean up pending spawns for this chunk from the queue
    const targetChunkKey = getChunkKey(chunkX, chunkZ);
    spawnQueueRef.current = spawnQueueRef.current.filter(item => item.chunkKey !== targetChunkKey);

    loadedEnemyChunks.current.delete(targetChunkKey);
    cleanupModelPool();
  }, [sceneRef, octreeRef, disposeEnemyModelResources, cleanupModelPool]);

  const initializeEnemies = React.useCallback(async () => {
    if (!sceneRef.current || !dogModelRef.current) return;

    // CRITICAL: Always preload models before spawning enemies
    if (!areModelsPreloaded) {
      logger.log('[initializeEnemies] Waiting for enemy models to preload...');
      await preloadEnemyModels();
      logger.log('[initializeEnemies] Preload complete! Cache now has', Object.keys(EnemyModelCache).length, 'models');
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

    const perfConfig = getDevicePerformanceConfig();
    const dog = dogModelRef.current;
    const dogPosition = dog.position;
    const camera = cameraRef.current;

    const { chunkX: currentX, chunkZ: currentZ } = getChunkCoordinates(dogPosition.x, dogPosition.z);

    // Debug logging for sync issues
    if (Math.random() < 0.01) { // Occasional log
      logger.gameLoop(`[EnemyLogic] updateEnemies running. Loaded Coin Chunks: ${loadedCoinChunks.current.size}, Loaded Enemy Chunks: ${loadedEnemyChunks.current.size}`);
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
          // logger.log(`[EnemyLogic] Waiting for coins in chunk ${chunkKey} before spawning enemies.`);
        }

        if (!loadedEnemyChunks.current.has(chunkKey) && loadedCoinChunks.current.has(chunkKey)) {
          const [cx, cz] = chunkKey.split(',').map(Number);
          logger.log(`[EnemyLogic] Triggering enemy load for chunk ${chunkKey}`);
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
        if (!loadedEnemyChunks.current.has(chunkKey) &&
          !loadingEnemyChunks.current.has(chunkKey) &&
          loadedCoinChunks.current.has(chunkKey)) {
          const [cx, cz] = chunkKey.split(',').map(Number);
          logger.log(`[EnemyLogic] Triggering enemy load for chunk ${chunkKey} (Late Update)`);
          loadEnemiesForChunk(cx, cz);
        }
      });
    }

    // --- RECONCILIATION ---
    // Periodically checks if there are any coins that don't have guardians
    // This is the "healing" mechanism to ensure every coin has an enemy
    const RECONCILIATION_INTERVAL = 1.0; // Run every 1 second
    reconciliationTimer.current += delta;
    if (reconciliationTimer.current > RECONCILIATION_INTERVAL) {
      reconciliationTimer.current = 0;

      const guardedCoinIds = new Set<string>();
      enemyMeshesRef.current.forEach(enemy => {
        if (enemy.targetCoinId) guardedCoinIds.add(enemy.targetCoinId);
      });

      // Find visible coins that lack a guardian and aren't already pending
      const coinsNeedingGuardians = coinMeshesRef.current.filter(coin =>
        !coin.collected &&
        !guardedCoinIds.has(coin.uuid) &&
        !pendingCoinIds.current.has(coin.uuid)
      );

      if (coinsNeedingGuardians.length > 0) {
        logger.log(`[EnemyLogic] Reconciliation: Found ${coinsNeedingGuardians.length} unguarded coins. Spawning enemies...`);
        coinsNeedingGuardians.forEach(coin => {
          // Determine chunk key for this coin
          const { chunkX, chunkZ } = getChunkCoordinates(coin.position.x, coin.position.z);
          const chunkKey = getChunkKey(chunkX, chunkZ);
          spawnEnemyForCoin(coin, chunkKey);
        });
      }
    }

    camera.updateMatrixWorld();
    const frustum = new THREE.Frustum();
    const viewProjection = new THREE.Matrix4().multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse
    );
    frustum.setFromProjectionMatrix(viewProjection);

    // EXPANDED OCTREE QUERY: 150 units to match VISIBLE_ENEMY_DISTANCE
    let visibleEnemies = enemyMeshesRef.current;
    if (octreeRef.current) {
      const queryBox = new THREE.Box3().setFromCenterAndSize(
        camera.position, 
        new THREE.Vector3(VISIBLE_ENEMY_DISTANCE * 2, 50, VISIBLE_ENEMY_DISTANCE * 2)
      );
      visibleEnemies = octreeRef.current.query(queryBox).map(obj => obj.data as unknown as EnemyData);
    }

    // Update frame counter for throttling
    frameCountRef.current = (frameCountRef.current + 1) % 60;

    // Filter out enemies that have sunk and been disposed
    enemyMeshesRef.current = enemyMeshesRef.current.filter(enemy => {
      if (enemy.isSinking && enemy.sinkingTimer <= 0 && enemy.lod.position.y < enemy.initialDeathY - 5) {
        return false;
      }
      return true;
    });

    visibleEnemies.forEach(enemy => {
      if (!enemy.mixer) return;

      const distanceToDog = dogPosition.distanceTo(enemy.lod.position);
      
      // TIERED ANIMATION SYSTEM
      let shouldUpdateAnimation = true;

      // 1. Frustum Culling: Only update animation if the enemy is actually on screen (Frustum Check)
      // Exception: Keep updates for very close enemies (Tier 1) even if slightly off-screen for sound/feel
      const isInFrustum = frustum.containsPoint(enemy.lod.position);
      
      if (distanceToDog < 60) {
        // Tier 1: Very close (0-60) - Full animation if in frustum, or if very close even if slightly off
        shouldUpdateAnimation = isInFrustum || distanceToDog < 15;
      } else if (distanceToDog < 150) {
        // Tier 2: Mid-range (60-150) - Only if in frustum AND throttle based on mobile/performance
        if (!isInFrustum) {
          shouldUpdateAnimation = false;
        } else {
          // Throttle: Mobile updates every 3rd frame, PC every 2nd frame at this distance
          const throttleRate = perfConfig.isMobile ? 3 : 2;
          shouldUpdateAnimation = (frameCountRef.current % throttleRate === 0);
        }
      } else {
        // Tier 3: Far-range (150-220) [NEW] - Ultra-Low Mode
        // Only update if in frustum AND strictly throttled to ~10fps (every 6th frame)
        if (!isInFrustum) {
          shouldUpdateAnimation = false;
        } else {
           shouldUpdateAnimation = (frameCountRef.current % 6 === 0);
        }
      }

      // Performance Overrides
      if (perfConfig.isMobile && perfConfig.performanceLevel === 'low' && distanceToDog > 40) {
        shouldUpdateAnimation = false;
      }

      if (shouldUpdateAnimation) {
        // Calculate delta multiplier based on tier to maintain correct speed despite throttling
        let deltaMultiplier = 1;
        if (distanceToDog > 150) {
           deltaMultiplier = 6; // Tier 3
        } else if (distanceToDog > 60) {
           deltaMultiplier = perfConfig.isMobile ? 3 : 2; // Tier 2
        }
        
        enemy.mixer.update(delta * deltaMultiplier); 
      }

      const enemyY = enemy.lod.position.y;
      const linkedCoin = coinMeshesRef.current.find(c => c.uuid === enemy.targetCoinId);

      if (linkedCoin) {
        enemy.lod.visible = linkedCoin.visible;
      } else {
        enemy.lod.visible = true;
      }

      enemy.visible = enemy.lod.visible;

      // Handle sinking animation
      if (enemy.isSinking) {
        enemy.sinkingTimer -= delta;
        enemy.lod.position.y -= delta * 0.5; // Sink speed
        if (enemy.sinkingTimer <= 0) {
          // Will be removed by the filter at start of next frame
        }
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
          // Do not call onCoinCollected() here as it is already handled by useCoinLogic when the coin is removed
          // onCoinCollected(); 
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
        let moveSpeed = ENEMY_SPEED; // Default to Walk Speed

        if (distanceToDog < ENEMY_ATTACK_DISTANCE) {
          targetPosition.copy(enemy.lod.position); // Use enemy.lod.position
          currentAnimation = enemy.enemyType === 'carnivore' ? 'Attack' : 'Attack_Kick';
          enemy.isAttacking = true;
          enemy.isIdling = false;
        } else if (distanceToCoin < ENEMY_CHASE_RADIUS) {
          // CHASE MODE
          targetPosition.copy(dogPosition);
          isMoving = true;
          currentAnimation = 'Gallop';
          moveSpeed = ENEMY_SPEED * ENEMY_GALLOP_SPEED_MULTIPLIER; // Explicitly set Gallop Speed
          enemy.isIdling = false;
        } else {
          // PATROL MODE
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
              moveSpeed = ENEMY_SPEED; // Explicitly set Walk Speed
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
            moveSpeed = ENEMY_SPEED; // Explicitly set Walk Speed
          }
        }

        const direction = new THREE.Vector3().subVectors(targetPosition, enemy.lod.position); // Use enemy.lod.position
        direction.y = 0;
        const movementThreshold = 0.001;

        if (isMoving && direction.lengthSq() > movementThreshold) {
          direction.normalize();
          // Use the explicitly calculated moveSpeed
          enemy.lod.position.addScaledVector(direction, moveSpeed * delta); // Use enemy.lod.position
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
            handleNoPenalty();
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
                    handleNoPenalty();
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

    // SPAWN QUEUE PROCESSOR: Process a few enemies each frame to avoid lag
    if (spawnQueueRef.current.length > 0) {
        // Sort constantly to ensure we always pick the closest ones even if player moved
        // Optimization: Sort only every 10 frames or so if queue is huge, but usually fine here
        // spawnQueueRef.current.sort((a, b) => a.distanceToDog - b.distanceToDog); 
        
        // Process up to 3 enemies per frame
        const itemsToProcess = spawnQueueRef.current.splice(0, 3);
        itemsToProcess.forEach(item => {
           // Verify coin is still valid/needed
           if (!item.coin.collected) {
             spawnEnemyForCoin(item.coin, item.chunkKey);
           }
        });
    }
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
    protectionBottleCountRef,
    spawnEnemyForCoin
  ]);

  // Event-Driven Spawn: Listen for terrain ready signals
  React.useEffect(() => {
    const chunkManager = sceneRef.current?.getObjectByName('ChunkManager');
    if (!chunkManager) return;

    const onChunkLoaded = (event: any) => {
      if (event.checkChunkKey) {
        const parts = event.checkChunkKey.split(',');
        const x = parseInt(parts[0]);
        const z = parseInt(parts[1]);
        loadEnemiesForChunk(x, z);
      }
    };

    chunkManager.addEventListener('chunk-loaded' as any, onChunkLoaded);

    // CATCH-UP: Check manually for keys that might have loaded before we listened
    // Use currentDogChunk logic if available, or assume 0,0 for start
    // Note: useEnemyLogic doesn't seem to expose 'currentDogChunk' ref directly in this scope?
    // It uses 'dogModelRef' to get position.
    // We can calc startX/Z from dogModelRef if valid, else 0.
    let startX = 0;
    let startZ = 0;
    if (dogModelRef.current) {
      const coords = getChunkCoordinates(dogModelRef.current.position.x, dogModelRef.current.position.z);
      startX = coords.chunkX;
      startZ = coords.chunkZ;
    }

    for (let x = -RENDER_DISTANCE_CHUNKS; x <= RENDER_DISTANCE_CHUNKS; x++) {
      for (let z = -RENDER_DISTANCE_CHUNKS; z <= RENDER_DISTANCE_CHUNKS; z++) {
        loadEnemiesForChunk(startX + x, startZ + z);
      }
    }

    return () => {
      chunkManager.removeEventListener('chunk-loaded' as any, onChunkLoaded);
    };
  }, [sceneRef, loadEnemiesForChunk, dogModelRef]);

  const resetEnemies = React.useCallback(() => {
    initializeEnemies();
  }, [initializeEnemies]);

  const forceLoadAreaEnemies = React.useCallback(async (centerX: number, centerZ: number) => {
    if (!sceneRef.current) return;

    const chunksToLoad = new Set<string>();
    for (let x = -RENDER_DISTANCE_CHUNKS; x <= RENDER_DISTANCE_CHUNKS; x++) {
      for (let z = -RENDER_DISTANCE_CHUNKS; z <= RENDER_DISTANCE_CHUNKS; z++) {
        chunksToLoad.add(getChunkKey(centerX + x, centerZ + z));
      }
    }

    const loadPromises = Array.from(chunksToLoad).map(async (chunkKey) => {
      if (!loadedEnemyChunks.current.has(chunkKey) && !loadingEnemyChunks.current.has(chunkKey)) {
        const [cx, cz] = chunkKey.split(',').map(Number);
        await loadEnemiesForChunk(cx, cz);
      }
    });

    await Promise.all(loadPromises);
    logger.log(`Force loaded enemies for ${chunksToLoad.size} chunks around ${centerX}, ${centerZ}`);
  }, [sceneRef, loadEnemiesForChunk]);

  return {
    initializeEnemies,
    updateEnemies,
    resetEnemies,
    forceLoadAreaEnemies, // Expose force load function
    enemyMeshesRef,
  };
};
