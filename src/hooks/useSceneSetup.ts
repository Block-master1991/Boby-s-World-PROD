"use client";

import { getDevicePerformanceConfig } from "@/lib/utils";
import type { GameObject } from "@/types/game";
import { logger } from "@/utils/logger";
import type { MutableRefObject } from "react";
import * as React from "react";
import * as THREE from "three";
import { Octree } from "../lib/Octree";

interface UseSceneSetupProps {
  mountRef: MutableRefObject<HTMLDivElement | null>;
  sceneRef: MutableRefObject<THREE.Scene | null>;
  cameraRef: MutableRefObject<THREE.PerspectiveCamera | null>;
  rendererRef: MutableRefObject<THREE.WebGLRenderer | null>;
  octreeRef: MutableRefObject<Octree<GameObject> | null>;
  isPausedRef: MutableRefObject<boolean>;
  isJoystickInteractionActiveRef: MutableRefObject<boolean>;
}

const configureRenderer = (
  renderer: THREE.WebGLRenderer,
  perfConfig: ReturnType<typeof getDevicePerformanceConfig>
) => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(perfConfig.renderer.pixelRatio);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = !perfConfig.isMobile;
  if (!perfConfig.isMobile) {
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }
};

const disposeObject = (object: THREE.Object3D) => {
  if (object instanceof THREE.Light && object.shadow && object.shadow.map) {
    object.shadow.map.dispose();
  }
  const mesh = object as THREE.Mesh;
  if (mesh.geometry) mesh.geometry.dispose();
  if (mesh.material) {
    const { material } = mesh;
    if (Array.isArray(material)) material.forEach(m => m.dispose());
    else (material as THREE.Material).dispose();
  }
};

/**
 * Internal hook to handle scene initialization.
 */
const useInternalInitialization = (
  props: Omit<UseSceneSetupProps, "isPausedRef" | "isJoystickInteractionActiveRef">
) => {
  const { mountRef, sceneRef, cameraRef, rendererRef, octreeRef } = props;

  return React.useCallback(() => {
    if (!mountRef.current || !cameraRef.current) {
      logger.warn("[useSceneSetup] Mount point or camera not ready.");
      return false;
    }

    const perfConfig = getDevicePerformanceConfig();
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const isLowPerf = perfConfig.performanceLevel === "low";
    const renderer = new THREE.WebGLRenderer({
      antialias: perfConfig.renderer.antialias,
      powerPreference: "high-performance",
      logarithmicDepthBuffer: !isLowPerf, // Disable on low-end to save GPU
      precision: isLowPerf ? "mediump" : "highp",
    });

    configureRenderer(renderer, perfConfig);
    const mount = mountRef.current;
    renderer.setSize(
      mount.clientWidth || window.innerWidth,
      mount.clientHeight || window.innerHeight
    );
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const worldBounds = new THREE.Box3(
      new THREE.Vector3(-50000, -10, -50000),
      new THREE.Vector3(50000, 300, 50000)
    );
    octreeRef.current = new Octree<GameObject>(worldBounds);

    logger.log(`[useSceneSetup] Renderer configured (${perfConfig.performanceLevel})`);
    return true;
  }, [mountRef, sceneRef, cameraRef, rendererRef, octreeRef]);
};

/**
 * Internal hook to handle scene cleanup.
 */
const useInternalCleanup = (
  props: Omit<UseSceneSetupProps, "isPausedRef" | "isJoystickInteractionActiveRef">
) => {
  const { mountRef, sceneRef, rendererRef, octreeRef } = props;

  return React.useCallback(() => {
    const mount = mountRef.current;
    const renderer = rendererRef.current;
    const scene = sceneRef.current;

    if (renderer && mount && mount.contains(renderer.domElement)) {
      try {
        mount.removeChild(renderer.domElement);
      } catch (e) {
        logger.warn("Error removing renderer:", e);
      }
    }

    if (renderer) {
      renderer.dispose();
      rendererRef.current = null;
    }

    if (scene) {
      scene.traverse(disposeObject);
      scene.clear();
      sceneRef.current = null;
    }

    octreeRef.current = null;
    logger.log("[useSceneSetup] Cleanup complete.");
  }, [rendererRef, sceneRef, mountRef, octreeRef]);
};

export const useSceneSetup = (props: UseSceneSetupProps) => {
  const { mountRef, cameraRef, rendererRef } = props;
  const initializeScene = useInternalInitialization(props);
  const cleanupScene = useInternalCleanup(props);

  const handleResize = React.useCallback(() => {
    const mount = mountRef.current;
    if (cameraRef.current && rendererRef.current && mount) {
      cameraRef.current.aspect = mount.clientWidth / mount.clientHeight;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(mount.clientWidth, mount.clientHeight);
    }
  }, [cameraRef, rendererRef, mountRef]);

  return { initializeScene, handleResize, cleanupScene };
};
