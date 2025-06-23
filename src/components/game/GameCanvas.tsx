
'use client';

import React, { useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
// OrbitControls is no longer needed
// import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { PublicKey } from '@solana/web3.js';

import { useDogLogic } from '@/hooks/useDogLogic';
import { useCoinLogic } from '@/hooks/useCoinLogic';
import { useEnemyLogic } from '@/hooks/useEnemyLogic';
import { useCameraLogic } from '@/hooks/useCameraLogic';
import { useSceneSetup } from '@/hooks/useSceneSetup';

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
}) => {
    const mountRef = useRef<HTMLDivElement>(null);
    const animationFrameId = useRef<number | null>(null);
    
    const sceneRef = useRef<THREE.Scene | null>(null);
    const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    // controlsRef is removed
    // const controlsRef = useRef<OrbitControls | null>(null);
    
    const clockRef = useRef(new THREE.Clock());
    const keysPressedRef = useRef<{ [key: string]: boolean }>({});

    const handleKeyDownCbRef = useRef<((event: KeyboardEvent) => void) | null>(null);
    const handleKeyUpCbRef = useRef<((event: KeyboardEvent) => void) | null>(null);

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

    useEffect(() => { onCoinCollectedCallbackRef.current = onCoinCollectedProp; }, [onCoinCollectedProp]);
    useEffect(() => { onRemainingCoinsUpdateCallbackRef.current = onRemainingCoinsUpdateProp; }, [onRemainingCoinsUpdateProp]);
    useEffect(() => { onConsumeProtectionBoneCallbackRef.current = onConsumeProtectionBoneProp; }, [onConsumeProtectionBoneProp]);
    useEffect(() => { onEnemyCollisionPenaltyCallbackRef.current = onEnemyCollisionPenaltyProp; }, [onEnemyCollisionPenaltyProp]);


    // --- Custom Hooks ---
    const { dogModelRef, lastDogTransformRef, initializeDog, updateDog, resetDogState } = useDogLogic({
        sceneRef, clockRef, keysPressedRef, joystickInputRef, isPausedRef,
        isSpeedBoostActiveRef, isShieldActiveRef, isJoystickInteractionActiveRef,
    });

    const { initializeCoins, updateCoins, resetCoins, remainingCoinsRef } = useCoinLogic({
        sceneRef, dogModelRef, isCoinMagnetActiveRef, COIN_MAGNET_RADIUS, COIN_COUNT,
        onCoinCollected: () => onCoinCollectedCallbackRef.current(), 
        onRemainingCoinsUpdate: (remaining) => onRemainingCoinsUpdateCallbackRef.current(remaining),
        isPausedRef,
    });

    const { initializeEnemies, updateEnemies, resetEnemies } = useEnemyLogic({
        sceneRef, dogModelRef, isShieldActiveRef, protectionBoneCountRef,
        onConsumeProtectionBone: () => onConsumeProtectionBoneCallbackRef.current(),
        onEnemyCollisionPenalty: () => onEnemyCollisionPenaltyCallbackRef.current(),
        isPausedRef,
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
        // controlsRef, // Removed
        isPausedRef, 
        isJoystickInteractionActiveRef,
    });


    const animate = useCallback(() => {
        if (!rendererRef.current || !sceneRef.current || !cameraRef.current || !sessionPublicKey) {
            if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
            animationFrameId.current = null;
            return;
        }
        animationFrameId.current = requestAnimationFrame(animate);

        // updateControlsState(); // Removed as OrbitControls are removed

        if (dogModelRef.current && !isPausedRef.current) { 
            updateDog();
            updateCoins();
            updateEnemies();
            updateCamera();
        }
        
        if (rendererRef.current && sceneRef.current && cameraRef.current) {
            rendererRef.current.render(sceneRef.current, cameraRef.current);
        }
    }, [sessionPublicKey, updateDog, updateCoins, updateEnemies, updateCamera, dogModelRef ]);


    // Main useEffect for initialization and re-initialization on session change
    useEffect(() => {
        if (!mountRef.current || !sessionPublicKey) {
            if (animationFrameId.current) { cancelAnimationFrame(animationFrameId.current); animationFrameId.current = null; }
            return;
        }

        const isNewSession = !prevSessionPublicKeyRef.current ||
                             (sessionPublicKey && prevSessionPublicKeyRef.current && !sessionPublicKey.equals(prevSessionPublicKeyRef.current)) ||
                             !rendererRef.current; 

        if (isNewSession) {
            console.log("[GameCanvas] New session or first load. Initializing scene elements.");
            
            if (rendererRef.current) cleanupScene(); 
            
            resetDogState();
            resetCamera(); 

            initializeCamera(); 
            const sceneInitialized = initializeScene(); 

            if (sceneInitialized && cameraRef.current && rendererRef.current /* && controlsRef.current removed */) {
                initializeDog(); 
                initializeCoins(); 
                initializeEnemies();
                
                const checkDogAndSetupCamera = () => {
                    if (dogModelRef.current) {
                        setupInitialCameraPosition();
                    } else {
                        setTimeout(checkDogAndSetupCamera, 100); 
                    }
                };
                checkDogAndSetupCamera();

            } else {
                console.error("[GameCanvas] Failed to initialize scene, camera, or renderer. Aborting further setup.");
                return; 
            }
        } else if (dogModelRef.current && lastDogTransformRef.current && sessionPublicKey && !isNewSession) {
            dogModelRef.current.position.copy(lastDogTransformRef.current.position);
            dogModelRef.current.rotation.y = lastDogTransformRef.current.rotationY;
            if (cameraRef.current /* && controlsRef.current removed */) { 
                setupInitialCameraPosition(); 
            }
        }
        
        prevSessionPublicKeyRef.current = sessionPublicKey;

        if (!animationFrameId.current && rendererRef.current && sceneRef.current && cameraRef.current) {
            animate();
        }
        
        // Cleanup for this effect is not needed here as full cleanup happens on unmount or new session
        // and animationFrame is managed within animate/this effect.
    }, [ 
        sessionPublicKey, 
        // Callbacks from custom hooks are stable and don't need to be in dependency array
        // Animate is also stable due to useCallback
        // Removing individual hook functions to prevent re-runs unless sessionPublicKey changes.
        // initializeDog, resetDogState, initializeCoins, initializeEnemies, initializeCamera, setupInitialCameraPosition, resetCamera,
        // initializeScene, cleanupScene, 
        // dogModelRef, lastDogTransformRef, 
        // cameraRef, rendererRef, controlsRef, mountRef 
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
      };
    }, [cleanupScene]); // cleanupScene is stable

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

    return <div ref={mountRef} className="w-full h-full absolute inset-0 z-0" />;
};
export default GameCanvas;
