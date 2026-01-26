'use client';

import type { Octree } from '@/lib/Octree';
import { getDevicePerformanceConfig } from '@/lib/utils';
import type { GameObject } from '@/types/game';
import type { MutableRefObject } from 'react';
import * as React from 'react';
import * as THREE from 'three';
import type { FloatingEffectOptions } from './coin/useCoinInteraction';
import type { EnemyData } from './enemy/types';
import { useEnemyCombat } from './enemy/useEnemyCombat';
import { useEnemyMovement } from './enemy/useEnemyMovement';
import { useEnemyOctreeManager } from './enemy/useEnemyOctreeManager';
import { useEnemyReconciliation } from './enemy/useEnemyReconciliation';
import { useEnemySpawning } from './enemy/useEnemySpawning';
import type { CoinData } from './useCoinLogic';
import { useDynamicModelLoader } from './useDynamicModelLoader';

interface Props { sceneRef: MutableRefObject<THREE.Scene | null>; dogModelRef: MutableRefObject<THREE.Group | null>; isShieldActiveRef: MutableRefObject<boolean>; protectionBottleCountRef: MutableRefObject<number>; onConsumeProtectionBottle: () => void; onEnemyCollisionPenalty: () => void; isPausedRef: MutableRefObject<boolean>; coinMeshesRef: MutableRefObject<CoinData[]>; loadedCoinChunks: MutableRefObject<Set<string>>; onCoinCollected: () => void; octreeRef: MutableRefObject<Octree<GameObject> | null>; cameraRef: MutableRefObject<THREE.PerspectiveCamera | null>; addFloatingEffect: (options: FloatingEffectOptions) => void; onAttackAnimationFinished?: (event: THREE.Event) => void; }

interface Ctx { delta: number; dogPos: THREE.Vector3; frustum: THREE.Frustum; perf: ReturnType<typeof getDevicePerformanceConfig>; frame: number; coinMap: Map<string, CoinData>; }

type UpdateEnemyMovementFn = (enemy: EnemyData, delta: number, distance: number) => void;
type CheckCollisionsFn = (enemy: EnemyData) => void;
type UpdateOctreeFn = (enemy: EnemyData) => void;
type UpdateDeathStateFn = (enemy: EnemyData, delta: number) => boolean;
type RemoveFromOctreeFn = (enemy: EnemyData) => void;
type ManageChunksFn = () => void;
type UpdateReconciliationFn = (delta: number) => void;
type UpdateOneFn = (enemy: EnemyData, ctx: Ctx) => void;
type FilterDeadFn = (delta: number) => void;

const updateVis = (e: EnemyData, coinMap: Map<string, CoinData>) => { const c = coinMap.get(e.targetCoinId); if (c) e.lod.visible = c.collected || c.visible; };
const getAnimD = (d: number, dt: number, mob: boolean) => d > 150 ? dt * 6 : d > 60 ? dt * (mob ? 3 : 2) : dt;
const shouldAnim = (d: number, inF: boolean, ctx: Ctx) => { const { perf: p, frame: f } = ctx; if (p.isMobile && p.performanceLevel === 'low' && d > 40) return false; if (d < 60) return inF || d < 15; if (d < 150) return inF && (f % (p.isMobile ? 3 : 2) === 0); return inF && (f % 6 === 0); };
const animE = (e: EnemyData, d: number, inF: boolean, ctx: Ctx) => { if (e.mixer && shouldAnim(d, inF, ctx)) e.mixer.update(getAnimD(d, ctx.delta, ctx.perf.isMobile)); };
const dispE = (e: EnemyData) => { e.mixer.stopAllAction(); e.lod.traverse(c => { const m = c as THREE.Mesh; if (m.isMesh) m.geometry?.dispose(); }); };

