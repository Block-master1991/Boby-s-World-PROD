import type * as THREE from 'three';

export interface BaseGameObject {
  // Use uuid instead of id as a unique string identifier
  uuid: string;
}

export interface GameObject extends BaseGameObject {
  // Transform properties
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  scale: { x: number; y: number; z: number };

  // Object classification
  type: 'player' | 'enemy' | 'item' | 'terrain' | 'staticTree';

  // Visibility and rendering
  visible: boolean;

  // For collision detection with Octree
  bounds?: THREE.Box3;

  // For model references
  modelPath?: string;
  modelInstance?: THREE.Object3D | null;

  // For animated objects
  animations?: THREE.AnimationClip[];
  mixer?: THREE.AnimationMixer | null;
  currentAction?: THREE.AnimationAction | null;
  actions?: { [key: string]: THREE.AnimationAction };

  // Specific to enemy types
  enemyType?: 'carnivore' | 'herbivore';

  // For object pooling optimization
  isPooled?: boolean;
  lastPooledTime?: number;

  // Game-specific properties
  isModelInstantiated?: boolean;
}

export interface Chunk {
  id: string;
  x: number;
  z: number;
}
