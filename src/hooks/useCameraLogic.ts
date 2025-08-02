
'use client';

import * as React from 'react';
import * as THREE from 'three';
import type { MutableRefObject } from 'react';

const CAMERA_FOLLOW_OFFSET = new THREE.Vector3(0, 2, -5);
const CAMERA_LERP_FACTOR = 0.15;
const CAMERA_INITIAL_LERP_FACTOR = 0.05; // New constant for initial smooth transition
const POSITION_THRESHOLD_SQUARED = 0.0001;

interface UseCameraLogicProps {
  cameraRef: MutableRefObject<THREE.PerspectiveCamera | null>;
  dogModelRef: MutableRefObject<THREE.Group | null>;
  mountRef: MutableRefObject<HTMLDivElement | null>;
}

export const useCameraLogic = ({
  cameraRef,
  dogModelRef,
  mountRef,
}: UseCameraLogicProps) => {

  const initializeCamera = React.useCallback(() => {
    if (!mountRef.current) {
        console.warn("[useCameraLogic] Mount point not ready for camera initialization.");
        return;
    }

    const camera = new THREE.PerspectiveCamera(
      50,
      mountRef.current.clientWidth / mountRef.current.clientHeight,
      0.1,
      75
    );
    cameraRef.current = camera;
    camera.position.set(0, 5, 5);
    camera.lookAt(0, 0, 0);

  }, [cameraRef, mountRef, dogModelRef]); // Added dogModelRef to dependencies
  
  const setupInitialCameraPosition = React.useCallback(() => {
    if (cameraRef.current && dogModelRef.current) {
        const dog = dogModelRef.current;
        const worldOffset = CAMERA_FOLLOW_OFFSET.clone().applyQuaternion(dog.quaternion);
        const targetCameraPosition = dog.position.clone().add(worldOffset);
        
        // Smoothly interpolate to the final position from the current (midpoint) position
        cameraRef.current.position.lerp(targetCameraPosition, CAMERA_INITIAL_LERP_FACTOR);
        cameraRef.current.lookAt(dog.position);
    }
  }, [cameraRef, dogModelRef]);


  const updateCamera = React.useCallback(() => {
    if (!cameraRef.current || !dogModelRef.current) return;

    const dog = dogModelRef.current;
    const camera = cameraRef.current;

    const worldOffset = CAMERA_FOLLOW_OFFSET.clone().applyQuaternion(dog.quaternion);
    const cameraTargetPosition = dog.position.clone().add(worldOffset);
    
    if (camera.position.distanceToSquared(cameraTargetPosition) > POSITION_THRESHOLD_SQUARED) {
        camera.position.lerp(cameraTargetPosition, CAMERA_LERP_FACTOR);
    } else {
        camera.position.copy(cameraTargetPosition);
    }
    
camera.lookAt(dog.position.clone().add(new THREE.Vector3(0, 1.75, 0)));

  }, [cameraRef, dogModelRef]);

  const resetCamera = React.useCallback(() => {
    if (cameraRef.current) {
        cameraRef.current.position.set(0, 2.5, -5);
        cameraRef.current.lookAt(0, 0, 0);
    }
  }, [cameraRef]);


  return {
    initializeCamera,
    setupInitialCameraPosition,
    updateCamera,
    resetCamera,
  };
};
