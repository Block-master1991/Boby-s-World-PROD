// Asset Validator - Ensures all required game assets are properly loaded and cached
// Provides validation and integrity checks for offline-first gameplay

import { getModel } from './indexedDB';
import { GAME_ASSET_MANIFEST, getAssetsByPriority, AssetInfo } from './gameAssetManifest';

export interface ValidationResult {
    isValid: boolean;
    missingAssets: string[];
    corruptedAssets: string[];
    validAssets: string[];
    totalChecked: number;
    summary: {
        criticalMissing: number;
        highMissing: number;
        mediumMissing: number;
        lowMissing: number;
    };
}

export interface AssetHealthReport {
    overallHealth: 'excellent' | 'good' | 'fair' | 'poor' | 'critical';
    healthPercentage: number;
    criticalAssetsLoaded: number;
    totalCriticalAssets: number;
    estimatedGameplayImpact: 'none' | 'minor' | 'moderate' | 'severe' | 'unplayable';
    recommendations: string[];
}

/**
 * Validate all game assets to ensure they're cached and accessible
 */
export async function validateAllAssets(): Promise<ValidationResult> {
    console.log('[AssetValidator] Starting comprehensive asset validation...');

    const result: ValidationResult = {
        isValid: true,
        missingAssets: [],
        corruptedAssets: [],
        validAssets: [],
        totalChecked: GAME_ASSET_MANIFEST.length,
        summary: {
            criticalMissing: 0,
            highMissing: 0,
            mediumMissing: 0,
            lowMissing: 0
        }
    };

    for (const asset of GAME_ASSET_MANIFEST) {
        try {
            const isValid = await validateSingleAsset(asset);
            if (isValid) {
                result.validAssets.push(asset.path);
            } else {
                result.isValid = false;
                result.missingAssets.push(asset.path);

                // Update summary by priority
                switch (asset.priority) {
                    case 'critical':
                        result.summary.criticalMissing++;
                        break;
                    case 'high':
                        result.summary.highMissing++;
                        break;
                    case 'medium':
                        result.summary.mediumMissing++;
                        break;
                    case 'low':
                        result.summary.lowMissing++;
                        break;
                }
            }
        } catch (error) {
            console.warn(`[AssetValidator] Error validating ${asset.path}:`, error);
            result.corruptedAssets.push(asset.path);
            result.isValid = false;
        }
    }

    console.log(`[AssetValidator] Validation complete: ${result.validAssets.length}/${result.totalChecked} assets valid`);
    if (result.missingAssets.length > 0) {
        console.warn(`[AssetValidator] Missing assets: ${result.missingAssets.length}`);
    }
    if (result.corruptedAssets.length > 0) {
        console.warn(`[AssetValidator] Corrupted assets: ${result.corruptedAssets.length}`);
    }

    return result;
}

/**
 * Validate a single asset
 */
async function validateSingleAsset(asset: AssetInfo): Promise<boolean> {
    try {
        const cachedData = await getModel(asset.path);

        if (!cachedData) {
            console.log(`[AssetValidator] ✗ Asset missing: ${asset.path}`);
            return false;
        }

        // Basic validation - check if data exists and has reasonable size
        const isValidSize = validateAssetSize(cachedData, asset);
        const isValidType = validateAssetType(cachedData, asset);

        if (!isValidSize || !isValidType) {
            console.warn(`[AssetValidator] ⚠️ Asset validation failed for ${asset.path}: size=${isValidSize}, type=${isValidType}`);
            return false;
        }

        return true;
    } catch (error) {
        console.error(`[AssetValidator] Error validating asset ${asset.path}:`, error);
        return false;
    }
}

/**
 * Validate asset size (rough estimation)
 */
function validateAssetSize(data: ArrayBuffer, asset: AssetInfo): boolean {
    const actualSizeBytes = data.byteLength;
    const expectedSizeBytes = asset.estimatedSizeMB * 1024 * 1024;

    // Allow some tolerance (50% - 200% of expected size)
    const minSize = expectedSizeBytes * 0.5;
    const maxSize = expectedSizeBytes * 2.0;

    const isValid = actualSizeBytes >= minSize && actualSizeBytes <= maxSize;

    if (!isValid) {
        console.warn(`[AssetValidator] Size validation failed for ${asset.path}: expected ~${expectedSizeBytes} bytes, got ${actualSizeBytes} bytes`);
    }

    return isValid;
}

/**
 * Validate asset type based on file extension and content
 */
function validateAssetType(data: ArrayBuffer, asset: AssetInfo): boolean {
    // For GLB files, check for glTF magic number
    if (asset.type === 'model' && asset.path.endsWith('.glb')) {
        return validateGLBFormat(data);
    }

    // For HDR files, check for Radiance RGBE format
    if (asset.type === 'hdr') {
        return validateHDRFormat(data);
    }

    // For audio files, check for basic audio signatures
    if (asset.type === 'audio') {
        return validateAudioFormat(data, asset.path);
    }

    // For textures, basic size validation
    if (asset.type === 'texture') {
        return data.byteLength > 100; // Minimum reasonable texture size
    }

    // Default validation
    return data.byteLength > 0;
}

/**
 * Validate GLB (glTF Binary) format
 */
