import type { BaseGameObject } from "@/types/game";
import type * as THREE from "three";

export interface EnemyCustomData {
  targetCoinId: string; // New: Unique ID of the coin this enemy is protecting
  targetCoinPosition: THREE.Vector3; // Keep for initial positioning and patrol
  patrolCenter: THREE.Vector3;
  patrolTarget: THREE.Vector3;
  isIdling: boolean;
  idleTimer: number;
  idleDuration: number;
  isAttacking: boolean;
  isDying: boolean;
  deathTimer: number;
  hasAppliedDeathEffect: boolean;
  isSinking: boolean; // New: Flag for sinking animation
  sinkingTimer: number; // New: Timer for sinking delay
  initialDeathY: number; // New: Initial Y position when death animation finishes
  mixer: THREE.AnimationMixer;
  animations: THREE.AnimationClip[];
  enemyType: "carnivore" | "herbivore";
  currentAction: THREE.AnimationAction | null;
  actions: { [key: string]: THREE.AnimationAction };
  chunkKey: string;
  // Add a reference to the high-detail model within the LOD for mixer
  highDetailModel: THREE.Group;
}

export interface EnemyData extends EnemyCustomData, BaseGameObject {
  lod: THREE.LOD; // The LOD object itself
  position: THREE.Vector3; // Position of the enemy
  visible: boolean; // Visibility state of the enemy
  lookAt: (target: THREE.Vector3) => void; // Method to make enemy look at target
  rotation: THREE.Euler; // Rotation of the enemy
  scale: THREE.Vector3; // Scale of the enemy
  type: string; // Type of the enemy
  isPooled: boolean; // Whether the enemy is pooled
  isModelInstantiated: boolean; // Whether the model is instantiated
  lastAttackTime?: number; // Timestamp of last attack
}
