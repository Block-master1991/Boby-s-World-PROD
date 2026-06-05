import type { BlacklistedTokenDocument } from "@/types/database";
import type * as admin from "firebase-admin";
import type { Timestamp as AdminTimestamp } from "firebase-admin/firestore";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { logger } from "utils/logger";
import { initializeAdminApp } from "./firebase-admin";

// Local alias for backward compatibility or brevity
type BlacklistedTokenDoc = BlacklistedTokenDocument;
type TimestampProperty = BlacklistedTokenDocument["revokedAt"];

/**
 * Helper to normalize various timestamp formats into Date and milliseconds.
 */
function normalizeTimestamp(ts: TimestampProperty): { ms: number; date: Date } {
  if (!ts) {
    const now = new Date();
    return { ms: now.getTime(), date: now };
  }

  // Handle Date objects
  if (ts instanceof Date) {
    return { ms: ts.getTime(), date: ts };
  }

  // Handle strings (ISO or other formats)
  if (typeof ts === "string") {
    const date = new Date(ts);
    return {
      ms: isNaN(date.getTime()) ? Date.now() : date.getTime(),
      date: isNaN(date.getTime()) ? new Date() : date,
    };
  }

  // Handle numbers (assumed to be milliseconds)
  if (typeof ts === "number") {
    return { ms: ts, date: new Date(ts) };
  }

  // Handle Firestore Timestamps (they have toMillis and toDate methods)
  if (ts && typeof ts === "object" && "toMillis" in ts && "toDate" in ts) {
    const timestamp = ts as { toMillis: () => number; toDate: () => Date };
    return { ms: timestamp.toMillis(), date: timestamp.toDate() };
  }

  // Fallback
  const fallback = new Date();
  return { ms: fallback.getTime(), date: fallback };
}

export class TokenBlacklistManager {
  private static statsCache: {
    data: { totalBlacklisted: number; byReason: Record<string, number> } | null;
    timestamp: number;
  } | null = null;
  private static readonly STATS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  private static getBlacklistCollection() {
    // This function assumes initializeAdminApp() has been called and succeeded.
    const db = getFirestore();
    return db.collection("revokedAuthTokens");
  }

  static async addToBlacklist(
    jti: string,
    exp: number,
    reason: BlacklistedTokenDoc["reason"]
  ): Promise<void> {
    try {
      await initializeAdminApp();
      const blacklistCol = this.getBlacklistCollection();

      const docRef = blacklistCol.doc(jti);
      const docSnap = await docRef.get();

      if (docSnap.exists) {
        const data = docSnap.data() as BlacklistedTokenDocument;
        logger.warn(
          `[TokenBlacklist] Token JTI: ${jti} is already in the blacklist. Current reason: ${data.reason}. New reason: ${reason}. Not overwriting.`
        );
        return;
      }

      await docRef.set({
        jti,
        exp,
        reason,
        revokedAt: FieldValue.serverTimestamp() as AdminTimestamp,
      });
      logger.log(
        `[TokenBlacklist] Token JTI: ${jti} successfully added to blacklist. Reason: ${reason}, Original Exp: ${new Date(exp * 1000).toISOString()}`
      );
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
      const errorStack = error instanceof Error ? error.stack : undefined;
      logger.error(
        `[TokenBlacklist] Error adding token JTI: ${jti} to blacklist:`,
        errorMessage,
        errorStack
      );
    }
  }

