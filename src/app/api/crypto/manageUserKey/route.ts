import { NextResponse } from 'next/server';
import { logger } from '@/utils/logger';
import { keyVault } from '@/lib/keyVaultService';
import { db } from '@/lib/firebase-admin';
import type { AuthenticatedRequest } from '@/lib/auth-middleware';
import { withAuth } from '@/lib/auth-middleware';
import { withCsrfProtection } from '@/lib/csrf-middleware';
import { setCsrfTokenResponse } from '@/lib/csrf-helper';

// This API route will handle both generating/storing and retrieving user keys.
// It should be protected by authentication middleware.
// For simplicity, we'll assume the userId is passed in the request body for now,
// but in a real app, it would come from the authenticated session.

export const POST = withAuth(withCsrfProtection(async (request: AuthenticatedRequest) => {
  try {
    const userId = request.user?.sub;

    if (!userId) {
      return NextResponse.json({ error: 'User ID not found in session.' }, { status: 401 });
    }

    const masterKey = await keyVault.getMasterKey();
    if (!masterKey) {
      return NextResponse.json({ error: 'Master encryption key not available on server.' }, { status: 500 });
    }

    const userKeysRef = db.collection('userEncryptionKeys');
    const userKeyDocRef = userKeysRef.doc(userId);

    // Try to retrieve the user's key from Firestore first
    const doc = await userKeyDocRef.get();

    let userCryptoKey: CryptoKey;
    let userKeyJwk: JsonWebKey;

    if (doc.exists) {
      // Key exists in Firestore, decrypt it
      const encryptedUserKeyBase64 = doc.data()?.encryptedKey;
      if (!encryptedUserKeyBase64) {
        return NextResponse.json({ error: 'Encrypted user key not found in Firestore document.' }, { status: 500 });
      }

      // Convert base64 string back to ArrayBuffer
      const encryptedUserKeyArray = Uint8Array.from(atob(encryptedUserKeyBase64), c => c.charCodeAt(0));
      // Create a new ArrayBuffer and copy the contents to ensure it's a plain ArrayBuffer
      const plainArrayBuffer = new ArrayBuffer(encryptedUserKeyArray.length);
      new Uint8Array(plainArrayBuffer).set(encryptedUserKeyArray);
      const decryptedUserKeyBuffer = await keyVault.decryptData(masterKey, plainArrayBuffer);
      userKeyJwk = JSON.parse(new TextDecoder().decode(decryptedUserKeyBuffer));
      userCryptoKey = await keyVault.importKey(userKeyJwk);

      logger.log(`[API] Retrieved and decrypted user key for ${userId} from Firestore.`);

    } else {
      // Key does not exist, generate a new one
      userCryptoKey = await keyVault.generateRawKey();
      userKeyJwk = await keyVault.exportKey(userCryptoKey);

      // Encrypt the user's key with the master key before storing in Firestore
      const userKeyData = new TextEncoder().encode(JSON.stringify(userKeyJwk));
      const encryptedUserKeyBuffer = await keyVault.encryptData(masterKey, userKeyData);

      // Convert ArrayBuffer to base64 string for Firestore storage
      const encryptedUserKeyBase64 = btoa(String.fromCharCode(...new Uint8Array(encryptedUserKeyBuffer)));

      await userKeyDocRef.set({ encryptedKey: encryptedUserKeyBase64 });
      logger.log(`[API] Generated, encrypted, and stored new user key for ${userId} in Firestore.`);
    }

    // Return the unencrypted user key (JWK format) to the frontend
    const response = NextResponse.json({ userKey: userKeyJwk }, { status: 200 });

    // Use unified helper to update CSRF
    const requestHost = request.headers.get('host') || undefined;
    return await setCsrfTokenResponse(response, userId, requestHost);

  } catch (error) {
    logger.error('[API] Error managing user key:', error as Error);
    return NextResponse.json({ error: 'Failed to manage user encryption key.' }, { status: 500 });
  }
}));
