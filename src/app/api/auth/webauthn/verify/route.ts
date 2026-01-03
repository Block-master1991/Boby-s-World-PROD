/**
 * WebAuthn Verify (Login) Route
 * POST /api/auth/webauthn/verify
 */

import { NextRequest, NextResponse } from 'next/server';
import { WebAuthnUtils } from '@/lib/webauthn-utils';
import redis from '@/lib/redis';
import { db } from '@/lib/firebase-admin';
import { JWTManager } from '@/lib/jwt-utils';
import { sessionManager } from '@/lib/advancedSessionManager';
import { securityIntegration } from '@/lib/securityIntegration';
import { setCsrfTokenResponse } from '@/lib/csrf-helper';
import { validateRequestBody, WebAuthnVerifySchema } from '@/lib/validation-schemas';
import { auditLogger } from '@/lib/audit-logger';
import { logger } from '@/utils/logger';

export async function POST(request: NextRequest) {
    try {
        // Validate input
        const { userId, credentialResponse } = await validateRequestBody(request, WebAuthnVerifySchema);

        // 1. Verify challenge (support anonymous challenge for Conditional UI)
        let finalUserId = userId;
        let challengeKey = `webauthn_auth_challenge:${userId}`;

        if (!userId) {
            // In Discovery case, we try to find anonymous challenge (can be improved by linking to session)
            // For simplicity, we'll search for active discovery challenge or use more complex mechanism
            // Note: In professional production, client should send discoveryId
            const discoveryId = credentialResponse.discoveryId; // Client may need this
            challengeKey = discoveryId ? `webauthn_discovery_challenge:${discoveryId}` : 'webauthn_latest_discovery_challenge';
        }

        const storedChallenge = await redis.get(challengeKey);
        if (!storedChallenge) {
            return NextResponse.json({ error: 'Authentication session expired. Please sign in again.' }, { status: 400 });
        }

        // 2. Search for user if not known (Discovery Mode)
        if (!finalUserId) {
            // Search for Credential in entire database (or via index)
            // In Firestore, we'll use Query to search for credentialId across all subcollections
            const passkeyQuery = await db.collectionGroup('passkeys')
                .where('credentialId', '==', credentialResponse.id)
                .limit(1)
                .get();

            if (passkeyQuery.empty) {
                return NextResponse.json({ error: 'Biometric device not recognized. Please register first.' }, { status: 403 });
            }

            // Extract user ID from document path (players/{userId}/passkeys/{id})
            const passkeyDoc = passkeyQuery.docs[0];
            finalUserId = passkeyDoc.ref.parent.parent?.id;

            if (!finalUserId) {
                return NextResponse.json({ error: 'Could not resolve user from device' }, { status: 500 });
            }
        }

        // 3. Search for Credential to confirm data
        const credentialDoc = await db.collection('players').doc(finalUserId).collection('passkeys')
            .doc(credentialResponse.id)
            .get();

        if (!credentialDoc.exists) {
            await auditLogger.logPasskeyLoginFailure(
                { userId, ipAddress: request.headers.get('x-forwarded-for') || 'unknown' },
                'Credential not recognized'
            );
            return NextResponse.json({ error: 'Biometric device not recognized. Please register this device first.' }, { status: 403 });
        }

        const credentialData = credentialDoc.data()!;

        // 3. Verify digital signature (Cryptographic Verification)
        const host = request.headers.get('host') || '';
        const expectedRPID = WebAuthnUtils.getRPID(host);
        const expectedOrigin = request.headers.get('origin') || '';

        const isVerified = await WebAuthnUtils.verifyAuthenticationResponse(
            credentialData as any,
            credentialResponse.response,
            storedChallenge,
            expectedOrigin // Utility will verify origin or RP ID
        );

        if (!isVerified) {
            await auditLogger.logPasskeyLoginFailure(
                { userId, ipAddress: request.headers.get('x-forwarded-for') || 'unknown' },
                'Invalid biometric signature'
            );
            return NextResponse.json({ error: 'Biometric verification failed. Please try again or use another device.' }, { status: 401 });
        }

        // 4. Login - Issue tokens
        const publicKey = finalUserId; // Resolved from previous steps
        const accessToken = JWTManager.createAccessToken({ publicKey });
        const refreshToken = JWTManager.createRefreshToken({ publicKey });

        const response = NextResponse.json({
            success: true,
            message: 'Biometric login successful',
            publicKey
        });

        const requestHost = request.headers.get('host') || '';
        response.cookies.set('accessToken', accessToken, JWTManager.createSecureCookieOptions(15 * 60, requestHost));
        response.cookies.set('refreshToken', refreshToken, JWTManager.createSecureCookieOptions(7 * 24 * 60 * 60, requestHost));

        // Create secure session (Session Binding 2.0)
        const deviceInfo = securityIntegration.extractDeviceInfo(request);
        const session = await sessionManager.createSecureSession(publicKey, deviceInfo, {
            authMethod: 'biometric',
            credentialId: credentialResponse.id
        });
        if (session) {
            response.cookies.set('secure_session', session.sessionId, {
                ...JWTManager.createSecureCookieOptions(30 * 60, requestHost),
                httpOnly: true
            });
            response.cookies.set('session_seed', session.currentSeed, {
                ...JWTManager.createSecureCookieOptions(30 * 60, requestHost),
                httpOnly: true
            });
        }

        await redis.del(`webauthn_auth_challenge:${userId}`);

        // Issued CSRF token for the new session
        return await setCsrfTokenResponse(response, publicKey, requestHost);

    } catch (error) {
        logger.error('[WebAuthn Verify] Error:', error as Error);
        return NextResponse.json({ error: 'Authentication failed' }, { status: 500 });
    }
}
