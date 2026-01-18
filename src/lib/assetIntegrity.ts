// Asset Integrity Verification System
import { logger } from 'utils/logger';
import type { IntegrityCheck, IntegrityReport } from './asset/types';
import { batchPromises, calculateSHA256 } from './asset/utils';

export type { IntegrityCheck, IntegrityReport };

/**
 * Verify a single asset's integrity
 */
export async function verifyAssetIntegrity(
    path: string,
    data: ArrayBuffer,
    expectedSHA256?: string,
    expectedSize?: number
): Promise<IntegrityCheck> {
    const check: IntegrityCheck = {
        path,
        expectedSHA256: expectedSHA256 || undefined,
        expectedSize: expectedSize || undefined,
        actualSHA256: undefined,
        actualSize: data.byteLength,
        isValid: true,
        lastChecked: Date.now(),
        error: undefined
    };

    try {
        validateSize(check, data.byteLength);
        if (check.isValid && expectedSHA256) {
            await validateHash(check, data, expectedSHA256);
        }
        if (check.isValid) {
            logger.log(`[AssetIntegrity] ✓ Verified: ${path} (${(data.byteLength / (1024 * 1024)).toFixed(2)}MB)`);
        }
    } catch (error) {
        check.isValid = false;
        check.error = error instanceof Error ? error.message : 'Unknown verification error';
        logger.error(`[AssetIntegrity] Verification failed for ${path}:`, error);
    }

    return check;
}

function validateSize(check: IntegrityCheck, actualSize: number): void {
    if (!check.expectedSize) return;
    const diffMB = Math.abs(actualSize - check.expectedSize) / (1024 * 1024);
    if (diffMB > 0.001) {
        check.isValid = false;
        check.error = `Size mismatch: expected ${check.expectedSize} bytes, got ${actualSize} bytes (diff: ${diffMB.toFixed(3)}MB)`;
        logger.warn(`[AssetIntegrity] ${check.error}`, check.path);
    }
}

async function validateHash(check: IntegrityCheck, data: ArrayBuffer, expected: string): Promise<void> {
    check.actualSHA256 = await calculateSHA256(data);
    if (check.actualSHA256 !== expected) {
        check.isValid = false;
        check.error = `SHA-256 mismatch: expected ${expected.substring(0, 16)}..., got ${check.actualSHA256.substring(0, 16)}...`;
        logger.error(`[AssetIntegrity] ${check.error}`, check.path);
    }
}

/**
 * Verify multiple assets and generate a report
 */
export async function verifyMultipleAssets(
    assets: Array<{
        path: string;
        data: ArrayBuffer;
        expectedSHA256?: string;
        expectedSize?: number;
    }>
): Promise<IntegrityReport> {
    logger.log(`[AssetIntegrity] Starting verification of ${assets.length} assets...`);
    const startTime = Date.now();

    // Use batch processing to avoid overloading the system while avoiding no-await-in-loop
    const checks = await batchPromises(assets, (asset) => 
        verifyAssetIntegrity(asset.path, asset.data, asset.expectedSHA256, asset.expectedSize)
    );

    const report: IntegrityReport = {
        totalChecked: assets.length,
        passed: checks.filter(c => c.isValid).length,
        failed: checks.filter(c => !c.isValid).length,
        checks,
        timestamp: Date.now()
    };

    const duration = (Date.now() - startTime) / 1000;
    logger.log(`[AssetIntegrity] Verification complete in ${duration.toFixed(2)}s: ${report.passed} passed, ${report.failed} failed`);

    if (report.failed > 0) {
        logger.warn(`[AssetIntegrity] ⚠️ ${report.failed} assets failed integrity check`);
        checks.filter(c => !c.isValid).forEach(check => {
            logger.warn(`  - ${check.path}: ${check.error}`);
        });
    }

    return report;
}

/**
 * Quick size-only verification
 */
export function verifySizeOnly(path: string, data: ArrayBuffer, expectedSize: number, toleranceMB: number = 0.1): IntegrityCheck {
    const actualSize = data.byteLength;
    const diffMB = Math.abs(actualSize - expectedSize) / (1024 * 1024);
    const isValid = diffMB <= toleranceMB;

    return {
        path,
        expectedSHA256: undefined,
        expectedSize,
        actualSHA256: undefined,
        actualSize,
        isValid,
        lastChecked: Date.now(),
        error: !isValid ? `Size difference ${diffMB.toFixed(3)}MB exceeds tolerance ${toleranceMB}MB` : undefined
    };
}

/**
 * Cache and Retrieve logic
 */
export function cacheIntegrityCheck(check: IntegrityCheck): void {
    if (typeof window === 'undefined') return;
    try {
        const cacheKey = `integrity_${check.path}`;
        const cacheData = { sha256: check.actualSHA256, size: check.actualSize, valid: check.isValid, timestamp: check.lastChecked };
        localStorage.setItem(cacheKey, JSON.stringify(cacheData));
    } catch (e) {
        logger.warn('[AssetIntegrity] Failed to cache check:', e);
    }
}

export function getCachedIntegrityCheck(path: string, maxAgeMs: number = 24 * 60 * 60 * 1000): IntegrityCheck | null {
    if (typeof window === 'undefined') return null;
    try {
        const cached = localStorage.getItem(`integrity_${path}`);
        if (!cached) return null;
        const data = JSON.parse(cached);
        if (Date.now() - data.timestamp > maxAgeMs) return null;

        return {
            path, expectedSHA256: undefined, expectedSize: undefined,
            actualSHA256: data.sha256, actualSize: data.size,
            isValid: data.valid, lastChecked: data.timestamp, error: undefined
        };
    } catch (e) {
        logger.warn('[AssetIntegrity] Cache Retrieve Error:', e);
        return null;
    }
}

export function clearIntegrityCache(): void {
    if (typeof window === 'undefined') return;
    Object.keys(localStorage).forEach(k => { if (k.startsWith('integrity_')) localStorage.removeItem(k); });
    logger.log('[AssetIntegrity] Cache cleared');
}

export function getIntegrityStats() {
    if (typeof window === 'undefined') return { cachedChecks: 0, oldestCheck: null, newestCheck: null };
    const keys = Object.keys(localStorage).filter(k => k.startsWith('integrity_'));
    const times = keys.map(k => JSON.parse(localStorage.getItem(k) || '{}').timestamp).filter(Boolean);
    return {
        cachedChecks: keys.length,
        oldestCheck: times.length > 0 ? Math.min(...times) : null,
        newestCheck: times.length > 0 ? Math.max(...times) : null
    };
}
