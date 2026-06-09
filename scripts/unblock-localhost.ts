/**
 * Emergency Unblock Utility - TypeScript Version
 * Securely unblocks localhost IPs from Redis and Firestore rate limits.
 * Integrates with the professional logging and audit system.
 */

import "dotenv/config";
import Redis from "ioredis";
import { db, initializeAdminApp } from "../src/lib/firebase/firebase-admin";
import { professionalLogger } from "../src/lib/logging";

async function redisUnblock(localhostIps: string[], correlationId: string) {
  try {
    const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
    const redis = new Redis(redisUrl);

    professionalLogger.debug(`Connecting to Redis for unblocking`, {
      correlationId,
      url: redisUrl.includes("@") ? "***REDACTED***" : redisUrl,
    });

    const promises = localhostIps.map(async ip => {
      await redis.del(`ratelimit:blacklist:${ip}`);
      await redis.del(`ratelimit:whitelist:${ip}`);
      professionalLogger.info(`Cleared Redis entries for ${ip}`, { correlationId, ip });
    });

    await Promise.all(promises);
    redis.disconnect();
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    professionalLogger.warn("Redis unblock operation failed", {
      correlationId,
      error: errorMessage,
    });
  }
}

async function firestoreUnblock(localhostIps: string[], correlationId: string) {
  try {
    professionalLogger.debug("Initializing Firebase Admin for unblocking", { correlationId });
    await initializeAdminApp();

    if (!db) {
      throw new Error("Firestore database not initialized");
    }

    const promises = localhostIps.map(async ip => {
      // Delete from blacklist
      await db!.collection("ratelimit_blacklist").doc(ip).delete();

      // Add to whitelist for safety
      await db!.collection("ratelimit_whitelist").doc(ip).set({
        reason: "Emergency Localhost Unblock",
        addedAt: new Date().toISOString(),
        correlationId,
      });

      professionalLogger.info(`Updated Firestore status for ${ip}`, { correlationId, ip });
    });

    await Promise.all(promises);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    professionalLogger.error("Firestore unblock operation failed", {
      correlationId,
      error: errorMessage,
    });
  }
}

async function unblockLocalhost() {
  const correlationId = `emergency-unblock-${Date.now()}`;
  professionalLogger.info("--- Starting Emergency Localhost Unblock ---", { correlationId });

  const localhostIps = ["127.0.0.1", "::1", "::ffff:127.0.0.1", "unknown"];

  await redisUnblock(localhostIps, correlationId);
  await firestoreUnblock(localhostIps, correlationId);

  professionalLogger.info("--- Emergency Unblock Operation Completed ---", { correlationId });
  process.exit(0);
}

// Execute with error handling
unblockLocalhost().catch((error: unknown) => {
  const errorMessage = error instanceof Error ? error : new Error("Unknown critical failure");
  professionalLogger.fatal("Critical failure in unblock script", errorMessage);
  process.exit(1);
});
