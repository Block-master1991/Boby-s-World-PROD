// Asset Integrity Verification System
import { logger } from 'utils/logger';
// Ensures files are not corrupted and match expected checksums

export interface IntegrityCheck {
    path: string;
    expectedSHA256?: string;
    expectedSize?: number;
    actualSHA256?: string;
    actualSize?: number;
    isValid: boolean;
    lastChecked: number;
    error?: string;
}

export interface IntegrityReport {
    totalChecked: number;
    passed: number;
    failed: number;
    checks: IntegrityCheck[];
    timestamp: number;
}

/**
 * Calculate SHA-256 hash for ArrayBuffer
 */
export async function calculateSHA256(data: ArrayBuffer): Promise<string> {
    try {
        // Use Web Crypto API
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        return hashHex;
    } catch (error) {
        logger.error('[AssetIntegrity] Failed to calculate SHA-256:', error);
        throw error;
    }
}

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
        expectedSHA256,
        expectedSize,
        actualSize: data.byteLength,
        isValid: true,
        lastChecked: Date.now()
    };

    try {
        // Check size first (faster)
        if (expectedSize && data.byteLength !== expectedSize) {
            const sizeDiffMB = Math.abs(data.byteLength - expectedSize) / (1024 * 1024);

            // Allow small variance (< 1KB) for compression differences
            if (sizeDiffMB > 0.001) {
                check.isValid = false;
                check.error = `Size mismatch: expected ${expectedSize} bytes, got ${data.byteLength} bytes (diff: ${sizeDiffMB.toFixed(3)}MB)`;
                logger.warn(`[AssetIntegrity] ${check.error}`, path);
            }
        }

        // Calculate and verify SHA-256 if expected hash is provided
        if (expectedSHA256 && check.isValid) {
            check.actualSHA256 = await calculateSHA256(data);

            if (check.actualSHA256 !== expectedSHA256) {
                check.isValid = false;
                check.error = `SHA-256 mismatch: expected ${expectedSHA256.substring(0, 16)}..., got ${check.actualSHA256.substring(0, 16)}...`;
                logger.error(`[AssetIntegrity] ${check.error}`, path);
            }
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
    const checks: IntegrityCheck[] = [];

    for (const asset of assets) {
        const check = await verifyAssetIntegrity(
            asset.path,
            asset.data,
            asset.expectedSHA256,
            asset.expectedSize
        );
        checks.push(check);
    }

    const passed = checks.filter(c => c.isValid).length;
    const failed = checks.filter(c => !c.isValid).length;

    const report: IntegrityReport = {
        totalChecked: assets.length,
        passed,
        failed,
        checks,
        timestamp: Date.now()
    };

    const duration = (Date.now() - startTime) / 1000;
    logger.log(`[AssetIntegrity] Verification complete in ${duration.toFixed(2)}s: ${passed} passed, ${failed} failed`);

    if (failed > 0) {
        logger.warn(`[AssetIntegrity] ⚠️ ${failed} assets failed integrity check`);
        checks.filter(c => !c.isValid).forEach(check => {
            logger.warn(`  - ${check.path}: ${check.error}`);
        });
    }

    return report;
}

/**
 * Quick size-only verification (faster, less secure)
 */
export function verifySizeOnly(
    path: string,
    data: ArrayBuffer,
    expectedSize: number,
    toleranceMB: number = 0.1
): IntegrityCheck {
    const actualSize = data.byteLength;
    const diffMB = Math.abs(actualSize - expectedSize) / (1024 * 1024);
    const isValid = diffMB <= toleranceMB;

    return {
        path,
        expectedSize,
        actualSize,
        isValid,
        lastChecked: Date.now(),
        error: !isValid ? `Size difference ${diffMB.toFixed(3)}MB exceeds tolerance ${toleranceMB}MB` : undefined
    };
}

/**
 * Store integrity check results in localStorage for performance
 */
export function cacheIntegrityCheck(check: IntegrityCheck): void {
    try {
        const cacheKey = `integrity_${check.path}`;
        const cacheData = {
            sha256: check.actualSHA256,
            size: check.actualSize,
            valid: check.isValid,
            timestamp: check.lastChecked
        };
        localStorage.setItem(cacheKey, JSON.stringify(cacheData));
    } catch (error) {
        logger.warn('[AssetIntegrity] Failed to cache integrity check:', error);
    }
}

/**
 * Retrieve cached integrity check
 */
export function getCachedIntegrityCheck(path: string, maxAgeMs: number = 24 * 60 * 60 * 1000): IntegrityCheck | null {
    try {
        const cacheKey = `integrity_${path}`;
        const cached = localStorage.getItem(cacheKey);

        if (!cached) return null;

        const data = JSON.parse(cached);
        const age = Date.now() - data.timestamp;

        if (age > maxAgeMs) {
            // Cache expired
            localStorage.removeItem(cacheKey);
            return null;
        }

        return {
            path,
            actualSHA256: data.sha256,
            actualSize: data.size,
            isValid: data.valid,
            lastChecked: data.timestamp
        };
    } catch (error) {
        logger.warn('[AssetIntegrity] Failed to retrieve cached check:', error);
        return null;
    }
}

/**
 * Clear all cached integrity checks
 */
export function clearIntegrityCache(): void {
    try {
        const keys = Object.keys(localStorage);
        keys.forEach(key => {
            if (key.startsWith('integrity_')) {
                localStorage.removeItem(key);
            }
        });
        logger.log('[AssetIntegrity] Cache cleared');
    } catch (error) {
        logger.warn('[AssetIntegrity] Failed to clear cache:', error);
    }
}

/**
 * Get integrity statistics
 */
export function getIntegrityStats(): {
    cachedChecks: number;
    oldestCheck: number | null;
    newestCheck: number | null;
} {
    try {
        const keys = Object.keys(localStorage).filter(k => k.startsWith('integrity_'));
        const timestamps: number[] = [];

        keys.forEach(key => {
            try {
                const data = JSON.parse(localStorage.getItem(key) || '{}');
                if (data.timestamp) timestamps.push(data.timestamp);
            } catch {
                // Skip invalid entries
            }
        });

        return {
            cachedChecks: keys.length,
            oldestCheck: timestamps.length > 0 ? Math.min(...timestamps) : null,
            newestCheck: timestamps.length > 0 ? Math.max(...timestamps) : null
        };
    } catch (error) {
        logger.warn('[AssetIntegrity] Failed to get stats:', error);
        return {
            cachedChecks: 0,
            oldestCheck: null,
            newestCheck: null
        };
    }
}

/**
 * Format integrity report for display
 */
export function formatIntegrityReport(report: IntegrityReport): string {
    const passRate = report.totalChecked > 0
        ? ((report.passed / report.totalChecked) * 100).toFixed(1)
        : '0.0';

    let output = `
=== Asset Integrity Report ===
Timestamp: ${new Date(report.timestamp).toLocaleString()}
Total Checked: ${report.totalChecked}
Passed: ${report.passed} (${passRate}%)
Failed: ${report.failed}
`;

    if (report.failed > 0) {
        output += '\n--- Failed Assets ---\n';
        report.checks
            .filter(c => !c.isValid)
            .forEach(check => {
                output += `- ${check.path}: ${check.error}\n`;
            });
    }

    return output;
}
