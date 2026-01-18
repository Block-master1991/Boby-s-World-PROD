import type { Octree } from '@/lib/Octree';
import type { GameObject } from '@/types/game';
import { useCallback } from 'react';
import * as THREE from 'three';
import { CROSSFADE_DURATION, ENEMY_ANIMATION_NAMES, ENEMY_ATTACK_DISTANCE, ENEMY_CHASE_RADIUS, ENEMY_GALLOP_SPEED_MULTIPLIER, ENEMY_SPEED } from './constants';
import type { EnemyData } from './types';

interface Props { dogModelRef: React.MutableRefObject<THREE.Group | null>; octreeRef: React.MutableRefObject<Octree<GameObject> | null>; sceneRef: React.MutableRefObject<THREE.Scene | null>; isPausedRef: React.MutableRefObject<boolean>; cameraRef: React.MutableRefObject<THREE.PerspectiveCamera | null>; }

const ray = new THREE.Raycaster();
const down = new THREE.Vector3(0, -1, 0);

const clampGround = (e: EnemyData, s: THREE.Scene | null) => { if (!s) return; const o = e.position.clone(); o.y += 5; ray.set(o, down); const h = ray.intersectObjects(s.children, true).find(x => x.object.name.includes('Landscape') || x.object.name === 'Ground'); if (h) e.position.y = h.point.y; };

const getAnim = (e: EnemyData, st: 'IDLE' | 'WALK' | 'GALLOP' | 'ATTACK') => { const c = e.enemyType === 'carnivore' ? ENEMY_ANIMATION_NAMES.CARNIVORE : ENEMY_ANIMATION_NAMES.HERBIVORE; const n = c[st]; return Array.isArray(n) ? n[0] : n; };

const switchAnim = (e: EnemyData, n: string | undefined) => { if (!n) return; const a = e.actions[n]; if (!a || (e.currentAction?.getClip().name ?? '') === a.getClip().name) return; e.currentAction?.fadeOut(CROSSFADE_DURATION); a.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).fadeIn(CROSSFADE_DURATION).play(); e.currentAction = a; };

const setAnim = (e: EnemyData, st: 'IDLE' | 'WALK' | 'GALLOP' | 'ATTACK') => switchAnim(e, getAnim(e, st));

const patrol = (e: EnemyData, dt: number) => {
  if (e.isIdling) { e.idleTimer += dt; if (e.idleTimer >= e.idleDuration) { e.isIdling = false; e.idleTimer = 0; setAnim(e, 'WALK'); } return; }
  const d = new THREE.Vector3().subVectors(e.patrolTarget, e.position); d.y = 0;
  if (d.length() < 0.5) {
    e.isIdling = true; e.idleDuration = 2 + Math.random() * 3; setAnim(e, 'IDLE');
    const a = Math.random() * Math.PI * 2, r = 5 + Math.random() * 10;
    e.patrolTarget.copy(e.patrolCenter).add(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
  } else { d.normalize(); e.position.addScaledVector(d, ENEMY_SPEED * dt); e.lookAt(e.patrolTarget); setAnim(e, 'WALK'); }
};

const chase = (e: EnemyData, dist: number, dt: number, dog: THREE.Group | null) => {
  if (!dog || dist < ENEMY_ATTACK_DISTANCE) return;
  const d = new THREE.Vector3().subVectors(dog.position, e.position); d.y = 0; d.normalize();
  e.position.addScaledVector(d, ENEMY_SPEED * ENEMY_GALLOP_SPEED_MULTIPLIER * dt); e.lookAt(dog.position); setAnim(e, 'GALLOP');
};

export const useEnemyMovement = ({ dogModelRef, sceneRef, isPausedRef, cameraRef }: Props) => {
  const updateEnemyMovement = useCallback((e: EnemyData, dt: number, dist: number) => {
    if (isPausedRef.current || e.isDying || e.isAttacking) return;
    if (e.enemyType === 'carnivore' && dist < ENEMY_CHASE_RADIUS) chase(e, dist, dt, dogModelRef.current);
    else patrol(e, dt);
    clampGround(e, sceneRef.current);
    if (cameraRef.current) e.lod.update(cameraRef.current);
  }, [dogModelRef, sceneRef, isPausedRef, cameraRef]);

  return { updateEnemyMovement, updateAnimationState: setAnim };
};
