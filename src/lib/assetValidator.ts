// Asset Validator - Ensures all required game assets are properly loaded and cached
import { logger } from 'utils/logger';
import { validateAudioFormat, validateGLBFormat, validateHDRFormat } from './asset/formatValidators';
import type { AssetHealthReport, ValidationResult } from './asset/types';
import { batchPromises } from './asset/utils';
import type { AssetInfo } from './gameAssetManifest';
import { GAME_ASSET_MANIFEST, getAssetsByPriority } from './gameAssetManifest';
import { getModel } from './indexedDB';

export type { AssetHealthReport, ValidationResult };

/**
 * Validate all game assets to ensure they're cached and accessible
 */
export async function validateAllAssets(): Promise<ValidationResult> {
    logger.log('[AssetValidator] Starting comprehensive asset validation...');
    const result: ValidationResult = {
        isValid: true, missingAssets: [], corruptedAssets: [], validAssets: [],
        totalChecked: GAME_ASSET_MANIFEST.length,
        summary: { criticalMissing: 0, highMissing: 0, mediumMissing: 0, lowMissing: 0 }
    };

    const validations = await batchPromises(GAME_ASSET_MANIFEST, async (asset) => {
        try {
            const isValid = await validateSingleAsset(asset);
            return { asset, isValid, error: false };
        } catch (error) {
            logger.warn(`[AssetValidator] Error validating ${asset.path}:`, error);
            return { asset, isValid: false, error: true };
        }
    });

    validations.forEach(({ asset, isValid, error }) => {
        if (isValid) {
            result.validAssets.push(asset.path);
        } else {
            result.isValid = false;
            if (error) result.corruptedAssets.push(asset.path);
            else {
                result.missingAssets.push(asset.path);
                updateMissingSummary(result.summary, asset.priority);
            }
        }
    });

    logValidationCompletion(result);
    return result;
}

function updateMissingSummary(summary: ValidationResult['summary'], priority: string): void {
    if (priority === 'critical') summary.criticalMissing++;
    else if (priority === 'high') summary.highMissing++;
    else if (priority === 'medium') summary.mediumMissing++;
    else if (priority === 'low') summary.lowMissing++;
}

function logValidationCompletion(result: ValidationResult): void {
    logger.log(`[AssetValidator] Validation complete: ${result.validAssets.length}/${result.totalChecked} assets valid`);
    if (result.missingAssets.length > 0) logger.warn(`[AssetValidator] Missing: ${result.missingAssets.length}`);
    if (result.corruptedAssets.length > 0) logger.warn(`[AssetValidator] Corrupted: ${result.corruptedAssets.length}`);
}

async function validateSingleAsset(asset: AssetInfo): Promise<boolean> {
    try {
        const cachedData = await getModel(asset.path);
        if (!cachedData) return false;

        const isValidSize = validateAssetSize(cachedData, asset);
        const isValidType = validateAssetType(cachedData, asset);

        return isValidSize && isValidType;
    } catch (error) {
        logger.error(`[AssetValidator] Error validating ${asset.path}:`, error);
        return false;
    }
}

function validateAssetSize(data: ArrayBuffer, asset: AssetInfo): boolean {
    const actual = data.byteLength;
    const expected = asset.estimatedSizeMB * 1024 * 1024;
    return actual >= expected * 0.5 && actual <= expected * 2.0;
}

function validateAssetType(data: ArrayBuffer, asset: AssetInfo): boolean {
    if (asset.type === 'model' && asset.path.endsWith('.glb')) return validateGLBFormat(data);
    if (asset.type === 'hdr') return validateHDRFormat(data);
    if (asset.type === 'audio') return validateAudioFormat(data, asset.path);
    if (asset.type === 'texture') return data.byteLength > 100;
    return data.byteLength > 0;
}

/**
 * Generate a health report
 */
export async function generateAssetHealthReport(): Promise<AssetHealthReport> {
    const validation = await validateAllAssets();
    const criticalAssets = getAssetsByPriority('critical');
    const healthPct = (validation.validAssets.length / validation.totalChecked) * 100;

    const report: AssetHealthReport = {
        overallHealth: determineOverallHealth(healthPct),
        healthPercentage: Math.round(healthPct * 100) / 100,
        criticalAssetsLoaded: criticalAssets.length - validation.summary.criticalMissing,
        totalCriticalAssets: criticalAssets.length,
        estimatedGameplayImpact: determineImpact(validation.summary),
        recommendations: generateRecommendations(validation)
    };

    return report;
}

function determineOverallHealth(pct: number): AssetHealthReport['overallHealth'] {
    if (pct >= 95) return 'excellent';
    if (pct >= 85) return 'good';
    if (pct >= 70) return 'fair';
    if (pct >= 50) return 'poor';
    return 'critical';
}

function determineImpact(summary: ValidationResult['summary']): AssetHealthReport['estimatedGameplayImpact'] {
    if (summary.criticalMissing > 0) return 'unplayable';
    if (summary.highMissing > 2) return 'severe';
    if (summary.highMissing > 0 || summary.mediumMissing > 5) return 'moderate';
    if (summary.mediumMissing > 0 || summary.lowMissing > 10) return 'minor';
    return 'none';
}

function generateRecommendations(v: ValidationResult): string[] {
    const recs: string[] = [];
    if (v.summary.criticalMissing > 0) recs.push('Critical assets missing - game may fail');
    if (v.summary.highMissing > 0) recs.push('High-priority assets missing');
    if (v.missingAssets.length > 0) recs.push(`Reload to fetch ${v.missingAssets.length} missing assets`);
    if (v.corruptedAssets.length > 0) recs.push(`Found ${v.corruptedAssets.length} corrupted assets - clear cache`);
    const healthPercentage = (v.validAssets.length / v.totalChecked) * 100;
    if (healthPercentage < 90) {
        recs.push('Asset cache health is below optimal - consider optimizing loading strategy');
    }
    return recs;
}

/**
 * Public API
 */
export async function canGameStart(): Promise<{ canStart: boolean; reason?: string; report?: AssetHealthReport }> {
    const report = await generateAssetHealthReport();
    if (report.estimatedGameplayImpact === 'unplayable') return { canStart: false, reason: 'Critical assets missing', report };
    if (report.criticalAssetsLoaded < report.totalCriticalAssets) return { canStart: false, reason: 'Critical assets missing', report };
    return { canStart: true, report };
}

export async function getAssetsNeedingReload(): Promise<string[]> {
    const v = await validateAllAssets();
    return [...v.missingAssets, ...v.corruptedAssets];
}

export async function clearCorruptedAssets(): Promise<number> {
    const v = await validateAllAssets();
    logger.log(`[AssetValidator] Found ${v.corruptedAssets.length} corrupted assets to clear`);
    return v.corruptedAssets.length;
}
