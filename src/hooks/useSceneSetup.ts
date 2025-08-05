
'use client';

import * as React from 'react';
import * as THREE from 'three';

import type { MutableRefObject } from 'react';
import { Octree, OctreeObject } from '../lib/Octree';

interface UseSceneSetupProps {
  mountRef: MutableRefObject<HTMLDivElement | null>;
  sceneRef: MutableRefObject<THREE.Scene | null>;
  cameraRef: MutableRefObject<THREE.PerspectiveCamera | null>;
  rendererRef: MutableRefObject<THREE.WebGLRenderer | null>;
  octreeRef: MutableRefObject<Octree | null>; // Added Octree ref

  isPausedRef: MutableRefObject<boolean>;
  isJoystickInteractionActiveRef: MutableRefObject<boolean>; // Kept for other potential uses, though not for controls here
}

export const useSceneSetup = ({
  mountRef,
  sceneRef,
  cameraRef,
  rendererRef,
  octreeRef, // Added Octree ref

  isPausedRef,
  isJoystickInteractionActiveRef,
}: UseSceneSetupProps) => {

  const initializeScene = React.useCallback(() => {
    if (!mountRef.current || !cameraRef.current) {
        console.warn("[useSceneSetup] Mount point or camera not ready for scene initialization.");
        return false;
    }
    const currentMount = mountRef.current;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB);
    scene.fog = new THREE.Fog(0x87CEEB, 400, 2000);
    sceneRef.current = scene;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(currentMount.clientWidth || window.innerWidth, currentMount.clientHeight || window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    currentMount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Initialize Octree
    const worldBounds = new THREE.Box3(new THREE.Vector3(-1000, -10, -1000), new THREE.Vector3(1000, 300, 1000));
    const octree = new Octree(worldBounds);
    octreeRef.current = octree;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2);
    directionalLight.position.set(100, 200, 150);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 4096;
    directionalLight.shadow.mapSize.height = 4096;
    directionalLight.shadow.camera.near = 50;
    directionalLight.shadow.camera.far = 500;
    directionalLight.shadow.camera.left = -250;
    directionalLight.shadow.camera.right = 250;
    directionalLight.shadow.camera.top = 250;
    directionalLight.shadow.camera.bottom = -250;
    scene.add(directionalLight);

    const groundGeometry = new THREE.PlaneGeometry(2000, 2000);
    const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x556B2F, side: THREE.DoubleSide });
    const groundPlane = new THREE.Mesh(groundGeometry, groundMaterial);
    groundPlane.rotation.x = -Math.PI / 2;
    groundPlane.receiveShadow = true;
    scene.add(groundPlane);

    // Add ground plane to Octree
    const groundBox = new THREE.Box3().setFromObject(groundPlane);
    octree.insert({ id: 'ground', bounds: groundBox, data: groundPlane });
    
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
