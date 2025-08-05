'use client';

import * as React from 'react';
import * as THREE from 'three';
import type { MutableRefObject } from 'react';
import { GLTFLoader, GLTF } from 'three/examples/jsm/loaders/GLTFLoader';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader';
import { Octree, OctreeObject } from '@/lib/Octree';
import { getModel, putModel } from '../lib/indexedDB';
import { CHUNK_SIZE, RENDER_DISTANCE_CHUNKS, getChunkCoordinates, getChunkKey } from '../lib/chunkUtils';
import { WORLD_MIN_BOUND, WORLD_MAX_BOUND, ENEMY_PROTECTION_RADIUS_VAL, DOG_SPAWN_PROTECTION_RADIUS } from '../lib/constants';
import { useDynamicModelLoader } from './useDynamicModelLoader'; // Import useDynamicModelLoader
import { CoinData } from './useCoinLogic'; // Import CoinData

const ENEMY_SPEED = 0.03;
const ENEMY_GALLOP_SPEED_MULTIPLIER = 3;
const ENEMY_ATTACK_DISTANCE = 1.5;
const ENEMY_DEATH_TRIGGER_DISTANCE = 0.5;
const ENEMY_DEATH_DURATION = 5.0;
const ENEMY_SINKING_DELAY = 10.0; // 10 seconds delay before sinking starts
const ENEMY_PROTECTION_RADIUS = 15;
const ENEMY_CHASE_RADIUS = 15;
const CROSSFADE_DURATION = 0.2;
const VISIBLE_ENEMY_DISTANCE = 75;
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

type EnemyData = THREE.LOD & EnemyCustomData; // Change to THREE.LOD

interface UseEnemyLogicProps {
  sceneRef: MutableRefObject<THREE.Scene | null>;
  dogModelRef: MutableRefObject<THREE.Group | null>;
  isShieldActiveRef: MutableRefObject<boolean>;
  protectionBoneCountRef: MutableRefObject<number>;
  onConsumeProtectionBone: () => void;
  onEnemyCollisionPenalty: () => void;
  isPausedRef: MutableRefObject<boolean>;
  coinMeshesRef: MutableRefObject<THREE.Mesh[]>;
  onCoinCollected: () => void;
  onAttackAnimationFinished: (event: THREE.Event) => void;
  octreeRef: MutableRefObject<Octree | null>;
  cameraRef: MutableRefObject<THREE.PerspectiveCamera | null>;
}

