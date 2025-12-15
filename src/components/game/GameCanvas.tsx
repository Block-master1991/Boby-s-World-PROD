'use client';

import React, { useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import type { PublicKey } from '@solana/web3.js';

import { Octree } from '@/lib/Octree'; // Import Octree
import { GameObject } from '@/types/game';

import { useDogLogic } from '@/hooks/useDogLogic';
import { useCoinLogic } from '@/hooks/useCoinLogic';
import { useEnemyLogic } from '@/hooks/useEnemyLogic';
import { useCameraLogic } from '@/hooks/useCameraLogic';
import { useSceneSetup } from '@/hooks/useSceneSetup';
import { useDynamicModelLoader } from '@/hooks/useDynamicModelLoader';
import { useFloatingEffects } from '@/hooks/useFloatingEffects'; // New import
import { useDogParticles } from '@/hooks/useDogParticles'; // New import
import DogSpeedBeam from '@/components/game/DogSpeedBeam'; // New import
import DogShieldEffect from '@/components/game/DogShieldEffect'; // New import

import { getChunkCoordinates } from '@/lib/chunkUtils'; // Import chunk utilities
import { modelLoader } from '@/utils/modelLoader'; // Import modelLoader
import { Environment } from '@/lib/ez-tree/environment/environment'; // Import ez-tree Environment
import { getDevicePerformanceConfig } from '@/lib/utils'; // Import performance config
// Removed unused import ChunkManager
// Removed ez-tree specific imports as they are now managed by Environment
// import { Tree } from '@/lib/ez-tree/tree';
// import { TreePreset } from '@/lib/ez-tree/presets';
// import { GrassOptions, Grass } from '@/lib/ez-tree/environment/grass';
// import { RockOptions as RocksOptions, Rocks } from '@/lib/ez-tree/environment/rocks';
// import { TreesOptions, Trees } from '@/lib/ez-tree/environment/trees';
interface GameCanvasProps {
    sessionPublicKey: PublicKey | null;
    isSpeedBoostActive: boolean;
    isShieldActive: boolean;
    isCoinMagnetActive: boolean;
    COIN_MAGNET_RADIUS: number;
    onCoinCollected: () => void;
    onRemainingCoinsUpdate: (remaining: number) => void;
    isPaused: boolean;
    joystickInput: { x: number; y: number } | null;
    onCanvasTouchStart: (screenX: number, screenY: number) => void;
    onCanvasTouchMove: (deltaX: number, deltaY: number) => void;
    onCanvasTouchEnd: () => void;
    protectionBottleCount: number;
    onConsumeProtectionBottle: () => void;
    onEnemyCollisionPenalty: () => void;
    COIN_COUNT: number;
    octreeRef: React.MutableRefObject<Octree<GameObject> | null>; // Added Octree ref
    onLoadStart: () => void;
    onLoadProgress: (progress: number) => void;
    onLoadComplete: (success: boolean) => void;
}

const GameCanvas: React.FC<GameCanvasProps> = ({
    sessionPublicKey,
    isSpeedBoostActive,
    isShieldActive,
    isCoinMagnetActive,
    COIN_MAGNET_RADIUS,
    onCoinCollected: onCoinCollectedProp,
    onRemainingCoinsUpdate: onRemainingCoinsUpdateProp,
    isPaused,
    joystickInput: joystickInputFromUI,
    onCanvasTouchStart: onCanvasTouchStartProp,
    onCanvasTouchMove: onCanvasTouchMoveProp,
    onCanvasTouchEnd: onCanvasTouchEndProp,
    protectionBottleCount,
    onConsumeProtectionBottle: onConsumeProtectionBottleProp,
    onEnemyCollisionPenalty: onEnemyCollisionPenaltyProp,
    COIN_COUNT,
    octreeRef, // Destructure octreeRef
    onLoadStart,
    onLoadProgress,
    onLoadComplete,
}) => {
    const mountRef = useRef<HTMLDivElement>(null);
    const animationFrameId = useRef<number | null>(null);

    const sceneRef = useRef<THREE.Scene | null>(null);
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    // controlsRef is no longer needed
    // import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

    const clockRef = useRef(new THREE.Clock());
    const keysPressedRef = useRef<{ [key: string]: boolean }>({});
    const dogMeshRef = useRef<THREE.Object3D | null>(null); // Ref for the dog's 3D model

    // FPS limiter for performance optimization
    const lastFrameTimeRef = useRef<number>(0);

    const handleKeyDownCbRef = useRef<((event: KeyboardEvent) => void) | null>(null);
    const handleKeyUpCbRef = useRef<((event: KeyboardEvent) => void) | null>(null);

    const speedBeamRef = useRef<DogSpeedBeam | null>(null); // Ref for speed beam instance
    const shieldEffectRef = useRef<DogShieldEffect | null>(null); // Ref for shield effect instance

    const isSpeedBoostActiveRef = useRef(isSpeedBoostActive);
    const isShieldActiveRef = useRef(isShieldActive);
    const isCoinMagnetActiveRef = useRef(isCoinMagnetActive);
    const isPausedRef = useRef(isPaused);
    const joystickInputRef = useRef(joystickInputFromUI);
    const protectionBottleCountRef = useRef(protectionBottleCount);
    const isJoystickInteractionActiveRef = useRef(false);

    const prevSessionPublicKeyRef = useRef<PublicKey | null>(null);
    const initialTouchPointRef = useRef<{ x: number, y: number, id: number } | null>(null);

    // --- Prop to Ref synchronization ---
    useEffect(() => { isSpeedBoostActiveRef.current = isSpeedBoostActive; }, [isSpeedBoostActive]);
    useEffect(() => { isShieldActiveRef.current = isShieldActive; }, [isShieldActive]);
    useEffect(() => { isCoinMagnetActiveRef.current = isCoinMagnetActive; }, [isCoinMagnetActive]);
    useEffect(() => { protectionBottleCountRef.current = protectionBottleCount; }, [protectionBottleCount]);
    useEffect(() => {
        isPausedRef.current = isPaused;
        if (isPaused && isJoystickInteractionActiveRef.current) {
            onCanvasTouchEndProp();
            isJoystickInteractionActiveRef.current = false;
            initialTouchPointRef.current = null;
        }
        if (isPaused) keysPressedRef.current = {};
    }, [isPaused, onCanvasTouchEndProp]);
    useEffect(() => { joystickInputRef.current = joystickInputFromUI; }, [joystickInputFromUI]);

    // --- Callback Refs for Stable Callbacks from Props ---
    const onCoinCollectedCallbackRef = useRef(onCoinCollectedProp);
    const onRemainingCoinsUpdateCallbackRef = useRef(onRemainingCoinsUpdateProp);
    const onConsumeProtectionBottleCallbackRef = useRef(onConsumeProtectionBottleProp);
    const onEnemyCollisionPenaltyCallbackRef = useRef(onEnemyCollisionPenaltyProp);
    const onAttackAnimationFinishedCallbackRef = useRef((event: THREE.Event) => {
        // This function will be called when an enemy's attack animation finishes
        // You can add any specific logic here if needed, e.g., triggering enemy death
        // For now, it just logs the event.
        console.log("Enemy attack animation finished:", event);
    });

    useEffect(() => { onCoinCollectedCallbackRef.current = onCoinCollectedProp; }, [onCoinCollectedProp]);
    useEffect(() => { onRemainingCoinsUpdateCallbackRef.current = onRemainingCoinsUpdateProp; }, [onRemainingCoinsUpdateProp]);
    useEffect(() => { onConsumeProtectionBottleCallbackRef.current = onConsumeProtectionBottleProp; }, [onConsumeProtectionBottleProp]);
    useEffect(() => { onEnemyCollisionPenaltyCallbackRef.current = onEnemyCollisionPenaltyProp; }, [onEnemyCollisionPenaltyProp]);


    // --- Custom Hooks ---
    const { dogModelRef, lastDogTransformRef, initializeDog, updateDog, resetDogState, dogSpeed, isRunning } = useDogLogic({ // Added dogSpeed, isRunning
        sceneRef, clockRef, keysPressedRef, joystickInputRef, isPausedRef,
        isSpeedBoostActiveRef, isShieldActiveRef, isJoystickInteractionActiveRef,
        octreeRef, // Pass octreeRef
    });

    const { addFloatingEffect, updateFloatingEffects, cleanupFloatingEffects } = useFloatingEffects({ // Added new states
        sceneRef, cameraRef, dogMeshRef // Pass dogMeshRef
    });

    const { updateParticles } = useDogParticles({ // New hook for dust particles
        sceneRef, dogMeshRef, dogSpeed, isRunning // Pass dog's speed and running state
    });

    const { initializeCoins, updateCoins, coinMeshesRef, loadedCoinChunks } = useCoinLogic({ // Capture coinMeshesRef and loadedCoinChunks
        sceneRef, dogModelRef, isCoinMagnetActiveRef, COIN_MAGNET_RADIUS, COIN_COUNT,
        onCoinCollected: () => onCoinCollectedCallbackRef.current(),
        onRemainingCoinsUpdate: (remaining) => onRemainingCoinsUpdateCallbackRef.current(remaining),
        isPausedRef, octreeRef,
        addFloatingEffect, // Pass addFloatingEffect to useCoinLogic
    });

    const { initializeEnemies, updateEnemies } = useEnemyLogic({
        sceneRef, dogModelRef, isShieldActiveRef, protectionBottleCountRef,
        onConsumeProtectionBottle: () => onConsumeProtectionBottleCallbackRef.current(),
        onEnemyCollisionPenalty: () => onEnemyCollisionPenaltyCallbackRef.current(),
        isPausedRef,
        coinMeshesRef, // Pass coinMeshesRef to useEnemyLogic
        loadedCoinChunks, // Pass loadedCoinChunks to useEnemyLogic
        onCoinCollected: () => onCoinCollectedCallbackRef.current(), // Pass onCoinCollected to useEnemyLogic
        onAttackAnimationFinished: onAttackAnimationFinishedCallbackRef.current, // Pass the new callback
        octreeRef,
        cameraRef,
        addFloatingEffect, // Pass addFloatingEffect to useEnemyLogic for penalties
    });

    const currentDogChunkRef = useRef<{ chunkX: number; chunkZ: number } | null>(null);

    const environmentRef = useRef<Environment | null>(null); // Ref for ez-tree Environment
    const lastDogPositionRef = useRef<{ x: number; z: number }>({ x: 0, z: 0 }); // Track last dog position for performance optimization

    // Destructure updateDynamicModels and cleanupModelPool from useDynamicModelLoader
    const { cleanupModelPool } = useDynamicModelLoader({
        cameraRef,
        sceneRef,
        octreeRef,
        objectsToManage: [], // This hook is used for dynamic loading, but we'll use cleanupModelPool directly
    });

    const { initializeCamera, setupInitialCameraPosition, updateCamera, resetCamera } = useCameraLogic({
        cameraRef,
        // controlsRef, // Removed
        dogModelRef,
        mountRef,
    });

    const { initializeScene, handleResize, cleanupScene: baseCleanupScene } = useSceneSetup({ // updateControlsState removed
        mountRef,
        sceneRef,
        cameraRef,
        rendererRef,
        octreeRef, // Pass octreeRef
        // controlsRef, // Removed
        isPausedRef,
        isJoystickInteractionActiveRef,
    });

    const cleanupScene = useCallback(() => {
        baseCleanupScene();
        if (environmentRef.current && sceneRef.current) {
            sceneRef.current.remove(environmentRef.current);
            // Dispose of environment resources if necessary
            // environmentRef.current.dispose(); // Assuming Environment has a dispose method
            environmentRef.current = null;
        }
        // Cleanup ChunkManager (now managed by Environment)
        if (environmentRef.current && environmentRef.current.chunkManager) {
            environmentRef.current.chunkManager.dispose();
        }
    }, [baseCleanupScene]);

    const animate = useCallback(() => {
        if (!rendererRef.current || !sceneRef.current || !cameraRef.current || !sessionPublicKey) {
            if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
            animationFrameId.current = null;
            return;
        }

        // FPS limiter for mobile devices
        const perfConfig = getDevicePerformanceConfig();
        const currentTime = performance.now();
        const frameInterval = 1000 / perfConfig.game.fpsLimit;
        const elapsed = currentTime - lastFrameTimeRef.current;

        if (perfConfig.isMobile && elapsed < frameInterval) {
            // Skip frame if not enough time has passed
            animationFrameId.current = requestAnimationFrame(animate);
            return;
        }
        lastFrameTimeRef.current = currentTime;

        animationFrameId.current = requestAnimationFrame(animate);

        // updateControlsState(); // Removed as OrbitControls are removed

        const delta = clockRef.current.getDelta(); // Get delta time
        if (dogModelRef.current && !isPausedRef.current) {
            // Update dog's mesh ref for other hooks
            dogMeshRef.current = dogModelRef.current;

            updateDog(delta); // Pass delta
            updateCoins();
            updateEnemies(delta); // Pass delta
            updateCamera();
            updateFloatingEffects(); // Update floating effects
            updateParticles(); // Update dust particles

            // Update continuous effects (Speed Beam, Shield)
            if (speedBeamRef.current) {
                speedBeamRef.current.update(isSpeedBoostActiveRef.current, dogModelRef.current.position, dogModelRef.current.rotation);
            }
            if (shieldEffectRef.current) {
                shieldEffectRef.current.update(isShieldActiveRef.current, dogModelRef.current.position);
            }

            // Update ez-tree environment
            try {
                if (environmentRef.current && dogModelRef.current && cameraRef.current) {
                    const currentDogPos = dogModelRef.current.position;
                    // Update environment continuously, passing camera position for clouds
                    environmentRef.current.update(clockRef.current.getElapsedTime(), cameraRef.current.position);

                    // Update last position for chunk management, not for wind animation
                    lastDogPositionRef.current = { x: currentDogPos.x, z: currentDogPos.z };
                }
            } catch (error) {
                console.error("[GameCanvas] Error updating ez-tree environment:", error);
            }

            // Chunk management for trees and grass
            const dogPos = dogModelRef.current.position;
            const { chunkX: newChunkX, chunkZ: newChunkZ } = getChunkCoordinates(dogPos.x, dogPos.z);

            if (!currentDogChunkRef.current || newChunkX !== currentDogChunkRef.current.chunkX || newChunkZ !== currentDogChunkRef.current.chunkZ) {
                console.log(`[GameCanvas] Dog moved to new chunk: [${newChunkX}, ${newChunkZ}]`);
                currentDogChunkRef.current = { chunkX: newChunkX, chunkZ: newChunkZ };
                // Update ChunkManager via Environment
                if (environmentRef.current && environmentRef.current.chunkManager) {
                    environmentRef.current.chunkManager.updatePlayerPosition(dogPos);
                }
            }

            // Call cleanupModelPool periodically
            cleanupModelPool(60000, 5); // Clean up models idle for 60s or if pool size > 5
        }

        try {
            if (rendererRef.current && sceneRef.current && cameraRef.current) {
                rendererRef.current.render(sceneRef.current, cameraRef.current);
            }
        } catch (error) {
            console.error("[GameCanvas] Error rendering scene:", error);
            if (error instanceof Error) {
                console.error("Error Name:", error.name);
                console.error("Error Message:", error.message);
                console.error("Error Stack:", error.stack);
            }
            if (animationFrameId.current) {
                cancelAnimationFrame(animationFrameId.current);
                animationFrameId.current = null;
            }
        }
    }, [sessionPublicKey, updateDog, updateCoins, updateEnemies, updateCamera, dogModelRef, cleanupModelPool, updateFloatingEffects, updateParticles]);


    // Main useEffect for initialization and re-initialization on session change
    useEffect(() => {
        if (!mountRef.current || !sessionPublicKey) {
            if (animationFrameId.current) { cancelAnimationFrame(animationFrameId.current); animationFrameId.current = null; }
            return;
        }

        const isNewSession = !prevSessionPublicKeyRef.current ||
            (sessionPublicKey && prevSessionPublicKeyRef.current && !sessionPublicKey.equals(prevSessionPublicKeyRef.current)) ||
            !rendererRef.current;

        // Initialize continuous effects classes
        if (sceneRef.current && dogModelRef.current && !speedBeamRef.current) {
            speedBeamRef.current = new DogSpeedBeam({
                scene: sceneRef.current,
                dogPosition: dogModelRef.current.position,
                dogRotation: dogModelRef.current.rotation,
            });
        }
        if (sceneRef.current && dogModelRef.current && !shieldEffectRef.current) {
            shieldEffectRef.current = new DogShieldEffect({
                scene: sceneRef.current,
                dogPosition: dogModelRef.current.position,
            });
        }

        const loadAllGameAssets = async () => {
            onLoadStart();
            let loadedCount = 0;
            const totalAssets = 4; // ModelLoader, Dog, Coins, Enemies

            const updateProgress = () => {
                loadedCount++;
                const progress = (loadedCount / totalAssets) * 100;
                onLoadProgress(progress);
            };

            try {
                console.log("[GameCanvas] Initializing ModelLoader...");
                if (rendererRef.current && cameraRef.current) {
                    await modelLoader.initialize(rendererRef.current, cameraRef.current);
                    updateProgress();
                    console.log("[GameCanvas] ModelLoader Initialized.");
                } else {
                    throw new Error("Renderer or Camera not available for ModelLoader initialization.");
                }

                console.log("[GameCanvas] Initializing Dog...");
                await initializeDog();
                updateProgress();
                console.log("[GameCanvas] Dog Initialized.");

                console.log("[GameCanvas] Initializing Coins...");
                await initializeCoins();
                updateProgress();
                console.log("[GameCanvas] Coins Initialized.");

                console.log("[GameCanvas] Initializing Enemies...");
                await initializeEnemies();
                updateProgress();
                console.log("[GameCanvas] Enemies Initialized.");

                // After all assets are loaded, set up camera and chunks
                const checkDogAndSetupCameraAndChunks = () => {
                    if (dogModelRef.current) {
                        setupInitialCameraPosition();
                        const dogPos = dogModelRef.current.position;
                        const { chunkX, chunkZ } = getChunkCoordinates(dogPos.x, dogPos.z);
                        currentDogChunkRef.current = { chunkX, chunkZ };
                        onLoadComplete(true); // Signal completion
                    } else {
                        setTimeout(checkDogAndSetupCameraAndChunks, 100);
                    }
                };
                checkDogAndSetupCameraAndChunks();

            } catch (error) {
                console.error("[GameCanvas] Critical error during asset loading:", error);
                onLoadComplete(false); // Signal failure
            }
        };

        if (isNewSession) {
            console.log("[GameCanvas] New session or first load. Initializing scene elements.");

            if (rendererRef.current) cleanupScene();

            resetDogState();
            resetCamera();
            // loadedEzTreeChunksRef.current.clear(); // Clear ez-tree chunks - now managed by Environment

            initializeCamera();
            const sceneInitialized = initializeScene();

            if (sceneInitialized && cameraRef.current && rendererRef.current && sceneRef.current) {
                // Initialize ez-tree environment
                try {
                    environmentRef.current = new Environment();
                    sceneRef.current.add(environmentRef.current);
                    console.log("[GameCanvas] ez-tree Environment Initialized.");
                } catch (error) {
                    console.error("[GameCanvas] Error initializing ez-tree environment:", error);
                    environmentRef.current = null;
                }

                // Update environment with new chunk options (now handled internally by Environment)
                if (environmentRef.current && dogModelRef.current) {
                    const dogPos = dogModelRef.current.position;
                    environmentRef.current.chunkManager.updatePlayerPosition(dogPos);
                }

                try {
                    loadAllGameAssets();
                } catch (err) {
                    console.error("[GameCanvas] Failed to initialize scene, camera, or renderer. Aborting further setup.", err);
                    onLoadComplete(false);
                    return;
                }
            }
        } else if (dogModelRef.current && lastDogTransformRef.current && sessionPublicKey && !isNewSession && !isPaused) {
            dogModelRef.current.position.copy(lastDogTransformRef.current.position);
            dogModelRef.current.rotation.y = lastDogTransformRef.current.rotationY;
            if (cameraRef.current) {
                setupInitialCameraPosition();
            }
        }

        prevSessionPublicKeyRef.current = sessionPublicKey;

        if (!animationFrameId.current && rendererRef.current && sceneRef.current && cameraRef.current) {
            animate();
        }

    }, [
        sessionPublicKey,
        initializeDog, resetDogState, initializeCoins, initializeEnemies, initializeCamera, setupInitialCameraPosition, resetCamera,
        initializeScene, cleanupScene,
        dogModelRef, lastDogTransformRef,
        cameraRef, rendererRef,
        onLoadStart, onLoadProgress, onLoadComplete,
        addFloatingEffect, updateFloatingEffects, cleanupFloatingEffects,
        updateParticles,
        isSpeedBoostActive, isShieldActive,
        isPaused,
        animate,
        handleResize,
        onCanvasTouchStartProp, onCanvasTouchMoveProp, onCanvasTouchEndProp,
        isPausedRef, isJoystickInteractionActiveRef,
        handleKeyDownCbRef, handleKeyUpCbRef, keysPressedRef,
        mountRef, speedBeamRef, shieldEffectRef
    ]);

    // Effect for handling resize
    useEffect(() => {
        window.addEventListener('resize', handleResize);
        handleResize();
        return () => {
            window.removeEventListener('resize', handleResize);
        };
    }, [handleResize]);

    // Effect for full cleanup on component unmount
    useEffect(() => {
        return () => {
            console.log("[GameCanvas] Component unmounting. Full cleanup.");
            if (animationFrameId.current) {
                cancelAnimationFrame(animationFrameId.current);
                animationFrameId.current = null;
            }
            cleanupScene(); // Use the custom cleanupScene
            cleanupFloatingEffects(); // Cleanup floating effects
            if (speedBeamRef.current) speedBeamRef.current.dispose(); // Dispose speed beam
            if (shieldEffectRef.current) shieldEffectRef.current.dispose(); // Dispose shield effect
        };
    }, [cleanupScene, cleanupFloatingEffects, animationFrameId, speedBeamRef, shieldEffectRef]);

    // Touch handling for joystick
    useEffect(() => {
        const currentMount = mountRef.current;
        if (!currentMount || !sessionPublicKey) return;

        const handleTouchStartInternal = (event: TouchEvent) => {
            if (event.touches.length === 1 && !isPausedRef.current && sessionPublicKey) {
                const touch = event.touches[0];
                isJoystickInteractionActiveRef.current = true;
                initialTouchPointRef.current = { x: touch.clientX, y: touch.clientY, id: touch.identifier };
                onCanvasTouchStartProp(touch.clientX, touch.clientY);
            }
        };
        const handleTouchMoveInternal = (event: TouchEvent) => {
            if (isJoystickInteractionActiveRef.current && initialTouchPointRef.current !== null) {
                let touch = null;
                for (let i = 0; i < event.touches.length; i++) { if (event.touches[i].identifier === initialTouchPointRef.current.id) { touch = event.touches[i]; break; } }
                if (touch) {
                    if (event.cancelable) event.preventDefault();
                    const deltaX = touch.clientX - initialTouchPointRef.current.x;
                    const deltaY = touch.clientY - initialTouchPointRef.current.y;
                    onCanvasTouchMoveProp(deltaX, deltaY);
                }
            }
        };
        const handleTouchEndInternal = (event: TouchEvent) => {
            let touchEnded = false;
            if (initialTouchPointRef.current !== null) {
                let stillTouchingWithSameId = false;
                for (let i = 0; i < event.touches.length; i++) { if (event.touches[i].identifier === initialTouchPointRef.current.id) { stillTouchingWithSameId = true; break; } }
                if (!stillTouchingWithSameId) { touchEnded = true; }
            }

            if (isJoystickInteractionActiveRef.current && touchEnded) {
                isJoystickInteractionActiveRef.current = false;
                initialTouchPointRef.current = null;
                onCanvasTouchEndProp();
            }
        };

        currentMount.addEventListener('touchstart', handleTouchStartInternal, { passive: false });
        currentMount.addEventListener('touchmove', handleTouchMoveInternal, { passive: false });
        currentMount.addEventListener('touchend', handleTouchEndInternal);
        currentMount.addEventListener('touchcancel', handleTouchEndInternal);

        return () => {
            currentMount.removeEventListener('touchstart', handleTouchStartInternal);
            currentMount.removeEventListener('touchmove', handleTouchMoveInternal);
            currentMount.removeEventListener('touchend', handleTouchEndInternal);
            currentMount.removeEventListener('touchcancel', handleTouchEndInternal);
        };
    }, [sessionPublicKey, onCanvasTouchStartProp, onCanvasTouchMoveProp, onCanvasTouchEndProp, isPausedRef, isJoystickInteractionActiveRef, initialTouchPointRef, mountRef]);

    // Keyboard event handling
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (isPausedRef.current) return;
            if (document.activeElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;

            const gameControlCodes = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft', 'ShiftRight'];
            if (gameControlCodes.includes(event.code)) {
                event.preventDefault();
            }
            keysPressedRef.current[event.code] = true;
        };

        const handleKeyUp = (event: KeyboardEvent) => {
            keysPressedRef.current[event.code] = false;
        };

        if (!sessionPublicKey) {
            if (handleKeyDownCbRef.current) {
                window.removeEventListener('keydown', handleKeyDownCbRef.current);
                handleKeyDownCbRef.current = null;
            }
            if (handleKeyUpCbRef.current) {
                window.removeEventListener('keyup', handleKeyUpCbRef.current);
                handleKeyUpCbRef.current = null;
            }
            keysPressedRef.current = {};
            return;
        }

        handleKeyDownCbRef.current = handleKeyDown;
        handleKeyUpCbRef.current = handleKeyUp;

        window.addEventListener('keydown', handleKeyDownCbRef.current);
        window.addEventListener('keyup', handleKeyUpCbRef.current);

        return () => {
            if (handleKeyDownCbRef.current) {
                window.removeEventListener('keydown', handleKeyDownCbRef.current);
            }
            if (handleKeyUpCbRef.current) {
                window.removeEventListener('keyup', handleKeyUpCbRef.current);
            }
            keysPressedRef.current = {};
        };
    }, [sessionPublicKey, isPausedRef, keysPressedRef, handleKeyDownCbRef, handleKeyUpCbRef]);

    return (
        <>
            <div ref={mountRef} className="w-full h-full absolute inset-0 z-0" />
            {/* OptimizedStaticObjectManager removed */}
        </>
    );
};
export default GameCanvas;
