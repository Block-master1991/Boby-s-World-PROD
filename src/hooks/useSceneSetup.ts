
'use client';

import * as React from 'react';
import * as THREE from 'three';

import type { MutableRefObject } from 'react';
import { Octree } from '../lib/Octree';
import { GameObject } from '@/types/game';
import { getDevicePerformanceConfig } from '@/lib/utils';

interface UseSceneSetupProps {
  mountRef: MutableRefObject<HTMLDivElement | null>;
  sceneRef: MutableRefObject<THREE.Scene | null>;
  cameraRef: MutableRefObject<THREE.PerspectiveCamera | null>;
  rendererRef: MutableRefObject<THREE.WebGLRenderer | null>;
  octreeRef: MutableRefObject<Octree<GameObject> | null>; // Added Octree ref
  isPausedRef: MutableRefObject<boolean>;
  isJoystickInteractionActiveRef: MutableRefObject<boolean>;
}

export const useSceneSetup = ({
  mountRef,
  sceneRef,
  cameraRef,
  rendererRef,
  octreeRef, // Added Octree ref
}: UseSceneSetupProps) => {

  const initializeScene = React.useCallback(() => {
    if (!mountRef.current || !cameraRef.current) {
      console.warn("[useSceneSetup] Mount point or camera not ready for scene initialization.");
      return false;
    }
    const currentMount = mountRef.current;

    // Get device performance config
    const perfConfig = getDevicePerformanceConfig();

    const scene = new THREE.Scene();
    // Professional Colorless Fog is now implemented via Bayer Matrix dither fade in material shaders.
    sceneRef.current = scene;

    // Configure renderer based on device
    const renderer = new THREE.WebGLRenderer({
      antialias: perfConfig.renderer.antialias,
      powerPreference: 'high-performance', // Prefer higher performance GPU
      logarithmicDepthBuffer: true // Crucial for large scene depth precision (fixes ground jitter)
    });

    renderer.setSize(currentMount.clientWidth || window.innerWidth, currentMount.clientHeight || window.innerHeight);
    renderer.setPixelRatio(perfConfig.renderer.pixelRatio);

    // HDR Tone Mapping - Use ACES Filmic for proper HDR display
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0; // Exposure can be adjusted for brightness

    renderer.shadowMap.enabled = !perfConfig.isMobile; // Disable shadows on mobile for performance
    if (!perfConfig.isMobile) {
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }

    console.log(`[useSceneSetup] Renderer configured for ${perfConfig.isMobile ? 'mobile' : 'desktop'} (${perfConfig.performanceLevel} performance):`, {
      antialias: perfConfig.renderer.antialias,
      pixelRatio: perfConfig.renderer.pixelRatio,
      shadows: renderer.shadowMap.enabled
    });

    currentMount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Initialize Octree
    const worldBounds = new THREE.Box3(new THREE.Vector3(-5000, -10, -5000), new THREE.Vector3(5000, 300, 5000));
    const octree = new Octree<GameObject>(worldBounds);
    octreeRef.current = octree;

    // Note: Lights and Background are now managed by Skybox/Environment
    // which is added to the scene in GameCanvas.

    // Simplified setup: We removed the basic ground plane from here 
    // because Environment.ts adds a more advanced Ground with shaders.
    // Having both caused Z-Fighting (ground jitter).

    return true;
  }, [mountRef, sceneRef, cameraRef, rendererRef, octreeRef]); // controlsRef removed from dependencies, octreeRef added

  const handleResize = React.useCallback(() => {
    if (cameraRef.current && rendererRef.current && mountRef.current) {
      cameraRef.current.aspect = mountRef.current.clientWidth / mountRef.current.clientHeight;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(mountRef.current.clientWidth, mountRef.current.clientHeight);
    }
  }, [cameraRef, rendererRef, mountRef]);




  const cleanupScene = React.useCallback(() => {
    if (rendererRef.current && mountRef.current && mountRef.current.contains(rendererRef.current.domElement)) {
      try { mountRef.current.removeChild(rendererRef.current.domElement); } catch (e) { console.warn("Error removing renderer on cleanup:", e); }
    }
    if (rendererRef.current) { rendererRef.current.dispose(); rendererRef.current = null; }
    if (sceneRef.current) {
      sceneRef.current.traverse((object) => {
        if (object instanceof THREE.Light && object.shadow && object.shadow.map) { object.shadow.map.dispose(); }
        if ((object as THREE.Mesh).geometry) (object as THREE.Mesh).geometry.dispose();
        if ((object as THREE.Mesh).material) {
          const material = (object as THREE.Mesh).material;
          if (Array.isArray(material)) material.forEach(m => m.dispose());
          else (material as THREE.Material).dispose();
        }
      });
      sceneRef.current.clear(); sceneRef.current = null;
    }
    // Clear Octree reference on cleanup
    if (octreeRef.current) {
      octreeRef.current = null;
    }

    console.log("[useSceneSetup] Cleanup complete.");
  }, [rendererRef, sceneRef, mountRef, octreeRef]); // octreeRef added to dependencies


  return {
    initializeScene,
    handleResize,
    cleanupScene,
  };
};
