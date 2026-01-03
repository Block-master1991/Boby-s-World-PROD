'use client';

import React, { useState, useEffect } from 'react';
import { initialAssetPreloader, PreloadProgress } from '@/lib/initialAssetPreloader';
import { MANIFEST_STATS } from '@/lib/gameAssetManifest';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import LoadingScreen from '@/components/game-bootstrap/LoadingScreen';
import { logger } from '@/utils/logger';

interface InitialAssetLoaderProps {
    onComplete: () => void;
    onError: (error: string) => void;
}

const InitialAssetLoader: React.FC<InitialAssetLoaderProps> = ({ onComplete, onError }) => {
    const [progress, setProgress] = useState<PreloadProgress>({
        totalAssets: MANIFEST_STATS.totalAssets,
        loadedAssets: 0,
        loadedSizeMB: 0,
        totalSizeMB: MANIFEST_STATS.totalEstimatedSizeMB,
        currentPriority: 'critical',
        phase: 'initializing',
        isComplete: false,
        errors: [],
        verifiedAssets: 0,
        corruptedAssets: 0,
        downloadSpeed: 0,
        integrityChecks: []
    });

    const [startTime] = useState(Date.now());
    const [estimatedTimeRemaining, setEstimatedTimeRemaining] = useState<number | null>(null);
    const [isCheckOnly, setIsCheckOnly] = useState(false);
    const [checkComplete, setCheckComplete] = useState(false);
    const [isInitialLoading, setIsInitialLoading] = useState(true);

    useEffect(() => {
        let mounted = true;

        const checkAndPreload = async () => {
            try {
                logger.log('[InitialAssetLoader] Checking asset availability...');

                // Import the checker
                const { checkAssetAvailability } = await import('@/lib/assetChecker');
                const checkResult = await checkAssetAvailability();

                if (!mounted) return;

                // If all assets are present, stay with indeterminate loader (check-only mode)
                if (checkResult.allPresent) {
                    logger.log('[InitialAssetLoader] ✓ All assets already present in IndexedDB!');
                    logger.log(`[InitialAssetLoader] Staying with indeterminate loader for check-only.`);

                    setIsCheckOnly(true);

                    // Simulate a brief check delay for better UX
                    setTimeout(() => {
                        if (mounted) {
                            setCheckComplete(true);
                            setTimeout(() => {
                                if (mounted) {
                                    onComplete();
                                }
                            }, 500);
                        }
                    }, 1500); // Show check animation for 1.5 seconds
                    return;
                }

                // Some assets are missing - switch to full preload mode
                logger.log(`[InitialAssetLoader] ${checkResult.missingAssets.length} assets missing, switching to full preload mode...`);
                setIsInitialLoading(false); // Switch to full loader
                logger.log('[InitialAssetLoader] Starting initial asset preload...');
                logger.log(`[InitialAssetLoader] Total assets to load: ${MANIFEST_STATS.totalAssets}`);
                logger.log(`[InitialAssetLoader] Estimated total size: ${MANIFEST_STATS.totalEstimatedSizeMB.toFixed(1)}MB (will show actual size during loading)`);

                const success = await initialAssetPreloader.preloadAllAssets({
                    onProgress: (progress) => {
                        if (mounted) {
                            setProgress(progress);

                            // Calculate estimated time remaining
                            const elapsed = Date.now() - startTime;
                            const progressRatio = progress.loadedAssets / progress.totalAssets;
                            if (progressRatio > 0.1) { // Only estimate after 10% progress
                                const totalEstimated = elapsed / progressRatio;
                                const remaining = totalEstimated - elapsed;
                                setEstimatedTimeRemaining(Math.max(0, remaining));
                            }
                        }
                    },
                    maxConcurrentLoads: 3,
                    timeoutMs: 300000,
                    retryAttempts: 3
                });

                if (!mounted) return;

                if (success) {
                    logger.log('[InitialAssetLoader] ✓ Initial preload completed successfully');
                    logger.log(`[InitialAssetLoader] Total preload time: ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
                    logger.log(`[InitialAssetLoader] Average speed: ${(progress.loadedSizeMB / ((Date.now() - startTime) / 1000)).toFixed(1)}MB/s`);

                    setTimeout(() => {
                        if (mounted) {
                            onComplete();
                        }
                    }, 500);
                } else {
                    throw new Error('Preload failed - some assets could not be loaded');
                }
            } catch (error) {
                logger.error('[InitialAssetLoader] Error during check/preload:', error);
                if (mounted) {
                    onError(error instanceof Error ? error.message : 'Unknown preload error');
                }
            }
        };

        checkAndPreload();

        return () => {
            mounted = false;
            initialAssetPreloader.cancelPreload();
        };
    }, [onComplete, onError, startTime]);

    const formatTime = (ms: number): string => {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;

        if (minutes > 0) {
            return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
        }
        return `${remainingSeconds}s`;
    };

    const formatSize = (mb: number): string => {
        if (mb >= 1) {
            return `${mb.toFixed(1)}MB`;
        }
        return `${(mb * 1024).toFixed(0)}KB`;
    };

    const getProgressPercentage = (): number => {
        return progress.totalAssets > 0 ? (progress.loadedAssets / progress.totalAssets) * 100 : 0;
    };

    const getPriorityText = (priority: 'critical' | 'high' | 'medium' | 'low'): string => {
        switch (priority) {
            case 'critical': return 'Core Assets';
            case 'high': return 'High Priority Assets';
            case 'medium': return 'Medium Priority Assets';
            case 'low': return 'Additional Assets';
            default: return priority;
        }
    };

    const getPhaseText = (phase: string): string => {
        switch (phase) {
            case 'initializing': return 'Initializing...';
            case 'checking': return 'Checking Assets...';
            case 'Loading critical priority assets': return 'Loading Core Assets...';
            case 'Loading high priority assets': return 'Loading High Priority Assets...';
            case 'Loading medium priority assets': return 'Loading Medium Priority Assets...';
            case 'Loading low priority assets': return 'Loading Additional Assets...';
            case 'Verifying preload completion': return 'Verifying Completion...';
            case 'completed': return 'Loading Complete!';
            case 'failed': return 'Loading Failed';
            default: return phase;
        }
    };

    // Show indeterminate loader by default (during initial check)
    if (isInitialLoading || isCheckOnly) {
        return (
            <LoadingScreen
                variant="indeterminate"
                message={isCheckOnly ? "Checking Assets..." : "Preparing Game..."}
                showLogo={true}
                isError={false}
            />
        );
    }

    // Show full loader only when actual asset loading is happening
    return (
        <div className="min-h-screen bg-background text-foreground px-4 sm:px-6 relative">
            <div className="flex items-center justify-center min-h-screen">
                <Card className="w-full max-w-md md:max-w-2xl glass-card overflow-y-auto">
                    <CardHeader>
                        <CardTitle className="text-center text-2xl md:text-4xl text-foreground">
                            <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
                                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                </svg>
                            </div>
                            Game Loading
                        </CardTitle>
                        <CardDescription className="text-center text-base md:text-lg text-muted-foreground">
                            Preparing Game World...
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">

                        {/* Progress Bar */}
                        <div className="mb-6">
                            <div className="flex justify-between text-sm text-muted-foreground mb-2">
                                <span>Progress</span>
                                <span>{getProgressPercentage().toFixed(1)}%</span>
                            </div>
                            <div className="w-full bg-muted rounded-full h-3 overflow-hidden">
                                <div
                                    className="h-full bg-gradient-to-r from-primary to-primary/80 rounded-full transition-all duration-300 ease-out"
                                    style={{ width: `${getProgressPercentage()}%` }}
                                />
                            </div>
                        </div>

                        {/* Stats */}
                        <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
                            <div className="text-center">
                                <div className="text-foreground font-semibold">{progress.loadedAssets}</div>
                                <div className="text-muted-foreground">of {progress.totalAssets}</div>
                                <div className="text-xs text-muted-foreground">Files</div>
                            </div>
                            <div className="text-center">
                                <div className="text-foreground font-semibold">{formatSize(progress.loadedSizeMB)}</div>
                                <div className="text-muted-foreground">of {formatSize(progress.totalSizeMB)}</div>
                                <div className="text-xs text-muted-foreground">Size</div>
                            </div>
                        </div>

                        {/* Current Status */}
                        <div className="text-center mb-4">
                            <div className="text-foreground font-medium mb-1">
                                {getPhaseText(progress.phase)}
                            </div>
                            <div className="text-muted-foreground text-sm">
                                {getPriorityText(progress.currentPriority)}
                            </div>
                            {progress.currentAsset && (
                                <div className="text-xs text-muted-foreground mt-2 truncate" title={progress.currentAsset}>
                                    {progress.currentAsset.split('/').pop()}
                                </div>
                            )}
                        </div>

                        {/* Time Estimate */}
                        {estimatedTimeRemaining !== null && !progress.isComplete && (
                            <div className="text-center mb-4">
                                <div className="text-muted-foreground text-sm">
                                    Time Remaining: ≈{formatTime(estimatedTimeRemaining)}
                                </div>
                                {progress.downloadSpeed > 0 && (
                                    <div className="text-muted-foreground text-xs mt-1">
                                        Speed: {progress.downloadSpeed.toFixed(2)} MB/s
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Integrity Stats */}
                        {progress.verifiedAssets > 0 && (
                            <div className="bg-accent/20 border border-accent/30 rounded-lg p-3 mb-4">
                                <div className="text-accent-foreground text-sm font-medium mb-1">
                                    Integrity Check
                                </div>
                                <div className="flex justify-between text-xs">
                                    <span className="text-green-500">✓ Verified: {progress.verifiedAssets}</span>
                                    {progress.corruptedAssets > 0 && (
                                        <span className="text-destructive">✗ Corrupted: {progress.corruptedAssets}</span>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Errors */}
                        {progress.errors.length > 0 && (
                            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 mb-4">
                                <div className="text-destructive text-sm font-medium mb-1">
                                    Loading Errors ({progress.errors.length})
                                </div>
                                <div className="text-destructive/80 text-xs max-h-20 overflow-y-auto">
                                    {progress.errors.slice(-3).map((error, index) => (
                                        <div key={index} className="truncate" title={error}>
                                            • {error}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Loading Animation */}
                        <div className="flex justify-center">
                            <div className="flex space-x-1">
                                {[0, 1, 2].map((i) => (
                                    <div
                                        key={i}
                                        className="w-2 h-2 bg-primary rounded-full animate-pulse"
                                        style={{
                                            animationDelay: `${i * 0.2}s`,
                                            animationDuration: '1s'
                                        }}
                                    />
                                ))}
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="text-center mt-6 text-xs text-muted-foreground">
                            Please wait until loading is complete - Game works offline
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
};

export default InitialAssetLoader;
