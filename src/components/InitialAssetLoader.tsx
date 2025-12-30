'use client';

import React, { useState, useEffect } from 'react';
import { initialAssetPreloader, PreloadProgress } from '@/lib/initialAssetPreloader';
import { MANIFEST_STATS } from '@/lib/gameAssetManifest';

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

    useEffect(() => {
        let mounted = true;

        const checkAndPreload = async () => {
            try {
                console.log('[InitialAssetLoader] Checking asset availability...');

                // Import the checker
                const { checkAssetAvailability } = await import('@/lib/assetChecker');
                const checkResult = await checkAssetAvailability();

                if (!mounted) return;

                // If all assets are present, skip preload
                if (checkResult.allPresent) {
                    console.log('[InitialAssetLoader] ✓ All assets already present in IndexedDB!');
                    console.log(`[InitialAssetLoader] Skipping preload, showing menu directly.`);

                    // Immediately mark as complete
                    setTimeout(() => {
                        if (mounted) {
                            onComplete();
                        }
                    }, 500);
                    return;
                }

                // Some assets are missing - start preload
                console.log(`[InitialAssetLoader] ${checkResult.missingAssets.length} assets missing, starting preload...`);
                console.log('[InitialAssetLoader] Starting initial asset preload...');
                console.log(`[InitialAssetLoader] Total assets to load: ${MANIFEST_STATS.totalAssets}`);
                console.log(`[InitialAssetLoader] Estimated total size: ${MANIFEST_STATS.totalEstimatedSizeMB.toFixed(1)}MB (will show actual size during loading)`);

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
                    console.log('[InitialAssetLoader] ✓ Initial preload completed successfully');
                    console.log(`[InitialAssetLoader] Total preload time: ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
                    console.log(`[InitialAssetLoader] Average speed: ${(progress.loadedSizeMB / ((Date.now() - startTime) / 1000)).toFixed(1)}MB/s`);

                    setTimeout(() => {
                        if (mounted) {
                            onComplete();
                        }
                    }, 500);
                } else {
                    throw new Error('Preload failed - some assets could not be loaded');
                }
            } catch (error) {
                console.error('[InitialAssetLoader] Error during check/preload:', error);
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
            case 'critical': return 'الأصول الأساسية';
            case 'high': return 'الأصول المهمة';
            case 'medium': return 'الأصول المتوسطة';
            case 'low': return 'الأصول الإضافية';
            default: return priority;
        }
    };

    const getPhaseText = (phase: string): string => {
        switch (phase) {
            case 'initializing': return 'جاري التهيئة...';
            case 'checking': return 'جاري فحص الموارد...'; // Added checking phase
            case 'Loading critical priority assets': return 'تحميل الأصول الأساسية...';
            case 'Loading high priority assets': return 'تحميل الأصول المهمة...';
            case 'Loading medium priority assets': return 'تحميل الأصول المتوسطة...';
            case 'Loading low priority assets': return 'تحميل الأصول الإضافية...';
            case 'Verifying preload completion': return 'التحقق من اكتمال التحميل...';
            case 'completed': return 'اكتمل التحميل!';
            case 'failed': return 'فشل التحميل';
            default: return phase;
        }
    };

    return (
        <div className="fixed inset-0 bg-gradient-to-br from-blue-900 via-purple-900 to-indigo-900 flex items-center justify-center z-50">
            <div className="bg-black/80 backdrop-blur-sm rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl border border-white/10">
                {/* Header */}
                <div className="text-center mb-8">
                    <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
                        <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                        </svg>
                    </div>
                    <h1 className="text-2xl font-bold text-white mb-2">تحميل اللعبة</h1>
                    <p className="text-gray-300 text-sm">جاري تحضير عالم اللعبة...</p>
                </div>

                {/* Progress Bar */}
                <div className="mb-6">
                    <div className="flex justify-between text-sm text-gray-300 mb-2">
                        <span>التقدم</span>
                        <span>{getProgressPercentage().toFixed(1)}%</span>
                    </div>
                    <div className="w-full bg-gray-700 rounded-full h-3 overflow-hidden">
                        <div
                            className="h-full bg-gradient-to-r from-blue-500 to-purple-600 rounded-full transition-all duration-300 ease-out"
                            style={{ width: `${getProgressPercentage()}%` }}
                        />
                    </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
                    <div className="text-center">
                        <div className="text-white font-semibold">{progress.loadedAssets}</div>
                        <div className="text-gray-400">من {progress.totalAssets}</div>
                        <div className="text-xs text-gray-500">الملفات</div>
                    </div>
                    <div className="text-center">
                        <div className="text-white font-semibold">{formatSize(progress.loadedSizeMB)}</div>
                        <div className="text-gray-400">من {formatSize(progress.totalSizeMB)}</div>
                        <div className="text-xs text-gray-500">الحجم</div>
                    </div>
                </div>

                {/* Current Status */}
                <div className="text-center mb-4">
                    <div className="text-white font-medium mb-1">
                        {getPhaseText(progress.phase)}
                    </div>
                    <div className="text-gray-400 text-sm">
                        {getPriorityText(progress.currentPriority)}
                    </div>
                    {progress.currentAsset && (
                        <div className="text-xs text-gray-500 mt-2 truncate" title={progress.currentAsset}>
                            {progress.currentAsset.split('/').pop()}
                        </div>
                    )}
                </div>

                {/* Time Estimate */}
                {estimatedTimeRemaining !== null && !progress.isComplete && (
                    <div className="text-center mb-4">
                        <div className="text-gray-300 text-sm">
                            الوقت المتبقي: ≈{formatTime(estimatedTimeRemaining)}
                        </div>
                        {progress.downloadSpeed > 0 && (
                            <div className="text-gray-400 text-xs mt-1">
                                السرعة: {progress.downloadSpeed.toFixed(2)} MB/s
                            </div>
                        )}
                    </div>
                )}

                {/* Integrity Stats */}
                {progress.verifiedAssets > 0 && (
                    <div className="bg-blue-900/30 border border-blue-500/30 rounded-lg p-3 mb-4">
                        <div className="text-blue-300 text-sm font-medium mb-1">
                            التحقق من السلامة
                        </div>
                        <div className="flex justify-between text-xs">
                            <span className="text-green-400">✓ تم التحقق: {progress.verifiedAssets}</span>
                            {progress.corruptedAssets > 0 && (
                                <span className="text-red-400">✗ تالف: {progress.corruptedAssets}</span>
                            )}
                        </div>
                    </div>
                )}

                {/* Errors */}
                {progress.errors.length > 0 && (
                    <div className="bg-red-900/50 border border-red-500/50 rounded-lg p-3 mb-4">
                        <div className="text-red-300 text-sm font-medium mb-1">
                            أخطاء التحميل ({progress.errors.length})
                        </div>
                        <div className="text-red-200 text-xs max-h-20 overflow-y-auto">
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
                                className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"
                                style={{
                                    animationDelay: `${i * 0.2}s`,
                                    animationDuration: '1s'
                                }}
                            />
                        ))}
                    </div>
                </div>

                {/* Footer */}
                <div className="text-center mt-6 text-xs text-gray-500">
                    يرجى الانتظار حتى اكتمال التحميل - اللعبة تعمل بدون اتصال بالإنترنت
                </div>
            </div>
        </div>
    );
};

export default InitialAssetLoader;
