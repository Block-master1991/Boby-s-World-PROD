'use client';

import React, { useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import type { PublicKey } from '@solana/web3.js';

import { Octree } from '@/lib/Octree'; // Import Octree

import { useDogLogic } from '@/hooks/useDogLogic';
import { useCoinLogic } from '@/hooks/useCoinLogic';
import { useEnemyLogic } from '@/hooks/useEnemyLogic';
import { useCameraLogic } from '@/hooks/useCameraLogic';
import { useSceneSetup } from '@/hooks/useSceneSetup';
import { useDynamicModelLoader } from '@/hooks/useDynamicModelLoader';
import { useTreeLogic } from '@/hooks/useTreeLogic';
import { useFloatingEffects } from '@/hooks/useFloatingEffects'; // New import
import { useDogParticles } from '@/hooks/useDogParticles'; // New import
import DogSpeedBeam from '@/components/game/DogSpeedBeam'; // New import
import DogShieldEffect from '@/components/game/DogShieldEffect'; // New import
import { OptimizedStaticObjectManager } from '@/components/OptimizedStaticObjectManager'; // Import the new optimized manager
import { getChunkCoordinates, getChunkKey, RENDER_DISTANCE_CHUNKS, CHUNK_SIZE } from '@/lib/chunkUtils'; // Import chunk utilities
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
    protectionBoneCount: number;
    onConsumeProtectionBone: () => void;
    onEnemyCollisionPenalty: () => void;
    COIN_COUNT: number;
    octreeRef: React.MutableRefObject<Octree | null>; // Added Octree ref
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
    protectionBoneCount,
    onConsumeProtectionBone: onConsumeProtectionBoneProp,
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

    const handleKeyDownCbRef = useRef<((event: KeyboardEvent) => void) | null>(null);
    const handleKeyUpCbRef = useRef<((event: KeyboardEvent) => void) | null>(null);

    const speedBeamRef = useRef<DogSpeedBeam | null>(null); // Ref for speed beam instance
    const shieldEffectRef = useRef<DogShieldEffect | null>(null); // Ref for shield effect instance

    const isSpeedBoostActiveRef = useRef(isSpeedBoostActive);
    const isShieldActiveRef = useRef(isShieldActive);
    const isCoinMagnetActiveRef = useRef(isCoinMagnetActive);
    const isPausedRef = useRef(isPaused);
    const joystickInputRef = useRef(joystickInputFromUI);
    const protectionBoneCountRef = useRef(protectionBoneCount);
    const isJoystickInteractionActiveRef = useRef(false); 

    const prevSessionPublicKeyRef = useRef<PublicKey | null>(null);
    const initialTouchPointRef = useRef<{ x: number, y: number, id: number } | null>(null);

    // --- Prop to Ref synchronization ---
    useEffect(() => { isSpeedBoostActiveRef.current = isSpeedBoostActive; }, [isSpeedBoostActive]);
    useEffect(() => { isShieldActiveRef.current = isShieldActive; }, [isShieldActive]);
    useEffect(() => { isCoinMagnetActiveRef.current = isCoinMagnetActive; }, [isCoinMagnetActive]);
    useEffect(() => { protectionBoneCountRef.current = protectionBoneCount; }, [protectionBoneCount]);
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
    const onConsumeProtectionBoneCallbackRef = useRef(onConsumeProtectionBoneProp);
    const onEnemyCollisionPenaltyCallbackRef = useRef(onEnemyCollisionPenaltyProp);
    const onAttackAnimationFinishedCallbackRef = useRef((event: THREE.Event) => {
        // This function will be called when an enemy's attack animation finishes
        // You can add any specific logic here if needed, e.g., triggering enemy death
        // For now, it just logs the event.
        console.log("Enemy attack animation finished:", event);
    });

    useEffect(() => { onCoinCollectedCallbackRef.current = onCoinCollectedProp; }, [onCoinCollectedProp]);
    useEffect(() => { onRemainingCoinsUpdateCallbackRef.current = onRemainingCoinsUpdateProp; }, [onRemainingCoinsUpdateProp]);
    useEffect(() => { onConsumeProtectionBoneCallbackRef.current = onConsumeProtectionBoneProp; }, [onConsumeProtectionBoneProp]);
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

    const { initializeCoins, updateCoins, resetCoins, coinMeshesRef } = useCoinLogic({ // Capture coinMeshesRef
        sceneRef, dogModelRef, isCoinMagnetActiveRef, COIN_MAGNET_RADIUS, COIN_COUNT,
        onCoinCollected: () => onCoinCollectedCallbackRef.current(), 
        onRemainingCoinsUpdate: (remaining) => onRemainingCoinsUpdateCallbackRef.current(remaining),
        isPausedRef, octreeRef,
        addFloatingEffect, // Pass addFloatingEffect to useCoinLogic
    });

    const { initializeEnemies, updateEnemies, resetEnemies } = useEnemyLogic({
        sceneRef, dogModelRef, isShieldActiveRef, protectionBoneCountRef,
        onConsumeProtectionBone: () => onConsumeProtectionBoneCallbackRef.current(),
        onEnemyCollisionPenalty: () => onEnemyCollisionPenaltyCallbackRef.current(),
        isPausedRef,
        coinMeshesRef, // Pass coinMeshesRef to useEnemyLogic
        onCoinCollected: () => onCoinCollectedCallbackRef.current(), // Pass onCoinCollected to useEnemyLogic
        onAttackAnimationFinished: onAttackAnimationFinishedCallbackRef.current, // Pass the new callback
        octreeRef,
        cameraRef,
        addFloatingEffect, // Pass addFloatingEffect to useEnemyLogic for penalties
    });

    const { addTreesForChunk, removeTreesForChunk, updateTreeAnimations } = useTreeLogic({
        sceneRef,
        octreeRef,
    });

    // Ref to store currently loaded tree chunks
    // Ref to store currently loaded tree chunks
    const loadedTreeChunksRef = useRef<Map<string, any[]>>(new Map()); // Map<chunkKey, TreeInstance[]>
    const currentDogChunkRef = useRef<{ chunkX: number; chunkZ: number } | null>(null);

    // Destructure updateDynamicModels and cleanupModelPool from useDynamicModelLoader
    const { updateDynamicModels, cleanupModelPool } = useDynamicModelLoader({
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

    const { initializeScene, handleResize, cleanupScene } = useSceneSetup({ // updateControlsState removed
        mountRef, 
        sceneRef, 
        cameraRef, 
        rendererRef, 
        octreeRef, // Pass octreeRef
        // controlsRef, // Removed
        isPausedRef, 
        isJoystickInteractionActiveRef,
    });

    // Function to manage loading/unloading of tree chunks
    const manageTreeChunks = useCallback(async (playerChunkX: number, playerChunkZ: number) => {
        const activeChunkKeys = new Set<string>();

        // Determine chunks to load (current + render distance)
        for (let xOffset = -RENDER_DISTANCE_CHUNKS; xOffset <= RENDER_DISTANCE_CHUNKS; xOffset++) {
            for (let zOffset = -RENDER_DISTANCE_CHUNKS; zOffset <= RENDER_DISTANCE_CHUNKS; zOffset++) {
                const chunkX = playerChunkX + xOffset;
                const chunkZ = playerChunkZ + zOffset;
                const chunkKey = getChunkKey(chunkX, chunkZ);
                activeChunkKeys.add(chunkKey);

                if (!loadedTreeChunksRef.current.has(chunkKey)) {
                    console.log(`[GameCanvas] Loading trees for chunk: [${chunkX}, ${chunkZ}]`);
                    const newTrees = await addTreesForChunk(chunkX, chunkZ);
                    loadedTreeChunksRef.current.set(chunkKey, newTrees);
                }
            }
        }

        // Unload chunks that are no longer active
        const chunksToUnload: string[] = [];
        loadedTreeChunksRef.current.forEach((trees, chunkKey) => {
            if (!activeChunkKeys.has(chunkKey)) {
                chunksToUnload.push(chunkKey);
            }
        });

        chunksToUnload.forEach(chunkKey => {
            console.log(`[GameCanvas] Unloading trees for chunk: ${chunkKey}`);
            const trees = loadedTreeChunksRef.current.get(chunkKey);
            if (trees) {
                removeTreesForChunk(trees);
            }
            loadedTreeChunksRef.current.delete(chunkKey);
        });
    }, [addTreesForChunk, removeTreesForChunk]);

    const animate = useCallback(() => {
        if (!rendererRef.current || !sceneRef.current || !cameraRef.current || !sessionPublicKey) {
            if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
            animationFrameId.current = null;
            return;
        }
        animationFrameId.current = requestAnimationFrame(animate);

        // updateControlsState(); // Removed as OrbitControls are removed

        const delta = clockRef.current.getDelta(); // Get delta time
        if (dogModelRef.current && !isPausedRef.current) { 
            // Update dog's mesh ref for other hooks
            dogMeshRef.current = dogModelRef.current;

            updateDog(delta); // Pass delta
            updateCoins();
            updateEnemies(delta); // Pass delta
            updateTreeAnimations(delta); // Update tree animations
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

            // Chunk management for trees
            const dogPos = dogModelRef.current.position;
            const { chunkX: newChunkX, chunkZ: newChunkZ } = getChunkCoordinates(dogPos.x, dogPos.z);

            if (!currentDogChunkRef.current || newChunkX !== currentDogChunkRef.current.chunkX || newChunkZ !== currentDogChunkRef.current.chunkZ) {
                console.log(`[GameCanvas] Dog moved to new chunk: [${newChunkX}, ${newChunkZ}]`);
                currentDogChunkRef.current = { chunkX: newChunkX, chunkZ: newChunkZ };
                manageTreeChunks(newChunkX, newChunkZ);
            }

            // Call cleanupModelPool periodically
            cleanupModelPool(60000, 5); // Clean up models idle for 60s or if pool size > 5
        }
        
        if (rendererRef.current && sceneRef.current && cameraRef.current) {
            rendererRef.current.render(sceneRef.current, cameraRef.current);
        }
    }, [sessionPublicKey, updateDog, updateCoins, updateEnemies, updateTreeAnimations, updateCamera, dogModelRef, cleanupModelPool, manageTreeChunks, updateFloatingEffects, updateParticles, isSpeedBoostActiveRef, isShieldActiveRef]);


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
            const totalAssets = 3; // Dog, Coins, Enemies

            const updateProgress = () => {
                loadedCount++;
                const progress = (loadedCount / totalAssets) * 100;
                onLoadProgress(progress);
            };

            try {
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
                        manageTreeChunks(chunkX, chunkZ);
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
            loadedTreeChunksRef.current.clear();

            initializeCamera(); 
            const sceneInitialized = initializeScene(); 

            if (sceneInitialized && cameraRef.current && rendererRef.current) {
                loadAllGameAssets();
            } else {
                console.error("[GameCanvas] Failed to initialize scene, camera, or renderer. Aborting further setup.");
                onLoadComplete(false);
                return; 
            }
        } else if (dogModelRef.current && lastDogTransformRef.current && sessionPublicKey && !isNewSession) {
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
        manageTreeChunks,
        onLoadStart, onLoadProgress, onLoadComplete, // Add new props to dependency array
        addFloatingEffect, updateFloatingEffects, cleanupFloatingEffects, // Add floating effects hooks
        updateParticles, // Add dog particles hook
        isSpeedBoostActive, isShieldActive // Add states for continuous effects
    ]);

    // Effect for handling resize
    useEffect(() => {
      window.addEventListener('resize', handleResize);
      handleResize(); 
      return () => {
        window.removeEventListener('resize', handleResize);
      };
    }, [handleResize]); // handleResize is stable

    // Effect for full cleanup on component unmount
    useEffect(() => {
      return () => {
        console.log("[GameCanvas] Component unmounting. Full cleanup.");
        if (animationFrameId.current) {
          cancelAnimationFrame(animationFrameId.current);
          animationFrameId.current = null;
        }
        cleanupScene(); 
        cleanupFloatingEffects(); // Cleanup floating effects
        if (speedBeamRef.current) speedBeamRef.current.dispose(); // Dispose speed beam
        if (shieldEffectRef.current) shieldEffectRef.current.dispose(); // Dispose shield effect
      };
    }, [cleanupScene, cleanupFloatingEffects]); // cleanupScene is stable

    // Touch handling for joystick
    useEffect(() => {
        const currentMount = mountRef.current;
        if (!currentMount || !sessionPublicKey) return;

        const handleTouchStartInternal = (event: TouchEvent) => {
            if (event.touches.length === 1 && !isPausedRef.current && sessionPublicKey) {
                const touch = event.touches[0];
                // if (controlsRef.current) controlsRef.current.enabled = false; // Removed
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
                // if (controlsRef.current) controlsRef.current.enabled = true; // Removed
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
    }, [sessionPublicKey, onCanvasTouchStartProp, onCanvasTouchMoveProp, onCanvasTouchEndProp, isPausedRef, isJoystickInteractionActiveRef]); // controlsRef removed

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
    }, [sessionPublicKey]);

    return (
        <>
            <div ref={mountRef} className="w-full h-full absolute inset-0 z-0" />
            {/* Render the OptimizedStaticObjectManager here */}
            {sceneRef.current && cameraRef.current && rendererRef.current && dogModelRef.current && (
                <OptimizedStaticObjectManager
                    scene={sceneRef.current}
                    camera={cameraRef.current}
                    renderer={rendererRef.current}
                    playerPosition={dogModelRef.current.position}
                    playerDirection={{ x: 0, z: -1 }} // Placeholder direction
                />
            )}
        </>
    );
};
export default GameCanvas;
