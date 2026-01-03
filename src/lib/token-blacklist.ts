
import { logger } from 'utils/logger';
import { initializeAdminApp } from './firebase-admin';
import * as admin from 'firebase-admin'; // Import admin namespace for QueryDocumentSnapshot
import { getFirestore, FieldValue, Timestamp as AdminTimestamp } from 'firebase-admin/firestore'; // Explicitly import AdminTimestamp

interface BlacklistedTokenDoc {
  jti: string; 
  exp: number; // Original expiry of the token in seconds since epoch
  reason: 'logout' | 'security_breach' | 'expired';
  revokedAt: AdminTimestamp; // Firestore Admin SDK Timestamp
}

export class TokenBlacklistManager {
  private static statsCache: { data: { totalBlacklisted: number; byReason: Record<string, number> } | null; timestamp: number } | null = null;
  private static readonly STATS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  private static getBlacklistCollection() {
    // This function assumes initializeAdminApp() has been called and succeeded.
    const db = getFirestore();
    return db.collection('revokedAuthTokens');
  }

  static async addToBlacklist(jti: string, exp: number, reason: BlacklistedTokenDoc['reason']): Promise<void> {
    try {
      await initializeAdminApp(); 
      const blacklistCol = this.getBlacklistCollection();
      
      const docRef = blacklistCol.doc(jti);
      const docSnap = await docRef.get();

      if (docSnap.exists) {
        logger.warn(`[TokenBlacklist] Token JTI: ${jti} is already in the blacklist. Current reason: ${docSnap.data()?.reason}. New reason: ${reason}. Not overwriting.`);
        return;
      }
      
      await docRef.set({
        jti,
        exp, 
        reason,
        revokedAt: FieldValue.serverTimestamp() as AdminTimestamp 
      });
      logger.log(`[TokenBlacklist] Token JTI: ${jti} successfully added to blacklist. Reason: ${reason}, Original Exp: ${new Date(exp * 1000).toISOString()}`);
        } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
      const errorStack = error instanceof Error ? error.stack : undefined;
      logger.error(`[TokenBlacklist] Error adding token JTI: ${jti} to blacklist:`, errorMessage, errorStack);
    }

  }

  static async isBlacklisted(jti: string): Promise<boolean> {
    try {
      await initializeAdminApp(); 
      const blacklistCol = this.getBlacklistCollection();
      
      logger.log(`[TokenBlacklist] Checking blacklist for JTI: ${jti}`);
      const tokenDoc = await blacklistCol.doc(jti).get();

      if (!tokenDoc.exists) {
        logger.log(`[TokenBlacklist] Token JTI: ${jti} not found in blacklist.`);
        return false; 
      }

      const tokenData = tokenDoc.data() as BlacklistedTokenDoc;
      logger.log(`[TokenBlacklist] Token JTI: ${jti} found in blacklist. Reason: ${tokenData.reason}, RevokedAt: ${tokenData.revokedAt.toDate().toISOString()}`);

      // Optional: Clean up very old tokens if their original expiry + buffer has passed.
      // This prevents the blacklist from growing indefinitely with tokens that would be long expired anyway.
      // Consider a longer buffer, e.g., refresh token expiry (7 days) + a few more days.
      const originalExpiryWithBufferMs = (tokenData.exp * 1000) + (10 * 24 * 60 * 60 * 1000); // 10 days buffer
      if (originalExpiryWithBufferMs < Date.now()) {
        logger.log(`[TokenBlacklist] Cleaning up very old blacklisted token JTI: ${jti} (original expiry + buffer passed). Deleting from blacklist.`);
        await tokenDoc.ref.delete();
        return false; // Treat as not blacklisted if it's extremely old and cleaned up.
      }
      
      return true; // Found in blacklist and not super-expired for cleanup

    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
      const errorStack = error instanceof Error ? error.stack : undefined;
      logger.error(`[TokenBlacklist] Error checking blacklist for token JTI: ${jti}:`, errorMessage, errorStack);
      // Fail-safe decision: If DB error, prefer to consider token as potentially valid to avoid undue user impact.
      // Log heavily and monitor. For extreme security, you might return true.
      logger.warn(`[TokenBlacklist] Database error during blacklist check for JTI ${jti}. Treating as NOT blacklisted due to error.`);
      return false; 
    }

  }

  static async cleanupExpiredTokens(olderThanDays: number = 30): Promise<void> {
    try {
      await initializeAdminApp();
      const db = getFirestore();
      // Cleanup tokens whose *original* expiry ('exp' field) is older than 'olderThanDays'.
      // These tokens would be invalid anyway, regardless of blacklisting.
      const cleanupThresholdSeconds = Math.floor(Date.now() / 1000) - (olderThanDays * 24 * 60 * 60);
      
      logger.log(`[TokenBlacklist] Starting cleanup of blacklisted tokens originally expired before ${new Date(cleanupThresholdSeconds * 1000).toISOString()} (i.e., older than ${olderThanDays} days).`);
      
      const querySnapshot = await db.collection('revokedAuthTokens')
                                  .where('exp', '<', cleanupThresholdSeconds)
                                  .limit(500) 
                                  .get();
    
      if (querySnapshot.empty) {
        logger.log("[TokenBlacklist] No sufficiently old blacklisted tokens (based on original 'exp' field) found for this cleanup batch.");
        return;
      }

      const batch = db.batch();
      querySnapshot.docs.forEach(doc => {
        logger.log(`[TokenBlacklist] Scheduling deletion for old blacklisted token: ${doc.id} (originally expired at ${new Date((doc.data().exp as number) * 1000).toISOString()})`);
        batch.delete(doc.ref);
      });
      await batch.commit();
      logger.log(`[TokenBlacklist] Cleaned up ${querySnapshot.size} old blacklisted tokens.`);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
      const errorStack = error instanceof Error ? error.stack : undefined;
      logger.error(`[TokenBlacklist] Error during scheduled cleanup of expired tokens:`, errorMessage, errorStack);
    }

  }

  // This function remains illustrative as true implementation requires tracking active JTIs per user.
  static async blacklistAllUserTokens(publicKey: string, reason: 'security_breach' | 'logout' = 'security_breach'): Promise<void> {
    try {
        await initializeAdminApp();
        logger.warn(`[TokenBlacklist] Conceptual: Blacklisting all tokens for user: ${publicKey}, reason: ${reason}. This function is a placeholder. A robust implementation would require tracking active JTIs per user or user session IDs linked to JWTs, then blacklisting those specific JTIs.`);
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
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
      const errorStack = error instanceof Error ? error.stack : undefined;
      logger.error(`[TokenBlacklist] Error in conceptual blacklistAllUserTokens for ${publicKey}:`, errorMessage, errorStack);
    }

  }

  static async getStats(useCache = true): Promise<{ totalBlacklisted: number; byReason: Record<string, number> } | null> {
    // Check cache first
    if (useCache && this.statsCache && (Date.now() - this.statsCache.timestamp < this.STATS_CACHE_TTL_MS)) {
      logger.log(`[TokenBlacklist] Returning cached stats from ${new Date(this.statsCache.timestamp).toISOString()}`);
      return this.statsCache.data;
    }
    
    try {
      await initializeAdminApp();
      
      // Get total count using aggregation
      const totalCountSnapshot = await this.getBlacklistCollection().count().get();
      const totalBlacklisted = totalCountSnapshot.data().count;
      
      // For byReason, use a more efficient approach with pagination
      const byReason: Record<string, number> = {};
      let lastDoc: admin.firestore.QueryDocumentSnapshot | null = null;
      const batchSize = 1000;
      let hasMore = true;
      let processedDocs = 0;
      
      logger.log(`[TokenBlacklist] Starting stats computation for ${totalBlacklisted} total blacklisted tokens`);
      
      while (hasMore) {
        let query = this.getBlacklistCollection()
          .select('reason')
          .limit(batchSize);
          
        if (lastDoc) {
          query = query.startAfter(lastDoc);
        }
        
        const snapshot = await query.get();
        
        if (snapshot.empty) {
          hasMore = false;
          break;
        }
        
        snapshot.docs.forEach(doc => {
          const data = doc.data() as BlacklistedTokenDoc;
          byReason[data.reason] = (byReason[data.reason] || 0) + 1;
          processedDocs++;
        });
        
        lastDoc = snapshot.docs[snapshot.docs.length - 1];
        
        if (snapshot.docs.length < batchSize) {
          hasMore = false;
        }
        
        // Log progress for large collections
        if (totalBlacklisted > 10000 && processedDocs % 5000 === 0) {
          logger.log(`[TokenBlacklist] Stats computation progress: ${processedDocs}/${totalBlacklisted} documents processed`);
        }
      }
      
      const stats = { totalBlacklisted, byReason };
      
      // Update cache
      this.statsCache = {
        data: stats,
        timestamp: Date.now()
      };
      
      logger.log(`[TokenBlacklist] Stats computed:`, stats);
      return stats;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
      const errorStack = error instanceof Error ? error.stack : undefined;
      logger.error(`[TokenBlacklist] Error getting blacklist stats:`, errorMessage, errorStack);
      this.statsCache = null; // Invalidate cache on error
      return null;
    }
  }
}
