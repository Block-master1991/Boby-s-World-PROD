// src/components/StaticObjectManager.tsx
import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useStaticObjectLogic } from '../hooks/useStaticObjectLogic';

interface StaticObjectManagerProps {
  playerPosition: THREE.Vector3;
  camera: THREE.Camera;
  scene: THREE.Scene;
}

export const StaticObjectManager: React.FC<StaticObjectManagerProps> = ({
  playerPosition,
  camera,
  scene
}) => {
  const {
    loadChunksWithOptimizations,
    updateScene,
    instancedMeshesRef
  } = useStaticObjectLogic();

  const initializedRef = useRef(false);
  const lastPlayerPositionRef = useRef(playerPosition.clone());
  const updateIntervalRef = useRef<NodeJS.Timeout>();

  // تهيئة المشهد
  useEffect(() => {
    if (!initializedRef.current) {
      // إضافة النماذج الأولية
      Object.values(instancedMeshesRef.current).forEach(meshes => {
        meshes.forEach(mesh => scene.add(mesh));
      });
      
      initializedRef.current = true;
    }

    return () => {
      // تنظيف عند إزالة المكون
      if (updateIntervalRef.current) {
        clearInterval(updateIntervalRef.current);
      }
    };
  }, [scene]);

  // تحديث المشهد بشكل دوري
  useEffect(() => {
    if (!initializedRef.current) return;

    // تحديث المشهد كل إطار
    const updateLoop = () => {
      updateScene(playerPosition, camera);
      requestAnimationFrame(updateLoop);
    };

    const animationId = requestAnimationFrame(updateLoop);

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [playerPosition, camera, updateScene]);

  // تحميل الـ chunks عند تحرك اللاعب
  useEffect(() => {
    if (!initializedRef.current) return;

    const distance = playerPosition.distanceTo(lastPlayerPositionRef.current);
    
    if (distance > 50) { // تحميل chunks جديدة عند تحرك اللاعب مسافة معينة
      const chunkX = Math.floor(playerPosition.x / 100);
      const chunkZ = Math.floor(playerPosition.z / 100);
      
      // تحميل chunks في نطاق معين
      const chunksToLoad = [];
      for (let x = chunkX - 2; x <= chunkX + 2; x++) {
        for (let z = chunkZ - 2; z <= chunkZ + 2; z++) {
          chunksToLoad.push({ x, z });
        }
      }
      
      loadChunksWithOptimizations(chunksToLoad, {
        x: playerPosition.x,
        z: playerPosition.z
      });
      
      lastPlayerPositionRef.current = playerPosition.clone();
    }
  }, [playerPosition, loadChunksWithOptimizations]);

  return null; // المكون لا يعرض أي شيء، بل يدير النماذج في المشهد
};
