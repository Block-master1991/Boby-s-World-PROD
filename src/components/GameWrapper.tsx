'use client';

import { checkCriticalAssets } from '@/lib/assetChecker';
import type { Octree } from '@/lib/Octree';
import type { GameObject } from '@/types/game';
import { logger } from '@/utils/logger';
import type { PublicKey } from '@solana/web3.js';
import React, { useEffect, useState } from 'react';
import GameCanvas from './game/GameCanvas';

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

// --- Loading State View ---
const LoadingView: React.FC<{ message: string }> = ({ message }) => (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-b from-blue-900 to-purple-900">
        <div className="text-white text-2xl">{message}</div>
    </div>
);

// --- Error State View ---
const ErrorView: React.FC<{ error: string }> = ({ error }) => (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-b from-red-900 to-purple-900 text-white p-8">
        <h1 className="text-4xl font-bold mb-4">⚠️ Error</h1>
        <p className="text-xl mb-4">{error}</p>
        <button onClick={() => window.location.reload()} className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg">
            Reload Page
        </button>
    </div>
);

// --- Asset Checker Hook ---
const useAssetChecker = () => {
    const [assetsReady, setAssetsReady] = useState(false);
    const [loadingError, setLoadingError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const checkAssets = async () => {
            logger.log('[GameWrapper] Verifying assets in IndexedDB...');
            setIsLoading(true);
            try {
                const criticalAssetsPresent = await checkCriticalAssets();
                if (criticalAssetsPresent) {
                    logger.log('[GameWrapper] ✓ All critical assets present');
                    setAssetsReady(true);
                } else {
                    logger.error('[GameWrapper] ✗ Critical assets missing');
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

    return { assetsReady, loadingError, isLoading };
};

// --- Load Handlers ---
const createLoadHandlers = () => ({
    onLoadStart: () => { logger.log('[GameWrapper] Starting game scene loading...'); },
    onLoadProgress: (progress: number, phase?: string) => { 
        // Log progress for debugging - GameCanvas handles visual display
        if (phase) logger.log(`[GameWrapper] Loading ${phase}: ${progress}%`);
    },
    onLoadComplete: (success: boolean) => { logger.log(`[GameWrapper] Game scene loading ${success ? 'completed' : 'failed'}`); }
});

// --- Main Component ---
const GameWrapper: React.FC<GameWrapperProps> = (props) => {
    const { assetsReady, loadingError, isLoading } = useAssetChecker();
    const octreeRef = React.useRef<Octree<GameObject> | null>(null);
    const loadHandlers = React.useMemo(() => createLoadHandlers(), []);

    if (isLoading) return <LoadingView message="Verifying game assets..." />;
    if (loadingError) return <ErrorView error={loadingError} />;
    if (!assetsReady) return <LoadingView message="Preparing game..." />;

    return (
        <GameCanvas
            {...props}
            octreeRef={octreeRef}
            onLoadStart={loadHandlers.onLoadStart}
            onLoadProgress={loadHandlers.onLoadProgress}
            onLoadComplete={loadHandlers.onLoadComplete}
        />
    );
};

export default GameWrapper;
