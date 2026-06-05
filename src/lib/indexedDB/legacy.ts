// src/lib/indexedDB/legacy.ts - Legacy compatibility functions
/* eslint-disable @typescript-eslint/no-explicit-any */
import { clearAssets, getAsset, putAsset } from "./operations";
import type { AssetMetadata } from "./types";

/**
 * Legacy function for backward compatibility
 */
export function putModel(name: string, data: ArrayBuffer): Promise<void> {
  const asset: AssetMetadata & { data: any } = {
    id: name,
    name,
    type: "arraybuffer",
    size: data.byteLength,
    createdAt: Date.now(),
    accessedAt: Date.now(),
    priority: 5,
    data,
  };

  return putAsset(asset);
}

/**
 * Legacy function for backward compatibility
 */
export async function getModel(name: string): Promise<ArrayBuffer | undefined> {
  const asset = await getAsset(name);
  return asset?.data;
}

/**
 * Legacy function for backward compatibility
 */
export function clearModels(): Promise<void> {
  return clearAssets();
}
