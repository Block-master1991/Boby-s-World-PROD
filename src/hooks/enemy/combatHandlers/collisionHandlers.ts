import { useCallback } from 'react';
import * as THREE from 'three';
import { ENEMY_DEATH_DURATION, ENEMY_DEATH_TRIGGER_DISTANCE } from '../constants';
import type { EnemyData } from '../types';

interface CollisionHandlersParams {
  dogModelRef: React.MutableRefObject<THREE.Group | null>;
  handleEnemyDeath: (e: EnemyData) => void;
  handleCarnivoreAttack: (e: EnemyData, dist: number) => void;
  handleHerbivoreAttack: (e: EnemyData, dist: number) => void;
}

export const createCollisionHandlers = (params: CollisionHandlersParams) => {
  const { dogModelRef, handleEnemyDeath, handleCarnivoreAttack, handleHerbivoreAttack } = params;

  const checkCollisions = useCallback((e: EnemyData, dist: number) => {
    if (e.isDying || !dogModelRef.current) return;

    const dogXZ = new THREE.Vector3(dogModelRef.current.position.x, 0, dogModelRef.current.position.z);
    const enemyXZ = new THREE.Vector3(e.lod.position.x, 0, e.lod.position.z);
    const distanceXZToDog = dogXZ.distanceTo(enemyXZ);

    // التحقق من قتل العدو عند الاصطدام
    if (distanceXZToDog < ENEMY_DEATH_TRIGGER_DISTANCE && !e.isDying) {
      handleEnemyDeath(e);
    }

    // التحقق من هجوم الحيوانات المفترسة
    handleCarnivoreAttack(e, dist);

    // التحقق من هجوم العواشب
    handleHerbivoreAttack(e, dist);
  }, [dogModelRef, handleEnemyDeath, handleCarnivoreAttack, handleHerbivoreAttack]);

  const updateDeathState = useCallback((e: EnemyData, dt: number) => {
    if (!e.isDying) return false;
    e.deathTimer += dt;
    if (e.deathTimer >= ENEMY_DEATH_DURATION && !e.isSinking) {
      e.isSinking = true;
      e.sinkingTimer = 1;
      e.initialDeathY = e.lod.position.y;
    }
    if (e.isSinking) {
      if (e.sinkingTimer > 0) e.sinkingTimer -= dt;
      else {
        e.position.y -= dt;
        e.lod.position.y = e.position.y;
        if (e.lod.position.y < e.initialDeathY - 5) return true;
      }
    }
    return false;
  }, []);

  return { checkCollisions, updateDeathState };
};
