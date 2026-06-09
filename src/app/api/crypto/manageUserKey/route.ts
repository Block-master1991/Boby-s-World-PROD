import type { AuthenticatedRequest } from "@/lib/auth-middleware";
import { withAuth } from "@/lib/auth-middleware";
import { setCsrfTokenResponse } from "@/lib/csrf/csrf-helper";
import { withCsrfProtection } from "@/lib/csrf/csrf-middleware";
import { db } from "@/lib/firebase-admin";
import { keyVault } from "@/lib/keyVaultService";
import type { UserKeyDocument } from "@/types/database";
import { logger } from "@/utils/logger";
import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";

// This API route will handle both generating/storing and retrieving user keys.
// It should be protected by authentication middleware.
// For simplicity, we'll assume the userId is passed in the request body for now,
// but in a real app, it would come from the authenticated session.

export const POST = withAuth(
  withCsrfProtection(async (request: AuthenticatedRequest) => {
    try {
      const userId = request.user?.sub;

      if (!userId) {
        return NextResponse.json({ error: "User ID not found in session." }, { status: 401 });
      }

      const masterKey = await keyVault.getMasterKey();
      if (!masterKey) {
        return NextResponse.json(
          { error: "Master encryption key not available on server." },
          { status: 500 }
        );
      }

      const userKeysRef = db.collection("userEncryptionKeys");
      const userKeyDocRef = userKeysRef.doc(userId);

      // Try to retrieve the user's key from Firestore first
      const doc = await userKeyDocRef.get();

      let userKeys: { jwk: JsonWebKey; crypto: CryptoKey };

      if (doc.exists) {
        userKeys = await retrieveStoredKey(doc.data() as UserKeyDocument, masterKey);
        logger.log(`[API] Retrieved and decrypted user key for ${userId} from Firestore.`);
      } else {
        userKeys = await generateAndStoreNewKey(userKeyDocRef, masterKey, userId);
      }

      const response = NextResponse.json({ userKey: userKeys.jwk }, { status: 200 });

      // Use unified helper to update CSRF
      const requestHost = request.headers.get("host") || undefined;
      return await setCsrfTokenResponse(response, userId, requestHost);
    } catch (error) {
      logger.error("[API] Error managing user key:", error as Error);
      return NextResponse.json({ error: "Failed to manage user encryption key." }, { status: 500 });
    }
  })
);

async function retrieveStoredKey(data: UserKeyDocument, masterKey: CryptoKey) {
  const encryptedBase64 = data.encryptedKey;
  if (!encryptedBase64) throw new Error("Encrypted user key not found.");

  const encryptedArray = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0));
  const plainBuffer = new ArrayBuffer(encryptedArray.length);
  new Uint8Array(plainBuffer).set(encryptedArray);

  const decryptedBuffer = await keyVault.decryptData(masterKey, plainBuffer);
  const jwk = JSON.parse(new TextDecoder().decode(decryptedBuffer)) as JsonWebKey;
  const crypto = await keyVault.importKey(jwk);

  return { jwk, crypto };
}

async function generateAndStoreNewKey(
  docRef: { set: (data: Partial<UserKeyDocument>) => Promise<unknown> },
  masterKey: CryptoKey,
  userId: string
) {
  const crypto = await keyVault.generateRawKey();
  const jwk = await keyVault.exportKey(crypto);

  const userKeyData = new TextEncoder().encode(JSON.stringify(jwk));
  const encryptedBuffer = await keyVault.encryptData(masterKey, userKeyData);
  const encryptedBase64 = btoa(String.fromCharCode(...new Uint8Array(encryptedBuffer)));

  // Ensure document completeness according to UserKeyDocument interface
  await docRef.set({
    encryptedKey: encryptedBase64,
    userId: userId,
    createdAt: FieldValue.serverTimestamp() as unknown as UserKeyDocument["createdAt"],
  });

  logger.log(`[API] Generated and stored new user key for ${userId} in Firestore.`);

  return { jwk, crypto };
}
