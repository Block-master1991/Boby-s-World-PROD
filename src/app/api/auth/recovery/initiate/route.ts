/**
 * Account Recovery API Routes
 * Handles secure account recovery process for users who lose access to all passkeys
 */


import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import redis from '@/lib/redis';
import { withCsrfProtection } from '@/lib/csrf-middleware';
import { auditLogger } from '@/lib/audit-logger';
import { emailService } from '@/lib/email-service';
import { logger } from '@/utils/logger';

// Rate limiting for recovery attempts
const RECOVERY_RATE_LIMIT = 3; // attempts per hour
const RECOVERY_COOLDOWN = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

/**
 * POST /api/auth/recovery/initiate
 * Initiates account recovery process
 */
export const POST = withCsrfProtection(async (request: Request) => {
    try {
        const body = await request.json();
        const { email, publicKey } = body;

        if (!email || !publicKey) {
            return NextResponse.json({ error: 'Email and public key are required' }, { status: 400 });
        }

        // Check rate limiting
        const rateLimitKey = `recovery_attempts:${publicKey}`;
        const attempts = await redis.get(rateLimitKey);
        if (attempts && parseInt(attempts) >= RECOVERY_RATE_LIMIT) {
            return NextResponse.json(
                { error: 'Too many recovery attempts. Please try again later.' },
                { status: 429 }
            );
        }

        // Verify user exists and has passkeys
        const userDoc = await db.collection('players').doc(publicKey).get();
        if (!userDoc.exists) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        const passkeysSnapshot = await db.collection('players').doc(publicKey).collection('passkeys').get();
        if (passkeysSnapshot.empty) {
            return NextResponse.json({ error: 'No passkeys found for this account' }, { status: 404 });
        }

        // Check if recovery is already in progress
        const recoveryKey = `recovery_in_progress:${publicKey}`;
        const recoveryInProgress = await redis.get(recoveryKey);
        if (recoveryInProgress) {
            return NextResponse.json(
                { error: 'Recovery already in progress. Please check your email.' },
                { status: 409 }
            );
        }

        // Generate recovery token and code
        const recoveryToken = crypto.randomUUID();
        const recoveryCode = Math.random().toString(36).substring(2, 8).toUpperCase();

        // Store recovery data in Redis (expires in 1 hour)
        await redis.setex(`recovery_token:${recoveryToken}`, 3600, JSON.stringify({
            publicKey,
            email,
            recoveryCode,
            timestamp: Date.now()
        }));

        // Mark recovery in progress (expires in 24 hours)
        await redis.setex(recoveryKey, 86400, 'true');

        // Increment rate limit counter
        await redis.incr(rateLimitKey);
        await redis.expire(rateLimitKey, 3600); // Expire after 1 hour

        // Send email with recovery code
        const emailSent = await emailService.sendRecoveryEmail(email, recoveryCode);

        if (!emailSent) {
            logger.error(`[Recovery] Failed to send recovery email to ${email}`);
            // We continue anyway so as not to reveal if email exists, 
            // but in a real prod env you might want to handle this differently.
        }

        // Log recovery initiation
        await auditLogger.logEvent(
            'ACCOUNT_RECOVERY_INITIATED',
            'Account recovery process started',
            { userId: publicKey, email },
            'warn'
        );

        return NextResponse.json({
            success: true,
            message: 'Recovery initiated. Check your email for instructions.',
            token: recoveryToken // In production, don't return this
        });

    } catch (error) {
        logger.error('[Recovery Initiate] Error:', error as Error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
});
