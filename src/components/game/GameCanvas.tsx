'use client';

import type DogShieldEffect from '@/components/game/DogShieldEffect';
import type DogSpeedBeam from '@/components/game/DogSpeedBeam';
import { useAnalytics } from '@/hooks/useAnalytics';
import { useCameraLogic } from '@/hooks/useCameraLogic';
import { useCanvasEffects } from '@/hooks/useCanvasEffects';
import { useCoinLogic } from '@/hooks/useCoinLogic';
import { useDogLogic } from '@/hooks/useDogLogic';
import { useDogParticles } from '@/hooks/useDogParticles';
import { useDynamicModelLoader } from '@/hooks/useDynamicModelLoader';
import { useEnemyLogic } from '@/hooks/useEnemyLogic';
import { useFloatingEffects } from '@/hooks/useFloatingEffects';
import { useGameLoop } from '@/hooks/useGameLoop';
import { useKeyboardHandling } from '@/hooks/useKeyboardHandling';
import { useLoadingLogic } from '@/hooks/useLoadingLogic';
import { usePropSync } from '@/hooks/usePropSync';
import { useSceneSetup } from '@/hooks/useSceneSetup';
import { useTouchHandling } from '@/hooks/useTouchHandling';
import type { Environment } from '@/lib/ez-tree/environment/environment';
import type { Octree } from '@/lib/Octree';
import { THREE } from '@/lib/three-chunk';
import type { GameObject } from '@/types/game';
import type { PublicKey } from '@solana/web3.js';
import React, { useCallback, useRef } from 'react';

interface GameCanvasProps {
    sessionPublicKey: PublicKey | null; isSpeedBoostActive: boolean; isShieldActive: boolean; isCoinMagnetActive: boolean;
    COIN_MAGNET_RADIUS: number; onCoinCollected: () => void; onRemainingCoinsUpdate: (remaining: number) => void;
    isPaused: boolean; joystickInput: { x: number; y: number } | null;
    onCanvasTouchStart: (screenX: number, screenY: number) => void; onCanvasTouchMove: (deltaX: number, deltaY: number) => void;
    onCanvasTouchEnd: () => void; protectionBottleCount: number; onConsumeProtectionBottle: () => void;
    onEnemyCollisionPenalty: () => void; COIN_COUNT: number; octreeRef: React.MutableRefObject<Octree<GameObject> | null>;
    onLoadStart: () => void; onLoadProgress: (progress: number, phase?: string) => void; onLoadComplete: (success: boolean) => void;
}

