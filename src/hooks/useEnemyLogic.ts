'use client';

import * as React from 'react';
import * as THREE from 'three';
import type { MutableRefObject } from 'react';
import { GLTFLoader, GLTF } from 'three/examples/jsm/loaders/GLTFLoader';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader';
import { Octree, OctreeObject } from '@/lib/Octree';
import { getModel, putModel } from '../lib/indexedDB';
import { CHUNK_SIZE, RENDER_DISTANCE_CHUNKS, getChunkCoordinates, getChunkKey } from '../lib/chunkUtils';

const ENEMY_SPEED = 0.03;
const ENEMY_GALLOP_SPEED_MULTIPLIER = 3;
const ENEMY_ATTACK_DISTANCE = 1.5;
const ENEMY_DEATH_TRIGGER_DISTANCE = 0.5;
const ENEMY_DEATH_DURATION = 5.0;
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
  targetCoinPosition: THREE.Vector3;
  patrolCenter: THREE.Vector3;
  patrolTarget: THREE.Vector3;
  isIdling: boolean;
  idleTimer: number;
  idleDuration: number;
  isAttacking: boolean;
  isDying: boolean;
  deathTimer: number;
  hasAppliedDeathEffect: boolean;
  mixer: THREE.AnimationMixer;
  animations: THREE.AnimationClip[];
  enemyType: 'carnivore' | 'herbivore';
  currentAction: THREE.AnimationAction | null;
  actions: { [key: string]: THREE.AnimationAction };
  chunkKey: string;
}

type EnemyData = THREE.Group & EnemyCustomData;

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
      return coinX >= chunkMinX && coinX < chunkMaxX && coinZ >= chunkMinZ && coinZ < chunkMaxZ && coin.visible;
    });

    for (const coin of coinsInChunk) {
      for (let i = 0; i < ENEMIES_PER_COIN_CHUNK; i++) {
        const enemyType: 'carnivore' | 'herbivore' = Math.random() < 0.5 ? 'carnivore' : 'herbivore';
        try {
          const { model: loadedModel, animations: loadedAnimations } = await loadEnemyModel(enemyType);
          if (loadedModel) {
            const mixer = new THREE.AnimationMixer(loadedModel);

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

            const enemyData: EnemyData = loadedModel as EnemyData;
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
            enemyData.mixer = mixer;
            enemyData.animations = loadedAnimations;
            enemyData.enemyType = enemyType;
            enemyData.currentAction = null;
            enemyData.actions = actions;
            enemyData.chunkKey = getChunkKey(chunkX, chunkZ);

            const angle = Math.random() * Math.PI * 2;
            const radius = Math.random() * ENEMY_PROTECTION_RADIUS;
            const initialPatrolX = coin.position.x + Math.cos(angle) * radius;
            const initialPatrolZ = coin.position.z + Math.sin(angle) * radius;
            enemyData.patrolTarget.set(initialPatrolX, coin.position.y, initialPatrolZ);

            const spawnAngle = Math.random() * Math.PI * 2;
            const spawnRadius = ENEMY_PROTECTION_RADIUS * 0.8;
            const enemyX = coin.position.x + Math.cos(spawnAngle) * spawnRadius;
            const enemyZ = coin.position.z + Math.sin(spawnAngle) * spawnRadius;
            const enemyY = 0;
            enemyData.position.set(enemyX, enemyY, enemyZ);
            enemyData.scale.set(0.5, 0.5, 0.5);

            if (octreeRef.current) {
              const enemyBox = new THREE.Box3().setFromObject(enemyData);
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
  }, [sceneRef, coinMeshesRef, loadEnemyModel, octreeRef]);

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
        enemy.traverse((child) => {
          if ((child as THREE.Mesh).geometry) (child as THREE.Mesh).geometry.dispose();
          if ((child as THREE.Mesh).material) {
            const material = (child as THREE.Mesh).material;
            if (Array.isArray(material)) material.forEach(m => m.dispose());
            else (material as THREE.Material).dispose();
          }
        });
        return false;
      }
      return true;
    });
    loadedEnemyChunks.current.delete(getChunkKey(chunkX, chunkZ));
  }, [sceneRef, octreeRef]);


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
      enemy.traverse((child) => {
        if ((child as THREE.Mesh).geometry) (child as THREE.Mesh).geometry.dispose();
        if ((child as THREE.Mesh).material) {
          const material = (child as THREE.Mesh).material;
          if (Array.isArray(material)) material.forEach(m => m.dispose());
          else (material as THREE.Material).dispose();
        }
      });
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
      const boundingBox = new THREE.Box3().setFromObject(enemy);
      return frustum.intersectsBox(boundingBox);
    });

    enemyMeshesRef.current.forEach(enemy => {
      enemy.mixer.update(delta);
      const enemyY = enemy.position.y;

      enemy.visible = dogPosition.distanceTo(enemy.position) < VISIBLE_ENEMY_DISTANCE;

      if (enemy.isDying && enemy.deathTimer > 0) {
        enemy.deathTimer -= delta;
        if (enemy.deathTimer <= 0) {
          enemy.visible = false;
        }
        const deathAnimationName = ENEMY_ANIMATION_NAMES[enemy.enemyType.toUpperCase() as 'CARNIVORE' | 'HERBIVORE'].DEATH;
        if (enemy.currentAction?.getClip().name !== deathAnimationName && enemy.actions[deathAnimationName]) {
          playAnimation(enemy, deathAnimationName);
        }
        return;
      }

      if (!enemy.visible) {
        return;
      }

      const distanceToDog = dogPosition.distanceTo(enemy.position);
      const distanceToCoin = dogPosition.distanceTo(enemy.targetCoinPosition);

      let targetPosition = new THREE.Vector3();
      let currentAnimation = '';

      const protectedCoin = coinMeshesRef.current.find(coin => coin.position.equals(enemy.targetCoinPosition));
      if (protectedCoin && !protectedCoin.visible) {
        if (!enemy.isDying) {
          enemy.isDying = true;
          enemy.deathTimer = ENEMY_DEATH_DURATION;
          currentAnimation = ENEMY_ANIMATION_NAMES[enemy.enemyType.toUpperCase() as 'CARNIVORE' | 'HERBIVORE'].DEATH;
          if (enemy.actions[currentAnimation]) {
            playAnimation(enemy, currentAnimation);
          }
        }
      }

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
    loadEnemiesForChunk, // Added to dependencies
    unloadEnemiesFromChunk, // Added to dependencies
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
