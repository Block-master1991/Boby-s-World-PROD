
import { initializeAdminApp } from './firebase-admin';
import { getFirestore, FieldValue, Timestamp as AdminTimestamp } from 'firebase-admin/firestore'; // Explicitly import AdminTimestamp

interface BlacklistedTokenDoc {
  jti: string; 
  exp: number; // Original expiry of the token in seconds since epoch
  reason: 'logout' | 'security_breach' | 'expired';
  revokedAt: AdminTimestamp; // Firestore Admin SDK Timestamp
}

export class TokenBlacklistManager {
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
        console.warn(`[TokenBlacklist] Token JTI: ${jti} is already in the blacklist. Current reason: ${docSnap.data()?.reason}. New reason: ${reason}. Not overwriting.`);
        return;
      }
      
      await docRef.set({
        jti,
        exp, 
        reason,
        revokedAt: FieldValue.serverTimestamp() as AdminTimestamp 
      });
      console.log(`[TokenBlacklist] Token JTI: ${jti} successfully added to blacklist. Reason: ${reason}, Original Exp: ${new Date(exp * 1000).toISOString()}`);
    } catch (error: any) {
      console.error(`[TokenBlacklist] Error adding token JTI: ${jti} to blacklist:`, error.message, error.stack);
    }
  }

  static async isBlacklisted(jti: string): Promise<boolean> {
    try {
      await initializeAdminApp(); 
      const blacklistCol = this.getBlacklistCollection();
      
      console.log(`[TokenBlacklist] Checking blacklist for JTI: ${jti}`);
      const tokenDoc = await blacklistCol.doc(jti).get();

      if (!tokenDoc.exists) {
        console.log(`[TokenBlacklist] Token JTI: ${jti} not found in blacklist.`);
        return false; 
      }

      const tokenData = tokenDoc.data() as BlacklistedTokenDoc;
      console.log(`[TokenBlacklist] Token JTI: ${jti} found in blacklist. Reason: ${tokenData.reason}, RevokedAt: ${tokenData.revokedAt.toDate().toISOString()}`);

      // Optional: Clean up very old tokens if their original expiry + buffer has passed.
      // This prevents the blacklist from growing indefinitely with tokens that would be long expired anyway.
      // Consider a longer buffer, e.g., refresh token expiry (7 days) + a few more days.
      const originalExpiryWithBufferMs = (tokenData.exp * 1000) + (10 * 24 * 60 * 60 * 1000); // 10 days buffer
      if (originalExpiryWithBufferMs < Date.now()) {
        console.log(`[TokenBlacklist] Cleaning up very old blacklisted token JTI: ${jti} (original expiry + buffer passed). Deleting from blacklist.`);
        await tokenDoc.ref.delete();
        return false; // Treat as not blacklisted if it's extremely old and cleaned up.
      }
      
      return true; // Found in blacklist and not super-expired for cleanup

    } catch (error: any) {
      console.error(`[TokenBlacklist] Error checking blacklist for token JTI: ${jti}:`, error.message, error.stack);
      // Fail-safe decision: If DB error, prefer to consider token as potentially valid to avoid undue user impact.
      // Log heavily and monitor. For extreme security, you might return true.
      console.warn(`[TokenBlacklist] Database error during blacklist check for JTI ${jti}. Treating as NOT blacklisted due to error.`);
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
      
      console.log(`[TokenBlacklist] Starting cleanup of blacklisted tokens originally expired before ${new Date(cleanupThresholdSeconds * 1000).toISOString()} (i.e., older than ${olderThanDays} days).`);
      
      const querySnapshot = await db.collection('revokedAuthTokens')
                                  .where('exp', '<', cleanupThresholdSeconds)
                                  .limit(500) 
                                  .get();
    
      if (querySnapshot.empty) {
        console.log("[TokenBlacklist] No sufficiently old blacklisted tokens (based on original 'exp' field) found for this cleanup batch.");
        return;
      }

      const batch = db.batch();
      querySnapshot.docs.forEach(doc => {
        console.log(`[TokenBlacklist] Scheduling deletion for old blacklisted token: ${doc.id} (originally expired at ${new Date((doc.data().exp as number) * 1000).toISOString()})`);
        batch.delete(doc.ref);
      });
      await batch.commit();
      console.log(`[TokenBlacklist] Cleaned up ${querySnapshot.size} old blacklisted tokens.`);
    } catch (error: any) {
        console.error(`[TokenBlacklist] Error during scheduled cleanup of expired tokens:`, error.message, error.stack);
    }
  }

  // This function remains illustrative as true implementation requires tracking active JTIs per user.
  static async blacklistAllUserTokens(publicKey: string, reason: 'security_breach' | 'logout' = 'security_breach'): Promise<void> {
    try {
        await initializeAdminApp();
        console.warn(`[TokenBlacklist] Conceptual: Blacklisting all tokens for user: ${publicKey}, reason: ${reason}. This function is a placeholder. A robust implementation would require tracking active JTIs per user or user session IDs linked to JWTs, then blacklisting those specific JTIs.`);
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
        //     console.log(`[TokenBlacklist] Attempted to blacklist ${activeJtis.length} JTIs for user ${publicKey}.`);
        //     // Clear active JTIs for the user
        //     await userSessionsRef.update({ activeJtis: [] });
        //   }
        // }
    } catch (error: any) {
      console.error(`[TokenBlacklist] Error in conceptual blacklistAllUserTokens for ${publicKey}:`, error.message, error.stack);
    }
  }

  static async getStats(): Promise<{ totalBlacklisted: number; byReason: Record<string, number> } | null> {
    try {
      await initializeAdminApp();
      const db = getFirestore();
      // For accurate counts on large collections, Firestore's aggregation queries should be used.
      console.warn("[TokenBlacklist] getStats() is illustrative and uses .get() which can be slow/costly on large collections. For production, use Firestore aggregation queries for total count.");
      
      // Get total count using aggregation if possible (requires specific setup/permissions)
      // const totalCountSnapshot = await this.getBlacklistCollection().count().get();
      // const totalBlacklisted = totalCountSnapshot.data().count;
      
      // For byReason, we might still need to fetch and iterate if distinct aggregation is complex or not available
      // Fetching a sample for byReason stats (limited for performance)
      const snapshot = await this.getBlacklistCollection().limit(2000).get(); // Increased limit slightly for better sample
      
      const stats = { totalBlacklisted: snapshot.size, byReason: {} as Record<string, number> };
      // If using totalCountSnapshot.data().count, use that for stats.totalBlacklisted.
      // The snapshot.size here is just for the limited query.

      snapshot.forEach(doc => {
        const data = doc.data() as BlacklistedTokenDoc;
        stats.byReason[data.reason] = (stats.byReason[data.reason] || 0) + 1;
      });
      console.log(`[TokenBlacklist] Stats based on ${snapshot.size} sampled documents:`, stats);
      return stats;
    } catch (error: any) {
        console.error(`[TokenBlacklist] Error getting blacklist stats:`, error.message, error.stack);
        return null;
    }
  }
}
    