const GameCanvas: React.FC<GameCanvasProps> = (p) => {
    const mRef = useRef<HTMLDivElement>(null); const cRef = useRef(new THREE.Clock());
    const scRef = useRef<THREE.Scene | null>(null); const camRef = useRef<THREE.PerspectiveCamera | null>(null);
    const rRef = useRef<THREE.WebGLRenderer | null>(null); const sbRef = useRef<DogSpeedBeam | null>(null);
    const sERef = useRef<DogShieldEffect | null>(null); const pSRRef = useRef<PublicKey | null>(null);
    const iTRRef = useRef<{ x: number, y: number, id: number } | null>(null);
    const dCRef = useRef<{ chunkX: number; chunkZ: number } | null>(null); const eRef = useRef<Environment | null>(null);

    const { isSpeedBoostActiveRef: isSB, isShieldActiveRef: isSh, isCoinMagnetActiveRef: isCM, isPausedRef: isP, joystickInputRef: jI, protectionBottleCountRef: pBC, isJoystickInteractionActiveRef: isJI, keysPressedRef: kP } = usePropSync({ isSpeedBoostActive: p.isSpeedBoostActive, isShieldActive: p.isShieldActive, isCoinMagnetActive: p.isCoinMagnetActive, isPaused: p.isPaused, joystickInputFromUI: p.joystickInput, protectionBottleCount: p.protectionBottleCount, onCanvasTouchEndProp: p.onCanvasTouchEnd });
    const { dogModelRef, lastDogTransformRef, initializeDog, updateDog, resetDogState, dogSpeed, isRunning } = useDogLogic({ sceneRef: scRef, clockRef: cRef, keysPressedRef: kP, joystickInputRef: jI, isPausedRef: isP, isSpeedBoostActiveRef: isSB, isShieldActiveRef: isSh, isJoystickInteractionActiveRef: isJI, octreeRef: p.octreeRef });
    const { addFloatingEffect: aFE, updateFloatingEffects, cleanupFloatingEffects, activateMagnetEffect, deactivateMagnetEffect, activateSpeedBeam, deactivateSpeedBeam, activateShieldEffect, deactivateShieldEffect } = useFloatingEffects({ sceneRef: scRef, cameraRef: camRef });
    const { updateParticles } = useDogParticles({ sceneRef: scRef, dogMeshRef: dogModelRef, dogSpeed, isRunning });
    const { trackPerformance, trackGameEvent, trackUserAction, trackError } = useAnalytics();
    const { initializeCoins, updateCoins, coinMeshesRef, loadedCoinChunks, forceLoadAreaCoins, coinModelRef } = useCoinLogic({ sceneRef: scRef, dogModelRef, isCoinMagnetActiveRef: isCM, COIN_MAGNET_RADIUS: p.COIN_MAGNET_RADIUS, COIN_COUNT: p.COIN_COUNT, onCoinCollected: p.onCoinCollected, onRemainingCoinsUpdate: p.onRemainingCoinsUpdate, isPausedRef: isP, octreeRef: p.octreeRef, addFloatingEffect: aFE });
    const { initializeEnemies, updateEnemies, forceLoadAreaEnemies, getPreloadableEnemies } = useEnemyLogic({ sceneRef: scRef, dogModelRef, isShieldActiveRef: isSh, protectionBottleCountRef: pBC, onConsumeProtectionBottle: p.onConsumeProtectionBottle, onEnemyCollisionPenalty: p.onEnemyCollisionPenalty, isPausedRef: isP, coinMeshesRef, loadedCoinChunks, onCoinCollected: p.onCoinCollected, onAttackAnimationFinished: () => { }, octreeRef: p.octreeRef, cameraRef: camRef, addFloatingEffect: aFE });
    const { cleanupModelPool } = useDynamicModelLoader({ cameraRef: camRef, sceneRef: scRef, octreeRef: p.octreeRef, objectsToManage: [] });
    const { initializeCamera, setupInitialCameraPosition, updateCamera, resetCamera } = useCameraLogic({ cameraRef: camRef, dogModelRef, mountRef: mRef });
    const { initializeScene, handleResize, cleanupScene: bCS } = useSceneSetup({ mountRef: mRef, sceneRef: scRef, cameraRef: camRef, rendererRef: rRef, octreeRef: p.octreeRef, isPausedRef: isP, isJoystickInteractionActiveRef: isJI });
    const { loadAllGameAssets: lAA, setupGameWorldAndComplete: sGW } = useLoadingLogic({ rendererRef: rRef, cameraRef: camRef, dogModelRef, coinModelRef, environmentRef: eRef, currentDogChunkRef: dCRef, onLoadStart: p.onLoadStart, onLoadProgress: p.onLoadProgress, onLoadComplete: p.onLoadComplete, initializeDog: async () => { await initializeDog(); }, initializeCoins: async () => { await initializeCoins(); }, initializeEnemies: async () => { await initializeEnemies(); }, forceLoadAreaCoins: async (cx, cz) => { await forceLoadAreaCoins(cx, cz); }, forceLoadAreaEnemies: async (cx, cz) => { await forceLoadAreaEnemies(cx, cz); }, setupInitialCameraPosition, getPreloadableEnemies });
    useTouchHandling({ mountRef: mRef, sessionPublicKey: p.sessionPublicKey, isPausedRef: isP, isJoystickInteractionActiveRef: isJI, onCanvasTouchStartProp: p.onCanvasTouchStart, onCanvasTouchMoveProp: p.onCanvasTouchMove, onCanvasTouchEndProp: p.onCanvasTouchEnd, initialTouchPointRef: iTRRef });
    useKeyboardHandling({ sessionPublicKey: p.sessionPublicKey, isPausedRef: isP, keysPressedRef: kP });
    const { animate, animationFrameId: aId } = useGameLoop({ sessionPublicKey: p.sessionPublicKey, rendererRef: rRef, sceneRef: scRef, cameraRef: camRef, dogModelRef, clockRef: cRef, isPausedRef: isP, isSpeedBoostActiveRef: isSB, isShieldActiveRef: isSh, speedBeamRef: sbRef, shieldEffectRef: sERef, environmentRef: eRef, updateDog, updateCoins, updateEnemies, updateCamera, updateFloatingEffects, updateParticles, cleanupModelPool, trackPerformance });

    const cS = useCallback(() => {
        bCS(); const e = eRef.current; if (e && scRef.current) scRef.current.remove(e);
        eRef.current = null; if (e?.chunkManager) e.chunkManager.dispose();
    }, [bCS]);
    useCanvasEffects({ sessionPublicKey: p.sessionPublicKey, isPaused: p.isPaused, isCoinMagnetActive: p.isCoinMagnetActive, isSpeedBoostActive: p.isSpeedBoostActive, isShieldActive: p.isShieldActive, mountRef: mRef, cameraRef: camRef, rendererRef: rRef, sceneRef: scRef, dogModelRef, lastDogTransformRef, prevSessionPublicKeyRef: pSRRef, environmentRef: eRef, speedBeamRef: sbRef, shieldEffectRef: sERef, animationFrameId: aId, handleResize, cleanupScene: cS, resetDogState, resetCamera, initializeCamera, initializeScene, loadAllGameAssets: lAA, setupGameWorldAndComplete: sGW, setupInitialCameraPosition, animate, activateMagnetEffect, deactivateMagnetEffect, activateSpeedBeam, deactivateSpeedBeam, activateShieldEffect, deactivateShieldEffect, cleanupFloatingEffects, trackError, trackGameEvent, trackUserAction });

    return <div ref={mRef} className="w-full h-full absolute inset-0 z-0" />;
};

export default GameCanvas;
