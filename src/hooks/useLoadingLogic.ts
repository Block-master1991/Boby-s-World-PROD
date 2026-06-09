import type { LoadingProgressData as LPData } from "@/components/game/helpers/PriorityAssetLoader";
import { PriorityAssetLoader } from "@/components/game/helpers/PriorityAssetLoader";
import { getChunkCoordinates } from "@/lib/chunkUtils";
import type { Environment } from "@/lib/world-generation/environment-generator/environment";
import { logger } from "@/utils/logger";
import type { MutableRefObject as MRef } from "react";
import { useCallback } from "react";
import type * as THREE from "three";

interface UseLoadingLogicProps {
  rendererRef: MRef<THREE.WebGLRenderer | null>;
  cameraRef: MRef<THREE.PerspectiveCamera | null>;
  dogModelRef: MRef<THREE.Object3D | null>;
  environmentRef: MRef<Environment | null>;
  coinModelRef: MRef<THREE.Group | null>; // Add this
  currentDogChunkRef: MRef<{ chunkX: number; chunkZ: number } | null>;
  onLoadStart: () => void;
  onLoadProgress: (p: number, ph?: string) => void;
  onLoadComplete: (s: boolean) => void;
  initializeDog: () => void | Promise<void>;
  initializeCoins: () => void | Promise<void>;
  initializeEnemies: () => void | Promise<void>;
  forceLoadAreaCoins: (cx: number, cz: number) => void | Promise<void>;
  forceLoadAreaEnemies: (cx: number, cz: number) => void | Promise<void>;
  setupInitialCameraPosition: () => void;
  getPreloadableEnemies: () => THREE.Object3D[];
}

export const useLoadingLogic = (p: UseLoadingLogicProps) => {
  const preloadEntities = useCallback(
    async (dogPos: THREE.Vector3) => {
      const { chunkX, chunkZ } = getChunkCoordinates(dogPos.x, dogPos.z);
      p.currentDogChunkRef.current = { chunkX, chunkZ };
      await Promise.all([
        p.forceLoadAreaCoins(chunkX, chunkZ),
        p.forceLoadAreaEnemies(chunkX, chunkZ),
      ]);
      p.setupInitialCameraPosition();
    },
    [
      p.currentDogChunkRef,
      p.forceLoadAreaCoins,
      p.forceLoadAreaEnemies,
      p.setupInitialCameraPosition,
    ]
  );

  const initializeWorldEnvironment = useCallback(
    async (dogPos: THREE.Vector3) => {
      if (!p.environmentRef.current) return;
      try {
        p.environmentRef.current
          .preloadInitialScene(dogPos)
          .catch(e => logger.warn("[useLoadingLogic] Preload error:", e));
        await new Promise(r => setTimeout(r, 300));
        await preloadEntities(dogPos);

        // Professional Shader Pre-warming:
        // Compile all shaders for key game entities BEFORE the player starts moving.
        if (p.rendererRef.current) {
          const { ShaderPrewarmer } = await import("@/lib/shaderPrewarmer");
          const enemies = p.getPreloadableEnemies();
          ShaderPrewarmer.prewarm(p.rendererRef.current, [
            p.dogModelRef.current,
            p.coinModelRef.current,
            ...enemies,
          ]);
        }
      } catch (error) {
        logger.error("[useLoadingLogic] World init error:", error);
      }
    },
    [
      p.environmentRef,
      preloadEntities,
      p.rendererRef,
      p.dogModelRef,
      p.coinModelRef,
      p.getPreloadableEnemies,
    ]
  );

  const loadAllGameAssets = useCallback(async () => {
    p.onLoadStart();
    try {
      const assetLoader = new PriorityAssetLoader({
        rendererRef: p.rendererRef,
        cameraRef: p.cameraRef,
        initializeDog: async () => {
          await p.initializeDog();
        },
        initializeCoins: async () => {
          await p.initializeCoins();
        },
        initializeEnemies: async () => {
          await p.initializeEnemies();
        },
      });
      await assetLoader.loadAssetsByPriority((d: LPData) => p.onLoadProgress(d.progress, d.phase));
      p.onLoadProgress(85, "world");
    } catch (error) {
      logger.error("[useLoadingLogic] Asset load error:", error);
      p.onLoadComplete(false);
      throw error;
    }
  }, [
    p.onLoadStart,
    p.initializeDog,
    p.initializeCoins,
    p.initializeEnemies,
    p.onLoadProgress,
    p.onLoadComplete,
    p.rendererRef,
    p.cameraRef,
  ]);

  const setupGameWorldAndComplete = useCallback(async () => {
    // Wait for both skybox and general environment assets (trees, rocks, grass, etc)
    const env = p.environmentRef.current;
    if (env) {
      await Promise.all([env.skybox.loadingPromise, env.loadingPromise]);
    }

    if (p.dogModelRef.current) {
      await initializeWorldEnvironment(p.dogModelRef.current.position);
      p.onLoadComplete(true);
    }
  }, [p.dogModelRef, p.environmentRef, initializeWorldEnvironment, p.onLoadComplete]);

  return { loadAllGameAssets, setupGameWorldAndComplete };
};
