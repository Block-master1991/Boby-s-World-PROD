import type * as THREE from "three";

export interface DynamicLoadableObject {
  id: number | string;
  modelPath: string;
  logicalPosition: THREE.Vector3;
  modelInstance: THREE.Group | null;
  isModelInstantiated: boolean;
  scale?: THREE.Vector3;
  rotationY?: number;
  animations?: THREE.AnimationClip[];
  mixer?: THREE.AnimationMixer | null;
  currentAction?: THREE.AnimationAction | null;
  actions?: { [key: string]: THREE.AnimationAction };
  enemyType?: "carnivore" | "herbivore";
  isPooled?: boolean;
  lastPooledTime?: number;
}

export type ModelPool = {
  [modelPath: string]: {
    geometry: THREE.BufferGeometry | null;
    materials: THREE.Material[];
    animations: THREE.AnimationClip[];
    instances: (THREE.Group & { lastPooledTime?: number })[];
  };
};

export const DRACO_DECODER_PATH = "/libs/draco/gltf/";

export const ENEMY_ANIMATION_NAMES = {
  CARNIVORE: {
    IDLE: ["Idle", "Idle_2", "Idle_2_HeadLow", "Eating"],
    WALK: "Walk",
    GALLOP: "Gallop",
    ATTACK: "Attack",
    DEATH: "Death",
  },
  HERBIVORE: {
    IDLE: ["Idle", "Idle_2", "Idle_HeadLow", "Eating"],
    WALK: "Walk",
    GALLOP: "Gallop",
    ATTACK: "Attack_Kick",
    DEATH: "Death",
  },
} as const;
