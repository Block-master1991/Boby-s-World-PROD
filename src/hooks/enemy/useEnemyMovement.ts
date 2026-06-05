import type { Octree } from "@/lib/Octree";
import type { GameObject } from "@/types/game";
import type * as THREE from "three";
import { createMovementUpdater } from "./movementHandlers/movementUpdater";
import { setAnim } from "./movementHelpers";

interface Props {
  dogModelRef: React.MutableRefObject<THREE.Group | null>;
  octreeRef: React.MutableRefObject<Octree<GameObject> | null>;
  sceneRef: React.MutableRefObject<THREE.Scene | null>;
  isPausedRef: React.MutableRefObject<boolean>;
  cameraRef: React.MutableRefObject<THREE.PerspectiveCamera | null>;
}

export const useEnemyMovement = ({
  dogModelRef,
  octreeRef,
  sceneRef,
  isPausedRef,
  cameraRef,
}: Props) => {
  const { updateMovement } = createMovementUpdater({
    dogModelRef,
    sceneRef,
    isPausedRef,
    cameraRef,
    octreeRef,
  });

  return {
    updateEnemyMovement: updateMovement,
    updateAnimationState: setAnim,
  };
};
