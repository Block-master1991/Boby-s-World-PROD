import type { GameObject } from '@/types/game';
import { logger } from '@/utils/logger';
import type { MutableRefObject } from 'react';
import { useCallback, useRef } from 'react';
import * as THREE from 'three';
import type { Octree } from '../../lib/Octree';
import {
    COIN_MAGNET_RADIUS,
    COIN_ROTATION_SPEED,
    COLLECTION_THRESHOLD,
    VISIBLE_COIN_DISTANCE,
    type CoinData
} from './constants';

export interface FloatingEffectOptions {
    position: THREE.Vector3;
    effectType: 'coin' | 'Bottle' | 'item' | 'penalty' | 'score';
    value: number;
    animationType?: 'floatUp' | 'attractToTarget' | 'followTarget';
    is3DModel?: boolean;
    targetMesh?: THREE.Object3D | undefined;
}

interface InteractionProps {
    dogModelRef: MutableRefObject<THREE.Group | null>;
    coinMeshesRef: MutableRefObject<CoinData[]>;
    isCoinMagnetActiveRef: MutableRefObject<boolean>;
    onCoinCollected: () => void;
    remainingCoinsRef: MutableRefObject<number>;
    onRemainingCoinsUpdate: (remaining: number) => void;
    sceneRef: MutableRefObject<THREE.Scene | null>;
    octreeRef: MutableRefObject<Octree<GameObject> | null>;
    addFloatingEffect: (options: FloatingEffectOptions) => void;
    collectedSpawnKeysRef: MutableRefObject<Set<string>>;
    COIN_MAGNET_RADIUS?: number;
}

interface ProcessContext {
    dog: THREE.Group;
    displacement: THREE.Vector3;
    magnetRadius: number;
    isMagnetActive: boolean;
    scene: THREE.Scene;
    octree: Octree<GameObject> | null;
    callbacks: {
        collect: () => void;
        updateRemaining: (n: number) => void;
        addEffect: (opts: FloatingEffectOptions) => void;
    };
    refs: {
        remaining: MutableRefObject<number>;
        collectedKeys: MutableRefObject<Set<string>>;
    };
}

const removeCoin = (coin: CoinData, scene: THREE.Scene, octree: Octree<GameObject> | null) => {
    coin.visible = false;
    coin.collected = true;
    scene.remove(coin);
    if (octree) {
        octree.remove({ 
            id: `coin_${coin.uuid}`, 
            bounds: new THREE.Box3().setFromObject(coin), 
            data: coin as unknown as GameObject 
        });
    }
};

const isSpawnAlreadyCollected = (coin: CoinData, ctx: ProcessContext) => 
    !!(coin.spawnKey && ctx.refs.collectedKeys.current.has(coin.spawnKey));

const tryCreditCoin = (coin: CoinData, ctx: ProcessContext, source: string) => {
    if (coin.userData.isCredited) return;
    
    if (isSpawnAlreadyCollected(coin, ctx)) {
        coin.userData.isCredited = true;
        return;
    }

    coin.userData.isCredited = true;
    if (coin.spawnKey) ctx.refs.collectedKeys.current.add(coin.spawnKey);
    logger.log(`[World] Coin ${source}: ${coin.spawnKey || coin.uuid}. Crediting ${coin.value || 0.001} USDT.`);
    ctx.callbacks.collect();
    ctx.refs.remaining.current--;
    ctx.callbacks.updateRemaining(ctx.refs.remaining.current);
};

const handleCollection = (coin: CoinData, ctx: ProcessContext) => {
    tryCreditCoin(coin, ctx, 'collected');

    const opts: FloatingEffectOptions = {
        position: coin.position.clone(),
        effectType: 'coin',
        value: coin.value || 0.001,
        animationType: 'followTarget',
        is3DModel: true,
        targetMesh: ctx.dog
    };

    if (ctx.isMagnetActive) {
        if (!coin.userData.isAnimatingCollection) {
            coin.userData.isAnimatingCollection = true;
            coin.userData.collectionStartTime = performance.now();
            ctx.callbacks.addEffect(opts);
        }
    } else {
        coin.collected = true;
        ctx.callbacks.addEffect(opts);
        removeCoin(coin, ctx.scene, ctx.octree);
    }
};

