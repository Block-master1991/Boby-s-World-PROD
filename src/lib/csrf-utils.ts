import { initializeAdminApp } from './firebase-admin';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { randomBytes } from 'crypto';

const CSRF_TOKEN_EXPIRY_MINUTES = 30; // CSRF token expiry time

export class CSRFManager {
  private static getCsrfCollection() {
    const db = getFirestore();
    return db.collection('csrfTokens');
  }

  /**
   * Generates a new CSRF token and stores it in Firestore.
   * @param sessionId A unique identifier for the user's session (e.g., user's public key or a session ID).
   * @returns The generated CSRF token string.
   */
  static async generateToken(sessionId: string): Promise<string> {
    await initializeAdminApp();
    const db = getFirestore();

    const token = randomBytes(32).toString('hex');
    const expiry = Date.now() + CSRF_TOKEN_EXPIRY_MINUTES * 60 * 1000; // Convert minutes to milliseconds

    const docRef = this.getCsrfCollection().doc(sessionId);

    await docRef.set({
      token: token,
      expiry: expiry,
      createdAt: FieldValue.serverTimestamp(),
    });

    console.log(`[CSRFManager] Generated CSRF token for session ${sessionId}. Token: ${token.substring(0, 5)}... Expiry: ${new Date(expiry).toISOString()}`);
    return token;
  }

  /**
   * Verifies a CSRF token against the stored token for a given session.
   * Consumes the token upon successful verification.
   * @param sessionId The unique identifier for the user's session.
   * @param clientToken The token received from the client.
   * @returns True if the token is valid and consumed, false otherwise.
   */
  static async verifyToken(sessionId: string, clientToken: string): Promise<boolean> {
    await initializeAdminApp();
    const db = getFirestore();

    const docRef = this.getCsrfCollection().doc(sessionId);

    const result = await db.runTransaction(async (transaction) => {
      const docSnap = await transaction.get(docRef);

      if (!docSnap.exists) {
        console.warn(`[CSRFManager] No CSRF token found for session ${sessionId}.`);
        return { success: false, reason: 'not_found' };
      }

      const storedData = docSnap.data() as { token: string; expiry: number };

      if (storedData.expiry < Date.now()) {
        console.warn(`[CSRFManager] CSRF token expired for session ${sessionId}. Deleting.`);
        transaction.delete(docRef);
        return { success: false, reason: 'expired' };
      }

      if (storedData.token !== clientToken) {
        console.warn(`[CSRFManager] CSRF token mismatch for session ${sessionId}. Expected: ${storedData.token.substring(0, 5)}..., Got: ${clientToken.substring(0, 5)}...`);
        // For security, delete the token on mismatch to prevent brute-force attempts
        transaction.delete(docRef);
        return { success: false, reason: 'mismatch' };
      }

      // Token is valid. Instead of consuming (deleting) it, update its expiry to extend its validity.
      // This makes it a per-session token rather than a single-use token,
      // which is necessary for optimistic updates where multiple requests might use the same token.
      const newExpiry = Date.now() + CSRF_TOKEN_EXPIRY_MINUTES * 60 * 1000;
      transaction.update(docRef, { expiry: newExpiry });
      console.log(`[CSRFManager] CSRF token for session ${sessionId} verified and expiry updated. New Expiry: ${new Date(newExpiry).toISOString()}`);
      return { success: true, reason: 'valid' };
    });

    return result.success;
  }

  /**
   * Retrieves an existing valid CSRF token for a session, or generates a new one if none exists or it's expired.
   * @param sessionId A unique identifier for the user's session.
   * @returns The CSRF token string.
   */
  static async getOrCreateToken(sessionId: string): Promise<string> {
    await initializeAdminApp();
    const db = getFirestore();
    const docRef = this.getCsrfCollection().doc(sessionId);

    const docSnap = await docRef.get();

    if (docSnap.exists) {
      const storedData = docSnap.data() as { token: string; expiry: number };
      if (storedData.expiry > Date.now()) {
        console.log(`[CSRFManager] Reusing existing valid CSRF token for session ${sessionId}. Token: ${storedData.token.substring(0, 5)}...`);
        return storedData.token;
      } else {
        console.log(`[CSRFManager] Existing CSRF token for session ${sessionId} expired. Generating new one.`);
        // Delete expired token before generating a new one to clean up
        await docRef.delete();
      }
    }

    // No valid token found, generate a new one
    return this.generateToken(sessionId);
  }

  /**
   * Deletes a CSRF token from Firestore for a given session.
   * This is used during logout to invalidate the token immediately.
   * @param sessionId The unique identifier for the user's session.
   */
  static async deleteToken(sessionId: string): Promise<void> {
    await initializeAdminApp();
    const db = getFirestore();
    const docRef = this.getCsrfCollection().doc(sessionId);
    await docRef.delete();
    console.log(`[CSRFManager] Deleted CSRF token for session ${sessionId}.`);
  }
}
