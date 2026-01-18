import { CRITICAL_ASSETS, HIGH_PRIORITY_ASSETS } from './high-priority';
import { LOW_PRIORITY_ASSETS } from './low-priority';
import { MEDIUM_PRIORITY_ASSETS } from './medium-priority';
import type { AssetInfo } from './types';

export const GAME_ASSET_MANIFEST: AssetInfo[] = [
    ...CRITICAL_ASSETS,
    ...HIGH_PRIORITY_ASSETS,
    ...MEDIUM_PRIORITY_ASSETS,
    ...LOW_PRIORITY_ASSETS
];

export function getAssetsByPriority(priority: 'critical' | 'high' | 'medium' | 'low'): AssetInfo[] {
    return GAME_ASSET_MANIFEST.filter(asset => asset.priority === priority);
}

export function getTotalEstimatedSize(): number {
    return GAME_ASSET_MANIFEST.reduce((total, asset) => total + asset.estimatedSizeMB, 0);
}

export function getTotalActualSize(): number {
    return GAME_ASSET_MANIFEST.reduce((total, asset) => total + (asset.actualSizeMB || asset.estimatedSizeMB), 0);
}

export function getPriorityOrder(): ('critical' | 'high' | 'medium' | 'low')[] {
    return ['critical', 'high', 'medium', 'low'];
}

export function getAssetsByType(type: 'model' | 'texture' | 'audio' | 'hdr'): AssetInfo[] {
    return GAME_ASSET_MANIFEST.filter(asset => asset.type === type);
}

export function getAssetByPath(path: string): AssetInfo | undefined {
    return GAME_ASSET_MANIFEST.find(asset => asset.path === path);
}

export const MANIFEST_STATS = {
    totalAssets: GAME_ASSET_MANIFEST.length,
    totalEstimatedSizeMB: getTotalEstimatedSize(),
    totalActualSizeMB: getTotalActualSize(),
    measuredAt: '2025-12-30T14:49:11.101Z',
    accuracy: -72.76,
    byPriority: {
        critical: getAssetsByPriority('critical').length,
        high: getAssetsByPriority('high').length,
        medium: getAssetsByPriority('medium').length,
        low: getAssetsByPriority('low').length
    },
    byType: {
        models: getAssetsByType('model').length,
        textures: getAssetsByType('texture').length,
        audio: getAssetsByType('audio').length,
        hdr: getAssetsByType('hdr').length
    }
};
