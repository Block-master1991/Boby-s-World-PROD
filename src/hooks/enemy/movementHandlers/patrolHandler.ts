import * as THREE from "three";
import { ENEMY_PROTECTION_RADIUS, ENEMY_SPEED } from "../constants";
import type { EnemyData } from "../types";
import { setAnim } from "../movementHelpers";

export const handlePatrol = (e: EnemyData, dt: number) => {
  if (e.isIdling) {
    e.idleTimer -= dt;
    if (e.idleTimer <= 0) {
      e.isIdling = false;
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.random() * ENEMY_PROTECTION_RADIUS;
      const newPatrolX = e.patrolCenter.x + Math.cos(angle) * radius;
      const newPatrolZ = e.patrolTarget.z + Math.sin(angle) * radius;
      e.patrolTarget.set(newPatrolX, e.lod.position.y, newPatrolZ);
      setAnim(e, "WALK");
    } else {
      setAnim(e, "IDLE");
    }
    return;
  }

  const d = new THREE.Vector3().subVectors(e.patrolTarget, e.lod.position);
  d.y = 0;
  const movementThreshold = 0.001;

  if (d.lengthSq() <= movementThreshold) {
    e.isIdling = true;
    e.idleDuration = Math.random() * 5 + 3;
    e.idleTimer = e.idleDuration;
    setAnim(e, "IDLE");
  } else {
    d.normalize();
    e.lod.position.addScaledVector(d, ENEMY_SPEED * dt);
    e.position.copy(e.lod.position);
    e.lookAt(e.patrolTarget);
    setAnim(e, "WALK");
  }
};
