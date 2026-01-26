import { logger } from '@/utils/logger';
import { useCallback } from 'react';
import * as THREE from 'three';
import { ENEMY_ANIMATION_NAMES, ENEMY_DEATH_DURATION } from '../constants';
import type { EnemyData } from '../types';

const playDeath = (e: EnemyData) => {
  const c = e.enemyType === 'carnivore' ? ENEMY_ANIMATION_NAMES.CARNIVORE : ENEMY_ANIMATION_NAMES.HERBIVORE;
  const a = e.actions[c.DEATH];
  if (a) {
    e.currentAction?.fadeOut(0.2);
    a.reset().setLoop(THREE.LoopOnce, 1);
    a.clampWhenFinished = true;
    a.play();
    e.currentAction = a;
  }
};

export const createDeathHandlers = () => {
  const handleDeath = useCallback((e: EnemyData) => {
    if (e.isDying) return;
    e.isDying = true;
    e.deathTimer = ENEMY_DEATH_DURATION;
    playDeath(e);
    logger.log(`[useEnemyCombat] Enemy ${e.uuid} killed.`);
  }, []);

  return { handleDeath };
};
