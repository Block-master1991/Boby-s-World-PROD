'use client';

import * as React from 'react';
import * as THREE from 'three';
import type { MutableRefObject } from 'react';
import { GLTFLoader, GLTF } from 'three/examples/jsm/loaders/GLTFLoader'; // Import GLTF type
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader';
import { Octree, OctreeObject } from '@/lib/Octree';
import { getModel, putModel } from '../lib/indexedDB'; // Import IndexedDB utilities

const ENEMY_SPEED = 0.03;
const ENEMY_GALLOP_SPEED_MULTIPLIER = 3; // Multiplier for GALLOP speed
const ENEMY_ATTACK_DISTANCE = 1.5; // Distance for enemy to stop and attack
const ENEMY_DEATH_TRIGGER_DISTANCE = 0.5; // Distance at which enemy dies after attack
const ENEMY_DEATH_DURATION = 5.0; // Duration for death animation
const ENEMY_PROTECTION_RADIUS = 7; // Radius around the coin where enemies patrol
const ENEMY_CHASE_RADIUS = 15; // Radius around the coin where enemies start chasing the player
const CROSSFADE_DURATION = 0.2; // Duration for crossfade between animations

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
  hasAppliedDeathEffect: boolean; // Added to track if death effect has been applied
  mixer: THREE.AnimationMixer;
  animations: THREE.AnimationClip[];
  enemyType: 'carnivore' | 'herbivore';
  currentAction: THREE.AnimationAction | null;
  actions: { [key: string]: THREE.AnimationAction };
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
  coinMeshesRef: MutableRefObject<THREE.Mesh[]>; // Added coinMeshesRef
  onCoinCollected: () => void; // Added onCoinCollected to kill enemies
  onAttackAnimationFinished: (event: THREE.Event) => void; // Add onAttackAnimationFinished prop
  octreeRef: MutableRefObject<Octree | null>; // Added Octree ref
  cameraRef: MutableRefObject<THREE.PerspectiveCamera | null>; // ✅ NEW

}

