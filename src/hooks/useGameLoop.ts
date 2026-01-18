import type DogShieldEffect from '@/components/game/DogShieldEffect';
import type DogSpeedBeam from '@/components/game/DogSpeedBeam';
import type { Environment } from '@/lib/ez-tree/environment/environment';
import { getGPUInstancingManager } from '@/lib/gpu-instancing';
import { getLODManager } from '@/lib/lod-manager';
import { getMemoryMonitor } from '@/lib/object-pooling';
import { getDevicePerformanceConfig } from '@/lib/utils';
import { logger } from '@/utils/logger';
import type { PublicKey } from '@solana/web3.js';
import { useCallback, useRef } from 'react';
import type * as THREE from 'three';

interface UseGameLoopProps {
    sessionPublicKey: PublicKey | null; rendererRef: React.MutableRefObject<THREE.WebGLRenderer | null>;
    sceneRef: React.MutableRefObject<THREE.Scene | null>; cameraRef: React.MutableRefObject<THREE.PerspectiveCamera | null>;
    dogModelRef: React.MutableRefObject<THREE.Object3D | null>; clockRef: React.MutableRefObject<THREE.Clock>;
    isPausedRef: React.MutableRefObject<boolean>; isSpeedBoostActiveRef: React.MutableRefObject<boolean>;
    isShieldActiveRef: React.MutableRefObject<boolean>; speedBeamRef: React.MutableRefObject<DogSpeedBeam | null>;
    shieldEffectRef: React.MutableRefObject<DogShieldEffect | null>; environmentRef: React.MutableRefObject<Environment | null>;
    updateDog: (delta: number) => void; updateCoins: () => void; updateEnemies: (delta: number) => void;
    updateCamera: (delta: number) => void; updateFloatingEffects: () => void; updateParticles: () => void;
    cleanupModelPool: (timeout: number, maxCount: number) => void;
    trackPerformance: (metrics: { fps: number; memoryUsage: number; drawCalls: number }) => void;
}

export const useGameLoop = (p: UseGameLoopProps) => {
    const aFId = useRef<number | null>(null); const lFTRef = useRef<number>(performance.now());
    const lPTRef = useRef<number>(0); const lPURef = useRef<number>(0); const fCRef = useRef<number>(0);

    const trackMetrics = useCallback((currT: number, r: THREE.WebGLRenderer) => {
        fCRef.current++; if (currT - lPURef.current <= 5000) return;
        const dt = (currT - lPURef.current) / 1000; const fps = Math.round(fCRef.current / dt);
        fCRef.current = 0; lPURef.current = currT;
        const perf = performance as unknown as { memory?: { usedJSHeapSize: number } };
        if (r.info) p.trackPerformance({ fps, memoryUsage: perf.memory?.usedJSHeapSize || 0, drawCalls: r.info.render.calls });
    }, [p.trackPerformance]);

    const updateCore = useCallback((d: number) => {
        p.updateDog(d); p.updateCoins(); p.updateEnemies(d); p.updateCamera(d); p.updateFloatingEffects(); p.updateParticles();
        if (p.cameraRef.current) { getLODManager()?.updateCameraPosition(p.cameraRef.current.position); getGPUInstancingManager()?.updateInstances(); }
        if (Math.floor(performance.now() / 16.6) % 120 === 0) getMemoryMonitor()?.recordMemoryUsage();
    }, [p.updateDog, p.updateCoins, p.updateEnemies, p.updateCamera, p.updateFloatingEffects, p.updateParticles, p.cameraRef]);

    const updateAllSystems = useCallback((d: number) => {
        if (!p.dogModelRef.current || p.isPausedRef.current) return;
        updateCore(d); const dPos = p.dogModelRef.current.position;
        p.speedBeamRef.current?.update(p.isSpeedBoostActiveRef.current, dPos, p.dogModelRef.current.rotation);
        p.shieldEffectRef.current?.update(p.isShieldActiveRef.current, dPos);
        if (p.environmentRef.current) {
            p.environmentRef.current.update(p.clockRef.current.getElapsedTime(), dPos);
            if (performance.now() - lPTRef.current > 1000) { lPTRef.current = performance.now(); p.environmentRef.current.preloadInitialScene(dPos).catch(logger.warn); }
        }
        p.cleanupModelPool(60000, 5);
    }, [updateCore, p.cleanupModelPool, p.dogModelRef, p.isPausedRef, p.isShieldActiveRef, p.isSpeedBoostActiveRef, p.speedBeamRef, p.shieldEffectRef, p.environmentRef, p.clockRef]);

    const animate = useCallback(() => {
        if (!p.rendererRef.current || !p.sceneRef.current || !p.cameraRef.current || !p.sessionPublicKey) { aFId.current = null; return; }
        const perf = getDevicePerformanceConfig(); const currT = performance.now();
        if (perf.isMobile && currT - lFTRef.current < 1000 / perf.game.fpsLimit) { aFId.current = requestAnimationFrame(animate); return; }
        lFTRef.current = currT; trackMetrics(currT, p.rendererRef.current); aFId.current = requestAnimationFrame(animate);
        updateAllSystems(Math.min(p.clockRef.current.getDelta(), 1 / 30));
        try { p.rendererRef.current.render(p.sceneRef.current, p.cameraRef.current); } catch (e) { logger.error("Render error:", e); }
    }, [p.sessionPublicKey, trackMetrics, updateAllSystems, p.rendererRef, p.sceneRef, p.cameraRef, p.clockRef]);

    return { animate, animationFrameId: aFId };
};
