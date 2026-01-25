import * as THREE from 'three';
import { ENEMY_ATTACK_DISTANCE, ENEMY_GALLOP_SPEED_MULTIPLIER, ENEMY_SPEED } from '../constants';
import type { EnemyData } from '../types';
import { setAnim } from '../movementHelpers';

export const handleChase = (e: EnemyData, dist: number, dt: number, dog: THREE.Group | null) => {
  if (!dog || dist < ENEMY_ATTACK_DISTANCE) return;
  const d = new THREE.Vector3().subVectors(dog.position, e.lod.position);
  d.y = 0;
  d.normalize();
  e.lod.position.addScaledVector(d, ENEMY_SPEED * ENEMY_GALLOP_SPEED_MULTIPLIER * dt);
  e.position.copy(e.lod.position);
  e.lookAt(dog.position);
  setAnim(e, 'GALLOP');
};
