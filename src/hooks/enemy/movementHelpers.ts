import * as THREE from 'three';
import { CROSSFADE_DURATION, ENEMY_ANIMATION_NAMES } from './constants';
import type { EnemyData } from './types';

const ray = new THREE.Raycaster();
const down = new THREE.Vector3(0, -1, 0);

export const clampGround = (e: EnemyData, s: THREE.Scene | null) => {
  if (!s) return;
  const o = e.position.clone();
  o.y += 5;
  ray.set(o, down);
  const targets: THREE.Object3D[] = [];
  s.traverse((obj) => {
    if (obj.name.includes('Landscape') || obj.name === 'Ground') {
      targets.push(obj);
    }
  });
  const [h] = ray.intersectObjects(targets, true);
  if (h) e.position.y = h.point.y;
};

export const getAnim = (e: EnemyData, st: 'IDLE' | 'WALK' | 'GALLOP' | 'ATTACK') => {
  const c = e.enemyType === 'carnivore' ? ENEMY_ANIMATION_NAMES.CARNIVORE : ENEMY_ANIMATION_NAMES.HERBIVORE;
  const n = c[st];
  return Array.isArray(n) ? n[0] : n;
};

export const switchAnim = (e: EnemyData, n: string | undefined) => {
  if (!n) return;
  const a = e.actions[n];
  if (!a || (e.currentAction?.getClip().name ?? '') === a.getClip().name) return;
  e.currentAction?.fadeOut(CROSSFADE_DURATION);
  a.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).fadeIn(CROSSFADE_DURATION).play();
  e.currentAction = a;
};

export const setAnim = (e: EnemyData, st: 'IDLE' | 'WALK' | 'GALLOP' | 'ATTACK') => 
  switchAnim(e, getAnim(e, st));
