import type DogShieldEffect from "@/components/game/DogShieldEffect";
import type DogSpeedBeam from "@/components/game/DogSpeedBeam";
import { getGPUInstancingManager } from "@/lib/gpu-instancing";
import { getLODManager } from "@/lib/lod/lod-manager";
import { getDevicePerformanceConfig } from "@/lib/utils";
import type { Environment } from "@/lib/world-generation/environment-generator/environment";
import { logger } from "@/utils/logger";
import type { PublicKey } from "@solana/web3.js";
import { useCallback, useRef } from "react";
import type * as THREE from "three";

interface UseGameLoopProps {
  sessionPublicKey: PublicKey | null;
  rendererRef: React.MutableRefObject<THREE.WebGLRenderer | null>;
  sceneRef: React.MutableRefObject<THREE.Scene | null>;
  cameraRef: React.MutableRefObject<THREE.PerspectiveCamera | null>;
  dogModelRef: React.MutableRefObject<THREE.Object3D | null>;
  clockRef: React.MutableRefObject<THREE.Clock>;
  isPausedRef: React.MutableRefObject<boolean>;
  isSpeedBoostActiveRef: React.MutableRefObject<boolean>;
  isShieldActiveRef: React.MutableRefObject<boolean>;
  speedBeamRef: React.MutableRefObject<DogSpeedBeam | null>;
  shieldEffectRef: React.MutableRefObject<DogShieldEffect | null>;
  environmentRef: React.MutableRefObject<Environment | null>;
  updateDog: (delta: number) => void;
  updateCoins: () => void;
  updateEnemies: (delta: number) => void;
  updateCamera: (delta: number) => void;
  updateFloatingEffects: () => void;
  updateParticles: () => void;
  cleanupModelPool: (timeout: number, maxCount: number) => void;
  trackPerformance: (metrics: { fps: number; memoryUsage: number; drawCalls: number }) => void;
}

export const useGameLoop = (p: UseGameLoopProps) => {
  const aFId = useRef<number | null>(null);
  const lFTRef = useRef<number>(performance.now());
  const lPURef = useRef<number>(0);
  const fCRef = useRef<number>(0);

  // Use Refs for callbacks to avoid stale closures in animate()
  const cb = useRef(p);
  cb.current = p;

  const trackMetrics = useCallback((currT: number, r: THREE.WebGLRenderer) => {
    fCRef.current++;
    if (currT - lPURef.current <= 5000) return;
    const dt = (currT - lPURef.current) / 1000;
    const fps = Math.round(fCRef.current / dt);
    fCRef.current = 0;
    lPURef.current = currT;
    const perf = performance as unknown as { memory?: { usedJSHeapSize: number } };
    if (r.info)
      cb.current.trackPerformance({
        fps,
        memoryUsage: perf.memory?.usedJSHeapSize || 0,
        drawCalls: r.info.render.calls,
      });
  }, []);

  const updateCore = useCallback((d: number) => {
    const {
      updateDog,
      updateCoins,
      updateEnemies,
      updateCamera,
      updateFloatingEffects,
      updateParticles,
      cameraRef,
    } = cb.current;
    updateDog(d);
    updateCoins();
    updateEnemies(d);
    updateCamera(d);
    updateFloatingEffects();
    updateParticles();
    if (cameraRef.current) {
      getLODManager()?.updateCameraPosition(cameraRef.current.position);
      getGPUInstancingManager()?.updateInstances();
    }
    // Memory sampling is handled by MemoryMonitor's own setInterval (every 5 s).
    // Calling recordMemoryUsage() here as well would double-sample and cause
    // unnecessary GC pressure on mobile – so we intentionally omit it.
  }, []);

  const updateAllSystems = useCallback(
    (d: number) => {
      const {
        dogModelRef,
        isPausedRef,
        speedBeamRef,
        isSpeedBoostActiveRef,
        shieldEffectRef,
        isShieldActiveRef,
        environmentRef,
        cameraRef,
        clockRef,
        cleanupModelPool,
      } = cb.current;
      if (!dogModelRef.current || isPausedRef.current) return;
      updateCore(d);
      const dPos = dogModelRef.current.position;
      speedBeamRef.current?.update(
        isSpeedBoostActiveRef.current,
        dPos,
        dogModelRef.current.rotation
      );
      shieldEffectRef.current?.update(isShieldActiveRef.current, dPos);
      if (environmentRef.current && cameraRef.current) {
        environmentRef.current.update(clockRef.current.getElapsedTime(), cameraRef.current);
      }
      cleanupModelPool(60000, 5);
    },
    [updateCore]
  );

  const animate = useCallback(() => {
    const { rendererRef, sceneRef, cameraRef, sessionPublicKey, clockRef } = cb.current;
    if (!rendererRef.current || !sceneRef.current || !cameraRef.current || !sessionPublicKey) {
      aFId.current = null;
      return;
    }
    const perf = getDevicePerformanceConfig();
    const currT = performance.now();
    if (perf.isMobile && currT - lFTRef.current < 1000 / perf.game.fpsLimit) {
      aFId.current = requestAnimationFrame(animate);
      return;
    }
    lFTRef.current = currT;
    trackMetrics(currT, rendererRef.current);
    aFId.current = requestAnimationFrame(animate);
    updateAllSystems(Math.min(clockRef.current.getDelta(), 1 / 30));
    try {
      rendererRef.current.render(sceneRef.current, cameraRef.current);
    } catch (e) {
      logger.error("Render error:", e);
    }
  }, [trackMetrics, updateAllSystems]);

  return { animate, animationFrameId: aFId };
};
