"use client";

import { logger } from "@/utils/logger";
import type { MutableRefObject } from "react";
import * as React from "react";
import * as THREE from "three";

const CAMERA_FOLLOW_OFFSET = new THREE.Vector3(0, 2, -5);
const CAMERA_LERP_FACTOR = 0.15;
const CAMERA_INITIAL_LERP_FACTOR = 0.05; // New constant for initial smooth transition
const POSITION_THRESHOLD_SQUARED = 0.0001;

interface UseCameraLogicProps {
  cameraRef: MutableRefObject<THREE.PerspectiveCamera | null>;
  dogModelRef: MutableRefObject<THREE.Group | null>;
  mountRef: MutableRefObject<HTMLDivElement | null>;
}

const useCameraInitialization = (
  cameraRef: MutableRefObject<THREE.PerspectiveCamera | null>,
  mountRef: MutableRefObject<HTMLDivElement | null>
) => {
  const initializeCamera = React.useCallback(() => {
    if (!mountRef.current) {
      logger.warn("[useCameraLogic] Mount point not ready for camera initialization.");
      return;
    }
    const camera = new THREE.PerspectiveCamera(
      50,
      mountRef.current.clientWidth / mountRef.current.clientHeight,
      0.5,
      250
    );
    cameraRef.current = camera;
    camera.position.set(0, 5, 5);
    camera.lookAt(0, 0, 0);
  }, [cameraRef, mountRef]);

  const resetCamera = React.useCallback(() => {
    if (cameraRef.current) {
      cameraRef.current.position.set(0, 2.5, -5);
      cameraRef.current.lookAt(0, 0, 0);
    }
  }, [cameraRef]);

  return { initializeCamera, resetCamera };
};

const tempOffset = new THREE.Vector3();
const tempTarget = new THREE.Vector3();
const tempLookAt = new THREE.Vector3();

const useCameraUpdate = (
  cameraRef: MutableRefObject<THREE.PerspectiveCamera | null>,
  dogModelRef: MutableRefObject<THREE.Group | null>
) => {
  const setupInitialCameraPosition = React.useCallback(() => {
    if (cameraRef.current && dogModelRef.current) {
      const dog = dogModelRef.current;
      tempOffset.copy(CAMERA_FOLLOW_OFFSET).applyQuaternion(dog.quaternion);
      tempTarget.copy(dog.position).add(tempOffset);
      cameraRef.current.position.lerp(tempTarget, CAMERA_INITIAL_LERP_FACTOR);
      cameraRef.current.lookAt(dog.position);
    }
  }, [cameraRef, dogModelRef]);

  const updateCamera = React.useCallback(
    (delta?: number) => {
      if (!cameraRef.current || !dogModelRef.current) return;
      const dog = dogModelRef.current;
      const camera = cameraRef.current;
      
      tempOffset.copy(CAMERA_FOLLOW_OFFSET).applyQuaternion(dog.quaternion);
      tempTarget.copy(dog.position).add(tempOffset);
      
      const lerpFactor = delta ? CAMERA_LERP_FACTOR * delta * 60 : CAMERA_LERP_FACTOR;
      if (camera.position.distanceToSquared(tempTarget) > POSITION_THRESHOLD_SQUARED) {
        camera.position.lerp(tempTarget, lerpFactor);
      } else {
        camera.position.copy(tempTarget);
      }
      
      tempLookAt.copy(dog.position);
      tempLookAt.y += 1.75;
      camera.lookAt(tempLookAt);
    },
    [cameraRef, dogModelRef]
  );

  return { setupInitialCameraPosition, updateCamera };
};

export const useCameraLogic = ({ cameraRef, dogModelRef, mountRef }: UseCameraLogicProps) => {
  const { initializeCamera, resetCamera } = useCameraInitialization(cameraRef, mountRef);
  const { setupInitialCameraPosition, updateCamera } = useCameraUpdate(cameraRef, dogModelRef);

  return { initializeCamera, setupInitialCameraPosition, updateCamera, resetCamera };
};