function validateGLBFormat(data: ArrayBuffer): boolean {
    if (data.byteLength < 12) return false;

    const view = new DataView(data);
    const magic = view.getUint32(0, true);

    // GLB magic number is 'glTF'
    return magic === 0x46546C67; // 'glTF' in little-endian
}

/**
 * Validate HDR (Radiance RGBE) format
 */
function validateHDRFormat(data: ArrayBuffer): boolean {
    if (data.byteLength < 20) return false;

    // Check for "#?RADIANCE" header
    const header = new TextDecoder().decode(data.slice(0, 20));
    return header.includes('#?RADIANCE') || header.includes('#?RGBE');
}

/**
 * Validate audio format based on file extension and basic checks
 */
function validateAudioFormat(data: ArrayBuffer, path: string): boolean {
    if (data.byteLength < 44) return false; // Minimum WAV header size

    const extension = path.split('.').pop()?.toLowerCase();

    if (extension === 'mp3') {
        // Check for MP3 frame sync
        const view = new Uint8Array(data);
        // Look for 11-bit frame sync pattern (1111 1111 111)
        for (let i = 0; i < Math.min(100, data.byteLength - 1); i++) {
            if ((view[i] === 0xFF) && ((view[i + 1] & 0xE0) === 0xE0)) {
                return true;
            }
        }
        return false;
    }

    // For other formats, just check minimum size
    return data.byteLength > 1000;
}

/**
 * Generate a health report for the asset cache
 */
export async function generateAssetHealthReport(): Promise<AssetHealthReport> {
    const validation = await validateAllAssets();

    const criticalAssets = getAssetsByPriority('critical');
    const criticalLoaded = criticalAssets.length - validation.summary.criticalMissing;

    const totalAssets = validation.totalChecked;
    const validAssets = validation.validAssets.length;
    const healthPercentage = (validAssets / totalAssets) * 100;

    // Determine overall health
    let overallHealth: AssetHealthReport['overallHealth'];
    if (healthPercentage >= 95) overallHealth = 'excellent';
    else if (healthPercentage >= 85) overallHealth = 'good';
    else if (healthPercentage >= 70) overallHealth = 'fair';
    else if (healthPercentage >= 50) overallHealth = 'poor';
    else overallHealth = 'critical';

    // Determine gameplay impact
    let estimatedGameplayImpact: AssetHealthReport['estimatedGameplayImpact'];
    if (validation.summary.criticalMissing > 0) {
        estimatedGameplayImpact = 'unplayable';
    } else if (validation.summary.highMissing > 2) {
        estimatedGameplayImpact = 'severe';
    } else if (validation.summary.highMissing > 0 || validation.summary.mediumMissing > 5) {
        estimatedGameplayImpact = 'moderate';
    } else if (validation.summary.mediumMissing > 0 || validation.summary.lowMissing > 10) {
        estimatedGameplayImpact = 'minor';
    } else {
        estimatedGameplayImpact = 'none';
    }

    // Generate recommendations
    const recommendations: string[] = [];

    if (validation.summary.criticalMissing > 0) {
        recommendations.push('Critical assets are missing - game may not function properly');
    }

    if (validation.summary.highMissing > 0) {
        recommendations.push('High-priority assets missing - core gameplay may be affected');
    }

    if (validation.missingAssets.length > 0) {
        recommendations.push(`Consider re-running initial preload to fetch ${validation.missingAssets.length} missing assets`);
    }

    if (validation.corruptedAssets.length > 0) {
        recommendations.push(`Found ${validation.corruptedAssets.length} corrupted assets - clear cache and reload`);
    }

    if (healthPercentage < 90) {
        recommendations.push('Asset cache health is below optimal - consider optimizing loading strategy');
    }

    return {
        overallHealth,
        healthPercentage: Math.round(healthPercentage * 100) / 100,
        criticalAssetsLoaded: criticalLoaded,
        totalCriticalAssets: criticalAssets.length,
        estimatedGameplayImpact,
        recommendations
    };
}

/**
 * Check if the game can start with current asset state
 */
export async function canGameStart(): Promise<{ canStart: boolean; reason?: string; report?: AssetHealthReport }> {
    const report = await generateAssetHealthReport();

    if (report.estimatedGameplayImpact === 'unplayable') {
        return {
            canStart: false,
            reason: 'Critical assets are missing - game cannot start',
            report
        };
    }

    if (report.criticalAssetsLoaded < report.totalCriticalAssets) {
        return {
            canStart: false,
            reason: `${report.totalCriticalAssets - report.criticalAssetsLoaded} critical assets missing`,
            report
        };
    }

    // Allow game to start even with some missing non-critical assets
    return {
        canStart: true,
        report
    };
}

/**
 * Get assets that should be reloaded (missing or corrupted)
 */
export async function getAssetsNeedingReload(): Promise<string[]> {
    const validation = await validateAllAssets();
    return [...validation.missingAssets, ...validation.corruptedAssets];
}

/**
 * Utility function to clear corrupted assets from cache
 */
export async function clearCorruptedAssets(): Promise<number> {
    const validation = await validateAllAssets();
    let cleared = 0;

    // Note: This would need access to deleteAsset function from indexedDB
    // For now, just return the count
    console.log(`[AssetValidator] Found ${validation.corruptedAssets.length} corrupted assets to clear`);

    return validation.corruptedAssets.length;
}
