import { useCallback } from "react";
import * as THREE from "three";
import { ENEMY_DEATH_TRIGGER_DISTANCE } from "../constants";
import type { EnemyData } from "../types";

interface CollisionHandlersParams {
  dogModelRef: React.MutableRefObject<THREE.Group | null>;
  handleEnemyDeath: (e: EnemyData) => void;
  handleCarnivoreAttack: (e: EnemyData) => void;
  handleHerbivoreAttack: (e: EnemyData) => void;
}

// Reusable vectors to avoid per-frame allocations
const dogXZ = new THREE.Vector3();
const enemyXZ = new THREE.Vector3();

export const createCollisionHandlers = (params: CollisionHandlersParams) => {
  const { dogModelRef, handleEnemyDeath, handleCarnivoreAttack, handleHerbivoreAttack } = params;

  const checkCollisions = useCallback(
    (e: EnemyData) => {
      if (e.isDying || !dogModelRef.current) return;

      dogXZ.set(dogModelRef.current.position.x, 0, dogModelRef.current.position.z);
      enemyXZ.set(e.lod.position.x, 0, e.lod.position.z);
      const distanceXZToDog = dogXZ.distanceTo(enemyXZ);

      // التحقق من قتل العدو عند الاصطدام
      if (distanceXZToDog < ENEMY_DEATH_TRIGGER_DISTANCE && !e.isDying) {
        handleEnemyDeath(e);
      }

      // التحقق من هجوم الأعداء
      handleCarnivoreAttack(e);
      handleHerbivoreAttack(e);
    },
    [dogModelRef, handleEnemyDeath, handleCarnivoreAttack, handleHerbivoreAttack]
  );

  const updateDeathState = useCallback((e: EnemyData, dt: number) => {
    if (!e.isDying) return false;

    if (!e.isSinking) {
      e.deathTimer -= dt;
      if (e.deathTimer <= 0) {
        e.isSinking = true;
        e.sinkingTimer = 1; // Sinking delay
        e.initialDeathY = e.lod.position.y;
      }
    } else {
      if (e.sinkingTimer > 0) {
        e.sinkingTimer -= dt;
      } else {
        const sinkSpeed = 0.5;
        e.lod.position.y -= sinkSpeed * dt;
        e.position.y = e.lod.position.y; // Sync position property
        if (e.lod.position.y < e.initialDeathY - 5) return true;
      }
    }
    return false;
  }, []);

  return { checkCollisions, updateDeathState };
};
