const { initializeAdminApp } = require('./dist/lib/firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');
const Redis = require('ioredis');

async function unblockLocalhost() {
    console.log('--- Unblocking Localhost ---');

    // 1. Redis
    try {
        const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
        console.log(`Connecting to Redis: ${redisUrl.split('@')[1] || redisUrl}`);
        const redis = new Redis(redisUrl);
        const ips = ['127.0.0.1', '::1', '::ffff:127.0.0.1'];

        for (const ip of ips) {
            await redis.del(`ratelimit:blacklist:${ip}`);
            await redis.del(`ratelimit:whitelist:${ip}`); // Clear cache to force refresh
            console.log(`Cleared Redis blacklist for ${ip}`);
        }
        redis.disconnect();
    } catch (e) {
        console.warn('Redis unblock failed (maybe not running):', e.message);
    }

    // 2. Firestore
    try {
        // Need to set env for firebase-admin if not set
        process.env.FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'boby-s-world-f3438';

        const db = getFirestore();
        const ips = ['127.0.0.1', '::1', '::ffff:127.0.0.1'];

        for (const ip of ips) {
            await db.collection('ratelimit_blacklist').doc(ip).delete();
            console.log(`Deleted Firestore blacklist entry for ${ip}`);

            await db.collection('ratelimit_whitelist').doc(ip).set({
                reason: 'Localhost Emergency Unblock',
                addedAt: new Date().toISOString()
            });
            console.log(`Added Firestore whitelist entry for ${ip}`);
        }
    } catch (e) {
        console.error('Firestore unblock failed:', e.message);
    }

    console.log('--- Done ---');
    process.exit(0);
}

unblockLocalhost();
