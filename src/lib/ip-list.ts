import { logger } from "@/utils/logger";
import { getFirestore } from "firebase-admin/firestore";
import { initializeAdminApp } from "./firebase-admin";
import redis from "./redis";

// Auto-block duration (24 hours). Manual admin blocks are permanent.
const AUTO_BLOCK_TTL_SECONDS = 86400; // 24h
const REDIS_CACHE_TTL = 600; // 10 minutes

/** Check if an IP is in the whitelist or blacklist (Redis cache → Firestore) */
export async function isIpInList(list: "whitelist" | "blacklist", ip: string): Promise<boolean> {
  // Always permit localhost in whitelist and prevent it from being in blacklist
  const isLocalhost = ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
  if (isLocalhost) {
    return list === "whitelist";
  }

  const redisKey = `ratelimit:${list}:${ip}`;
  try {
    // 1. Check Redis cache first (fast path)
    if (redis) {
      try {
        const cached = await redis.get(redisKey);
        if (cached !== null) return cached === "1";
      } catch (e) {
        logger.warn(`[IP List] Redis error for ${list}:`, e);
        // Fall through to Firestore
      }
    }

    // 2. Check Firestore
    await initializeAdminApp();
    const db = getFirestore();
    const doc = await db.collection(`ratelimit_${list}`).doc(ip).get();

    if (!doc.exists) {
      // Cache negative result
      if (redis) {
        await redis.set(redisKey, "0", "EX", REDIS_CACHE_TTL).catch(() => {});
      }
      return false;
    }

    const data = doc.data();

    // Check if this is a temporary auto-block that has expired
    if (list === "blacklist" && data?.["expiresAt"] && !data?.["permanent"]) {
      const expiresAt = new Date(data["expiresAt"]).getTime();
      if (Date.now() > expiresAt) {
        // Block has expired — clean up silently
        logger.log(`[IP List] Auto-block expired for IP ${ip}, removing.`);
        await doc.ref.delete().catch(() => {});
        if (redis) {
          await redis.del(redisKey).catch(() => {});
        }
        return false;
      }
    }

    // Cache positive result
    if (redis) {
      await redis.set(redisKey, "1", "EX", REDIS_CACHE_TTL).catch(() => {});
    }
    return true;
  } catch (error) {
    logger.error(`[IP List] Error checking ${list}:`, error);
    return false; // Fail safe (assume not in list)
  }
}

/**
 * Block an IP address.
 * @param ip - The IP to block.
 * @param reason - Why it was blocked.
 * @param permanent - If true, the block never expires (admin manual action).
 *                    If false (default), the block expires after 24h (auto-block).
 */
export async function blockIp(ip: string, reason: string, permanent = false): Promise<void> {
  // Never block localhost
  if (ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1") {
    logger.warn(`[IP Block] Ignored block request for localhost IP: ${ip}`);
    return;
  }

  const redisKey = `ratelimit:blacklist:${ip}`;
  const expiresAt = permanent ? null : new Date(Date.now() + AUTO_BLOCK_TTL_SECONDS * 1000).toISOString();

  // 1. Block in Redis (always time-limited for safety)
  await redis.set(redisKey, "1", "EX", AUTO_BLOCK_TTL_SECONDS).catch(() => {});

  // 2. Persist in Firestore
  try {
    await initializeAdminApp();
    const db = getFirestore();
    await db.collection("ratelimit_blacklist").doc(ip).set({
      reason,
      blockedAt: new Date().toISOString(),
      expiresAt,          // null = permanent (admin action), ISO string = auto-expiry
      permanent,          // explicit flag for clarity
      source: permanent ? "AdminManual" : "AdvancedRateLimiter",
    });
    logger.log(`[IP Block] IP ${permanent ? "permanently" : "temporarily (24h)"} blocked: ${ip} — ${reason}`);
  } catch (error) {
    logger.error(`[IP Block] Failed to save block in Firestore for IP: ${ip}`, error);
    // Redis block is still active as a fallback
  }
}

/**
 * Remove an IP from the blacklist (both Redis and Firestore).
 * Can be called programmatically or from admin routes.
 */
export async function unblockIp(ip: string): Promise<void> {
  const redisKey = `ratelimit:blacklist:${ip}`;

  // 1. Remove from Redis
  await redis.del(redisKey).catch(() => {});

  // 2. Remove from Firestore
  try {
    await initializeAdminApp();
    const db = getFirestore();
    await db.collection("ratelimit_blacklist").doc(ip).delete();
    logger.log(`[IP Unblock] IP removed from blacklist: ${ip}`);
  } catch (error) {
    logger.error(`[IP Unblock] Failed to remove from Firestore: ${ip}`, error);
  }
}
