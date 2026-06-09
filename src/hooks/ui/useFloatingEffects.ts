import FloatingEffect from "@/components/game/FloatingEffect"; // Import the FloatingEffect class
import { logger } from "@/utils/logger";
import type { MutableRefObject } from "react";
import { useCallback, useRef, useState } from "react";
import type * as THREE from "three";
import { v4 as uuidv4 } from "uuid";

export interface FloatingEffectData {
  id: string;
  position: THREE.Vector3;
  effectType: "coin" | "Bottle" | "item" | "penalty" | "score";
  value: number;
  animationType: "floatUp" | "attractToTarget" | "followTarget";
  is3DModel?: boolean;
  targetPosition?: THREE.Vector3 | undefined;
  targetMesh?: THREE.Object3D | undefined;
}

interface UseFloatingEffectsProps {
  sceneRef: MutableRefObject<THREE.Scene | null>;
  cameraRef: MutableRefObject<THREE.PerspectiveCamera | null>;
}

interface AddEffectOptions {
  position: THREE.Vector3;
  effectType: "coin" | "Bottle" | "item" | "penalty" | "score";
  value: number;
  animationType?: "floatUp" | "attractToTarget" | "followTarget";
  is3DModel?: boolean;
  targetPosition?: THREE.Vector3 | undefined;
  targetMesh?: THREE.Object3D | undefined;
}

const useContinuousEffects = () => {
  const [isSpeedBeamActive, setIsSpeedBeamActive] = useState(false);
  const [isShieldEffectActive, setIsShieldEffectActive] = useState(false);

  const activateMagnetEffect = useCallback(() => {
    logger.log("Magnet mode activated");
  }, []);

  const deactivateMagnetEffect = useCallback(() => logger.log("Magnet deactivated"), []);
  const activateSpeedBeam = useCallback(() => {
    setIsSpeedBeamActive(true);
    logger.log("Speed beam activated");
  }, []);
  const deactivateSpeedBeam = useCallback(() => {
    setIsSpeedBeamActive(false);
    logger.log("Speed beam deactivated");
  }, []);
  const activateShieldEffect = useCallback(() => {
    setIsShieldEffectActive(true);
    logger.log("Shield activated");
  }, []);
  const deactivateShieldEffect = useCallback(() => {
    setIsShieldEffectActive(false);
    logger.log("Shield deactivated");
  }, []);

  return {
    isSpeedBeamActive,
    isShieldEffectActive,
    activateMagnetEffect,
    deactivateMagnetEffect,
    activateSpeedBeam,
    deactivateSpeedBeam,
    activateShieldEffect,
    deactivateShieldEffect,
  };
};

export const useFloatingEffects = ({ sceneRef, cameraRef }: UseFloatingEffectsProps) => {
  const activeEffects = useRef<Map<string, FloatingEffect>>(new Map());
  const continuousEffects = useContinuousEffects();

  const addFloatingEffect = useCallback(
    (options: AddEffectOptions) => {
      if (!sceneRef.current || !cameraRef.current) return;
      const id = uuidv4();
      const effect = new FloatingEffect({
        ...options,
        id,
        camera: cameraRef.current,
        animationType: options.animationType ?? "floatUp",
        onComplete: doneId => {
          const item = activeEffects.current.get(doneId);
          if (item) {
            sceneRef.current?.remove(item.mesh);
            item.dispose();
            activeEffects.current.delete(doneId);
          }
        },
      });
      activeEffects.current.set(id, effect);
      sceneRef.current.add(effect.mesh);
    },
    [sceneRef, cameraRef]
  );

  const updateFloatingEffects = useCallback(() => {
    activeEffects.current.forEach(e => e.update());
  }, []);

  const cleanupFloatingEffects = useCallback(() => {
    activeEffects.current.forEach(e => {
      sceneRef.current?.remove(e.mesh);
      e.dispose();
    });
    activeEffects.current.clear();
  }, [sceneRef]);

  return { addFloatingEffect, updateFloatingEffects, cleanupFloatingEffects, ...continuousEffects };
};
