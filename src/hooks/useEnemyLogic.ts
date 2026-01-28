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
import { useEnemyLoader } from './enemy/useEnemyLoader';
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

import { VISIBLE_ENEMY_DISTANCE } from './coin/constants';

const updateVis = (e: EnemyData, dogPos: THREE.Vector3) => {
    // Decoupled visibility: Enemies visible based on their own distance, not the coin's
    const dist = dogPos.distanceTo(e.position);
    e.lod.visible = dist < VISIBLE_ENEMY_DISTANCE;
};

// Aggressive throttling for distant enemies (low load)
const getAnimD = (d: number, dt: number, mob: boolean) => d > 300 ? dt * 10 : d > 150 ? dt * 6 : d > 60 ? dt * (mob ? 3 : 2) : dt;

const shouldAnim = (d: number, inF: boolean, ctx: Ctx, e: EnemyData) => {
    // Professional Animation Culling:
    // If e.lod.visible is false (distance-based) OR not in Frustum, STOP calculations completely.
    // Exception: If very close (d < 10), keep it to avoid pop-in glitches when turning fast.
    if ((!e.lod.visible || !inF) && d > 10) return false;

    const { perf: p, frame: f } = ctx;
    // Ultra-low priority for very distant enemies
    if (d > 300) return inF && (f % 10 === 0);
    
    if (p.isMobile && p.performanceLevel === 'low' && d > 40) return false;
    if (d < 60) return inF || d < 15;
    if (d < 150) return inF && (f % (p.isMobile ? 3 : 2) === 0);
    return inF && (f % 6 === 0);
};

const animE = (e: EnemyData, d: number, inF: boolean, ctx: Ctx) => { 
    if (e.mixer && shouldAnim(d, inF, ctx, e)) {
        e.mixer.update(getAnimD(d, ctx.delta, ctx.perf.isMobile)); 
    }
};
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

  const { getPreloadableModels } = useEnemyLoader();
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
    getPreloadableModels,
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

    // التحقق من رؤية العدو باستخدام المسافة
    updateVis(e, ctx.dogPos);

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

const frustum = new THREE.Frustum();
const projScreenMatrix = new THREE.Matrix4();

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
    coinMeshesRef
  } = params;

  // Cache variables for coin map optimization
  const coinMapRef = React.useRef<Map<string, CoinData>>(new Map());
  const lastCoinCountRef = React.useRef(-1);

  return React.useCallback((delta: number) => {
    if (isPausedRef.current || !dogModelRef.current || !sceneRef.current || !cameraRef.current) return;
    
    // Process heavy logic in batches or intervals if needed
    manageChunks();
    updateReconciliation(delta);
    filterDead(delta);
    
    const cam = cameraRef.current;
    cam.updateMatrixWorld();
    
    // Optimized: Use persistent math objects to avoid per-frame GC
    projScreenMatrix.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    frustum.setFromProjectionMatrix(projScreenMatrix);
    
    frameRef.current = (frameRef.current + 1) % 60;

    // Optimized: Only rebuild coin map if the number of coins changed
    if (coinMeshesRef.current.length !== lastCoinCountRef.current) {
        coinMapRef.current.clear();
        coinMeshesRef.current.forEach(c => coinMapRef.current.set(c.uuid, c));
        lastCoinCountRef.current = coinMeshesRef.current.length;
    }

    const ctx: Ctx = {
      delta, dogPos: dogModelRef.current.position, frustum: frustum,
      perf: getDevicePerformanceConfig(), frame: frameRef.current, coinMap: coinMapRef.current
    };
    
    enemies.current.forEach(e => updateOne(e, ctx));
  }, [manageChunks, filterDead, updateOne, isPausedRef, dogModelRef, sceneRef, cameraRef, updateReconciliation, enemies, coinMeshesRef]);
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
    getPreloadableModels,
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
  return { initializeEnemies, updateEnemies, resetEnemies, forceLoadAreaEnemies, enemyMeshesRef: enemies, getPreloadableEnemies: getPreloadableModels };
};
