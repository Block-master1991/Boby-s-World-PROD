
'use client';

import * as THREE from 'three';
import { GLTFLoader, GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'; // Import GLTF type
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { useEffect, useRef, useCallback } from 'react';
import type { MutableRefObject } from 'react';
import { Octree, OctreeObject } from '../lib/Octree'; // Import Octree
import { getModel, putModel } from '../lib/indexedDB'; // Import IndexedDB utilities

const NORMAL_DOG_SPEED = 0.09; // Normal walking speed
const SPRINT_DOG_SPEED = 0.20; // Sprinting speed
const BOOSTED_DOG_SPEED = 0.30; // Speed when boosted
const KEYBOARD_ROTATION_SPEED = 0.0175; // Rotation speed for keyboard input
const JOYSTICK_ROTATION_SPEED = 0.013; // Rotation speed for joystick input
const JOYSTICK_ROTATION_THRESHOLD = 0.2; // Threshold for joystick rotation
const DOG_MODEL_SCALE = 1.5; // Adjusted for better visibility
const SHIELD_EMISSIVE_COLOR = 0x0077ff;
const NORMAL_EMISSIVE_COLOR = 0x000000;
const SPRINT_JOYSTICK_THRESHOLD = 0.99;

const ANIMATION_NAMES = {
    IDLE: 'Idle',
    WALK: 'Walk',
    RUN: 'Run',
    SPRINT_JUMP: 'Run_Jump'
};
const CROSSFADE_DURATION = 0.2;
const MOVEMENT_BOUNDARY = 999;


interface UseDogLogicProps {
    sceneRef: MutableRefObject<THREE.Scene | null>;
    clockRef: MutableRefObject<THREE.Clock>;
    keysPressedRef: MutableRefObject<{ [key: string]: boolean }>;
    joystickInputRef: MutableRefObject<{ x: number; y: number } | null>;
    isPausedRef: MutableRefObject<boolean>;
    isSpeedBoostActiveRef: MutableRefObject<boolean>;
    isShieldActiveRef: MutableRefObject<boolean>;
    isJoystickInteractionActiveRef: MutableRefObject<boolean>;
    octreeRef: MutableRefObject<Octree | null>; // Added Octree ref
}

export const useDogLogic = ({
    sceneRef,
    clockRef,
    keysPressedRef,
    joystickInputRef,
    isPausedRef,
    isSpeedBoostActiveRef,
    isShieldActiveRef,
    isJoystickInteractionActiveRef,
    octreeRef, // Destructure octreeRef
}: UseDogLogicProps) => {
    const dogModelRef = useRef<THREE.Group | null>(null);
    const animationMixerRef = useRef<THREE.AnimationMixer | null>(null);
    const animationActionsRef = useRef<Record<string, THREE.AnimationAction>>({});
    const currentActionRef = useRef<THREE.AnimationAction | null>(null);
    const lastDogTransformRef = useRef<{ position: THREE.Vector3; rotationY: number } | null>(null);
    const gltfLoaderRef = useRef<GLTFLoader | null>(null);
    const dracoLoaderRef = useRef<DRACOLoader | null>(null);

    useEffect(() => {
        dracoLoaderRef.current = new DRACOLoader();
        dracoLoaderRef.current.setDecoderPath('/libs/draco/gltf/');
        gltfLoaderRef.current = new GLTFLoader();
        gltfLoaderRef.current.setDRACOLoader(dracoLoaderRef.current);

        return () => {
            dracoLoaderRef.current?.dispose();
            gltfLoaderRef.current = null;
            dracoLoaderRef.current = null;
        };
    }, []);

    const initializeDog = useCallback(() => {
        if (!sceneRef.current || !gltfLoaderRef.current) return;
        const scene = sceneRef.current;
        const gltfLoader = gltfLoaderRef.current;

        const modelPath = '/models/dog.glb';
        const modelName = 'dog_model'; // A unique name for IndexedDB

        const loadModel = async (): Promise<GLTF> => {
            try {
                // Try to load from IndexedDB first
                const cachedData = await getModel(modelName);
                if (cachedData) {
                    console.log(`[useDogLogic] Loading dog model from IndexedDB: ${modelName}`);
                    const gltf = await gltfLoader.parseAsync(cachedData, ''); // Pass empty string for path
                    return gltf;
                } else {
                    console.log(`[useDogLogic] Fetching dog model from network: ${modelPath}`);
                    const response = await fetch(modelPath);
                    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                    const arrayBuffer = await response.arrayBuffer();
                    await putModel(modelName, arrayBuffer); // Store in IndexedDB
                    const gltf = await gltfLoader.parseAsync(arrayBuffer, ''); // Pass empty string for path
                    return gltf;
                }
            } catch (error) {
                console.error(`[useDogLogic] Error loading or caching model ${modelName}:`, error);
                // Fallback to direct network load if IndexedDB fails or model is not found
                console.log(`[useDogLogic] Falling back to direct network load for: ${modelPath}`);
                return new Promise((resolve, reject) => {
                    gltfLoader.load(modelPath, resolve, undefined, reject);
                });
            }
        };

        loadModel().then((gltf: GLTF) => {
            dogModelRef.current = gltf.scene;
            dogModelRef.current.scale.set(DOG_MODEL_SCALE, DOG_MODEL_SCALE, DOG_MODEL_SCALE);
            dogModelRef.current.position.set(0, 0, 0);
            dogModelRef.current.rotation.y = Math.PI;

            dogModelRef.current.traverse((child) => {
                if ((child as THREE.Mesh).isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });
            scene.add(dogModelRef.current);

            if (gltf.animations && gltf.animations.length && dogModelRef.current) {
                animationMixerRef.current = new THREE.AnimationMixer(dogModelRef.current);
                animationActionsRef.current = {};
                gltf.animations.forEach((clip: THREE.AnimationClip) => {
                    const action = animationMixerRef.current!.clipAction(clip);
                    animationActionsRef.current[clip.name] = action;
                    if (clip.name === ANIMATION_NAMES.IDLE || clip.name === ANIMATION_NAMES.WALK || clip.name === ANIMATION_NAMES.RUN || clip.name === ANIMATION_NAMES.SPRINT_JUMP) {
                        action.setLoop(THREE.LoopRepeat, Infinity);
                    }
                });

                const idleAction = animationActionsRef.current[ANIMATION_NAMES.IDLE];
                if (idleAction) {
                    idleAction.play();
                    currentActionRef.current = idleAction;
                } else if (gltf.animations.length > 0 && animationActionsRef.current[gltf.animations[0].name]) {
                    const firstClipAction = animationActionsRef.current[gltf.animations[0].name];
                    firstClipAction.play();
                    currentActionRef.current = firstClipAction;
                }
            }

            if (dogModelRef.current) {
                lastDogTransformRef.current = {
                    position: dogModelRef.current.position.clone(),
                    rotationY: dogModelRef.current.rotation.y
                };
            }
        }).catch((error: any) => { // Catch errors from loadModel promise
            console.error('Error loading dog GLB model (final catch):', error);
            const dogGeometry = new THREE.BoxGeometry(DOG_MODEL_SCALE, DOG_MODEL_SCALE, DOG_MODEL_SCALE);
            const dogMaterial = new THREE.MeshStandardMaterial({ color: 0xA0522D });
            const fallbackDogMesh = new THREE.Mesh(dogGeometry, dogMaterial);
            fallbackDogMesh.position.set(0, DOG_MODEL_SCALE / 2, 0);
            dogModelRef.current = fallbackDogMesh as unknown as THREE.Group; // Cast for simplicity
            scene.add(dogModelRef.current);
            lastDogTransformRef.current = { position: dogModelRef.current.position.clone(), rotationY: dogModelRef.current.rotation.y };
        });
    }, [sceneRef]);

    const resetDogState = useCallback(() => {
        if (dogModelRef.current) {
            sceneRef.current?.remove(dogModelRef.current);
            dogModelRef.current.traverse((child) => {
                if ((child as THREE.Mesh).geometry) (child as THREE.Mesh).geometry.dispose();
                if ((child as THREE.Mesh).material) {
                    const material = (child as THREE.Mesh).material;
                    if (Array.isArray(material)) material.forEach(m => m.dispose());
                    else (material as THREE.Material).dispose();
                }
            });
            dogModelRef.current = null;
        }
        if (animationMixerRef.current) {
            animationMixerRef.current.stopAllAction();
            if (dogModelRef.current) animationMixerRef.current.uncacheRoot(dogModelRef.current);
            animationMixerRef.current = null;
        }
        animationActionsRef.current = {};
        currentActionRef.current = null;
        lastDogTransformRef.current = null;
    }, [sceneRef]);
    

    const updateDog = useCallback((delta: number) => { // Accept delta as argument
        if (!dogModelRef.current || !animationMixerRef.current) return { isDogActuallyMoving: false, rotationAppliedThisFrame: false };
        
        const dog = dogModelRef.current;
        let isDogActuallyMoving = false;
        let rotationAppliedThisFrame = false;

        if (!isPausedRef.current) {
            const currentJoystickInput = joystickInputRef.current;
            const joystickIsActive = isJoystickInteractionActiveRef.current && currentJoystickInput && (currentJoystickInput.x !== 0 || currentJoystickInput.y !== 0);

            let jX = 0, jY = 0;
            if (joystickIsActive && currentJoystickInput) { jX = currentJoystickInput.x; jY = currentJoystickInput.y; }

            const joystickMagnitude = joystickIsActive ? Math.min(1, Math.sqrt(jX ** 2 + jY ** 2)) : 0;
            const isSprintingByKeyboard = (keysPressedRef.current['ShiftLeft'] || keysPressedRef.current['ShiftRight']) && !joystickIsActive;
            const isSprintingByJoystick = joystickIsActive && joystickMagnitude > SPRINT_JOYSTICK_THRESHOLD;
            const isSprinting = isSprintingByKeyboard || isSprintingByJoystick;

            let currentActualSpeed = NORMAL_DOG_SPEED;
            if (isSprinting) { currentActualSpeed = SPRINT_DOG_SPEED; }
            if (isSpeedBoostActiveRef.current) { currentActualSpeed = BOOSTED_DOG_SPEED; }

            const forward = new THREE.Vector3();
            let movementAppliedThisFrame = false;

            if (joystickIsActive) {
                if (Math.abs(jX) > JOYSTICK_ROTATION_THRESHOLD) {
                    if (jX > 0) dog.rotation.y -= JOYSTICK_ROTATION_SPEED * (Math.abs(jX) * 2);
                    else dog.rotation.y += JOYSTICK_ROTATION_SPEED * (Math.abs(jX) * 2);
                    rotationAppliedThisFrame = true;
                }
                dog.getWorldDirection(forward);
                const appliedMovementSpeed = currentActualSpeed * Math.abs(jY);
                if (jY < 0) { dog.position.addScaledVector(forward, appliedMovementSpeed); movementAppliedThisFrame = appliedMovementSpeed > 0.001; }
                else if (jY > 0) { dog.position.addScaledVector(forward, -appliedMovementSpeed); movementAppliedThisFrame = appliedMovementSpeed > 0.001; }
            } else {
                if (keysPressedRef.current['KeyA'] || keysPressedRef.current['ArrowLeft']) {
                    dog.rotation.y += KEYBOARD_ROTATION_SPEED;
                    rotationAppliedThisFrame = true;
                }
                if (keysPressedRef.current['KeyD'] || keysPressedRef.current['ArrowRight']) {
                    dog.rotation.y -= KEYBOARD_ROTATION_SPEED;
                    rotationAppliedThisFrame = true;
                }

                dog.getWorldDirection(forward);
                if (keysPressedRef.current['KeyW'] || keysPressedRef.current['ArrowUp']) {
                    dog.position.addScaledVector(forward, currentActualSpeed);
                    movementAppliedThisFrame = true;
                }
                if (keysPressedRef.current['KeyS'] || keysPressedRef.current['ArrowDown']) {
                    dog.position.addScaledVector(forward, -currentActualSpeed);
                    movementAppliedThisFrame = true;
                }
            }
            isDogActuallyMoving = movementAppliedThisFrame;

            dog.position.x = Math.max(-MOVEMENT_BOUNDARY, Math.min(MOVEMENT_BOUNDARY, dog.position.x));
            dog.position.z = Math.max(-MOVEMENT_BOUNDARY, Math.min(MOVEMENT_BOUNDARY, dog.position.z));
            dog.position.y = 0;

            if (animationMixerRef.current) {
                let newActionName = ANIMATION_NAMES.IDLE;
                if (isDogActuallyMoving) {
                    if (isSpeedBoostActiveRef.current) newActionName = ANIMATION_NAMES.RUN;
                    else if (isSprinting) newActionName = ANIMATION_NAMES.SPRINT_JUMP;
                    else newActionName = ANIMATION_NAMES.WALK;
                } else if (rotationAppliedThisFrame) {
                    newActionName = ANIMATION_NAMES.WALK;
                }
                
                const newAction = animationActionsRef.current[newActionName];
                const oldAction = currentActionRef.current;

                if (newAction && oldAction !== newAction) {
                    if (oldAction) oldAction.fadeOut(CROSSFADE_DURATION);
                    newAction.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).fadeIn(CROSSFADE_DURATION).play();
                    currentActionRef.current = newAction;
                } else if (newAction && !oldAction) {
                    newAction.reset().play();
                    currentActionRef.current = newAction;
                }
            }
        } else { // Paused
            if (animationMixerRef.current && currentActionRef.current && currentActionRef.current.isRunning()) {
                const idleAction = animationActionsRef.current[ANIMATION_NAMES.IDLE];
                if (idleAction && currentActionRef.current !== idleAction) {
                    currentActionRef.current.fadeOut(CROSSFADE_DURATION);
                    idleAction.reset().fadeIn(CROSSFADE_DURATION).play();
                    currentActionRef.current = idleAction;
                }
            }
        }

        if (animationMixerRef.current) animationMixerRef.current.update(delta);

        if (dogModelRef.current) {
            if (lastDogTransformRef.current) {
                lastDogTransformRef.current.position.copy(dogModelRef.current.position);
                lastDogTransformRef.current.rotationY = dogModelRef.current.rotation.y;
            } else {
                lastDogTransformRef.current = {
                    position: dogModelRef.current.position.clone(),
                    rotationY: dogModelRef.current.rotation.y
                };
            }
        }
        // Collision Detection using Octree
        if (octreeRef.current && dogModelRef.current) {
            const dogBoundingBox = new THREE.Box3().setFromObject(dogModelRef.current);
            const nearbyObjects = octreeRef.current.query(dogBoundingBox);

            for (const obj of nearbyObjects) {
                if (obj.id === 'ground') {
                    // Handle ground collision (e.g., keep dog on ground)
                    dogModelRef.current.position.y = 0;
                    continue;
                }
                // Handle other object collisions
                if (obj.id.startsWith('coin_')) {
                    // Handle coin collision
                } else if (obj.id.startsWith('enemy_')) {
                    // Handle enemy collision
                }
            }
        }

        return { isDogActuallyMoving, rotationAppliedThisFrame };

    }, [ clockRef, keysPressedRef, joystickInputRef, isPausedRef, isSpeedBoostActiveRef, isJoystickInteractionActiveRef, octreeRef]);

    useEffect(() => {
        const dog = dogModelRef.current;
        if (!dog) return;

        const updateEmissive = () => {
            if (!dogModelRef.current) return;
            let targetEmissiveHex = NORMAL_EMISSIVE_COLOR;
            if (!isPausedRef.current && isShieldActiveRef.current) {
                targetEmissiveHex = SHIELD_EMISSIVE_COLOR;
            }
            dogModelRef.current.traverse((child) => {
                if ((child as THREE.Mesh).isMesh) {
                    const material = (child as THREE.Mesh).material;
                    if (Array.isArray(material)) {
                        material.forEach(m => {
                            if ((m as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
                                (m as THREE.MeshStandardMaterial).emissive.setHex(targetEmissiveHex);
                            }
                        });
                    } else if ((material as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
                        (material as THREE.MeshStandardMaterial).emissive.setHex(targetEmissiveHex);
                    }
                }
            });
        };
        updateEmissive();
        const intervalId = setInterval(updateEmissive, 100);
        return () => clearInterval(intervalId);
    }, [isShieldActiveRef, isPausedRef]);


    return {
        dogModelRef,
        lastDogTransformRef, // For GameCanvas to restore position if needed
        initializeDog,
        updateDog,
        resetDogState,
    };
};
