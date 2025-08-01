
'use client';

import React, { useCallback, useRef } from 'react'; // Ensured React is imported
import * as THREE from 'three';
import type { MutableRefObject } from 'react';
import { Octree, OctreeObject } from '../lib/Octree'; // Import Octree


const COIN_RADIUS = 0.4;
const COIN_HEIGHT = 0.08;
const COIN_COLOR = 0xFFD700;
const COIN_EMISSIVE_COLOR = 0xccac00;
const COIN_ROTATION_SPEED = 0.02;
const COLLECTION_THRESHOLD_BASE = 0.5; 
const COLLECTION_THRESHOLD = COLLECTION_THRESHOLD_BASE + COIN_RADIUS;
const OBJECT_DISTRIBUTION_AREA = 590;


interface UseCoinLogicProps {
  sceneRef: MutableRefObject<THREE.Scene | null>;
  dogModelRef: MutableRefObject<THREE.Group | null>;
  isCoinMagnetActiveRef: MutableRefObject<boolean>;
  COIN_MAGNET_RADIUS: number;
  COIN_COUNT: number;
  onCoinCollected: () => void; // Expect this to be stable (useCallback in parent)
  onRemainingCoinsUpdate: (remaining: number) => void; // Expect this to be stable
  isPausedRef: MutableRefObject<boolean>;
  octreeRef: MutableRefObject<Octree | null>; // Added Octree ref

}

export const useCoinLogic = ({
  sceneRef,
  dogModelRef,
  isCoinMagnetActiveRef,
  COIN_MAGNET_RADIUS,
  COIN_COUNT,
  onCoinCollected, // Directly use the stable prop
  onRemainingCoinsUpdate, // Directly use the stable prop
  isPausedRef,
  octreeRef, // Destructure octreeRef

}: UseCoinLogicProps) => {
  const coinMeshesRef = useRef<THREE.Mesh[]>([]);
  const remainingCoinsRef = useRef<number>(COIN_COUNT);

  const initializeCoins = useCallback(() => { // Removed updaterFunc parameter
    if (!sceneRef.current) return;
    const scene = sceneRef.current;

    coinMeshesRef.current.forEach(coin => scene.remove(coin));
    coinMeshesRef.current = [];

    const coinGeometry = new THREE.CylinderGeometry(COIN_RADIUS, COIN_RADIUS, COIN_HEIGHT, 32);
    const coinMaterial = new THREE.MeshStandardMaterial({
      color: COIN_COLOR,
      emissive: COIN_EMISSIVE_COLOR,
      metalness: 0.8,
      roughness: 0.2,
    });

    remainingCoinsRef.current = COIN_COUNT;
    for (let i = 0; i < COIN_COUNT; i++) {
      const coinMesh = new THREE.Mesh(coinGeometry, coinMaterial);
      const coinX = (Math.random() - 0.5) * OBJECT_DISTRIBUTION_AREA;
      const coinZ = (Math.random() - 0.5) * OBJECT_DISTRIBUTION_AREA;
      const coinY = COIN_RADIUS; 
      coinMesh.position.set(coinX, coinY, coinZ);
      coinMesh.rotation.x = Math.PI / 2; 
      coinMesh.castShadow = true;
      coinMeshesRef.current.push(coinMesh);
      scene.add(coinMesh);
      // Add to Octree
      if (octreeRef.current) {
        const coinBox = new THREE.Box3().setFromObject(coinMesh);
        octreeRef.current.insert({
          id: `coin_${i}`,
          bounds: coinBox,
          data: coinMesh
        });
      }
    }
    onRemainingCoinsUpdate(remainingCoinsRef.current); // Use the stable prop directly
  }, [sceneRef, COIN_COUNT, onRemainingCoinsUpdate, octreeRef]); // Added onRemainingCoinsUpdate

  const updateCoins = useCallback(() => { // Removed updaterFunc parameter
    if (isPausedRef.current || !dogModelRef.current) return;

    const dog = dogModelRef.current;
    coinMeshesRef.current.forEach(coin => {
      if (coin.visible) {
        let collectedThisFrame = false;
        const distanceToDog = dog.position.distanceTo(coin.position);

        if (distanceToDog < COLLECTION_THRESHOLD) {
          collectedThisFrame = true;
        } else if (isCoinMagnetActiveRef.current && distanceToDog < COIN_MAGNET_RADIUS) {
          collectedThisFrame = true;
        }

        if (collectedThisFrame) {
          coin.visible = false;
          onCoinCollected(); // Use the stable prop directly
          remainingCoinsRef.current--;
          onRemainingCoinsUpdate(remainingCoinsRef.current); // Use the stable prop directly
        } else {
           const worldYAxis = new THREE.Vector3(0, 1, 0);
           coin.rotateOnWorldAxis(worldYAxis, COIN_ROTATION_SPEED);
        }
      }
    });
  }, [
    dogModelRef,
    isCoinMagnetActiveRef,
    COIN_MAGNET_RADIUS,
    onCoinCollected, // Use the stable prop
    onRemainingCoinsUpdate, // Use the stable prop
    isPausedRef,
  ]);
  
  const resetCoins = useCallback(() => { // Removed updaterFunc parameter
    initializeCoins(); // initializeCoins now uses the stable onRemainingCoinsUpdate prop
  }, [initializeCoins]);

  return {
    initializeCoins,
    updateCoins,
    resetCoins,
    coinMeshesRef, 
    remainingCoinsRef, 
  };
};
