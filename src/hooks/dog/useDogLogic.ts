"use client";

import type { GameObject } from "@/types/game";
import { useCallback, useRef, type MutableRefObject } from "react";
import type * as THREE from "three";
import type { Octree } from "../../lib/Octree";
import { type DogTransform } from "./constants";
import { useDogAnimations } from "./useDogAnimations";
import { useDogAssets } from "./useDogAssets";
import { useDogEffects } from "./useDogEffects";
import { useDogInitialization } from "./useDogInitialization";
import { useDogMovement } from "./useDogMovement";
import { useDogUpdate } from "./useDogUpdate";

interface DogLogicProps {
  sceneRef: MutableRefObject<THREE.Scene | null>;
  keysPressedRef: MutableRefObject<{ [key: string]: boolean }>;
  joystickInputRef: MutableRefObject<{ x: number; y: number } | null>;
  isPausedRef: MutableRefObject<boolean>;
  isSpeedBoostActiveRef: MutableRefObject<boolean>;
  isShieldActiveRef: MutableRefObject<boolean>;
  isJoystickInteractionActiveRef: MutableRefObject<boolean>;
  octreeRef: MutableRefObject<Octree<GameObject> | null>;
  clockRef: MutableRefObject<THREE.Clock>;
}

export const useDogLogic = (props: DogLogicProps) => {
  const {
    sceneRef,
    keysPressedRef,
    joystickInputRef,
    isPausedRef,
    isSpeedBoostActiveRef,
    isShieldActiveRef,
    isJoystickInteractionActiveRef,
    octreeRef,
  } = props;

  const { dogModelRef, gltfLoaderRef, setupModel } = useDogAssets(sceneRef);
  const { animationMixerRef, initAnimations, updateAnimationState, stopAnimations } =
    useDogAnimations();
  const { dogSpeedRef, isRunningRef, applyMovement } = useDogMovement(
    keysPressedRef,
    joystickInputRef,
    isJoystickInteractionActiveRef,
    isSpeedBoostActiveRef
  );

  const lastDogTransformRef = useRef<DogTransform | null>(null);
  useDogEffects(dogModelRef, isShieldActiveRef, isPausedRef);

  const { initializeDog } = useDogInitialization({
    sceneRef,
    dogModelRef,
    gltfLoaderRef,
    lastDogTransformRef,
    setupModel,
    initAnimations,
  });

  const { updateDog } = useDogUpdate({
    dogModelRef,
    animationMixerRef,
    isPausedRef,
    isSpeedBoostActiveRef,
    octreeRef,
    lastDogTransformRef,
    updateAnimationState,
    applyMovement,
  });

  const resetDogState = useCallback(() => {
    if (dogModelRef.current) {
      sceneRef.current?.remove(dogModelRef.current);
      dogModelRef.current.traverse(c => {
        if ((c as THREE.Mesh).isMesh) {
          (c as THREE.Mesh).geometry.dispose();
          const m = (c as THREE.Mesh).material;
          if (Array.isArray(m)) m.forEach(x => x.dispose());
          else (m as THREE.Material).dispose();
        }
      });
      dogModelRef.current = null;
    }
    stopAnimations(null);
    lastDogTransformRef.current = null;
  }, [sceneRef, stopAnimations, dogModelRef]);

  return {
    dogModelRef,
    lastDogTransformRef,
    initializeDog,
    updateDog,
    resetDogState,
    dogSpeed: dogSpeedRef.current,
    isRunning: isRunningRef.current,
  };
};
