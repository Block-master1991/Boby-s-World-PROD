/**
 * Emergency Unblock Utility - TypeScript Version
 * Securely unblocks localhost IPs from Redis and Firestore rate limits.
 * Integrates with the professional logging and audit system.
 */

import 'dotenv/config';
import { initializeAdminApp, db } from '../src/lib/firebase-admin';
import Redis from 'ioredis';
import { professionalLogger } from '../src/lib/logging';

async function unblockLocalhost() {
    const correlationId = `emergency-unblock-${Date.now()}`;
    
    professionalLogger.info('--- Starting Emergency Localhost Unblock ---', { correlationId });

    const localhostIps = ['127.0.0.1', '::1', '::ffff:127.0.0.1'];

    // 1. Redis Unblock
    try {
        const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
        const redis = new Redis(redisUrl);
        
        professionalLogger.debug(`Connecting to Redis for unblocking`, { 
            correlationId,
            url: redisUrl.includes('@') ? '***REDACTED***' : redisUrl 
        });

        for (const ip of localhostIps) {
            await redis.del(`ratelimit:blacklist:${ip}`);
            await redis.del(`ratelimit:whitelist:${ip}`);
            professionalLogger.info(`Cleared Redis entries for ${ip}`, { correlationId, ip });
        }
        
        redis.disconnect();
    } catch (error: any) {
        professionalLogger.warn('Redis unblock operation failed', { 
            correlationId, 
            error: error.message 
        });
    }

    // 2. Firestore Unblock
    try {
        professionalLogger.debug('Initializing Firebase Admin for unblocking', { correlationId });
        await initializeAdminApp();

        if (!db) {
            throw new Error('Firestore database not initialized');
        }

        for (const ip of localhostIps) {
            // Delete from blacklist
            await db.collection('ratelimit_blacklist').doc(ip).delete();
            
            // Add to whitelist for safety
            await db.collection('ratelimit_whitelist').doc(ip).set({
                reason: 'Emergency Localhost Unblock',
                addedAt: new Date().toISOString(),
                correlationId
            });

            professionalLogger.info(`Updated Firestore status for ${ip}`, { correlationId, ip });
        }
    } catch (error: any) {
        professionalLogger.error('Firestore unblock operation failed', { 
            correlationId, 
            error: error.message 
        });
    }

    professionalLogger.info('--- Emergency Unblock Operation Completed ---', { correlationId });
    process.exit(0);
}

// Execute with error handling
unblockLocalhost().catch((error) => {
    professionalLogger.fatal('Critical failure in unblock script', error);
    process.exit(1);
});
