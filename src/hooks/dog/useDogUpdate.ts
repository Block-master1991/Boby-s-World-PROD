import type { GameObject } from '@/types/game';
import type { MutableRefObject } from 'react';
import { useCallback } from 'react';
import * as THREE from 'three';
import type { Octree } from '../../lib/Octree';
import { ANIMATION_NAMES, type DogAnimationName, type DogTransform } from './constants';

interface UpdateProps {
    dogModelRef: MutableRefObject<THREE.Group | null>;
    animationMixerRef: MutableRefObject<THREE.AnimationMixer | null>;
    isPausedRef: MutableRefObject<boolean>;
    isSpeedBoostActiveRef: MutableRefObject<boolean>;
    octreeRef: MutableRefObject<Octree<GameObject> | null>;
    lastDogTransformRef: MutableRefObject<DogTransform | null>;
    updateAnimationState: (name: DogAnimationName) => void;
    applyMovement: (dog: THREE.Group, delta: number) => { rotationApplied: boolean, movementApplied: boolean, isSprinting: boolean };
}

export const useDogUpdate = (props: UpdateProps) => {
    const { 
        dogModelRef, animationMixerRef, isPausedRef, isSpeedBoostActiveRef, 
        octreeRef, lastDogTransformRef, updateAnimationState, applyMovement 
    } = props;

    const handleGroundCollision = (dog: THREE.Group, octree: Octree<GameObject>) => {
        const box = new THREE.Box3().setFromObject(dog);
        octree.query(box).forEach(o => {
            if (o.id === 'ground') dog.position.y = 0;
        });
    };

    const updateDog = useCallback((delta: number) => {
        const dog = dogModelRef.current;
        const mixer = animationMixerRef.current;
        if (!dog || !mixer || isPausedRef.current) {
            if (isPausedRef.current) updateAnimationState(ANIMATION_NAMES.IDLE);
            return { isDogActuallyMoving: false, rotationAppliedThisFrame: false };
        }

        const { rotationApplied, movementApplied, isSprinting } = applyMovement(dog, delta);
        const nextAnim = movementApplied 
            ? (isSpeedBoostActiveRef.current ? ANIMATION_NAMES.RUN : (isSprinting ? ANIMATION_NAMES.SPRINT_JUMP : ANIMATION_NAMES.WALK)) 
            : (rotationApplied ? ANIMATION_NAMES.WALK : ANIMATION_NAMES.IDLE);
        
        updateAnimationState(nextAnim);
        mixer.update(delta);
        if (octreeRef.current) handleGroundCollision(dog, octreeRef.current);

        if (lastDogTransformRef.current) {
            lastDogTransformRef.current.position.copy(dog.position);
            lastDogTransformRef.current.rotationY = dog.rotation.y;
        }
        return { isDogActuallyMoving: movementApplied, rotationAppliedThisFrame: rotationApplied };
    }, [dogModelRef, animationMixerRef, isPausedRef, updateAnimationState, applyMovement, isSpeedBoostActiveRef, octreeRef, lastDogTransformRef]);

    return { updateDog };
};
