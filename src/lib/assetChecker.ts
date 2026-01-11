// Smart Asset Verification System
// Checks which assets are missing and only loads what's needed

import { getAsset } from './indexedDB';
import type { AssetInfo } from './gameAssetManifest';
import { GAME_ASSET_MANIFEST } from './gameAssetManifest';
import { logger } from '@/utils/logger';

export interface AssetCheckResult {
    totalAssets: number;
    presentAssets: number;
    missingAssets: AssetInfo[];
    allPresent: boolean;
    checkDuration: number;
}

/**
 * Check which assets are present in IndexedDB
 */
export async function checkAssetAvailability(): Promise<AssetCheckResult> {
    logger.log('[AssetChecker] Starting parallel asset availability check...');
    const startTime = performance.now();

    // Parallel check using Promise.all for much faster execution
    const checkPromises = GAME_ASSET_MANIFEST.map(async (asset) => {
        try {
            const cached = await getAsset(asset.path);
            return { asset, present: !!(cached && cached.data) };
        } catch (error) {
            // Asset not found or error accessing it
            return { asset, present: false };
        }
    });

    const results = await Promise.all(checkPromises);

    const missingAssets: AssetInfo[] = [];
    let presentCount = 0;

    for (const result of results) {
        if (result.present) {
            presentCount++;
        } else {
            missingAssets.push(result.asset);
        }
    }

    const duration = performance.now() - startTime;
    const allPresent = missingAssets.length === 0;

    const result: AssetCheckResult = {
        totalAssets: GAME_ASSET_MANIFEST.length,
        presentAssets: presentCount,
        missingAssets,
        allPresent,
        checkDuration: duration
    };

    logger.log(`[AssetChecker] Parallel check complete in ${duration.toFixed(0)}ms:`);
    logger.log(`  ✓ Present: ${presentCount}/${GAME_ASSET_MANIFEST.length}`);
    logger.log(`  ✗ Missing: ${missingAssets.length}`);

    if (!allPresent) {
        logger.log('[AssetChecker] Missing assets:', missingAssets.map(a => a.path));
    }

    return result;
}

/**
 * Quick check if all critical assets are present
 */
export async function checkCriticalAssets(): Promise<boolean> {
    const criticalAssets = GAME_ASSET_MANIFEST.filter(a => a.priority === 'critical');

    for (const asset of criticalAssets) {
        try {
            const cached = await getAsset(asset.path);
            if (!cached || !cached.data) {
                logger.warn(`[AssetChecker] Critical asset missing: ${asset.path}`);
                return false;
            }
        } catch {
            logger.error(`[AssetChecker] Error checking critical asset ${asset.path}`);
            return false;
        }
    }

    return true;
}

/**
 * Get percentage of assets present
 */
export async function getAssetCompletionPercentage(): Promise<number> {
    const result = await checkAssetAvailability();
    return (result.presentAssets / result.totalAssets) * 100;
}
