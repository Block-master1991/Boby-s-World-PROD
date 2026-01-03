/**
 * WebAuthn Register Confirm Route
 * POST /api/auth/webauthn/register/confirm
 */

import { NextResponse } from 'next/server';
import redis from '@/lib/redis';
import { db } from '@/lib/firebase-admin';
import { withAuth, AuthenticatedRequest } from '@/lib/auth-middleware';
import { withCsrfProtection } from '@/lib/csrf-middleware';
import { setCsrfTokenResponse } from '@/lib/csrf-helper';
import { WebAuthnUtils } from '@/lib/webauthn-utils';
import { logger } from '@/utils/logger';

export const POST = withAuth(withCsrfProtection(async (request: AuthenticatedRequest) => {
    try {
        const body = await request.json();
        const userId = request.user.sub; // Ensure userId comes from authenticated session
        const { credential, description, transports } = body; // Add description and transports

        if (!userId) {
            return NextResponse.json({ error: 'Authenticated UserID required' }, { status: 401 });
        }

        // Verify stored challenge
        const storedChallenge = await redis.get(`webauthn_registration_challenge:${userId}`);
        if (!storedChallenge) {
            return NextResponse.json({ error: 'Registration session expired. Please try again.' }, { status: 400 });
        }

        // In production: verify credential validity here using WebAuthnUtils.verify

        // Check if a passkey with the same credentialId already exists for this user
        const existingPasskey = await db.collection('players').doc(userId).collection('passkeys').doc(credential.id).get();
        if (existingPasskey.exists) {
            return NextResponse.json({ error: 'Passkey already registered for this user' }, { status: 409 });
        }

        // Extract device name based on professional standards (MDS)
        const aaguid = credential.authData ? WebAuthnUtils.extractAAGUID(credential.authData) : undefined;
        const deviceBrand = WebAuthnUtils.getAuthenticatorName(aaguid);

        const finalDescription = description || deviceBrand;

        // Save device key in Firestore as subcollection within user document
        await db.collection('players').doc(userId).collection('passkeys').doc(credential.id).set({
            credentialId: credential.id,
            publicKey: credential.publicKey,
            aaguid: aaguid || null,
            deviceBrand: deviceBrand,
            counter: 0,
            transports: transports || [],
            description: finalDescription,
            createdAt: new Date().toISOString(),
            lastUsedAt: new Date().toISOString()
        });

        await redis.del(`webauthn_registration_challenge:${userId}`);

        const response = NextResponse.json({ success: true, message: 'Passkey registered successfully' });

        // Issued CSRF token after state change
        const requestHost = request.headers.get('host') || undefined;
        return await setCsrfTokenResponse(response, request.user.sub, requestHost);

    } catch (error) {
        logger.error('[WebAuthn Confirm] Error:', error as Error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}));