  static async isBlacklisted(jti: string, gracePeriodSeconds: number = 0): Promise<boolean> {
    try {
      await initializeAdminApp();
      const blacklistCol = this.getBlacklistCollection();

      logger.log(
        `[TokenBlacklist] Checking blacklist for JTI: ${jti}${gracePeriodSeconds > 0 ? ` (with ${gracePeriodSeconds}s grace period)` : ""}`
      );
      const tokenDoc = await blacklistCol.doc(jti).get();

      if (!tokenDoc.exists) {
        logger.log(`[TokenBlacklist] Token JTI: ${jti} not found in blacklist.`);
        return false;
      }

      const tokenData = tokenDoc.data() as BlacklistedTokenDocument;
      const { ms: revokedAtMs, date: revokedAtDate } = normalizeTimestamp(tokenData.revokedAt);
      const now = Date.now();

      logger.log(
        `[TokenBlacklist] Token JTI: ${jti} found in blacklist. Reason: ${tokenData.reason}, RevokedAt: ${revokedAtDate.toISOString()}`
      );

      // Apply grace period if requested (typically for refresh tokens consumed in parallel)
      if (gracePeriodSeconds > 0 && tokenData.reason === "expired") {
        const elapsedSeconds = (now - revokedAtMs) / 1000;
        if (elapsedSeconds <= gracePeriodSeconds) {
          logger.log(
            `[TokenBlacklist] Token JTI: ${jti} is within grace period (${Math.round(elapsedSeconds)}s <= ${gracePeriodSeconds}s). Treating as NOT blacklisted.`
          );
          return false;
        }
      }

      // Optional: Clean up very old tokens if their original expiry + buffer has passed.
      if (await this.shouldCleanupOldToken(tokenDoc, tokenData, now)) {
        return false;
      }

      return true; // Found in blacklist and not super-expired for cleanup
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
      const errorStack = error instanceof Error ? error.stack : undefined;
      logger.error(
        `[TokenBlacklist] Error checking blacklist for token JTI: ${jti}:`,
        errorMessage,
        errorStack
      );
      // Fail-safe decision: If DB error, prefer to consider token as potentially valid to avoid undue user impact.
      // Log heavily and monitor. For extreme security, you might return true.
      logger.warn(
        `[TokenBlacklist] Database error during blacklist check for JTI ${jti}. Treating as NOT blacklisted due to error.`
      );
      return false;
    }
  }

  static async cleanupExpiredTokens(olderThanDays: number = 30): Promise<void> {
    try {
      await initializeAdminApp();
      const db = getFirestore();
      // Cleanup tokens whose *original* expiry ('exp' field) is older than 'olderThanDays'.
      // These tokens would be invalid anyway, regardless of blacklisting.
      const cleanupThresholdSeconds = Math.floor(Date.now() / 1000) - olderThanDays * 24 * 60 * 60;

      logger.log(
        `[TokenBlacklist] Starting cleanup of blacklisted tokens originally expired before ${new Date(cleanupThresholdSeconds * 1000).toISOString()} (i.e., older than ${olderThanDays} days).`
      );

      const querySnapshot = await db
        .collection("revokedAuthTokens")
        .where("exp", "<", cleanupThresholdSeconds)
        .limit(500)
        .get();

      if (querySnapshot.empty) {
        logger.log(
          "[TokenBlacklist] No sufficiently old blacklisted tokens (based on original 'exp' field) found for this cleanup batch."
        );
        return;
      }

      const batch = db.batch();
      querySnapshot.docs.forEach(doc => {
        const data = doc.data() as BlacklistedTokenDocument;
        logger.log(
          `[TokenBlacklist] Scheduling deletion for old blacklisted token: ${doc.id} (originally expired at ${new Date(data.exp * 1000).toISOString()})`
        );
        batch.delete(doc.ref);
      });
      await batch.commit();
      logger.log(`[TokenBlacklist] Cleaned up ${querySnapshot.size} old blacklisted tokens.`);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
      const errorStack = error instanceof Error ? error.stack : undefined;
      logger.error(
        `[TokenBlacklist] Error during scheduled cleanup of expired tokens:`,
        errorMessage,
        errorStack
      );
    }
  }

  // This function remains illustrative as true implementation requires tracking active JTIs per user.
  static async blacklistAllUserTokens(
    publicKey: string,
    reason: "security_breach" | "logout" = "security_breach"
  ): Promise<void> {
    try {
      await initializeAdminApp();
      logger.warn(
        `[TokenBlacklist] Conceptual: Blacklisting all tokens for user: ${publicKey}, reason: ${reason}. This function is a placeholder. A robust implementation would require tracking active JTIs per user or user session IDs linked to JWTs, then blacklisting those specific JTIs.`
      );
      // Example (if you stored active JTIs per user):
      // const userSessionsRef = getFirestore().collection('userActiveSessions').doc(publicKey);
      // const doc = await userSessionsRef.get();
      // if (doc.exists) {
      //   const activeJtis = doc.data()?.activeJtis as string[]; // Assuming structure { activeJtis: ['jti1', 'jti2'] }
      //   if (activeJtis && activeJtis.length > 0) {
      //     const nowSeconds = Math.floor(Date.now() / 1000);
      //     for (const jti of activeJtis) {
      //       // Use a far future 'exp' if original unknown, or fetch original 'exp' if stored with JTI
      //       await this.addToBlacklist(jti, nowSeconds + this.REFRESH_TOKEN_EXPIRY_SECONDS, reason);
      //     }
      //     logger.log(`[TokenBlacklist] Attempted to blacklist ${activeJtis.length} JTIs for user ${publicKey}.`);
      //     // Clear active JTIs for the user
      //     await userSessionsRef.update({ activeJtis: [] });
      //   }
      // }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
      const errorStack = error instanceof Error ? error.stack : undefined;
      logger.error(
        `[TokenBlacklist] Error in conceptual blacklistAllUserTokens for ${publicKey}:`,
        errorMessage,
        errorStack
      );
    }
  }

