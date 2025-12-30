#!/usr/bin/env node

/**
 * Asset Measurement Script
 * Measures actual file sizes and generates SHA-256 checksums for all game assets
 * Updates the manifest with real data instead of estimates
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Configuration
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const MANIFEST_PATH = path.join(__dirname, '..', 'src', 'lib', 'gameAssetManifest.ts');
const OUTPUT_PATH = path.join(__dirname, 'measured-assets.json');

// Colors for console output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    red: '\x1b[31m',
};

/**
 * Calculate SHA-256 hash for a file
 */
function calculateSHA256(filePath) {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        const stream = fs.createReadStream(filePath);

        stream.on('data', (data) => hash.update(data));
        stream.on('end', () => resolve(hash.digest('hex')));
        stream.on('error', reject);
    });
}

/**
 * Get file size in MB
 */
function getFileSizeMB(filePath) {
    const stats = fs.statSync(filePath);
    return stats.size / (1024 * 1024);
}

/**
 * Get file last modified date
 */
function getLastModified(filePath) {
    const stats = fs.statSync(filePath);
    return stats.mtime.toISOString();
}

/**
 * Check if file exists
 */
function fileExists(filePath) {
    return fs.existsSync(filePath);
}

/**
 * Measure a single asset
 */
async function measureAsset(assetPath) {
    const fullPath = path.join(PUBLIC_DIR, assetPath);

    if (!fileExists(fullPath)) {
        return {
            exists: false,
            error: 'File not found'
        };
    }

    try {
        const [sha256, sizeMB, lastModified] = await Promise.all([
            calculateSHA256(fullPath),
            Promise.resolve(getFileSizeMB(fullPath)),
            Promise.resolve(getLastModified(fullPath))
        ]);

        return {
            exists: true,
            sha256,
            actualSizeMB: Math.round(sizeMB * 1000) / 1000, // 3 decimal places
            lastModified
        };
    } catch (error) {
        return {
            exists: false,
            error: error.message
        };
    }
}

/**
 * Parse the current manifest file
 */
