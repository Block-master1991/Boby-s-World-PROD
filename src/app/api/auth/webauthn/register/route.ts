/**
 * WebAuthn Registration Route
 * POST /api/auth/webauthn/register
 */

import { NextResponse } from 'next/server';
import { WebAuthnUtils } from '@/lib/webauthn-utils';
import redis from '@/lib/redis';
import { withAuth, AuthenticatedRequest } from '@/lib/auth-middleware';
import { withCsrfProtection } from '@/lib/csrf-middleware';
import { logger } from '@/utils/logger';

export const POST = withAuth(withCsrfProtection(async (request: AuthenticatedRequest) => {
    try {
        const body = await request.json();
        const { userId, userName } = body;

        if (!userId) {
            return NextResponse.json({ error: 'UserID required' }, { status: 400 });
        }

        // Extract hostname from request (dynamic RP_ID support with subdomain scoping)
        const host = request.headers.get('host') || 'localhost';
        const rpId = WebAuthnUtils.getRPID(host);

        const options = WebAuthnUtils.generateRegistrationChallenge(userId, userName || userId, rpId);

        // Store the challenge in Redis for later verification (validity of two minutes)
        await redis.setex(`webauthn_challenge:${userId}`, 120, options.challenge);

        return NextResponse.json(options);
    } catch (error) {
        logger.error('[WebAuthn Register] Error:', error as Error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}));
