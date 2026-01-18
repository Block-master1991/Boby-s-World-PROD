import type { CoinData } from '@/hooks/useCoinLogic';
import { getChunkCoordinates, getChunkKey, RENDER_DISTANCE_CHUNKS } from '@/lib/chunkUtils';
import type { Octree } from '@/lib/Octree';
import type { GameObject } from '@/types/game';
import { logger } from '@/utils/logger';
import { useCallback, useEffect, useRef } from 'react';
import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils';
import { ENEMY_ANIMATION_NAMES } from './constants';
import type { EnemyData } from './types';
import { useEnemyLoader } from './useEnemyLoader';

interface Props { sceneRef: React.MutableRefObject<THREE.Scene | null>; octreeRef: React.MutableRefObject<Octree<GameObject> | null>; enemyMeshesRef: React.MutableRefObject<EnemyData[]>; coinMeshesRef: React.MutableRefObject<CoinData[]>; cameraRef: React.MutableRefObject<THREE.PerspectiveCamera | null>; dogModelRef: React.MutableRefObject<THREE.Group | null>; loadedCoinChunks: React.MutableRefObject<Set<string>>; }

interface EP { coin: CoinData; model: THREE.Group; lod: THREE.LOD; mixer: THREE.AnimationMixer; actions: Record<string, THREE.AnimationAction>; action: THREE.AnimationAction | null; type: 'carnivore' | 'herbivore'; chunk: string; }

const posModel = (m: THREE.Group, c: CoinData) => { m.position.copy(c.position); const a = Math.random() * Math.PI * 2, r = 2 + Math.random() * 2; m.position.x += Math.cos(a) * r; m.position.z += Math.sin(a) * r; m.position.y = c.position.y; };
const mkMixer = (m: THREE.Group, a: THREE.AnimationClip[]) => { const mx = new THREE.AnimationMixer(m), ac: Record<string, THREE.AnimationAction> = {}; a.forEach(c => { ac[c.name] = mx.clipAction(c); }); return { mixer: mx, actions: ac }; };
const mkEnemy = (p: EP): EnemyData => ({ uuid: `${p.coin.uuid}_enemy`, position: p.model.position, rotation: p.model.rotation, scale: p.model.scale, visible: true, type: 'enemy', targetCoinId: p.coin.uuid, targetCoinPosition: p.coin.position.clone(), patrolCenter: p.model.position.clone(), patrolTarget: p.model.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 10, 0, (Math.random() - 0.5) * 10)), isIdling: false, idleTimer: 0, idleDuration: 0, isAttacking: false, isDying: false, deathTimer: 0, hasAppliedDeathEffect: false, isSinking: false, sinkingTimer: 0, initialDeathY: 0, mixer: p.mixer, animations: [], enemyType: p.type, currentAction: p.action, actions: p.actions, chunkKey: p.chunk, highDetailModel: p.model, lod: p.lod, lookAt: (t: THREE.Vector3) => p.lod.lookAt(t), isPooled: false, isModelInstantiated: true });
const getNearKeys = (cx: number, cz: number) => { const s = new Set<string>(); for (let x = -RENDER_DISTANCE_CHUNKS; x <= RENDER_DISTANCE_CHUNKS; x++) for (let z = -RENDER_DISTANCE_CHUNKS; z <= RENDER_DISTANCE_CHUNKS; z++) s.add(getChunkKey(cx + x, cz + z)); return s; };
const parseKey = (k: string) => { const p = k.split(','); return { cx: parseInt(p[0] ?? '0', 10), cz: parseInt(p[1] ?? '0', 10) }; };

