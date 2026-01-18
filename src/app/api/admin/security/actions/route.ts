import type { AdminRequest } from '@/lib/admin-middleware';
import { withSignedAdminAuth } from '@/lib/admin-middleware';
import { withCsrfProtection } from '@/lib/csrf-middleware';
import { initializeAdminApp } from '@/lib/firebase-admin';
import redis from '@/lib/redis';
import { logger } from '@/utils/logger';
import { getFirestore } from 'firebase-admin/firestore';
import { NextResponse } from 'next/server';

export const POST = withSignedAdminAuth(withCsrfProtection(async (request: AdminRequest) => {
    try {
        const body = await request.json();
        const { action, ip, enabled } = body;

        if (!action) {
            return NextResponse.json({ error: 'Missing action' }, { status: 400 });
        }

        if (action === 'unblock_ip') {
            if (!ip) return NextResponse.json({ error: 'Missing IP' }, { status: 400 });

            // 1. Remove from Redis
            if (redis) {
                await redis.del(`ratelimit:blacklist:${ip}`);
            }

            // 2. Remove from Firestore
            await initializeAdminApp();
            const db = getFirestore();
            await db.collection('ratelimit_blacklist').doc(ip).delete();

            return NextResponse.json({ success: true, message: `IP ${ip} unblocked` });
        }

        if (action === 'toggle_panic_mode') {
            if (typeof enabled !== 'boolean') return NextResponse.json({ error: 'Missing enabled flag' }, { status: 400 });

            if (redis) {
                if (enabled) {
                    await redis.set('security:panic_mode', '1');
                } else {
                    await redis.del('security:panic_mode');
                }
                return NextResponse.json({ success: true, panicMode: enabled });
            }
            return NextResponse.json({ error: 'Redis unavailable for Panic Mode' }, { status: 503 });
        }

        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

    } catch (error) {
        logger.error('Security Action Failed:', error as Error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}));
