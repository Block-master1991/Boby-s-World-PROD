import { initializeAdminApp } from "@/lib/firebase-admin";
import type { InventoryItem } from "@/types/database";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

export class InventoryRepository {
  private static async getDb() {
    await initializeAdminApp();
    return getFirestore();
  }

  static async getUserInventory(userId: string): Promise<InventoryItem[]> {
    const db = await this.getDb();
    const doc = await db.collection("players").doc(userId).get();
    if (!doc.exists) return [];
    const data = doc.data();
    return (data ? data["inventory"] : []) || [];
  }

  static async updateInventory(userId: string, inventory: InventoryItem[]) {
    const db = await this.getDb();
    await db.collection("players").doc(userId).update({
      inventory,
      lastInteraction: FieldValue.serverTimestamp(),
      lastUpdated: new Date(),
    });
    return true;
  }
}
