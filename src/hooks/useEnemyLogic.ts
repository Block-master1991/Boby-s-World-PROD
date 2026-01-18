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
import { useEnemySpawning } from './enemy/useEnemySpawning';
import type { CoinData } from './useCoinLogic';
import { useDynamicModelLoader } from './useDynamicModelLoader';

interface Props { sceneRef: MutableRefObject<THREE.Scene | null>; dogModelRef: MutableRefObject<THREE.Group | null>; isShieldActiveRef: MutableRefObject<boolean>; protectionBottleCountRef: MutableRefObject<number>; onConsumeProtectionBottle: () => void; onEnemyCollisionPenalty: () => void; isPausedRef: MutableRefObject<boolean>; coinMeshesRef: MutableRefObject<CoinData[]>; loadedCoinChunks: MutableRefObject<Set<string>>; onCoinCollected: () => void; octreeRef: MutableRefObject<Octree<GameObject> | null>; cameraRef: MutableRefObject<THREE.PerspectiveCamera | null>; addFloatingEffect: (options: FloatingEffectOptions) => void; onAttackAnimationFinished?: (event: THREE.Event) => void; }

interface Ctx { delta: number; dogPos: THREE.Vector3; frustum: THREE.Frustum; perf: ReturnType<typeof getDevicePerformanceConfig>; frame: number; }

const updateVis = (e: EnemyData, coins: CoinData[]) => { const c = coins.find(x => x.uuid === e.targetCoinId); if (c) e.lod.visible = c.collected || c.visible; };
const getAnimD = (d: number, dt: number, mob: boolean) => d > 150 ? dt * 6 : d > 60 ? dt * (mob ? 3 : 2) : dt;
const shouldAnim = (d: number, inF: boolean, ctx: Ctx) => { const { perf: p, frame: f } = ctx; if (p.isMobile && p.performanceLevel === 'low' && d > 40) return false; if (d < 60) return inF || d < 15; if (d < 150) return inF && (f % (p.isMobile ? 3 : 2) === 0); return inF && (f % 6 === 0); };
const animE = (e: EnemyData, d: number, inF: boolean, ctx: Ctx) => { if (e.mixer && shouldAnim(d, inF, ctx)) e.mixer.update(getAnimD(d, ctx.delta, ctx.perf.isMobile)); };
const dispE = (e: EnemyData) => { e.mixer.stopAllAction(); e.lod.traverse(c => { const m = c as THREE.Mesh; if (m.isMesh) m.geometry?.dispose(); }); };

export const useEnemyLogic = (props: Props) => {
  const { sceneRef, dogModelRef, isShieldActiveRef, protectionBottleCountRef, onConsumeProtectionBottle, onEnemyCollisionPenalty, isPausedRef, coinMeshesRef, loadedCoinChunks, octreeRef, onCoinCollected, cameraRef, addFloatingEffect } = props;
  const enemies = React.useRef<EnemyData[]>([]), frameRef = React.useRef(0);

  const { manageChunks, initializeEnemies, resetEnemies, forceLoadAreaEnemies } = useEnemySpawning({ sceneRef, octreeRef, enemyMeshesRef: enemies, coinMeshesRef, cameraRef, dogModelRef, loadedCoinChunks });
  const { updateEnemyMovement } = useEnemyMovement({ dogModelRef, octreeRef, sceneRef, isPausedRef, cameraRef });
  const { checkCollisions, updateDeathState } = useEnemyCombat({ dogModelRef, isShieldActiveRef, protectionBottleCountRef, onConsumeProtectionBottle, onEnemyCollisionPenalty, addFloatingEffect, onCoinCollected });
  const { cleanupModelPool } = useDynamicModelLoader({ cameraRef, sceneRef, octreeRef, objectsToManage: [] });

  const updateOne = React.useCallback((e: EnemyData, ctx: Ctx) => { const d = ctx.dogPos.distanceTo(e.position); if (!e.isDying) { updateEnemyMovement(e, ctx.delta, d); checkCollisions(e, d); } updateVis(e, coinMeshesRef.current); animE(e, d, ctx.frustum.containsPoint(e.position), ctx); if (octreeRef.current) { const o = { id: `enemy_${e.uuid}`, bounds: new THREE.Box3().setFromObject(e.lod), data: e as unknown as GameObject }; octreeRef.current.remove(o); octreeRef.current.insert(o); } }, [coinMeshesRef, octreeRef, updateEnemyMovement, checkCollisions]);

  const filterDead = React.useCallback((dt: number) => { const act: EnemyData[] = []; for (const e of enemies.current) { if (updateDeathState(e, dt)) { if (octreeRef.current) octreeRef.current.remove({ id: `enemy_${e.uuid}`, bounds: new THREE.Box3().setFromObject(e.lod), data: e as unknown as GameObject }); sceneRef.current?.remove(e.lod); dispE(e); } else act.push(e); } enemies.current = act; }, [updateDeathState, octreeRef, sceneRef]);

  const updateEnemies = React.useCallback((delta: number) => {
    if (isPausedRef.current || !dogModelRef.current || !sceneRef.current || !cameraRef.current) return;
    manageChunks(); filterDead(delta);
    const cam = cameraRef.current; cam.updateMatrixWorld(); const f = new THREE.Frustum(); f.setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    frameRef.current = (frameRef.current + 1) % 60;
    const ctx: Ctx = { delta, dogPos: dogModelRef.current.position, frustum: f, perf: getDevicePerformanceConfig(), frame: frameRef.current };
    enemies.current.forEach(e => updateOne(e, ctx));
  }, [manageChunks, filterDead, updateOne, isPausedRef, dogModelRef, sceneRef, cameraRef]);

  React.useEffect(() => () => { cleanupModelPool(); enemies.current = []; }, [cleanupModelPool]);
  return { initializeEnemies, updateEnemies, resetEnemies, forceLoadAreaEnemies, enemyMeshesRef: enemies };
};
