import { useCallback } from 'react';
import type * as THREE from 'three';
import { VISIBLE_ENEMY_DISTANCE } from './constants';
import type { EnemyData } from './types';

interface Props {
  cameraRef: React.MutableRefObject<THREE.PerspectiveCamera | null>;
}

export const useEnemyLOD = ({ cameraRef }: Props) => {
  const updateLOD = useCallback((enemy: EnemyData) => {
    if (!cameraRef.current) return;

    // تحديث مستويات LOD بناءً على المسافة للكاميرا
    enemy.lod.update(cameraRef.current);
  }, [cameraRef]);

  const isEnemyVisible = useCallback((enemy: EnemyData, camera: THREE.PerspectiveCamera) => {
    const distance = camera.position.distanceTo(enemy.position);
    return distance < VISIBLE_ENEMY_DISTANCE;
  }, []);

  return {
    updateLOD,
    isEnemyVisible,
  };
};