  static async getStats(
    useCache = true
  ): Promise<{ totalBlacklisted: number; byReason: Record<string, number> } | null> {
    // Check cache first
    if (
      useCache &&
      this.statsCache &&
      Date.now() - this.statsCache.timestamp < this.STATS_CACHE_TTL_MS
    ) {
      logger.log(
        `[TokenBlacklist] Returning cached stats from ${new Date(this.statsCache.timestamp).toISOString()}`
      );
      return this.statsCache.data;
    }

    try {
      await initializeAdminApp();

      // Get total count using aggregation
      const totalCountSnapshot = await this.getBlacklistCollection().count().get();
      const totalBlacklisted = totalCountSnapshot.data()["count"] as number;
      const batchSize = 1000;

      const byReason = await this.aggregateStatsByReason(totalBlacklisted, batchSize);

      const stats = { totalBlacklisted, byReason };

      // Update cache
      this.statsCache = {
        data: stats,
        timestamp: Date.now(),
      };

      logger.log(`[TokenBlacklist] Stats computed:`, stats);
      return stats;
    } catch (error: unknown) {
      logger.error(`[TokenBlacklist] Error getting blacklist stats:`, error as Error);
      this.statsCache = null;
      return null;
    }
  }

  private static fetchStatsBatch(
    lastDoc: admin.firestore.QueryDocumentSnapshot | null,
    batchSize: number
  ) {
    const query = this.getBlacklistCollection().select("reason").limit(batchSize);
    const paginatedQuery = lastDoc ? query.startAfter(lastDoc) : query;
    return paginatedQuery.get();
  }

  private static async shouldCleanupOldToken(
    tokenDoc: admin.firestore.DocumentSnapshot,
    tokenData: BlacklistedTokenDocument,
    now: number
  ): Promise<boolean> {
    const originalExpiryWithBufferMs = tokenData.exp * 1000 + 10 * 24 * 60 * 60 * 1000;
    if (originalExpiryWithBufferMs < now) {
      logger.log(
        `[TokenBlacklist] Cleaning up old token JTI: ${tokenDoc.id}. Original expiry passed.`
      );
      await tokenDoc.ref.delete();
      return true;
    }
    return false;
  }

  private static async aggregateStatsByReason(
    totalBlacklisted: number,
    batchSize: number
  ): Promise<Record<string, number>> {
    const byReason: Record<string, number> = {};
    let lastDoc: admin.firestore.QueryDocumentSnapshot | null = null;
    let hasMore = true;
    let processedDocs = 0;

    while (hasMore) {
      /* eslint-disable-next-line no-await-in-loop */
      const snapshot = await this.fetchStatsBatch(lastDoc, batchSize);
      if (snapshot.empty) break;

      snapshot.docs.forEach(doc => {
        const data = doc.data() as BlacklistedTokenDoc;
        byReason[data.reason] = (byReason[data.reason] || 0) + 1;
      });

      processedDocs += snapshot.docs.length;
      lastDoc =
        (snapshot.docs[snapshot.docs.length - 1] as admin.firestore.QueryDocumentSnapshot) || null;
      if (snapshot.docs.length < batchSize) hasMore = false;

      if (totalBlacklisted > 10000 && processedDocs % 5000 === 0) {
        logger.log(`[TokenBlacklist] Progress: ${processedDocs}/${totalBlacklisted}`);
      }
    }
    return byReason;
  }
}
