import type { CoinData } from "@/hooks/coin/useCoinLogic";
import type { Octree } from "@/lib/Octree";
import type { GameObject } from "@/types/game";
import { useCallback } from "react";
import * as THREE from "three";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";
import { positionModel } from "../spawningHelpers";
import type { EnemyData } from "../types";
import { createEnemy, createMixer } from "./enemyCreator";

interface SpawnHandlerParams {
  sceneRef: React.MutableRefObject<THREE.Scene | null>;
  octreeRef: React.MutableRefObject<Octree<GameObject> | null>;
  enemyMeshesRef: React.MutableRefObject<EnemyData[]>;
  loadEnemyModel: (
    t: "carnivore" | "herbivore",
    f?: string
  ) => Promise<{ model: THREE.Group; animations: THREE.AnimationClip[] }>;
}

// دالة مساعدة لتحديد نوع العدو
const getEnemyType = (): "carnivore" | "herbivore" => {
  return Math.random() < 0.5 ? "carnivore" : "herbivore";
};

// دالة مساعدة للحصول على قائمة أنيمات الخمول
const getIdleAnimations = (enemyType: "carnivore" | "herbivore"): string[] => {
  return enemyType === "carnivore"
    ? ["Idle", "Idle_2", "Idle_2_HeadLow", "Eating"]
    : ["Idle", "Idle_2", "Idle_HeadLow", "Eating"];
};

// دالة مساعدة لتحديد موقع آمن من الكلب
const getSafePositionFromDog = (
  enemyPosition: THREE.Vector3,
  dogPosition: THREE.Vector3 | undefined
): THREE.Vector3 => {
  if (!dogPosition || enemyPosition.distanceTo(dogPosition) >= 5) {
    return enemyPosition;
  }

  // إذا كان العدو قريباً جداً من الكلب، ضعه في موقع أبعد
  const directionFromDog = new THREE.Vector3().subVectors(enemyPosition, dogPosition).normalize();
  const safeDistance = 10; // مسافة آمنة من الكلب
  return enemyPosition.clone().add(directionFromDog.multiplyScalar(safeDistance));
};

// واجهة لمعلمات إنشاء وإضافة العدو
interface CreateAndAddEnemyParams {
  model: THREE.Group;
  coin: CoinData;
  chunk: string;
  scene: THREE.Scene;
  octree: Octree<GameObject> | null;
  enemyType: "carnivore" | "herbivore";
  animations: THREE.AnimationClip[];
  enemyMeshesRef: React.MutableRefObject<EnemyData[]>;
}

// دالة مساعدة لإنشاء وإضافة العدو إلى المشهد
const createAndAddEnemy = (params: CreateAndAddEnemyParams): void => {
  const { model, coin, chunk, scene, octree, enemyType, animations, enemyMeshesRef } = params;

  // تحديد موقع العدو بالقرب من العملة
  const enemyPosition = positionModel({ model, coin, chunkKey: chunk, scene, octree });

  // التأكد من أن العدو يبدأ بالقرب من العملة التي يجب حمايتها
  const dogPosition = scene?.getObjectByName("Dog")?.position;
  const safePosition = getSafePositionFromDog(enemyPosition, dogPosition);
  model.position.copy(safePosition);

  // إنشاء mixer واختيار أنيمات
  const { mixer, actions } = createMixer(model, animations);
  const idles = getIdleAnimations(enemyType);
  const nm = idles[Math.floor(Math.random() * idles.length)];
  const action = nm ? (actions[nm] ?? null) : null;
  if (action) action.play();

  // إنشاء LOD وإضافته إلى المشهد مع نقل الموقع الصحيح
  const lod = createLOD(model, model.position.clone());
  scene.add(lod);

  // التأكد من أن النموذج جاهز قبل إضافته إلى القائمة
  if (model.children && model.children.length > 0) {
    enemyMeshesRef.current.push(
      createEnemy({ coin, model, lod, mixer, actions, action, type: enemyType, chunk })
    );
  }
};

export const createSpawnHandler = (params: SpawnHandlerParams) => {
  const { sceneRef, octreeRef, enemyMeshesRef, loadEnemyModel } = params;
  const pending = new Set<string>();

  const spawn = useCallback(
    async (coin: CoinData, chunk: string) => {
      if (coin.collected || pending.has(coin.uuid)) return;
      pending.add(coin.uuid);

      const t = getEnemyType();
      const { model: raw, animations } = await loadEnemyModel(t);

      if (!sceneRef.current || coin.collected) {
        pending.delete(coin.uuid);
        return;
      }

      const model = SkeletonUtils.clone(raw) as THREE.Group;
      createAndAddEnemy({
        model,
        coin,
        chunk,
        scene: sceneRef.current,
        octree: octreeRef.current,
        enemyType: t,
        animations,
        enemyMeshesRef,
      });

      pending.delete(coin.uuid);
    },
    [loadEnemyModel, sceneRef, enemyMeshesRef, octreeRef]
  );

  return { spawn, pending };
};

const createLOD = (model: THREE.Group, targetPosition: THREE.Vector3): THREE.LOD => {
  const lod = new THREE.LOD();

  // التحقق من أن النموذج جاهز قبل التعامل معه
  if (!model || !model.children || model.children.length === 0) {
    return lod;
  }

  // نسخ موقع النموذج إلى LOD - هذا هو الإصلاح الرئيسي!
  lod.position.copy(targetPosition);
  // تصفير موقع النموذج ليكون نسبياً إلى LOD
  model.position.set(0, 0, 0);

  model.scale.set(0.5, 0.5, 0.5);
  model.traverse((child: THREE.Object3D) => {
    if ((child as THREE.Mesh).isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
      child.frustumCulled = true;
    }
  });
  lod.addLevel(model, 25);

  const lowDetailModel = new THREE.Mesh(
    new THREE.BoxGeometry(0.0001, 0.0001, 0.0001),
    new THREE.MeshBasicMaterial({ color: 0xff0000 })
  );
  lowDetailModel.scale.set(0.5, 0.5, 0.5);
  lod.addLevel(lowDetailModel, 50);

  return lod;
};