const updateCoinVisuals = (coin: CoinData, ctx: ProcessContext) => {
    if (coin.userData.isAnimatingCollection) {
        const elapsed = performance.now() - (coin.userData.collectionStartTime || performance.now());
        const progress = Math.min(1, elapsed / 200);
        const scale = Math.max(0.1, 2.5 * (1 - progress));
        coin.scale.set(scale, scale, scale);
        coin.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), 0.5);
        coin.position.lerp(ctx.dog.position.clone().add(new THREE.Vector3(0, 1, 0)), 0.4);
        if (progress >= 1) removeCoin(coin, ctx.scene, ctx.octree);
    } else if (coin.userData.isAttracted) {
        coin.position.add(ctx.displacement);
        const dist = ctx.dog.position.distanceTo(coin.position);
        const speed = Math.min(0.4, 0.05 + (ctx.magnetRadius - dist) / ctx.magnetRadius * 0.35);
        coin.position.lerp(ctx.dog.position.clone().add(new THREE.Vector3(0, 0.5, 0)), speed);
        coin.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), coin.rotationSpeed || COIN_ROTATION_SPEED);
    } else if (ctx.dog.position.distanceTo(coin.position) < 150) {
        coin.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), COIN_ROTATION_SPEED);
    }
};

const handleMagnetAttraction = (coin: CoinData, dist: number, ctx: ProcessContext) => {
    if (!ctx.isMagnetActive || dist >= ctx.magnetRadius || coin.userData.isAttracted || coin.userData.isAnimatingCollection) {
        return;
    }
    coin.userData.isAttracted = true;
    tryCreditCoin(coin, ctx, 'attracted (Magnet)');
    coin.rotationSpeed = COIN_ROTATION_SPEED * 3;
};

const processSingleCoin = (coin: CoinData, ctx: ProcessContext) => {
    const dist = ctx.dog.position.distanceTo(coin.position);
    coin.visible = dist < VISIBLE_COIN_DISTANCE;
    if (!coin.visible) return false;

    const threshold = ctx.isMagnetActive ? COLLECTION_THRESHOLD * 2.0 : COLLECTION_THRESHOLD;
    
    if (dist < threshold) {
        handleCollection(coin, ctx);
    } else {
        handleMagnetAttraction(coin, dist, ctx);
    }
    
    if (!coin.collected || coin.userData.isAnimatingCollection) {
        updateCoinVisuals(coin, ctx);
    }
    
    return !coin.collected || coin.visible;
};

export const useCoinInteraction = (props: InteractionProps) => {
    const { 
        dogModelRef, coinMeshesRef, isCoinMagnetActiveRef, onCoinCollected, 
        remainingCoinsRef, onRemainingCoinsUpdate, sceneRef, octreeRef, addFloatingEffect, collectedSpawnKeysRef 
    } = props;
    
    const magnetRadius = props.COIN_MAGNET_RADIUS ?? COIN_MAGNET_RADIUS;
    const lastDogPositionRef = useRef<THREE.Vector3>(new THREE.Vector3());

    const updateCoinPhysics = useCallback(() => {
        if (!dogModelRef.current || !sceneRef.current) return;
        const dog = dogModelRef.current;
        
        const ctx: ProcessContext = {
            dog,
            displacement: dog.position.clone().sub(lastDogPositionRef.current),
            magnetRadius,
            isMagnetActive: isCoinMagnetActiveRef.current,
            scene: sceneRef.current,
            octree: octreeRef.current,
            callbacks: { collect: onCoinCollected, updateRemaining: onRemainingCoinsUpdate, addEffect: addFloatingEffect },
            refs: { remaining: remainingCoinsRef, collectedKeys: collectedSpawnKeysRef }
        };

        coinMeshesRef.current = coinMeshesRef.current.filter(coin => processSingleCoin(coin, ctx));
        lastDogPositionRef.current.copy(dog.position);
    }, [dogModelRef, coinMeshesRef, isCoinMagnetActiveRef, onCoinCollected, remainingCoinsRef, onRemainingCoinsUpdate, sceneRef, octreeRef, addFloatingEffect, magnetRadius]);

    return { lastDogPositionRef, updateCoinPhysics };
};
