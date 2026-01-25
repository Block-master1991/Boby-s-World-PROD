import type { Octree } from '@/lib/Octree';
import type { GameObject } from '@/types/game';
import type * as THREE from 'three';
import { setAnim } from './movementHelpers';
import { createMovementUpdater } from './movementHandlers/movementUpdater';

interface Props { 
  dogModelRef: React.MutableRefObject<THREE.Group | null>; 
  octreeRef: React.MutableRefObject<Octree<GameObject> | null>; 
  sceneRef: React.MutableRefObject<THREE.Scene | null>; 
  isPausedRef: React.MutableRefObject<boolean>; 
  cameraRef: React.MutableRefObject<THREE.PerspectiveCamera | null>; 
}

export const useEnemyMovement = ({ dogModelRef, sceneRef, isPausedRef, cameraRef }: Props) => {
  const { updateMovement } = createMovementUpdater({
    dogModelRef,
    sceneRef,
    isPausedRef,
    cameraRef
  });

  return { 
    updateEnemyMovement: updateMovement, 
    updateAnimationState: setAnim 
  };
};
