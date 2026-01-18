import { logger } from '@/utils/logger';
import { useCallback } from 'react';
import * as THREE from 'three';
import type { FloatingEffectOptions } from '../coin/useCoinInteraction';
import { ENEMY_ANIMATION_NAMES, ENEMY_ATTACK_DISTANCE, ENEMY_DEATH_DURATION, ENEMY_DEATH_TRIGGER_DISTANCE } from './constants';
import type { EnemyData } from './types';

interface Props { dogModelRef: React.MutableRefObject<THREE.Group | null>; isShieldActiveRef: React.MutableRefObject<boolean>; protectionBottleCountRef: React.MutableRefObject<number>; onConsumeProtectionBottle: () => void; onEnemyCollisionPenalty: () => void; addFloatingEffect: (options: FloatingEffectOptions) => void; onCoinCollected: () => void; }

const playDeath = (e: EnemyData) => { const c = e.enemyType === 'carnivore' ? ENEMY_ANIMATION_NAMES.CARNIVORE : ENEMY_ANIMATION_NAMES.HERBIVORE; const a = e.actions[c.DEATH]; if (a) { e.currentAction?.fadeOut(0.2); a.reset().setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; a.play(); e.currentAction = a; } };

const playAttack = (e: EnemyData) => { const c = e.enemyType === 'carnivore' ? ENEMY_ANIMATION_NAMES.CARNIVORE : ENEMY_ANIMATION_NAMES.HERBIVORE; const a = e.actions[c.ATTACK]; if (a) { e.isAttacking = true; e.currentAction?.fadeOut(0.1); a.reset().setLoop(THREE.LoopOnce, 1).play(); e.currentAction = a; setTimeout(() => { if (e && !e.isDying) e.isAttacking = false; }, a.getClip().duration * 1000); } };

export const useEnemyCombat = ({ dogModelRef, isShieldActiveRef, protectionBottleCountRef, onConsumeProtectionBottle, onEnemyCollisionPenalty, addFloatingEffect }: Props) => {
  const handleDeath = useCallback((e: EnemyData) => { if (e.isDying) return; e.isDying = true; e.deathTimer = 0; playDeath(e); logger.log(`[useEnemyCombat] Enemy ${e.uuid} killed.`); }, []);

  const handleAttack = useCallback((e: EnemyData) => { if (e.isAttacking || e.isDying) return; playAttack(e); }, []);

  const penalty = useCallback((e: EnemyData) => {
    if (isShieldActiveRef.current) { logger.debug('Attack blocked'); return; }
    if (protectionBottleCountRef.current > 0) { onConsumeProtectionBottle(); addFloatingEffect({ position: e.position.clone().add(new THREE.Vector3(0, 2, 0)), effectType: 'Bottle', value: -1, animationType: 'floatUp', is3DModel: true }); return; }
    if (!e.lastAttackTime || Date.now() - e.lastAttackTime > 2000) { onEnemyCollisionPenalty(); const p = dogModelRef.current?.position; if (p) addFloatingEffect({ position: p.clone().add(new THREE.Vector3(0, 1, 0)), effectType: 'penalty', value: -50, animationType: 'floatUp' }); }
  }, [isShieldActiveRef, protectionBottleCountRef, onConsumeProtectionBottle, onEnemyCollisionPenalty, addFloatingEffect, dogModelRef]);

  const checkCollisions = useCallback((e: EnemyData, dist: number) => {
    if (e.isDying || !dogModelRef.current) return;
    if (e.enemyType === 'carnivore' && dist < ENEMY_ATTACK_DISTANCE && !e.isAttacking) { handleAttack(e); penalty(e); }
    if (dist < ENEMY_DEATH_TRIGGER_DISTANCE && dogModelRef.current.position.y > e.position.y + 0.5) handleDeath(e);
  }, [dogModelRef, handleAttack, handleDeath, penalty]);

  const updateDeathState = useCallback((e: EnemyData, dt: number) => {
    if (!e.isDying) return false;
    e.deathTimer += dt;
    if (e.deathTimer >= ENEMY_DEATH_DURATION && !e.isSinking) { e.isSinking = true; e.sinkingTimer = 1; e.initialDeathY = e.lod.position.y; }
    if (e.isSinking) { if (e.sinkingTimer > 0) e.sinkingTimer -= dt; else { e.position.y -= dt; e.lod.position.y = e.position.y; if (e.lod.position.y < e.initialDeathY - 5) return true; } }
    return false;
  }, []);

  return { checkCollisions, handleDeath, handleAttack, updateDeathState };
};
