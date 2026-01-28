import type { Octree } from '@/lib/Octree';
import type { GameObject } from '@/types/game';
import { useCallback } from 'react';
import * as THREE from 'three';
import { ENEMY_GALLOP_SPEED_MULTIPLIER, ENEMY_SPEED } from '../constants';
import { getAnim, setAnim, switchAnim } from '../movementHelpers';
import type { EnemyData } from '../types';
import { clampGround, determineMovement } from './movementUtils';

interface MovementUpdaterParams {
  dogModelRef: React.MutableRefObject<THREE.Group | null>;
  sceneRef: React.MutableRefObject<THREE.Scene | null>;
  isPausedRef: React.MutableRefObject<boolean>;
  cameraRef: React.MutableRefObject<THREE.PerspectiveCamera | null>;
}

// Reusable vectors to avoid per-frame allocations
const direction = new THREE.Vector3();
const targetV3 = new THREE.Vector3();
const tempV3 = new THREE.Vector3();

export const createMovementUpdater = (params: MovementUpdaterParams & { octreeRef: React.MutableRefObject<Octree<GameObject> | null> }) => {
  const { dogModelRef, sceneRef, isPausedRef, cameraRef, octreeRef } = params;

  const applyMovement = (e: EnemyData, dt: number, targetPosition: THREE.Vector3, currentAnimation: string) => {
    direction.subVectors(targetPosition, e.lod.position);
    direction.y = 0;
    const movementThreshold = 0.001;

    if (direction.lengthSq() > movementThreshold) {
      direction.normalize();
      const speed = currentAnimation === 'Gallop' ? ENEMY_SPEED * ENEMY_GALLOP_SPEED_MULTIPLIER : ENEMY_SPEED;
      e.lod.position.addScaledVector(direction, speed * dt);
      e.position.copy(e.lod.position);
      
      tempV3.set(targetPosition.x, e.lod.position.y, targetPosition.z);
      e.lookAt(tempV3);
    } else {
      e.isIdling = true;
      e.idleDuration = Math.random() * 5 + 3;
      e.idleTimer = e.idleDuration;
      setAnim(e, 'IDLE');
    }
  };

  const syncAnimation = (e: EnemyData, currentAnimation: string) => {
    let finalAnim = currentAnimation;
    const idleAnim = getAnim(e, 'IDLE');
    if (idleAnim && finalAnim && !idleAnim.includes(finalAnim) && !e.isIdling) {
      // Keep requested anim
    } else if (idleAnim && finalAnim && !idleAnim.includes(finalAnim)) {
      finalAnim = idleAnim;
    }

    if (e.currentAction?.getClip().name !== finalAnim && e.actions[finalAnim]) {
      switchAnim(e, finalAnim);
    }
  };

  const updateMovement = useCallback((e: EnemyData, dt: number, dist: number) => {
    if (isPausedRef.current || e.isDying || e.isAttacking || !dogModelRef.current) return;

    targetV3.set(0, 0, 0); // Reset reusable target vector
    const { currentAnimation, isMoving } = determineMovement({
      enemy: e,
      distance: dist,
      deltaTime: dt,
      targetPosition: targetV3,
      dogPosition: dogModelRef.current.position
    });

    if (isMoving) {
      applyMovement(e, dt, targetV3, currentAnimation);
    }

    syncAnimation(e, currentAnimation);
    clampGround(e, sceneRef.current, octreeRef.current);
    if (cameraRef.current) e.lod.update(cameraRef.current);
  }, [dogModelRef, sceneRef, isPausedRef, cameraRef, octreeRef]);

  return { updateMovement };
};
