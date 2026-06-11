/**
 * Update Manifest Utility - TypeScript Version
 * Syncs the GAME_ASSET_MANIFEST modular files with measured data from measured-assets.json.
 * Uses centralized Firebase initialization and professional logging.
 */

import "dotenv/config";
import { constants as fsConstants } from "fs";
import fs from "fs/promises";
import path from "path";
import { professionalLogger } from "../src/lib/logging";

const MEASURED_DATA_PATH = path.join(process.cwd(), "scripts", "measured-assets.json");
const ASSETS_DIR = path.join(process.cwd(), "src", "lib", "assets");
const HIGH_PRIORITY_PATH = path.join(ASSETS_DIR, "high-priority.ts");
const MEDIUM_PRIORITY_PATH = path.join(ASSETS_DIR, "medium-priority.ts");
const LOW_PRIORITY_PATH = path.join(ASSETS_DIR, "low-priority.ts");
const INDEX_PATH = path.join(ASSETS_DIR, "index.ts");

interface MeasuredAsset {
  path: string;
  type: string;
  priority: "critical" | "high" | "medium" | "low";
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
function formatAsset(asset: MeasuredAsset, indent = "  ") {
  const innerIndent = `${indent}  `;
  const lines = [
    `${indent}{`,
    `${innerIndent}path: "${asset.path}",`,
    `${innerIndent}type: "${asset.type}",`,
    `${innerIndent}priority: "${asset.priority}",`,
    `${innerIndent}estimatedSizeMB: ${asset.estimatedSizeMB},`,
  ];

  if (asset.version) lines.push(`${innerIndent}version: "${asset.version}",`);
  if (asset.sha256) lines.push(`${innerIndent}sha256: "${asset.sha256}",`);
  if (asset.actualSizeMB !== undefined) {
    lines.push(`${innerIndent}actualSizeMB: ${asset.actualSizeMB},`);
  }
  if (asset.lastModified) {
    lines.push(`${innerIndent}lastModified: "${asset.lastModified}",`);
  }

  lines.push(`${innerIndent}description: "${asset.description.replace(/"/g, '\\"')}",`);
  lines.push(`${indent}}`);
  return lines.join("\n");
}

function generatePriorityContent(
  variableName: string,
  assets: MeasuredAsset[],
  additionalAssets: { name: string; assets: MeasuredAsset[] }[] = []
): string {
  let content = `import type { AssetInfo } from "./types";\n\n`;

  content += `export const ${variableName}: AssetInfo[] = [\n`;
  content += assets.map(a => formatAsset(a, "  ")).join(",\n");
  content += `\n];\n`;

  additionalAssets.forEach(group => {
    content += `\nexport const ${group.name}: AssetInfo[] = [\n`;
    content += group.assets.map(a => formatAsset(a, "  ")).join(",\n");
    content += `\n];\n`;
  });

  return content;
}

function generateIndexContent(measuredAt: string, accuracy: number): string {
  return `// Game Asset Manifest - Statistics and exports
// 🔄 Auto-updated with actual measurements on ${new Date(measuredAt).toLocaleString()}

import { CRITICAL_ASSETS, HIGH_PRIORITY_ASSETS } from "./high-priority";
import { LOW_PRIORITY_ASSETS } from "./low-priority";
import { MEDIUM_PRIORITY_ASSETS } from "./medium-priority";
import type { AssetInfo } from "./types";

export const GAME_ASSET_MANIFEST: AssetInfo[] = [
  ...CRITICAL_ASSETS,
  ...HIGH_PRIORITY_ASSETS,
  ...MEDIUM_PRIORITY_ASSETS,
  ...LOW_PRIORITY_ASSETS,
];

export function getAssetsByPriority(priority: "critical" | "high" | "medium" | "low"): AssetInfo[] {
  return GAME_ASSET_MANIFEST.filter(asset => asset.priority === priority);
}

export function getTotalEstimatedSize(): number {
  return GAME_ASSET_MANIFEST.reduce((total, asset) => total + asset.estimatedSizeMB, 0);
}

export function getTotalActualSize(): number {
  return GAME_ASSET_MANIFEST.reduce(
    (total, asset) => total + (asset.actualSizeMB || asset.estimatedSizeMB),
    0
  );
}

export function getPriorityOrder(): ("critical" | "high" | "medium" | "low")[] {
  return ["critical", "high", "medium", "low"];
}

export function getAssetsByType(type: "model" | "texture" | "audio" | "hdr"): AssetInfo[] {
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
  measuredAt: "${measuredAt}",
  accuracy: ${accuracy},
  byPriority: {
    critical: getAssetsByPriority("critical").length,
    high: getAssetsByPriority("high").length,
    medium: getAssetsByPriority("medium").length,
    low: getAssetsByPriority("low").length,
  },
  byType: {
    models: getAssetsByType("model").length,
    textures: getAssetsByType("texture").length,
    audio: getAssetsByType("audio").length,
    hdr: getAssetsByType("hdr").length,
  },
};
`;
}

async function writeManifestFiles(
  correlationId: string,
  criticalAssets: MeasuredAsset[],
  highAssets: MeasuredAsset[],
  mediumAssets: MeasuredAsset[],
  lowAssets: MeasuredAsset[],
  measuredAt: string,
  accuracy: number
) {
  const makeBackup = async (filePath: string, backupPath: string) => {
    try {
      await fs.access(filePath, fsConstants.F_OK);
      await fs.copyFile(filePath, backupPath);
      professionalLogger.debug(`💾 Backup created for ${path.basename(filePath)}`, { correlationId });
    } catch {
      // file doesn't exist yet, skip backup
    }
  };

  await makeBackup(HIGH_PRIORITY_PATH, `${HIGH_PRIORITY_PATH}.backup`);
  await makeBackup(MEDIUM_PRIORITY_PATH, `${MEDIUM_PRIORITY_PATH}.backup`);
  await makeBackup(LOW_PRIORITY_PATH, `${LOW_PRIORITY_PATH}.backup`);
  await makeBackup(INDEX_PATH, `${INDEX_PATH}.backup`);

  // Generate contents
  const highPriorityContent = generatePriorityContent("CRITICAL_ASSETS", criticalAssets, [
    { name: "HIGH_PRIORITY_ASSETS", assets: highAssets }
  ]);
  const mediumPriorityContent = generatePriorityContent("MEDIUM_PRIORITY_ASSETS", mediumAssets);
  const lowPriorityContent = generatePriorityContent("LOW_PRIORITY_ASSETS", lowAssets);
  const indexContent = generateIndexContent(measuredAt, accuracy);

  // Write files
  await fs.writeFile(HIGH_PRIORITY_PATH, highPriorityContent, "utf8");
  await fs.writeFile(MEDIUM_PRIORITY_PATH, mediumPriorityContent, "utf8");
  await fs.writeFile(LOW_PRIORITY_PATH, lowPriorityContent, "utf8");
  await fs.writeFile(INDEX_PATH, indexContent, "utf8");

  // Ensure src/lib/gameAssetManifest.ts remains a simple index exporter pointing to index.ts
  const centralManifestPath = path.join(process.cwd(), "src", "lib", "gameAssetManifest.ts");
  const centralManifestContent = `export * from "./assets/index";\nexport * from "./assets/types";\n`;
  await fs.writeFile(centralManifestPath, centralManifestContent, "utf8");
}

async function updateManifest() {
  const correlationId = `manifest-update-${Date.now()}`;
  professionalLogger.info("🔨 Starting Modular Manifest Update Process", { correlationId });

  try {
    try {
      await fs.access(MEASURED_DATA_PATH, fsConstants.F_OK);
    } catch {
      throw new Error(`Measured data not found at ${MEASURED_DATA_PATH}. Run measureAssets first.`);
    }

    const rawData = await fs.readFile(MEASURED_DATA_PATH, "utf8");
    const measuredData = JSON.parse(rawData) as MeasuredData;

    // Filter and map only existing assets
    const activeAssets = measuredData.assets.filter(a => a.exists).map(a => ({
      ...a,
      version: a.version || "v1.0.0"
    }));

    const criticalAssets = activeAssets.filter(a => a.priority === "critical");
    const highAssets = activeAssets.filter(a => a.priority === "high");
    const mediumAssets = activeAssets.filter(a => a.priority === "medium");
    const lowAssets = activeAssets.filter(a => a.priority === "low");

    await writeManifestFiles(
      correlationId,
      criticalAssets,
      highAssets,
      mediumAssets,
      lowAssets,
      measuredData.measuredAt,
      measuredData.summary.accuracy
    );

    professionalLogger.info("✨ Modular Manifest synchronization completed!", {
      correlationId,
      accuracy: `${measuredData.summary.accuracy}%`,
      found: activeAssets.length,
    });

    process.exit(0);
  } catch (error: unknown) {
    const err = error as Error;
    professionalLogger.fatal("Manifest Update failed", {
      correlationId,
      error: err.message,
    });
    process.exit(1);
  }
}

updateManifest();
