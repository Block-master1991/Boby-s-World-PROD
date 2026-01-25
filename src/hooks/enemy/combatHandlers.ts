import type * as THREE from 'three';
import type { FloatingEffectOptions } from '../coin/useCoinInteraction';
import { createAttackHandlers } from './combatHandlers/attackHandlers';
import { createCollisionHandlers } from './combatHandlers/collisionHandlers';
import { createDeathHandlers } from './combatHandlers/deathHandlers';
import { createPenaltyHandlers } from './combatHandlers/penaltyHandlers';
import type { EnemyData } from './types';

interface CombatRefs {
  dogModelRef: React.MutableRefObject<THREE.Group | null>;
  isShieldActiveRef: React.MutableRefObject<boolean>;
  protectionBottleCountRef: React.MutableRefObject<number>;
}

interface CombatCallbacks {
  onConsumeProtectionBottle: () => void;
  onEnemyCollisionPenalty: () => void;
  addFloatingEffect: (options: FloatingEffectOptions) => void;
}

export const createCombatHandlers = (refs: CombatRefs, callbacks: CombatCallbacks) => {
  const { dogModelRef, isShieldActiveRef, protectionBottleCountRef } = refs;
  const { onConsumeProtectionBottle, onEnemyCollisionPenalty, addFloatingEffect } = callbacks;

  // إنشاء معالجات الموت
  const { handleDeath } = createDeathHandlers();

  // إنشاء معالجات العقوبات
  const { penalty, handleDeathEffect } = createPenaltyHandlers({
    dogModelRef,
    isShieldActiveRef,
    protectionBottleCountRef,
    onConsumeProtectionBottle,
    onEnemyCollisionPenalty,
    addFloatingEffect
  });

  // إنشاء معالج موت العدو
  const handleEnemyDeath = (e: EnemyData) => {
    handleDeath(e);
    handleDeathEffect(e);
  };

  // إنشاء معالجات الهجوم
  const { handleAttack, handleCarnivoreAttack, handleHerbivoreAttack } = createAttackHandlers({
    dogModelRef,
    handleDeath,
    penalty
  });

  // إنشاء معالجات التصادم
  const { checkCollisions, updateDeathState } = createCollisionHandlers({
    dogModelRef,
    handleEnemyDeath,
    handleCarnivoreAttack,
    handleHerbivoreAttack
  });

  return { checkCollisions, handleDeath, handleAttack, updateDeathState };
};
