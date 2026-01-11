/**
 * Update Manifest Utility - TypeScript Version
 * Syncs the GAME_ASSET_MANIFEST in gameAssetManifest.ts with measured data from measured-assets.json.
 * Integrates with the professional logging system.
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { professionalLogger } from '../src/lib/logging';

const MEASURED_DATA_PATH = path.join(process.cwd(), 'scripts', 'measured-assets.json');
const MANIFEST_PATH = path.join(process.cwd(), 'src', 'lib', 'gameAssetManifest.ts');
const BACKUP_PATH = path.join(process.cwd(), 'src', 'lib', 'gameAssetManifest.ts.backup');

/**
 * Format asset object for TypeScript file generation
 */
function formatAsset(asset: any, indent = '    ') {
    const lines = [
        `{`,
        `        path: '${asset.path}',`,
        `        type: '${asset.type}',`,
        `        priority: '${asset.priority}',`,
        `        estimatedSizeMB: ${asset.estimatedSizeMB},`,
        `        description: '${asset.description}'`,
    ];

    // Add enhanced fields if they exist
    if (asset.version) {
        lines.splice(5, 0, `        version: '${asset.version}',`);
    }
    if (asset.sha256) {
        lines.splice(5, 0, `        sha256: '${asset.sha256}',`);
    }
    if (asset.actualSizeMB !== undefined) {
        lines.splice(5, 0, `        actualSizeMB: ${asset.actualSizeMB},`);
    }
    if (asset.lastModified) {
        lines.splice(5, 0, `        lastModified: '${asset.lastModified}',`);
    }

    lines.push(`    }`);
    return lines.map(line => indent + line).join('\n');
}

/**
 * Generate the final TypeScript content
 */
function generateManifestContent(measuredData: any) {
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

    const priorityGroups: Record<string, any[]> = { critical: [], high: [], medium: [], low: [] };

    measuredData.assets.forEach((asset: any) => {
        if (asset.exists) {
            priorityGroups[asset.priority].push({
                ...asset,
                version: asset.version || 'v1.0.0'
            });
        }
    });

    let assetsContent = '';

    if (priorityGroups.critical.length > 0) {
        assetsContent += '\n    // === CRITICAL ASSETS ===\n';
        assetsContent += priorityGroups.critical.map(a => formatAsset(a)).join(',\n');
    }
    if (priorityGroups.high.length > 0) {
        assetsContent += ',\n\n    // === HIGH PRIORITY ASSETS ===\n';
        assetsContent += priorityGroups.high.map(a => formatAsset(a)).join(',\n');
    }
    if (priorityGroups.medium.length > 0) {
        assetsContent += ',\n\n    // === MEDIUM PRIORITY ASSETS ===\n';
        assetsContent += priorityGroups.medium.map(a => formatAsset(a)).join(',\n');
    }
    if (priorityGroups.low.length > 0) {
        assetsContent += ',\n\n    // === LOW PRIORITY ASSETS ===\n';
        assetsContent += priorityGroups.low.map(a => formatAsset(a)).join(',\n');
    }

    return header + assetsContent + '\n' + footer;
}

async function updateManifest() {
    const correlationId = `manifest-update-${Date.now()}`;
    professionalLogger.info('🔨 Starting Manifest Update Process', { correlationId });

    try {
        if (!fs.existsSync(MEASURED_DATA_PATH)) {
            throw new Error(`Measured data not found at ${MEASURED_DATA_PATH}. Run measureAssets first.`);
        }

        const measuredData = JSON.parse(fs.readFileSync(MEASURED_DATA_PATH, 'utf8'));
        
        // Backup
        fs.copyFileSync(MANIFEST_PATH, BACKUP_PATH);
        professionalLogger.debug('💾 Backup created for gameAssetManifest.ts', { correlationId });

        const newContent = generateManifestContent(measuredData);
        fs.writeFileSync(MANIFEST_PATH, newContent, 'utf8');

        professionalLogger.info('✨ Manifest synchronization completed!', { 
            correlationId,
            accuracy: measuredData.summary.accuracy + '%',
            found: measuredData.summary.foundAssets
        });

        process.exit(0);
    } catch (error: any) {
        professionalLogger.fatal('Manifest Update failed', { 
            correlationId, 
            error: error.message 
        });
        process.exit(1);
    }
}

updateManifest();
