import { logger } from "@/utils/logger";
import { deleteAsset, getAllAssets, getAsset, putAsset } from "../indexedDB";

const SWR_STORE_PREFIX = "swr_";

export const swrPersistence = {
  async getItem(key: string) {
    try {
      const asset = await getAsset(SWR_STORE_PREFIX + key);
      return asset ? asset.data : null;
    } catch (error) {
      logger.error("[SWR-Persistence] Failed to get item:", error);
      return null;
    }
  },

  async setItem(key: string, value: unknown) {
    try {
      const data = value;
      // We wrap the data in an asset-like structure for indexedDB.ts
      await putAsset({
        id: SWR_STORE_PREFIX + key,
        name: key,
        type: "json",
        size: JSON.stringify(data).length,
        createdAt: Date.now(),
        accessedAt: Date.now(),
        priority: 1,
        data: data,
        ttl: 24 * 60 * 60 * 1000, // 24 hours TTL for persistence
      });
    } catch (error) {
      logger.error("[SWR-Persistence] Failed to set item:", error);
    }
  },

  async removeItem(key: string) {
    try {
      await deleteAsset(SWR_STORE_PREFIX + key);
    } catch (error) {
      logger.error("[SWR-Persistence] Failed to remove item:", error);
    }
  },

  async getAllKeys() {
    try {
      const assets = await getAllAssets();
      return assets
        .filter(a => a.id.startsWith(SWR_STORE_PREFIX))
        .map(a => a.id.replace(SWR_STORE_PREFIX, ""));
    } catch {
      return [];
    }
  },
};
