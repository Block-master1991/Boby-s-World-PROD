/**
 * WebAuthn Authenticate Route
 * POST /api/auth/webauthn/authenticate
 */

import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { WebAuthnUtils } from '@/lib/webauthn-utils';
import redis from '@/lib/redis';
import { db } from '@/lib/firebase-admin';
import { logger } from '@/utils/logger';

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const userId = searchParams.get('userId');
        const host = request.headers.get('host') || 'localhost';
        const rpId = WebAuthnUtils.getRPID(host);

        // 1. If Conditional UI request (without user identifier)
        if (!userId) {
            const options = WebAuthnUtils.generateAuthenticationChallenge(rpId);

            // Store anonymous challenge in Redis
            const discoveryChallengeId = randomBytes(16).toString('hex');
            await redis.setex(`webauthn_discovery_challenge:${discoveryChallengeId}`, 120, options.challenge);

            return NextResponse.json({
                ...options,
                discoveryId: discoveryChallengeId,
                allowCredentials: [] // Empty list allows Discoverable Credentials
            });
        }

        // 2. Specific login request for user
        const credentialsSnapshot = await db.collection('players').doc(userId).collection('passkeys').get();

        const options = WebAuthnUtils.generateAuthenticationChallenge(rpId);
        const allowCredentials = credentialsSnapshot.docs.map(doc => ({
            id: doc.id,
            type: 'public-key'
        }));

        // Store challenge in Redis
        await redis.setex(`webauthn_auth_challenge:${userId}`, 120, options.challenge);

        return NextResponse.json({
            ...options,
            userId,
            allowCredentials
        });
    } catch (error) {
        logger.error('[WebAuthn Authenticate] Error:', error as Error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
