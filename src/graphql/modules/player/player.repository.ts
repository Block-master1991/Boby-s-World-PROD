import { initializeAdminApp } from "@/lib/firebase/firebase-admin";
import { logger } from "@/utils/logger";
import type { DocumentData } from "firebase-admin/firestore";
import { getFirestore } from "firebase-admin/firestore";

export class PlayerRepository {
  private static async getDb() {
    await initializeAdminApp();
    return getFirestore();
  }

  static async findById(id: string): Promise<DocumentData | null> {
    try {
      const db = await this.getDb();
      const doc = await db.collection("players").doc(id).get();
      if (!doc.exists) return null;
      const data = doc.data();
      return data ? { id: doc.id, ...data } : null;
    } catch (error) {
      logger.error(`[PlayerRepository] Error findById(${id}):`, error);
      throw new Error("Database error while fetching player");
    }
  }

  static async updateStats(id: string, stats: Record<string, unknown>) {
    try {
      const db = await this.getDb();
      await db
        .collection("players")
        .doc(id)
        .update({
          ...stats,
          lastUpdated: new Date(),
        });
      return true;
    } catch (error) {
      logger.error(`[PlayerRepository] Error updateStats(${id}):`, error);
      throw new Error("Database error while updating player stats");
    }
  }
}
