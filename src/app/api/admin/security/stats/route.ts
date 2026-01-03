
import { NextResponse } from 'next/server';
import redis from '@/lib/redis';
import { initializeAdminApp } from '@/lib/firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from '@/utils/logger';

// import { currentUser } from '@/lib/auth'; // Assuming auth check is needed

export const dynamic = 'force-dynamic';

export async function GET() {
    // TODO: Add Admin Authorization check here
    // const user = await currentUser();
    // if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const stats = {
            redisStatus: 'unknown',
            totalRequests: 0,
            blockedRequests: 0,
            suspiciousActivity: [] as any[],
            blockedIps: [] as any[],
            systemHealth: 'healthy',
            isPanicMode: false
        };

        // 1. Check Redis Connection & Stats
        if (redis) {
            try {
                // Check if we can ping redis
                const pong = await redis.ping();
                stats.redisStatus = pong === 'PONG' ? 'connected' : 'error';

                // Check Panic Mode Status
                const panic = await redis.get('security:panic_mode');
                stats.isPanicMode = panic === '1';

                if (stats.redisStatus === 'connected') {
                    // Fetch real-time counters (Assuming we implement counters in RateLimiter)
                    // For now, we might not have global counters, so we mock or fetch what we have
                    // In a real app, AdvancedRateLimiter should increment a global 'stats:total_requests' key

                    const total = await redis.get('stats:total_requests');
                    const blocked = await redis.get('stats:blocked_requests');

                    stats.totalRequests = total ? parseInt(total) : 0;
                    stats.blockedRequests = blocked ? parseInt(blocked) : 0;

                    // Fetch recent suspicious activity
                    const recentActivity = await redis.lrange('suspicious_activity', 0, 19);
                    stats.suspiciousActivity = recentActivity.map(item => JSON.parse(item));
                }
            } catch (redisError) {
                logger.warn('Redis connection failed in Stats API');
                stats.redisStatus = 'disconnected';
                stats.systemHealth = 'degraded';
            }
        } else {
            stats.redisStatus = 'not_configured';
        }

        // 2. Fetch Persistent Blocklist from Firestore
        try {
            await initializeAdminApp();
            const db = getFirestore();
            const snapshot = await db.collection('ratelimit_blacklist').orderBy('blockedAt', 'desc').limit(20).get();

            stats.blockedIps = snapshot.docs.map(doc => ({
                ip: doc.id,
                ...doc.data()
            }));

        } catch (firestoreError) {
            logger.error('Firestore fetch failed:', firestoreError as Error);
            // Non-critical if firestore fails, just return empty list
        }

        return NextResponse.json(stats);

    } catch (error) {
        logger.error('Error fetching security stats:', error as Error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
