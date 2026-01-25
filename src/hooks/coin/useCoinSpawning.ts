import type { GameObject } from '@/types/game';
import { logger } from '@/utils/logger';
import type { MutableRefObject } from 'react';
import { useCallback, useRef } from 'react';
import * as THREE from 'three';
import type { Octree } from '../../lib/Octree';
import { CHUNK_SIZE, getChunkKey } from '../../lib/chunkUtils';
import { COIN_EMISSIVE_INTENSITY, COIN_RADIUS, COIN_ROTATION_SPEED, COIN_VALUE, type CoinData } from './constants';

interface SpawningProps {
    sceneRef: MutableRefObject<THREE.Scene | null>;
    octreeRef: MutableRefObject<Octree<GameObject> | null>;
    coinMeshesRef: MutableRefObject<CoinData[]>;
    remainingCoinsRef: MutableRefObject<number>;
    onRemainingCoinsUpdate: (remaining: number) => void;
    coinModelRef: MutableRefObject<THREE.Group | null>;
    isCoinModelLoadedRef: MutableRefObject<boolean>;
    loadCoinModel: () => Promise<void>;
}

interface ChunkManager {
    getGameplaySpawns: (key: string) => { coinSpawns: Array<{ position: number[] }> } | undefined;
}

const createCoin = (spawn: { position: number[] }, model: THREE.Group, octree: Octree<GameObject> | null): CoinData | null => {
    if (!spawn.position || spawn.position.length < 3) return null;
    const [coinX, , coinZ] = spawn.position;
    if (typeof coinX !== 'number' || typeof coinZ !== 'number') return null;

    const coin = model.clone() as CoinData;
    Object.assign(coin, { collected: false, value: COIN_VALUE, rotationSpeed: COIN_ROTATION_SPEED, userData: {} });
    
    const coinY = octree ? octree.getGroundHeightAt(coinX, coinZ) + COIN_RADIUS : COIN_RADIUS;
    coin.position.set(coinX, coinY, coinZ);
    coin.scale.set(2.5, 2.5, 2.5);
    coin.castShadow = true;
    coin.rotation.set(0, 0, 0);

    coin.traverse((c) => {
        if ((c as THREE.Mesh).isMesh) {
            const m = (c as THREE.Mesh).material as THREE.MeshStandardMaterial;
            m.emissive = m.color.clone();
            m.emissiveIntensity = COIN_EMISSIVE_INTENSITY;
        }
    });
    return coin;
};

const handleChunkLoad = (
    chunkKey: string,
    chunkManager: ChunkManager,
    props: SpawningProps,
    addToLoaded: (k: string) => void
) => {
    const data = chunkManager.getGameplaySpawns(chunkKey);
    if (!data?.coinSpawns || !props.coinModelRef.current || !props.sceneRef.current) return;

    data.coinSpawns.forEach(spawn => {
        const coin = createCoin(spawn, props.coinModelRef.current!, props.octreeRef.current);
        if (coin) {
            coin.chunkKey = chunkKey; // إضافة chunkKey
            props.coinMeshesRef.current.push(coin);
            props.sceneRef.current!.add(coin);
            if (props.octreeRef.current) {
                props.octreeRef.current.insert({
                    id: `coin_${coin.uuid}`,
                    bounds: new THREE.Box3().setFromObject(coin),
                    data: coin as unknown as GameObject
                });
            }
        }
    });
    addToLoaded(chunkKey);
    logger.log(`[CoinLogic] Chunk ${chunkKey} loaded.`);
    props.onRemainingCoinsUpdate(props.remainingCoinsRef.current);
};

export const useCoinSpawning = (props: SpawningProps) => {
    const { sceneRef, isCoinModelLoadedRef, loadCoinModel } = props;
    const loadedCoinChunks = useRef<Set<string>>(new Set());
    const loadingCoinChunks = useRef<Set<string>>(new Set());

    const loadCoinsForChunk = useCallback(async (cX: number | undefined, cZ: number | undefined) => {
        if (cX === undefined || cZ === undefined) return;
        const k = getChunkKey(cX, cZ);
        if (!sceneRef.current || loadedCoinChunks.current.has(k) || loadingCoinChunks.current.has(k)) return;

        loadingCoinChunks.current.add(k);
        try {
            if (!isCoinModelLoadedRef.current) await loadCoinModel();
            const cm = sceneRef.current?.getObjectByName('ChunkManager') as unknown as ChunkManager;
            if (cm) handleChunkLoad(k, cm, props, (key) => loadedCoinChunks.current.add(key));
        } finally { loadingCoinChunks.current.delete(k); }
    }, [sceneRef, isCoinModelLoadedRef, loadCoinModel, props]);

    const unloadCoinsFromChunk = useCallback((cX: number | undefined, cZ: number | undefined) => {
        if (cX === undefined || cZ === undefined) return;
        const key = getChunkKey(cX, cZ);
        if (!sceneRef.current || !loadedCoinChunks.current.has(key)) return;

        const [minX, minZ] = [cX * CHUNK_SIZE, cZ * CHUNK_SIZE];
        const [maxX, maxZ] = [minX + CHUNK_SIZE, minZ + CHUNK_SIZE];

        props.coinMeshesRef.current = props.coinMeshesRef.current.filter(c => {
            if (c.position.x >= minX && c.position.x < maxX && c.position.z >= minZ && c.position.z < maxZ) {
                sceneRef.current?.remove(c);
                if (props.octreeRef.current) {
                    props.octreeRef.current.remove({ id: `coin_${c.uuid}`, bounds: new THREE.Box3().setFromObject(c), data: c as unknown as GameObject });
                }
                return false;
            }
            return true;
        });
        loadedCoinChunks.current.delete(key);
    }, [sceneRef, props.octreeRef, props.coinMeshesRef]);

    return { loadedCoinChunks, loadCoinsForChunk, unloadCoinsFromChunk };
};