export const useEnemyLogic = ({
  sceneRef,
  dogModelRef,
  isShieldActiveRef,
  protectionBoneCountRef,
  onConsumeProtectionBone,
  onEnemyCollisionPenalty,
  isPausedRef,
  coinMeshesRef, // Destructure new prop
  octreeRef,
  onCoinCollected, // Destructure new prop
  onAttackAnimationFinished, // Destructure new prop
  cameraRef, // ✅ NEW


}: UseEnemyLogicProps) => {
  const enemyMeshesRef = React.useRef<EnemyData[]>([]);
  const internalOptimisticProtectionBoneCountRef = React.useRef(protectionBoneCountRef.current);
  const gltfLoader = React.useRef<GLTFLoader | null>(null);
  const clock = React.useRef(new THREE.Clock()); // Add clock

  React.useEffect(() => {
    internalOptimisticProtectionBoneCountRef.current = protectionBoneCountRef.current;
  }, [protectionBoneCountRef.current]);

  React.useEffect(() => {
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('/libs/draco/gltf/');
    gltfLoader.current = new GLTFLoader();
    gltfLoader.current.setDRACOLoader(dracoLoader);

    return () => {
      // Dispose of the DRACOLoader instance
      dracoLoader.dispose();
      // Nullify the GLTFLoader reference
      gltfLoader.current = null;
    };
  }, []);

  const loadEnemyModel = React.useCallback(async (type: 'carnivore' | 'herbivore') => {
    const models = type === 'carnivore'
      ? ['Fox.glb', 'Husky.glb', 'ShibaInu.glb', 'Wolf.glb']
      : ['Alpaca.glb', 'Bull.glb', 'Cow.glb', 'Deer.glb', 'Donkey.glb', 'Horse_White.glb', 'Horse.glb', 'Stag.glb'];

    const randomModel = models[Math.floor(Math.random() * models.length)];
    const modelPath = `/models/Enemies-Animals/${type === 'carnivore' ? 'Carnivores' : 'Herbivores'}/${randomModel}`;
    const modelName = `enemy_${randomModel}`; // Unique name for IndexedDB

    try {
      // Try to load from IndexedDB first
      const cachedData = await getModel(modelName);
      if (cachedData) {
        console.log(`[useEnemyLogic] Loading enemy model from IndexedDB: ${modelName}`);
        const gltf = await gltfLoader.current!.parseAsync(cachedData, modelPath); // Pass modelPath for base path
        return { model: gltf.scene, animations: gltf.animations };
      } else {
        console.log(`[useEnemyLogic] Fetching enemy model from network: ${modelPath}`);
        const response = await fetch(modelPath);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const arrayBuffer = await response.arrayBuffer();
        await putModel(modelName, arrayBuffer); // Store in IndexedDB
        const gltf = await gltfLoader.current!.parseAsync(arrayBuffer, ''); // Pass empty string for path
        return { model: gltf.scene, animations: gltf.animations };
      }
    } catch (error) {
      console.error(`[useEnemyLogic] Error loading or caching model ${modelName}:`, error);
      // Fallback to direct network load if IndexedDB fails or model is not found
      console.log(`[useEnemyLogic] Falling back to direct network load for: ${modelPath}`);
      return new Promise<{ model: THREE.Group | null; animations: THREE.AnimationClip[] }>((resolve) => {
        if (!gltfLoader.current) {
          console.warn('GLTFLoader not initialized. Skipping model load.');
          return resolve({ model: null, animations: [] });
        }
        gltfLoader.current.load(modelPath, (gltf: GLTF) => { // Use GLTF type
          const model = gltf.scene;
          model.traverse((child: THREE.Object3D) => {
            if ((child as THREE.Mesh).isMesh) {
              child.castShadow = true;
              child.receiveShadow = true;
            }
          });
          resolve({ model, animations: gltf.animations });
        }, undefined, (loadError) => { // Use loadError for clarity
          console.debug('Error loading GLTF model (fallback):', loadError);
          console.debug('Failed to load enemy model due to a network error. Please check your internet connection.');
          resolve({ model: null, animations: [] }); // Resolve with null on error
        });
      });
    }
  }, []);

  const initializeEnemies = React.useCallback(async () => {
    if (!sceneRef.current || !coinMeshesRef.current) return;
    const scene = sceneRef.current;

    enemyMeshesRef.current.forEach(enemy => {
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
      // Dispose of enemy's Three.js resources
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

    for (const coin of coinMeshesRef.current) {
      if (coin.visible) {
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
            // Ensure all actions are stopped initially
            Object.values(actions).forEach(action => action.stop());

            const enemyData: EnemyData = loadedModel as EnemyData;
            enemyData.targetCoinPosition = coin.position.clone();
            enemyData.patrolCenter = coin.position.clone();
            enemyData.patrolTarget = new THREE.Vector3(); // Will be set below
            enemyData.isIdling = false;
            enemyData.idleTimer = 0;
            enemyData.idleDuration = 0;
            enemyData.isAttacking = false;
            enemyData.isDying = false;
            enemyData.deathTimer = 0;
            enemyData.hasAppliedDeathEffect = false; // Initialize to false
            enemyData.mixer = mixer;
            enemyData.animations = loadedAnimations;
            enemyData.enemyType = enemyType;
            enemyData.currentAction = null;
            enemyData.actions = actions;
            
            // Set initial patrol target within the protection radius
            const angle = Math.random() * Math.PI * 2;
            const radius = Math.random() * ENEMY_PROTECTION_RADIUS;
            const initialPatrolX = coin.position.x + Math.cos(angle) * radius;
            const initialPatrolZ = coin.position.z + Math.sin(angle) * radius;
            enemyData.patrolTarget.set(initialPatrolX, coin.position.y, initialPatrolZ);

            const spawnAngle = Math.random() * Math.PI * 2;
            const spawnRadius = ENEMY_PROTECTION_RADIUS * 0.8; // Spawn within protection radius
            const enemyX = coin.position.x + Math.cos(spawnAngle) * spawnRadius;
            const enemyZ = coin.position.z + Math.sin(spawnAngle) * spawnRadius;
            const enemyY = 0;
            enemyData.position.set(enemyX, enemyY, enemyZ);
            enemyData.scale.set(0.5, 0.5, 0.5);
                      // Add to Octree
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

            // Play initial idle animation
            const idleAnimations = ENEMY_ANIMATION_NAMES[enemyType.toUpperCase() as 'CARNIVORE' | 'HERBIVORE'].IDLE;
            const initialIdleActionName = idleAnimations[Math.floor(Math.random() * idleAnimations.length)];
            if (enemyData.actions[initialIdleActionName]) {
              enemyData.currentAction = enemyData.actions[initialIdleActionName];
              enemyData.currentAction.play();
            }
          }
        } catch (error) {
          console.error('Error loading enemy model:', error);
          continue; // Skip to the next coin if model loading fails
        }
      }
    }
  }, [sceneRef, coinMeshesRef, loadEnemyModel, octreeRef]);

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

  const updateEnemies = React.useCallback((delta: number) => {
    if (isPausedRef.current || !dogModelRef.current || !sceneRef.current || !cameraRef.current) return;

    const dog = dogModelRef.current;
    const dogPosition = dog.position;
    const camera = cameraRef.current;

    // ✅ Frustum Culling setup
    camera.updateMatrixWorld();
    const frustum = new THREE.Frustum();
    const viewProjection = new THREE.Matrix4().multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse
    );
    frustum.setFromProjectionMatrix(viewProjection);

    // ✅ Use octree to get nearby enemies
    let visibleEnemies = enemyMeshesRef.current;
    if (octreeRef.current) {
      const cameraBox = new THREE.Box3().setFromCenterAndSize(camera.position, new THREE.Vector3(50, 50, 50));
      visibleEnemies = octreeRef.current.query(cameraBox).map(obj => obj.data as EnemyData);
    }

    // ✅ Filter enemies that are visible in frustum
    visibleEnemies = visibleEnemies.filter(enemy => {
      const boundingBox = new THREE.Box3().setFromObject(enemy);
      return frustum.intersectsBox(boundingBox);
    });

    enemyMeshesRef.current.forEach(enemy => {
      enemy.mixer.update(delta); // Update mixer
      const enemyY = enemy.position.y; // Define enemyY here to be accessible everywhere

      // If enemy is dying and death timer is still running, only update mixer and skip other logic
      if (enemy.isDying && enemy.deathTimer > 0) {
        enemy.deathTimer -= delta;
        if (enemy.deathTimer <= 0) {
          enemy.visible = false; // Hide after death animation
        }
        // Ensure death animation is playing
        const deathAnimationName = ENEMY_ANIMATION_NAMES[enemy.enemyType.toUpperCase() as 'CARNIVORE' | 'HERBIVORE'].DEATH;
        if (enemy.currentAction?.getClip().name !== deathAnimationName && enemy.actions[deathAnimationName]) {
          playAnimation(enemy, deathAnimationName);
        }
        return; // Skip all other logic for dying enemies
      }

      // If enemy is not visible (already died and hidden), skip all logic
      if (!enemy.visible) {
        return;
      }

      const distanceToDog = dogPosition.distanceTo(enemy.position);
      const distanceToCoin = dogPosition.distanceTo(enemy.targetCoinPosition);

      let targetPosition = new THREE.Vector3();
      let currentAnimation = ''; // Initialize currentAnimation

      // Check if the coin this enemy is protecting is collected
      const protectedCoin = coinMeshesRef.current.find(coin => coin.position.equals(enemy.targetCoinPosition));
      if (protectedCoin && !protectedCoin.visible) {
        // If coin is collected, enemy dies (if not already dying)
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
        // Stay in attack animation until finished
        currentAnimation = enemy.currentAction?.getClip().name || (enemy.enemyType === 'carnivore' ? 'Attack' : 'Attack_Kick');
        // Allow mixer.update to continue, DO NOT return
      }

      // Only run movement/attack/patrol logic if not dying and not attacking
      if (!enemy.isDying && !enemy.isAttacking) {
        // Determine target position and animation based on distance to dog and coin
        targetPosition = new THREE.Vector3(); // Keep only one declaration
        let isMoving = false; // Flag to indicate if enemy should be moving

        if (distanceToDog < ENEMY_ATTACK_DISTANCE) {
          // Player is within attack distance, stop and attack
          targetPosition.copy(enemy.position); // Stop moving
          currentAnimation = enemy.enemyType === 'carnivore' ? 'Attack' : 'Attack_Kick'; // Attack animation
          enemy.isAttacking = true;
          enemy.isIdling = false; // Stop idling if attacking
        } else if (distanceToCoin < ENEMY_CHASE_RADIUS) {
          // Player is within the coin's protection radius, chase the player
          targetPosition.copy(dogPosition);
          isMoving = true;
          currentAnimation = 'Gallop'; // Chase animation
          enemy.isIdling = false; // Stop idling if chasing
        } else {
          // Player is outside, patrol around the coin
          if (enemy.isIdling) {
            enemy.idleTimer -= delta;
            if (enemy.idleTimer <= 0) {
              enemy.isIdling = false;
              // Pick a new patrol target after idling
              const angle = Math.random() * Math.PI * 2;
              const radius = Math.random() * ENEMY_PROTECTION_RADIUS;
              const newPatrolX = enemy.patrolCenter.x + Math.cos(angle) * radius;
              const newPatrolZ = enemy.patrolTarget.z + Math.sin(angle) * radius;
              enemy.patrolTarget.set(newPatrolX, enemy.position.y, newPatrolZ);
              isMoving = true; // Will start moving towards new patrol target
              currentAnimation = 'Walk';
            } else {
              // Continue current idle animation
              currentAnimation = enemy.currentAction?.getClip().name || 'Idle';
            }
          } else if (enemy.position.distanceTo(enemy.patrolTarget) < 1.0 || enemy.patrolTarget.lengthSq() === 0) {
            // Reached patrol target, start idling
            enemy.isIdling = true;
            enemy.idleDuration = Math.random() * 5 + 3;
            enemy.idleTimer = enemy.idleDuration;
            const idleAnimations = ENEMY_ANIMATION_NAMES[enemy.enemyType.toUpperCase() as 'CARNIVORE' | 'HERBIVORE'].IDLE;
            currentAnimation = idleAnimations[Math.floor(Math.random() * idleAnimations.length)];
            isMoving = false; // Stop moving to idle
          } else {
            // Move towards patrol target
            targetPosition.copy(enemy.patrolTarget);
            isMoving = true;
            currentAnimation = 'Walk'; // Patrol animation
          }
        }

        const direction = new THREE.Vector3().subVectors(targetPosition, enemy.position);
        direction.y = 0;
        const movementThreshold = 0.001; // Define a threshold for actual movement

        if (isMoving && direction.lengthSq() > movementThreshold) {
          direction.normalize();
          const currentSpeed = currentAnimation === 'Gallop' ? ENEMY_SPEED * ENEMY_GALLOP_SPEED_MULTIPLIER : ENEMY_SPEED;
          enemy.position.addScaledVector(direction, currentSpeed);
          const lookAtTarget = new THREE.Vector3(targetPosition.x, enemyY, targetPosition.z);
          enemy.lookAt(lookAtTarget);
        } else if (isMoving && direction.lengthSq() <= movementThreshold) {
          // If supposed to be moving but stopped, transition to idle
          enemy.isIdling = true;
          enemy.idleDuration = Math.random() * 5 + 3;
          enemy.idleTimer = enemy.idleDuration;
          const idleAnimations = ENEMY_ANIMATION_NAMES[enemy.enemyType.toUpperCase() as 'CARNIVORE' | 'HERBIVORE'].IDLE;
          currentAnimation = idleAnimations[Math.floor(Math.random() * idleAnimations.length)];
        } else if (!isMoving) { // Simplified this condition
          // If not supposed to be moving, and not attacking/dying, ensure idle animation
          const idleAnimations = ENEMY_ANIMATION_NAMES[enemy.enemyType.toUpperCase() as 'CARNIVORE' | 'HERBIVORE'].IDLE;
          // Ensure currentAnimation is an idle animation if not already
          if (!idleAnimations.includes(currentAnimation)) {
              currentAnimation = idleAnimations[Math.floor(Math.random() * idleAnimations.length)];
          }
        }
      }

      // Play animation
      if (enemy.currentAction?.getClip().name !== currentAnimation && enemy.actions[currentAnimation]) {
        playAnimation(enemy, currentAnimation);
      }

      enemy.position.y = enemyY;

      // Check for attack condition (distance to dog)
      const dogXZ = new THREE.Vector3(dog.position.x, 0, dog.position.z);
      const enemyXZ = new THREE.Vector3(enemy.position.x, 0, enemy.position.z);
      const distanceXZToDog = dogXZ.distanceTo(enemyXZ);

      // Check for collision and trigger appropriate actions
      if (distanceXZToDog < ENEMY_DEATH_TRIGGER_DISTANCE && !enemy.isDying) {
        // Player is within death trigger distance, enemy dies immediately
        enemy.isDying = true;
        enemy.deathTimer = ENEMY_DEATH_DURATION;
        currentAnimation = ENEMY_ANIMATION_NAMES[enemy.enemyType.toUpperCase() as 'CARNIVORE' | 'HERBIVORE'].DEATH;
        if (enemy.actions[currentAnimation]) {
          playAnimation(enemy, currentAnimation);
        }
        // Apply penalty/death logic immediately, only if not already applied
        if (!enemy.hasAppliedDeathEffect) {
          if (isShieldActiveRef.current) {
            // No penalty, just death
          } else if (internalOptimisticProtectionBoneCountRef.current > 0) {
            internalOptimisticProtectionBoneCountRef.current--;
            onConsumeProtectionBone();
          } else {
            onEnemyCollisionPenalty();
          }
          enemy.hasAppliedDeathEffect = true; // Mark as applied
        }
      } else if (distanceXZToDog < ENEMY_ATTACK_DISTANCE && !enemy.isAttacking && !enemy.isDying) {
        // Player is within attack distance, stop and attack
        targetPosition.copy(enemy.position); // Stop moving
        enemy.isAttacking = true;
        enemy.isIdling = false;

        if (enemy.enemyType === 'herbivore') {
          // Herbivore: Rotate 180 degrees then attack
          const lookAtTarget = new THREE.Vector3(dogPosition.x, enemyY, dogPosition.z);
          enemy.lookAt(lookAtTarget);
          enemy.rotation.y += Math.PI; // Rotate 180 degrees for back attack
          currentAnimation = 'Attack_Kick';
        } else {
          // Carnivore: Attack directly
          currentAnimation = 'Attack';
        }

        if (enemy.actions[currentAnimation]) {
          playAnimation(enemy, currentAnimation);

          // Listen for attack animation finish to trigger death or penalty
          enemy.mixer.removeEventListener('finished', onAttackAnimationFinished); // Remove previous listeners
          enemy.mixer.addEventListener('finished', (e) => {
            const finishedClipName = e.action.getClip().name;
            const attackAnimationName = enemy.enemyType === 'carnivore' ? 'Attack' : 'Attack_Kick';

            if (finishedClipName === attackAnimationName) {
              // After attack animation, trigger death animation and apply penalty/bone consumption
              enemy.isDying = true;
              enemy.deathTimer = ENEMY_DEATH_DURATION;
              playAnimation(enemy, ENEMY_ANIMATION_NAMES[enemy.enemyType.toUpperCase() as 'CARNIVORE' | 'HERBIVORE'].DEATH);
              enemy.isAttacking = false; // Reset attack state

              // Apply penalty/death logic, only if not already applied
              if (!enemy.hasAppliedDeathEffect) {
                if (isShieldActiveRef.current) {
                  // No penalty, shield absorbed attack
                } else if (internalOptimisticProtectionBoneCountRef.current > 0) {
                  internalOptimisticProtectionBoneCountRef.current--;
                  onConsumeProtectionBone();
                } else {
                  onEnemyCollisionPenalty();
                }
                enemy.hasAppliedDeathEffect = true; // Mark as applied
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
    playAnimation, // Add playAnimation to dependencies
    cameraRef,
    octreeRef,
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