function parseManifest() {
    const manifestContent = fs.readFileSync(MANIFEST_PATH, 'utf8');

    // Extract assets array using regex
    const assetsMatch = manifestContent.match(/export const GAME_ASSET_MANIFEST: AssetInfo\[\] = \[([\s\S]*?)\];/);

    if (!assetsMatch) {
        throw new Error('Could not parse manifest file');
    }

    // Simple parsing of asset objects
    const assets = [];
    const assetRegex = /\{[\s\S]*?path:\s*['"]([^'"]+)['"][\s\S]*?type:\s*['"](\w+)['"][\s\S]*?priority:\s*['"](\w+)['"][\s\S]*?estimatedSizeMB:\s*([\d.]+)[\s\S]*?description:\s*['"]([^'"]+)['"][\s\S]*?\}/g;

    let match;
    while ((match = assetRegex.exec(assetsMatch[1])) !== null) {
        assets.push({
            path: match[1],
            type: match[2],
            priority: match[3],
            estimatedSizeMB: parseFloat(match[4]),
            description: match[5]
        });
    }

    return assets;
}

/**
 * Main measurement function
 */
async function measureAllAssets() {
    console.log(`${colors.bright}${colors.blue}
╔═══════════════════════════════════════════════════════════╗
║           Asset Measurement & Verification Tool           ║
╚═══════════════════════════════════════════════════════════╝
${colors.reset}`);

    console.log(`${colors.yellow}📂 Public directory: ${PUBLIC_DIR}${colors.reset}\n`);

    // Parse manifest
    console.log(`${colors.blue}📋 Parsing manifest...${colors.reset}`);
    const manifestAssets = parseManifest();
    console.log(`${colors.green}✓ Found ${manifestAssets.length} assets in manifest${colors.reset}\n`);

    // Measure each asset
    const results = [];
    let totalEstimated = 0;
    let totalActual = 0;
    let foundCount = 0;
    let missingCount = 0;

    console.log(`${colors.blue}🔍 Measuring assets...${colors.reset}\n`);

    for (let i = 0; i < manifestAssets.length; i++) {
        const asset = manifestAssets[i];
        const progress = `[${i + 1}/${manifestAssets.length}]`;

        process.stdout.write(`${progress} ${asset.path}... `);

        const measurement = await measureAsset(asset.path);

        if (measurement.exists) {
            const sizeDiff = measurement.actualSizeMB - asset.estimatedSizeMB;
            const percentDiff = ((sizeDiff / asset.estimatedSizeMB) * 100).toFixed(1);

            results.push({
                ...asset,
                ...measurement,
                sizeDifference: Math.round(sizeDiff * 1000) / 1000,
                percentDifference: parseFloat(percentDiff)
            });

            totalEstimated += asset.estimatedSizeMB;
            totalActual += measurement.actualSizeMB;
            foundCount++;

            const color = Math.abs(percentDiff) > 20 ? colors.yellow : colors.green;
            console.log(`${color}✓ ${measurement.actualSizeMB.toFixed(3)}MB (${percentDiff > 0 ? '+' : ''}${percentDiff}%)${colors.reset}`);
        } else {
            results.push({
                ...asset,
                exists: false,
                error: measurement.error
            });
            missingCount++;
            console.log(`${colors.red}✗ Missing${colors.reset}`);
        }
    }

    // Summary
    console.log(`\n${colors.bright}${colors.blue}
╔═══════════════════════════════════════════════════════════╗
║                       Summary Report                       ║
╚═══════════════════════════════════════════════════════════╝
${colors.reset}`);

    const accuracy = totalEstimated > 0 ? ((1 - Math.abs(totalActual - totalEstimated) / totalEstimated) * 100).toFixed(2) : 0;

    console.log(`
${colors.green}Found:${colors.reset}     ${foundCount}/${manifestAssets.length} files
${colors.red}Missing:${colors.reset}   ${missingCount}/${manifestAssets.length} files

${colors.blue}Estimated Total:${colors.reset} ${totalEstimated.toFixed(2)} MB
${colors.green}Actual Total:${colors.reset}    ${totalActual.toFixed(2)} MB
${colors.yellow}Difference:${colors.reset}      ${(totalActual - totalEstimated).toFixed(2)} MB (${((totalActual - totalEstimated) / totalEstimated * 100).toFixed(2)}%)
${colors.bright}Accuracy:${colors.reset}        ${accuracy}%
  `);

    // Largest discrepancies
    const discrepancies = results
        .filter(r => r.exists && Math.abs(r.percentDifference) > 10)
        .sort((a, b) => Math.abs(b.percentDifference) - Math.abs(a.percentDifference))
        .slice(0, 5);

    if (discrepancies.length > 0) {
        console.log(`${colors.yellow}⚠️  Largest Size Discrepancies:${colors.reset}\n`);
        discrepancies.forEach((asset, i) => {
            console.log(`${i + 1}. ${asset.path}`);
            console.log(`   Estimated: ${asset.estimatedSizeMB}MB → Actual: ${asset.actualSizeMB}MB (${asset.percentDifference > 0 ? '+' : ''}${asset.percentDifference}%)\n`);
        });
    }

    // Save results
    const outputData = {
        measuredAt: new Date().toISOString(),
        summary: {
            totalAssets: manifestAssets.length,
            foundAssets: foundCount,
            missingAssets: missingCount,
            totalEstimatedSizeMB: Math.round(totalEstimated * 1000) / 1000,
            totalActualSizeMB: Math.round(totalActual * 1000) / 1000,
            accuracy: parseFloat(accuracy)
        },
        assets: results
    };

    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(outputData, null, 2));
    console.log(`${colors.green}✓ Results saved to: ${OUTPUT_PATH}${colors.reset}\n`);

    // Generate updated manifest code
    if (foundCount > 0) {
        console.log(`${colors.blue}💡 To update your manifest with actual data, run:${colors.reset}`);
        console.log(`${colors.bright}   node scripts/updateManifest.js${colors.reset}\n`);
    }

    return outputData;
}

// Run the script
if (require.main === module) {
    measureAllAssets()
        .then(() => {
            console.log(`${colors.green}✓ Measurement complete!${colors.reset}\n`);
            process.exit(0);
        })
        .catch((error) => {
            console.error(`${colors.red}✗ Error: ${error.message}${colors.reset}\n`);
            console.error(error.stack);
            process.exit(1);
        });
}

module.exports = { measureAllAssets, measureAsset };
