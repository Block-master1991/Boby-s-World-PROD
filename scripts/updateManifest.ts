/**
 * Update Manifest Utility - TypeScript Version
 * Syncs the GAME_ASSET_MANIFEST in gameAssetManifest.ts with measured data from measured-assets.json.
 * Uses centralized Firebase initialization and professional logging.
 */

import 'dotenv/config';
import { constants as fsConstants } from 'fs';
import fs from 'fs/promises';
import path from 'path';
import { professionalLogger } from '../src/lib/logging';

const MEASURED_DATA_PATH = path.join(process.cwd(), 'scripts', 'measured-assets.json');
const MANIFEST_PATH = path.join(process.cwd(), 'src', 'lib', 'gameAssetManifest.ts');
const BACKUP_PATH = path.join(process.cwd(), 'src', 'lib', 'gameAssetManifest.ts.backup');

interface MeasuredAsset {
    path: string;
    type: string;
    priority: 'critical' | 'high' | 'medium' | 'low';
    estimatedSizeMB: number;
    description: string;
    exists: boolean;
    version?: string;
    sha256?: string;
    actualSizeMB?: number;
    lastModified?: string;
}

interface MeasuredData {
    measuredAt: string;
    summary: {
        accuracy: number;
        foundAssets: number;
    };
    assets: MeasuredAsset[];
}

/**
 * Format asset object for TypeScript file generation
 */
function formatAsset(asset: MeasuredAsset, indent = '    ') {
    const lines = [
        `{`,
        `        path: '${asset.path}',`,
        `        type: '${asset.type}',`,
        `        priority: '${asset.priority}',`,
        `        estimatedSizeMB: ${asset.estimatedSizeMB},`,
        `        description: '${asset.description}'`,
    ];

    if (asset.version) lines.splice(5, 0, `        version: '${asset.version}',`);
    if (asset.sha256) lines.splice(5, 0, `        sha256: '${asset.sha256}',`);
    if (asset.actualSizeMB !== undefined) lines.splice(5, 0, `        actualSizeMB: ${asset.actualSizeMB},`);
    if (asset.lastModified) lines.splice(5, 0, `        lastModified: '${asset.lastModified}',`);

    lines.push(`    }`);
    return lines.map(line => indent + line).join('\n');
}

function getManifestHeader(measuredAt: string): string {
    return `// Game Asset Manifest - Comprehensive list of all game resources
// Used for initial preload into IndexedDB to enable offline gameplay
// 🔄 Auto-updated with actual measurements on ${new Date(measuredAt).toLocaleString()}

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
}

function getManifestFooter(measuredData: MeasuredData): string {
    return `
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

${getStatsSection(measuredData)}
`;
}

function getStatsSection(measuredData: MeasuredData): string {
    return `// Statistics
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
};`;
}

/**
 * Generate the final TypeScript content
 */
function generateManifestContent(measuredData: MeasuredData): string {
    const header = getManifestHeader(measuredData.measuredAt);
    const assetsContent = buildAssetsContent(measuredData.assets);
    const footer = getManifestFooter(measuredData);
    
    return `${header + assetsContent  }\n${  footer}`;
}

function buildAssetsContent(assets: MeasuredAsset[]): string {
    const priorityGroups: Record<string, MeasuredAsset[]> = { critical: [], high: [], medium: [], low: [] };

    assets.forEach((asset) => {
        const group = priorityGroups[asset.priority];
        // Strict safe check: verify existence and group availability
        if (asset.exists && group) {
            group.push({
                ...asset,
                version: asset.version || 'v1.0.0'
            });
        }
    });

    let content = '';
    const priorities = ['critical', 'high', 'medium', 'low'] as const;

    priorities.forEach((priority, index) => {
        const group = priorityGroups[priority];
        if (group && group.length > 0) {
            const prefix = index > 0 ? ',\n\n' : '\n';
            content += `${prefix}    // === ${priority.toUpperCase()} ASSETS ===\n`;
            content += group.map(a => formatAsset(a)).join(',\n');
        }
    });

    return content;
}

async function updateManifest() {
    const correlationId = `manifest-update-${Date.now()}`;
    professionalLogger.info('🔨 Starting Manifest Update Process', { correlationId });

    try {
        try {
            await fs.access(MEASURED_DATA_PATH, fsConstants.F_OK);
        } catch {
            throw new Error(`Measured data not found at ${MEASURED_DATA_PATH}. Run measureAssets first.`);
        }

        const rawData = await fs.readFile(MEASURED_DATA_PATH, 'utf8');
        const measuredData = JSON.parse(rawData) as MeasuredData;
        
        // Backup
        try {
            await fs.access(MANIFEST_PATH, fsConstants.F_OK);
            await fs.copyFile(MANIFEST_PATH, BACKUP_PATH);
            professionalLogger.debug('💾 Backup created for gameAssetManifest.ts', { correlationId });
        } catch {
            // Manifest might not exist yet, skip backup
        }

        const newContent = generateManifestContent(measuredData);
        await fs.writeFile(MANIFEST_PATH, newContent, 'utf8');

        professionalLogger.info('✨ Manifest synchronization completed!', { 
            correlationId,
            accuracy: `${measuredData.summary.accuracy  }%`,
            found: measuredData.summary.foundAssets
        });

        process.exit(0);
    } catch (error: unknown) {
        const err = error as Error;
        professionalLogger.fatal('Manifest Update failed', { 
            correlationId, 
            error: err.message 
        });
        process.exit(1);
    }
}

updateManifest();
