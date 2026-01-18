import { logger } from 'utils/logger';
import { MANIFEST_STATS } from './gameAssetManifest';
import type { DataType } from './indexedDB';
import type { PreloadProgress } from './preloadTypes';

export function isMobile(): boolean {
    return typeof window !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}

export function getAssetDataType(type: string): DataType {
    if (type === 'texture') return 'blob';
    return 'arraybuffer';
}

export function getMimeType(path: string): string | undefined {
    const ext = path.split('.').pop()?.toLowerCase();
    switch (ext) {
        case 'glb': return 'model/gltf-binary';
        case 'jpg': case 'jpeg': return 'image/jpeg';
        case 'png': return 'image/png';
        case 'hdr': return 'application/octet-stream';
        case 'mp3': return 'audio/mpeg';
        default: return undefined;
    }
}

export function getPriorityNum(p: string): number {
    switch (p) {
        case 'critical': return 10;
        case 'high': return 7;
        case 'medium': return 5;
        default: return 3;
    }
}

export async function retryDelay(attempt: number, path: string, err: Error): Promise<void> {
    logger.warn(`[Preload] Retry ${attempt} for ${path}:`, err);
    await new Promise(r => setTimeout(r, Math.min(1000 * Math.pow(2, attempt - 1), 10000)));
}

export async function fetchAsset(
    path: string,
    estimatedSizeMB: number,
    type: string,
    signal: AbortSignal | null
): Promise<ArrayBuffer> {
    const skipSW = estimatedSizeMB > 10 || type === 'hdr';
    const res = await fetch(path, {
        signal,
        headers: {
            ...(process.env.NODE_ENV === 'development' ? { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' } : {}),
            ...(skipSW ? { 'Service-Worker': 'script' } : {})
        },
        cache: skipSW ? 'no-cache' : 'default'
    } as RequestInit);
    
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    return res.arrayBuffer();
}

export function getInitialProgress(): PreloadProgress {
    return {
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
    };
}
