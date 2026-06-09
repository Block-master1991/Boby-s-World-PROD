/**
 * System Diagnostics Script
 * Verifies connections to Firebase and Redis based on environment variables.
 */

import "dotenv/config";
import { db, initializeAdminApp } from "../src/lib/firebase/firebase-admin";
import redis from "../src/lib/redis";

async function runDiagnostics() {
  console.log("🔍 Starting System Diagnostics...\n");

  // 1. Firebase Check
  console.log("--- [Firebase Admin] ---");
  try {
    const app = await initializeAdminApp();
    if (app) {
      console.log("✅ Firebase initialized successfully.");
      // Test Firestore access
      const collections = await db.listCollections();
      console.log(`✅ Firestore connection established. (Found ${collections.length} collections)`);
    } else {
      console.log("❌ Firebase initialization skipped (Missing or invalid environment variables).");
    }
  } catch (error: unknown) {
    const err = error as Error;
    console.error("❌ Firebase Error:", err.message);
  }

  // 2. Redis Check
  console.log("\n--- [Redis Connection] ---");
  try {
    // Since redis is a proxy, we need to call an actual method to trigger connection
    const ping = await redis.ping();
    if (ping === "PONG") {
      console.log("✅ Redis connected successfully (PONG).");
    } else {
      console.log("❌ Redis returned unexpected response:", ping);
    }
  } catch (error: unknown) {
    const err = error as Error;
    console.error("❌ Redis Error:", err.message);
    console.log(
      "💡 Note: Ensure your REDIS_URL starts with rediss:// if using TLS (like Upstash)."
    );
  }

  console.log("\n--- [Environment] ---");
  console.log("NODE_ENV:", process.env["NODE_ENV"]);
  console.log("RESEND_API_KEY:", process.env["RESEND_API_KEY"] ? "Set" : "Missing");
  console.log(
    "NEXT_PUBLIC_ADMIN_WALLET_ADDRESS:",
    process.env["NEXT_PUBLIC_ADMIN_WALLET_ADDRESS"] ? "Set" : "Missing"
  );

  console.log("\n🏁 Diagnostics Complete.");
  process.exit(0);
}

runDiagnostics();
