/**
 * Asset Measurement & Verification Tool - TypeScript Version
 * Measures actual file sizes and generates SHA-256 checksums for game assets.
 * Syncs with GAME_ASSET_MANIFEST to ensure data integrity.
 */

import crypto from 'crypto';
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import type { AssetInfo } from '../src/lib/gameAssetManifest.js';
import { GAME_ASSET_MANIFEST } from '../src/lib/gameAssetManifest.js';
import { professionalLogger } from '../src/lib/logging/index.js';

// Configuration
const PUBLIC_DIR = path.join(process.cwd(), 'public');
const OUTPUT_PATH = path.join(process.cwd(), 'scripts', 'measured-assets.json');

interface MeasurementResult extends AssetInfo {
    exists: boolean;
    error?: string;
}

interface SummaryStats {
    total: number;
    found: number;
    missing: number;
    estimatedTotalMB: number;
    actualTotalMB: number;
}

/**
 * Calculate SHA-256 hash for a file
 */
function calculateSHA256(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        const stream = fs.createReadStream(filePath);
        stream.on('data', (data) => hash.update(data));
        stream.on('end', () => resolve(hash.digest('hex')));
        stream.on('error', reject);
    });
}

/**
 * Measure a single asset
 */
async function measureAsset(asset: AssetInfo): Promise<MeasurementResult> {
    const fullPath = path.join(PUBLIC_DIR, asset.path);

    if (!fs.existsSync(fullPath)) {
        return {
            ...asset,
            exists: false,
            error: `File not found at ${fullPath}`
        };
    }

    try {
        const stats = fs.statSync(fullPath);
        const sha256 = await calculateSHA256(fullPath);
        const actualSizeMB = stats.size / (1024 * 1024);

        return {
            ...asset,
            exists: true,
            sha256,
            actualSizeMB: Math.round(actualSizeMB * 1000) / 1000,
            lastModified: stats.mtime.toISOString()
        };
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return {
            ...asset,
            exists: false,
            error: errorMessage
        };
    }
}

function processMeasurement(measurement: MeasurementResult, summary: SummaryStats, correlationId: string) {
    if (measurement.exists) {
        summary.found++;
        summary.estimatedTotalMB += measurement.estimatedSizeMB;
        summary.actualTotalMB += (measurement.actualSizeMB || 0);
        
        const diff = (measurement.actualSizeMB || 0) - measurement.estimatedSizeMB;
        const percentDiff = (diff / measurement.estimatedSizeMB) * 100;
        
        if (Math.abs(percentDiff) > 20) {
            professionalLogger.warn(`Significant size discrepancy for ${measurement.path}`, {
                correlationId,
                estimated: measurement.estimatedSizeMB,
                actual: measurement.actualSizeMB,
                diffPercent: `${percentDiff.toFixed(2)}%`
            });
        }
    } else {
        summary.missing++;
        professionalLogger.error(`Missing asset detected: ${measurement.path}`, { 
            correlationId, 
            error: measurement.error 
        });
    }
}

function saveResults(results: MeasurementResult[], summary: SummaryStats, correlationId: string) {
    const accuracy = summary.estimatedTotalMB > 0 
        ? ((1 - Math.abs(summary.actualTotalMB - summary.estimatedTotalMB) / summary.estimatedTotalMB) * 100).toFixed(2)
        : '0';

    const outputData = {
        measuredAt: new Date().toISOString(),
        summary: {
            ...summary,
            accuracy: parseFloat(accuracy)
        },
        assets: results
    };

    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(outputData, null, 2));
    
    professionalLogger.info('--- Asset Measurement Completed ---', { 
        correlationId, 
        summary: outputData.summary,
        outputPath: OUTPUT_PATH
    });

    if (summary.found > 0) {
        console.log('\n\x1b[34m💡 To update your manifest with actual data, run:\x1b[0m');
        console.log('\x1b[1m   npm run script:update-manifest\x1b[0m\n');
    }
}

/**
 * Main measurement function
 */
async function measureAllAssets() {
    const correlationId = `asset-measure-${Date.now()}`;
    professionalLogger.info('--- Asset Measurement & Verification Started ---', { correlationId });

    const summary: SummaryStats = {
        total: GAME_ASSET_MANIFEST.length,
        found: 0,
        missing: 0,
        estimatedTotalMB: 0,
        actualTotalMB: 0
    };

    // Use Promise.all to avoid await-in-loop and speed up measurement
    const results = await Promise.all(GAME_ASSET_MANIFEST.map(asset => {
        professionalLogger.debug(`Measuring: ${asset.path}`, { correlationId });
        return measureAsset(asset);
    }));

    results.forEach(m => processMeasurement(m, summary, correlationId));

    saveResults(results, summary, correlationId);
    process.exit(0);
}

measureAllAssets().catch(err => {
    professionalLogger.fatal('Critical error in asset measurement tool', err);
    process.exit(1);
});
