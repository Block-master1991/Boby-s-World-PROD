import { withAdminAuth } from '@/lib/admin-middleware';
import { initializeAdminApp } from '@/lib/firebase-admin';
import redis from '@/lib/redis';
import { logger } from '@/utils/logger';
import { getFirestore } from 'firebase-admin/firestore';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

interface SuspiciousActivity { ip?: string; action?: string; timestamp?: string; [key: string]: unknown; }
interface BlockedIp { ip: string; blockedAt?: string; reason?: string; [key: string]: unknown; }
interface SecurityStats {
    redisStatus: string;
    totalRequests: number;
    blockedRequests: number;
    suspiciousActivity: SuspiciousActivity[];
    blockedIps: BlockedIp[];
    systemHealth: string;
    isPanicMode: boolean;
}

async function fetchRedisStats(stats: SecurityStats): Promise<void> {
    if (!redis) { stats.redisStatus = 'not_configured'; return; }
    try {
        const pong = await redis.ping();
        stats.redisStatus = pong === 'PONG' ? 'connected' : 'error';
        const panic = await redis.get('security:panic_mode');
        stats.isPanicMode = panic === '1';

        if (stats.redisStatus === 'connected') {
            const total = await redis.get('stats:total_requests');
            const blocked = await redis.get('stats:blocked_requests');
            stats.totalRequests = total ? parseInt(total) : 0;
            stats.blockedRequests = blocked ? parseInt(blocked) : 0;

            const recentActivity = await redis.lrange('suspicious_activity', 0, 19);
            stats.suspiciousActivity = recentActivity.map(item => JSON.parse(item) as SuspiciousActivity);
        }
    } catch {
        logger.warn('Redis connection failed in Stats API');
        stats.redisStatus = 'disconnected';
        stats.systemHealth = 'degraded';
    }
}

async function fetchBlockedIps(stats: SecurityStats): Promise<void> {
    try {
        await initializeAdminApp();
        const db = getFirestore();
        const snapshot = await db.collection('ratelimit_blacklist').orderBy('blockedAt', 'desc').limit(20).get();
        stats.blockedIps = snapshot.docs.map(doc => ({ ip: doc.id, ...doc.data() } as BlockedIp));
    } catch (firestoreError) {
        logger.error('Firestore fetch failed:', firestoreError instanceof Error ? firestoreError.message : String(firestoreError));
    }
}

export const GET = withAdminAuth(async () => {
    try {
        const stats: SecurityStats = {
            redisStatus: 'unknown',
            totalRequests: 0,
            blockedRequests: 0,
            suspiciousActivity: [],
            blockedIps: [],
            systemHealth: 'healthy',
            isPanicMode: false
        };

        await fetchRedisStats(stats);
        await fetchBlockedIps(stats);

        return NextResponse.json(stats);
    } catch (error) {
        logger.error('Error fetching security stats:', error instanceof Error ? error.message : String(error));
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
});
