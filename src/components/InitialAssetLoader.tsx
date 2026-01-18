'use client';

import LoadingScreen from '@/components/game-bootstrap/LoadingScreen';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useInitialAssetLoader } from '@/hooks/useInitialAssetLoader';
import type { PreloadProgress } from '@/lib/preloadTypes';
import React from 'react';

interface InitialAssetLoaderProps { onComplete: () => void; onError: (error: string) => void; }

const formatTime = (ms: number) => {
    const s = Math.floor(ms / 1000);
    return s >= 60 ? `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}` : `${s}s`;
};
const formatSize = (mb: number) => mb >= 1 ? `${mb.toFixed(1)}MB` : `${(mb * 1024).toFixed(0)}KB`;
const getPriorityText = (p: string) => ({ critical: 'Core Assets', high: 'High Priority', medium: 'Medium Priority', low: 'Additional Assets' }[p] || p);
const getPhaseText = (p: string) => {
    const map: Record<string, string> = { 
        initializing: 'Initializing...', checking: 'Checking...', 'completed': 'Done!', 'failed': 'Failed',
        'Loading critical priority assets': 'Loading Core...', 'Loading high priority assets': 'Loading High...',
        'Loading medium priority assets': 'Loading Medium...', 'Loading low priority assets': 'Loading Additional...'
    };
    return map[p] || p;
};

const AssetLoaderUI: React.FC<{ progress: PreloadProgress; eta: number | null }> = ({ progress, eta }) => {
    const pct = progress.totalAssets > 0 ? (progress.loadedAssets / progress.totalAssets) * 100 : 0;
    return (
        <Card className="w-full max-w-md md:max-w-2xl glass-card">
            <CardHeader className="text-center">
                <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
                    <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                </div>
                <CardTitle className="text-2xl md:text-4xl text-foreground">Game Loading</CardTitle>
                <CardDescription className="text-lg">Preparing Game World...</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <div>
                    <div className="flex justify-between text-sm text-muted-foreground mb-2"><span>Progress</span><span>{pct.toFixed(1)}%</span></div>
                    <div className="w-full bg-muted rounded-full h-3 overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-primary to-primary/80 rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm text-center">
                    <div><div className="font-semibold">{progress.loadedAssets}</div><div className="text-muted-foreground">of {progress.totalAssets} Files</div></div>
                    <div><div className="font-semibold">{formatSize(progress.loadedSizeMB)}</div><div className="text-muted-foreground">of {formatSize(progress.totalSizeMB)} Size</div></div>
                </div>
                <div className="text-center">
                    <div className="font-medium text-foreground">{getPhaseText(progress.phase)}</div>
                    <div className="text-muted-foreground text-sm">{getPriorityText(progress.currentPriority)}</div>
                </div>
                {eta !== null && !progress.isComplete && (
                    <div className="text-center text-sm text-muted-foreground">ETA: ≈{formatTime(eta)} {progress.downloadSpeed > 0 && <span className="block text-xs">Speed: {progress.downloadSpeed.toFixed(2)} MB/s</span>}</div>
                )}
                {progress.verifiedAssets > 0 && <div className="bg-accent/20 border border-accent/30 rounded-lg p-3 text-xs flex justify-between"><span className="text-green-500">✓ Verified: {progress.verifiedAssets}</span>{progress.corruptedAssets > 0 && <span className="text-destructive">✗ Corrupted: {progress.corruptedAssets}</span>}</div>}
                {progress.errors.length > 0 && <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 text-xs text-destructive"><div className="font-medium mb-1">Errors ({progress.errors.length})</div><div className="max-h-20 overflow-y-auto">{progress.errors.slice(-3).map((e, i) => <div key={i} className="truncate">• {e}</div>)}</div></div>}
                <div className="flex justify-center space-x-1">{[0, 1, 2].map((i) => <div key={i} className="w-2 h-2 bg-primary rounded-full animate-pulse" style={{ animationDelay: `${i * 0.2}s` }} />)}</div>
            </CardContent>
        </Card>
    );
};

const InitialAssetLoader: React.FC<InitialAssetLoaderProps> = ({ onComplete, onError }) => {
    const { progress, estimatedTimeRemaining, isCheckOnly, isInitialLoading } = useInitialAssetLoader({ onComplete, onError });
    if (isInitialLoading || isCheckOnly) return <LoadingScreen variant="indeterminate" message={isCheckOnly ? "Checking Assets..." : "Preparing Game..."} showLogo={true} />;
    return <div className="min-h-screen bg-background text-foreground px-4 flex items-center justify-center"><AssetLoaderUI progress={progress} eta={estimatedTimeRemaining} /></div>;
};

export default InitialAssetLoader;
