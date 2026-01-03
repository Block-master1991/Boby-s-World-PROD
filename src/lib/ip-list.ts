import { initializeAdminApp } from './firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import redis from './redis';
import { logger } from '@/utils/logger';

// Get IP status from Redis cache or Firestore
export async function isIpInList(list: 'whitelist' | 'blacklist', ip: string): Promise<boolean> {
  // Always permit localhost in whitelist and prevent it from being in blacklist
  const isLocalhost = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
  if (isLocalhost) {
    return list === 'whitelist';
  }

  const redisKey = `ratelimit:${list}:${ip}`;
  try {
    // Check cache first
    if (redis) {
      try {
        const cached = await redis.get(redisKey);
        if (cached !== null) return cached === '1';
      } catch (e) {
        logger.warn(`[IP List] Redis error for ${list}:`, e);
        // Continue to Firestore
      }
    }

    // If not in cache, check Firestore
    await initializeAdminApp();
    const db = getFirestore();
    const doc = await db.collection(`ratelimit_${list}`).doc(ip).get();
    const exists = doc.exists;

    // Cache the result in Redis (e.g., 10 minutes)
    if (redis) {
      try {
        await redis.set(redisKey, exists ? '1' : '0', 'EX', 600);
      } catch (e) { /* ignore redis set error */ }
    }
    return exists;
  } catch (error) {
    logger.error(`[IP List] Error checking ${list}:`, error);
    return false; // Fail safe (assume not in list)
  }
}

// Add IP to blacklist permanently
export async function blockIp(ip: string, reason: string): Promise<void> {
  // Never block localhost
  if (ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1') {
    logger.warn(`[IP Block] Ignored block request for localhost IP: ${ip}`);
    return;
  }

  const redisKey = `ratelimit:blacklist:${ip}`;

  // 1. Immediate block in Redis (for 24 hours as start)
  await redis.set(redisKey, '1', 'EX', 86400);

  // 2. Permanent block in Firestore
  try {
    await initializeAdminApp();
    const db = getFirestore();
    await db.collection('ratelimit_blacklist').doc(ip).set({
      reason,
      blockedAt: new Date().toISOString(),
      source: 'AdvancedRateLimiter'
    });
    logger.log(`[IP Block] IP permanently blocked in Firestore: ${ip}`);
  } catch (error) {
    logger.error(`[IP Block] Failed to save block in Firestore for IP: ${ip}`, error);
    // Don't stop execution, Redis block is sufficient temporarily
  }
}