export const useEnemySpawning = ({ sceneRef, octreeRef, enemyMeshesRef, coinMeshesRef, cameraRef, dogModelRef }: Props) => {
  const { loadEnemyModel, disposeModel, preloadModels } = useEnemyLoader();
  const loaded = useRef<Set<string>>(new Set()), pending = useRef<Set<string>>(new Set()), queue = useRef<{ coin: CoinData; chunk: string }[]>([]);

  const spawn = useCallback(async (coin: CoinData, chunk: string) => {
    if (coin.collected || pending.current.has(coin.uuid)) return;
    pending.current.add(coin.uuid);
    const t = Math.random() < 0.5 ? 'carnivore' : 'herbivore', { model: raw, animations } = await loadEnemyModel(t);
    if (!sceneRef.current || coin.collected) { pending.current.delete(coin.uuid); return; }
    const model = SkeletonUtils.clone(raw) as THREE.Group; posModel(model, coin);
    const { mixer, actions } = mkMixer(model, animations), idles = t === 'carnivore' ? ENEMY_ANIMATION_NAMES.CARNIVORE.IDLE : ENEMY_ANIMATION_NAMES.HERBIVORE.IDLE, nm = idles[Math.floor(Math.random() * idles.length)], action = nm ? actions[nm] ?? null : null;
    if (action) action.play(); const lod = new THREE.LOD(); lod.addLevel(model, 0); sceneRef.current.add(lod);
    enemyMeshesRef.current.push(mkEnemy({ coin, model, lod, mixer, actions, action, type: t, chunk })); pending.current.delete(coin.uuid);
  }, [loadEnemyModel, sceneRef, enemyMeshesRef]);

  const process = useCallback(async () => { if (queue.current.length) await Promise.all(queue.current.splice(0, 3).map(i => spawn(i.coin, i.chunk))); }, [spawn]);
  const unload = useCallback((near: Set<string>) => { for (const k of loaded.current) if (!near.has(k)) { enemyMeshesRef.current.filter(e => e.chunkKey === k).forEach(e => { sceneRef.current?.remove(e.lod); disposeModel(e.lod); }); enemyMeshesRef.current = enemyMeshesRef.current.filter(e => e.chunkKey !== k); loaded.current.delete(k); } }, [sceneRef, disposeModel, enemyMeshesRef]);
  const queueSpawns = useCallback((near: Set<string>) => { coinMeshesRef.current.forEach(c => { const k = c.chunkKey ?? ''; if (!c.collected && near.has(k) && !enemyMeshesRef.current.some(e => e.targetCoinId === c.uuid) && !pending.current.has(c.uuid)) queue.current.push({ coin: c, chunk: k }); }); }, [coinMeshesRef, enemyMeshesRef]);
  const loadChunk = useCallback(async (cx: number, cz: number) => { const k = getChunkKey(cx, cz); if (loaded.current.has(k)) return; loaded.current.add(k); const coins = coinMeshesRef.current.filter(c => (c.chunkKey ?? '') === k && !c.collected && !enemyMeshesRef.current.some(e => e.targetCoinId === c.uuid)); await Promise.all(coins.map(c => spawn(c, k))); }, [coinMeshesRef, enemyMeshesRef, spawn]);
  const manageChunks = useCallback(() => { if (!cameraRef.current) return; const { chunkX, chunkZ } = getChunkCoordinates(cameraRef.current.position.x, cameraRef.current.position.z); const near = getNearKeys(chunkX, chunkZ); unload(near); queueSpawns(near); near.forEach(k => loaded.current.add(k)); process(); }, [cameraRef, unload, queueSpawns, process]);

  const initializeEnemies = useCallback(async () => {
    if (!sceneRef.current || !dogModelRef.current) return; await preloadModels();
    enemyMeshesRef.current.forEach(e => { if (octreeRef.current) octreeRef.current.remove({ id: `enemy_${e.uuid}`, bounds: new THREE.Box3().setFromObject(e.lod), data: e as unknown as GameObject }); e.mixer.stopAllAction(); sceneRef.current?.remove(e.lod); disposeModel(e.lod); });
    enemyMeshesRef.current = []; loaded.current.clear(); pending.current.clear();
    const { chunkX, chunkZ } = getChunkCoordinates(dogModelRef.current.position.x, dogModelRef.current.position.z); const keys = getNearKeys(chunkX, chunkZ);
    await Promise.all(Array.from(keys).map(k => { const { cx, cz } = parseKey(k); return loadChunk(cx, cz); })); logger.log('[useEnemySpawning] Initialized.');
  }, [sceneRef, dogModelRef, octreeRef, enemyMeshesRef, preloadModels, disposeModel, loadChunk]);

  const resetEnemies = useCallback(() => { initializeEnemies(); }, [initializeEnemies]);
  const forceLoadAreaEnemies = useCallback(async (cx: number, cz: number) => { if (!sceneRef.current) return; const keys = getNearKeys(cx, cz); await Promise.all(Array.from(keys).filter(k => !loaded.current.has(k)).map(k => { const { cx: x, cz: z } = parseKey(k); return loadChunk(x, z); })); logger.log(`[useEnemySpawning] Force loaded ${keys.size} chunks.`); }, [sceneRef, loadChunk]);

  useEffect(() => {
    const mgr = sceneRef.current?.getObjectByName('ChunkManager'); if (!mgr) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onLoad = (e: any) => { if (e?.checkChunkKey) { const { cx, cz } = parseKey(e.checkChunkKey as string); loadChunk(cx, cz); } };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mgr as any).addEventListener('chunk-loaded', onLoad);
    const pos = dogModelRef.current?.position; if (pos) { const { chunkX, chunkZ } = getChunkCoordinates(pos.x, pos.z); Array.from(getNearKeys(chunkX, chunkZ)).forEach(k => { const { cx, cz } = parseKey(k); loadChunk(cx, cz); }); }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return () => { (mgr as any).removeEventListener('chunk-loaded', onLoad); };
  }, [sceneRef, dogModelRef, loadChunk]);

  return { manageChunks, initializeEnemies, resetEnemies, forceLoadAreaEnemies, loadedChunks: loaded };
};
