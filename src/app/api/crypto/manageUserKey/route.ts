// src/app/api/crypto/manageUserKey/route.ts
import { NextResponse } from 'next/server';
import {
  getMasterKeyForApi,
  generateAesKey,
  exportKey,
  importKey,
  encryptData,
  decryptData,
} from '@/lib/cryptoUtils';
import { db } from '@/lib/firebase-admin'; // Assuming firebase-admin is set up for Firestore

// This API route will handle both generating/storing and retrieving user keys.
// It should be protected by authentication middleware.
// For simplicity, we'll assume the userId is passed in the request body for now,
// but in a real app, it would come from the authenticated session.

export async function POST(request: Request) {
  try {
    const { userId } = await request.json();

    if (!userId) {
      return NextResponse.json({ error: 'User ID is required.' }, { status: 400 });
    }

    const masterKey = await getMasterKeyForApi();
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
      const decryptedUserKeyBuffer = await decryptData(plainArrayBuffer, masterKey) as ArrayBuffer;
      userKeyJwk = JSON.parse(new TextDecoder().decode(decryptedUserKeyBuffer));
      userCryptoKey = await importKey(userKeyJwk);

      console.log(`[API] Retrieved and decrypted user key for ${userId} from Firestore.`);

    } else {
      // Key does not exist, generate a new one
      userCryptoKey = await generateAesKey();
      userKeyJwk = await exportKey(userCryptoKey);

      // Encrypt the user's key with the master key before storing in Firestore
      const userKeyData = new TextEncoder().encode(JSON.stringify(userKeyJwk));
      // Create a new ArrayBuffer and copy the data to ensure it's a standard ArrayBuffer
      const userKeyBuffer = new ArrayBuffer(userKeyData.byteLength);
      new Uint8Array(userKeyBuffer).set(userKeyData);
      const encryptedUserKeyBuffer = await encryptData(userKeyBuffer, masterKey);

      // Convert ArrayBuffer to base64 string for Firestore storage
      const encryptedUserKeyBase64 = btoa(String.fromCharCode(...new Uint8Array(encryptedUserKeyBuffer)));

      await userKeyDocRef.set({ encryptedKey: encryptedUserKeyBase64 });
      console.log(`[API] Generated, encrypted, and stored new user key for ${userId} in Firestore.`);
    }

    // Return the unencrypted user key (JWK format) to the frontend
    return NextResponse.json({ userKey: userKeyJwk }, { status: 200 });

  } catch (error) {
    console.error('[API] Error managing user key:', error);
    return NextResponse.json({ error: 'Failed to manage user encryption key.' }, { status: 500 });
  }
}
