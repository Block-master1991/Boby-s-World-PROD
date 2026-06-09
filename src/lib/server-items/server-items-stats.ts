import { initializeAdminApp } from "@/lib/firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import { logger } from "utils/logger";
import { getAllStoreItems } from "./server-items-read";

// Count items by type
export async function countItemsByType(type: "consumable" | "permanent"): Promise<number> {
  try {
    await initializeAdminApp();
    const db = getFirestore();
    const snapshot = await db
      .collection("storeItems")
      .where("type", "==", type)
      .where("isActive", "==", true)
      .get();

    return snapshot.size;
  } catch (error) {
    logger.error("Error counting items by type:", error);
    return 0;
  }
}

// Count items by rarity
export async function countItemsByRarity(
  rarity: "common" | "rare" | "epic" | "legendary"
): Promise<number> {
  try {
    await initializeAdminApp();
    const db = getFirestore();
    const snapshot = await db
      .collection("storeItems")
      .where("rarity", "==", rarity)
      .where("isActive", "==", true)
      .get();

    return snapshot.size;
  } catch (error) {
    logger.error("Error counting items by rarity:", error);
    return 0;
  }
}

// Get item statistics
export async function getStoreItemsStats(): Promise<{
  total: number;
  active: number;
  inactive: number;
  byType: { [key: string]: number };
  byRarity: { [key: string]: number };
}> {
  try {
    await initializeAdminApp();
    // Removed unused db variable

    const allItems = await getAllStoreItems();
    const activeItems = allItems.filter(item => item.isActive);

    const stats = {
      total: allItems.length,
      active: activeItems.length,
      inactive: allItems.length - activeItems.length,
      byType: {
        consumable: await countItemsByType("consumable"),
        permanent: await countItemsByType("permanent"),
      },
      byRarity: {
        common: await countItemsByRarity("common"),
        rare: await countItemsByRarity("rare"),
        epic: await countItemsByRarity("epic"),
        legendary: await countItemsByRarity("legendary"),
      },
    };

    return stats;
  } catch (error) {
    logger.error("Error fetching store items stats:", error);
    return {
      total: 0,
      active: 0,
      inactive: 0,
      byType: { consumable: 0, permanent: 0 },
      byRarity: { common: 0, rare: 0, epic: 0, legendary: 0 },
    };
  }
}
