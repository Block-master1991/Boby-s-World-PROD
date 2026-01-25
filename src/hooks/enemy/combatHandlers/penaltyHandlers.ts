import { useCallback } from 'react';
import * as THREE from 'three';
import type { FloatingEffectOptions } from '../../coin/useCoinInteraction';
import type { EnemyData } from '../types';

interface PenaltyHandlersParams {
  dogModelRef: React.MutableRefObject<THREE.Group | null>;
  isShieldActiveRef: React.MutableRefObject<boolean>;
  protectionBottleCountRef: React.MutableRefObject<number>;
  onConsumeProtectionBottle: () => void;
  onEnemyCollisionPenalty: () => void;
  addFloatingEffect: (options: FloatingEffectOptions) => void;
}

export const createPenaltyHandlers = (params: PenaltyHandlersParams) => {
  const { 
    dogModelRef, isShieldActiveRef, protectionBottleCountRef, 
    onConsumeProtectionBottle, onEnemyCollisionPenalty, addFloatingEffect 
  } = params;

  const penalty = useCallback((e: EnemyData) => {
    if (isShieldActiveRef.current) {
      return;
    }
    if (protectionBottleCountRef.current > 0) {
      onConsumeProtectionBottle();
      addFloatingEffect({
        position: e.position.clone().add(new THREE.Vector3(0, 2, 0)),
        effectType: 'Bottle',
        value: -1,
        animationType: 'floatUp',
        is3DModel: true
      });
      return;
    }
    if (!e.lastAttackTime || Date.now() - e.lastAttackTime > 2000) {
      onEnemyCollisionPenalty();
      const p = dogModelRef.current?.position;
      if (p) addFloatingEffect({
        position: p.clone().add(new THREE.Vector3(0, 1, 0)),
        effectType: 'penalty',
        value: -50,
        animationType: 'floatUp'
      });
    }
  }, [isShieldActiveRef, protectionBottleCountRef, onConsumeProtectionBottle, onEnemyCollisionPenalty, addFloatingEffect, dogModelRef]);

  const handleDeathEffect = useCallback((e: EnemyData) => {
    if (e.hasAppliedDeathEffect) return;

    if (isShieldActiveRef.current) {
      // الدرع يحمي من العقوبة
    } else if (protectionBottleCountRef.current > 0) {
      protectionBottleCountRef.current--;
      onConsumeProtectionBottle();
      if (dogModelRef.current) {
        addFloatingEffect({
          position: dogModelRef.current.position.clone().add(new THREE.Vector3(0, 2, 0)),
          effectType: 'Bottle',
          value: -1,
          animationType: 'followTarget',
          is3DModel: true,
          targetMesh: dogModelRef.current
        });
      }
    } else {
      onEnemyCollisionPenalty();
      if (dogModelRef.current) {
        addFloatingEffect({
          position: dogModelRef.current.position.clone().add(new THREE.Vector3(0, 1, 0)),
          effectType: 'penalty',
          value: -50,
          animationType: 'followTarget',
          is3DModel: false
        });
      }
    }
    e.hasAppliedDeathEffect = true;
  }, [isShieldActiveRef, protectionBottleCountRef, onConsumeProtectionBottle, onEnemyCollisionPenalty, addFloatingEffect, dogModelRef]);

  return { penalty, handleDeathEffect };
};
