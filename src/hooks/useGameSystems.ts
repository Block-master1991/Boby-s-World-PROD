import { useAnalytics } from '@/hooks/useAnalytics';
import { useCameraLogic } from '@/hooks/useCameraLogic';
import { useCoinLogic } from '@/hooks/useCoinLogic';
import { useDogLogic } from '@/hooks/useDogLogic';
import { useDogParticles } from '@/hooks/useDogParticles';
import { useDynamicModelLoader } from '@/hooks/useDynamicModelLoader';
import { useEnemyLogic } from '@/hooks/useEnemyLogic';
import { useFloatingEffects } from '@/hooks/useFloatingEffects';
import type { Octree } from '@/lib/Octree';
import type { GameObject } from '@/types/game';
import { useRef } from 'react';
import type * as THREE from 'three';

interface UseGameSystemsProps {
    sceneRef: React.MutableRefObject<THREE.Scene | null>;
    cameraRef: React.MutableRefObject<THREE.PerspectiveCamera | null>;
    mountRef: React.MutableRefObject<HTMLDivElement | null>;
    clockRef: React.MutableRefObject<THREE.Clock>;
    octreeRef: React.MutableRefObject<Octree<GameObject> | null>;
    isPausedRef: React.MutableRefObject<boolean>;
    isSpeedBoostActiveRef: React.MutableRefObject<boolean>;
    isShieldActiveRef: React.MutableRefObject<boolean>;
    isCoinMagnetActiveRef: React.MutableRefObject<boolean>;
    isJoystickInteractionActiveRef: React.MutableRefObject<boolean>;
    protectionBottleCountRef: React.MutableRefObject<number>;
    keysPressedRef: React.MutableRefObject<{ [key: string]: boolean }>;
    joystickInputRef: React.MutableRefObject<{ x: number; y: number } | null>;
    COIN_MAGNET_RADIUS: number;
    COIN_COUNT: number;
    onCoinCollected: () => void;
    onRemainingCoinsUpdate: (remaining: number) => void;
    onConsumeProtectionBottle: () => void;
    onEnemyCollisionPenalty: () => void;
}

export const useGameSystems = ({
    sceneRef, cameraRef, mountRef, clockRef, octreeRef, isPausedRef,
    isSpeedBoostActiveRef, isShieldActiveRef, isCoinMagnetActiveRef,
    isJoystickInteractionActiveRef, protectionBottleCountRef,
    keysPressedRef, joystickInputRef,
    COIN_MAGNET_RADIUS, COIN_COUNT, onCoinCollected, onRemainingCoinsUpdate,
    onConsumeProtectionBottle, onEnemyCollisionPenalty
}: UseGameSystemsProps) => {
    const dogMeshRef = useRef<THREE.Object3D | null>(null);
    const { dogModelRef, lastDogTransformRef, initializeDog, updateDog, resetDogState, dogSpeed, isRunning } = useDogLogic({
        sceneRef, clockRef, keysPressedRef, joystickInputRef,
        isPausedRef, isSpeedBoostActiveRef, isShieldActiveRef, isJoystickInteractionActiveRef, octreeRef
    });

    const floatingEffects = useFloatingEffects({ sceneRef, cameraRef });
    const { updateParticles } = useDogParticles({ sceneRef, dogMeshRef, dogSpeed, isRunning });
    const analytics = useAnalytics();
    const coins = useCoinLogic({ sceneRef, dogModelRef, isCoinMagnetActiveRef, COIN_MAGNET_RADIUS, COIN_COUNT, onCoinCollected, onRemainingCoinsUpdate, isPausedRef, octreeRef, addFloatingEffect: floatingEffects.addFloatingEffect });
    const enemies = useEnemyLogic({ sceneRef, dogModelRef, isShieldActiveRef, protectionBottleCountRef, onConsumeProtectionBottle, onEnemyCollisionPenalty, isPausedRef, coinMeshesRef: coins.coinMeshesRef, loadedCoinChunks: coins.loadedCoinChunks, onCoinCollected, onAttackAnimationFinished: () => {}, octreeRef, cameraRef, addFloatingEffect: floatingEffects.addFloatingEffect });
    const { cleanupModelPool } = useDynamicModelLoader({ cameraRef, sceneRef, octreeRef, objectsToManage: [] });
    const camera = useCameraLogic({ cameraRef, dogModelRef, mountRef });

    return {
        dog: { dogModelRef, lastDogTransformRef, initializeDog, updateDog, resetDogState, dogMeshRef },
        coins, enemies, particles: { updateParticles }, floatingEffects, analytics, cleanupModelPool, camera
    };
};
