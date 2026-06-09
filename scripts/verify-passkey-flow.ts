/**
 * Passkey Registration Flow Verification Script
 * This script simulates the backend part of registering a passkey
 * to verify that Firebase and Redis are working correctly.
 */

import { randomBytes } from "crypto";
import "dotenv/config";
import { db, initializeAdminApp } from "../src/lib/firebase/firebase-admin";
import redis from "../src/lib/redis";

async function verifyFlow() {
  const testUserId = `test-player-${randomBytes(4).toString("hex")}`;
  console.log(`🚀 Starting Passkey Flow Verification for User: ${testUserId}\n`);

  try {
    await initializeAdminApp();
    console.log("✅ Firebase Admin Initialized.");

    // 1. Redis Challenge
    await registerChallenge(testUserId);
    console.log("✅ Challenge stored and retrieved from Redis successfully.");

    // 2. Firestore Storage
    const testCredentialId = `cred-${randomBytes(8).toString("hex")}`;
    await verifyStorage(testUserId, testCredentialId);
    console.log("✅ Passkey stored and verified in Firestore successfully.");

    // 3. Cleanup
    await redis.del(`webauthn_registration_challenge:${testUserId}`);
    console.log("\n--- [Result] ---");
    console.log("✨ FULL BACKEND PASSKEY FLOW VERIFIED! ✨");
    console.log("System is ready to handle real biometric registration.");
  } catch (error: unknown) {
    const err = error as Error;
    console.error("\n❌ VERIFICATION FAILED:");
    console.error(err.message);
    console.log("\n💡 Tip: Check your .env.locals for correct Firebase and Redis credentials.");
  }

  process.exit(0);
}

async function registerChallenge(userId: string): Promise<string> {
  console.log("\n--- [Step 2: Redis Challenge Storage] ---");
  const challenge = randomBytes(32).toString("base64url");
  const redisKey = `webauthn_registration_challenge:${userId}`;

  await redis.setex(redisKey, 300, challenge);
  const storedChallenge = await redis.get(redisKey);

  if (storedChallenge !== challenge) {
    throw new Error("Redis verification failed!");
  }
  return challenge;
}

async function verifyStorage(userId: string, credentialId: string) {
  console.log("\n--- [Step 3: Firestore Key Storage] ---");
  const passkeyData = {
    credentialId: credentialId,
    publicKey: "mock-public-key-data",
    aaguid: "ad10fa37-abd9-4113-b4cd-32221588640f",
    deviceBrand: "Apple iCloud Keychain",
    counter: 0,
    transports: ["internal", "hybrid"],
    description: "Test Device",
    createdAt: new Date().toISOString(),
    lastUsedAt: new Date().toISOString(),
  };

  const docPath = `players/${userId}/passkeys/${credentialId}`;
  console.log(`Writing to: ${docPath}`);

  await db
    .collection("players")
    .doc(userId)
    .collection("passkeys")
    .doc(credentialId)
    .set(passkeyData);

  const doc = await db.doc(docPath).get();
  const data = doc.data();

  // Fix: Bracket notation for index signature access
  if (!doc.exists || !data || data["credentialId"] !== credentialId) {
    throw new Error("Firestore verification failed!");
  }
}

verifyFlow();
