import { useRef, useState, useCallback, MutableRefObject } from 'react';
import * as THREE from 'three';
import { v4 as uuidv4 } from 'uuid';
import FloatingEffect from '@/components/game/FloatingEffect'; // Import the FloatingEffect class

export interface FloatingEffectData {
  id: string;
  position: THREE.Vector3;
  effectType: 'coin' | 'Bottle' | 'item' | 'penalty' | 'score';
  value: number;
  animationType: 'floatUp' | 'attractToTarget' | 'followTarget';
  is3DModel?: boolean;
  targetPosition?: THREE.Vector3;
}

interface UseFloatingEffectsProps {
  sceneRef: MutableRefObject<THREE.Scene | null>;
  cameraRef: MutableRefObject<THREE.PerspectiveCamera | null>;
  dogMeshRef?: MutableRefObject<THREE.Object3D | null>; // Added for followTarget
}

export const useFloatingEffects = ({ sceneRef, cameraRef, dogMeshRef }: UseFloatingEffectsProps) => {
  const activeEffects = useRef<Map<string, FloatingEffect>>(new Map());
  const [isSpeedBeamActive, setIsSpeedBeamActive] = useState(false);
  const [isShieldEffectActive, setIsShieldEffectActive] = useState(false);

  const addFloatingEffect = useCallback((
    position: THREE.Vector3,
    effectType: 'coin' | 'Bottle' | 'item' | 'penalty' | 'score',
    value: number,
    animationType: 'floatUp' | 'attractToTarget' | 'followTarget' = 'floatUp',
    is3DModel: boolean = false,
    targetPosition?: THREE.Vector3,
  ) => {
    if (!sceneRef.current || !cameraRef.current) return;

    const id = uuidv4();
    const effect = new FloatingEffect({
      id,
      position: position.clone(), // Clone position to avoid mutation
      effectType,
      value,
      camera: cameraRef.current,
      onComplete: (completedId) => {
        const completedEffect = activeEffects.current.get(completedId);
        if (completedEffect) {
          sceneRef.current?.remove(completedEffect.mesh);
          completedEffect.dispose();
          activeEffects.current.delete(completedId);
        }
      },
      animationType,
      is3DModel,
      targetMesh: animationType === 'followTarget' ? dogMeshRef?.current || undefined : undefined,
      targetPosition,
    });

    activeEffects.current.set(id, effect);
    sceneRef.current.add(effect.mesh);
  }, [sceneRef, cameraRef, dogMeshRef]);

  const updateFloatingEffects = useCallback(() => {
    activeEffects.current.forEach(effect => {
      effect.update();
    });
  }, []);

  // New functions for continuous effects
  const activateMagnetEffect = useCallback((coinPosition: THREE.Vector3, dogPosition: THREE.Vector3) => {
    // This function will likely trigger addFloatingEffect for each coin
    // that needs to be attracted. The actual attraction logic is in FloatingEffect.
    // This function might be more about signaling the game logic to call addFloatingEffect
    // for nearby coins with the 'attractToTarget' animationType.
    // For now, it's a placeholder to align with the plan.
    console.log(`Magnet effect activated for coin at ${coinPosition.x}, dog at ${dogPosition.x}`);
  }, []);

  const deactivateMagnetEffect = useCallback(() => {
    console.log('Magnet effect deactivated');
  }, []);

  const activateSpeedBeam = useCallback(() => {
    setIsSpeedBeamActive(true);
    console.log('Speed beam activated');
  }, []);

  const deactivateSpeedBeam = useCallback(() => {
    setIsSpeedBeamActive(false);
    console.log('Speed beam deactivated');
  }, []);

  const activateShieldEffect = useCallback(() => {
    setIsShieldEffectActive(true);
    console.log('Shield effect activated');
  }, []);

  const deactivateShieldEffect = useCallback(() => {
    setIsShieldEffectActive(false);
    console.log('Shield effect deactivated');
  }, []);

  // Cleanup on unmount
  const cleanupFloatingEffects = useCallback(() => {
    activeEffects.current.forEach(effect => {
      sceneRef.current?.remove(effect.mesh);
      effect.dispose();
    });
    activeEffects.current.clear();
  }, [sceneRef]);

  return {
    addFloatingEffect,
    updateFloatingEffects,
    cleanupFloatingEffects,
    activateMagnetEffect,
    deactivateMagnetEffect,
    activateSpeedBeam,
    deactivateSpeedBeam,
    activateShieldEffect,
    deactivateShieldEffect,
    isSpeedBeamActive, // Expose state for components to read
    isShieldEffectActive, // Expose state for components to read
  };
};
