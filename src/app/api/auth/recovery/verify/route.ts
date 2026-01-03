/**
 * Account Recovery Verification API Route
 * Handles verification of recovery code and reset of passkeys
 */


import { NextResponse } from 'next/server';
import redis from '@/lib/redis';
import { db } from '@/lib/firebase-admin';
import { withCsrfProtection } from '@/lib/csrf-middleware';
import { auditLogger } from '@/lib/audit-logger';
import { logger } from '@/utils/logger';

/**
 * POST /api/auth/recovery/verify
 * Verifies recovery code and allows passkey reset
 */
export const POST = withCsrfProtection(async (request: Request) => {
    try {
        const body = await request.json();
        const { recoveryToken, recoveryCode, newPasskeyDescription } = body;

        if (!recoveryToken || !recoveryCode) {
            return NextResponse.json({ error: 'Recovery token and code are required' }, { status: 400 });
        }

        // Get recovery data from Redis
        const recoveryDataStr = await redis.get(`recovery_token:${recoveryToken}`);
        if (!recoveryDataStr) {
            return NextResponse.json({ error: 'Recovery token expired or invalid' }, { status: 400 });
        }

        const recoveryData = JSON.parse(recoveryDataStr);

        // Verify recovery code
        if (recoveryData.recoveryCode !== recoveryCode.toUpperCase()) {
            // Log failed attempt
            await auditLogger.logEvent(
                'SUSPICIOUS_ACTIVITY',
                'Invalid recovery code attempt',
                { userId: recoveryData.publicKey },
                'warn'
            );

            return NextResponse.json({ error: 'Invalid recovery code' }, { status: 400 });
        }

        // Check cooldown period (24 hours after recovery initiation)
        const timeElapsed = Date.now() - recoveryData.timestamp;
        if (timeElapsed < 24 * 60 * 60 * 1000) { // 24 hours
            return NextResponse.json(
                { error: 'Recovery is still in cooldown period. Please wait 24 hours after initiation.' },
                { status: 429 }
            );
        }

        const { publicKey } = recoveryData;

        // Clear recovery data and allow passkey reset
        // 1. Delete all existing passkeys for this user to ensure account is reset
        const passkeysRef = db.collection('players').doc(publicKey).collection('passkeys');
        const snapshots = await passkeysRef.get();
        const batch = db.batch();
        snapshots.forEach(doc => {
            batch.delete(doc.ref);
        });
        await batch.commit();

        logger.log(`[Recovery] All existing passkeys for ${publicKey} cleared during recovery reset.`);

        // 2. Clear recovery progress tokens
        await redis.del(`recovery_token:${recoveryToken}`);
        await redis.del(`recovery_in_progress:${publicKey}`);

        // Log successful recovery verification
        await auditLogger.logEvent(
            'SUSPICIOUS_ACTIVITY',
            'Account recovery verified successfully',
            { userId: publicKey },
            'warn'
        );

        return NextResponse.json({
            success: true,
            message: 'Recovery verified. You can now set up a new passkey.',
            recoveryToken: crypto.randomUUID() // New token for passkey setup
        });

    } catch (error) {
        logger.error('[Recovery Verify] Error:', error as Error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
});

/**
 * DELETE /api/auth/recovery/cancel
 * Cancels recovery process (optional cleanup)
 */
export const DELETE = withCsrfProtection(async (request: Request) => {
    try {
        const body = await request.json();
        const { recoveryToken } = body;

        if (!recoveryToken) {
            return NextResponse.json({ error: 'Recovery token is required' }, { status: 400 });
        }

        // Get recovery data to identify user
        const recoveryDataStr = await redis.get(`recovery_token:${recoveryToken}`);
        if (recoveryDataStr) {
            const recoveryData = JSON.parse(recoveryDataStr);
            await redis.del(`recovery_token:${recoveryToken}`);
            await redis.del(`recovery_in_progress:${recoveryData.publicKey}`);

            await auditLogger.logEvent(
                'SUSPICIOUS_ACTIVITY',
                'Account recovery cancelled',
                { userId: recoveryData.publicKey },
                'info'
            );
        }

        return NextResponse.json({ success: true, message: 'Recovery cancelled' });

    } catch (error) {
        logger.error('[Recovery Cancel] Error:', error as Error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
});