const initializeEnemyHooks = (props: Props, enemies: React.MutableRefObject<EnemyData[]>, pendingCoins: React.MutableRefObject<Set<string>>) => {
  const { sceneRef, dogModelRef, octreeRef, isPausedRef, coinMeshesRef, loadedCoinChunks, cameraRef, isShieldActiveRef, protectionBottleCountRef, onConsumeProtectionBottle, onEnemyCollisionPenalty, addFloatingEffect, onCoinCollected } = props;

  const { manageChunks, initializeEnemies, resetEnemies, forceLoadAreaEnemies, spawn } = useEnemySpawning({
    sceneRef,
    octreeRef,
    enemyMeshesRef: enemies,
    coinMeshesRef,
    loadedCoinChunks,
    cameraRef,
    dogModelRef,
  });

  const { updateEnemyMovement } = useEnemyMovement({ dogModelRef, octreeRef, sceneRef, isPausedRef, cameraRef });
  const { checkCollisions, updateDeathState } = useEnemyCombat({
    dogModelRef,
    isShieldActiveRef,
    protectionBottleCountRef,
    onConsumeProtectionBottle,
    onEnemyCollisionPenalty,
    addFloatingEffect,
    onCoinCollected
  });

  const { updateOctree, removeFromOctree } = useEnemyOctreeManager({ octreeRef });

  const { updateReconciliation } = useEnemyReconciliation({
    enemyMeshesRef: enemies,
    coinMeshesRef,
    pendingCoins,
    onSpawnEnemy: spawn,
  });

  const { cleanupModelPool } = useDynamicModelLoader({ cameraRef, sceneRef, octreeRef, objectsToManage: [] });

  return {
    manageChunks,
    initializeEnemies,
    resetEnemies,
    forceLoadAreaEnemies,
    updateEnemyMovement,
    checkCollisions,
    updateDeathState,
    updateOctree,
    removeFromOctree,
    updateReconciliation,
    cleanupModelPool
  };
};

const createUpdateOneCallback = (
  _coinMeshesRef: React.MutableRefObject<CoinData[]>, // لم يعد مستخدماً
  updateEnemyMovement: UpdateEnemyMovementFn,
  checkCollisions: CheckCollisionsFn,
  updateOctree: UpdateOctreeFn
) => {
  return React.useCallback((e: EnemyData, ctx: Ctx) => {
    const d = ctx.dogPos.distanceTo(e.position);

    // التحقق من رؤية العدو باستخدام الخريطة السريعة
    updateVis(e, ctx.coinMap);

    animE(e, d, ctx.frustum.containsPoint(e.position), ctx);

    // ملاحظة: تم نقل منطق الموت والغرق إلى updateDeathState الذي يُستدعى في filterDead

    // التحقق من جمع العملة (موت العدو عند اختفاء العملة)
    const protectedCoin = ctx.coinMap.get(e.targetCoinId);
    if (!protectedCoin && !e.isDying) {
      e.isDying = true;
      e.deathTimer = 1.5; // ENEMY_DEATH_DURATION
      e.isAttacking = false;
      
      const animName = e.enemyType === 'carnivore' ? 'Death' : 'Death'; // Simplified
      const action = e.actions[animName];
      if (action) {
        e.currentAction?.fadeOut(0.2);
        action.reset().setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
        action.play();
        e.currentAction = action;
      }
      return;
    }

    // التحقق من الرؤية قبل التحديث
    if (!e.lod.visible) {
      return;
    }

    // تحديث الحركة والتصادم
    updateEnemyMovement(e, ctx.delta, d);
    checkCollisions(e);

    // تحديث Octree
    updateOctree(e);
  }, [updateEnemyMovement, checkCollisions, updateOctree]);
};

const createFilterDeadCallback = (
  enemies: React.MutableRefObject<EnemyData[]>,
  updateDeathState: UpdateDeathStateFn,
  removeFromOctree: RemoveFromOctreeFn,
  sceneRef: React.MutableRefObject<THREE.Scene | null>
) => {
  return React.useCallback((dt: number) => {
    const act: EnemyData[] = [];
    for (const e of enemies.current) {
      if (updateDeathState(e, dt)) {
        removeFromOctree(e);
        sceneRef.current?.remove(e.lod);
        dispE(e);
      } else {
        act.push(e);
      }
    }
    enemies.current = act;
  }, [updateDeathState, removeFromOctree, sceneRef]);
};

