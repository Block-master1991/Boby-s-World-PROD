import { logger } from '@/utils/logger';
import type { MutableRefObject } from 'react';
import { useCallback, useRef } from 'react';
import type * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { getModel, putModel } from '../../lib/indexedDB';
import { COIN_MODEL_PATH } from './constants';

export const useCoinLoader = (sceneRef: MutableRefObject<THREE.Scene | null>) => {
    const coinModelRef = useRef<THREE.Group | null>(null);
    const gltfLoaderRef = useRef<GLTFLoader | null>(null);
    const isCoinModelLoadedRef = useRef<boolean>(false);
    const coinModelPromiseRef = useRef<Promise<void> | null>(null);

    const loadFromNetwork = async (modelName: string) => {
        const response = await fetch(COIN_MODEL_PATH);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const arr = await response.arrayBuffer();
        await putModel(modelName, arr);
        return arr;
    };

    const loadCoinModel = useCallback(async () => {
        if (isCoinModelLoadedRef.current || !sceneRef.current) return;
        if (coinModelPromiseRef.current) return coinModelPromiseRef.current;

        coinModelPromiseRef.current = (async () => {
            try {
                if (!gltfLoaderRef.current) gltfLoaderRef.current = new GLTFLoader();
                const cached = await getModel('coin-model');
                const data = cached || await loadFromNetwork('coin-model');
                if (data) {
                    const gltf = await gltfLoaderRef.current.parseAsync(data, '');
                    coinModelRef.current = gltf.scene;
                }
                isCoinModelLoadedRef.current = true;
            } catch (error) {
                logger.error(`[CoinLogic] Error:`, error);
                try {
                    if (gltfLoaderRef.current) {
                        const gltf = await gltfLoaderRef.current.loadAsync(COIN_MODEL_PATH);
                        coinModelRef.current = gltf.scene;
                        isCoinModelLoadedRef.current = true;
                    }
                } catch { coinModelPromiseRef.current = null; }
            }
        })();
        await coinModelPromiseRef.current;
    }, [sceneRef]);

    return { coinModelRef, isCoinModelLoadedRef, loadCoinModel };
};