export const useEnemyLogic = ({
  sceneRef,
  dogModelRef,
  isShieldActiveRef,
  protectionBoneCountRef,
  onConsumeProtectionBone,
  onEnemyCollisionPenalty,
  isPausedRef,
  coinMeshesRef,
  octreeRef,
  onCoinCollected,
  onAttackAnimationFinished,
  cameraRef,
}: UseEnemyLogicProps) => {
  const enemyMeshesRef = React.useRef<EnemyData[]>([]);
  const internalOptimisticProtectionBoneCountRef = React.useRef(protectionBoneCountRef.current);
  const gltfLoader = React.useRef<GLTFLoader | null>(null);
  const clock = React.useRef(new THREE.Clock());
  const loadedEnemyChunks = React.useRef<Set<string>>(new Set());
  const currentDogChunk = React.useRef<{ chunkX: number; chunkZ: number } | null>(null);

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
    internalOptimisticProtectionBoneCountRef.current = protectionBoneCountRef.current;
  }, [protectionBoneCountRef.current]);

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

  const loadEnemyModel = React.useCallback(async (type: 'carnivore' | 'herbivore') => {
    const models = type === 'carnivore'
      ? ['Fox.glb', 'Husky.glb', 'ShibaInu.glb', 'Wolf.glb']
      : ['Alpaca.glb', 'Bull.glb', 'Cow.glb', 'Deer.glb', 'Donkey.glb', 'Horse_White.glb', 'Horse.glb', 'Stag.glb'];

    const randomModel = models[Math.floor(Math.random() * models.length)];
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
      console.log(`[useEnemyLogic] Falling back to direct network load for: ${modelPath}`);
      return new Promise<{ model: THREE.Group | null; animations: THREE.AnimationClip[] }>((resolve) => {
        if (!gltfLoader.current) {
          console.warn('GLTFLoader not initialized. Skipping model load.');
          return resolve({ model: null, animations: [] });
        }
        gltfLoader.current.load(modelPath, (gltf: GLTF) => {
          const model = gltf.scene;
          model.traverse((child: THREE.Object3D) => {
            if ((child as THREE.Mesh).isMesh) {
              child.castShadow = true;
              child.receiveShadow = true;
            }
          });
          resolve({ model, animations: gltf.animations });
        }, undefined, (loadError) => {
          console.debug('Error loading GLTF model (fallback):', loadError);
          console.debug('Failed to load enemy model due to a network error. Please check your internet connection.');
          resolve({ model: null, animations: [] });
        });
      });
    }
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

  const loadEnemiesForChunk = React.useCallback(async (chunkX: number, chunkZ: number) => {
    if (!sceneRef.current || loadedEnemyChunks.current.has(getChunkKey(chunkX, chunkZ))) {
      return;
    }

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

    for (const coin of coinsInChunk) {
      for (let i = 0; i < ENEMIES_PER_COIN_CHUNK; i++) {
        const enemyType: 'carnivore' | 'herbivore' = Math.random() < 0.5 ? 'carnivore' : 'herbivore';
        try {
          const { model: loadedModel, animations: loadedAnimations } = await loadEnemyModel(enemyType);
          if (loadedModel) {
            const lod = new THREE.LOD();
            const enemyInstanceModel = loadedModel; // Use the loaded model as the high-detail model

            enemyInstanceModel.traverse((child: THREE.Object3D) => {
              if ((child as THREE.Mesh).isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
              }
            });

            enemyInstanceModel.scale.set(0.5, 0.5, 0.5); // Apply initial scale to the high-detail model
            lod.addLevel(enemyInstanceModel, 0); // Add high-detail model at distance 0

            // Placeholder for a lower detail model (e.g., a simple box or sphere)
            const lowDetailModel = new THREE.Mesh(
              new THREE.BoxGeometry(0.5, 0.5, 0.5),
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

            const enemyData: EnemyData = lod as EnemyData; // Cast LOD to EnemyData
            enemyData.targetCoinId = coin.uuid; // Assign unique coin ID
            enemyData.targetCoinPosition = coin.position.clone();
            enemyData.patrolCenter = coin.position.clone();
            enemyData.patrolTarget = new THREE.Vector3();
            enemyData.isIdling = false;
            enemyData.idleTimer = 0;
            enemyData.idleDuration = 0;
            enemyData.isAttacking = false;
            enemyData.isDying = false;
            enemyData.deathTimer = 0;
            enemyData.hasAppliedDeathEffect = false;
            enemyData.isSinking = false; // Initialize new property
            enemyData.sinkingTimer = 0; // Initialize new property
            enemyData.initialDeathY = 0; // Initialize new property
            enemyData.mixer = mixer;
            enemyData.animations = loadedAnimations;
            enemyData.enemyType = enemyType;
            enemyData.currentAction = null;
            enemyData.actions = actions;
            enemyData.chunkKey = getChunkKey(chunkX, chunkZ);
            enemyData.highDetailModel = enemyInstanceModel; // Store reference to high-detail model

            const angle = Math.random() * Math.PI * 2;
            const radius = Math.random() * ENEMY_PROTECTION_RADIUS;
            let initialPatrolX = coin.position.x + Math.cos(angle) * radius;
            const initialPatrolZ = coin.position.z + Math.sin(angle) * radius;
            enemyData.patrolTarget.set(initialPatrolX, coin.position.y, initialPatrolZ);

            const spawnAngle = Math.random() * Math.PI * 2;
            const spawnRadius = ENEMY_PROTECTION_RADIUS * 0.8;
            let enemyX, enemyZ;
            let attempts = 0;
            const MAX_ATTEMPTS = 100; // Prevent infinite loops

            const dogPosition = dogModelRef.current?.position || new THREE.Vector3(0, 0, 0); // Get dog's initial position

            do {
              enemyX = coin.position.x + Math.cos(spawnAngle) * spawnRadius;
              enemyZ = coin.position.z + Math.sin(spawnAngle) * spawnRadius;

              // Clamp enemy positions to world boundaries, accounting for enemy patrol radius
              // World bounds are +/- 499. ENEMY_PROTECTION_RADIUS is 15.
              
              const minSpawnX = WORLD_MIN_BOUND + ENEMY_PROTECTION_RADIUS_VAL;
              const maxSpawnX = WORLD_MAX_BOUND - ENEMY_PROTECTION_RADIUS_VAL;
              const minSpawnZ = WORLD_MIN_BOUND + ENEMY_PROTECTION_RADIUS_VAL;
              const maxSpawnZ = WORLD_MAX_BOUND - ENEMY_PROTECTION_RADIUS_VAL;

              enemyX = Math.max(minSpawnX, Math.min(maxSpawnX, enemyX));
              enemyZ = Math.max(minSpawnZ, Math.min(maxSpawnZ, enemyZ));

              attempts++;
              if (attempts > MAX_ATTEMPTS) {
                console.warn("Max attempts reached for enemy spawning, placing enemy without protection.");
                break;
              }
            } while (dogPosition.distanceTo(new THREE.Vector3(enemyX, dogPosition.y, enemyZ)) < DOG_SPAWN_PROTECTION_RADIUS);

            let enemyY = 0;
            if (octreeRef.current) {
              enemyY = octreeRef.current.getGroundHeightAt(enemyX, enemyZ);
            }
            enemyData.position.set(enemyX, enemyY, enemyZ);
            // enemyData.scale.set(0.5, 0.5, 0.5); // Scale is now applied to the highDetailModel

            if (octreeRef.current) {
              const enemyBox = new THREE.Box3().setFromObject(enemyData); // Use LOD for bounds
              octreeRef.current.insert({
                id: `enemy_${enemyData.id}`,
                bounds: enemyBox,
                data: enemyData
              });
            }
            enemyMeshesRef.current.push(enemyData);
            scene.add(enemyData);

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
    loadedEnemyChunks.current.add(getChunkKey(chunkX, chunkZ));
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
      const enemyX = enemy.position.x;
      const enemyZ = enemy.position.z;

      if (enemyX >= chunkMinX && enemyX < chunkMaxX && enemyZ >= chunkMinZ && enemyZ < chunkMaxZ) {
        if (octreeRef.current) {
          const enemyBox = new THREE.Box3().setFromObject(enemy);
          octreeRef.current.remove({
              id: `enemy_${enemy.id}`,
              bounds: enemyBox,
              data: enemy
          });
        }
        enemy.mixer.stopAllAction();
        scene.remove(enemy);
        // Dispose all models within the LOD
        enemy.children.forEach(child => disposeEnemyModelResources(child));
        return false;
      }
      return true;
    });
    loadedEnemyChunks.current.delete(getChunkKey(chunkX, chunkZ));
  }, [sceneRef, octreeRef, disposeEnemyModelResources]); // Add disposeEnemyModelResources to dependencies


  const initializeEnemies = React.useCallback(async () => {
    if (!sceneRef.current || !dogModelRef.current) return;
    const scene = sceneRef.current;

    enemyMeshesRef.current.forEach(enemy => {
      if (octreeRef.current) {
        const enemyBox = new THREE.Box3().setFromObject(enemy);
        octreeRef.current.remove({ id: `enemy_${enemy.id}`, bounds: enemyBox, data: enemy });
      }
      enemy.mixer.stopAllAction();
      scene.remove(enemy);
      // Dispose all models within the LOD
      enemy.children.forEach(child => disposeEnemyModelResources(child));
    });
    enemyMeshesRef.current = [];
    loadedEnemyChunks.current.clear();

    const dogPosition = dogModelRef.current.position;
    const { chunkX: initialChunkX, chunkZ: initialChunkZ } = getChunkCoordinates(dogPosition.x, dogPosition.z);
    currentDogChunk.current = { chunkX: initialChunkX, chunkZ: initialChunkZ };

    for (let x = -RENDER_DISTANCE_CHUNKS; x <= RENDER_DISTANCE_CHUNKS; x++) {
      for (let z = -RENDER_DISTANCE_CHUNKS; z <= RENDER_DISTANCE_CHUNKS; z++) {
        await loadEnemiesForChunk(initialChunkX + x, initialChunkZ + z);
      }
    }
  }, [sceneRef, dogModelRef, octreeRef, loadEnemiesForChunk]);


  const updateEnemies = React.useCallback((delta: number) => {
    if (isPausedRef.current || !dogModelRef.current || !sceneRef.current || !cameraRef.current) return;

    const dog = dogModelRef.current;
    const dogPosition = dog.position;
    const camera = cameraRef.current;

    const { chunkX: currentX, chunkZ: currentZ } = getChunkCoordinates(dogPosition.x, dogPosition.z);

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
        if (!loadedEnemyChunks.current.has(chunkKey)) {
          const [cx, cz] = chunkKey.split(',').map(Number);
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
      visibleEnemies = octreeRef.current.query(cameraBox).map(obj => obj.data as EnemyData);
    }

    visibleEnemies = visibleEnemies.filter(enemy => {
      // Frustum culling is handled by THREE.LOD automatically when added to scene
      // We still need to filter by distance for visibility logic
      return true; 
    });

    // Filter out enemies that have sunk and been disposed
    enemyMeshesRef.current = enemyMeshesRef.current.filter(enemy => {
      // If sinking and sunk far enough, filter it out
      if (enemy.isSinking && enemy.sinkingTimer <= 0 && enemy.position.y < enemy.initialDeathY - 5) {
        return false; // Remove from the active enemy list
      }
      return true;
    });

    enemyMeshesRef.current.forEach(enemy => {
      enemy.mixer.update(delta);
      const enemyY = enemy.position.y;

      enemy.visible = dogPosition.distanceTo(enemy.position) < VISIBLE_ENEMY_DISTANCE;

      // Handle sinking animation
      if (enemy.isSinking) {
        enemy.sinkingTimer -= delta;
        if (enemy.sinkingTimer <= 0) {
          // Start sinking animation
          const sinkSpeed = 0.5; // Units per second
          enemy.position.y -= sinkSpeed * delta;
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
          enemy.initialDeathY = enemy.position.y;
          enemy.visible = true; // Keep visible during sinking delay
        }
        return; // Do not process other logic if dying
      }

      if (!enemy.visible) {
        return;
      }

      const distanceToDog = dogPosition.distanceTo(enemy.position);
      const distanceToCoin = dogPosition.distanceTo(enemy.targetCoinPosition); // Re-add this line

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
          targetPosition.copy(enemy.position);
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
              enemy.patrolTarget.set(newPatrolX, enemy.position.y, newPatrolZ);
              isMoving = true;
              currentAnimation = 'Walk';
            } else {
              currentAnimation = enemy.currentAction?.getClip().name || 'Idle';
            }
          } else if (enemy.position.distanceTo(enemy.patrolTarget) < 1.0 || enemy.patrolTarget.lengthSq() === 0) {
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

        const direction = new THREE.Vector3().subVectors(targetPosition, enemy.position);
        direction.y = 0;
        const movementThreshold = 0.001;

        if (isMoving && direction.lengthSq() > movementThreshold) {
          direction.normalize();
          const currentSpeed = currentAnimation === 'Gallop' ? ENEMY_SPEED * ENEMY_GALLOP_SPEED_MULTIPLIER : ENEMY_SPEED;
          enemy.position.addScaledVector(direction, currentSpeed);
          const lookAtTarget = new THREE.Vector3(targetPosition.x, enemyY, targetPosition.z);
          enemy.lookAt(lookAtTarget);
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

      enemy.position.y = enemyY;

      const dogXZ = new THREE.Vector3(dog.position.x, 0, dog.position.z);
      const enemyXZ = new THREE.Vector3(enemy.position.x, 0, enemy.position.z);
      const distanceXZToDog = dogXZ.distanceTo(enemyXZ);

      // Update LOD levels based on distance to camera
      enemy.update(camera);

      if (distanceXZToDog < ENEMY_DEATH_TRIGGER_DISTANCE && !enemy.isDying) {
        enemy.isDying = true;
        enemy.deathTimer = ENEMY_DEATH_DURATION;
        currentAnimation = ENEMY_ANIMATION_NAMES[enemy.enemyType.toUpperCase() as 'CARNIVORE' | 'HERBIVORE'].DEATH;
        if (enemy.actions[currentAnimation]) {
          playAnimation(enemy, currentAnimation);
        }
        if (!enemy.hasAppliedDeathEffect) {
          if (isShieldActiveRef.current) {
          } else if (internalOptimisticProtectionBoneCountRef.current > 0) {
            internalOptimisticProtectionBoneCountRef.current--;
            onConsumeProtectionBone();
          } else {
            onEnemyCollisionPenalty();
          }
          enemy.hasAppliedDeathEffect = true;
        }
      } else if (distanceXZToDog < ENEMY_ATTACK_DISTANCE && !enemy.isAttacking && !enemy.isDying) {
        targetPosition.copy(enemy.position);
        enemy.isAttacking = true;
        enemy.isIdling = false;

        if (enemy.enemyType === 'herbivore') {
          const lookAtTarget = new THREE.Vector3(dogPosition.x, enemyY, dogPosition.z);
          enemy.lookAt(lookAtTarget);
          enemy.rotation.y += Math.PI;
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
                } else if (internalOptimisticProtectionBoneCountRef.current > 0) {
                  internalOptimisticProtectionBoneCountRef.current--;
                  onConsumeProtectionBone();
                } else {
                  onEnemyCollisionPenalty();
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
    protectionBoneCountRef,
    onConsumeProtectionBone,
    onEnemyCollisionPenalty,
    isPausedRef,
    coinMeshesRef,
    onCoinCollected,
    onAttackAnimationFinished,
    playAnimation,
    cameraRef,
    octreeRef,
    loadEnemiesForChunk,
    unloadEnemiesFromChunk,
    disposeEnemyModelResources, // Add disposeEnemyModelResources to dependencies
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