interface UpdateEnemiesParams {
  enemies: React.MutableRefObject<EnemyData[]>;
  frameRef: React.MutableRefObject<number>;
  manageChunks: ManageChunksFn;
  updateReconciliation: UpdateReconciliationFn;
  filterDead: FilterDeadFn;
  updateOne: UpdateOneFn;
  isPausedRef: React.MutableRefObject<boolean>;
  dogModelRef: React.MutableRefObject<THREE.Group | null>;
  sceneRef: React.MutableRefObject<THREE.Scene | null>;
  cameraRef: React.MutableRefObject<THREE.PerspectiveCamera | null>;
  coinMeshesRef: React.MutableRefObject<CoinData[]>; // Add this
}

const createUpdateEnemiesCallback = (params: UpdateEnemiesParams) => {
  const {
    enemies,
    frameRef,
    manageChunks,
    updateReconciliation,
    filterDead,
    updateOne,
    isPausedRef,
    dogModelRef,
    sceneRef,
    cameraRef,
    coinMeshesRef // Add this
  } = params;
  return React.useCallback((delta: number) => {
    if (isPausedRef.current || !dogModelRef.current || !sceneRef.current || !cameraRef.current) return;
    manageChunks();
    updateReconciliation(delta);
    filterDead(delta);
    const cam = cameraRef.current;
    cam.updateMatrixWorld();
    const f = new THREE.Frustum();
    f.setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    frameRef.current = (frameRef.current + 1) % 60;
    // إنشاء خريطة للعملات لتحسين الأداء (O(1) lookup بدلاً من O(N))
    const coinMap = new Map<string, CoinData>();
    coinMeshesRef.current.forEach(c => coinMap.set(c.uuid, c));

    const ctx: Ctx = {
      delta,
      dogPos: dogModelRef.current.position,
      frustum: f,
      perf: getDevicePerformanceConfig(),
      frame: frameRef.current,
      coinMap // تمرير الخريطة للسياق
    };
    enemies.current.forEach(e => updateOne(e, ctx));
  }, [manageChunks, filterDead, updateOne, isPausedRef, dogModelRef, sceneRef, cameraRef, updateReconciliation, enemies]);
};

export const useEnemyLogic = (props: Props) => {
  const enemies = React.useRef<EnemyData[]>([]), frameRef = React.useRef(0);
  const pendingCoins = React.useRef<Set<string>>(new Set());

  const hooks = initializeEnemyHooks(props, enemies, pendingCoins);
  const {
    manageChunks,
    initializeEnemies,
    resetEnemies,
    forceLoadAreaEnemies,
    updateEnemyMovement,
    checkCollisions,
    updateDeathState,
    updateOctree,
    removeFromOctree,
    updateReconciliation,
    cleanupModelPool
  } = hooks;

  const updateOne = createUpdateOneCallback(props.coinMeshesRef, updateEnemyMovement, checkCollisions, updateOctree);
  const filterDead = createFilterDeadCallback(enemies, updateDeathState, removeFromOctree, props.sceneRef);
  const updateEnemies = createUpdateEnemiesCallback({
    enemies,
    frameRef,
    manageChunks,
    updateReconciliation,
    filterDead,
    updateOne,
    isPausedRef: props.isPausedRef,
    dogModelRef: props.dogModelRef,
    sceneRef: props.sceneRef,
    cameraRef: props.cameraRef,
    coinMeshesRef: props.coinMeshesRef // Pass it here
  });

  React.useEffect(() => () => { cleanupModelPool(); enemies.current = []; }, [cleanupModelPool]);
  return { initializeEnemies, updateEnemies, resetEnemies, forceLoadAreaEnemies, enemyMeshesRef: enemies };
};
