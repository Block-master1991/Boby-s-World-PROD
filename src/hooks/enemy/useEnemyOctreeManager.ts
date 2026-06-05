import type { Octree } from "@/lib/Octree";
import type { GameObject } from "@/types/game";
import * as React from "react";
import { useCallback } from "react";
import * as THREE from "three";
import type { EnemyData } from "./types";

interface Props {
  octreeRef: React.MutableRefObject<Octree<GameObject> | null>;
}

export const useEnemyOctreeManager = ({ octreeRef }: Props) => {
  const lastPositions = React.useRef<Map<string, THREE.Vector3>>(new Map());

  const updateOctree = useCallback(
    (enemy: EnemyData) => {
      if (!octreeRef.current) return;

      // التحقق من أن النموذج جاهز قبل إنشاء bounds
      if (!enemy.lod || !enemy.lod.children || enemy.lod.children.length === 0) {
        return;
      }

      const pos = enemy.lod.position;
      const lastPos = lastPositions.current.get(enemy.uuid);

      // Optimized: Only update Octree if the enemy has moved significantly (> 0.1 units)
      if (lastPos && lastPos.distanceToSquared(pos) < 0.01) {
        return;
      }

      // استخدام حدود يدوية بدلاً من setFromObject لتجنب أخطاء skeleton
      const ENEMY_SIZE = 2; // حجم تقريبي للعدو
      const bounds = new THREE.Box3(
        new THREE.Vector3(pos.x - ENEMY_SIZE, pos.y, pos.z - ENEMY_SIZE),
        new THREE.Vector3(pos.x + ENEMY_SIZE, pos.y + ENEMY_SIZE * 2, pos.z + ENEMY_SIZE)
      );

      const octreeEntry = {
        id: `enemy_${enemy.uuid}`,
        bounds: bounds,
        data: enemy as unknown as GameObject,
      };

      // إزالة الإدخال القديم وإضافة الجديد (Update)
      octreeRef.current.remove(octreeEntry);
      octreeRef.current.insert(octreeEntry);

      // تحديث الموقع الأخير
      if (!lastPos) {
        lastPositions.current.set(enemy.uuid, pos.clone());
      } else {
        lastPos.copy(pos);
      }
    },
    [octreeRef]
  );

  const removeFromOctree = useCallback(
    (enemy: EnemyData) => {
      if (!octreeRef.current) return;

      // استخدام حدود يدوية بدلاً من setFromObject
      const ENEMY_SIZE = 2;
      const pos = enemy.lod.position;
      const bounds = new THREE.Box3(
        new THREE.Vector3(pos.x - ENEMY_SIZE, pos.y, pos.z - ENEMY_SIZE),
        new THREE.Vector3(pos.x + ENEMY_SIZE, pos.y + ENEMY_SIZE * 2, pos.z + ENEMY_SIZE)
      );

      const octreeEntry = {
        id: `enemy_${enemy.uuid}`,
        bounds: bounds,
        data: enemy as unknown as GameObject,
      };

      octreeRef.current.remove(octreeEntry);
    },
    [octreeRef]
  );

  return {
    updateOctree,
    removeFromOctree,
  };
};
