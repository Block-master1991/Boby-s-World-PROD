#!/usr/bin/env node

/**
 * Update Manifest Script
 * Updates gameAssetManifest.ts with measured actual data
 */

const fs = require('fs');
const path = require('path');

const MEASURED_DATA_PATH = path.join(__dirname, 'measured-assets.json');
const MANIFEST_PATH = path.join(__dirname, '..', 'src', 'lib', 'gameAssetManifest.ts');
const BACKUP_PATH = path.join(__dirname, '..', 'src', 'lib', 'gameAssetManifest.ts.backup');

const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    red: '\x1b[31m',
};

/**
 * Format asset object for TypeScript
 */
function formatAsset(asset, indent = '    ') {
    const lines = [
        `{`,
        `    path: '${asset.path}',`,
        `    type: '${asset.type}',`,
        `    priority: '${asset.priority}',`,
        `    estimatedSizeMB: ${asset.estimatedSizeMB},`,
        `    description: '${asset.description}'`,
    ];

    // Add new fields if they exist
    if (asset.version) {
        lines.splice(5, 0, `    version: '${asset.version}',`);
    }
    if (asset.sha256) {
        lines.splice(5, 0, `    sha256: '${asset.sha256}',`);
    }
    if (asset.actualSizeMB !== undefined) {
        lines.splice(5, 0, `    actualSizeMB: ${asset.actualSizeMB},`);
    }
    if (asset.lastModified) {
        lines.splice(5, 0, `    lastModified: '${asset.lastModified}',`);
    }

    lines.push(`}`);
    return lines.map(line => indent + line).join('\n');
}

/**
 * Generate updated manifest content
 */
function generateManifestContent(measuredData) {
    const header = `// Game Asset Manifest - Comprehensive list of all game resources
// Used for initial preload into IndexedDB to enable offline gameplay
// 🔄 Auto-updated with actual measurements on ${new Date(measuredData.measuredAt).toLocaleString()}

export interface AssetInfo {
    path: string;
    type: 'model' | 'texture' | 'audio' | 'hdr';
    priority: 'critical' | 'high' | 'medium' | 'low';
    estimatedSizeMB: number;
    description: string;
    // ✨ Enhanced fields
    version?: string;
    sha256?: string;
    actualSizeMB?: number;
    lastModified?: string;
    compressionType?: 'none' | 'gzip' | 'brotli';
}

export const GAME_ASSET_MANIFEST: AssetInfo[] = [`;

    const footer = `
];

// Helper functions
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

// Statistics
export const MANIFEST_STATS = {
    totalAssets: GAME_ASSET_MANIFEST.length,
    totalEstimatedSizeMB: getTotalEstimatedSize(),
    totalActualSizeMB: getTotalActualSize(),
    measuredAt: '${measuredData.measuredAt}',
    accuracy: ${measuredData.summary.accuracy.toFixed(2)},
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
`;

    // Group assets by priority with comments
    const priorityGroups = {
        critical: [],
        high: [],
        medium: [],
        low: []
    };

    measuredData.assets.forEach(asset => {
        if (asset.exists) {
            // Add version if not present
            const enhancedAsset = {
                ...asset,
                version: asset.version || 'v1.0.0',
                compressionType: 'none'
            };
            priorityGroups[asset.priority].push(enhancedAsset);
        }
    });

    let assetsContent = '';

    // Critical assets
    if (priorityGroups.critical.length > 0) {
        assetsContent += '\n    // === CRITICAL ASSETS - Game cannot function without these ===\n';
        assetsContent += priorityGroups.critical.map(asset => formatAsset(asset)).join(',\n');
    }

    // High priority
    if (priorityGroups.high.length > 0) {
        assetsContent += ',\n\n    // === HIGH PRIORITY ASSETS - Essential gameplay ===\n';
        assetsContent += priorityGroups.high.map(asset => formatAsset(asset)).join(',\n');
    }

    // Medium priority
    if (priorityGroups.medium.length > 0) {
        assetsContent += ',\n\n    // === MEDIUM PRIORITY ASSETS - Enhanced gameplay ===\n';
        assetsContent += priorityGroups.medium.map(asset => formatAsset(asset)).join(',\n');
    }

    // Low priority
    if (priorityGroups.low.length > 0) {
        assetsContent += ',\n\n    // === LOW PRIORITY ASSETS - Background enhancements ===\n';
        assetsContent += priorityGroups.low.map(asset => formatAsset(asset)).join(',\n');
    }

    return header + assetsContent + '\n' + footer;
}

/**
 * Main update function
 */
async function updateManifest() {
    console.log(`${colors.bright}${colors.blue}
╔═══════════════════════════════════════════════════════════╗
║              Manifest Update Tool                          ║
╚═══════════════════════════════════════════════════════════╝
${colors.reset}\n`);

    // Check if measured data exists
    if (!fs.existsSync(MEASURED_DATA_PATH)) {
        console.error(`${colors.red}✗ Error: Measured data not found!${colors.reset}`);
        console.log(`${colors.yellow}→ Please run: node scripts/measureAssets.js${colors.reset}\n`);
        process.exit(1);
    }

    // Load measured data
    console.log(`${colors.blue}📊 Loading measured data...${colors.reset}`);
    const measuredData = JSON.parse(fs.readFileSync(MEASURED_DATA_PATH, 'utf8'));
    console.log(`${colors.green}✓ Loaded ${measuredData.assets.length} asset measurements${colors.reset}\n`);

    // Backup original manifest
    console.log(`${colors.blue}💾 Creating backup...${colors.reset}`);
    fs.copyFileSync(MANIFEST_PATH, BACKUP_PATH);
    console.log(`${colors.green}✓ Backup saved to: ${path.basename(BACKUP_PATH)}${colors.reset}\n`);

    // Generate new manifest
    console.log(`${colors.blue}🔨 Generating updated manifest...${colors.reset}`);
    const newContent = generateManifestContent(measuredData);

    // Write new manifest
    fs.writeFileSync(MANIFEST_PATH, newContent, 'utf8');
    console.log(`${colors.green}✓ Manifest updated successfully!${colors.reset}\n`);

    // Summary
    console.log(`${colors.bright}Summary:${colors.reset}`);
    console.log(`  Total assets: ${measuredData.summary.totalAssets}`);
    console.log(`  Found: ${colors.green}${measuredData.summary.foundAssets}${colors.reset}`);
    console.log(`  Missing: ${colors.red}${measuredData.summary.missingAssets}${colors.reset}`);
    console.log(`  Total size: ${measuredData.summary.totalActualSizeMB.toFixed(2)} MB`);
    console.log(`  Accuracy: ${colors.green}${measuredData.summary.accuracy.toFixed(2)}%${colors.reset}\n`);

    if (measuredData.summary.missingAssets > 0) {
        console.log(`${colors.yellow}⚠️  Warning: ${measuredData.summary.missingAssets} files are missing from public directory${colors.reset}\n`);
    }

    console.log(`${colors.green}✓ Update complete!${colors.reset}\n`);
}

// Run the script
if (require.main === module) {
    updateManifest()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error(`${colors.red}✗ Error: ${error.message}${colors.reset}\n`);
            console.error(error.stack);
            process.exit(1);
        });
}

module.exports = { updateManifest };
