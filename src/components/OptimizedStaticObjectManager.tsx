// src/components/OptimizedStaticObjectManager.tsx
import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useOptimizedStaticObjects } from '../hooks/useOptimizedStaticObjects';

interface OptimizedStaticObjectManagerProps {
  scene: THREE.Scene;
  camera: THREE.Camera;
  renderer: THREE.WebGLRenderer;
  playerPosition: THREE.Vector3;
}

export const OptimizedStaticObjectManager: React.FC<OptimizedStaticObjectManagerProps> = ({
  scene,
  camera,
  renderer,
  playerPosition,
}) => {
  const {
    loadModelsWithOptimizations,
    updateScene,
    cleanup,
    getPerformanceMetrics,
    getMemoryStats,
  } = useOptimizedStaticObjects({
    scene,
    camera,
    renderer,
  });

  const lastPlayerPositionRef = useRef(playerPosition.clone());

  // تحميل النماذج الأولية
  useEffect(() => {
    const initialChunks = [];
    const chunkX = Math.floor(playerPosition.x / 100);
    const chunkZ = Math.floor(playerPosition.z / 100);

    for (let x = chunkX - 2; x <= chunkX + 2; x++) {
      for (let z = chunkZ - 2; z <= chunkZ + 2; z++) {
        initialChunks.push({ x, z });
      }
    }

    loadModelsWithOptimizations(initialChunks);
  }, [loadModelsWithOptimizations, playerPosition.x, playerPosition.z]); // Depend on coordinates

  // تحديث المشهد بشكل دوري
  useEffect(() => {
    const updateLoop = () => {
      updateScene();
      requestAnimationFrame(updateLoop); // تأكد من استمرار الحلقة
    };

    const animationId = requestAnimationFrame(updateLoop);
    return () => cancelAnimationFrame(animationId);
  }, [updateScene]);

  // تحميل chunks جديدة عند تحرك اللاعب
  useEffect(() => {
    const distance = playerPosition.distanceTo(lastPlayerPositionRef.current);

    if (distance > 50) {
      const chunkX = Math.floor(playerPosition.x / 100);
      const chunkZ = Math.floor(playerPosition.z / 100);

      const chunksToLoad = [];
      for (let x = chunkX - 2; x <= chunkX + 2; x++) {
        for (let z = chunkZ - 2; z <= chunkZ + 2; z++) {
          chunksToLoad.push({ x, z });
        }
      }

      loadModelsWithOptimizations(chunksToLoad);

      lastPlayerPositionRef.current = playerPosition.clone();
    }
  }, [playerPosition, loadModelsWithOptimizations]);

  // عرض معلومات الأداء والذاكرة
  useEffect(() => {
    const interval = setInterval(() => {
      const metrics = getPerformanceMetrics();
      const stats = getMemoryStats();

      console.log('📊 Performance Metrics:', metrics);
      console.log('🧠 Memory Stats:', stats);
    }, 5000);

    return () => clearInterval(interval);
  }, [getPerformanceMetrics, getMemoryStats]);

  // تنظيف عند إزالة المكون
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return null;
};
