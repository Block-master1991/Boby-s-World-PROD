'use client';

import React, { useState, useEffect } from 'react';
import type { PublicKey } from '@solana/web3.js';
import GameCanvas from './game/GameCanvas';
import { Octree } from '@/lib/Octree';
import { GameObject } from '@/types/game';
import { checkCriticalAssets } from '@/lib/assetChecker';
import { logger } from '@/utils/logger';

interface GameWrapperProps {
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
}

const GameWrapper: React.FC<GameWrapperProps> = (props) => {
    const [assetsReady, setAssetsReady] = useState(false);
    const [loadingError, setLoadingError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // Create Octree ref that will be shared between components
    const octreeRef = React.useRef<Octree<GameObject> | null>(null);

    // Quick check that critical assets are available in IndexedDB
    useEffect(() => {
        const checkAssets = async () => {
            logger.log('[GameWrapper] Verifying assets in IndexedDB...');
            setIsLoading(true);

            try {
                const criticalAssetsPresent = await checkCriticalAssets();

                if (criticalAssetsPresent) {
                    logger.log('[GameWrapper] ✓ All critical assets present in IndexedDB');
                    setAssetsReady(true);
                } else {
                    logger.error('[GameWrapper] ✗ Critical assets missing from IndexedDB');
                    setAssetsReady(false);
                    setLoadingError('Critical game assets are missing. Please refresh the page.');
                }
            } catch (error) {
                logger.error('[GameWrapper] Error checking assets:', error);
                setAssetsReady(false);
                setLoadingError('Failed to verify game assets');
            } finally {
                setIsLoading(false);
            }
        };

        checkAssets();
    }, []);

    const handleLoadStart = () => {
        logger.log('[GameWrapper] Starting game scene loading...');
    };

    const handleLoadProgress = (progress: number, phase?: string) => {
        // GameCanvas handles its own loading progress
    };

    const handleLoadComplete = (success: boolean) => {
        logger.log(`[GameWrapper] Game scene loading ${success ? 'completed' : 'failed'}`);
    };

    // Show loading state while checking assets
    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gradient-to-b from-blue-900 to-purple-900">
                <div className="text-white text-2xl">Verifying game assets...</div>
            </div>
        );
    }

    // Show error if assets are missing
    if (loadingError) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-b from-red-900 to-purple-900 text-white p-8">
                <h1 className="text-4xl font-bold mb-4">⚠️ Error</h1>
                <p className="text-xl mb-4">{loadingError}</p>
                <button
                    onClick={() => window.location.reload()}
                    className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg"
                >
                    Reload Page
                </button>
            </div>
        );
    }

    // Show game canvas when assets are ready
    if (!assetsReady) {
        return <div className="flex items-center justify-center min-h-screen bg-gradient-to-b from-blue-900 to-purple-900">
            <div className="text-white text-2xl">Preparing game...</div>
        </div>;
    }

    return (
        <GameCanvas
            {...props}
            octreeRef={octreeRef}
            onLoadStart={handleLoadStart}
            onLoadProgress={handleLoadProgress}
            onLoadComplete={handleLoadComplete}
        />
    );
};

export default GameWrapper;
