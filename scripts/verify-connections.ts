import * as dotenv from "dotenv";
import admin from "firebase-admin";
import * as fs from "fs";
import type { RedisOptions } from "ioredis";
import Redis from "ioredis";
import * as path from "path";

// Load .env.local
const envPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
  console.log("✅ Loaded .env.local");
} else {
  console.warn("⚠️  .env.local not found, checking .env or system variables");
  dotenv.config();
}

const { REDIS_URL, FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY } = process.env;

async function checkRedis(): Promise<boolean> {
  console.log("\n--- 🔴 Checking Redis Connection ---");
  if (!REDIS_URL) {
    console.error("❌ REDIS_URL is missing in environment variables.");
    return false;
  }

  try {
    // Handle Upstash "rediss://" conversion if needed
    let connectionUrl = REDIS_URL;
    if (connectionUrl.includes("upstash") && connectionUrl.startsWith("redis://")) {
      connectionUrl = connectionUrl.replace("redis://", "rediss://");
      console.log("🔄 Auto-converted Upstash URL to rediss:// (TLS)");
    }

    const redisOptions: RedisOptions = {
      maxRetriesPerRequest: 1,
      connectTimeout: 5000,
    };

    if (connectionUrl.startsWith("rediss://")) {
      redisOptions.tls = { rejectUnauthorized: false };
    }

    const redis = new Redis(connectionUrl, redisOptions);

    await new Promise((resolve, reject) => {
      redis.on("connect", resolve);
      redis.on("error", reject);
    });

    await redis.set("verify_connection_test", "success", "EX", 10);
    const val = await redis.get("verify_connection_test");

    await redis.quit();

    if (val === "success") {
      console.log("✅ Redis Connected & Write/Read Successful!");
      return true;
    }

    console.error("❌ Redis Write/Read Verification Failed.");
    return false;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("❌ Redis Connection Failed:", errorMessage);
    return false;
  }
}

async function checkFirebase(): Promise<boolean> {
  console.log("\n--- 🔥 Checking Firebase Admin SDK ---");

  if (!FIREBASE_PROJECT_ID || !FIREBASE_CLIENT_EMAIL || !FIREBASE_PRIVATE_KEY) {
    console.error("❌ Firebase credentials missing in environment variables.");
    if (!FIREBASE_PROJECT_ID) console.error("   - Missing: FIREBASE_PROJECT_ID");
    if (!FIREBASE_CLIENT_EMAIL) console.error("   - Missing: FIREBASE_CLIENT_EMAIL");
    if (!FIREBASE_PRIVATE_KEY) console.error("   - Missing: FIREBASE_PRIVATE_KEY");
    return false;
  }

  try {
    // Initialize if not already initialized
    if (admin.apps.length === 0) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: FIREBASE_PROJECT_ID,
          clientEmail: FIREBASE_CLIENT_EMAIL,
          privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
        }),
      });
    }

    const db = admin.firestore();
    // Try to list collections (requires read permission) or just a simple read
    try {
      await db.collection("test_connection").doc("ping").get();
      console.log("✅ Firebase Admin Authenticated & Firestore Accessible!");
      return true;
    } catch (readError: unknown) {
      const errorMessage = readError instanceof Error ? readError.message : "Unknown error";
      console.error("❌ Firebase Auth Success, but Firestore Read Failed:", errorMessage);
      return false;
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("❌ Firebase Initialization Failed:", errorMessage);
    return false;
  }
}

async function verifyAll() {
  console.log("🚀 Starting Connection Verification Script...\n");

  const redisOk = await checkRedis();
  const firebaseOk = await checkFirebase();

  console.log("\n----------------------------------------");
  if (redisOk && firebaseOk) {
    console.log("✅✅ SYSTEM READY: All backend connections verified.");
    process.exit(0);
  } else {
    console.error("❌❌ SYSTEM CHECK FAILED: Please fix the errors above.");
    process.exit(1);
  }
}

verifyAll().catch(err => {
  console.error("Verification script failed:", err);
  process.exit(1);
});
