import { logger } from "@/utils/logger";
import type { MutableRefObject } from "react";
import { useCallback, useRef } from "react";
import type * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { getModel, putModel } from "../../lib/indexedDB";
import { COIN_MODEL_PATH } from "./constants";

export const useCoinLoader = (sceneRef: MutableRefObject<THREE.Scene | null>) => {
  const coinModelRef = useRef<THREE.Group | null>(null);
  const gltfLoaderRef = useRef<GLTFLoader | null>(null);
  const isCoinModelLoadedRef = useRef<boolean>(false);
  const coinModelPromiseRef = useRef<Promise<void> | null>(null);

  /* eslint-disable no-await-in-loop */
  const loadFromNetwork = async (modelName: string, maxAttempts: number = 20) => {
    for (let i = 1; i <= maxAttempts; i++) {
      try {
        const response = await fetch(COIN_MODEL_PATH);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const arr = await response.arrayBuffer();
        await putModel(modelName, arr);
        return arr;
      } catch (err) {
        logger.error(`[CoinLoader] Network attempt ${i} failed:`, err);
        if (i === maxAttempts) throw err;
        const delay = Math.min(1000 * Math.pow(1.5, i - 1), 10000);
        await new Promise(r => setTimeout(r, delay));
      }
    }
    throw new Error("All network attempts failed");
  };
  /* eslint-enable no-await-in-loop */

  const loadCoinModel = useCallback(async (): Promise<void> => {
    if (isCoinModelLoadedRef.current || !sceneRef.current) return;
    if (coinModelPromiseRef.current) {
      await coinModelPromiseRef.current;
      return;
    }

    coinModelPromiseRef.current = (async () => {
      try {
        if (!gltfLoaderRef.current) gltfLoaderRef.current = new GLTFLoader();
        const cached = await getModel("coin-model");
        const data = cached || (await loadFromNetwork("coin-model"));
        if (!data) return;

        const gltf = await gltfLoaderRef.current.parseAsync(data, "");
        coinModelRef.current = gltf.scene;

        isCoinModelLoadedRef.current = true;
      } catch (error) {
        logger.error(`[CoinLoader] Failure:`, error);
        try {
          if (gltfLoaderRef.current) {
            const gltf = await gltfLoaderRef.current.loadAsync(COIN_MODEL_PATH);
            coinModelRef.current = gltf.scene;
            isCoinModelLoadedRef.current = true;
          }
        } catch (e) {
          logger.error(`[CoinLoader] FATAL:`, e);
          coinModelPromiseRef.current = null;
        }
      }
    })();
    await coinModelPromiseRef.current;
  }, [sceneRef]);

  return { coinModelRef, isCoinModelLoadedRef, loadCoinModel };
};
