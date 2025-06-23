
'use client';

import * as React from 'react';
import * as THREE from 'three';
import type { MutableRefObject } from 'react';

const ENEMY_COUNT = 500;
const ENEMY_SPEED = 0.03;
const ENEMY_COLLISION_THRESHOLD = 0.8; // Distance for collision
const OBJECT_DISTRIBUTION_AREA = 590; // Same as coins for consistency

interface UseEnemyLogicProps {
  sceneRef: MutableRefObject<THREE.Scene | null>;
  dogModelRef: MutableRefObject<THREE.Group | null>;
  isShieldActiveRef: MutableRefObject<boolean>;
  protectionBoneCountRef: MutableRefObject<number>;
  onConsumeProtectionBone: () => void;
  onEnemyCollisionPenalty: () => void;
  isPausedRef: MutableRefObject<boolean>;
}

export const useEnemyLogic = ({
  sceneRef,
  dogModelRef,
  isShieldActiveRef,
  protectionBoneCountRef,
  onConsumeProtectionBone,
  onEnemyCollisionPenalty,
  isPausedRef,
}: UseEnemyLogicProps) => {
  const enemyMeshesRef = React.useRef<THREE.Mesh[]>([]);

  const initializeEnemies = React.useCallback(() => {
    if (!sceneRef.current) return;
    const scene = sceneRef.current;

    // Clear previous enemies if any
    enemyMeshesRef.current.forEach(enemy => scene.remove(enemy));
    enemyMeshesRef.current = [];

    const enemyGeometry = new THREE.BoxGeometry(1, 2, 1); // Simple cube for enemy
    const enemyMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000 }); // Red color

    for (let i = 0; i < ENEMY_COUNT; i++) {
      const enemyMesh = new THREE.Mesh(enemyGeometry, enemyMaterial);
      const enemyX = (Math.random() - 0.5) * (OBJECT_DISTRIBUTION_AREA * 0.8); // Slightly smaller area than coins
      const enemyZ = (Math.random() - 0.5) * (OBJECT_DISTRIBUTION_AREA * 0.8);
      const enemyY = 1; // Height of the enemy (center point)
      enemyMesh.position.set(enemyX, enemyY, enemyZ);
      enemyMesh.castShadow = true;
      enemyMesh.receiveShadow = true;
      enemyMeshesRef.current.push(enemyMesh);
      scene.add(enemyMesh);
    }
  }, [sceneRef]);

  const updateEnemies = React.useCallback(() => {
    if (isPausedRef.current || !dogModelRef.current || !sceneRef.current) return;

    const dog = dogModelRef.current;
    const dogPosition = dog.position;

    enemyMeshesRef.current.forEach(enemy => {
      if (enemy.visible) {
        const directionToDog = new THREE.Vector3().subVectors(dogPosition, enemy.position);
        const enemyY = enemy.position.y; // Preserve original Y to prevent flying/sinking
        directionToDog.y = 0; // Move on XZ plane only

        if (directionToDog.lengthSq() > 0.001) { // Avoid normalizing zero vector
          directionToDog.normalize();
          enemy.position.addScaledVector(directionToDog, ENEMY_SPEED);
          
          // Make enemy look at dog (on XZ plane)
          const lookAtTarget = new THREE.Vector3(dogPosition.x, enemyY, dogPosition.z);
          enemy.lookAt(lookAtTarget);
        }
        enemy.position.y = enemyY; // Restore Y position

        // Collision detection (XZ plane check)
        const dogXZ = new THREE.Vector3(dog.position.x, 0, dog.position.z);
        const enemyXZ = new THREE.Vector3(enemy.position.x, 0, enemy.position.z);

        if (dogXZ.distanceTo(enemyXZ) < ENEMY_COLLISION_THRESHOLD) {
          enemy.visible = false; // "Kill" enemy temporarily
          // Respawn logic
          const newEnemyX = (Math.random() - 0.5) * OBJECT_DISTRIBUTION_AREA;
          const newEnemyZ = (Math.random() - 0.5) * OBJECT_DISTRIBUTION_AREA;
          const newEnemyY = 1; // Respawn height
          setTimeout(() => {
            enemy.position.set(newEnemyX, newEnemyY, newEnemyZ);
            enemy.visible = true;
          }, 5000); // Respawn after 5 seconds

          if (isShieldActiveRef.current) {
            // Shield active: enemy "dies", no penalty to player
          } else if (protectionBoneCountRef.current > 0) {
            onConsumeProtectionBone(); // Consume a bone
          } else {
            onEnemyCollisionPenalty(); // Apply penalty to player
          }
        }
      }
    });
  }, [
    dogModelRef,
    isShieldActiveRef,
    protectionBoneCountRef,
    onConsumeProtectionBone,
    onEnemyCollisionPenalty,
    isPausedRef,
    sceneRef, // Added sceneRef here
  ]);
  
  const resetEnemies = React.useCallback(() => {
    initializeEnemies();
  }, [initializeEnemies]);

  return {
    initializeEnemies,
    updateEnemies,
    resetEnemies,
    enemyMeshesRef, // if needed
  };
};
