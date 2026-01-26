import * as THREE from 'three';
import { ENEMY_ATTACK_DISTANCE, ENEMY_CHASE_RADIUS } from '../constants';
import { setAnim } from '../movementHelpers';
import type { EnemyData } from '../types';

export const handleIdleState = (e: EnemyData, dt: number, currentAnimation: string) => {
  if (e.isIdling) {
    e.idleTimer -= dt;
    if (e.idleTimer <= 0) {
      e.isIdling = false;
      const angle = Math.random() * Math.PI * 2;
      // تحسين نصف قطر الدورية ليكون مناسباً لحماية العملة
      const radius = 3 + Math.random() * 5; // بين 3-8 وحدات من مركز الدورية
      const newPatrolX = e.patrolCenter.x + Math.cos(angle) * radius;
      // تصحيح الخطأ: كان يستخدم e.patrolTarget.z بدلاً من e.patrolCenter.z
      const newPatrolZ = e.patrolCenter.z + Math.sin(angle) * radius;
      e.patrolTarget.set(newPatrolX, e.lod.position.y, newPatrolZ);
      return 'Walk';
    }
    return e.currentAction?.getClip().name || 'Idle';
  }
  return currentAnimation;
};

export const handlePatrolMovement = (e: EnemyData, targetPosition: THREE.Vector3) => {
  if (e.lod.position.distanceTo(e.patrolTarget) < 1.0 || e.patrolTarget.lengthSq() === 0) {
    e.isIdling = true;
    e.idleDuration = Math.random() * 5 + 3;
    e.idleTimer = e.idleDuration;
    setAnim(e, 'IDLE');
    return false;
  }
  targetPosition.copy(e.patrolTarget);
  return true;
};

export const clampGround = (enemy: EnemyData, scene: THREE.Scene | null) => {
  if (!scene) return;
  const origin = enemy.position.clone();
  origin.y += 5;
  const raycaster = new THREE.Raycaster();
  const down = new THREE.Vector3(0, -1, 0);
  raycaster.set(origin, down);

  // التحقق من أن النموذج جاهز قبل استخدام raycaster
  if (!enemy.lod || !enemy.lod.children || enemy.lod.children.length === 0) {
    return;
  }

  // البحث عن كائنات الأرض فقط لتجنب فحص نماذج الأعداء التي قد تسبب أخطاء
  const targets: THREE.Object3D[] = [];
  scene.traverse((object) => {
    if (object.name.includes('Landscape') || object.name === 'Ground') {
      targets.push(object);
    }
  });

  const [hit] = raycaster.intersectObjects(targets, true);
  if (hit) enemy.position.y = hit.point.y;
};

// تعريف واجهة لجميع المعلمات
interface MovementParams {
  enemy: EnemyData;
  distance: number;
  deltaTime: number;
  targetPosition: THREE.Vector3;
  dogPosition: THREE.Vector3;
}

export const determineMovement = (params: MovementParams) => {
  const { enemy: e, distance: dist, deltaTime: dt, targetPosition, dogPosition } = params;
  let currentAnimation = '';
  let isMoving = false;

  if (dist < ENEMY_ATTACK_DISTANCE) {
    targetPosition.copy(e.lod.position);
    currentAnimation = e.enemyType === 'carnivore' ? 'Attack' : 'Attack_Kick';
  } else if (dist < ENEMY_CHASE_RADIUS) {
    targetPosition.copy(dogPosition);
    isMoving = true;
    currentAnimation = 'Gallop';
    e.isIdling = false;
  } else {
    currentAnimation = handleIdleState(e, dt, currentAnimation);
    if (!e.isIdling) {
      isMoving = handlePatrolMovement(e, targetPosition);
      if (isMoving) currentAnimation = 'Walk';
    }
  }
  return { currentAnimation, isMoving };
};
