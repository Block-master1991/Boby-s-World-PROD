/**
 * Asset Measurement & Verification Tool - TypeScript Version
 * Measures actual file sizes and generates SHA-256 checksums for game assets.
 * Syncs with GAME_ASSET_MANIFEST to ensure data integrity.
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { professionalLogger } from '../src/lib/logging';
import { GAME_ASSET_MANIFEST } from '../src/lib/gameAssetManifest';
import type { AssetInfo } from '../src/lib/gameAssetManifest';

// Configuration
const PUBLIC_DIR = path.join(process.cwd(), 'public');
const OUTPUT_PATH = path.join(process.cwd(), 'scripts', 'measured-assets.json');

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
async function measureAsset(asset: AssetInfo): Promise<any> {
    const fullPath = path.join(PUBLIC_DIR, asset.path);

    if (!fs.existsSync(fullPath)) {
        return {
            ...asset,
            exists: false,
            error: 'File not found at ' + fullPath
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
    } catch (error: any) {
        return {
            ...asset,
            exists: false,
            error: error.message
        };
    }
}

/**
 * Main measurement function
 */
async function measureAllAssets() {
    const correlationId = `asset-measure-${Date.now()}`;
    professionalLogger.info('--- Asset Measurement & Verification Started ---', { correlationId });

    const results: any[] = [];
    let stats = {
        total: GAME_ASSET_MANIFEST.length,
        found: 0,
        missing: 0,
        estimatedTotalMB: 0,
        actualTotalMB: 0
    };

    for (const asset of GAME_ASSET_MANIFEST) {
        professionalLogger.debug(`Measuring: ${asset.path}`, { correlationId });
        const measurement = await measureAsset(asset);
        
        if (measurement.exists) {
            stats.found++;
            stats.estimatedTotalMB += asset.estimatedSizeMB;
            stats.actualTotalMB += (measurement.actualSizeMB || 0);
            
            const diff = (measurement.actualSizeMB || 0) - asset.estimatedSizeMB;
            const percentDiff = (diff / asset.estimatedSizeMB) * 100;
            
            if (Math.abs(percentDiff) > 20) {
                professionalLogger.warn(`Significant size discrepancy for ${asset.path}`, {
                    correlationId,
                    estimated: asset.estimatedSizeMB,
                    actual: measurement.actualSizeMB,
                    diffPercent: percentDiff.toFixed(2) + '%'
                });
            }
        } else {
            stats.missing++;
            professionalLogger.error(`Missing asset detected: ${asset.path}`, { 
                correlationId, 
                error: measurement.error 
            });
        }
        results.push(measurement);
    }

    const accuracy = stats.estimatedTotalMB > 0 
        ? ((1 - Math.abs(stats.actualTotalMB - stats.estimatedTotalMB) / stats.estimatedTotalMB) * 100).toFixed(2)
        : '0';

    const outputData = {
        measuredAt: new Date().toISOString(),
        summary: {
            ...stats,
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

    if (stats.found > 0) {
        console.log('\n\x1b[34m💡 To update your manifest with actual data, run:\x1b[0m');
        console.log('\x1b[1m   npm run script:update-manifest\x1b[0m\n');
    }

    process.exit(0);
}

measureAllAssets().catch(err => {
    professionalLogger.fatal('Critical error in asset measurement tool', err);
    process.exit(1);
});
